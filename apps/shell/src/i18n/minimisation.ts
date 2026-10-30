/** Texts of data minimisation, purposes of lists and data of third parties (data protection, phase 4 part B). */
export const minimisationDe = {
  lists: {
    purpose: 'Zweck',
    purposeRequired: 'Pflicht beim Export: Die Liste enthält Kontakt-, sensible oder Gesundheitsdaten.',
    purposeNote: 'Zweck beschreiben',
    purposeNotePlaceholder: 'z. B. Einladung zur Hauptversammlung',
    personalData: 'Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten',
    columnsOfPurpose: 'Die Liste zeigt nur die Spalten, die der Zweck braucht.',
  },
};

export const minimisationEn: typeof minimisationDe = {
  lists: {
    purpose: 'Purpose',
    purposeRequired: 'Required for exports: the list contains contact, sensitive or health data.',
    purposeNote: 'Describe the purpose',
    purposeNotePlaceholder: 'e.g. invitation to the general assembly',
    personalData: 'Personal data – for official use only, destroy after use',
    columnsOfPurpose: 'The list shows only the columns the purpose needs.',
  },
};

/** Audit detail keys of the list export (purpose). */
export const minimisationAuditDe = {
  keys: {
    purpose: 'Zweck',
    purposeNote: 'Beschreibung des Zwecks',
  },
};

export const minimisationAuditEn: typeof minimisationAuditDe = {
  keys: {
    purpose: 'Purpose',
    purposeNote: 'Description of the purpose',
  },
};
