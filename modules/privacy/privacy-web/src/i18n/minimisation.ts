/** Texts of data minimisation, purposes of lists and data of third parties (data protection, phase 4 part B). */
export const minimisationDe = {
  thirdParties: {
    open: 'Auskunft zu einer anderen Person …',
    title: 'Auskunft zu einer anderen Person',
    intro: 'Für Personen, die nicht in den Stammdaten stehen: Beteiligte von Einsätzen und Kostenschuldner.',
    search: 'Name, Anschrift oder Kennzeichen',
    searchHint: 'Mindestens 2 Zeichen',
    none: 'Keine Fundstellen',
    columns: { place: 'Fundstelle', name: 'Name', role: 'Rolle', date: 'Datum', details: 'Angaben' },
    select: 'Fundstelle {{reference}} auswählen',
    name: 'Name für das Schreiben',
    address: 'Anschrift für das Schreiben',
    language: 'Sprache',
    create: 'Auskunft erstellen',
    created: 'Die Auskunft wird erstellt. Sie steht danach an der Anfrage bzw. hier zum Herunterladen bereit.',
    selected_one: '1 Fundstelle ausgewählt',
    selected_other: '{{count}} Fundstellen ausgewählt',
    noRights: 'Andere Beteiligte und Einsatzkräfte erscheinen nicht in der Auskunft (Art. 15 Abs. 4).',
    panel: 'Daten der Person in den Modulen',
    panelIntro: 'Suchen Sie die Fundstellen der Person und wählen Sie die passenden aus. Personen mit gleichem Namen unterscheiden Anschrift und Angaben.',
    erase: 'Löschen …',
    eraseTitle: 'Daten der Person löschen',
    eraseText:
      'Name, Anschrift, Telefon, Kennzeichen und Notizen werden an den gewählten Fundstellen entfernt, auch aus früheren Fassungen und der Historie. Erlassene Kostenbescheide bleiben als Kassenunterlage bis zum Ende ihrer Aufbewahrung.',
    reason: 'Grund',
    reasonPlaceholder: 'z. B. Löschantrag vom 20.10.2026',
    eraseSubmit: 'Endgültig löschen',
    results: 'Ergebnis der Löschung',
    outcomes: { anonymized: 'anonymisiert', deleted: 'gelöscht', kept: 'aufbewahrt' },
    requestReports: 'Auskünfte zu dieser Anfrage',
  },
  requests: {
    subject: 'Betroffene Person',
    subjectPerson: 'Person aus den Stammdaten',
    subjectThirdParty: 'andere Person (nicht in den Stammdaten)',
    thirdPartyName: 'Name',
    thirdPartyNote: 'Wo kommt die Person vor?',
    thirdPartyNotePlaceholder: 'z. B. Verursacherin Einsatz 2026-104950',
    thirdParty: 'andere Person',
  },
  register: {
    thirdParties: 'Daten Dritter',
  },
};

export const minimisationEn: typeof minimisationDe = {
  thirdParties: {
    open: 'Access report for another person …',
    title: 'Access report for another person',
    intro: 'For persons who are not in the master data: persons involved in incidents and debtors.',
    search: 'Name, address or licence plate',
    searchHint: 'At least 2 characters',
    none: 'No places found',
    columns: { place: 'Place', name: 'Name', role: 'Role', date: 'Date', details: 'Details' },
    select: 'Select place {{reference}}',
    name: 'Name for the letter',
    address: 'Address for the letter',
    language: 'Language',
    create: 'Create access report',
    created: 'The access report is being created. It can then be downloaded at the request or here.',
    selected_one: '1 place selected',
    selected_other: '{{count}} places selected',
    noRights: 'Other persons involved and fire fighters do not appear in the report (Art. 15(4)).',
    panel: 'Data of the person in the modules',
    panelIntro: 'Search the places of the person and select the matching ones. Address and details tell persons with the same name apart.',
    erase: 'Erase …',
    eraseTitle: 'Erase the data of the person',
    eraseText:
      'Name, address, phone, licence plate and notes are removed at the selected places, also from earlier versions and the history. Issued cost notices are kept as accounting records until their retention period ends.',
    reason: 'Reason',
    reasonPlaceholder: 'e.g. erasure request of 20 Oct 2026',
    eraseSubmit: 'Erase permanently',
    results: 'Result of the erasure',
    outcomes: { anonymized: 'anonymised', deleted: 'deleted', kept: 'kept' },
    requestReports: 'Access reports of this request',
  },
  requests: {
    subject: 'Data subject',
    subjectPerson: 'Person of the master data',
    subjectThirdParty: 'another person (not in the master data)',
    thirdPartyName: 'Name',
    thirdPartyNote: 'Where does the person appear?',
    thirdPartyNotePlaceholder: 'e.g. causer in incident 2026-104950',
    thirdParty: 'another person',
  },
  register: {
    thirdParties: 'Data of third parties',
  },
};

/** Audit actions and detail keys of the third parties (L14). */
export const minimisationAuditDe = {
  actions: {
    'privacy.third-party-erased': 'Daten einer anderen Person gelöscht',
  },
  keys: {
    thirdParty: 'Andere Person',
    places: 'Fundstellen',
    counts: 'Anzahl',
    sources: 'Quellen',
  },
};

export const minimisationAuditEn: typeof minimisationAuditDe = {
  actions: {
    'privacy.third-party-erased': 'Data of another person erased',
  },
  keys: {
    thirdParty: 'Another person',
    places: 'Places',
    counts: 'Counts',
    sources: 'Sources',
  },
};
