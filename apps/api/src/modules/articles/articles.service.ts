import {
  Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { ArticleStatus, Role, MediaType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { AuditModule } from '../audit/audit.module';
import { assertTransition } from './status.machine';
import { CreateArticleDto } from './dto/create-article.dto';
import { inferLangFromText, normalizeLanguageCode } from '../ai/language-resolution.util';
import { resolveUniqueArticleSlug } from '../../common/slug.util';
import { safeInt } from '../../common/safe-int.util';
import {
  sanitizeArticleForPublicResponse,
  sanitizeArticleListItem,
  stripInternalFields,
} from '../../common/article-public-sanitize.util';

/** 'public' = anonymous reader (published stories only, no editorial internals); 'staff' = authenticated CMS user. */
export type Audience = 'public' | 'staff';

type CountryFeedResult = {
  localLang: string;
  globalLang: string;
  local: any[];
  global: any[];
  mixed: any[];
  total: number;
};

type ListFilters = {
  status?: ArticleStatus;
  categoryId?: string;
  authorId?: string;
  language?: string;
  hasVideo?: boolean;
  page?: number | string;
  limit?: number | string;
  omitBody?: boolean;
};
type PublicListResult = { data: unknown[]; total: number; page: number; limit: number };
/** v1: list payloads scrubbed at read time; bump when the public list shape / cleaning changes. */
const PUBLIC_LIST_PREFIX = 'articles-list:v1:';

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);
  private readonly countryFeedCache = new Map<string, { expiresAt: number; value: CountryFeedResult }>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly countryFeedCacheTtlMs: number;
  private readonly publicListCacheTtlMs: number;
  private readonly publicListCache = new Map<string, { expiresAt: number; value: PublicListResult }>();
  private readonly publicListInFlight = new Map<string, Promise<PublicListResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
  ) {
    this.countryFeedCacheTtlMs = Number(this.config.get('COUNTRY_FEED_CACHE_TTL_MS') ?? 120000);
    this.publicListCacheTtlMs = safeInt(this.config.get('PUBLIC_LIST_CACHE_TTL_MS'), 60000, 0, 3_600_000);
  }

  async findCountryFeed(options: {
    localLang: string;
    globalLang?: string;
    localLimit?: number | string;
    globalLimit?: number | string;
  }) {
    const startedAt = Date.now();
    const localLang = normalizeLanguageCode(options.localLang || 'en');
    const globalLang = normalizeLanguageCode(options.globalLang || 'en');
    const localLimit = safeInt(options.localLimit, 20, 1, 100);
    const globalLimit = safeInt(options.globalLimit, 20, 1, 100);
    const cacheKey = `${localLang}|${globalLang}|${localLimit}|${globalLimit}`;
    const redisKey = this.getCountryFeedRedisKey(cacheKey);

    const redisCached = await this.redisCache.getJson<CountryFeedResult>(redisKey);
    if (redisCached) {
      this.cacheHits++;
      this.setCountryFeedCache(cacheKey, redisCached);
      this.logger.log(
        `country-feed cache=redis-hit key=${cacheKey} latency_ms=${Date.now() - startedAt} hits=${this.cacheHits} misses=${this.cacheMisses}`,
      );
      return redisCached;
    }

    const cached = this.getCountryFeedFromCache(cacheKey);
    if (cached) {
      this.cacheHits++;
      this.logger.log(
        `country-feed cache=memory-hit key=${cacheKey} latency_ms=${Date.now() - startedAt} hits=${this.cacheHits} misses=${this.cacheMisses}`,
      );
      return cached;
    }
    this.cacheMisses++;

    const baseWhere = {
      status: ArticleStatus.PUBLISHED,
    } as const;

    const countryFeedSelect = {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      categoryId: true,
      language: true,
      imageOrigin: true,
      // Only used server-side to strip this feed's outlet name from the text; removed before the response.
      provenance: { select: { sourceName: true, sourceUrl: true } },
    } satisfies Prisma.ArticleSelect;

    const localTagged = await this.prisma.article.findMany({
      where: { ...baseWhere, language: localLang },
      orderBy: { publishedAt: 'desc' },
      take: localLimit * 3,
      select: countryFeedSelect,
    });
    const localSeen = new Set(localTagged.map((a) => a.id));
    const localPool = localTagged.length >= localLimit
      ? []
      : await this.prisma.article.findMany({
        where: baseWhere,
        orderBy: { publishedAt: 'desc' },
        take: localLimit * 6,
        select: countryFeedSelect,
      });
    const localScript = localPool.filter(
      (a) => !localSeen.has(a.id) && inferLangFromText(a.title ?? '') === localLang,
    );
    const localRaw = [...localTagged, ...localScript];
    const globalRaw = localLang === globalLang
      ? []
      : await this.prisma.article.findMany({
        where: { ...baseWhere, language: globalLang },
        orderBy: { publishedAt: 'desc' },
        take: globalLimit * 3,
        select: countryFeedSelect,
      });

    const seen = new Set<string>();
    const local = localRaw.filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    }).slice(0, localLimit);

    const global = globalRaw.filter((a) => !seen.has(a.id)).slice(0, globalLimit);
    const mixed = [...local, ...global]
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));

    const payload: CountryFeedResult = {
      localLang,
      globalLang,
      local: local.map((a) => sanitizeArticleListItem(a)),
      global: global.map((a) => sanitizeArticleListItem(a)),
      mixed: mixed.map((a) => sanitizeArticleListItem(a)),
      total: mixed.length,
    };
    this.setCountryFeedCache(cacheKey, payload);
    await this.redisCache.setJson(redisKey, payload, this.countryFeedCacheTtlMs);
    this.logger.log(
      `country-feed cache=miss key=${cacheKey} latency_ms=${Date.now() - startedAt} hits=${this.cacheHits} misses=${this.cacheMisses}`,
    );
    return payload;
  }

  async create(authorId: string, dto: CreateArticleDto) {
    const slug = await this.generateSlug(dto.title);
    const article = await this.prisma.article.create({
      data: {
        title: dto.title,
        slug,
        body: (dto.body as object | null) ?? {},
        excerpt: dto.excerpt,
        language: dto.language ?? 'en',
        categoryId: dto.categoryId,
        regionId: dto.regionId,
        authorId,
        tags: dto.tagIds
          ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: { tags: { include: { tag: true } }, mediaAssets: true },
    });

    await this.prisma.articleVersion.create({
      data: { articleId: article.id, title: article.title, body: article.body as object, changedById: authorId },
    });
    this.clearCountryFeedCache();

    return article;
  }

  private buildPublicListSelect(hasVideo?: boolean): Prisma.ArticleSelect {
    return {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      publishedAt: true,
      categoryId: true,
      language: true,
      status: true,
      // podcastScript is NOT selected: cards never show it (the podcasts page uses the full list), and scrubbing a
      // multi-KB narration per row was the bulk of the list serializer's CPU time.
      imageOrigin: true,
      // Only used server-side to strip this feed's outlet name from the text; removed before the response.
      provenance: { select: { sourceName: true, sourceUrl: true } },
      // Cards use the generated story image (derived from the slug) — no image rows are selected.
      // Video listings need the story's own VIDEO rows (source/external videos are filtered on output).
      ...(hasVideo
        ? { mediaAssets: { where: { type: MediaType.VIDEO }, take: 3, select: { id: true, type: true, url: true, scanStatus: true, s3Key: true } } }
        : {}),
    };
  }

  async findAll(filters: ListFilters, audience: Audience = 'staff') {
    if (audience !== 'public') return this.findAllUncached(filters, audience);
    // Anonymous readers only ever see published stories, and cannot filter by author.
    const f: ListFilters = { ...filters, status: ArticleStatus.PUBLISHED, authorId: undefined };
    // Public lists are identical for every reader: serve them from a short cache (memory → Redis), and let concurrent
    // identical requests share one computation, so a burst of page loads never runs the serializer N times.
    const maxTake = f.omitBody ? 150 : 100;
    const key = [
      f.categoryId ?? '', f.language ? normalizeLanguageCode(f.language) : '', f.hasVideo ? 'v' : '', f.omitBody ? 'o' : '',
      safeInt(f.page, 1, 1, 100000), safeInt(f.limit, 20, 1, maxTake),
    ].join('|');
    const redisKey = `${PUBLIC_LIST_PREFIX}${key}`;
    const mem = this.publicListCache.get(key);
    if (mem && mem.expiresAt > Date.now()) return mem.value;
    const pending = this.publicListInFlight.get(key);
    if (pending) return pending;
    const work = (async () => {
      const fromRedis = await this.redisCache.getJson<PublicListResult>(redisKey);
      if (fromRedis) {
        this.rememberPublicList(key, fromRedis);
        return fromRedis;
      }
      const startedAt = Date.now();
      const value = await this.findAllUncached(f, 'public');
      this.rememberPublicList(key, value);
      await this.redisCache.setJson(redisKey, value, this.publicListCacheTtlMs);
      this.logger.log(`articles-list cache=miss key=${key} rows=${value.data.length} latency_ms=${Date.now() - startedAt}`);
      return value;
    })();
    this.publicListInFlight.set(key, work);
    try {
      return await work;
    } finally {
      this.publicListInFlight.delete(key);
    }
  }

  private rememberPublicList(key: string, value: PublicListResult) {
    if (this.publicListCacheTtlMs <= 0) return;
    if (this.publicListCache.size >= 200) this.publicListCache.delete(this.publicListCache.keys().next().value as string);
    this.publicListCache.set(key, { expiresAt: Date.now() + Math.min(this.publicListCacheTtlMs, 30_000), value });
  }

  private async findAllUncached(filters: ListFilters, audience: Audience) {
    const p = safeInt(filters.page, 1, 1, 100000);
    const maxTake = filters.omitBody ? 150 : 100;
    const take = safeInt(filters.limit, 20, 1, maxTake);
    const { status, categoryId, authorId, language, hasVideo, omitBody } = filters;
    const languageNorm = language ? normalizeLanguageCode(language) : undefined;
    const baseWhere: Prisma.ArticleWhereInput = {
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(authorId && { authorId }),
      ...(hasVideo && { mediaAssets: { some: { type: MediaType.VIDEO } } }),
    };

    const orderBy: Prisma.ArticleOrderByWithRelationInput | Prisma.ArticleOrderByWithRelationInput[] = omitBody
      ? [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
      : { createdAt: 'desc' };

    const select = omitBody ? this.buildPublicListSelect(hasVideo) : undefined;
    const include = omitBody
      ? undefined
      : { tags: { include: { tag: true } }, riskAssessment: true, mediaAssets: { take: 3 } };

    let data: Array<{ id: string; language?: string | null; title?: string | null; publishedAt?: Date | null }>;
    let total: number;

    if (languageNorm && omitBody) {
      const taggedWhere: Prisma.ArticleWhereInput = { ...baseWhere, language: languageNorm };
      const tagged = await this.prisma.article.findMany({
        where: taggedWhere,
        skip: (p - 1) * take,
        take,
        orderBy,
        select: select!,
      });
      data = tagged;
      total = await this.prisma.article.count({ where: taggedWhere });

      if (data.length < take) {
        const seen = new Set(data.map((r) => r.id));
        const poolTake = Math.min(Math.max(take * 6, 300), 600);
        const pool = await this.prisma.article.findMany({
          where: baseWhere,
          take: poolTake,
          orderBy,
          select: select!,
        });
        for (const row of pool) {
          if (seen.has(row.id)) continue;
          if (inferLangFromText(row.title ?? '') !== languageNorm) continue;
          seen.add(row.id);
          data.push(row);
          if (data.length >= take) break;
        }
        total = Math.max(total, data.length);
      }
    } else {
      const where: Prisma.ArticleWhereInput = {
        ...baseWhere,
        ...(languageNorm && { language: languageNorm }),
      };
      data = omitBody
        ? await this.prisma.article.findMany({
          where,
          skip: (p - 1) * take,
          take,
          orderBy,
          select: select!,
        })
        : await this.prisma.article.findMany({
          where,
          skip: (p - 1) * take,
          take,
          orderBy: { createdAt: 'desc' },
          include: include!,
        });
      total = await this.prisma.article.count({ where });
    }
    const page = p;
    const limit = take;

    const sanitized = omitBody
      ? data.map((row) => sanitizeArticleListItem(row))
      : data.map((row) => {
          const clean = sanitizeArticleForPublicResponse(row as never) as Record<string, unknown>;
          return audience === 'public' ? stripInternalFields(clean) : clean;
        });

    return { data: sanitized, total, page, limit };
  }

  async findOne(idOrSlug: string, audience: Audience = 'staff') {
    const include = {
      tags: { include: { tag: true } },
      mediaAssets: true,
      versions: { orderBy: { changedAt: 'desc' } as const, take: 10 },
      riskAssessment: true,
      socialCaptions: true,
      // Loaded for outlet-aware sanitization only — stripped before response.
      provenance: true,
    };
    // Try UUID first, fall back to slug lookup
    const isUuid = /^[0-9a-f-]{36}$/.test(idOrSlug);
    let article = isUuid
      ? await this.prisma.article.findUnique({ where: { id: idOrSlug }, include })
      : await this.prisma.article.findUnique({ where: { slug: idOrSlug }, include });
    // Backward compatibility: some older shared links used seoSlug instead of canonical slug.
    if (!article && !isUuid) {
      article = await this.prisma.article.findFirst({
        where: { seoSlug: idOrSlug },
        include,
        orderBy: { createdAt: 'desc' },
      });
    }
    // Extra fallback: support links that carry base slug while DB has suffix (e.g. "-<timestamp>").
    if (!article && !isUuid) {
      article = await this.prisma.article.findFirst({
        where: { slug: { startsWith: `${idOrSlug}-` } },
        include,
        orderBy: { createdAt: 'desc' },
      });
    }
    if (!article) throw new NotFoundException('Article not found');
    // Drafts / unpublished stories do not exist for anonymous readers.
    if (audience === 'public' && article.status !== ArticleStatus.PUBLISHED) {
      throw new NotFoundException('Article not found');
    }
    const clean = sanitizeArticleForPublicResponse(article);
    return (audience === 'public' ? stripInternalFields(clean as Record<string, unknown>) : clean) as typeof clean;
  }

  async update(id: string, userId: string, userRole: Role, data: Partial<CreateArticleDto>) {
    const article = await this.findOne(id);

    if (userRole === Role.REPORTER && article.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own articles');
    }

    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        title: data.title ?? article.title,
        body: (data.body as object | null) ?? (article.body as object),
        excerpt: data.excerpt,
        categoryId: data.categoryId,
        regionId: data.regionId,
      },
    });

    await this.prisma.articleVersion.create({
      data: { articleId: id, title: updated.title, body: updated.body as object, changedById: userId },
    });
    this.clearCountryFeedCache();

    return updated;
  }

  async transition(id: string, to: ArticleStatus, editorId?: string) {
    const article = await this.findOne(id);
    assertTransition(article.status, to);

    const updated = await this.prisma.article.update({
      where: { id },
      data: {
        status: to,
        ...(editorId && { editorId }),
        ...(to === ArticleStatus.PUBLISHED && { publishedAt: new Date() }),
      },
    });
    this.clearCountryFeedCache();
    return updated;
  }

  private getCountryFeedFromCache(key: string): CountryFeedResult | null {
    const entry = this.countryFeedCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.countryFeedCache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCountryFeedCache(key: string, value: CountryFeedResult) {
    this.countryFeedCache.set(key, {
      value,
      expiresAt: Date.now() + this.countryFeedCacheTtlMs,
    });
  }

  private clearCountryFeedCache() {
    if (this.countryFeedCache.size > 0) {
      this.countryFeedCache.clear();
      this.logger.log('country-feed cache=cleared reason=article-write');
    }
    this.redisCache.delByPrefix('country-feed:').catch(() => null);
    this.publicListCache.clear();
    this.redisCache.delByPrefix(PUBLIC_LIST_PREFIX).catch(() => null);
  }

  private getCountryFeedRedisKey(cacheKey: string): string {
    // v6: payloads are scrubbed of publisher mentions / page boilerplate at read time (v5: image reference + origin, no raw media rows / publisher URLs).
    return `country-feed:v6:${cacheKey}`;
  }

  private async generateSlug(title: string): Promise<string> {
    return resolveUniqueArticleSlug(
      async (base) => Boolean(await this.prisma.article.findUnique({ where: { slug: base } })),
      title,
    );
  }
}
