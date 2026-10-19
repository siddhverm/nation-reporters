import { ConfigService } from '@nestjs/config';
import { classifyAiError, GeminiModelUnavailableError, isModelNotFoundMessage, ModelSelector, parseModelList, shortReason } from '../../common/gemini-models.util';
import { generateImageWithGemini } from '../../common/story-image.util';
import { GeminiClient } from './gemini.client';
import { StoryImageService } from './story-image.service';

const RETIRED = (m: string) => new Error(`[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent: [404 Not Found] This model models/${m} is no longer available to new users.`);

const calls: string[] = [];
let behaviour: Record<string, () => unknown> = {};
let created: string[] = [];
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: ({ model }: { model: string }) => {
      created.push(model);
      return {
        generateContent: jest.fn(async () => {
          calls.push(model);
          const b = behaviour[model];
          if (!b) throw new Error('unexpected model ' + model);
          return b();
        }),
      };
    },
  })),
}));
const ok = (text: string) => () => ({ response: { text: () => text, usageMetadata: { totalTokenCount: 7 } } });
const cfg = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] } as unknown as ConfigService);

beforeEach(() => { calls.length = 0; created = []; behaviour = {}; });

describe('gemini model helpers', () => {
  it('parseModelList trims, dedupes, drops models/ prefix', () => {
    expect(parseModelList('gemini-2.5-flash', ' models/gemini-flash-latest, gemini-2.5-flash ,,gemini-2.5-flash-lite')).toEqual(['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite']);
    expect(parseModelList(undefined, '')).toEqual([]);
  });
  it('classifies model-not-found vs quota vs other', () => {
    expect(classifyAiError(RETIRED('gemini-2.0-flash'))).toBe('model_not_found');
    expect(isModelNotFoundMessage('models/foo is not found for API version v1beta, or is not supported for generateContent')).toBe(true);
    expect(classifyAiError(new Error('[429 Too Many Requests] Quota exceeded for metric'))).toBe('quota');
    expect(classifyAiError(new Error('fetch failed ECONNRESET'))).toBe('other');
    expect(classifyAiError(new GeminiModelUnavailableError(['a']))).toBe('model_not_found');
  });
  it('shortReason never cuts mid-word', () => {
    const r = shortReason('word '.repeat(100), 50);
    expect(r.length).toBeLessThanOrEqual(51);
    expect(r).toMatch(/word…$/);
    expect(shortReason('short reason')).toBe('short reason');
  });
  it('ModelSelector logs the used model once and the switch once', async () => {
    const logs: string[] = [];
    const sel = new ModelSelector(['a', 'b'], 'T', (m) => logs.push(m));
    const fn = async (m: string) => { if (m === 'a') throw RETIRED('a'); return m; };
    expect((await sel.run(fn)).model).toBe('b');
    expect((await sel.run(fn)).model).toBe('b');
    expect(logs).toEqual(['T: model a is not available — switching to b', 'T: using model b']);
  });
});

describe('GeminiClient model fallback', () => {
  it('uses GEMINI_MODEL default gemini-2.5-flash, built lazily (not in the constructor)', async () => {
    behaviour['gemini-2.5-flash'] = ok('hi');
    const c = new GeminiClient(cfg({ GEMINI_API_KEY: 'k' }));
    expect(created).toEqual([]);
    (c as any).minIntervalMs = 0;
    const r = await c.generate('p');
    expect(r.text).toBe('hi');
    expect(c.lastModelUsed).toBe('gemini-2.5-flash');
  });
  it('on 404 switches to the next candidate and caches the working one', async () => {
    behaviour['gemini-2.0-flash'] = () => { throw RETIRED('gemini-2.0-flash'); };
    behaviour['gemini-flash-latest'] = () => { throw new Error('[404 Not Found] models/gemini-flash-latest is not found'); };
    behaviour['gemini-2.5-flash-lite'] = ok('{"a":1}');
    const c = new GeminiClient(cfg({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.0-flash' }));
    (c as any).minIntervalMs = 0;
    expect((await c.generateJson<{ a: number }>('p')).data).toEqual({ a: 1 });
    expect(c.lastModelUsed).toBe('gemini-2.5-flash-lite');
    await c.generate('again');
    expect(calls).toEqual(['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-lite']);
  });
  it('honours GEMINI_MODEL_FALLBACKS and throws a clear error when all are gone (no retry loop)', async () => {
    behaviour['x'] = () => { throw RETIRED('x'); };
    behaviour['y'] = () => { throw RETIRED('y'); };
    const c = new GeminiClient(cfg({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'x', GEMINI_MODEL_FALLBACKS: 'y' }));
    (c as any).minIntervalMs = 0;
    await expect(c.generate('p')).rejects.toThrow(/Set GEMINI_MODEL in \.env/);
    expect(calls).toEqual(['x', 'y']);
  });
  it('does not switch model on quota or other errors', async () => {
    behaviour['gemini-2.5-flash'] = () => { throw new Error('[429 Too Many Requests] Quota exceeded for metric free_tier'); };
    const c = new GeminiClient(cfg({ GEMINI_API_KEY: 'k' }));
    (c as any).minIntervalMs = 0;
    await expect(c.generate('p')).rejects.toThrow(/429/);
    expect(calls).toEqual(['gemini-2.5-flash']);
  });
});

describe('image model fallback', () => {
  const png = Buffer.alloc(5000, 1).toString('base64');
  const imageResponse = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: png } }] } }] };
  const fetchFor = (okModels: string[]) => {
    const seen: string[] = [];
    const f = (async (url: string) => {
      const model = decodeURIComponent(/models\/([^:]+):/.exec(url)![1]);
      seen.push(model);
      if (!okModels.includes(model)) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => imageResponse };
    }) as unknown as typeof fetch;
    return { f, seen };
  };

  it('generateImageWithGemini reports 404 as model_not_found', async () => {
    const { f } = fetchFor([]);
    const r = await generateImageWithGemini('p', { apiKey: 'k', model: 'old', fetchImpl: f });
    expect(r).toMatchObject({ ok: false, reason: 'model_not_found' });
  });

  function service(env: Record<string, string>) {
    const prisma = { mediaAsset: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) } };
    const svc = new StoryImageService(cfg({ GEMINI_API_KEY: 'k', S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'b', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 's', ...env }), prisma as never);
    (svc as any).throttle = async () => undefined;
    (svc as any).putWithRetry = jest.fn().mockResolvedValue(undefined);
    return svc;
  }
  const art = { id: 'a1', slug: 's', title: 'T', language: 'en' } as never;

  it('default gemini-2.5-flash-image → 404 → falls back to gemini-3.1-flash-image and caches it', async () => {
    const svc = service({});
    const { f, seen } = fetchFor(['gemini-3.1-flash-image']);
    expect(await svc.generateForArticle(art, f)).toMatchObject({ url: '/story-image/s' });
    await svc.generateForArticle(art, f);
    expect(seen).toEqual(['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3.1-flash-image']);
    expect(svc.imageModelsUnavailable).toBe(false);
  });

  it('all image models gone → null (fallback artwork) and flagged; no further calls', async () => {
    const svc = service({ IMAGE_GEN_MODEL: 'old-image', IMAGE_GEN_MODEL_FALLBACKS: 'older-image' });
    const { f, seen } = fetchFor([]);
    expect(await svc.generateForArticle(art, f)).toBeNull();
    expect(svc.imageModelsUnavailable).toBe(true);
    await svc.generateForArticle(art, f);
    expect(seen).toEqual(['old-image', 'older-image']);
  });
});
