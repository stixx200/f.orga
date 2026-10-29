import { base32Decode, base32Encode, generateRecoveryCodes, hashRecoveryCode, hotp, otpauthUri, timeStep, totp, verifyTotp } from './totp.js';

// RFC 6238, Appendix B: the seeds are ASCII "1234567890" repeated to the key length of each algorithm.
const SEED_SHA1 = Buffer.from('12345678901234567890');
const SEED_SHA256 = Buffer.from('12345678901234567890123456789012');
const SEED_SHA512 = Buffer.from('1234567890123456789012345678901234567890123456789012345678901234');

const VECTORS: [number, string, string, string][] = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(VECTORS)('matches the test vectors at %i s', (seconds, sha1, sha256, sha512) => {
    const step = timeStep(seconds * 1000);
    expect(hotp(SEED_SHA1, step, 8, 'sha1')).toBe(sha1);
    expect(hotp(SEED_SHA256, step, 8, 'sha256')).toBe(sha256);
    expect(hotp(SEED_SHA512, step, 8, 'sha512')).toBe(sha512);
  });

  it('computes six-digit codes from a Base32 secret', () => {
    const secret = base32Encode(SEED_SHA1);
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret)).toEqual(SEED_SHA1);
    // Last six digits of the 8-digit vector.
    expect(totp(secret, 59_000)).toBe('287082');
  });

  it('accepts one time step of clock difference and refuses older ones', () => {
    const secret = base32Encode(SEED_SHA1);
    const now = 1_111_111_111_000;
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(timeStep(now));
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).toBe(timeStep(now) - 1);
    expect(verifyTotp(secret, totp(secret, now + 30_000), now)).toBe(timeStep(now) + 1);
    expect(verifyTotp(secret, totp(secret, now - 60_000), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('refuses a code of a time step that was already used (replay)', () => {
    const secret = base32Encode(SEED_SHA1);
    const now = 1_234_567_890_000;
    const code = totp(secret, now);
    const step = verifyTotp(secret, code, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, now, step)).toBeNull();
  });

  it('builds the address for authenticator apps', () => {
    expect(otpauthUri('f.orga FF Musterstadt', 'admin', 'ABC')).toBe(
      'otpauth://totp/f.orga%20FF%20Musterstadt%3Aadmin?secret=ABC&issuer=f.orga+FF+Musterstadt&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('creates ten distinct recovery codes, hashed independent of case and dashes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].toLowerCase().replace('-', ' ')));
  });
});
