import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import {
  Attachments,
  RateLimitEntity,
  RetentionRegistry,
  Session,
  SettingsService,
  User,
} from '@forga/core-api';
import { MpFeuerRunDatasetEntity, MpFeuerRunEntity } from '@forga/mp-feuer-api';
import {
  ADMIN,
  setUp,
  startTestApp,
  type TestApp,
  UI,
} from './testing/test-app';

/**
 * Phase 5 of the data protection concept (hardening): sessions (L16), encrypted credentials (L17), locked accounts (L21),
 * API tokens (L23), passwords and rate limits (L24), processors and DPIA (L25, L26), attachments (L27), MP-Feuer (L28)
 * and the findings of the review (login CSRF, roles, offense, feed token, run IDs).
 */
let test: TestApp;
let admin: string;
let member: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) =>
  test.http
    .post(`/api${path}`)
    .set('Cookie', cookie)
    .set(UI)
    .send(body as object);
const put = (path: string, body: unknown, cookie = admin) =>
  test.http
    .put(`/api${path}`)
    .set('Cookie', cookie)
    .set(UI)
    .send(body as object);
const get = (path: string, cookie = admin) =>
  test.http.get(`/api${path}`).set('Cookie', cookie);
const del = (path: string, cookie = admin) =>
  test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const em = () => test.app.get(EntityManager).fork();
const from = (address: string) => ({ 'X-Forwarded-For': address });
const sessionOf = async (cookie: string) => {
  const { hashSecret } = await import('@forga/core-api');
  return em().findOneOrFail(Session, {
    id: hashSecret(decodeURIComponent(cookie.replace(/^forga_session=/, ''))),
  });
};
const idleFor = async (cookie: string, minutes: number) => {
  const session = await sessionOf(cookie);
  await em().nativeUpdate(
    Session,
    { id: session.id },
    { lastActivityAt: new Date(Date.now() - minutes * 60_000) },
  );
};
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  process.env['FORGA_TRUST_PROXY'] = 'loopback';
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  test = await startTestApp();
  admin = await setUp(test);
  ids.department = (
    await post('/masterdata/departments', {
      name: 'Abteilung Musterstadt',
      shortName: 'Musterstadt',
      type: 'operational',
    }).expect(201)
  ).body.id;
  const roles = (await get('/core/roles').expect(200)).body as {
    id: string;
    templateKey: string | null;
  }[];
  ids.memberRole = roles.find((r) => r.templateKey === 'member')!.id;
  await post('/core/users', {
    username: 'mitglied',
    displayName: 'Mitglied Test',
    password: 'auch-sehr-geheim',
    roles: [{ roleId: ids.memberRole, departmentId: ids.department }],
  }).expect(201);
  member = await test.login(
    { username: 'mitglied', password: 'auch-sehr-geheim' },
    { elevated: false },
  );
});

afterAll(async () => {
  await test?.app.close();
  delete process.env['FORGA_TRUST_PROXY'];
});

