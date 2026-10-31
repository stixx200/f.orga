import type { ModuleManifest } from '@forga/core-contracts';

export const INCIDENTS_MANIFEST = {
  id: 'incidents',
  name: { de: 'Einsatzberichte', en: 'Incident reports' },
  version: '0.1.0',
  requires: ['masterdata'],
  optional: ['equipment', 'respiratory-protection', 'compensation', 'cost-recovery', 'duty-officer'],
  permissions: [
    { id: 'incidents.reports.read', name: { de: 'Einsatzberichte lesen', en: 'Read incident reports' }, scope: 'department' },
    {
      id: 'incidents.reports.write',
      name: { de: 'Einsatzberichte schreiben', en: 'Write incident reports' },
      scope: 'department',
    },
    {
      id: 'incidents.reports.delete',
      name: { de: 'Einsatzberichte löschen', en: 'Delete incident reports' },
      scope: 'brigade',
      // Not part of `incidents.*`: only the administrator role (`*`) has it, unless a role lists the id itself.
      explicit: true,
    },
    {
      id: 'incidents.reports.review',
      name: { de: 'Einsatzberichte vorprüfen (zurückgeben, Verfasser erinnern)', en: 'Pre-review incident reports (return, remind authors)' },
      scope: 'department',
    },
    {
      id: 'incidents.reports.release',
      name: { de: 'Einsatzberichte freigeben', en: 'Release incident reports' },
      scope: 'brigade',
    },
    {
      id: 'incidents.costs',
      name: { de: 'Kosten und Bemerkungen des Einsatzes eintragen', en: 'Enter costs and notes of incidents' },
      scope: 'brigade',
    },
    // Health data (Art. 9 GDPR): "injured"/"killed" in the personnel of a report, only after the second factor.
    // Authors and releasers always see them.
    {
      id: 'incidents.injuries.read',
      name: { de: 'Verletzte und Getötete im Personal sehen', en: 'See injured and killed in the personnel' },
      scope: 'department',
      stepUp: true,
    },
    { id: 'incidents.reports.unlock', name: { de: 'Sperre aufheben', en: 'Unlock reports' }, scope: 'brigade' },
    { id: 'incidents.statistics', name: { de: 'Jahresstatistik', en: 'Annual statistics' }, scope: 'brigade' },
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
      id: 'incidents.self',
      name: { de: 'Eigene Einsätze sehen', en: 'See own incidents' },
      scope: 'department',
    },
    {
      id: 'incidents.api.create',
      name: { de: 'Einsätze per API anlegen', en: 'Create incidents via API' },
      scope: 'brigade',
    },
  ],
  navigation: [
    { label: { de: 'Einsätze', en: 'Incidents' }, path: 'incidents', permission: 'incidents.reports.read', icon: 'firetruck' },
    { label: { de: 'Zur Prüfung', en: 'For review' }, path: 'review', permission: 'incidents.reports.review', icon: 'check' },
    { label: { de: 'Offene Berichte', en: 'Open reports' }, path: 'open', permission: 'incidents.reports.read', icon: 'alert' },
    {
      label: { de: 'Prüfung Entschädigung (Einsatzberichte)', en: 'Compensation check (incident reports)' },
      path: 'compensation',
      permission: 'incidents.compensation.export',
      icon: 'coins',
    },
    { label: { de: 'Jahresstatistik', en: 'Annual statistics' }, path: 'statistics', permission: 'incidents.statistics', icon: 'chart' },
    { label: { de: 'Einsatzberichte', en: 'Incident reports' }, path: 'settings', permission: 'incidents.settings.manage', icon: 'settings', section: 'settings' },
  ],
  roles: [
    { key: 'commander', permissions: ['incidents.*'] },
    { key: 'member', permissions: ['incidents.self'] },
    {
      key: 'department-commander',
      permissions: ['incidents.reports.read', 'incidents.reports.write', 'incidents.reports.review', 'incidents.self'],
    },
    { key: 'group-leader', permissions: ['incidents.reports.read', 'incidents.reports.write', 'incidents.self'] },
    { key: 'course-coordinator', permissions: ['incidents.self'] },
    { key: 'breathing-apparatus-officer', permissions: ['incidents.reports.read', 'incidents.self'] },
    { key: 'equipment-officer', permissions: ['incidents.self'] },
    { key: 'clothing-officer', permissions: ['incidents.self'] },
    {
      key: 'administration',
      permissions: ['incidents.reports.read', 'incidents.compensation.export', 'incidents.statistics', 'incidents.self'],
    },
  ],
  frontend: { remote: 'incidents_web', exposed: './Module' },
  privacy: {
    personData: true,
    activities: [
      {
        key: 'incidents.reports',
        subjects: [{ de: 'Einsatzkräfte', en: 'Fire fighters on duty' }, { de: 'Beteiligte (Geschädigte, Verursacher, Zeugen, Anrufer)', en: 'Persons involved (injured parties, causers, witnesses, callers)' }],
        categories: [
          { de: 'Einsatzzeiten, Funktion, Fahrzeug, Atemschutz', en: 'Times of the operation, function, vehicle, breathing apparatus' },
          { de: 'Name, Anschrift, Telefon und Kennzeichen von Beteiligten', en: 'Name, address, phone and licence plate of persons involved' },
          { de: 'Lage, Maßnahmen, Fotos', en: 'Situation, measures, photos' },
        ],
        health: true,
        healthNote: { de: 'Verletzungen von Einsatzkräften und Beteiligten', en: 'Injuries of fire fighters and persons involved' },
        thirdParties: true,
        legalBasisHint: { de: 'Feuerwehrgesetz Baden-Württemberg (FwG), Dokumentation der Einsätze; mit dem DSB festlegen', en: 'Fire Brigade Act of Baden-Württemberg (FwG), documentation of operations; decide with the DPO' },
        name: { de: 'Einsatzdokumentation', en: 'Incident documentation' },
        purpose: { de: 'Dokumentation der Einsätze, Grundlage für Entschädigung, Kostenersatz und Jahresstatistik', en: 'Documentation of incidents, basis for compensation, cost recovery and annual statistics' },
        recipients: [{ de: 'Kreisbrandmeister und Statistikportal (Jahresstatistik, nur Zahlen ohne Namen)', en: 'District fire officer and statistics portal (annual statistics, figures only, no names)' }],
        retention: ['incidents.incidents', 'incidents.involved-parties'],
      },
    ],
  },
} satisfies ModuleManifest;
