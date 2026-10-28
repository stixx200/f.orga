import type { ModuleManifest } from '@forga/core-contracts';

export const COST_RECOVERY_MANIFEST = {
  id: 'cost-recovery',
  name: { de: 'Kostenersatz', en: 'Cost recovery' },
  version: '0.1.0',
  requires: ['masterdata', 'incidents'],
  optional: ['equipment'],
  permissions: [
    { id: 'cost-recovery.read', name: { de: 'Kostenbescheide lesen', en: 'Read cost notices' }, scope: 'brigade' },
    { id: 'cost-recovery.write', name: { de: 'Kostenbescheide bearbeiten', en: 'Edit cost notices' }, scope: 'brigade' },
    { id: 'cost-recovery.issue', name: { de: 'Kostenbescheide erlassen', en: 'Issue cost notices' }, scope: 'brigade' },
    { id: 'cost-recovery.refund', name: { de: 'Erstattungen von Überzahlungen', en: 'Refunds of overpayments' }, scope: 'brigade' },
    { id: 'cost-recovery.settings.manage', name: { de: 'Satztabellen und Textbausteine', en: 'Rate tables and text blocks' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Kostenpflichtige Einsätze', en: 'Chargeable incidents' }, path: 'candidates', permission: 'cost-recovery.write', icon: 'receipt' },
    { label: { de: 'Bescheide', en: 'Notices' }, path: 'notices', permission: 'cost-recovery.read', icon: 'list' },
    { label: { de: 'Adressbuch', en: 'Address book' }, path: 'debtors', permission: 'cost-recovery.write', icon: 'users' },
    { label: { de: 'Kostenersatz', en: 'Cost recovery' }, path: 'settings', permission: 'cost-recovery.settings.manage', icon: 'settings', section: 'settings' },
  ],
  roles: [
    { key: 'commander', permissions: ['cost-recovery.read', 'cost-recovery.write', 'cost-recovery.issue'] },
    { key: 'administration', permissions: ['cost-recovery.*'] },
  ],
  frontend: { remote: 'cost_recovery_web', exposed: './Module' },
} satisfies ModuleManifest;
