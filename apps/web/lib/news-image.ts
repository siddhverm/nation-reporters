// Returns a consistent image URL for an article.
// External publisher images are proxied via /api/image to avoid hotlink blocks.
// S3-mirrored images (scanStatus: clean) are served directly.
// Falls back to site logo when no story image is available.
export const LOGO_FALLBACK = '/logo.png';

export function getArticleImage(
  slug: string,
  categorySlug?: string,
  size: 'card' | 'hero' | 'thumb' = 'card',
  externalImageUrl?: string | null,
): string {
  if (externalImageUrl) return externalImageUrl;
  return LOGO_FALLBACK;
}

type ImageLikeArticle = {
  body?: unknown;
  mediaAssets?: Array<{
    type?: string;
    url?: string | null;
    scanStatus?: string | null;
    s3Key?: string | null;
  }>;
};

function isMirroredImage(media: { scanStatus?: string | null; url?: string | null }): boolean {
  if (media.scanStatus === 'clean') return true;
  const url = media.url ?? '';
  return /localhost:9000|minio|\/ingested\/images\//i.test(url);
}

function proxyExternalImage(url: string): string {
  if (!url || url.startsWith('/')) return url;
  if (isMirroredImage({ url, scanStatus: 'clean' })) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

/**
 * Image for public cards / article hero. Prefers mediaAssets, then body.imageUrl.
 * External URLs are proxied unless already mirrored to S3.
 */
export function getPreferredArticleImage(article: ImageLikeArticle | null | undefined): string | null {
  if (!article) return null;

  const media = article.mediaAssets?.find((m) => m.type === 'IMAGE' && typeof m.url === 'string' && m.url.length > 0);
  if (media?.url) {
    return isMirroredImage(media) ? media.url : proxyExternalImage(media.url);
  }

  const bodyUrl = getBodyImageUrl(article.body);
  if (bodyUrl) return proxyExternalImage(bodyUrl);

  return null;
}

export function getCategoryImage(categorySlug: string): string {
  return `https://picsum.photos/seed/cat-${categorySlug}/1200/400`;
}

// Extract imageUrl stored in article body JSON during RSS ingestion
export function getBodyImageUrl(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  return ((body as Record<string, unknown>).imageUrl as string) ?? null;
}

// Returns copyright credit text if image came from an external source
export function getBodyImageCredit(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  return ((body as Record<string, unknown>).imageCredit as string) ?? null;
}
