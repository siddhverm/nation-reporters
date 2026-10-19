const sent: any[] = [];
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send(cmd: any) { sent.push(cmd); return Promise.resolve({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }); } },
  PutObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'put' }); } },
  GetObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'get' }); } },
  DeleteObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'delete' }); } },
  HeadObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'head' }); } },
}));

import { StoryImageService } from './story-image.service';
import { SafeFetchError, type RawResponse, type Resolver, type Transport } from '../../common/safe-fetch.util';
import { makeJpeg, makePng, exifApp1 } from '../../common/test-images';
import { parseImageMode } from '../../common/image-mode';
import { sanitizeArticleForPublicResponse, sanitizeArticleListItem } from '../../common/article-public-sanitize.util';

const S3 = { S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'b', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 's', S3_REGION: 'us-east-1' };
const pub: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const goodJpeg = makeJpeg(1280, 720, [exifApp1(1)], 12_000);
const respond = (body: Buffer, ct = 'image/jpeg'): Transport => async () => ({ status: 200, headers: { 'content-type': ct }, body } as RawResponse);
const SRC = 'https://cdn.dailyplanet-gazette.example/photos/2026/10/metro-opening.jpg';

const make = (env: Record<string, string>, existing: unknown = null) => {
  const created: any[] = []; const articleUpdates: any[] = [];
  const prisma: any = {
    mediaAsset: {
      findFirst: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(async (a: any) => { created.push(a.data); return a.data; }),
    },
    article: { update: jest.fn(async (a: any) => { articleUpdates.push(a.data); return a.data; }), findFirst: jest.fn() },
    category: { findUnique: jest.fn().mockResolvedValue({ slug: 'india' }) },
  };
  const config: any = { get: (k: string) => env[k] };
  return { svc: new StoryImageService(config, prisma), prisma, created, articleUpdates };
};
const art = { id: 'a1', slug: 'metro-line-announced', title: 'Metro line announced', language: 'en', category: 'india' };
const okGen = (() => Promise.resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.alloc(2000, 7).toString('base64') } }] } }] }) })) as unknown as typeof fetch;

describe('IMAGE_MODE parsing', () => {
  it('defaults to source_first; generated_only is the safe mode', () => {
    expect(parseImageMode(undefined)).toBe('source_first');
    expect(parseImageMode('')).toBe('source_first');
    expect(parseImageMode('nonsense')).toBe('source_first');
    expect(parseImageMode('generated_only')).toBe('generated_only');
    expect(parseImageMode(' Generated-Only ')).toBe('generated_only');
  });
});

