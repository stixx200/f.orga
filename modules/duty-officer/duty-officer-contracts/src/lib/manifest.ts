import type { ModuleManifest } from '@forga/core-contracts';

export const DUTY_OFFICER_READ = 'duty-officer.read';
export const DUTY_OFFICER_WRITE = 'duty-officer.reports.write';
export const DUTY_OFFICER_MANAGE = 'duty-officer.reports.manage';
export const DUTY_OFFICER_ROSTER = 'duty-officer.roster.manage';

/** Key of the brigade-wide unit of the EvD reports in the incidents module. */
export const DUTY_OFFICER_UNIT = 'duty-officer';

export const DUTY_OFFICER_MANIFEST = {
  id: 'duty-officer',
  name: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' },
  version: '0.1.0',
  requires: ['masterdata', 'incidents'],
  optional: ['compensation'],
  permissions: [
    { id: DUTY_OFFICER_READ, name: { de: 'EvD-Dienst und EvD-Berichte einsehen', en: 'View duty officer roster and reports' }, scope: 'brigade' },
    { id: DUTY_OFFICER_WRITE, name: { de: 'EvD-Berichte schreiben', en: 'Write duty officer reports' }, scope: 'brigade' },
    {
      id: DUTY_OFFICER_MANAGE,
      name: { de: 'EvD-Berichte verwalten (vorprüfen, „Kein EvD bei diesem Einsatz“)', en: 'Manage duty officer reports (pre-review, "no duty officer at this incident")' },
      scope: 'brigade',
    },
    { id: DUTY_OFFICER_ROSTER, name: { de: 'EvD-Dienstplan pflegen', en: 'Manage duty officer roster' }, scope: 'brigade' },
    { id: 'duty-officer.settings.manage', name: { de: 'Einstellungen Einsatzleiter vom Dienst', en: 'Duty officer settings' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'EvD-Dienst', en: 'Duty officer roster' }, path: 'roster', permission: DUTY_OFFICER_READ, icon: 'calendar' },
    { label: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' }, path: 'settings', permission: 'duty-officer.settings.manage', icon: 'settings', section: 'settings' },
  ],
  roles: [
    { key: 'commander', permissions: ['duty-officer.*'] },
    {
      key: 'duty-officer',
      name: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' },
      description: {
        de: 'EvD-Berichte schreiben, Einsatzberichte aller Abteilungen und den EvD-Dienstplan lesen',
        en: 'Write duty officer reports, read the incident reports of all departments and the duty officer roster',
      },
      permissions: [DUTY_OFFICER_READ, DUTY_OFFICER_WRITE, 'incidents.reports.read', 'incidents.self'],
      // The duty officer leads incidents of every department.
      permissionsAllDepartments: ['incidents.reports.read'],
    },
    { key: 'administration', permissions: [DUTY_OFFICER_READ, DUTY_OFFICER_ROSTER] },
  ],
  frontend: { remote: 'duty_officer_web', exposed: './Module' },
  privacy: {
    personData: true,
    activities: [
      {
        key: 'duty-officer.roster',
        subjects: [{ de: 'Einsatzleiter vom Dienst', en: 'Duty officers' }],
        categories: [{ de: 'Dienste mit Zeitraum, Entschädigung, Notizen', en: 'Duties with period, compensation, notes' }],
        legalBasisHint: { de: 'Feuerwehrgesetz Baden-Württemberg (FwG), Entschädigungssatzung; mit dem DSB festlegen', en: 'Fire Brigade Act of Baden-Württemberg (FwG), compensation statute; decide with the DPO' },
        name: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' },
        purpose: { de: 'Dienstplan der Sonderdienste (z. B. Einsatzleiter vom Dienst) und ihre Entschädigung', en: 'Roster of special duties (e.g. duty officer) and their compensation' },
        recipients: [{ de: 'Gemeindeverwaltung/Kämmerei (Entschädigung)', en: 'Municipal administration/treasury (compensation)' }],
      },
    ],
  },
} satisfies ModuleManifest;
