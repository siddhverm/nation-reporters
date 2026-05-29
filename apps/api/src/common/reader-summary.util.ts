import { stripSyndicationLinkbacks, stripWireHeadlinePrefix } from './editorial-sanitize';

/** Drop syndication chrome (share rows, dates, thin captions) before summary/body storage. */
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
  // Dainik Bhaskar / Hindi publisher patterns
  t = t.replace(/(Hindi\s*News)(Bhaskar\s*[Kk]haas?)/gi, '\n$1\n$2\n');
  t = t.replace(/(Khabar\s*[Hh]atke|खबर\s*हटके)/gu, '\n$1\n');
  t = t.replace(/(\d+\s*(?:मिनट|घंटे?|दिन|सेकंड)\s*पहले)/gu, '\n$1\n');
  t = t.replace(/(लेखक\s*:\s*[^\n]+)/gu, '\n$1\n');
  t = t.replace(/(कॉपी\s*लिंक)/gu, '\n$1\n');
  // Strip Bhaskar app promo text before splitting into lines
  t = t.replace(/अधूरा\s*नहीं[!।]?\s*पढ़िए\s*पूरा[!।]?[^\n]*/gu, '');
  t = t.replace(/पूरी\s*खबर\s*पढ़ें\s*ऐप\s*पर[^\n]*/gu, '');
  t = t.replace(/पूरा\s*पढ़ें\s*ऐप\s*पर[^\n]*/gu, '');
  t = t.replace(/(?:एप|ऐप)\s*डाउनलोड[^\n]*/gu, '');
  t = t.replace(/QR\s*(?:स्कैन|scan)[^\n]*/gui, '');
  t = t.replace(/प्रीमियम\s*मेंबरशिप[^\n]*/gu, '');
  t = t.replace(/भास्कर\s*अपडेट्स\s*:/gu, '');
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

  const lines = preformatMashedPlain(text, headline)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const line of lines) {
    if (isBoilerplateLine(line, titleNorm)) continue;
    kept.push(line);
  }

  let joined = kept.join('\n\n').trim();
  if (title && titleNorm) {
    joined = joined.replace(new RegExp(`^${escapeRegExp(title)}\\s*`, 'u'), '').trim();
    joined = joined.replace(new RegExp(`${escapeRegExp(title)}{2,}`, 'gu'), title).trim();
  }
  return stripSyndicationLinkbacks(joined);
}

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
  if (/^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(low)) return true;
  if (/प्रकाशित\s+\d+\s*(मिनट|घंटे|दिन)\s*पहले/u.test(t)) return true;
  if (/published\s+\d+\s*(minute|hour|day)s?\s+ago/i.test(low)) return true;
  if (/^(video caption|वीडियो कैप्शन)/i.test(low)) return true;
  if (/^image credit:/i.test(low)) return true;
  if (/^read more:?\s*https?:\/\//i.test(t)) return true;
  if (/^read full report at source\.?$/i.test(low)) return true;
  if (/^full details are available on the original publisher page\.?$/i.test(low)) return true;
  // Hindi timestamp lines (e.g. "27 मिनट पहले")
  if (/^\d+\s*(मिनट|घंटे?|दिन|सेकंड)\s*पहले$/.test(t)) return true;
  // Author byline (लेखक: name)
  if (/^लेखक\s*:/.test(t)) return true;
  // Copy-link button text scraped into body
  if (/^कॉपी\s*लिंक$/.test(t)) return true;
  // Bhaskar / Hindi publisher section navigation breadcrumbs
  if (/^(Hindi\s*News|Bhaskar\s*Khaas?|Khabar\s*Hatke|खबर\s*हटके|भास्कर\s*खास)$/i.test(t)) return true;
  // App promo lines
  if (/पूरी\s*खबर\s*पढ़ें\s*ऐप|ऐप\s*पर\s*पढ़ें|QR\s*स्कैन|प्रीमियम\s*मेंबरशिप|अधूरा\s*नहीं|पढ़िए\s*पूरा/u.test(t)) return true;
  if (
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d{1,2}\s+\w+[,]?\s+\d{4}\s+at\s+/i.test(
      low,
    )
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

/**
 * Build a full reader summary from cleaned plain article text (raw-publish / fallback).
 */
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
  if (!summary) {
    summary = cleaned.replace(/\s+/g, ' ').trim();
  }

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

/** First block for bodyShort (~250 words), full cleaned text capped for bodyMedium. */
export function splitStoryBodies(
  plain: string,
  headline?: string,
): { bodyShort: string; bodyMedium: string; paragraphs: string[] } {
  const cleaned = stripPublisherFeedBoilerplate(plain, headline);
  const paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30 && !isBoilerplateLine(p, normalizeForCompare(headline ?? '')));

  const bodyShort = paragraphs.slice(0, 3).join('\n\n').slice(0, 2200).trim();
  const bodyMedium = paragraphs.join('\n\n').slice(0, 12000).trim();
  return { bodyShort, bodyMedium, paragraphs };
}
