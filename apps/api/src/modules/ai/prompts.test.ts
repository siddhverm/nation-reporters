import * as fs from 'fs';
import * as path from 'path';
import { rewritePrompt, REWRITE_JSON_KEYS } from './prompts/rewrite.prompt';
import { translatePrompt } from './prompts/translate.prompt';
import { LANG_NAMES, languageDisplayName } from './prompts/lang-names';
import { parseReadingLevel, READING_LEVELS, READING_LEVEL_GUIDANCE } from '../../common/reading-level';

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../test-fixtures/news-fixtures.json'), 'utf8'));
const LANGS = Object.keys(fixtures.languages);

describe.each(LANGS)('rewrite prompt — %s', (code) => {
  const p = rewritePrompt('Headline', 'Body text with 2028 and 12,500.', code);
  it('names the target language and code, and demands every field in it', () => {
    expect(p).toContain(LANG_NAMES[code]);
    expect(p).toContain(`code: ${code}`);
    expect(p).toMatch(new RegExp(`entirely in ${LANG_NAMES[code]}`));
    expect(p).toContain(`"language": "${code}"`);
  });
  it('requires all output fields (in-brief, key points, full body, headline)', () => {
    for (const k of REWRITE_JSON_KEYS) expect(p).toContain(`"${k}"`);
    expect(p).toMatch(/exactly 2 or 3 sentences/);
    expect(p).toMatch(/5 to 8 short bullet/);
    expect(p).toMatch(/SHORT paragraphs/);
    expect(p).toMatch(/under 70 characters/);
  });
  it('covers who/what/when/where/why/next and keeps facts', () => {
    expect(p).toMatch(/WHAT happened, WHO is involved, WHEN, WHERE, WHY it matters, and WHAT happens next/);
    expect(p).toMatch(/Keep EVERY number/);
    expect(p).toMatch(/Never invent facts/);
  });
  it('forbids copying and naming the source', () => {
    expect(p).toMatch(/Never copy sentences/);
    expect(p).toMatch(/Never name or hint at the original publisher/);
    expect(p).toMatch(/quote of at most 8 words/);
  });
});

describe('rewrite prompt options', () => {
  it('reading level is configurable and defaults to simple', () => {
    expect(rewritePrompt('t', 'b', 'en')).toContain(READING_LEVEL_GUIDANCE.simple);
    for (const level of READING_LEVELS) {
      expect(rewritePrompt('t', 'b', 'en', { readingLevel: level })).toContain(READING_LEVEL_GUIDANCE[level]);
    }
  });
  it('parseReadingLevel falls back to simple', () => {
    expect(parseReadingLevel('Plain')).toBe('plain');
    expect(parseReadingLevel('nonsense')).toBe('simple');
    expect(parseReadingLevel(undefined)).toBe('simple');
  });
  it('caps body length and adds a stricter retry instruction', () => {
    expect(rewritePrompt('t', 'b', 'en', { maxLongWords: 320 })).toContain('at most 320 words');
    expect(rewritePrompt('t', 'b', 'en', { retryReason: 'too_similar' })).toMatch(/PREVIOUS ATTEMPT REJECTED: it reused phrases/);
    const mf = rewritePrompt('t', 'b', 'en', { retryReason: 'missing_facts', missingNumbers: ['2028', '12500'] });
    expect(mf).toMatch(/dropped facts/);
    expect(mf).toContain('2028, 12500');
  });
  it('unknown languages fall back to English instead of crashing', () => {
    expect(languageDisplayName('xx')).toBe('English');
  });
});

describe('translate prompt generalised to every language pair', () => {
  it.each(LANGS)('%s as target and as source', (code) => {
    const to = translatePrompt('Hello world', 'en', code);
    expect(to).toContain(LANG_NAMES[code]);
    expect(to).toContain(`(${code})`);
    expect(to).toMatch(/Keep every number, date, amount/);
    expect(to).toMatch(/Return ONLY the translated text/);
    const from = translatePrompt('text', code, code === 'hi' ? 'ta' : 'hi');
    expect(from).toContain(`from ${LANG_NAMES[code]}`);
  });
  it('never asks for or allows publisher names', () => {
    expect(translatePrompt('x', 'en', 'hi')).toMatch(/Do not add the original publisher's name/);
  });
  it('can keep the simple style', () => {
    expect(translatePrompt('x', 'en', 'hi', { keepSimple: true })).toMatch(/simple/);
  });
});
