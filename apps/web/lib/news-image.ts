// Every story image is served from OUR origin: /story-image/<slug>. That URL returns either a source image that the
// API mirrored into our own storage (IMAGE_MODE=source_first) or an AI-generated picture / generated fallback artwork.
// Publisher image URLs are never read, proxied or displayed — whatever the API returns in mediaAssets /
// body.imageUrl is ignored here on purpose, so a source URL can never reappear on a card, hero, OG tag or JSON-LD
// even if an old payload still carries one. The only thing we read from the payload is the image ORIGIN
// ('source' | 'generated') which decides which small notice is shown.
export type ImageOrigin = 'source' | 'generated';

/** 'source' only when the API says so explicitly; everything else (old rows, fallback art) is 'generated'. */
export function imageOriginOf(article: unknown): ImageOrigin {
  const a = article as { image?: { origin?: unknown } | null; imageOrigin?: unknown; body?: { imageOrigin?: unknown } | null } | null | undefined;
  const v = a?.image?.origin ?? a?.imageOrigin ?? a?.body?.imageOrigin;
  return v === 'source' ? 'source' : 'generated';
}

export const LOGO_FALLBACK = '/logo.png';

/** Same-origin URL of the generated image for a story. Always resolves (generated art when no image exists yet). */
export function getStoryImageUrl(slug: string): string {
  return `/story-image/${encodeURIComponent(slug)}`;
}

export function getArticleImage(
  slug: string,
  _categorySlug?: string,
  _size: 'card' | 'hero' | 'thumb' = 'card',
  _ignoredSourceUrl?: string | null,
): string {
  return slug ? getStoryImageUrl(slug) : LOGO_FALLBACK;
}

/** Kept for call-site compatibility: the preferred image of an article is its generated story image. */
export function getPreferredArticleImage(article: { slug?: string | null } | null | undefined): string | null {
  return article?.slug ? getStoryImageUrl(article.slug) : null;
}

/** Alt text: the (sanitized) headline. Generated English illustrations get a short "Illustration for:" prefix. */
export function getImageAlt(title: string | null | undefined, language?: string | null, origin: ImageOrigin = 'generated'): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
  return origin === 'generated' && (language ?? 'en').toLowerCase().startsWith('en') && t ? `Illustration for: ${t}` : t;
}