describe('sign-in (L24, review)', () => {
  it('refuses a login and the setup without the header of the UI (login CSRF)', async () => {
    expect(
      (await test.http.post('/api/core/login').send(ADMIN).expect(403)).body
        .code,
    ).toBe('auth.csrf');
    expect(
      (
        await test.http
          .post('/api/core/password-reset')
          .send({ login: 'admin' })
          .expect(403)
      ).body.code,
    ).toBe('auth.csrf');
    await test.http.post('/api/core/login').set(UI).send(ADMIN).expect(200);
  });

  it('counts failed logins in the database, only as hashes, and answers unknown usernames like wrong passwords', async () => {
    for (let i = 0; i < 5; i++)
      await test.http
        .post('/api/core/login')
        .set(UI)
        .set(from('198.51.100.9'))
        .send({ username: 'gibt-es-nicht', password: 'falsch-falsch' })
        .expect(401);
    expect(
      (
        await test.http
          .post('/api/core/login')
          .set(UI)
          .set(from('198.51.100.9'))
          .send({ username: 'gibt-es-nicht', password: 'x' })
          .expect(429)
      ).body.code,
    ).toBe('auth.locked');
    const counters = await em().find(RateLimitEntity, { scope: 'login' });
    expect(counters.length).toBeGreaterThan(0);
    expect(JSON.stringify(counters)).not.toContain('gibt-es-nicht');
    expect(JSON.stringify(counters)).not.toContain('198.51.100.9');
    // The lock is per address: from elsewhere the owner signs in.
    await test.http
      .post('/api/core/login')
      .set(UI)
      .set(from('198.51.100.10'))
      .send(ADMIN)
      .expect(200);
  });

  it('refuses frequent and personal passwords', async () => {
    expect(
      (
        await put('/core/password', {
          current: ADMIN.password,
          new: 'Feuerwehr112!',
        }).expect(400)
      ).body.code,
    ).toBe('auth.passwordCommon');
    expect(
      (
        await post('/core/users', {
          username: 'kasse.muster',
          displayName: 'Kasse Muster',
          password: 'Kasse.Muster2026',
        }).expect(400)
      ).body.code,
    ).toBe('auth.passwordPersonal');
    expect(
      (
        await post('/core/users', {
          username: 'kasse',
          displayName: 'Kasse',
          password: '1234567890',
        }).expect(400)
      ).body.code,
    ).toBe('auth.passwordCommon');
  });

  it('shows the roles with their permissions only to those who manage roles or users', async () => {
    await get('/core/roles', member).expect(403);
    await get('/core/roles').expect(200);
  });
});

describe('sessions (L16)', () => {
  it('lists the own devices with browser and shortened address and signs out others', async () => {
    const agent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
    const response = await test.http
      .post('/api/core/login')
      .set(UI)
      .set('User-Agent', agent)
      .set(from('203.0.113.77'))
      .send({ username: 'mitglied', password: 'auch-sehr-geheim' })
      .expect(200);
    const other = String(response.headers['set-cookie']).split(';')[0];
    const sessions = (await get('/core/me/sessions', member).expect(200))
      .body as {
      id: string;
      browser: string;
      address: string;
      current: boolean;
    }[];
    const device = sessions.find((s) => s.browser === 'Firefox 131 · Windows')!;
    expect(device).toMatchObject({ address: '203.0.113.x', current: false });
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(
      (
        await del(
          `/core/me/sessions/${sessions.find((s) => s.current)!.id}`,
          member,
        ).expect(400)
      ).body.code,
    ).toBe('auth.sessionCurrent');
    await del(`/core/me/sessions/${device.id}`, member).expect(204);
    await get('/core/session', other).expect(401);

    const third = await test.login(
      { username: 'mitglied', password: 'auch-sehr-geheim' },
      { elevated: false },
    );
    expect(
      (await post('/core/me/sessions/end-others', {}, member).expect(200)).body
        .ended,
    ).toBeGreaterThanOrEqual(1);
    await get('/core/session', third).expect(401);
    await get('/core/session', member).expect(200);
    // Another user's session cannot be ended.
    const own = (await get('/core/me/sessions').expect(200)).body as {
      id: string;
    }[];
    await del(`/core/me/sessions/${own[0].id}`, member).expect(404);
  });

  it('ends sessions after the idle time: shorter for privileged accounts, input of the browser counts, not polling', async () => {
    const privileged = await test.login(ADMIN);
    await idleFor(privileged, 61);
    await get('/core/session', privileged).expect(401);
    const audit = (
      await get('/core/audit?action=auth.session-idle-ended').expect(200)
    ).body as unknown[];
    expect(audit.length).toBeGreaterThan(0);

    const user = await test.login(
      { username: 'mitglied', password: 'auch-sehr-geheim' },
      { elevated: false },
    );
    await idleFor(user, 61);
    expect((await get('/core/session', user).expect(200)).body.current).toEqual(
      { persistent: false, idleMinutes: 480 },
    );
    // A request that only polls (last input 2 hours ago) does not renew the activity.
    await idleFor(user, 300);
    await get('/core/session', user)
      .set('x-forga-idle', String(6 * 3600))
      .expect(200);
    expect(
      Date.now() - (await sessionOf(user)).lastActivityAt.getTime(),
    ).toBeGreaterThan(290 * 60_000);
    await get('/core/session', user).set('x-forga-idle', '0').expect(200);
    expect(
      Date.now() - (await sessionOf(user)).lastActivityAt.getTime(),
    ).toBeLessThan(60_000);
    await idleFor(user, 481);
    await get('/core/session', user).expect(401);
  });

  it('keeps „Angemeldet bleiben“ only for accounts without privileged permissions, and follows the settings', async () => {
    const remembered = await test.http
      .post('/api/core/login')
      .set(UI)
      .send({
        username: 'mitglied',
        password: 'auch-sehr-geheim',
        remember: true,
      })
      .expect(200);
    expect(remembered.body.persistent).toBe(true);
    expect(String(remembered.headers['set-cookie'])).toMatch(/Max-Age=1209600/);
    const cookie = String(remembered.headers['set-cookie']).split(';')[0];
    await idleFor(cookie, 24 * 60);
    expect(
      (await get('/core/session', cookie).expect(200)).body.current,
    ).toEqual({ persistent: true, idleMinutes: null });

    const adminLogin = await test.http
      .post('/api/core/login')
      .set(UI)
      .send({ ...ADMIN, remember: true })
      .expect(200);
    expect(adminLogin.body.persistent).toBe(false);
    expect(String(adminLogin.headers['set-cookie'])).not.toMatch(/Max-Age/);

    const security = (await get('/core/settings/security').expect(200)).body;
    await put('/core/settings/security', {
      ...security,
      allowRemember: false,
      idleMinutesOther: 30,
    }).expect(200);
    expect((await get('/core/setup').expect(200)).body.rememberAllowed).toBe(
      false,
    );
    // A remembered session falls under the idle time once „Angemeldet bleiben“ is switched off.
    await idleFor(cookie, 31);
    await get('/core/session', cookie).expect(401);
    const user = await test.login(
      { username: 'mitglied', password: 'auch-sehr-geheim' },
      { elevated: false },
    );
    await idleFor(user, 31);
    await get('/core/session', user).expect(401);
    await put('/core/settings/security', {
      ...security,
      allowRemember: true,
      idleMinutesOther: 480,
    }).expect(200);
    member = await test.login(
      { username: 'mitglied', password: 'auch-sehr-geheim' },
      { elevated: false },
    );
  });
});

