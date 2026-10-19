/** Storage-failure handling + backfill of stories whose picture object is missing from storage. */
const store = new Map<string, { body: Buffer; type: string }>();
let failPuts = 0;
let putAttempts = 0;
class NotFound extends Error { name = 'NotFound'; $metadata = { httpStatusCode: 404 }; }
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    async send(cmd: any) {
      const k = cmd.input?.Key as string;
      if (cmd.kind === 'put') { putAttempts++; if (failPuts > 0) { failPuts--; throw new Error('connect ECONNREFUSED minio:9000'); } store.set(k, { body: cmd.input.Body, type: cmd.input.ContentType }); return {}; }
      if (cmd.kind === 'head') { if (!store.has(k)) throw new NotFound('nf'); return {}; }
      if (cmd.kind === 'get') { const o = store.get(k); if (!o) throw new NotFound('nf'); return { Body: { transformToByteArray: async () => new Uint8Array(o.body) } }; }
      if (cmd.kind === 'delete') { store.delete(k); return {}; }
      return {};
    }
  },
  PutObjectCommand: class { kind = 'put'; constructor(public input: any) {} },
  GetObjectCommand: class { kind = 'get'; constructor(public input: any) {} },
  HeadObjectCommand: class { kind = 'head'; constructor(public input: any) {} },
  DeleteObjectCommand: class { kind = 'delete'; constructor(public input: any) {} },
}));

import { StoryImageService } from './story-image.service';
import { makeJpeg, exifApp1 } from '../../common/test-images';
import type { RawResponse, Resolver, Transport } from '../../common/safe-fetch.util';

const S3 = { S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'nation-reporters', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 's', S3_REGION: 'us-east-1', IMAGE_GEN_MIN_INTERVAL_MS: '0', S3_RETRY_BASE_MS: '1' };
const pub: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const photo = makeJpeg(1280, 720, [exifApp1(1)], 12_000);
const PAGE = 'https://dailyplanet-gazette.example/2026/10/metro';
const OG = 'https://cdn.dailyplanet-gazette.example/img/metro-og.jpg';
const html = `<html><head><meta property="og:image" content="${OG}"></head><body>x</body></html>`;
const hits: string[] = [];
const transport: Transport = async ({ url }) => {
  hits.push(url.toString());
  if (url.toString() === OG) return { status: 200, headers: { 'content-type': 'image/jpeg' }, body: photo } as RawResponse;
  if (url.toString() === PAGE) return { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(html) } as RawResponse;
  return { status: 404, headers: {}, body: Buffer.from('') } as RawResponse;
};
const fetchOptions = { resolver: pub, transport };

function make(env: Record<string, string> = {}) {
  const assets: any[] = [];
  const articles = new Map<string, any>([['a1', { id: 'a1', body: { type: 'doc', imageUrl: '/story-image/metro', imageGenerated: true } }]]);
  const prisma: any = {
    mediaAsset: {
      findFirst: jest.fn(async ({ where }: any) => assets.find((a) => (where.articleId === undefined || a.articleId === where.articleId) && a.type === 'IMAGE' && where.scanStatus.in.includes(a.scanStatus)) ?? null),
      deleteMany: jest.fn(async ({ where }: any) => { const i = assets.findIndex((a) => a.id === where.id); if (i >= 0) assets.splice(i, 1); return { count: 1 }; }),
      create: jest.fn(async ({ data }: any) => { const row = { id: `m${assets.length + 1}`, ...data }; assets.push(row); return row; }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    article: {
      findUnique: jest.fn(async ({ where }: any) => articles.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => { Object.assign(articles.get(where.id), data); return articles.get(where.id); }),
      findFirst: jest.fn(async ({ where }: any) => ({ id: 'a1', slug: where.slug ?? 'metro', status: 'PUBLISHED' })),
    },
  };
  const svc = new StoryImageService({ get: (k: string) => ({ ...S3, ...env })[k] } as any, prisma);
  return { svc, prisma, assets, articles };
}
const art = { id: 'a1', slug: 'metro', title: 'Metro line announced', language: 'en', category: 'india', pageUrl: PAGE };
const okGen = (() => Promise.resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.alloc(2000, 7).toString('base64') } }] } }] }) })) as unknown as typeof fetch;

beforeEach(() => { store.clear(); failPuts = 0; putAttempts = 0; hits.length = 0; });

