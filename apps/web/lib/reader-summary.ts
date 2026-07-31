import {
  rssPlainLine,
  sanitizeReaderSummaryForDisplay,
  stripSyndicationLinkbacks,
  stripWireHeadlinePrefix,
} from '@/lib/rss-plain-text';
import { KNOWN_SYNDICATION_OUTLET_LABELS } from '@/lib/known-syndication-outlets';

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

export type PublisherSanitizeOptions = {
  headline?: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
};

const INDIAN_DESK_SECTIONS =
  'Entertainment|Sports|World|India|Business|Tech|Lifestyle|Auto|Crime|National|Political|Bollywood|Cinema|Education|Health|Science|Movies|Web|TV|News|City|Metro|Opinion|Viral|Trending|Live|Breaking|Video|Photos?|Market|Economy';
const INDIAN_BUREAU_CITIES =
  'New\\s+Delhi|Mumbai|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad|Pune|Ahmedabad|Lucknow|Jaipur|Chandigarh|Gurugram|Noida|Patna|Bhopal|Kochi|Thiruvananthapuram';
const INDIAN_ENGLISH_OUTLETS =
  'India\\s+Today|NDTV|Hindustan\\s+Times|News18|Zee\\s+News|Aaj\\s+Tak|India\\s+TV|Live\\s+Hindustan|The\\s+Indian\\s+Express|Indian\\s+Express|The\\s+Hindu|Times\\s+of\\s+India|TOI|Moneycontrol|Economic\\s+Times|ET\\s+Online';

function collectSourceLabels(opts?: PublisherSanitizeOptions): string[] {
  const labels = new Set<string>();
  const name = (opts?.sourceName ?? '').trim();
  if (name.length > 2) {
    labels.add(name);
    const withoutThe = name.replace(/^the\s+/i, '').trim();
    if (withoutThe.length > 2 && withoutThe !== name) labels.add(withoutThe);
    const beforeDash = name.split(/\s*[-–—|]\s*/)[0]?.trim();
    if (beforeDash && beforeDash.length > 2) labels.add(beforeDash);
  }
  const rawUrl = (opts?.sourceUrl ?? '').trim();
  if (rawUrl) {
    try {
      const host = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).hostname.replace(/^www\./i, '');
      if (host.length > 3) labels.add(host);
    } catch {
      /* ignore */
    }
  }
  for (const known of KNOWN_SYNDICATION_OUTLET_LABELS) labels.add(known);
  return [...labels].sort((a, b) => b.length - a.length);
}

function normalizeMashedDeskBoundaries(text: string): string {
  let t = text;
  // Glued desk + city: "DeskNew Delhi" / "DeskMumbai"
  t = t.replace(
    /\bDesk(?=New\s*Delhi|Mumbai|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad|Pune|Ahmedabad|Lucknow|Jaipur|Chandigarh|Gurugram|Noida)/gi,
    'Desk ',
  );
  // Glued outlet + desk: "TodayEntertainment Desk" / "TimesEntertainment"
  t = t.replace(
    /\b(Today|Times|NDTV|News18|Express|Hindu|Bhaskar|Ujala)(?=(?:Entertainment|Sports|World|India|Business|Tech|Lifestyle|Bollywood|Cinema|Web|TV|News)\s+Desk)/gi,
    '$1 ',
  );
  t = t.replace(/,UPDATED/gi, ', UPDATED');
  t = t.replace(/\bUPDATED(?=[A-Za-z0-9])/gi, 'UPDATED ');
  // "New Delhi,UPDATED" already handled; also "DelhiUPDATED"
  t = t.replace(
    /\b(Delhi|Mumbai|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad)(?=UPDATED)/gi,
    '$1, ',
  );
  return t;
}