describe('credentials in the settings (L17, review)', () => {
  it('stores the SMTP password and the OIDC client secret encrypted and uses them in plain text', async () => {
    await put('/core/settings/smtp', {
      host: 'mail.example.org',
      port: 587,
      starttls: true,
      username: 'forga',
      password: 'smtp-geheim-1',
      sender: 'forga@example.org',
    }).expect(200);
    await put('/core/settings/oidc', {
      enabled: false,
      issuer: 'https://login.example.org',
      clientId: 'forga',
      clientSecret: 'client-geheim-1',
    }).expect(200);
    const rows: { section: string; value: Record<string, string> }[] =
      await em()
        .getConnection()
        .execute(
          `select section, value from core.setting where section in ('smtp', 'oidc')`,
        );
    expect(JSON.stringify(rows)).not.toContain('geheim');
    expect(rows.find((r) => r.section === 'smtp')!.value.password).toMatch(
      /^enc:v1\./,
    );
    const settings = test.app.get(SettingsService);
    expect((await settings.get<{ password: string }>('smtp'))!.password).toBe(
      'smtp-geheim-1',
    );
    expect(
      (await settings.get<{ clientSecret: string }>('oidc'))!.clientSecret,
    ).toBe('client-geheim-1');
    // Never in an answer or the history.
    expect(
      JSON.stringify((await get('/core/settings/smtp').expect(200)).body),
    ).not.toContain('geheim');
    // Saving without a new password keeps the stored one.
    await put('/core/settings/smtp', {
      host: 'mail2.example.org',
      port: 587,
      starttls: true,
      username: 'forga',
      sender: 'forga@example.org',
    }).expect(200);
    expect((await settings.get<{ password: string }>('smtp'))!.password).toBe(
      'smtp-geheim-1',
    );
  });

  it('encrypts credentials stored in plain text at the start', async () => {
    await em()
      .getConnection()
      .execute(
        `update core.setting set value = jsonb_set(value, '{password}', '"alt-im-klartext"') where section = 'smtp'`,
      );
    const settings = test.app.get(SettingsService);
    expect(await settings.secretState('smtp', 'password')).toBe('plain');
    await settings.onApplicationBootstrap();
    expect(await settings.secretState('smtp', 'password')).toBe('encrypted');
    expect((await settings.get<{ password: string }>('smtp'))!.password).toBe(
      'alt-im-klartext',
    );
  });
});

