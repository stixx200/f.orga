import type { ModuleManifest } from '@forga/core-contracts';

export const RESPIRATORY_PROTECTION_MANIFEST = {
  id: 'respiratory-protection',
  name: { de: 'Atemschutz', en: 'Respiratory protection' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['incidents', 'training'],
  permissions: [
    { id: 'respiratory-protection.self', name: { de: 'Eigene Atemschutz-Nachweise sehen', en: 'See own respiratory protection records' }, scope: 'department' },
    { id: 'respiratory-protection.read', name: { de: 'Atemschutztauglichkeit lesen', en: 'Read respiratory protection fitness' }, scope: 'department' },
    { id: 'respiratory-protection.evidence', name: { de: 'Nachweise erfassen', en: 'Record evidence' }, scope: 'department' },
    {
      id: 'respiratory-protection.examinations',
      name: { de: 'Eignungsuntersuchungen (Gesundheitsdaten)', en: 'Medical examinations (health data)' },
      scope: 'department',
    },
    { id: 'respiratory-protection.notify', name: { de: 'E-Mail beim Wechsel auf Rot', en: 'E-mail when the status turns red' }, scope: 'department' },
    { id: 'respiratory-protection.settings.manage', name: { de: 'Tauglichkeitsregel einstellen', en: 'Configure the fitness rule' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Tauglichkeit', en: 'Fitness' }, path: 'overview', permission: 'respiratory-protection.read', icon: 'shield' },
    { label: { de: 'Schnellerfassung', en: 'Quick entry' }, path: 'quick-entry', permission: 'respiratory-protection.evidence', icon: 'list' },
    { label: { de: 'Atemschutz', en: 'Respiratory protection' }, path: 'settings', permission: 'respiratory-protection.settings.manage', icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'member', permissions: ['respiratory-protection.self'] },
    { key: 'department-commander', permissions: ['respiratory-protection.self'] },
    { key: 'group-leader', permissions: ['respiratory-protection.self'] },
    { key: 'course-coordinator', permissions: ['respiratory-protection.self'] },
    { key: 'equipment-officer', permissions: ['respiratory-protection.self'] },
    { key: 'administration', permissions: ['respiratory-protection.self'] },
    { key: 'commander', permissions: ['respiratory-protection.read', 'respiratory-protection.evidence'] },
    { key: 'department-commander', permissions: ['respiratory-protection.read', 'respiratory-protection.evidence', 'respiratory-protection.notify'] },
    { key: 'group-leader', permissions: ['respiratory-protection.read'] },
    {
      key: 'breathing-apparatus-officer',
      permissions: ['respiratory-protection.*'],
      permissionsAllDepartments: ['respiratory-protection.read', 'respiratory-protection.evidence', 'respiratory-protection.examinations'],
    },
  ],
  frontend: { remote: 'respiratory_protection_web', exposed: './Module' },
} satisfies ModuleManifest;
