/**
 * Local end-to-end harness (NO external calls): the REAL ArticlesController/ArticlesService/StoryImageController
 * with the real public sanitizers, backed by an in-memory Prisma fake loaded from test-fixtures/news-fixtures.json.
 * Every row is deliberately "dirty": outlet in title/excerpt/body/SEO/hashtags, publisher image + video + credit,
 * provenance, risk data, plus an unpublished DRAFT that must never be reachable anonymously.
 *
 *   npx ts-node --transpile-only e2e/fake-api.ts   # PORT=4010
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArticlesController } from '../src/modules/articles/articles.controller';
import { ArticlesService } from '../src/modules/articles/articles.service';
import { StoryImageController } from '../src/modules/ai/story-image.controller';
import { StoryImageService } from '../src/modules/ai/story-image.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisCacheService } from '../src/common/cache/redis-cache.service';
import { PublishingService } from '../src/modules/publishing/publishing.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../src/common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { slugifyTitle } from '../src/common/slug.util';

const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../test-fixtures/news-fixtures.json'), 'utf8'));
const { outlet, domain, reporter, photographer } = fx;
// Image cases (23 languages): a MIRRORED SOURCE image, an AI-GENERATED image, or neither (web renders fallback artwork).
const SOURCE = new Set(['en', 'ar', 'ja', 'kn', 'fr', 'it', 'tr', 'mr']);
const GENERATED = new Set(['hi', 'zh', 'ta', 'ru', 'te', 'de']);
const originOf = (lang: string): 'source' | 'generated' | null => (SOURCE.has(lang) ? 'source' : GENERATED.has(lang) ? 'generated' : null);

function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = Math.min(255, rgb[0] + (x * 60) / w);
      raw[o + 1] = Math.min(255, rgb[1] + (y * 60) / h);
      raw[o + 2] = rgb[2];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const txt = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const rows: any[] = [];
let i = 0;
for (const [lang, f] of Object.entries<any>(fx.languages)) {
  i++;
  const c = f.chrome;
  const slug = `${slugifyTitle(f.title)}`;
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  rows.push({
    id, slug, language: lang, status: 'PUBLISHED', categoryId: 'c-india', authorId: 'author-1',
    title: `${f.title} - ${outlet}`,
    excerpt: `${f.paragraphs[0]} ${c.sourceLine}`,
    seoTitle: `${f.title} | ${outlet}`, seoDescription: `${f.paragraphs[0]} ${c.viaLine}`, seoSlug: `${slug}-${domain}`,
    hashtags: [`#${outlet.replace(/\s+/g, '')}`, '#news'],
    ingestedArticleId: `ing-${i}`, podcastScript: null, imageOrigin: originOf(lang), bodyShort: f.paragraphs[0],
    publishedAt: new Date(Date.UTC(2026, 9, 18, 6, 0, 0) - i * 3600_000), createdAt: new Date(Date.UTC(2026, 9, 18, 5, 0, 0) - i * 3600_000), updatedAt: new Date(),
    body: {
      type: 'doc', keyPoints: f.paragraphs.slice(0, 2), imageUrl: `https://cdn.${domain}/photos/${i}.jpg`, imageCredit: `Photo: ${photographer} / ${outlet}`,
      content: [c.byline, c.photoCredit, ...f.paragraphs, c.sourceLine, c.viaLine, c.readMore].map(txt),
    },
    provenance: { sourceName: outlet, sourceUrl: `https://${domain}/story/${i}` },
    riskAssessment: { score: 7, flags: ['x'] }, socialCaptions: [{ platform: 'TWITTER', caption: `${f.title} via ${outlet} #${outlet.replace(/\s+/g, '')}` }],
    tags: [], versions: [{ id: 'v1', title: `${outlet} raw` }],
    mediaAssets: [
      { id: `m-${i}-1`, type: 'IMAGE', url: `https://cdn.${domain}/photos/${i}.jpg`, s3Key: `external/${id}/source-image`, scanStatus: 'external' },
      { id: `m-${i}-2`, type: 'VIDEO', url: `https://www.youtube.com/watch?v=src${i}`, s3Key: `external/${id}/source-video`, scanStatus: 'external' },
      ...(GENERATED.has(lang) ? [{ id: `m-${i}-3`, type: 'IMAGE', url: `/story-image/${slug}`, s3Key: `generated/images/${id}.png`, scanStatus: 'generated' }] : []),
      ...(SOURCE.has(lang) ? [{ id: `m-${i}-4`, type: 'IMAGE', url: `/story-image/${slug}`, s3Key: `source-mirror/images/${id}.jpg`, scanStatus: 'source_mirrored' }] : []),
    ],
  });
}
rows.push({
  ...rows[0], id: '00000000-0000-4000-8000-ffffffffffff', slug: 'secret-draft-story', status: 'DRAFT', title: 'SECRET DRAFT never public',
});

const PNG_GENERATED = png(640, 360, [30, 90, 160]);
const PNG_SOURCE = png(640, 360, [150, 70, 40]); // visually different "photo" that was mirrored into our storage

const matches = (r: any, where: any = {}): boolean =>
  Object.entries(where).every(([k, v]: [string, any]) => {
    if (v === undefined) return true;
    if (k === 'OR') return (v as any[]).some((w) => matches(r, w));
    if (k === 'mediaAssets') return (r.mediaAssets ?? []).some((m: any) => !v.some?.type || m.type === v.some.type);
    if (v && typeof v === 'object' && 'startsWith' in v) return String(r[k] ?? '').startsWith(v.startsWith);
    if (v && typeof v === 'object' && 'contains' in v) return String(r[k] ?? '').toLowerCase().includes(String(v.contains).toLowerCase());
    return r[k] === v;
  });

function project(r: any, select?: any, include?: any) {
  if (select) {
    const out: any = {};
    for (const [k, v] of Object.entries<any>(select)) {
      if (k === 'mediaAssets') {
        let m = (r.mediaAssets ?? []).filter((x: any) => !v.where?.type || x.type === v.where.type);
        if (v.take) m = m.slice(0, v.take);
        out.mediaAssets = m;
      } else if (k === 'provenance') out.provenance = r.provenance;
      else if (v) out[k] = r[k];
    }
    return out;
  }
  const out = { ...r };
  if (include?.mediaAssets?.take) out.mediaAssets = r.mediaAssets.slice(0, include.mediaAssets.take);
  return out;
}

const prisma: any = {
  article: {
    findMany: async ({ where, skip = 0, take = 50, orderBy, select, include }: any = {}) => {
      const key = Array.isArray(orderBy) ? 'publishedAt' : Object.keys(orderBy ?? { createdAt: 1 })[0];
      return rows.filter((r) => matches(r, where)).sort((a, b) => +b[key] - +a[key]).slice(skip, skip + take).map((r) => project(r, select, include));
    },
    count: async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length,
    findUnique: async ({ where, include }: any) => { const r = rows.find((x) => matches(x, where)); return r ? project(r, undefined, include) : null; },
    findFirst: async ({ where, include }: any) => { const r = rows.find((x) => matches(x, where)); return r ? project(r, undefined, include) : null; },
  },
  mediaAsset: { findFirst: async () => null },
};

class FakeImages {
  async readStoryImage(idOrSlug: string) {
    const r = rows.find((x) => (x.slug === idOrSlug || x.id === idOrSlug) && x.status === 'PUBLISHED');
    if (!r || !r.mediaAssets.some((m: any) => ['generated', 'source_mirrored'].includes(m.scanStatus))) return null;
    return r.imageOrigin === 'source' ? { buffer: PNG_SOURCE, mimeType: 'image/png', origin: 'source' } : { buffer: PNG_GENERATED, mimeType: 'image/png', origin: 'generated' };
  }
  /** Takedown: drop the mirrored source image, flip to generated (mirrors the real service's contract). */
  async replaceWithGenerated(idOrSlug: string) {
    const r = rows.find((x) => x.slug === idOrSlug || x.id === idOrSlug);
    if (!r) return { found: false, removedAssets: 0, deletedObjects: 0, generated: false };
    const before = r.mediaAssets.length;
    r.mediaAssets = r.mediaAssets.filter((m: any) => m.scanStatus !== 'source_mirrored' && !String(m.s3Key).startsWith('external/') || m.type !== 'IMAGE');
    r.mediaAssets.push({ id: `${r.id}-gen`, type: 'IMAGE', url: `/story-image/${r.slug}`, s3Key: `generated/images/${r.id}.png`, scanStatus: 'generated' });
    r.imageOrigin = 'generated';
    return { found: true, articleId: r.id, slug: r.slug, removedAssets: before - r.mediaAssets.length + 1, deletedObjects: 1, generated: true, origin: 'generated' };
  }
}

