/**
 * BACKFILL story pictures whose object is missing from storage (storage was down / replaced, so the story shows
 * generic fallback artwork). For each such story: re-resolve the SOURCE picture (image URL stored by old code, else the
 * article page's og:image / twitter:image through the SSRF-safe fetcher), mirror it into OUR storage (never hotlinked,
 * origin='source', the asterisk copyright note shows), else generate an AI picture, else leave the fallback artwork.
 *
 *   npm run backfill:story-images -- [--apply] [--limit N] [--since YYYY-MM-DD] [--before YYYY-MM-DD] [--slug SLUG]
 *                                    [--delay-ms 1500] [--batch-size 50]
 *   Production container:  npm run backfill:story-images:prod -- …
 *
 * DRY RUN by default (only HEAD-checks storage). Idempotent: stories whose object exists are left alone.
 * Honours IMAGE_MODE (generated_only never fetches source images). Needs DATABASE_URL, S3_*; GEMINI_API_KEY for
 * generated pictures; REDIS_URL to purge the feed cache. Prints counts per outcome.
 */
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { StoryImageService } from '../modules/ai/story-image.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { dateArg, intArg, parseCliArgs } from './cli-util';
import { backfillStoryImages, legacyImageUrlsOf, type ImgStory } from './backfill-story-images-lib';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv');
for (const p of ['../../.env', '.env']) dotenv.config({ path: path.resolve(process.cwd(), p) });

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const opts = {
    apply: args.apply,
    limit: intArg(args.values.limit, 200, 1),
    since: dateArg(args.values.since, 'since'),
    before: dateArg(args.values.before, 'before'),
    slug: args.values.slug,
    delayMs: intArg(args.values['delay-ms'], 1500),
    batchSize: intArg(args.values['batch-size'], 50, 1),
  };
  const config = new ConfigService();
  const prisma = new PrismaService() as unknown as PrismaClient & PrismaService;
  const redis = new RedisCacheService(config);
  const images = new StoryImageService(config, prisma, redis);
  console.log(JSON.stringify({ mode: opts.apply ? 'APPLY' : 'DRY-RUN', imageMode: images.imageMode, ...opts }));
  try {
    const cats = new Map((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.id, c.slug]));
    const { counts, stoppedEarly } = await backfillStoryImages(
      {
        listBatch: async ({ since, before, slug, afterId, take }) => {
          const where: Record<string, unknown> = { status: 'PUBLISHED' };
          if (slug) where.slug = slug;
          const createdAt: Record<string, Date> = {};
          if (since) createdAt.gte = since;
          if (before) createdAt.lt = before;
          if (Object.keys(createdAt).length) where.createdAt = createdAt;
          const rows = await prisma.article.findMany({
            where: where as never, orderBy: { id: 'asc' }, take, ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
            select: { id: true, slug: true, title: true, language: true, excerpt: true, categoryId: true, body: true, ingestedArticleId: true, mediaAssets: { where: { type: 'IMAGE' }, select: { url: true } } },
          });
          const out: ImgStory[] = [];
          for (const r of rows) {
            let pageUrl: string | null = null;
            if (r.ingestedArticleId) {
              pageUrl = (await prisma.ingestedArticle.findUnique({ where: { id: r.ingestedArticleId }, select: { sourceUrl: true } }))?.sourceUrl ?? null;
            }
            if (!pageUrl) pageUrl = (await prisma.contentProvenance.findFirst({ where: { articleId: r.id }, select: { sourceUrl: true } }))?.sourceUrl ?? null;
            out.push({
              id: r.id, slug: r.slug, title: r.title, language: r.language, excerpt: r.excerpt,
              categorySlug: r.categoryId ? cats.get(r.categoryId) ?? null : null,
              body: r.body, pageUrl, legacyImageUrls: legacyImageUrlsOf(r.body, r.mediaAssets.map((m) => m.url)),
            });
          }
          return out;
        },
        backfill: (s, o) => images.backfillStoryImage(
          { id: s.id, slug: s.slug, title: s.title, summary: s.excerpt, category: s.categorySlug ?? undefined, language: s.language, pageUrl: s.pageUrl, legacyImageUrls: s.legacyImageUrls },
          { dryRun: o.dryRun },
        ),
        purgeCache: async () => { await redis.delByPrefix('country-feed:'); console.log('purged redis country-feed:*'); },
        log: (l) => console.log(l),
      },
      opts,
    );
    console.log(JSON.stringify({ summary: counts, stoppedEarly, mode: opts.apply ? 'APPLY' : 'DRY-RUN' }, null, 2));
    if (stoppedEarly && /model not available|storage problem/.test(stoppedEarly)) { console.error(`STOPPED: ${stoppedEarly}`); process.exitCode = 2; }
    if (!opts.apply) console.log('Dry run only (no changes). Re-run with --apply to mirror/generate the missing pictures.');
  } finally {
    await prisma.$disconnect();
    await redis.onModuleDestroy?.();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
