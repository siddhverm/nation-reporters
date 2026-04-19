import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Parser from 'rss-parser';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { DedupService } from '../dedup/dedup.service';
import { ProvenanceService } from '../provenance/provenance.service';
import { AiService } from '../../ai/ai.service';

@Injectable()
export class IngestionCronService {
  private readonly logger = new Logger(IngestionCronService.name);
  private readonly parser = new Parser();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dedup: DedupService,
    private readonly provenance: ProvenanceService,
    private readonly ai: AiService,
  ) {}

  // 08:00, 14:00, 20:00 IST (UTC+5:30 = 02:30, 08:30, 14:30 UTC)
  @Cron('30 2,8,14 * * *')
  async runScheduledIngestion() {
    this.logger.log('Scheduled ingestion started');
    const sources = await this.prisma.ingestedSource.findMany({ where: { isActive: true } });

    for (const source of sources) {
      try {
        await this.fetchSource(source);
      } catch (err) {
        this.logger.error(`Failed to fetch source ${source.name}`, err);
      }
    }
  }

  async fetchSource(source: { id: string; feedUrl: string; name: string }) {
    const feed = await this.parser.parseURL(source.feedUrl);
    let ingested = 0;

    for (const item of feed.items ?? []) {
      const body = item.content ?? item.contentSnippet ?? item.summary ?? '';
      const hash = crypto.createHash('sha256').update(item.link ?? item.title ?? '').digest('hex');

      const isDuplicate = await this.dedup.isDuplicate(hash, body);
      if (isDuplicate) continue;

      try {
        const ingestedArticle = await this.prisma.ingestedArticle.create({
          data: {
            sourceId: source.id,
            sourceUrl: item.link ?? '',
            sourceTitle: item.title ?? 'Untitled',
            body,
            publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
            contentHash: hash,
          },
        });

        await this.provenance.record({
          ingestedArticleId: ingestedArticle.id,
          sourceUrl: item.link ?? '',
          sourceTitle: item.title ?? 'Untitled',
          sourceName: source.name,
          fetchedAt: new Date(),
        });

        // Process through AI pipeline
        await this.ai.processIngestedArticle(ingestedArticle.id);
        ingested++;
      } catch (err) {
        // Skip duplicate key errors silently
        if ((err as any)?.code !== 'P2002') {
          this.logger.warn(`Skipping item: ${err}`);
        }
      }
    }

    await this.prisma.ingestedSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date() },
    });

    this.logger.log(`${source.name}: ingested ${ingested} new articles`);
    return { ingested };
  }
}
