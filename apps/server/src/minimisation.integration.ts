import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import ExcelJS from 'exceljs';
import { v7 as uuidv7 } from 'uuid';
import { AccessReportService, createDescribeContext, sectionTexts, ThirdPartyRegistry } from '@forga/core-api';
import type { AccessReport, ListData, ListInfo, PrivacyRequest, ProcessingRegister, ThirdPartyErasureResult, ThirdPartyHit } from '@forga/core-contracts';
import type { PersonFieldState } from '@forga/masterdata-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/**
 * Data protection, phase 4 part B (concept `dokumentation/geplant/datenschutz.md`): fields of the person file that can be
 * switched off (L10), purpose of lists and exports (L11), data of third parties (L14) and retention of protocols and run
 * reports (L29). All names are invented.
 */
let test: TestApp;
let admin: string;
let reader: string;
const ids: Record<string, string> = {};
const PASSWORD = 'auch-sehr-geheim';

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const binary = (path: string, cookie = admin) =>
  test.http
    .get(`/api${path}`)
    .set('Cookie', cookie)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) => test.app.get(EntityManager).fork().getConnection().execute(query, params) as Promise<T[]>;
const audit = async (action: string) => (await get(`/core/audit?action=${action}`).expect(200)).body as { details: Record<string, unknown> }[];
const yearsAgo = (years: number) => new Date(Date.now() - years * 366 * 86_400_000);

beforeAll(async () => {
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  test = await startTestApp();
  admin = await setUp(test);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, extra: Record<string, unknown> = {}) =>
    (
      await post('/masterdata/persons', {
        firstName,
        lastName: 'Feld',
        status: 'active',
        phoneMobile: '0170 1111111',
        phoneWork: '07000 222222',
        birthPlace: 'Beispielhausen',
        employer: { name: 'Beispiel AG', street: 'Werkstraße 1', postalCode: '12345', city: 'Musterstadt' },
        memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }],
        ...extra,
      }).expect(201)
    ).body.id as string;
  ids.minna = await person('Minna');
  ids.otto = await person('Otto');
  const role = (await post('/core/roles', { name: 'Gruppenführer (Test)', permissions: ['masterdata.persons.read', 'training.read'] }).expect(201)).body.id;
  await post('/core/users', { username: 'gruppe', displayName: 'Gruppenführer Test', password: PASSWORD, roles: [{ roleId: role, departmentId: ids.musterstadt }] }).expect(201);
  reader = await test.login({ username: 'gruppe', password: PASSWORD });
}, 120_000);

afterAll(async () => {
  await test?.app.close();
  delete process.env['FORGA_SECRET_KEY'];
});

