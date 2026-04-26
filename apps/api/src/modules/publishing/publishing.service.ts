import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform, JobStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SocialConnector, PublishPayload } from './connectors/base.connector';
import { TwitterConnector } from './connectors/twitter/twitter.connector';
import { TelegramConnector } from './connectors/telegram/telegram.connector';
import { MetaConnector } from './connectors/meta/meta.connector';
import { InstagramConnector } from './connectors/meta/instagram.connector';
import { YoutubeConnector } from './connectors/youtube/youtube.connector';
import { LinkedinConnector } from './connectors/linkedin/linkedin.connector';
import { ThreadsConnector } from './connectors/threads/threads.connector';
import { WhatsappConnector } from './connectors/whatsapp/whatsapp.connector';

const MAX_RETRIES = 3;

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);
  private readonly connectors = new Map<Platform, SocialConnector>();
  private readonly publicWebBaseUrl: string;

  // Platforms that have credentials configured
  private readonly enabledPlatforms: Set<Platform>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    twitter: TwitterConnector,
    telegram: TelegramConnector,
    facebook: MetaConnector,
    instagram: InstagramConnector,
    youtube: YoutubeConnector,
    linkedin: LinkedinConnector,
    threads: ThreadsConnector,
    whatsapp: WhatsappConnector,
  ) {
    this.publicWebBaseUrl = (config.get<string>('PUBLIC_WEB_BASE_URL') || 'https://news.nationreporters.com').replace(/\/+$/, '');

    this.connectors.set(Platform.TWITTER, twitter);
    this.connectors.set(Platform.TELEGRAM, telegram);
    this.connectors.set(Platform.FACEBOOK, facebook);
    this.connectors.set(Platform.INSTAGRAM, instagram);
    this.connectors.set(Platform.YOUTUBE, youtube);
    this.connectors.set(Platform.LINKEDIN, linkedin);
    this.connectors.set(Platform.THREADS, threads);
    this.connectors.set(Platform.WHATSAPP, whatsapp);

    // Only publish to platforms with credentials set
    this.enabledPlatforms = new Set([Platform.WEB]);
    if (config.get('TELEGRAM_BOT_TOKEN')) this.enabledPlatforms.add(Platform.TELEGRAM);
    if (config.get('TWITTER_API_KEY')) this.enabledPlatforms.add(Platform.TWITTER);
    if (config.get('FACEBOOK_PAGE_TOKEN')) {
      this.enabledPlatforms.add(Platform.FACEBOOK);
      this.enabledPlatforms.add(Platform.INSTAGRAM);
    }
    if (config.get('YOUTUBE_REFRESH_TOKEN')) this.enabledPlatforms.add(Platform.YOUTUBE);
    if (config.get('LINKEDIN_ACCESS_TOKEN')) this.enabledPlatforms.add(Platform.LINKEDIN);
    if (config.get('THREADS_ACCESS_TOKEN')) this.enabledPlatforms.add(Platform.THREADS);
    if (config.get('WHATSAPP_API_TOKEN')) this.enabledPlatforms.add(Platform.WHATSAPP);
  }

  async publishArticle(articleId: string, platforms?: Platform[]) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { socialCaptions: true, mediaAssets: { take: 5 } },
    });
    if (!article) throw new NotFoundException('Article not found');
    const videoAsset = article.mediaAssets.find((m) => m.type === 'VIDEO');
    const imageAsset = article.mediaAssets.find((m) => m.type === 'IMAGE');

    let activePlatforms = platforms
      ? platforms.filter((p) => this.enabledPlatforms.has(p))
      : [...this.enabledPlatforms];
    // Avoid guaranteed failures: YouTube requires a video URL
    if (!videoAsset) {
      activePlatforms = activePlatforms.filter((p) => p !== Platform.YOUTUBE);
    }

    const jobs = await Promise.all(
      activePlatforms.map((platform) =>
        this.prisma.publishJob.create({
          data: { articleId, platform, status: JobStatus.QUEUED },
        }),
      ),
    );

    for (const job of jobs) {
      await this.executeJob(job.id, article);
    }

    await this.prisma.article.update({
      where: { id: articleId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    return jobs;
  }

  private async executeJob(jobId: string, article: any) {
    const job = await this.prisma.publishJob.findUniqueOrThrow({ where: { id: jobId } });
    const connector = this.connectors.get(job.platform);
    const videoAsset = article.mediaAssets?.find((m: any) => m.type === 'VIDEO');
    const imageAsset = article.mediaAssets?.find((m: any) => m.type === 'IMAGE');

    if (job.platform === Platform.WEB) {
      // Web is handled by marking article published — nothing to do here
      await this.prisma.publishJob.update({
        where: { id: jobId },
        data: { status: JobStatus.SUCCESS, executedAt: new Date() },
      });
      return;
    }

    if (!connector) {
      await this.prisma.publishJob.update({
        where: { id: jobId },
        data: { status: JobStatus.DEAD_LETTERED, errorMsg: `No connector for ${job.platform}` },
      });
      return;
    }

    const caption = article.socialCaptions?.find((c: any) => c.platform === job.platform);
    const payload: PublishPayload = {
      articleId: article.id,
      title: article.title,
      excerpt: article.excerpt ?? article.title,
      // Use canonical slug used by web route. seoSlug can be non-unique / unsuffixed.
      url: `${this.publicWebBaseUrl}/article/${article.slug}`,
      imageUrl: imageAsset?.url,
      videoUrl: videoAsset?.url,
      caption: caption?.caption,
      hashtags: article.hashtags,
      platform: job.platform,
    };

    await this.prisma.publishJob.update({ where: { id: jobId }, data: { status: JobStatus.RUNNING } });

    try {
      const result = await connector.publish(payload);

      await this.prisma.publishJob.update({
        where: { id: jobId },
        data: {
          status: result.success ? JobStatus.SUCCESS : JobStatus.FAILED,
          response: result.response ?? {},
          errorMsg: result.errorMsg,
          executedAt: new Date(),
        },
      });
    } catch (err) {
      const retries = job.retries + 1;
      await this.prisma.publishJob.update({
        where: { id: jobId },
        data: {
          status: retries >= MAX_RETRIES ? JobStatus.DEAD_LETTERED : JobStatus.FAILED,
          retries,
          errorMsg: String(err),
        },
      });
    }
  }

  async publishToSocialOnly(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { socialCaptions: true, mediaAssets: { take: 5 } },
    });
    if (!article) return;

    const socialPlatforms: Platform[] = [
      Platform.TWITTER, Platform.FACEBOOK, Platform.INSTAGRAM,
      Platform.TELEGRAM, Platform.LINKEDIN, Platform.THREADS, Platform.WHATSAPP,
    ];
    const videoAsset = article.mediaAssets?.find((m) => m.type === 'VIDEO');
    if (videoAsset && this.enabledPlatforms.has(Platform.YOUTUBE)) {
      socialPlatforms.push(Platform.YOUTUBE);
    }

    const activePlatforms = socialPlatforms.filter((p) => this.enabledPlatforms.has(p));
    if (activePlatforms.length === 0) return;

    const jobs = await Promise.all(
      activePlatforms.map((platform) =>
        this.prisma.publishJob.create({
          data: { articleId, platform, status: JobStatus.QUEUED },
        }),
      ),
    );

    for (const job of jobs) {
      await this.executeJob(job.id, article);
    }
  }

  getJobs(filters: { platform?: Platform; status?: JobStatus; page?: number; limit?: number }) {
    const { platform, status, page = 1, limit = 20 } = filters;
    return this.prisma.publishJob.findMany({
      where: { ...(platform && { platform }), ...(status && { status }) },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { article: { select: { title: true, slug: true } } },
    });
  }

  getDlq() {
    return this.prisma.publishJob.findMany({
      where: { status: JobStatus.DEAD_LETTERED },
      orderBy: { createdAt: 'desc' },
    });
  }

  async retryJob(jobId: string) {
    const job = await this.prisma.publishJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { article: { include: { socialCaptions: true, mediaAssets: { take: 1 } } } },
    });
    await this.prisma.publishJob.update({
      where: { id: jobId },
      data: { status: JobStatus.QUEUED, retries: 0 },
    });
    return this.executeJob(jobId, job.article);
  }
}
