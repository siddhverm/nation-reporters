/**
 * Backfill `articles.language` from ingestion metadata (AiRewrite → IngestedSource → provenance).
 *
 * Usage:
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/backfill-article-language.ts
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/backfill-article-language.ts --apply
 */

import { PrismaClient } from '@prisma/client';
import { normalizeLanguageCode } from '../modules/ai/language-resolution.util';
import { detectFeedSourceLanguage } from '../modules/ingestion/source-language.util';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

type Via =
  | 'ai_rewrite'
  | 'ingested_source'
  | 'ai_rewrite_reverse'
  | 'ingested_source_reverse'
  | 'provenance_ingested_ai'
  | 'provenance_ingested_source'
  | 'provenance_source_name';

type Resolved = { lang: string; via: Via };

function resolveFromIngestedRow(row: {
  source: { language: string } | null;
  aiRewrite: { language: string } | null;
} | null): Omit<Resolved, 'via'> & { via: Via } | null {
  if (!row) return null;
  if (row.aiRewrite?.language) {
    return { lang: normalizeLanguageCode(row.aiRewrite.language), via: 'ai_rewrite' };
  }
  if (row.source?.language) {
    return { lang: normalizeLanguageCode(row.source.language), via: 'ingested_source' };
  }
  return null;
}

async function resolveExpectedLanguage(articleId: string): Promise<Resolved | null> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { ingestedArticleId: true },
  });
  if (!article) return null;

  if (article.ingestedArticleId) {
    const row = await prisma.ingestedArticle.findUnique({
      where: { id: article.ingestedArticleId },
      select: {
        source: { select: { language: true } },
        aiRewrite: { select: { language: true } },
      },
    });
    const a = resolveFromIngestedRow(row);
    if (a) return { lang: a.lang, via: a.via === 'ai_rewrite' ? 'ai_rewrite' : 'ingested_source' };
  }

  const rev = await prisma.ingestedArticle.findFirst({
    where: { articleId },
    select: {
      source: { select: { language: true } },
      aiRewrite: { select: { language: true } },
    },
  });
  const b = resolveFromIngestedRow(rev);
  if (b) {
    return {
      lang: b.lang,
      via: b.via === 'ai_rewrite' ? 'ai_rewrite_reverse' : 'ingested_source_reverse',
    };
  }

  const prov = await prisma.contentProvenance.findUnique({
    where: { articleId },
    select: { sourceName: true, ingestedArticleId: true },
  });
  if (prov?.ingestedArticleId) {
    const row = await prisma.ingestedArticle.findUnique({
      where: { id: prov.ingestedArticleId },
      select: {
        source: { select: { language: true } },
        aiRewrite: { select: { language: true } },
      },
    });
    if (row?.aiRewrite?.language) {
      return { lang: normalizeLanguageCode(row.aiRewrite.language), via: 'provenance_ingested_ai' };
    }
    if (row?.source?.language) {
      return { lang: normalizeLanguageCode(row.source.language), via: 'provenance_ingested_source' };
    }
  }

  if (prov?.sourceName) {
    const inferred = detectFeedSourceLanguage(prov.sourceName);
    return { lang: normalizeLanguageCode(inferred), via: 'provenance_source_name' };
  }

  return null;
}

function shouldApplyUpdate(
  currentNorm: string,
  expected: string,
  via: Via,
): boolean {
  if (expected === currentNorm) return false;
  // Weak signal: do not force everything to English from outlet-name guesswork.
  if (via === 'provenance_source_name' && expected === 'en') return false;
  return true;
}

async function main() {
  const select = { id: true, slug: true, language: true } as const;

  const [withIngestedId, withProvenance, reverseLinks] = await Promise.all([
    prisma.article.findMany({
      where: { status: { in: ['PUBLISHED', 'APPROVED'] }, ingestedArticleId: { not: null } },
      select,
    }),
    prisma.article.findMany({
      where: { status: { in: ['PUBLISHED', 'APPROVED'] }, provenance: { isNot: null } },
      select,
    }),
    prisma.ingestedArticle.findMany({
      where: { articleId: { not: null } },
      select: { articleId: true },
    }),
  ]);

  const reverseIdList = [...new Set(reverseLinks.map((r) => r.articleId).filter((id): id is string => id != null))];
  const withReverseOnly =
    reverseIdList.length > 0
      ? await prisma.article.findMany({
          where: { status: { in: ['PUBLISHED', 'APPROVED'] }, id: { in: reverseIdList } },
          select,
        })
      : [];

  const byId = new Map<string, { id: string; slug: string; language: string }>();
  for (const a of [...withIngestedId, ...withProvenance, ...withReverseOnly]) {
    byId.set(a.id, a);
  }
  const toScan = [...byId.values()];

  let examined = 0;
  let wouldUpdate = 0;
  let updated = 0;
  const samples: string[] = [];

  for (const a of toScan) {
    examined++;
    const resolved = await resolveExpectedLanguage(a.id);
    if (!resolved) continue;

    const currentNorm = normalizeLanguageCode(a.language);
    if (!shouldApplyUpdate(currentNorm, resolved.lang, resolved.via)) continue;

    wouldUpdate++;
    if (samples.length < 25) {
      samples.push(
        `${a.slug.slice(0, 48)} | ${currentNorm} → ${resolved.lang} (${resolved.via})`,
      );
    }

    if (APPLY) {
      await prisma.article.update({
        where: { id: a.id },
        data: { language: resolved.lang },
      });
      updated++;
    }
  }

  console.log(
    APPLY
      ? `Backfill applied: updated ${updated} article(s).`
      : `Dry run: ${wouldUpdate} article(s) would be updated (out of ${examined} examined with ingestion links).`,
  );
  if (samples.length > 0) {
    console.log('Sample changes:');
    for (const line of samples) console.log(`  ${line}`);
  }
  if (!APPLY && wouldUpdate > 0) {
    console.log('\nRe-run with --apply to write these updates to the database.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
