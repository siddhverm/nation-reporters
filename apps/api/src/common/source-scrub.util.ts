/**
 * scrubSourceMentions — removes or neutralises references to the original publisher / agency in reader-facing text,
 * keeping the sentence grammatical:
 *   "A hospital note accessed by TOI stated…"   → "A hospital note accessed by reporters stated…"
 *   "…the TOI report suggesting a bullet…"       → "…the report suggesting a bullet…"
 *   "according to Reuters, prices fell"          → "according to reports, prices fell"
 *   "(PTI)", "– TNN", "Edited by X / TNN / date", "Download the TOI app", "TOI community guidelines" → removed
 *
 * Two tiers of names:
 *  - STRONG (unambiguous: "TOI", "Times of India", "PTI", "Reuters", "NDTV", every domain/brand taken from the
 *    sources table …): neutralised in any position.
 *  - WEAK (ordinary words/abbreviations: "AP", "HT", "ET", "Mint", "The Hindu", "Tribune", "Express" …): only
 *    neutralised in attribution context (according to X / X reported / told X / (X) / – X), and case-sensitively,
 *    so "the Hindu festival", "Andhra Pradesh (AP) government" style text and "automotive" are left alone.
 * Matching is case-insensitive for strong names and never matches inside a longer word (Unicode-aware boundaries).
 *
 * Pure and dependency-free. Dynamic names (Source.name / domain-derived brands of all sources) come from `extraNames`
 * or from the process-wide registry (registerSourceNames), which the API refreshes from the sources table.
 */

/** Unambiguous outlet / agency names (matched case-insensitively, anywhere). */
export const STRONG_OUTLET_NAMES: readonly string[] = [
  'TOI', 'TOI.com', 'TIMESOFINDIA.COM', 'timesofindia.indiatimes.com', 'Times of India', 'The Times of India', 'Times Now', 'TimesNow', 'TNN', 'indiatimes.com',
  'PTI', 'Press Trust of India', 'ANI', 'IANS', 'Indo-Asian News Service', 'Asian News International',
  'NDTV', 'NDTV.com', 'ndtv.com', 'Hindustan Times', 'hindustantimes.com', 'India Today', 'indiatoday.in', 'The Indian Express', 'Indian Express', 'indianexpress.com',
  'News18', 'Zee News', 'ZeeNews', 'Aaj Tak', 'AajTak', 'India TV', 'Republic World', 'Republic TV', 'CNBC-TV18', 'CNBC TV18', 'CNBC',
  'Economic Times', 'The Economic Times', 'economictimes.com', 'ET Now', 'ETNow', 'Moneycontrol', 'Livemint', 'LiveMint', 'livemint.com', 'Firstpost', 'Deccan Herald',
  'Deccan Chronicle', 'The Tribune', 'Tribune India', 'The Telegraph India', 'Business Standard', 'Financial Express', 'ThePrint', 'Scroll.in',
  'Dainik Bhaskar', 'Amar Ujala', 'Dainik Jagran', 'Navbharat Times', 'Rajasthan Patrika', 'Jansatta', 'Live Hindustan', 'Anandabazar Patrika', 'Eenadu', 'Lokmat',
  'Reuters', 'Associated Press', 'AP News', 'AFP', 'Agence France-Presse', 'BBC', 'BBC News', 'BBC Sport', 'bbc.co.uk', 'bbc.com', 'CNN', 'CNN.com', 'Fox News',
  'The New York Times', 'New York Times', 'NYTimes', 'Washington Post', 'The Washington Post', 'Daily Mail', 'Al Jazeera', 'Sky News', 'Gulf News', 'Khaleej Times',
  'Brisbane Times', 'Sydney Morning Herald', 'Fairfax Media', 'Deutsche Welle', 'Le Monde', 'Le Figaro', 'Der Spiegel', 'El País',
  'Press Association', 'ABC News',
];

