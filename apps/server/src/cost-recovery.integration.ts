import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const T = (time: string) => `2026-10-21T${time}:00+02:00`;

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  // Personnel rates come from the local statute; f.orga has no defaults for them.
  await put('/core/settings/cost-recovery.general', { personnelRates: [{ kind: 'volunteer', validFrom: '2026-01-01', amount: 21.3 }, { kind: 'fire-watch', validFrom: '2026-01-01', amount: 15 }] }).expect(200);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20', radioCallSign: 'Florian Musterstadt 1/44', vehicleType: 'lf-20', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.mtw = (await post('/masterdata/vehicles', { designation: 'MTW', radioCallSign: 'Florian Musterstadt 1/19', vehicleType: 'mtw', departmentId: ids.musterstadt }).expect(201)).body.id;
  const person = async (firstName: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas');
  ids.max = await person('Max');

  // A false alarm of a fire alarm system: chargeable, operator as party.
  const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-777', alarmKeyword: 'B-BMA', alarmedAt: T('10:00'), location: { street: 'Industriestraße', houseNumber: '4', city: 'Musterstadt', object: 'Muster GmbH' }, departmentIds: [ids.musterstadt] }).expect(201)).body;
  ids.incident = incident.id;
  ids.report = incident.reports[0].id;
  await put(`/incidents/reports/${ids.report}`, {
    times: { alarmedAt: T('10:00'), departedAt: T('10:04'), returnedAt: T('11:10') },
    situation: 'BMA ausgelöst, Täuschungsalarm',
    actions: 'Erkundung, Rückstellung der BMA',
    personnel: [{ personId: ids.jonas, vehicleId: ids.lf }, { personId: ids.max, vehicleId: ids.lf }],
    vehicles: [{ vehicleId: ids.lf, departedAt: T('10:04'), returnedAt: T('10:50') }, { vehicleId: ids.mtw }],
    involvedParties: [{ role: 'owner', name: 'Muster GmbH', street: 'Industriestraße 4', postalCode: '12345', city: 'Musterstadt' }],
    statistics: { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' },
  }).expect(200);
  // Chargeable is a matter of the whole incident, not of a report.
  await put(`/incidents/incidents/${ids.incident}/costs`, { chargeable: true, chargeableReason: 'Täuschungsalarm BMA' }).expect(200);
});

afterAll(() => test?.app.close());