describe('fields of the person file (L10)', () => {
  it('lists the optional fields with their state and stored values, only for the managers of the settings', async () => {
    const states = (await get('/masterdata/person-fields').expect(200)).body as PersonFieldState[];
    expect(states.map((s) => s.field)).toEqual(['salutation', 'title', 'nickname', 'birthPlace', 'gender', 'phonePrivate', 'phoneWork', 'employer', 'bank', 'notes']);
    expect(states.find((s) => s.field === 'phoneWork')).toEqual({ field: 'phoneWork', enabled: true, stored: 2 });
    await get('/masterdata/person-fields', reader).expect(403);
  });

  it('leaves switched-off fields out of the file, does not store or import them, and removes stored values with their history', async () => {
    await put('/core/settings/masterdata.personFields', { disabled: ['phoneWork', 'birthPlace', 'employer'] }).expect(200);
    const file = (await get(`/masterdata/persons/${ids.minna}`).expect(200)).body;
    expect(file).toMatchObject({ phoneWork: '', birthPlace: '', phoneMobile: '0170 1111111' });
    expect(file.employer).toBeUndefined();

    // Saving sends the field again: it is not stored, the old value stays until the bulk action.
    await put(`/masterdata/persons/${ids.minna}`, { ...file, phoneWork: '07000 999999', birthPlace: 'Anderswo', employer: { name: 'Neu GmbH' } }).expect(200);
    expect(await sql('select phone_work, birth_place, employer->>\'name\' as employer from masterdata.person where id = ?', [ids.minna])).toEqual([{ phone_work: '07000 222222', birth_place: 'Beispielhausen', employer: 'Beispiel AG' }]);
    const created = (await post('/masterdata/persons', { firstName: 'Neu', lastName: 'Feld', status: 'active', phoneWork: '07000 333333', memberships: [{ departmentId: ids.musterstadt, from: '2024-01-01', primary: true }] }).expect(201)).body;
    expect(await sql('select phone_work from masterdata.person where id = ?', [created.id])).toEqual([{ phone_work: '' }]);

    // Import (also the data transfer from MP-Feuer goes through this profile).
    const csv = 'Vorname;Nachname;Telefon dienstlich;Mobil\nOtto;Feld;07000 444444;0170 5555555\n';
    const upload = (await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'personen.csv').expect(201)).body;
    await post(`/core/imports/${upload.id}/apply`, { profile: 'masterdata.persons', mapping: upload.suggestions['masterdata.persons'], options: { updateExisting: true } }).expect(200);
    expect(await sql('select phone_work, phone_mobile from masterdata.person where id = ?', [ids.otto])).toEqual([{ phone_work: '07000 222222', phone_mobile: '0170 5555555' }]);

    // Only switched-off fields can be cleared.
    expect((await post('/masterdata/person-fields/clear', { fields: ['phoneMobile'] }).expect(400)).body.code).toBe('validation.failed');
    expect((await post('/masterdata/person-fields/clear', { fields: ['notes'] }).expect(400)).body.code).toBe('masterdata.fieldEnabled');
    const cleared = (await post('/masterdata/person-fields/clear', { fields: ['phoneWork', 'employer'] }).expect(200)).body;
    expect(cleared.counts).toEqual({ phoneWork: 2, employer: 2 });
    expect(await sql('select count(*)::int as n from masterdata.person where phone_work <> \'\' or employer is not null')).toEqual([{ n: 0 }]);
    // The history kept the old values; they are gone as well.
    expect(await sql('select count(*)::int as n from core.history where entity = \'masterdata.person\' and (jsonb_exists(changes, \'phoneWork\') or jsonb_exists(changes, \'employer\'))')).toEqual([{ n: 0 }]);
    expect(await sql('select count(*)::int as n from core.history where entity = \'masterdata.person\' and jsonb_exists(changes, \'birthPlace\')')).not.toEqual([{ n: 0 }]);
    expect((await audit('masterdata.person-fields-cleared'))[0].details).toMatchObject({ fields: ['phoneWork', 'employer'], counts: { phoneWork: 2, employer: 2 } });
    const states = (await get('/masterdata/person-fields').expect(200)).body as PersonFieldState[];
    expect(states.find((s) => s.field === 'phoneWork')).toEqual({ field: 'phoneWork', enabled: false, stored: 0 });
    expect(states.find((s) => s.field === 'birthPlace')).toMatchObject({ enabled: false, stored: 2 });
  });

  it('leaves switched-off fields out of the lists', async () => {
    const phones = (await get(`/core/lists/masterdata.phones?purpose=department`).expect(200)).body as ListData;
    expect(phones.columns.map((c) => c.key)).toEqual(['name', 'department', 'phoneMobile', 'phonePrivate']);
    const complete = (await get(`/core/lists/masterdata.complete?purpose=administration`).expect(200)).body as ListData;
    expect(complete.columns.map((c) => c.key)).not.toContain('employer');
    await put('/core/settings/masterdata.personFields', { disabled: [] }).expect(200);
  });
});

