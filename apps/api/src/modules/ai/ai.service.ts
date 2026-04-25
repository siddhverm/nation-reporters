import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiClient } from './gemini.client';
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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly gemini: GeminiClient,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PublishingService))
    private readonly publishing: PublishingService,
  ) {}

  async processIngestedArticle(ingestedArticleId: string, options: ProcessIngestedOptions = {}) {
    const language = options.language ?? 'en';
    const ingested = await this.prisma.ingestedArticle.findUniqueOrThrow({
      where: { id: ingestedArticleId },
    });

    await this.prisma.ingestedArticle.update({
      where: { id: ingestedArticleId },
      data: { status: 'PROCESSING' },
    });

    try {
      // 1. Rewrite
      const { data: rewrite, tokensUsed: rwTokens } = await this.gemini.generateJson<{
        title: string; short: string; medium: string; long: string;
        summary: string; podcastScript: string; language: string;
      }>(rewritePrompt(ingested.sourceTitle, ingested.body, language));

      // 2. Tag
      const { data: tags } = await this.gemini.generateJson<{
        category: string; region: string; tags: string[];
        entities: object; isBreaking: boolean;
      }>(tagPrompt(rewrite.title, rewrite.long));

      // 3. SEO
      const { data: seo } = await this.gemini.generateJson<{
        seoTitle: string; seoDescription: string; slug: string; hashtags: string[];
      }>(seoPrompt(rewrite.title, rewrite.long, language));

      // 4. Captions
      const { data: captions } = await this.gemini.generateJson<Record<string, string>>(
        captionsPrompt(rewrite.title, rewrite.summary, language),
      );

      // 5. Risk
      const { data: risk } = await this.gemini.generateJson<{
        score: number; confidence: number; flags: string[]; reasoning: string;
      }>(riskPrompt(rewrite.title, rewrite.long));

      const aiRewrite = await this.prisma.aiRewrite.create({
        data: {
          ingestedArticleId,
          originalTitle: ingested.sourceTitle,
          rewrittenTitle: rewrite.title,
          originalBody: ingested.body,
          rewrittenBodyShort: rewrite.short,
          rewrittenBodyMedium: rewrite.medium,
          rewrittenBodyLong: rewrite.long,
          summary: rewrite.summary,
          podcastScript: rewrite.podcastScript,
          language,
          tags: tags.tags,
          category: tags.category,
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
        risk.score, risk.confidence, tags.category,
      );
      const autoApprove = options.forceAutoPublish ? true : policyAutoApprove;

      if (
        options.allowedCategories?.length &&
        !options.allowedCategories.includes((tags.category ?? '').toLowerCase())
      ) {
        await this.prisma.ingestedArticle.update({
          where: { id: ingestedArticleId },
          data: { status: 'SKIPPED' },
        });
        return null;
      }

      const longParagraphs = rewrite.long
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      const docContent =
        longParagraphs.length > 0
          ? longParagraphs.map((text) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }))
          : [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: rewrite.long }] }];

      // Create article from AI rewrite
      const article = await this.prisma.article.create({
        data: {
          title: rewrite.title,
          slug: `${seo.slug}-${Date.now()}`,
          bodyShort: rewrite.short,
          bodyMedium: rewrite.medium,
          language,
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
              summary: rewrite.summary,
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
        if (p) {
          await this.prisma.socialCaption.create({
            data: { articleId: article.id, platform: p, caption, hashtags: seo.hashtags },
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
    const { data: captions } = await this.gemini.generateJson<Record<string, string>>(
      captionsPrompt(article.title, article.excerpt ?? article.title),
    );
    return captions;
  }

  async getRisk(articleId: string) {
    return this.prisma.riskAssessment.findUnique({ where: { articleId } });
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
