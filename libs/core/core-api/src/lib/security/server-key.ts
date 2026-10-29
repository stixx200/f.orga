import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * The server key from `FORGA_SECRET_KEY` (32 bytes, Base64), or `null` if it is missing or has the wrong length.
 * Generate it e.g. with `openssl rand -base64 32`.
 */
export function serverKey(value = process.env['FORGA_SECRET_KEY']): Buffer | null {
  if (!value?.trim()) return null;
  const key = Buffer.from(value.trim(), 'base64');
  return key.length === 32 ? key : null;
}

/** Encrypts a secret with AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>` (Base64url). */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

/** Decrypts a stored secret; `null` if it was encrypted with another server key or is damaged. */
export function decryptSecret(stored: string, key: Buffer): string | null {
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

/** Encrypts a file with AES-256-GCM: version byte `1`, 12 bytes IV, 16 bytes tag, ciphertext. */
export function encryptBytes(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}

/** Decrypts a file from `encryptBytes`; `null` if it was encrypted with another server key or is damaged. */
export function decryptBytes(stored: Buffer, key: Buffer): Buffer | null {
  if (stored.length < 29 || stored[0] !== 1) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, stored.subarray(1, 13));
    decipher.setAuthTag(stored.subarray(13, 29));
    return Buffer.concat([decipher.update(stored.subarray(29)), decipher.final()]);
  } catch {
    return null;
  }
}
