import type { ModuleManifest } from '@forga/core-contracts';

export const MP_FEUER_TRANSFER = 'mp-feuer.transfer';
export const MP_FEUER_READ = 'mp-feuer.read';

export const MP_FEUER_MANIFEST = {
  id: 'mp-feuer',
  name: { de: 'MP-Feuer', en: 'MP-Feuer' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['incidents', 'training', 'respiratory-protection'],
  permissions: [
    { id: MP_FEUER_TRANSFER, name: { de: 'MP-Feuer-Datenübernahme durchführen', en: 'Run the MP-Feuer data transfer' }, scope: 'brigade' },
    { id: MP_FEUER_READ, name: { de: 'Verlauf der Datenübernahmen lesen', en: 'Read the history of data transfers' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'MP-Feuer', en: 'MP-Feuer' }, path: 'overview', permission: MP_FEUER_READ, icon: 'transfer', section: 'administration' },
    // Remembered selection; shown at the module on "Verwaltung → Module".
    { label: { de: 'MP-Feuer', en: 'MP-Feuer' }, path: 'settings', permission: MP_FEUER_READ, icon: 'settings', section: 'settings', onboarding: false },
  ],
  roles: [{ key: 'commander', permissions: ['mp-feuer.*'] }],
  frontend: { remote: 'mp_feuer_web', exposed: './Module' },
} satisfies ModuleManifest;
