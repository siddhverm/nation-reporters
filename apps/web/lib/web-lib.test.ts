import * as fs from 'fs';
import * as path from 'path';
import { getArticleImage, getImageAlt, getPreferredArticleImage, getStoryImageUrl, imageOriginOf, LOGO_FALLBACK } from './news-image';
import { articleJsonLd, articleSeo, ogLocale } from './seo';
import { fallbackArtSpec, hashSeed } from './story-art';
import { isRtlLanguage, normalizeUiLanguage } from './ui-language';
import { SUPPORTED_APP_LANGUAGES } from './countries';
import { stripPublisherFeedBoilerplate, buildReaderSummaryFromPlainText } from './reader-summary';

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../test-fixtures/news-fixtures.json'), 'utf8'));
const LANGS = Object.keys(fixtures.languages);
const { outlet, domain, reporter, photographer } = fixtures;

describe('news-image never surfaces a publisher image', () => {
  it('always returns the same-origin generated story image', () => {
    expect(getArticleImage('my-story', 'india', 'hero', 'https://cdn.dailyplanet-gazette.example/a.jpg')).toBe('/story-image/my-story');
    expect(getPreferredArticleImage({ slug: 'my-story', mediaAssets: [{ type: 'IMAGE', url: 'https://evil.example/x.jpg' }] } as never)).toBe('/story-image/my-story');
    expect(getArticleImage('')).toBe(LOGO_FALLBACK);
    expect(getPreferredArticleImage(null)).toBeNull();
  });
  it('encodes non-latin slugs', () => {
    expect(getStoryImageUrl('बाढ़-1')).toBe(`/story-image/${encodeURIComponent('बाढ़-1')}`);
  });
  it('alt text is the headline', () => {
    expect(getImageAlt('Metro line', 'en')).toBe('Illustration for: Metro line');
    expect(getImageAlt('मेट्रो लाइन', 'hi')).toBe('मेट्रो लाइन');
  });
  it('alt text of a source image is simply the headline (no "Illustration for:")', () => {
    expect(getImageAlt('Metro line', 'en', 'source')).toBe('Metro line');
    expect(getImageAlt('Metro line', 'en', 'generated')).toBe('Illustration for: Metro line');
  });
  it('image origin: only an explicit "source" from the API counts; old rows are generated', () => {
    expect(imageOriginOf({ image: { origin: 'source' } })).toBe('source');
    expect(imageOriginOf({ imageOrigin: 'source' })).toBe('source');
    expect(imageOriginOf({ body: { imageOrigin: 'source' } })).toBe('source');
    expect(imageOriginOf({ image: { origin: 'generated' }, imageOrigin: 'source' })).toBe('generated');
    expect(imageOriginOf({})).toBe('generated');
    expect(imageOriginOf(null)).toBe('generated');
    expect(imageOriginOf({ imageOrigin: 'https://cdn.example/x.jpg' })).toBe('generated');
  });
  it('a source-origin story still resolves to our own URL only (payload image URLs are ignored)', () => {
    const a = { slug: 'metro', image: { url: 'https://cdn.dailyplanet-gazette.example/p.jpg', origin: 'source' }, body: { imageUrl: 'https://cdn.dailyplanet-gazette.example/p.jpg' }, mediaAssets: [{ type: 'IMAGE', url: 'https://cdn.dailyplanet-gazette.example/p.jpg' }] };
    expect(getPreferredArticleImage(a as never)).toBe('/story-image/metro');
    expect(getArticleImage('metro', undefined, 'hero', 'https://cdn.dailyplanet-gazette.example/p.jpg')).toBe('/story-image/metro');
  });
});

describe('fallback artwork', () => {
  it('is deterministic per slug, differs between slugs, and contains no text', () => {
    expect(fallbackArtSpec('a')).toEqual(fallbackArtSpec('a'));
    expect(fallbackArtSpec('a')).not.toEqual(fallbackArtSpec('b'));
    const spec = fallbackArtSpec('a');
    expect([...spec.bg, ...spec.shapes.map((x) => x.color)].every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    expect(hashSeed('x')).toBe(hashSeed('x'));
  });
});

describe('SEO helpers: Nation Reporters is the only author/publisher', () => {
  it.each(LANGS)('%s: JSON-LD + meta are source-free and carry image + inLanguage', (lang) => {
    const fx = fixtures.languages[lang];
    const a = { title: fx.title, slug: `story-${lang}`, language: lang, excerpt: fx.paragraphs[0], publishedAt: '2026-10-18T00:00:00Z' };
    const ld = articleJsonLd(a);
    const json = JSON.stringify([ld, articleSeo(a)]);
    for (const n of [outlet, domain, reporter, photographer]) expect(json).not.toContain(n);
    expect(ld.inLanguage).toBe(lang);
    expect(ld.image[0]).toBe(`https://nationreporters.com/story-image/story-${lang}`);
    expect(ld.author.name).toBe('Nation Reporters');
    expect(articleSeo(a).rtl).toBe(lang === 'ar' || lang === 'ur');
    expect(ogLocale(lang)).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
  });
});

describe('languages', () => {
  it('fixtures cover every supported UI language', () => {
    expect([...LANGS].sort()).toEqual([...SUPPORTED_APP_LANGUAGES].map((l: any) => l.code ?? l).sort());
  });
  it('rtl detection', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('ur-PK')).toBe(true);
    expect(isRtlLanguage('hi')).toBe(false);
    expect(normalizeUiLanguage('pt-BR')).toBe('pt');
  });
});

describe('browser-side reader-summary sanitizer (client copy) per language', () => {
  it.each(LANGS)('%s: strips chrome, keeps story text', (lang) => {
    const fx = fixtures.languages[lang];
    const c = fx.chrome;
    const raw = [c.byline, c.photoCredit, ...fx.paragraphs, c.sourceLine, c.viaLine, c.readMore].join('\n');
    const out = stripPublisherFeedBoilerplate(raw, fx.title, { sourceName: outlet, sourceUrl: `https://${domain}/story/1` });
    const low = out.toLowerCase();
    for (const n of [outlet, domain, 'dailyplanet', reporter, photographer]) expect(low).not.toContain(n.toLowerCase());
    expect(out.replace(/\s+/g, ' ')).toContain(fx.paragraphs[0].replace(/\s+/g, ' ').slice(0, 20));
    expect(out).toContain(fx.adWord);
    const summary = buildReaderSummaryFromPlainText(out, fx.title, { sourceName: outlet } as never);
    expect(summary.toLowerCase()).not.toContain('dailyplanet');
  });
});

describe('attribution tables stay in sync between API and web', () => {
  it('apps/web/lib/attribution.ts matches apps/api/src/common/attribution.util.ts (code only)', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
    const api = fs.readFileSync(path.resolve(__dirname, '../../api/src/common/attribution.util.ts'), 'utf8');
    const web = fs.readFileSync(path.resolve(__dirname, './attribution.ts'), 'utf8');
    expect(strip(web)).toBe(strip(api));
  });
});
