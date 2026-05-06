/**
 * Single place for “what language is this story / what should AI output?” so feed metadata,
 * RSS title, and fetched article text stay aligned.
 */

const DEVANAGARI_EXPLICIT = new Set(['hi', 'mr', 'ne', 'sa', 'bho', 'doi']);

/** Rough BCP-47 primary subtag → Accept-Language (helps regional sites return the right edition). */
const ACCEPT_LANG_BY_LOCALE: Record<string, string> = {
  en: 'en-US,en;q=0.9',
  hi: 'hi-IN,hi;q=0.9,en-IN;q=0.75,en;q=0.65',
  mr: 'mr-IN,mr;q=0.9,hi-IN;q=0.65,en-IN;q=0.55,en;q=0.5',
  bn: 'bn-IN,bn;q=0.9,bn-BD;q=0.85,en;q=0.55',
  ta: 'ta-IN,ta;q=0.9,ta-LK;q=0.85,en-IN;q=0.75,en;q=0.65',
  te: 'te-IN,te;q=0.9,en-IN;q=0.75,en;q=0.65',
  kn: 'kn-IN,kn;q=0.9,en-IN;q=0.75,en;q=0.65',
  ml: 'ml-IN,ml;q=0.9,en-IN;q=0.75,en;q=0.65',
  gu: 'gu-IN,gu;q=0.9,en-IN;q=0.65,en;q=0.55',
  pa: 'pa-IN,pa;q=0.9,en-IN;q=0.65,en;q=0.55',
  ur: 'ur-PK,ur;q=0.9,en;q=0.55',
  ar: 'ar,en;q=0.55',
  fr: 'fr-FR,fr;q=0.9,en;q=0.55',
  de: 'de-DE,de;q=0.9,en;q=0.55',
  es: 'es-ES,es;q=0.9,en;q=0.55',
  pt: 'pt-BR,pt;q=0.9,en;q=0.55',
  ru: 'ru-RU,ru;q=0.9,en;q=0.55',
  zh: 'zh-CN,zh;q=0.9,en;q=0.55',
  ja: 'ja-JP,ja;q=0.9,en;q=0.55',
  ko: 'ko-KR,ko;q=0.9,en;q=0.55',
  id: 'id-ID,id;q=0.9,en;q=0.55',
  ms: 'ms-MY,ms;q=0.9,en;q=0.55',
  tr: 'tr-TR,tr;q=0.9,en;q=0.55',
  it: 'it-IT,it;q=0.9,en;q=0.55',
};

export function acceptLanguageHeaderForLocale(locale: string): string {
  const code = (locale || 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  return ACCEPT_LANG_BY_LOCALE[code] ?? `${code},en;q=0.75,en-US;q=0.6`;
}

export function inferLangFromText(text: string): string | null {
  const t = text ?? '';
  if (/[\u3040-\u30FF]/.test(t)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(t)) return 'ko';
  if (/[\u0400-\u04FF]/.test(t)) return 'ru';
  // Urdu uses Arabic script; detect common Urdu-only letters before generic Arabic fallback.
  if (/[ٹڈڑںےپچژگ]/.test(t)) return 'ur';
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  if (/[\u0D00-\u0D7F]/.test(t)) return 'ml';
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  if (/[\u0980-\u09FF]/.test(t)) return 'bn';
  if (/[\u0A00-\u0A7F]/.test(t)) return 'pa';
  if (/[\u0A80-\u0AFF]/.test(t)) return 'gu';
  if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(t)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(t)) return 'kn';
  if (/[\u4E00-\u9FFF]/.test(t)) return 'zh';
  return null;
}

/** True when letter content is mostly Latin — e.g. English edition on a “Tamil” feed. */
export function isMostlyLatinLetterText(text: string, sampleLen = 12000): boolean {
  const slice = text.slice(0, sampleLen);
  let letters = 0;
  let latinLetters = 0;
  for (const ch of slice) {
    const c = ch.codePointAt(0)!;
    if (c < 128 && /[A-Za-z]/.test(ch)) {
      letters++;
      latinLetters++;
      continue;
    }
    if (c >= 0xc0 && c <= 0x24f) {
      letters++;
      latinLetters++;
      continue;
    }
    // Letter-like (Unicode categories approximated): other scripts
    if (/\p{L}/u.test(ch)) letters++;
  }
  if (letters < 28) return true;
  return latinLetters / letters > 0.82;
}

/**
 * @param preferred — source / feed language (e.g. IngestedSource.language)
 * @param samples — title + body after RSS + optional source-page fetch
 */
export function resolveArticleLanguage(
  preferred: string,
  samples: { title?: string | null; body?: string | null },
): string {
  const preferredNorm = (preferred || 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  const probe = [samples.title, samples.body].filter(Boolean).join('\n');
  if (!probe.trim()) return preferredNorm;

  const inferred = inferLangFromText(probe);
  if (inferred) {
    if (preferredNorm === 'en') return inferred;
    if (inferred === 'hi' && DEVANAGARI_EXPLICIT.has(preferredNorm)) return preferredNorm;
    return preferredNorm;
  }

  if (preferredNorm !== 'en' && isMostlyLatinLetterText(probe)) return 'en';

  return preferredNorm;
}
