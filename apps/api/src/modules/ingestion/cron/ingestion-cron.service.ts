import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('rss-parser');
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { DedupService } from '../dedup/dedup.service';
import { ProvenanceService } from '../provenance/provenance.service';
import { AiService } from '../../ai/ai.service';
import { ArticleStatus } from '@prisma/client';

@Injectable()
export class IngestionCronService {
  private readonly logger = new Logger(IngestionCronService.name);
  private readonly parser = new Parser({
    customFields: {
      item: [
        ['media:content', 'media:content', { keepArray: false }],
        ['media:thumbnail', 'media:thumbnail', { keepArray: false }],
        ['media:group', 'media:group'],
        ['enclosure', 'enclosure'],
      ],
    },
  });

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

  private extractImage(item: any): string | null {
    // Try media:content, media:thumbnail, enclosure, image in content
    return item['media:content']?.$.url
        ?? item['media:thumbnail']?.$.url
        ?? (item.enclosure?.type?.startsWith('image') ? item.enclosure.url : null)
        ?? item['ht:image']?.['$']?.url
        ?? this.extractImgFromHtml(item.content ?? item.summary ?? '')
        ?? null;
  }

  private extractImgFromHtml(html: string): string | null {
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return m?.[1] ?? null;
  }

  async fetchSource(source: { id: string; feedUrl: string; name: string }) {
    const feed = await this.parser.parseURL(source.feedUrl);
    let ingested = 0;

    // Only process first 5 items per source to respect Gemini free tier limits
    const items = (feed.items ?? []).slice(0, 5);

    for (const item of items) {
      const body = item.content ?? item.contentSnippet ?? item.summary ?? item.title ?? '';
      const hash = crypto.createHash('sha256').update(item.link ?? item.title ?? '').digest('hex');
      const imageUrl = this.extractImage(item);

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

        // Try AI processing; if Gemini rate-limits, fall back to publishing raw
        try {
          await this.ai.processIngestedArticle(ingestedArticle.id);
        } catch (aiErr) {
          const msg = (aiErr as Error).message ?? '';
          const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('Too Many');
          if (is429) {
            this.logger.warn(`Gemini quota — publishing raw article: ${item.title?.slice(0, 60)}`);
            await this.publishRaw(ingestedArticle, source, imageUrl ?? undefined);
          } else {
            throw aiErr;
          }
        }
        ingested++;
      } catch (err) {
        if ((err as any)?.code !== 'P2002') {
          this.logger.warn(`Skipping item: ${(err as Error).message?.slice(0, 80)}`);
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

  // Publish raw RSS content directly when AI is unavailable
  private async publishRaw(
    ingestedArticle: { id: string; sourceTitle: string; body: string; publishedAt: Date | null },
    source: { name: string },
    imageUrl?: string,
  ) {
    const adminUser = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) return;

    const base = ingestedArticle.sourceTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    const existing = await this.prisma.article.findFirst({ where: { slug: { startsWith: base } } });
    const slug = existing ? `${base}-${Date.now()}` : base;

    const excerpt = ingestedArticle.body.slice(0, 200).replace(/<[^>]+>/g, '');

    // Detect language from source name
    const lang = this.detectSourceLang(source.name);
    // Map source name to category
    const category = await this.detectCategory(ingestedArticle.sourceTitle);

    await this.prisma.article.create({
      data: {
        title: ingestedArticle.sourceTitle,
        slug,
        body: {
          type: 'doc',
          // Store image + video URLs in body metadata for frontend use
          ...(imageUrl && { imageUrl, imageCredit: 'Image sourced from original publisher. All rights belong to respective owners.' }),
          content: [{ type: 'paragraph', content: [{ type: 'text', text: ingestedArticle.body.replace(/<[^>]+>/g, '').slice(0, 2000) }] }],
        },
        excerpt,
        status: ArticleStatus.PUBLISHED,
        language: lang,
        categoryId: category?.id,
        authorId: adminUser.id,
        publishedAt: ingestedArticle.publishedAt ?? new Date(),
        ingestedArticleId: ingestedArticle.id,
      },
    });

    await this.prisma.ingestedArticle.update({
      where: { id: ingestedArticle.id },
      data: { status: 'PUBLISHED' },
    });
  }

  private detectSourceLang(sourceName: string): string {
    const name = sourceName.toLowerCase();
    if (name.includes('hindi') || name.includes('हिंदी')) return 'hi';
    if (name.includes('marathi') || name.includes('maratha')) return 'mr';
    if (name.includes('bengali') || name.includes('bangla') || name.includes('ananda')) return 'bn';
    if (name.includes('tamil') || name.includes('dinamalar') || name.includes('dinamani')) return 'ta';
    if (name.includes('telugu') || name.includes('eenadu') || name.includes('sakshi')) return 'te';
    if (name.includes('kannada') || name.includes('prajavani')) return 'kn';
    if (name.includes('punjabi')) return 'pa';
    if (name.includes('gujarati') || name.includes('divya bhaskar')) return 'gu';
    if (name.includes('arabic') || name.includes('عربي') || name.includes('al jazeera arabic')) return 'ar';
    if (name.includes('urdu') || name.includes('jang') || name.includes('geo urdu')) return 'ur';
    if (name.includes('french') || name.includes('le monde') || name.includes('le figaro')) return 'fr';
    if (name.includes('german') || name.includes('spiegel') || name.includes('zeit')) return 'de';
    if (name.includes('japanese') || name.includes('nhk') || name.includes('asahi')) return 'ja';
    if (name.includes('korean') || name.includes('yonhap')) return 'ko';
    if (name.includes('chinese') || name.includes('xinhua')) return 'zh';
    return 'en';
  }

  private async detectCategory(title: string): Promise<{ id: string } | null> {
    const t = title.toLowerCase();
    const slug =
      t.match(/sport|cricket|football|ipl|tennis|olympics/) ? 'sports' :
      t.match(/tech|ai|digital|startup|cyber|software|app/) ? 'tech' :
      t.match(/business|economy|market|stock|sensex|gdp|rupee|trade/) ? 'business' :
      t.match(/politics|election|parliament|minister|cm |pm |governor|bjp|congress/) ? 'politics' :
      t.match(/film|cinema|bollywood|celebrity|entertainment|award/) ? 'entertainment' :
      t.match(/health|covid|hospital|doctor|medicine|disease/) ? 'health' :
      t.match(/world|us |usa|uk |china|europe|russia|pakistan|international/) ? 'world' :
      'india';

    return this.prisma.category.findFirst({ where: { slug }, select: { id: true } });
  }
}
