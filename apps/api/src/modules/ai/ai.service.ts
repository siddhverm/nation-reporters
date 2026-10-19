import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiClient } from './gemini.client';
import { scrubSourceMentionsInTitle } from '../../common/source-scrub.util';
import { titleTooShort } from './rewrite-quality.util';
import { classifyAiError, shortReason, type AiErrorKind } from '../../common/gemini-models.util';
import {
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
import { assessRewrite, limitsFromEnv, normalizeKeyPoints, type QualityLimits, type RewriteAssessment, type RewriteDraft } from './rewrite-quality.util';
import { parseReadingLevel, type ReadingLevel } from '../../common/reading-level';
import { tagPrompt } from './prompts/tag.prompt';
import { captionsPrompt } from './prompts/captions.prompt';
import { seoPrompt } from './prompts/seo.prompt';
import { riskPrompt } from './prompts/risk.prompt';
import { translatePrompt } from './prompts/translate.prompt';
import { Platform } from '@prisma/client';
import { PublishingService } from '../publishing/publishing.service';
import { stripSyndicationLinkbacks, stripWireHeadlinePrefix } from '../../common/editorial-sanitize';
import {
  sanitizeHashtags,
  scrubSourceLabels,
  stripPublisherFeedBoilerplate,
  stripSourceFromSlug,
} from '../../common/reader-summary.util';
import { StoryImageService } from './story-image.service';
import { containsSourceMention, filterSourceHashtags, scrubSourceMentions, sourceNameVariants } from '../../common/source-scrub.util';
import { assessStoryBody, stripPageBoilerplate } from '../../common/page-boilerplate.util';

type ProcessIngestedOptions = {
  language?: string;
  /** Source item image (RSS media). Used only when IMAGE_MODE=source_first: mirrored into our storage, never stored or exposed as-is. */
  imageUrl?: string;
  sourceVideoUrl?: string;
  forceAutoPublish?: boolean;
  allowedCategories?: string[];
};

/** The model kept copying the source (or returned nothing usable) — the caller must NOT publish source text. */
export class RewriteRejectedError extends Error {
  constructor(
    message: string,
    public readonly assessment: RewriteAssessment | null,
  ) {
    super(message);
    this.name = 'RewriteRejectedError';
  }
}

type RewriteResult = {
  title: string; summary: string; keyPoints: string[]; short: string; medium: string; long: string;
  podcastScript: string; language: string;
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
  private readonly readingLevel: ReadingLevel;
  private readonly maxLongWords: number;
  private readonly maxRewriteAttempts: number;
  private readonly qualityLimits: QualityLimits;

  constructor(
    private readonly gemini: GeminiClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storyImages: StoryImageService,
    @Inject(forwardRef(() => PublishingService))
    private readonly publishing: PublishingService,
  ) {
    const flag = (this.config.get<string>('FETCH_SOURCE_ARTICLE') ?? '').toLowerCase();
    this.fetchSourceArticle = !['0', 'false', 'no', 'off'].includes(flag);
    this.fetchSourceTimeoutMs = Number(this.config.get('FETCH_SOURCE_TIMEOUT_MS') ?? 15_000);
    this.fetchSourceMaxBytes = Number(this.config.get('FETCH_SOURCE_MAX_BYTES') ?? 1_000_000);
    this.readingLevel = parseReadingLevel(this.config.get<string>('READING_LEVEL'));
    this.maxLongWords = Number(this.config.get('REWRITE_MAX_LONG_WORDS') ?? 700) || 700;
    this.maxRewriteAttempts = Math.min(4, Math.max(1, Number(this.config.get('REWRITE_MAX_ATTEMPTS') ?? 2) || 2));
    this.qualityLimits = limitsFromEnv((k) => this.config.get<string>(k));
  }

  /**
   * Rewrite with a copy-safety gate: drafts whose phrasing overlaps the source too much (n-gram / verbatim run)
   * or that drop the source's numbers are regenerated with a stricter prompt. If copying persists, throws
   * RewriteRejectedError so the source text is never published.
   */
  async rewriteWithQualityGate(
    title: string,
    body: string,
    language: string,
    publisher: { sourceName?: string | null; sourceUrl?: string | null } = {},
  ): Promise<{ data: RewriteResult; tokensUsed: number; assessment: RewriteAssessment; attempts: number; needsReview: boolean }> {
    // Publisher names for THIS item (plus every registered source) — scrubbed from every output field.
    const publisherNames = sourceNameVariants(publisher.sourceName, publisher.sourceUrl);
    const sc = (t: string) => scrubSourceMentions(t, publisherNames);
    let retryReason: 'too_similar' | 'missing_facts' | 'names_source' | null = null;
    let missingNumbers: string[] = [];
    let tokens = 0;
    let last: { data: RewriteResult; assessment: RewriteAssessment } | null = null;
    // Words of the source bound the body length: a short item must not be padded into a long article.
    const sourceWords = body.split(/\s+/).filter(Boolean).length;
    const maxLongWords = Math.max(150, Math.min(this.maxLongWords, Math.round(sourceWords * 0.9) + 60));

    for (let attempt = 1; attempt <= this.maxRewriteAttempts; attempt++) {
      const { data: raw, tokensUsed } = await this.gemini.generateJson<Partial<RewriteResult> & { keyPoints?: unknown }>(
        rewritePrompt(title, body, language, {
          readingLevel: this.readingLevel,
          maxLongWords,
          retryReason,
          missingNumbers,
        }),
      );
      tokens += tokensUsed;
      const data: RewriteResult = {
        title: sc(String(raw.title ?? '').trim()),
        summary: sc(String(raw.summary ?? '').trim()),
        keyPoints: normalizeKeyPoints(raw.keyPoints).map(sc).filter((k) => k.length >= 8),
        short: sc(String(raw.short ?? '').trim()),
        medium: sc(String(raw.medium ?? '').trim()),
        long: sc(String(raw.long ?? '').trim()),
        podcastScript: sc(String(raw.podcastScript ?? '').trim()),
        language: String(raw.language ?? language),
      };
      const assessment = assessRewrite(data as RewriteDraft, title, body, this.qualityLimits, publisherNames);
      last = { data, assessment };
      if (assessment.ok) {
        return { data, tokensUsed: tokens, assessment, attempts: attempt, needsReview: false };
      }
      this.logger.warn(
        `rewrite attempt ${attempt}/${this.maxRewriteAttempts} rejected: ${assessment.problems.join(',')}` +
          (assessment.worstField ? ` (field=${assessment.worstField} overlap=${assessment.worst?.ratio.toFixed(2)} run=${assessment.worst?.longestRun})` : ''),
      );
      retryReason = assessment.problems.includes('names_source')
        ? 'names_source'
        : assessment.problems.includes('too_similar') ? 'too_similar' : 'missing_facts';
      missingNumbers = assessment.numbers.missing;
    }

    const a = last!.assessment;
    if (a.problems.includes('empty') || a.problems.includes('too_similar') || a.problems.includes('names_source')) {
      throw new RewriteRejectedError(
        `rewrite rejected after ${this.maxRewriteAttempts} attempts: ${a.problems.join(',')}`,
        a,
      );
    }
    // Only facts are missing: original wording is safe, but a human should check it before it goes live.
    return { data: last!.data, tokensUsed: tokens, assessment: a, attempts: this.maxRewriteAttempts, needsReview: true };
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
        stripSyndicationLinkbacks(stripPageBoilerplate(bodyForRewrite)),
        titlePlain || ingested.sourceTitle,
        publisherSanitize,
      );
      // A page that is only menus / "Trending Stories" / comment prompts has no story to rewrite: hold it as DRAFT.
      const inputQuality = assessStoryBody(bodyForRewrite, { minChars: 0, requireSentenceEnd: false });
      if (inputQuality.reasons.includes('empty') || inputQuality.reasons.includes('mostly_boilerplate')) {
        throw new RewriteRejectedError(`source text is page boilerplate (${inputQuality.reasons.join(',')})`, null);
      }

      // Always publish under the feed's language — never let AI or script detection override.
      const language = feedLangHint;

      // 1. Rewrite: simple-language headline, "in brief" summary, key points and full-coverage body,
      //    in original wording (quality gate rejects copied phrasing / lost numbers).
      const {
        data: rewriteRaw, tokensUsed: rwTokens, needsReview: factsNeedReview,
      } = await this.rewriteWithQualityGate(titlePlain || ingested.sourceTitle, bodyForRewrite, language, publisherSanitize);

      const headlineForStrip = titlePlain || ingested.sourceTitle;
      const publisherNames = sourceNameVariants(publisherSanitize.sourceName, publisherSanitize.sourceUrl);
      const stripRewritten = (t: string) =>
        scrubSourceMentions(
          stripPublisherFeedBoilerplate(stripSyndicationLinkbacks(stripPageBoilerplate(t)), headlineForStrip, publisherSanitize),
          publisherNames,
        );
      const rewrite = {
        ...rewriteRaw,
        // A title is NOT body text: never run it through the body boilerplate stripper (it drops any line that looks
        // like the source headline, which emptied titles that stayed close to the original wording).
        title: stripWireHeadlinePrefix(scrubSourceMentionsInTitle(stripSyndicationLinkbacks(rewriteRaw.title), publisherNames)).trim(),
        short: stripRewritten(rewriteRaw.short),
        medium: stripRewritten(rewriteRaw.medium),
        long: stripRewritten(rewriteRaw.long),
        summary: stripRewritten(rewriteRaw.summary),
        podcastScript: stripRewritten(rewriteRaw.podcastScript),
        keyPoints: rewriteRaw.keyPoints
          .map((k) => scrubSourceLabels(stripRewritten(k), publisherSanitize))
          .filter((k) => k.length >= 8),
        language: rewriteRaw.language,
      };

      // Never publish a story that is empty, mostly page boilerplate, or cut off mid-sentence.
      const outQuality = assessStoryBody(rewrite.long, { minChars: 60 });
      if (!outQuality.ok) {
        throw new RewriteRejectedError(`rewritten body not publishable (${outQuality.reasons.join(',')})`, null);
      }
      if (titleTooShort(rewrite.title)) {
        throw new RewriteRejectedError('rewrite produced an empty / too short title', null);
      }

      const readerSummary = this.nonEmptyTeaser(
        stripPublisherFeedBoilerplate(
          this.finalizeInBrief(rewrite.summary, rewrite.short, rewrite.medium, rewrite.long, language, rewrite.title),
          rewrite.title,
          publisherSanitize,
        ),
        [rewrite.summary, rewrite.short, rewrite.medium, rewrite.long],
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
      // AI-written SEO fields can name the outlet (the model sees the source text): scrub them before storing.
      const seo = {
        ...seoRaw,
        seoTitle: ((t) => (titleTooShort(t) ? rewrite.title : t))(scrubSourceMentionsInTitle(scrubSourceLabels(seoRaw.seoTitle ?? '', publisherSanitize) || seoRaw.seoTitle || '', publisherNames)),
        seoDescription: scrubSourceMentions(scrubSourceLabels(seoDescription ?? seoRaw.seoDescription ?? '', publisherSanitize), publisherNames),
        slug: stripSourceFromSlug(seoRaw.slug ?? '', publisherSanitize) || `story-${Date.now().toString(36)}`,
        hashtags: filterSourceHashtags(sanitizeHashtags(seoRaw.hashtags, publisherSanitize), publisherNames),
      };

      // 4. Captions (fallback so publishing still works if this call fails)
      let captions: Record<string, string>;
      try {
        const { data } = await this.gemini.generateJson<Record<string, string>>(
          captionsPrompt(rewrite.title, readerSummary, language),
        );
        captions = Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? scrubSourceMentions(scrubSourceLabels(v, publisherSanitize), publisherNames) : v]),
        ) as Record<string, string>;
      } catch (capErr) {
        this.logger.warn(`Caption generation failed, using fallbacks: ${(capErr as Error).message}`);
        captions = this.buildFallbackSocialCaptions(rewrite.title, readerSummary);
      }

      // Post-check: if ANY reader-facing field still names a publisher, do not store/publish this draft
      // (the caller falls back to the safe held-DRAFT path; the item stays RAW for a later retry).
      const leakFields: Array<[string, string]> = [
        ['title', rewrite.title], ['summary', readerSummary], ['short', rewrite.short], ['medium', rewrite.medium], ['long', rewrite.long],
        ['podcastScript', rewrite.podcastScript], ['keyPoints', rewrite.keyPoints.join('\n')], ['seoTitle', seo.seoTitle], ['seoDescription', seo.seoDescription],
        ...Object.entries(captions).map(([k, v]) => [`caption:${k}`, typeof v === 'string' ? v : ''] as [string, string]),
      ];
      const leaking = leakFields.filter(([, v]) => containsSourceMention(v, publisherNames)).map(([k]) => k);
      if (leaking.length) {
        throw new RewriteRejectedError(`rewrite still names the source in: ${leaking.join(',')}`, null);
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
          model: this.gemini.lastModelUsed ?? 'gemini',
          tokensUsed: rwTokens,
        },
      });

      // Determine auto-approve from risk rules
      const policyAutoApprove = await this.checkAutoApprove(
        risk.score, risk.confidence, categorySlug,
      );
      // Facts missing from the rewrite (numbers dropped) → a human checks it before it goes live.
      const autoApprove = factsNeedReview ? false : options.forceAutoPublish ? true : policyAutoApprove;

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
            ...(rewrite.keyPoints.length ? { keyPoints: rewrite.keyPoints } : {}),
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

      // Picture (IMAGE_MODE): mirrored + validated source image when available (source_first), otherwise an original
      // AI-generated image; if both fail the web app renders deterministic fallback artwork for this slug.
      const sourceImageUrl = await this.storyImages.resolveSourceImageUrl(options.imageUrl, ingested.sourceUrl, language);
      const picture = await this.storyImages.attachStoryImage({
        id: article.id,
        slug: article.slug,
        title: rewrite.title,
        summary: readerSummary,
        category: categorySlug,
        language,
        sourceImageUrl,
        feedLink: ingested.sourceUrl,
      });
      if (picture) {
        await this.prisma.article.update({
          where: { id: article.id },
          data: {
            body: {
              ...(article.body as object),
              imageUrl: picture.url,
              imageAlt: picture.alt,
              imageGenerated: picture.origin === 'generated',
              imageOrigin: picture.origin,
            },
          },
        });
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
      // Rewrite rejected / quota: keep the row RAW so it can be rewritten later; never leave source text public.
      const kind = classifyAiError(err);
      // a retired model (config problem) or quota must not permanently SKIP the item: keep it RAW
      const retryable = err instanceof RewriteRejectedError || kind === 'quota' || kind === 'model_not_found';
      await this.prisma.ingestedArticle.update({
        where: { id: ingestedArticleId },
        data: { status: retryable ? 'RAW' : 'SKIPPED' },
      });
      throw err;
    }
  }

  /**
   * Re-run rewrite + scrub on text that is ALREADY stored (existing stories; used by the rewrite-existing-stories CLI).
   * Same safeguards as the ingestion pipeline: page boilerplate is stripped first, the copy-safety gate and publisher
   * names are enforced, the body must be complete. Never throws: `ok:false` + `retryable` tells the caller whether the
   * story is unsafe to publish (hold as DRAFT) or the model/network failed (try again later, change nothing).
   */
  async rewriteStoredStory(input: {
    title: string;
    body: string;
    language: string;
    publisher?: { sourceName?: string | null; sourceUrl?: string | null };
  }): Promise<
    | { ok: true; needsReview: boolean; fields: { title: string; short: string; medium: string; long: string; summary: string; keyPoints: string[]; podcastScript: string; seoTitle: string; seoDescription: string; language: string } }
    | { ok: false; retryable: boolean; reason: string; errorKind?: AiErrorKind }
  > {
    const publisher = input.publisher ?? {};
    const publisherNames = sourceNameVariants(publisher.sourceName, publisher.sourceUrl);
    try {
      const titlePlain = input.title.trim();
      const bodyIn = stripPublisherFeedBoilerplate(
        stripSyndicationLinkbacks(stripPageBoilerplate(input.body)),
        titlePlain,
        publisher,
      );
      const inQ = assessStoryBody(bodyIn, { minChars: 80, requireSentenceEnd: false });
      if (!inQ.ok) return { ok: false, retryable: false, reason: `source text unusable (${inQ.reasons.join(',')})` };

      const { data: raw, needsReview } = await this.rewriteWithQualityGate(titlePlain, bodyIn, input.language, publisher);
      const strip = (t: string) =>
        scrubSourceMentions(stripPublisherFeedBoilerplate(stripSyndicationLinkbacks(stripPageBoilerplate(t)), titlePlain, publisher), publisherNames);
      const rw = {
        title: stripWireHeadlinePrefix(scrubSourceMentionsInTitle(stripSyndicationLinkbacks(raw.title), publisherNames)).trim(),
        short: strip(raw.short),
        medium: strip(raw.medium),
        long: strip(raw.long),
        summary: strip(raw.summary),
        podcastScript: strip(raw.podcastScript),
        keyPoints: raw.keyPoints.map((k) => strip(k)).filter((k) => k.length >= 8),
      };
      const outQ = assessStoryBody(rw.long, { minChars: 60 });
      if (!outQ.ok) return { ok: false, retryable: false, reason: `rewritten body not publishable (${outQ.reasons.join(',')})` };
      if (titleTooShort(rw.title)) return { ok: false, retryable: false, reason: 'rewrite produced an empty / too short title' };
      const summary = this.nonEmptyTeaser(
        stripPublisherFeedBoilerplate(
          this.finalizeInBrief(rw.summary, rw.short, rw.medium, rw.long, input.language, rw.title),
          rw.title,
          publisher,
        ),
        [rw.summary, rw.short, rw.medium, rw.long],
      );
      const seoDescription = scrubSourceMentions(this.clipExcerpt(summary, 155) ?? '', publisherNames);
      const all = [rw.title, summary, rw.short, rw.medium, rw.long, rw.podcastScript, rw.keyPoints.join('\n'), seoDescription];
      if (all.some((t) => containsSourceMention(t, publisherNames))) {
        return { ok: false, retryable: false, reason: 'rewrite still names the source' };
      }
      return {
        ok: true,
        needsReview,
        fields: { ...rw, summary, seoTitle: rw.title, seoDescription, language: input.language },
      };
    } catch (err) {
      if (err instanceof RewriteRejectedError) return { ok: false, retryable: false, reason: err.message };
      const kind = classifyAiError(err);
      return { ok: false, retryable: true, reason: shortReason(String((err as Error)?.message ?? err)), errorKind: kind };
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
   * "In brief": 2-3 complete sentences. Uses the model's summary when it is usable, otherwise the first
   * sentences of its own short version (never source text).
   */
  private finalizeInBrief(
    summary: string | undefined,
    shortBody: string | undefined,
    mediumBody: string | undefined,
    longBody: string | undefined,
    targetLang: string,
    headline?: string,
  ): string {
    const clean = (t: string) => this.trimTrailingSummaryEllipsis(this.stripLeadingLatinLabel(t, targetLang));
    const head = (headline ?? '').trim();
    const usable = (t: string) =>
      t.length >= 60 && !this.summaryLooksTeaserIncomplete(t) && !(head && this.isSummaryEchoOfHeadline(t, head));
    const firstSentences = (t: string, n: number) =>
      this.splitSentencesForTeaser(t).slice(0, n).join(' ').trim();
    const limit = (t: string) => {
      const sentences = this.splitSentencesForTeaser(t);
      const three = sentences.slice(0, 3).join(' ').trim();
      return (three.length >= 60 ? three : t).slice(0, 700).trim();
    };
    const own = clean((summary ?? '').trim());
    if (usable(own)) return limit(own);
    for (const body of [shortBody, mediumBody, longBody]) {
      const cand = clean(firstSentences((body ?? '').trim(), 3));
      if (usable(cand)) return limit(cand);
    }
    return limit(own || clean(firstSentences((shortBody ?? mediumBody ?? longBody ?? '').trim(), 2)));
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

  /** The excerpt is never empty: if cleaning removed it, use the first usable (already scrubbed) rewrite field. */
  private nonEmptyTeaser(teaser: string, fallbacks: string[]): string {
    const okT = (x: string) => x.trim().split(/\s+/).length >= 3 || [...x.trim()].length >= 20;
    if (okT(teaser)) return teaser.trim();
    for (const f of fallbacks) {
      const c = this.clipExcerpt(f ?? '', 300);
      if (c && okT(c)) return c.trim();
    }
    return teaser.trim();
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

    // The long version is the full-coverage body; the shorter versions are only used if it is missing.
    const preferred = long.length >= 200 ? [long] : [medium, long, short, summary];
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
