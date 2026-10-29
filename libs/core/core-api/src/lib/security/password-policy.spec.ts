import { addressAllowed, validAddressEntry } from './addresses.js';
import { passwordProblem } from './password-policy.js';
import { shortAddress, shortUserAgent } from './session-devices.js';

describe('passwordProblem', () => {
  it('refuses frequent passwords, frequent words with digits and trivial runs', () => {
    expect(passwordProblem('1234567890')).toBe('auth.passwordCommon');
    expect(passwordProblem('Qwertzuiop')).toBe('auth.passwordCommon');
    expect(passwordProblem('Feuerwehr112!')).toBe('auth.passwordCommon');
    expect(passwordProblem('Sommer2026')).toBe('auth.passwordCommon');
    expect(passwordProblem('aaaaaaaaaaaa')).toBe('auth.passwordCommon');
    expect(passwordProblem('abcdefghijkl')).toBe('auth.passwordCommon');
  });

  it('refuses the username, name or e-mail address with digits', () => {
    expect(passwordProblem('Kommandant.Ahorn2026', ['kommandant.ahorn'])).toBe('auth.passwordPersonal');
    expect(passwordProblem('Mustermann1990', ['max', 'Max Mustermann', 'max@example.org'])).toBe('auth.passwordPersonal');
  });

  it('accepts other passwords', () => {
    expect(passwordProblem('sehr-geheim-123', ['admin', 'Admin'])).toBeNull();
    expect(passwordProblem('Leiter Kaffee Wolke 7')).toBeNull();
  });
});

describe('addresses of API tokens', () => {
  it('checks addresses and networks', () => {
    expect(validAddressEntry('10.0.0.0/8')).toBe(true);
    expect(validAddressEntry('2001:db8::/32')).toBe(true);
    expect(validAddressEntry('10.0.0.0/40')).toBe(false);
    expect(validAddressEntry('leitstelle')).toBe(false);
    expect(addressAllowed('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(addressAllowed('::ffff:192.0.2.5', ['192.0.2.5'])).toBe(true);
    expect(addressAllowed('192.0.2.6', ['192.0.2.5', '10.0.0.0/8'])).toBe(false);
    expect(addressAllowed(null, ['10.0.0.0/8'])).toBe(false);
  });
});

describe('devices of sessions', () => {
  it('shortens addresses and user agents', () => {
    expect(shortAddress('203.0.113.77')).toBe('203.0.113.x');
    expect(shortAddress('::ffff:203.0.113.77')).toBe('203.0.113.x');
    expect(shortAddress('2001:db8:85a3:0:0:8a2e:370:7334')).toBe('2001:db8:85a3:…');
    expect(shortAddress('')).toBeNull();
    expect(shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox 131 · Windows');
    expect(shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari 17 · iOS');
    expect(shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0')).toBe('Edge 130 · Windows');
    expect(shortUserAgent('curl/8.4.0')).toBe('curl/8.4.0');
    expect(shortUserAgent(undefined)).toBeNull();
  });
});
