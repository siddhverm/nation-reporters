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

/**
 * The ONLY names removed as bare words (anywhere, not just in attribution context): clearly unique outlet tokens.
 * Acronyms match case-sensitively ("TOI" yes, French "toi" / name "Ani" no). Every other outlet / company-like name
 * (Reuters, BBC, Fairfax Media, names from the sources table …) is only removed in attribution context, so a story
 * whose SUBJECT is that company ("Reuters shares fall", "Fairfax gets 15 years …") keeps its subject.
 * Domain-like names ("ndtv.com", "bbc.co.uk") are unique too and also removed bare.
 */
export const UNIQUE_BARE_NAMES: readonly string[] = [
  'TOI', 'TNN', 'PTI', 'ANI', 'IANS', 'NDTV', 'Times of India', 'The Times of India', 'Hindustan Times', 'Press Trust of India',
  'Indo-Asian News Service', 'Asian News International', 'TOI.com', 'TIMESOFINDIA.COM',
];

/** Ordinary words / short abbreviations / surnames: only neutralised in attribution context, case-sensitively. */
export const WEAK_OUTLET_NAMES: readonly string[] = [
  'AP', 'HT', 'ET', 'UNI', 'The Hindu', 'Mint', 'Tribune', 'Express', 'The Age', 'Patrika', 'Sakal', 'Bild', 'Bloomberg', 'The Guardian', 'The Wire', 'The Print',
];

/** Common English words that are also outlet brands: a sources-table name made only of these is never used. */
const COMMON_BRAND_WORDS = new Set([
  'mint', 'express', 'times', 'time', 'star', 'stars', 'sun', 'moon', 'mirror', 'wire', 'scroll', 'print', 'telegraph', 'tribune', 'hindu', 'guardian', 'independent',
  'observer', 'herald', 'chronicle', 'post', 'mail', 'standard', 'statesman', 'pioneer', 'nation', 'fortune', 'economist', 'quartz', 'verge', 'insider', 'outlook',
  'frontline', 'caravan', 'week', 'money', 'market', 'markets', 'voice', 'spectator', 'journal', 'gazette', 'courier', 'sentinel', 'record', 'register', 'review',
  'digest', 'globe', 'planet', 'metro', 'city', 'square', 'network', 'report', 'reporter', 'patriot', 'citizen', 'republic', 'pulse', 'current', 'signal', 'beacon',
  'examiner', 'enquirer', 'inquirer', 'monitor', 'leader', 'press', 'clarion', 'dispatch', 'ledger', 'mercury', 'echo', 'edge', 'dawn', 'people', 'quint', 'lens',
  'focus', 'insight', 'view', 'views', 'scoop', 'buzz', 'brief', 'minute', 'flash', 'telegram', 'bulletin', 'tide', 'wave', 'light', 'bridge', 'capital', 'state',
  'union', 'federal', 'global', 'local', 'metro', 'evening', 'morning', 'weekly', 'sunday', 'saturday', 'free', 'first', 'new', 'old', 'big', 'good', 'great',
  'asia', 'asian', 'africa', 'europe', 'america', 'american', 'british', 'indian', 'pakistan', 'china', 'chinese', 'japan', 'delhi', 'mumbai', 'london', 'paris',
  'sport', 'sports', 'cricket', 'football', 'film', 'films', 'movie', 'movies', 'music', 'health', 'science', 'tech', 'technology', 'money', 'finance', 'auto', 'travel',
  'story', 'stories', 'press', 'media', 'channel', 'radio', 'television', 'online', 'wired', 'vogue', 'variety', 'billboard', 'mashable', 'engadget',
]);
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
  tierCache.clear();
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
const isDomainLike = (n: string) => /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+$/u.test(n) && /\.[a-z]{2,}$/i.test(n);
const UNIQUE_KEYS = new Set(UNIQUE_BARE_NAMES.map((n) => n.toLowerCase()));

/**
 * Tier for a name from the sources table / per-item extras:
 *  'strong' = attribution context, case-insensitive (multi-word names, or one word ≥ 5 chars that is not a common word),
 *  'weak'   = attribution context, case-sensitive (short acronyms like "HT"),
 *  null     = ignored (common words, short words: "Wire", "Star", "Mint", "Scroll" …).
 */
