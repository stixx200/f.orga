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
    { id: 'equipment.settings.manage', name: { de: 'Kategorien und Gerätetypen', en: 'Categories and equipment types' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Geräte', en: 'Equipment' }, path: 'items', permission: 'equipment.read', icon: 'tool' },
    { label: { de: 'Prüfungen', en: 'Inspections' }, path: 'inspections', permission: 'equipment.inspect', icon: 'check' },
    { label: { de: 'Mängel', en: 'Defects' }, path: 'defects', permission: 'equipment.read', icon: 'alert' },
    { label: { de: 'Geräte', en: 'Equipment' }, path: 'settings', permission: 'equipment.settings.manage', icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'member', permissions: ['equipment.defects.report'] },
    { key: 'commander', permissions: ['equipment.read', 'equipment.defects.report'], permissionsAllDepartments: ['equipment.read'] },
    { key: 'department-commander', permissions: ['equipment.read', 'equipment.write', 'equipment.defects.report'] },
    { key: 'group-leader', permissions: ['equipment.read', 'equipment.defects.report'] },
    { key: 'equipment-officer', permissions: ['equipment.*'], permissionsAllDepartments: ['equipment.read', 'equipment.write', 'equipment.inspect', 'equipment.defects.report'] },
    { key: 'breathing-apparatus-officer', permissions: ['equipment.read', 'equipment.inspect', 'equipment.defects.report'], permissionsAllDepartments: ['equipment.read', 'equipment.inspect'] },
  ],
  frontend: { remote: 'equipment_web', exposed: './Module' },
} satisfies ModuleManifest;
