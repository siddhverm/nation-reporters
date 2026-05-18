/**
 * Fetch + publish RSS for Bengali / Tamil / Gujarati / Punjabi / Urdu sources only.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/ingest-regional-feeds.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionCronService } from '../modules/ingestion/cron/ingestion-cron.service';
import { PrismaService } from '../prisma/prisma.service';

const TARGET_LANGS = ['bn', 'ta', 'gu', 'pa', 'ur'] as const;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const cron = app.get(IngestionCronService);

  await prisma.ingestedSource.updateMany({
    where: { language: { in: [...TARGET_LANGS] } },
    data: { isActive: true },
  });

  const sources = await prisma.ingestedSource.findMany({
    where: { isActive: true, language: { in: [...TARGET_LANGS] } },
    orderBy: { name: 'asc' },
  });

  console.log(`Regional ingestion: ${sources.length} active source(s) for ${TARGET_LANGS.join(', ')}`);

  let totalIngested = 0;
  for (const source of sources) {
    try {
      const { ingested } = await cron.fetchSource(source, { maxItemsPerSource: 12 });
      totalIngested += ingested;
      console.log(`  ${source.name} (${source.language}): +${ingested}`);
    } catch (err) {
      console.error(`  ${source.name}: FAILED — ${(err as Error).message}`);
    }
  }

  const counts = await prisma.article.groupBy({
    by: ['language'],
    where: { status: 'PUBLISHED', language: { in: [...TARGET_LANGS] } },
    _count: { _all: true },
  });
  console.log('\nPublished inventory after run:');
  for (const lang of TARGET_LANGS) {
    const row = counts.find((c) => c.language === lang);
    console.log(`  ${lang}: ${row?._count._all ?? 0}`);
  }
  console.log(`\nTotal new items this run: ${totalIngested}`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
