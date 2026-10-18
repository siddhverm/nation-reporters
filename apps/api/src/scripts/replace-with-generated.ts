/**
 * TAKEDOWN: swap an article's picture to an AI-generated one and purge the mirrored source image
 * (S3 object + MediaAsset rows). Use when an image owner asks for removal.
 *
 *   npm run image:replace-with-generated -- <slug-or-article-id> [--dry-run]
 *   (= ts-node --transpile-only -r tsconfig-paths/register src/scripts/replace-with-generated.ts <slug>)
 *   Production container (only dist/ is shipped): npm run image:replace-with-generated:prod -- <slug> [--dry-run]
 *
 * Needs DATABASE_URL and S3_* (and GEMINI_API_KEY to create the generated picture; without it the story shows the
 * deterministic fallback artwork). Cached copies: the public image is served with max-age=3600 for source pictures;
 * purge your CDN for /story-image/<slug> if you front the site with one.
 */
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { StoryImageService } from '../modules/ai/story-image.service';
import { PrismaService } from '../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv');
for (const p of ['../../.env', '.env']) dotenv.config({ path: path.resolve(process.cwd(), p) });

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('usage: replace-with-generated <slug-or-article-id> [--dry-run]');
    process.exit(2);
  }
  const prisma = new PrismaService() as unknown as PrismaClient & PrismaService;
  try {
    if (dry) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(target);
      const a = await prisma.article.findFirst({ where: isUuid ? { id: target } : { slug: target }, select: { id: true, slug: true, imageOrigin: true } });
      if (!a) { console.error(`not found: ${target}`); process.exit(1); }
      const assets = await prisma.mediaAsset.findMany({ where: { articleId: a.id, type: 'IMAGE' }, select: { s3Key: true, scanStatus: true } });
      console.log(JSON.stringify({ dryRun: true, slug: a.slug, imageOrigin: a.imageOrigin ?? 'generated', imageAssets: assets }, null, 2));
      return;
    }
    const svc = new StoryImageService(new ConfigService(), prisma);
    const out = await svc.replaceWithGenerated(target);
    if (!out.found) { console.error(`not found: ${target}`); process.exit(1); }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
