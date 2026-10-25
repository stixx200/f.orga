import { createServer, type Server } from 'node:http';
import { createSign, generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let provider: Server;
let issuer = '';
/** What the fake provider puts into the next ID token. */
const next = { nonce: '', sub: 'abc-123', email: 'jonas@example.org' };

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');
function idToken(claims: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'test', typ: 'JWT' }));
  const body = base64url(JSON.stringify(claims));
  const signature = createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKey);
  return `${header}.${body}.${base64url(signature)}`;
}

/** A minimal OpenID provider: discovery, keys and token endpoint. */
function startProvider(): Promise<void> {
  provider = createServer((req, res) => {
    const json = (value: unknown) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(value));
    };
    if (req.url === '/.well-known/openid-configuration') {
      return json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });
    }
    if (req.url === '/jwks') return json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' }] });
    if (req.url === '/token' && req.method === 'POST') {
      const now = Math.floor(Date.now() / 1000);
      return json({
        access_token: 'access',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken({ iss: issuer, sub: next.sub, aud: 'forga', iat: now, exp: now + 300, nonce: next.nonce, email: next.email, email_verified: true }),
      });
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) =>
    provider.listen(0, '127.0.0.1', () => {
      issuer = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}

/** Starts a sign-in and answers it like the provider would; returns the redirect of f.orga. */
async function signIn(options: { state?: string } = {}) {
  const start = await test.http.get('/api/core/oidc/start').expect(302);
  const location = new URL(start.headers['location']);
  expect(location.origin + location.pathname).toBe(`${issuer}/authorize`);
  expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:4200/api/core/oidc/callback');
  next.nonce = location.searchParams.get('nonce') ?? '';
  const pending = (start.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('forga_oidc='))!.split(';')[0];
  const state = options.state ?? location.searchParams.get('state');
  return test.http.get(`/api/core/oidc/callback?code=xyz&state=${state}`).set('Cookie', pending).expect(302);
}

beforeAll(async () => {
  await startProvider();
  test = await startTestApp();
  admin = await setUp(test);
  await test.http.put('/api/core/settings/brigade').set('Cookie', admin).set(UI).send({ name: 'FF Test', publicUrl: 'http://localhost:4200' }).expect(200);
  await test.http.post('/api/core/users').set('Cookie', admin).set(UI).send({ username: 'jonas', displayName: 'Jonas', email: 'Jonas@example.org', password: 'auch-sehr-geheim', roles: [] }).expect(201);
});

afterAll(async () => {
  await test?.app.close();
  provider?.close();
});

describe('OIDC sign-in', () => {
  it('is off until configured', async () => {
    expect((await test.http.get('/api/core/setup').expect(200)).body.oidc).toBeNull();
    expect((await test.http.get('/api/core/oidc/start').expect(302)).headers['location']).toBe('/?oidcError=auth.oidcDisabled');
    await test.http
      .put('/api/core/settings/oidc')
      .set('Cookie', admin)
      .set(UI)
      .send({ enabled: true, issuer, clientId: 'forga', clientSecret: 'geheim', matchBy: 'email' })
      .expect(200);
    const settings = (await test.http.get('/api/core/settings/oidc').set('Cookie', admin).expect(200)).body;
    expect(settings.clientSecret).toBeUndefined();
    expect((await test.http.get('/api/core/setup').expect(200)).body.oidc).toEqual({ label: { de: 'Mit Konto der Gemeinde anmelden', en: 'Sign in with the municipal account' } });
  });

  it('links an existing user by e-mail and opens a session', async () => {
    const callback = await signIn();
    expect(callback.headers['location']).toBe('/');
    const session = (callback.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('forga_session='))!.split(';')[0];
    expect((await test.http.get('/api/core/session').set('Cookie', session).expect(200)).body.user.username).toBe('jonas');
    const users = (await test.http.get('/api/core/users').set('Cookie', admin).expect(200)).body as { username: string; oidcLinked: boolean }[];
    expect(users.find((u) => u.username === 'jonas')?.oidcLinked).toBe(true);

    // Linked: a changed e-mail at the provider still finds the user by the subject.
    next.email = 'other@example.org';
    expect((await signIn()).headers['location']).toBe('/');
  });

  it('refuses unknown accounts and forged states', async () => {
    next.sub = 'unknown-subject';
    next.email = 'nobody@example.org';
    expect((await signIn()).headers['location']).toBe('/?oidcError=auth.oidcUnknownUser');
    expect((await signIn({ state: 'forged' })).headers['location']).toBe('/?oidcError=auth.oidcFailed');
    // Without the pending cookie (e.g. a replayed link) nothing happens.
    expect((await test.http.get('/api/core/oidc/callback?code=xyz&state=abc').expect(302)).headers['location']).toBe('/?oidcError=auth.oidcExpired');
  });

  it('lets administrators remove the link', async () => {
    const users = (await test.http.get('/api/core/users').set('Cookie', admin).expect(200)).body as { id: string; username: string }[];
    const jonas = users.find((u) => u.username === 'jonas')!;
    await test.http.delete(`/api/core/users/${jonas.id}/oidc`).set('Cookie', admin).set(UI).expect(204);
    expect((await test.http.get('/api/core/users').set('Cookie', admin).expect(200)).body.find((u: { id: string }) => u.id === jonas.id).oidcLinked).toBe(false);
  });
});
