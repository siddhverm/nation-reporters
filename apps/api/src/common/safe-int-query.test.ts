import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { safeInt } from './safe-int.util';
import { ArticlesService } from '../modules/articles/articles.service';
import { ArticlesController } from '../modules/articles/articles.controller';
import { HealthController } from '../modules/health/health.module';

/** A Prisma stand-in that fails exactly like the real client does on a non-integer `take`. */
function prismaMock(rows: unknown[] = []) {
  const findMany = jest.fn(async (args: { take?: unknown }) => {
    if (args.take !== undefined && !Number.isInteger(args.take)) {
      throw new Error('PrismaClientValidationError: Argument `take` is missing.');
    }
    return rows;
  });
  return { article: { findMany, count: jest.fn(async () => rows.length) } };
}

function articlesService(prisma = prismaMock()) {
  const config = { get: () => undefined };
  const redis = { getJson: jest.fn(async () => null), setJson: jest.fn(async () => undefined), delByPrefix: jest.fn(async () => undefined) };
  return { svc: new ArticlesService(prisma as never, config as never, redis as never), prisma };
}

describe('safeInt', () => {
  it.each([
    [undefined, 20], [null, 20], ['', 20], ['   ', 20], [NaN, 20], [Infinity, 20],
    ['abc', 20], ['12abc', 20], [[], 20], [{}, 20], [true, 20],
  ])('%p → default', (input, expected) => {
    expect(safeInt(input, 20, 1, 100)).toBe(expected);
  });

  it('parses numbers and numeric strings, truncates and clamps', () => {
    expect(safeInt('35', 20, 1, 100)).toBe(35);
    expect(safeInt(' 7 ', 20, 1, 100)).toBe(7);
    expect(safeInt('20.9', 20, 1, 100)).toBe(20);
    expect(safeInt(42, 20, 1, 100)).toBe(42);
    expect(safeInt('0', 20, 1, 100)).toBe(1);
    expect(safeInt('-5', 20, 1, 100)).toBe(1);
    expect(safeInt('5000', 20, 1, 100)).toBe(100);
    expect(safeInt(undefined, 500, 1, 100)).toBe(100); // default is clamped too
  });
});

describe('root cause: global ValidationPipe({ transform: true }) on a `number` @Query param', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

  it('turns a missing number param into NaN (and NaN ?? 20 stays NaN)', async () => {
    const v = await pipe.transform(undefined, { type: 'query', metatype: Number, data: 'localLimit' });
    expect(Number.isNaN(v)).toBe(true);
    expect(Math.min(100, Math.max(1, Number(v ?? 20)))).toBeNaN(); // the old findCountryFeed maths
  });

  it('leaves a missing string param undefined (what the controllers now declare)', async () => {
    const v = await pipe.transform(undefined, { type: 'query', metatype: String, data: 'localLimit' });
    expect(v).toBeUndefined();
  });
});

describe('country-feed', () => {
  it.each([[undefined], [NaN], [''], ['abc']])('limit %p → numeric take (default 20)', async (bad) => {
    const { svc, prisma } = articlesService();
    await expect(
      svc.findCountryFeed({ localLang: 'en', globalLang: 'hi', localLimit: bad as never, globalLimit: bad as never }),
    ).resolves.toEqual(expect.objectContaining({ local: [], global: [] }));
    const takes = prisma.article.findMany.mock.calls.map((c) => (c[0] as { take: number }).take);
    expect(takes.length).toBeGreaterThan(0);
    for (const t of takes) expect(Number.isInteger(t)).toBe(true);
    expect(takes[0]).toBe(60); // localLimit 20 × 3
  });

  it('honours a numeric string limit', async () => {
    const { svc, prisma } = articlesService();
    await svc.findCountryFeed({ localLang: 'en', globalLang: 'en', localLimit: '10', globalLimit: '10' });
    expect((prisma.article.findMany.mock.calls[0][0] as { take: number }).take).toBe(30);
  });

  it('controller: ?localLang=en&globalLang=en (no limits) sends 20/20 to the service', () => {
    const svc = { findCountryFeed: jest.fn() };
    const ctrl = new ArticlesController(svc as never, {} as never);
    ctrl.countryFeed('en', 'en', undefined, undefined);
    expect(svc.findCountryFeed).toHaveBeenCalledWith({ localLang: 'en', globalLang: 'en', localLimit: 20, globalLimit: 20 });
  });
});

describe('articles findAll page/limit', () => {
  it.each([[undefined], [NaN], [''], ['x']])('page/limit %p → page 1, limit 20, integer take/skip', async (bad) => {
    const { svc, prisma } = articlesService();
    const res = await svc.findAll({ page: bad as never, limit: bad as never, omitBody: true, language: 'en' }, 'public');
    expect(res).toEqual(expect.objectContaining({ page: 1, limit: 20 }));
    const first = prisma.article.findMany.mock.calls[0][0] as { take: number; skip: number };
    expect(first.take).toBe(20);
    expect(first.skip).toBe(0);
  });

  it('limit=150 with omitBody (what the web topic pages send) is allowed; caps otherwise at 100', async () => {
    const a = articlesService();
    expect((await a.svc.findAll({ limit: '150', omitBody: true }, 'public')).limit).toBe(150);
    const b = articlesService();
    expect((await b.svc.findAll({ limit: '150' }, 'public')).limit).toBe(100);
  });

  it('controller passes clean integers', () => {
    const svc = { findAll: jest.fn() };
    const ctrl = new ArticlesController(svc as never, {} as never);
    ctrl.findAll({}, undefined, undefined, undefined, 'en', undefined, undefined, '', 'true');
    expect(svc.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20, omitBody: true }), 'public');
  });
});

describe('health', () => {
  const stale = [{ id: 's1', name: 'Daily Planet', feedUrl: 'https://dailyplanet.example/rss', lastFetchedAt: null }];
  function health() {
    const prisma = {
      ingestedSource: {
        count: jest.fn(async (args: { where: { OR?: unknown } }) => (args.where.OR ? 1 : 12)),
        findMany: jest.fn(async () => stale),
      },
    };
    const ctrl = new HealthController(prisma as never, { get: () => undefined } as never, { ping: async () => 'up' } as never);
    return { ctrl, prisma };
  }

  it('public output has only status + counts — no source names or feed URLs', async () => {
    const { ctrl, prisma } = health();
    for (const res of [await ctrl.check({}), await ctrl.ready({})]) {
      const json = JSON.stringify(res);
      expect(json).not.toMatch(/name|feedUrl|Daily Planet|dailyplanet|staleSources"/);
      expect(res).toEqual({
        status: 'degraded',
        timestamp: expect.any(Date),
        checks: { redis: 'up', ingestion: { activeSources: 12, staleSourceCount: 1, expectedIntervalHours: 10 } },
      });
    }
    expect(prisma.ingestedSource.findMany).not.toHaveBeenCalled();
  });

  it('authenticated staff still get the stale-source details', async () => {
    const { ctrl } = health();
    const res = (await ctrl.check({ user: { id: 'u1' } })) as { checks: { ingestion: { staleSources: unknown } } };
    expect(res.checks.ingestion.staleSources).toEqual(stale);
  });

  it('liveness (deploy script) is unchanged', () => {
    expect(health().ctrl.live()).toEqual({ status: 'ok', timestamp: expect.any(Date) });
  });
});
