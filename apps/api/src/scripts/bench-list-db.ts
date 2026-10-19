/**
 * Time the public list endpoint's service against a real database (no cache):
 *   DATABASE_URL=… npx ts-node --transpile-only src/scripts/bench-list-db.ts
 */
import { PrismaClient } from '@prisma/client';
import { ArticlesService } from '../modules/articles/articles.service';
import { registerSourceNames } from '../common/source-scrub.util';
import { namesFromSources } from '../common/source-names.service';
import { benchSources } from './bench-public-list';

async function main() {
  const prisma = new PrismaClient();
  registerSourceNames(namesFromSources(benchSources()));
  let queryMs = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timed = prisma.$extends({ query: { $allModels: { async $allOperations({ args, query }: any) { const t = Date.now(); const r = await query(args); queryMs += Date.now() - t; return r; } } } });
  const config = { get: (k: string) => (k === 'PUBLIC_LIST_CACHE_TTL_MS' ? '0' : undefined) };
  const redis = { getJson: async () => null, setJson: async () => undefined, delByPrefix: async () => undefined };
  const svc = new ArticlesService(timed as never, config as never, redis as never);
  const cases: Array<[string, Record<string, unknown>]> = [
    ['hi limit=150 omitBody', { language: 'hi', limit: '150', omitBody: true }],
    ['en limit=150 omitBody', { language: 'en', limit: '150', omitBody: true }],
    ['limit=3 categoryId omitBody', { categoryId: 'c5', limit: '3', omitBody: true, language: 'en' }],
    ['no-lang limit=200→150 omitBody', { limit: '200', omitBody: true }],
  ];
  for (const [label, f] of cases) {
    await svc.findAll(f as never, 'public'); // warm
    queryMs = 0;
    const t = Date.now();
    const r = await svc.findAll(f as never, 'public');
    console.log(`${label.padEnd(32)} total=${Date.now() - t}ms db=${queryMs}ms rows=${r.data.length} total_count=${r.total}`);
  }
  await prisma.$disconnect();
}
void main();
