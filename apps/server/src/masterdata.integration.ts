import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainEvents } from '@forga/core-api';
import {
  MASTERDATA_EVENTS,
  PERSON_DIRECTORY,
  type PersonDirectory,
  type PersonLeftEvent,
} from '@forga/masterdata-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) =>
  test.http.post(`/api/masterdata/${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) =>
  test.http.put(`/api/masterdata/${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api/masterdata/${path}`).set('Cookie', cookie);

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
});

afterAll(() => test?.app.close());

describe('catalogs', () => {
  it('applies the BW templates once and validates keys', async () => {
    const first = await post('catalog/templates/bw', {}).expect(201);
    expect(first.body.added).toMatchObject({ rank: 11, 'vehicle-type': 19, qualification: 20 });
    const second = await post('catalog/templates/bw', {}).expect(201);
    expect(second.body.added).toEqual({});

    const courses = await post('courses/templates/bw', {}).expect(201);
    expect(courses.body.added).toBe(14);

    const ranks = await get('catalog?kind=rank').expect(200);
    expect(ranks.body[1]).toMatchObject({ key: 'fm', name: { de: 'Feuerwehrmann/-frau' } });

    await post('catalog', { kind: 'rank', key: 'fm', name: { de: 'x', en: 'x' } }).expect(409);
    const invalid = await post('catalog', {
      kind: 'vehicle-type',
      key: 'hlf-10',
      name: { de: 'HLF 10', en: 'HLF 10' },
      attributes: { seats: 'neun' },
    }).expect(400);
    expect(invalid.body.issues[0].path).toBe('attributes.seats');
  });
});

describe('organization', () => {
  it('creates departments, stations and vehicles with defaults from the vehicle type', async () => {
    ids.musterstadt = (await post('departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
    ids.ahornfeld = (await post('departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational', specialTasks: ['height-rescue'] }).expect(201)).body.id;
    const veterans = await post('departments', {
      name: 'Altersabteilung Ahornfeld',
      shortName: 'Alt. Ahornfeld',
      type: 'veterans',
      parentId: ids.ahornfeld,
    }).expect(201);
    expect(veterans.body).toMatchObject({ parentId: ids.ahornfeld, statisticsRelevant: true });

    ids.station = (await post('stations', { name: 'Feuerwehrhaus Musterstadt', departmentId: ids.musterstadt, permanentlyStaffed: false }).expect(201)).body.id;
    const vehicle = await post('vehicles', {
      designation: 'LF 20/16',
      radioCallSign: 'Florian Musterstadt 1/44',
      vehicleType: 'lf-20-16',
      departmentId: ids.musterstadt,
      stationId: ids.station,
    }).expect(201);
    expect(vehicle.body).toMatchObject({ seats: 9, statisticsCategory: 'F70', status: 'in-service' });

    const unknown = await post('vehicles', { designation: 'X', vehicleType: 'nope', departmentId: ids.musterstadt }).expect(400);
    expect(unknown.body.code).toBe('catalog.unknownKey');
    await post('vehicles', { designation: 'X', vehicleType: 'lf-20', statisticsCategory: 'F999', departmentId: ids.musterstadt }).expect(400);
  });
});

describe('persons', () => {
  it('starts new members in probation and computes the end of the probation', async () => {
    const person = await post('persons', {
      firstName: 'Jonas',
      lastName: 'Keller',
      personnelNumber: '1001',
      joinedOn: '2026-03-15',
      birthDate: '2000-05-01',
      bank: { iban: 'DE89 3704 0044 0532 0130 00', accountHolder: 'Jonas Keller' },
      memberships: [{ departmentId: ids.ahornfeld, from: '2026-03-15', primary: true }],
    }).expect(201);
    ids.jonas = person.body.id;
    expect(person.body).toMatchObject({
      status: 'probation',
      probationEndsOn: '2027-03-14',
      birthDate: '2000-05-01',
      bank: { iban: 'DE89370400440532013000' },
      sensitiveHidden: false,
    });

    ids.lena = (await post('persons', {
      firstName: 'Lena',
      lastName: 'Brenner',
      status: 'active',
      memberships: [{ departmentId: ids.musterstadt, from: '2015-01-01', primary: true }],
    }).expect(201)).body.id;

    await post('persons', { firstName: 'X', lastName: 'Y', personnelNumber: '1001', memberships: [{ departmentId: ids.ahornfeld, from: '2026-01-01', primary: true }] }).expect(409);
    const noPrimary = await post('persons', { firstName: 'X', lastName: 'Y', memberships: [{ departmentId: ids.ahornfeld, from: '2026-01-01' }] }).expect(400);
    expect(noPrimary.body.code).toBe('masterdata.primaryMembershipRequired');
  });

  it('records qualifications, ranks and honors and shows them in the history of the person', async () => {
    await post(`persons/${ids.jonas}/ranks`, { rank: 'probation', since: '2026-03-15' }).expect(201);
    await post(`persons/${ids.jonas}/honors`, { honor: 'unknown', awardedOn: '2026-01-01' }).expect(400);
    await post(`persons/${ids.jonas}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: '2026-04-01' }).expect(201);

    const person = await get(`persons/${ids.jonas}`).expect(200);
    expect(person.body.rank).toBe('probation');
    expect(person.body.qualifications.map((q: { qualification: string }) => q.qualification)).toEqual(['breathing-apparatus']);

    const history = await test.http.get(`/api/core/history/masterdata.person/${ids.jonas}`).set('Cookie', admin).expect(200);
    const entities = history.body.map((e: { entity: string }) => e.entity);
    expect(entities).toEqual(
      expect.arrayContaining(['masterdata.person', 'masterdata.membership', 'masterdata.rank_assignment', 'masterdata.person_qualification']),
    );
  });

  it('prints honor certificates as serial PDF', async () => {
    const award = (await post(`persons/${ids.jonas}/honors`, { honor: 'state-honor-silver', awardedOn: '2026-05-01' }).expect(201)).body.honors[0];
    await get('persons/honors/certificates.pdf?from=2025-01-01&to=2025-12-31').expect(404);
    for (const query of ['from=2026-01-01&to=2026-12-31&honor=state-honor-silver', `ids=${award.id}`]) {
      const pdf = await get(`persons/honors/certificates.pdf?${query}`).buffer(true).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    }
  });

  it('handles probation changes, admission and status rules', async () => {
    await put(`persons/${ids.jonas}/probation`, { probationEndsOn: '2026-09-15', reason: 'Jugendfeuerwehr', decidedOn: '2026-04-10' }).expect(200);
    const admitted = await post(`persons/${ids.jonas}/admission`, { decidedOn: '2026-09-20' }).expect(201);
    expect(admitted.body).toMatchObject({ status: 'active', admittedOn: '2026-09-20', probationEndsOn: '2026-09-15' });
    await post(`persons/${ids.jonas}/admission`, { decidedOn: '2026-09-21' }).expect(400);
  });
});

