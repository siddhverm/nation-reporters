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

const WEAK_IMAGE_STEM =
  /^(?:logo|favicon|icon|sprite|avatar|placeholder|default[-_]?image|brand(?:ing)?|masthead|watermark|badge|button|spinner|loader|spacer|pixel|tracking|1x1|blank)(?:[-_.].*)?$/i;

/**
 * Reject publisher chrome / tracking / brand marks that often appear as the first
 * RSS enclosure or HTML <img> but are not the story photo.
 *
 * Important: match on the **filename**, not path folders. LiveMint (and similar CDNs)
 * store real story photos under a `/logo/` directory — those must still display.
 */
export function isWeakStoryImageUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const u = url.trim().toLowerCase();
  if (!u || u.startsWith('data:')) return true;
  if (/\.svg(\?|#|$)/i.test(u)) return true;

  let pathname = u;
  try {
    pathname = new URL(u).pathname.toLowerCase();
  } catch {
    /* keep raw */
  }
  const file = (pathname.split('/').pop() || '').split('?')[0];
  const stem = file.replace(/\.[a-z0-9]+$/i, '');
  if (WEAK_IMAGE_STEM.test(stem)) return true;

  // Theme/plugin/static brand asset folders (not CDN photo folders named "logo").
  if (/\/(?:wp-content\/(?:themes|plugins)|static\/(?:logo|icons?)|favicons?)\//i.test(pathname)) {
    return true;
  }
  // Generic icon folder + short/generic filename only.
  if (/\/(?:icons?|favicons?)\//i.test(pathname) && stem.length < 18) return true;

  if (/[_\-](?:16|24|32|48|50|64|72|96)x(?:16|24|32|48|50|64|72|96)(?:[_\-./?]|$)/i.test(u)) return true;
  if (/[?&](?:w|width|h|height)=(1[6-9]|[2-9]\d|1[01]\d)(?:&|$)/i.test(u)) {
    // Tiny requested dimensions are usually icons, not hero art.
    const w = /[?&](?:w|width)=(\d+)/i.exec(u);
    const h = /[?&](?:h|height)=(\d+)/i.exec(u);
    const wn = w ? Number(w[1]) : null;
    const hn = h ? Number(h[1]) : null;
    if ((wn != null && wn > 0 && wn < 120) || (hn != null && hn > 0 && hn < 120)) return true;
  }
  return false;
}

/** First usable story image from a candidate list (normalized + non-weak). */
export function pickStrongestImageUrl(
  candidates: Array<string | null | undefined>,
  baseUrl?: string,
): string | null {
  let weakFallback: string | null = null;
  for (const raw of candidates) {
    const normalized = normalizeImageUrl(raw, baseUrl);
    if (!normalized) continue;
    if (!isWeakStoryImageUrl(normalized)) return normalized;
    if (!weakFallback) weakFallback = normalized;
  }
  return weakFallback;
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

function isPrivateObjectStoreEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'minio' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    );
  } catch {
    return true;
  }
}

/** Mirror publisher image to S3 when possible; fall back to external URL. */
export async function persistArticleImage(
  prisma: PrismaService,
  s3Config: S3Config | null,
  articleId: string,
  rawImageUrl: string,
  feedLink?: string,
  publicBaseUrl?: string | null,
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
      mimeType = mirrored.mimeType;
      sizeBytes = mirrored.sizeBytes;
      scanStatus = 'clean';
      storedKey = s3Key;
      const publicBase = (publicBaseUrl ?? '').trim();
      if (publicBase) {
        url = `${publicBase.replace(/\/+$/, '')}/${s3Config.bucket}/${s3Key}`;
      } else if (!isPrivateObjectStoreEndpoint(s3Config.endpoint)) {
        // Public S3/CDN endpoint — safe to expose directly (still proxied by web).
        url = mirrored.publicUrl;
      } else {
        // Private MinIO/docker endpoint is unreachable from browsers; keep publisher URL
        // so /api/image can fetch the story photo from the open web.
        url = normalized;
      }
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
