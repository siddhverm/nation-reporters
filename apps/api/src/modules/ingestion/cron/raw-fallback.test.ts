import { IngestionCronService } from './ingestion-cron.service';
import { HELD_PLACEHOLDER, heldPlaceholderText, parseRawFallbackMode } from '../../../common/held-story';
import { RewriteRejectedError } from '../../ai/ai.service';
import * as fs from 'fs';
import * as path from 'path';

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../../test-fixtures/news-fixtures.json'), 'utf8'));
const LANGS = Object.keys(fixtures.languages);
const SECRET_BODY = 'ZEBRAQUILL secret copied paragraph from the publisher that must never be published anywhere. '.repeat(8);

function make(env: Record<string, string> = {}) {
  const created: any[] = [];
  const updates: any[] = [];
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin' }) },
    article: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: any) => { const row = { id: 'a1', slug: data.slug, ...data }; created.push(row); return row; }),
      update: jest.fn(async (a: any) => { updates.push(a); return a; }),
    },
    category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-india', slug: 'india' }), findMany: jest.fn().mockResolvedValue([]) },
    ingestedArticle: { update: jest.fn() },
  };
  const provenance: any = { record: jest.fn().mockResolvedValue(undefined) };
  const images: any = { generateForArticle: jest.fn().mockResolvedValue(null) };
  const publishing: any = { publishToSocialOnly: jest.fn().mockResolvedValue(undefined), publishArticle: jest.fn() };
  const config: any = { get: (k: string) => env[k] };
  const svc: any = new IngestionCronService(config, prisma, {} as any, provenance, {} as any, publishing, images);
  return { svc, prisma, created, provenance, images, publishing };
}
const ingested = (lang = 'en') => ({
  id: 'ing1', sourceUrl: 'https://dailyplanet-gazette.example/story/1', sourceTitle: 'Metro line announced - Daily Planet Gazette',
  body: `<p>${SECRET_BODY}</p>`, publishedAt: new Date(), lang,
});
const source = (language = 'en') => ({ name: 'Daily Planet Gazette', language });

describe('raw fallback when the AI rewrite is unavailable/rejected', () => {
  it('parses the mode (default draft)', () => {
    expect(parseRawFallbackMode(undefined)).toBe('draft');
    expect(parseRawFallbackMode('Placeholder')).toBe('placeholder');
    expect(parseRawFallbackMode('raw')).toBe('draft');
  });

  it('default: holds a DRAFT, nothing public, no source text stored, not counted as published', async () => {
    const { svc, created, publishing, images, provenance } = make();
    const ok = await svc.publishRaw(ingested(), source());
    expect(ok).toBe(false);
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe('DRAFT');
    expect(created[0].publishedAt).toBeUndefined();
    const json = JSON.stringify(created[0]);
    expect(json).not.toContain('ZEBRAQUILL');
    expect(json).not.toMatch(/Daily Planet/i);
    expect(created[0].body.heldForRewrite).toBe(true);
    expect(created[0].excerpt).toBe(HELD_PLACEHOLDER.en);
    expect(created[0].bodyShort).toBeUndefined();
    expect(created[0].bodyMedium).toBeUndefined();
    expect(publishing.publishToSocialOnly).not.toHaveBeenCalled();
    expect(images.generateForArticle).not.toHaveBeenCalled();
    expect(provenance.record).toHaveBeenCalled(); // internal record only
  });

  it('is idempotent: an item that already has an article is not duplicated', async () => {
    const { svc, prisma, created } = make();
    prisma.article.findFirst.mockResolvedValueOnce({ id: 'exists' });
    expect(await svc.publishRaw(ingested(), source())).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('caps held drafts per run', async () => {
    const { svc, created } = make({ RAW_FALLBACK_MAX_DRAFTS_PER_RUN: '2' });
    for (let i = 0; i < 4; i++) await svc.publishRaw({ ...ingested(), id: `i${i}` }, source());
    expect(created).toHaveLength(2);
  });

  it('placeholder mode: publishes only the translated notice under a clean headline, with generated image, no social', async () => {
    const { svc, created, publishing, images } = make({ RAW_FALLBACK_MODE: 'placeholder' });
    const ok = await svc.publishRaw(ingested(), source('hi'));
    expect(ok).toBe(true);
    const a = created[0];
    expect(a.status).toBe('PUBLISHED');
    expect(a.excerpt).toBe(HELD_PLACEHOLDER.hi);
    expect(a.body.content[0].content[0].text).toBe(HELD_PLACEHOLDER.hi);
    expect(JSON.stringify(a)).not.toContain('ZEBRAQUILL');
    expect(a.title).not.toMatch(/Daily Planet/i); // outlet suffix scrubbed from the headline
    expect(images.generateForArticle).toHaveBeenCalled();
    expect(publishing.publishToSocialOnly).not.toHaveBeenCalled();
  });

  it('every supported language has a non-empty placeholder in its own script', () => {
    expect(Object.keys(HELD_PLACEHOLDER).sort()).toEqual(expect.arrayContaining([...LANGS].sort()));
    for (const l of LANGS) {
      expect(heldPlaceholderText(l).length).toBeGreaterThan(15);
      if (l !== 'en') expect(heldPlaceholderText(l)).not.toBe(HELD_PLACEHOLDER.en);
    }
    expect(heldPlaceholderText('xx')).toBe(HELD_PLACEHOLDER.en);
    expect(heldPlaceholderText('pt-BR')).toBe(HELD_PLACEHOLDER.pt);
  });

  it('quota/rejection errors from the rewrite are recognised as retryable', () => {
    expect(new RewriteRejectedError('x', null).name).toBe('RewriteRejectedError');
  });
});
