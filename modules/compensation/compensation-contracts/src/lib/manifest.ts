import type { ModuleManifest } from '@forga/core-contracts';

export const COMPENSATION_MANIFEST = {
  id: 'compensation',
  name: { de: 'Entschädigungen', en: 'Compensation' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['incidents', 'training'],
  permissions: [
    { id: 'compensation.read', name: { de: 'Entschädigungen lesen', en: 'Read compensation' }, scope: 'department' },
    { id: 'compensation.runs', name: { de: 'Auszahlungsläufe', en: 'Payout runs' }, scope: 'brigade' },
    { id: 'compensation.items.manual', name: { de: 'Posten von Hand erfassen', en: 'Record manual items' }, scope: 'brigade' },
    { id: 'compensation.settings.manage', name: { de: 'Satzung und Pauschalen einstellen', en: 'Configure statute and allowances' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Auszahlungsläufe', en: 'Payout runs' }, path: 'runs', permission: 'compensation.runs', icon: 'coins' },
    { label: { de: 'Offene Posten', en: 'Open items' }, path: 'items', permission: 'compensation.read', icon: 'list' },
    { label: { de: 'Funktionspauschalen', en: 'Function allowances' }, path: 'functions', permission: 'compensation.runs', icon: 'award' },
    { label: { de: 'Entschädigungen', en: 'Compensation' }, path: 'settings', permission: 'compensation.settings.manage', icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'commander', permissions: ['compensation.read'] },
    { key: 'department-commander', permissions: ['compensation.read'] },
    { key: 'administration', permissions: ['compensation.*'], permissionsAllDepartments: ['compensation.read'] },
  ],
  frontend: { remote: 'compensation_web', exposed: './Module' },
} satisfies ModuleManifest;
