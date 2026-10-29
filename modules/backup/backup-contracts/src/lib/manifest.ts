import type { ModuleManifest } from '@forga/core-contracts';

/** Set up, create, verify, download and restore backups (the whole data of the installation). */
export const BACKUP_MANAGE = 'backup.manage';
/** E-mail when a backup fails. */
export const BACKUP_NOTIFY = 'backup.notify';

export const BACKUP_MANIFEST = {
  id: 'backup',
  name: { de: 'Datensicherung', en: 'Backup' },
  version: '0.1.0',
  permissions: [
    {
      id: BACKUP_MANAGE,
      name: { de: 'Datensicherung einrichten, sichern, herunterladen und wiederherstellen', en: 'Set up, create, download and restore backups' },
      scope: 'brigade',
      privileged: true,
      stepUp: true,
    },
    { id: BACKUP_NOTIFY, name: { de: 'E-Mail bei fehlgeschlagener Datensicherung', en: 'E-mail when a backup fails' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Datensicherung', en: 'Backup' }, path: '', permission: BACKUP_MANAGE, icon: 'backup', section: 'administration' },
    // Settings page: a button at the module on „Verwaltung → Module“ and in the setup list of the start page.
    { label: { de: 'Datensicherung', en: 'Backup' }, path: 'settings', permission: BACKUP_MANAGE, icon: 'settings', section: 'settings' },
  ],
  frontend: { remote: 'backup_web', exposed: './Module' },
} satisfies ModuleManifest;