describe('cost recovery', () => {
  it('lists chargeable incidents with the suggested legal ground', async () => {
    const candidates = (await get('/cost-recovery/candidates?from=2026-01-01&to=2026-12-31').expect(200)).body;
    expect(candidates).toEqual([expect.objectContaining({ incidentId: ids.incident, object: 'Muster GmbH', chargeableReason: 'Täuschungsalarm BMA', suggestedOffense: 'fire-alarm-system', noticeId: null })]);
  });

  it('calculates a notice from the incident with VOKeFw and statute rates', async () => {
    const notice = (await post('/cost-recovery/notices', { incidentId: ids.incident }).expect(201)).body;
    ids.notice = notice.id;
    expect(notice).toMatchObject({ number: 'KE-2026-001', status: 'draft', offenseKey: 'fire-alarm-system', debtors: [{ name: 'Muster GmbH', role: 'owner' }] });
    // Personnel 10:00–11:10 = 70 min → 2 h each (half an hour up to 30 min, beyond started hours) × 21,30 €.
    expect(notice.positions[0]).toMatchObject({ kind: 'personnel', quantity: 4, rate: 21.3, amount: 85.2 });
    // LF 20 10:04–10:50 = 46 min → 1 h × 205 €; MTW without own times from the report's departure: 10:04–11:10 → 2 h × 34 €.
    expect(notice.positions[1]).toMatchObject({ kind: 'vehicle', category: 'lf-20', quantity: 1, rate: 205, amount: 205 });
    expect(notice.positions[2]).toMatchObject({ kind: 'vehicle', category: 'mtw', quantity: 2, rate: 34, amount: 68 });
    expect(notice.total).toBe(358.2);
    expect(notice.reasoning).toContain('§ 34 Abs. 1 Satz 2 Nr. 6 FwG');
    await post('/cost-recovery/notices', { incidentId: ids.incident }).expect(409);
  });

  it('needs a reason for changed amounts and issues an unchangeable PDF', async () => {
    const notice = (await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body;
    const changed = { ...notice, positions: notice.positions.map((p: { kind: string; amount: number }, i: number) => (i === 2 ? { ...p, amount: 34 } : p)) };
    const body = (n: typeof changed) => ({ version: n.version, offenseKey: n.offenseKey, debtors: n.debtors, positions: n.positions, reasoning: n.reasoning, remedy: n.remedy, cashReference: 'KZ-4711' });
    expect((await put(`/cost-recovery/notices/${ids.notice}`, body(changed)).expect(400)).body.code).toBe('cost-recovery.reasonMissing');
    changed.positions[2].reason = 'Nur Mannschaftstransport, eine Stunde';
    const saved = (await put(`/cost-recovery/notices/${ids.notice}`, body(changed)).expect(200)).body;
    expect(saved.total).toBe(324.2);

    await post(`/cost-recovery/notices/${ids.notice}/issue`, {}).expect(409);
    await post(`/cost-recovery/notices/${ids.notice}/submit`, {}).expect(200);
    const issued = (await post(`/cost-recovery/notices/${ids.notice}/issue`, {}).expect(200)).body;
    expect(issued).toMatchObject({ status: 'issued', hasPdf: true, issuedBy: 'Admin' });
    expect(issued.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const pdf = await get(`/cost-recovery/notices/${ids.notice}/pdf`).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    // Issued notices cannot be edited any more.
    await put(`/cost-recovery/notices/${ids.notice}`, body({ ...changed, version: issued.version })).expect(409);
  });

  it('hands over to the treasury, records objection and payment, and lists', async () => {
    const xlsx = await get('/cost-recovery/export').buffer(true).expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    await post(`/cost-recovery/notices/${ids.notice}/hand-over`, {}).expect(200);
    await post(`/cost-recovery/notices/${ids.notice}/objection`, { date: '2026-11-10', result: 'pending', note: 'Betreiber widerspricht' }).expect(200);
    const rejected = (await post(`/cost-recovery/notices/${ids.notice}/objection`, { date: '2026-12-01', result: 'rejected', note: 'Wartung versäumt' }).expect(200)).body;
    expect(rejected.status).toBe('handed-over');
    // The handover can be a CSV with the columns of the settings.
    const settings = (await get('/core/settings/cost-recovery.general').expect(200)).body ?? {};
    const flatRates = [{ key: 'false-alarm', name: 'Fehlalarm Brandmeldeanlage', amount: 250, basis: '§ 6 Satzung' }];
    const saved = (await put('/core/settings/cost-recovery.general', { ...settings, flatRates, handover: { format: 'csv', columns: ['cashReference', 'amount', 'number'] } }).expect(200)).body;
    expect(saved.flatRates).toEqual(flatRates);
    const csv = await get(`/cost-recovery/export?ids=${ids.notice}`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')[0]).toBe('\uFEFFKassenzeichen;Betrag (€);Aktenzeichen');
    expect(csv.text).toContain('324,20');

    // The treasury reports the payment; a partial payment is not taken over.
    const notice = (await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body;
    const payments = `Aktenzeichen;Datum;Betrag\n${notice.number};15.12.2026;100,00\nKE-0000-000;15.12.2026;5\n`;
    const upload = async () => (await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(payments, 'utf8'), 'zahlungen.csv').expect(201)).body;
    const first = await upload();
    const mapping = first.suggestions['cost-recovery.payments'];
    expect(mapping).toMatchObject({ number: 'Aktenzeichen', paidOn: 'Datum', amount: 'Betrag' });
    expect((await post(`/core/imports/${first.id}/apply`, { profile: 'cost-recovery.payments', mapping }).expect(200)).body.counts).toMatchObject({ update: 0, error: 2 });
    const full = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(`Aktenzeichen;Datum;Betrag\n${notice.number};15.12.2026;324,20\n`, 'utf8'), 'zahlungen.csv').expect(201);
    expect((await post(`/core/imports/${full.body.id}/apply`, { profile: 'cost-recovery.payments', mapping }).expect(200)).body.counts).toMatchObject({ update: 1 });
    expect((await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body).toMatchObject({ status: 'paid', paidOn: '2026-12-15' });

    expect((await get('/core/lists/cost-recovery.year?year=2026').expect(200)).body.rows).toEqual([expect.objectContaining({ count: 1, amount: 324.2, paid: 324.2 })]);
    expect((await get('/core/lists/cost-recovery.fire-alarms?from=2026-01-01&to=2026-12-31').expect(200)).body.rows).toEqual([expect.objectContaining({ object: 'Muster GmbH', count: 1 })]);
    await get('/core/lists/cost-recovery.open').expect(200);
    await get('/core/lists/cost-recovery.without-notice').expect(200);
  });

  it('bills career staff with the rate of their career group', async () => {
    const carla = (await post('/masterdata/persons', { firstName: 'Carla', lastName: 'Test', status: 'active', employment: 'career-intermediate', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-778', alarmKeyword: 'B-BMA', alarmedAt: T('14:00'), departmentIds: [ids.musterstadt] }).expect(201)).body;
    await put(`/incidents/reports/${incident.reports[0].id}`, {
      times: { alarmedAt: T('14:00'), departedAt: T('14:04'), returnedAt: T('14:50') },
      situation: 'BMA', actions: 'Erkundung',
      personnel: [{ personId: ids.jonas, vehicleId: ids.lf }, { personId: carla, vehicleId: ids.lf }],
      vehicles: [{ vehicleId: ids.lf }],
      involvedParties: [{ role: 'owner', name: 'Muster GmbH', street: 'Industriestraße 4', postalCode: '12345', city: 'Musterstadt' }],
      statistics: { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' },
    }).expect(200);
    await put(`/incidents/incidents/${incident.id}/costs`, { chargeable: true }).expect(200);
    const settings = (await get('/core/settings/cost-recovery.general').expect(200)).body ?? {};
    const personnelRates = [...(settings.personnelRates ?? []), { kind: 'career-intermediate', validFrom: '2026-01-01', amount: 70 }];
    await put('/core/settings/cost-recovery.general', { ...settings, personnelRates }).expect(200);
    // The legal ground chosen in the report beats the suggestion from the statistics.
    await put(`/cost-recovery/incidents/${incident.id}/offense`, { offenseKey: 'gibt-es-nicht' }).expect(400);
    expect((await put(`/cost-recovery/incidents/${incident.id}/offense`, { offenseKey: 'intent' }).expect(200)).body).toEqual({ offenseKey: 'intent' });
    const candidate = ((await get('/cost-recovery/candidates?from=2026-01-01&to=2026-12-31').expect(200)).body as { incidentId: string; suggestedOffense: string }[]).find((c) => c.incidentId === incident.id);
    expect(candidate?.suggestedOffense).toBe('intent');
    const notice = (await post('/cost-recovery/notices', { incidentId: incident.id }).expect(201)).body;
    expect(notice.offenseKey).toBe('intent');
    const personnel = notice.positions.filter((p: { kind: string }) => p.kind === 'personnel');
    expect(personnel).toEqual([
      expect.objectContaining({ category: 'volunteer', rate: 21.3, label: 'Personal Musterstadt (1 Person)' }),
      expect.objectContaining({ category: 'career-intermediate', rate: 70, label: 'Personal Musterstadt – Hauptamt mittlerer Dienst (1 Person)' }),
    ]);
  });

  it('replaces an issued notice by an amendment notice', async () => {
    // The career staff notice of the previous test: review, issue, amend.
    const notices = (await get('/cost-recovery/notices?year=2026').expect(200)).body as { id: string; dispatchNumber: string }[];
    const id = notices.find((n) => n.dispatchNumber === '2026-778')!.id;
    await post(`/cost-recovery/notices/${id}/amend`, {}).expect(409);
    await post(`/cost-recovery/notices/${id}/submit`, {}).expect(200);
    const issued = (await post(`/cost-recovery/notices/${id}/issue`, {}).expect(200)).body;
    const amendment = (await post(`/cost-recovery/notices/${id}/amend`, {}).expect(201)).body;
    expect(amendment).toMatchObject({ number: `${issued.number}-Ä1`, status: 'draft', amends: { id, number: issued.number }, positions: issued.positions });
    await post(`/cost-recovery/notices/${id}/amend`, {}).expect(409);
    // Lower amount with reason, then issue: the original is replaced and no longer counts.
    const positions = amendment.positions.map((p: { amount: number }, i: number) => (i === 0 ? { ...p, amount: p.amount - 10, reason: 'Fehler in der Personalzeit' } : p));
    await put(`/cost-recovery/notices/${amendment.id}`, { offenseKey: amendment.offenseKey, debtors: amendment.debtors, positions, reasoning: amendment.reasoning, remedy: amendment.remedy, cashReference: '', version: amendment.version }).expect(200);
    await post(`/cost-recovery/notices/${amendment.id}/submit`, {}).expect(200);
    await post(`/cost-recovery/notices/${amendment.id}/issue`, {}).expect(200);
    expect((await get(`/cost-recovery/notices/${id}`).expect(200)).body).toMatchObject({ status: 'amended', amendedBy: { id: amendment.id } });
    const pdf = await get(`/cost-recovery/notices/${amendment.id}/pdf`).buffer(true).expect(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('keeps an address book of frequent debtors', async () => {
    const entry = (await post('/cost-recovery/debtors', { name: 'Versicherung AG', street: 'Hauptstraße 1', postalCode: '89073', city: 'Kreisstadt' }).expect(201)).body;
    expect((await get('/cost-recovery/debtors').expect(200)).body).toEqual([expect.objectContaining({ id: entry.id, name: 'Versicherung AG' })]);
  });

  it('bills every vehicle with crew once, also when only the crew names it or two reports list it', async () => {
    const ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-779', alarmKeyword: 'B-BMA', alarmedAt: T('14:00'), departmentIds: [ids.musterstadt, ahornfeld] }).expect(201)).body;
    const [own, support] = incident.reports;
    // The crew sits on the LF, but the report lists no vehicles (as imports and the API used to leave it).
    const saved = await put(`/incidents/reports/${own.id}`, {
      times: { alarmedAt: T('14:00'), departedAt: T('14:10'), returnedAt: T('14:40') },
      situation: 'BMA', actions: 'Erkundung',
      personnel: [{ personId: ids.jonas, vehicleId: ids.lf }],
      statistics: { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' },
    }).expect(200);
    expect(saved.body.vehicles).toEqual([expect.objectContaining({ vehicleId: ids.lf, departedAt: null, returnedAt: null })]);
    // The other department's report lists the same LF with own, longer times.
    await put(`/incidents/reports/${support.id}`, {
      times: { alarmedAt: T('14:00'), departedAt: T('14:05'), returnedAt: T('15:20') },
      situation: 'Unterstützung', actions: 'Bereitstellung',
      vehicles: [{ vehicleId: ids.lf, departedAt: T('14:05'), returnedAt: T('15:20') }],
    }).expect(200);
    await put(`/incidents/incidents/${incident.id}/costs`, { chargeable: true }).expect(200);

    const notice = (await post('/cost-recovery/notices', { incidentId: incident.id }).expect(201)).body;
    const vehicles = (notice.positions as { kind: string; vehicleId: string; quantity: number; amount: number }[]).filter((p) => p.kind === 'vehicle');
    // Once, 14:05–15:20 = 75 min → 2 h × 205 €.
    expect(vehicles).toEqual([expect.objectContaining({ vehicleId: ids.lf, quantity: 2, amount: 410 })]);

    // The incident beside the notice, with names.
    const view = (await get(`/cost-recovery/notices/${notice.id}/incident`).expect(200)).body;
    expect(view).toMatchObject({ dispatchNumber: '2026-779' });
    expect(view.reports[0]).toMatchObject({ department: 'Abteilung Musterstadt', departedAt: new Date(T('14:10')).toISOString(), vehicles: [expect.objectContaining({ name: 'Florian Musterstadt 1/44', crew: 1 })] });
    expect(view.reports[0].personnel).toEqual([expect.objectContaining({ vehicle: 'Florian Musterstadt 1/44', standby: false })]);
  });
});