describe('API tokens (L23)', () => {
  it('requires recipient, purpose and an expiry of at most two years', async () => {
    const base = {
      name: 'Leitstelle',
      recipient: 'Integrierte Leitstelle Musterkreis',
      purpose: 'Einsätze anlegen',
      scopes: ['incidents.api.create'],
    };
    expect(
      (
        await post('/core/tokens', {
          name: 'x',
          scopes: ['incidents.api.create'],
        }).expect(400)
      ).body.code,
    ).toBe('validation.failed');
    expect(
      (await post('/core/tokens', { ...base, expiresOn: day(800) }).expect(400))
        .body.code,
    ).toBe('tokens.expiryTooLate');
    expect(
      (await post('/core/tokens', { ...base, expiresOn: day(-1) }).expect(400))
        .body.code,
    ).toBe('tokens.expiryInPast');
    expect(
      (
        await post('/core/tokens', {
          ...base,
          expiresOn: day(30),
          allowedAddresses: ['10.0.0.0/40'],
        }).expect(400)
      ).body.code,
    ).toBe('tokens.addressInvalid');
    const created = await post('/core/tokens', {
      ...base,
      expiresOn: day(10),
      allowedAddresses: ['192.0.2.0/24'],
    }).expect(201);
    expect(created.body).toMatchObject({
      recipient: base.recipient,
      purpose: base.purpose,
      allowedAddresses: ['192.0.2.0/24'],
    });
    ids.token = created.body.token;
    ids.tokenId = created.body.id;
  });

  it('accepts the token only from its allowed addresses', async () => {
    await test.http
      .get('/api/core/session')
      .set('Authorization', `Bearer ${ids.token}`)
      .set(from('198.51.100.1'))
      .expect(401);
    await test.http
      .get('/api/incidents/keywords')
      .set('Authorization', `Bearer ${ids.token}`)
      .set(from('192.0.2.17'))
      .expect((res) => expect(res.status).not.toBe(401));
    const audit = (
      await get('/core/audit?action=tokens.address-rejected').expect(200)
    ).body as unknown[];
    expect(audit).toHaveLength(1);
  });

  it('names recipient and purpose in the register and reminds of the expiry', async () => {
    const register = (await get('/core/privacy/register').expect(200)).body as {
      activities: {
        key: string;
        recipients: { id: string; name: { de: string }; note: string }[];
      }[];
    };
    const recipient = register.activities
      .flatMap((a) => a.recipients)
      .find((r) => r.id === `token:${ids.tokenId}`)!;
    expect(recipient.name.de).toBe(
      'Schnittstelle „Leitstelle“ – Integrierte Leitstelle Musterkreis',
    );
    expect(recipient.note).toBe('Einsätze anlegen');
    const tasks = (await get('/core/tasks').expect(200)).body as {
      kind: string;
      title: { de: string };
    }[];
    expect(
      tasks.find((t) => t.kind === 'api-token-expiry')?.title.de,
    ).toContain('Leitstelle');
  });
});

describe('register: processors and impact assessment (L25, L26)', () => {
  it('lists hosting, e-mail server and sign-in service and exports the information for an impact assessment', async () => {
    await put('/core/settings/brigade', {
      name: 'Feuerwehr Musterstadt',
      publicUrl: 'https://forga.example.org',
    }).expect(200);
    const register = (await get('/core/privacy/register').expect(200)).body as {
      processors: { id: string; name: { de: string } }[];
      measures: { key: string; value: { de: string } }[];
    };
    expect(register.processors.map((p) => p.id)).toEqual(
      expect.arrayContaining(['processor:hosting', 'processor:smtp']),
    );
    expect(
      register.processors.find((p) => p.id === 'processor:hosting')!.name.de,
    ).toContain('forga.example.org');
    expect(
      register.measures.find((m) => m.key === 'core.sessions')!.value.de,
    ).toContain('60 Minuten');
    expect(
      register.measures.find((m) => m.key === 'core.encryption')!.value.de,
    ).toContain('Zugangsdaten');
    const pdf = await get(
      '/core/privacy/register/export/pdf?scope=dpia&language=de',
    ).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain(
      'folgenabschaetzung-angaben',
    );
    const xlsx = await get(
      '/core/privacy/register/export/xlsx?scope=dpia&language=en',
    ).expect(200);
    expect(xlsx.headers['content-disposition']).toContain('dpia-information');
  });
});

