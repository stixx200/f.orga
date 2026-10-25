import { EntityManager } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DigestService, MailService } from '@forga/core-api';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);

/** supertest collects binary bodies only with an explicit parser. */
function binary(res: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/masterdata/courses/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
});

afterAll(() => test?.app.close());

describe('import', () => {
  const csv = [
    'Anrede;Vorname;Nachname;Straße;PLZ;Ort;Bezeichnung;Geburtsdatum',
    'Herr;Jonas;Keller;Hauptstr. 1;12345;Musterstadt;Abt. Musterstadt;01.05.2000',
    'Frau;Lena;Brenner;Bachweg 2;12345;Musterstadt;Abt. Ahornfeld;12.03.1990',
    'Herr;Karl;Alt;Am Hang 3;12345;Musterstadt;Altersabt. Musterstadt;30.11.1958',
    ';;;;;;;',
    'Herr;;Ohnevorname;;;;Abt. Musterstadt;',
  ].join('\r\n');

  it('suggests the mapping for MP-Feuer headings and previews without changes', async () => {
    const upload = await test.http
      .post('/api/core/imports')
      .set('Cookie', admin)
      .set(UI)
      .attach('file', Buffer.from(`﻿${csv}`, 'utf8'), 'Personal.csv')
      .expect(201);
    ids.upload = upload.body.id;
    expect(upload.body.rowCount).toBe(4);
    const mapping = upload.body.suggestions['masterdata.persons'];
    expect(mapping).toMatchObject({ firstName: 'Vorname', lastName: 'Nachname', street: 'Straße', department: 'Bezeichnung', birthDate: 'Geburtsdatum' });
    ids.mapping = JSON.stringify(mapping);

    const preview = await post(`/core/imports/${ids.upload}/preview`, { profile: 'masterdata.persons', mapping }).expect(200);
    expect(preview.body.counts).toEqual({ create: 1, update: 0, unchanged: 0, error: 3 });
    expect(preview.body.rows.map((r: { messages: { code: string }[] }) => r.messages.map((m) => m.code))).toEqual([
      [],
      ['masterdata.import.unknownDepartment'],
      ['masterdata.import.unknownDepartment'],
      ['imports.requiredValueMissing'],
    ]);
    expect((await get('/masterdata/persons')).body).toEqual([]);
  });

  it('creates missing departments on request and is idempotent', async () => {
    const mapping = JSON.parse(ids.mapping);
    const applied = await post(`/core/imports/${ids.upload}/apply`, {
      profile: 'masterdata.persons',
      mapping,
      options: { createDepartments: true },
    }).expect(200);
    expect(applied.body.counts).toEqual({ create: 3, update: 0, unchanged: 0, error: 1 });

    const departments = (await get('/masterdata/departments')).body as { name: string; type: string; parentId: string | null }[];
    const veterans = departments.find((d) => d.name === 'Altersabt. Musterstadt');
    expect(veterans).toMatchObject({ type: 'veterans', parentId: ids.musterstadt });

    const persons = (await get('/masterdata/persons')).body as { lastName: string; status: string }[];
    expect(persons.map((p) => [p.lastName, p.status])).toEqual([
      ['Alt', 'veterans'],
      ['Brenner', 'active'],
      ['Keller', 'active'],
    ]);

    // The upload is gone after applying; a second upload of the same file changes nothing.
    await post(`/core/imports/${ids.upload}/apply`, { profile: 'masterdata.persons', mapping }).expect(404);
    const again = await test.http
      .post('/api/core/imports')
      .set('Cookie', admin)
      .set(UI)
      .attach('file', Buffer.from(csv, 'utf8'), 'Personal.csv')
      .expect(201);
    const second = await post(`/core/imports/${again.body.id}/apply`, { profile: 'masterdata.persons', mapping }).expect(200);
    expect(second.body.counts).toEqual({ create: 0, update: 0, unchanged: 3, error: 1 });
  });
});

