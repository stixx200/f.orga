import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ACCESS_KEY_PREFIX } from '@forga/personal-contracts';

/** A new access key: 32 random bytes with the prefix `fpa_`. */
export function generateAccessKey(): string {
  return `${ACCESS_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** Compares two hashes in constant time. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
