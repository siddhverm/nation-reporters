import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MediaType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { s3ConfigFromEnv, type S3Config } from '../../common/mirror-external-image.util';
import {
  buildImageAlt,
  buildStoryImagePrompt,
  generateImageWithGemini,
  imageExtension,
  storyImagePath,
  type ImageGenResult,
  type StoryImageInput,
} from '../../common/story-image.util';

export const GENERATED_SCAN_STATUS = 'generated';

type ArticleForImage = StoryImageInput & { id: string; slug: string };

/**
 * Generates one original picture per story (never the publisher's image), stores it in object storage and
 * records it as a MediaAsset. Every failure path returns null: the web app then serves its generated
 * fallback artwork, so a story never renders without an image and never falls back to a source image.
 */
@Injectable()
export class StoryImageService {
  private readonly logger = new Logger(StoryImageService.name);
  private lastCallAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get enabled(): boolean {
    const flag = (this.config.get<string>('IMAGE_GEN_ENABLED') ?? 'true').toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(flag);
  }

  private get model(): string {
    return this.config.get<string>('IMAGE_GEN_MODEL') || 'gemini-2.5-flash-image';
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

  /** Generate (once; cached by existing MediaAsset) and attach the image to the article. */
  async generateForArticle(article: ArticleForImage, fetchImpl?: typeof fetch): Promise<{ url: string; alt: string } | null> {
    const url = storyImagePath(article.slug);
    const alt = buildImageAlt(article.title, article.language);
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

  /** Stream source for GET /articles/:slug/image. */
  async readGeneratedImage(idOrSlug: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        type: MediaType.IMAGE,
        scanStatus: GENERATED_SCAN_STATUS,
        article: isUuid ? { id: idOrSlug, status: 'PUBLISHED' } : { slug: idOrSlug, status: 'PUBLISHED' },
      },
      select: { s3Key: true, mimeType: true },
    });
    const store = this.s3();
    if (!asset || !store) return null;
    try {
      const out = await store.client.send(new GetObjectCommand({ Bucket: store.cfg.bucket, Key: asset.s3Key }));
      const bytes = await out.Body?.transformToByteArray();
      return bytes ? { buffer: Buffer.from(bytes), mimeType: asset.mimeType } : null;
    } catch (e) {
      this.logger.warn(`could not read generated image ${asset.s3Key}: ${(e as Error).message?.slice(0, 120)}`);
      return null;
    }
  }
}
