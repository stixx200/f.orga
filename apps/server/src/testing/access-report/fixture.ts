import { UI, type TestApp } from '../test-app';

/**
 * Data shared by the seeds of the access report test: a made-up member („Tobias Probe“) with a user account, another
 * member („Max Dritter“) whose name must never appear in the report, a department and a vehicle.
 */
export interface AccessReportFixture {
  test: TestApp;
  /** Administrator session (step-up confirmed). */
  admin: string;
  /** Session of the member's own user account (`probe`), e.g. for entries in "Mein Bereich". */
  member: string;
  /** Session of the other member's account (`dritter`, role „Kommandant Test“). */
  other: string;
  ids: {
    department: string;
    vehicle: string;
    /** The member the report is about. */
    person: string;
    /** Another member; never named in the report. */
    otherPerson: string;
    memberUser: string;
    otherUser: string;
  };
  post(path: string, body: unknown, cookie?: string): ReturnType<TestApp['http']['post']>;
  put(path: string, body: unknown, cookie?: string): ReturnType<TestApp['http']['put']>;
  get(path: string, cookie?: string): ReturnType<TestApp['http']['get']>;
}

/** Name parts of the other member: none of them may appear in the report. */
export const OTHER_NAMES = ['Dritter'];

/**
 * What a module seed created: texts that must appear in its section(s) of the report (in German), and the section keys
 * it expects (default: one starting with the module ID).
 */
export interface SeedResult {
  expect: string[];
  sections?: string[];
  /** Texts that must not appear anywhere in the report, e.g. the street of an incident or involved parties. */
  forbid?: string[];
  /** The module's section must be marked as health data. */
  health?: boolean;
}

export async function createFixture(test: TestApp, admin: string): Promise<AccessReportFixture> {
  const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
  const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
  const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  await post('/masterdata/courses/templates/bw', {}).expect(201);
  const department = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id as string;
  const vehicle = (await post('/masterdata/vehicles', { designation: 'LF 20', vehicleType: 'lf-20', departmentId: department }).expect(201)).body.id as string;
  const person = (await post('/masterdata/persons', {
    salutation: 'Herr',
    firstName: 'Tobias',
    lastName: 'Probe',
    street: 'Lindenweg 4',
    postalCode: '12345',
    city: 'Musterstadt',
    email: 'tobias.probe@example.org',
    status: 'active',
    memberships: [{ departmentId: department, from: '2010-04-01', primary: true }],
  }).expect(201)).body.id as string;
  const otherPerson = (await post('/masterdata/persons', { firstName: 'Max', lastName: 'Dritter', status: 'active', memberships: [{ departmentId: department, from: '2005-01-01', primary: true }] }).expect(201)).body.id as string;
  const memberRole = (await post('/core/roles', { name: 'Gruppenführer Test', permissions: ['training.self', 'incidents.reports.read', 'masterdata.self'] }).expect(201)).body.id as string;
  const commanderRole = (await post('/core/roles', { name: 'Kommandant Test', permissions: ['*'] }).expect(201)).body.id as string;
  const memberUser = (await post('/core/users', {
    username: 'probe',
    displayName: 'Tobias Probe',
    email: 'tobias.probe@example.org',
    password: 'auch-sehr-geheim',
    personId: person,
    roles: [{ roleId: memberRole, departmentId: department }],
  }).expect(201)).body.id as string;
  const otherUser = (await post('/core/users', { username: 'dritter', displayName: 'Max Dritter', password: 'auch-sehr-geheim', personId: otherPerson, roles: [{ roleId: commanderRole }] }).expect(201)).body.id as string;
  const member = await test.login({ username: 'probe', password: 'auch-sehr-geheim' });
  const other = await test.login({ username: 'dritter', password: 'auch-sehr-geheim' });
  return { test, admin, member, other, ids: { department, vehicle, person, otherPerson, memberUser, otherUser }, post, put, get };
}
