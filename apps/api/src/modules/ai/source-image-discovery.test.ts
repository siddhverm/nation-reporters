const sent: any[] = [];
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send(cmd: any) { sent.push(cmd); return Promise.resolve({}); } },
  PutObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'put' }); } },
  GetObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'get' }); } },
  DeleteObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'delete' }); } },
  HeadObjectCommand: class { constructor(public input: any) { Object.assign(this, { kind: 'head' }); } },
}));

import { StoryImageService } from './story-image.service';
import { SafeFetchError, safeFetchBytes, type RawResponse, type Resolver, type Transport } from '../../common/safe-fetch.util';
import { browserFetch, browserHeaderAttempts, fetchFailureReason, CHROME_UA_MAC, CHROME_UA_WINDOWS } from '../../common/browser-fetch.util';
import { extractImageCandidatesFromHtml, largerImageUrlVariants, largestFromSrcset } from '../../common/image-candidates.util';
import { sniffConvertibleKind } from '../../common/image-convert.util';
import { makeJpeg } from '../../common/test-images';

const pub: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const PAGE = 'https://www.dailyplanet-gazette.example/india/fairfax-idbi-123.html';
const bigJpeg = makeJpeg(1280, 720, [], 12_000);
const smallJpeg = makeJpeg(200, 120, [], 9_000);

type Route = (url: URL, headers: Record<string, string>) => RawResponse;
const transportFor = (route: Route, log: Array<{ url: string; headers: Record<string, string> }> = []): Transport => async ({ url, headers }) => {
  log.push({ url: url.href, headers });
  return route(url, headers);
};
const ok = (body: Buffer | string, ct = 'image/jpeg'): RawResponse => ({ status: 200, headers: { 'content-type': ct }, body: Buffer.isBuffer(body) ? body : Buffer.from(body) });
const status = (n: number): RawResponse => ({ status: n, headers: {}, body: Buffer.alloc(0) });

describe('browser headers + one retry with alternate headers', () => {
  it('first attempt: Chrome UA, image Accept with avif/webp, Accept-Language, Referer = article page', () => {
    const [a, b] = browserHeaderAttempts('image', { referer: PAGE });
    expect(a['User-Agent']).toBe(CHROME_UA_WINDOWS);
    expect(a.Accept).toMatch(/^image\/avif,image\/webp/);
    expect(a['Accept-Language']).toMatch(/en/);
    expect(a.Referer).toBe(PAGE);
    expect(b.Referer).toBeUndefined();
    expect(b['User-Agent']).toBe(CHROME_UA_MAC);
    for (const h of [a, b]) expect(h['User-Agent']).not.toMatch(/bot|crawl|spider|google/i);
  });

  it('403 with Referer → retried without Referer and succeeds; reason carries the status', async () => {
    const log: any[] = [];
    const t = transportFor((_u, h) => (h.Referer ? status(403) : ok(bigJpeg)), log);
    const r = await browserFetch('https://cdn.example/a.jpg', 'image', { referer: PAGE, resolver: pub, transport: t, retryDelayMs: 0 });
    expect(r.body.length).toBe(bigJpeg.length);
    expect(log).toHaveLength(2);
    expect(log[0].headers.Referer).toBe(PAGE);
    expect(log[1].headers.Referer).toBeUndefined();
  });

  it('retries 401/429/5xx once, not 404; final error keeps the HTTP status (fetch:http_status:403)', async () => {
    for (const code of [401, 429, 503]) {
      const log: any[] = [];
      await expect(browserFetch('https://cdn.example/a.jpg', 'image', { resolver: pub, transport: transportFor(() => status(code), log), retryDelayMs: 0 })).rejects.toThrow(SafeFetchError);
      expect(log).toHaveLength(2);
    }
    const log404: any[] = [];
    const e = await browserFetch('https://cdn.example/a.jpg', 'image', { resolver: pub, transport: transportFor(() => status(404), log404) }).catch((x) => x);
    expect(log404).toHaveLength(1);
    expect(fetchFailureReason(e)).toBe('fetch:http_status:404');
    const e403 = await browserFetch('https://cdn.example/a.jpg', 'image', { resolver: pub, transport: transportFor(() => status(403)), retryDelayMs: 0 }).catch((x) => x);
    expect(fetchFailureReason(e403)).toBe('fetch:http_status:403');
  });

  it('follows redirects (each hop re-validated) up to 5', async () => {
    let n = 0;
    const t = transportFor((u) => (u.pathname === '/final.jpg' ? ok(bigJpeg) : (n++, { status: 302, headers: { location: n < 4 ? `/r${n}` : '/final.jpg' }, body: Buffer.alloc(0) })));
    const r = await browserFetch('https://cdn.example/start', 'image', { resolver: pub, transport: t });
    expect(r.body.length).toBe(bigJpeg.length);
    // SSRF guard still applies on a redirect hop
    const evil = transportFor(() => ({ status: 302, headers: { location: 'http://169.254.169.254/latest' }, body: Buffer.alloc(0) }));
    await expect(safeFetchBytes('https://cdn.example/x', { resolver: pub, transport: evil })).rejects.toMatchObject({ code: 'private_address' });
  });
});

