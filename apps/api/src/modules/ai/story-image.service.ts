import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MediaType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { isWeakStoryImageUrl, normalizeImageUrl, s3ConfigFromEnv, type S3Config } from '../../common/mirror-external-image.util';
import {
  buildImageAlt,
  buildStoryImagePrompt,
  generateImageWithGemini,
  imageExtension,
  storyImagePath,
  type ImageGenResult,
  type StoryImageInput,
} from '../../common/story-image.util';
import { ImageMode, ImageOrigin, SCAN_GENERATED, SCAN_SOURCE_MIRRORED, originFromValue, parseImageMode } from '../../common/image-mode';
import { fetchArticleOgImage } from './source-article-text.util';
import { acceptLanguageHeaderForLocale } from './language-resolution.util';
import { SafeFetchError, safeFetchBytes, type SafeFetchOptions } from '../../common/safe-fetch.util';
import { KIND_EXT, prepareSourceImage, sourceImageLimitsFromEnv, type SourceImageLimits } from '../../common/image-sanitize.util';

export const GENERATED_SCAN_STATUS = SCAN_GENERATED;
export const SOURCE_MIRRORED_SCAN_STATUS = SCAN_SOURCE_MIRRORED;

type ArticleForImage = StoryImageInput & { id: string; slug: string };
export type AttachImageInput = ArticleForImage & {
  /** Source item image URL (RSS media / og:image). Only used when IMAGE_MODE=source_first. Never stored or exposed. */
  sourceImageUrl?: string | null;
  /** Source article link, used only to resolve relative image URLs. */
  feedLink?: string | null;
};
export type StoryImageResult = { url: string; alt: string; origin: ImageOrigin };
export type SourceMirrorOutcome = { ok: true } | { ok: false; reason: string };

/**
 * One picture per story, always served from OUR origin (/story-image/<slug>):
 *  - IMAGE_MODE=source_first (default): the source image is fetched server-side (SSRF-safe), validated, stripped of
 *    metadata and mirrored into our own object storage. Never hotlinked; the source URL/domain is not stored on the asset.
 *  - otherwise, or when the source image is missing / broken / too small: an AI-generated picture; if that is unavailable
 *    too, the web app renders deterministic fallback artwork.
 * Every failure path returns null / falls back, so a story never renders without an image.
 */
