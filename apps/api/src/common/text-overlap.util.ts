/**
 * Copy-safety: how much of a generated text is lifted verbatim from the source text.
 * Word n-grams for space-delimited scripts, character n-grams for CJK/Thai (no spaces).
 * Names, numbers and dates legitimately overlap, so the n-gram is long enough (5 words / 12 chars)
 * that only copied phrasing — not shared facts — registers.
 */

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/u;

export type OverlapOptions = {
  /** word n-gram size (default 5) */
  wordN?: number;
  /** character n-gram size for CJK/Thai (default 12) */
  charN?: number;
};

export type OverlapResult = {
  /** share of output n-grams that also occur in the source (0..1) */
  ratio: number;
  /** longest verbatim run, in words (or characters for CJK/Thai) */
  longestRun: number;
  /** number of output n-grams considered */
  grams: number;
  unit: 'word' | 'char';
};

export function normalizeForOverlap(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670\u200c\u200d]/g, '') // Arabic diacritics, ZWNJ/ZWJ
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(norm: string, unit: 'word' | 'char'): string[] {
  if (unit === 'char') return Array.from(norm.replace(/\s+/g, ''));
  return norm ? norm.split(' ') : [];
}

function gramSet(toks: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= toks.length; i++) out.add(toks.slice(i, i + n).join('\u0001'));
  return out;
}

/** Longest common contiguous token run between a and b (DP over the shorter alignment, O(a*b) but bounded). */
function longestCommonRun(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  // Index positions of each token in b, then extend matches.
  const pos = new Map<string, number[]>();
  b.forEach((t, i) => {
    const arr = pos.get(t);
    if (arr) arr.push(i);
    else pos.set(t, [i]);
  });
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    const starts = pos.get(a[i]);
    if (!starts) continue;
    for (const j of starts.slice(0, 50)) {
      // skip if this is not a run start (previous tokens also matched)
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) continue;
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}

export function measureOverlap(output: string, source: string, opts: OverlapOptions = {}): OverlapResult {
  const outNorm = normalizeForOverlap(output);
  const srcNorm = normalizeForOverlap(source);
  const unit: 'word' | 'char' = CJK.test(outNorm) ? 'char' : 'word';
  const n = unit === 'char' ? (opts.charN ?? 12) : (opts.wordN ?? 5);
  const out = tokens(outNorm, unit);
  const src = tokens(srcNorm, unit);
  const outGrams = [] as string[];
  for (let i = 0; i + n <= out.length; i++) outGrams.push(out.slice(i, i + n).join('\u0001'));
  if (!outGrams.length || src.length < n) return { ratio: 0, longestRun: 0, grams: outGrams.length, unit };
  const srcGrams = gramSet(src, n);
  let hit = 0;
  for (const g of outGrams) if (srcGrams.has(g)) hit++;
  return { ratio: hit / outGrams.length, longestRun: longestCommonRun(out, src), grams: outGrams.length, unit };
}

export type OverlapLimits = {
  /** max share of copied n-grams (default 0.25) */
  maxRatio: number;
  /** max verbatim run in words (default 12) — CJK/Thai use maxRunChars */
  maxRunWords: number;
  /** max verbatim run in characters for CJK/Thai (default 36) */
  maxRunChars: number;
};

export const DEFAULT_OVERLAP_LIMITS: OverlapLimits = { maxRatio: 0.25, maxRunWords: 12, maxRunChars: 36 };

const MIN_GRAMS_FOR_RATIO = 8;

export function overlapTooHigh(r: OverlapResult, limits: OverlapLimits = DEFAULT_OVERLAP_LIMITS): boolean {
  if (r.grams === 0) return false;
  const maxRun = r.unit === 'char' ? limits.maxRunChars : limits.maxRunWords;
  // Very short texts (headlines, one-liners) are judged by the verbatim run only: a ratio over 3 n-grams is noise.
  const ratioMeaningful = r.grams >= MIN_GRAMS_FOR_RATIO;
  return (ratioMeaningful && r.ratio > limits.maxRatio) || r.longestRun > maxRun;
}

/** Normalise any Unicode decimal digit (Devanagari, Arabic-Indic, Bengali, …) to ASCII and return distinct numbers. */
const DIGIT_BASES = [0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xff10];
export function toAsciiDigits(text: string): string {
  return (text ?? '').replace(/\p{Nd}/gu, (ch) => {
    const cp = ch.codePointAt(0)!;
    const base = DIGIT_BASES.find((b) => cp >= b && cp <= b + 9);
    return base === undefined ? ch : String(cp - base);
  });
}

export function extractNumbers(text: string): string[] {
  const t = toAsciiDigits(text);
  const found = t.match(/\d[\d,.\u066b\u066c]*\d|\d/g) ?? [];
  const set = new Set<string>();
  for (const f of found) {
    const digits = f.replace(/[^\d]/g, '');
    if (digits.length >= 2) set.add(digits); // single digits are too noisy ("1 of", list markers)
  }
  return [...set];
}

/** Share of the source's numbers (counts, years, amounts) that still appear in the output. */
export function numberRetention(output: string, source: string): { retained: number; total: number; ratio: number; missing: string[] } {
  const src = extractNumbers(source);
  if (!src.length) return { retained: 0, total: 0, ratio: 1, missing: [] };
  const out = new Set(extractNumbers(output));
  const missing = src.filter((n) => !out.has(n));
  return { retained: src.length - missing.length, total: src.length, ratio: (src.length - missing.length) / src.length, missing };
}
