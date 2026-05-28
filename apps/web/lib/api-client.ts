function uniq(candidates: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    const norm = c.replace(/\/$/, '');
    if (!out.includes(norm)) out.push(norm);
  }
  return out;
}

/** Prefer local API when developing on localhost so feeds match the local database. */
export function getApiCandidates(): string[] {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  const local = ['http://localhost:3001/api/v1', 'http://localhost:3005/api/v1'];
  const proxy = '/api/proxy';
  const fallback = '/api/v1';

  const onLocalHost =
    typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

  if (onLocalHost || process.env.NODE_ENV === 'development') {
    return uniq([configured, ...local, proxy, fallback]);
  }

  // Prefer same-origin proxy (always hits production DB) before direct URL.
  return uniq([proxy, configured, ...local, fallback]);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('Empty API response');
  }
  if (contentType.includes('text/html') || text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
    throw new Error('API returned HTML instead of JSON');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('API response was not valid JSON');
  }
}

export async function fetchJsonFromApi<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let lastError: Error | null = null;
  for (const base of getApiCandidates()) {
    try {
      const response = await fetch(`${base}${normalizedPath}`, init);
      if (!response.ok) continue;
      return await parseJsonResponse<T>(response);
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error(`All API candidates failed for ${normalizedPath}`);
}
