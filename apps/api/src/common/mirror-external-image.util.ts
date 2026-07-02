import { Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';

const logger = new Logger('MirrorExternalImage');

export type S3Config = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

/** Normalize RSS / HTML image URLs (protocol-relative, site-relative). */
export function normalizeImageUrl(url: string | null | undefined, baseUrl?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;
  if (u.startsWith('//')) u = `https:${u}`;
  if (u.startsWith('/')) {
    if (!baseUrl) return null;
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

export async function mirrorExternalImage(
  config: S3Config,
  sourceUrl: string,
  s3Key: string,
): Promise<{ publicUrl: string; sizeBytes: number; mimeType: string } | null> {
  try {
    const normalized = normalizeImageUrl(sourceUrl);
    if (!normalized) return null;

    const res = await fetch(normalized, {
      headers: { 'User-Agent': 'NationReporters/1.0', Accept: 'image/*,*/*' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) return null;

    const arr = Buffer.from(await res.arrayBuffer());
    if (arr.length < 200 || arr.length > 5_000_000) return null;

    const s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
      forcePathStyle: true,
    });

    await s3.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: s3Key,
      Body: arr,
      ContentType: mimeType,
    }));

    const endpoint = config.endpoint.replace(/\/+$/, '');
    const publicUrl = `${endpoint}/${config.bucket}/${s3Key}`;
    return { publicUrl, sizeBytes: arr.length, mimeType };
  } catch (e) {
    logger.warn(`mirror failed ${sourceUrl.slice(0, 80)}: ${(e as Error).message}`);
    return null;
  }
}

export function s3ConfigFromEnv(get: (key: string) => string | undefined): S3Config | null {
  const endpoint = get('S3_ENDPOINT');
  const bucket = get('S3_BUCKET');
  const accessKey = get('S3_ACCESS_KEY');
  const secretKey = get('S3_SECRET_KEY');
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return {
    endpoint,
    bucket,
    accessKey,
    secretKey,
    region: get('S3_REGION') || 'us-east-1',
  };
}

/** Mirror publisher image to S3 when possible; fall back to external URL. */
export async function persistArticleImage(
  prisma: PrismaService,
  s3Config: S3Config | null,
  articleId: string,
  rawImageUrl: string,
  feedLink?: string,
): Promise<string | null> {
  const normalized = normalizeImageUrl(rawImageUrl, feedLink);
  if (!normalized) return null;

  const s3Key = `ingested/images/${articleId}-${Date.now()}.jpg`;
  let url = normalized;
  let mimeType = 'image/jpeg';
  let sizeBytes = 0;
  let scanStatus: 'external' | 'clean' = 'external';
  let storedKey = `external/${articleId}/source-image`;

  if (s3Config) {
    const mirrored = await mirrorExternalImage(s3Config, normalized, s3Key);
    if (mirrored) {
      url = mirrored.publicUrl;
      mimeType = mirrored.mimeType;
      sizeBytes = mirrored.sizeBytes;
      scanStatus = 'clean';
      storedKey = s3Key;
    }
  }

  await prisma.mediaAsset.create({
    data: {
      articleId,
      type: 'IMAGE',
      url,
      s3Key: storedKey,
      mimeType,
      sizeBytes,
      scanStatus,
    },
  });

  return url;
}
