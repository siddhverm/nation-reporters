/**
 * SSRF-safe binary fetch for third-party images.
 *  - only http/https on ports 80/443, no credentials in the URL
 *  - every hostname is resolved first; ANY private / loopback / link-local / CGNAT / multicast / reserved address blocks it
 *  - the connection is PINNED to the validated address (no second DNS lookup => no DNS-rebinding window)
 *  - redirects are followed manually (max 3) and each hop is re-validated
 *  - hard byte cap while streaming and an overall timeout
 */
import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';

export class SafeFetchError extends Error {
  /** HTTP status for code 'http_status'. */
  status?: number;
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'SafeFetchError';
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type RawResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer };
/** Low-level transport (injectable for tests). `address` is the pinned, already validated IP. */
export type Transport = (req: {
  url: URL; address: ResolvedAddress; headers: Record<string, string>; timeoutMs: number; maxBytes: number; truncate?: boolean;
}) => Promise<RawResponse>;

export function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||             // IETF protocol assignments / TEST-NET-1 range start
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && p[2] === 100) ||
    (a === 203 && b === 0 && p[2] === 113) ||
    a >= 224                              // multicast + reserved + broadcast
  );
}

export function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0];
  if (v === '::' || v === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16); const lo = parseInt(mappedHex[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (/^(fc|fd)/.test(v)) return true;                 // ULA
  if (/^fe[89ab]/.test(v)) return true;                // link-local
  if (/^ff/.test(v)) return true;                      // multicast
  if (v.startsWith('64:ff9b:')) return true;           // NAT64
  if (v.startsWith('2001:db8')) return true;           // documentation
  if (v.startsWith('2002:')) return true;              // 6to4 (embeds arbitrary v4)
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isPrivateIPv6(ip);
  return true;
}

/** Shape check only (no DNS): http/https, 80/443, no credentials, no obviously internal host names. */
export function assertFetchableUrlShape(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SafeFetchError('invalid_url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SafeFetchError('bad_protocol');
  if (u.username || u.password) throw new SafeFetchError('credentials_in_url');
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443) throw new SafeFetchError('bad_port');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    throw new SafeFetchError('internal_host');
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new SafeFetchError('private_address');
  return u;
}

export const defaultResolver: Resolver = async (hostname) => {
  if (net.isIP(hostname)) return [{ address: hostname, family: net.isIP(hostname) as 4 | 6 }];
  const res = await dns.promises.lookup(hostname, { all: true });
  return res.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
};

export const nodeTransport: Transport = ({ url, address, headers, timeoutMs, maxBytes, truncate }) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers,
        // pin the connection to the address we validated
        // (Node >= 20 may call lookup with {all: true} and then expects an array of results)
        lookup: ((_h: string, o: { all?: boolean } | undefined, cb: (...a: unknown[]) => void) =>
          o && o.all ? cb(null, [{ address: address.address, family: address.family }]) : cb(null, address.address, address.family)) as unknown as net.LookupFunction,
        timeout: timeoutMs,
      } as https.RequestOptions,
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        let settled = false;
        const ok = () => { if (!settled) { settled = true; resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).subarray(0, maxBytes) }); } };
        const fail = (e: Error) => { if (!settled) { settled = true; reject(e); } req.destroy(); };
        res.on('data', (c: Buffer) => {
          if (settled) return;
          total += c.length;
          if (total > maxBytes) {
            if (truncate) { chunks.push(c); ok(); req.destroy(); return; }
            fail(new SafeFetchError('too_large')); return;
          }
          chunks.push(c);
        });
        res.on('end', ok);
        res.on('error', (e) => fail(new SafeFetchError('network_error', e.message)));
        res.on('aborted', () => fail(new SafeFetchError('network_error', 'aborted')));
      },
    );
    req.on('timeout', () => req.destroy(new SafeFetchError('timeout')));
    req.on('error', (e) => reject(e instanceof SafeFetchError ? e : new SafeFetchError('network_error', (e as Error).message)));
    req.end();
  });

export type SafeFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Return the first maxBytes instead of failing when the body is larger (used for HTML <head> scans). */
  truncate?: boolean;
  resolver?: Resolver;
  transport?: Transport;
};

export type SafeFetchResult = { body: Buffer; contentType: string; finalHost: string };

export async function safeFetchBytes(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const resolver = opts.resolver ?? defaultResolver;
  const transport = opts.transport ?? nodeTransport;
  let current = rawUrl;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    const url = assertFetchableUrlShape(current);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addrs: ResolvedAddress[];
    try { addrs = await resolver(host); } catch { throw new SafeFetchError('dns_failed'); }
    if (!addrs.length) throw new SafeFetchError('dns_failed');
    // block if ANY answer is internal (an attacker can mix public + private records)
    if (addrs.some((a) => isPrivateAddress(a.address))) throw new SafeFetchError('private_address');
    const res = await transport({
      url, address: addrs[0], timeoutMs, maxBytes, truncate: opts.truncate,
      headers: { 'User-Agent': 'NationReporters/1.0 (+image-mirror)', Accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1', ...(opts.headers ?? {}) },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.location;
      const next = Array.isArray(loc) ? loc[0] : loc;
      if (!next) throw new SafeFetchError('bad_redirect');
      try { current = new URL(next, url).href; } catch { throw new SafeFetchError('bad_redirect'); }
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      const err = new SafeFetchError('http_status', `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (res.body.length > maxBytes && !opts.truncate) throw new SafeFetchError('too_large');
    const ct = res.headers['content-type'];
    return { body: res.body, contentType: String(Array.isArray(ct) ? ct[0] : ct ?? '').split(';')[0].trim().toLowerCase(), finalHost: host };
  }
  throw new SafeFetchError('too_many_redirects');
}
