import type { AccessReportFixture, SeedResult } from './fixture';

/**
 * A defect reported by the member's own account and an inspection the member performed; the other member reports a
 * defect of the same item, which must not show up.
 */
export async function seedEquipment(fx: AccessReportFixture): Promise<SeedResult> {
  const { post, put, get, ids } = fx;
  await post('/equipment/templates/dguv', {}).expect(201);
  // The member may report defects (as group leaders may).
  const reporter = (await post('/core/roles', { name: 'Mängelmelder Test', permissions: ['equipment.read', 'equipment.defects.report'] }).expect(201)).body.id as string;
  const user = (await get(`/core/users/${ids.memberUser}`).expect(200)).body as { username: string; displayName: string; email: string | null; personId: string; roles: { roleId: string; departmentId: string | null }[] };
  await put(`/core/users/${ids.memberUser}`, {
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    personId: user.personId,
    roles: [...user.roles.map((r) => ({ roleId: r.roleId, departmentId: r.departmentId })), { roleId: reporter, departmentId: ids.department }],
  }).expect(200);
  const item = (await post('/equipment/items', { inventoryNumber: 'AS-PA-0042', name: 'Pressluftatmer Probe', typeKey: 'scba', categoryKey: 'breathing', departmentId: ids.department, vehicleId: ids.vehicle }).expect(201)).body.id as string;
  await post(`/equipment/items/${item}/defects`, { description: 'Lungenautomat bläst ab' }, fx.member).expect(201);
  await post(`/equipment/items/${item}/defects`, { description: 'Bebänderung ausgefranst' }, fx.other).expect(201);
  await post(`/equipment/items/${item}/inspections`, { inspectionKey: 'scba-check', date: '2026-03-02', inspectorPersonId: ids.person, result: 'passed-with-defects', notes: 'Dichtung erneuert' }).expect(201);
  return { expect: ['AS-PA-0042 Pressluftatmer Probe', 'Lungenautomat bläst ab', 'gemeldet', 'bestanden mit Mängeln', 'Dichtung erneuert', 'Von Ihnen durchgeführte Prüfungen'] };
}