@Injectable()
export class StoryImageService {
  private readonly logger = new Logger(StoryImageService.name);
  private lastCallAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly redisCache?: RedisCacheService,
  ) {}

  get imageMode(): ImageMode {
    return parseImageMode(this.config.get<string>('IMAGE_MODE'));
  }

  private get enabled(): boolean {
    const flag = (this.config.get<string>('IMAGE_GEN_ENABLED') ?? 'true').toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(flag);
  }

  private get model(): string {
    return this.config.get<string>('IMAGE_GEN_MODEL') || 'gemini-2.5-flash-image';
  }

  private get sourceLimits(): SourceImageLimits {
    return sourceImageLimitsFromEnv((k) => this.config.get<string>(k));
  }

  private s3(): { client: S3Client; cfg: S3Config } | null {
    const cfg = s3ConfigFromEnv((k) => this.config.get<string>(k));
    if (!cfg) return null;
    return {
      cfg,
      client: new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region,
        credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
        forcePathStyle: true,
      }),
    };
  }

  private async throttle() {
    const gap = Number(this.config.get('IMAGE_GEN_MIN_INTERVAL_MS') ?? 4000);
    const wait = gap - (Date.now() - this.lastCallAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCallAt = Date.now();
  }

  private async existingStoryImage(articleId: string) {
    return this.prisma.mediaAsset.findFirst({
      where: { articleId, type: MediaType.IMAGE, scanStatus: { in: [SCAN_GENERATED, SCAN_SOURCE_MIRRORED] } },
      select: { id: true, scanStatus: true },
    });
  }

  /**
   * Pick the source image candidate for a story (IMAGE_MODE=source_first only): the feed's own image when it is a real
   * photo, else the article page's og:image / twitter:image (fetched through the SSRF-safe fetcher).
   * Returns null in generated_only mode. The URL is used server-side to mirror the file and is never stored or returned.
   */
  async resolveSourceImageUrl(rssImageUrl: string | null | undefined, articleUrl: string | null | undefined, language = 'en'): Promise<string | null> {
    if (this.imageMode !== 'source_first') return null;
    const fromFeed = normalizeImageUrl(rssImageUrl, articleUrl ?? undefined);
    if (fromFeed && !isWeakStoryImageUrl(fromFeed)) return fromFeed;
    const fetchFlag = (this.config.get<string>('FETCH_SOURCE_ARTICLE') ?? '').toLowerCase();
    if (['0', 'false', 'no', 'off'].includes(fetchFlag) || !articleUrl) return null;
    try {
      const og = await fetchArticleOgImage(
        articleUrl,
        { timeoutMs: Math.min(Number(this.config.get('FETCH_SOURCE_TIMEOUT_MS') ?? 15_000), 12_000), maxBytes: 400_000 },
        { acceptLanguage: acceptLanguageHeaderForLocale(language) },
      );
      const norm = normalizeImageUrl(og, articleUrl);
      return norm && !isWeakStoryImageUrl(norm) ? norm : null;
    } catch {
      return null;
    }
  }

  /**
   * Main entry: mirrored source image when IMAGE_MODE=source_first and it validates, else an AI-generated picture.
   * Idempotent: an article that already has a story image keeps it.
   */
  async attachStoryImage(article: AttachImageInput, deps: { fetchOptions?: SafeFetchOptions; fetchImpl?: typeof fetch } = {}): Promise<StoryImageResult | null> {
    try {
      const existing = await this.existingStoryImage(article.id);
      if (existing) {
        const origin: ImageOrigin = existing.scanStatus === SCAN_SOURCE_MIRRORED ? 'source' : 'generated';
        return { url: storyImagePath(article.slug), alt: buildImageAlt(article.title, article.language, origin), origin };
      }
      if (this.imageMode === 'source_first' && article.sourceImageUrl) {
        const outcome = await this.mirrorSourceImage(article, deps.fetchOptions);
        if (outcome.ok) {
          await this.prisma.article.update({ where: { id: article.id }, data: { imageOrigin: 'source' } });
          return { url: storyImagePath(article.slug), alt: buildImageAlt(article.title, article.language, 'source'), origin: 'source' };
        }
        this.logger.log(`source image not used for article ${article.id}: ${outcome.reason} — falling back to generated picture`);
      }
      const generated = await this.generateForArticle(article, deps.fetchImpl);
      if (generated) {
        await this.prisma.article.update({ where: { id: article.id }, data: { imageOrigin: 'generated' } });
        return { ...generated, origin: 'generated' };
      }
      return null;
    } catch (e) {
      this.logger.warn(`attachStoryImage error for ${article.id}: ${(e as Error).message?.slice(0, 160)}`);
      return null;
    }
  }

  /** Fetch (SSRF-safe) → validate → strip metadata → store in OUR bucket → MediaAsset. Never throws. */
  async mirrorSourceImage(article: AttachImageInput, fetchOptions: SafeFetchOptions = {}): Promise<SourceMirrorOutcome> {
    try {
      const normalized = normalizeImageUrl(article.sourceImageUrl, article.feedLink ?? undefined);
      if (!normalized) return { ok: false, reason: 'no_url' };
      if (isWeakStoryImageUrl(normalized)) return { ok: false, reason: 'weak_url (logo/icon/tracking)' };
      const store = this.s3();
      if (!store) return { ok: false, reason: 'S3 not configured (never hotlinked)' };

      const limits = this.sourceLimits;
      let fetched;
      try {
        fetched = await safeFetchBytes(normalized, {
          maxBytes: limits.maxBytes,
          timeoutMs: Number(this.config.get('SOURCE_IMAGE_TIMEOUT_MS') ?? 15_000),
          ...fetchOptions,
        });
      } catch (e) {
        return { ok: false, reason: `fetch:${e instanceof SafeFetchError ? e.code : 'error'}` };
      }
      if (fetched.contentType && !/^image\//.test(fetched.contentType) && fetched.contentType !== 'application/octet-stream') {
        return { ok: false, reason: 'not_an_image' };
      }
      const prepared = prepareSourceImage(fetched.body, limits);
      if (!prepared.ok) return { ok: false, reason: `invalid:${prepared.reason}` };

      const key = `source-mirror/images/${article.id}.${KIND_EXT[prepared.kind]}`;
      await store.client.send(
        new PutObjectCommand({
          Bucket: store.cfg.bucket,
          Key: key,
          Body: prepared.buffer,
          ContentType: prepared.mimeType,
          CacheControl: 'public, max-age=3600',
        }),
      );
      await this.prisma.mediaAsset.create({
        data: {
          articleId: article.id,
          type: MediaType.IMAGE,
          url: storyImagePath(article.slug), // our URL only — the source URL is deliberately not stored here
          s3Key: key,
          mimeType: prepared.mimeType,
          sizeBytes: prepared.buffer.length,
          width: prepared.width,
          height: prepared.height,
          scanStatus: SCAN_SOURCE_MIRRORED,
        },
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `error:${(e as Error).message?.slice(0, 100)}` };
    }
  }

  /** Generate (once; cached by existing MediaAsset) and attach an AI-generated image to the article. */
  async generateForArticle(article: ArticleForImage, fetchImpl?: typeof fetch): Promise<{ url: string; alt: string } | null> {
    const url = storyImagePath(article.slug);
    const alt = buildImageAlt(article.title, article.language, 'generated');
    try {
      const existing = await this.prisma.mediaAsset.findFirst({
        where: { articleId: article.id, type: MediaType.IMAGE, scanStatus: GENERATED_SCAN_STATUS },
        select: { id: true },
      });
      if (existing) return { url, alt };

      if (!this.enabled) {
        this.logger.log(`image generation disabled — article ${article.id} will use fallback artwork`);
        return null;
      }
      const store = this.s3();
      if (!store) {
        this.logger.warn('image generation skipped: S3_* not configured (nowhere to store the image)');
        return null;
      }

      await this.throttle();
      const result: ImageGenResult = await generateImageWithGemini(buildStoryImagePrompt(article), {
        apiKey: this.config.get<string>('GEMINI_API_KEY'),
        model: this.model,
        timeoutMs: Number(this.config.get('IMAGE_GEN_TIMEOUT_MS') ?? 40_000),
        fetchImpl,
      });
      if (!result.ok) {
        this.logger.warn(`image generation failed for ${article.id}: ${result.reason}${result.detail ? ` (${result.detail})` : ''} — fallback artwork will be used`);
        return null;
      }

      const key = `generated/images/${article.id}.${imageExtension(result.image.mimeType)}`;
      await store.client.send(
        new PutObjectCommand({
          Bucket: store.cfg.bucket,
          Key: key,
          Body: result.image.buffer,
          ContentType: result.image.mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      await this.prisma.mediaAsset.create({
        data: {
          articleId: article.id,
          type: MediaType.IMAGE,
          url,
          s3Key: key,
          mimeType: result.image.mimeType,
          sizeBytes: result.image.buffer.length,
          scanStatus: GENERATED_SCAN_STATUS,
        },
      });
      return { url, alt };
    } catch (e) {
      this.logger.warn(`image generation error for ${article.id}: ${(e as Error).message?.slice(0, 160)}`);
      return null;
    }
  }

  /**
   * TAKEDOWN: swap an article's picture to a generated one and purge the mirrored source image (S3 object + DB rows,
   * including any legacy external-URL image rows). Staff-only callers (endpoint + CLI). Idempotent.
   */
  async replaceWithGenerated(idOrSlug: string, fetchImpl?: typeof fetch): Promise<{
    found: boolean; articleId?: string; slug?: string; removedAssets: number; deletedObjects: number; generated: boolean; origin?: ImageOrigin;
  }> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const article = await this.prisma.article.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      select: { id: true, slug: true, title: true, language: true, excerpt: true, body: true, categoryId: true },
    }) as unknown as { id: string; slug: string; title: string; language: string; excerpt: string | null; body: Record<string, unknown>; categoryId: string | null } | null;
    if (!article) return { found: false, removedAssets: 0, deletedObjects: 0, generated: false };

    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        articleId: article.id,
        type: MediaType.IMAGE,
        OR: [{ scanStatus: { in: [SCAN_SOURCE_MIRRORED, 'external', 'clean'] } }, { s3Key: { startsWith: 'source-mirror/' } }, { s3Key: { startsWith: 'ingested/' } }, { s3Key: { startsWith: 'external/' } }],
      },
      select: { id: true, s3Key: true },
    });
    const store = this.s3();
    let deletedObjects = 0;
    for (const a of assets) {
      if (store && !a.s3Key.startsWith('external/')) {
        try {
          await store.client.send(new DeleteObjectCommand({ Bucket: store.cfg.bucket, Key: a.s3Key }));
          deletedObjects++;
        } catch (e) {
          this.logger.warn(`could not delete ${a.s3Key}: ${(e as Error).message?.slice(0, 100)}`);
        }
      }
    }
    if (assets.length) await this.prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });

    // Mark generated BEFORE generating, so a failed generation still leaves the story on fallback artwork, not the source.
    const { imageCredit: _c, imageSource: _s, ...restBody } = (article.body ?? {}) as Record<string, unknown>;
    await this.prisma.article.update({
      where: { id: article.id },
      data: {
        imageOrigin: 'generated',
        body: { ...restBody, imageUrl: storyImagePath(article.slug), imageAlt: buildImageAlt(article.title, article.language, 'generated'), imageGenerated: true, imageOrigin: 'generated', sourceImageRemoved: true } as never,
      },
    });

    const categorySlug = article.categoryId
      ? (await this.prisma.category.findUnique({ where: { id: article.categoryId }, select: { slug: true } }))?.slug
      : undefined;
    const generated = await this.generateForArticle(
      { id: article.id, slug: article.slug, title: article.title, summary: article.excerpt, category: categorySlug, language: article.language },
      fetchImpl,
    );
    this.redisCache?.delByPrefix('country-feed:').catch(() => null);
    return { found: true, articleId: article.id, slug: article.slug, removedAssets: assets.length, deletedObjects, generated: !!generated, origin: 'generated' };
  }

  /** Stream source for GET /articles/:slug/image (source-mirrored or generated picture). */
  async readStoryImage(idOrSlug: string): Promise<{ buffer: Buffer; mimeType: string; origin: ImageOrigin } | null> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        type: MediaType.IMAGE,
        scanStatus: { in: [SCAN_GENERATED, SCAN_SOURCE_MIRRORED] },
        article: isUuid ? { id: idOrSlug, status: 'PUBLISHED' } : { slug: idOrSlug, status: 'PUBLISHED' },
      },
      select: { s3Key: true, mimeType: true, scanStatus: true },
      orderBy: { createdAt: 'desc' },
    });
    const store = this.s3();
    if (!asset || !store) return null;
    try {
      const out = await store.client.send(new GetObjectCommand({ Bucket: store.cfg.bucket, Key: asset.s3Key }));
      const bytes = await out.Body?.transformToByteArray();
      return bytes ? { buffer: Buffer.from(bytes), mimeType: asset.mimeType, origin: originFromValue(asset.scanStatus === SCAN_SOURCE_MIRRORED ? 'source' : 'generated') } : null;
    } catch (e) {
      this.logger.warn(`could not read story image ${asset.s3Key}: ${(e as Error).message?.slice(0, 120)}`);
      return null;
    }
  }

  /** @deprecated use readStoryImage (kept for callers/tests that only want the bytes). */
  async readGeneratedImage(idOrSlug: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    return this.readStoryImage(idOrSlug);
  }
}
