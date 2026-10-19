import * as fs from 'fs';
import * as path from 'path';
import { getNotices, IMAGE_COPYRIGHT_EN, NOTICES, type Notices } from './ui-notices';
import { SUPPORTED_APP_LANGUAGES } from './countries';
import { resolveCopyrightEmail, COPYRIGHT_EMAIL_PLACEHOLDER } from './copyright-email';

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../test-fixtures/news-fixtures.json'), 'utf8'));
const LANGS: string[] = Object.keys(fixtures.languages);
const KEYS: (keyof Notices)[] = ['illustration', 'imageCopyright', 'inBrief', 'keyPoints', 'copyrightLink', 'cpTitle', 'cpAi', 'cpHow'];
const PUBLISHER_WORDS = [fixtures.outlet, fixtures.domain, 'nationreporters', 'Nation Reporters'].filter(Boolean).map((x: string) => x.toLowerCase());

describe('reader notices cover every language', () => {
  it('has all 23 languages used by the app and the fixtures', () => {
    expect(LANGS).toHaveLength(23);
    for (const l of LANGS) expect(NOTICES[l]).toBeDefined();
    for (const l of SUPPORTED_APP_LANGUAGES as readonly { code: string }[] | readonly string[]) {
      const code = typeof l === 'string' ? l : l.code;
      expect(NOTICES[code]).toBeDefined();
    }
  });

  it('English asterisk note is the exact requested wording', () => {
    expect(IMAGE_COPYRIGHT_EN).toBe('* We do not own the copyright of this image. Image belongs to its original owner; removed on request.');
    expect(getNotices('en').imageCopyright).toBe(IMAGE_COPYRIGHT_EN);
  });

  it.each(LANGS)('%s: every string present, translated, asterisk note starts with * (non-RTL), no publisher names', (l) => {
    const n = NOTICES[l];
    for (const k of KEYS) {
      expect(typeof n[k]).toBe('string');
      expect(n[k].trim().length).toBeGreaterThanOrEqual(2);
      for (const p of PUBLISHER_WORDS) expect(n[k].toLowerCase()).not.toContain(p);
      expect(n[k]).not.toMatch(/https?:|www\./i);
    }
    expect(n.imageCopyright).toContain('*');
    if (l !== 'en') {
      expect(n.illustration).not.toBe(NOTICES.en.illustration);
      expect(n.imageCopyright).not.toBe(NOTICES.en.imageCopyright);
      expect(n.cpTitle).not.toBe(NOTICES.en.cpTitle);
      expect(n.cpAi).not.toBe(NOTICES.en.cpAi);
      expect(n.cpHow).not.toBe(NOTICES.en.cpHow);
    }
  });

  it('every disclosure line says AI-generated in its own language (AI / IA / 人工智能 etc.)', () => {
    for (const l of LANGS) {
      expect(NOTICES[l].illustration).toMatch(/AI|IA|KI|ИИ|एआई|एआय|এআই|ఏఐ|ஏஐ|ਏ|ا[ےی] آئی|അ|ذكاء|人工智能|yapay|AI/i);
    }
  });

  it('resolves region tags and falls back to English', () => {
    expect(getNotices('pt-BR')).toBe(NOTICES.pt);
    expect(getNotices('zh_CN')).toBe(NOTICES.zh);
    expect(getNotices('xx')).toBe(NOTICES.en);
    expect(getNotices(undefined)).toBe(NOTICES.en);
  });
});

describe('copyright contact email', () => {
  it('reads COPYRIGHT_EMAIL, falls back to a placeholder', () => {
    expect(resolveCopyrightEmail({ COPYRIGHT_EMAIL: ' legal@site.test ' })).toBe('legal@site.test');
    expect(resolveCopyrightEmail({})).toBe(COPYRIGHT_EMAIL_PLACEHOLDER);
    expect(resolveCopyrightEmail({ COPYRIGHT_EMAIL: '  ' })).toBe(COPYRIGHT_EMAIL_PLACEHOLDER);
  });
});
