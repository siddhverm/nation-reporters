/** Matches ingestion placeholder when RSS body fields are all empty (see ingestion-cron.service). */
export const FEED_EMPTY_BODY_PLACEHOLDER = '(No body text in feed item.)';

function decodeHtmlEntities(s: string): string {
  let out = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&pound;/gi, '£')
    .replace(/&euro;/gi, '€')
    .replace(/&copy;/gi, '©');
  out = out.replace(/&#(\d+);/g, (_, dec) => {
    const n = Number.parseInt(dec, 10);
    if (Number.isNaN(n)) return _;
    try {
      return String.fromCodePoint(n);
    } catch {
      return _;
    }
  });
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
    const n = Number.parseInt(hex, 16);
    if (Number.isNaN(n)) return _;
    try {
      return String.fromCodePoint(n);
    } catch {
      return _;
    }
  });
  return out;
}

/** Decode entities repeatedly so `&lt;p&gt;` becomes real tags that we then strip. */
function decodeHtmlEntitiesDeep(s: string, rounds = 3): string {
  let t = s;
  for (let i = 0; i < rounds; i++) {
    const next = decodeHtmlEntities(t);
    if (next === t) break;
    t = next;
  }
  return t;
}

/**
 * Turn RSS / CMS HTML (or accidental HTML inside TipTap text nodes) into readable plain text.
 * Decode entities first so escaped markup is not shown literally on the page.
 */
export function htmlToPlainText(htmlOrText: string | null | undefined, multiline = false): string {
  if (!htmlOrText) return '';
  let t = decodeHtmlEntitiesDeep(String(htmlOrText));
  if (multiline) {
    t = t.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');
  } else {
    t = t.replace(/<\/p>\s*<p[^>]*>/gi, ' ').replace(/<br\s*\/?>/gi, ' ');
  }
  t = t.replace(/<[^>]+>/g, ' ');
  return multiline
    ? t.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
    : t.replace(/\s+/g, ' ').trim();
}

/** Single-line headline from RSS HTML (tags + entities). */
export function rssPlainLine(htmlOrText: string | null | undefined): string {
  return htmlToPlainText(htmlOrText, false);
}

/** Safe string for React text nodes (listing cards, headings) — never show raw HTML. */
export function safeArticleText(s: string | null | undefined, fallback = ''): string {
  const t = rssPlainLine(s);
  return t.length > 0 ? t : fallback;
}

export function isFeedBodyPlaceholder(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  return t === FEED_EMPTY_BODY_PLACEHOLDER || t.includes(FEED_EMPTY_BODY_PLACEHOLDER);
}

/** Locales where a leading "Interview:"-style Latin label is valid primary copy (do not strip). */
const LATIN_PRIMARY_LANGS = new Set(['en', 'fr', 'de', 'es', 'pt', 'sw', 'tr', 'id', 'ms']);

function stripLeadingLatinSummaryLabel(text: string, langCode: string): string {
  const code = (langCode || 'en').toLowerCase();
  if (LATIN_PRIMARY_LANGS.has(code)) return text;
  const colon = text.indexOf(':');
  if (colon < 3 || colon > 120) return text;
  const head = text.slice(0, colon);
  const tail = text.slice(colon + 1).trim();
  if (!tail) return text;
  if (!/^[A-Za-z0-9][A-Za-z0-9\s,''"()\-]{1,118}$/.test(head)) return text;
  if (!/[^\x00-\x7F\u200C\u200D]/.test(tail)) return text;
  return tail;
}

function trimSummaryEllipsisEnd(text: string): string {
  return text
    .replace(/[…⋯]+[\s]*$/u, '')
    .replace(/\.{2,}[\s]*$/u, '')
    .trim();
}

/**
 * Reader summary cleanup for non-English articles (matches API post-processing).
 * Fixes persisted rows where the model prefixed English labels or ended with a teaser ellipsis.
 */
export function sanitizeReaderSummaryForDisplay(text: string, langCode: string): string {
  let s = stripLeadingLatinSummaryLabel(text.trim(), langCode);
  s = trimSummaryEllipsisEnd(s);
  // UI guard for persisted teaser-like summaries that are effectively incomplete.
  if (/आइए जानते हैं|विस्तार से जानें|पूरा पढ़ें|पढ़िए|देखिए|जानिए/.test(s)) return '';
  if (/let'?s know|read on|read more|details (inside|below)|stay tuned/i.test(s)) return '';
  return s;
}