export function classifyDynamicName(name: string): 'strong' | 'weak' | null {
  const n = name.trim();
  if (n.length < 2) return null;
  if (isDomainLike(n)) return 'strong';
  if (/^[\p{Lu}]{2,5}$/u.test(n)) return 'weak';
  const words = n.toLowerCase().replace(/^the\s+/, '').split(/[\s-]+/).filter(Boolean);
  if (!words.length) return null;
  // multi-word names are specific enough for attribution context, unless they are only feed labels ("Top Stories")
  if (words.length >= 2) return words.every((w) => GENERIC_WORDS.has(w)) ? null : 'strong';
  const w = words[0];
  if (w.length < 5 || COMMON_BRAND_WORDS.has(w) || GENERIC_WORDS.has(w)) return null;
  return 'strong';
}

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

/** Whole-name boundary that works for every script (JS \b is ASCII-only). An empty list never matches. */
function nameAlt(names: string[]): string {
  const uniq = [...new Set(names)];
  if (!uniq.length) return '(?!)';
  return uniq.sort((a, b) => b.length - a.length).map((n) => {
    // allow flexible whitespace and optional dots between initials ("T.O.I.")
    return escapeRe(n).replace(/\\?\s+|\s+/g, '\\s+');
  }).join('|');
}

type Compiled = {
  quick: RegExp; strong: RegExp[] | null; ctxStrong: string; ctxWeak: string; bare: RegExp; any: boolean;
  strongNames: string[]; weakNames: string[];
  /** memoised RegExp constructor: patterns are built once per compiled name set, not once per call */
  re: (src: string, flags: string) => RegExp;
};

// ── performance ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The registry holds ~1k publisher names. A regex alternation over all of them is slow to build and, worse, slow to
// RUN (every position of a 4k-char text tries every name), and neutralise() runs ~40 such patterns per field. So for
// each text we first pick the names whose first word actually occurs in it (a Set lookup per name) and compile the
// patterns for that small subset only — usually zero or one name. Results are identical: a name whose first word is
// not in the text can never match. Compiled subsets are cached (bounded).

type Tiers = { strongNames: string[]; weakNames: string[] };
const tierCache = new Map<string, Tiers>();
function tiersFor(extra: readonly string[]): Tiers {
  const key = extra.join('\u0001');
  const hit = tierCache.get(key);
  if (hit) return hit;
  const strongNames: string[] = [...STRONG_OUTLET_NAMES];
  const weakNames: string[] = [...WEAK_OUTLET_NAMES];
  for (const n of [...REGISTERED, ...extra]) {
    const t = n.trim();
    const tier = classifyDynamicName(t);
    if (tier === 'strong') strongNames.push(t);
    else if (tier === 'weak') weakNames.push(t);
  }
  // A name that is strong in the built-in list stays strong even if also listed elsewhere.
  const strongSet = new Set(strongNames.map((s) => s.toLowerCase()));
  const weak = weakNames.filter((w, i) => !strongSet.has(w.toLowerCase()) && weakNames.indexOf(w) === i);
  const v = { strongNames: [...new Set(strongNames)], weakNames: weak };
  if (tierCache.size > 500) tierCache.clear();
  tierCache.set(key, v);
  return v;
}

const TOKEN_RE = /[\p{L}\p{N}]+/gu;
const firstTokenCache = new Map<string, string>();
function keyToken(name: string): string {
  let v = firstTokenCache.get(name);
  if (v === undefined) {
    // the longest word of the name: every word must be present for the name to match, the longest is the most selective
    v = (name.toLowerCase().match(TOKEN_RE) ?? ['']).reduce((a, b) => (b.length > a.length ? b : a), '');
    if (firstTokenCache.size > 20000) firstTokenCache.clear();
    firstTokenCache.set(name, v);
  }
  return v;
}
/** Words our own replacements introduce ("reports said", "the news outlet") — always treated as present. */
const REPLACEMENT_TOKENS = ['the', 'a', 'an', 'reports', 'report', 'reporters', 'reporter', 'news', 'outlet', 'media', 'team', 'source', 'sources', 'according', 'to', 'as', 'per', 'citing', 'quoting', 'based', 'on', 'by', 'said', 'say'];
function tokenSet(text: string): Set<string> {
  const set = new Set<string>(REPLACEMENT_TOKENS);
  for (const m of text.toLowerCase().matchAll(TOKEN_RE)) set.add(m[0]);
  return set;
}

const cache = new Map<string, Compiled>();
const CACHE_MAX = 2000;

