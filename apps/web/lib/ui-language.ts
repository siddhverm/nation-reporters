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

/** Mirrors API `inferLangFromText` — script detection for mis-tagged RSS rows. */
export function inferLangFromText(text: string): string | null {
  const t = text ?? '';
  if (/[\u0980-\u09FF]/.test(t)) return 'bn';
  if (/[\u0A80-\u0AFF]/.test(t)) return 'gu';
  if (/[\u0A00-\u0A7F]/.test(t)) return 'pa';
  if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(t)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(t)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(t)) return 'ml';
  if (/[ٹڈڑںےپچژگ]/.test(t)) return 'ur';
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (/[\u3040-\u30FF]/.test(t)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(t)) return 'ko';
  if (/[\u0400-\u04FF]/.test(t)) return 'ru';
  if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';
  return null;
}

/** Match DB language tag OR headline script (feeds often stored as `en`). */
export function articleMatchesLanguageOrScript(
  articleLang: string | null | undefined,
  title: string | null | undefined,
  uiLang: string | null | undefined,
): boolean {
  const target = normalizeUiLanguage(uiLang);
  if (articleMatchesLanguage(articleLang, target)) return true;
  return inferLangFromText(title ?? '') === target;
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
