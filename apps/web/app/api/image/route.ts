import { NextRequest, NextResponse } from 'next/server';

const MAX_BYTES = 2_000_000;

function isPrivateImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'minio' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/**
 * Normalize proxy target.
 * - Public http → https upgrade (common CDN pattern)
 * - Private MinIO / localhost stay on http so Docker-network fetches work
 */
function normalizeProxyTarget(raw: string): { primary: string; fallback: string | null } | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

    if (u.protocol === 'http:' && !isPrivateImageHost(u.hostname)) {
      const httpsUrl = new URL(u.href);
      httpsUrl.protocol = 'https:';
      return { primary: httpsUrl.href, fallback: u.href };
    }
    return { primary: u.href, fallback: null };
  } catch {
    return null;
  }
}

async function fetchImage(url: string): Promise<Response> {
  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return undefined;
    }
  })();

  return fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; NationReporters/1.0; +https://nationreporters.com)',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      ...(origin ? { Referer: `${origin}/` } : {}),
    },
    signal: AbortSignal.timeout(12_000),
    redirect: 'follow',
  });
}

/** Server-side fetch for publisher images + private MinIO mirrors. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return new NextResponse('Invalid image URL', { status: 400 });
  }

  const target = normalizeProxyTarget(raw);
  if (!target) {
    return new NextResponse('Invalid image URL', { status: 400 });
  }

  try {
    let res = await fetchImage(target.primary);
    if (!res.ok && target.fallback) {
      res = await fetchImage(target.fallback);
    }
    if (!res.ok) return new NextResponse('Image not found', { status: 404 });

    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      return new NextResponse('Not an image', { status: 415 });
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new NextResponse('Image too large', { status: 413 });
    if (buf.byteLength < 32) return new NextResponse('Image too small', { status: 404 });

    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType.startsWith('image/') ? contentType : 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch {
    return new NextResponse('Image fetch failed', { status: 502 });
  }
}
