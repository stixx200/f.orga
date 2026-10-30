/**
 * Texts of the hardening (sessions L16, tokens L23, passwords L24, register L26, locked users L21). Keep both languages
 * in sync.
 */
export const hardeningDe = {
  login: {
    remember: 'Angemeldet bleiben',
    rememberHint: '14 Tage, auch nach dem Schließen des Browsers; nicht für Konten mit Verwaltungsrechten. Nicht auf geteilten Rechnern.',
  },
  devices: {
    title: 'Angemeldete Geräte',
    idleHint: 'Ohne Bedienung werden Sie nach {{minutes}} Minuten abgemeldet.',
    persistentHint: 'Angemeldet bleiben: Diese Anmeldung gilt bis zu 14 Tage.',
    none: 'Keine Anmeldungen.',
    browser: 'Browser',
    address: 'Adresse (gekürzt)',
    since: 'Angemeldet seit',
    lastActivity: 'Letzte Aktivität',
    unknown: 'unbekannt',
    current: 'Dieses Gerät',
    persistent: 'Angemeldet bleiben',
    end: 'Abmelden',
    ended: 'Das Gerät wurde abgemeldet.',
    endOthers: 'Alle anderen abmelden …',
    endOthersTitle: 'Alle anderen Geräte abmelden?',
    endOthersText_one: 'Ein anderes Gerät wird abgemeldet. Diese Anmeldung bleibt bestehen.',
    endOthersText_other: '{{count}} andere Geräte werden abgemeldet. Diese Anmeldung bleibt bestehen.',
    endOthersConfirm: 'Abmelden',
    othersEnded: 'Alle anderen Geräte wurden abgemeldet.',
  },
  sessions: {
    title: 'Sitzungen',
    hint: 'Sitzungen enden nach der eingestellten Zeit ohne Bedienung; Abfragen im Hintergrund zählen nicht. Die Anmeldeseite der Infoterminals ist davon nicht betroffen.',
    idlePrivileged: 'Abmeldung bei Konten mit Verwaltungsrechten',
    idlePrivilegedHint: 'Minuten ohne Bedienung (Rechte mit zweitem Faktor oder Datenschutz), 5 bis 1440',
    idleOther: 'Abmeldung bei anderen Konten',
    idleOtherHint: 'Minuten ohne Bedienung, 5 bis 10080',
    allowRemember: '„Angemeldet bleiben“ anbieten',
    allowRememberHint: 'Nur für Konten ohne Verwaltungsrechte, höchstens 14 Tage, ohne Abmeldung bei Inaktivität.',
  },
  users: {
    lockedSince: 'gesperrt seit {{date}}',
  },
  tokens: {
    recipient: 'Empfänger/System',
    recipientHint: 'Welches System erhält die Daten und wer betreibt es, z. B. „Alarmierungsdienst (Firma Muster GmbH)“. Steht im Verzeichnis der Verarbeitungstätigkeiten und in der Auskunft.',
    purpose: 'Zweck',
    purposeHint: 'Wofür das System die Daten nutzt.',
    validUntilHint: 'Pflicht, höchstens {{days}} Tage (2 Jahre). Vor dem Ablauf erscheint eine Aufgabe.',
    addresses: 'Erlaubte Adressen',
    addressesHint: 'Optional: IP-Adressen oder Netze (z. B. 10.0.0.0/8), getrennt durch Komma oder Zeilenumbruch. Leer: von überall.',
    personalData: 'Dieser Token erhält Personendaten der Mitglieder. Das System und sein Betreiber stehen als Empfänger im Verzeichnis und in der Auskunft; mit dem Betreiber ist ggf. ein Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) nötig.',
    onlyFrom: 'nur von {{addresses}}',
    anyAddress: 'von jeder Adresse',
    endsSoon: 'läuft bald ab',
    noExpiry: 'ohne Ablauf – neu ausstellen',
  },
};