const allow = { canActivate: () => true };
@Module({
  controllers: [ArticlesController, StoryImageController],
  providers: [
    ArticlesService,
    { provide: PrismaService, useValue: prisma },
    { provide: ConfigService, useValue: { get: (k: string) => (k === 'COUNTRY_FEED_CACHE_TTL_MS' ? 1 : undefined) } },
    { provide: RedisCacheService, useValue: { getJson: async () => null, setJson: async () => undefined, delByPrefix: async () => undefined } },
    { provide: PublishingService, useValue: {} },
    { provide: StoryImageService, useClass: FakeImages },
  ],
})
class FakeModule {}

(async () => {
  const mod = await Test.createTestingModule({ imports: [FakeModule] })
    // Anonymous by default; a "Bearer staff" header simulates a CMS user for the audience checks.
    .overrideGuard(OptionalJwtAuthGuard).useValue({ canActivate: (ctx: any) => { const req = ctx.switchToHttp().getRequest(); if (req.headers.authorization === 'Bearer staff') req.user = { id: 'u1', role: 'ADMIN' }; return true; } })
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: (ctx: any) => ctx.switchToHttp().getRequest().headers.authorization === 'Bearer staff' })
    .overrideGuard(RolesGuard).useValue(allow)
    .compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix('api/v1');
  const httpAdapter: any = app.getHttpAdapter();
  httpAdapter.get('/api/v1/categories', (_q: any, res: any) => res.json([{ id: 'c-india', slug: 'india', name: 'India' }]));
  const port = Number(process.env.PORT ?? 4010);
  await app.listen(port);
  console.log(`fake api on :${port} (${rows.length} rows)`);
})();
