import type { ModuleManifest } from '@forga/core-contracts';

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
  ],
  navigation: [
    { label: { de: 'Kleiderkammer', en: 'Clothing store' }, path: 'items', permission: 'clothing.read', icon: 'shirt' },
    { label: { de: 'Ausgabe', en: 'Issue' }, path: 'issue', permission: 'clothing.issue', icon: 'shirt' },
    { label: { de: 'Wäsche', en: 'Washing' }, path: 'care', permission: 'clothing.issue', icon: 'wash' },
    { label: { de: 'Kleiderkammer', en: 'Clothing store' }, path: 'articles', permission: 'clothing.manage', icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'member', permissions: ['clothing.self'] },
    {
      key: 'clothing-officer',
      name: { de: 'Kleiderwart', en: 'Clothing officer' },
      description: { de: 'Schutzausrüstung ausgeben, zurücknehmen, Wäsche und Prüfungen', en: 'Issue and take back protective equipment, washing and inspections' },
      permissions: ['clothing.*', 'masterdata.persons.read'],
    },
    { key: 'commander', permissions: ['clothing.read'], permissionsAllDepartments: ['clothing.read'] },
    { key: 'department-commander', permissions: ['clothing.read', 'clothing.issue'] },
  ],
  frontend: { remote: 'clothing_web', exposed: './Module' },
} satisfies ModuleManifest;
