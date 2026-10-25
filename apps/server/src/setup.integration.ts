import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SETUP_TOKEN, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;

beforeAll(async () => {
  test = await startTestApp();
});

afterAll(() => test?.app.close());

const setup = (username: string, setupToken = SETUP_TOKEN) =>
  test.http.post('/api/core/setup').set(UI).send({ setupToken, brigadeName: 'FF Test', username, displayName: username, email: `${username}@example.org`, password: 'sehr-geheim-123' });

describe('first setup', () => {
  it('needs the setup token, so nobody reaching a fresh installation first becomes administrator', async () => {
    expect((await setup('eindringling', 'geraten').expect(403)).body.code).toBe('setup.invalidToken');
    await test.http.post('/api/core/setup').set(UI).send({ brigadeName: 'FF Test', username: 'ohne', displayName: 'ohne', password: 'sehr-geheim-123' }).expect(400);
    expect((await test.http.get('/api/core/setup').expect(200)).body.required).toBe(true);
  });

  it('creates exactly one administrator even for simultaneous requests', async () => {
    const results = await Promise.all([setup('erster'), setup('zweiter'), setup('dritter')]);
    expect(results.map((r) => r.status).toSorted()).toEqual([201, 409, 409]);
    // The administrator's e-mail address is taken from the setup.
    const cookie = String(results.find((r) => r.status === 201)!.headers['set-cookie']).split(';')[0];
    const session = (await test.http.get('/api/core/session').set('Cookie', cookie).expect(200)).body;
    expect(session.user.email).toBe(`${session.user.username}@example.org`);
  });
});
