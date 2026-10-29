/** Texts of the erasure check on the page of a request on erasure (L7). Keep both languages in sync. */
export const erasureDe = {
  title: 'Löschprüfung',
  intro: 'Jedes Modul meldet, was es löschen darf und was nach dem Aufbewahrungsplan noch aufzubewahren ist (Art. 17 Abs. 3).',
  area: 'Bereich',
  data: 'Daten',
  outcome: 'Ergebnis',
  reason: 'Grund',
  outcomes: { delete: 'löschen', anonymize: 'anonymisieren', keep: 'einschränken' },
  keepUntil: 'einschränken bis {{date}}',
  nothing: 'Über die Person ist nichts mehr gespeichert.',
  keptWarning: 'Teile bleiben eingeschränkt gespeichert. Das Antwortschreiben nennt die Gründe und die Fristen.',
  execute: 'Ausführen …',
  executeTitle: 'Löschung ausführen?',
  executeText:
    'Für {{name}} werden {{deleted}} Bereiche gelöscht, {{anonymized}} anonymisiert und {{kept}} bis zum Ende ihrer Frist eingeschränkt. Das lässt sich nicht rückgängig machen. In Sicherungen bleiben die Daten bis zu deren Ablauf.',
  confirmName: 'Zur Bestätigung den Namen eingeben',
  submit: 'Löschung ausführen',
  done: 'Löschung ausgeführt am {{date}}: {{deleted}} Bereiche gelöscht, {{anonymized}} anonymisiert, {{kept}} eingeschränkt.',
  restrictedUntil: 'Verarbeitung eingeschränkt bis {{date}}.',
  restrictedOpen: 'Verarbeitung eingeschränkt, bis die Fristen enden.',
  closedHint: 'Die Anfrage ist abgeschlossen; zum Ausführen wieder öffnen.',
};

export const erasureEn: typeof erasureDe = {
  title: 'Erasure check',
  intro: 'Every module reports what it may erase and what has to be kept under the retention plan (Art. 17(3)).',
  area: 'Area',
  data: 'Data',
  outcome: 'Result',
  reason: 'Reason',
  outcomes: { delete: 'delete', anonymize: 'anonymise', keep: 'restrict' },
  keepUntil: 'restrict until {{date}}',
  nothing: 'Nothing is stored about the person any more.',
  keptWarning: 'Parts stay stored with restricted processing. The reply letter names the reasons and periods.',
  execute: 'Execute …',
  executeTitle: 'Execute the erasure?',
  executeText:
    'For {{name}}, {{deleted}} areas are deleted, {{anonymized}} anonymised and {{kept}} restricted until the end of their period. This cannot be undone. Backups keep the data until they expire.',
  confirmName: 'Type the name to confirm',
  submit: 'Execute erasure',
  done: 'Erasure executed on {{date}}: {{deleted}} areas deleted, {{anonymized}} anonymised, {{kept}} restricted.',
  restrictedUntil: 'Processing restricted until {{date}}.',
  restrictedOpen: 'Processing restricted until the periods end.',
  closedHint: 'The request is closed; reopen it to execute.',
};

/** Audit log: the execution with its counts. */
export const erasureAuditKeysDe = { deleted: 'Gelöscht', anonymized: 'Anonymisiert', kept: 'Eingeschränkt', records: 'Datensätze je Bereich' };
export const erasureAuditKeysEn: typeof erasureAuditKeysDe = { deleted: 'Deleted', anonymized: 'Anonymised', kept: 'Restricted', records: 'Records per area' };
export const erasureAuditDe = { 'privacy.erasure-executed': 'Löschung ausgeführt' };
export const erasureAuditEn: typeof erasureAuditDe = { 'privacy.erasure-executed': 'Erasure executed' };