export const hardeningEn: typeof hardeningDe = {
  login: {
    remember: 'Stay signed in',
    rememberHint: '14 days, also after closing the browser; not for accounts with administrative permissions. Not on shared computers.',
  },
  devices: {
    title: 'Signed-in devices',
    idleHint: 'Without input you are signed out after {{minutes}} minutes.',
    persistentHint: 'Stay signed in: this sign-in is valid for up to 14 days.',
    none: 'No sign-ins.',
    browser: 'Browser',
    address: 'Address (shortened)',
    since: 'Signed in since',
    lastActivity: 'Last activity',
    unknown: 'unknown',
    current: 'This device',
    persistent: 'Stay signed in',
    end: 'Sign out',
    ended: 'The device was signed out.',
    endOthers: 'Sign out all others …',
    endOthersTitle: 'Sign out all other devices?',
    endOthersText_one: 'One other device is signed out. This sign-in stays.',
    endOthersText_other: '{{count}} other devices are signed out. This sign-in stays.',
    endOthersConfirm: 'Sign out',
    othersEnded: 'All other devices were signed out.',
  },
  sessions: {
    title: 'Sessions',
    hint: 'Sessions end after the set time without input; requests in the background do not count. The sign-in of the info terminals is not affected.',
    idlePrivileged: 'Sign-out for accounts with administrative permissions',
    idlePrivilegedHint: 'Minutes without input (permissions with second factor or data protection), 5 to 1440',
    idleOther: 'Sign-out for other accounts',
    idleOtherHint: 'Minutes without input, 5 to 10080',
    allowRemember: 'Offer "stay signed in"',
    allowRememberHint: 'Only for accounts without administrative permissions, at most 14 days, no sign-out after inactivity.',
  },
  users: {
    lockedSince: 'locked since {{date}}',
  },
  tokens: {
    recipient: 'Recipient/system',
    recipientHint: 'Which system receives the data and who operates it, e.g. "Alerting service (Example Ltd)". Listed in the record of processing activities and in the access report.',
    purpose: 'Purpose',
    purposeHint: 'What the system uses the data for.',
    validUntilHint: 'Required, at most {{days}} days (2 years). A task appears before it expires.',
    addresses: 'Allowed addresses',
    addressesHint: 'Optional: IP addresses or networks (e.g. 10.0.0.0/8), separated by comma or line break. Empty: from anywhere.',
    personalData: 'This token receives personal data of the members. The system and its operator are listed as recipient in the register and the access report; a data processing agreement (Art. 28 GDPR) with the operator may be needed.',
    onlyFrom: 'only from {{addresses}}',
    anyAddress: 'from any address',
    endsSoon: 'expires soon',
    noExpiry: 'no expiry – issue again',
  },
};

/** Readable texts of the audit actions of this part (merged into `audit.actions`). */
export const hardeningAuditDe = {
  'auth.session-idle-ended': 'Sitzung nach Inaktivität beendet',
  'auth.session-ended': 'Anderes Gerät abgemeldet',
  'auth.other-sessions-ended': 'Alle anderen Geräte abgemeldet',
  'tokens.address-rejected': 'API-Token von nicht erlaubter Adresse abgelehnt',
};

export const hardeningAuditEn: typeof hardeningAuditDe = {
  'auth.session-idle-ended': 'Session ended after inactivity',
  'auth.session-ended': 'Other device signed out',
  'auth.other-sessions-ended': 'All other devices signed out',
  'tokens.address-rejected': 'API token rejected from an address not allowed',
};

/** Detail keys of these audit entries (merged into `audit.keys`). */
export const hardeningAuditKeysDe = {
  idleMinutes: 'Minuten ohne Bedienung',
  remember: 'Angemeldet bleiben',
  browser: 'Browser',
  recipient: 'Empfänger',
  expiresOn: 'Gültig bis',
  allowedAddresses: 'Erlaubte Adressen',
  address: 'Adresse',
  metadataRemoved: 'Metadaten entfernt',
  devices: 'Gesperrte Geräte',
};

export const hardeningAuditKeysEn: typeof hardeningAuditKeysDe = {
  idleMinutes: 'Minutes without input',
  remember: 'Stay signed in',
  browser: 'Browser',
  recipient: 'Recipient',
  expiresOn: 'Valid until',
  allowedAddresses: 'Allowed addresses',
  address: 'Address',
  metadataRemoved: 'Metadata removed',
  devices: 'Blocked devices',
};
