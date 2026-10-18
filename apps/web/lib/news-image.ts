// Every story image is OUR image: a generated picture (or generated fallback artwork) served from
// /story-image/<slug>. Publisher image URLs are never read, proxied or displayed — whatever the API
// returns in mediaAssets / body.imageUrl is ignored here on purpose, so a source image can never
// reappear on a card, hero, OG tag or JSON-LD even if an old payload still carries one.
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

/** Descriptive alt text: the (sanitized) headline. */
export function getImageAlt(title: string | null | undefined, language?: string | null): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
  return (language ?? 'en').toLowerCase().startsWith('en') && t ? `Illustration for: ${t}` : t;
}
