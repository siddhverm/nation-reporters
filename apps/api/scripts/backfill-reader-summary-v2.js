/**
 * Emergency backfill — text columns only, no body JSON. Copy into api container:
 *   docker cp apps/api/scripts/backfill-reader-summary-v2.js <api-container>:/app/dist/scripts/
 *   docker compose -f docker-compose.server.yml exec api node dist/scripts/backfill-reader-summary-v2.js --apply
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  buildReaderSummaryFromPlainText,
  splitStoryBodies,
  stripPublisherFeedBoilerplate,
} = require('../common/reader-summary.util');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BATCH = 200;
const VERSION = 'v2-text-only';

function needsBackfill(excerpt, title) {
  const e = (excerpt ?? '').trim();
  if (!e || e.length < 280) return true;
  if (/share:\s*(fb|x)/i.test(e)) return true;
  if (/प्रकाशित\s+\d+\s*मिनट/u.test(e)) return true;
  if (/Entertainment\s+Desk|DeskNew\s*Delhi|,UPDATED|\bUPDATED\b/i.test(e)) return true;
  if (/\breporter\s+at\s+[A-Z]/i.test(e)) return true;
  if (/^Sign\s+up\s+for\s+(?:our\s+)?/i.test(e)) return true;
  if (/डेस्क\s*,/.test(e)) return true;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d/i.test(e.toLowerCase()))
    return true;
  if (
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d{1,2}\s+\w+[,]?\s+\d{4}\s+at\s+/i.test(
      e,
    )
  ) {
    return true;
  }
  if (e.length < title.length + 80) return true;
  const nt = title.toLowerCase().replace(/\s+/g, ' ').trim();
  const ne = e.toLowerCase().replace(/\s+/g, ' ').trim();
  if (nt && ne.startsWith(nt) && e.length < title.length + 100) return true;
  return false;
}

async function main() {
  console.log(`backfill-reader-summary ${VERSION} (${APPLY ? 'apply' : 'dry-run'})`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let cursor;

  for (;;) {
    const articles = await prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        excerpt: true,
        bodyShort: true,
        bodyMedium: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (articles.length === 0) break;
    cursor = articles[articles.length - 1].id;

    for (const a of articles) {
      try {
        if (!needsBackfill(a.excerpt, a.title)) continue;

        const fromMedium = stripPublisherFeedBoilerplate((a.bodyMedium ?? '').trim(), a.title);
        const fromShort = stripPublisherFeedBoilerplate((a.bodyShort ?? '').trim(), a.title);
        const fromExcerpt = stripPublisherFeedBoilerplate((a.excerpt ?? '').trim(), a.title);
        const plain = [fromMedium, fromShort, fromExcerpt].filter((s) => s.length > 40).join('\n\n');
        if (plain.length < 80) {
          skipped++;
          continue;
        }

        const summary = buildReaderSummaryFromPlainText(plain, a.title, { minChars: 80 });
        const { bodyShort, bodyMedium } = splitStoryBodies(plain, a.title);
        if (!summary && !bodyShort) {
          skipped++;
          continue;
        }

        console.log(`[${APPLY ? 'apply' : 'dry'}] ${a.title.slice(0, 56)} → ${summary.length}c`);

        if (APPLY) {
          await prisma.article.update({
            where: { id: a.id },
            data: {
              excerpt: summary || bodyShort.slice(0, 1200),
              bodyShort: bodyShort || undefined,
              bodyMedium: bodyMedium || undefined,
            },
          });
        }
        updated++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[failed] ${a.id} "${a.title.slice(0, 40)}": ${msg}`);
      }
    }
  }

  console.log(
    `\n${APPLY ? 'Updated' : 'Would update'} ${updated} articles (${skipped} skipped, ${failed} failed).`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
