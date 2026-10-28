import type { ModuleManifest } from '@forga/core-contracts';

export const INFO_TERMINAL_READ = 'info-terminal.read';
export const INFO_TERMINAL_MANAGE = 'info-terminal.manage';
export const INFO_TERMINAL_SETTINGS_MANAGE = 'info-terminal.settings.manage';

export const INFO_TERMINAL_MANIFEST = {
  id: 'info-terminal',
  name: { de: 'Infoterminal', en: 'Info terminal' },
  version: '0.1.0',
  requires: ['masterdata', 'incidents'],
  optional: ['training'],
  permissions: [
    {
      id: INFO_TERMINAL_READ,
      name: { de: 'Infoterminals der eigenen Abteilungen sehen', en: 'See the info terminals of own departments' },
      scope: 'department',
    },
    {
      id: INFO_TERMINAL_MANAGE,
      name: { de: 'Infoterminals anlegen, Link anzeigen, widerrufen', en: 'Create info terminals, show their link, revoke them' },
      scope: 'department',
    },
    { id: INFO_TERMINAL_SETTINGS_MANAGE, name: { de: 'Einstellungen Infoterminal', en: 'Info terminal settings' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Infoterminals', en: 'Info terminals' }, path: 'terminals', permission: INFO_TERMINAL_READ, icon: 'terminal', section: 'administration' },
    { label: { de: 'Infoterminal', en: 'Info terminal' }, path: 'settings', permission: INFO_TERMINAL_SETTINGS_MANAGE, icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'commander', permissions: ['info-terminal.*'] },
    // Department grants cover the youth and veterans departments below the department as well.
    { key: 'department-commander', permissions: [INFO_TERMINAL_READ, INFO_TERMINAL_MANAGE] },
    { key: 'group-leader', permissions: [INFO_TERMINAL_READ] },
  ],
  frontend: { remote: 'info_terminal_web', exposed: './Module', kiosk: { path: 'terminal', exposed: './Kiosk' } },
} satisfies ModuleManifest;
