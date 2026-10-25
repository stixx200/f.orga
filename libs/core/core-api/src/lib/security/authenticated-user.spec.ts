import type { Permission } from '@forga/core-contracts';
import { AuthenticatedUser, computeGrants, matches } from './authenticated-user.js';

const name = { de: 'x', en: 'x' };
const KNOWN: Permission[] = [
  { id: 'masterdata.persons.read', name, scope: 'department' },
  { id: 'masterdata.catalogs.manage', name, scope: 'brigade' },
  { id: 'incidents.reports.release', name, scope: 'brigade' },
];

const user = (grants: Map<string, 'brigade' | string[]>) =>
  new AuthenticatedUser('u', 'user', 'User', null, 'de', grants, 'session');

describe('matches', () => {
  it('supports exact IDs, module wildcards and everything', () => {
    expect(matches('masterdata.persons.read', 'masterdata.persons.read')).toBe(true);
    expect(matches('masterdata.*', 'masterdata.persons.read')).toBe(true);
    expect(matches('masterdata.*', 'incidents.reports.release')).toBe(false);
    expect(matches('*', 'incidents.reports.release')).toBe(true);
  });
});

describe('computeGrants', () => {
  it('grants brigade-wide for assignments without department', () => {
    const grants = computeGrants(KNOWN, [{ patterns: ['*'], departmentId: null }]);
    expect([...grants.values()]).toEqual(['brigade', 'brigade', 'brigade']);
  });

  it('collects departments and ignores brigade-only permissions for department assignments', () => {
    const grants = computeGrants(KNOWN, [
      { patterns: ['masterdata.*'], departmentId: 'weidenhain' },
      { patterns: ['masterdata.persons.read'], departmentId: 'ahornfeld' },
    ]);
    expect(grants.get('masterdata.persons.read')).toEqual(['weidenhain', 'ahornfeld']);
    expect(grants.has('masterdata.catalogs.manage')).toBe(false);
  });

  it('lets a brigade-wide assignment win over department assignments', () => {
    const grants = computeGrants(KNOWN, [
      { patterns: ['masterdata.persons.read'], departmentId: 'ahornfeld' },
      { patterns: ['masterdata.persons.read'], departmentId: null },
    ]);
    expect(grants.get('masterdata.persons.read')).toBe('brigade');
  });

  it('extends a department assignment to the departments below it', () => {
    const below: Record<string, string[]> = { musterstadt: ['musterstadt', 'jugend', 'alters'] };
    const grants = computeGrants(KNOWN, [{ patterns: ['masterdata.persons.read'], departmentId: 'musterstadt' }], (id) => below[id] ?? [id]);
    expect(grants.get('masterdata.persons.read')).toEqual(['musterstadt', 'jugend', 'alters']);
  });
});

describe('AuthenticatedUser.can', () => {
  it('checks departments', () => {
    const u = user(new Map([['masterdata.persons.read', ['ahornfeld']]]));
    expect(u.can('masterdata.persons.read')).toBe(true);
    expect(u.can('masterdata.persons.read', 'ahornfeld')).toBe(true);
    expect(u.can('masterdata.persons.read', 'weidenhain')).toBe(false);
    expect(u.can('masterdata.persons.read', null)).toBe(false);
    expect(u.can('incidents.reports.release')).toBe(false);
  });

  it('allows every department for brigade-wide grants', () => {
    const u = user(new Map([['masterdata.persons.read', 'brigade']]));
    expect(u.can('masterdata.persons.read', 'weidenhain')).toBe(true);
    expect(u.canAnythingIn('masterdata')).toBe(true);
    expect(u.canAnythingIn('incidents')).toBe(false);
  });
});