/** Compile the patterns for `extra` + registry; with `text`, only for the names that can occur in that text. */
function compile(extra: readonly string[], text?: string): Compiled {
  const tiers = tiersFor(extra);
  let strongNames = tiers.strongNames;
  let weakNames = tiers.weakNames;
  let unique: readonly string[] = UNIQUE_BARE_NAMES;
  if (text !== undefined) {
    const T = tokenSet(text);
    const has = (n: string) => { const f = keyToken(n); return !f || T.has(f); };
    strongNames = strongNames.filter(has);
    weakNames = weakNames.filter(has);
    unique = UNIQUE_BARE_NAMES.filter(has);
  }
  const key = `${strongNames.join('\u0001')}\u0002${weakNames.join('\u0001')}\u0002${unique.join('\u0001')}`;
  const hit = cache.get(key);
  if (hit) {
    // LRU touch
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const memo = new Map<string, RegExp>();
  const c: Compiled = {
    // one cheap test: any known name (any tier, any case) or an 'edited by / inputs' credit line
    quick: new RegExp(`${LB}(?:${nameAlt([...strongNames, ...weakNames])})${RB}|\\bedited\\s+by\\b|\\binputs\\b|\\bagenc(?:y|ies)\\b`, 'iu'),
    strong: null,
    ctxStrong: nameAlt(strongNames),
    bare: bareRegex(strongNames, unique),
    ctxWeak: nameAlt(weakNames),
    any: true,
    strongNames,
    weakNames,
    re: (src, flags) => {
      const k = `${flags}\u0000${src}`;
      let r = memo.get(k);
      if (!r) { r = new RegExp(src, flags); memo.set(k, r); }
      r.lastIndex = 0;
      return r;
    },
  };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, c);
  return c;
}

/** Bare-word matcher: unique names (acronyms case-sensitive, long names case-insensitive) + domain-like names. */
function bareRegex(strongNames: string[], unique: readonly string[] = UNIQUE_BARE_NAMES): RegExp {
  const all = [...new Set([...unique, ...strongNames.filter(isDomainLike)])];
  const acr = all.filter((n) => /^[A-Z]{2,5}$/.test(n));
  const rest = all.filter((n) => !acr.includes(n));
  return new RegExp(`${LB}(?:${nameAlt(rest)})${RB}|${LB}(?:${nameAlt(acr)})${RB}`, 'giu');
}
/**
 * Acronym-shaped names ("TOI", "PTI", "ANI", "BBC") must match in upper case: French "toi" or the name "Ani" are words.
 * JS has no inline case flags, so matches found case-insensitively are verified here.
 */
const ACRONYM_CACHE = new Map<string, Set<string>>();
function acronymsOf(names: string[]): Set<string> {
  const k = names.join('\u0001');
  let v = ACRONYM_CACHE.get(k);
  if (!v) { v = new Set(names.filter((n) => /^[A-Z]{2,5}$/.test(n)).map((n) => n.toLowerCase())); ACRONYM_CACHE.set(k, v); if (ACRONYM_CACHE.size > 50) ACRONYM_CACHE.clear(); }
  return v;
}
function acronymCaseOk(m: string, acr: Set<string>): boolean {
  for (const w of m.matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = w[0];
    if (!acr.has(word.toLowerCase()) || word === word.toUpperCase()) continue;
    // lower/mixed case is only fine inside a domain ("toi.com", "ndtv.com")
    if (/^\.[a-z]/i.test(m.slice((w.index ?? 0) + word.length))) continue;
    return false;
  }
  return true;
}

