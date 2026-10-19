import { backfillStoryImages, legacyImageUrlsOf, type ImgDeps, type ImgStory } from './backfill-story-images-lib';

const story = (id: string): ImgStory => ({ id, slug: `s-${id}`, title: 't', language: 'en', excerpt: null, categorySlug: 'india', body: {}, pageUrl: `https://p.example/${id}`, legacyImageUrls: [] });

function make(rows: ImgStory[], state: Record<string, 'present' | 'source_mirrored' | 'generated' | 'fallback' | 'error'>) {
  const logs: string[] = []; let purged = 0; const applied: string[] = [];
  const deps: ImgDeps = {
    listBatch: async ({ afterId, take }) => { const i = afterId ? rows.findIndex((r) => r.id === afterId) + 1 : 0; return rows.slice(i, i + take); },
    backfill: async (s, o) => {
      const st = state[s.id];
      if (st === 'present') return { outcome: 'ok_present' };
      if (o.dryRun) return { outcome: 'would_backfill' };
      applied.push(s.id); state[s.id] = 'present' as never;
      return st === 'error' ? { outcome: 'error', reason: 'storage:ECONNREFUSED' } : { outcome: st as never };
    },
    purgeCache: async () => { purged++; }, log: (l) => logs.push(l),
  };
  return { deps, logs, applied, get purged() { return purged; } };
}
const opts = { apply: false, limit: 100, delayMs: 0, batchSize: 2 };

describe('backfillStoryImages', () => {
  it('dry run counts what would change and touches nothing', async () => {
    const h = make([story('1'), story('2'), story('3')], { 1: 'present', 2: 'source_mirrored', 3: 'generated' });
    const { counts } = await backfillStoryImages(h.deps, opts);
    expect(counts).toMatchObject({ scanned: 3, ok_present: 1, would_backfill: 2 });
    expect(h.applied).toHaveLength(0);
    expect(h.purged).toBe(0);
  });
  it('apply reports counts per outcome (source mirrored / generated / fallback) and purges the cache', async () => {
    const h = make([story('1'), story('2'), story('3'), story('4')], { 1: 'source_mirrored', 2: 'generated', 3: 'fallback', 4: 'present' });
    const { counts } = await backfillStoryImages(h.deps, { ...opts, apply: true });
    expect(counts).toMatchObject({ scanned: 4, source_mirrored: 1, generated: 1, fallback: 1, ok_present: 1, error: 0 });
    expect(h.purged).toBe(1);
  });
  it('is idempotent (second run finds everything present)', async () => {
    const rows = [story('1'), story('2')]; const state: any = { 1: 'source_mirrored', 2: 'generated' };
    const h = make(rows, state);
    await backfillStoryImages(h.deps, { ...opts, apply: true });
    const again = await backfillStoryImages(h.deps, { ...opts, apply: true });
    expect(again.counts).toMatchObject({ ok_present: 2, source_mirrored: 0, generated: 0 });
  });
  it('--limit caps stories actually backfilled (present ones do not count)', async () => {
    const h = make([story('1'), story('2'), story('3'), story('4')], { 1: 'present', 2: 'generated', 3: 'generated', 4: 'generated' });
    const { counts, stoppedEarly } = await backfillStoryImages(h.deps, { ...opts, apply: true, limit: 2 });
    expect(counts.generated).toBe(2);
    expect(stoppedEarly).toMatch(/limit/);
  });
  it('a storage outage stops the run instead of burning through every story', async () => {
    const h = make([story('1'), story('2'), story('3')], { 1: 'error', 2: 'generated', 3: 'generated' });
    const { counts, stoppedEarly } = await backfillStoryImages(h.deps, { ...opts, apply: true });
    expect(counts.error).toBe(1);
    expect(counts.generated).toBe(0);
    expect(stoppedEarly).toMatch(/storage/i);
  });
  it('legacyImageUrlsOf keeps only absolute http(s) URLs (never our own /story-image path)', () => {
    expect(legacyImageUrlsOf({ imageUrl: 'https://cdn.example/a.jpg' }, ['/story-image/x', 'https://cdn.example/a.jpg', null, 'https://o.example/b.png'])).toEqual(['https://cdn.example/a.jpg', 'https://o.example/b.png']);
    expect(legacyImageUrlsOf({ imageUrl: '/story-image/x' }, [])).toEqual([]);
  });
});
