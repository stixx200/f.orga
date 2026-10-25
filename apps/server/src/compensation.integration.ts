import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FUNCTION_ALLOWANCES } from '@forga/compensation-contracts';
import { DomainEvents } from '@forga/core-api';
import { INCIDENTS_EVENTS, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let reader: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const openItems = async (label: string) => ((await get('/compensation/items?open=true').expect(200)).body as { label: string }[]).filter((i) => i.label === label);
const amounts = (items: { amount: number | null }[]) => items.map((i) => i.amount);

const released = (personnel: { personId: string; amount: number; hours?: number; lossOfEarnings?: boolean; duringWorkingHours?: boolean; from?: string; to?: string }[]): ReportReleasedEvent => ({
  reportId: '01a16846-0000-7000-8000-00000000c001', incidentId: '01a16846-0000-7000-8000-00000000c002', departmentId: ids.musterstadt, level: 'compensation',
  alarmedAt: '2026-03-10T13:00:00Z', dispatchNumber: '2026-555', reportNumber: '2026-001', alarmKeyword: 'B2', compensationKind: 'incident',
  personnel: personnel.map((p) => ({
    personId: p.personId, vehicleId: null, breathingApparatus: false, breathingMinutes: null, chemicalSuit: false, breathingDevice: null, from: p.from ?? '2026-03-10T13:00:00Z', to: p.to ?? '2026-03-10T15:30:00Z',
    hours: p.hours ?? 3, rate: 15, amount: p.amount, duringWorkingHours: p.duringWorkingHours ?? false, lossOfEarnings: p.lossOfEarnings ?? false,
  })),
  vehicleIds: [],
});

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, departmentId: string, iban: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', bank: { iban, accountHolder: '' }, employer: { name: `Firma ${firstName}` }, memberships: [{ departmentId, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas', ids.musterstadt, 'DE02120300000000202051');
  ids.max = await person('Max', ids.musterstadt, '');
  ids.lena = await person('Lena', ids.ahornfeld, 'DE02500105170137075030');

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = roles.find((r) => r.templateKey === 'department-commander')!.id;
  await post('/core/users', { username: 'abtkdt', displayName: 'Abt.-Kdt. Ahornfeld', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: ids.ahornfeld }] }).expect(201);
  reader = await test.login({ username: 'abtkdt', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('compensation', () => {
  it('collects items from released reports and closed training sessions', async () => {
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, released([
      { personId: ids.jonas, amount: 45 },
      { personId: ids.max, amount: 45, lossOfEarnings: true },
      { personId: ids.lena, amount: 0, duringWorkingHours: true },
    ]));
    // Released again at the second level: nothing doubles.
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, { ...released([
      { personId: ids.jonas, amount: 45 },
      { personId: ids.max, amount: 45, lossOfEarnings: true },
      { personId: ids.lena, amount: 0, duringWorkingHours: true },
    ]), level: 'billing' });

    const session = (await post('/training/sessions', { type: 'exercise', title: 'Übungsabend', startsAt: '2026-03-12T18:00:00Z', endsAt: '2026-03-12T20:10:00Z', departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.jonas, status: 'present' }]).expect(200);
    await post(`/training/sessions/${session}/close`, {}).expect(200);

    // Taking over existing sessions and reports again does not duplicate items.
    expect((await post('/training/sessions/republish', { from: '2026-01-01', to: '2026-12-31' }).expect(200)).body).toEqual({ sessions: 1 });
    await post('/incidents/reports/republish', { from: '2026-01-01', to: '2026-12-31' }).expect(200);

    const items = (await get('/compensation/items?open=true').expect(200)).body as { personId: string; source: string; kind: string; amount: number | null; hours: number; workingHours: boolean; label: string }[];
    expect(items).toHaveLength(5);
    expect(items.find((i) => i.source === 'training')).toMatchObject({ personId: ids.jonas, hours: 3, amount: 45, label: 'Übungsabend' });
    expect(items.find((i) => i.kind === 'loss-of-earnings')).toMatchObject({ personId: ids.max, amount: null });
    expect(items.find((i) => i.personId === ids.lena)).toMatchObject({ workingHours: true, amount: 0, label: '2026-555 · B2' });

    // The department commander of Ahornfeld sees only Lena.
    const own = (await get('/compensation/items?open=true', reader).expect(200)).body as { personId: string }[];
    expect(own.map((i) => i.personId)).toEqual([ids.lena]);
    await get(`/compensation/persons/${ids.jonas}/items`, reader).expect(403);
  });

  it('checks a run, needs the loss of earnings and closes it', async () => {
    // A report of the period that is still a draft is missing from the run: a warning, not blocking.
    await post('/incidents/keywords/templates/bw', {}).expect(201);
    await post('/incidents/incidents', { dispatchNumber: '2026-321', alarmKeyword: 'B2', alarmedAt: '2026-03-20T10:00:00Z', departmentIds: [ids.musterstadt] }).expect(201);
    const run = (await post('/compensation/runs', { from: '2026-03-01', to: '2026-03-31' }).expect(201)).body;
    ids.run = run.id;
    expect(run).toMatchObject({ number: '2026-01', status: 'draft', itemCount: 5, total: 135 });
    await post('/compensation/runs', { from: '2026-04-01', to: '2026-04-30' }).expect(409);
    const codes = (run.problems as { code: string; blocking: boolean }[]).map((p) => p.code).toSorted();
    expect(codes).toEqual(['amount-missing', 'no-iban', 'report-not-released']);
    expect(run.problems.find((p: { code: string }) => p.code === 'report-not-released')).toMatchObject({ blocking: false, name: '2026-03-20 B2 2026-321' });

    await post(`/compensation/runs/${run.id}/close`, {}).expect(409);
    const loss = run.items.find((i: { kind: string }) => i.kind === 'loss-of-earnings');
    await put(`/compensation/items/${loss.id}/amount`, { amount: 80, reason: 'Bescheinigung Arbeitgeber' }).expect(200);

    const closed = (await post(`/compensation/runs/${run.id}/close`, {}).expect(200)).body;
    expect(closed).toMatchObject({ status: 'closed', total: 215 });
    expect(closed.persons.find((p: { personId: string }) => p.personId === ids.jonas)).toMatchObject({ incidents: 1, sessions: 1, amount: 90 });
    await put(`/compensation/items/${loss.id}/amount`, { amount: 90 }).expect(409);
    await post(`/compensation/runs/${run.id}/paid`, {}).expect(409);
    // Statements as PDF, one page per person; per primary department.
    const all = await get(`/compensation/runs/${run.id}/statements.pdf`).buffer(true).expect(200);
    expect(all.body.subarray(0, 4).toString()).toBe('%PDF');
    await get(`/compensation/runs/${run.id}/statements.pdf?departmentId=${ids.ahornfeld}`).buffer(true).expect(200);
    // SEPA file: needs the payer account, then one transfer per person with a valid IBAN (Max has none).
    expect((await get(`/compensation/runs/${run.id}/transfer.xml`).expect(400)).body.code).toBe('compensation.payerMissing');
    const config = (await get('/core/settings/compensation.general').expect(200)).body ?? {};
    await put('/core/settings/compensation.general', { ...config, payer: { name: 'Stadt Musterstadt', iban: 'DE02500105170137075030', bic: '' } }).expect(200);
    expect((await get(`/compensation/runs/${run.id}/transfer.xml`).expect(409)).body).toMatchObject({ code: 'compensation.invalidIban', names: 'Max Test' });
    // Max gets an account and assigns his loss of earnings to the employer: two transfers.
    const max = (await get(`/masterdata/persons/${ids.max}`).expect(200)).body;
    const { id: _id, version, sensitiveHidden: _h, anonymizedAt: _a, memberships: _m, qualifications: _q, ranks: _r, honors: _o, offices: _f, restPeriods: _p, status: _s, ...fields } = max;
    await put(`/masterdata/persons/${ids.max}`, { ...fields, version, bank: { iban: 'DE02120300000000202051', accountHolder: '' }, employer: { ...max.employer, name: 'Firma Max', iban: 'DE02500105170137075030', lossOfEarningsAssignedFrom: '2026-01-01' } }).expect(200);
    const xml = (await get(`/compensation/runs/${run.id}/transfer.xml?executionDate=2026-04-15`).expect(200)).text;
    expect(xml).toContain('<Nm>Firma Max</Nm>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">80.00</InstdAmt>');
    expect(xml).toContain('Verdienstausfall');
    await post(`/compensation/runs/${run.id}/hand-over`, {}).expect(200);
    await post(`/compensation/runs/${run.id}/paid`, {}).expect(200);
  });

  it('exports the run for the treasury', async () => {
    const xlsx = await get(`/compensation/runs/${ids.run}/export.xlsx`).buffer(true).expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    const csv = (await get(`/compensation/runs/${ids.run}/transfer.csv`).expect(200)).text;
    expect(csv).toContain('Name;IBAN;Betrag;Verwendungszweck');
    expect(csv).toContain('Jonas Test;DE02120300000000202051;90,00;Entschädigung Feuerwehr 01.03.2026–31.03.2026');
  });

  it('corrects amounts already paid out with the difference in the next run', async () => {
    // The report is unlocked, Jonas gets more hours, Max is removed.
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, released([
      { personId: ids.jonas, amount: 60, hours: 4 },
      { personId: ids.lena, amount: 0, duringWorkingHours: true },
    ]));
    const open = (await get('/compensation/items?open=true').expect(200)).body as { personId: string; kind: string; amount: number; correction: boolean }[];
    expect(open.every((i) => i.correction)).toBe(true);
    expect(open.filter((i) => i.personId === ids.jonas).map((i) => i.amount)).toEqual([15]);
    expect(amounts(open.filter((i) => i.personId === ids.max)).toSorted((a, b) => (a ?? 0) - (b ?? 0))).toEqual([-80, -45]);

    // The next run cannot pay out a negative total: Max's corrections stay open for later runs.
    const run = (await post('/compensation/runs', { from: '2026-04-01', to: '2026-04-30' }).expect(201)).body;
    expect(run.problems.some((p: { code: string; personId: string }) => p.code === 'negative-total' && p.personId === ids.max)).toBe(true);
    const closed = (await post(`/compensation/runs/${run.id}/close`, {}).expect(200)).body;
    expect(closed.persons.map((p: { personId: string }) => p.personId)).not.toContain(ids.max);
    const stillOpen = (await get('/compensation/items?open=true').expect(200)).body as { personId: string; runId: string | null }[];
    expect(stillOpen.filter((i) => i.personId === ids.max)).toHaveLength(2);
    expect(stillOpen.filter((i) => i.personId === ids.max).every((i) => i.runId === null)).toBe(true);
  });

  it('records manual items and function allowances', async () => {
    await post('/compensation/items', { personId: ids.lena, kind: 'expenses', date: '2026-04-02', label: 'Fahrtkosten Lehrgang', amount: 23.4, reason: 'Beleg liegt vor' }).expect(201);
    await post('/compensation/items', { personId: ids.lena, kind: 'expenses', date: '2026-04-02', label: 'Ohne Grund', amount: 5 }).expect(400);

    // Linked to the office, the commander comes from the person files; holders are not kept here for it.
    await post('/masterdata/catalog/templates/bw', {}).expect(201);
    const settings = (await get('/core/settings/compensation.general').expect(200)).body ?? {};
    const allowances = (settings.functionAllowances ?? DEFAULT_FUNCTION_ALLOWANCES).map((f: { key: string }) => (f.key === 'commander' ? { ...f, office: 'commander' } : f));
    await put('/core/settings/compensation.general', { ...settings, functionAllowances: allowances }).expect(200);
    await post(`/masterdata/persons/${ids.jonas}/offices`, { office: 'commander', from: '2020-01-01' }).expect(201);
    await post(`/masterdata/persons/${ids.lena}/offices`, { office: 'commander', from: '2026-07-01' }).expect(201);
    expect((await post('/compensation/functions', { personId: ids.max, functionKey: 'commander', from: '2026-01-01' }).expect(400)).body.code).toBe('compensation.functionFromOffices');
    // Functions without an office keep their holders here.
    await post('/compensation/functions', { personId: ids.max, functionKey: 'command-group-leader', from: '2026-01-01' }).expect(201);
    await post('/compensation/functions', { personId: ids.max, functionKey: 'gibt-es-nicht', from: '2026-01-01' }).expect(400);
    const holders = (await get('/compensation/functions').expect(200)).body as { personId: string; functionKey: string; source: string }[];
    expect(holders.filter((h) => h.functionKey === 'commander').map((h) => h.source)).toEqual(['masterdata', 'masterdata']);
    const generated = (await post('/compensation/functions/generate', { year: 2026 }).expect(200)).body;
    expect(generated).toMatchObject({ items: 3, exceeded: [{ functionKey: 'commander', holders: 2, maxHolders: 1 }] });
    const lena = (await get(`/compensation/persons/${ids.lena}/items?year=2026`).expect(200)).body as { kind: string; amount: number }[];
    expect(lena.find((i) => i.kind === 'flat-rate')).toMatchObject({ amount: 750 });
    // Generating again changes nothing.
    await post('/compensation/functions/generate', { year: 2026 }).expect(200);
    expect((await get(`/compensation/persons/${ids.lena}/items?year=2026`).expect(200)).body).toHaveLength(lena.length);
  });

  it('takes over the special services of the duty roster per full day', async () => {
    const duty = (await post('/incidents/duty', { personId: ids.jonas, kind: 'duty-officer', from: '2026-11-02T07:00:00+01:00', to: '2026-11-04T07:00:00+01:00' }).expect(201)).body;
    const item = () => get(`/compensation/persons/${ids.jonas}/items?year=2026`).expect(200).then((r) => (r.body as { label: string; amount: number }[]).find((i) => i.label.startsWith('Einsatzleiter vom Dienst')));
    expect(await item()).toMatchObject({ label: 'Einsatzleiter vom Dienst (EvD) (2 Tage)', amount: 20 });
    await put(`/incidents/duty/${duty.id}`, { personId: ids.jonas, kind: 'duty-officer', from: '2026-11-02T07:00:00+01:00', to: '2026-11-05T07:00:00+01:00' }).expect(200);
    expect(await item()).toMatchObject({ label: 'Einsatzleiter vom Dienst (EvD) (3 Tage)', amount: 30 });
    await test.http.delete(`/api/incidents/duty/${duty.id}`).set('Cookie', admin).set(UI).expect(204);
    expect(await item()).toBeUndefined();
  });

  it('leaves the amount open when no rate is configured for the date', async () => {
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Ohne Satz', startsAt: '2019-05-05T18:00:00Z', endsAt: '2019-05-05T20:00:00Z', departmentIds: [ids.ahornfeld] }).expect(201)).body.id;
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.lena, status: 'present' }]).expect(200);
    await post(`/training/sessions/${session}/close`, {}).expect(200);
    const item = ((await get('/compensation/items?open=true').expect(200)).body as { id: string; label: string; amount: number | null; rate: number | null }[]).find((i) => i.label === 'Ohne Satz')!;
    expect(item).toMatchObject({ rate: null, amount: null });
    await put(`/compensation/items/${item.id}/amount`, { amount: 30, reason: 'Satz 2019' }).expect(200);
  });

  it('withdraws the items of a reopened training session', async () => {
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Wieder geöffnet', startsAt: '2026-05-05T18:00:00Z', endsAt: '2026-05-05T20:00:00Z', departmentIds: [ids.ahornfeld] }).expect(201)).body.id;
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.lena, status: 'present' }]).expect(200);
    await post(`/training/sessions/${session}/close`, {}).expect(200);
    expect(await openItems('Wieder geöffnet')).toHaveLength(1);
    await post(`/training/sessions/${session}/reopen`, {}).expect(200);
    expect(await openItems('Wieder geöffnet')).toHaveLength(0);
    await test.http.delete(`/api/training/sessions/${session}`).set('Cookie', admin).set(UI).expect(204);
    expect(await openItems('Wieder geöffnet')).toHaveLength(0);
  });

  it('shows annual totals with the tax hint, lists and deadlines', async () => {
    const totals = (await get('/compensation/year-totals?year=2026').expect(200)).body as { personId: string; total: number; aboveYear: boolean; monthsAbove: number[] }[];
    const jonas = totals.find((t) => t.personId === ids.jonas)!;
    expect(jonas).toMatchObject({ total: 1605, aboveYear: false, monthsAbove: [12] });
    const statement = (await get(`/core/lists/compensation.statement?runId=${ids.run}`).expect(200)).body;
    expect(statement.rows.some((r: { label: string }) => r.label.includes('(AZ)'))).toBe(true);
    await get('/core/lists/compensation.year-totals?year=2026').expect(200);
  });

  it('applies the statute: maximum amounts, refreshment allowance and multi-day hints', async () => {
    const paul = (await post('/masterdata/persons', { firstName: 'Paul', lastName: 'Test', status: 'active', bank: { iban: 'DE02120300000000202051', accountHolder: '' }, memberships: [{ departmentId: ids.ahornfeld, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
    const before = (await get('/core/settings/compensation.general').expect(200)).body ?? {};
    const configure = (changes: object) => put('/core/settings/compensation.general', { ...before, ...changes }).expect(200);
    const report = (n: number, from: string, to: string, amount: number): ReportReleasedEvent => ({
      ...released([{ personId: paul, amount, from, to }]),
      reportId: `01a16846-0000-7000-8000-00000000d00${n}`,
      dispatchNumber: `2026-90${n}`,
    });
    const publish = (e: ReportReleasedEvent) => test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, e);
    const items = async () => ((await get(`/compensation/persons/${paul}/items?year=2026`).expect(200)).body as { label: string; kind: string; amount: number }[]).toSorted((a, b) => a.label.localeCompare(b.label));

    await configure({ maxPerService: 60, maxPerDay: 100, refreshment: { afterHours: 4, amount: 10 } });
    await publish(report(1, '2026-11-02T08:00:00Z', '2026-11-02T13:30:00Z', 90));
    await publish(report(2, '2026-11-02T15:00:00Z', '2026-11-02T19:00:00Z', 60));
    await publish(report(3, '2026-11-20T08:00:00Z', '2026-11-22T20:00:00Z', 900));
    expect((await items()).map((i) => [i.label, i.kind, i.amount])).toEqual([
      ['2026-901 · B2', 'compensation', 60],
      ['2026-901 · B2 · Erfrischungszuschuss', 'flat-rate', 10],
      ['2026-902 · B2', 'compensation', 60],
      ['2026-903 · B2', 'compensation', 60],
      ['2026-903 · B2 · Erfrischungszuschuss', 'flat-rate', 10],
    ]);

    // Without an amount in the statute the run shows a hint instead of the item.
    await configure({ maxPerService: 60, maxPerDay: 100 });
    await publish(report(1, '2026-11-02T08:00:00Z', '2026-11-02T13:30:00Z', 90));
    expect((await items()).filter((i) => i.label.endsWith('Erfrischungszuschuss'))).toHaveLength(1);
    const run = (await post('/compensation/runs', { from: '2026-11-01', to: '2026-11-30' }).expect(201)).body;
    const problems = (run.problems as { code: string; personId: string; detail: string; blocking: boolean }[]).filter((p) => p.personId === paul);
    expect(problems.map((p) => p.code).toSorted()).toEqual(['above-day-maximum', 'multi-day', 'refreshment']);
    expect(problems.every((p) => !p.blocking)).toBe(true);
    expect(problems.find((p) => p.code === 'multi-day')!.detail.replace(/\s/g, ' ')).toBe('2026-903 · B2 (3 Tage); Haushaltsführende 15,00 € je Stunde');
    expect(problems.find((p) => p.code === 'above-day-maximum')!.detail.replace(/\s/g, ' ')).toBe('02.11.2026: 120,00 € > 100,00 €');
    await test.http.delete(`/api/compensation/runs/${run.id}`).set('Cookie', admin).set(UI).expect(204);
    await configure({});
    for (const n of [1, 2, 3]) await publish({ ...report(n, '2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z', 0), personnel: [] });
  });

  it('pays the course allowance of the statute for a passed course', async () => {
    await post('/masterdata/catalog/templates/bw', {}).expect(201);
    await post('/masterdata/courses/templates/bw', {}).expect(201);
    await post(`/masterdata/persons/${ids.lena}/course-attendances`, { course: 'squad-leader', startsOn: '2026-09-01', endsOn: '2026-09-20', result: 'passed' }).expect(201);
    await post(`/masterdata/persons/${ids.lena}/course-attendances`, { course: 'truppmann-2', startsOn: '2026-09-01', result: 'passed' }).expect(201);
    const items = (await get(`/compensation/persons/${ids.lena}/items?year=2026`).expect(200)).body as { label: string; source: string; date: string; amount: number }[];
    expect(items.filter((i) => i.source === 'course')).toEqual([expect.objectContaining({ label: 'Lehrgangspauschale Truppführer', date: '2026-09-20', amount: 70 })]);
  });
});
