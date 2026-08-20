// Returns a consistent image URL for an article.
// ALL absolute image URLs go through /api/image so:
//  - hotlink-protected publisher images load server-side
//  - MinIO / localhost S3 URLs (unreachable from the browser) are fetched by the web container
// Falls back to site logo when no story image is available.
export const LOGO_FALLBACK = '/logo.png';

const WEAK_IMAGE_STEM =
  /^(?:logo|favicon|icon|sprite|avatar|placeholder|default[-_]?image|brand(?:ing)?|masthead|watermark|badge|button|spinner|loader|spacer|pixel|tracking|1x1|blank)(?:[-_.].*)?$/i;

/** Match on filename, not path folders — LiveMint stores story photos under `/logo/`. */
function isWeakStoryImageUrl(url: string): boolean {
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
  if (/\/(?:wp-content\/(?:themes|plugins)|static\/(?:logo|icons?)|favicons?)\//i.test(pathname)) {
    return true;
  }
  if (/\/(?:icons?|favicons?)\//i.test(pathname) && stem.length < 18) return true;
  return false;
}

/** Proxy every absolute URL so the browser never talks to publishers or private MinIO. */
function toDisplayImageUrl(url: string): string {
  if (!url) return LOGO_FALLBACK;
  if (url.startsWith('/')) return url;
  return `/api/image?url=${encodeURIComponent(url)}`;
}

export function getArticleImage(
  slug: string,
  categorySlug?: string,
  size: 'card' | 'hero' | 'thumb' = 'card',
  externalImageUrl?: string | null,
): string {
  if (externalImageUrl && !isWeakStoryImageUrl(externalImageUrl)) {
    return toDisplayImageUrl(externalImageUrl);
  }
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

/**
 * Image for public cards / article hero. Prefers mediaAssets IMAGE, then body.imageUrl.
 */
export function getPreferredArticleImage(article: ImageLikeArticle | null | undefined): string | null {
  if (!article) return null;

  const media = article.mediaAssets?.find(
    (m) => m.type === 'IMAGE' && typeof m.url === 'string' && m.url.length > 0,
  );
  if (media?.url && !isWeakStoryImageUrl(media.url)) {
    return toDisplayImageUrl(media.url);
  }

  const bodyUrl = getBodyImageUrl(article.body);
  if (bodyUrl && !isWeakStoryImageUrl(bodyUrl)) return toDisplayImageUrl(bodyUrl);

  return null;
}

export function getCategoryImage(categorySlug: string): string {
  return `https://picsum.photos/seed/cat-${categorySlug}/1200/400`;
}

export function getBodyImageUrl(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  return ((body as Record<string, unknown>).imageUrl as string) ?? null;
}

export function getBodyImageCredit(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  return ((body as Record<string, unknown>).imageCredit as string) ?? null;
}
