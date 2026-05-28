import { createHash } from 'crypto';

/** Latin slug from title; hash fallback when headline is Bengali/Urdu/Tamil/etc. */
export function slugifyTitle(title: string, maxLen = 60): string {
  const latin = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
  if (latin.length >= 4) return latin;
  const hash = createHash('sha256').update(title).digest('hex').slice(0, 12);
  return `story-${hash}`;
}

export async function resolveUniqueArticleSlug(
  findExisting: (base: string) => Promise<boolean>,
  title: string,
  fallbackId?: string,
): Promise<string> {
  let base = slugifyTitle(title);
  if (!base && fallbackId) {
    base = `story-${fallbackId.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
  }
  const exists = await findExisting(base);
  return exists ? `${base}-${Date.now()}` : base;
}
