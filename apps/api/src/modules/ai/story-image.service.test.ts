const sent: any[] = [];
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send(cmd: any) { sent.push(cmd); return Promise.resolve({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }); } },
  PutObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'put' }); } },
  GetObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'get' }); } },
}));

import { StoryImageService } from './story-image.service';

const PNG_B64 = Buffer.alloc(2000, 7).toString('base64');
const imgFetch = (() => Promise.resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_B64 } }] } }] }) })) as unknown as typeof fetch;
const failFetch = (() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;

const S3 = { S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'b', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 's', S3_REGION: 'us-east-1' };
const make = (env: Record<string, string>, existing: unknown = null) => {
  const created: any[] = [];
  const prisma: any = {
    mediaAsset: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn(async (a: any) => { created.push(a.data); return a.data; }) },
  };
  const config: any = { get: (k: string) => env[k] };
  return { svc: new StoryImageService(config, prisma), prisma, created };
};
const art = { id: 'a1', slug: 'floods-hit-city', title: 'Floods hit city', language: 'en', category: 'india' };

describe('StoryImageService', () => {
  beforeEach(() => { sent.length = 0; });
  const env = { ...S3, GEMINI_API_KEY: 'k', IMAGE_GEN_MIN_INTERVAL_MS: '0' };

  it('generates, stores in S3 and records a generated MediaAsset with the same-origin URL', async () => {
    const { svc, created } = make(env);
    const r = await svc.generateForArticle(art, imgFetch);
    expect(r).toEqual({ url: '/story-image/floods-hit-city', alt: 'Illustration for: Floods hit city' });
    expect(sent).toHaveLength(1);
    expect(sent[0].input.Key).toBe('generated/images/a1.png');
    expect(created[0]).toMatchObject({ articleId: 'a1', type: 'IMAGE', scanStatus: 'generated', url: '/story-image/floods-hit-city' });
  });
  it('is cached/idempotent: an existing generated asset skips the provider', async () => {
    const f = jest.fn();
    const { svc } = make(env, { id: 'm1' });
    expect(await svc.generateForArticle(art, f as never)).toMatchObject({ url: '/story-image/floods-hit-city' });
    expect(f).not.toHaveBeenCalled();
  });
  it('no API key -> null (web serves generated fallback artwork), nothing stored', async () => {
    const { svc, created } = make({ ...S3, IMAGE_GEN_MIN_INTERVAL_MS: '0' });
    expect(await svc.generateForArticle(art, imgFetch)).toBeNull();
    expect(created).toHaveLength(0);
  });
  it('provider failure -> null, nothing stored', async () => {
    const { svc, created } = make(env);
    expect(await svc.generateForArticle(art, failFetch)).toBeNull();
    expect(created).toHaveLength(0);
  });
  it('S3 missing or feature disabled -> null without calling the provider', async () => {
    const f = jest.fn();
    expect(await make({ GEMINI_API_KEY: 'k', IMAGE_GEN_MIN_INTERVAL_MS: '0' }).svc.generateForArticle(art, f as never)).toBeNull();
    expect(await make({ ...env, IMAGE_GEN_ENABLED: 'false' }).svc.generateForArticle(art, f as never)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('a database error never throws out of generation', async () => {
    const { svc, prisma } = make(env);
    prisma.mediaAsset.findFirst.mockRejectedValue(new Error('db down'));
    expect(await svc.generateForArticle(art, imgFetch)).toBeNull();
  });
  it('readGeneratedImage only serves published stories and returns bytes', async () => {
    const { svc, prisma } = make(env);
    prisma.mediaAsset.findFirst.mockResolvedValue({ s3Key: 'generated/images/a1.png', mimeType: 'image/png' });
    const r = await svc.readGeneratedImage('floods-hit-city');
    expect(r?.mimeType).toBe('image/png');
    expect(prisma.mediaAsset.findFirst.mock.calls[0][0].where.article).toEqual({ slug: 'floods-hit-city', status: 'PUBLISHED' });
  });
});
