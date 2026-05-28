import { Injectable, Logger } from '@nestjs/common';
import { ArticleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionCronService } from './cron/ingestion-cron.service';
import { REGIONAL_FEED_SOURCES, REGIONAL_TARGET_LANGS } from './regional-feed-sources';

export type RegionalBootstrapResult = {
  ran: boolean;
  reason?: string;
  before: Record<string, number>;
  after: Record<string, number>;
  ingestedThisRun: number;
};

@Injectable()
export class RegionalIngestionService {
  private readonly logger = new Logger(RegionalIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionCronService,
  ) {}

  async countPublishedByLang(): Promise<Record<string, number>> {
    const counts = await this.prisma.article.groupBy({
      by: ['language'],
      where: {
        status: ArticleStatus.PUBLISHED,
        language: { in: [...REGIONAL_TARGET_LANGS] },
      },
      _count: { _all: true },
    });
    const byLang = Object.fromEntries(counts.map((c) => [c.language, c._count._all]));
    for (const lang of REGIONAL_TARGET_LANGS) {
      if (byLang[lang] === undefined) byLang[lang] = 0;
    }
    return byLang;
  }

  /** Upsert BBC/regional RSS sources and ingest when inventory is low. */
  async runBootstrap(options: { force?: boolean; minPerLang?: number } = {}): Promise<RegionalBootstrapResult> {
    const minPerLang = options.minPerLang ?? 5;
    const before = await this.countPublishedByLang();
    const needsBootstrap =
      options.force === true
      || REGIONAL_TARGET_LANGS.some((l) => (before[l] ?? 0) < minPerLang);

    if (!needsBootstrap) {
      this.logger.log(`Regional inventory OK: ${JSON.stringify(before)}`);
      return { ran: false, reason: 'inventory_sufficient', before, after: before, ingestedThisRun: 0 };
    }

    this.logger.warn(
      `Regional inventory low ${JSON.stringify(before)} — upserting feeds and ingesting`,
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
        const { ingested } = await this.ingestion.fetchSource(source, { maxItemsPerSource: 25 });
        totalIngested += ingested;
        this.logger.log(`Regional bootstrap: ${source.name} (${source.language}) +${ingested}`);
      } catch (err) {
        this.logger.warn(`Regional bootstrap failed for ${source.name}: ${(err as Error).message}`);
      }
    }

    const after = await this.countPublishedByLang();
    for (const lang of REGIONAL_TARGET_LANGS) {
      this.logger.log(`Regional inventory ${lang}: ${after[lang] ?? 0}`);
    }
    this.logger.log(`Regional bootstrap complete (+${totalIngested} items this run)`);

    return { ran: true, before, after, ingestedThisRun: totalIngested };
  }
}