describe('locked accounts without person (L21)', () => {
  it('records the lock and anonymises the account after the period', async () => {
    const created = await post('/core/users', {
      username: 'kaemmerei',
      displayName: 'Kämmerei Muster',
      email: 'kasse@example.org',
      password: 'auch-sehr-geheim',
    }).expect(201);
    const user = created.body as { id: string; version: number };
    const locked = await put(`/core/users/${user.id}`, {
      username: 'kaemmerei',
      displayName: 'Kämmerei Muster',
      email: 'kasse@example.org',
      active: false,
    }).expect(200);
    expect(locked.body.lockedAt).not.toBeNull();
    const categories = (await get('/core/retention/categories').expect(200))
      .body as {
      key: string;
      defaultRule: { years: number; action: string };
    }[];
    expect(
      categories.find((c) => c.key === 'core.locked-accounts')!.defaultRule,
    ).toMatchObject({ years: 2, action: 'anonymize' });

    await post('/core/retention/run', { dryRun: false }).expect(200);
    expect((await em().findOneOrFail(User, user.id)).username).toBe(
      'kaemmerei',
    );
    await em().nativeUpdate(
      User,
      { id: user.id },
      { lockedAt: new Date(Date.now() - 3 * 365 * 86_400_000) },
    );
    await post('/core/retention/run', { dryRun: false }).expect(200);
    const anonymised = await em().findOneOrFail(User, user.id);
    expect(anonymised).toMatchObject({
      username: `anonymized-${user.id}`,
      displayName: 'N. N.',
      email: null,
      active: false,
    });
  });
});

