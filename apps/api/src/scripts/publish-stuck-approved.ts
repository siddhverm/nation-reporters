/**
 * Promote APPROVED (never published) articles to PUBLISHED — common after async publish failed.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/publish-stuck-approved.ts
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/publish-stuck-approved.ts --apply
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/publish-stuck-approved.ts --apply --lang=bn
 */

import { PrismaClient, ArticleStatus } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const langArg = process.argv.find((a) => a.startsWith('--lang='))?.split('=')[1];

const REGIONAL = ['bn', 'ta', 'gu', 'pa', 'ur', 'te', 'kn', 'ml', 'hi', 'mr'];

async function main() {
  const langs = langArg ? [langArg] : REGIONAL;
  const stuck = await prisma.article.findMany({
    where: {
      status: ArticleStatus.APPROVED,
      language: { in: langs },
    },
    select: { id: true, title: true, language: true, slug: true },
    take: 500,
  });

  console.log(`Found ${stuck.length} APPROVED article(s) for languages: ${langs.join(', ')}`);
  for (const a of stuck.slice(0, 20)) {
    console.log(`  [${a.language}] ${a.title.slice(0, 72)}`);
  }
  if (stuck.length > 20) console.log(`  ... and ${stuck.length - 20} more`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to set status=PUBLISHED and publishedAt=now.');
    return;
  }

  const now = new Date();
  const result = await prisma.article.updateMany({
    where: { id: { in: stuck.map((a) => a.id) } },
    data: { status: ArticleStatus.PUBLISHED, publishedAt: now },
  });
  console.log(`\nPublished ${result.count} article(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
