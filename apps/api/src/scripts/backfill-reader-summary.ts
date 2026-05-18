/**
 * Rebuild excerpt + bodyShort from stored body for articles with thin/boilerplate summaries.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/backfill-reader-summary.ts --apply
 */

import { PrismaClient } from '@prisma/client';
import {
  buildReaderSummaryFromPlainText,
  splitStoryBodies,
  stripPublisherFeedBoilerplate,
} from '../common/reader-summary.util';
import { stripSyndicationLinkbacks } from '../common/editorial-sanitize';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function bodyToPlain(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const doc = body as { content?: { type?: string; content?: { text?: string }[] }[] };
  const parts = (doc.content ?? [])
    .filter((n) => n?.type === 'paragraph')
    .map((n) => (n.content ?? []).map((c) => c.text ?? '').join(''))
    .filter(Boolean);
  return parts.join('\n\n');
}

function needsBackfill(excerpt: string | null, title: string): boolean {
  const e = (excerpt ?? '').trim();
  if (!e || e.length < 280) return true;
  if (/share:\s*(fb|x)/i.test(e)) return true;
  if (/प्रकाशित\s+\d+\s*मिनट/u.test(e)) return true;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+\d/i.test(e.toLowerCase())) return true;
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
  const articles = await prisma.article.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, title: true, excerpt: true, body: true, bodyShort: true, bodyMedium: true },
    take: 5000,
  });

  let updated = 0;
  for (const a of articles) {
    if (!needsBackfill(a.excerpt, a.title)) continue;
    const fromBody = stripSyndicationLinkbacks(
      stripPublisherFeedBoilerplate(bodyToPlain(a.body), a.title),
    );
    const fromMedium = (a.bodyMedium ?? '').trim();
    const plain = [fromMedium, fromBody, (a.excerpt ?? '').trim()].filter((s) => s.length > 80).join('\n\n');
    if (plain.length < 120) continue;

    const summary = buildReaderSummaryFromPlainText(plain, a.title);
    const { bodyShort } = splitStoryBodies(plain, a.title);
    if (!summary && !bodyShort) continue;

    console.log(`[${APPLY ? 'apply' : 'dry'}] ${a.title.slice(0, 56)} → ${summary.length}c`);
    const body = a.body as { aiVideo?: { summary?: string } } | null;
    const nextBody =
      summary && body && typeof body === 'object'
        ? { ...body, aiVideo: { ...(body.aiVideo ?? {}), summary } }
        : body;

    if (APPLY) {
      await prisma.article.update({
        where: { id: a.id },
        data: {
          excerpt: summary || bodyShort.slice(0, 1200),
          bodyShort: bodyShort || undefined,
          bodyMedium: splitStoryBodies(plain, a.title).bodyMedium || undefined,
          ...(nextBody ? { body: nextBody } : {}),
        },
      });
    }
    updated++;
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${updated} articles.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