describe('department-scoped access', () => {
  let commander: string;

  it('limits a department commander to the persons of the department and hides sensitive data', async () => {
    const role = await test.http
      .post('/api/core/roles')
      .set('Cookie', admin)
      .set(UI)
      .send({ name: 'AK Test', permissions: ['masterdata.persons.read', 'masterdata.persons.write', 'masterdata.courses.plan'] })
      .expect(201);
    await test.http
      .post('/api/core/users')
      .set('Cookie', admin)
      .set(UI)
      .send({ username: 'ak.ahornfeld', displayName: 'AK Ahornfeld', password: 'auch-sehr-geheim', roles: [{ roleId: role.body.id, departmentId: ids.ahornfeld }] })
      .expect(201);
    commander = await test.login({ username: 'ak.ahornfeld', password: 'auch-sehr-geheim' });

    const list = await get('persons', commander).expect(200);
    expect(list.body.map((p: { lastName: string }) => p.lastName)).toEqual(['Keller']);
    await get(`persons/${ids.lena}`, commander).expect(404);

    const jonas = await get(`persons/${ids.jonas}`, commander).expect(200);
    expect(jonas.body.sensitiveHidden).toBe(true);
    expect(jonas.body).not.toHaveProperty('birthDate');
    expect(jonas.body).not.toHaveProperty('bank');

    // Sensitive fields sent without permission are ignored, not overwritten.
    const { id: _id, version: _v, rank: _r, memberships: _m, qualifications: _q, ranks: _ra, honors: _h, sensitiveHidden: _s, status: _st,
      probationEndsOn: _pe, probationDecidedOn: _pd, admittedOn: _a, leftOn: _l, exitReason: _e, ...fields } = jonas.body;
    await put(`persons/${ids.jonas}`, { ...fields, phoneMobile: '0170 123', birthDate: '1999-01-01' }, commander).expect(200);
    const asAdmin = await get(`persons/${ids.jonas}`).expect(200);
    expect(asAdmin.body).toMatchObject({ phoneMobile: '0170 123', birthDate: '2000-05-01' });

    // History: own department readable with sensitive fields masked, other departments not at all.
    const history = await test.http.get(`/api/core/history/masterdata.person/${ids.jonas}`).set('Cookie', commander).expect(200);
    const created = history.body.find((e: { entity: string; action: string }) => e.entity === 'masterdata.person' && e.action === 'created');
    expect(created.changes.bank).toEqual({ old: null, new: null, hidden: true });
    expect(JSON.stringify(history.body)).not.toContain('DE89370400440532013000');
    await test.http.get(`/api/core/history/masterdata.person/${ids.lena}`).set('Cookie', commander).expect(404);
    const asAdminHistory = await test.http.get(`/api/core/history/masterdata.person/${ids.jonas}`).set('Cookie', admin).expect(200);
    expect(JSON.stringify(asAdminHistory.body)).toContain('DE89370400440532013000');

    // Moving a person into a department outside the own grant is forbidden.
    await put(`persons/${ids.jonas}/memberships`, [{ departmentId: ids.musterstadt, from: '2026-03-15', primary: true }], commander).expect(403);
    // Saving with an outdated version is refused instead of overwriting someone else's change.
    const current = (await get(`persons/${ids.jonas}`)).body;
    const { id: _i, version, rank: _rk, memberships: _ms, qualifications: _qs, ranks: _rs, honors: _hs, sensitiveHidden: _sh, status: _stt, probationEndsOn: _pend, anonymizedAt: _anon, ...editable } = current;
    expect((await put(`persons/${ids.jonas}`, { ...editable, version: version - 1 }).expect(409)).body.code).toBe('conflict.stale');
    await put(`persons/${ids.jonas}`, { ...editable, version }).expect(200);

    // A past membership in another department survives when the department commander saves the own ones.
    await put(`persons/${ids.jonas}/memberships`, [{ departmentId: ids.ahornfeld, from: '2026-03-15', primary: true }, { departmentId: ids.musterstadt, from: '2010-01-01', to: '2014-12-31' }]).expect(200);
    const saved = await put(`persons/${ids.jonas}/memberships`, [{ departmentId: ids.ahornfeld, from: '2026-03-15', primary: true }], commander).expect(200);
    expect(saved.body.memberships.map((m: { departmentId: string }) => m.departmentId).toSorted()).toEqual([ids.ahornfeld, ids.musterstadt].toSorted());
  });

  it('plans courses across the departments the user may plan for', async () => {
    const before = await get('course-planning/radio-operator', commander).expect(200);
    // Jonas lacks Truppmann Teil 1, so he is not yet a candidate.
    expect(before.body.candidates).toEqual([]);

    await post(`persons/${ids.jonas}/course-attendances`, { course: 'truppmann-1', startsOn: '2026-04-01', endsOn: '2026-06-30', result: 'passed' }, commander).expect(201);
    const candidates = await get('course-planning/radio-operator', commander).expect(200);
    expect(candidates.body.candidates.map((p: { id: string }) => p.id)).toEqual([ids.jonas]);

    await post('course-nominations', { personId: ids.jonas, course: 'radio-operator', priority: 1 }, commander).expect(201);
    await post('course-nominations', { personId: ids.jonas, course: 'radio-operator' }, commander).expect(409);
    await post('course-nominations', { personId: ids.lena, course: 'radio-operator' }, commander).expect(404);

    const planned = await get('course-planning/radio-operator', commander).expect(200);
    expect(planned.body.candidates).toEqual([]);
    expect(planned.body.nominations[0]).toMatchObject({ person: { id: ids.jonas }, prerequisitesMet: true });

    await post(`persons/${ids.jonas}/course-attendances`, { course: 'radio-operator', startsOn: '2026-10-01', result: 'passed' }, commander).expect(201);
    const nominations = await get('course-nominations?course=radio-operator', commander).expect(200);
    expect(nominations.body[0].status).toBe('completed');

    const person = await get(`persons/${ids.jonas}`, commander).expect(200);
    expect(person.body.qualifications.map((q: { qualification: string }) => q.qualification).toSorted()).toEqual([
      'breathing-apparatus',
      'radio-operator',
      'truppmann-1',
    ]);
  });
});

