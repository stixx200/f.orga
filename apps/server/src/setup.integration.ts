import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;

beforeAll(async () => {
  test = await startTestApp();
});

afterAll(() => test?.app.close());

const setup = (username: string) => test.http.post('/api/core/setup').set(UI).send({ brigadeName: 'FF Test', username, displayName: username, password: 'sehr-geheim-123' });

describe('first setup', () => {
  it('creates exactly one administrator even for simultaneous requests', async () => {
    const results = await Promise.all([setup('erster'), setup('zweiter'), setup('dritter')]);
    expect(results.map((r) => r.status).toSorted()).toEqual([201, 409, 409]);
  });
});
