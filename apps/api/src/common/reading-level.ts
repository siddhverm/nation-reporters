export type ReadingLevel = 'simple' | 'plain' | 'standard' | 'advanced';

export const READING_LEVELS: readonly ReadingLevel[] = ['simple', 'plain', 'standard', 'advanced'];

/** Parse READING_LEVEL (env/config). Unknown values fall back to "simple". */
export function parseReadingLevel(value: string | null | undefined): ReadingLevel {
  const v = (value ?? '').trim().toLowerCase();
  return (READING_LEVELS as readonly string[]).includes(v) ? (v as ReadingLevel) : 'simple';
}

/** Style guidance injected into the rewrite prompt. Language-neutral so it works for all 23 languages. */
export const READING_LEVEL_GUIDANCE: Record<ReadingLevel, string> = {
  simple:
    'Reading level: SIMPLE (about school grade 6-8). Short sentences (usually under 18 words), everyday words a general reader knows, one idea per sentence. Explain any technical term, abbreviation or institution in a few plain words the first time it appears. No idioms, no metaphors.',
  plain:
    'Reading level: PLAIN (about school grade 9-10). Clear sentences (usually under 25 words), common vocabulary, brief explanations of jargon.',
  standard:
    'Reading level: STANDARD newspaper style. Clear, direct sentences; define specialist terms briefly.',
  advanced:
    'Reading level: ADVANCED. Precise, analytical prose for informed readers; specialist terms allowed.',
};
