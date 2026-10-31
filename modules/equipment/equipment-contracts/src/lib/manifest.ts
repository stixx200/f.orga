import type { ModuleManifest } from '@forga/core-contracts';

export const EQUIPMENT_MANIFEST = {
  id: 'equipment',
  name: { de: 'Geräte', en: 'Equipment' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['incidents', 'training'],
  permissions: [
    { id: 'equipment.read', name: { de: 'Geräte lesen', en: 'Read equipment' }, scope: 'department' },
    { id: 'equipment.write', name: { de: 'Geräte pflegen', en: 'Maintain equipment' }, scope: 'department' },
    { id: 'equipment.inspect', name: { de: 'Prüfungen erfassen', en: 'Record inspections' }, scope: 'department' },
    { id: 'equipment.defects.report', name: { de: 'Mängel melden', en: 'Report defects' }, scope: 'department' },
    { id: 'equipment.defects.notify', name: { de: 'E-Mail bei neuen Mängeln', en: 'E-mail about new defects' }, scope: 'department' },
    // Only for items of breathing apparatus categories; deadlines and defect e-mails of these items go to these permissions.
    { id: 'equipment.breathing.write', name: { de: 'Atemschutzgeräte pflegen (Status, Mängel)', en: 'Maintain breathing apparatus (status, defects)' }, scope: 'department' },
    { id: 'equipment.breathing.inspect', name: { de: 'Atemschutzgeräte prüfen', en: 'Inspect breathing apparatus' }, scope: 'department' },
    { id: 'equipment.breathing.notify', name: { de: 'E-Mail bei neuen Mängeln an Atemschutzgeräten', en: 'E-mail about new defects of breathing apparatus' }, scope: 'department' },
    { id: 'equipment.settings.manage', name: { de: 'Kategorien und Gerätetypen', en: 'Categories and equipment types' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Geräte', en: 'Equipment' }, path: 'items', permission: 'equipment.read', icon: 'tool' },
    { label: { de: 'Fällige Prüfungen', en: 'Inspections due' }, path: 'inspections', permission: 'equipment.read', icon: 'calendar' },
    // Recording needs `equipment.inspect` or, for breathing apparatus, `equipment.breathing.inspect`; readers see no items.
    { label: { de: 'Sammelprüfungen', en: 'Bulk inspections' }, path: 'bulk', permission: 'equipment.read', icon: 'check' },
    { label: { de: 'Mängel', en: 'Defects' }, path: 'defects', permission: 'equipment.read', icon: 'alert' },
    { label: { de: 'Geräte', en: 'Equipment' }, path: 'settings', permission: 'equipment.settings.manage', icon: 'settings', section: 'settings' },
  ],
  roles: [
    { key: 'member', permissions: ['equipment.defects.report'] },
    { key: 'clothing-officer', permissions: ['equipment.defects.report'] },
    { key: 'commander', permissions: ['equipment.read', 'equipment.defects.report'], permissionsAllDepartments: ['equipment.read'] },
    { key: 'department-commander', permissions: ['equipment.read', 'equipment.write', 'equipment.defects.report'] },
    { key: 'group-leader', permissions: ['equipment.read', 'equipment.defects.report'] },
    // Explicit lists: `equipment.*` would include the breathing apparatus permissions, whose deadlines and e-mails belong to the breathing apparatus officer.
    {
      key: 'equipment-officer',
      permissions: ['equipment.read', 'equipment.write', 'equipment.inspect', 'equipment.defects.report', 'equipment.defects.notify', 'equipment.settings.manage'],
      permissionsAllDepartments: ['equipment.read', 'equipment.write', 'equipment.inspect', 'equipment.defects.report'],
    },
    {
      key: 'breathing-apparatus-officer',
      permissions: ['equipment.read', 'equipment.defects.report', 'equipment.breathing.write', 'equipment.breathing.inspect', 'equipment.breathing.notify'],
      permissionsAllDepartments: ['equipment.read', 'equipment.breathing.write', 'equipment.breathing.inspect'],
    },
  ],
  frontend: { remote: 'equipment_web', exposed: './Module' },
  privacy: {
    personData: true,
    activities: [
      {
        key: 'equipment.inspections',
        subjects: [{ de: 'Prüfer und Meldende von Mängeln', en: 'Inspectors and persons reporting defects' }],
        categories: [{ de: 'Name des Prüfers, Prüfungen mit Ergebnis, gemeldete Mängel', en: 'Name of the inspector, inspections with result, reported defects' }],
        legalBasisHint: { de: 'Prüfpflichten (DGUV, Herstellerangaben); mit dem DSB festlegen', en: 'Duties to inspect (DGUV, manufacturer); decide with the DPO' },
        name: { de: 'Geräteprüfung', en: 'Equipment inspection' },
        purpose: { de: 'Prüfung und Instandhaltung der Geräte, Nachweis der Prüfungen und gemeldeten Mängel', en: 'Inspection and maintenance of equipment, evidence of inspections and reported defects' },
        retention: ['equipment.retired'],
      },
    ],
  },
} satisfies ModuleManifest;
