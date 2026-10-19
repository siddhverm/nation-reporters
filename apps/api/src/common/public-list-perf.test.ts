import { registerSourceNames, scrubSourceMentions, containsSourceMention, filterSourceHashtags } from './source-scrub.util';
import { sanitizeArticleListItem, sanitizeTextForPublic, LIST_TEXT_MAX_CHARS } from './article-public-sanitize.util';
import { namesFromSources } from './source-names.service';
import { runBench, benchSources } from '../scripts/bench-public-list';
import { ArticlesService } from '../modules/articles/articles.service';

afterAll(() => registerSourceNames([]));

describe('public list serializer performance (large publisher registry)', () => {
  it('150 long rows with ~1.3k registered names stay well under the request budget', () => {
    // Before the fix this took ~79 s (with narration) / ~19 s (without) on the same box; now ≈ 0.9 s / 0.4 s.
    const withNarration = runBench(150, true);
    const listShape = runBench(150, false);
    expect(withNarration.registeredNames).toBeGreaterThan(1000);
    expect(listShape.totalMs).toBeLessThan(4000);
    expect(withNarration.totalMs).toBeLessThan(8000);
  }, 60_000);

  it('one very long single-line text without markers is linear (no quadratic -WATCH / desk / .* scans)', () => {
    registerSourceNames(namesFromSources(benchSources()));
    const hi = 'राज्य सरकार ने सोमवार को किसानों के लिए राहत पैकेज की घोषणा की और अधिकारियों ने कहा कि भुगतान जल्द शुरू होगा '.repeat(250);
    const en = 'The state government announced a relief package for farmers on Monday and officials said payments start soon '.repeat(250);
    const t = Date.now();
    sanitizeTextForPublic(hi, { sourceName: 'Bhopal Samachar', sourceUrl: 'https://bhopalsamachar.in/rss' });
    sanitizeTextForPublic(en, { sourceName: 'Bhopal Samachar', sourceUrl: 'https://bhopalsamachar.in/rss' });
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

describe('name subsetting keeps the scrub results', () => {
  beforeAll(() => registerSourceNames(namesFromSources(benchSources())));

  it('registered names among ~1.3k are still neutralised in attribution context', () => {
    expect(scrubSourceMentions('Prices rose, according to Bhopal Samachar, on Monday.')).toBe('Prices rose, according to a report, on Monday.');
    expect(scrubSourceMentions('The minister told Indore Herald that work starts soon.')).toBe('The minister told reporters that work starts soon.');
    expect(containsSourceMention('as reported by Jaipur Chronicle')).toBe(true);
    expect(containsSourceMention('Farmers in Jaipur got relief')).toBe(false);
  });

  it('built-in unique tokens and chrome lines still go; company subjects stay', () => {
    expect(scrubSourceMentions('MUMBAI (PTI) – The Sensex fell 300 points.')).toBe('MUMBAI: The Sensex fell 300 points.');
    expect(scrubSourceMentions('Rain lashed the city.\nDownload the TOI app for more news.')).toBe('Rain lashed the city.');
    expect(scrubSourceMentions('Fairfax gets 15 years to reduce stake in IDBI to 26%')).toBe('Fairfax gets 15 years to reduce stake in IDBI to 26%');
    expect(scrubSourceMentions('Text with no outlet at all.')).toBe('Text with no outlet at all.');
  });

  it('a promo sentence inside a long paragraph is dropped exactly as before', () => {
    const long = `${'Officials said the relief would reach every district within two weeks. '.repeat(4)}Follow NDTV on X for the latest updates. The rest stays.`;
    const out = scrubSourceMentions(long);
    expect(out).not.toMatch(/NDTV/);
    expect(out).toMatch(/The rest stays\.$/);
  });

  it('hashtag filtering still sees the whole registry', () => {
    expect(filterSourceHashtags(['#BhopalSamachar', '#Farmers'])).toEqual(['#Farmers']);
  });
});

describe('list item text cap', () => {
  it('cleans at most LIST_TEXT_MAX_CHARS of an excerpt, cut at a sentence', () => {
    const excerpt = 'A sentence about the relief package. '.repeat(200);
    const out = sanitizeArticleListItem({ title: 'Relief package announced for farmers', excerpt, slug: 's', language: 'en' });
    expect(out.excerpt!.length).toBeLessThanOrEqual(LIST_TEXT_MAX_CHARS);
    expect(out.excerpt!.endsWith('.')).toBe(true);
  });
});

describe('public list cache (articles service)', () => {
  function svc() {
    const findMany = jest.fn(async (_args: unknown) => [{ id: 'a1', title: 'Relief package for farmers', slug: 'a1', excerpt: 'Short.', language: 'en' }]);
    const count = jest.fn(async () => 1);
    const redis = { getJson: jest.fn(async () => null), setJson: jest.fn(async () => undefined), delByPrefix: jest.fn(async () => undefined) };
    const s = new ArticlesService({ article: { findMany, count } } as never, { get: () => undefined } as never, redis as never);
    return { s, findMany, redis };
  }

  it('second identical public request is served from cache; concurrent ones share one query', async () => {
    const { s, findMany, redis } = svc();
    const f = { language: 'en', limit: '150', omitBody: true };
    const [a, b] = await Promise.all([s.findAll(f, 'public'), s.findAll(f, 'public')]);
    expect(a).toBe(b);
    const calls = findMany.mock.calls.length;
    await s.findAll(f, 'public');
    expect(findMany.mock.calls.length).toBe(calls);
    expect(redis.setJson).toHaveBeenCalledWith(expect.stringMatching(/^articles-list:v1:/), expect.anything(), 60000);
  });

  it('staff requests bypass the cache; the list select has no podcastScript', async () => {
    const { s, findMany } = svc();
    await s.findAll({ limit: '5', omitBody: true }, 'staff');
    await s.findAll({ limit: '5', omitBody: true }, 'staff');
    expect(findMany.mock.calls.length).toBe(2);
    const select = (findMany.mock.calls[0][0] as { select: Record<string, unknown> }).select;
    expect(select.podcastScript).toBeUndefined();
    expect(select.provenance).toBeDefined();
  });
});