describe('source image discovery on the article page', () => {
  const html = `<!doctype html><html><head>
    <meta property="og:image" content="/img/2026/10/fairfax-hero.jpg">
    <meta name="twitter:image" content="https://cdn.example/tw/fairfax.jpg">
    <link rel="image_src" href="//cdn.example/src/fairfax-src.jpg">
    <meta property="og:image" content="https://cdn.example/static/logo.png">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"Organization","logo":{"@type":"ImageObject","url":"https://cdn.example/brand/publisher-logo.png"},"image":"https://cdn.example/brand/org.jpg"},
      {"@type":"NewsArticle","image":[{"@type":"ImageObject","url":"https://cdn.example/ld/fairfax-1200.jpg"},"https://cdn.example/ld/fairfax-800.jpg"]}]}</script>
    <script type="application/ld+json">{ not json</script>
  </head><body><nav><img src="/icons/menu.png" width="24"></nav>
    <article><img src="/tiny.gif" width="1" height="1">
      <img data-src="/lazy/body-photo.jpg" srcset="/b/320.jpg 320w, /b/1280.jpg 1280w" width="1280">
      <img src="https://cdn.example/thumb.jpg?w=100&h=60">
      <img src="https://cdn.example/vector.svg"></article></body></html>`;

  it('og:image → twitter:image → image_src → JSON-LD → article <img>, relative URLs resolved, logos/svg/icons dropped', () => {
    const c = extractImageCandidatesFromHtml(html, PAGE, 20);
    expect(c.slice(0, 6)).toEqual([
      'https://www.dailyplanet-gazette.example/img/2026/10/fairfax-hero.jpg',
      'https://cdn.example/tw/fairfax.jpg',
      'https://cdn.example/src/fairfax-src.jpg',
      'https://cdn.example/ld/fairfax-1200.jpg',
      'https://cdn.example/ld/fairfax-800.jpg',
      'https://www.dailyplanet-gazette.example/b/1280.jpg',
    ]);
    expect(c.join(' ')).not.toMatch(/logo|org\.jpg|menu|vector\.svg|tiny\.gif/);
    // tiny resized thumbnail is replaced by its bigger version
    expect(c).toContain('https://cdn.example/thumb.jpg');
  });
  it('JSON-LD string image and ImageObject contentUrl', () => {
    expect(extractImageCandidatesFromHtml('<script type="application/ld+json">{"@type":"NewsArticle","image":"https://x.example/a.jpg"}</script>', PAGE)).toEqual(['https://x.example/a.jpg']);
    expect(extractImageCandidatesFromHtml('<script type="application/ld+json">[{"@type":"ImageObject","contentUrl":"https://x.example/b.jpg"}]</script>', PAGE)).toEqual(['https://x.example/b.jpg']);
  });
  it('largestFromSrcset', () => {
    expect(largestFromSrcset('a.jpg 320w, b.jpg 1024w, c.jpg 640w')).toBe('b.jpg');
    expect(largestFromSrcset('a.jpg 1x, b.jpg 2x')).toBe('b.jpg');
  });
});

describe('largerImageUrlVariants (query-param / path upscaling)', () => {
  it.each([
    ['https://cdn.example/p.jpg?w=100&h=60&q=80', ['https://cdn.example/p.jpg?q=80', 'https://cdn.example/p.jpg?w=1200&q=80']],
    ['https://cdn.example/p.jpg?width=150', ['https://cdn.example/p.jpg', 'https://cdn.example/p.jpg?width=1200']],
    ['https://site.example/wp-content/uploads/2026/10/photo-150x150.jpg', ['https://site.example/wp-content/uploads/2026/10/photo.jpg']],
    ['https://static.toiimg.com/thumb/msid-1,imgsize-1,width-400,height-225,resizemode-4/1.jpg', ['https://static.toiimg.com/thumb/msid-1,imgsize-1,width-1200,height-675,resizemode-4/1.jpg']],
    ['https://img.example/resize/100x100/photo.jpg', ['https://img.example/photo.jpg']],
  ])('%s', (input, expected) => expect(largerImageUrlVariants(input)).toEqual(expected));
  it('nothing to upscale → []', () => expect(largerImageUrlVariants('https://cdn.example/photo.jpg')).toEqual([]));
});

