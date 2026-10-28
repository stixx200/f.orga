import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { calendarUrl, displayUrl, fetchCalendar, isPrivateAddress, UrlImportError } from './url-fetch.js';

const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:EvD\r\nDTSTART;VALUE=DATE:20261019\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

/** Error code of a rejected promise. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UrlImportError) return error.code;
    throw error;
  }
  return 'none';
}

/** Name resolution that answers with the given addresses. */
const resolvesTo = (addresses: string[]) => async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.178.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '100.64.0.1', '255.255.255.255'])(
    'refuses the IPv4 address %s',
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );

  it.each(['::1', '::', 'fe80::1', 'fd12:3456::1', 'fc00::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:c0a8:101'])(
    'refuses the IPv6 address %s',
    (address) => expect(isPrivateAddress(address)).toBe(true),
  );

  it.each(['8.8.8.8', '172.32.0.1', '192.169.0.1', '2a00:1450:4001:80b::200e', '::ffff:8.8.8.8'])('allows the public address %s', (address) =>
    expect(isPrivateAddress(address)).toBe(false),
  );

  it('refuses what is no address', () => expect(isPrivateAddress('example.org')).toBe(true));
});

describe('calendarUrl', () => {
  it('maps webcal:// to http:// and webcals:// to https://', () => {
    expect(calendarUrl('webcal://calendar.example.org/evd.ics').href).toBe('http://calendar.example.org/evd.ics');
    expect(calendarUrl(' WEBCALS://calendar.example.org/evd.ics ').href).toBe('https://calendar.example.org/evd.ics');
    expect(calendarUrl('https://calendar.example.org/evd.ics').protocol).toBe('https:');
  });

  it.each(['ftp://example.org/evd.ics', 'file:///etc/passwd', 'javascript:alert(1)', 'example.org/evd.ics', '', `https://example.org/${'a'.repeat(2050)}`])(
    'refuses %s',
    (url) => expect(() => calendarUrl(url)).toThrow(new UrlImportError('imports.urlInvalid')),
  );
});

describe('displayUrl', () => {
  it('shows only scheme and host, never user info, path tokens or query', () => {
    expect(displayUrl('https://user:secret@calendar.google.com/calendar/ical/x/private-abc/basic.ics?token=1')).toBe('https://calendar.google.com/…');
    expect(displayUrl('webcal://calendar.example.org:8443')).toBe('http://calendar.example.org:8443');
  });
});

describe('fetchCalendar', () => {
  let server: Server;
  let base: string;
  const routes: Record<string, (send: (status: number, body: string, headers?: Record<string, string>) => void) => void> = {
    '/evd.ics': (send) => send(200, ICS, { 'content-type': 'text/calendar' }),
    '/page': (send) => send(200, '<html>no calendar</html>'),
    '/missing': (send) => send(404, 'not found'),
    '/redirect': (send) => send(302, '', { location: '/evd.ics' }),
    '/redirect-private': (send) => send(302, '', { location: `http://127.0.0.2:${new URL(base).port}/evd.ics` }),
    '/loop': (send) => send(302, '', { location: '/loop' }),
    '/large': (send) => send(200, `BEGIN:VCALENDAR\r\n${'X'.repeat(4096)}`),
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/stream') {
        // No Content-Length: the limit applies while reading.
        res.writeHead(200, { 'content-type': 'text/calendar' });
        res.write('BEGIN:VCALENDAR\r\n');
        for (let i = 0; i < 64; i++) res.write('X'.repeat(1024));
        res.end();
        return;
      }
      const route = routes[req.url ?? ''] ?? ((send) => send(404, ''));
      route((status, body, headers = {}) => {
        res.writeHead(status, headers);
        res.end(body);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // The test server listens on loopback: allow only that address, so forbidden addresses can still be tested.
  const onlyLocal = { forbidden: (address: string) => address !== '127.0.0.1' };

  it('loads an iCalendar file, also via webcal://', async () => {
    expect((await fetchCalendar(`${base}/evd.ics`, onlyLocal)).text).toBe(ICS);
    expect((await fetchCalendar(`${base.replace('http', 'webcal')}/evd.ics`, onlyLocal)).text).toBe(ICS);
  });

  it('refuses loopback and private addresses unless allowed', async () => {
    expect(await codeOf(fetchCalendar(`${base}/evd.ics`))).toBe('imports.urlForbidden');
    expect(await codeOf(fetchCalendar('http://[::1]/evd.ics'))).toBe('imports.urlForbidden');
    expect(await codeOf(fetchCalendar('http://169.254.169.254/latest/meta-data'))).toBe('imports.urlForbidden');
    expect((await fetchCalendar(`${base}/evd.ics`, { allowPrivate: true })).text).toBe(ICS);
  });

  it('refuses host names that resolve to a private address', async () => {
    expect(await codeOf(fetchCalendar('https://calendar.example.org/evd.ics', { resolve: resolvesTo(['192.168.178.20']) }))).toBe('imports.urlForbidden');
    expect(await codeOf(fetchCalendar('https://calendar.example.org/evd.ics', { resolve: resolvesTo(['8.8.8.8', 'fd00::1']) }))).toBe('imports.urlForbidden');
  });

  it('follows redirects, checks every target and stops after three', async () => {
    expect((await fetchCalendar(`${base}/redirect`, onlyLocal)).url.pathname).toBe('/evd.ics');
    expect(await codeOf(fetchCalendar(`${base}/redirect-private`, onlyLocal))).toBe('imports.urlForbidden');
    expect(await codeOf(fetchCalendar(`${base}/loop`, onlyLocal))).toBe('imports.urlTooManyRedirects');
  });

  it('refuses other content, errors and files above the size limit', async () => {
    expect(await codeOf(fetchCalendar(`${base}/page`, onlyLocal))).toBe('imports.urlNotCalendar');
    await expect(fetchCalendar(`${base}/missing`, onlyLocal)).rejects.toMatchObject({ code: 'imports.urlHttpStatus', params: { status: 404 } });
    expect(await codeOf(fetchCalendar(`${base}/large`, { ...onlyLocal, maxBytes: 1024 }))).toBe('imports.urlTooLarge');
    expect(await codeOf(fetchCalendar(`${base}/stream`, { ...onlyLocal, maxBytes: 8 * 1024 }))).toBe('imports.urlTooLarge');
    expect(await codeOf(fetchCalendar('http://calendar.invalid/evd.ics', { resolve: resolvesTo([]) }))).toBe('imports.urlUnreachable');
  });
});