function stripIndianEnglishDeskChrome(text: string): string {
  let t = normalizeMashedDeskBoundaries(text);
  const desks = INDIAN_DESK_SECTIONS;
  const cities = INDIAN_BUREAU_CITIES;
  const outlets = INDIAN_ENGLISH_OUTLETS;
  // Month-day OR day-month date orders after UPDATED
  const updatedTail =
    '(?:(?:[A-Za-z]{3,9}\\s+\\d{1,2}|\\d{1,2}\\s+[A-Za-z]{3,9}),?\\s*\\d{4})?(?:\\s*\\d{1,2}:\\d{2}(?:\\s*(?:AM|PM))?(?:\\s*IST)?)?';
  t = t.replace(
    new RegExp(
      `(?:(?:${outlets})\\s+)?(?:${desks})\\s+Desk\\s*(?:${cities})?,?\\s*UPDATED\\s*${updatedTail}\\s*`,
      'gi',
    ),
    '',
  );
  t = t.replace(new RegExp(`^(?:(?:${outlets})\\s+)?(?:${desks})\\s+Desk\\s*(?:${cities})?,?\\s*`, 'im'), '');
  t = t.replace(new RegExp(`\\b(?:${outlets})\\s+(?:${desks})\\s+Desk\\b`, 'gi'), '');
  t = t.replace(new RegExp(`\\b(?:${desks})\\s+Desk\\b`, 'gi'), '');
  t = t.replace(new RegExp(`\\b(?:${cities}),?\\s*UPDATED\\s*${updatedTail}`, 'gi'), '');
  t = t.replace(new RegExp(`\\bUPDATED\\s+${updatedTail}`, 'gi'), '');
  t = t.replace(/^\s*UPDATED\s*$/gim, '');
  t = t.replace(/^\s*[\d:.]+\s*(?:AM|PM)?\s*IST\s*/gim, '');
  t = t.replace(/^[\s:–—|-]+/, '');
  // Chrome-only desk line with no story text
  t = t.replace(
    new RegExp(
      `^\\s*(?:(?:${outlets})\\s+)?(?:${desks})\\s+Desk\\s*(?:${cities})?,?\\s*UPDATED\\s*$`,
      'im',
    ),
    '',
  );
  return t.replace(/\s{2,}/g, ' ').trim();
}

function stripSourceAttribution(text: string, opts?: PublisherSanitizeOptions): string {
  let t = text;
  for (const label of collectSourceLabels(opts)) {
    const esc = escapeRegExp(label);
    t = t.replace(new RegExp(`^\\s*${esc}\\s*\\.?\\s*$`, 'gim'), '');
    t = t.replace(new RegExp(`\\breporter\\s+at\\s+${esc}\\s*\\.?`, 'gi'), '');
    t = t.replace(new RegExp(`\\baccording\\s+to\\s+${esc}\\b[^.\\n]{0,80}\\.?`, 'gi'), '');
    t = t.replace(new RegExp(`[|\\-–—]\\s*${esc}\\s*\\.?$`, 'gim'), '');
    t = t.replace(new RegExp(`\\b(?:Source|Via)\\s*:\\s*${esc}\\b[^.\\n]{0,80}\\.?`, 'gi'), '');
    t = t.replace(new RegExp(`\\b${esc}\\s+(?:${INDIAN_DESK_SECTIONS})\\s+Desk\\b`, 'gi'), '');
  }
  return t.replace(/\s{2,}/g, ' ').trim();
}