describe('source_first: mirror the source image into OUR storage', () => {
  beforeEach(() => { sent.length = 0; });
  const env = { ...S3, GEMINI_API_KEY: 'k', IMAGE_GEN_MIN_INTERVAL_MS: '0' };

  it('fetches, strips metadata, stores in S3 under source-mirror/, records origin=source and our URL only', async () => {
    const { svc, created, articleUpdates } = make(env);
    const r = await svc.attachStoryImage({ ...art, sourceImageUrl: SRC }, { fetchOptions: { resolver: pub, transport: respond(goodJpeg) } });
    expect(r).toEqual({ url: '/story-image/metro-line-announced', alt: 'Metro line announced', origin: 'source' }); // alt = headline
    const put = sent.find((c) => c.kind === 'put');
    expect(put.input.Key).toBe('source-mirror/images/a1.jpg');
    expect(put.input.ContentType).toBe('image/jpeg');
    expect(put.input.Body.toString('latin1')).not.toMatch(/GPS|Exif|CameraMake/); // EXIF stripped before storing
    expect(created[0]).toMatchObject({ articleId: 'a1', type: 'IMAGE', scanStatus: 'source_mirrored', url: '/story-image/metro-line-announced', width: 1280, height: 720 });
    expect(JSON.stringify(created)).not.toMatch(/dailyplanet|cdn\./i); // source URL/domain is never recorded
    expect(articleUpdates).toContainEqual({ imageOrigin: 'source' });
  });

  it.each([
    ['not an image (HTML)', respond(Buffer.from('<html>' + 'x'.repeat(20_000)), 'text/html')],
    ['too small', respond(makeJpeg(320, 180, [], 12_000))],
    ['rotated phone photo', respond(makeJpeg(1280, 720, [exifApp1(6)], 12_000))],
    ['wrong declared type but PNG bytes too small', respond(makePng(100, 100), 'image/png')],
    ['HTTP 404', (async () => ({ status: 404, headers: {}, body: Buffer.alloc(0) })) as Transport],
    ['network failure', (async () => { throw new SafeFetchError('network_error'); }) as Transport],
  ])('falls back to the AI-generated picture when the source image is %s', async (_n, transport) => {
    const { svc, created, articleUpdates } = make(env);
    const r = await svc.attachStoryImage({ ...art, sourceImageUrl: SRC }, { fetchOptions: { resolver: pub, transport }, fetchImpl: okGen });
    expect(r).toMatchObject({ origin: 'generated', alt: 'Illustration for: Metro line announced' });
    expect(created).toHaveLength(1);
    expect(created[0].scanStatus).toBe('generated');
    expect(sent.some((c) => c.kind === 'put' && String(c.input.Key).startsWith('source-mirror/'))).toBe(false);
    expect(articleUpdates).toContainEqual({ imageOrigin: 'generated' });
  });

  it('SSRF: a source image URL on a private/loopback/metadata host is never fetched', async () => {
    const transport = jest.fn();
    for (const u of ['http://127.0.0.1/a.jpg', 'http://169.254.169.254/latest/meta-data/x.jpg', 'http://localhost/a.jpg', 'file:///etc/passwd', 'ftp://x/a.jpg']) {
      const { svc } = make(env);
      const out = await svc.mirrorSourceImage({ ...art, sourceImageUrl: u }, { transport: transport as never });
      expect(out.ok).toBe(false);
    }
    const priv: Resolver = async () => [{ address: '10.0.0.7', family: 4 }];
    const { svc } = make(env);
    expect((await svc.mirrorSourceImage({ ...art, sourceImageUrl: SRC }, { resolver: priv, transport: transport as never })).ok).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it('never hotlinks: without S3 the source image is not used (generated/fallback instead)', async () => {
    const { svc, created } = make({ GEMINI_API_KEY: 'k', IMAGE_GEN_MIN_INTERVAL_MS: '0' });
    const r = await svc.attachStoryImage({ ...art, sourceImageUrl: SRC }, { fetchOptions: { resolver: pub, transport: respond(goodJpeg) } });
    expect(r).toBeNull();
    expect(created).toHaveLength(0);
  });

  it('logo / icon / tracking URLs are skipped before any fetch', async () => {
    const transport = jest.fn();
    const { svc } = make(env);
    const out = await svc.mirrorSourceImage({ ...art, sourceImageUrl: 'https://cdn.example.com/static/logo.png' }, { resolver: pub, transport: transport as never });
    expect(out.ok).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it('no source image -> generated picture (the "story without a source image" case)', async () => {
    const { svc } = make(env);
    expect(await svc.attachStoryImage({ ...art, sourceImageUrl: null }, { fetchImpl: okGen })).toMatchObject({ origin: 'generated' });
  });

  it('is idempotent: an existing mirrored image is kept and reported as source', async () => {
    const { svc, prisma } = make(env, { id: 'm1', scanStatus: 'source_mirrored' });
    const t = jest.fn();
    expect(await svc.attachStoryImage({ ...art, sourceImageUrl: SRC }, { fetchOptions: { transport: t as never } })).toMatchObject({ origin: 'source' });
    expect(t).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.create).not.toHaveBeenCalled();
  });
});

describe('IMAGE_MODE=generated_only (safe mode)', () => {
  beforeEach(() => { sent.length = 0; });
  const env = { ...S3, IMAGE_MODE: 'generated_only', GEMINI_API_KEY: 'k', IMAGE_GEN_MIN_INTERVAL_MS: '0' };
  it('never fetches the source image, not even to look at it', async () => {
    const transport = jest.fn();
    const { svc, created } = make(env);
    expect(svc.imageMode).toBe('generated_only');
    expect(await svc.resolveSourceImageUrl(SRC, 'https://dailyplanet-gazette.example/a', 'en')).toBeNull();
    const r = await svc.attachStoryImage({ ...art, sourceImageUrl: SRC }, { fetchOptions: { resolver: pub, transport: transport as never }, fetchImpl: okGen });
    expect(r?.origin).toBe('generated');
    expect(transport).not.toHaveBeenCalled();
    expect(created.every((c) => c.scanStatus === 'generated')).toBe(true);
  });
});

describe('takedown: replaceWithGenerated', () => {
  beforeEach(() => { sent.length = 0; });
  const env = { ...S3, GEMINI_API_KEY: 'k', IMAGE_GEN_MIN_INTERVAL_MS: '0' };
  const row = { id: 'a1', slug: 'metro-line-announced', title: 'Metro line announced', language: 'en', excerpt: 'x', categoryId: 'c1', body: { type: 'doc', imageUrl: '/story-image/metro-line-announced', imageCredit: 'Photo: X', imageOrigin: 'source', content: [] } };

  it('purges the mirrored object + rows, flips origin to generated and creates a generated image', async () => {
    const { svc, prisma, articleUpdates } = make(env);
    prisma.article.findFirst.mockResolvedValue(row);
    prisma.mediaAsset.findMany.mockResolvedValue([{ id: 'm1', s3Key: 'source-mirror/images/a1.jpg' }, { id: 'm0', s3Key: 'external/a1/source-image' }]);
    const out = await svc.replaceWithGenerated('metro-line-announced', okGen);
    expect(out).toMatchObject({ found: true, removedAssets: 2, deletedObjects: 1, generated: true, origin: 'generated' });
    const del = sent.filter((c) => c.kind === 'delete');
    expect(del.map((c) => c.input.Key)).toEqual(['source-mirror/images/a1.jpg']); // external/ rows have no object of ours
    expect(prisma.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['m1', 'm0'] } } });
    expect(articleUpdates[0]).toMatchObject({ imageOrigin: 'generated' });
    expect(articleUpdates[0].body).toMatchObject({ imageOrigin: 'generated', imageGenerated: true });
    expect(articleUpdates[0].body.imageCredit).toBeUndefined();
    expect(sent.some((c) => c.kind === 'put' && String(c.input.Key).startsWith('generated/images/'))).toBe(true);
  });
  it('still switches to generated origin (fallback artwork) when generation is unavailable, and is idempotent', async () => {
    const { svc, prisma, articleUpdates } = make({ ...S3, IMAGE_GEN_MIN_INTERVAL_MS: '0' }); // no GEMINI key
    prisma.article.findFirst.mockResolvedValue(row);
    prisma.mediaAsset.findMany.mockResolvedValue([]);
    const out = await svc.replaceWithGenerated('metro-line-announced');
    expect(out).toMatchObject({ found: true, removedAssets: 0, generated: false, origin: 'generated' });
    expect(articleUpdates[0].imageOrigin).toBe('generated');
    expect(prisma.mediaAsset.deleteMany).not.toHaveBeenCalled();
  });
  it('unknown article -> found=false', async () => {
    const { svc, prisma } = make(env);
    prisma.article.findFirst.mockResolvedValue(null);
    expect(await svc.replaceWithGenerated('nope')).toMatchObject({ found: false });
  });
});

