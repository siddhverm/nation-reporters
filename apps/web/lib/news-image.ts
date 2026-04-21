// Returns a consistent image URL for an article.
// Uses the real RSS image when available, falls back to Picsum placeholder.
export function getArticleImage(
  slug: string,
  categorySlug?: string,
  size: 'card' | 'hero' | 'thumb' = 'card',
  externalImageUrl?: string | null,
): string {
  if (externalImageUrl) return externalImageUrl;
  const dims = size === 'hero' ? '1200/630' : size === 'thumb' ? '120/80' : '800/450';
  return `https://picsum.photos/seed/${encodeURIComponent(slug)}/${dims}`;
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