describe('lists', () => {
  it('offers the lists the user may run and renders them in every format', async () => {
    const lists = (await get('/core/lists')).body as { id: string }[];
    expect(lists.map((l) => l.id)).toEqual(expect.arrayContaining(['masterdata.members', 'masterdata.signatures', 'masterdata.birthdays']));

    const members = await get('/core/lists/masterdata.members?lang=de').expect(200);
    expect(members.body.title).toBe('Mitgliederliste');
    expect(members.body.rows.map((r: { name: string }) => r.name)).toEqual(['Alt, Karl', 'Brenner, Lena', 'Keller, Jonas']);

    const signatures = await get(`/core/lists/masterdata.signatures?departmentId=${ids.musterstadt}&title=Dienstabend&date=2026-11-02`).expect(200);
    expect(signatures.body).toMatchObject({ subtitle: 'Dienstabend – 02.11.2026', rows: [{ number: 1, name: 'Keller, Jonas' }] });

    const pdf = await get('/core/lists/masterdata.signatures/export/pdf?lang=en').buffer(true).parse(binary as never).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const xlsx = await get('/core/lists/masterdata.members/export/xlsx').buffer(true).parse(binary as never).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    const csv = await get('/core/lists/masterdata.birthdays/export/csv?from=2026-01-01&to=2026-12-31&lang=de').expect(200);
    expect(csv.text).toContain('Geburtstag;Name;Alter;Rund;Abteilung');
    expect(csv.text).toContain('12.03.2026;Brenner, Lena;36');

    await get('/core/lists/masterdata.birthdays?from=gestern').expect(400);
    await get('/core/lists/does.not-exist').expect(404);

    const audit = (await get('/core/audit')).body as { action: string }[];
    expect(audit.filter((e) => e.action === 'lists.exported')).toHaveLength(3);
  });
});

describe('deadlines and digest', () => {
  it('computes deadlines from the data and mails the weekly digest', async () => {
    const persons = (await get('/masterdata/persons')).body as { id: string; lastName: string }[];
    const keller = persons.find((p) => p.lastName === 'Keller')!;
    await post(`/masterdata/persons/${keller.id}/qualifications`, {
      qualification: 'breathing-apparatus',
      acquiredOn: '2024-01-01',
      validUntil: '2026-12-01',
    }).expect(201);

    const all = (await get('/core/tasks?asOf=2026-11-01')).body as { kind: string; stage: string; subject: { label: string } }[];
    // As a breathing apparatus wearer, Keller also gets the deadlines of the respiratory protection module.
    expect(all.filter((t) => t.kind.startsWith('breathing-apparatus-')).length).toBeGreaterThan(0);
    const tasks = all.filter((t) => !t.kind.startsWith('breathing-apparatus-'));
    expect(tasks).toEqual([
      expect.objectContaining({ kind: 'qualification-expires', stage: 'upcoming', subject: expect.objectContaining({ label: 'Keller, Jonas' }) }),
    ]);
    // Karl Alt (born 1958) reached the age limit, but he is in the veterans department: no deadline.
    expect(tasks.some((t) => t.subject.label === 'Alt, Karl')).toBe(false);

    // No e-mail address: no digest.
    expect(await test.app.get(DigestService).send('2026-11-01')).toBe(0);
    const session = (await get('/core/session')).body;
    const { roles } = (await get(`/core/users/${session.user.id}`)).body;
    await test.http
      .put(`/api/core/users/${session.user.id}`)
      .set('Cookie', admin)
      .set(UI)
      .send({ username: 'admin', displayName: 'Admin', email: 'admin@example.org', roles })
      .expect(200);
    const sent = await post('/core/tasks/digest', {}).expect(200);
    expect(sent.body.sent).toBe(1);
    const mail = test.app.get(MailService).sent.at(-1)!;
    expect(mail).toMatchObject({ to: 'admin@example.org', subject: `f.orga: ${all.length} Frist(en)` });
    expect(mail.text).toContain('Qualifikation läuft ab: Atemschutzgeräteträger – Keller, Jonas');

    // Opting out stops the digest.
    await test.http.put('/api/core/profile').set('Cookie', admin).set(UI).send({ language: 'en', receiveDigest: false }).expect(200);
    expect((await post('/core/tasks/digest', {}).expect(200)).body.sent).toBe(0);
  });

  it('sends the scheduled digest only once on the configured weekday', async () => {
    await test.http.put('/api/core/profile').set('Cookie', admin).set(UI).send({ language: 'en', receiveDigest: true }).expect(200);
    const digest = test.app.get(DigestService);
    const monday = new Date('2026-11-02T08:00:00+01:00');
    expect(await digest.sendIfScheduled(new Date('2026-11-03T08:00:00+01:00'))).toBeNull();
    expect(await digest.sendIfScheduled(new Date('2026-11-02T06:00:00+01:00'))).toBeNull();
    expect(await digest.sendIfScheduled(monday)).toBe(1);
    expect(await digest.sendIfScheduled(new Date('2026-11-02T19:00:00+01:00'))).toBeNull();
    expect(test.app.get(MailService).sent.at(-1)!.subject).toBe('f.orga: 5 deadline(s)');
  });
});

