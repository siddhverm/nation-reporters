/**
 * Primary BCP-47 subtag for UI ↔ API matching (mirrors API `normalizeLanguageCode`).
 */
export function normalizeUiLanguage(code: string | null | undefined): string {
  const c = (code ?? 'en').trim().toLowerCase();
  if (!c) return 'en';
  return c.split(/[-_]/)[0] || 'en';
}

export function articleMatchesLanguage(
  articleLang: string | null | undefined,
  uiLang: string | null | undefined,
): boolean {
  return normalizeUiLanguage(articleLang) === normalizeUiLanguage(uiLang);
}

/** Reader language from localStorage (client only). */
export function getStoredUiLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  return normalizeUiLanguage(localStorage.getItem('nr-lang') ?? 'en');
}

/** True once the reader has a saved language (picker, country default, or ?lang= URL). */
export function hasExplicitLanguageChoice(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('nr-lang')?.trim());
}

/** Apply UI language to in-app paths so section navigation keeps the reader's language. */
export function withUiLanguagePath(path: string, lang?: string): string {
  const code = normalizeUiLanguage(lang ?? getStoredUiLanguage());
  if (code === 'en') return path;
  const q = path.indexOf('?');
  const pathname = q >= 0 ? path.slice(0, q) : path;
  const params = new URLSearchParams(q >= 0 ? path.slice(q + 1) : '');
  params.set('lang', code);
  const tail = params.toString();
  return tail ? `${pathname}?${tail}` : pathname;
}
