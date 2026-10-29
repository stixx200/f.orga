import type { ModuleManifest } from '@forga/core-contracts';

export const PROMOTIONS_MANIFEST = {
  id: 'promotions',
  name: { de: 'Beförderungen', en: 'Promotions' },
  version: '0.1.0',
  requires: ['masterdata'],
  permissions: [
    {
      id: 'promotions.read',
      name: { de: 'Beförderungslisten lesen', en: 'Read promotion lists' },
      scope: 'department',
    },
    {
      id: 'promotions.propose',
      name: { de: 'Beförderungen vorschlagen', en: 'Propose promotions' },
      scope: 'department',
    },
    {
      id: 'promotions.decide',
      name: {
        de: 'Beförderungen beschließen und durchführen',
        en: 'Decide and carry out promotions',
      },
      scope: 'brigade',
    },
    {
      id: 'promotions.exclude',
      name: {
        de: 'Von Beförderungen ausschließen',
        en: 'Exclude from promotions',
      },
      scope: 'brigade',
    },
    {
      id: 'promotions.settings.manage',
      name: {
        de: 'Beförderungsregeln einstellen',
        en: 'Configure promotion rules',
      },
      scope: 'brigade',
    },
  ],
  navigation: [
    {
      label: { de: 'Beförderungslisten', en: 'Promotion lists' },
      path: 'lists',
      permission: 'promotions.read',
      icon: 'award',
    },
    {
      label: { de: 'Ausschlüsse', en: 'Exclusions' },
      path: 'exclusions',
      permission: 'promotions.exclude',
      icon: 'alert',
    },
    {
      label: { de: 'Beförderungen', en: 'Promotions' },
      path: 'rules',
      permission: 'promotions.settings.manage',
      icon: 'settings',
      section: 'settings',
    },
  ],
  roles: [
    { key: 'commander', permissions: ['promotions.*'] },
    {
      key: 'department-commander',
      permissions: ['promotions.read', 'promotions.propose'],
    },
  ],
  frontend: { remote: 'promotions_web', exposed: './Module' },
  privacy: {
    personData: true,
    activities: [
      {
        key: 'promotions.promotions',
        subjects: [{ de: 'Angehörige der Feuerwehr', en: 'Members of the fire brigade' }],
        categories: [{ de: 'Dienstgrad, Dienstzeit, Lehrgänge, Ausschlüsse mit Grund, Entscheidungen', en: 'Rank, years of service, courses, exclusions with reason, decisions' }],
        legalBasisHint: { de: 'Feuerwehrgesetz Baden-Württemberg (FwG) und Regeln für Beförderungen; mit dem DSB festlegen', en: 'Fire Brigade Act of Baden-Württemberg (FwG) and promotion rules; decide with the DPO' },
        name: { de: 'Beförderungen', en: 'Promotions' },
        purpose: { de: 'Vorbereitung und Nachweis der Beförderungen nach den Beförderungsregeln', en: 'Preparing and documenting promotions under the promotion rules' },
      },
    ],
  },
} satisfies ModuleManifest;