/** Ordinary words / short abbreviations / surnames: only neutralised in attribution context, case-sensitively. */
export const WEAK_OUTLET_NAMES: readonly string[] = [
  'AP', 'HT', 'ET', 'UNI', 'The Hindu', 'Mint', 'Tribune', 'Express', 'The Age', 'Patrika', 'Sakal', 'Bild', 'Bloomberg', 'The Guardian', 'The Wire', 'The Print',
];

const GENERIC_WORDS = new Set([
  'news', 'india', 'world', 'today', 'times', 'daily', 'the', 'top', 'stories', 'latest', 'headlines', 'national', 'international', 'business', 'sports', 'sport',
  'live', 'online', 'digital', 'feed', 'rss', 'updates', 'update', 'breaking', 'express', 'post', 'mail', 'hindu', 'standard', 'age', 'mirror', 'sun', 'tribune', 'mint',
  'general', 'main', 'home', 'all', 'english', 'hindi', 'regional', 'manual', 'url', 'ingest', 'manual url ingest',
]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── dynamic registry ────────────────────────────────────────────────────────────────────────────────────────────────
let REGISTERED: string[] = [];
/** Replace the process-wide list of publisher names (from the sources table). Idempotent. */
export function registerSourceNames(names: readonly (string | null | undefined)[]): void {
  REGISTERED = [...new Set(names.map((n) => (n ?? '').trim()).filter((n) => n.length >= 2))];
  cache.clear();
}
export function registeredSourceNames(): readonly string[] { return REGISTERED; }

/** Brand variants for one source row (name, name without "The"/suffix after a dash, domain and bare domain label). */
export function sourceNameVariants(name?: string | null, urlOrHost?: string | null): string[] {
  const out = new Set<string>();
  const n = (name ?? '').trim();
  if (n.length >= 2) {
    out.add(n);
    const noThe = n.replace(/^the\s+/i, '').trim();
    if (noThe.length >= 2) out.add(noThe);
    const beforeDash = n.split(/\s*[-–—|:]\s*/)[0]?.trim();
    if (beforeDash && beforeDash.length >= 2) {
      out.add(beforeDash);
      out.add(beforeDash.replace(/^the\s+/i, '').trim());
    }
    // "(English)" / "– Top Stories" style feed suffixes
    const noParen = n.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (noParen.length >= 2) out.add(noParen);
    // Initialism of a multi-word name ("Hindustan Times" → "HT"): weak, handled by the tier logic (<=3 letters)
    const words = beforeDash?.replace(/^the\s+/i, '').split(/\s+/).filter((w) => /^[\p{Lu}]/u.test(w)) ?? [];
    if (words.length >= 2) {
      const ini = words.map((w) => w[0]).join('').toUpperCase();
      if (ini.length >= 2 && ini.length <= 4) out.add(ini);
    }
  }
  const raw = (urlOrHost ?? '').trim();
  if (raw) {
    try {
      const host = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, '');
      if (host.includes('.')) {
        out.add(host);
        const labels = host.split('.');
        const tldLen = labels.length >= 3 && labels[labels.length - 1].length === 2 && ['co', 'com', 'org', 'net', 'gov', 'ac'].includes(labels[labels.length - 2]) ? 2 : 1;
        const brand = labels.slice(0, labels.length - tldLen).pop();
        if (brand && brand.length >= 4) out.add(brand);
      }
    } catch { /* ignore */ }
  }
  return [...out].filter((x) => x.length >= 2);
}

// ── name classification + compiled patterns ─────────────────────────────────────────────────────────────────────────
function isWeak(name: string): boolean {
  const n = name.trim();
  if (WEAK_OUTLET_NAMES.includes(n)) return true;
  if (/^[A-Z]{2,3}$/.test(n) && !STRONG_OUTLET_NAMES.includes(n)) return true; // short abbreviations
  const key = n.toLowerCase().replace(/^the\s+/, '');
  if (GENERIC_WORDS.has(key)) return true;
  // every word generic ("Top Stories", "Latest News")
  if (key.split(/\s+/).every((w) => GENERIC_WORDS.has(w))) return true;
  return false;
}

