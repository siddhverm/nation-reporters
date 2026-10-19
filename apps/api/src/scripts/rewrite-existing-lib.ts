import { containsSourceMention, filterSourceHashtags, scrubSourceMentions, sourceNameVariants } from '../common/source-scrub.util';
import { assessStoryBody, looksTruncated, stripPageBoilerplate } from '../common/page-boilerplate.util';
import { sanitizeHashtags } from '../common/reader-summary.util';
import { sleep } from './cli-util';

type Json = Record<string, unknown>;

export type StoryRow = {
  id: string; slug: string; title: string; language: string; status: string; createdAt: Date;
  excerpt: string | null; bodyShort: string | null; bodyMedium: string | null; podcastScript: string | null;
  hashtags: string[]; body: unknown; ingestedArticleId: string | null;
};
export type SourceMaterial = { title: string; body: string; sourceName: string | null; sourceUrl: string | null } | null;

export type StoryAnalysis = { needsRewrite: boolean; issues: string[]; plainBody: string };

const REWRITE_MARK = 'rewriteV2';

/** Plain text of a stored TipTap-style body (paragraphs joined by blank lines). */
export function plainTextOfBody(body: unknown): string {
  const walk = (n: unknown): string => {
    if (!n || typeof n !== 'object') return '';
    const o = n as Json;
    if (typeof o.text === 'string') return o.text;
    const inner = Array.isArray(o.content) ? (o.content as unknown[]).map(walk) : [];
    return o.type === 'doc' ? inner.join('\n\n') : inner.join('');
  };
  return walk(body).trim();
}

/** Detect what is wrong with a stored story (pure). Already-processed stories are never re-selected (idempotent). */
export function analyzeStory(row: StoryRow, extraNames: readonly string[] = []): StoryAnalysis {
  const body = (row.body && typeof row.body === 'object' ? row.body : {}) as Json;
  const plainBody = plainTextOfBody(body);
  if (body[REWRITE_MARK]) return { needsRewrite: false, issues: ['already_processed'], plainBody };
  const issues: string[] = [];
  const texts = [row.title, row.excerpt, row.bodyShort, row.bodyMedium, row.podcastScript, plainBody, ...(Array.isArray(body.keyPoints) ? (body.keyPoints as string[]) : [])].filter((t): t is string => typeof t === 'string' && !!t.trim());
  if (texts.some((t) => containsSourceMention(t, extraNames))) issues.push('names_source');
  if (stripPageBoilerplate(plainBody) !== plainBody.trim() || /Trending Stories|Join conversation|End of Article|Follow Us On Social Media/i.test(plainBody)) issues.push('boilerplate');
  if (!Array.isArray(body.keyPoints) || (body.keyPoints as unknown[]).length === 0) issues.push('not_rewritten_format');
  if (looksTruncated(stripPageBoilerplate(plainBody))) issues.push('truncated');
  return { needsRewrite: issues.length > 0, issues, plainBody };
}

export type RewriteOutcome = 'rewritten' | 'rewritten_needs_review' | 'drafted' | 'skipped' | 'retry_later' | 'would_rewrite';
export type Counts = Record<RewriteOutcome | 'scanned' | 'errors', number>;

export type Deps = {
  listBatch: (opts: { since?: Date; before?: Date; slug?: string; afterId: string | null; take: number }) => Promise<StoryRow[]>;
  loadSource: (row: StoryRow) => Promise<SourceMaterial>;
  rewrite: (input: { title: string; body: string; language: string; publisher: { sourceName: string | null; sourceUrl: string | null } }) => Promise<
    | { ok: true; needsReview: boolean; fields: { title: string; short: string; medium: string; long: string; summary: string; keyPoints: string[]; podcastScript: string; seoTitle: string; seoDescription: string } }
    | { ok: false; retryable: boolean; reason: string }
  >;
  updateStory: (id: string, data: Json) => Promise<void>;
  scrubCaptions: (articleId: string, fn: (t: string) => string) => Promise<void>;
  purgeCache: () => Promise<void>;
  log: (line: string) => void;
};

export type Options = { apply: boolean; limit: number; since?: Date; before?: Date; slug?: string; delayMs: number; batchSize: number; now?: () => Date };

