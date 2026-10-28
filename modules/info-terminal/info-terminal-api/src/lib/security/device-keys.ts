import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DEVICE_KEY_PREFIX } from '@forga/info-terminal-contracts';

/** A new device key: 32 random bytes with the prefix `fit_`. */
export function generateDeviceKey(): string {
  return `${DEVICE_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** Requests are checked against the SHA-256 of the key, like API tokens. */
export function hashDeviceKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Compares two hashes in constant time. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The server key from `FORGA_SECRET_KEY` (32 bytes, Base64), or `null` if it is missing or has the wrong length.
 * Generate it e.g. with `openssl rand -base64 32`.
 */
export function serverKey(value = process.env['FORGA_SECRET_KEY']): Buffer | null {
  if (!value?.trim()) return null;
  const key = Buffer.from(value.trim(), 'base64');
  return key.length === 32 ? key : null;
}

/** Encrypts a device key with AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` (Base64url). */
export function encryptDeviceKey(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

/** Decrypts a stored device key; `null` if it was encrypted with another server key or is damaged. */
export function decryptDeviceKey(stored: string, key: Buffer): string | null {
  const [version, iv, tag, data] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
