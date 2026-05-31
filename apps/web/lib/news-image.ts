// Returns a consistent image URL for an article.
// Public Nation Reporters pages do not use syndicated publisher images (avoids branding e.g. TOI on art).
// Only non-external (e.g. uploaded / generated) assets are used; otherwise Picsum placeholder by slug.
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

/**
 * Image for public cards / article hero. Shows original source images — a copyright disclaimer
 * is displayed on all article cards and pages.
 */
export function getPreferredArticleImage(article: ImageLikeArticle | null | undefined): string | null {
  if (!article) return null;
  const media = article.mediaAssets?.find((m) => m.type === 'IMAGE' && typeof m.url === 'string' && m.url.length > 0);
  if (!media?.url) return null;
  return media.url;
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
