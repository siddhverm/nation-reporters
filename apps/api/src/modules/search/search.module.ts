import { Module } from '@nestjs/common';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import MeiliSearch from 'meilisearch';
import { Injectable } from '@nestjs/common';

@Injectable()
class SearchService {
  private readonly client: MeiliSearch;

  constructor(config: ConfigService) {
    this.client = new MeiliSearch({
      host: config.get<string>('MEILISEARCH_URL')!,
      apiKey: config.get<string>('MEILISEARCH_KEY'),
    });
  }

  search(q: string, options: { category?: string; region?: string; lang?: string; page?: number }) {
    return this.client.index('articles').search(q, {
      filter: [
        options.category ? `category = "${options.category}"` : null,
        options.region ? `region = "${options.region}"` : null,
        options.lang ? `language = "${options.lang}"` : null,
      ].filter(Boolean) as string[],
      page: options.page ?? 1,
      hitsPerPage: 20,
    });
  }

  async indexArticle(article: {
    id: string; title: string; excerpt?: string | null; slug: string;
    category?: string | null; language: string; publishedAt?: Date | null;
  }) {
    return this.client.index('articles').addDocuments([article]);
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
    @Query('region') region?: string,
    @Query('lang') lang?: string,
    @Query('page') page?: number,
  ) {
    return this.svc.search(q, { category, region, lang, page });
  }
}

@Module({ controllers: [SearchController], providers: [SearchService], exports: [SearchService] })
export class SearchModule {}
