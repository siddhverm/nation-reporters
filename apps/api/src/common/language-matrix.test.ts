/**
 * Language × leak/pipeline matrix. Fixtures: test-fixtures/news-fixtures.json (shared with web + e2e).
 * Every supported UI language (SUPPORTED_APP_LANGUAGES in apps/web/lib/countries.ts) is exercised.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  buildReaderSummaryFromPlainText,
  splitStoryBodies,
  stripPublisherFeedBoilerplate,
} from './reader-summary.util';
import { sanitizeArticleForPublicResponse } from './article-public-sanitize.util';
import { slugifyTitle } from './slug.util';
import { measureOverlap, overlapTooHigh } from './text-overlap.util';
import { languageDisplayName } from '../modules/ai/prompts/lang-names';
import { rewritePrompt } from '../modules/ai/prompts/rewrite.prompt';
import { seoPrompt } from '../modules/ai/prompts/seo.prompt';
import { captionsPrompt } from '../modules/ai/prompts/captions.prompt';
import {
  acceptLanguageHeaderForLocale,
  inferLangFromText,
  resolveArticleLanguage,
} from '../modules/ai/language-resolution.util';

type Fx = {
  dir: string;
  title: string;
  paragraphs: string[];
  adWord: string;
  chrome: { byline: string; photoCredit: string; sourceLine: string; viaLine: string; readMore: string };
};
const fixtures = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../test-fixtures/news-fixtures.json'), 'utf8'),
) as { outlet: string; domain: string; reporter: string; photographer: string; languages: Record<string, Fx> };

const { outlet, domain, reporter, photographer } = fixtures;
const LANGS = Object.keys(fixtures.languages);
const SOURCE_URL = `https://${domain}/story/12345`;
const NATIVE_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', te: 'Telugu', ta: 'Tamil', gu: 'Gujarati',
  kn: 'Kannada', pa: 'Punjabi', ur: 'Urdu', ml: 'Malayalam', ar: 'Arabic', fr: 'French', de: 'German',
  es: 'Spanish', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  id: 'Indonesian', tr: 'Turkish', it: 'Italian',
};
const SCRIPT_LANGS = ['hi', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'pa', 'ur', 'ml', 'ar', 'ru', 'zh', 'ja', 'ko'];

function rawStory(fx: Fx): string {
  const c = fx.chrome;
  return [c.byline, c.photoCredit, ...fx.paragraphs, c.sourceLine, c.viaLine, c.readMore].join('\n');
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
function leaks(text: string): string[] {
  const t = text.toLowerCase();
  return [outlet, domain, 'dailyplanet', reporter, photographer, 'read more']
    .filter((n) => t.includes(n.toLowerCase()));
}
const opts = { sourceName: outlet, sourceUrl: SOURCE_URL };

test('fixtures cover all 23 UI languages', () => {
  expect(LANGS.sort()).toEqual(Object.keys(NATIVE_NAMES).sort());
});

describe.each(LANGS)('language %s', (code) => {
  const fx = fixtures.languages[code];

  test('A1 publisher chrome/byline/credit/source/URL stripped from story text', () => {
    const out = stripPublisherFeedBoilerplate(rawStory(fx), fx.title, opts);
    expect(leaks(out)).toEqual([]);
  });

  test('A2 story sentences survive intact (no over-stripping, paragraph kept whole)', () => {
    const out = norm(stripPublisherFeedBoilerplate(rawStory(fx), fx.title, opts));
    for (const p of fx.paragraphs) expect(out).toContain(norm(p));
  });

  test('A3 public article response: no source details in title/excerpt/body/seo/captions', () => {
    const article = {
      title: fx.title,
      excerpt: [fx.chrome.byline, fx.paragraphs[0]].join('\n'),
      bodyShort: rawStory(fx),
      bodyMedium: rawStory(fx),
      seoTitle: `${fx.title} | ${outlet}`,
      seoDescription: `${fx.paragraphs[0]} (${outlet})`,
      body: {
        type: 'doc',
        content: rawStory(fx).split('\n').map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
      },
      socialCaptions: [{ platform: 'TWITTER', caption: `${fx.title} ${fx.chrome.viaLine}` }],
      provenance: { sourceName: outlet, sourceUrl: SOURCE_URL },
    };
    const json = JSON.stringify(sanitizeArticleForPublicResponse(article));
    expect(leaks(json)).toEqual([]);
  });

  test('A4 slug is a non-empty URL-safe ASCII string', () => {
    const slug = slugifyTitle(fx.title);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug.length).toBeGreaterThanOrEqual(4);
  });

  test('A5 script detection / language resolution', () => {
    if (SCRIPT_LANGS.includes(code)) {
      expect(resolveArticleLanguage(code, { title: fx.title, body: fx.paragraphs[0] })).toBe(code);
      // Script detection alone (used for mis-tagged rows). Chinese/Japanese/Urdu/Arabic need the exact script.
      // Marathi shares Devanagari with Hindi: script alone cannot tell them apart (feed language decides).
      expect(inferLangFromText(fx.title)).toBe(code === 'mr' ? 'hi' : code);
    } else {
      expect(inferLangFromText(fx.title)).toBeNull();
      expect(resolveArticleLanguage(code, { title: fx.title, body: fx.paragraphs[0] })).toBe(code);
    }
  });

  test('A6 language display name is correct (not silently English)', () => {
    expect(languageDisplayName(code)).toBe(NATIVE_NAMES[code]);
  });

  test('A7 AI prompts instruct output in the target language', () => {
    const name = NATIVE_NAMES[code];
    expect(rewritePrompt(fx.title, fx.paragraphs.join('\n'), code)).toContain(`Target output language: ${name}`);
    if (code !== 'en') {
      expect(seoPrompt(fx.title, fx.paragraphs.join(' '), code)).toContain(name);
      expect(captionsPrompt(fx.title, fx.paragraphs[0], code)).toContain(name);
    }
  });

  test('A8 Accept-Language header starts with the language', () => {
    expect(acceptLanguageHeaderForLocale(code).toLowerCase().startsWith(code)).toBe(true);
  });

  test('A9 reader summary + body split are leak-free and non-empty', () => {
    const summary = buildReaderSummaryFromPlainText(rawStory(fx), fx.title, { minChars: 20, ...opts });
    expect(summary.length).toBeGreaterThan(10);
    expect(leaks(summary)).toEqual([]);
    const { bodyMedium } = splitStoryBodies(rawStory(fx), fx.title, opts);
    expect(leaks(bodyMedium)).toEqual([]);
  });

  test('A10 a mid-sentence local word for "advertising" is not deleted', () => {
    const p = fx.paragraphs.find((x) => x.includes(fx.adWord));
    expect(p).toBeTruthy();
    const out = norm(stripPublisherFeedBoilerplate(rawStory(fx), fx.title, opts));
    expect(out).toContain(norm(p!));
  });

  test('A11 public response: inline source line, outlet hashtags, SEO slug and social captions are clean', () => {
    const c = fx.chrome;
    const compact = outlet.replace(/\s+/g, '');
    const out = sanitizeArticleForPublicResponse({
      title: `${fx.title} - ${outlet}`,
      slug: `${slugifyTitle(fx.title)}`,
      language: code,
      excerpt: `${fx.paragraphs[0]} ${c.sourceLine}`,
      seoTitle: `${fx.title} | ${outlet}`,
      seoDescription: `${fx.paragraphs[0]} ${c.viaLine}`,
      seoSlug: `${slugifyTitle(fx.title)}-${domain}`,
      hashtags: [`#${compact}`, '#news'],
      socialCaptions: [{ platform: 'TWITTER', caption: `${fx.title} ${c.viaLine} #${compact}` }],
      provenance: { sourceName: outlet, sourceUrl: SOURCE_URL },
    } as never) as any;
    expect(leaks(JSON.stringify(out))).toEqual([]);
    expect(out.hashtags).toEqual(['#news']);
    // nothing dangling once the outlet is removed ("… Source:", "… via", "… के अनुसार")
    expect(out.excerpt).toMatch(/[\p{L}\p{N}.!?।。！？؟\u06d4)”"']$/u);
    expect(out.seoDescription).toMatch(/[\p{L}\p{N}.!?।。！？؟\u06d4)”"']$/u);
    expect(out.excerpt).toContain(norm(fx.paragraphs[0]).slice(0, 15));
  });

  test('A12 copy-safety: a verbatim copy of the story is flagged, an unrelated text is not (all scripts)', () => {
    const source = `${fx.title}\n${fx.paragraphs.join('\n')}`;
    const copy = measureOverlap(fx.paragraphs.join(' '), source);
    expect(overlapTooHigh(copy)).toBe(true);
    const other = fixtures.languages[code === 'en' ? 'fr' : 'en'];
    expect(overlapTooHigh(measureOverlap(other.paragraphs.join(' '), source))).toBe(false);
  });
});
