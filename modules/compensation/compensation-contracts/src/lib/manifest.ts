import type { ModuleManifest } from '@forga/core-contracts';

const SELF = 'compensation.self';

export const COMPENSATION_MANIFEST = {
  id: 'compensation',
  name: { de: 'Entschädigungen', en: 'Compensation' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['incidents', 'training'],
  permissions: [
    { id: 'compensation.read', name: { de: 'Entschädigungen lesen', en: 'Read compensation' }, scope: 'department' },
    { id: 'compensation.runs', name: { de: 'Auszahlungsläufe', en: 'Payout runs' }, scope: 'brigade' },
    { id: 'compensation.runs.read', name: { de: 'Auszahlungsläufe einsehen', en: 'View payout runs' }, scope: 'brigade' },
    { id: 'compensation.approve', name: { de: 'Auszahlungslauf sachlich richtig zeichnen', en: 'Approve payout runs as factually correct' }, scope: 'brigade' },
    { id: 'compensation.items.manual', name: { de: 'Posten von Hand erfassen', en: 'Record manual items' }, scope: 'brigade' },
    { id: 'compensation.settings.manage', name: { de: 'Satzung und Pauschalen einstellen', en: 'Configure statute and allowances' }, scope: 'brigade' },
    { id: SELF, name: { de: 'Eigene Entschädigung sehen', en: 'See own compensation' }, scope: 'department' },
  ],
  navigation: [
    { label: { de: 'Auszahlungsläufe', en: 'Payout runs' }, path: 'runs', permission: 'compensation.runs.read', icon: 'coins' },
    { label: { de: 'Offene Posten', en: 'Open items' }, path: 'items', permission: 'compensation.read', icon: 'list' },
    { label: { de: 'Funktionspauschalen', en: 'Function allowances' }, path: 'functions', permission: 'compensation.runs', icon: 'award' },
    { label: { de: 'Entschädigungen', en: 'Compensation' }, path: 'settings', permission: 'compensation.settings.manage', icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'member', permissions: [SELF] },
    { key: 'group-leader', permissions: [SELF] },
    { key: 'course-coordinator', permissions: [SELF] },
    { key: 'equipment-officer', permissions: [SELF] },
    { key: 'clothing-officer', permissions: [SELF] },
    { key: 'commander', permissions: ['compensation.read', 'compensation.runs.read', 'compensation.approve', SELF] },
    { key: 'department-commander', permissions: ['compensation.read', SELF] },
    // Without `compensation.approve`: the factual approval is a control by someone other than who prepares the run.
    {
      key: 'administration',
      permissions: ['compensation.read', 'compensation.runs', 'compensation.runs.read', 'compensation.items.manual', 'compensation.settings.manage', SELF],
      permissionsAllDepartments: ['compensation.read'],
    },
  ],
  frontend: { remote: 'compensation_web', exposed: './Module' },
} satisfies ModuleManifest;
