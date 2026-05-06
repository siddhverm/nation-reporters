const API_BASE_CANDIDATES = [
  process.env.NEXT_PUBLIC_API_URL,
  '/api/proxy',
  '/api/v1',
  'http://localhost:3001/api/v1',
  'http://localhost:3005/api/v1',
].filter((v): v is string => !!v).map((v) => v.replace(/\/$/, ''));

export function getApiCandidates() {
  return API_BASE_CANDIDATES;
}

export async function fetchJsonFromApi<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let lastError: Error | null = null;
  for (const base of API_BASE_CANDIDATES) {
    try {
      const response = await fetch(`${base}${normalizedPath}`, init);
      if (!response.ok) continue;
      return (await response.json()) as T;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error(`All API candidates failed for ${normalizedPath}`);
}