describe('purpose of lists and exports (L11)', () => {
  it('offers the purposes of a list with "other" where a purpose is needed', async () => {
    const lists = (await get('/core/lists').expect(200)).body as ListInfo[];
    const members = lists.find((l) => l.id === 'masterdata.members')!;
    expect(members).toMatchObject({ personalData: 'contact', purposeRequired: true });
    expect(members.purposes.map((p) => p.key)).toEqual(['overview', 'contact', 'other']);
    expect(lists.find((l) => l.id === 'masterdata.jubilees')).toMatchObject({ personalData: 'names', purposeRequired: false, purposes: [] });
    // Without the permission for contact lists: no phone list and no purpose "contact".
    const own = (await get('/core/lists', reader).expect(200)).body as ListInfo[];
    expect(own.map((l) => l.id)).not.toContain('masterdata.phones');
    expect(own.find((l) => l.id === 'masterdata.members')!.purposes.map((p) => p.key)).toEqual(['overview', 'other']);
  });

  it('shows only the columns the purpose needs and refuses exports without a purpose', async () => {
    const overview = (await get('/core/lists/masterdata.members?purpose=overview').expect(200)).body as ListData;
    expect(overview.columns.map((c) => c.key)).toEqual(['name', 'department', 'rank', 'status', 'joinedOn']);
    expect(overview.rows[0]).not.toHaveProperty('phoneMobile');
    expect(overview).toMatchObject({ personalData: true, purpose: 'Übersicht der Mitglieder (ohne Kontaktdaten)' });
    // The preview takes the first purpose.
    expect(((await get('/core/lists/masterdata.members').expect(200)).body as ListData).columns.map((c) => c.key)).not.toContain('email');

    expect((await get('/core/lists/masterdata.members/export/pdf').expect(400)).body.code).toBe('lists.purposeRequired');
    expect((await get('/core/lists/masterdata.members/export/pdf?purpose=sonstwas').expect(400)).body.code).toBe('lists.unknownPurpose');
    expect((await get('/core/lists/masterdata.members/export/pdf?purpose=other').expect(400)).body.code).toBe('lists.purposeNoteRequired');
    expect((await get('/core/lists/masterdata.members?purpose=contact', reader).expect(403)).body.code).toBe('lists.purposeForbidden');
    // Lists with names only need no purpose.
    await get('/core/lists/masterdata.jubilees/export/csv').expect(200);
  });

  it('records the purpose with the export and shows it with the note on personal data in the file', async () => {
    const file = (await binary('/core/lists/masterdata.members/export/xlsx?purpose=other&purposeNote=Einladung%20Jahreshauptversammlung').expect(200)).body as Buffer;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
    const texts = workbook.worksheets[0].getSheetValues().flat().map(String);
    expect(texts).toContain('Zweck: Einladung Jahreshauptversammlung');
    expect(texts).toContain('Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten');
    expect(workbook.worksheets[0].headerFooter.oddFooter).toContain('nur für den Dienstgebrauch');
    const entry = (await audit('lists.exported'))[0].details;
    expect(entry).toMatchObject({ listId: 'masterdata.members', purpose: 'other', purposeNote: 'Einladung Jahreshauptversammlung' });
    expect(entry['personIds']).toEqual(expect.arrayContaining([ids.minna, ids.otto]));
    await binary('/core/lists/masterdata.phones/export/pdf?purpose=leaders').expect(200);
    expect((await audit('lists.exported'))[0].details).toMatchObject({ listId: 'masterdata.phones', purpose: 'leaders' });
  });

  it('records the persons of the lists of the other modules', async () => {
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Übungsabend', startsAt: '2026-03-12T18:00:00Z', endsAt: '2026-03-12T20:00:00Z', departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    await binary(`/core/lists/training.signatures/export/pdf?sessionId=${session}`).expect(200);
    expect((await audit('lists.exported'))[0].details).toMatchObject({ listId: 'training.signatures', personIds: expect.arrayContaining([ids.minna, ids.otto]) });
    // Health data: an export of the due examinations needs a purpose, and "appointments" leaves out the last examination.
    const lists = (await get('/core/lists').expect(200)).body as ListInfo[];
    expect(lists.find((l) => l.id === 'respiratory-protection.examinations-due')).toMatchObject({ personalData: 'health', purposeRequired: true });
    expect((await get('/core/lists/respiratory-protection.examinations-due/export/csv').expect(400)).body.code).toBe('lists.purposeRequired');
    const due = (await get('/core/lists/respiratory-protection.examinations-due?purpose=appointments').expect(200)).body as ListData;
    expect(due.columns.map((c) => c.key)).toEqual(['name', 'department', 'due']);
  });
});

