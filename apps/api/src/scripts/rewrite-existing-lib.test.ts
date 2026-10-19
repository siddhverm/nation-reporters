import { analyzeStory, plainTextOfBody, rewriteExistingStories, type Deps, type StoryRow } from './rewrite-existing-lib';

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const row = (id: string, over: Partial<StoryRow> = {}, bodyOver: Record<string, unknown> = {}): StoryRow => ({
  id, slug: `slug-${id}`, title: 'Tiger Shroff hospitalised', language: 'en', status: 'PUBLISHED', createdAt: new Date('2026-09-01'),
  excerpt: 'According to TOI, he is stable.', bodyShort: null, bodyMedium: null, podcastScript: null, hashtags: ['#TigerShroff', '#TOI'], ingestedArticleId: `ing-${id}`,
  body: { type: 'doc', content: [para('Fans are worried, with the TOI report suggesting a bullet may have been lodged.'), para('Trending Stories'), para('Join conversation')], imageUrl: '/story-image/x', imageOrigin: 'source', ...bodyOver },
  ...over,
});

const good = { title: 'Tiger Shroff is in hospital', short: 'He is stable.', medium: 'He is stable and will go home soon.', long: 'The actor went to hospital on Friday.\n\nDoctors say he is stable.', summary: 'The actor is stable in hospital and will go home in two days after leg pain during a stunt.', keyPoints: ['He is stable.', 'He will go home in two days.'], podcastScript: 'He is stable.', seoTitle: 'Tiger Shroff is in hospital', seoDescription: 'The actor is stable.' };

function makeDeps(rows: StoryRow[], rewrite: Deps['rewrite']) {
  const updates: Array<{ id: string; data: any }> = [];
  const stored = new Map(rows.map((r) => [r.id, { ...r }]));
  const logs: string[] = [];
  let purged = 0; let captionsScrubbed = 0; let rewriteCalls = 0;
  const deps: Deps = {
    listBatch: async ({ afterId, take }) => {
      const all = [...stored.values()].filter((r) => r.status === 'PUBLISHED').sort((a, b) => a.id.localeCompare(b.id));
      const start = afterId ? all.findIndex((r) => r.id === afterId) + 1 : 0;
      return all.slice(start, start + take);
    },
    loadSource: async (r) => ({ title: 'Tiger Shroff hospitalised', body: 'Actor Tiger Shroff was taken to a hospital on Friday after pain in his leg during a stunt. Doctors said he is stable and will be discharged in two days.', sourceName: 'Times of India', sourceUrl: `https://timesofindia.indiatimes.com/${r.id}` }),
    rewrite: async (i) => { rewriteCalls++; return rewrite(i); },
    updateStory: async (id, data) => { updates.push({ id, data }); Object.assign(stored.get(id)!, data); },
    scrubCaptions: async () => { captionsScrubbed++; },
    purgeCache: async () => { purged++; },
    log: (l) => logs.push(l),
  };
  return { deps, updates, stored, logs, get purged() { return purged; }, get captionsScrubbed() { return captionsScrubbed; }, get rewriteCalls() { return rewriteCalls; } };
}
const opts = { apply: false, limit: 50, delayMs: 0, batchSize: 2 };

describe('analyzeStory', () => {
  it('flags publisher names, boilerplate and the old (non key-point) format', () => {
    const a = analyzeStory(row('1'), ['Times of India']);
    expect(a.needsRewrite).toBe(true);
    expect(a.issues).toEqual(expect.arrayContaining(['names_source', 'boilerplate', 'not_rewritten_format']));
  });
  it('leaves clean rewritten stories and already processed ones alone', () => {
    const clean = row('2', { excerpt: 'The actor is stable.', hashtags: [] }, { content: [para('The actor went to hospital on Friday.')], keyPoints: ['He is stable.'] });
    expect(analyzeStory(clean).needsRewrite).toBe(false);
    expect(analyzeStory(row('3', {}, { rewriteV2: { outcome: 'rewritten' } })).issues).toEqual(['already_processed']);
  });
  it('plainTextOfBody joins paragraphs', () => {
    expect(plainTextOfBody({ type: 'doc', content: [para('A.'), para('B.')] })).toBe('A.\n\nB.');
  });
});

