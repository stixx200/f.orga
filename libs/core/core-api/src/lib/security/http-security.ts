import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuthService, SESSION_COOKIE } from './auth.service.js';

/**
 * Content Security Policy of the shell, the module frontends (Module Federation: `remoteEntry.js` and chunks from
 * `/modules/<id>/`, same origin) and the API documentation. Scripts only from the own origin; styles also inline,
 * because Mantine writes its CSS variables into `<style>` elements and components use `style` attributes. Images also
 * as `data:`/`blob:` (logos, QR codes, previews of uploads). No embedding in frames of other sites.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Browser features: camera (scanning codes) and NFC (reading tags) only for f.orga itself, everything else off. The
 * shell is a single page: one document serves every route, so a policy only for `/scan` would also block the camera
 * of the other scanning pages (clothing store, equipment, driving licence, info terminal) after an in-app navigation.
 */
export const PERMISSIONS_POLICY = 'camera=(self), nfc=(self), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()';

/** Two years, as recommended for HSTS; only sent on requests that came over HTTPS. */
const HSTS = 'max-age=63072000; includeSubDomains';

/**
 * Security headers on every response (API, shell, module frontends). HSTS only on HTTPS requests: behind a TLS proxy
 * that needs `FORGA_TRUST_PROXY`, so Express believes `X-Forwarded-Proto`. Responses that set their own, stricter CSP
 * (attachments, brigade assets) overwrite it.
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', HSTS);
  next();
}

/**
 * The API documentation (`/api/docs`, also `openapi.json`) only for signed-in users or API tokens: it lists every
 * endpoint and is of no use to anybody else. Answers `401 auth.required` like the API.
 */
export function protectApiDocs(app: INestApplication, path = '/api/docs'): void {
  const auth = app.get(AuthService);
  app.use(path, (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const user = header?.startsWith('Bearer ') ? auth.userFromApiToken(header.slice(7).trim(), req.ip ?? null) : cookie ? auth.userFromSession(cookie) : Promise.resolve(null);
    user.then(
      (found) => (found ? next() : res.status(401).json({ code: 'auth.required' })),
      (error: unknown) => next(error),
    );
  });
}
