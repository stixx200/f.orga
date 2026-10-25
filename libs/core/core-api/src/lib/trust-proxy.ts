import type { INestApplication } from '@nestjs/common';

/**
 * Express' `trust proxy` from `FORGA_TRUST_PROXY`: unset or `false` = no proxy (the address of the connection counts);
 * `true` = every proxy; a number = that many proxies in front of f.orga; otherwise addresses or subnets of the proxies,
 * separated by commas (e.g. `loopback`, `10.0.0.0/8`). Only then is `X-Forwarded-For` believed, so rate limits and
 * login locks apply to the real client address instead of the proxy's.
 */
export function trustProxySetting(value = process.env['FORGA_TRUST_PROXY']): boolean | number | string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === 'false') return false;
  if (trimmed === 'true') return true;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function applyTrustProxy(app: INestApplication): void {
  const setting = trustProxySetting();
  if (setting !== false) (app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void }).set('trust proxy', setting);
}
