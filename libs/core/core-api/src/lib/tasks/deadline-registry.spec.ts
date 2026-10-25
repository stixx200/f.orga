import type { Grant } from '@forga/core-contracts';
import { AuthenticatedUser } from '../security/authenticated-user.js';
import { DeadlineRegistry, type DeadlineInput } from './deadline-registry.js';

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

const registryWith = (input: DeadlineInput) => {
  const registry = new DeadlineRegistry();
  registry.register({ module: 'incidents', deadlines: async () => [input] });
  return registry;
};

describe('DeadlineRegistry', () => {
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
