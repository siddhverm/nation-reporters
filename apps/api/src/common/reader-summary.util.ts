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
  // "Published by: Name" and "Updated Day, Date IST" separators
  t = t.replace(/(Published\s+by\s*:\s*[^\n]+)/gi, '\n$1\n');
  t = t.replace(/(Updated\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n]+IST)/gi, '\n$1\n');
  // विज्ञापन (Advertisement) labels
  t = t.replace(/(विज्ञापन\d*)/gu, '\n$1\n');
  // Dainik Bhaskar footer breadcrumb that appears as inline suffix
  t = t.replace(/Hindi\s*News.*?Dainik\s*Bhaskar[^\n]*/gi, '');
  t = t.replace(/National.*?Breaking\s*News.*?Headlines.*?Dainik\s*Bhaskar[^\n]*/gi, '');
  // Multi-language "by author" / attribution separators
  t = t.replace(/(By\s+[A-Z][a-zA-Z\s]{2,30}(?:,\s*[A-Z][a-zA-Z\s]{2,20})?)\s*\|/g, '\n$1\n');
  t = t.replace(/(Reporter\s*:?\s*[A-Z][^\n]{2,40})/gi, '\n$1\n');
  // Bengali: প্রতিবেদক, আপডেট; Tamil: நிருபர்; Marathi: वार्ताहर; Gujarati: રિપોર્ટર
  t = t.replace(/(প্রতিবেদক\s*:\s*[^\n]+)/gu, '\n$1\n');
  t = t.replace(/(வெளியிட்டது|புதுப்பிக்கப்பட்டது)\s*:/gu, '\n$&\n');
  t = t.replace(/(وكالات|بقلم)\s*/gu, '\n$1 ');
  // Strip "Advertisement" / ad labels in common languages
  t = t.replace(/\b(Advertisement|Publicité|Werbung|Publicidad|Publicidade|Реклама|广告|広告|광고|İlan|Iklan)\b/gi, '');
  // Strip social media share chrome mashed inline
  t = t.replace(/\b(Follow us on|Subscribe|Newsletter)\b[^\n]*/gi, '');
  // Hindi/regional desk attribution lines mashed inline
  t = t.replace(/([ऀ-ॿ\w\s]*डेस्क\s*,[^\n।]{0,80}[।\n])/gu, '\n$1\n');
  // Known publisher name attribution lines (Hindi + regional)
  t = t.replace(/\b(अमर\s*उजाला|दैनिक\s*जागरण|नवभारत\s*टाइम्स|राजस्थान\s*पत्रिका|लाइव\s*हिंदुस्तान|आजतक|इंडिया\s*टुडे)\b/gu, '\n$&\n');
  // Bengali desk/reporter patterns
  t = t.replace(/(প্রতিনিধি|সংবাদদাতা|নিজস্ব\s*সংবাদদাতা)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  // Tamil reporter patterns
  t = t.replace(/(நமது\s*நிருபர்|சிறப்பு\s*நிருபர்|செய்தி\s*மேசை)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  // Marathi desk patterns
  t = t.replace(/(वार्ताहर|प्रतिनिधी|बातमीदार)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  // Urdu/Arabic by-line patterns
  t = t.replace(/(نامہ\s*نگار|رپورٹر|نمائندہ)\s*,?\s*[^\n]{0,60}/gu, '\n$&\n');
  // French/Spanish/Portuguese byline
  t = t.replace(/\b(Par\s+[A-ZÀÁÂÃÄÅÆÇ][^\n]{2,40})\s*[\|\-—]/g, '\n$1\n');
  // German "Von [Name]"
  t = t.replace(/\bVon\s+[A-ZÄÖÜ][a-zäöüß\s]{2,30}[\|\-—\n]/g, '\n$&\n');
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
  // "Updated Fri, 29 May 2026 06:30 AM IST" style timestamps
  if (/^Updated\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(t)) return true;
  if (/\b\d{1,2}:\d{2}\s*(AM|PM)\s*IST\b/i.test(t) && t.length < 60) return true;
  // "Published by: Name" editorial attribution
  if (/^Published\s+by\s*:/i.test(t)) return true;
  // Author byline patterns: "लेखक: name", "By name", "Reporter, City"
  if (/^लेखक\s*:/.test(t)) return true;
  if (/^By\s+[A-Z][\w\s]+$/.test(t) && t.length < 60) return true;
  // Reporter + city e.g. "सचिन कुमार, नई दिल्ली"
  if (/^[ऀ-ॿ\w][ऀ-ॿ\w\s]+,\s*(नई\s*दिल्ली|मुंबई|दिल्ली|कोलकाता|चेन्नई|बेंगलुरु|हैदराबाद|पुणे|जयपुर|लखनऊ|पटना|भोपाल|अहमदाबाद|सूरत|नागपुर)$/.test(t)) return true;
  // Advertisement label (विज्ञापन)
  if (/^विज्ञापन\d*$/.test(t)) return true;
  // Dainik Bhaskar footer breadcrumb
  if (/Hindi\s*News.*Dainik\s*Bhaskar/i.test(t)) return true;
  if (/National.*Breaking\s*News.*Headlines.*Dainik\s*Bhaskar/i.test(t)) return true;
  // Copy-link button text scraped into body
  if (/^कॉपी\s*लिंक$/.test(t)) return true;
  // Bhaskar / Hindi publisher section navigation breadcrumbs
  if (/^(Hindi\s*News|Bhaskar\s*Khaas?|Khabar\s*Hatke|खबर\s*हटके|भास्कर\s*खास)$/i.test(t)) return true;
  // App promo lines
  if (/पूरी\s*खबर\s*पढ़ें\s*ऐप|ऐप\s*पर\s*पढ़ें|QR\s*स्कैन|प्रीमियम\s*मेंबरशिप|अधूरा\s*नहीं|पढ़िए\s*पूरा/u.test(t)) return true;
  // Universal: advertisement labels in all languages
  if (/^(Advertisement|Publicité|Werbung|Publicidad|Publicidade|Реклама|广告|広告|광고|İlan|Iklan|विज्ञापन|Reklam)$/i.test(t)) return true;
  // Universal: "Follow us on [platform]" / subscription nudges
  if (/^(Follow us on|Subscribe to|Subscribe for|Newsletter|Get our|Sign up for)/i.test(t) && t.length < 120) return true;
  // Hindi desk attribution: "न्यूज डेस्क, अमर उजाला नई दिल्ली।" / "स्पोर्ट्स डेस्क, ..."
  if (/डेस्क\s*,/.test(t) && t.length < 140) return true;
  // Lines containing known Hindi publisher names with no sentence content
  if (/\b(अमर\s*उजाला|दैनिक\s*जागरण|नवभारत\s*टाइम्स|हिंदुस्तान\s*टाइम्स|राजस्थान\s*पत्रिका|पत्रिका|जनसत्ता|लाइव\s*हिंदुस्तान|न्यूज़?\s*18|ज़ी\s*न्यूज़?|इंडिया\s*टीवी|आजतक|इंडिया\s*टुडे)\b/u.test(t) && t.length < 120 && !/[।.!?]{1}[^।.!?]{20}/.test(t)) return true;
  // Bengali reporter attribution
  if (/^(প্রতিনিধি|সংবাদদাতা|নিজস্ব\s*সংবাদদাতা|ব্যুরো\s*চিফ)/.test(t) && t.length < 100) return true;
  // Tamil reporter attribution
  if (/^(நமது\s*நிருபர்|சிறப்பு\s*நிருபர்|செய்தி\s*மேசை|நிருபர்)/.test(t) && t.length < 100) return true;
  // Marathi reporter attribution
  if (/^(वार्ताहर|प्रतिनिधी|बातमीदार|विशेष\s*प्रतिनिधी)/.test(t) && t.length < 100) return true;
  // Urdu reporter attribution
  if (/^(نامہ\s*نگار|رپورٹر|نمائندہ|خصوصی\s*نمائندہ)/.test(t) && t.length < 100) return true;
  // Arabic reporter attribution
  if (/^(مراسل|مراسلنا|بقلم|كتب)/.test(t) && t.length < 100) return true;
  // French "Par [Name]" / German "Von [Name]" / Spanish "Por [Name]" bylines
  if (/^(Par|Von|Por|By|Di|Da)\s+[A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜ]/i.test(t) && t.length < 80) return true;
  // Gujarati reporter attribution
  if (/^(પ્રતિનિધિ|સંવાદદાતા|અહેવાલ)/.test(t) && t.length < 100) return true;
  // Punjabi reporter attribution
  if (/^(ਨਾਮਾਨਿਗਾਰ|ਪ੍ਰਤੀਨਿਧੀ|ਸੰਵਾਦਦਾਤਾ)/.test(t) && t.length < 100) return true;
  // Universal: lines that are just a timestamp with timezone (IST, GMT, EST, UTC, CET, JST etc.)
  if (/\d{1,2}:\d{2}\s*(AM|PM)?\s*(IST|GMT|UTC|EST|PST|CET|JST|KST|CST)\b/i.test(t) && t.length < 80) return true;
  // "Reporter: Name" / "By Name" short attribution lines
  if (/^(Reporter|Correspondent|Staff Reporter|Special Correspondent|ANI|PTI|AFP|AP|Reuters)\s*[:|,]/i.test(t)) return true;
  // Short numeric-only lines (ad counts, page numbers)
  if (/^\d{1,3}$/.test(t)) return true;
  // Source breadcrumb footer lines like "National > Breaking News > Hindi > Dainik Bhaskar"
  if (/\bDainik\s*Bhaskar\b|\bNDTV\b|\bTimes\s*of\s*India\b|\bHindustan\s*Times\b/i.test(t) && t.length < 120 && !/[।.!?]/.test(t)) return true;
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
