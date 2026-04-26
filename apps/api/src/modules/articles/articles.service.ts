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

type CountryFeedResult = {
  localLang: string;
  globalLang: string;
  local: any[];
  global: any[];
  mixed: any[];
  total: number;
};

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);
  private readonly countryFeedCache = new Map<string, { expiresAt: number; value: CountryFeedResult }>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private readonly countryFeedCacheTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redisCache: RedisCacheService,
  ) {
    this.countryFeedCacheTtlMs = Number(this.config.get('COUNTRY_FEED_CACHE_TTL_MS') ?? 120000);
  }

  async findCountryFeed(options: {
    localLang: string;
    globalLang?: string;
    localLimit?: number;
    globalLimit?: number;
  }) {
    const startedAt = Date.now();
    const localLang = (options.localLang || 'en').toLowerCase();
    const globalLang = (options.globalLang || 'en').toLowerCase();
    const localLimit = Math.min(100, Math.max(1, Number(options.localLimit ?? 20)));
    const globalLimit = Math.min(100, Math.max(1, Number(options.globalLimit ?? 20)));
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
      category: { slug: { in: ['india', 'world'] } },
    } as const;

    const localRaw = await this.prisma.article.findMany({
      where: { ...baseWhere, language: localLang },
      orderBy: { publishedAt: 'desc' },
      take: localLimit * 3,
      include: { tags: { include: { tag: true } }, riskAssessment: true },
    });
    const globalRaw = localLang === globalLang
      ? []
      : await this.prisma.article.findMany({
        where: { ...baseWhere, language: globalLang },
        orderBy: { publishedAt: 'desc' },
        take: globalLimit * 3,
        include: { tags: { include: { tag: true } }, riskAssessment: true },
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
      local,
      global,
      mixed,
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

  async findAll(filters: {
    status?: ArticleStatus;
    categoryId?: string;
    authorId?: string;
    language?: string;
    hasVideo?: boolean;
    page?: number;
    limit?: number;
  }) {
    const p     = Math.max(1, parseInt(String(filters.page  ?? 1),  10) || 1);
    const take  = Math.min(100, parseInt(String(filters.limit ?? 20), 10) || 20);
    const { status, categoryId, authorId, language, hasVideo } = filters;
    const where: Prisma.ArticleWhereInput = {
      ...(status     && { status }),
      ...(categoryId && { categoryId }),
      ...(authorId   && { authorId }),
      ...(language   && { language }),
      ...(hasVideo && { mediaAssets: { some: { type: MediaType.VIDEO } } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        skip: (p - 1) * take,
        take,
        orderBy: { createdAt: 'desc' },
        include: { tags: { include: { tag: true } }, riskAssessment: true, mediaAssets: { take: 3 } },
      }),
      this.prisma.article.count({ where }),
    ]);
    const page = p; const limit = take;

    return { data, total, page, limit };
  }

  async findOne(idOrSlug: string) {
    const include = {
      tags: { include: { tag: true } },
      mediaAssets: true,
      versions: { orderBy: { changedAt: 'desc' } as const, take: 10 },
      riskAssessment: true,
      socialCaptions: true,
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
    if (!article) throw new NotFoundException('Article not found');
    return article;
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
  }

  private getCountryFeedRedisKey(cacheKey: string): string {
    return `country-feed:${cacheKey}`;
  }

  private async generateSlug(title: string): Promise<string> {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const exists = await this.prisma.article.findUnique({ where: { slug: base } });
    return exists ? `${base}-${Date.now()}` : base;
  }
}
