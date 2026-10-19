import * as http from 'http';
import { AddressInfo } from 'net';
import {
  SafeFetchError, assertFetchableUrlShape, isPrivateAddress, nodeTransport, safeFetchBytes, type RawResponse, type Resolver, type Transport,
} from './safe-fetch.util';

const pub: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const ok = (body = 'x', headers: RawResponse['headers'] = { 'content-type': 'image/jpeg' }): RawResponse => ({ status: 200, headers, body: Buffer.from(body) });

describe('private address detection', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '2002:7f00:1::1', 'not-an-ip',
  ])('%s is private/blocked', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('%s is public', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('url shape allowlist', () => {
  it.each([
    'ftp://example.com/a.jpg', 'file:///etc/passwd', 'gopher://x', 'javascript:alert(1)', 'data:image/png;base64,AAAA',
    'http://localhost/a.jpg', 'http://foo.localhost/a.jpg', 'http://127.0.0.1/a.jpg', 'http://[::1]/a.jpg', 'http://169.254.169.254/latest/meta-data',
    'http://intranet.internal/a.jpg', 'http://printer.local/a.jpg', 'https://user:pass@example.com/a.jpg', 'https://example.com:8443/a.jpg', 'http://example.com:22/a.jpg', 'not a url',
  ])('rejects %s', (u) => expect(() => assertFetchableUrlShape(u)).toThrow(SafeFetchError));
  it('accepts plain http/https on default ports', () => {
    expect(assertFetchableUrlShape('https://cdn.example.com/a.jpg').hostname).toBe('cdn.example.com');
    expect(assertFetchableUrlShape('http://cdn.example.com:80/a.jpg').hostname).toBe('cdn.example.com');
  });
});

describe('safeFetchBytes', () => {
  it('blocks hostnames that resolve to a private address (and mixed public+private answers)', async () => {
    const transport: Transport = jest.fn();
    const priv: Resolver = async () => [{ address: '10.0.0.5', family: 4 }];
    await expect(safeFetchBytes('https://evil.example/a.jpg', { resolver: priv, transport })).rejects.toMatchObject({ code: 'private_address' });
    const mixed: Resolver = async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }];
    await expect(safeFetchBytes('https://evil.example/a.jpg', { resolver: mixed, transport })).rejects.toMatchObject({ code: 'private_address' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('pins the connection to the validated address', async () => {
    const transport = jest.fn<Promise<RawResponse>, Parameters<Transport>>().mockResolvedValue(ok());
    await safeFetchBytes('https://cdn.example.com/a.jpg', { resolver: pub, transport });
    expect(transport.mock.calls[0][0].address).toEqual({ address: '93.184.216.34', family: 4 });
  });
  it('re-validates every redirect hop (redirect to metadata IP is blocked)', async () => {
    const transport: Transport = jest.fn().mockResolvedValue({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, body: Buffer.alloc(0) });
    await expect(safeFetchBytes('https://cdn.example.com/a.jpg', { resolver: pub, transport })).rejects.toMatchObject({ code: 'private_address' });
    const t2: Transport = jest.fn().mockResolvedValue({ status: 302, headers: { location: 'file:///etc/passwd' }, body: Buffer.alloc(0) });
    await expect(safeFetchBytes('https://cdn.example.com/a.jpg', { resolver: pub, transport: t2 })).rejects.toMatchObject({ code: 'bad_protocol' });
  });
  it('follows safe redirects, caps hops, and checks status/size', async () => {
    let n = 0;
    const t: Transport = jest.fn().mockImplementation(async () => (n++ === 0 ? { status: 301, headers: { location: '/b.jpg' }, body: Buffer.alloc(0) } : ok('hello')));
    const r = await safeFetchBytes('https://cdn.example.com/a.jpg', { resolver: pub, transport: t });
    expect(r.body.toString()).toBe('hello');
    expect(r.contentType).toBe('image/jpeg');
    const loop: Transport = jest.fn().mockResolvedValue({ status: 302, headers: { location: '/again' }, body: Buffer.alloc(0) });
    await expect(safeFetchBytes('https://cdn.example.com/a', { resolver: pub, transport: loop })).rejects.toMatchObject({ code: 'too_many_redirects' });
    await expect(safeFetchBytes('https://cdn.example.com/a', { resolver: pub, transport: async () => ({ status: 404, headers: {}, body: Buffer.alloc(0) }) })).rejects.toMatchObject({ code: 'http_status' });
    await expect(safeFetchBytes('https://cdn.example.com/a', { resolver: pub, maxBytes: 3, transport: async () => ok('too long') })).rejects.toMatchObject({ code: 'too_large' });
  });
});

describe('nodeTransport (real sockets, loopback allowed only because the validator is bypassed here)', () => {
  let server: http.Server; let port: number;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/big') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(Buffer.alloc(50_000, 1)); return; }
      res.writeHead(200, { 'content-type': 'image/png' }); res.end('tiny');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const call = (p: string, maxBytes: number, truncate?: boolean) =>
    nodeTransport({ url: new URL(`http://example.test:${port}${p}`), address: { address: '127.0.0.1', family: 4 }, headers: {}, timeoutMs: 3000, maxBytes, truncate });
  it('connects to the pinned address, not whatever the hostname would resolve to', async () => {
    expect((await call('/', 1000)).body.toString()).toBe('tiny');
  });
  it('enforces the byte cap while streaming (and can truncate for HTML scans)', async () => {
    await expect(call('/big', 1000)).rejects.toMatchObject({ code: 'too_large' });
    const t = await call('/big', 1000, true);
    expect(t.body.length).toBe(1000);
  });
});

describe('end-to-end guard: the default pipeline refuses loopback even with a public-looking name', () => {
  it('rejects http://127.0.0.1 and http://localhost before any socket is opened', async () => {
    await expect(safeFetchBytes('http://127.0.0.1:1/a.jpg')).rejects.toBeInstanceOf(SafeFetchError);
    await expect(safeFetchBytes('http://localhost/a.jpg')).rejects.toBeInstanceOf(SafeFetchError);
  });
});
