import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 2 ** 15;
const R = 8;
const P = 1;
const LENGTH = 32;
const MAXMEM = 64 * 1024 * 1024;

/** Hash in the format `scrypt$N$r$p$salt$hash` (Base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [method, n, r, p, salt, hash] = stored.split('$');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return timingSafeEqual(expected, actual);
}

/** Random secret for sessions and API tokens. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Sessions and API tokens are stored as SHA-256 only. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
