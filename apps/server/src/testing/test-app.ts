import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import request from 'supertest';
import { EntityManager } from '@mikro-orm/core';
import { hashSecret, Session } from '@forga/core-api';
import { resetTestDatabase, TEST_DATABASE_URL } from './test-database';

/** Header that marks requests from the UI (CSRF protection). */
export const UI = { 'x-forga': '1' };
export const ADMIN = { username: 'admin', password: 'sehr-geheim-123' };
/** Setup token of the test server (`FORGA_SETUP_TOKEN`). */
export const SETUP_TOKEN = 'test-setup-token';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  /**
   * Logs in and returns the session cookie. The session counts as confirmed with the second factor (step-up), as tests
   * of other features do not go through it; `{ elevated: false }` for a session as after a real login.
   */
  login(credentials?: { username: string; password: string }, options?: { elevated?: boolean }): Promise<string>;
  /** Marks a session as confirmed with the second factor (test shortcut instead of entering a code). */
  elevate(cookie: string): Promise<void>;
}

/** Test shortcut: confirms the session of a cookie for an hour without a code. */
async function elevateSession(app: INestApplication, cookie: string): Promise<void> {
  const token = decodeURIComponent(cookie.replace(/^forga_session=/, ''));
  await app.get(EntityManager).fork().nativeUpdate(Session, { id: hashSecret(token) }, { elevatedUntil: new Date(Date.now() + 60 * 60_000) });
}

/**
 * Starts the full server against an empty test database; `register` options e.g. add plugin modules. With
 * `keepDatabase` it starts like after a restart: the data stays, pending migrations run as in `main.ts`.
 */
export async function startTestApp(options: Parameters<typeof import('../app/app.module.js').AppModule.register>[0] = {}, start: { keepDatabase?: boolean } = {}): Promise<TestApp> {
  if (!start.keepDatabase) await resetTestDatabase();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  // Collect e-mails in memory and send digests only when a test asks for it.
  process.env.FORGA_MAIL_TRANSPORT = 'memory';
  process.env.FORGA_DIGEST_SCHEDULER = 'off';
  process.env.FORGA_RETENTION_SCHEDULER = 'off';
  process.env.FORGA_STATUS_SCHEDULER = 'off';
  process.env.FORGA_SETUP_TOKEN = SETUP_TOKEN;
  // Imported after DATABASE_URL is set: the ORM configuration is read when the module is evaluated.
  const { AppModule } = await import('../app/app.module.js');
  const { configureHttp } = await import('../app/http.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(options)] }).compile();
  const app = moduleRef.createNestApplication();
  configureHttp(app, options.plugins?.states ?? []);
  if (start.keepDatabase) await app.get(MikroORM).migrator.up();
  await app.init();
  const http = request(app.getHttpServer());
  return {
    app,
    http,
    async login(credentials = ADMIN, loginOptions = {}) {
      const response = await http.post('/api/core/login').send(credentials).expect(200);
      const cookie = String(response.headers['set-cookie']).split(';')[0];
      if (loginOptions.elevated !== false) await elevateSession(app, cookie);
      return cookie;
    },
    elevate: (cookie) => elevateSession(app, cookie),
  };
}

/** Runs the initial setup with the default administrator and returns the session cookie. */
export async function setUp(test: TestApp): Promise<string> {
  const response = await test.http
    .post('/api/core/setup')
    .send({ setupToken: SETUP_TOKEN, brigadeName: 'Feuerwehr Musterstadt', displayName: 'Admin', ...ADMIN })
    .expect(201);
  const cookie = String(response.headers['set-cookie']).split(';')[0];
  await test.elevate(cookie);
  return cookie;
}
