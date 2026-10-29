import { AuthenticatedUser } from '../security/authenticated-user.js';
import { AuditReferenceRegistry, type AuditReferenceResolver } from './audit-references.js';

const user = new AuthenticatedUser('u', 'user', 'User', null, 'de', new Map(), 'session');
const P1 = '01a18304-b483-76b0-aeb6-5d355279ca35';
const P2 = '01a18304-b483-76b0-aeb6-5d355279ca36';
const GONE = '01a18304-b483-76b0-aeb6-5d355279ca37';
const L1 = '01a18304-b483-76b0-aeb6-5d355279ca38';

function setup() {
  const registry = new AuditReferenceRegistry();
  const persons = jest.fn<ReturnType<AuditReferenceResolver>, Parameters<AuditReferenceResolver>>(async (ids) =>
    new Map(ids.filter((id) => id !== GONE).map((id) => [id, { label: id === P1 ? 'Muster, Max' : 'Beispiel, Eva', to: `/masterdata/persons/${id}` }])),
  );
  const lists = jest.fn<ReturnType<AuditReferenceResolver>, Parameters<AuditReferenceResolver>>(async (ids) => new Map(ids.map((id) => [id, { label: { de: 'Liste', en: 'List' } }])));
  const promotionLists = jest.fn<ReturnType<AuditReferenceResolver>, Parameters<AuditReferenceResolver>>(async (ids) => new Map(ids.map((id) => [id, { label: 'Beförderungen 2026' }])));
  registry.register('masterdata.person', { keys: ['personId', 'previousPersonId'], resolve: persons });
  registry.register('core.list', { keys: ['listId'], actions: ['lists.'], uuid: false, resolve: lists });
  registry.register('promotions.list', { keys: ['listId'], actions: ['promotions.'], resolve: promotionLists });
  return { registry, persons, lists, promotionLists };
}

describe('AuditReferenceRegistry', () => {
  it('resolves all entries of a page with one call per kind', async () => {
    const { registry, persons } = setup();
    const result = await registry.resolve(
      [
        { action: 'data.person-exported', details: { personId: P1 } },
        { action: 'users.person-linked', details: { personId: P2, previousPersonId: P1 } },
        { action: 'promotions.list-executed', details: { promotions: [{ personId: P2, rank: 'OFM' }] } },
      ],
      user,
    );
    expect(persons).toHaveBeenCalledTimes(1);
    expect([...persons.mock.calls[0][0]].toSorted()).toEqual([P1, P2]);
    expect(result[0]).toEqual({ [P1]: { kind: 'masterdata.person', label: 'Muster, Max', to: `/masterdata/persons/${P1}` } });
    expect(Object.keys(result[1]).toSorted()).toEqual([P1, P2]);
    expect(result[2][P2].label).toBe('Beispiel, Eva');
  });

  it('reports IDs the resolver does not know as deleted', async () => {
    const { registry } = setup();
    const [references] = await registry.resolve([{ action: 'data.person-exported', details: { personId: GONE } }], user);
    expect(references[GONE]).toEqual({ kind: 'masterdata.person', label: null });
  });

  it('prefers the kind limited to the action and skips values that are no UUID', async () => {
    const { registry, lists, promotionLists } = setup();
    const result = await registry.resolve(
      [
        { action: 'lists.exported', details: { listId: 'masterdata.persons' } },
        { action: 'promotions.list-decided', details: { listId: L1 } },
        { action: 'promotions.list-decided', details: { listId: 'not-a-uuid' } },
        { action: 'other.action', details: { listId: L1 } },
      ],
      user,
    );
    expect(lists).toHaveBeenCalledWith(['masterdata.persons'], user);
    expect(promotionLists).toHaveBeenCalledWith([L1], user);
    expect(result[0]['masterdata.persons'].kind).toBe('core.list');
    expect(result[1][L1].kind).toBe('promotions.list');
    expect(result[2]).toEqual({});
    expect(result[3]).toEqual({});
  });

  it('resolves attachment owners by their kind', async () => {
    const { registry } = setup();
    const [references] = await registry.resolve([{ action: 'attachments.added', details: { ownerType: 'masterdata.person', ownerId: P1, fileName: 'a.pdf' } }], user);
    expect(references[P1].label).toBe('Muster, Max');
  });

  it('leaves the IDs of a failing resolver unresolved', async () => {
    const { registry, persons } = setup();
    persons.mockRejectedValueOnce(new Error('down'));
    const [references] = await registry.resolve([{ action: 'data.person-exported', details: { personId: P1 } }], user);
    expect(references).toEqual({});
  });

  it('refuses a kind registered twice', () => {
    const { registry } = setup();
    expect(() => registry.register('masterdata.person', { keys: ['personId'], resolve: async () => new Map() })).toThrow(/already registered/);
  });
});