describe('storage failures are retried, never silently turned into a "generated" story', () => {
  it('retries a transient put failure and still stores the SOURCE image', async () => {
    failPuts = 2;
    const { svc, assets } = make();
    const r = await svc.attachStoryImage({ ...art, sourceImageUrl: OG }, { fetchOptions });
    expect(r?.origin).toBe('source');
    expect(putAttempts).toBe(3);
    expect(assets).toHaveLength(1);
    expect(store.has('source-mirror/images/a1.jpg')).toBe(true);
  });
  it('storage down for good: no asset, no fallback to generation (would fail too), story left for the backfill', async () => {
    failPuts = 99;
    const { svc, assets, articles } = make({ GEMINI_API_KEY: 'k' });
    const gen = jest.spyOn(svc, 'generateForArticle');
    const r = await svc.attachStoryImage({ ...art, sourceImageUrl: OG }, { fetchOptions, fetchImpl: okGen });
    expect(r).toBeNull();
    expect(gen).not.toHaveBeenCalled();
    expect(assets).toHaveLength(0);
    expect(articles.get('a1').imageOrigin).toBeUndefined();
  });
  it('a DB row whose object is gone is treated as missing (not "already has an image")', async () => {
    const { svc, assets } = make();
    assets.push({ id: 'old', articleId: 'a1', type: 'IMAGE', scanStatus: 'generated', s3Key: 'generated/images/a1.png' });
    const r = await svc.attachStoryImage({ ...art, sourceImageUrl: OG }, { fetchOptions });
    expect(r?.origin).toBe('source');
    expect(assets.map((a) => a.id)).not.toContain('old');
  });
});

describe('backfillStoryImage', () => {
  it('dry run only reports (no writes, no fetches)', async () => {
    const { svc, assets } = make();
    assets.push({ id: 'old', articleId: 'a1', type: 'IMAGE', scanStatus: 'generated', s3Key: 'generated/images/a1.png' });
    expect(await svc.backfillStoryImage(art, { dryRun: true, fetchOptions })).toEqual({ outcome: 'would_backfill' });
    expect(assets).toHaveLength(1);
    expect(hits).toHaveLength(0);
  });
  it('object present → left alone (idempotent)', async () => {
    const { svc, assets } = make();
    store.set('generated/images/a1.png', { body: Buffer.from('x'), type: 'image/png' });
    assets.push({ id: 'ok', articleId: 'a1', type: 'IMAGE', scanStatus: 'generated', s3Key: 'generated/images/a1.png' });
    expect(await svc.backfillStoryImage(art, { fetchOptions })).toEqual({ outcome: 'ok_present' });
    expect(hits).toHaveLength(0);
  });
  it('missing object + legacy stored source URL → mirrored from that URL, origin=source, body points to OUR url', async () => {
    const { svc, assets, articles } = make();
    assets.push({ id: 'old', articleId: 'a1', type: 'IMAGE', scanStatus: 'generated', s3Key: 'generated/images/a1.png' });
    const r = await svc.backfillStoryImage({ ...art, legacyImageUrls: [OG] }, { fetchOptions });
    expect(r.outcome).toBe('source_mirrored');
    expect(articles.get('a1').imageOrigin).toBe('source');
    expect(articles.get('a1').body).toMatchObject({ imageUrl: '/story-image/metro', imageOrigin: 'source', imageGenerated: false });
    expect(JSON.stringify(articles.get('a1').body)).not.toMatch(/dailyplanet/);
    expect(assets.find((a) => a.scanStatus === 'source_mirrored').url).toBe('/story-image/metro');
  });
  it('no stored image URL → lazy-fetches the article page og:image (SSRF-safe fetcher) and mirrors it', async () => {
    const { svc, articles } = make();
    const r = await svc.backfillStoryImage(art, { fetchOptions });
    expect(r.outcome).toBe('source_mirrored');
    expect(hits).toEqual([PAGE, OG]);
    expect(articles.get('a1').imageOrigin).toBe('source');
  });
  it('page has no usable image → generated image; both unavailable → fallback', async () => {
    const noImg: Transport = async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<html><head></head></html>') } as RawResponse);
    const a = make({ GEMINI_API_KEY: 'k' });
    const r1 = await a.svc.backfillStoryImage(art, { fetchOptions: { resolver: pub, transport: noImg }, fetchImpl: okGen });
    expect(r1.outcome).toBe('generated');
    expect(a.articles.get('a1').imageOrigin).toBe('generated');
    const b = make({ IMAGE_GEN_ENABLED: 'false' });
    expect((await b.svc.backfillStoryImage(art, { fetchOptions: { resolver: pub, transport: noImg } })).outcome).toBe('fallback');
  });
  it('generated_only mode never fetches the source', async () => {
    const { svc } = make({ IMAGE_MODE: 'generated_only', GEMINI_API_KEY: 'k' });
    const r = await svc.backfillStoryImage({ ...art, legacyImageUrls: [OG] }, { fetchOptions, fetchImpl: okGen });
    expect(r.outcome).toBe('generated');
    expect(hits).toHaveLength(0);
  });
  it('storage outage during backfill is reported as an error (not masked by a generated image)', async () => {
    failPuts = 99;
    const { svc } = make({ GEMINI_API_KEY: 'k' });
    const r = await svc.backfillStoryImage(art, { fetchOptions, fetchImpl: okGen });
    expect(r.outcome).toBe('error');
    expect(r.reason).toMatch(/^storage/);
  });
  it('after backfill the story image is served from storage with origin source (what /story-image/<slug> proxies)', async () => {
    const { svc } = make();
    await svc.backfillStoryImage(art, { fetchOptions });
    const img = await svc.readStoryImage('metro');
    expect(img?.origin).toBe('source');
    expect(img?.mimeType).toBe('image/jpeg');
    expect(img?.buffer.length).toBeGreaterThan(1000);
  });
});
