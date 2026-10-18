/** Server-side (Node) access to the Nest API. Uses the same target list as /api/proxy. */
const DEFAULT_TARGETS =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001/api/v1'
    : 'http://api:3001/api/v1,https://nationreporters.com/api/v1';

export function serverApiTargets(): string[] {
  return (process.env.API_PROXY_TARGETS ?? process.env.API_PROXY_TARGET ?? DEFAULT_TARGETS)
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/** GET from the first API target that answers 2xx; null when none does. */
export async function serverApiFetch(path: string, init?: RequestInit & { next?: { revalidate?: number } }): Promise<Response | null> {
  for (const base of serverApiTargets()) {
    try {
      const res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(Number(process.env.API_PROXY_TIMEOUT_MS ?? 8000)),
      });
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch {
      /* try next target */
    }
  }
  return null;
}

export async function serverApiJson<T>(path: string, revalidate = 300): Promise<T | null> {
  const res = await serverApiFetch(path, { next: { revalidate } });
  if (!res) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
