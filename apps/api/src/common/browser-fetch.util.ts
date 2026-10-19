/**
 * Browser-like fetching of publisher pages and images, on top of the SSRF-safe fetcher.
 * Many publisher CDNs answer 403/401 to bot user agents or to requests without a Referer (hotlink protection), so we
 * send what a normal Chrome browser sends and retry ONCE with alternate (still normal-browser) headers.
 * Never a crawler / Googlebot user agent.
 */
import { SafeFetchError, safeFetchBytes, type SafeFetchOptions, type SafeFetchResult } from './safe-fetch.util';

export const CHROME_UA_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const CHROME_UA_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export const IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';
/** Accept header without AVIF (used when we cannot decode AVIF ourselves). */
export const IMAGE_ACCEPT_NO_AVIF = 'image/webp,image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5';
export const PAGE_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

/** Statuses worth one retry with different headers (blocked / rate-limited / flaky origin). */
export const RETRYABLE_STATUSES = new Set([401, 403, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const originOf = (u?: string | null): string | null => {
  if (!u) return null;
  try { return `${new URL(u).origin}/`; } catch { return null; }
};

export type BrowserFetchKind = 'image' | 'page';

/** Header sets tried in order: [Chrome/Windows + Referer=page], [Chrome/Mac + no Referer]. */
export function browserHeaderAttempts(kind: BrowserFetchKind, opts: { referer?: string | null; acceptLanguage?: string; accept?: string } = {}): Record<string, string>[] {
  const lang = opts.acceptLanguage || 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7';
  const accept = opts.accept ?? (kind === 'image' ? IMAGE_ACCEPT : PAGE_ACCEPT);
  const common = { Accept: accept, 'Accept-Language': lang, 'Cache-Control': 'no-cache', Pragma: 'no-cache' };
  const secFetch: Record<string, string> = kind === 'image'
    ? { 'Sec-Fetch-Dest': 'image', 'Sec-Fetch-Mode': 'no-cors' }
    : { 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-User': '?1', 'Upgrade-Insecure-Requests': '1' };
  const referer = kind === 'image' ? (opts.referer || null) : null;
  const first: Record<string, string> = {
    'User-Agent': CHROME_UA_WINDOWS, ...common, ...secFetch,
    'Sec-Fetch-Site': referer ? 'cross-site' : 'none',
    'sec-ch-ua': '"Google Chrome";v="141", "Chromium";v="141", "Not?A_Brand";v="24"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
    ...(referer ? { Referer: referer } : {}),
  };
  const second: Record<string, string> = {
    'User-Agent': CHROME_UA_MAC, ...common, ...secFetch, 'Sec-Fetch-Site': 'none',
    'sec-ch-ua': '"Google Chrome";v="141", "Chromium";v="141", "Not?A_Brand";v="24"', 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"macOS"',
  };
  // pages: the second attempt sends the site origin as Referer (some sites block "direct" hits)
  if (kind === 'page' && opts.referer) second.Referer = originOf(opts.referer) ?? opts.referer;
  return [first, second];
}

/** "fetch:http_status:403", "fetch:timeout", … for logs / backfill reports. */
export function fetchFailureReason(e: unknown): string {
  if (e instanceof SafeFetchError) return `fetch:${e.code}${e.code === 'http_status' && e.status ? `:${e.status}` : ''}`;
  return 'fetch:error';
}

export type BrowserFetchOptions = SafeFetchOptions & {
  referer?: string | null;
  acceptLanguage?: string;
  accept?: string;
  /** wait before the retry after 429/5xx (ms); default 800 */
  retryDelayMs?: number;
  /** injectable (tests) */
  fetchImpl?: typeof safeFetchBytes;
};

/**
 * SSRF-safe GET with browser headers; on 401/403/429/5xx, network errors or timeouts retries once with the alternate
 * header set. Redirects are followed (re-validated each hop, max 5). Throws the LAST SafeFetchError.
 */
export async function browserFetch(url: string, kind: BrowserFetchKind, opts: BrowserFetchOptions = {}): Promise<SafeFetchResult> {
  const { referer, acceptLanguage, accept, retryDelayMs, fetchImpl, headers: extraHeaders, ...safe } = opts;
  const doFetch = fetchImpl ?? safeFetchBytes;
  const attempts = browserHeaderAttempts(kind, { referer, acceptLanguage, accept });
  let last: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await doFetch(url, { maxRedirects: 5, ...safe, headers: { ...attempts[i], ...(extraHeaders ?? {}) } });
    } catch (e) {
      last = e;
      const retryable = e instanceof SafeFetchError
        && ((e.code === 'http_status' && RETRYABLE_STATUSES.has(e.status ?? 0)) || e.code === 'timeout' || e.code === 'network_error');
      if (!retryable || i === attempts.length - 1) break;
      const wait = e instanceof SafeFetchError && (e.status === 429 || (e.status ?? 0) >= 500) ? retryDelayMs ?? 800 : 0;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}
