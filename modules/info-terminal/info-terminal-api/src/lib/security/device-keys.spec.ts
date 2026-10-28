import { randomBytes } from 'node:crypto';
import { decryptDeviceKey, encryptDeviceKey, generateDeviceKey, hashDeviceKey, sameHash, serverKey } from './device-keys.js';

describe('device keys', () => {
  it('are random with the prefix fit_ and checked by their SHA-256', () => {
    const key = generateDeviceKey();
    expect(key).toMatch(/^fit_[\w-]{43}$/);
    expect(generateDeviceKey()).not.toBe(key);
    expect(sameHash(hashDeviceKey(key), hashDeviceKey(key))).toBe(true);
    expect(sameHash(hashDeviceKey(key), hashDeviceKey(`${key}x`))).toBe(false);
  });

  it('are stored encrypted with the server key and cannot be read with another one', () => {
    const secret = randomBytes(32);
    const key = generateDeviceKey();
    const stored = encryptDeviceKey(key, secret);
    expect(stored).not.toContain(key);
    expect(decryptDeviceKey(stored, secret)).toBe(key);
    expect(decryptDeviceKey(stored, randomBytes(32))).toBeNull();
    expect(decryptDeviceKey('damaged', secret)).toBeNull();
  });

  it('need a server key of 32 bytes in Base64', () => {
    expect(serverKey(undefined)).toBeNull();
    expect(serverKey('')).toBeNull();
    expect(serverKey(randomBytes(16).toString('base64'))).toBeNull();
    expect(serverKey(randomBytes(32).toString('base64'))?.length).toBe(32);
  });
});