const clip = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '').trim()}…`);

/**
 * Re-run rewrite + scrub on existing PUBLISHED stories. Dry run (default) only analyses and prints the plan: no model
 * calls, no writes. With apply: rewritten stories keep their slug/URL/image; stories that cannot be rewritten safely
 * are set to DRAFT (never deleted); model/quota failures change nothing and are retried by the next run. Idempotent.
 */
export async function rewriteExistingStories(deps: Deps, opts: Options, namesFor: (src: SourceMaterial) => string[] = (s) => sourceNameVariants(s?.sourceName, s?.sourceUrl)): Promise<{ counts: Counts; stoppedEarly: string | null }> {
  const counts: Counts = { scanned: 0, rewritten: 0, rewritten_needs_review: 0, drafted: 0, skipped: 0, retry_later: 0, would_rewrite: 0, errors: 0 };
  let afterId: string | null = null;
  let worked = 0;
  let stoppedEarly: string | null = null;
  const now = opts.now ?? (() => new Date());

  outer: for (;;) {
    const rows = await deps.listBatch({ since: opts.since, before: opts.before, slug: opts.slug, afterId, take: opts.batchSize });
    if (!rows.length) break;
    afterId = rows[rows.length - 1].id;
    for (const row of rows) {
      counts.scanned++;
      const source = await deps.loadSource(row);
      const names = namesFor(source);
      const a = analyzeStory(row, names);
      if (!a.needsRewrite) { counts.skipped++; continue; }
      if (worked >= opts.limit) { stoppedEarly = `--limit ${opts.limit} reached`; break outer; }
      worked++;
      if (!opts.apply) {
        counts.would_rewrite++;
        deps.log(`WOULD REWRITE ${row.slug} [${row.language}] issues=${a.issues.join(',')}`);
        continue;
      }
      // Source text: the stored original page text when we have it, else the story's own current text.
      const candidates = [source?.body, a.plainBody].filter((t): t is string => !!t && !!t.trim());
      let result: Awaited<ReturnType<Deps['rewrite']>> | null = null;
      for (const text of candidates) {
        result = await deps.rewrite({ title: source?.title || row.title, body: text, language: row.language, publisher: { sourceName: source?.sourceName ?? null, sourceUrl: source?.sourceUrl ?? null } });
        if (result.ok || result.retryable) break;
        // not retryable (unsafe/unusable) → try the next candidate text once, then hold
      }
      const body = (row.body && typeof row.body === 'object' ? row.body : {}) as Json;
      if (result && result.ok) {
        const f = result.fields;
        const paragraphs = f.long.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
        const av = (body.aiVideo && typeof body.aiVideo === 'object' ? body.aiVideo : {}) as Json;
        await deps.updateStory(row.id, {
          title: f.title,
          bodyShort: f.short,
          bodyMedium: f.medium,
          excerpt: clip(f.summary, 1200),
          seoTitle: f.seoTitle,
          seoDescription: f.seoDescription,
          podcastScript: f.podcastScript,
          hashtags: filterSourceHashtags(sanitizeHashtags(row.hashtags, { sourceName: source?.sourceName, sourceUrl: source?.sourceUrl }), names),
          ...(result.needsReview ? { status: 'PENDING_REVIEW' } : {}),
          body: {
            ...body,
            type: 'doc',
            content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
            keyPoints: f.keyPoints,
            aiVideo: { ...av, title: f.title, narration: f.podcastScript, summary: f.summary },
            [REWRITE_MARK]: { at: now().toISOString(), outcome: result.needsReview ? 'rewritten_needs_review' : 'rewritten' },
          },
        });
        await deps.scrubCaptions(row.id, (t) => scrubSourceMentions(t, names));
        counts[result.needsReview ? 'rewritten_needs_review' : 'rewritten']++;
        deps.log(`${result.needsReview ? 'REWRITTEN (needs review → PENDING_REVIEW)' : 'REWRITTEN'} ${row.slug}`);
      } else if (result && result.retryable) {
        counts.retry_later++;
        deps.log(`RETRY LATER ${row.slug}: ${result.reason}`);
        if (/429|quota|too many requests/i.test(result.reason)) { stoppedEarly = 'Gemini quota/rate limit hit — stopping; re-run later (idempotent)'; break outer; }
      } else {
        const reason = result && !result.ok ? result.reason : 'no usable source text';
        await deps.updateStory(row.id, { status: 'DRAFT', body: { ...body, heldForRewrite: true, [REWRITE_MARK]: { at: now().toISOString(), outcome: 'drafted', reason } } });
        counts.drafted++;
        deps.log(`DRAFTED ${row.slug}: ${reason}`);
      }
      if (opts.delayMs > 0) await sleep(opts.delayMs);
    }
  }
  if (opts.apply && counts.rewritten + counts.rewritten_needs_review + counts.drafted > 0) await deps.purgeCache();
  return { counts, stoppedEarly };
}