const isBareAcronymMatch = (m: string) => /^[A-Za-z]{2,5}$/.test(m.trim());
const isExactUniqueAcronym = (m: string) => UNIQUE_BARE_NAMES.includes(m.trim());

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
  const R = (src: string) => C.re(src, 'iu');
  const rules: RegExp[] = [
    R(`^\\s*[-–—|/•·]*\\s*[(\\[]?\\s*${NW}(?:\\s*[/,&+]\\s*${NW})*\\s*[)\\]]?\\s*[.|]?\\s*$`),
    R(`^\\s*(?:edited|written|compiled|reported|filed|curated|updated|published|first\\s+published|last\\s+updated|with\\s+inputs\\s+from|inputs\\s+from)\\s*(?:by|on|:)?\\b.*(?:${NW}).*$`),
    R(`^\\s*edited\\s+by\\b.{0,80}$`),
    R(`^\\s*(?:with\\s+)?(?:inputs|agency\\s+inputs|agencies)\\b.{0,60}$`),
    R(`.*\\bdownload\\s+(?:the\\s+)?${N}\\s+(?:news\\s+)?app\\b.*`),
    R(`.*\\b${N}\\s+(?:community\\s+guidelines|app\\b|e-?paper|newsletter|premium|plus|prime|brand\\s+studio|apps?\\b)\\b.*`),
    R(`.*\\b(?:follow|like|join|subscribe\\s+to|watch|read|get)\\b[^.\\n]{0,40}\\b${N}\\b.*`),
    R(`^\\s*(?:photo|image|pic|picture|video|file\\s+photo|representative\\s+image|courtesy|credit|source)\\s*(?:credit|courtesy)?\\s*[:/|-]\\s*.*(?:${NW}).*$`),
    R(`^\\s*(?:source|via|courtesy|credit)\\s*[:|-]\\s*${NW}.*$`),
    R(`^.{0,60}\\b(?:reporter|correspondent|editor|journalist|writer|photographer|anchor)\\s+(?:at|with|for|of|from)\\s+(?:the\\s+)?${NW}.{0,20}$`),
    R(`.*\\b${N}\\s+(?:for\\s+the\\s+latest|latest\\s+news|breaking\\s+news).*`),
  ];
  const promo = [rules[4], rules[5], rules[6], rules[9]];
  const acrSet = acronymsOf(C.strongNames);
  // Rules shaped `.*X.*` match the whole line when X occurs anywhere in it; scanning for X alone gives the same answer
  // without the quadratic `.*` backtracking on long lines (m[0] is then the whole line, exactly as before).
  const fast = new Map<RegExp, RegExp>();
  for (const r of rules) {
    if (r.source.startsWith('.*') && r.source.endsWith('.*')) fast.set(r, C.re(r.source.slice(2, -2), r.flags));
  }
  const hit = (r: RegExp, line: string): boolean => {
    const f = fast.get(r);
    if (f) return f.test(line) && acronymCaseOk(line, acrSet);
    const m = r.exec(line);
    return !!m && acronymCaseOk(m[0], acrSet);
  };
  return text
    .split('\n')
    .map((line) => {
      if (line.length <= 160) return rules.some((r) => hit(r, line)) ? null : line;
      // long paragraph: only drop promo SENTENCES, never the whole paragraph
      const parts = line.split(/(?<=[.!?।。！？؟])\s+/);
      const kept = parts.filter((p) => !promo.some((r) => hit(r, p)));
      return kept.join(' ');
    })
    .filter((l): l is string => l !== null)
    .join('\n');
}

export type ScrubOptions = {
  /** false = never replace bare names, only attribution phrases (headline-safe mode). Default true. */
  bare?: boolean;
  /** true = a headline: never drop the whole line as "chrome". */
  title?: boolean;
};

