import { NextRequest, NextResponse } from 'next/server';

const TARGETS = (
  process.env.API_PROXY_TARGETS
  ?? process.env.API_PROXY_TARGET
  ?? 'http://187.127.141.249/api/v1,https://nationreporters.com/api/v1'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const REQUEST_TIMEOUT_MS = Number(process.env.API_PROXY_TIMEOUT_MS ?? 8000);
const STALE_TTL_MS = Number(process.env.API_PROXY_STALE_TTL_MS ?? 900000);

type ProxyCacheEntry = {
  status: number;
  headers: Array<[string, string]>;
  body: Uint8Array;
  storedAt: number;
};

const proxyCache: Map<string, ProxyCacheEntry> =
  (globalThis as typeof globalThis & { __NR_PROXY_CACHE__?: Map<string, ProxyCacheEntry> }).__NR_PROXY_CACHE__
  ?? new Map<string, ProxyCacheEntry>();

(globalThis as typeof globalThis & { __NR_PROXY_CACHE__?: Map<string, ProxyCacheEntry> }).__NR_PROXY_CACHE__ = proxyCache;

function getCacheKey(path: string, query: string) {
  return `${path}${query}`;
}

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path?.join('/') ?? '';
  const query = req.nextUrl.search || '';
  const cacheKey = getCacheKey(path, query);

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let lastStatus = 502;
  let lastError = 'Bad gateway';
  for (const base of TARGETS) {
    const targetUrl = `${base.replace(/\/$/, '')}/${path}${query}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body,
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        lastStatus = upstream.status;
        lastError = `Upstream responded ${upstream.status}`;
        continue;
      }

      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete('content-encoding');
      responseHeaders.delete('transfer-encoding');
      responseHeaders.delete('connection');

      const bytes = new Uint8Array(await upstream.arrayBuffer());

      if (method === 'GET') {
        proxyCache.set(cacheKey, {
          status: upstream.status,
          headers: Array.from(responseHeaders.entries()),
          body: bytes,
          storedAt: Date.now(),
        });
      }

      responseHeaders.set('x-proxy-upstream', base);
      responseHeaders.set('x-proxy-cache', 'miss');

      return new NextResponse(bytes, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (error) {
      clearTimeout(timeout);
      lastError = (error as Error).message;
    }
  }

  if (method === 'GET') {
    const cached = proxyCache.get(cacheKey);
    if (cached && Date.now() - cached.storedAt <= STALE_TTL_MS) {
      const staleHeaders = new Headers(cached.headers);
      staleHeaders.set('x-proxy-cache', 'stale');
      staleHeaders.set('x-proxy-stale-age-ms', String(Date.now() - cached.storedAt));
      return new NextResponse(cached.body, {
        status: cached.status,
        headers: staleHeaders,
      });
    }
  }

  return NextResponse.json(
    { message: 'Proxy upstream unavailable', details: lastError },
    { status: lastStatus },
  );
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function PATCH(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}

export async function DELETE(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params);
}
