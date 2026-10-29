import type { AccessReportFixture, SeedResult } from './fixture';

/**
 * Person file of the member: career, courses, honours, offices, rest period, an internal remark by the commander, own
 * changes in "Mein Bereich" (mobile number, bank account) and the driving licence checked by the other member.
 */
export async function seedMasterdata(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, get, ids } = fx;
  const person = `/masterdata/persons/${ids.person}`;
  await post(`${person}/ranks`, { rank: 'lm', since: '2016-03-20', notes: '' }).expect(201);
  await post(`${person}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: '2012-11-08' }, fx.other).expect(201);
  await post(`${person}/course-attendances`, { course: 'other-course', startsOn: '2024-03-01', result: 'passed', description: 'Motorsäge Grundkurs' }).expect(201);
  await post('/masterdata/course-nominations', { personId: ids.person, course: 'truppmann-1', priority: 1 }).expect(201);
  await post(`${person}/honors`, { honor: 'state-honor-silver', awardedOn: '2025-05-01' }).expect(201);
  await post(`${person}/offices`, { office: 'commander', from: '2020-01-01', notes: 'Stellvertretung' }).expect(201);
  await post(`${person}/rest-periods`, { reason: 'dormant', from: '2018-01-01', to: '2018-06-30', notes: 'Auslandsaufenthalt' }).expect(201);

  // Internal remark by the commander (protocol: „Kommandant Test“).
  const file = (await get(person).expect(200)).body;
  const { id: _i, rank: _r, memberships: _m, qualifications: _q, ranks: _rs, honors: _h, offices: _o, restPeriods: _rp, sensitiveHidden: _s, status: _st, probationEndsOn: _p, probationDecidedOn: _pd, admittedOn: _a, leftOn: _l, exitReason: _e, anonymizedAt: _an, ...fields } = file;
  await put(person, { ...fields, birthDate: '1988-06-14', notes: 'Probezeit verkürzt wegen Übernahme aus der Jugendfeuerwehr' }, fx.other).expect(200);

  // Own changes in "Mein Bereich" (protocol: „Sie selbst“).
  const me = (await get('/masterdata/me', fx.member).expect(200)).body;
  await put('/masterdata/me', {
    version: me.version,
    street: 'Lindenweg 4',
    postalCode: '12345',
    city: 'Musterstadt',
    phonePrivate: '',
    phoneMobile: '0170 0000000',
    phoneWork: '',
    email: 'tobias.probe@example.org',
    bank: { iban: 'DE02120300000000202051', accountHolder: 'Tobias Probe' },
  }, fx.member).expect(200);

  // Driving licence, checked by the other member (named only by function).
  await post(`${person}/driver-license/checks`, { checkedOn: '2026-01-15', checkedById: ids.otherPerson, originalPresented: true, classes: [{ class: 'B', expiresOn: null }, { class: 'C', expiresOn: '2031-04-16' }], documentExpiresOn: '2034-04-16', note: 'Ersterfassung' }).expect(201);
  await post(`${person}/driver-license/requests`, { reason: 'Unfall mit Dienstfahrzeug', dueOn: '2027-01-31' }).expect(201);

  return {
    expect: [
      'Herr Tobias Probe',
      '14.06.1988',
      'Lindenweg 4, 12345 Musterstadt',
      '0170 0000000',
      'IBAN endet auf 2051',
      'Probezeit verkürzt wegen Übernahme aus der Jugendfeuerwehr',
      'Musterstadt',
      'Stammabteilung',
      'Motorsäge Grundkurs',
      'vorgemerkt',
      'Ruhen der Mitgliedschaft',
      'Auslandsaufenthalt',
      'Stellvertretung',
      'Vorlage bei der Feuerwehr',
      'C (bis 16.04.2031)',
      'Kommandant Test',
      'Unfall mit Dienstfahrzeug',
    ],
    sections: ['masterdata', 'masterdata.driver-license'],
  };
}