function stripInlinePublisherChrome(text: string): string {
  let t = stripIndianEnglishDeskChrome(text);
  t = t.replace(/\bSign\s+up\s+for\s+(?:our\s+)?(?:Morning|Afternoon|Evening)\s+Edition\b\.?\s*/gi, '');
  t = t.replace(/\bSign\s+up\s+for\s+our\s+[^\n]{3,60}?\b(?:newsletter|Edition)\b\.?\s*/gi, '');
  t = t.replace(
    /\b(?:[A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?\s+)?reporter\s+at\s+[A-Z][A-Za-z0-9\s.&'-]{2,60}\.?/gi,
    '',
  );
  t = t.replace(/\bAdvertisem(?:ent)?\b/gi, ' ');
  t = t.replace(/\bMorning\s+Edition\b/gi, ' ');
  t = t.replace(/\s*(Advertisement|Publicité|Werbung|Publicidad)\s*/gi, ' ');
  t = t.replace(/\b(Photo\s*:|Photos\s*:|Image\s*:|Pic\s*:|Picture\s*:|Caption\s*:)\s*[^\n.]{0,80}/gi, '');
  t = t.replace(/\b(Follow us on|Subscribe to|Subscribe for|Get our newsletter)\b[^\n.]*/gi, '');
  t = t.replace(/\bImage\s+notice\s*:\s*[^\n.]*/gi, '');
  t = t.replace(/\bArticle\s+image\s+is\s+shown\s+when\s+available[^\n.]*/gi, '');
  t = t.replace(
    /(?:^|\n)\s*[ऀ-ॿA-Za-z\s]{0,40}डेस्क\s*,\s*[^\n।.!?]{0,100}[।.]?\s*/gu,
    '\n',
  );
  // Leading outlet-only prefixes left after desk strip
  t = t.replace(
    /^(?:India\s+Today|NDTV|Hindustan\s+Times|Times\s+of\s+India|TOI|News18|The\s+Hindu|Indian\s+Express|Brisbane\s+Times|BBC\s+News|Reuters|AFP|ANI|PTI)\s*[:|–—-]?\s*/i,
    '',
  );
  return t.replace(/\s{2,}/g, ' ').trim();
}

function isBoilerplateLine(line: string, titleNorm: string, sourceLabels: string[] = []): boolean {
  const t = line.trim();
  if (!t) return true;
  const low = t.toLowerCase();
  const norm = normalizeForCompare(t);
  if (titleNorm && (norm === titleNorm || (norm.startsWith(titleNorm) && t.length < titleNorm.length + 40))) {
    return true;
  }
  for (const label of sourceLabels) {
    const ln = normalizeForCompare(label);
    if (!ln) continue;
    if (norm === ln) return true;
    if (t.length < ln.length + 55 && norm.includes(ln) && /reporter\s+at|according\s+to|^source:|^via\b/i.test(low)) {
      return true;
    }
  }
  if (
    new RegExp(`(?:${INDIAN_ENGLISH_OUTLETS}).*(?:${INDIAN_DESK_SECTIONS})\\s+Desk`, 'i').test(t) &&
    t.length < 120
  ) {
    return true;
  }
  if (new RegExp(`^(?:${INDIAN_DESK_SECTIONS})\\s+Desk\\b`, 'i').test(t) && t.length < 100) return true;
  if (/^(?:New\s+Delhi|Mumbai|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad|Pune),?\s*UPDATED/i.test(t)) {
    const remainder = t
      .replace(
        /^(?:New\s+Delhi|Mumbai|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad|Pune),?\s*UPDATED(?:\s+[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4})?(?:\s*\d{1,2}:\d{2}(?:\s*(?:AM|PM))?(?:\s*IST)?)?/i,
        '',
      )
      .trim();
    if (remainder.length < 40) return true;
  }
  if (/^UPDATED\b/i.test(t) && t.length < 80) return true;
  if (/^share:?\s*$/i.test(t) || /^fb\s*$/i.test(low) || /^x\s*$/i.test(low)) return true;
  if (/^share:\s*(fb|x|twitter|whatsapp)/i.test(t)) return true;
  if (/^(updated on|published|posted on|last updated):/i.test(low)) return true;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d/i.test(low)) return true;
  if (
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d{1,2}\s+\w+[,]?\s+\d{4}\s+at\s+/i.test(low)
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
    /^(Brisbane\s+Times|Sydney\s+Morning\s+Herald|The\s+Age|WAtoday|Perth\s+Now|Canberra\s+Times|Fairfax|nine\.com\.au|India\s+Today|NDTV|Hindustan\s+Times)$/i.test(
      t,
    ) &&
    t.length < 80
  ) {
    return true;
  }
  if (/^Image\s+notice\s*:/i.test(t)) return true;
  if (/Article\s+image\s+is\s+shown\s+when\s+available/i.test(t)) return true;
  // Multilingual reporter / desk short lines
  if (/^(প্রতিনিধি|সংবাদদাতা|நமது\s*நிருபர்|वार्ताहर|प्रतिनिधी|نامہ\s*نگار|مراسلنا)/.test(t) && t.length < 100) return true;
  if (/^(Par|Von|Por|By|Di|Da)\s+[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜ]/i.test(t) && t.length < 80) return true;
  if (/डेस्क\s*,/.test(t) && t.length < 140) return true;
  if (t.length < 4) return true;
  if (/^https?:\/\/\S+$/i.test(t)) return true;
  return false;
}

export function isPublisherBoilerplateLine(line: string, headline?: string): boolean {
  const title = stripWireHeadlinePrefix((headline ?? '').trim());
  return isBoilerplateLine(line.trim(), normalizeForCompare(title), collectSourceLabels());
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function excerptLooksBroken(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return true;
  if (t.length < 200) return true;
  if (/share:\s*(fb|x)/i.test(t)) return true;
  if (/प्रकाशित\s+\d+\s*मिनट/u.test(t)) return true;
  if (/Entertainment\s+Desk|DeskNew\s*Delhi|,UPDATED/i.test(t)) return true;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d/i.test(t.toLowerCase())) return true;
  if (
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d{1,2}\s+\w+[,]?\s+\d{4}\s+at\s+/i.test(t)
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
  t = t.replace(/\b(Sign\s+up\s+for\s+(?:our\s+)?(?:Morning|Afternoon|Evening)\s+Edition)\b/gi, '\n$1\n');
  t = t.replace(/(\breporter\s+at\s+[A-Z][A-Za-z0-9\s.&'-]{2,80}\.?)/gi, '\n$1\n');
  t = t.replace(/\bAdvertisem(?:ent)?\b/gi, '\n$&\n');
  // Hindi/regional desk attribution mashed inline
  t = t.replace(/([ऀ-ॿ\w\s]*डेस्क\s*,[^\n।]{0,80}[।\n])/gu, '\n$1\n');
  t = t.replace(
    /\b(अमर\s*उजाला|दैनिक\s*जागरण|नवभारत\s*टाइम्स|राजस्थान\s*पत्रिका|लाइव\s*हिंदुस्तान|आजतक|इंडिया\s*टुडे)\b/gu,
    '\n$&\n',
  );
  t = t.replace(/(প্রতিনিধি|সংবাদদাতা|নিজস্ব\s*সংবাদদাতা)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  t = t.replace(/(நமது\s*நிருபர்|சிறப்பு\s*நிருபர்|செய்தி\s*மேசை)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  t = t.replace(/(वार्ताहर|प्रतिनिधी|बातमीदार)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  t = t.replace(/(نامہ\s*نگار|رپورٹر|نمائندہ)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  t = t.replace(/(مراسلنا|مراسل)\s+في\s+[^\n.،]{0,40}[.،\n]/gu, '\n$&\n');
  t = t.replace(/\b(PTI|ANI|AFP|AP|Reuters|IANS|UNI)\s*:/gi, '\n$&\n');
  t = t.replace(/\bDesk(?=New\s*Delhi|Mumbai|Bengaluru|Bangalore|Chennai|Kolkata|Hyderabad)/gi, 'Desk ');
  t = t.replace(/,UPDATED/gi, ', UPDATED');
  t = t.replace(/\bUPDATED(?=[A-Za-z0-9])/gi, 'UPDATED ');
  t = t.replace(
    /\b(?:India\s+Today|NDTV|Hindustan\s+Times|News18|Times\s+of\s+India|TOI)?\s*(?:Entertainment|Sports|World|India|Business|Tech|Lifestyle|Bollywood|Cinema|National|Political|Web|TV|News|City|Metro|Live|Breaking)\s+Desk\b/gi,
    '\n$&\n',
  );
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

export function sanitizePublisherStoryText(
  text: string,
  opts: PublisherSanitizeOptions = {},
): string {
  if (!text?.trim()) return '';
  return stripPublisherFeedBoilerplate(text, opts.headline, opts);
}

export function stripPublisherFeedBoilerplate(
  text: string,
  headline?: string,
  sourceOpts?: PublisherSanitizeOptions,
): string {
  const title = stripWireHeadlinePrefix((headline ?? sourceOpts?.headline ?? '').trim());
  const titleNorm = normalizeForCompare(title);
  const sourceLabels = collectSourceLabels(sourceOpts);
  const prepped = preformatMashedPlain(text, title);

  const lines = prepped
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const line of lines) {
    const cleanedLine = stripIndianEnglishDeskChrome(line).replace(/^[\s:–—|-]+/, '').trim();
    if (!cleanedLine) continue;
    if (isBoilerplateLine(cleanedLine, titleNorm, sourceLabels)) continue;
    kept.push(cleanedLine);
  }

  let joined = stripSyndicationLinkbacks(kept.join('\n\n').trim());
  joined = stripInlinePublisherChrome(joined);
  joined = stripSourceAttribution(joined, sourceOpts);
  if (title && titleNorm) {
    joined = joined.replace(new RegExp(`^${escapeRegExp(title)}\\s*`, 'u'), '').trim();
    joined = joined.replace(new RegExp(`${escapeRegExp(title)}{2,}`, 'gu'), title).trim();
  }
  joined = joined.replace(/^[\s:–—|-]+/, '').trim();
  return joined;
}

export function buildReaderSummaryFromPlainText(
  plain: string,
  headline?: string,
  opts?: { minChars?: number; maxChars?: number; sourceName?: string | null; sourceUrl?: string | null },
): string {
  const minChars = opts?.minChars ?? 80;
  const maxChars = opts?.maxChars ?? 1200;
  const sourceOpts: PublisherSanitizeOptions = {
    headline,
    sourceName: opts?.sourceName,
    sourceUrl: opts?.sourceUrl,
  };
  const sourceLabels = collectSourceLabels(sourceOpts);

  let cleaned = sanitizePublisherStoryText(plain, sourceOpts);
  cleaned = stripSyndicationLinkbacks(cleaned);
  if (!cleaned) return '';

  let paragraphs = cleaned
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40 && !isBoilerplateLine(p, normalizeForCompare(headline ?? ''), sourceLabels));

  if (paragraphs.length <= 1 && cleaned.length > 120) {
    const flat = cleaned.replace(/\s+/g, ' ').trim();
    const sents = splitSentences(flat).filter(
      (s) => s.length > 25 && !isBoilerplateLine(s, normalizeForCompare(headline ?? ''), sourceLabels),
    );
    if (sents.length >= 1) paragraphs = sents;
  }

  const parts: string[] = [];
  for (const p of paragraphs) {
    parts.push(p);
    const joined = parts.join(' ');
    if (joined.length >= minChars && splitSentences(joined).length >= 1) break;
    if (joined.length >= maxChars) break;
  }

  let summary = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!summary) summary = cleaned.replace(/\s+/g, ' ').trim();
  // If we still fell short of minChars, keep whatever clean prose we have (display layer decides).
  if (summary.length < Math.min(minChars, 80) && cleaned.length >= 28) {
    summary = cleaned.replace(/\s+/g, ' ').trim().slice(0, maxChars);
  }

  if (summary.length > maxChars) {
    const cut = summary.slice(0, maxChars);
    const last = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('।'),
    );
    summary = last > Math.min(minChars, 80) ? cut.slice(0, last + 1).trim() : `${cut.trim()}…`;
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

export function resolveArticleReaderSummary(
  article: ArticleSummaryFields,
  headline: string,
  bodyParagraphs: string[] = [],
  opts?: { minChars?: number; lang?: string; sourceName?: string | null; sourceUrl?: string | null },
): string {
  const minChars = opts?.minChars ?? 80;
  const lang = (opts?.lang ?? 'en').toLowerCase();
  const title = stripWireHeadlinePrefix(stripSyndicationLinkbacks(rssPlainLine(headline) || headline.trim()));
  const parts = collectArticlePlainParts(article, bodyParagraphs);
  const sourceOpts = { sourceName: opts?.sourceName, sourceUrl: opts?.sourceUrl };

  const finalize = (s: string) => {
    const stripped = sanitizePublisherStoryText(stripSyndicationLinkbacks(s), {
      headline: title,
      ...sourceOpts,
    });
    const cleaned = sanitizeReaderSummaryForDisplay(stripped || '', lang);
    const out = (cleaned || stripped || '').trim();
    if (out.length >= 28) return out;
    // Do NOT fall back to unsanitized text — that reintroduces desk/outlet chrome.
    return out;
  };

  let best = '';
  for (const raw of parts) {
    const built = buildReaderSummaryFromPlainText(raw, title, { minChars, maxChars: 1200, ...sourceOpts });
    if (built.length > best.length && !isSummaryTitleEcho(built, title)) best = built;
  }

  if (best.length < minChars && parts.length > 0) {
    const combined = buildReaderSummaryFromPlainText(parts.join('\n\n'), title, {
      minChars,
      maxChars: 1200,
      ...sourceOpts,
    });
    if (combined.length > best.length && !isSummaryTitleEcho(combined, title)) best = combined;
  }

  if (best.length >= minChars) return finalize(best);

  for (const raw of parts) {
    if (raw.length < 40 || isSummaryTitleEcho(raw, title)) continue;
    if (excerptLooksBroken(raw) && raw.length < 200) continue;
    const built = buildReaderSummaryFromPlainText(raw, title, { minChars: 40, maxChars: 1200, ...sourceOpts });
    if (built.length > best.length) best = built;
  }

  const out = finalize(best);
  if (out && !isSummaryTitleEcho(out, title)) return out;
  return '';
}

export function formatListingExcerpt(
  excerpt: string | null | undefined,
  headline: string,
  lang = 'en',
  sourceOpts?: { sourceName?: string | null; sourceUrl?: string | null },
): string {
  const raw = (excerpt ?? '').trim();
  if (!raw) return '';
  const title = stripWireHeadlinePrefix(rssPlainLine(headline) || headline.trim());
  const built = buildReaderSummaryFromPlainText(raw, title, {
    minChars: 80,
    maxChars: 280,
    ...sourceOpts,
  });
  const text = built || sanitizePublisherStoryText(raw, { headline: title, ...sourceOpts });
  return sanitizeReaderSummaryForDisplay(text, lang).slice(0, 280).trim();
}
