import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { serverApiFetch } from '@/lib/server-api';
import { fallbackArtSpec } from '@/lib/story-art';

export const dynamic = 'force-dynamic';

const SLUG_RE = /^[\p{L}\p{N}\p{M}_-]{1,200}$/u;

/**
 * Story image for a slug.
 *  1. the picture stored by the API in OUR storage: a mirrored source image (IMAGE_MODE=source_first, validated and
 *     metadata-stripped by the API) or an AI-generated one — never a hotlinked/proxied publisher URL,
 *  2. otherwise deterministic generated fallback artwork (PNG, no text, seeded by the slug), so every story
 *     — and every og:image — resolves to an image even without an image-generation key.
 * The fallback is cached only briefly so a real generated image replaces it as soon as it exists.
 */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  let slug = params.slug;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  if (!SLUG_RE.test(slug)) return new NextResponse('Not found', { status: 404 });

  // no-store: never let Next's data cache pin an old picture (a takedown must take effect immediately).
  const upstream = await serverApiFetch(`/articles/${encodeURIComponent(slug)}/image`, { cache: 'no-store' });
  if (upstream) {
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (/^image\/(png|jpeg|webp)$/.test(type)) {
      const buf = await upstream.arrayBuffer();
      if (buf.byteLength > 1000) {
        const origin = upstream.headers.get('x-image-origin') === 'source' ? 'source' : 'generated';
        return new NextResponse(buf, {
          headers: {
            'Content-Type': type,
            // Source pictures are cached briefly so a takedown (replace-with-generated) takes effect quickly.
            'Cache-Control': origin === 'source'
              ? 'public, max-age=3600'
              : 'public, max-age=86400, stale-while-revalidate=604800',
            'X-Content-Type-Options': 'nosniff',
            'X-Story-Image': origin,
          },
        });
      }
    }
  }

  const art = fallbackArtSpec(slug);
  const rendered = new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden',
          background: `linear-gradient(135deg, ${art.bg[0]} 0%, ${art.bg[1]} 100%)`,
        }}
      >
        {art.shapes.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute', left: s.x, top: s.y, width: s.size, height: s.size * s.ratio,
              borderRadius: s.round ? 9999 : 24, background: s.color, opacity: s.opacity,
              transform: `rotate(${s.rotate}deg)`,
            }}
          />
        ))}
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 10, background: '#e63946', display: 'flex' }} />
      </div>
    ),
    { width: 1200, height: 630 },
  );
  // ImageResponse defaults to "immutable, max-age=1y"; re-wrap so the fallback is cached only briefly and a
  // generated image can replace it once available.
  const png = await rendered.arrayBuffer();
  return new NextResponse(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Story-Image': 'fallback',
    },
  });
}
