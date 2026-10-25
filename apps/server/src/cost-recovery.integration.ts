import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import { BW_TEMPLATE } from '@forga/cost-recovery-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let treasurer: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);

/** Submits a report (acknowledging its warnings) and releases it for billing, as the workflow requires. */
async function releaseForBilling(reportId: string): Promise<void> {
  const report = (await get(`/incidents/reports/${reportId}`).expect(200)).body as { findings: { rule: string; level: string; subject: string | null; acknowledged: boolean }[] };
  const acknowledgements = report.findings.filter((f) => f.level === 'warning' && !f.acknowledged).map((f) => ({ rule: f.rule, subject: f.subject, reason: 'Test' }));
  await post(`/incidents/reports/${reportId}/submit`, { acknowledgements }).expect(200);
  await post(`/incidents/reports/${reportId}/release`, { level: 'billing' }).expect(200);
}
const T = (time: string) => `2026-10-21T${time}:00+02:00`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const germanToday = today.split('-').toReversed().join('.');
const configure = async (changes: object) => {
  const settings = (await get('/core/settings/cost-recovery.general').expect(200)).body ?? {};
  await put('/core/settings/cost-recovery.general', { ...settings, ...changes }).expect(200);
};
type NoticeBody = { version: number; offenseKey: string; debtors: unknown[]; positions: unknown[]; reasoning: string; remedy: string; cashReference: string };
const body = (n: NoticeBody, changes: Partial<NoticeBody> = {}) => ({ version: n.version, offenseKey: n.offenseKey, debtors: n.debtors, positions: n.positions, reasoning: n.reasoning, remedy: n.remedy, cashReference: n.cashReference, ...changes });
const importPayments = async (csv: string) => {
  const upload = (await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'zahlungen.csv').expect(201)).body;
  const mapping = upload.suggestions['cost-recovery.payments'];
  return (await post(`/core/imports/${upload.id}/apply`, { profile: 'cost-recovery.payments', mapping }).expect(200)).body as { counts: Record<string, number>; rows: { messages: { code: string }[] }[] };
};

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20', radioCallSign: 'Florian Musterstadt 1/44', vehicleType: 'lf-20', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.mtw = (await post('/masterdata/vehicles', { designation: 'MTW', radioCallSign: 'Florian Musterstadt 1/19', vehicleType: 'mtw', departmentId: ids.musterstadt }).expect(201)).body.id;
  const person = async (firstName: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas');
  ids.max = await person('Max');

  // A second person who may issue notices (four-eyes principle).
  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  await post('/core/users', { username: 'kasse', displayName: 'Kasse', password: 'auch-sehr-geheim', roles: [{ roleId: roles.find((r) => r.templateKey === 'administration')!.id, departmentId: null }] }).expect(201);
  treasurer = await test.login({ username: 'kasse', password: 'auch-sehr-geheim' });

  // A false alarm of a fire alarm system: chargeable, operator as party, a guest of a neighbouring brigade.
  const incident = (await post('/incidents/incidents', {
    dispatchNumber: '2026-777', alarmKeyword: 'B-BMA', alarmedAt: T('10:00'),
    location: { street: 'Industriestraße', houseNumber: '4', postalCode: '12345', city: 'Musterstadt', district: 'Musterstadt', object: 'Muster GmbH' }, departmentIds: [ids.musterstadt],
  }).expect(201)).body;
  ids.incident = incident.id;
  ids.report = incident.reports[0].id;
  await put(`/incidents/reports/${ids.report}`, {
    times: { alarmedAt: T('10:00'), departedAt: T('10:04'), returnedAt: T('11:10') },
    situation: 'BMA ausgelöst, Täuschungsalarm',
    actions: 'Erkundung, Rückstellung der BMA',
    incidentCommander: 'Jonas Test',
    personnel: [{ personId: ids.jonas, vehicleId: ids.lf }, { personId: ids.max, vehicleId: ids.lf }, { guestName: 'Gast Nachbarwehr', vehicleId: ids.lf }],
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
    expect(candidates).toEqual([expect.objectContaining({ incidentId: ids.incident, object: 'Muster GmbH', chargeableReason: 'Täuschungsalarm BMA', released: false, noticeId: null })]);
  });

  it('starts without state-specific values and refuses notices until they are configured', async () => {
    const empty = (await get('/core/settings/cost-recovery.general').expect(200)).body;
    expect(empty?.offenses ?? []).toEqual([]);
    expect((await post('/cost-recovery/notices', { incidentId: ids.incident }).expect(409)).body).toMatchObject({ code: 'cost-recovery.notConfigured', missing: ['offenses', 'defaultLegalBasis', 'regulation', 'remedy'] });
    // The template Baden-Württemberg is taken over explicitly; personnel rates come from the local statute.
    await configure({ ...BW_TEMPLATE, personnelRates: [{ kind: 'volunteer', validFrom: '2026-01-01', amount: 21.3 }, { kind: 'fire-watch', validFrom: '2026-01-01', amount: 15 }] });
    // Only for chargeable incidents.
    const other = (await post('/incidents/incidents', { dispatchNumber: '2026-776', alarmKeyword: 'B-BMA', alarmedAt: T('08:00'), departmentIds: [ids.musterstadt] }).expect(201)).body;
    expect((await post('/cost-recovery/notices', { incidentId: other.id }).expect(409)).body.code).toBe('cost-recovery.notChargeable');
  });

  it('calculates a notice from the incident with the template and statute rates', async () => {
    const notice = (await post('/cost-recovery/notices', { incidentId: ids.incident }).expect(201)).body;
    ids.notice = notice.id;
    expect(notice).toMatchObject({ number: 'KE-2026-001', status: 'draft', offenseKey: 'fire-alarm-system', debtors: [{ name: 'Muster GmbH', role: 'owner' }], guestsNotCharged: 1 });
    // District equal to the city is not repeated.
    expect(notice.location).toBe('Industriestraße 4, 12345 Musterstadt');
    // Personnel 10:00–11:10 = 70 min → 2 h each (half an hour up to 30 min, beyond started hours) × 21,30 €; the guest is not charged.
    expect(notice.positions[0]).toMatchObject({ kind: 'personnel', quantity: 4, rate: 21.3, amount: 85.2, persons: 2, hoursEach: 2, label: 'Personal Musterstadt (2 Personen; 1 Gast nicht berechnet)' });
    // LF 20 10:04–10:50 = 46 min → 1 h × 205 €; MTW without own times from the report's departure: 10:04–11:10 → 2 h × 34 €.
    expect(notice.positions[1]).toMatchObject({ kind: 'vehicle', category: 'lf-20', quantity: 1, rate: 205, amount: 205 });
    expect(notice.positions[2]).toMatchObject({ kind: 'vehicle', category: 'mtw', quantity: 2, rate: 34, amount: 68 });
    expect(notice.total).toBe(358.2);
    expect(notice.reasoning).toContain('§ 34 Abs. 1 Satz 2 Nr. 6 FwG');
    await post('/cost-recovery/notices', { incidentId: ids.incident }).expect(409);
  });

  it('saves drafts without debtor, checks amounts and reasons, and issues only after the release for billing', async () => {
    const notice = (await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body;
    // A draft can be saved without debtor; submitting needs one.
    const withoutDebtor = (await put(`/cost-recovery/notices/${ids.notice}`, body(notice, { debtors: [{ name: '', street: '', postalCode: '', city: '', role: '' }] })).expect(200)).body;
    expect((await post(`/cost-recovery/notices/${ids.notice}/submit`, {}).expect(400)).body.code).toBe('cost-recovery.debtorIncomplete');
    const restored = (await put(`/cost-recovery/notices/${ids.notice}`, body(withoutDebtor, { debtors: notice.debtors })).expect(200)).body;

    // Amounts are never negative; a different amount needs a reason, also for positions added by hand (quantity × rate).
    const positions = restored.positions as { amount: number; reason: string }[];
    await put(`/cost-recovery/notices/${ids.notice}`, body(restored, { positions: positions.map((p, i) => (i === 2 ? { ...p, amount: -34 } : p)) })).expect(400);
    expect((await put(`/cost-recovery/notices/${ids.notice}`, body(restored, { positions: positions.map((p, i) => (i === 2 ? { ...p, amount: 34 } : p)) })).expect(400)).body.code).toBe('cost-recovery.reasonMissing');
    const material = { kind: 'material', label: 'Ölbindemittel', quantity: 2, unit: 'Sack', rate: 18.5, amount: 50, computedAmount: null, reason: '', category: null, vehicleId: null };
    expect((await put(`/cost-recovery/notices/${ids.notice}`, body(restored, { positions: [...positions, material] })).expect(400)).body.code).toBe('cost-recovery.reasonMissing');
    const changed = positions.map((p, i) => (i === 2 ? { ...p, amount: 34, reason: 'Nur Mannschaftstransport, eine Stunde' } : p));
    const saved = (await put(`/cost-recovery/notices/${ids.notice}`, body(restored, { positions: changed, cashReference: 'KZ-4711' })).expect(200)).body;
    expect(saved.total).toBe(324.2);

    await post(`/cost-recovery/notices/${ids.notice}/issue`, {}).expect(409);
    expect((await post(`/cost-recovery/notices/${ids.notice}/submit`, {}).expect(200)).body).toMatchObject({ status: 'review', submittedBy: 'Admin' });
    // The report is not released for billing yet.
    expect((await post(`/cost-recovery/notices/${ids.notice}/issue`, {}).expect(409)).body.code).toBe('cost-recovery.notReleased');
    await releaseForBilling(ids.report);
    // Four-eyes principle: the submitter cannot issue.
    await configure({ fourEyes: true });
    expect((await post(`/cost-recovery/notices/${ids.notice}/issue`, {}).expect(403)).body.code).toBe('cost-recovery.fourEyes');
    const issued = (await post(`/cost-recovery/notices/${ids.notice}/issue`, {}, treasurer).expect(200)).body;
    await configure({ fourEyes: false });
    expect(issued).toMatchObject({ status: 'issued', hasPdf: true, issuedBy: 'Kasse', submittedBy: 'Admin', balance: 324.2, overdue: false });
    expect(issued.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const pdf = await get(`/cost-recovery/notices/${ids.notice}/pdf`).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    // Issued notices cannot be edited any more, nor discarded.
    await put(`/cost-recovery/notices/${ids.notice}`, body(issued)).expect(409);
    await post(`/cost-recovery/notices/${ids.notice}/discard`, {}).expect(409);
  });

  it('hands over to the treasury once with the filter, and restores the status after a rejected objection', async () => {
    await configure({ handover: { format: 'csv', columns: ['cashReference', 'amount', 'number'] } });
    const preview = await get('/cost-recovery/export?year=2026').expect(200);
    expect(preview.headers['content-type']).toContain('text/csv');
    expect(preview.text.split('\r\n')[0]).toBe('﻿Kassenzeichen;Betrag (€);Aktenzeichen;Vorgang;Bezug;Differenz (€)');
    expect(preview.text).toContain('KZ-4711;324,20;KE-2026-001;Sollstellung;;');
    // The filter applies: another year has nothing.
    expect((await get('/cost-recovery/export?year=2025').expect(200)).text.split('\r\n').filter(Boolean)).toHaveLength(1);
    // The plain export marks nothing.
    expect((await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body.status).toBe('issued');

    const handover = await post('/cost-recovery/export/hand-over?year=2026', {}).expect(200);
    expect(handover.headers['x-handed-over']).toBe('1');
    expect(handover.text).toContain('KE-2026-001;Sollstellung');
    expect((await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body).toMatchObject({ status: 'handed-over', handedOverAt: expect.any(String) });
    // A second handover repeats nothing.
    const again = await post('/cost-recovery/export/hand-over?year=2026', {}).expect(200);
    expect(again.headers['x-handed-over']).toBe('0');
    expect(again.text).not.toContain('KE-2026-001');

    await post(`/cost-recovery/notices/${ids.notice}/objection`, { date: today, result: 'pending', note: 'Betreiber widerspricht' }).expect(200);
    const rejected = (await post(`/cost-recovery/notices/${ids.notice}/objection`, { date: today, result: 'rejected', note: 'Wartung versäumt' }).expect(200)).body;
    expect(rejected.status).toBe('handed-over');
  });

  it('records partial payments, reverses them and flags overpayments; the import matches only open notices', async () => {
    const notice = (await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body;
    expect((await post(`/cost-recovery/notices/${ids.notice}/payments`, { date: '2026-01-02', amount: 10 }).expect(400)).body.code).toBe('cost-recovery.paymentBeforeIssue');
    expect((await post(`/cost-recovery/notices/${ids.notice}/payments`, { date: '2099-01-02', amount: 10 }).expect(400)).body.code).toBe('cost-recovery.paymentInFuture');

    // The treasury reports a partial payment by file number: recorded with the remaining balance.
    const partial = await importPayments(`Aktenzeichen;Datum;Betrag\n${notice.number};${germanToday};100,00\nKE-0000-000;${germanToday};5\n`);
    expect(partial.counts).toMatchObject({ update: 1, error: 1 });
    expect(partial.rows[0]!.messages.map((m) => m.code)).toEqual(['cost-recovery.import.partialPayment']);
    expect((await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body).toMatchObject({ status: 'handed-over', paid: 100, balance: 224.2, paidOn: null });
    // Imported again: not booked twice.
    expect((await importPayments(`Aktenzeichen;Datum;Betrag\n${notice.number};${germanToday};100,00\n`).then((r) => r.counts))).toMatchObject({ unchanged: 1, update: 0 });
    // By cash reference without amount: the rest.
    await importPayments(`Kassenzeichen;Datum\nKZ-4711;${germanToday}\n`);
    const paid = (await get(`/cost-recovery/notices/${ids.notice}`).expect(200)).body;
    expect(paid).toMatchObject({ status: 'paid', paid: 324.2, balance: 0, paidOn: today });

    // Reversal with reason: open again in the status before.
    const first = paid.payments[0];
    await post(`/cost-recovery/notices/${ids.notice}/payments/${first.id}/reverse`, { reason: 'x' }).expect(400);
    const reversed = (await post(`/cost-recovery/notices/${ids.notice}/payments/${first.id}/reverse`, { reason: 'Fehlbuchung der Kasse' }).expect(200)).body;
    expect(reversed).toMatchObject({ status: 'handed-over', paid: 224.2, balance: 100, paidOn: null });
    expect(reversed.payments[0].reversal).toMatchObject({ reason: 'Fehlbuchung der Kasse', by: 'Admin' });
    const overpaid = (await post(`/cost-recovery/notices/${ids.notice}/payments`, { date: today, amount: 110, note: 'Überweisung' }).expect(200)).body;
    expect(overpaid).toMatchObject({ status: 'paid', balance: -10 });

    expect((await get('/core/lists/cost-recovery.year?year=2026').expect(200)).body.rows).toEqual([expect.objectContaining({ count: 1, amount: 324.2, paid: 334.2 })]);
    expect((await get('/core/lists/cost-recovery.fire-alarms?from=2026-01-01&to=2026-12-31').expect(200)).body.rows).toEqual([expect.objectContaining({ object: 'Muster GmbH', count: 1 })]);
    await get('/core/lists/cost-recovery.open').expect(200);
    await get('/core/lists/cost-recovery.without-notice').expect(200);
  });

  it('bills career staff with the rate of their career group', async () => {
    const carla = (await post('/masterdata/persons', { firstName: 'Carla', lastName: 'Test', status: 'active', employment: 'career-intermediate', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-778', alarmKeyword: 'B-BMA', alarmedAt: T('14:00'), departmentIds: [ids.musterstadt] }).expect(201)).body;
    ids.careerReport = incident.reports[0].id;
    await put(`/incidents/reports/${ids.careerReport}`, {
      times: { alarmedAt: T('14:00'), departedAt: T('14:04'), returnedAt: T('14:50') },
      situation: 'BMA', actions: 'Erkundung', incidentCommander: 'Jonas Test',
      personnel: [{ personId: ids.jonas, vehicleId: ids.lf }, { personId: carla, vehicleId: ids.lf }],
      vehicles: [{ vehicleId: ids.lf }],
      involvedParties: [{ role: 'owner', name: 'Muster GmbH', street: 'Industriestraße 4', postalCode: '12345', city: 'Musterstadt' }],
      statistics: { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' },
    }).expect(200);
    await put(`/incidents/incidents/${incident.id}/costs`, { chargeable: true, chargeableReason: 'Verursacher bekannt' }).expect(200);
    const settings = (await get('/core/settings/cost-recovery.general').expect(200)).body ?? {};
    await configure({ personnelRates: [...(settings.personnelRates ?? []), { kind: 'career-intermediate', validFrom: '2026-01-01', amount: 70 }] });
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

  it('needs a unique cash reference, carries payments over to an amendment and reports changes after the handover', async () => {
    const notices = (await get('/cost-recovery/notices?year=2026').expect(200)).body as { id: string; dispatchNumber: string }[];
    const id = notices.find((n) => n.dispatchNumber === '2026-778')!.id;
    await post(`/cost-recovery/notices/${id}/amend`, {}).expect(409);
    await releaseForBilling(ids.careerReport);
    await post(`/cost-recovery/notices/${id}/submit`, {}).expect(200);
    // The cash reference may be required, and belongs to one notice in effect only.
    await configure({ cashReferenceRequired: true });
    expect((await post(`/cost-recovery/notices/${id}/issue`, {}).expect(400)).body.code).toBe('cost-recovery.cashReferenceMissing');
    const review = (await get(`/cost-recovery/notices/${id}`).expect(200)).body;
    const used = (await put(`/cost-recovery/notices/${id}`, body(review, { cashReference: 'KZ-4711' })).expect(200)).body;
    expect((await post(`/cost-recovery/notices/${id}/issue`, {}).expect(409)).body.code).toBe('cost-recovery.cashReferenceUsed');
    await put(`/cost-recovery/notices/${id}`, body(used, { cashReference: 'KZ-4712' })).expect(200);
    const issued = (await post(`/cost-recovery/notices/${id}/issue`, {}).expect(200)).body;
    await configure({ cashReferenceRequired: false });

    // A rejected objection on a notice never handed over leaves it issued.
    await post(`/cost-recovery/notices/${id}/objection`, { date: today, result: 'pending', note: '' }).expect(200);
    expect((await post(`/cost-recovery/notices/${id}/objection`, { date: today, result: 'rejected', note: '' }).expect(200)).body.status).toBe('issued');

    await post('/cost-recovery/export/hand-over', {}).expect(200);
    await post(`/cost-recovery/notices/${id}/payments`, { date: today, amount: 50 }).expect(200);
    const amendment = (await post(`/cost-recovery/notices/${id}/amend`, {}).expect(201)).body;
    expect(amendment).toMatchObject({ number: `${issued.number}-Ä1`, status: 'draft', cashReference: 'KZ-4712', amends: { id, number: issued.number }, positions: issued.positions });
    await post(`/cost-recovery/notices/${id}/amend`, {}).expect(409);
    // Lower amount with reason, then issue: the original is replaced and no longer counts, its payment carries over.
    const positions = amendment.positions.map((p: { amount: number }, i: number) => (i === 0 ? { ...p, amount: p.amount - 10, reason: 'Fehler in der Personalzeit' } : p));
    await put(`/cost-recovery/notices/${amendment.id}`, body(amendment, { positions })).expect(200);
    await post(`/cost-recovery/notices/${amendment.id}/submit`, {}).expect(200);
    const replacing = (await post(`/cost-recovery/notices/${amendment.id}/issue`, {}).expect(200)).body;
    expect(replacing).toMatchObject({ paid: 50, balance: issued.total - 10 - 50 });
    expect(replacing.payments[0].note).toContain(`aus ${issued.number}`);
    expect((await get(`/cost-recovery/notices/${id}`).expect(200)).body).toMatchObject({ status: 'amended', amendedBy: { id: amendment.id } });
    const pdf = await get(`/cost-recovery/notices/${amendment.id}/pdf`).buffer(true).expect(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    // The treasury learns about the amendment with the difference, and later about the cancellation.
    const changes = await post('/cost-recovery/export/hand-over', {}).expect(200);
    expect(changes.text).toContain(`KZ-4712;${(issued.total - 10).toFixed(2).replace('.', ',')};${amendment.number};Änderung;${issued.number};-10,00`);
    await post(`/cost-recovery/notices/${amendment.id}/cancel`, { reason: 'Verzicht wegen unbilliger Härte' }).expect(200);
    const cancellation = await post('/cost-recovery/export/hand-over', {}).expect(200);
    expect(cancellation.text).toContain(`;${amendment.number};Aufhebung;;-${(issued.total - 10).toFixed(2).replace('.', ',')}`);
    expect((await post('/cost-recovery/export/hand-over', {}).expect(200)).text).not.toContain('Aufhebung');
  });

  it('marks overdue notices, finds them, creates a task and a payment reminder', async () => {
    const id = ((await get('/cost-recovery/notices?q=KE-2026-001').expect(200)).body as { id: string }[])[0]!.id;
    // Open again (reverse the last payment) and past due.
    const notice = (await get(`/cost-recovery/notices/${id}`).expect(200)).body;
    await post(`/cost-recovery/notices/${id}/payments/${notice.payments.at(-1).id}/reverse`, { reason: 'Rücklastschrift' }).expect(200);
    await test.app.get(EntityManager).getConnection().execute(`update cost_recovery.notice set due_on = '2026-01-31' where id = '${id}'`);
    expect((await get(`/cost-recovery/notices/${id}`).expect(200)).body).toMatchObject({ overdue: true, balance: 100 });
    expect(((await get('/cost-recovery/notices?overdue=true').expect(200)).body as { id: string }[]).map((n) => n.id)).toEqual([id]);
    // Search by debtor, number or dispatch number, also in the global search.
    expect(((await get('/cost-recovery/notices?q=muster 777').expect(200)).body as { id: string }[]).map((n) => n.id)).toEqual([id]);
    expect(((await get('/core/search?q=KE-2026-001').expect(200)).body as { to: string }[]).some((h) => h.to === `/cost-recovery/notices/${id}`)).toBe(true);
    const tasks = (await get(`/core/tasks?asOf=${today}`).expect(200)).body as { kind: string; subject: { id: string } }[];
    expect(tasks.some((t) => t.kind === 'cost-recovery-overdue' && t.subject.id === id)).toBe(true);

    const reminded = (await post(`/cost-recovery/notices/${id}/reminders`, {}).expect(200)).body;
    expect(reminded.reminders).toEqual([expect.objectContaining({ date: today, by: 'Admin' })]);
    const letter = await get(`/cost-recovery/notices/${id}/reminders/0/pdf`).buffer(true).expect(200);
    expect(letter.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('keeps an address book of frequent debtors', async () => {
    const entry = (await post('/cost-recovery/debtors', { name: 'Versicherung AG', street: 'Hauptstraße 1', postalCode: '89073', city: 'Kreisstadt' }).expect(201)).body;
    expect((await get('/cost-recovery/debtors').expect(200)).body).toEqual([expect.objectContaining({ id: entry.id, name: 'Versicherung AG' })]);
  });

  it('bills every vehicle with crew once, merges debtors of several reports and discards a draft', async () => {
    const ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-779', alarmKeyword: 'B-BMA', alarmedAt: T('14:00'), departmentIds: [ids.musterstadt, ahornfeld] }).expect(201)).body;
    const [own, support] = incident.reports;
    const owner = { role: 'owner', name: 'Muster GmbH', street: 'Industriestraße 4', postalCode: '12345', city: 'Musterstadt' };
    // The crew sits on the LF, but the report lists no vehicles (as imports and the API used to leave it).
    const saved = await put(`/incidents/reports/${own.id}`, {
      times: { alarmedAt: T('14:00'), departedAt: T('14:10'), returnedAt: T('14:40') },
      situation: 'BMA', actions: 'Erkundung',
      personnel: [{ personId: ids.jonas, vehicleId: ids.lf }],
      involvedParties: [owner],
      statistics: { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' },
    }).expect(200);
    expect(saved.body.vehicles).toEqual([expect.objectContaining({ vehicleId: ids.lf, departedAt: null, returnedAt: null })]);
    // The other department's report lists the same LF with own, longer times, and the same owner.
    await put(`/incidents/reports/${support.id}`, {
      times: { alarmedAt: T('14:00'), departedAt: T('14:05'), returnedAt: T('15:20') },
      situation: 'Unterstützung', actions: 'Bereitstellung',
      vehicles: [{ vehicleId: ids.lf, departedAt: T('14:05'), returnedAt: T('15:20') }],
      involvedParties: [{ ...owner, name: 'Muster  GmbH' }],
    }).expect(200);
    await put(`/incidents/incidents/${incident.id}/costs`, { chargeable: true, chargeableReason: 'Verursacher bekannt' }).expect(200);

    const notice = (await post('/cost-recovery/notices', { incidentId: incident.id }).expect(201)).body;
    expect(notice.debtors).toHaveLength(1);
    const vehicles = (notice.positions as { kind: string; vehicleId: string; quantity: number; amount: number }[]).filter((p) => p.kind === 'vehicle');
    // Once, 14:05–15:20 = 75 min → 2 h × 205 €.
    expect(vehicles).toEqual([expect.objectContaining({ vehicleId: ids.lf, quantity: 2, amount: 410 })]);

    // The incident beside the notice, with names and its state for billing.
    const view = (await get(`/cost-recovery/notices/${notice.id}/incident`).expect(200)).body;
    expect(view).toMatchObject({ dispatchNumber: '2026-779', chargeable: true, released: false });
    expect(view.reports[0]).toMatchObject({ department: 'Abteilung Musterstadt', departedAt: new Date(T('14:10')).toISOString(), vehicles: [expect.objectContaining({ name: 'Florian Musterstadt 1/44', crew: 1 })] });
    expect(view.reports[0].personnel).toEqual([expect.objectContaining({ vehicle: 'Florian Musterstadt 1/44', standby: false })]);

    // The incident page lists the notice; a discarded draft makes room for a new one.
    expect((await get(`/cost-recovery/incidents/${incident.id}/notices`).expect(200)).body).toEqual([expect.objectContaining({ id: notice.id, status: 'draft' })]);
    await post(`/cost-recovery/notices/${notice.id}/cancel`, { reason: 'Nicht erlassen' }).expect(409);
    expect((await post(`/cost-recovery/notices/${notice.id}/discard`, {}).expect(200)).body.status).toBe('discarded');
    const candidate = ((await get('/cost-recovery/candidates?from=2026-01-01&to=2026-12-31').expect(200)).body as { incidentId: string; noticeId: string | null }[]).find((c) => c.incidentId === incident.id);
    expect(candidate?.noticeId).toBeNull();
    await post('/cost-recovery/notices', { incidentId: incident.id }).expect(201);
  });
});