describe('rewriteExistingStories', () => {
  it('DRY RUN: no model calls, no writes', async () => {
    const h = makeDeps([row('a'), row('b'), row('c')], async () => ({ ok: true, needsReview: false, fields: good }));
    const { counts } = await rewriteExistingStories(h.deps, opts);
    expect(counts).toMatchObject({ scanned: 3, would_rewrite: 3, rewritten: 0 });
    expect(h.updates).toHaveLength(0);
    expect(h.rewriteCalls).toBe(0);
    expect(h.purged).toBe(0);
  });

  it('APPLY: rewrites, keeps slug/image fields, marks the story, scrubs captions, purges cache once', async () => {
    const h = makeDeps([row('a'), row('b')], async () => ({ ok: true, needsReview: false, fields: good }));
    const { counts } = await rewriteExistingStories(h.deps, { ...opts, apply: true });
    expect(counts.rewritten).toBe(2);
    const u = h.updates[0].data;
    expect(u.title).toBe(good.title);
    expect(u.excerpt).toBe(good.summary);
    expect(u.hashtags).toEqual(['#TigerShroff']); // #TOI dropped
    expect(u.slug).toBeUndefined();
    expect(u.body.imageUrl).toBe('/story-image/x');
    expect(u.body.keyPoints).toEqual(good.keyPoints);
    expect(u.body.content).toHaveLength(2);
    expect(u.body.rewriteV2.outcome).toBe('rewritten');
    expect(h.captionsScrubbed).toBe(2);
    expect(h.purged).toBe(1);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const h = makeDeps([row('a'), row('b')], async () => ({ ok: true, needsReview: false, fields: good }));
    await rewriteExistingStories(h.deps, { ...opts, apply: true });
    const before = h.updates.length;
    const second = await rewriteExistingStories(h.deps, { ...opts, apply: true });
    expect(second.counts.rewritten + second.counts.drafted).toBe(0);
    expect(second.counts.skipped).toBe(2);
    expect(h.updates).toHaveLength(before);
  });

  it('unsafe stories become DRAFT (never deleted) with a recorded reason; image/body kept', async () => {
    const h = makeDeps([row('a')], async () => ({ ok: false, retryable: false, reason: 'source text unusable (mostly_boilerplate)' }));
    const { counts } = await rewriteExistingStories(h.deps, { ...opts, apply: true });
    expect(counts.drafted).toBe(1);
    const u = h.updates[0].data;
    expect(u.status).toBe('DRAFT');
    expect(u.body.rewriteV2).toMatchObject({ outcome: 'drafted', reason: expect.stringContaining('mostly_boilerplate') });
    expect(u.body.imageUrl).toBe('/story-image/x');
    expect(h.stored.get('a')).toBeDefined();
  });

  it('facts missing → rewritten but PENDING_REVIEW', async () => {
    const h = makeDeps([row('a')], async () => ({ ok: true, needsReview: true, fields: good }));
    const { counts } = await rewriteExistingStories(h.deps, { ...opts, apply: true });
    expect(counts.rewritten_needs_review).toBe(1);
    expect(h.updates[0].data.status).toBe('PENDING_REVIEW');
  });

  it('quota / transient errors change nothing; quota stops the run for a later re-run', async () => {
    const h = makeDeps([row('a'), row('b'), row('c')], async () => ({ ok: false, retryable: true, reason: '429 Quota exceeded' }));
    const { counts, stoppedEarly } = await rewriteExistingStories(h.deps, { ...opts, apply: true });
    expect(counts.retry_later).toBe(1);
    expect(stoppedEarly).toMatch(/quota/i);
    expect(h.updates).toHaveLength(0);
    expect(h.purged).toBe(0);
    const t = makeDeps([row('a'), row('b')], async () => ({ ok: false, retryable: true, reason: 'ECONNRESET' }));
    const r = await rewriteExistingStories(t.deps, { ...opts, apply: true });
    expect(r.counts.retry_later).toBe(2);
    expect(t.updates).toHaveLength(0);
  });

  it('respects --limit and falls back to the story own text when the stored source is unusable', async () => {
    const calls: string[] = [];
    const h = makeDeps([row('a'), row('b'), row('c')], async (i) => { calls.push(i.body.slice(0, 12)); return calls.length === 1 ? { ok: false, retryable: false, reason: 'unusable' } : { ok: true, needsReview: false, fields: good }; });
    const { counts, stoppedEarly } = await rewriteExistingStories(h.deps, { ...opts, apply: true, limit: 1 });
    expect(counts.rewritten).toBe(1);
    expect(counts.drafted).toBe(0);
    expect(calls).toHaveLength(2); // first candidate (source) failed → second (own text) succeeded
    expect(stoppedEarly).toMatch(/limit/);
  });
});