describe('data of third parties (L14)', () => {
  beforeAll(async () => {
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-104950', alarmKeyword: 'TH1', alarmedAt: '2026-03-12T10:00:00Z', departmentIds: [ids.musterstadt] }).expect(201)).body;
    ids.incident = incident.id;
    ids.report = incident.reports[0].id;
    const parties = [
      { role: 'causer', name: 'Erika Beispiel', street: 'Lindenweg 7', postalCode: '12345', city: 'Musterstadt', phone: '0170 9999999', licensePlate: 'MS-AB 123' },
      { role: 'witness', name: 'Hans Zeuge', street: 'Am Bach 2', postalCode: '12345', city: 'Musterstadt' },
    ];
    const times = { alarmedAt: '2026-03-12T10:00:00Z', returnedAt: '2026-03-12T11:30:00Z' };
    let report = (await get(`/incidents/reports/${ids.report}`).expect(200)).body;
    report = (await put(`/incidents/reports/${ids.report}`, { version: report.version, times, involvedParties: parties }).expect(200)).body;
    // A second save writes new parties and a second version: earlier entries of the same person have other IDs.
    report = (await put(`/incidents/reports/${ids.report}`, { version: report.version, times, situation: 'Verkehrsunfall', involvedParties: parties }).expect(200)).body;
    ids.erika = report.involvedParties.find((p: { name: string }) => p.name === 'Erika Beispiel').id;
    const notice = (status: string, number: string) =>
      sql(
        `insert into cost_recovery.notice (id, number, incident_id, dispatch_number, alarm_keyword, alarmed_at, offense_key, debtors, status, issued_at, created_at) values (?, ?, ?, '2026-104950', 'TH1', '2026-03-12T10:00:00Z', 'traffic', ?::jsonb, ?, ?, now()) returning id`,
        [uuidv7(), number, ids.incident, JSON.stringify([{ name: 'Erika Beispiel', street: 'Lindenweg 7', postalCode: '12345', city: 'Musterstadt', role: 'Verursacherin' }]), status, status === 'draft' ? null : '2026-05-02T10:00:00Z'],
      );
    ids.draft = (await notice('draft', 'KE-2026-013'))[0]['id'] as string;
    ids.issued = (await notice('issued', 'KE-2026-014'))[0]['id'] as string;
    ids.book = (await sql(`insert into cost_recovery.address_book (id, name, street, postal_code, city, role, notes, version) values (?, 'Erika Beispiel', 'Lindenweg 7', '12345', 'Musterstadt', 'Halterin', '', 1) returning id`, [uuidv7()]))[0]['id'] as string;
  });

  it('finds parties and debtors by name, address or licence plate, only with core.privacy.manage', async () => {
    const byPlate = (await get('/core/privacy/third-parties?q=MS-AB').expect(200)).body as ThirdPartyHit[];
    expect(byPlate).toEqual([expect.objectContaining({ source: 'incidents.involved-parties', id: ids.erika, name: 'Erika Beispiel', role: 'Verursacher/in', date: '2026-03-12', reference: expect.stringContaining('Einsatz 2026-104950 · TH1') })]);
    const byName = (await get('/core/privacy/third-parties?q=erika beispiel').expect(200)).body as ThirdPartyHit[];
    expect(byName.map((h) => [h.source, h.reference])).toEqual(
      expect.arrayContaining([
        ['incidents.involved-parties', expect.stringContaining('2026-104950')],
        ['cost-recovery.debtors', 'Kostenbescheid KE-2026-013'],
        ['cost-recovery.debtors', 'Kostenbescheid KE-2026-014'],
        ['cost-recovery.debtors', 'Adressbuch Kostenersatz'],
      ]),
    );
    expect(byName.some((h) => h.name === 'Hans Zeuge')).toBe(false);
    expect((await get('/core/privacy/third-parties?q=e').expect(200)).body).toEqual([]);
    await get('/core/privacy/third-parties?q=Erika', reader).expect(403);
  });

  it('records requests of third parties', async () => {
    const base = { kind: 'access', receivedOn: '2026-10-20', channel: 'email', thirdParty: { name: 'Erika Beispiel', note: 'Verursacherin Einsatz 2026-104950' } };
    const request = (await post('/core/privacy/requests', base).expect(201)).body as PrivacyRequest;
    ids.request = request.id;
    expect(request).toMatchObject({ personId: null, personName: null, thirdParty: { name: 'Erika Beispiel' }, dueOn: '2026-11-20' });
    ids.erasureRequest = (await post('/core/privacy/requests', { ...base, kind: 'erasure' }).expect(201)).body.id;
    // The erasure check of the modules needs a person of the master data; a third party is erased at the places.
    expect((await get(`/core/privacy/requests/${ids.erasureRequest}/erasure`).expect(400)).body.code).toBe('privacy.erasureThirdParty');
    await post('/core/privacy/requests', { ...base, kind: 'restriction' }).expect(400);
    await post('/core/privacy/requests', { ...base, personId: ids.minna }).expect(400);
    await post('/core/privacy/requests', { ...base, kind: 'objection', restrict: true }).expect(400);
    expect((await audit('privacy.request-created'))[0].details).toMatchObject({ thirdParty: true });
    expect(JSON.stringify(await audit('privacy.request-created'))).not.toContain('Erika');
    const reply = await binary(`/core/privacy/requests/${ids.request}/reply.pdf`).expect(200);
    expect(reply.headers['content-type']).toBe('application/pdf');
  });

  it('creates an access report about the third party from the chosen places, without other persons', async () => {
    const refs = [
      { source: 'incidents.involved-parties', id: ids.erika },
      { source: 'cost-recovery.debtors', id: `${ids.issued}:0` },
      { source: 'cost-recovery.debtors', id: `book:${ids.book}` },
    ];
    const ctx = createDescribeContext({ language: 'de', asOf: new Date(), personId: '', personName: 'Erika Beispiel', ownUserIds: [] });
    const texts = sectionTexts(await test.app.get(ThirdPartyRegistry).describe(refs, ctx)).join('\n');
    expect(texts).toContain('Einsätze, an denen Sie beteiligt waren');
    expect(texts).toContain('Kennzeichen MS-AB 123');
    expect(texts).toContain('KE-2026-014');
    expect(texts).toContain('Adressbuch des Kostenersatzes');
    expect(texts).not.toContain('Hans Zeuge');
    expect(texts).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);

    await post('/core/privacy/third-parties/access-reports', { name: 'Erika Beispiel', address: 'Lindenweg 7\n12345 Musterstadt', refs, requestId: ids.erasureRequest }).expect(400);
    await post('/core/privacy/third-parties/access-reports', { name: 'Erika Beispiel', refs: [{ source: 'unbekannt.quelle', id: 'x' }] }).expect(400);
    const created = (await post('/core/privacy/third-parties/access-reports', { name: 'Erika Beispiel', address: 'Lindenweg 7\n12345 Musterstadt', refs, requestId: ids.request }).expect(202)).body as AccessReport;
    expect(created).toMatchObject({ personId: null, thirdPartyName: 'Erika Beispiel', status: 'pending' });
    await test.app.get(AccessReportService).idle();
    const reports = (await get(`/core/privacy/access-reports?requestId=${ids.request}`).expect(200)).body as AccessReport[];
    expect(reports).toEqual([expect.objectContaining({ id: created.id, status: 'ready', thirdPartyName: 'Erika Beispiel' })]);
    const pdf = (await binary(`/core/privacy/access-reports/${created.id}/file`).expect(200)).body as Buffer;
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect((await get(`/core/privacy/requests/${ids.request}`).expect(200)).body.accessReportDocumentId).toBe(created.id);
    // No account, no "My area".
    expect((await post(`/core/privacy/access-reports/${created.id}/hand-over`, { channel: 'self-service' }).expect(400)).body.code).toBe('privacy.noAccount');
    await post(`/core/privacy/access-reports/${created.id}/hand-over`, { channel: 'post' }).expect(201);
    expect(JSON.stringify(await audit('privacy.access-report-created'))).not.toContain('Erika');
  });

  it('erases the third party where allowed and says what is kept', async () => {
    const refs = [
      { source: 'incidents.involved-parties', id: ids.erika },
      { source: 'cost-recovery.debtors', id: `${ids.draft}:0` },
      { source: 'cost-recovery.debtors', id: `${ids.issued}:0` },
      { source: 'cost-recovery.debtors', id: `book:${ids.book}` },
    ];
    await post('/core/privacy/third-parties/erasure', { refs, reason: 'zu kurz' }).expect(400);
    await post('/core/privacy/third-parties/erasure', { refs, reason: 'Löschantrag vom 20.10.2026', requestId: ids.request }).expect(400);
    const result = (await post('/core/privacy/third-parties/erasure', { refs, reason: 'Löschantrag vom 20.10.2026', requestId: ids.erasureRequest }).expect(200)).body as ThirdPartyErasureResult;
    expect(result.results).toEqual([
      { source: 'incidents.involved-parties', id: ids.erika, outcome: 'anonymized', code: null },
      { source: 'cost-recovery.debtors', id: `${ids.draft}:0`, outcome: 'anonymized', code: null },
      { source: 'cost-recovery.debtors', id: `${ids.issued}:0`, outcome: 'kept', code: 'privacy.thirdPartyFinancialRecord' },
      { source: 'cost-recovery.debtors', id: `book:${ids.book}`, outcome: 'deleted', code: null },
    ]);
    const report = (await get(`/incidents/reports/${ids.report}`).expect(200)).body;
    expect(report.involvedParties).toHaveLength(2);
    expect(report.involvedParties).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'causer', name: '', licensePlate: '', phone: '' }), expect.objectContaining({ role: 'witness', name: 'Hans Zeuge' })]));
    // Earlier versions and the history of the report no longer name her; the witness stays.
    expect(await sql('select count(*)::int as n from incidents.report_revision where content::text ilike ?', ['%Erika%'])).toEqual([{ n: 0 }]);
    expect(await sql('select count(*)::int as n from incidents.report_revision where content::text ilike ?', ['%Hans Zeuge%'])).not.toEqual([{ n: 0 }]);
    // Only the requests of the person still name her (they document the handling of the request).
    expect(await sql('select distinct entity from core.history where changes::text ilike ?', ['%Erika%'])).toEqual([{ entity: 'core.privacy_request' }]);
    expect(await sql('select debtors->0->>\'name\' as name from cost_recovery.notice where id = ?', [ids.draft])).toEqual([{ name: '' }]);
    expect(await sql('select debtors->0->>\'name\' as name from cost_recovery.notice where id = ?', [ids.issued])).toEqual([{ name: 'Erika Beispiel' }]);
    expect(await sql('select count(*)::int as n from cost_recovery.address_book where id = ?', [ids.book])).toEqual([{ n: 0 }]);
    expect((await audit('privacy.third-party-erased'))[0].details).toMatchObject({ counts: { anonymized: 2, deleted: 1, kept: 1 }, requestId: ids.erasureRequest });
    expect(JSON.stringify(await audit('privacy.third-party-erased'))).not.toContain('Erika');
  });

  it('marks the activities with data of third parties in the register', async () => {
    const register = (await get('/core/privacy/register').expect(200)).body as ProcessingRegister;
    expect(register.activities.find((a) => a.key === 'incidents.reports')!.thirdParties).toBe(true);
    expect(register.activities.find((a) => a.key === 'cost-recovery.notices')!.thirdParties).toBe(true);
    expect(register.activities.find((a) => a.key === 'masterdata.persons')!.thirdParties).toBe(false);
  });

  it('anonymises the parties of old incidents by their own retention category', async () => {
    const old = (await post('/incidents/incidents', { dispatchNumber: '2019-000123', alarmKeyword: 'TH1', alarmedAt: '2019-03-12T10:00:00Z', alarmMessage: 'VU zwei PKW', departmentIds: [ids.musterstadt] }).expect(201)).body;
    const version = (await get(`/incidents/reports/${old.reports[0].id}`).expect(200)).body.version;
    await put(`/incidents/reports/${old.reports[0].id}`, {
      version,
      times: { alarmedAt: '2019-03-12T10:00:00Z', returnedAt: '2019-03-12T11:00:00Z' },
      involvedParties: [{ role: 'injured-party', name: 'Paula Alt', street: 'Ringstraße 1', licensePlate: 'MS-XY 9' }],
    }).expect(200);
    await put('/core/settings/privacy', { retention: { 'incidents.involved-parties': { years: 3, action: 'anonymize' } } }).expect(200);
    const dry = (await post('/core/retention/run', { dryRun: true }).expect(200)).body;
    expect(dry.counts['incidents.involved-parties']).toBe(1);
    await post('/core/retention/run', { dryRun: false }).expect(200);
    const report = (await get(`/incidents/reports/${old.reports[0].id}`).expect(200)).body;
    expect(report.involvedParties).toEqual([expect.objectContaining({ role: 'injured-party', name: '', street: '', licensePlate: '' })]);
    // The incident itself follows its own rule.
    expect((await get(`/incidents/incidents/${old.id}`).expect(200)).body).toMatchObject({ alarmMessage: 'VU zwei PKW', anonymizedAt: null });
    expect(await sql('select count(*)::int as n from core.history where changes::text ilike ?', ['%Paula Alt%'])).toEqual([{ n: 0 }]);
    await put('/core/settings/privacy', { retention: {} }).expect(200);
  });
});

