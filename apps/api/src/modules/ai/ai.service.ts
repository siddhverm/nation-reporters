import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiClient } from './gemini.client';
import {
  fetchArticleOgImage,
  fetchArticlePlainText,
  MIN_SOURCE_ARTICLE_PLAIN_CHARS,
  rssBodyLooksLikeTitleOnly,
} from './source-article-text.util';
import {
  acceptLanguageHeaderForLocale,
  normalizeLanguageCode,
  resolveArticleLanguage,
} from './language-resolution.util';
import { rewritePrompt } from './prompts/rewrite.prompt';
import { tagPrompt } from './prompts/tag.prompt';
import { captionsPrompt } from './prompts/captions.prompt';
import { seoPrompt } from './prompts/seo.prompt';
import { riskPrompt } from './prompts/risk.prompt';
import { translatePrompt } from './prompts/translate.prompt';
import { Platform } from '@prisma/client';
import { PublishingService } from '../publishing/publishing.service';
import { stripSyndicationLinkbacks, stripWireHeadlinePrefix } from '../../common/editorial-sanitize';
import { stripPublisherFeedBoilerplate } from '../../common/reader-summary.util';
import {
  isWeakStoryImageUrl,
  normalizeImageUrl,
  persistArticleImage,
  s3ConfigFromEnv,
} from '../../common/mirror-external-image.util';

type ProcessIngestedOptions = {
  language?: string;
  imageUrl?: string;
  sourceVideoUrl?: string;
  forceAutoPublish?: boolean;
  allowedCategories?: string[];
};

