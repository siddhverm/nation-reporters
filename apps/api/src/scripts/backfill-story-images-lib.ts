import { sleep } from './cli-util';

export type ImgStory = {
  id: string; slug: string; title: string; language: string; excerpt: string | null; categorySlug: string | null;
  body: unknown; pageUrl: string | null; legacyImageUrls: string[];
};
export type BackfillResult = { outcome: 'ok_present' | 'would_backfill' | 'source_mirrored' | 'generated' | 'fallback' | 'error'; reason?: string };
export type ImgCounts = Record<'scanned' | 'ok_present' | 'would_backfill' | 'source_mirrored' | 'generated' | 'fallback' | 'error', number>;

export type ImgDeps = {
  listBatch: (o: { since?: Date; before?: Date; slug?: string; afterId: string | null; take: number }) => Promise<ImgStory[]>;
  backfill: (s: ImgStory, o: { dryRun: boolean }) => Promise<BackfillResult>;
  purgeCache: () => Promise<void>;
  log: (l: string) => void;
};
export type ImgOptions = { apply: boolean; limit: number; since?: Date; before?: Date; slug?: string; delayMs: number; batchSize: number };

/** Legacy publisher image URLs that old code stored on the story (server-side use only; never logged in full). */
export function legacyImageUrlsOf(body: unknown, assetUrls: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  for (const u of [b.imageUrl, ...assetUrls]) {
    if (typeof u === 'string' && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * Re-resolve and mirror the SOURCE picture for stories whose image object is missing from storage; else generate;
 * else leave on fallback artwork. Dry run (default) only checks storage. `limit` caps stories actually backfilled.
 */
export async function backfillStoryImages(deps: ImgDeps, opts: ImgOptions): Promise<{ counts: ImgCounts; stoppedEarly: string | null }> {
  const counts: ImgCounts = { scanned: 0, ok_present: 0, would_backfill: 0, source_mirrored: 0, generated: 0, fallback: 0, error: 0 };
  let afterId: string | null = null;
  let worked = 0;
  let stoppedEarly: string | null = null;
  let changed = 0;
  outer: for (;;) {
    const rows = await deps.listBatch({ since: opts.since, before: opts.before, slug: opts.slug, afterId, take: opts.batchSize });
    if (!rows.length) break;
    afterId = rows[rows.length - 1].id;
    for (const s of rows) {
      counts.scanned++;
      // cheap existence check first (dry run) so only stories that need work count against --limit
      const probe = await deps.backfill(s, { dryRun: true });
      if (probe.outcome === 'ok_present') { counts.ok_present++; continue; }
      if (probe.outcome === 'error') { counts.error++; deps.log(`ERROR ${s.slug}: ${probe.reason}`); continue; }
      if (worked >= opts.limit) { stoppedEarly = `--limit ${opts.limit} reached`; break outer; }
      worked++;
      if (!opts.apply) { counts.would_backfill++; deps.log(`WOULD BACKFILL ${s.slug} (legacy urls: ${s.legacyImageUrls.length}, page: ${s.pageUrl ? 'yes' : 'no'})`); continue; }
      const r = await deps.backfill(s, { dryRun: false });
      counts[r.outcome === 'would_backfill' ? 'error' : r.outcome]++;
      if (r.outcome === 'source_mirrored' || r.outcome === 'generated') changed++;
      deps.log(`${r.outcome.toUpperCase()} ${s.slug}${r.reason ? ` — ${r.reason}` : ''}`);
      if (r.outcome === 'error' && /^storage|S3 not configured/i.test(r.reason ?? '')) { stoppedEarly = `storage problem (${r.reason}) — stopping; fix storage and re-run (idempotent)`; break outer; }
      if (opts.delayMs > 0) await sleep(opts.delayMs);
    }
  }
  if (opts.apply && changed > 0) await deps.purgeCache();
  return { counts, stoppedEarly };
}