describe('attachments (L27)', () => {
  it('removes the metadata of photos and limits the number per record', async () => {
    test.app
      .get(Attachments)
      .register('test.photo', {
        read: async () => true,
        write: async () => true,
      });
    const exif = Buffer.concat([
      Buffer.from('Exif\0\0MM\0*\0\0\0\x08\0\0', 'latin1'),
      Buffer.from('GPS 48.77 9.18', 'latin1'),
    ]);
    const app1 = Buffer.from([0xff, 0xe1, 0, 0]);
    app1.writeUInt16BE(exif.length + 2, 2);
    const photo = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      app1,
      exif,
      Buffer.from([0xff, 0xda, 0, 4, 1, 2, 0xff, 0xd9]),
    ]);
    const uploaded = await test.http
      .post('/api/core/attachments?type=test.photo&id=record-1')
      .set('Cookie', admin)
      .set(UI)
      .attach('file', photo, {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
    expect(uploaded.body.size).toBeLessThan(photo.length);
    const file = await get(`/core/attachments/${uploaded.body.id}/file`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((file.body as Buffer).toString('latin1')).not.toContain('GPS');

    const tiny = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 4, 1, 2, 0xff, 0xd9]);
    for (let i = 0; i < 49; i++)
      await test.http
        .post('/api/core/attachments?type=test.photo&id=record-1')
        .set('Cookie', admin)
        .set(UI)
        .attach('file', tiny, { filename: 'f.jpg', contentType: 'image/jpeg' })
        .expect(201);
    const over = await test.http
      .post('/api/core/attachments?type=test.photo&id=record-1')
      .set('Cookie', admin)
      .set(UI)
      .attach('file', tiny, { filename: 'f.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(over.body).toMatchObject({ code: 'attachments.tooMany', max: 50 });
  });
});

describe('calendar feed (review)', () => {
  it('gives every department its own address and compares tokens in constant time', async () => {
    const general = (await get('/core/settings/training.general').expect(200))
      .body;
    await put('/core/settings/training.general', {
      ...general,
      feedToken: 'feed-token-der-feuerwehr-123',
    }).expect(200);
    const links = (await get('/training/feed-links').expect(200)).body as {
      all: string;
      departments: { departmentId: string; path: string }[];
    };
    expect(links.all).toBe(
      '/api/training/feed/feed-token-der-feuerwehr-123.ics',
    );
    const department = links.departments.find(
      (d) => d.departmentId === ids.department,
    )!;
    await test.http.get(department.path).expect(200);
    await test.http.get(links.all).expect(200);
    // The address of a department does not open another one, nor all.
    const token = department.path.slice(
      department.path.lastIndexOf('/') + 1,
      department.path.indexOf('?'),
    );
    await test.http
      .get(
        `/api/training/feed/${token}?departmentId=00000000-0000-7000-8000-000000000000`,
      )
      .expect(404);
    await test.http.get(`/api/training/feed/${token}`).expect(404);
    await test.http.get('/api/training/feed/falsch.ics').expect(404);
    await get('/training/feed-links', member).expect(403);
  });
});

describe('review findings in modules', () => {
  it('answers 404 for a run of MP-Feuer that is no UUID', async () => {
    expect((await get('/mp-feuer/runs/kein-lauf').expect(404)).body.code).toBe(
      'mp-feuer.runNotFound',
    );
  });

  it('shows the chosen offense of an incident only to readers of the incident', async () => {
    await post('/incidents/keywords/templates/bw', {}).expect(201);
    const incident = (
      await post('/incidents/incidents', {
        dispatchNumber: 'E-1',
        alarmKeyword: 'B2',
        alarmedAt: new Date().toISOString(),
        departmentIds: [ids.department],
      }).expect(201)
    ).body.id as string;
    await get(`/cost-recovery/incidents/${incident}/offense`).expect(200);
    await get(`/cost-recovery/incidents/${incident}/offense`, member).expect(
      404,
    );
    await get('/cost-recovery/incidents/kein-einsatz/offense').expect(404);
  });
});

/** A finished run of MP-Feuer with a row with a message naming a person. */
async function finishedRun(finishedDaysAgo: number): Promise<string> {
  const fork = em();
  const finishedAt = new Date(Date.now() - finishedDaysAgo * 86_400_000);
  const entity = fork.create(MpFeuerRunEntity, {
    userId: 'x',
    createdBy: 'Admin',
    status: 'applied',
    phase: 'apply',
    files: ['MPTRA_01.zip'],
    archives: [],
    mappings: {},
    unmatched: [],
    createdAt: finishedAt,
    finishedAt,
  });
  fork.create(MpFeuerRunDatasetEntity, {
    run: entity,
    profile: 'masterdata.persons',
    position: 10,
    rowCount: 1,
    rows: null,
    enabled: true,
    options: {},
    locked: false,
    counts: { created: 1 } as never,
    results: [
      {
        row: 1,
        label: 'Mustermann Max',
        action: 'error',
        messages: [
          { code: 'imports.unknownValue', params: { value: 'Max Mustermann' } },
        ],
        archive: '01',
      } as never,
    ],
  });
  await fork.flush();
  return entity.id;
}

describe('MP-Feuer messages (L28)', () => {
  it('removes the rows with messages after 90 days and at the end of the transition, keeping the counts', async () => {
    const old = await finishedRun(100);
    const recent = await finishedRun(5);
    await test.app
      .get(RetentionRegistry)
      .rules.get('mp-feuer.messages')!
      .run({ retention: {} }, false);
    const oldReport = (await get(`/mp-feuer/runs/${old}/report`).expect(200))
      .body;
    expect(oldReport.messages).toEqual([]);
    expect(oldReport.messagesRemovedAt).not.toBeNull();
    expect(oldReport.datasets[0].counts).toMatchObject({ created: 1 });
    expect(
      (await get(`/mp-feuer/runs/${recent}/report`).expect(200)).body.messages,
    ).toHaveLength(1);
    expect(
      (await post('/mp-feuer/runs/remove-messages', {}).expect(200)).body.runs,
    ).toBe(1);
    expect(
      (await get(`/mp-feuer/runs/${recent}/report`).expect(200)).body.messages,
    ).toEqual([]);
    expect(
      JSON.stringify(
        await em()
          .getConnection()
          .execute('select results from mp_feuer.run_dataset'),
      ),
    ).not.toContain('Mustermann');
  });
});
