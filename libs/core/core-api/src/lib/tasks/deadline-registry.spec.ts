import type { Grant } from '@forga/core-contracts';
import { AuthenticatedUser } from '../security/authenticated-user.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { DeadlineRegistry, type DeadlineInput } from './deadline-registry.js';

/** Organization without restricted persons, or with the given ones. */
const organization = (restricted: string[] = []) => {
  const directory = new OrganizationDirectory();
  directory.register({ departments: async () => [], persons: async () => [], catalogEntries: async () => 0, linkPermission: 'x', restrictedPersonIds: async () => restricted });
  return directory;
};

const user = (grants: [string, Grant][]) => new AuthenticatedUser('u', 'user', 'User', null, 'de', new Map(grants), 'session');

const deadline = (permission: DeadlineInput['permission'], departmentIds: string[]): DeadlineInput => ({
  id: 'review:1',
  kind: 'review',
  title: { de: 'Prüfen', en: 'Review' },
  subject: { type: 'report', id: '1', label: 'Bericht' },
  dueOn: '2026-10-20',
  leadDays: 7,
  departmentIds,
  permission,
});

const about = (subject: DeadlineInput['subject'], personId?: string): DeadlineInput => ({ ...deadline('masterdata.persons.write', []), subject, ...(personId ? { personId } : {}) });

const registryWith = (input: DeadlineInput, restricted: string[] = []) => {
  const registry = new DeadlineRegistry(organization(restricted));
  registry.register({ module: 'incidents', deadlines: async () => [input] });
  return registry;
};

describe('DeadlineRegistry', () => {
  it('drops deadlines about persons whose processing is restricted', async () => {
    const admin = user([['masterdata.persons.write', 'brigade']]);
    expect(await registryWith(about({ type: 'masterdata.person', id: 'p1', label: 'A' }), ['p1']).forUser(admin, '2026-10-18')).toEqual([]);
    expect(await registryWith(about({ type: 'core.me', id: 'p1', label: 'A' }), ['p1']).forUser(admin, '2026-10-18')).toEqual([]);
    expect(await registryWith(about({ type: 'compensation.item', id: 'i1', label: 'A' }, 'p1'), ['p1']).forUser(admin, '2026-10-18')).toEqual([]);
    expect(await registryWith(about({ type: 'masterdata.person', id: 'p2', label: 'B' }), ['p1']).forUser(admin, '2026-10-18')).toHaveLength(1);
  });

  it('counts a permission waiting for the step-up for deadlines marked `held`', async () => {
    const waiting = new AuthenticatedUser('u', 'user', 'User', null, 'de', new Map(), 'session', new Map([['core.privacy.manage', 'brigade']]));
    expect(await registryWith(deadline('core.privacy.manage', [])).forUser(waiting, '2026-10-18')).toEqual([]);
    expect(await registryWith({ ...deadline('core.privacy.manage', []), held: true }).forUser(waiting, '2026-10-18')).toHaveLength(1);
  });

  it('makes users with any of several permissions responsible, each deadline once', async () => {
    const registry = registryWith(deadline(['incidents.reports.release', 'incidents.reports.review'], ['a']));
    const releaser = user([['incidents.reports.release', 'brigade']]);
    const reviewer = user([['incidents.reports.review', ['a']]]);
    const both = user([['incidents.reports.release', 'brigade'], ['incidents.reports.review', 'brigade']]);
    const otherDepartment = user([['incidents.reports.review', ['b']]]);
    expect(await registry.forUser(releaser, '2026-10-18')).toHaveLength(1);
    expect(await registry.forUser(reviewer, '2026-10-18')).toHaveLength(1);
    expect(await registry.forUser(both, '2026-10-18')).toHaveLength(1);
    expect(await registry.forUser(otherDepartment, '2026-10-18')).toEqual([]);
  });

  it('still accepts a single permission', async () => {
    const registry = registryWith(deadline('incidents.reports.release', []));
    expect(await registry.forUser(user([['incidents.reports.release', 'brigade']]), '2026-10-18')).toHaveLength(1);
    expect(await registry.forUser(user([['incidents.reports.review', 'brigade']]), '2026-10-18')).toEqual([]);
  });
});
