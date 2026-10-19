/** /story-image/<slug>: serves the picture stored in OUR storage (mirrored source image) and says so in X-Story-Image. */
const serverApiFetch = jest.fn();
jest.mock('@/lib/server-api', () => ({ serverApiFetch: (...a: unknown[]) => serverApiFetch(...a) }));
jest.mock('next/og', () => ({
  ImageResponse: class { async arrayBuffer() { return new Uint8Array(2000).buffer; } },
}));

import { GET } from '@/app/story-image/[slug]/route';

const jpeg = (n = 5000) => new Uint8Array(n).fill(7);
const upstream = (origin: string | null, type = 'image/jpeg', size = 5000) =>
  new Response(jpeg(size), { status: 200, headers: { 'content-type': type, ...(origin ? { 'x-image-origin': origin } : {}) } });

describe('GET /story-image/<slug>', () => {
  beforeEach(() => serverApiFetch.mockReset());

  it('mirrored SOURCE image: serves our bytes with X-Story-Image: source (not fallback), short cache, no publisher info', async () => {
    serverApiFetch.mockResolvedValue(upstream('source'));
    const res = await GET({} as never, { params: { slug: 'metro-line-announced' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-story-image')).toBe('source');
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect((await res.arrayBuffer()).byteLength).toBe(5000);
    expect(serverApiFetch).toHaveBeenCalledWith('/articles/metro-line-announced/image', { cache: 'no-store' });
    expect(JSON.stringify([...res.headers.entries()])).not.toMatch(/dailyplanet|source-mirror|s3|bucket/i);
  });

  it('generated image: X-Story-Image: generated', async () => {
    serverApiFetch.mockResolvedValue(upstream('generated', 'image/png'));
    const res = await GET({} as never, { params: { slug: 's' } });
    expect(res.headers.get('x-story-image')).toBe('generated');
  });

  it('object missing in storage (API 404): falls back to artwork and says fallback', async () => {
    serverApiFetch.mockResolvedValue(new Response('no', { status: 404 }));
    const res = await GET({} as never, { params: { slug: 'missing-object' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-story-image')).toBe('fallback');
  });

  it('tiny / wrong-type upstream bodies are not served as the picture', async () => {
    serverApiFetch.mockResolvedValue(upstream('source', 'image/jpeg', 200));
    expect((await GET({} as never, { params: { slug: 's' } })).headers.get('x-story-image')).toBe('fallback');
    serverApiFetch.mockResolvedValue(upstream('source', 'text/html', 5000));
    expect((await GET({} as never, { params: { slug: 's' } })).headers.get('x-story-image')).toBe('fallback');
  });
});