describe('retention of protocols and run reports (L29)', () => {
  it('deletes old run reports, backup logs and records of access reports by default and offers old data breaches', async () => {
    const run = uuidv7();
    await sql(`insert into mp_feuer.run (id, user_id, created_by, status, files, archives, mappings, unmatched, created_at, finished_at) values (?, 'x', 'Admin', 'applied', '[]', '[]', '{}', '[]', ?, ?)`, [run, yearsAgo(2), yearsAgo(2)]);
    const recent = uuidv7();
    await sql(`insert into mp_feuer.run (id, user_id, created_by, status, files, archives, mappings, unmatched, created_at, finished_at) values (?, 'x', 'Admin', 'applied', '[]', '[]', '{}', '[]', now(), now())`, [recent]);
    const deletedBackup = uuidv7();
    const existingBackup = uuidv7();
    await sql(`insert into backup.run (id, file_name, trigger, user_name, started_at, status, deleted_at) values (?, 'alt.forgabackup', 'manual', 'Admin', ?, 'deleted', ?)`, [deletedBackup, yearsAgo(3), yearsAgo(2)]);
    await sql(`insert into backup.run (id, file_name, trigger, user_name, started_at, status) values (?, 'vorhanden.forgabackup', 'manual', 'Admin', ?, 'ok')`, [existingBackup, yearsAgo(3)]);
    const document = uuidv7();
    await sql(`insert into core.privacy_document (id, kind, person_id, language, status, created_at, expires_at, deleted_at) values (?, 'access-report', ?, 'de', 'ready', ?, ?, ?)`, [document, ids.minna, yearsAgo(4), yearsAgo(4), yearsAgo(4)]);
    const breach = uuidv7();
    await sql(`insert into core.privacy_breach (id, title, discovered_at, status, closed_on, authority_not_required, created_at, version) values (?, '[Beispiel] Alte Datenpanne', ?, 'closed', ?, true, ?, 1)`, [breach, yearsAgo(7), yearsAgo(6).toISOString().slice(0, 10), yearsAgo(7)]);

    const result = (await post('/core/retention/run', { dryRun: false }).expect(200)).body;
    expect(result.counts).toMatchObject({ 'mp-feuer.run-reports': 1, 'backup.run-log': 1, 'core.access-reports': 1 });
    expect(await sql('select id from mp_feuer.run')).toEqual([{ id: recent }]);
    expect((await sql<{ id: string }>('select id from backup.run')).map((r) => r.id)).toEqual([existingBackup]);
    expect(await sql('select id from core.privacy_document where id = ?', [document])).toEqual([]);
    // Data breaches are proof for the supervisory authority: a case to confirm, not deleted directly.
    expect(await sql('select id from core.privacy_breach where id = ?', [breach])).toEqual([{ id: breach }]);
    const cases = (await get('/core/retention/cases').expect(200)).body as { category: string; recordId: string; status: string }[];
    expect(cases).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'core.privacy-breaches', recordId: breach })]));
  });
});
