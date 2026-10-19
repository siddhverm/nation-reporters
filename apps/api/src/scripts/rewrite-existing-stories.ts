/**
 * ONE-OFF: re-run rewrite + publisher-name scrub + boilerplate removal on EXISTING stories (created before the
 * simple-language / source-hiding cutover), so raw scraped text becomes a proper short simple summary.
 *
 *   npm run rewrite:existing-stories -- [--apply] [--limit N] [--since YYYY-MM-DD] [--before YYYY-MM-DD] [--slug SLUG]
 *                                       [--delay-ms 6000] [--batch-size 20]
 *   Production container (only dist/ is shipped):  npm run rewrite:existing-stories:prod -- …
 *
 *  - DRY RUN by default: lists what would change (no Gemini calls, no writes).
 *  - --apply writes. Idempotent: rewritten/held stories are marked (body.rewriteV2) and skipped next time.
 *  - Stories that cannot be rewritten safely (page boilerplate, copy-safety gate, source still named, cut-off text) are
 *    set to DRAFT — never deleted. Gemini quota/network errors change nothing and stop/continue for a later re-run.
 *  - Slugs, URLs and pictures are untouched. Purges the Redis `country-feed:*` cache at the end of an --apply run.
 * Needs DATABASE_URL, GEMINI_API_KEY (and REDIS_URL to purge the cache).
 */
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AiService } from '../modules/ai/ai.service';
import { GeminiClient } from '../modules/ai/gemini.client';
import { StoryImageService } from '../modules/ai/story-image.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { loadRegisteredSourceNames } from '../common/source-names.service';
import { dateArg, intArg, parseCliArgs } from './cli-util';
import { rewriteExistingStories, type Deps, type StoryRow } from './rewrite-existing-lib';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv');
for (const p of ['../../.env', '.env']) dotenv.config({ path: path.resolve(process.cwd(), p) });

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const opts = {
    apply: args.apply,
    limit: intArg(args.values.limit, 50, 1),
    since: dateArg(args.values.since, 'since'),
    before: dateArg(args.values.before, 'before'),
    slug: args.values.slug,
    delayMs: intArg(args.values['delay-ms'], 6000),
    batchSize: intArg(args.values['batch-size'], 20, 1),
  };
  console.log(JSON.stringify({ mode: opts.apply ? 'APPLY' : 'DRY-RUN', ...opts }));

  const prisma = new PrismaService() as unknown as PrismaClient & PrismaService;
  const config = new ConfigService();
  const redis = new RedisCacheService(config);
  try {
    const n = await loadRegisteredSourceNames(prisma);
    console.log(`publisher names registered from sources table: ${n}`);
    let ai: AiService | null = null;
    const getAi = () => (ai ??= new AiService(new GeminiClient(config), prisma, config, new StoryImageService(config, prisma), {} as never));

    const deps: Deps = {
      listBatch: async ({ since, before, slug, afterId, take }) => {
        const where: Record<string, unknown> = { status: 'PUBLISHED' };
        if (slug) where.slug = slug;
        const createdAt: Record<string, Date> = {};
        if (since) createdAt.gte = since;
        if (before) createdAt.lt = before;
        if (Object.keys(createdAt).length) where.createdAt = createdAt;
        return (await prisma.article.findMany({
          where: where as never,
          orderBy: { id: 'asc' },
          take,
          ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
          select: { id: true, slug: true, title: true, language: true, status: true, createdAt: true, excerpt: true, bodyShort: true, bodyMedium: true, podcastScript: true, hashtags: true, body: true, ingestedArticleId: true },
        })) as unknown as StoryRow[];
      },
      loadSource: async (row) => {
        if (!row.ingestedArticleId) return null;
        const ing = await prisma.ingestedArticle.findUnique({ where: { id: row.ingestedArticleId }, select: { sourceTitle: true, body: true, sourceUrl: true, source: { select: { name: true } } } });
        if (!ing) return null;
        const plain = (ing.body ?? '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ');
        return { title: ing.sourceTitle, body: plain, sourceName: ing.source?.name ?? null, sourceUrl: ing.sourceUrl };
      },
      rewrite: (input) => getAi().rewriteStoredStory(input),
      updateStory: async (id, data) => { await prisma.article.update({ where: { id }, data: data as never }); },
      scrubCaptions: async (articleId, fn) => {
        const caps = await prisma.socialCaption.findMany({ where: { articleId }, select: { id: true, caption: true } });
        for (const c of caps) {
          const next = fn(c.caption);
          if (next !== c.caption) await prisma.socialCaption.update({ where: { id: c.id }, data: { caption: next } });
        }
      },
      purgeCache: async () => { await redis.delByPrefix('country-feed:'); console.log('purged redis country-feed:*'); },
      log: (l) => console.log(l),
    };

    const { counts, stoppedEarly } = await rewriteExistingStories(deps, opts);
    console.log(JSON.stringify({ summary: counts, stoppedEarly, mode: opts.apply ? 'APPLY' : 'DRY-RUN' }, null, 2));
    if (!opts.apply) console.log('Dry run only. Re-run with --apply to write.');
  } finally {
    await prisma.$disconnect();
    await redis.onModuleDestroy?.();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
