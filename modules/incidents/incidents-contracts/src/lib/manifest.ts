import type { ModuleManifest } from '@forga/core-contracts';

export const INCIDENTS_MANIFEST = {
  id: 'incidents',
  name: { de: 'Einsatzberichte', en: 'Incident reports' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['equipment', 'respiratory-protection', 'compensation', 'cost-recovery'],
  permissions: [
    { id: 'incidents.reports.read', name: { de: 'Einsatzberichte lesen', en: 'Read incident reports' }, scope: 'department' },
    {
      id: 'incidents.reports.write',
      name: { de: 'Einsatzberichte schreiben', en: 'Write incident reports' },
      scope: 'department',
    },
    {
      id: 'incidents.reports.release',
      name: { de: 'Einsatzberichte freigeben', en: 'Release incident reports' },
      scope: 'brigade',
    },
    { id: 'incidents.reports.unlock', name: { de: 'Sperre aufheben', en: 'Unlock reports' }, scope: 'brigade' },
    { id: 'incidents.statistics', name: { de: 'Jahresstatistik', en: 'Annual statistics' }, scope: 'brigade' },
    {
      id: 'incidents.duty.manage',
      name: { de: 'Dienstplan (Sonderdienste) pflegen', en: 'Manage duty roster' },
      scope: 'brigade',
    },
    {
      id: 'incidents.compensation.export',
      name: { de: 'Entschädigung exportieren', en: 'Export compensation' },
      scope: 'brigade',
    },
    {
      id: 'incidents.settings.manage',
      name: { de: 'Einstellungen Einsatzberichte', en: 'Incident report settings' },
      scope: 'brigade',
    },
    {
      id: 'incidents.api.create',
      name: { de: 'Einsätze per API anlegen', en: 'Create incidents via API' },
      scope: 'brigade',
    },
  ],
  navigation: [
    { label: { de: 'Einsätze', en: 'Incidents' }, path: 'incidents', permission: 'incidents.reports.read', icon: 'firetruck' },
    { label: { de: 'Zur Prüfung', en: 'For review' }, path: 'review', permission: 'incidents.reports.release', icon: 'check' },
    { label: { de: 'Offene Berichte', en: 'Open reports' }, path: 'open', permission: 'incidents.reports.read', icon: 'alert' },
    { label: { de: 'Entschädigung', en: 'Compensation' }, path: 'compensation', permission: 'incidents.compensation.export', icon: 'coins' },
    { label: { de: 'EvD-Dienst', en: 'Duty officer' }, path: 'duty', permission: 'incidents.duty.manage', icon: 'calendar' },
    { label: { de: 'Jahresstatistik', en: 'Annual statistics' }, path: 'statistics', permission: 'incidents.statistics', icon: 'chart' },
    { label: { de: 'Einsatzberichte', en: 'Incident reports' }, path: 'settings', permission: 'incidents.settings.manage', icon: 'settings', section: 'administration' },
  ],
  roles: [
    { key: 'commander', permissions: ['incidents.*'] },
    { key: 'department-commander', permissions: ['incidents.reports.read', 'incidents.reports.write'] },
    { key: 'group-leader', permissions: ['incidents.reports.read', 'incidents.reports.write'] },
    { key: 'breathing-apparatus-officer', permissions: ['incidents.reports.read'] },
    {
      key: 'administration',
      permissions: ['incidents.reports.read', 'incidents.compensation.export', 'incidents.statistics', 'incidents.duty.manage'],
    },
  ],
  frontend: { remote: 'incidents_web', exposed: './Module' },
} satisfies ModuleManifest;
