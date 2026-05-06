import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiClient } from './gemini.client';
import {
  fetchArticlePlainText,
  MIN_SOURCE_ARTICLE_PLAIN_CHARS,
  rssBodyLooksLikeTitleOnly,
} from './source-article-text.util';
import { acceptLanguageHeaderForLocale, resolveArticleLanguage } from './language-resolution.util';
import { rewritePrompt } from './prompts/rewrite.prompt';
import { tagPrompt } from './prompts/tag.prompt';
import { captionsPrompt } from './prompts/captions.prompt';
import { seoPrompt } from './prompts/seo.prompt';
import { riskPrompt } from './prompts/risk.prompt';
import { translatePrompt } from './prompts/translate.prompt';
import { Platform } from '@prisma/client';
import { PublishingService } from '../publishing/publishing.service';

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
    });
    const feedLangHint = options.language ?? 'en';
    const langForFetch = resolveArticleLanguage(feedLangHint, {
      title: ingested.sourceTitle,
      body: ingested.body,
    });

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
      const skipFetchBecauseIngestionEnriched = rssPlain.length >= 1100 && !looksTitleOnly;
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

      const language = resolveArticleLanguage(feedLangHint, {
        title: ingested.sourceTitle,
        body: bodyForRewrite,
      });
      if (language !== langForFetch) {
        this.logger.log(
          `Resolved output language=${language} (fetch hint was ${langForFetch}) from body script/title`,
        );
      }

      // 1. Rewrite (short / medium / long + multilingual reader summary)
      const { data: rewrite, tokensUsed: rwTokens } = await this.gemini.generateJson<{
        title: string; short: string; medium: string; long: string;
        summary: string; podcastScript: string; language: string;
      }>(rewritePrompt(ingested.sourceTitle, bodyForRewrite, language));

      const readerSummary = this.ensureReaderSummary(
        rewrite.summary,
        rewrite.short,
        rewrite.medium,
        rewrite.long,
        bodyForRewrite.length,
        language,
      );
      const longForPrompts = this.clipForPrompt(rewrite.long, 14_000);

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
          excerpt: this.clipExcerpt(readerSummary),
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

      if (options.imageUrl) {
        await this.prisma.mediaAsset.create({
          data: {
            articleId: article.id,
            type: 'IMAGE',
            url: options.imageUrl,
            s3Key: `external/${article.id}/source-image`,
            mimeType: 'image/jpeg',
            sizeBytes: 0,
            scanStatus: 'external',
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

      // Auto-publish immediately if approved
      if (autoApprove) {
        this.publishing.publishArticle(article.id).catch((err) =>
          this.logger.error(`Auto-publish failed for ${article.id}`, err),
        );
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
  ): string {
    const MIN_CHARS = this.targetSummaryChars(sourceBodyLength, longBody, mediumBody, shortBody);
    const HARD_MAX = Math.min(1200, Math.max(420, Math.floor(MIN_CHARS * 1.9)));
    let s = this.stripLeadingLatinLabel(summary, targetLang);
    s = this.trimTrailingSummaryEllipsis(s);
    const short = (shortBody ?? '').trim();
    const medium = (mediumBody ?? '').trim();
    const long = (longBody ?? '').trim();

    const splitSentences = (t: string): string[] =>
      t
        .split(/(?<=[.!?।])\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

    const roughSentenceCount = (text: string): number => Math.max(1, splitSentences(text).length);

    const substantiveEnough = (text: string): boolean => {
      if (this.summaryLooksTeaserIncomplete(text)) return false;
      return text.length >= MIN_CHARS || (text.length >= 110 && roughSentenceCount(text) >= 2);
    };

    if (substantiveEnough(s)) return s.slice(0, HARD_MAX).trim();

    const padded = this.padTeaserFromArticleBodies(s, short, medium, long, MIN_CHARS);
    let out = padded.slice(0, HARD_MAX).trim();
    out = this.stripLeadingLatinLabel(out, targetLang);
    out = this.trimTrailingSummaryEllipsis(out);
    if (this.summaryLooksTeaserIncomplete(out) && (short || medium || long)) {
      out = this.padTeaserFromArticleBodies(out, short, medium, long, MIN_CHARS).slice(0, HARD_MAX).trim();
      out = this.trimTrailingSummaryEllipsis(out);
    }
    return out;
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
    if (sourceLen >= 5000) return 430;
    if (sourceLen >= 2600) return 320;
    if (sourceLen >= 1200) return 250;
    return 190;
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
  ): string {
    let base = teaser.trim();
    const bodies = [shortBody, mediumBody, longBody].filter((b) => b.trim().length > 0);
    if (bodies.length === 0) return base;

    const baseLow = base.toLowerCase();

    for (const body of bodies) {
      const firstBlock = (body.split(/\n\n+/)[0] ?? body).trim();
      for (const sent of this.splitSentencesForTeaser(firstBlock)) {
        if (sent.length < 14) continue;
        const prefix = sent.slice(0, Math.min(56, sent.length)).toLowerCase();
        if (baseLow.includes(prefix)) continue;
        base = `${base} ${sent}`.replace(/\s+/g, ' ').trim();
        if (base.length >= minChars && this.splitSentencesForTeaser(base).length >= 2) return base;
      }
      if (base.length >= minChars) return base;
      if (!teaser && firstBlock.length > base.length) base = firstBlock.slice(0, 720).trim();
    }

    if (base.length < minChars && shortBody.trim()) {
      const fb = (shortBody.split(/\n\n+/)[0] ?? shortBody).trim();
      if (fb.length > base.length + 80) {
        base = `${base} ${fb}`.replace(/\s+/g, ' ').trim().slice(0, 850);
      }
    }

    if (base.length < 80 && shortBody.trim()) return shortBody.trim().slice(0, 720);
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

  private clipExcerpt(text: string | null | undefined, max = 560): string | undefined {
    const t = (text ?? '').trim().replace(/\s+/g, ' ');
    if (!t) return undefined;
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
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