describe('serving + public API', () => {
  beforeEach(() => { sent.length = 0; });
  it('readStoryImage reports the origin of what it serves', async () => {
    const { svc, prisma } = make({ ...S3 });
    prisma.mediaAsset.findFirst.mockResolvedValue({ s3Key: 'source-mirror/images/a1.jpg', mimeType: 'image/jpeg', scanStatus: 'source_mirrored' });
    expect(await svc.readStoryImage('metro-line-announced')).toMatchObject({ origin: 'source', mimeType: 'image/jpeg' });
    prisma.mediaAsset.findFirst.mockResolvedValue({ s3Key: 'generated/images/a1.png', mimeType: 'image/png', scanStatus: 'generated' });
    expect(await svc.readStoryImage('metro-line-announced')).toMatchObject({ origin: 'generated' });
  });

  const dirty = {
    title: 'Metro line announced', slug: 'metro-line-announced', language: 'en', excerpt: 'The line opens in 2028.', imageOrigin: 'source',
    body: { type: 'doc', imageUrl: 'https://cdn.dailyplanet-gazette.example/photos/metro.jpg', imageCredit: 'Photo: Jane / Daily Planet Gazette', content: [] },
    mediaAssets: [
      { id: 'm0', type: 'IMAGE', url: 'https://cdn.dailyplanet-gazette.example/photos/metro.jpg', s3Key: 'external/a1/source-image', scanStatus: 'external' },
      { id: 'm1', type: 'IMAGE', url: '/story-image/metro-line-announced', s3Key: 'source-mirror/images/a1.jpg', scanStatus: 'source_mirrored' },
    ],
    provenance: { sourceName: 'Daily Planet Gazette', sourceUrl: 'https://dailyplanet-gazette.example/a' },
  };
  it('detail + list payloads carry origin=source and OUR url only — no source domain/URL, storage key or credit', () => {
    const d = sanitizeArticleForPublicResponse(dirty as never) as any;
    const l = sanitizeArticleListItem(dirty as never) as any;
    for (const out of [d, l]) {
      expect(out.image).toEqual({ url: '/story-image/metro-line-announced', alt: 'Metro line announced', origin: 'source' });
      expect(out.imageOrigin).toBe('source');
    }
    expect(d.body).toMatchObject({ imageUrl: '/story-image/metro-line-announced', imageOrigin: 'source', imageGenerated: false });
    expect(d.body.imageCredit).toBeUndefined();
    expect(d.mediaAssets.filter((m: any) => m.type === 'IMAGE')).toEqual([{ id: 'm0', type: 'IMAGE', url: '/story-image/metro-line-announced', alt: 'Metro line announced', origin: 'source', scanStatus: 'source_mirrored' }]);
    expect(JSON.stringify([d, l])).not.toMatch(/dailyplanet|cdn\.|external\/|source-mirror|s3Key|Photo:/i);
  });
  it('defaults to origin=generated (NULL column / old rows) with the "Illustration for" alt', () => {
    const d = sanitizeArticleForPublicResponse({ ...dirty, imageOrigin: null } as never) as any;
    expect(d.image).toEqual({ url: '/story-image/metro-line-announced', alt: 'Illustration for: Metro line announced', origin: 'generated' });
    expect(d.body.imageGenerated).toBe(true);
  });
  it('social posts use our own /story-image URL, never a publisher URL', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(require('path').resolve(__dirname, '../publishing/publishing.service.ts'), 'utf8');
    expect(src).toMatch(/imageUrl: `\$\{this\.publicWebBaseUrl\}\/story-image\/\$\{encodeURIComponent\(article\.slug\)\}`/);
    expect(src).not.toMatch(/mediaAssets?[^\n]*IMAGE[^\n]*imageUrl|imageUrl:[^\n]*(?:asset|media)/i);
  });
});
