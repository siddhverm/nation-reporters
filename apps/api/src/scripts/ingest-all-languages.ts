/**
 * Fetch + publish RSS for every active source (all languages).
 *
 *   npm run ingest:all
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { IngestionCronService } from '../modules/ingestion/cron/ingestion-cron.service';
import { PrismaService } from '../prisma/prisma.service';

const TRACK = [
  'en', 'hi', 'mr', 'bn', 'ta', 'te', 'gu', 'kn', 'pa', 'ur', 'ml',
  'ar', 'fr', 'de', 'es', 'pt', 'ru', 'zh', 'ja', 'ko', 'id', 'tr', 'it',
] as const;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const prisma = app.get(PrismaService);
  const cron = app.get(IngestionCronService);

  await prisma.ingestedSource.updateMany({ data: { isActive: true } });

  console.log('Running full ingestion (all active sources)...');
  await cron.runScheduledIngestion();

  const counts = await prisma.article.groupBy({
    by: ['language'],
    where: { status: 'PUBLISHED', language: { in: [...TRACK] } },
    _count: { _all: true },
  });

  console.log('\nPublished inventory by language:');
  for (const code of TRACK) {
    const row = counts.find((c) => c.language === code);
    console.log(`  ${code}: ${row?._count._all ?? 0}`);
  }

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
