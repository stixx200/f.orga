import type { ModuleManifest } from '@forga/core-contracts';

/** Standard roles that see their own protective equipment in "My area" (like the other modules' `*.self`). */
const SELF_ROLES = ['member', 'commander', 'department-commander', 'group-leader', 'course-coordinator', 'breathing-apparatus-officer', 'equipment-officer', 'administration'];

export const CLOTHING_MANIFEST = {
  id: 'clothing',
  name: { de: 'Kleiderkammer', en: 'Clothing store' },
  version: '0.1.0',
  requires: ['masterdata'],
  permissions: [
    { id: 'clothing.read', name: { de: 'Schutzausrüstung einsehen', en: 'View protective equipment' }, scope: 'department' },
    { id: 'clothing.issue', name: { de: 'Ausgeben, zurücknehmen, Wäsche und Prüfungen erfassen', en: 'Issue, take back, record washing and inspections' }, scope: 'department' },
    { id: 'clothing.manage', name: { de: 'Bestand und Artikel verwalten', en: 'Manage stock and articles' }, scope: 'department' },
    { id: 'clothing.self', name: { de: 'Eigene Schutzausrüstung sehen', en: 'See own protective equipment' }, scope: 'department' },
    { id: 'clothing.settings.manage', name: { de: 'Einstellungen der Kleiderkammer', en: 'Clothing store settings' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Kleiderkammer', en: 'Clothing store' }, path: 'items', permission: 'clothing.read', icon: 'shirt' },
    { label: { de: 'Ausgabe', en: 'Issue' }, path: 'issue', permission: 'clothing.issue', icon: 'shirt' },
    { label: { de: 'Wäsche', en: 'Washing' }, path: 'care', permission: 'clothing.issue', icon: 'wash' },
    { label: { de: 'Prüfung', en: 'Inspection' }, path: 'inspections', permission: 'clothing.issue', icon: 'check' },
    { label: { de: 'Bestand', en: 'Stock' }, path: 'stock', permission: 'clothing.read', icon: 'list' },
    { label: { de: 'Kleiderkammer', en: 'Clothing store' }, path: 'articles', permission: 'clothing.manage', icon: 'settings', section: 'settings' },
  ],
  roles: [
    ...SELF_ROLES.map((key) => ({ key, permissions: ['clothing.self'] })),
    {
      key: 'clothing-officer',
      name: { de: 'Kleiderwart', en: 'Clothing officer' },
      description: { de: 'Schutzausrüstung ausgeben, zurücknehmen, Wäsche und Prüfungen', en: 'Issue and take back protective equipment, washing and inspections' },
      permissions: ['clothing.*', 'masterdata.persons.read'],
    },
    { key: 'commander', permissions: ['clothing.read'], permissionsAllDepartments: ['clothing.read'] },
    // Only viewing: the washing and inspection deadlines of every piece go to those issuing (the clothing officers).
    { key: 'department-commander', permissions: ['clothing.read'] },
  ],
  frontend: { remote: 'clothing_web', exposed: './Module' },
  privacy: {
    personData: true,
    activities: [
      {
        key: 'clothing.issues',
        name: { de: 'Kleiderkammer', en: 'Clothing store' },
        purpose: { de: 'Ausgabe, Rücknahme und Pflege der persönlichen Schutzausrüstung', en: 'Issue, return and care of personal protective equipment' },
      },
    ],
  },
} satisfies ModuleManifest;
