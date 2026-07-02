import { NextRequest, NextResponse } from 'next/server';

const MAX_BYTES = 2_000_000;

/** Server-side fetch for publisher images blocked by hotlink protection in the browser. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw || !/^https:\/\//i.test(raw)) {
    return new NextResponse('Invalid image URL', { status: 400 });
  }

  try {
    const res = await fetch(raw, {
      headers: { 'User-Agent': 'NationReporters/1.0', Accept: 'image/*,*/*' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return new NextResponse('Image not found', { status: 404 });

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new NextResponse('Image too large', { status: 413 });

    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch {
    return new NextResponse('Image fetch failed', { status: 502 });
  }
}