describe('password reset, test e-mail and assets', () => {
  it('sends a one-time link and sets the new password', async () => {
    const put = (path: string, body: unknown) => test.http.put(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
    await post('/core/users', { username: 'vergesslich', displayName: 'Vera Gesslich', email: 'vera@example.org', password: 'altes-passwort-1' }).expect(201);
    const mails = test.app.get(MailService).sent;
    const before = mails.length;
    // Without a configured public address no link is sent, whatever the Origin header says.
    await test.http.post('/api/core/password-reset').set(UI).set('Origin', 'https://angreifer.example').send({ login: 'vera@example.org' }).expect(503);
    expect(mails.length).toBe(before);
    await put('/core/settings/brigade', { name: 'FF Test', publicUrl: 'https://forga.example.org' }).expect(200);

    await test.http.post('/api/core/password-reset').set(UI).send({ login: 'unbekannt' }).expect(200);
    expect(mails.length).toBe(before);
    await test.http.post('/api/core/password-reset').set(UI).send({ login: 'vera@example.org' }).expect(200);
    const mail = mails.at(-1)!;
    expect(mail.to).toBe('vera@example.org');
    const token = /reset-password\?token=([\w-]+)/.exec(mail.text)![1];
    expect(mail.text).toContain('https://forga.example.org/reset-password?token=');

    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token: 'falsch-falsch-falsch', password: 'neues-passwort-1' }).expect(400);
    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token, password: 'neues-passwort-1' }).expect(200);
    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token, password: 'neues-passwort-2' }).expect(400);
    await test.login({ username: 'vergesslich', password: 'neues-passwort-1' });
  });

  it('sends a test e-mail to the current user', async () => {
    const sent = await post('/core/settings/smtp/test', {}).expect(200);
    expect(test.app.get(MailService).sent.at(-1)).toMatchObject({ to: sent.body.to, subject: 'f.orga: Test-E-Mail' });
  });

  it('stores the coat of arms and serves it without login', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await test.http.put('/api/core/assets/logo').set('Cookie', admin).set(UI).attach('file', png, { filename: 'logo.png', contentType: 'image/png' }).expect(200);
    const served = await test.http.get('/api/core/assets/logo').expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    await test.http.put('/api/core/assets/logo').set('Cookie', admin).set(UI).attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
    // A file that only claims to be an image is refused; SVGs are served sandboxed.
    await test.http.put('/api/core/assets/logo').set('Cookie', admin).set(UI).attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'logo.png', contentType: 'image/png' }).expect(400);
    await test.http.put('/api/core/assets/logo').set('Cookie', admin).set(UI).attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { filename: 'logo.svg', contentType: 'image/svg+xml' }).expect(200);
    const svg = await test.http.get('/api/core/assets/logo').expect(200);
    expect(svg.headers['content-security-policy']).toContain('sandbox');
    expect(svg.headers['x-content-type-options']).toBe('nosniff');
    await test.http.delete('/api/core/assets/logo').set('Cookie', admin).set(UI).expect(204);
    await test.http.get('/api/core/assets/logo').expect(404);
  });
});

