import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ArticleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionCronService } from './cron/ingestion-cron.service';
import { REGIONAL_FEED_SOURCES, REGIONAL_TARGET_LANGS } from './regional-feed-sources';

/**
 * When production has no Bengali/Tamil/Punjabi/Urdu articles, upsert regional RSS sources
 * and ingest once on API startup (npm ingest scripts are not available in the slim Docker image).
 */
@Injectable()
export class RegionalIngestionBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RegionalIngestionBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionCronService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.bootstrapIfNeeded(), 8_000);
  }

  private async bootstrapIfNeeded() {
    try {
      const counts = await this.prisma.article.groupBy({
        by: ['language'],
        where: {
          status: ArticleStatus.PUBLISHED,
          language: { in: [...REGIONAL_TARGET_LANGS] },
        },
        _count: { _all: true },
      });
      const byLang = Object.fromEntries(counts.map((c) => [c.language, c._count._all]));
      const needsBootstrap = REGIONAL_TARGET_LANGS.some((l) => (byLang[l] ?? 0) < 3);
      if (!needsBootstrap) {
        this.logger.log(`Regional inventory OK: ${JSON.stringify(byLang)}`);
        return;
      }

      this.logger.warn(
        `Regional inventory low ${JSON.stringify(byLang)} — upserting feeds and ingesting ${REGIONAL_TARGET_LANGS.join(', ')}`,
      );

      for (const src of REGIONAL_FEED_SOURCES) {
        await this.prisma.ingestedSource.upsert({
          where: { feedUrl: src.feedUrl },
          update: { isActive: true, language: src.language, isTrusted: src.isTrusted },
          create: {
            name: src.name,
            feedUrl: src.feedUrl,
            type: 'rss',
            language: src.language,
            isActive: true,
            isTrusted: src.isTrusted,
            rightsMetadata: { note: 'AI-rewritten summaries only. Original content credited to source.' },
          },
        });
      }

      await this.prisma.ingestedSource.updateMany({
        where: { language: { in: [...REGIONAL_TARGET_LANGS] } },
        data: { isActive: true },
      });

      const sources = await this.prisma.ingestedSource.findMany({
        where: { isActive: true, language: { in: [...REGIONAL_TARGET_LANGS] } },
        orderBy: { name: 'asc' },
      });

      let totalIngested = 0;
      for (const source of sources) {
        try {
          const { ingested } = await this.ingestion.fetchSource(source, { maxItemsPerSource: 20 });
          totalIngested += ingested;
          this.logger.log(`Regional bootstrap: ${source.name} (${source.language}) +${ingested}`);
        } catch (err) {
          this.logger.warn(`Regional bootstrap failed for ${source.name}: ${(err as Error).message}`);
        }
      }

      const after = await this.prisma.article.groupBy({
        by: ['language'],
        where: { status: ArticleStatus.PUBLISHED, language: { in: [...REGIONAL_TARGET_LANGS] } },
        _count: { _all: true },
      });
      for (const lang of REGIONAL_TARGET_LANGS) {
        const row = after.find((r) => r.language === lang);
        this.logger.log(`Regional inventory ${lang}: ${row?._count._all ?? 0}`);
      }
      this.logger.log(`Regional bootstrap complete (+${totalIngested} items this run)`);
    } catch (err) {
      this.logger.error(`Regional bootstrap error: ${(err as Error).message}`);
    }
  }
}