describe('course coordinator', () => {
  it('uses the standard role to plan courses and record attendances, but not to edit persons', async () => {
    const roles = (await test.http.get('/api/core/roles').set('Cookie', admin)).body as { templateKey: string; name: string; id: string }[];
    const coordinator = roles.find((r) => r.templateKey === 'course-coordinator')!;
    expect(coordinator.name).toBe('Lehrgangsbeauftragter');
    await test.http
      .post('/api/core/users')
      .set('Cookie', admin)
      .set(UI)
      .send({ username: 'lehrgang', displayName: 'Lehrgangsbeauftragter', password: 'auch-sehr-geheim', roles: [{ roleId: coordinator.id, departmentId: null }] })
      .expect(201);
    const cookie = await test.login({ username: 'lehrgang', password: 'auch-sehr-geheim' });

    await post('course-nominations', { personId: ids.lena, course: 'truppmann-1' }, cookie).expect(201);
    const planning = await get('course-planning/truppmann-1', cookie).expect(200);
    expect(planning.body.nominations.map((n: { person: { id: string } }) => n.person.id)).toEqual([ids.lena]);
    await post(`persons/${ids.lena}/course-attendances`, { course: 'truppmann-1', startsOn: '2026-05-01', result: 'passed' }, cookie).expect(201);

    const lena = await get(`persons/${ids.lena}`, cookie).expect(200);
    expect(lena.body.qualifications.map((q: { qualification: string }) => q.qualification)).toEqual(['truppmann-1']);
    expect(lena.body.sensitiveHidden).toBe(true);
    await post(`persons/${ids.lena}/qualifications`, { qualification: 'machinist', acquiredOn: '2026-01-01' }, cookie).expect(403);
    // The course catalog stays with the administrator.
    await post('courses', { key: 'x', name: { de: 'X', en: 'X' }, level: 'district' }, cookie).expect(403);
  });
});

