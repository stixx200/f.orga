/** Texts of the audit log page (shell) for the actions and detail keys of this module. */
export const audit = {
  de: {
    actions: {
      'masterdata.department-moved': 'Abteilung verschoben',
      'masterdata.license-token-registered': 'Transponder für Führerschein registriert',
      'masterdata.license-token-revoked': 'Transponder für Führerschein gesperrt',
      'masterdata.person-fields-cleared': 'Werte abgeschalteter Felder der Personalakte gelöscht',
    },
    keys: {
      from: 'Bisher unter',
      to: 'Jetzt unter',
      tokenId: 'Transponder',
      suffix: 'Endung der Kennung',
      replaced: 'Ersetzte Transponder',
      fields: 'Felder',
      counts: 'Personen je Feld',
    },
  },
  en: {
    actions: {
      'masterdata.department-moved': 'Department moved',
      'masterdata.license-token-registered': 'Driving licence transponder registered',
      'masterdata.license-token-revoked': 'Driving licence transponder revoked',
      'masterdata.person-fields-cleared': 'Values of switched-off fields of the person file deleted',
    },
    keys: {
      from: 'Previously below',
      to: 'Now below',
      tokenId: 'Transponder',
      suffix: 'End of the ID',
      replaced: 'Replaced transponders',
      fields: 'Fields',
      counts: 'Persons per field',
    },
  },
};
