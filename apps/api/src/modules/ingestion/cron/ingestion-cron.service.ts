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
import {
  fetchArticlePlainText,
  fetchArticleTitleAndText,
  isAllowedArticleFetchUrl,
  MIN_SOURCE_ARTICLE_PLAIN_CHARS,
  rssBodyLooksLikeTitleOnly,
} from '../../ai/source-article-text.util';
import {
  acceptLanguageHeaderForLocale,
  normalizeLanguageCode,
  resolveArticleLanguage,
} from '../../ai/language-resolution.util';
import { detectFeedSourceLanguage } from '../source-language.util';
import { resolveSourceFeedLanguage } from '../ingestion-language.util';
import { stripSyndicationLinkbacks, stripWireHeadlinePrefix } from '../../../common/editorial-sanitize';
import {
  buildReaderSummaryFromPlainText,
  splitStoryBodies,
  stripPublisherFeedBoilerplate,
} from '../../../common/reader-summary.util';
import { resolveUniqueArticleSlug } from '../../../common/slug.util';

type CategorySlug =
  | 'india'
  | 'world'
  | 'politics'
  | 'business'
  | 'sports'
  | 'entertainment'
  | 'tech';
type RemainingQuota = Record<CategorySlug, number>;

type IngestedSourceRow = {
  id: string;
  feedUrl: string;
  name: string;
  language?: string | null;
  isTrusted: boolean;
};

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
  private readonly maxItemsPerSource: number;
  private readonly maxFeedItemsScan: number;
  private readonly minSectionInventory: number;
  private readonly fetchSourceArticle: boolean;
  private readonly fetchSourceTimeoutMs: number;
  private readonly fetchSourceMaxBytes: number;
  private readonly skipAiIngestion: boolean;
  /** Set when Gemini returns 429/quota — raw publish for the rest of this run. */
  private aiQuotaExhausted = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dedup: DedupService,
    private readonly provenance: ProvenanceService,
    private readonly ai: AiService,
    private readonly publishing: PublishingService,
  ) {
    this.maxPerCategory = Number(this.config.get('INGESTION_MAX_PER_CATEGORY') ?? 20);
    this.maxItemsPerSource = Number(this.config.get('INGESTION_MAX_ITEMS_PER_SOURCE') ?? 28);
    this.maxFeedItemsScan = Number(this.config.get('INGESTION_MAX_FEED_ITEMS_SCAN') ?? 100);
    this.minSectionInventory = Number(this.config.get('INGESTION_MIN_SECTION_INVENTORY') ?? 20);
    const fetchFlag = (this.config.get<string>('FETCH_SOURCE_ARTICLE') ?? '').toLowerCase();
    this.fetchSourceArticle = !['0', 'false', 'no', 'off'].includes(fetchFlag);
    this.fetchSourceTimeoutMs = Number(this.config.get('FETCH_SOURCE_TIMEOUT_MS') ?? 15_000);
    this.fetchSourceMaxBytes = Number(this.config.get('FETCH_SOURCE_MAX_BYTES') ?? 1_000_000);
    const skipAi = (this.config.get<string>('INGESTION_SKIP_AI') ?? '').toLowerCase();
    this.skipAiIngestion = ['1', 'true', 'yes', 'on'].includes(skipAi);
  }

  /**
   * On-demand ingestion of a single article URL in any language.
   * Fetches the page, deduplicates, runs AI rewrite + publish, and returns the article id.
   */
  async ingestSingleUrl(
    url: string,
    language: string,
  ): Promise<{ articleId: string }> {
    if (!isAllowedArticleFetchUrl(url)) {
      throw new Error('URL not allowed');
    }

    const fetched = await fetchArticleTitleAndText(
      url,
      { timeoutMs: this.fetchSourceTimeoutMs, maxBytes: this.fetchSourceMaxBytes },
      { acceptLanguage: acceptLanguageHeaderForLocale(language) },
    );
    if (!fetched || fetched.text.length < MIN_SOURCE_ARTICLE_PLAIN_CHARS) {
      throw new Error('Could not fetch enough article content from that URL');
    }

    const lang = normalizeLanguageCode(language);
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    const isDuplicate = await this.dedup.isDuplicate(hash, fetched.text, lang);
    if (isDuplicate) {
      throw new Error('Article from this URL has already been ingested');
    }

    // Find or lazily create the shared manual-ingest source (isActive:false keeps it out of cron)
    let manualSource = await this.prisma.ingestedSource.findFirst({
      where: { feedUrl: 'manual://ingest' },
    });
    if (!manualSource) {
      manualSource = await this.prisma.ingestedSource.create({
        data: {
          name: 'Manual URL Ingest',
          feedUrl: 'manual://ingest',
          type: 'MANUAL',
          language: undefined,
          isActive: false,
          isTrusted: true,
        },
      });
    }

    const ingestedArticle = await this.prisma.ingestedArticle.create({
      data: {
        sourceId: manualSource.id,
        sourceUrl: url,
        sourceTitle: fetched.title || 'Untitled',
        body: fetched.text,
        contentHash: hash,
      },
    });

    await this.provenance.record({
      ingestedArticleId: ingestedArticle.id,
      sourceUrl: url,
      sourceTitle: fetched.title || 'Untitled',
      sourceName: 'Manual URL Ingest',
      fetchedAt: new Date(),
      attributionNote: 'Ingested on demand via admin API; internal record only.',
    });

    let articleId: string | undefined;
    try {
      const article = await this.ai.processIngestedArticle(ingestedArticle.id, {
        language: lang,
        forceAutoPublish: true,
        allowedCategories: ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'tech'],
      });
      if (article) articleId = article.id;
    } catch (aiErr) {
      this.logger.warn(
        `AI failed for manual ingest ${url.slice(0, 64)}: ${(aiErr as Error).message?.slice(0, 120)} — falling back to raw publish`,
      );
    }

    if (!articleId) {
      const ok = await this.publishRaw(ingestedArticle, { name: 'Manual URL Ingest', language: lang });
      if (!ok) throw new Error('Failed to publish article');
      const published = await this.prisma.article.findFirst({
        where: { ingestedArticleId: ingestedArticle.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!published) throw new Error('Published article not found');
      articleId = published.id;
    }

    return { articleId };
  }

  /**
   * Prefer HTML fetched from item.link when RSS body is thin or the page has more text
   * (same rules as AI path — ensures DB + raw-publish path see full story when possible).
   */
  private async enrichBodyFromSourcePage(
    rssBody: string,
    sourceUrl: string,
    sourceLang: string,
    itemTitlePlain: string,
  ): Promise<string> {
    if (!this.fetchSourceArticle || !sourceUrl || !isAllowedArticleFetchUrl(sourceUrl)) {
      return stripSyndicationLinkbacks(rssBody);
    }
    const rssPlain = this.stripHtmlToPlain(rssBody, true);
    const rssIsThin = rssPlain.length < 700;
    const looksTitleOnly = rssBodyLooksLikeTitleOnly(rssPlain, itemTitlePlain);
    try {
      const fetched = await fetchArticlePlainText(
        sourceUrl,
        { timeoutMs: this.fetchSourceTimeoutMs, maxBytes: this.fetchSourceMaxBytes },
        { acceptLanguage: acceptLanguageHeaderForLocale(sourceLang) },
      );
      if (!fetched || fetched.length < MIN_SOURCE_ARTICLE_PLAIN_CHARS) return stripSyndicationLinkbacks(rssBody);
      const materiallyLonger = fetched.length > rssPlain.length + 40;
      const muchLongerThanHeadline = fetched.length > (itemTitlePlain?.length ?? 0) + 120;
      if (materiallyLonger || rssIsThin || looksTitleOnly || muchLongerThanHeadline) {
        this.logger.log(
          `Ingestion: stored body from source page (${fetched.length}c) vs RSS (${rssPlain.length}c) titleOnly=${looksTitleOnly}`,
        );
        return stripSyndicationLinkbacks(fetched);
      }
    } catch (e) {
      this.logger.warn(`Ingestion source fetch failed ${sourceUrl.slice(0, 64)}: ${(e as Error).message}`);
    }
    return stripSyndicationLinkbacks(rssBody);
  }

  // 08:00, 14:00, 20:00 IST (UTC+5:30 = 02:30, 08:30, 14:30 UTC)
  @Cron('30 2,8,14 * * *')
  async runScheduledIngestion() {
    this.logger.log('Scheduled ingestion started');
    this.aiQuotaExhausted = this.skipAiIngestion;
    if (this.skipAiIngestion) {
      this.logger.log('INGESTION_SKIP_AI enabled — publishing fetched RSS/source text without Gemini');
    }
    const sources = await this.prisma.ingestedSource.findMany({ where: { isActive: true } });
    const sorted = this.sortSourcesForIngestion(sources as IngestedSourceRow[]);

    for (const source of sorted) {
      const remainingByCategory: RemainingQuota = {
        india: this.maxPerCategory,
        world: this.maxPerCategory,
        politics: this.maxPerCategory,
        business: this.maxPerCategory,
        sports: this.maxPerCategory,
        entertainment: this.maxPerCategory,
        tech: this.maxPerCategory,
      };
      try {
        await this.fetchSource(source, {
          remainingByCategory,
          maxItemsPerSource: this.maxItemsPerSource,
        });
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
    const monitoredLangs = [
      'en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu', 'kn', 'pa', 'ur', 'ml',
      'ar', 'fr', 'de', 'es', 'pt', 'ru', 'zh', 'ja', 'ko', 'id', 'ms', 'tr', 'it',
    ];
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
    source: { id: string; feedUrl: string; name: string; language?: string | null },
    options?: { remainingByCategory?: RemainingQuota; maxItemsPerSource?: number },
  ) {
    const feed = await this.parseFeedWithRetry(source.feedUrl, source.name);
    let ingested = 0;

    // Prefer explicit non-English source language; otherwise infer from source name.
    // This avoids accidental default "en" for multilingual feeds.
    const feedLangHint = resolveSourceFeedLanguage(source);

    // Scan latest items and publish quota-eligible stories across sections
    const items = (feed.items ?? []).slice(0, this.maxFeedItemsScan);

    for (const item of items) {
      const titlePlain = this.rssPlainLine(item.title ?? '') || (item.title ?? '').replace(/<[^>]+>/g, ' ').trim();
      const categorySlug = this.detectCategorySlug(titlePlain || (item.title ?? ''), source.name);
      if (!categorySlug) continue;
      if (options?.remainingByCategory && options.remainingByCategory[categorySlug] <= 0) continue;

      const rawBody = this.pickRssBody(item);
      const langForEnrichFetch = resolveArticleLanguage(feedLangHint, {
        title: titlePlain,
        body: rawBody,
      });
      const body = await this.enrichBodyFromSourcePage(
        rawBody,
        item.link ?? '',
        langForEnrichFetch,
        titlePlain,
      );
      const articleLang = normalizeLanguageCode(
        resolveArticleLanguage(feedLangHint, { title: titlePlain, body }),
      );
      const hash = crypto.createHash('sha256').update(item.link ?? item.title ?? '').digest('hex');
      const imageUrl = this.extractImage(item);
      const sourceVideoUrl = this.extractVideo(item);

      const isDuplicate = await this.dedup.isDuplicate(hash, body, articleLang);
      if (isDuplicate) continue;

      try {
        const ingestedArticle = await this.prisma.ingestedArticle.create({
          data: {
            sourceId: source.id,
            sourceUrl: item.link ?? '',
            sourceTitle: titlePlain || 'Untitled',
            body,
            publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
            contentHash: hash,
          },
        });

        await this.provenance.record({
          ingestedArticleId: ingestedArticle.id,
          sourceUrl: item.link ?? '',
          sourceTitle: titlePlain || 'Untitled',
          sourceName: source.name,
          fetchedAt: new Date(),
        });

        let publishedOk = false;
        if (this.aiQuotaExhausted) {
          publishedOk = await this.publishRaw(ingestedArticle, source, imageUrl ?? undefined);
        } else {
          try {
            const article = await this.ai.processIngestedArticle(ingestedArticle.id, {
              language: articleLang,
              imageUrl: imageUrl ?? undefined,
              sourceVideoUrl: sourceVideoUrl ?? undefined,
              forceAutoPublish: true,
              allowedCategories: ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'tech'],
            });
            if (article) publishedOk = true;
          } catch (aiErr) {
            if (this.isGeminiQuotaError(aiErr)) {
              this.aiQuotaExhausted = true;
              this.logger.warn(
                'Gemini quota exhausted — raw RSS/source publish for remaining items this run',
              );
            }
            this.logger.warn(
              `AI failed for ${titlePlain.slice(0, 50)}: ${(aiErr as Error).message?.slice(0, 160)} — publishing raw RSS/source text`,
            );
            publishedOk = await this.publishRaw(ingestedArticle, source, imageUrl ?? undefined);
            if (!publishedOk) {
              this.logger.warn(`Raw publish failed after AI error: ${titlePlain.slice(0, 50)}`);
            }
          }
        }
        if (!publishedOk) continue;
        if (options?.remainingByCategory) {
          options.remainingByCategory[categorySlug]--;
        }
        ingested++;
        const cap = options?.maxItemsPerSource ?? this.maxItemsPerSource;
        if (ingested >= cap) break;
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

  private isGeminiQuotaError(err: unknown): boolean {
    const m = (err as Error)?.message ?? String(err);
    return /429|quota exceeded|too many requests/i.test(m);
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

  private decodeHtmlEntities(s: string): string {
    let out = s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&pound;/gi, '£')
      .replace(/&euro;/gi, '€')
      .replace(/&copy;/gi, '©');
    out = out.replace(/&#(\d+);/g, (_, dec) => {
      const n = Number.parseInt(dec, 10);
      if (Number.isNaN(n)) return _;
      try {
        return String.fromCodePoint(n);
      } catch {
        return _;
      }
    });
    out = out.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = Number.parseInt(hex, 16);
      if (Number.isNaN(n)) return _;
      try {
        return String.fromCodePoint(n);
      } catch {
        return _;
      }
    });
    return out;
  }

  /** Strip tags; optional multiline (paragraph breaks) vs single line (headlines). */
  private stripHtmlToPlain(htmlOrText: string, multiline: boolean): string {
    let t = htmlOrText ?? '';
    if (multiline) {
      t = t.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');
    } else {
      t = t.replace(/<\/p>\s*<p[^>]*>/gi, ' ').replace(/<br\s*\/?>/gi, ' ');
    }
    t = t.replace(/<[^>]+>/g, multiline ? '' : ' ');
    if (multiline) {
      t = t.replace(/\n{3,}/g, '\n\n').trim();
    } else {
      t = t.replace(/\s+/g, ' ').trim();
    }
    return this.decodeHtmlEntities(t);
  }

  /** RSS title / one-line teaser: no HTML, decoded entities. */
  private rssPlainLine(htmlOrText: string): string {
    return this.stripHtmlToPlain(htmlOrText, false);
  }

  /**
   * First non-empty RSS field. Empty string `content` must not block fallback to `title`
   * (many feeds ship HTML links only in the title).
   */
  private pickRssBody(item: {
    content?: string;
    contentSnippet?: string;
    summary?: string;
    title?: string;
  }): string {
    for (const v of [item.content, item.contentSnippet, item.summary, item.title]) {
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return '';
  }

  /** Strip HTML and map long RSS text into TipTap paragraph nodes (no 2k hard cap). */
  private rawHtmlToDocContent(htmlOrText: string, maxTotalChars = 80000) {
    const text = stripSyndicationLinkbacks(
      stripPublisherFeedBoilerplate(
        this.stripHtmlToPlain(htmlOrText, true).slice(0, maxTotalChars),
        '',
      ),
    );
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
    ingestedArticle: {
      id: string;
      sourceUrl: string;
      sourceTitle: string;
      body: string;
      publishedAt: Date | null;
    },
    source: { name: string; language?: string | null },
    imageUrl?: string,
  ): Promise<boolean> {
    const adminUser =
      (await this.prisma.user.findFirst({ where: { role: 'ADMIN' } }))
      ?? (await this.prisma.user.findFirst({ where: { role: 'AI_BOT' } }));
    if (!adminUser) {
      this.logger.error('publishRaw: no ADMIN or AI_BOT user — run prisma db seed on the server');
      return false;
    }

    const displayTitle = stripWireHeadlinePrefix(
      stripSyndicationLinkbacks(
        this.rssPlainLine(ingestedArticle.sourceTitle) ||
          ingestedArticle.sourceTitle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      ),
    );
    const slug = await resolveUniqueArticleSlug(
      async (base) => Boolean(
        await this.prisma.article.findFirst({ where: { slug: { startsWith: base } } }),
      ),
      displayTitle,
      ingestedArticle.id,
    );

    let rawBodyForArticle = ingestedArticle.body;
    let plainLead = this.stripHtmlToPlain(rawBodyForArticle, true).trim();
    const feedPlaceholder = /\(No body text in feed item\.\)/i.test(plainLead);
    const langHint = resolveSourceFeedLanguage(source);
    const langForRawFetch = resolveArticleLanguage(langHint, {
      title: displayTitle,
      body: rawBodyForArticle,
    });
    const needSourceFetch =
      this.fetchSourceArticle &&
      !!ingestedArticle.sourceUrl &&
      isAllowedArticleFetchUrl(ingestedArticle.sourceUrl) &&
      (plainLead.length < 400 ||
        feedPlaceholder ||
        rssBodyLooksLikeTitleOnly(plainLead, displayTitle));
    if (needSourceFetch) {
      try {
        const fetched = await fetchArticlePlainText(
          ingestedArticle.sourceUrl,
          { timeoutMs: this.fetchSourceTimeoutMs, maxBytes: this.fetchSourceMaxBytes },
          { acceptLanguage: acceptLanguageHeaderForLocale(langForRawFetch) },
        );
        if (fetched && fetched.length >= MIN_SOURCE_ARTICLE_PLAIN_CHARS) {
          plainLead = fetched;
          rawBodyForArticle = fetched;
          this.logger.log(`publishRaw: using source page body (${fetched.length}c) for ${displayTitle.slice(0, 48)}`);
        }
      } catch (e) {
        this.logger.warn(`publishRaw source fetch failed: ${(e as Error).message}`);
      }
    }

    const lang = normalizeLanguageCode(langHint);

    plainLead = stripPublisherFeedBoilerplate(plainLead, displayTitle);
    rawBodyForArticle = stripPublisherFeedBoilerplate(rawBodyForArticle, displayTitle);
    plainLead = stripSyndicationLinkbacks(plainLead);
    rawBodyForArticle = stripSyndicationLinkbacks(rawBodyForArticle);

    const readerSummary = buildReaderSummaryFromPlainText(rawBodyForArticle || plainLead, displayTitle);
    const { bodyShort, bodyMedium, paragraphs } = splitStoryBodies(rawBodyForArticle || plainLead, displayTitle);
    const excerpt = readerSummary || bodyShort.slice(0, 1200) || displayTitle;
    // Map source name to category
    const category =
      (await this.detectCategory(displayTitle, source.name))
      ?? (await this.prisma.category.findFirst({ where: { slug: 'india' } }));
    if (!category) return false;

    const article = await this.prisma.article.create({
      data: {
        title: displayTitle,
        slug,
        bodyShort: bodyShort || undefined,
        bodyMedium: bodyMedium || undefined,
        body: {
          type: 'doc',
          ...(imageUrl && { imageUrl, imageCredit: 'Story image' }),
          aiVideo: {
            title: displayTitle,
            summary: readerSummary || '',
            language: lang,
            status: 'ready_for_tts_video_generation',
          },
          content:
            paragraphs.length > 0
              ? paragraphs.map((text) => ({
                  type: 'paragraph' as const,
                  content: [{ type: 'text' as const, text }],
                }))
              : this.rawHtmlToDocContent(rawBodyForArticle),
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

    if (ingestedArticle.sourceUrl) {
      await this.provenance
        .record({
          articleId: article.id,
          sourceUrl: ingestedArticle.sourceUrl,
          sourceTitle: displayTitle,
          sourceName: source.name,
          fetchedAt: new Date(),
          attributionNote: 'Ingested via RSS; internal record only.',
        })
        .catch((err) =>
          this.logger.warn(`Provenance for raw article ${article.id}: ${(err as Error).message}`),
        );
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

  private detectCategorySlug(title: string, sourceName = ''): CategorySlug | null {
    const t = `${title} ${sourceName}`.toLowerCase();
    const src = sourceName.toLowerCase();
    // Sports — covers English + all major Indian script keywords
    if (t.match(/sport|cricket|football|ipl|tennis|olympics|hockey|kabaddi|badminton|boxing|wrestling|ম্যাচ|ক্রিকেট|ਖੇਡ|ફૂટબોલ|मैच|क्रिकेट|ఫుట్‌బాల్|క్రికెట್|ಫುಟ್ಬಾಲ್|ಕ್ರೀಡೆ/)) return 'sports';
    // Tech
    if (t.match(/tech|ai|digital|startup|cyber|software|app|तकनीक|प्रौद्योगिकी|టెక్|ಸാങ്കേതിക/)) return 'tech';
    // Business
    if (t.match(/business|economy|market|stock|sensex|gdp|rupee|trade|বাজার|ਵਪਾਰ|બિઝનેસ|बाजार|अर्थव्यवस्था|शेयर|వ్యాపార|ಮಾರುಕಟ್ಟೆ/)) return 'business';
    // Politics / governance / public affairs
    if (t.match(/politics|election|parliament|minister|cm |pm |governor|bjp|congress|রাজনীতি|ਚੋਣ|રાજકારણ|सरकार|चुनाव|संसद|मंत्री|ರಾಜಕೀಯ|चालू घडामोडी|current affairs/)) return 'politics';
    // Entertainment
    if (t.match(/film|cinema|bollywood|celebrity|entertainment|award|movie|actor|actress|फिल्म|मनोरंजन|సినిమా|ಮನರಂಜನೆ/)) return 'entertainment';
    // World + current affairs + conflict
    if (t.match(/world|us |usa|uk |china|europe|russia|pakistan|international|global|breaking|war|ceasefire|diplomacy|geopolitics|বিশ্ব|ਵਿਸ਼ਵ|વિશ્વ|विदेश|दुनिया|अंतरराष्ट्रीय|ವಿಶ್ವ|ప్రపంచం|العالم|monde|mundo/)) return 'world';
    if (
      /anandabazar|eisamay|ei samay|abp ananda|sangbad pratidin|prothom alo/i.test(src)            // Bengali
      || /dinamalar|dinamani|one india tamil|vikatan/i.test(src)                                   // Tamil
      || /jagbani|punjab kesari|punjabi tribune/i.test(src)                                        // Punjabi
      || /news18 urdu|jang|geo urdu/i.test(src)                                                    // Urdu
      || /divya bhaskar|gujarat samachar|sandesh/i.test(src)                                       // Gujarati
      || /eenadu|sakshi|news18 telugu/i.test(src)                                                  // Telugu
      || /prajavani|vijaykarnataka|tv9/i.test(src)                                                 // Kannada
      || /lokmat|sakal|maharashtra times|ajit/i.test(src)                                          // Marathi
      || /amarujala|jagran|patrika|navbharat|zeenews|abp live|ndtvkhabar|indiatoday/i.test(src)    // Hindi
    ) {
      if (!t.match(/world|international|foreign|washington|beijing|moscow|ukraine|gaza|israel|united nations|संयुक्त राष्ट्र/)) return 'india';
    }
    return 'world';
  }

  /**
   * Trusted regional feeds first; each source gets its own per-run quotas so early English feeds
   * cannot exhaust budgets and block Bengali / Gujarati / Punjabi / Urdu publishers.
   */
  private sortSourcesForIngestion(sources: IngestedSourceRow[]): IngestedSourceRow[] {
    const langRank = (code: string | null | undefined): number => {
      const c = (code || 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
      const tier0 = new Set(['bn', 'gu', 'pa', 'ur', 'ml', 'ta', 'te', 'kn', 'hi', 'mr']);
      if (tier0.has(c)) return 0;
      if (c !== 'en') return 1;
      return 2;
    };
    return [...sources].sort((a, b) => {
      if (a.isTrusted !== b.isTrusted) return a.isTrusted ? -1 : 1;
      const lr = langRank(a.language) - langRank(b.language);
      if (lr !== 0) return lr;
      return (a.name || '').localeCompare(b.name || '', 'en');
    });
  }

  private async detectCategory(title: string, sourceName = ''): Promise<{ id: string } | null> {
    const slug = this.detectCategorySlug(title, sourceName);
    if (!slug) return null;
    return this.prisma.category.findFirst({ where: { slug }, select: { id: true } });
  }
}
