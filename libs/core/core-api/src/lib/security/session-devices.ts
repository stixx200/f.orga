import { isIP } from 'node:net';

/**
 * The address a session was opened from, shortened so it names the network rather than the device: IPv4 without the
 * last part (`203.0.113.x`), IPv6 with the first three groups (`2001:db8:85a3:…`). `null` without address.
 */
export function shortAddress(ip: string | null | undefined): string | null {
  const value = (ip ?? '').trim().replace(/^::ffff:/i, '');
  if (isIP(value) === 4) return `${value.split('.').slice(0, 3).join('.')}.x`;
  if (isIP(value) === 6) return `${value.split(':').filter(Boolean).slice(0, 3).join(':')}:…`;
  return null;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/Firefox\/(\d+)|FxiOS\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)|CriOS\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari/, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/**
 * Browser, major version and system from the user agent, e.g. `Firefox 131 · Windows`; other clients (scripts) keep
 * the first 60 characters. `null` without user agent.
 */
export function shortUserAgent(userAgent: string | null | undefined): string | null {
  const agent = (userAgent ?? '').trim();
  if (!agent) return null;
  const browser = BROWSERS.map(([pattern, name]) => {
    const match = pattern.exec(agent);
    const version = match?.slice(1).find(Boolean);
    return match ? `${name}${version ? ` ${version}` : ''}` : null;
  }).find(Boolean);
  const system = SYSTEMS.find(([pattern]) => pattern.test(agent))?.[1];
  if (!browser && !system) return agent.slice(0, 60);
  return [browser, system].filter(Boolean).join(' · ');
}