describe('mirrorSourceCandidates (service)', () => {
  const S3 = { S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'b', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 's', S3_REGION: 'us-east-1' };
  const make = (env: Record<string, string> = {}) => {
    const created: any[] = [];
    const prisma: any = {
      mediaAsset: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async (a: any) => { created.push(a.data); return a.data; }), deleteMany: jest.fn() },
      article: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ body: {} }) },
    };
    const svc = new StoryImageService({ get: (k: string) => ({ ...S3, IMAGE_GEN_ENABLED: 'false', ...env } as any)[k] } as any, prisma);
    svc.imageConverter = null;
    return { svc, created };
  };
  const art = { id: 'a1', slug: 'fairfax-idbi', title: 'Fairfax gets 15 years', language: 'en' };
  beforeEach(() => { sent.length = 0; });

  it('403 hero → too-small second candidate → its larger ?w= variant is mirrored (status codes in the reasons)', async () => {
    const { svc, created } = make();
    const log: any[] = [];
    const t = transportFor((u) => {
      if (u.pathname === '/hero.jpg') return status(403);
      if (u.pathname === '/second.jpg') return ok(u.search.includes('w=200') ? smallJpeg : bigJpeg);
      return status(404);
    }, log);
    const r = await svc.mirrorSourceCandidates(art, ['https://cdn.example/hero.jpg', 'https://cdn.example/second.jpg?w=200'], { fetchOptions: { resolver: pub, transport: t } });
    expect(r).toEqual({ ok: true, url: 'https://cdn.example/second.jpg' });
    expect(created[0].scanStatus).toBe('source_mirrored');
    expect(sent.find((c) => c.kind === 'put').input.Key).toBe('source-mirror/images/a1.jpg');
  });

  it('feed image fails → page is fetched lazily and the next candidate (JSON-LD) is used', async () => {
    const { svc } = make();
    const page = `<meta property="og:image" content="https://cdn.example/broken.jpg"><script type="application/ld+json">{"@type":"NewsArticle","image":"https://cdn.example/good.jpg"}</script>`;
    const t = transportFor((u) => (u.href === PAGE ? ok(page, 'text/html') : u.pathname === '/good.jpg' ? ok(bigJpeg) : status(403)));
    const r = await svc.mirrorSourceCandidates({ ...art, feedLink: PAGE }, ['https://cdn.example/feed.jpg'], { pageUrl: PAGE, lazyPage: true, fetchOptions: { resolver: pub, transport: t } });
    expect(r).toEqual({ ok: true, url: 'https://cdn.example/good.jpg' });
  });

  it('all fail → reason lists every attempt incl. HTTP status; nothing stored (fallback stays non-persistent)', async () => {
    const { svc, created } = make();
    const t = transportFor((u) => (u.href === PAGE ? status(403) : status(503)));
    const r = await svc.mirrorSourceCandidates({ ...art, feedLink: PAGE }, ['https://cdn.example/feed.jpg'], { pageUrl: PAGE, lazyPage: true, fetchOptions: { resolver: pub, transport: t } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('fetch:http_status:503');
      expect(r.reason).toContain('page_fetch:http_status:403');
    }
    expect(created).toHaveLength(0);
    expect(sent.filter((c) => c.kind === 'put')).toHaveLength(0);
  });

  it('animated/unsupported picture is converted when a converter (sharp) is available, else the next candidate is tried', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20_000, 1)]);
    const t = transportFor((u) => (u.pathname === '/anim.gif' ? ok(gif, 'image/gif') : u.pathname === '/next.jpg' ? ok(bigJpeg) : status(404)));
    const a = make();
    a.svc.imageConverter = async () => bigJpeg; // stand-in for sharp's first-frame → JPEG
    expect(await a.svc.mirrorSourceCandidates(art, ['https://cdn.example/anim.gif'], { fetchOptions: { resolver: pub, transport: t } })).toEqual({ ok: true, url: 'https://cdn.example/anim.gif' });
    const b = make();
    const r = await b.svc.mirrorSourceCandidates(art, ['https://cdn.example/anim.gif', 'https://cdn.example/next.jpg'], { fetchOptions: { resolver: pub, transport: t } });
    expect(r).toEqual({ ok: true, url: 'https://cdn.example/next.jpg' });
    expect(sniffConvertibleKind(gif)).toBe('gif');
  });

  it('AVIF without a converter → re-requested with a non-AVIF Accept header', async () => {
    const { svc } = make();
    const avif = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.alloc(20_000, 2)]);
    const log: any[] = [];
    const t = transportFor((_u, h) => (/avif/.test(h.Accept) ? ok(avif, 'image/avif') : ok(bigJpeg)), log);
    const r = await svc.mirrorSourceCandidates(art, ['https://cdn.example/p'], { fetchOptions: { resolver: pub, transport: t } });
    expect(r.ok).toBe(true);
    expect(log[1].headers.Accept).not.toMatch(/avif/);
  });
});