describe('leaving and other modules', () => {
  it('closes memberships, publishes an event and keeps the person visible for the department', async () => {
    const events: PersonLeftEvent[] = [];
    test.app.get(DomainEvents).subscribe<PersonLeftEvent>(MASTERDATA_EVENTS.personLeft, (e) => {
      events.push(e);
    });

    const left = await post(`persons/${ids.lena}/leave`, { leftOn: '2026-10-31', exitReason: 'relocation' }).expect(201);
    expect(left.body).toMatchObject({ status: 'left', leftOn: '2026-10-31' });
    expect(left.body.memberships[0].to).toBe('2026-10-31');
    expect(events).toEqual([{ personId: ids.lena, leftOn: '2026-10-31', exitReason: 'relocation' }]);

    const active = await get('persons').expect(200);
    expect(active.body.map((p: { lastName: string }) => p.lastName)).toEqual(['Keller']);
    const all = await get('persons?includeLeft=true').expect(200);
    expect(all.body).toHaveLength(2);
  });

  it('offers a person directory to other modules', async () => {
    const directory = test.app.get<PersonDirectory>(PERSON_DIRECTORY);
    const [jonas] = await directory.snapshots([ids.jonas], '2026-10-15');
    expect(jonas).toMatchObject({
      primaryDepartmentId: ids.ahornfeld,
      qualifications: ['breathing-apparatus', 'radio-operator', 'truppmann-1'],
      rank: 'probation',
    });
    expect((await directory.search('kel')).map((p) => p.id)).toEqual([ids.jonas]);
    expect(await directory.findByPersonnelNumber('1001')).toMatchObject({ id: ids.jonas });

    // Offices with period: added, ended and offered to other modules; an unknown office is refused.
    await post(`persons/${ids.jonas}/offices`, { office: 'gibt-es-nicht', from: '2024-01-01' }).expect(400);
    const added = (await post(`persons/${ids.jonas}/offices`, { office: 'youth-warden', departmentId: ids.ahornfeld, from: '2024-01-01' }).expect(201)).body;
    const office = added.offices[0];
    expect(office).toMatchObject({ office: 'youth-warden', departmentId: ids.ahornfeld, from: '2024-01-01', to: null });
    await put(`persons/${ids.jonas}/offices/${office.id}`, { office: 'youth-warden', departmentId: ids.ahornfeld, from: '2024-01-01', to: '2023-12-31' }).expect(400);
    await put(`persons/${ids.jonas}/offices/${office.id}`, { office: 'youth-warden', departmentId: ids.ahornfeld, from: '2024-01-01', to: '2026-06-30' }).expect(200);
    expect(await directory.offices({ offices: ['youth-warden'] })).toEqual([{ personId: ids.jonas, office: 'youth-warden', departmentId: ids.ahornfeld, from: '2024-01-01', to: '2026-06-30' }]);
    expect((await directory.careers([ids.jonas]))[0].offices).toEqual([{ office: 'youth-warden', departmentId: ids.ahornfeld, from: '2024-01-01', to: '2026-06-30' }]);
  });
});

