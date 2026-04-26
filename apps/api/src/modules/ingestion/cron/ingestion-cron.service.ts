import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('rss-parser');
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { DedupService } from '../dedup/dedup.service';
import { ProvenanceService } from '../provenance/provenance.service';
import { AiService } from '../../ai/ai.service';
import { ArticleStatus } from '@prisma/client';
import { PublishingService } from '../../publishing/publishing.service';

type CategorySlug =
  | 'india'
  | 'world'
  | 'politics'
  | 'business'
  | 'sports'
  | 'entertainment'
  | 'tech';
type RemainingQuota = Record<CategorySlug, number>;

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
  private readonly maxPerCategory: number;
  private readonly maxFeedItemsScan: number;
  private readonly minSectionInventory: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dedup: DedupService,
    private readonly provenance: ProvenanceService,
    private readonly ai: AiService,
    private readonly publishing: PublishingService,
  ) {
    this.maxPerCategory = Number(this.config.get('INGESTION_MAX_PER_CATEGORY') ?? 20);
    this.maxFeedItemsScan = Number(this.config.get('INGESTION_MAX_FEED_ITEMS_SCAN') ?? 100);
    this.minSectionInventory = Number(this.config.get('INGESTION_MIN_SECTION_INVENTORY') ?? 20);
  }

  // 08:00, 14:00, 20:00 IST (UTC+5:30 = 02:30, 08:30, 14:30 UTC)
  @Cron('30 2,8,14 * * *')
  async runScheduledIngestion() {
    this.logger.log('Scheduled ingestion started');
    const sources = await this.prisma.ingestedSource.findMany({ where: { isActive: true } });
    const remainingByCategory: RemainingQuota = {
      india: this.maxPerCategory,
      world: this.maxPerCategory,
      politics: this.maxPerCategory,
      business: this.maxPerCategory,
      sports: this.maxPerCategory,
      entertainment: this.maxPerCategory,
      tech: this.maxPerCategory,
    };

    for (const source of sources) {
      if (Object.values(remainingByCategory).every((remaining) => remaining <= 0)) {
        this.logger.log('Scheduled ingestion quota reached for all sections');
        break;
      }
      try {
        await this.fetchSource(source, { remainingByCategory });
      } catch (err) {
        const message = (err as Error)?.message ?? 'Unknown source fetch error';
        this.logger.error(`Failed to fetch source ${source.name}: ${message}`);
        if (this.shouldTemporarilyDisableSource(message)) {
          await this.prisma.ingestedSource.update({
            where: { id: source.id },
            data: { isActive: false },
          });
          this.logger.warn(`Source auto-disabled due to repeated hard failure: ${source.name}`);
        }
      }
    }
    await this.logSectionInventoryWarnings();
  }

  private async logSectionInventoryWarnings() {
    const categories = await this.prisma.category.findMany({
      where: { slug: { in: ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'tech'] } },
      select: { id: true, slug: true },
    });
    const categorySlugById = new Map(categories.map((c) => [c.id, c.slug]));
    const monitoredLangs = ['en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu', 'kn', 'pa', 'ur', 'ar', 'fr', 'de', 'es', 'pt', 'ru', 'zh', 'ja', 'ko'];
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const grouped = await this.prisma.article.groupBy({
      by: ['categoryId', 'language'],
      where: {
        status: ArticleStatus.PUBLISHED,
        categoryId: { in: categories.map((c) => c.id) },
        language: { in: monitoredLangs },
        publishedAt: { gte: since },
      },
      _count: { _all: true },
    });
    const countMap = new Map<string, number>();
    for (const row of grouped) {
      if (!row.categoryId) continue;
      countMap.set(`${row.categoryId}|${row.language.toLowerCase()}`, row._count._all);
    }

    for (const category of categories) {
      for (const lang of monitoredLangs) {
        const count = countMap.get(`${category.id}|${lang}`) ?? 0;
        if (count < this.minSectionInventory) {
          this.logger.warn(
            `inventory-low category=${category.slug} language=${lang} count_24h=${count} min_required=${this.minSectionInventory}`,
          );
        }
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

  private extractVideo(item: any): string | null {
    const mediaUrl = item['media:content']?.$.url ?? item.enclosure?.url;
    const mediaType = item['media:content']?.$.type ?? item.enclosure?.type ?? '';
    if (mediaUrl && String(mediaType).startsWith('video')) return mediaUrl;
    if (item.link && /youtube\.com|youtu\.be|vimeo\.com/i.test(item.link)) return item.link;
    return null;
  }

  async fetchSource(
    source: { id: string; feedUrl: string; name: string; language?: string },
    options?: { remainingByCategory?: RemainingQuota },
  ) {
    const feed = await this.parseFeedWithRetry(source.feedUrl, source.name);
    let ingested = 0;

    // Prefer explicit non-English source language; otherwise infer from source name.
    // This avoids accidental default "en" for multilingual feeds.
    const inferredLang = this.detectSourceLang(source.name);
    const sourceLang = source.language && source.language !== 'en'
      ? source.language
      : inferredLang;

    // Scan latest items and publish quota-eligible stories across sections
    const items = (feed.items ?? []).slice(0, this.maxFeedItemsScan);

    for (const item of items) {
      const categorySlug = this.detectCategorySlug(item.title ?? '', source.name);
      if (!categorySlug) continue;
      if (options?.remainingByCategory && options.remainingByCategory[categorySlug] <= 0) continue;

      const body = item.content ?? item.contentSnippet ?? item.summary ?? item.title ?? '';
      const hash = crypto.createHash('sha256').update(item.link ?? item.title ?? '').digest('hex');
      const imageUrl = this.extractImage(item);
      const sourceVideoUrl = this.extractVideo(item);

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
          const article = await this.ai.processIngestedArticle(ingestedArticle.id, {
            language: sourceLang,
            imageUrl: imageUrl ?? undefined,
            sourceVideoUrl: sourceVideoUrl ?? undefined,
            forceAutoPublish: true,
            allowedCategories: ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'tech'],
          });
          if (!article) continue;

          if (options?.remainingByCategory) {
            options.remainingByCategory[categorySlug]--;
          }
        } catch (aiErr) {
          const msg = (aiErr as Error).message ?? '';
          const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('Too Many');
          if (is429) {
            this.logger.warn(`Gemini quota — publishing raw article: ${item.title?.slice(0, 60)}`);
            const published = await this.publishRaw(ingestedArticle, source, imageUrl ?? undefined);
            if (published && options?.remainingByCategory) {
              options.remainingByCategory[categorySlug]--;
            }
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

  private async parseFeedWithRetry(feedUrl: string, sourceName: string) {
    try {
      return await this.parser.parseURL(feedUrl);
    } catch (firstErr) {
      this.logger.warn(`Feed parse failed, retrying once for ${sourceName}: ${(firstErr as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, 800));
      return this.parser.parseURL(feedUrl);
    }
  }

  /**
   * Disable clearly dead feeds automatically so ingestion cycles keep moving.
   * Admin can re-enable the source later from Sources UI after fixing URL.
   */
  private shouldTemporarilyDisableSource(errorMessage: string): boolean {
    const msg = (errorMessage || '').toLowerCase();
    return (
      msg.includes('status code 404') ||
      msg.includes('status code 410') ||
      msg.includes('status code 451') ||
      msg.includes('status code 522') ||
      msg.includes('status code 530') ||
      msg.includes('enotfound') ||
      msg.includes('getaddrinfo') ||
      msg.includes('attribute without value')
    );
  }

  /** Strip HTML and map long RSS text into TipTap paragraph nodes (no 2k hard cap). */
  private rawHtmlToDocContent(htmlOrText: string, maxTotalChars = 80000) {
    const text = htmlOrText
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, maxTotalChars);
    if (!text) {
      return [{ type: 'paragraph', content: [{ type: 'text', text: '(No body text in feed item.)' }] }];
    }
    let parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1 && text.length > 6000) {
      parts = [];
      let cur = '';
      const chunks = text.split(/(?<=[.!?।।])\s+/);
      for (const sentence of chunks) {
        if (cur.length + sentence.length > 4500) {
          if (cur) parts.push(cur.trim());
          cur = sentence;
        } else {
          cur = cur ? `${cur} ${sentence}` : sentence;
        }
      }
      if (cur.trim()) parts.push(cur.trim());
    }
    const dedupedParts = this.dedupeParagraphs(parts);
    return dedupedParts.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }));
  }

  // Publish raw RSS content directly when AI is unavailable
  private async publishRaw(
    ingestedArticle: { id: string; sourceTitle: string; body: string; publishedAt: Date | null },
    source: { name: string; language?: string },
    imageUrl?: string,
  ): Promise<boolean> {
    const adminUser = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) return false;

    const base = ingestedArticle.sourceTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    const existing = await this.prisma.article.findFirst({ where: { slug: { startsWith: base } } });
    const slug = existing ? `${base}-${Date.now()}` : base;

    const plainLead = ingestedArticle.body.replace(/<[^>]+>/g, '').trim();
    const excerpt = plainLead.slice(0, 400);

    const lang = this.normalizeLanguageTag(
      source.language ?? this.detectSourceLang(source.name),
      ingestedArticle.sourceTitle,
      ingestedArticle.body,
    );
    // Map source name to category
    const category = await this.detectCategory(ingestedArticle.sourceTitle);
    if (!category) return false;

    const article = await this.prisma.article.create({
      data: {
        title: ingestedArticle.sourceTitle,
        slug,
        body: {
          type: 'doc',
          // Store image + video URLs in body metadata for frontend use
          ...(imageUrl && { imageUrl, imageCredit: 'Image sourced from original publisher. All rights belong to respective owners.' }),
          content: this.rawHtmlToDocContent(ingestedArticle.body),
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

    if (imageUrl) {
      await this.prisma.mediaAsset.create({
        data: {
          articleId: article.id,
          type: 'IMAGE',
          url: imageUrl,
          s3Key: `external/${article.id}/source-image`,
          mimeType: 'image/jpeg',
          sizeBytes: 0,
          scanStatus: 'external',
        },
      });
    }

    await this.publishing.publishToSocialOnly(article.id).catch((err) => {
      this.logger.warn(`Social publish failed for raw fallback ${article.id}: ${(err as Error).message}`);
    });

    await this.prisma.ingestedArticle.update({
      where: { id: ingestedArticle.id },
      data: { status: 'PUBLISHED' },
    });
    return true;
  }

  private detectSourceLang(sourceName: string): string {
    const name = sourceName.toLowerCase();
    if (name.includes('hindi') || name.includes('हिंदी') || name.includes('jagran') || name.includes('amar ujala') || name.includes('abp live hindi')) return 'hi';
    if (name.includes('marathi') || name.includes('maratha') || name.includes('maharashtra times') || name.includes('lokmat') || name.includes('sakal')) return 'mr';
    if (name.includes('bengali') || name.includes('bangla') || name.includes('ananda') || name.includes('eisamay') || name.includes('abp ananda') || name.includes('prothom alo')) return 'bn';
    if (name.includes('tamil') || name.includes('dinamalar') || name.includes('dinamani') || name.includes('vikatan')) return 'ta';
    if (name.includes('telugu') || name.includes('eenadu') || name.includes('sakshi') || name.includes('tv9 telugu')) return 'te';
    if (name.includes('kannada') || name.includes('prajavani') || name.includes('vijaya karnataka') || name.includes('tv9 kannada')) return 'kn';
    if (name.includes('punjabi') || name.includes('jagbani') || name.includes('punjab kesari')) return 'pa';
    if (name.includes('gujarati') || name.includes('divya bhaskar') || name.includes('gujarat samachar') || name.includes('sandesh')) return 'gu';
    if (name.includes('arabic') || name.includes('عربي') || name.includes('al jazeera arabic') || name.includes('al arabiya') || name.includes('ahram')) return 'ar';
    if (name.includes('urdu') || name.includes('jang') || name.includes('geo urdu')) return 'ur';
    if (name.includes('french') || name.includes('le monde') || name.includes('le figaro') || name.includes('radio-canada') || name.includes('ledevoir') || name.includes('rfi')) return 'fr';
    if (name.includes('german') || name.includes('spiegel') || name.includes('zeit') || name.includes('deutsche welle german') || name.includes('süddeutsche')) return 'de';
    if (name.includes('spanish') || name.includes('el país') || name.includes('el pais') || name.includes('el mundo') || name.includes('rtve') || name.includes('bbc mundo') || name.includes('infobae')) return 'es';
    if (name.includes('portuguese') || name.includes('g1 globo') || name.includes('folha') || name.includes('bbc brasil')) return 'pt';
    if (name.includes('russian') || name.includes('tass') || name.includes('ria novosti') || name.includes('rt russian')) return 'ru';
    if (name.includes('japanese') || name.includes('nhk') || name.includes('asahi')) return 'ja';
    if (name.includes('korean') || name.includes('yonhap') || name.includes('korea herald') || name.includes('joongang')) return 'ko';
    if (name.includes('chinese') || name.includes('xinhua') || name.includes('cgtn')) return 'zh';
    if (name.includes('indonesian') || name.includes('kompas')) return 'id';
    if (name.includes('turkish')) return 'tr';
    return 'en';
  }

  /**
   * Guardrail: if text script clearly conflicts with an English tag, normalize it.
   */
  private inferLangFromText(text: string): string | null {
    const t = text ?? '';
    if (/[\u3040-\u30FF]/.test(t)) return 'ja'; // Hiragana/Katakana
    if (/[\uAC00-\uD7AF]/.test(t)) return 'ko'; // Hangul
    if (/[\u0400-\u04FF]/.test(t)) return 'ru'; // Cyrillic
    if (/[\u0600-\u06FF]/.test(t)) return 'ar'; // Arabic script
    if (/[\u0900-\u097F]/.test(t)) return 'hi'; // Devanagari (Hindi/Marathi), default to hi
    if (/[\u0980-\u09FF]/.test(t)) return 'bn';
    if (/[\u0A00-\u0A7F]/.test(t)) return 'pa';
    if (/[\u0A80-\u0AFF]/.test(t)) return 'gu';
    if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';
    if (/[\u0C00-\u0C7F]/.test(t)) return 'te';
    if (/[\u0C80-\u0CFF]/.test(t)) return 'kn';
    if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';
    return null;
  }

  private normalizeParagraphKey(paragraph: string): string {
    return paragraph
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();
  }

  private dedupeParagraphs(paragraphs: string[]): string[] {
    const keys = new Set<string>();
    const out: string[] = [];
    for (const paragraph of paragraphs) {
      const key = this.normalizeParagraphKey(paragraph);
      if (!key || keys.has(key)) continue;
      keys.add(key);
      out.push(paragraph);
    }
    return out;
  }

  private normalizeLanguageTag(preferred: string, ...samples: Array<string | null | undefined>) {
    const preferredNorm = (preferred || 'en').toLowerCase();
    const probe = samples.filter(Boolean).join('\n');
    const inferred = this.inferLangFromText(probe);
    if (!inferred) return preferredNorm;
    if (preferredNorm === 'en') return inferred;
    return preferredNorm;
  }

  private detectCategorySlug(title: string, sourceName = ''): CategorySlug | null {
    const t = `${title} ${sourceName}`.toLowerCase();
    // Sports
    if (t.match(/sport|cricket|football|ipl|tennis|olympics|मैच|क्रिकेट|ఫుట్‌బాల్|క్రికెట్|ಫುಟ್ಬಾಲ್|ಕ್ರೀಡೆ/)) return 'sports';
    // Tech
    if (t.match(/tech|ai|digital|startup|cyber|software|app|तकनीक|प्रौद्योगिकी|టెక్|ಸാങ്കേതിക/)) return 'tech';
    // Business
    if (t.match(/business|economy|market|stock|sensex|gdp|rupee|trade|बाजार|अर्थव्यवस्था|शेयर|వ్యాపార|ಮಾರುಕಟ್ಟೆ/)) return 'business';
    // Politics / governance / public affairs
    if (t.match(/politics|election|parliament|minister|cm |pm |governor|bjp|congress|सरकार|चुनाव|संसद|मंत्री|ರಾಜಕೀಯ|चालू घडामोडी|current affairs/)) return 'politics';
    // Entertainment
    if (t.match(/film|cinema|bollywood|celebrity|entertainment|award|movie|actor|actress|फिल्म|मनोरंजन|సినిమా|ಮನರಂಜನೆ/)) return 'entertainment';
    // World + current affairs + conflict
    if (t.match(/world|us |usa|uk |china|europe|russia|pakistan|international|global|breaking|war|ceasefire|diplomacy|geopolitics|विदेश|दुनिया|अंतरराष्ट्रीय|ವಿಶ್ವ|ప్రపంచం|العالم|monde|mundo/)) return 'world';
    // Prefer world as neutral fallback so top bars get current-affairs coverage even when title is generic.
    return 'world';
  }

  private async detectCategory(title: string): Promise<{ id: string } | null> {
    const slug = this.detectCategorySlug(title);
    if (!slug) return null;
    return this.prisma.category.findFirst({ where: { slug }, select: { id: true } });
  }
}
