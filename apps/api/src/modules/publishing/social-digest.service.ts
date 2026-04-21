import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PublishingService } from './publishing.service';
import { Platform } from '@prisma/client';

const SOCIAL_PLATFORMS: Platform[] = [
  Platform.TWITTER,
  Platform.FACEBOOK,
  Platform.INSTAGRAM,
  Platform.TELEGRAM,
  Platform.LINKEDIN,
  Platform.THREADS,
  Platform.WHATSAPP,
];

// Top N articles per digest run
const DIGEST_SIZE = 5;

// Hours to look back for "recent" articles per slot
const LOOKBACK_HOURS = 9;

@Injectable()
export class SocialDigestService {
  private readonly logger = new Logger(SocialDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publishing: PublishingService,
  ) {}

  // Run 1 hour after each ingestion slot: 9:30 AM, 3:30 PM, 9:30 PM IST (4:00, 10:00, 16:00 UTC)
  @Cron('0 4,10,16 * * *')
  async runDigest() {
    this.logger.log('Social digest starting…');
    try {
      const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

      // Find top recently-published articles that haven't been posted to any social platform yet
      const articles = await this.prisma.article.findMany({
        where: {
          status: 'PUBLISHED',
          publishedAt: { gte: since },
          publishJobs: {
            none: {
              platform: { in: SOCIAL_PLATFORMS },
              status: { in: ['SUCCESS', 'RUNNING', 'QUEUED'] },
            },
          },
        },
        orderBy: { publishedAt: 'desc' },
        take: DIGEST_SIZE,
        select: { id: true, title: true },
      });

      if (articles.length === 0) {
        this.logger.log('Social digest: no new articles to post');
        return;
      }

      this.logger.log(`Social digest: posting ${articles.length} articles to social platforms`);

      for (const article of articles) {
        try {
          await this.publishing.publishToSocialOnly(article.id);
          this.logger.log(`Digest posted: ${article.title}`);
        } catch (err) {
          this.logger.error(`Digest failed for ${article.id}: ${String(err)}`);
        }
      }

      this.logger.log('Social digest complete');
    } catch (err) {
      this.logger.error('Social digest error', err);
    }
  }

  // Manual trigger for admin panel
  async triggerManual(limit = DIGEST_SIZE) {
    this.logger.log(`Manual social digest triggered (limit=${limit})`);
    const articles = await this.prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        publishJobs: {
          none: {
            platform: { in: SOCIAL_PLATFORMS },
            status: { in: ['SUCCESS', 'RUNNING', 'QUEUED'] },
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true, title: true },
    });

    const results: { title: string; success: boolean }[] = [];
    for (const article of articles) {
      try {
        await this.publishing.publishToSocialOnly(article.id);
        results.push({ title: article.title, success: true });
      } catch (err) {
        results.push({ title: article.title, success: false });
      }
    }
    return results;
  }
}
