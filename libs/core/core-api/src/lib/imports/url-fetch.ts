import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

/** A refused or failed URL import; `code` is an error code of the namespace `imports`. */
export class UrlImportError extends Error {
  constructor(
    readonly code: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

/** Addresses a calendar must not be fetched from unless private addresses are allowed (SSRF protection). */
const forbiddenNetworks = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network, unspecified
  ['10.0.0.0', 8], // private (RFC 1918)
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local
  ['172.16.0.0', 12], // private (RFC 1918)
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private (RFC 1918)
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  forbiddenNetworks.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b:1::', 48], // local-use NAT64
  ['fc00::', 7], // unique local (RFC 4193)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
] as const) {
  forbiddenNetworks.addSubnet(network, prefix, 'ipv6');
}

/**
 * Whether an IP address is loopback, link-local, private, multicast, reserved or unspecified.
 * IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`) count like their IPv4 address.
 */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return forbiddenNetworks.check(address, 'ipv4');
  // The block list also applies the IPv4 rules to IPv4-mapped IPv6 addresses.
  if (family === 6) return forbiddenNetworks.check(address, 'ipv6');
  return true;
}

/**
 * Checks a calendar address: `https://`, `http://`, `webcal://` (→ `http://`) and `webcals://` (→ `https://`).
 * Returns the URL to fetch; `imports.urlInvalid` otherwise.
 */
export function calendarUrl(raw: string): URL {
  const text = raw.trim().replace(/^webcal(s?):\/\//i, (_, s: string) => `http${s ? 's' : ''}://`);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UrlImportError('imports.urlInvalid');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || text.length > 2048) {
    throw new UrlImportError('imports.urlInvalid');
  }
  return url;
}

/**
 * The part of a calendar address that may be shown and logged: scheme and host. Path, query and user info
 * stay out, because calendar addresses often carry a secret token there (e.g. `…/private-<token>/basic.ics`).
 */
export function displayUrl(url: URL | string): string {
  const parsed = typeof url === 'string' ? calendarUrl(url) : url;
  const path = parsed.pathname.length > 1 || parsed.search ? '/…' : '';
  return `${parsed.protocol}//${parsed.host}${path}`;
}

export type ResolveHost = (host: string) => Promise<{ address: string; family: number }[]>;

export interface FetchCalendarOptions {
  /** `true`: also fetch from private and local addresses (`FORGA_IMPORT_URL_ALLOW_PRIVATE=true`). */
  allowPrivate?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Name resolution; replaced in tests. */
  resolve?: ResolveHost;
  /** Address check; replaced in tests. Default: refuse private addresses unless `allowPrivate`. */
  forbidden?: (address: string) => boolean;
}

export interface FetchedCalendar {
  /** iCalendar text. */
  text: string;
  /** The address the calendar was read from in the end (after redirects). */
  url: URL;
}

const defaultResolve: ResolveHost = (host) => lookup(host, { all: true, verbatim: true });

/** Resolves the host and refuses it if any of its addresses is forbidden; returns the address to connect to. */
async function allowedAddress(url: URL, resolve: ResolveHost, forbidden: (address: string) => boolean) {
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const family = isIP(host);
  let addresses: { address: string; family: number }[];
  try {
    addresses = family ? [{ address: host, family }] : await resolve(host);
  } catch {
    throw new UrlImportError('imports.urlUnreachable');
  }
  if (!addresses.length) throw new UrlImportError('imports.urlUnreachable');
  if (addresses.some((a) => forbidden(a.address))) throw new UrlImportError('imports.urlForbidden', { host: url.hostname });
  return { host, address: addresses[0].address };
}

/** One request to the checked address; the connection goes to that address, so DNS cannot change it afterwards. */
function get(url: URL, host: string, address: string, signal: AbortSignal): Promise<IncomingMessage> {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      {
        protocol: url.protocol,
        host: address,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        // Certificate and SNI are checked against the host name, not the address.
        servername: isIP(host) ? undefined : host,
        auth: url.username ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}` : undefined,
        headers: { host: url.host, accept: 'text/calendar, */*;q=0.5', 'user-agent': 'f.orga calendar import' },
        signal,
      },
      resolve,
    );
    req.on('error', reject);
    req.end();
  });
}

/** Reads the body up to `maxBytes`; stops reading beyond and refuses with `imports.urlTooLarge`. */
async function readBody(response: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const length = Number(response.headers['content-length']);
  if (Number.isFinite(length) && length > maxBytes) {
    response.destroy();
    throw new UrlImportError('imports.urlTooLarge');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      response.destroy();
      throw new UrlImportError('imports.urlTooLarge');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches an iCalendar file from an address (server side): checks every address, also after redirects,
 * against private networks, follows at most `maxRedirects` redirects, stops after `timeoutMs` and `maxBytes`,
 * and accepts only content that starts with `BEGIN:VCALENDAR`.
 */
export async function fetchCalendar(raw: string, options: FetchCalendarOptions = {}): Promise<FetchedCalendar> {
  const { timeoutMs = 15_000, maxBytes = 10 * 1024 * 1024, maxRedirects = 3, resolve = defaultResolve } = options;
  const forbidden = options.forbidden ?? (options.allowPrivate ? () => false : isPrivateAddress);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let url = calendarUrl(raw);
  try {
    for (let redirects = 0; ; redirects++) {
      const { host, address } = await allowedAddress(url, resolve, forbidden);
      if (controller.signal.aborted) throw new UrlImportError('imports.urlUnreachable');
      let response: IncomingMessage;
      try {
        response = await get(url, host, address, controller.signal);
      } catch {
        throw new UrlImportError('imports.urlUnreachable');
      }
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects >= maxRedirects) throw new UrlImportError('imports.urlTooManyRedirects');
        let next: URL;
        try {
          next = new URL(response.headers.location, url);
        } catch {
          throw new UrlImportError('imports.urlInvalid');
        }
        url = calendarUrl(next.href);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new UrlImportError('imports.urlHttpStatus', { status });
      }
      let body: Buffer;
      try {
        body = await readBody(response, maxBytes);
      } catch (error) {
        if (error instanceof UrlImportError) throw error;
        throw new UrlImportError('imports.urlUnreachable');
      }
      const text = body.toString('utf8');
      if (!/^﻿?\s*BEGIN:VCALENDAR/i.test(text)) throw new UrlImportError('imports.urlNotCalendar');
      return { text, url };
    }
  } finally {
    clearTimeout(timer);
  }
}