/** Whole-name boundary that works for every script (JS \b is ASCII-only). */
function nameAlt(names: string[]): string {
  return [...new Set(names)].sort((a, b) => b.length - a.length).map((n) => {
    // allow flexible whitespace and optional dots between initials ("T.O.I.")
    return escapeRe(n).replace(/\\?\s+|\s+/g, '\\s+');
  }).join('|');
}

type Compiled = { quick: RegExp; strong: RegExp[] | null; ctxStrong: string; ctxWeak: string; any: boolean; strongNames: string[]; weakNames: string[] };
const cache = new Map<string, Compiled>();

function compile(extra: readonly string[]): Compiled {
  const key = extra.join('\u0001');
  const hit = cache.get(key);
  if (hit) return hit;
  const strongNames: string[] = [...STRONG_OUTLET_NAMES];
  const weakNames: string[] = [...WEAK_OUTLET_NAMES];
  for (const n of [...REGISTERED, ...extra]) {
    const t = n.trim();
    if (t.length < 2) continue;
    (isWeak(t) ? weakNames : strongNames).push(t);
  }
  // A name that is strong in the built-in list stays strong even if also listed elsewhere.
  const strongSet = new Set(strongNames.map((s) => s.toLowerCase()));
  const weak = weakNames.filter((w, i) => !strongSet.has(w.toLowerCase()) && weakNames.indexOf(w) === i);
  const c: Compiled = {
    // one cheap test: any known name (any tier, any case) or an 'edited by / inputs' credit line
    quick: new RegExp(`${LB}(?:${nameAlt([...strongNames, ...weak])})${RB}|\\bedited\\s+by\\b|\\binputs\\b|\\bagenc(?:y|ies)\\b`, 'iu'),
    strong: null,
    ctxStrong: nameAlt(strongNames),
    ctxWeak: weak.length ? nameAlt(weak) : '(?!)',
    any: true,
    strongNames,
    weakNames: weak,
  };
  cache.set(key, c);
  return c;
}

// L = Unicode-aware "not inside a word" boundaries
const LB = '(?<![\\p{L}\\p{N}_])';
const RB = '(?![\\p{L}\\p{N}_])';

const NOUNS = 'report|reports|story|stories|article|articles|investigation|analysis|piece|exclusive|survey|poll|column|editorial|feature|bulletin|broadcast|coverage|account|video|footage|tweet|post|statement|version|website|portal|publication|newsroom';
const VERB_KEEP_PAST = 'said|stated|claimed|noted|added|confirmed|quoted|mentioned|revealed|alleged|suggested|indicated|highlighted|observed|cited|described|explained|pointed\\s+out|reiterated|clarified|wrote\\s+that';
const VERB_SAID = '(?:has|had|have)\\s+(?:reported|learnt|learned|stated|said|claimed|noted|confirmed)|reported|wrote|learnt|learned|understands|understood|has\\s+it|reportedly|first\\s+reported|exclusively\\s+reported';
const VERB_PRESENT = 'says|states|notes|claims|adds|writes|suggests|indicates|mentions|reveals|reports|quotes|cites|highlights|points\\s+out|explains|confirms';

