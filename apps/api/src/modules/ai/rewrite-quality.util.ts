import { containsSourceMention } from '../../common/source-scrub.util';
import {
  DEFAULT_OVERLAP_LIMITS, measureOverlap, numberRetention, overlapTooHigh,
  type OverlapLimits, type OverlapResult,
} from '../../common/text-overlap.util';

export type RewriteDraft = {
  title?: string;
  summary?: string;
  keyPoints?: string[];
  short?: string;
  medium?: string;
  long?: string;
  podcastScript?: string;
};

export type RewriteAssessment = {
  ok: boolean;
  /** why the draft was rejected, most important first */
  problems: Array<'empty' | 'too_similar' | 'missing_facts' | 'names_source'>;
  worst: OverlapResult | null;
  worstField: string | null;
  numbers: { ratio: number; total: number; missing: string[] };
};

export type QualityLimits = OverlapLimits & {
  /** minimum share of source numbers that must survive (default 0.6; only enforced with >= 3 source numbers) */
  minNumberRetention: number;
};

export const DEFAULT_QUALITY_LIMITS: QualityLimits = { ...DEFAULT_OVERLAP_LIMITS, minNumberRetention: 0.6 };

export function limitsFromEnv(get: (k: string) => string | undefined): QualityLimits {
  const num = (k: string, d: number) => {
    const v = Number(get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    maxRatio: num('REWRITE_MAX_OVERLAP', DEFAULT_QUALITY_LIMITS.maxRatio),
    maxRunWords: num('REWRITE_MAX_COPIED_RUN_WORDS', DEFAULT_QUALITY_LIMITS.maxRunWords),
    maxRunChars: num('REWRITE_MAX_COPIED_RUN_CHARS', DEFAULT_QUALITY_LIMITS.maxRunChars),
    minNumberRetention: num('REWRITE_MIN_NUMBER_RETENTION', DEFAULT_QUALITY_LIMITS.minNumberRetention),
  };
}

const TEXT_FIELDS: Array<keyof RewriteDraft> = ['summary', 'short', 'medium', 'long', 'podcastScript'];

/**
 * Gate for generated news copy: rejects drafts that lift phrasing from the source (n-gram overlap /
 * verbatim run) or that lose the source's numbers. The source headline is part of the compared text.
 */
export function assessRewrite(
  draft: RewriteDraft,
  sourceTitle: string,
  sourceBody: string,
  limits: QualityLimits = DEFAULT_QUALITY_LIMITS,
  /** publisher names for this item (Source.name / domain variants); a draft that still names any publisher is rejected */
  publisherNames: readonly string[] = [],
): RewriteAssessment {
  const source = `${sourceTitle}\n${sourceBody}`;
  const problems: RewriteAssessment['problems'] = [];

  const fields: Array<[string, string]> = [
    ['title', draft.title ?? ''],
    ...TEXT_FIELDS.map((f) => [f, String(draft[f] ?? '')] as [string, string]),
    ['keyPoints', (draft.keyPoints ?? []).join('\n')],
  ];
  const hasContent = (draft.long ?? '').trim().length > 0 || (draft.summary ?? '').trim().length > 0;
  if (!hasContent || !(draft.title ?? '').trim()) problems.push('empty');
  if (fields.some(([, text]) => containsSourceMention(text, publisherNames))) problems.push('names_source');

  let worst: OverlapResult | null = null;
  let worstField: string | null = null;
  let tooSimilar = false;
  for (const [name, text] of fields) {
    if (!text.trim()) continue;
    // A headline is short; compare it by exact-run only through the generic limits (n=5 words rarely fires).
    const r = measureOverlap(text, source);
    if (overlapTooHigh(r, limits)) {
      tooSimilar = true;
      if (!worst || r.ratio > worst.ratio || r.longestRun > worst.longestRun) { worst = r; worstField = name; }
    } else if (!worst && (!worstField)) {
      // keep the most-similar passing field for diagnostics
      worst = r; worstField = name;
    }
  }
  if (tooSimilar) problems.push('too_similar');

  // Facts: numbers must survive in the full-coverage text (long + key points + medium).
  const covered = [draft.long, draft.medium, draft.summary, (draft.keyPoints ?? []).join(' ')].join('\n');
  const nr = numberRetention(covered, source);
  if (nr.total >= 3 && nr.ratio < limits.minNumberRetention) problems.push('missing_facts');

  return {
    ok: problems.length === 0,
    problems,
    worst,
    worstField,
    numbers: { ratio: nr.ratio, total: nr.total, missing: nr.missing },
  };
}

/** keyPoints from the model: tolerate strings, bullets markers, numbering, duplicates. */
export function normalizeKeyPoints(raw: unknown, max = 8): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/\n+/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const t = item.replace(/^\s*(?:[-*•·▪●]|\d{1,2}[.)])\s*/u, '').replace(/\s+/g, ' ').trim();
    if (t.length < 8) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.slice(0, 220));
    if (out.length >= max) break;
  }
  return out;
}