const PUBLISH_CATEGORY_SLUGS = [
  'india',
  'world',
  'politics',
  'business',
  'sports',
  'entertainment',
  'tech',
] as const;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private readonly fetchSourceArticle: boolean;
  private readonly fetchSourceTimeoutMs: number;
  private readonly fetchSourceMaxBytes: number;

  constructor(
    private readonly gemini: GeminiClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => PublishingService))
    private readonly publishing: PublishingService,
  ) {
    const flag = (this.config.get<string>('FETCH_SOURCE_ARTICLE') ?? '').toLowerCase();
    this.fetchSourceArticle = !['0', 'false', 'no', 'off'].includes(flag);
    this.fetchSourceTimeoutMs = Number(this.config.get('FETCH_SOURCE_TIMEOUT_MS') ?? 15_000);
    this.fetchSourceMaxBytes = Number(this.config.get('FETCH_SOURCE_MAX_BYTES') ?? 1_000_000);
  }

  async processIngestedArticle(ingestedArticleId: string, options: ProcessIngestedOptions = {}) {
    const ingested = await this.prisma.ingestedArticle.findUniqueOrThrow({
      where: { id: ingestedArticleId },
      include: { source: { select: { name: true } } },
    });
    const feedLangHint = normalizeLanguageCode(options.language ?? 'en');
    const langForFetch = resolveArticleLanguage(feedLangHint, {
      title: ingested.sourceTitle,
      body: ingested.body,
    });
    const publisherSanitize = {
      sourceName: ingested.source?.name ?? null,
      sourceUrl: ingested.sourceUrl ?? null,
    };

    await this.prisma.ingestedArticle.update({
      where: { id: ingestedArticleId },
      data: { status: 'PROCESSING' },
    });

    try {
      const rssPlain = this.stripIngestedToPlain(ingested.body);
      let bodyForRewrite = rssPlain;
      const titlePlain = this.stripIngestedToPlain(ingested.sourceTitle).split('\n')[0].trim();
      const looksTitleOnly = rssBodyLooksLikeTitleOnly(rssPlain, titlePlain);
      /** Ingestion may already have merged source-page HTML — still re-fetch if body is only the headline. */
      // Only skip source-page re-fetch when ingestion already captured a substantive full article.
      const skipFetchBecauseIngestionEnriched = rssPlain.length >= 3000 && !looksTitleOnly;
      if (this.fetchSourceArticle && ingested.sourceUrl && !skipFetchBecauseIngestionEnriched) {
        const fetched = await fetchArticlePlainText(
          ingested.sourceUrl,
          {
            timeoutMs: this.fetchSourceTimeoutMs,
            maxBytes: this.fetchSourceMaxBytes,
          },
          { acceptLanguage: acceptLanguageHeaderForLocale(langForFetch) },
        );
        const rssIsThin = rssPlain.length < 700;
        if (fetched && fetched.length >= MIN_SOURCE_ARTICLE_PLAIN_CHARS) {
          const materiallyLonger = fetched.length > rssPlain.length + 40;
          const muchLongerThanHeadline = fetched.length > titlePlain.length + 120;
          if (materiallyLonger || rssIsThin || looksTitleOnly || muchLongerThanHeadline) {
            bodyForRewrite = fetched;
            this.logger.log(
              `AI input: using fetched article (${fetched.length}c) vs RSS (${rssPlain.length}c) titleOnly=${looksTitleOnly} url=${ingested.sourceUrl.slice(0, 72)}`,
            );
          }
        }
      }

      bodyForRewrite = stripPublisherFeedBoilerplate(
        stripSyndicationLinkbacks(bodyForRewrite),
        titlePlain || ingested.sourceTitle,
        publisherSanitize,
      );

      // Always publish under the feed's language — never let AI or script detection override.
      const language = feedLangHint;

      // 1. Rewrite (short / medium / long + multilingual reader summary)
      const { data: rewriteRaw, tokensUsed: rwTokens } = await this.gemini.generateJson<{
        title: string; short: string; medium: string; long: string;
        summary: string; podcastScript: string; language: string;
      }>(rewritePrompt(titlePlain || ingested.sourceTitle, bodyForRewrite, language));

      const headlineForStrip = titlePlain || ingested.sourceTitle;
      const stripRewritten = (t: string) =>
        stripPublisherFeedBoilerplate(stripSyndicationLinkbacks(t), headlineForStrip, publisherSanitize);
      const rewrite = {
        ...rewriteRaw,
        title: stripWireHeadlinePrefix(stripRewritten(rewriteRaw.title)),
        short: stripRewritten(rewriteRaw.short),
        medium: stripRewritten(rewriteRaw.medium),
        long: stripRewritten(rewriteRaw.long),
        summary: stripRewritten(rewriteRaw.summary),
        podcastScript: stripRewritten(rewriteRaw.podcastScript),
        language: rewriteRaw.language,
      };

      const readerSummary = stripPublisherFeedBoilerplate(
        this.ensureReaderSummary(
          rewrite.summary,
          rewrite.short,
          rewrite.medium,
          rewrite.long,
          bodyForRewrite.length,
          language,
          rewrite.title,
        ),
        rewrite.title,
        publisherSanitize,
      );
      const longForPrompts = this.clipForPrompt(rewrite.long, 24_000);

      // 2. Tag
      const { data: tags } = await this.gemini.generateJson<{
        category: string; region: string; tags: string[];
        entities: object; isBreaking: boolean;
      }>(tagPrompt(rewrite.title, longForPrompts));

      const categorySlug = this.normalizeCategorySlug(tags.category);
      const categoryRef = await this.prisma.category.findFirst({
        where: { slug: categorySlug },
        select: { id: true },
      });

      // 3. SEO
      const { data: seoRaw } = await this.gemini.generateJson<{
        seoTitle: string; seoDescription: string; slug: string; hashtags: string[];
      }>(seoPrompt(rewrite.title, longForPrompts, language));
      const seoDescription =
        (seoRaw.seoDescription ?? '').trim().length >= 40
          ? seoRaw.seoDescription
          : this.clipExcerpt(readerSummary, 155) ?? seoRaw.seoDescription;
      const seo = { ...seoRaw, seoDescription: seoDescription ?? seoRaw.seoDescription };

      // 4. Captions (fallback so publishing still works if this call fails)
      let captions: Record<string, string>;
      try {
        const { data } = await this.gemini.generateJson<Record<string, string>>(
          captionsPrompt(rewrite.title, readerSummary, language),
        );
        captions = data;
      } catch (capErr) {
        this.logger.warn(`Caption generation failed, using fallbacks: ${(capErr as Error).message}`);
        captions = this.buildFallbackSocialCaptions(rewrite.title, readerSummary);
      }

      // 5. Risk
      const { data: risk } = await this.gemini.generateJson<{
        score: number; confidence: number; flags: string[]; reasoning: string;
      }>(riskPrompt(rewrite.title, longForPrompts));

      const aiRewrite = await this.prisma.aiRewrite.create({
        data: {
          ingestedArticleId,
          originalTitle: ingested.sourceTitle,
          rewrittenTitle: rewrite.title,
          originalBody: ingested.body,
          rewrittenBodyShort: rewrite.short,
          rewrittenBodyMedium: rewrite.medium,
          rewrittenBodyLong: rewrite.long,
          summary: readerSummary,
          podcastScript: rewrite.podcastScript,
          language,
          tags: tags.tags,
          category: categorySlug,
          region: tags.region,
          seoTitle: seo.seoTitle,
          seoDescription: seo.seoDescription,
          hashtags: seo.hashtags,
          model: 'gemini-1.5-flash',
          tokensUsed: rwTokens,
        },
      });

      // Determine auto-approve from risk rules
      const policyAutoApprove = await this.checkAutoApprove(
        risk.score, risk.confidence, categorySlug,
      );
      const autoApprove = options.forceAutoPublish ? true : policyAutoApprove;

      if (
        options.allowedCategories?.length &&
        !options.allowedCategories.includes(categorySlug)
      ) {
        await this.prisma.ingestedArticle.update({
          where: { id: ingestedArticleId },
          data: { status: 'SKIPPED' },
        });
        return null;
      }

      const enrichedLong = this.buildEnrichedLongBody(
        rewrite.long,
        rewrite.medium,
        rewrite.short,
        readerSummary,
      );

      const longParagraphs = enrichedLong
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      const docContent =
        longParagraphs.length > 0
          ? longParagraphs.map((text) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }))
          : [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: enrichedLong }] }];

      // Create article from AI rewrite
      const article = await this.prisma.article.create({
        data: {
          title: rewrite.title,
          slug: `${seo.slug}-${Date.now()}`,
          bodyShort: rewrite.short,
          bodyMedium: rewrite.medium,
          excerpt: this.clipExcerpt(readerSummary, 1200),
          language,
          categoryId: categoryRef?.id ?? null,
          seoTitle: seo.seoTitle,
          seoDescription: seo.seoDescription,
          seoSlug: seo.slug,
          hashtags: seo.hashtags,
          podcastScript: rewrite.podcastScript,
          ingestedArticleId,
          authorId: await this.getAiBotId(),
          status: autoApprove ? 'APPROVED' : 'PENDING_REVIEW',
          riskScore: risk.score,
          riskFlags: risk.flags,
          body: {
            type: 'doc',
            content: docContent,
            aiVideo: {
              title: rewrite.title,
              narration: rewrite.podcastScript,
              summary: readerSummary,
              language,
              status: options.sourceVideoUrl ? 'ready_with_source_video' : 'ready_for_tts_video_generation',
            },
          },
        },
      });

      let storyImageUrl = options.imageUrl ?? null;
      if (
        (!storyImageUrl || isWeakStoryImageUrl(storyImageUrl)) &&
        this.fetchSourceArticle &&
        ingested.sourceUrl
      ) {
        try {
          const og = await fetchArticleOgImage(
            ingested.sourceUrl,
            {
              timeoutMs: Math.min(this.fetchSourceTimeoutMs, 12_000),
              maxBytes: 400_000,
            },
            { acceptLanguage: acceptLanguageHeaderForLocale(langForFetch) },
          );
          const ogNorm = normalizeImageUrl(og, ingested.sourceUrl);
          if (ogNorm && !isWeakStoryImageUrl(ogNorm)) {
            storyImageUrl = ogNorm;
          } else if (!storyImageUrl && ogNorm) {
            storyImageUrl = ogNorm;
          }
        } catch {
          /* keep RSS image */
        }
      }

      if (storyImageUrl) {
        const storedUrl = await persistArticleImage(
          this.prisma,
          s3ConfigFromEnv((k) => this.config.get(k)),
          article.id,
          storyImageUrl,
          ingested.sourceUrl,
        );
        if (storedUrl) {
          await this.prisma.article.update({
            where: { id: article.id },
            data: {
              body: {
                ...(article.body as object),
                imageUrl: storedUrl,
                imageCredit: 'Story image',
              },
            },
          });
        }
      }

      if (options.sourceVideoUrl) {
        await this.prisma.mediaAsset.create({
          data: {
            articleId: article.id,
            type: 'VIDEO',
            url: options.sourceVideoUrl,
            s3Key: `external/${article.id}/source-video`,
            mimeType: 'video/mp4',
            sizeBytes: 0,
            scanStatus: 'external',
          },
        });
      }

      // Save risk assessment
      await this.prisma.riskAssessment.create({
        data: {
          articleId: article.id,
          score: risk.score,
          flags: risk.flags,
          reasoning: risk.reasoning,
          confidence: risk.confidence,
          autoApprove,
        },
      });

      // Save social captions
      const platformMap: Record<string, Platform> = {
        twitter: Platform.TWITTER,
        facebook: Platform.FACEBOOK,
        instagram: Platform.INSTAGRAM,
        linkedin: Platform.LINKEDIN,
        whatsapp: Platform.WHATSAPP,
        telegram: Platform.TELEGRAM,
      };

      for (const [platform, caption] of Object.entries(captions)) {
        const p = platformMap[platform];
        if (p && typeof caption === 'string' && caption.trim().length > 0) {
          await this.prisma.socialCaption.create({
            data: { articleId: article.id, platform: p, caption: caption.trim(), hashtags: seo.hashtags },
          });
        }
      }

      await this.prisma.ingestedArticle.update({
        where: { id: ingestedArticleId },
        data: { status: 'REWRITTEN', articleId: article.id },
      });

      // Auto-publish: ingestion must leave articles PUBLISHED before returning (UI filters on status).
      if (autoApprove) {
        if (options.forceAutoPublish) {
          try {
            await this.publishing.publishArticle(article.id);
          } catch (err) {
            this.logger.error(`Auto-publish failed for ${article.id}`, err);
            await this.prisma.article.update({
              where: { id: article.id },
              data: { status: 'PUBLISHED', publishedAt: new Date() },
            });
          }
        } else {
          this.publishing.publishArticle(article.id).catch((err) =>
            this.logger.error(`Auto-publish failed for ${article.id}`, err),
          );
        }
      }

      return article;
    } catch (err) {
      this.logger.error(`AI processing failed for ${ingestedArticleId}`, err);
      await this.prisma.ingestedArticle.update({
        where: { id: ingestedArticleId },
        data: { status: 'SKIPPED' },
      });
      throw err;
    }
  }

  async translate(text: string, fromLang: string, toLang: string) {
    const { text: translated } = await this.gemini.generate(
      translatePrompt(text, fromLang, toLang),
    );
    return translated;
  }

  async regenerateCaptions(articleId: string) {
    const article = await this.prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    const teaser = (article.excerpt ?? article.bodyShort ?? article.title).trim();
    const { data: captions } = await this.gemini.generateJson<Record<string, string>>(
      captionsPrompt(article.title, teaser, article.language ?? 'en'),
    );
    return captions;
  }

  async getRisk(articleId: string) {
    return this.prisma.riskAssessment.findUnique({ where: { articleId } });
  }

  private normalizeCategorySlug(value: string | undefined): string {
    const v = (value ?? 'world').toLowerCase().trim().replace(/\s+/g, '');
    const allowed = PUBLISH_CATEGORY_SLUGS as readonly string[];
    if (allowed.includes(v)) return v;
    const map: Record<string, string> = {
      health: 'tech',
      science: 'tech',
      crime: 'world',
      environment: 'world',
      lifestyle: 'entertainment',
      culture: 'entertainment',
    };
    const mapped = map[v];
    if (mapped && allowed.includes(mapped)) return mapped;
    return 'world';
  }

  /**
   * Public teaser: never a one-line hook if we have ~short/~medium copy.
   * Models often return a single metaphor; extend from story body until ~200+ chars / 2+ sentences.
   */
  private ensureReaderSummary(
    summary: string | undefined,
    shortBody: string | undefined,
    mediumBody?: string | undefined,
    longBody?: string | undefined,
    sourceBodyLength?: number,
    targetLang = 'en',
    headline?: string,
  ): string {
    const MIN_CHARS = this.targetSummaryChars(sourceBodyLength, longBody, mediumBody, shortBody);
    const HARD_MAX = Math.min(1400, Math.max(520, Math.floor(MIN_CHARS * 2.2)));
    let s = this.stripLeadingLatinLabel(summary, targetLang);
    s = this.trimTrailingSummaryEllipsis(s);
    const short = (shortBody ?? '').trim();
    const medium = (mediumBody ?? '').trim();
    const long = (longBody ?? '').trim();
    const head = (headline ?? '').trim();

    const splitSentences = (t: string): string[] =>
      t
        .split(/(?<=[.!?।])\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

    const roughSentenceCount = (text: string): number => Math.max(1, splitSentences(text).length);

    const substantiveEnough = (text: string): boolean => {
      if (this.summaryLooksTeaserIncomplete(text)) return false;
      if (head && this.isSummaryEchoOfHeadline(text, head)) return false;
      const needTwoSentences = MIN_CHARS >= 260 || text.length < 360;
      if (needTwoSentences && roughSentenceCount(text) < 2 && text.length < MIN_CHARS + 40) return false;
      return text.length >= MIN_CHARS || (text.length >= 130 && roughSentenceCount(text) >= 2);
    };

    if (substantiveEnough(s)) return s.slice(0, HARD_MAX).trim();

    let padded = this.padTeaserFromArticleBodies(s, short, medium, long, MIN_CHARS, head);
    let out = padded.slice(0, HARD_MAX).trim();
    out = this.stripLeadingLatinLabel(out, targetLang);
    out = this.trimTrailingSummaryEllipsis(out);
    if (
      (this.summaryLooksTeaserIncomplete(out) || (head && this.isSummaryEchoOfHeadline(out, head))) &&
      (short || medium || long)
    ) {
      out = this.padTeaserFromArticleBodies(out, short, medium, long, MIN_CHARS, head).slice(0, HARD_MAX).trim();
      out = this.stripLeadingLatinLabel(out, targetLang);
      out = this.trimTrailingSummaryEllipsis(out);
    }
    return out;
  }

  private normalizeEchoKey(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();
  }

  /** Model often returns the summary as a near-copy of the headline — treat as too thin to publish. */
  private isSummaryEchoOfHeadline(summary: string, headline: string): boolean {
    const s = summary.trim();
    const h = headline.trim();
    if (!s || !h) return false;
    const ns = this.normalizeEchoKey(s);
    const nh = this.normalizeEchoKey(h);
    if (ns === nh) return true;
    if (s.length <= h.length + 55 && (ns.startsWith(nh) || nh.startsWith(ns))) return true;
    const hw = nh.split(/\s+/).filter((w) => w.length > 2);
    if (hw.length === 0) return false;
    const sw = new Set(ns.split(/\s+/).filter((w) => w.length > 2));
    let hit = 0;
    for (const w of hw) if (sw.has(w)) hit++;
    if (hit / hw.length >= 0.88 && s.length < Math.max(320, h.length + 120)) return true;
    return false;
  }

  /**
   * Models sometimes emit "Exclusive: …" / "Interview: …" in English before native script.
   * Strip that label when the server target is not Latin-primary.
   */
  private stripLeadingLatinLabel(summary: string | undefined, targetLang: string): string {
    const code = (targetLang || 'en').toLowerCase();
    const latinPrimary = new Set(['en', 'fr', 'de', 'es', 'pt', 'sw', 'tr', 'id', 'ms']);
    if (latinPrimary.has(code)) return (summary ?? '').trim();

    let s = (summary ?? '').trim();
    const colon = s.indexOf(':');
    if (colon < 3 || colon > 120) return s;
    const head = s.slice(0, colon);
    const tail = s.slice(colon + 1).trim();
    if (!tail) return s;
    if (!/^[A-Za-z0-9][A-Za-z0-9\s,''"()\-]{1,118}$/.test(head)) return s;
    if (!/[^\x00-\x7F\u200C\u200D]/.test(tail)) return s;
    return tail;
  }

  private trimTrailingSummaryEllipsis(text: string): string {
    return text
      .replace(/[…⋯]+[\s]*$/u, '')
      .replace(/\.{2,}[\s]*$/u, '')
      .trim();
  }

  /** Ellipsis or missing closing punctuation on a long blurb → treat as incomplete so we pad from bodies. */
  private summaryLooksTeaserIncomplete(text: string): boolean {
    const t = text.trim();
    if (!t) return true;
    const low = t.toLowerCase();
    // Common teaser-style closers that read like an intro, not a complete summary.
    if (
      /आइए जानते हैं|विस्तार से जानें|पूरा पढ़ें|पढ़िए|देखिए|जानिए/.test(t) ||
      /let'?s know|read on|read more|details (inside|below)|stay tuned/.test(low)
    ) {
      return true;
    }
    if (/read\s+more:?\s*https?:\/\//i.test(t) || (/read\s+more/i.test(low) && /https?:\/\//i.test(t))) {
      return true;
    }
    if (/[…⋯]\s*$/u.test(t)) return true;
    if (/\.{3,}\s*$/u.test(t)) return true;
    if (t.length >= 90 && !/[.!?।。！？\u0964\u0965]["')\]]?\s*$/u.test(t)) return true;
    return false;
  }

  private targetSummaryChars(
    sourceBodyLength: number | undefined,
    longBody?: string,
    mediumBody?: string,
    shortBody?: string,
  ): number {
    const sourceLen = Math.max(
      sourceBodyLength ?? 0,
      (longBody ?? '').trim().length,
      (mediumBody ?? '').trim().length,
      (shortBody ?? '').trim().length,
    );
    if (sourceLen >= 9000) return 520;
    if (sourceLen >= 5000) return 450;
    if (sourceLen >= 2600) return 360;
    if (sourceLen >= 1200) return 300;
    return 280;
  }

  private splitSentencesForTeaser(t: string): string[] {
    return t
      .split(/(?<=[.!?।])\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  }

  /** Append sentences from short/medium that are not already covered by the thin summary. */
  private padTeaserFromArticleBodies(
    teaser: string,
    shortBody: string,
    mediumBody: string,
    longBody: string,
    minChars: number,
    headline?: string,
  ): string {
    let base = teaser.trim();
    const bodies = [shortBody, mediumBody, longBody].filter((b) => b.trim().length > 0);
    if (bodies.length === 0) return base;

    const head = (headline ?? '').trim();
    let baseLow = base.toLowerCase();

    const appendIfNew = (sent: string): boolean => {
      if (sent.length < 14) return false;
      const prefix = sent.slice(0, Math.min(56, sent.length)).toLowerCase();
      if (baseLow.includes(prefix)) return false;
      base = `${base} ${sent}`.replace(/\s+/g, ' ').trim();
      baseLow = base.toLowerCase();
      return true;
    };

    for (const body of bodies) {
      const blocks = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        for (const sent of this.splitSentencesForTeaser(block)) {
          if (head && this.isSummaryEchoOfHeadline(sent, head) && sent.length < head.length + 100) continue;
          appendIfNew(sent);
          if (base.length >= minChars && this.splitSentencesForTeaser(base).length >= 2) return base;
        }
        if (base.length >= minChars && this.splitSentencesForTeaser(base).length >= 2) return base;
        if (bi >= 1 && block.length > base.length + 100 && base.length < minChars) {
          base = `${base} ${block}`.replace(/\s+/g, ' ').trim().slice(0, 920);
          baseLow = base.toLowerCase();
        }
      }
      if (base.length >= minChars) return base;
      const firstBlock = (body.split(/\n\n+/)[0] ?? body).trim();
      if (!teaser && firstBlock.length > base.length) base = firstBlock.slice(0, 720).trim();
    }

    if (base.length < minChars && shortBody.trim()) {
      const fb = (shortBody.split(/\n\n+/)[0] ?? shortBody).trim();
      if (fb.length > base.length + 80) {
        base = `${base} ${fb}`.replace(/\s+/g, ' ').trim().slice(0, 920);
      }
    }

    if (base.length < 120 && shortBody.trim()) return shortBody.trim().slice(0, 850);
    return base;
  }

  private clipForPrompt(text: string, max: number): string {
    const t = (text ?? '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  }

  private buildFallbackSocialCaptions(title: string, summary: string): Record<string, string> {
    const sum = (summary || title).trim();
    const core = `${title}\n\n${sum}`;
    return {
      twitter: `${title} — ${sum}`.replace(/\s+/g, ' ').trim().slice(0, 270),
      facebook: core.slice(0, 5000),
      instagram: core.slice(0, 2200),
      linkedin: core.slice(0, 3000),
      whatsapp: `${title}. ${sum}`.slice(0, 900),
      telegram: `${title}\n${sum}`.slice(0, 3500),
    };
  }

  private async checkAutoApprove(
    score: number, confidence: number, category: string,
  ): Promise<boolean> {
    const rules = await this.prisma.riskRule.findMany({
      where: { isActive: true, autoApprove: true },
    });

    for (const rule of rules) {
      if (rule.category && rule.category !== category) continue;
      if (score <= rule.maxScore && confidence >= rule.minConfidence) return true;
    }

    // Check global feature flag fallback
    const flag = await this.prisma.featureFlag.findUnique({ where: { key: 'FEATURE_AUTO_APPROVE' } });
    return flag?.enabled ?? false;
  }

  private normalizeParagraphKey(paragraph: string): string {
    return paragraph
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();
  }

  private dedupeParagraphs(paragraphs: string[]): string[] {
    const out: string[] = [];
    const seen: string[] = [];
    for (const paragraph of paragraphs) {
      const current = this.normalizeParagraphKey(paragraph);
      if (!current) continue;
      const alreadySeen = seen.some((s) => s === current || s.includes(current) || current.includes(s));
      if (alreadySeen) continue;
      seen.push(current);
      out.push(paragraph.trim());
    }
    return out;
  }

  private buildEnrichedLongBody(
    longText?: string | null,
    mediumText?: string | null,
    shortText?: string | null,
    summaryText?: string | null,
  ): string {
    const long = (longText ?? '').trim();
    const medium = (mediumText ?? '').trim();
    const short = (shortText ?? '').trim();
    const summary = (summaryText ?? '').trim();

    const preferred = long.length >= 2400 ? [long] : [medium, long, short, summary];
    const paragraphs = preferred
      .flatMap((value) => value.split(/\n\s*\n/))
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const deduped = this.dedupeParagraphs(paragraphs);
    return deduped.join('\n\n').trim();
  }

  private stripIngestedToPlain(htmlOrText: string, maxTotalChars = 80_000): string {
    return htmlOrText
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, maxTotalChars);
  }

  private clipExcerpt(text: string | null | undefined, max = 1200): string | undefined {
    const t = (text ?? '').trim().replace(/\s+/g, ' ');
    if (!t) return undefined;
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const last = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('।'),
    );
    if (last > 200) return cut.slice(0, last + 1).trim();
    return `${cut.trim()}…`;
  }

  private async getAiBotId(): Promise<string> {
    let bot = await this.prisma.user.findFirst({ where: { role: 'AI_BOT' } });
    if (!bot) {
      const bcrypt = await import('bcryptjs');
      bot = await this.prisma.user.create({
        data: {
          name: 'AI Bot',
          email: 'aibot@nationreporters.com',
          passwordHash: await bcrypt.hash(Math.random().toString(36), 12),
          role: 'AI_BOT',
        },
      });
    }
    return bot.id;
  }
}
