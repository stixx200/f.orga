import type { ModuleManifest } from '@forga/core-contracts';

export const TRAINING_MANIFEST = {
  id: 'training',
  name: { de: 'Übungsdienst', en: 'Training' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['respiratory-protection', 'compensation'],
  permissions: [
    { id: 'training.self', name: { de: 'Eigene Dienste sehen und sich entschuldigen', en: 'See own sessions and send excuses' }, scope: 'department' },
    { id: 'training.read', name: { de: 'Dienste lesen', en: 'Read training sessions' }, scope: 'department' },
    { id: 'training.plan', name: { de: 'Dienste planen', en: 'Plan training sessions' }, scope: 'department' },
    { id: 'training.attendance', name: { de: 'Anwesenheit erfassen', en: 'Record attendance' }, scope: 'department' },
    { id: 'training.close', name: { de: 'Dienste abschließen', en: 'Close training sessions' }, scope: 'department' },
    { id: 'training.settings.manage', name: { de: 'Diensttypen verwalten', en: 'Manage session types' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Dienste', en: 'Sessions' }, path: 'sessions', permission: 'training.read', icon: 'calendar' },
    { label: { de: 'Dienstbeteiligung', en: 'Participation' }, path: 'participation', permission: 'training.read', icon: 'chart' },
    { label: { de: 'Übungsdienst', en: 'Training' }, path: 'settings', permission: 'training.settings.manage', icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'member', permissions: ['training.self'] },
    { key: 'department-commander', permissions: ['training.self'] },
    { key: 'group-leader', permissions: ['training.self'] },
    { key: 'course-coordinator', permissions: ['training.self'] },
    { key: 'breathing-apparatus-officer', permissions: ['training.self'] },
    { key: 'equipment-officer', permissions: ['training.self'] },
    { key: 'administration', permissions: ['training.self'] },
    { key: 'commander', permissions: ['training.*'] },
    { key: 'department-commander', permissions: ['training.read', 'training.plan', 'training.attendance', 'training.close'] },
    { key: 'group-leader', permissions: ['training.read', 'training.attendance'] },
    { key: 'breathing-apparatus-officer', permissions: ['training.read'], permissionsAllDepartments: ['training.read'] },
    { key: 'course-coordinator', permissions: ['training.read'], permissionsAllDepartments: ['training.read'] },
    { key: 'administration', permissions: ['training.read'], permissionsAllDepartments: ['training.read'] },
  ],
  frontend: { remote: 'training_web', exposed: './Module' },
} satisfies ModuleManifest;
