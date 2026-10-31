import type { ModuleManifest } from '@forga/core-contracts';

export const PERSONAL_READ = 'personal.read';
export const PERSONAL_MANAGE = 'personal.manage';

export const PERSONAL_MANIFEST = {
  id: 'personal',
  name: { de: 'Persönlicher Zugang', en: 'Personal access' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['respiratory-protection', 'incidents', 'training', 'clothing'],
  permissions: [
    {
      id: PERSONAL_READ,
      name: { de: 'Persönliche Zugänge der eigenen Abteilungen sehen', en: 'See personal access links of own departments' },
      scope: 'department',
    },
    {
      id: PERSONAL_MANAGE,
      name: { de: 'Persönlichen Zugang anlegen, Link anzeigen, per E-Mail senden, widerrufen', en: 'Create a personal access link, show it, send it by e-mail, revoke it' },
      scope: 'department',
    },
  ],
  navigation: [
    {
      label: { de: 'Persönliche Zugänge', en: 'Personal access' },
      path: 'links',
      permission: PERSONAL_READ,
      icon: 'user',
      section: 'administration',
    },
  ],
  roles: [
    { key: 'commander', permissions: ['personal.*'] },
    { key: 'department-commander', permissions: [PERSONAL_READ, PERSONAL_MANAGE] },
    { key: 'group-leader', permissions: [PERSONAL_READ] },
  ],
  frontend: { remote: 'personal_web', exposed: './Module', kiosk: { path: 'personal', exposed: './Kiosk' } },
} satisfies ModuleManifest;
