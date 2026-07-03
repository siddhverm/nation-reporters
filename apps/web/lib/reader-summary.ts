import {
  rssPlainLine,
  sanitizeReaderSummaryForDisplay,
  stripSyndicationLinkbacks,
  stripWireHeadlinePrefix,
} from '@/lib/rss-plain-text';

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Inline newsletter promos, ad labels, and AU/UK bylines mashed into story text. */
function stripInlinePublisherChrome(text: string): string {
  let t = text;
  t = t.replace(/\bSign\s+up\s+for\s+(?:our\s+)?(?:Morning|Afternoon|Evening)\s+Edition[^\n.]*/gi, '');
  t = t.replace(/\bSign\s+up\s+for\s+our\s+[^\n.]{3,60}(?:newsletter|Edition)[^\n.]*/gi, '');
  t = t.replace(/\b(?:[A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?\s+)?reporter\s+at\s+[A-Z][^\n.]{2,60}\./gi, '');
  t = t.replace(/\bAdvertisem(?:ent)?\b/gi, ' ');
  t = t.replace(/\s*(Advertisement|Publicité|Werbung|Publicidad)\s*/gi, ' ');
  t = t.replace(/\b(Photo\s*:|Photos\s*:|Image\s*:|Pic\s*:|Picture\s*:|Caption\s*:)\s*[^\n.]{0,80}/gi, '');
  t = t.replace(/\b(Follow us on|Subscribe to|Subscribe for|Get our newsletter)\b[^\n.]*/gi, '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

function isBoilerplateLine(line: string, titleNorm: string): boolean {
  const t = line.trim();
  if (!t) return true;
  const low = t.toLowerCase();
  const norm = normalizeForCompare(t);
  if (titleNorm && (norm === titleNorm || (norm.startsWith(titleNorm) && t.length < titleNorm.length + 40))) {
    return true;
  }
  if (/^share:?\s*$/i.test(t) || /^fb\s*$/i.test(low) || /^x\s*$/i.test(low)) return true;
  if (/^share:\s*(fb|x|twitter|whatsapp)/i.test(t)) return true;
  if (/^(updated on|published|posted on|last updated):/i.test(low)) return true;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d/i.test(low)) return true;
  if (
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d{1,2}\s+\w+[,]?\s+\d{4}\s+at\s+/i.test(
      low,
    )
  ) {
    return true;
  }
  if (/^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(low)) return true;
  if (/प्रकाशित\s+\d+\s*(मिनट|घंटे|दिन)\s*पहले/u.test(t)) return true;
  if (/published\s+\d+\s*(minute|hour|day)s?\s+ago/i.test(low)) return true;
  if (/^(video caption|वीडियो कैप्शन)/i.test(low)) return true;
  if (/^image credit:/i.test(low)) return true;
  if (/^read more:?\s*https?:\/\//i.test(t)) return true;
  if (/^read full report at source\.?$/i.test(low)) return true;
  if (/^full details are available on the original publisher page\.?$/i.test(low)) return true;
  if (/^source:\s*.+syndicated summary/i.test(low)) return true;
  if (/original reporting at source/i.test(low)) return true;
  if (/^\d+\s*(मिनट|घंटे?|दिन|सेकंड)\s*पहले$/.test(t)) return true;
  if (/^लेखक\s*:/.test(t)) return true;
  if (/^कॉपी\s*लिंक$/.test(t)) return true;
  if (/^(Hindi\s*News|Bhaskar\s*Khaas?|Khabar\s*Hatke|खबर\s*हटके|भास्कर\s*खास)$/i.test(t)) return true;
  if (/पूरी\s*खबर\s*पढ़ें\s*ऐप|ऐप\s*पर\s*पढ़ें|QR\s*स्कैन|प्रीमियम\s*मेंबरशिप|अधूरा\s*नहीं|पढ़िए\s*पूरा/u.test(t)) return true;
  if (/^by\s+[A-Z][a-z]+(\s+[A-Z][a-z]+){0,3}$/.test(t)) return true;
  if (/^according to\s+/i.test(low)) return true;
  if (/^(Photo|Photos|Image|Pic|Picture|Caption)\s*:/i.test(t) && t.length < 150) return true;
  if (/^(Advertisement|Advertisem|Publicité|Werbung|Publicidad)$/i.test(t)) return true;
  if (/^Sign\s+up\s+for\s+(?:our\s+)?/i.test(t) && t.length < 120) return true;
  if (/\breporter\s+at\s+[A-Z]/i.test(t) && t.length < 100) return true;
  if (/^(Follow us on|Subscribe to|Subscribe for|Newsletter|Get our)/i.test(t) && t.length < 120) return true;
  if (
    /^(Brisbane\s+Times|Sydney\s+Morning\s+Herald|The\s+Age|WAtoday|Perth\s+Now|Canberra\s+Times|Fairfax|nine\.com\.au)/i.test(
      t,
    ) &&
    t.length < 80
  ) {
    return true;
  }
  if (t.length < 4) return true;
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  return false;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Syndicated excerpt still stored with Share rows / dates / glued headline. */
export function excerptLooksBroken(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return true;
  if (t.length < 200) return true;
  if (/share:\s*(fb|x)/i.test(t)) return true;
  if (/प्रकाशित\s+\d+\s*मिनट/u.test(t)) return true;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d/i.test(t.toLowerCase())) return true;
  if (
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d{1,2}\s+\w+[,]?\s+\d{4}\s+at\s+/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/वीडियो कैप्शन/i.test(t)) return true;
  if (!/[.!?।]["')\]]?\s*$/u.test(t) && t.length < 500) return true;
  return false;
}

function preformatMashedPlain(plain: string, headline?: string): string {
  let t = plain;
  t = t.replace(/\bShare:\s*/gi, '\n\nShare: ');
  t = t.replace(/\bShare:\s*(FB|X)(\s*(FB|X))*\b/gi, '\n');
  t = t.replace(/\b(Updated on|Published|Posted on):/gi, '\n$& ');
  t = t.replace(
    /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+\d{1,2}\s+\w+[,]?\s+\d{4}\s+at\s+[\d:.]+\s*(am|pm)?/gi,
    '\n',
  );
  t = t.replace(
    /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+\d{1,2}\s+\w+/gi,
    '\n$&\n',
  );
  t = t.replace(/प्रकाशित\s+\d+\s*(मिनट|घंटे|दिन)\s*पहले/gu, '\n$&\n');
  t = t.replace(/वीडियो कैप्शन/gu, '\n$&\n');
  t = t.replace(/(लेखक\s*:\s*[^\n]+)/gu, '\n$1\n');
  t = t.replace(/(कॉपी\s*लिंक)/gu, '\n$1\n');
  t = stripInlinePublisherChrome(t);
  const title = stripWireHeadlinePrefix((headline ?? '').trim());
  if (title.length > 16) {
    const re = new RegExp(`(${escapeRegExp(title)})\\s*\\1+`, 'gu');
    t = t.replace(re, title);
    if (t.startsWith(title)) {
      t = t.slice(title.length).replace(/^[\s:–—-]+/, '').trim();
    }
  }
  return t;
}

export function stripPublisherFeedBoilerplate(text: string, headline?: string): string {
  const title = stripWireHeadlinePrefix((headline ?? '').trim());
  const titleNorm = normalizeForCompare(title);
  const prepped = preformatMashedPlain(text, title);

  const lines = prepped
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const line of lines) {
    if (isBoilerplateLine(line, titleNorm)) continue;
    kept.push(line);
  }

  let joined = stripSyndicationLinkbacks(kept.join('\n\n').trim());
  joined = stripInlinePublisherChrome(joined);
  if (title && titleNorm) {
    joined = joined.replace(new RegExp(`^${escapeRegExp(title)}\\s*`, 'u'), '').trim();
    joined = joined.replace(new RegExp(`${escapeRegExp(title)}{2,}`, 'gu'), title).trim();
  }
  return joined;
}

/** Build a complete reader summary for the Summary box (display-side + matches API ingestion). */
export function buildReaderSummaryFromPlainText(
  plain: string,
  headline?: string,
  opts?: { minChars?: number; maxChars?: number },
): string {
  const minChars = opts?.minChars ?? 280;
  const maxChars = opts?.maxChars ?? 1200;

  let cleaned = stripPublisherFeedBoilerplate(plain, headline);
  cleaned = stripSyndicationLinkbacks(cleaned);
  if (!cleaned) return '';

  let paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40 && !isBoilerplateLine(p, normalizeForCompare(headline ?? '')));

  if (paragraphs.length <= 1 && cleaned.length > 180) {
    const flat = cleaned.replace(/\s+/g, ' ').trim();
    const sents = splitSentences(flat).filter(
      (s) => s.length > 30 && !isBoilerplateLine(s, normalizeForCompare(headline ?? '')),
    );
    if (sents.length >= 2) paragraphs = sents;
  }

  const parts: string[] = [];
  for (const p of paragraphs) {
    parts.push(p);
    const joined = parts.join(' ');
    if (joined.length >= minChars && splitSentences(joined).length >= 2) break;
    if (joined.length >= maxChars) break;
  }

  let summary = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!summary) summary = cleaned.replace(/\s+/g, ' ').trim();

  if (summary.length > maxChars) {
    const cut = summary.slice(0, maxChars);
    const last = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('।'),
    );
    summary = last > minChars ? cut.slice(0, last + 1).trim() : `${cut.trim()}…`;
  }

  return summary;
}

function isSummaryTitleEcho(summary: string, headline: string): boolean {
  const s = summary.trim();
  const h = stripWireHeadlinePrefix(headline.trim());
  if (!s || !h) return false;
  const ns = normalizeForCompare(s);
  const nh = normalizeForCompare(h);
  if (ns === nh) return true;
  if (s.length <= h.length + 55 && (ns.startsWith(nh) || nh.startsWith(ns))) return true;
  if (s.length >= h.length * 2.2 && s.length >= 100) return false;
  const hw = nh.split(/\s+/).filter((w) => w.length > 2);
  if (hw.length === 0) return false;
  const sw = new Set(ns.split(/\s+/).filter((w) => w.length > 2));
  let hit = 0;
  for (const w of hw) if (sw.has(w)) hit++;
  return hit / hw.length >= 0.88 && s.length < Math.max(320, h.length + 120);
}

export type ArticleSummaryFields = {
  excerpt?: string | null;
  bodyShort?: string | null;
  bodyMedium?: string | null;
  seoDescription?: string | null;
  body?: { aiVideo?: { summary?: string } } | null;
};

/** Collect plain-text candidates longest-first for summary rebuilding. */
export function collectArticlePlainParts(
  article: ArticleSummaryFields,
  bodyParagraphs: string[] = [],
): string[] {
  const raw: string[] = [];
  const push = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    if (t.length > 20) raw.push(t);
  };
  push(article.body?.aiVideo?.summary);
  push(article.bodyMedium);
  push(article.bodyShort);
  for (const p of bodyParagraphs) push(p);
  push(article.excerpt);
  push(article.seoDescription);

  const seen = new Set<string>();
  return raw
    .map((t) => rssPlainLine(t) || t)
    .filter((t) => {
      const key = normalizeForCompare(t);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.length - a.length);
}

/**
 * Best reader-facing summary: always rebuild from richest plain text, not raw stored excerpt.
 */
export function resolveArticleReaderSummary(
  article: ArticleSummaryFields,
  headline: string,
  bodyParagraphs: string[] = [],
  opts?: { minChars?: number; lang?: string },
): string {
  const minChars = opts?.minChars ?? 220;
  const lang = (opts?.lang ?? 'en').toLowerCase();
  const title = stripWireHeadlinePrefix(stripSyndicationLinkbacks(rssPlainLine(headline) || headline.trim()));
  const parts = collectArticlePlainParts(article, bodyParagraphs);

  const finalize = (s: string) => {
    const cleaned = sanitizeReaderSummaryForDisplay(s, lang);
    const base = cleaned || stripPublisherFeedBoilerplate(stripSyndicationLinkbacks(s), title);
    return base.trim();
  };

  let best = '';
  for (const raw of parts) {
    const built = buildReaderSummaryFromPlainText(raw, title, { minChars, maxChars: 1200 });
    if (built.length > best.length && !isSummaryTitleEcho(built, title)) best = built;
  }

  if (best.length < minChars && parts.length > 0) {
    const combined = buildReaderSummaryFromPlainText(parts.join('\n\n'), title, { minChars, maxChars: 1200 });
    if (combined.length > best.length && !isSummaryTitleEcho(combined, title)) best = combined;
  }

  if (best.length >= minChars) return finalize(best);

  for (const raw of parts) {
    if (raw.length < minChars || isSummaryTitleEcho(raw, title)) continue;
    if (excerptLooksBroken(raw)) continue;
    const built = buildReaderSummaryFromPlainText(raw, title, { minChars: 120, maxChars: 1200 });
    if (built.length > best.length) best = built;
  }

  const out = finalize(best);
  if (out && !isSummaryTitleEcho(out, title)) return out;
  return '';
}

/** Card/listing teaser from excerpt only (when body is not loaded). */
export function formatListingExcerpt(
  excerpt: string | null | undefined,
  headline: string,
  lang = 'en',
): string {
  const raw = (excerpt ?? '').trim();
  if (!raw) return '';
  const title = stripWireHeadlinePrefix(rssPlainLine(headline) || headline.trim());
  const built = buildReaderSummaryFromPlainText(raw, title, { minChars: 80, maxChars: 280 });
  const text = built || stripPublisherFeedBoilerplate(raw, title);
  return sanitizeReaderSummaryForDisplay(text, lang).slice(0, 280).trim();
}