describe('permissions in the own and in other departments', () => {
  it('lets a department commander edit the own department and see only the directory of others', async () => {
    const core = (method: 'get' | 'post' | 'put', path: string, body?: unknown) => {
      const request = test.http[method](`/api/core/${path}`).set('Cookie', admin).set(UI);
      return body === undefined ? request : request.send(body as object);
    };
    const roles = (await core('get', 'roles')).body as { id: string; templateKey: string | null; permissionsAllDepartments: string[] }[];
    const role = roles.find((r) => r.templateKey === 'department-commander')!;
    expect(role.permissionsAllDepartments).toEqual(['masterdata.persons.directory']);

    await core('post', 'users', { username: 'kdt.musterstadt', displayName: 'Abt.-Kdt. Musterstadt', password: 'auch-sehr-geheim', roles: [{ roleId: role.id, departmentId: ids.musterstadt }] }).expect(201);
    const kdt = await test.login({ username: 'kdt.musterstadt', password: 'auch-sehr-geheim' });
    const session = (await test.http.get('/api/core/session').set('Cookie', kdt)).body;
    expect(session.permissions['masterdata.persons.directory']).toBe('brigade');
    expect(session.permissions['masterdata.persons.read']).toEqual([ids.musterstadt]);
    expect(session.permissions['masterdata.persons.sensitive']).toEqual([ids.musterstadt]);
    expect(session.permissions['masterdata.persons.write']).toEqual([ids.musterstadt]);

    const own = (await post('persons', { firstName: 'Ole', lastName: 'Musterstadt', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2024-01-01', primary: true }] }, kdt).expect(201)).body.id;
    const other = (
      await post('persons', { personnelNumber: 'B-77', firstName: 'Bea', lastName: 'Ahornfeld', phoneMobile: '0170 9', birthDate: '1990-01-01', status: 'active', memberships: [{ departmentId: ids.ahornfeld, from: '2024-01-01', primary: true }] }).expect(201)
    ).body.id;
    await post('persons', { firstName: 'Nein', lastName: 'Ahornfeld', status: 'active', memberships: [{ departmentId: ids.ahornfeld, from: '2024-01-01', primary: true }] }, kdt).expect(403);

    // Other departments: name, status and department only, no personnel file.
    await get(`persons/${other}`, kdt).expect(404);
    await put(`persons/${other}`, { firstName: 'Bea', lastName: 'Geändert' }, kdt).expect(404);
    await put(`persons/${own}`, { firstName: 'Ole', lastName: 'Musterstadt', phoneMobile: '0151 1', birthDate: '1995-05-05' }, kdt).expect(200);
    const list = (await get('persons', kdt)).body as { id: string; restricted?: boolean; phoneMobile: string; personnelNumber: string | null; primaryDepartmentId: string }[];
    expect(list.find((p) => p.id === other)).toMatchObject({ restricted: true, phoneMobile: '', personnelNumber: null, primaryDepartmentId: ids.ahornfeld });
    expect(list.find((p) => p.id === own)).toMatchObject({ phoneMobile: '0151 1' });
    expect(list.find((p) => p.id === own)?.restricted).toBeUndefined();
    expect((await get('persons?q=B-77', kdt)).body).toEqual([]);
    // The own department with sensitive data.
    expect((await get(`persons/${own}`, kdt).expect(200)).body).toMatchObject({ birthDate: '1995-05-05', sensitiveHidden: false });

    // A standard role changed by hand can be set back to its template.
    await core('put', `roles/${role.id}`, { name: 'Abteilungskommandant', permissions: ['masterdata.persons.read'] }).expect(200);
    const reset = await core('post', `roles/${role.id}/apply-template`).expect(200);
    expect(reset.body.permissionsAllDepartments).toEqual(['masterdata.persons.directory']);
    expect(reset.body.permissions).toContain('masterdata.persons.write');
  });
});

describe('transfers between youth, operational and veterans departments', () => {
  it('moves a youth member with probation and an active member to the veterans', async () => {
    const operational = (await post('departments', { name: 'Abteilung Übertritt', shortName: 'Übertritt', type: 'operational' }).expect(201)).body.id;
    const youth = (await post('departments', { name: 'Jugendfeuerwehr Übertritt', shortName: 'JF Übertritt', type: 'youth' }).expect(201)).body.id;
    const veterans = (await post('departments', { name: 'Altersabteilung Übertritt', shortName: 'Alters Übertritt', type: 'veterans', parentId: operational }).expect(201)).body.id;
    const member = (body: object) => post('persons', { lastName: 'Übertritt', memberships: [{ departmentId: youth, from: '2020-09-01', primary: true }], status: 'youth', ...body }).expect(201);

    const mia = (await member({ firstName: 'Mia', birthDate: '2008-03-01' })).body.id;
    // Leaving the youth brigade works only through the transfer, and its date must lie after the youth membership began.
    expect((await post(`persons/${mia}/status`, { status: 'active', effectiveOn: '2026-09-01' }).expect(400)).body).toMatchObject({ code: 'masterdata.useTransfer' });
    const late = (await member({ firstName: 'Lea', birthDate: '2008-01-01', memberships: [{ departmentId: youth, from: '2026-05-01', primary: true }] })).body.id;
    expect((await post(`persons/${late}/transfer-to-operational`, { departmentId: operational, on: '2026-04-01', probationEndsOn: '2027-03-31' }).expect(400)).body).toMatchObject({ code: 'masterdata.transferBeforeMembership' });
    // Waiving or shortening the probation needs a reason; the target must be an operational department.
    await post(`persons/${mia}/transfer-to-operational`, { departmentId: operational, on: '2026-09-01', probationEndsOn: null }).expect(400);
    await post(`persons/${mia}/transfer-to-operational`, { departmentId: veterans, on: '2026-09-01', probationEndsOn: '2027-08-31' }).expect(400);
    // A shortened probation cannot end before the transfer.
    await post(`persons/${mia}/transfer-to-operational`, { departmentId: operational, on: '2026-09-01', probationEndsOn: '2026-08-01', reason: 'Jugendfeuerwehr' }).expect(400);
    const regular = await post(`persons/${mia}/transfer-to-operational`, { departmentId: operational, on: '2026-09-01', probationEndsOn: '2027-08-31', decidedOn: '2026-08-20' }).expect(201);
    expect(regular.body).toMatchObject({ status: 'probation', probationEndsOn: '2027-08-31', probationDecidedOn: '2026-08-20' });
    expect(regular.body.memberships).toEqual(
      expect.arrayContaining([
        // The ended membership stays the primary one until the day before.
        expect.objectContaining({ departmentId: youth, from: '2020-09-01', to: '2026-08-31', primary: true }),
        expect.objectContaining({ departmentId: operational, from: '2026-09-01', to: null, primary: true }),
      ]),
    );

    const ben = (await member({ firstName: 'Ben', birthDate: '2008-01-01' })).body.id;
    const waived = await post(`persons/${ben}/transfer-to-operational`, { departmentId: operational, on: '2026-09-01', probationEndsOn: null, reason: 'Jugendfeuerwehr seit 2020', decidedOn: '2026-08-20' }).expect(201);
    expect(waived.body).toMatchObject({ status: 'active', admittedOn: '2026-08-20', probationEndsOn: null });

    // A transfer dated ahead keeps the youth membership primary until then, so the memberships stay editable.
    const lea = (await member({ firstName: 'Lea', birthDate: '2008-02-01' })).body.id;
    await post(`persons/${lea}/transfer-to-operational`, { departmentId: operational, on: '2099-01-01', probationEndsOn: '2099-12-31' }).expect(201);
    await put(`persons/${lea}/memberships`, [
      { departmentId: youth, from: '2020-09-01', to: '2098-12-31', primary: true },
      { departmentId: operational, from: '2099-01-01', to: null, primary: true },
    ]).expect(200);

    // Below the minimum age of 17.
    const kim = (await member({ firstName: 'Kim', birthDate: '2011-01-01' })).body.id;
    expect((await post(`persons/${kim}/transfer-to-operational`, { departmentId: operational, on: '2026-09-01', probationEndsOn: '2027-08-31' }).expect(400)).body).toMatchObject({ code: 'masterdata.belowMinimumAge' });
    // Only active and passive members move to the veterans.
    expect((await post(`persons/${kim}/transfer-to-veterans`, { departmentId: veterans, on: '2026-09-01' }).expect(400)).body).toMatchObject({ code: 'masterdata.transferNotAllowed' });

    const old = (await post('persons', { firstName: 'Otto', lastName: 'Übertritt', status: 'active', memberships: [{ departmentId: operational, from: '1990-01-01', primary: true }] }).expect(201)).body.id;
    expect((await post(`persons/${old}/status`, { status: 'veterans', effectiveOn: '2026-10-01' }).expect(400)).body).toMatchObject({ code: 'masterdata.useTransfer' });
    await post(`persons/${old}/status`, { status: 'passive', effectiveOn: '2026-10-01' }).expect(201);
    await post(`persons/${old}/ranks`, { rank: 'hlm', since: '2010-01-01' }).expect(201);
    const moved = await post(`persons/${old}/transfer-to-veterans`, { departmentId: veterans, on: '2026-10-01', decidedOn: '2026-09-15' }).expect(201);
    expect(moved.body).toMatchObject({ status: 'veterans', rank: 'hlm' });
    expect(moved.body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ departmentId: operational, to: '2026-09-30', primary: true }),
        expect.objectContaining({ departmentId: veterans, from: '2026-10-01', to: null, primary: true }),
      ]),
    );
  });
});
