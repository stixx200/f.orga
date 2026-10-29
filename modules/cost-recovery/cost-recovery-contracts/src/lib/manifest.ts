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
  // Debtors are no persons of the master data (no access report or anonymisation per member); the activity names them
  // for the register of processing activities.
  privacy: {
    personData: false,
    activities: [
      {
        key: 'cost-recovery.notices',
        name: { de: 'Kostenersatz', en: 'Cost recovery' },
        purpose: { de: 'Erhebung des Kostenersatzes für Einsätze nach der Kostenersatzsatzung', en: 'Recovering the costs of operations under the cost recovery statute' },
        recipients: [{ de: 'Gemeindeverwaltung/Kämmerei (Sollstellung, Zahlungseingang)', en: 'Municipal administration/treasury (debit entry, payments)' }],
        retention: ['cost-recovery.notices'],
        subjects: [{ de: 'Kostenschuldner (Verursacher, Eigentümer, Halter)', en: 'Debtors (causers, owners, keepers)' }],
        categories: [{ de: 'Name, Anschrift, Einsatz, Personal- und Fahrzeugansätze, Zahlungen und Mahnungen', en: 'Name, address, incident, personnel and vehicle rates, payments and reminders' }],
        legalBasisHint: { de: 'Kostenersatz nach dem FwG und der Kostenersatzsatzung; mit dem DSB festlegen', en: 'Cost recovery under the FwG and the cost recovery statute; decide with the DPO' },
        thirdParties: true,
      },
    ],
  },
} satisfies ModuleManifest;
