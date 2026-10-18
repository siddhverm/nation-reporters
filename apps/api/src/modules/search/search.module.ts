import { Module, Logger } from '@nestjs/common';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import MeiliSearch from 'meilisearch';
import { Injectable } from '@nestjs/common';
import { ArticleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeArticleListItem } from '../../common/article-public-sanitize.util';

/** Meilisearch filter values are quoted strings: strip anything that could break out of the quotes. */
const filterValue = (v: string) => v.replace(/["\\\r\n]/g, '').slice(0, 64);

/** Only public, source-free fields leave the search endpoint (Meili documents may hold more). */
function publicHit(h: Record<string, any>) {
  const item = sanitizeArticleListItem({
    title: h.title, excerpt: h.excerpt, slug: h.slug, language: h.language,
  });
  return {
    id: h.id, title: item.title, excerpt: item.excerpt, slug: h.slug, language: h.language,
    category: h.category ?? undefined, publishedAt: h.publishedAt, image: item.image,
  };
}

@Injectable()
class SearchService {
  private readonly meili: MeiliSearch;
  private readonly logger = new Logger('SearchService');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.meili = new MeiliSearch({
      host: config.get<string>('MEILISEARCH_URL') ?? 'http://localhost:7700',
      apiKey: config.get<string>('MEILISEARCH_KEY'),
    });
  }

  async search(q: string, options: { category?: string; lang?: string; page?: number }) {
    // Try Meilisearch first, fall back to Prisma full-text search
    try {
      const result = await this.meili.index('articles').search(q, {
        filter: [
          options.category ? `category = "${filterValue(options.category)}"` : null,
          options.lang ? `language = "${filterValue(options.lang)}"` : null,
        ].filter(Boolean) as string[],
        page: options.page ?? 1,
        hitsPerPage: 20,
      });
      if (result.hits.length > 0 || result.totalHits > 0) {
        return { ...result, hits: result.hits.map((h) => publicHit(h as Record<string, any>)) };
      }
    } catch (e) {
      this.logger.warn(`Meilisearch unavailable: ${(e as Error).message} — using DB fallback`);
    }

    // DB fallback
    const page = Math.max(1, Number(options.page) || 1);
    const take = 20;
    const term = q.trim();

    const [hits, totalHits] = await Promise.all([
      this.prisma.article.findMany({
        where: {
          status: ArticleStatus.PUBLISHED,
          ...(options.lang && { language: options.lang }),
          ...(term && {
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { excerpt: { contains: term, mode: 'insensitive' } },
              { seoTitle: { contains: term, mode: 'insensitive' } },
            ],
          }),
        },
        select: { id: true, title: true, slug: true, excerpt: true, publishedAt: true, language: true },
        skip: (page - 1) * take,
        take,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.article.count({
        where: {
          status: ArticleStatus.PUBLISHED,
          ...(options.lang && { language: options.lang }),
          ...(term && {
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { excerpt: { contains: term, mode: 'insensitive' } },
              { seoTitle: { contains: term, mode: 'insensitive' } },
            ],
          }),
        },
      }),
    ]);

    return { hits: hits.map((h) => publicHit(h)), totalHits, page, hitsPerPage: take };
  }

  async indexArticle(article: {
    id: string; title: string; excerpt?: string | null; slug: string;
    category?: string | null; language: string; publishedAt?: Date | null;
  }) {
    try {
      return await this.meili.index('articles').addDocuments([article]);
    } catch {
      // Meilisearch unavailable, skip indexing silently
    }
  }
}

@ApiTags('search')
@Controller('search')
class SearchController {
  constructor(private readonly svc: SearchService) {}

  @Get()
  search(
    @Query('q') q = '',
    @Query('category') category?: string,
    @Query('lang') lang?: string,
    @Query('page') page?: number,
  ) {
    return this.svc.search(q, { category, lang, page });
  }
}

@Module({ controllers: [SearchController], providers: [SearchService, PrismaService], exports: [SearchService] })
export class SearchModule {}
