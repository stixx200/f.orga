import type { ModuleManifest } from '@forga/core-contracts';

export const MASTERDATA_MANIFEST = {
  id: 'masterdata',
  name: { de: 'Stammdaten', en: 'Master data' },
  version: '0.1.0',
  permissions: [
    { id: 'masterdata.self', name: { de: 'Eigene Daten sehen und Kontaktdaten ändern', en: 'See own data and change contact details' }, scope: 'department' },
    {
      id: 'masterdata.persons.directory',
      name: { de: 'Personenverzeichnis (nur Name, Status und Abteilung)', en: 'Person directory (name, status and department only)' },
      scope: 'department',
    },
    { id: 'masterdata.persons.read', name: { de: 'Personen lesen (Personalakte)', en: 'Read persons (personnel file)' }, scope: 'department' },
    { id: 'masterdata.persons.write', name: { de: 'Personen bearbeiten', en: 'Edit persons' }, scope: 'department' },
    {
      id: 'masterdata.persons.sensitive',
      name: { de: 'Sensible Personendaten', en: 'Sensitive personal data' },
      scope: 'department',
      stepUp: true,
    },
    {
      id: 'masterdata.organization.manage',
      name: { de: 'Organisation bearbeiten', en: 'Manage organization' },
      scope: 'department',
    },
    {
      id: 'masterdata.courses.plan',
      name: { de: 'Lehrgänge planen und Teilnahmen eintragen', en: 'Plan courses and record attendances' },
      scope: 'department',
    },
    {
      id: 'masterdata.licenses.check',
      name: { de: 'Führerscheine kontrollieren', en: 'Check driving licences' },
      scope: 'department',
    },
    { id: 'masterdata.catalogs.manage', name: { de: 'Kataloge verwalten', en: 'Manage catalogs' }, scope: 'brigade' },
    { id: 'masterdata.settings.manage', name: { de: 'Regeln der Feuerwehrsatzung einstellen', en: 'Configure the rules of the fire brigade statute' }, scope: 'brigade' },
  ],
  navigation: [
    { label: { de: 'Personen', en: 'Persons' }, path: 'persons', permission: 'masterdata.persons.read', icon: 'user' },
    { label: { de: 'Organisation', en: 'Organization' }, path: 'organization', icon: 'sitemap' },
    { label: { de: 'Fahrzeuge', en: 'Vehicles' }, path: 'vehicles', icon: 'truck' },
    { label: { de: 'Lehrgangsplanung', en: 'Course planning' }, path: 'courses', permission: 'masterdata.courses.plan', icon: 'school' },
    { label: { de: 'Führerscheinkontrollen', en: 'Driving licence checks' }, path: 'driver-licenses', permission: 'masterdata.licenses.check', icon: 'id' },
    { label: { de: 'Kataloge', en: 'Catalogs' }, path: 'catalogs', permission: 'masterdata.catalogs.manage', icon: 'catalog', section: 'administration' },
    { label: { de: 'Feuerwehrsatzung', en: 'Fire brigade statute' }, path: 'settings', permission: 'masterdata.settings.manage', icon: 'settings', section: 'settings' },
    { label: { de: 'Führerscheinkontrolle', en: 'Driving licence checks' }, path: 'driver-licenses/settings', permission: 'masterdata.settings.manage', icon: 'id', section: 'settings' },
  ],
  roles: [
    { key: 'member', permissions: ['masterdata.self'] },
    { key: 'department-commander', permissions: ['masterdata.self'] },
    { key: 'group-leader', permissions: ['masterdata.self'] },
    { key: 'course-coordinator', permissions: ['masterdata.self'] },
    { key: 'breathing-apparatus-officer', permissions: ['masterdata.self'] },
    { key: 'equipment-officer', permissions: ['masterdata.self'] },
    { key: 'clothing-officer', permissions: ['masterdata.self'] },
    { key: 'administration', permissions: ['masterdata.self'] },
    { key: 'commander', permissions: ['masterdata.*'] },
    {
      key: 'department-commander',
      permissions: [
        'masterdata.persons.read',
        'masterdata.persons.write',
        'masterdata.persons.sensitive',
        'masterdata.organization.manage',
        'masterdata.courses.plan',
        'masterdata.licenses.check',
      ],
      // Of other departments only name, status and department (e.g. for support in incidents); the personnel file stays in the own department.
      permissionsAllDepartments: ['masterdata.persons.directory'],
    },
    { key: 'group-leader', permissions: ['masterdata.persons.read'] },
    { key: 'course-coordinator', permissions: ['masterdata.persons.read', 'masterdata.courses.plan'] },
    { key: 'breathing-apparatus-officer', permissions: ['masterdata.persons.read'] },
    { key: 'equipment-officer', permissions: ['masterdata.persons.read'] },
    { key: 'administration', permissions: ['masterdata.persons.read', 'masterdata.persons.sensitive'] },
  ],
  frontend: { remote: 'masterdata_web', exposed: './Module' },
  privacy: {
    personData: true,
    activities: [
      {
        key: 'masterdata.persons',
        name: { de: 'Personalverwaltung', en: 'Personnel administration' },
        purpose: {
          de: 'Führung der Personalakte der Feuerwehrangehörigen: Mitgliedschaft, Laufbahn, Ausbildung, Ehrungen und Erreichbarkeit',
          en: 'Keeping the personnel file of the fire brigade members: membership, career, training, honours and contact',
        },
        recipients: [{ de: 'Gemeindeverwaltung (Ehrungen, Personalangelegenheiten)', en: 'Municipal administration (honours, personnel matters)' }],
        retention: ['masterdata.person-core', 'masterdata.person-file'],
      },
      {
        key: 'masterdata.driver-licenses',
        name: { de: 'Führerscheinkontrolle', en: 'Driving licence checks' },
        purpose: { de: 'Nachweis der Fahrberechtigung für Einsatzfahrzeuge (Halterpflicht der Gemeinde)', en: 'Evidence of the driving permission for fire service vehicles (duty of the vehicle owner)' },
        retention: ['masterdata.person-file'],
      },
    ],
  },
} satisfies ModuleManifest;