const ACCESS_BY = 'accessed|seen|reviewed|obtained|viewed|accessed\\s+exclusively|perused|examined|read|checked|verified|accessed\\s+and\\s+reviewed|scrutinised|scrutinized';
const MEDIA_BY = 'reported|published|cited|quoted|carried|broadcast|aired|telecast|covered|highlighted|flagged|first\\s+reported|reportedly\\s+accessed|exclusively\\s+reported|monitored|picked\\s+up';

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
/** Is the match at a sentence start (so the replacement should be capitalised)? */
function atSentenceStart(full: string, offset: number): boolean {
  const before = full.slice(0, offset);
  const t = before.replace(/[\s"'“‘(\[]+$/u, '');
  return t.length === 0 || /[.!?।。！？؟:]$/.test(t) || /\n\s*$/.test(before);
}
function fit(full: string, offset: number, replacement: string): string {
  return atSentenceStart(full, offset) && /\p{Lu}/u.test(full.charAt(offset)) ? cap(replacement) : replacement;
}

/** Remove whole lines that are pure source chrome (credits, app promos, guidelines). */
function dropChromeLines(text: string, C: Compiled): string {
  const N = `(?:${C.ctxStrong})`;
  const NW = `(?:${C.ctxStrong}|${C.ctxWeak})`;
  const rules: RegExp[] = [
    new RegExp(`^\\s*[-–—|/•·]*\\s*[(\\[]?\\s*${NW}(?:\\s*[/,&+]\\s*${NW})*\\s*[)\\]]?\\s*[.|]?\\s*$`, 'iu'),
    new RegExp(`^\\s*(?:edited|written|compiled|reported|filed|curated|updated|published|first\\s+published|last\\s+updated|with\\s+inputs\\s+from|inputs\\s+from)\\s*(?:by|on|:)?\\b.*(?:${NW}).*$`, 'iu'),
    new RegExp(`^\\s*edited\\s+by\\b.{0,80}$`, 'iu'),
    new RegExp(`^\\s*(?:with\\s+)?(?:inputs|agency\\s+inputs|agencies)\\b.{0,60}$`, 'iu'),
    new RegExp(`.*\\bdownload\\s+(?:the\\s+)?${N}\\s+(?:news\\s+)?app\\b.*`, 'iu'),
    new RegExp(`.*\\b${N}\\s+(?:community\\s+guidelines|app\\b|e-?paper|newsletter|premium|plus|prime|brand\\s+studio|apps?\\b)\\b.*`, 'iu'),
    new RegExp(`.*\\b(?:follow|like|join|subscribe\\s+to|watch|read|get)\\b[^.\\n]{0,40}\\b${N}\\b.*`, 'iu'),
    new RegExp(`^\\s*(?:photo|image|pic|picture|video|file\\s+photo|representative\\s+image|courtesy|credit|source)\\s*(?:credit|courtesy)?\\s*[:/|-]\\s*.*(?:${NW}).*$`, 'iu'),
    new RegExp(`^\\s*(?:source|via|courtesy|credit)\\s*[:|-]\\s*${NW}.*$`, 'iu'),
    new RegExp(`^.{0,60}\\b(?:reporter|correspondent|editor|journalist|writer|photographer|anchor)\\s+(?:at|with|for|of|from)\\s+(?:the\\s+)?${NW}.{0,20}$`, 'iu'),
    new RegExp(`.*\\b${N}\\s+(?:for\\s+the\\s+latest|latest\\s+news|breaking\\s+news).*`, 'iu'),
  ];
  const promo = [rules[4], rules[5], rules[6], rules[9]];
  return text
    .split('\n')
    .map((line) => {
      if (line.length <= 160) return rules.some((r) => r.test(line)) ? null : line;
      // long paragraph: only drop promo SENTENCES, never the whole paragraph
      const parts = line.split(/(?<=[.!?।。！？؟])\s+/);
      const kept = parts.filter((p) => !promo.some((r) => r.test(p)));
      return kept.join(' ');
    })
    .filter((l): l is string => l !== null)
    .join('\n');
}

function neutralise(input: string, extra: readonly string[]): string {
  const C = compile(extra);
  if (!C.quick.test(input)) return input;
  const NS = `(?:${C.ctxStrong})`; // strong name
  const NA = `(?:${C.ctxStrong})|(?:${C.ctxWeak})`; // any name (weak only valid in the contexts below)
  const A = `(?:${NA})`;
  const POSS = "(?:['’]s)?";
  let t = dropChromeLines(input, C);

  const rx = (src: string, flags = 'giu') => new RegExp(src, flags);
  // weak names must match case-sensitively: build a case-sensitive variant of A for them
  const both = (inner: string, fn: (...a: any[]) => string, flags = '', weakToo = true) => {
    t = t.replace(rx(inner.replace(/__N__/g, `(?:${C.ctxStrong})`), `giu${flags}`), fn);
    if (!weakToo || !C.weakNames.length) return;
    // weak names are case-sensitive: match insensitively (so context words like "According" work), then verify the exact name
    const exact = (m: string) => C.weakNames.some((n) => m.includes(n));
    t = t.replace(rx(inner.replace(/__N__/g, `(?:${C.ctxWeak})`), `giu${flags}`), (m: string, ...a: unknown[]) => (exact(m) ? (fn as (...x: unknown[]) => string)(m, ...a) : m));
  };

  // 0. dateline credits: "MUMBAI (PTI) –", "NEW DELHI (Reuters) -", "(TOI.com)", "[PTI]", "(PTI/IANS)"
  both(`(${LB}[\\p{L} .'’-]{2,25}?)\\s*[(\\[]\\s*__N__(?:\\s*[/,&+]\\s*(?:${NA}))*\\s*[)\\]]\\s*[-–—:]\\s*`, (_m, place) => (String(place) === String(place).toUpperCase() ? `${place}: ` : `${place} `));
  both(`\\s*[(\\[（]\\s*__N__(?:\\s*[/,&+|-]\\s*(?:${NA}))*(?:\\s*[:/|-]\\s*[^)\\]）\\n]{0,40})?\\s*[)\\]）]`, () => '');
  // "Edited by Name / TNN / Oct 18, 2026" remainders and trailing credits ("… text. – TNN", "| PTI", "/ IANS", ", PTI")
  both(`(?:\\s*[-–—|/]\\s*|\\s+)__N__\\s*[/|]\\s*(?:[A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4})\\s*$`, () => '', 'm');
  both(`\\s*[-–—|/]\\s*__N__(?:\\s*[/,&+]\\s*(?:${NA}))*\\s*\\.?\\s*$`, () => '', 'm');
  both(`\\s*,\\s*__N__(?:\\s*[/,&+]\\s*(?:${NA}))*\\s*\\.?\\s*$`, () => '', 'm', false);

  // headline tail: "Tiger Shroff hospitalised after stunt, TOI reports" / "… – NDTV report"
  both(`\\s*[,;:–—|-]\\s*__N__${POSS}\\s+(?:reports?|says?|said|claims?|learns?|reveals?)\\s*$`, () => '', 'm');
  // "senior reporter at TOI" / "correspondent with Reuters"
  both(`(?:\\s*,\\s*)?\\b(?:a\\s+|an\\s+|the\\s+)?(?:senior\\s+|chief\\s+|staff\\s+|special\\s+)?(?:reporter|correspondent|editor|journalist|writer|photographer|anchor)\\s+(?:at|with|for|of|from)\\s+(?:the\\s+)?__N__${POSS}`, () => '');
  // 1. "according to/as per/per <N>[ report|story]" — also "according to N's report"
  both(`${LB}(according\\s+to|as\\s+per|as\\s+reported\\s+by|as\\s+stated\\s+by|as\\s+quoted\\s+by|citing|quoting|based\\s+on)\\s+(?:(?:a|an|the)\\s+)?__N__${POSS}(?:\\s+(?:${NOUNS}))?${RB}`, (_m, lead, off, full) => {
    const l = String(lead).toLowerCase().replace(/\s+/g, ' ');
    const phrase = l.startsWith('according') ? 'according to a report' : l.startsWith('as per') ? 'as per reports' : l.startsWith('citing') ? 'citing reports' : l.startsWith('quoting') ? 'quoting reports' : l.startsWith('based') ? 'based on a report' : 'as reported by media';
    return fit(full, off, phrase);
  });
  // "<det> <N>[’s] <noun>" → "<det> <noun>"
  const nounRule = (_f: string) => `${LB}(?:(a|an|the|this|that|its|their|his|her)\\s+)?__N__${POSS}\\s+(${NOUNS})${RB}`;
  const nounFn = (m: string, det: string | undefined, noun: string) => {
    const d = (det ?? '').toLowerCase();
    const n = noun.toLowerCase();
    return d === 'a' || d === 'an' ? `a ${n}` : `${d || 'the'} ${n}`;
  };
  both(nounRule(''), (m, det, noun, off, full) => fit(full, off, nounFn(m, det, noun)));
  // "reported/accessed by <N>"
  both(`${LB}(${ACCESS_BY})\\s+by\\s+(?:the\\s+)?__N__${POSS}(?:\\s+(?:reporters?|correspondents?|team|journalists?))?${RB}`, (_m, v) => `${v} by reporters`);
  both(`${LB}(${MEDIA_BY})\\s+by\\s+(?:the\\s+)?__N__${POSS}(?:\\s+(?:reporters?|correspondents?|team|journalists?))?${RB}`, (_m, v) => `${v} by the media`);
  both(`${LB}(interview|conversation|statement|chat|talk|call|exchange)\\s+(?:with|to)\\s+(?:the\\s+)?__N__${POSS}(?:\\s+(?:reporters?|correspondents?|team|journalists?))?${RB}`, (_m, w) => String(w));
  // "told / speaking to / spoke to / talking to / confirmed to / said in a statement to <N>"
  both(`${LB}(told|tells|telling|speaking\\s+to|spoke\\s+to|speaks\\s+to|talking\\s+to|talked\\s+to|confirmed\\s+to|said\\s+to|reacted\\s+to|responding\\s+to|responded\\s+to|shared\\s+with|revealed\\s+to|disclosed\\s+to|admitted\\s+to|clarified\\s+to|explained\\s+to|exclusively\\s+told|in\\s+a\\s+statement\\s+to|in\\s+a\\s+chat\\s+with|reached\\s+out\\s+to)\\s+(?:the\\s+)?__N__${POSS}(?:\\s+(reporters?|correspondents?|team|journalists?))?${RB}`, (_m, v, rep) => {
    const r = rep ? (/^[a-z]+s$/i.test(rep) ? rep : `a ${rep}`) : 'reporters';
    return `${v} ${r}`;
  });
  // "<N> reporter / correspondent / sources / team"
  both(`${LB}(?:an?\\s+|the\\s+)?__N__${POSS}\\s+(reporters?|correspondents?|journalists?)${RB}`, (_m, who, off, full) => fit(full, off, `${/s$/i.test(who) ? '' : 'a '}${String(who).toLowerCase()}`));
  both(`${LB}__N__${POSS}\\s+(sources|source|team|bureau|newsroom|desk|staff)${RB}`, (_m, w, off, full) => fit(full, off, String(w).toLowerCase() === 'source' ? 'a source' : String(w).toLowerCase() === 'sources' ? 'sources' : 'the news team'));
  // "<N> reported/said …" (subject position)
  both(`${LB}(?:the\\s+)?__N__${POSS}(?:\\s*,\\s*(?:citing|quoting)[^,.\\n]{0,60},)?\\s+(${VERB_SAID})${RB}`, (m, _v, off, full) => fit(full, off, 'reports said'));
  both(`${LB}(?:the\\s+)?__N__${POSS}\\s+(${VERB_KEEP_PAST})${RB}`, (_m, v, off, full) => fit(full, off, `reports ${String(v).replace(/\s+that$/i, '').toLowerCase().replace(/wrote/, 'said')}`));
  both(`${LB}(?:the\\s+)?__N__${POSS}\\s+(${VERB_PRESENT})${RB}`, (_m, v, off, full) => {
    const vv = String(v).toLowerCase();
    return fit(full, off, vv.startsWith('suggest') ? 'reports suggest' : vv.startsWith('indicat') ? 'reports indicate' : 'reports say');
  });
  // "via <N>", "courtesy <N>", "source: <N>", "credit: <N>", "(source: N)"
  both(`\\s*[(\\[]?\\b(?:via|courtesy(?:\\s+of)?|credit|source|sources|image\\s+credit|photo\\s+credit|picture\\s+courtesy)\\s*:?\\s+__N__[)\\]]?`, () => '');
  // "in/on/by/from/at/with/of <N>" generic leftovers handled by the fallback below.

  // 2. Fallback for what remains (strong names only): possessive → "the outlet's", else "a news outlet".
  t = t.replace(rx(`${LB}(the\\s+)?${NS}(['’]s)${RB}`), (_m, _the, _p, off, full) => fit(full, off, "the outlet's"));
  t = t.replace(rx(`${LB}(the\\s+)?${NS}${RB}`), (_m, the, off, full) => fit(full, off, the ? 'the news outlet' : 'a news outlet'));

  // 3. tidy
  t = t
    .replace(/\(\s*\)|\[\s*\]|（\s*）/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*([.!?])/g, '$2')
    .replace(/,\s*,/g, ',')
    .replace(/\b(a|an|the)\s+(?=(?:a|an|the)\b)/gi, '')
    .replace(/\b(reports)\s+reports\b/gi, '$1')
    .replace(/(^|\n)[ \t]*[,;:–—-]+[ \t]*(?=\S)/g, '$1')
    .replace(/[ \t]*[-–—|/,;:][ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/** Does text still mention any known publisher (strong names anywhere, weak names in attribution context)? */
export function containsSourceMention(text: string | null | undefined, extraNames: readonly string[] = []): boolean {
  const s = text ?? '';
  if (!s) return false;
  const C = compile(extraNames);
  if (new RegExp(`${LB}(?:${C.ctxStrong})${RB}`, 'iu').test(s)) return true;
  if (C.weakNames.length) {
    const W = `(?:${C.ctxWeak})`;
    const ctx = [
      `(?:according\\s+to|as\\s+per|told|via|source:|courtesy|reported\\s+by|accessed\\s+by|seen\\s+by|per)\\s+${W}${RB}`,
      `${LB}${W}\\s+(?:reported|said|stated|reports|says|report|story|quoted|claimed|noted)${RB}`,
      `[(\\[]\\s*${W}\\s*[)\\]]`,
      `[-–—|/]\\s*${W}\\s*$`,
    ];
    if (ctx.some((c) => new RegExp(c, 'mu').test(s))) return true;
  }
  return false;
}

/**
 * Remove / neutralise publisher references. `extraNames` = e.g. Source.name + domain-derived variants for this
 * item's source (see sourceNameVariants); all registered source names are applied too.
 */
export function scrubSourceMentions(text: string | null | undefined, extraNames: readonly string[] = []): string {
  const s = text ?? '';
  if (!s.trim()) return s.trim();
  // fast path: nothing that could be an outlet reference
  let out = neutralise(s, extraNames);
  // second pass catches names exposed by the first (e.g. "TOI/PTI")
  if (containsSourceMention(out, extraNames)) out = neutralise(out, extraNames);
  return out;
}

/** Scrub every string of a TipTap/JSON-ish value in place-safe fashion (returns a new structure). */
export function scrubSourceMentionsDeep<T>(value: T, extraNames: readonly string[] = []): T {
  if (typeof value === 'string') return scrubSourceMentions(value, extraNames) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubSourceMentionsDeep(v, extraNames)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === 'type' || k === 'language' || k === 'status' || k === 'imageUrl' ? v : scrubSourceMentionsDeep(v, extraNames);
    }
    return out as T;
  }
  return value;
}