describe('search, export and retention', () => {
  it('searches persons, exports modules and anonymises former members', async () => {
    const department = (await post('/masterdata/departments', { name: 'Abteilung Suche', shortName: 'Suche', type: 'operational' }).expect(201)).body.id;
    const person = (await post('/masterdata/persons', { firstName: 'Xaver', lastName: 'Suchbar', email: 'x@example.org', status: 'active', memberships: [{ departmentId: department, from: '2000-01-01', primary: true }] }).expect(201)).body.id;

    const hits = (await get('/core/search?q=Suchbar')).body as { title: string; to: string }[];
    expect(hits).toContainEqual(expect.objectContaining({ title: 'Suchbar, Xaver', to: `/masterdata/persons/${person}` }));

    const full = await get('/core/export/masterdata').expect(200);
    const body = JSON.parse(full.text) as { format: string; data: { persons: { id: string }[] } };
    expect(body.format).toBe('forga.export');
    expect(body.data.persons.map((p) => p.id)).toContain(person);
    const access = JSON.parse((await get(`/core/export/person/${person}`).expect(200)).text) as { data: { masterdata: { person: { email: string } } } };
    expect(access.data.masterdata.person.email).toBe('x@example.org');

    // Leaving long ago: the retention rule anonymises the person and removes the history.
    await post('/masterdata/catalog/templates/bw', {});
    await post(`/masterdata/persons/${person}/leave`, { leftOn: '2005-12-31', exitReason: 'own-request' }).expect(201);
    const preview = await post('/core/retention/run', { dryRun: true }).expect(200);
    expect(preview.body.counts['masterdata.persons']).toBeGreaterThanOrEqual(1);
    await post('/core/retention/run', { dryRun: false }).expect(200);
    const anonymised = (await get(`/masterdata/persons/${person}`)).body;
    expect(anonymised).toMatchObject({ firstName: 'Person', lastName: '(ausgeschieden)', email: '' });
    expect((await get(`/core/history/masterdata.person/${person}`)).body).toEqual([]);
  });

  it('removes uploads that were never imported after a day', async () => {
    const csv = 'Vorname;Nachname\r\nLiegen;Geblieben';
    const upload = (await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv), 'liegen.csv').expect(201)).body.id;
    const fresh = await post('/core/retention/run', { dryRun: true }).expect(200);
    expect(fresh.body.counts['core.imports']).toBe(0);
    await test.app.get(EntityManager).getConnection().execute(`update "core"."import_upload" set "created_at" = now() - interval '25 hours' where "id" = ?`, [upload]);
    expect((await post('/core/retention/run', { dryRun: false }).expect(200)).body.counts['core.imports']).toBe(1);
    await post(`/core/imports/${upload}/preview`, { profile: 'masterdata.persons', mapping: { firstName: 'Vorname', lastName: 'Nachname' } }).expect(404);
  });
});

describe('MP-Feuer youth and master data exports', () => {
  it('imports the youth brigade with status youth and completes contact data', async () => {
    const youth = [
      'Jug.-Nr.;Anrede;Vorname;Nachname;Geschlecht;Geb.-Datum;Handy privat;E-Mail privat;Aktiv von;Bezeichnung',
      '0001;;Mia;Jungtest;W;14.02.2012;0170 1;mia@example.org;01.09.2024;Gesamt-Jugendfeuerwehr',
    ].join('\r\n');
    const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(youth), 'MP-EXCEL.csv').expect(201);
    const mapping = upload.body.suggestions['masterdata.persons'];
    // The youth number is not the personnel number of the active members.
    expect(mapping).toMatchObject({ phoneMobile: 'Handy privat', email: 'E-Mail privat', joinedOn: 'Aktiv von', birthDate: 'Geb.-Datum', department: 'Bezeichnung' });
    expect(mapping.personnelNumber ?? null).toBeNull();
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'masterdata.persons', mapping, options: { createDepartments: true } }).expect(200);
    expect(applied.body.counts).toMatchObject({ create: 1, error: 0 });
    const mia = ((await get('/masterdata/persons?status=youth')).body as { lastName: string; id: string }[]).find((p) => p.lastName === 'Jungtest');
    expect(mia).toBeDefined();
    expect((await get(`/masterdata/persons/${mia!.id}`)).body).toMatchObject({ status: 'youth', gender: 'female', joinedOn: '2024-09-01', phoneMobile: '0170 1', email: 'mia@example.org' });
  });
});