function neutralise(input: string, extra: readonly string[], opts: ScrubOptions = {}): string {
  const C = compile(extra, input);
  if (!C.quick.test(input)) return input;
  const NS = `(?:${C.ctxStrong})`; // strong name
  const NA = `(?:${C.ctxStrong})|(?:${C.ctxWeak})`; // any name (weak only valid in the contexts below)
  const A = `(?:${NA})`;
  const POSS = "(?:['’]s)?";
  let t = opts.title ? input : dropChromeLines(input, C);

  const rx = (src: string, flags = 'giu') => C.re(src, flags);
  // weak names must match case-sensitively: build a case-sensitive variant of A for them
  const acr = acronymsOf(C.strongNames);
  const both = (inner: string, fn: (...a: any[]) => string, flags = '', weakToo = true) => {
    t = t.replace(rx(inner.replace(/__N__/g, `(?:${C.ctxStrong})`), `giu${flags}`), (m: string, ...a: unknown[]) => (acronymCaseOk(m, acr) ? (fn as (...x: unknown[]) => string)(m, ...a) : m));
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

  // headline / line prefix credit: "Daily Planet Gazette: Floods hit city", "Reuters | Markets fall" → "Floods hit city"
  both(`^([ \\t]*)(?:the\\s+)?__N__\\s*[:|：]\\s*(?=\\S)`, (_m, ws) => String(ws ?? ''), 'm');
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
  // Only UNIQUE outlet tokens are replaced as bare words; everything else stays (it may be the story's subject).
  if (opts.bare !== false) {
    const B = C.bare.source;
    const okBare = (name: string) => !isBareAcronymMatch(name) || isExactUniqueAcronym(name);
    t = t.replace(rx(`${LB}(the\\s+)?(${B})(['’]s)${RB}`), (m, _the, name, _p, off, full) => (okBare(name) ? fit(full, off, "the outlet's") : m));
    t = t.replace(rx(`${LB}(the\\s+)?(${B})${RB}`), (m, the, name, off, full) => (okBare(name) ? fit(full, off, the ? 'the news outlet' : 'a news outlet') : m));
  }

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
  const C = compile(extraNames, s);
  if (!C.quick.test(s)) return false;
  // unique tokens anywhere
  C.bare.lastIndex = 0;
  for (const m of s.matchAll(C.bare)) if (!isBareAcronymMatch(m[0]) || isExactUniqueAcronym(m[0])) return true;
  // every other name only in attribution context (strong: case-insensitive; weak: case-sensitive)
  const ctx = (W: string) => [
    `(?:according\\s+to|as\\s+per|told|tells|via|source:|courtesy(?:\\s+of)?|reported\\s+by|accessed\\s+by|seen\\s+by|reviewed\\s+by|citing|quoting|speaking\\s+to|spoke\\s+to|talking\\s+to|in\\s+an\\s+interview\\s+with)\\s+(?:the\\s+)?(?:${W})${RB}`,
    `${LB}(?:${W})(?:['’]s)?\\s+(?:reported|reports|report|story|stories|reporter|correspondent|has\\s+learnt|learnt|learned|quoted|exclusively|app|community\\s+guidelines|e-?paper|newsletter|said|says|stated|states|wrote|writes|claimed|claims|noted|notes|revealed)${RB}`,
    `^[ \\t]*(?:the\\s+)?(?:${W})\\s*[:|：]\\s*\\S`,
    `[(\\[]\\s*(?:${W})\\s*[)\\]]`,
    `[-–—|/]\\s*(?:${W})\\s*$`,
    `download\\s+(?:the\\s+)?(?:${W})\\s+(?:news\\s+)?app`,
  ];
  const acr = acronymsOf(C.strongNames);
  for (const c of ctx(C.ctxStrong)) {
    for (const m of s.matchAll(C.re(c, 'gimu'))) if (acronymCaseOk(m[0], acr)) return true;
  }
  if (C.weakNames.length) {
    for (const c of ctx(C.ctxWeak)) {
      for (const m of s.matchAll(C.re(c, 'gimu'))) if (C.weakNames.some((n) => m[0].includes(n))) return true;
    }
  }
  return false;
}

/**
 * Remove / neutralise publisher references. `extraNames` = e.g. Source.name + domain-derived variants for this
 * item's source (see sourceNameVariants); all registered source names are applied too.
 */
export function scrubSourceMentions(text: string | null | undefined, extraNames: readonly string[] = [], opts: ScrubOptions = {}): string {
  const s = text ?? '';
  if (!s.trim()) return s.trim();
  // fast path: nothing that could be an outlet reference
  let out = neutralise(s, extraNames, opts);
  // second pass catches names exposed by the first (e.g. "TOI/PTI")
  if (containsSourceMention(out, extraNames)) out = neutralise(out, extraNames, opts);
  return out;
}

const wordCount = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Did cleaning shrink a headline / teaser too much (below 3 words or 60% of the original length)? */
export function shrankTooMuch(cleaned: string, original: string): boolean {
  const c = cleaned.trim();
  const o = original.trim();
  if (!o) return false;
  if (!c) return true;
  const minWords = Math.min(3, wordCount(o));
  return wordCount(c) < minWords || c.length < o.length * 0.6;
}

/**
 * Scrub a TITLE / short teaser without ever emptying it: never drops the whole line; if the normal scrub would leave
 * fewer than 2 words it keeps the wording minus attribution phrases only (bare names left alone), and if even that
 * collapses it returns the original headline.
 */
export function scrubSourceMentionsInTitle(text: string | null | undefined, extraNames: readonly string[] = []): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
  const enough = (t: string) => !!t.trim() && (wordCount(t) >= Math.min(2, wordCount(raw)) || (cjk.test(t) && [...t.trim()].length >= 4));
  const full = scrubSourceMentions(raw, extraNames, { title: true });
  if (enough(full)) return full;
  const attributionOnly = scrubSourceMentions(raw, extraNames, { title: true, bare: false });
  return enough(attributionOnly) ? attributionOnly : raw;
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

const tagKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Drop hashtags that name a publisher (#TOI, #TimesOfIndia, #NDTV, #DailyPlanetGazette …). */
export function filterSourceHashtags(tags: readonly string[] | null | undefined, extraNames: readonly string[] = []): string[] {
  const C = compile(extraNames);
  const keys = [...new Set([...C.strongNames, ...C.weakNames.filter((w) => w.length >= 4)].map(tagKey).filter((k) => k.length >= 2))];
  return (tags ?? []).filter((tag) => {
    const k = tagKey(tag);
    if (!k) return false;
    return !keys.some((name) => (name.length >= 5 ? k.includes(name) : k === name));
  });
}
