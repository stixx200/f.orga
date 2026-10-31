# Datenschutz (umgesetzter Stand)

Was vom [Datenschutzkonzept](../geplant/datenschutz.md) im Code existiert: Phase 1 (L1, L2, L5 teilweise, L6, L18 teilweise), aus Phase 2 Datenschutzhinweis und Information (L4), Betroffenenanfragen mit Frist und Einschränkung der Verarbeitung (L7) sowie Widerspruch (L19) und die Auskunft als PDF (L3), aus Phase 3 Verzeichnis der Verarbeitungstätigkeiten mit technischen Maßnahmen (L8), Einwilligungen (L9), Berichtigung (L12), Leseprotokoll und Transparenz der Impersonation (L15) sowie Datenpannen (L20), aus Phase 4 die Löschprüfung je Modul (L7), die vollständige Anonymisierung über alle Module (L13), abschaltbare Felder der Personalakte (L10), Zweck der Listen und Exporte (L11), Daten Dritter (L14) und die Aufbewahrung der Protokolle und Laufberichte (L29), aus Phase 5 (Härtung) Sitzungen (L16), Verschlüsselung (L17), gesperrte Benutzer ohne Person (L21), Infoterminal (L22), API-Tokens (L23), Passwörter und Anfragebegrenzung (L24), Auftragsverarbeiter (L25), Hinweis auf die Folgenabschätzung (L26), Anhänge (L27) und MP-Feuer-Übernahme (L28). Offene Punkte stehen dort. Weitere umgesetzte Bausteine: Rechte je Abteilung, sensible Felder, Historie und Audit-Log ([Architektur](architektur.md#sicherheit)), Auskunft als JSON und Aufbewahrungsplan ([Aufbewahrung](aufbewahrung.md)).

## Aufteilung: Modul Datenschutz und Sicherheit des Core

Die Verwaltung des Datenschutzes ist das Modul **Datenschutz** (`privacy`, `modules/privacy`, [Architektur](architektur.md#modul-datenschutz-privacy)). Die Sicherheit liegt im Core und wirkt auch ohne das Modul.

| Modul `privacy` (abschaltbar) | Core (immer) |
| --- | --- |
| Betroffenenanfragen mit Frist, Einschränkung der Verarbeitung, Widerspruch, Löschprüfung, Berichtigung, Daten Dritter, Information nach Art. 13/14 | Zweiter Faktor (Step-up), Sitzungen, Leerlauf-Abmeldung, angemeldete Geräte |
| Datenschutzhinweis mit Fassungen, öffentliche Seite `/privacy-notice`, Hinweis bei der ersten Anmeldung | HTTPS, Sicherheitsheader, Echt-/Test-/Entwicklungssystem mit Band |
| Kontakte, Textbausteine, Selbstauskunft, Empfänger (Einstellungen `privacy.*`) | Anfragebegrenzung, Passwortregeln, Verschlüsselung der Geheimnisse, API-Tokens, gesperrte Konten |
| Auskunft nach Art. 15 als PDF mit verschlüsselter Ablage | Aufbewahrungsplan (Einstellung `retention`), Aussonderung, Anonymisierung, `PersonDataRegistry`, `describePerson`, Verträge der Löschprüfung |
| Einwilligungen, Leseprotokoll (Ablage und Reiter im Audit-Log) | Schnittstellen für die Module: `ProcessingRestrictions`, `AccessLog`, `CONSENTS` (Einwilligungen), `LockdownRegistry`, `ProtocolRegistry`, `TechnicalMeasureRegistry`, `ProcessorRegistry`, `ThirdPartyRegistry` |
| Verzeichnis der Verarbeitungstätigkeiten mit Exporten und DSFA-Angaben, Datenpannen mit Hilfen und „Alle Sitzungen beenden“ | Manifestfeld `privacy: { personData, activities }` mit der Startprüfung |
| Abschnitte in Mein Bereich, Reiter „Datenschutz“ der Personalakte, „Wert in der Historie unkenntlich machen“ | Mein Bereich mit „Anmeldungen als Sie“, Profil mit Zwei-Faktor und Geräten |

**Rechte:** `privacy.manage` (Gesamtwehr, privilegiert, Step-up) und `privacy.consents` (je Abteilung, Rollenvorlagen Kommandant und Abteilungskommandant). **Daten:** Schema `privacy` (`request`, `notice`, `breach`, `consent`, `access_log`, `document`, `restriction`, `information`, `notice_acknowledgement`). **API:** `/api/privacy/…`.

**Standard:** Das Modul ist wie jedes Modul aktiv, sobald der Server es zum ersten Mal sieht (neue Installationen; `npm run seed` schaltet es außerdem ausdrücklich ein). Es lässt sich unter „Verwaltung → Module“ abschalten. Es setzt die Stammdaten voraus (`requires: ['masterdata']`).

**Abgeschaltet:**
- Menü „Verwaltung → Datenschutz“, Einstellungsseite, Reiter „Datenschutz“ der Personalakte, Knopf „Auskunft erstellen …“, Abschnitte in Mein Bereich, Reiter „Leseprotokoll“ im Audit-Log und „Wert unkenntlich machen“ in der Historie fehlen; der Hinweis bei der ersten Anmeldung erscheint nicht; `/privacy-notice` und alle Endpunkte unter `/api/privacy/…` antworten `404 modules.inactive`. Die Rechte `privacy.*` wirken nicht.
- **Keine Aufgaben und E-Mails** des Moduls (Fristen der Anfragen, Datenpannen, Berichtigungen, Ende einer Einschränkung): `DeadlineRegistry` übergeht die Fristen inaktiver Module.
- **Keine Einschränkung:** `ProcessingRestrictions` meldet niemanden; eingeschränkte Personen erscheinen wieder in Listen, Suche, Auswahlfeldern, Infoterminal und Fristen. Die gespeicherten Einschränkungen bleiben und wirken wieder, sobald das Modul eingeschaltet wird.
- **Keine Einwilligungsverwaltung:** Listen verhalten sich wie ohne Einwilligungen. Die Telefonliste zeigt allen die Handynummer, die Liste „Geburtstage“ mit Zweck „Aushang“ enthält alle Personen wie der Zweck „intern“; ob sie ausgehängt werden darf, verantwortet die Feuerwehr ohne Unterstützung durch f.orga. Erfasste Einwilligungen bleiben gespeichert.
- **Kein Leseprotokoll:** `AccessLog.record` schreibt nichts; das Protokoll hat für diese Zeit eine Lücke.
- **Bleibt:** Step-up, Sitzungen, HTTPS, Anfragebegrenzung, Passwortregeln, API-Tokens, Aufbewahrungsplan und Anonymisierung. Die Daten des Moduls bleiben erhalten; seine Beiträge zur Löschprüfung und Anonymisierung (`PersonDataRegistry`) laufen weiter, damit Personen vollständig anonymisiert werden.

## Zweiter Faktor bei sensiblen Daten (Step-up)

Die Anmeldung bleibt wie bisher (Passwort oder Konto der Gemeinde über OIDC). Einen zweiten Faktor fragt f.orga erst ab, wenn jemand sensible Daten oder die Verwaltung öffnet; danach gilt die Bestätigung **30 Minuten für diese Sitzung**. Wer nie sensible Daten öffnet (die meisten Mitglieder, Mein Bereich), braucht keinen zweiten Faktor. Die 30 Minuten sind fest (`STEP_UP_MINUTES`).

Unter **Einstellungen → Sicherheit → Anmeldung** schaltet `security.mfaEnabled` den zweiten Faktor für die ganze Feuerwehr aus (Standard: an). Ausgeschaltet reichen Passwort oder Konto der Gemeinde: Rechte mit `stepUp` und Endpunkte mit `@StepUp()` wirken ohne Bestätigung, `GET /api/core/step-up` antwortet `204`, die Sitzung meldet `mfa.enabled: false` und leere `stepUpPermissions`, in der Benutzerliste ist `mfaNeeded` falsch. Eingerichtete Faktoren bleiben gespeichert und gelten wieder, sobald der Schalter an ist. Ohne `FORGA_SECRET_KEY` sind die Bereiche mit Step-up nur gesperrt, solange der zweite Faktor verlangt wird.

### Faktor

- **TOTP** nach RFC 6238 (HMAC-SHA-1, 6 Ziffern, 30 Sekunden, ±1 Zeitschritt; `libs/core/core-api/src/lib/security/totp.ts`, Unit-Tests mit den Testvektoren der RFC). Ein Code gilt nur einmal: Der Server speichert den Zeitschritt des letzten angenommenen Codes (`last_step`) und nimmt nur spätere an.
- Tabelle `core.user_mfa` (eine Zeile je Benutzer): Geheimnis mit `FORGA_SECRET_KEY` verschlüsselt (AES-256-GCM, `encryptSecret`), Zeitpunkt der Bestätigung, letzter Zeitschritt, Wiederherstellungscodes, Zähler falscher Codes. Die Entität ist nicht historisiert, kommt in keinem Export vor, Geheimnis und Codes sind `hidden` und erscheinen in keiner Antwort.
- **Zehn Wiederherstellungscodes** (`XXXX-XXXX`, ohne verwechselbare Zeichen), je einmal gültig, nur als SHA-256 gespeichert und nur bei der Einrichtung bzw. beim Neuerzeugen sichtbar. Groß-/Kleinschreibung, Bindestrich und Leerzeichen zählen beim Eingeben nicht.
- **Einrichten** (`POST /api/core/mfa/enrolment`, dann `POST /api/core/mfa/enrolment/confirm`): mit dem aktuellen Passwort (Konten ohne Passwort, die sich nur über OIDC anmelden, ohne), danach QR-Code (`otpauth://totp/f.orga <Feuerwehr>:<Benutzername>?…`) bzw. Geheimnis zum Abtippen, Bestätigung mit einem Code. Erst die Bestätigung macht den Faktor gültig und erzeugt die Wiederherstellungscodes; die Einrichtung zählt als Step-up. Ein bestätigter Faktor wird nicht ersetzt (`409` `auth.mfaEnrolled`); nach Verlust setzt ihn ein Administrator zurück. Nicht während einer Impersonation und nicht mit API-Tokens.
- Ohne `FORGA_SECRET_KEY` lässt sich kein Faktor einrichten (`503` `auth.mfaNoSecretKey`); die Bereiche mit Step-up bleiben dann gesperrt. Die Einrichtungsliste der Startseite meldet das (Punkt `secretKey`).
- **Neue Wiederherstellungscodes** (`POST /api/core/mfa/recovery-codes`) nur in einer bestätigten Sitzung; die alten enden. Audit `auth.recovery-codes-renewed`.
- **Zurücksetzen durch einen Administrator** (`DELETE /api/core/users/:id/mfa` mit `{ reason }`, Recht `core.users.manage`, das selbst den Step-up verlangt): nur für Benutzer ohne weitere Rechte als der eigene (`users.targetWider`), nie das eigene Konto (`users.mfaResetSelf`). Faktor und Codes werden gelöscht, alle Sitzungen des Benutzers enden, er bekommt eine E-Mail (Versandfehler halten nichts auf). Audit `auth.mfa-reset` mit Benutzer und Grund.

### Was den Step-up auslöst

Berechtigungen tragen im Manifest bzw. in `CORE_PERMISSIONS` das Kennzeichen `stepUp: true`. Ohne bestätigte Sitzung zählen sie als fehlend; die Sitzung kennt sie aber als „wartend“ (`locked`), sodass der Server nach dem zweiten Faktor fragen kann, statt „keine Berechtigung“ zu melden.

| Bereich | Berechtigung mit `stepUp` | Verhalten ohne Bestätigung |
| --- | --- | --- |
| Atemschutz: Eignungsuntersuchungen, Liste „fällige Eignungsuntersuchungen“, Untersuchungen erfassen und importieren | `respiratory-protection.examinations` | Ampel und Fälligkeiten wie ohne das Recht; die Personenansicht meldet `stepUpAvailable`, die Oberfläche zeigt „Untersuchungen anzeigen …“. Erfassen: `auth.stepUpRequired` |
| Sensible Felder der Person (Geburtsdatum, Geburtsort, Arbeitgeber, Bank, Bemerkung, Austrittsgrund, Ruhezeiten), Listen „Komplettdaten“, „Geburtstage“, „Altersgrenzen“ | `masterdata.persons.sensitive` | Personalakte wie ohne das Recht (`sensitiveHidden`, dazu `stepUpAvailable`); Knopf „Sensible Daten anzeigen …“. Senden sensibler Felder (auch im Personenimport) wird mit `auth.stepUpRequired` abgelehnt statt still ignoriert |
| Überweisungs- und SEPA-Datei, Abrechnungen mit Bankverbindung | Endpunkt-Kennzeichen `@StepUp()` an `transfer.xml`, `transfer.csv`, `statements.pdf` der Auszahlungsläufe | Lauf und Posten lesbar, der Download fragt nach |
| Benutzer, Rollen, API-Tokens, Einstellungen des Core, Module und Plugins | `core.users.manage`, `core.roles.manage`, `core.tokens.manage`, `core.settings.manage`, `core.modules.manage` | ganze Seite |
| Audit-Log und Leseprotokoll | `core.audit.read` | ganze Seite |
| Vollexport und Auskunft je Person | `core.data.export` | Knopf fragt nach |
| Anmelden als (Impersonation) | `core.users.impersonate` | Start fragt nach |
| Datensicherung und Wiederherstellung | `backup.manage` | ganze Seite |
| Aussonderung | `core.retention.manage` | ganze Seite |
| Datenschutz: Anfragen, Einschränkung, Information, Einstellungen „Datenschutz“, Reiter „Datenschutz“ der Personalakte | `privacy.manage` | ganze Seite bzw. Reiter („Datenschutz anzeigen …“); die Aufgaben zu Anfragen erscheinen schon vorher (sie nennen keine Namen) |
| „verletzt“/„getötet“ im Personal eines Berichts | `incidents.injuries.read` (Verfasser und Freigeber sehen sie immer, ohne Step-up) | Zahl ohne Namen (`injuries.hidden`, dazu `stepUpAvailable`); Knopf „Verletzte anzeigen …“ |

Keinen Step-up brauchen Einstellungen der Module (`<modul>.settings.manage`), die Personalakte ohne sensible Felder, Einsatzberichte ohne Verletzte, Listen ohne sensible Daten, Mein Bereich (eigene Daten einschließlich eigener Untersuchungen und Bankverbindung) und das Infoterminal. Die Einrichtungsliste der Startseite (`GET /api/core/onboarding`) genügt das gehaltene Recht, weil sie nur meldet, was noch fehlt. Die wöchentliche Fristen-E-Mail rechnet wie bisher mit allen Rechten des Empfängers.

### Durchsetzung auf dem Server

- **Sitzung:** `core.session.elevated_until`. `POST /api/core/step-up` (`{ code }` oder `{ recoveryCode }`, Sitzung mit CSRF-Header) setzt es auf jetzt + 30 Minuten; Aktivität verlängert nichts. `POST /api/core/step-up/end` beendet die Bestätigung vorzeitig, ebenso Abmelden, Passwortwechsel (die eigene Sitzung bleibt, aber unbestätigt), Zurücksetzen des Passworts, Zurücksetzen des Faktors und Ende der Sitzung. `GET /api/core/step-up` antwortet `204` in einer bestätigten Sitzung, sonst `403` `auth.stepUpRequired` (die Oberfläche fragt damit vor Downloads nach).
- `GET /api/core/session` liefert zusätzlich `elevatedUntil`, `stepUpPermissions` (gehaltene Rechte mit `stepUp`; leer, wenn der zweite Faktor ausgeschaltet ist) und `mfa: { enrolled, available, passwordRequired, recoveryCodesLeft, viaProvider, enabled }`. `permissions` enthält die gehaltenen Rechte einschließlich der wartenden, damit Navigation und Seiten erscheinen. `enabled` ist die Einstellung `security.mfaEnabled`.
- **`AuthenticatedUser`:** `can`/`grant` zählen nur wirksame Rechte; `holds`/`heldGrant` auch wartende; `needsStepUp(recht, abteilung?)` sagt, ob der Step-up das Recht gäbe; `denied(rechte, abteilung?)` liefert `auth.stepUpRequired` oder `auth.forbidden`. Module nutzen das in Schreibpfaden mit eigener Prüfung (Stammdaten, Atemschutz, Verschieben von Abteilungen), Core in Einstellungen, Aussonderung, Berechtigungsliste und Importen.
- **Guard:** Hält der Benutzer ein mit `@RequirePermissions` verlangtes Recht nicht, `403` `auth.forbidden`; hält er es nur wartend oder trägt der Endpunkt `@StepUp()` und die Sitzung ist nicht bestätigt, `403` `{ code: 'auth.stepUpRequired', enrolled }`.
- **Listen und Importe** mit Recht unter `stepUp` werden angeboten (`ListInfo.stepUp`), erzeugt bzw. ausgeführt erst nach dem Step-up.
- **Begrenzung:** 5 falsche Codes (auch Wiederherstellungscodes und Codes beim Einrichten) je Benutzer in 15 Minuten, danach 15 Minuten gesperrt (`429` `auth.stepUpLocked`), Zähler in `core.user_mfa`. Ein falscher Code antwortet `400` `auth.invalidCode`.
- **Audit:** `auth.step-up` (Faktor `totp`, `recovery-code` mit verbleibender Zahl oder `oidc`), `auth.step-up-failed` (beim Step-up oder Einrichten, mit `locked`), `auth.mfa-enrolled`, `auth.recovery-codes-renewed`, `auth.mfa-reset`; lesbare Texte auf der Audit-Seite.
- **Impersonation:** Die Impersonation-Sitzung beginnt unbestätigt. Step-up während einer Impersonation prüft den Faktor des **Administrators** und gilt nur für diese Impersonation-Sitzung. Der Start der Impersonation verlangt selbst den Step-up (`core.users.impersonate`).
- **OIDC:** Meldet der Anbieter im ID-Token `amr` mit `mfa`, `otp` oder `hwk` und ist `auth_time` jünger als 30 Minuten, ist die neue Sitzung bis `auth_time` + 30 Minuten bestätigt (Audit `auth.login` mit `stepUp: provider`). Mit der Einstellung `oidc.stepUpViaProvider` bestätigt außerdem eine erneute Anmeldung beim Anbieter (`POST /api/core/oidc/step-up` mit `returnTo`, Anfrage mit `prompt=login` und `max_age=0`) die laufende Sitzung, wenn das verknüpfte Konto zurückkommt (`auth.oidcStepUpOtherAccount`) und der Anbieter einen zweiten Faktor meldet (`auth.oidcNoSecondFactor`); nicht während einer Impersonation.
- **API-Tokens** können keinen zweiten Faktor zeigen: Rechte mit `stepUp` lassen sich keinem Token geben (`400` `tokens.stepUpScope`), außer das Manifest gibt eine Berechtigung ausdrücklich mit `tokenAllowed: true` frei (heute keine). Vorhandene Tokens mit solchen Bereichen wirken für diese Bereiche nicht mehr (`inactiveScopes`, die Token-Seite zeigt sie durchgestrichen); Endpunkte mit Feldern unter `stepUp` liefern Tokens diese Felder nie, Endpunkte mit `@StepUp()` antworten `auth.stepUpRequired`.
- **Infoterminal und andere öffentliche Endpunkte:** Beim Start bricht der Server ab, wenn ein `@Public()`-Endpunkt (z. B. ein Kiosk-Endpunkt mit eigenem Geräte-Guard) eine Berechtigung mit `stepUp` verlangt oder `@StepUp()` trägt (`StepUpCheck`). Ein einzelner öffentlicher Endpunkt in einem geschützten Controller (Stand der Wiederherstellung) zählt die Rechte der Klasse nicht, weil der Guard sie dort nicht prüft.

### Oberfläche

- Der API-Client im `web-sdk` fängt `auth.stepUpRequired` ab (auch bei Uploads), lässt die Shell den Dialog „Bitte bestätigen Sie mit Ihrem Code“ zeigen (Code-Feld mit `autocomplete="one-time-code"`, Link „Wiederherstellungscode verwenden“, bei `viaProvider` „Beim Anbieter bestätigen“) und wiederholt die Anfrage nach der Bestätigung. Gleichzeitige Anfragen teilen sich einen Dialog. Ohne eingerichteten Faktor führt der Dialog durch die Einrichtung (App verbinden, Code bestätigen, Wiederherstellungscodes). Abbrechen lässt die Seite ohne die sensiblen Teile. Nach der Bestätigung lädt die Shell alle Daten neu.
- Module fragen mit `requestStepUp()` bzw. dem Baustein `StepUpButton` („Sensible Daten anzeigen …“) nach; Downloads mit sensiblen Daten öffnen sie mit `openAfterStepUp(url)` (Listen mit `stepUp`, Auskunft je Person, Abrechnungen); die Überweisungsdateien rufen vorher `ensureStepUp()`. `unlocked(session, recht)` sagt, ob ein Recht mit `stepUp` gerade wirkt.
- Solange die Sitzung bestätigt ist, zeigt die Kopfzeile die Plakette „Bestätigt bis 10:42“ mit „Beenden“; nach Ablauf lädt die Shell Sitzung und Daten neu.
- **Profil:** Abschnitt „Zwei-Faktor“ mit Stand, Bereichen mit und ohne Code, „Einrichten …“ und „Wiederherstellungscodes neu erzeugen …“ (Herunterladen als Textdatei). Ist der zweite Faktor ausgeschaltet, steht dort nur der Hinweis und die Plakette „ausgeschaltet“.
- **Einstellungen → Sicherheit → Anmeldung:** Schalter „Zwei-Faktor-Authentifizierung verlangen“, mit Hinweis, solange er aus ist.
- **Rollen:** Berechtigungen mit `stepUp` tragen die Plakette „zweiter Faktor“. **Benutzer:** Spalte „Zweiter Faktor“ (`eingerichtet`, `nötig, nicht eingerichtet`, `nicht nötig`; `mfaEnrolled`, `mfaNeeded`) und „Zweiten Faktor zurücksetzen …“ mit Pflichtgrund. **API-Tokens:** Rechte mit `stepUp` werden nicht angeboten.
- **Einstellungen → Anmeldung mit dem Konto der Gemeinde:** Schalter „Zweiten Faktor auch beim Anbieter bestätigen“.

### Demodaten und Tests

- `npm run seed` richtet beim ersten Lauf den zweiten Faktor des Administrators ein, gibt das Geheimnis einmal aus und legt es in `tmp/seed-totp.json` ab (nicht versioniert); spätere Läufe lesen es dort oder aus `FORGA_ADMIN_TOTP_SECRET` und bestätigen ihre Sitzung selbst. Der Server braucht dafür `FORGA_SECRET_KEY` (in der Entwicklung aus `apps/server/.env`). Demobenutzer mit sensiblen Rechten richten ihren Faktor beim ersten Step-up im Browser mit einer Authenticator-App ein; ein verlorener Faktor wird in der Benutzerverwaltung zurückgesetzt. Die E2E-Tests bestätigen die Sitzung über die API und richten fehlende Faktoren dabei selbst ein (Geheimnisse ebenfalls in `tmp/seed-totp.json`).
- In den Integrationstests gilt eine Sitzung aus `login()`/`setUp()` als bestätigt (Abkürzung über die Datenbank); `login(…, { elevated: false })` liefert eine Sitzung wie nach einer echten Anmeldung (`apps/server/src/step-up.integration.ts`).

## Auskunft nach Art. 15 als PDF (L3)

Eine lesbare Auskunft über alle Daten einer Person als PDF: Anschreiben mit den Angaben nach Art. 15 Abs. 1, danach je Bereich die Daten, am Ende die Änderungen an den Daten. Mockups `datenschutz/person.html` (Dialog `#d-auskunft`), `auskunft-vorschau.html`, `mein-bereich.html`.

### Recht

Erstellen, Ansehen, Herunterladen und Übergeben verlangen `privacy.manage` (`ACCESS_REPORT_PERMISSION` = `PRIVACY_PERMISSION`, mit `stepUp`). Das Herunterladen in „Mein Bereich“ braucht kein Recht und keinen zweiten Faktor. Die JSON-Auskunft `GET /api/core/export/person/:personId` bleibt beim Vollexport (`core.data.export`).

### Beiträge der Module (`describePerson`)

`ExportSource` hat neben `person(id)` (JSON) die lesbare Methode `describePerson(personId, ctx)`; sie liefert `PersonDataSection[]` (`core-api`, `access-report/person-description.ts`):

- `key`, `title`, `activity` (Verarbeitungstätigkeit aus dem Manifest), `categories` (Datenkategorien als Text), `health` (Gesundheitsdaten, im PDF gekennzeichnet), `blocks`: `fields` (Beschriftung/Wert), `table` (Spalten, Zeilen, `summary` z. B. Summen je Jahr), `text`.
- `records`: eigene Datensätze der Person (Historienname, IDs, lesbarer Name); ihre Änderungen und die ihrer untergeordneten Einträge erscheinen im Protokoll, ihr erster Eintrag ergibt die Herkunft. Gemeinsame Datensätze (Einsatz, Dienst, Beförderungsliste) gehören nicht dazu, sonst kämen Änderungen an Daten anderer ins Protokoll. `labels` benennt untergeordnete Einträge („Mitgliedschaft“).
- `DescribeContext` (`ctx`): Sprache, Stichtag, `text`/`t`, `date` (`21.10.2026` bzw. `21 Oct 2026`, Zeiten in Europe/Berlin), `dateTime`, `time`, `money`, `number`, `yesNo`, `value` („–“ für leer), `iban` („IBAN endet auf 4711“), `actor(userId)` und `person(personId)`: die Person selbst mit Namen bzw. „Sie selbst“, andere Benutzer nur mit ihrer Funktion (Namen ihrer Rollen), technische Benutzer als „Schnittstelle „Name““, Personen ohne Konto als „andere Person“, ohne Benutzer „automatisch (System)“.
- Regeln: Klartext, keine IDs, keine Feldnamen aus dem Code, andere Personen nie mit Namen, große Mengen als Tabelle mit Summen je Jahr, interne Bemerkungen gehören dazu.

**Manifest:** `privacy: { personData, activities }`. `personData: true` heißt, das Modul speichert Daten über Personen; dann muss es `describePerson` anbieten und beim `PersonDataRegistry` `anonymize`, `erasure` und `erase` anmelden ([Löschprüfung](#löschprüfung-l7), [vollständige Anonymisierung](#vollständige-anonymisierung-l13)), sonst bricht der Server beim Start ab (`assertPersonDataComplete`), wie bei der Historie. Tätigkeiten (`ProcessingActivity`: `key` mit der Modul-ID als Präfix, `name`, `purpose`, `recipients`, `retention` mit Kategorien des Aufbewahrungsplans, dazu für das [Verzeichnis](#verzeichnis-der-verarbeitungstätigkeiten-l8) `subjects`, `categories`, `health`, `healthNote`, `legalBasisHint`) liefern Zweck, Empfänger und Speicherdauer je Abschnitt; die Tätigkeit des Core ist `core.accounts` (`CORE_ACTIVITIES`), die des Moduls Datenschutz `privacy.data-protection`. Die Startprüfung läuft im Core (`ForgaCoreModule.onApplicationBootstrap`), auch ohne das Modul Datenschutz.

| Bereich | Inhalt |
| --- | --- |
| Stammdaten (`masterdata`, Tätigkeit `masterdata.persons`) | Anrede, Titel, Name, Rufname, Personalnummer, Geburtsdatum und -ort, Geschlecht, Anschrift, Telefonnummern, E-Mail, Beschäftigung, Arbeitgeber, Bankverbindungen gekürzt auf die letzten vier Stellen, Abtretung des Verdienstausfalls, Eintritt, Status, Probezeit, Aufnahme, Austritt mit Grund, Musiker, interne Bemerkungen; Tabellen Mitgliedschaften, Dienstgrade, Qualifikationen, Lehrgänge („Anderer Lehrgang: …“), Vormerkungen, Ehrungen, Ämter, Ruhezeiten, Gruppen |
| Führerschein (`masterdata.driver-license`, Tätigkeit `masterdata.driver-licenses`) | Klassen mit Ablauf, Gültigkeit, Kontrollen (Art, Gerät, „geprüft von“ nur mit Funktion, Original, Bemerkung, Storno), Aufforderungen zur erneuten Vorlage, Transponder mit Endung der Kennung (kein Hash) |
| Einsätze (`incidents`, Tätigkeit `incidents.reports`) | je Einsatz eine Zeile: Datum, Stichwort, Ort nur mit Ortsteil bzw. Gemeinde, Abteilung, eigene Funktion, Fahrzeug, Zeit, Atemschutz mit Minuten, verletzt, Verdienstausfall/Arbeitszeit, Eintrag am Infoterminal; Summen je Jahr; selbst verfasste Berichte mit Stand. Besatzung, Beteiligte, Zeugen, Einsatzleiter und Freitexte fehlen (Hinweis Art. 15 Abs. 4). Gesundheitsdaten, wenn verletzt |
| Dienste (`training`, Tätigkeit `training.sessions`) | Anwesenheit mit Zeit, Stand, Entschuldigungsgrund und eigenem Text, Funktion, Atemschutz (kJ, bestanden), verletzt, Eintrag per QR-Code oder Infoterminal; Summen je Jahr; verantwortete bzw. ausgebildete Dienste. Gesundheitsdaten bei „krank“ oder verletzt |
| Atemschutz (`respiratory-protection`, Tätigkeit `respiratory-protection.fitness`) | alle Nachweise mit Datum, Art, Ergebnis, Einschränkungen, Untersucher, Einrichtung, Gerät, kJ, Minuten, Notiz, gültig bis und Herkunft; Summen je Jahr. Gesundheitsdaten bei Eignungsuntersuchungen |
| Entschädigung (`compensation`, Tätigkeit `compensation.payouts`) | Posten mit Datum, Anlass, Art, Stunden, Betrag, Bemerkung; Auszahlungslauf mit Stand und Weg; Summen je Jahr; Funktionen mit Aufwandsentschädigung. Die Bankverbindung steht bei den Stammdaten |
| Geräte (`equipment`, Tätigkeit `equipment.inspections`) | von den Konten der Person gemeldete Mängel (Gerät, Beschreibung, Stand), von der Person durchgeführte Prüfungen (Gerät, Prüfung, Ergebnis, nächste Prüfung, Messwerte, Notizen) |
| Beförderungen (`promotions`, Tätigkeit `promotions.promotions`) | Ausschlüsse mit Zeitraum, Geltung und Grund; Einträge in Beförderungslisten (Liste, Stichtag, Dienstgrad, Ziel, Entscheidung, Bemerkung); andere Personen der Listen fehlen |
| Kleiderkammer (`clothing`, Tätigkeit `clothing.issues`) | gehaltene Stücke, Ausgaben und Rücknahmen mit Notiz und Stornogrund, Größen |
| Einsatzleiter vom Dienst (`duty-officer`, Tätigkeit `duty-officer.roster`) | Dienste im Dienstplan mit Zeitraum, Tagen, Entschädigung, Notiz und Summen je Jahr; EvD-Berichte stehen bei den Einsätzen |
| MP-Feuer (`mp-feuer`, Tätigkeit `mp-feuer.transfer`) | Zeilen der Laufberichte, deren Bezeichnung den Namen der Person trägt (Lauf, Bereich, Zeile, Aktion, Zahl der Hinweise), und die Zahl noch nicht gelöschter Zeilen aus Transferdateien; die Zuordnung geht über den Namen, weil die Zeilen keine Personen-ID tragen. Das Modul ist dafür auch im Vollexport (Läufe mit Zählern und Berichtszeilen, ohne Rohzeilen) |
| Benutzerkonto (`core.account`, Tätigkeit `core.accounts`) | Benutzername, angezeigter Name, E-Mail, Sprache, wöchentliche E-Mail, aktiv, letzte Anmeldung, Gemeinde-Konto, zweiter Faktor, Rollen mit Abteilung, aktuelle Sitzungen (Impersonation mit Funktion und Grund), API-Tokens, Audit-Einträge des Kontos einschließlich der Anmeldungen als die Person (Vorgang lesbar, Vorgänge der Module als „Vorgang: Modulname“, ohne Details) |
| Einwilligungen (`privacy.consents`, Tätigkeit `privacy.data-protection`) | Einwilligung, Fassung, erteilt mit Weg, erfasst von (Funktion), Stand mit Widerruf bzw. neuer Fassung; nur wenn es Einwilligungen gibt |
| Einschränkung und Information (`privacy.person`, Tätigkeit `privacy.data-protection`) | Einschränkung der Verarbeitung seit, Grund und geplantes Ende; Information nach Art. 13/14 erteilt am; nur wenn vorhanden |
| Zugriffe auf besonders geschützte Daten (`privacy.access-log`, Tätigkeit `privacy.data-protection`) | aus dem Leseprotokoll: Tag, Funktion des Lesers, Bereich, Zahl der Zugriffe |
| Änderungen an Ihren Daten (`core.protocol`) | Historie der `records` aller Bereiche: Zeitpunkt, Bereich, Änderung („Mitgliedschaft angelegt“), durch (Funktion bzw. „Sie selbst“) |

Kein Abschnitt: **Kostenersatz** (speichert keine Daten über Mitglieder; Bescheide nennen nur den Anzeigenamen des ausstellenden Benutzers als Text), **Infoterminal** (Eintragungen stehen als Anwesenheit im Dienst bzw. im Personal des Berichts; das Modul selbst speichert nur Geräte), **Datensicherung** (Kopien der ganzen Datenbank mit eigener Aufbewahrung; Sicherung und Wiederherstellung stehen im Audit-Log des Kontos).

### Inhalt des PDF

`access-report.pdf.ts`, Rahmen wie die anderen Briefe (`renderLetterPdf` mit Wappen, Fußzeile mit Anschrift, Seite x/y, Erstellungszeit), A4, Helvetica, Kopfzeile jeder Seite „Auskunft nach Art. 15 DSGVO · Name · Stand“. Ein hinterlegter Briefkopf wird hier nicht verwendet, weil er die Kopfzeile ersetzen würde.

- **Anschreiben:** Anschrift der Person (`OrganizationProvider.postalAddress` der Stammdaten), Ort und Datum, Betreff, bei einer Anfrage „Ihre Anfrage vom …“, Anrede, Einleitung, „Angaben nach Art. 15 Abs. 1 DSGVO“: Verantwortlicher, Datenschutzbeauftragter, Zwecke (a, aus den Tätigkeiten der Bereiche mit Daten), Kategorien (b, Gesundheitsdaten gekennzeichnet), Empfänger (c, aus den Tätigkeiten und den gültigen API-Tokens als „Schnittstelle „Name““), Speicherdauer (d, Verweis auf die Bereiche), Rechte (e), Beschwerderecht (f), Herkunft (g), automatisierte Entscheidung (h), Drittländer (Abs. 2).
- **Kontakte und Textbausteine** (`AccessReportTexts`) aus den Einstellungen „Datenschutz“: Verantwortlicher (mit „vertreten durch“), DSB und Aufsichtsbehörde aus `privacy.contacts` (fehlende als „[in den Einstellungen Datenschutz eintragen]“), Einleitung `accessReportIntro` (Platzhalter `{brigade}`, `{name}`, `{receivedOn}` = Eingang der Anfrage bzw. Tag der Auskunft), Rechte `rights`, automatisierte Entscheidung `automatedDecisions`, Drittland `thirdCountry` aus `privacy.texts` in der Sprache der Auskunft. Solange einer dieser Bausteine nicht als geprüft markiert ist, trägt das Anschreiben den Hinweis „Vorlage: Die Textbausteine dieses Schreibens sind noch nicht vom Datenschutzbeauftragten geprüft.“
- **Je Bereich** eine nummerierte Überschrift (Reihenfolge: Module in Ladereihenfolge, darunter Datenschutz mit Einwilligungen, Einschränkung und Leseprotokoll, Benutzerkonto und Protokoll am Ende), Plakette „Gesundheitsdaten“, Zeile mit Zweck, Speicherdauer (Regeln aus `retention` je Kategorie der Tätigkeit, z. B. „Personalakte Ausgeschiedener: 30 Jahre nach Austritt“, sonst „bis zur Festlegung einer Frist“), Empfängern und Herkunft.
- **Herkunft** je Bereich aus dem ersten Historieneintrag der `records`: „Ihre Angaben in Mein Bereich“ (eigenes Konto), „Schnittstelle „Name““ (technischer Benutzer, ohne Token mit seinem Anzeigenamen, z. B. ein Infoterminal), „automatisch (z. B. Infoterminal)“ (ohne Benutzer), „Tabellen-Import am …“ bzw. „Datenübernahme aus MP-Feuer am …“ (Audit `imports.applied`, mit `source.module: mp-feuer` als Datenübernahme, bzw. `mp-feuer.run-applied` desselben Benutzers bis 30 Minuten danach), sonst „Erfassung durch die Feuerwehr“.
- **Anhang:** auf Wunsch das JSON (`forga.person`, wie `GET /api/core/export/person/:personId`) als eingebettete Datei `auskunft.json`; die letzte Seite sagt, ob es beigefügt ist.

### Ablage, Übergabe und Ablauf

- **Erstellen** (`POST /api/privacy/access-reports`): legt `privacy.document` (`PrivacyDocument`) mit `status: pending` an, antwortet `202` und erzeugt das PDF im Hintergrund; danach `ready` bzw. `failed` mit `privacy.generationFailed`. Beim Start des Servers werden noch wartende als `failed` (`privacy.generationInterrupted`) markiert. Audit `privacy.access-report-created` (Person, Dokument, Sprache, JSON).
- **Verschlüsselt:** Das PDF liegt mit `FORGA_SECRET_KEY` verschlüsselt in der Datenbank (AES-256-GCM, `encryptBytes`/`decryptBytes` aus `server-key.ts` des Core). Ohne Schlüssel lehnt der Server das Erstellen ab (`503 privacy.noSecretKey`), es gibt keine unverschlüsselte Ablage. Lässt sich die Datei nicht entschlüsseln (Schlüssel gewechselt), `409 privacy.documentUnreadable`.
- **Ablauf:** 30 Tage (`ACCESS_REPORT_DAYS`). Ein stündlicher Lauf (`purgeExpired`, aus mit `FORGA_PRIVACY_SCHEDULER=off`) löscht die Datei; die Zeile bleibt mit Erstellung und Übergabe („gelöscht nach 30 Tagen“). Abgelaufene Auskünfte antworten `410 privacy.documentExpired`.
- **Herunterladen** (`…/:id/file`, `?inline=1` zum Ansehen im Browser): Dateiname ohne Namen der Person (`auskunft-2026-10-29.pdf`), `Cache-Control: no-store`. Audit `privacy.access-report-downloaded` mit `by: administration` bzw. `person`.
- **Übergabe vermerken** (`…/:id/hand-over`): Tag und Weg (`self-service` in Mein Bereich bereitgestellt, `in-person` persönlich, `post` per Post). „In Mein Bereich“ verlangt ein aktives Konto der Person (`400 privacy.noAccount`) und schickt ihr eine E-Mail, die nur sagt, dass die Auskunft in f.orga bereitliegt (mit Link auf `/me`, ohne Inhalt); kein Versand als Anhang. Audit `privacy.access-report-handed-over`.
- **Bezug zur Anfrage:** `requestId` beim Erstellen (nur eine Anfrage auf Auskunft derselben Person, sonst `400 privacy.requestMismatch`); die Anfrage bekommt `accessReportDocumentId` (`PrivacyRequests.attachAccessReport`). „Anfrage damit erledigt“ beim Vermerken der Übergabe (`closeRequest`) setzt die Anfrage auf erledigt mit dem Tag der Übergabe (Audit `privacy.request-closed`).
- **Nicht historisiert:** Die Entität kommt in keinem Export vor; Erstellung, Herunterladen und Übergabe stehen im Audit-Log, eine Historie würde die Löschung der Datei überdauern.

### Oberfläche

- **Personalakte:** Knopf „Auskunft erstellen …“ in der Kopfzeile (Erweiterungspunkt `masterdata.person.actions`, vom Modul Datenschutz belegt). Dialog: „Zur Anfrage“ (offene Anfragen auf Auskunft der Person, die älteste vorgewählt, oder „ohne Anfrage“), Sprache (Deutsch/Englisch), Tabelle der Bereiche mit Zahl der Einträge und Plakette Gesundheitsdaten (`…/preview`), „Maschinenlesbare Fassung (JSON) als Anhang beifügen“, Hinweis auf Rechte Dritter und „kein Versand per E-Mail“.
- **Reiter „Datenschutz“** der Personalakte: Abschnitt „Erstellte Auskünfte“ (mit „Auskunft erstellen …“) mit erstellt am/von, Sprache, Übergabe bzw. Stand („wird erstellt …“, „noch nicht übergeben“, „persönlich 28.10.2026“, „gelöscht nach 30 Tagen“), „Ansehen“, „Herunterladen“ (beide nach dem zweiten Faktor) und „Übergabe vermerken …“ (Tag, Weg, „Anfrage damit erledigt“; „in Mein Bereich bereitgestellt“ benachrichtigt die Person). Dieselbe Liste, auf die Anfrage beschränkt, steht auf der Seite der Anfrage. Die Liste fragt nach, solange eine Auskunft entsteht. Eine eigene Vorschauseite (`auskunft-vorschau.html`) gibt es nicht: „Ansehen“ öffnet das PDF im Browser, weil `frame-ancestors 'none'` das Einbetten verbietet.
- **Mein Bereich:** Abschnitt „Meine Daten“ (Erweiterungspunkt `core.me.top`) mit „Ihre Auskunft liegt bereit (erstellt …, bis …)“ und „PDF herunterladen“, solange eine bereitgestellte Auskunft nicht abgelaufen ist; während eine Auskunft entsteht „Ihre Auskunft wird erstellt …“.

### Selbstauskunft in Mein Bereich

Einstellung `privacy.selfServiceAccess.mode`:
- `request` (Standard): „Auskunft anfordern …“ legt eine Anfrage an; die Verwaltung erstellt die Auskunft und stellt sie in Mein Bereich bereit.
- `instant`: „Auskunft jetzt erstellen …“ (`POST /api/privacy/me/requests`) legt eine Anfrage auf Auskunft mit Weg „Mein Bereich“ an und erstellt sofort die Auskunft (Sprache aus dem Dialog, ohne JSON), bereits als „in Mein Bereich bereitgestellt“; ist sie fertig, wird die Anfrage erledigt. Höchstens eine je Tag und Person (`409 privacy.accessReportToday`, gezählt werden nicht fehlgeschlagene Auskünfte des eigenen Kontos der letzten 24 Stunden). Nicht während einer Impersonation. Die Verwaltung sieht Anfrage und Auskunft wie sonst.

### Tests

`apps/server/src/access-report.integration.ts` mit Daten je Modul aus `apps/server/src/testing/access-report/*.ts`: Eine erfundene Person mit Daten in allen Modulen bekommt eine Auskunft; jeder Bereich kommt vor, keine UUID im Text, der Name einer zweiten Person und die vom Seed verbotenen Texte (Straße des Einsatzes, Geschädigte) fehlen, Gesundheitsdaten sind gekennzeichnet, eigene Änderungen heißen „Sie selbst“, die anderer die Funktion; dazu Erstellen im Hintergrund, verschlüsselte Ablage, Download, Übergabe in Mein Bereich mit E-Mail ohne Inhalt, Ablauf nach 30 Tagen, fehlender Schlüssel und Audit. `ACCESS_REPORT_MODULES=incidents,training` beschränkt den Test auf einzelne Module, `ACCESS_REPORT_PDF=<Datei>` schreibt das erzeugte PDF zum Ansehen. Dazu Bezug zur Anfrage mit „Anfrage damit erledigt“, Anschreiben aus Kontakten und Textbausteinen, Selbstauskunft `instant` mit Grenze je Tag. Unit-Tests: Startprüfung, Formate des Kontexts, Verschlüsselung (`access-report.spec.ts`).

## Einwilligungen (L9)

Wo eine Verarbeitung nicht zur Aufgabe der Feuerwehr gehört, braucht sie eine freiwillige, nachweisbare und jederzeit widerrufbare Einwilligung (Art. 6 Abs. 1 a, Art. 7, Art. 8 DSGVO). Mockups `datenschutz/einstellungen.html` (Katalog), `person.html` (Einwilligungen der Person), `mein-bereich.html`, `erste-anmeldung.html`.

### Katalog

Einstellungsabschnitt `privacy.consents` (`PrivacyConsents`, je Eintrag `ConsentDefinition`; Verwalter `privacy.manage`, nur über die eigenen Endpunkte, `PUT /api/core/settings/privacy.consents` antwortet `400 settings.dedicatedEndpoint`; historisiert wie alle Einstellungen):

| Feld | Bedeutung |
| --- | --- |
| `key` | Schlüssel aus Kleinbuchstaben, Ziffern und Bindestrichen, nicht änderbar (`privacy.consentKeyInvalid`) |
| `title`, `text`, `purpose` | Titel, Text und Zweck in Deutsch und Englisch |
| `givenBy` | `person` oder `person-or-guardians` (bei Minderjährigen die Erziehungsberechtigten) |
| `effects` | Wirkung in f.orga (`CONSENT_EFFECTS`): `masterdata.phone-list-mobile` (Telefonliste zeigt die Handynummer), `masterdata.birthdays-posting` (Liste „Geburtstage“ mit Zweck Aushang); leer = nur Nachweis |
| `active` | wird angeboten und kann erfasst werden; bestehende Einwilligungen inaktiver Einträge gelten weiter, bis sie widerrufen werden |
| `version`, `changedAt`, `changedBy`, `reviewedAt`, `reviewedBy` | Fassung und Prüfung wie bei den Textbausteinen |

- **Fassung:** Ein geänderter Titel, Text oder Zweck erhöht `version` und macht den Eintrag wieder zur Vorlage. Bestehende Einwilligungen behalten ihre Fassung, bis die Person neu einwilligt; Wirkung, „Erteilt durch“ und „aktiv“ ändern die Fassung nicht.
- **Gilt:** Ein Eintrag wird angeboten (erste Anmeldung, Mein Bereich) und kann erfasst werden, wenn er aktiv und als geprüft markiert ist (`consentApplies`); eine ungeprüfte Vorlage gilt noch nicht (`400 privacy.consentNotApplicable`).
- **Vorlagen** (`CONSENT_TEMPLATES`, „Vorlagen einfügen“, beginnen mit „[Vorlage]“): „Fotos in der Öffentlichkeitsarbeit“ (Person oder Erziehungsberechtigte, ohne Wirkung), „Geburtstag im Aushang“ (`masterdata.birthdays-posting`), „Handynummer in der Telefonliste der Abteilung“ (`masterdata.phone-list-mobile`), „Geburtstagsgruß durch die Feuerwehr“ (ohne Wirkung).
- **Entfernen** nur, solange niemand eingewilligt hat (`409 privacy.consentInUse`), sonst deaktivieren.
- Endpunkte (`privacy.manage`): `GET /api/privacy/consents` (`ConsentCatalog` mit Zahl der Personen mit gültiger Einwilligung je Eintrag und den Wirkungen), `POST …/consents/templates`, `PUT …/consents/:key` (`ConsentDefinitionInput` mit `version` des gespeicherten Eintrags; veraltet `409 conflict.stale`), `POST …/consents/:key/review` (`{ version }`), `DELETE …/consents/:key`. Audit `privacy.consent-templates-inserted`, `privacy.consent-definition-changed`, `privacy.consent-definition-reviewed`, `privacy.consent-definition-removed`.
- Oberfläche: Reiter „Einwilligungen“ unter „Verwaltung → Datenschutz → Einstellungen“ (`/privacy/settings?tab=consents`): Warnung bei Vorlagen, Tabelle mit Wirkung, Erteilt durch, Fassung, Zahl der Personen und Stand (Vorlage/geprüft, inaktiv), „Vorlagen einfügen“, „Einwilligung anlegen“, darunter der gewählte Eintrag mit beiden Sprachen, Wirkung, aktiv, „Als geprüft markieren …“ und „Entfernen“. Abweichung vom Mockup: die Spalte „Erteilt“ nennt die Zahl der Personen ohne „von 118“, weil das Modul die Zahl der Mitglieder nicht abfragt.

### Einwilligung an der Person

Tabelle `privacy.consent` (`ConsentEntity`, Historienname `privacy.consent`, historisiert; die Historie ist der Nachweis): Person, Schlüssel, Fassung (`definition_version`) mit Titel und Text dieser Fassung, erteilt am, Weg (`ConsentWay`: `written` schriftlich, `in-person` persönlich, `guardians` durch Erziehungsberechtigte, `my-area` Mein Bereich, `first-login` erste Anmeldung), erfasst von, widerrufen am, Weg des Widerrufs (`ConsentWithdrawalWay`: `written`, `email`, `in-person`, `my-area`, `request` über eine Anfrage), widerrufen von, Anfrage, `superseded_on` (die Person hat einer neueren Fassung zugestimmt). Einwilligungen werden **nie gelöscht**, nur widerrufen bzw. durch eine neue Fassung abgelöst; gültig ist eine Einwilligung ohne Widerruf und ohne Ablösung. Der Nachweis (Scan der Unterschrift) ist ein Anhang (`privacy.consent`).

- **Recht** `privacy.consents` („Einwilligungen von Personen erfassen und widerrufen“, Abteilung, ohne Step-up; Rollenvorlagen `commander`, `department-commander`) für Personen der Abteilung; `privacy.manage` für alle. Ohne Recht `403 auth.forbidden` (mit wartendem `privacy.manage` `auth.stepUpRequired`).
- `GET /api/privacy/persons/:personId/consents` (`PersonConsents`: Einwilligungen mit Nachweisen, erfassbare Einträge, `minor`), `POST …/persons/:personId/consents` (`ConsentRecordInput`: Eintrag, erteilt am, Weg `written`/`in-person`/`guardians`; nicht in der Zukunft `privacy.consentInFuture`; dieselbe Fassung schon erteilt `409 privacy.consentGiven`; Minderjährige bei „Person oder Erziehungsberechtigte“ nur mit Weg `guardians`, sonst `400 privacy.consentGuardiansRequired`), `POST /api/privacy/given-consents/:id/withdraw` (`ConsentWithdrawalInput`: Tag, Weg, optional `requestId`; schon widerrufen `409 privacy.consentWithdrawn`, vor der Einwilligung `privacy.withdrawnBeforeGiven`). Audit `privacy.consent-given` und `privacy.consent-withdrawn` (Person, Schlüssel, Fassung, Weg).
- **Minderjährig** (unter 18 am heutigen Tag) bestimmt die Stammdaten über `OrganizationProvider.minors`.
- **Widerruf über eine Anfrage:** Hat die Anfrage die Art „Widerruf einer Einwilligung“, zeigt ihre Seite die gültigen Einwilligungen der Person mit „Widerruf erfassen …“. Der Widerruf mit `requestId` (nur `privacy.manage`, nur eine offene Anfrage dieser Art derselben Person, sonst `400 privacy.requestMismatch`) setzt den Weg `request` und erledigt die Anfrage mit dem Tag des Widerrufs.
- Oberfläche: Abschnitt „Einwilligungen“ im Reiter „Datenschutz“ der Personalakte (zwischen Anfragen und Auskünften) mit Fassung, Weg, erfasst von, Nachweisen, Stand (erteilt, widerrufen, neue Fassung erteilt), „Einwilligung erfassen …“ (Einwilligung mit Fassung, erteilt am, Weg, Nachweis) und „Widerruf erfassen …“. Der Reiter erscheint auch mit `privacy.consents` allein (`anyPermission` am Erweiterungspunkt); dann zeigt er nur die Einwilligungen.

### Wirkung

Module fragen den Core über den Vertrag `CONSENTS` (`ConsentLookup` und `CONSENT_EFFECTS` aus `@forga/core-contracts`, im Core der Dienst `Consents`): `has(personId, key)` und `withEffect(effect, personIds)`. Das Modul Datenschutz meldet dort seinen `ConsentService` an. Es zählt jede gültige Einwilligung eines Eintrags mit der Wirkung, auch einer älteren Fassung oder eines inaktiven Eintrags. **Ohne aktives Modul Datenschutz** gibt es keine Einwilligungsverwaltung: `has` ist `false`, `withEffect` liefert alle Personen; die Telefonliste zeigt dann allen die Handynummer, der Aushang der Geburtstage enthält alle (siehe [Aufteilung](#aufteilung-modul-datenschutz-und-sicherheit-des-core)).

| Liste (Stammdaten) | Parameter „Zweck“ | Wirkung |
| --- | --- | --- |
| Telefonliste `masterdata.phones` | `department` (Standard, Telefonliste der Abteilung) | Handynummer nur mit Einwilligung, sonst „über Gruppenführer“ (leer, wenn keine Nummer gespeichert ist) |
| | `leaders` (Führungskräfte: Personen mit einem laufenden Amt oder der Qualifikation Gruppen-, Zug- oder Verbandsführer) | alle Nummern, weil die Erreichbarkeit der Führungskräfte zur Aufgabe gehört (Entscheidung 9 des Konzepts) |
| Geburtstage `masterdata.birthdays` | `internal` (Standard, intern für den Kommandanten) | alle Personen |
| | `posting` (Aushang) | nur Personen mit Einwilligung; Untertitel „· Aushang“ |

Die übrigen Telefonnummern (privat, dienstlich) und die Mitgliederliste bleiben unverändert.

### Mein Bereich und erste Anmeldung

- **Meine Einwilligungen** (`GET /api/privacy/me/consents`, `MyConsents`): die geltenden Einträge und die eigenen Einwilligungen, je mit Schalter, „erteilt …“ bzw. „widerrufen …“ und „Text lesen“. `PUT /api/privacy/me/consents/:key` (`MyConsentInput`: `given`, `version` der angebotenen Fassung, sonst `409 conflict.stale`; `firstLogin`) erteilt mit Weg `my-area` bzw. `first-login` oder widerruft sofort (Weg `my-area`). Gibt es eine neue Fassung, bittet Mein Bereich um erneute Zustimmung; bis dahin gilt die alte weiter. Nicht während einer Impersonation und nicht mit API-Tokens (`403 privacy.ownConsentOnly`). **Minderjährige** sehen ihre Einwilligungen nur (`403 privacy.consentMinor`); die Erziehungsberechtigten willigen schriftlich ein, ein Widerruf geht über die Feuerwehr.
- **Erste Anmeldung:** Nach dem Hinweis „Bevor Sie beginnen“ bietet die Seite die geltenden, noch nicht erteilten Einwilligungen an („Freiwillige Einwilligungen“, einzeln, nichts vorausgewählt, mit „Text lesen“); „Weiter“ nimmt den Hinweis zur Kenntnis und speichert danach die gewählten Einwilligungen mit `firstLogin`. Minderjährigen wird nichts angeboten. Die Seite erscheint wie bisher nur, wenn der Hinweis fällig ist.

### Auskunft und Export

Die Auskunft (`describePerson` des Moduls Datenschutz) hat den Abschnitt „Einwilligungen“ (`privacy.consents`: Einwilligung, Fassung, erteilt mit Weg, erfasst von als Funktion, Stand mit Widerruf bzw. neuer Fassung; Änderungen im Protokoll), der Export je Person (`GET /api/core/export/person/:personId`) im Teil `privacy` die Liste `consents` mit Fassung, Text und Widerruf. Die Anonymisierung lässt Einwilligungen als Nachweis stehen (sie nennen nur die Person-ID und den Text der Fassung).

## Berichtigung (L12)

**„Berichtigung beantragen …“** in Mein Bereich: unter jedem Abschnitt eines Moduls (Bereich vorgewählt) und im Abschnitt „Datenschutz“ (Mockup `mein-bereich.html`, `#d-berichtigung`). Dialog: Bereich (Abschnitte der Module, „Benutzerkonto“, „Sonstiges“), „Was ist falsch?“, „Wie ist es richtig?“, Nachweis (PDF oder Foto, optional, mit dem Hinweis „Bitte keine Kopie des Führerscheins“). Abweichung vom Mockup: zwei Felder statt eines, damit die Zuständigen beides getrennt sehen.

- `POST /api/privacy/me/rectifications` (`MyRectificationInput`: `area` = Modul-ID, `core` oder `other`, `wrong`, `correct`) legt eine Anfrage der Art `rectification` an (Weg Mein Bereich, Identität durch die Anmeldung geprüft, Frist eingegangen + 1 Monat, Sprache des Benutzers, `rectification` mit Bereich, falsch, richtig) und antwortet mit ihrer ID; der Nachweis wird danach als Anhang `privacy.request` hochgeladen (lesen: die Person selbst, `privacy.manage`, die Zuständigen; hinzufügen: die Person, solange die Anfrage offen ist, und `privacy.manage`). Nicht während einer Impersonation (`403 privacy.ownRequestOnly`), ohne verknüpfte Person `400 privacy.noPerson`.
- **Aufgaben:** Wie jede Anfrage eine Aufgabe „Datenschutzanfrage beantworten“ für `privacy.manage`; dazu die Aufgabe „Berichtigung prüfen: <Bereich>“ (`privacy-rectification`, ohne Namen) für alle mit `masterdata.persons.write` in einer Abteilung der Person, mit Link auf `/privacy/rectifications/:id`. Die Aufgabe entfällt nicht bei einer Einschränkung der Person.
- **Seite „Berichtigung prüfen“** (`GET /api/privacy/rectifications/:id`, `RectificationView`, für die Zuständigen und `privacy.manage`, sonst `404`): Person mit Link auf die Personalakte, Eingang, Frist, falsch, richtig, Nachweis, „Als berichtigt vermerken“ (`POST …/rectifications/:id/corrected`, schon vermerkt `409 privacy.alreadyCorrected`; Audit `privacy.rectification-corrected`). Danach endet deren Aufgabe; die Anfrage bleibt beim Datenschutz, der antwortet und sie abschließt.
- Die Seite der Anfrage zeigt den Abschnitt „Berichtigung“ mit Stand („noch nicht berichtigt“ bzw. „berichtigt am … von …“), Nachweis und dem Hinweis auf die Kämmerei bei geänderter Bankverbindung; „Meine Anfragen“ in Mein Bereich zeigt „Berichtigung: <was falsch ist> (<Bereich>)“. Auskunft als JSON und Anonymisierung behandeln `rectification` wie den Inhalt der Anfrage.

**„Wert in der Historie unkenntlich machen“** für nachweislich falsche oder unzulässig erfasste Angaben: `POST /api/privacy/history/:id/redact` (`HistoryRedactionInput`: Feld, `side` `old` oder `new`, Grund mindestens 10 Zeichen) mit `privacy.manage` (Step-up) und Leserecht auf die Historie des Datensatzes; der Endpunkt gehört dem Modul Datenschutz und schreibt in die Historie des Core. Der Wert wird im Eintrag durch `null` ersetzt, `core.history.redactions` vermerkt Zeitpunkt, Benutzer und Grund je Feld und Seite; die Historie liefert dafür `redactedOld` bzw. `redactedNew` und zeigt „berichtigt, Wert entfernt am …“. Fehler: `history.unknownField`, `history.nothingToRedact` (leerer Wert), `409 history.alreadyRedacted`. Audit `privacy.history-redacted` mit Datensatz, Feld, Seite und Grund, nie mit dem Wert. In jeder Historie (`HistoryTimeline` aus `web-ui`) steht dafür bei bestätigter Sitzung mit `privacy.manage` „Unkenntlich machen …“ an jedem Wert; ohne aktives Modul fehlt der Knopf, weil das Recht dann nicht wirkt.

## Leseprotokoll und Anmelden als (L15)

### Leseprotokoll

Tabelle `privacy.access_log` (`AccessLogEntity`): Benutzer, Person (`null` = alle Personen, z. B. Vollexport), Bereich, Tag (Europe/Berlin), Zahl, erster und letzter Zugriff; eine Zeile je Benutzer, Person, Bereich und Tag (`insert … on conflict` zählt hoch). Protokolliert wird nur das Lesen besonders geschützter Daten, nie der Inhalt:

| Bereich | Wann |
| --- | --- |
| `masterdata.person-sensitive` „Personalakte mit sensiblen Feldern“ | `GET /api/masterdata/persons/:id`, wenn der Leser die sensiblen Felder sieht |
| `respiratory-protection.examinations` „Eignungsuntersuchungen (Gesundheitsdaten)“ | Atemschutz der Person, wenn Untersuchungen dabei sind und der Leser sie sehen darf |
| `privacy.access-report` „Auskunft nach Art. 15“ | Erstellen und Herunterladen durch die Verwaltung |
| `core.export` „Vollexport bzw. Auskunft als JSON“ | Vollexport eines Moduls (Person „alle“) und JSON je Person |
| `masterdata.lists` „Listen mit Kontakt- oder sensiblen Daten“ | Mitgliederliste (außer mit dem Zweck „Übersicht“ ohne Kontaktdaten), Telefonliste, Komplettdaten, Geburtstage, Altersgrenzen: je Person der Liste, auch in der Vorschau |

- Eigene Daten werden nicht protokolliert. Während einer Impersonation ist der Administrator der Leser. Ein Fehler beim Schreiben hält die Anfrage nicht auf (nur Server-Log).
- **Dienste:** Module melden über `AccessLog` aus `@forga/core-api`: `registerArea(key, label)` und `record(user, personIds, area)`. Der Core reicht `record` an das Modul Datenschutz weiter (`AccessLog.registerRecorder`); ohne aktives Modul wird nichts protokolliert. Im Modul liest `AccessLogStore` mit `query({ from, to, userId, personId, area, limit })` und `forPerson(personId)` (Seite, Auskunft, Hilfen bei Datenpannen).
- **Einsicht** mit `core.audit.read` (Step-up): `GET /api/privacy/access-log` (`AccessLogEntry[]`, neueste zuerst, höchstens 2000) und `GET /api/privacy/access-log/filters`; Seite „Verwaltung → Audit-Log“, Reiter „Leseprotokoll“ (`/admin/audit?tab=privacy`, vom Modul über den Erweiterungspunkt `core.audit.tabs`) mit Zeitraum, Benutzer, Bereich und Person.
- **Aufbewahrung:** eigene Kategorie `privacy.access-log` „Leseprotokoll“ im Aufbewahrungsplan (Standard 1 Jahr = 12 Monate, löschen; nach dem letzten Zugriff des Tages), in der Tätigkeit `privacy.data-protection`.
- **Auskunft:** Abschnitt „Zugriffe auf besonders geschützte Daten“ (`privacy.access-log`): Tag, Funktion des Lesers (nie der Name), Bereich, Zahl; im Export je Person im Teil `privacy` die Liste `accessLog`.

### Anmelden als

- Der Grund war schon Pflicht (mindestens 3 Zeichen).
- **E-Mail an den Benutzer** beim Start, wenn er eine Adresse hat und die Einstellung `security.notifyImpersonation` an ist (Standard; „Verwaltung → Einstellungen → Sicherheit → E-Mails“, Schalter „Benutzer bei „Anmelden als“ benachrichtigen“): Administrator und Grund, Hinweis auf Mein Profil; Versandfehler halten nichts auf.
- **„Anmeldungen als Sie“** im Profil und in Mein Bereich (`GET /api/core/me/impersonations`, `MyImpersonation`): Beginn und Ende (Ende der Impersonation bzw. nach höchstens einer Stunde), Administrator, Grund; aus dem Audit-Log (`auth.impersonation-started`/`-ended`), also so lange, wie das Audit-Log aufbewahrt wird.
- In der Auskunft stehen die Anmeldungen als die Person im Protokoll des Kontos.

### Tests

`apps/server/src/consents.integration.ts`: Recht und Vorlagen, Katalog mit Fassungen und Prüfung, Erfassen in der eigenen Abteilung mit Nachweis, Minderjährige und Erziehungsberechtigte, Mein Bereich und erste Anmeldung, Impersonation, Wirkung in Telefonliste (Abteilung, Führungskräfte) und Geburtstagsliste (Aushang), Widerruf über eine Anfrage, neue Fassung, Auskunft und Export; Berichtigung mit Frist, Aufgabe der Abteilung, Nachweis, Vermerk und Fehlerfällen; Wert in der Historie unkenntlich machen; Leseprotokoll für Personalakte, Listen, Exporte und Untersuchungen mit Recht, Step-up, Aufbewahrung und Auskunft; E-Mail und Liste „Anmeldungen als Sie“ mit Einstellung.

## Felder der Personalakte (L10)

Datenminimierung (Art. 5 Abs. 1 c, Art. 25 DSGVO): Eine Feuerwehr schaltet optionale Felder ab, für die sie keinen Zweck hat. Seite „Verwaltung → Module → Stammdaten → Felder der Personalakte“ (`/masterdata/settings/person-fields`, Recht `masterdata.settings.manage`; kein eigenes Mockup, aufgebaut wie die Seite „Feuerwehrsatzung“).

- **Felder** (`OPTIONAL_PERSON_FIELDS`): Anrede, Titel, Rufname, Geburtsort, Geschlecht, Telefon privat, Telefon dienstlich, Arbeitgeber mit Anschrift und IBAN, private Bankverbindung, Bemerkung. Je Feld steht „Wofür?“ (`PERSON_FIELD_PURPOSES`, z. B. Arbeitgeber: Verdienstausfall und Freistellung; Geburtsort: Urkunden, Lehrgangsanmeldung) und „Gespeichert bei n Personen“. Standard: alle an.
- **Einstellung** `masterdata.personFields` (`PersonFieldSettings`: `disabled`), gespeichert über `PUT /api/core/settings/masterdata.personFields` (historisiert wie jede Einstellung).
- **Wirkung** (`PersonFields` in `persons/person-fields.ts`): Abgeschaltete Felder liefert die Personalakte leer bzw. ohne Arbeitgeber und Bankverbindung, auch in „Mein Bereich“; Personalakte, Neuanlage und „Mein Bereich“ zeigen sie nicht. Gesendete Werte werden nicht gespeichert (der gespeicherte Wert bleibt bis zum Löschen), der Personenimport übernimmt sie nicht (damit auch die Datenübernahme aus MP-Feuer). Telefonliste und Komplettdaten lassen die Spalten weg. Die Auskunft nach Art. 15 nennt weiter, was noch gespeichert ist.
- **Gespeicherte Werte löschen** (Warnung „Bei n Personen sind noch Werte abgeschalteter Felder gespeichert“, Bestätigung mit Feldern und Zahlen): `POST /api/masterdata/person-fields/clear` (`PersonFieldsClear`: `fields`) leert die Felder bei allen Personen und entfernt sie aus der Historie der Personen (Einträge, die nur diese Felder änderten, fallen weg). Nur abgeschaltete Felder (`400 masterdata.fieldEnabled`). Antwort `{ counts }` je Feld; Audit `masterdata.person-fields-cleared` mit Feldern und Zahlen, ohne Werte. `GET /api/masterdata/person-fields` liefert `PersonFieldState[]` (Feld, aktiv, gespeichert bei).
- **Freitexte:** Hinweis „Keine Gesundheitsangaben eintragen.“ wie bisher an Bemerkung, Ruhezeit und Entschuldigung; dazu im Berichtseditor bei den Beteiligten „Nur Angaben, die für Kostenersatz, Versicherung oder Polizei nötig sind“ (L14).

## Zweck der Listen und Exporte (L11)

Listen tragen die Art ihrer Personendaten und Zwecke (`ListDefinition.personalData`, `purposes`; Verträge `ListPersonalData`, `ListPurpose`, `ListInfo.purposes`, `purposeRequired`):

- **Pflicht beim Export:** Listen mit Kontakt-, sensiblen oder Gesundheitsdaten (`contact`, `sensitive`, `health`) lassen sich nur mit Zweck exportieren (`?purpose=`, sonst `400 lists.purposeRequired`). Neben den Zwecken der Liste gibt es immer „Anderer Zweck (bitte angeben)“ (`other` mit `purposeNote`, mindestens 3 Zeichen, sonst `400 lists.purposeNoteRequired`); ein unbekannter Zweck `400 lists.unknownPurpose`. Die Vorschau nimmt ohne Angabe den ersten Zweck.
- **Nur die Spalten des Zwecks:** Ein Zweck nennt die Spalten, die er braucht; die Liste zeigt und exportiert nur diese.
- **Eigenes Recht für Kontaktlisten:** `masterdata.lists.contact` („Listen mit Kontaktdaten ausgeben“, Abteilung; Rollenvorlagen `commander` über `masterdata.*`, `department-commander`). Die Telefonliste verlangt es, ebenso der Zweck „Kontaktaufnahme“ der Mitgliederliste (sonst `403 lists.purposeForbidden`; nicht angeboten). Die Excel-Ausgabe der Personentabelle (Spalte Handynummer) gibt es nur mit diesem Recht.
- **Kennzeichnung:** PDF und Excel einer Liste mit Personen tragen „Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten“ (PDF in der Fußzeile jeder Seite, Excel als letzte Zeile und in der Fußzeile des Ausdrucks) und unter dem Untertitel „Zweck: …“. Die Vorschau zeigt beides.
- **Audit:** `lists.exported` mit `purpose` und gegebenenfalls `purposeNote` und den genannten Personen.
- Oberfläche „Listen“: Auswahl „Zweck“ (Pflicht bei diesen Listen, vorbelegt mit dem ersten Zweck) und bei „Anderer Zweck“ das Feld „Zweck beschreiben“. Kein eigenes Mockup.

| Liste | Daten | Zwecke |
| --- | --- | --- |
| Mitgliederliste `masterdata.members` | Kontakt | Übersicht (Name, Abteilung, Dienstgrad, Status, Eintritt), Kontaktaufnahme (mit Handy und E-Mail, `masterdata.lists.contact`) |
| Telefonliste `masterdata.phones` | Kontakt | Abteilung (Handynummer nur mit Einwilligung), Führungskräfte ([Einwilligungen](#wirkung)) |
| Komplettdaten `masterdata.complete` | sensibel | Personalverwaltung (alle Spalten), Anschriftenliste (Name, Anschrift, Abteilung) |
| Geburtstage `masterdata.birthdays` | sensibel | intern, Aushang (nur mit Einwilligung; ohne Alter) |
| Altersgrenzen `masterdata.age-limits` | sensibel | Planung der Übertritte (ohne Geburtsdatum) |
| Fällige Eignungsuntersuchungen `respiratory-protection.examinations-due` | Gesundheit | Termine vereinbaren (ohne letzte Untersuchung), Übersicht |
| Atemschutznachweis `respiratory-protection.record` | Gesundheit | Nachweis nach FwDV 7 |
| Abrechnungsübersicht `compensation.statement` | Kontakt (Anschrift) | Abrechnung für Kasse bzw. Personen |

Die übrigen Listen über Personen (`names`) brauchen keinen Zweck, tragen aber die Kennzeichnung und melden ihre Personen (`personIds`): Stammdaten (Unterschriften, Dienstjubiläen, Qualifikationen, Atemschutzgeräteträger, Probezeit, Lehrgangsvormerkungen, Lehrgänge im Jahr, Führerscheinkontrollen), Dienste (Dienstplan, Dienstbuch, Dienstbeteiligung, Teilnehmer, Unterschriften, Ausbilderstunden), Atemschutz (Tauglichkeit, Einsatzzeiten, Übungsstrecke, fehlende Nachweise), Entschädigung (Jahressummen), Beförderungen (Liste, Vorschau), Kleiderkammer (ausgegebene Schutzausrüstung, fällige Wäsche und Prüfungen), Geräte (Prüfhistorie und Prüfprotokoll mit Prüfern aus den Stammdaten, offene Mängel), Einsätze (offene Berichte, Einsatzstunden je Person). Einsatzleiter vom Dienst hat keine Listen.

## Daten Dritter (L14)

Personen, die keine `Person` der Stammdaten sind, haben dieselben Rechte (Art. 14–18): Beteiligte von Einsätzen (Geschädigte, Verursacher, Zeugen, Anrufer, Eigentümer, Halter) und Kostenschuldner.

- **Quellen** (`ThirdPartyRegistry` aus `@forga/core-api`, `register({ key, module, search, describe, erase })`): `incidents.involved-parties` (Beteiligte der Berichte) und `cost-recovery.debtors` (Kostenschuldner der Bescheide und das Adressbuch des Kostenersatzes). Eine Fundstelle ist `ThirdPartyRef` (`source`, `id`).
- **Suche** `GET /api/privacy/third-parties?q=` (`privacy.manage`, ab 2 Zeichen, je Quelle höchstens 100): Name, Anschrift, Telefon oder Kennzeichen; Treffer `ThirdPartyHit` mit Fundstelle („Einsatz 2026-104950 · TH1 …“, „Kostenbescheid KE-2026-014“, „Adressbuch Kostenersatz“), Rolle, Datum, Anschrift und Angaben zum Unterscheiden gleicher Namen. Abweichung vom Konzept: eigene Suche statt einer Quelle `privacy.third-parties` der globalen Suche, damit Dritte nicht in der Alltagssuche der Verwaltung erscheinen.
- **Anfragen Dritter:** Eine Anfrage hat statt `personId` eine andere Person (`thirdParty`: Name, „Wo kommt die Person vor?“); Arten Auskunft, Berichtigung, Löschung, Widerspruch (`THIRD_PARTY_REQUEST_KINDS`; sonst Prüfungsfehler, ebenso Person und Dritter zugleich), keine Einschränkung (`privacy.restrictNotForKind`). Frist, Antwortschreiben (an den Namen), Bearbeitung wie sonst; Liste und Seite zeigen „Name (andere Person)“. Das Audit nennt `thirdParty: true`, nie den Namen.
- **Auskunft** `POST /api/privacy/third-parties/access-reports` (`ThirdPartyAccessReportCreate`: Name und Anschrift des Schreibens, Fundstellen, Sprache, optional Anfrage auf Auskunft einer anderen Person, sonst `400 privacy.requestMismatch`): dieselbe PDF-Auskunft (Anschreiben mit Art. 15 Abs. 1, verschlüsselte Ablage 30 Tage) mit den Abschnitten „Einsätze, an denen Sie beteiligt waren“ (Alarm, Stichwort, Ortsteil bzw. Gemeinde, Rolle, gespeicherte Angaben) und „Kostenbescheide“ (Bescheid, Datum, Einsatz, Stand, Betrag, gespeicherte Angaben; Eintrag im Adressbuch). Einsatzkräfte und andere Beteiligte erscheinen nicht (Art. 15 Abs. 4); kein Protokoll der Änderungen und kein JSON. `PrivacyDocument` hat dafür `personId: null` und `thirdParty` (Name, Anschrift, Fundstellen), `AccessReport.thirdPartyName`. Übergabe nur persönlich oder per Post (`privacy.noAccount`); kein Leseprotokoll (keine Person der Stammdaten). `GET /api/privacy/access-reports?requestId=` listet die Auskünfte einer Anfrage.
- **Löschung** `POST /api/privacy/third-parties/erasure` (`ThirdPartyErasureInput`: Fundstellen, Grund mindestens 10 Zeichen, optional Anfrage auf Löschung einer anderen Person): Ergebnis je Fundstelle (`ThirdPartyErasureResult`: `anonymized`, `deleted`, `kept` mit Grund). Beteiligte: Name, Anschrift, Telefon, Kennzeichen und Notizen geleert (Rolle bleibt), auch in den früheren Fassungen des Berichts und in den Historieneinträgen der Beteiligten, die die Person nennen. Adressbuch: Eintrag mit Historie gelöscht. Kostenschuldner eines Entwurfs: geleert (samt Historie); erlassene, bezahlte, aufgehobene oder verworfene Bescheide bleiben als Kassenunterlage bis zur Frist von `cost-recovery.notices` (`privacy.thirdPartyFinancialRecord`). Audit `privacy.third-party-erased` mit Zahlen, Quellen, Grund und Anfrage, ohne Namen.
- **Aufbewahrung:** eigene Kategorie `incidents.involved-parties` „Angaben zu Beteiligten von Einsätzen“ (Frist ab Alarm, Aktionen anonymisieren oder nichts, Standard nichts): leert die Angaben der Beteiligten früher als der Einsatz selbst anonymisiert wird, mit Fassungen und Historie; Einsatz, Rolle und Statistik bleiben.
- **Verzeichnis:** Tätigkeiten mit `thirdParties: true` (Einsatzdokumentation, Kostenersatz) zeigen „Daten Dritter: Information nach Art. 14 DSGVO durch die Feuerwehr; Auskunft und Löschung über „Auskunft zu einer anderen Person““ (`THIRD_PARTY_HINT`), auch im PDF und in Excel.
- **Oberfläche** (Mockup `anfragen.html`, `#d-dritte`): Knopf „Auskunft zu einer anderen Person …“ auf dem Reiter Anfragen mit Suche, Auswahl der Fundstellen, Name und Anschrift des Schreibens (vorbelegt aus der ersten Fundstelle), Sprache und „Auskunft erstellen“; danach Stand und Herunterladen im Dialog. „Anfrage erfassen …“ wählt zwischen „Person aus den Stammdaten“ und „andere Person“. Die Seite einer Anfrage einer anderen Person zeigt „Daten der Person in den Modulen“ (Suche mit dem Namen vorbelegt) mit „Auskunft erstellen“ bzw. „Löschen …“ (Grund, Ergebnis je Fundstelle) und die Auskünfte der Anfrage.

## Aufbewahrung der Protokolle und Laufberichte (L29)

Kategorien des [Aufbewahrungsplans](aufbewahrung.md#kategorien) mit Standardregel, weil ein Protokoll lang genug für den Nachweis, aber nicht selbst ein dauerhafter Datenbestand sein soll:

| Kategorie | Inhalt | Frist ab | Standard |
| --- | --- | --- | --- |
| `core.audit` | Audit-Log | Eintrag | 2 Jahre, löschen (wie bisher) |
| `privacy.access-log` | Leseprotokoll | Tag des Zugriffs | 1 Jahr, löschen (wie bisher) |
| `privacy.access-reports` | Nachweise der Auskünfte (Zeilen von `privacy.document`; die Datei geht nach 30 Tagen) | Erstellung | 3 Jahre, löschen |
| `privacy.breaches` | Dokumentation abgeschlossener Datenpannen mit Historie (Art. 33 Abs. 5) | Abschluss | 5 Jahre, löschen, „Sonderfall prüfen“ (jeder Fall wird vorgelegt) |
| `mp-feuer.run-reports` | Laufberichte der Datenübernahme mit den Zeilen mit Meldungen | Ende des Laufs | 1 Jahr, löschen |
| `backup.run-log` | Einträge gelöschter und fehlgeschlagener Sicherungen und abgeschlossener Wiederherstellungen; Einträge vorhandener Sicherungen bleiben | Löschung bzw. Ende | 1 Jahr, löschen (ersetzt das feste Löschen nach einem Jahr) |

Der Tabellen-Import speichert keinen Bericht über den Tag hinaus (Hochladen 24 Stunden, Ergebnis im Audit `imports.applied`); er folgt damit dem Audit-Log. Die Tätigkeiten `core.accounts` (Audit-Log, Historie), `privacy.data-protection` (Leseprotokoll, Auskünfte, Datenpannen) und `mp-feuer.transfer` nennen die Kategorien als Speicherdauer.

### Tests

`apps/server/src/minimisation.integration.ts`: Felder abschalten mit Personalakte, Speichern, Neuanlage und Import, Löschen der gespeicherten Werte samt Historie und Audit, Spalten der Telefonliste und Komplettdaten; Zwecke mit Spalten, Pflicht und Fehlern, Recht für Kontaktlisten, Zweck und Kennzeichnung in Excel, Audit mit Zweck und Personen, Personen der Liste eines anderen Moduls, Gesundheitsliste; Suche Dritter über Beteiligte, Bescheide und Adressbuch, Anfragen Dritter, Auskunft ohne andere Personen mit PDF und Übergabe, Löschung mit Fassungen, Historie und Kassenunterlage, Kennzeichen im Verzeichnis, Kategorie „Angaben zu Beteiligten“; Standardregeln der Protokolle mit Fall für Datenpannen. `retention.integration.ts` prüft die Standardregeln aller Kategorien.

## HTTPS und Sicherheitsheader (L1)

**Caddy als HTTPS-Vorbau.** `docker/compose.yml` enthält den optionalen Dienst `caddy` (Image `caddy:2-alpine`, Konfiguration `docker/Caddyfile`, Ports 80 und 443, Volumes `caddy-data` und `caddy-config`). Er leitet an `forga:3000` weiter, leitet HTTP auf HTTPS um und schreibt kein Zugriffsprotokoll (IP-Adressen der Benutzer sind Personendaten).

| Profil | Zertifikat | Variablen |
| --- | --- | --- |
| `https` | Let's Encrypt (`FORGA_TLS` = E-Mail-Adresse; der Host muss aus dem Internet auf 80/443 erreichbar sein) oder eigenes Zertifikat der Gemeinde (`FORGA_TLS="/certs/forga.crt /certs/forga.key"`, Ordner `FORGA_CERT_DIR`, Standard `docker/certs`) | `FORGA_DOMAIN`, `FORGA_TLS`, `FORGA_CERT_DIR` |
| `https-internal` | interne Zertifizierungsstelle von Caddy, für ein Netz der Gemeinde ohne öffentlichen Namen; das Stammzertifikat (`caddy-data`, `caddy/pki/authorities/local/root.crt`) wird auf den Geräten installiert | `FORGA_DOMAIN` |

Einzelheiten zum Betrieb: [Betrieb](betrieb.md#https).

**Cookies.** Sitzungs-, Impersonations- und OIDC-Cookies bekommen `Secure` (`CookiePolicy`), wenn eines gilt:
- `FORGA_SECURE_COOKIES=true`,
- die Anfrage kam über HTTPS (`req.secure`; hinter einem Proxy nur mit `FORGA_TRUST_PROXY`, der `X-Forwarded-Proto` glaubt),
- die Adresse von f.orga (`brigade.publicUrl`, sonst `FORGA_PUBLIC_URL`) beginnt mit `https://`.

**Sicherheitsheader** auf jeder Antwort (API, Shell, Modul-Frontends, Fehler; `securityHeaders` in `libs/core/core-api/src/lib/security/http-security.ts`, eingehängt in `apps/server/src/app/http.ts` vor allen anderen Middlewares):

| Header | Wert |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `same-origin` |
| `Permissions-Policy` | `camera=(self), nfc=(self), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains`, nur auf Anfragen über HTTPS |

- Die Shell und die Modul-Frontends (Module Federation) laden ihre Skripte nur vom eigenen Ursprung: `index.html` enthält kein Inline-Skript, die Remotes kommen als `<script type="module" src="/modules/<id>/remoteEntry.js">`. Stile müssen inline erlaubt sein, weil Mantine seine CSS-Variablen in `<style>`-Elemente schreibt und Komponenten `style`-Attribute setzen.
- Zod läuft im Browser ohne JIT (`config({ jitless: true })` beim Laden des `web-sdk`); sonst prüft es mit `Function('')`, ob es Code erzeugen darf, und jede Seite meldete eine CSP-Verletzung (`unsafe-eval` ist nicht erlaubt).
- Anhänge und Wappen setzen ihre eigene, strengere CSP (`default-src 'none'`, `sandbox`).
- Kamera und NFC gelten für die ganze Anwendung (eigener Ursprung), nicht nur für `/scan`: Die Shell ist eine einzige Seite, ein Dokument dient allen Routen. Eine Regel nur für `/scan` würde die Kamera der Kleiderkammer, der Geräte, der Führerscheinkontrolle und des Infoterminals nach einem Wechsel innerhalb der Anwendung sperren. Fremde Seiten in Frames bekommen weder Kamera noch NFC.

**API-Dokumentation.** `/api/docs` und `/api/docs/openapi.json` nur für angemeldete Benutzer (Sitzung) oder API-Tokens, sonst `401 auth.required` (`protectApiDocs`).

**Warnung bei HTTP.** Die Einrichtungsliste der Startseite zeigt den ersten Punkt „f.orga über HTTPS aufrufen“ (`key: https`), solange die Anfrage nicht über HTTPS kam; auf dem Entwicklungsrechner (`FORGA_STAGE=development`) nicht. „Verwaltung → Einstellungen → Sicherheit“ (`/admin/settings?tab=security`, Core, auch ohne Modul Datenschutz) zeigt den Stand: HTTPS (aus Sicht des Browsers und des Servers, Plakette „nein – Aufruf über http://“ mit Warnung), Cookies nur über HTTPS, System (Echtsystem, Testsystem, Entwicklung). Daten: `GET /api/core/security/status` (`core.settings.manage`, `SecurityStatus`: `stage`, `https`, `publicUrlHttps`, `secureCookies`).

## Echt-, Test- und Entwicklungssystem (L6)

**`FORGA_STAGE`** (`production`, `test`, `development`; ohne Angabe `development`, das Docker-Image setzt `production`; ein unbekannter Wert verhindert den Start). `docker/compose.stages.yml` setzt `production` für das Echtsystem und `test` für das Testsystem, `docker/compose.yml` `production` (änderbar über `FORGA_STAGE`). `GET /api/core/setup` (ohne Anmeldung) liefert `stage`; `forgaStage()` und `isTestStage()` in `libs/core/core-api/src/lib/stage.ts` lesen den Wert bei jedem Aufruf.

Im **Testsystem**:
- **Band** „Testsystem – nur Demodaten“ oben auf jeder Seite, auch auf der Anmeldeseite und am Infoterminal (`StageBand` in der Shell, `useStage()` im `web-sdk`).
- **Datenübernahme aus MP-Feuer gesperrt:** Hochladen, Probelauf und Übernahme antworten `403 mp-feuer.lockedInTestStage`; die Seite „Übernahme“ zeigt nur den Hinweis.
- **Import von Personen gesperrt:** Importprofile mit `personData: true` (heute `masterdata.persons`) antworten in Vorschau und Übernahme `403 imports.lockedInTestStage`; `GET /api/core/imports/profiles` kennzeichnet sie mit `lockedInTestStage`, der Import-Assistent bietet sie nicht an. Einzige Ausnahme sind die erfundenen Demodaten von `npm run seed`: Der Aufruf schickt `demoData: true` (die Oberfläche nie), das Audit `imports.applied` vermerkt es.
- **Wiederherstellung einer Sicherung des Echtsystems nur mit Begründung:** Sicherungen tragen im Manifest `stage`. Hat die Sicherung `production` (oder fehlt `stage` bei einer Sicherung einer anderen Installation), liefert `POST /api/backup/restore/check` `realData: true`; der Assistent verlangt eine Begründung (`realDataReason`, mindestens 10 Zeichen, sonst `400 backup.realDataReasonRequired`). Sie steht in den Audit-Einträgen `backup.restore-started` und `backup.restored` und in der Wiederherstellung (`backup.restore`, Spalten `real_data_reason`, `real_data_until`).
- **Löschen nach 7 Tagen:** Nach einer solchen Wiederherstellung zeigt die Übersicht der Datensicherung „Testsystem mit Echtdaten … Am … werden alle Daten dieses Testsystems gelöscht“ (`BackupOverview.realData`). Die tägliche Prüfung des Moduls (läuft im Testsystem auch ohne geplante Sicherungen) löscht nach Ablauf die hochgeladene Sicherungsdatei, entfernt alle Schemas von f.orga und die Migrationstabelle und beendet den Prozess (`RestoreService.deleteExpiredRealData`). Nach dem Neustart legen die Migrationen eine leere Datenbank an; f.orga verlangt die Ersteinrichtung. Die vorige Datenbank der Wiederherstellung (Testdaten) fällt wie immer nach 7 Tagen weg; die Sicherheitssicherung vor der Wiederherstellung enthält nur Testdaten.

**`npm run seed`** lehnt ein System mit `stage: production` ab.

**Git:** `.gitignore` nimmt `local/`, `*.xlsx` (außer unter `fixtures/` bzw. `__fixtures__/`), `MPTRA_*.zip`, `*.dump`, `*.forgabackup` und `docker/certs/` aus.

## Gesundheitsdaten (L5, Teil)

**Verletzte und Getötete im Bericht.** Recht `incidents.injuries.read` (Abteilung; Rollenvorlage `commander` über `incidents.*`). „verletzt“ und „getötet“ im Personal eines Berichts sehen:
- der Verfasser (`authorPersonId` = Person des Benutzers),
- Freigeber (`incidents.reports.release`),
- wer `incidents.injuries.read` für die Abteilung des Berichts hat (bei Berichten einer gesamtwehrweiten Einheit: gesamtwehrweit).

Für alle anderen liefert der Bericht (`Report`) im Personal `injured: false, killed: false` und `injuries: { hidden: true, injured, killed }` mit den Zahlen; der Editor zeigt „Eigene Kräfte: 1 verletzt, 0 getötet“ statt der Auswahl. Speichern sie den Bericht, bleiben die gespeicherten Werte (je Person, Gäste nach Namen), neue Einträge bekommen keine. Die Historie des Berichts blendet für sie `incidents.report_personnel.injured` und `….killed` aus (`hiddenFields` mit `<Historienname>.<Feld>`). Die Jahresstatistik zählt weiter alle Verletzten (F26, F27). Die Berechtigung trägt `stepUp`: Ohne bestätigte Sitzung zählt sie als fehlend, der Bericht meldet dann `injuries.stepUpAvailable` und der Editor bietet „Verletzte anzeigen …“ (zweiter Faktor) an.

**Hinweise an Freitexten:** „Keine Gesundheitsangaben eintragen.“ (`common.privacy.noHealthData`) an der Bemerkung der Personalakte, an der Bemerkung einer Ruhezeit und am Text einer Entschuldigung.

**Entschuldigungsgrund als Auswahl.** Eine Entschuldigung in „Mein Bereich“ verlangt einen Grund (`ExcuseReason`: `work` beruflich, `private` privat, `sick` krank, `vacation` Urlaub, `other` sonstiges; ohne: `400`); der Text (`note`) ist freiwillig. Den Grund sehen alle Leser des Dienstes, den Text nur, wer die Anwesenheit der Abteilung erfasst (`training.attendance`, Gruppenführer); für andere ist `note` leer und in der Historie ausgeblendet. Die Anonymisierung leert Grund und Text.

## E-Mails ohne Gesundheitsbezug (L18, Teil)

Einstellung `security` des Core (nur Verwalter lesen sie: `core.settings.manage`; „Verwaltung → Einstellungen → Sicherheit → E-Mails“):

| Feld | Bedeutung | Standard |
| --- | --- | --- |
| `mailHealthWithoutNames` | Fristen und Benachrichtigungen mit Gesundheitsbezug ohne Namen | an |
| `mailAllWithoutNames` | alle Fristen der wöchentlichen E-Mail ohne Namen | aus |
| `notifyImpersonation` | Benutzer bei „Anmelden als“ per E-Mail benachrichtigen ([L15](#anmelden-als)) | an |

- Fristen tragen `health: true`, wenn sie etwas über die Gesundheit sagen; heute „Eignungsuntersuchung erforderlich“ des Atemschutzes (für die Verantwortlichen, nicht die eigene Frist des Geräteträgers).
- Die wöchentliche E-Mail nennt solche Fristen nur gezählt je Bereich: „3 Fristen im Bereich Atemschutz, davon 1 überfällig – in f.orga ansehen“, mit Link auf f.orga, wenn die Adresse bekannt ist. Die übrigen Fristen stehen wie bisher einzeln mit Namen. Glocke und Startseite in f.orga zeigen alle Fristen mit Namen.
- Die Benachrichtigung beim Wechsel der Atemschutz-Ampel auf Rot lautet ohne Namen „Atemschutz: Ein Geräteträger ist nicht mehr einsatzbereit“ mit Link auf „Atemschutz → Tauglichkeit“ (`/respiratory-protection/overview`); das Audit `respiratory-protection.red-notified` vermerkt `withoutNames`.
- Die SMTP-Einstellungen warnen, wenn weder STARTTLS noch Port 465 eingestellt ist.

## Recht und Seite „Datenschutz“

**Recht `privacy.manage`** („Datenschutz verwalten“, Manifest des Moduls Datenschutz): Gesamtwehr, `privileged` (nie für API-Tokens), `stepUp`. Rollenvorlage: `administrator` über `*`; andere Rollen (Kommandant, eine Person der Gemeindeverwaltung, DSB) bekommen es bei Bedarf. Einwilligungen von Personen der Abteilung erfasst `privacy.consents` (siehe [Einwilligungen](#einwilligungen-l9)).

**Seite „Verwaltung → Datenschutz“** (Menüpunkt aus der Navigation des Moduls, Abschnitt `administration`, mit `privacy.manage`; Routen des Moduls unter `/privacy/…`) mit den Reitern:

| Reiter | Route | Recht | Inhalt |
| --- | --- | --- | --- |
| Anfragen | `/privacy` | `privacy.manage` | Kacheln „Frist in 7 Tagen“, „Offene Anfragen“ (älteste), „Eingeschränkte Personen“, „Information nach Art. 13/14 offen“; Filter offen/abgeschlossen/alle; Tabelle Art, Person, Eingang mit Weg, Frist (rot überfällig, gelb in 7 Tagen), Stand, Bearbeiter; „Anfrage erfassen …“; Karte „Eingeschränkte Personen“ |
| Anfrage | `/privacy/requests/:id` | `privacy.manage` | siehe [Betroffenenanfragen](#betroffenenanfragen-l7-l19) |
| Information | `/privacy/information` | `privacy.manage` | siehe [Information nach Art. 13/14](#information-nach-art-1314) |
| Verzeichnis | `/privacy/register` | `privacy.manage` | siehe [Verzeichnis der Verarbeitungstätigkeiten](#verzeichnis-der-verarbeitungstätigkeiten-l8) |
| Datenpannen, Datenpanne | `/privacy/breaches`, `/privacy/breaches/:id` | `privacy.manage` | siehe [Datenpannen](#datenpannen-l20) |
| Einstellungen | `/privacy/settings?tab=` | `privacy.manage` | Kontakte, Texte, Einwilligungen, Selbstauskunft; zugleich die Einstellungsseite des Moduls (Abschnitt `settings`, Knopf unter „Verwaltung → Module“) |

Sicherheit und Aufbewahrungsfristen gehören dem Core: Reiter „Sicherheit“ und „Aufbewahrung“ unter „Verwaltung → Einstellungen“ (`/admin/settings?tab=security`, `?tab=retention`, Recht `core.settings.manage`).

**Einstellungsabschnitte** des Moduls (`settings` und `settingsAccess` in `defineModule`, Schemas `PRIVACY_SETTINGS` aus `@forga/privacy-contracts`; gespeichert als `core.setting`, historisiert; lesen und ändern nur ihre Verwalter, `SettingsAccess.managers`):

| Abschnitt | Schema (`@forga/privacy-contracts`) | Verwalter | Inhalt |
| --- | --- | --- | --- |
| `privacy.contacts` | `PrivacyContacts` | `privacy.manage` | `controller` (`name`, `address`, `representedBy`), `dpo` (`name`, `address`, `email`, `phone`), `authority` (`name`, vorbelegt mit dem Landesbeauftragten für den Datenschutz und die Informationsfreiheit Baden-Württemberg, `address`, `website`) |
| `privacy.texts` | `PrivacyTexts`, `PrivacyTextBlock` | `privacy.manage`, nur über die eigenen Endpunkte (`PUT /api/core/settings/privacy.texts` antwortet `400 settings.dedicatedEndpoint`) | Textbausteine, siehe unten |
| `privacy.selfServiceAccess` | `PrivacySelfService` | `privacy.manage` | `mode` `request` (Standard) oder `instant`; `contact` (Ansprechpartner in Mein Bereich) |
| `privacy.activities` | `PrivacyActivities`, `ActivityRecord` | `privacy.manage`, nur über die eigenen Endpunkte (`settings.dedicatedEndpoint`) | Ergänzungen der Gemeinde je Verarbeitungstätigkeit und Empfänger für alle Tätigkeiten, siehe [Verzeichnis](#verzeichnis-der-verarbeitungstätigkeiten-l8) |
| `privacy.consents` | `PrivacyConsents`, `ConsentDefinition` | `privacy.manage`, nur über die eigenen Endpunkte | Katalog der Einwilligungen, siehe [Einwilligungen](#einwilligungen-l9) |
| `retention` (Aufbewahrung), `security` (Core) | `RetentionSettings`, `SecuritySettings` (`@forga/core-contracts`) | `core.settings.manage` | |

**Textbausteine** (`privacy.texts`; je Baustein `text: { de, en }`, `version`, `changedAt`, `changedBy`, `reviewedAt`, `reviewedBy`; `PRIVACY_TEXT_BLOCKS` nennt Verwendung und Platzhalter):

| Schlüssel | Verwendet in | Platzhalter |
| --- | --- | --- |
| `noticeIntro`, `noticeProcessing` | Datenschutzhinweis | `{brigade}` |
| `rights`, `automatedDecisions`, `thirdCountry` | Datenschutzhinweis, Deckblatt der Auskunft (Art. 15 Abs. 1 e, h, Abs. 2) | `{brigade}` |
| `firstLogin` | Hinweis bei der ersten Anmeldung | `{brigade}` |
| `accessReportIntro` | Einleitung der Auskunft | `{brigade}`, `{name}`, `{receivedOn}` |
| `replyAccess`, `replyRectification`, `replyErasure`, `replyRestriction`, `replyObjection`, `replyConsentWithdrawal`, `replyRejection`, `replyExtension` | Antwortschreiben | `{brigade}`, `{name}`, `{receivedOn}`, `{dueOn}`, `{extendedUntil}`, `{kind}`, `{activity}`, `{reason}`, `{authority}`, `{today}` |

- Nie gespeicherte Bausteine kommen mit ihrer **Vorlage** (`PRIVACY_TEXT_TEMPLATES`, beginnt mit „[Vorlage]“, nennt nur Titel von DSGVO-Artikeln und Platzhalter in eckigen Klammern). `PrivacyTexts.parse(await settings.get('privacy.texts') ?? {})` liefert immer alle Bausteine; `fillPlaceholders(text, values)` ersetzt `{platzhalter}`. Absätze trennt eine Leerzeile, Zeilen mit „- “ sind Aufzählungen.
- `PUT /api/privacy/texts/:key` (`{ text, version }`): Ein geänderter Text erhöht `version` und gilt wieder als Vorlage (`reviewedAt` leer); eine veraltete `version` antwortet `409 conflict.stale`. Audit `privacy.text-changed`.
- `POST /api/privacy/texts/:key/review` (`{ version }`): „Als geprüft markieren“ setzt `reviewedAt` und `reviewedBy` (Anzeigename). Audit `privacy.text-reviewed`.
- Oberfläche (Reiter „Texte“): Warnung „n Textbausteine sind Vorlagen“, Tabelle mit Verwendung, Fassung und Stand („Vorlage – mit dem DSB prüfen“ bzw. „geprüft …“), darunter der gewählte Baustein Deutsch und Englisch nebeneinander mit Platzhaltern, „Speichern“ und „Als geprüft markieren …“ (Bestätigung).
- Einrichtungsliste der Startseite: `privacyContacts` (Verantwortlicher und DSB eingetragen) und `privacyTexts` (alle Bausteine geprüft), beide mit eigener Beschriftung und Link auf den Reiter; das Modul meldet sie über `OnboardingRegistry`, nur solange es aktiv ist. Die Einstellungsseite selbst ist kein Schritt (`onboarding: false`).

**Für die Auskunft als PDF** (L3): Das Deckblatt liest `privacy.contacts` (Verantwortlicher, DSB, Aufsichtsbehörde) und `privacy.texts` (`rights`, `automatedDecisions`, `thirdCountry`, `accessReportIntro`). Die Anfrage hat das Feld `accessReportDocumentId` (`PrivacyRequest`); `PrivacyRequests.attachAccessReport(requestId, documentId)` (im Modul) trägt die erstellte Auskunft ein. Die Seite einer Anfrage auf Auskunft zeigt die Auskünfte zu ihr mit Stand und Übergabe und „Auskunft erstellen …“ (siehe [Auskunft nach Art. 15 als PDF](#auskunft-nach-art-15-als-pdf-l3)); `PrivacyRequests.closeDone` setzt eine offene Anfrage auf erledigt.

## Datenschutzhinweis (L4)

**Fassungen.** Der Hinweis setzt sich aus Feuerwehrname, `privacy.contacts` und den Bausteinen `noticeIntro`, `noticeProcessing`, `rights`, `automatedDecisions`, `thirdCountry` zusammen (`composeNotice`), mit den Abschnitten Worum es geht, Verantwortlicher und Datenschutzbeauftragter, Welche Daten wir wofür verarbeiten, Ihre Rechte, Beschwerde (Aufsichtsbehörde), Automatisierte Entscheidungen, Übermittlung in Drittländer. Jede Änderung, die den Text oder den Stand „Vorlage“ ändert, legt eine neue **Fassung** an (Tabelle `privacy.notice`: `version`, `publishedAt`, `sections` in beiden Sprachen, `template`; historisiert, Audit `privacy.notice-published`). Auslöser sind Änderungen der Abschnitte `brigade`, `privacy.contacts` und `privacy.texts` (`SettingsService.onChange`); die erste Fassung entsteht beim ersten Abruf.

**Öffentlich lesbar** (ohne Anmeldung):
- Seite `/privacy-notice` (Kiosk-Seite des Moduls, `frontend.kiosk`, exponiert als `./Notice`) mit Fassung und Datum, früheren Fassungen zur Auswahl, Hinweis „Vorlage – noch nicht mit dem Datenschutzbeauftragten geprüft“ und „Als PDF“. Links in der Fußzeile jeder Seite, auf der Anmeldeseite, in Mein Bereich und in den Einstellungen; Fußzeile und Anmeldeseite zeigen den Link nur bei aktivem Modul. Ist das Modul aus, meldet `/privacy-notice` „nicht verfügbar“ (`modules.inactive`).
- `GET /api/privacy/notice?version=` (`PrivacyNotice` mit `versions`; unbekannte Fassung `404 privacy.noticeUnknown`), `GET /api/privacy/notice.pdf?language=&version=` (Briefkopf bzw. Wappen; für den Aushang und als Beilage zur Aufnahme).

**Hinweis bei der ersten Anmeldung und nach einer neuen Fassung** (Mockup `erste-anmeldung.html`; die angebotenen Einwilligungen siehe [Einwilligungen](#mein-bereich-und-erste-anmeldung)): `GET /api/privacy/notice/state` meldet `{ version, acknowledgedVersion, due }` (`SessionPrivacyNotice`). Ist `due`, zeigt das Modul über den Erweiterungspunkt `core.session.gate` der Shell vor allen Seiten „Bevor Sie beginnen“ mit dem Baustein `firstLogin` (`GET /api/privacy/notice/first-login`), Link auf den vollständigen Hinweis, dem Haken „Datenschutzhinweis (Fassung n) zur Kenntnis genommen“ und „Weiter“ (oder „Abmelden“). `POST /api/privacy/notice/acknowledge` (`{ version }`) speichert Fassung und Zeitpunkt je Benutzer (Tabelle `privacy.notice_acknowledgement`: `user_id`, `version`, `acknowledged_at`; nicht historisiert, Audit `privacy.notice-acknowledged`). Das ist keine Einwilligung.
- `due` gilt erst, wenn alle Bausteine des Hinweises geprüft sind (`template: false`): Eine ungeprüfte Vorlage gilt noch nicht und wird niemandem zur Kenntnis vorgelegt. Danach fragt jede neue Fassung erneut.
- Nicht während einer Impersonation (`due: false`, Bestätigen `403 privacy.acknowledgeOwnOnly`), nicht für technische Benutzer und API-Tokens. Eine inzwischen veraltete Fassung antwortet `409 privacy.noticeOutdated`.

## Information nach Art. 13/14

Die meisten Mitglieder haben kein Benutzerkonto. Je Person stehen deshalb „Information erteilt am“ und der Weg im Modul (Tabelle `privacy.information`, historisiert als `privacy.information`: `informed_on`, `via` `letter` Schreiben, `in-person` persönlich, `posting` Aushang, `email`, `other`; in `PersonPrivacy.information` von `GET /api/privacy/persons/:personId`).

- **Liste** `GET /api/privacy/uninformed` (`privacy.manage`, `UninformedPerson[]`): Personen ohne vermerkte Information, deren verknüpfter Benutzer den Hinweis auch nicht zur Kenntnis genommen hat; ohne Ausgeschiedene, Anonymisierte und Eingeschränkte (aus `PERSON_DIRECTORY.careers()` der Stammdaten).
- **Massenaktion** `POST /api/privacy/information` (`PrivacyInformationInput`: `personIds`, `informedOn`, `via`; Antwort `{ count }`), z. B. nach einer Datenübernahme. Audit `privacy.information-recorded` mit Zahl, Datum und Weg (bei einer Person mit `personId`).
- Oberfläche: Reiter „Information“ mit „Datenschutzhinweis als PDF“, Auswahl je Person und „Alle auswählen“, „Information vermerken (n) …“ (Datum, Weg); einzeln auch im Reiter „Datenschutz“ der Personalakte.

## Betroffenenanfragen (L7, L19)

**Anfrage** (`privacy.request`, historisiert; Historie und Audit-Referenz `requestId` nur mit `privacy.manage`):

| Feld | Bedeutung |
| --- | --- |
| `kind` | `access` Auskunft, `rectification` Berichtigung, `erasure` Löschung, `restriction` Einschränkung, `objection` Widerspruch, `consent-withdrawal` Widerruf einer Einwilligung |
| `receivedOn`, `channel` | eingegangen am (nicht in der Zukunft), Weg: `letter` schriftlich, `email`, `in-person` persönlich, `my-area` Mein Bereich |
| `identityChecked`, `identityNote` | Identität geprüft und wie (bei Mein Bereich durch die Anmeldung) |
| `content`, `language` | Inhalt, Sprache von Antwort und Auskunft |
| `activityKey`, `activity` | beim Widerspruch die Verarbeitungstätigkeit aus dem [Verzeichnis](#verzeichnis-der-verarbeitungstätigkeiten-l8) (nur Kern und aktive Module, sonst `400 privacy.activityUnknown`; die Antwort nennt `activityName`) und der genauere Bezug als Text; Anfragen von vor dem Verzeichnis haben nur den Text |
| `dueOn` | eingegangen + 1 Monat (Art. 12 Abs. 3; am Monatsende auf den letzten Tag gekürzt, `addMonthsToDate`) |
| `extendedUntil`, `extensionReason`, `extensionNotifiedOn` | Verlängerung um 1 oder 2 Monate mit Begründung (mindestens 10 Zeichen), nur einmal und nur vor Ablauf der Frist; Person unterrichtet am |
| `status` | `received` eingegangen, `in-review` in Prüfung, `extended` verlängert, `done` erledigt, `rejected` abgelehnt (mit Begründung) |
| `closedOn`, `rejectionReason` | abgeschlossen am, Begründung der Ablehnung |
| `assigneeId`, `notes` | Bearbeiter (nur Inhaber von `privacy.manage`), Notizen |
| `recipients` | informierte Empfänger nach Art. 19 (`id`, `name`, `notifiedOn`) |
| `accessReportDocumentId` | erstellte Auskunft (Feature „Auskunft als PDF“) |

Die Auskunft als JSON (`GET /api/core/export/person/:personId`) enthält im Teil `privacy` die Anfragen der Person (`privacyRequests`: Art, Daten, Inhalt, Stand), Einwilligungen, Leseprotokoll, Einschränkung, Information und die zur Kenntnis genommenen Fassungen des Hinweises (`noticeAcknowledgements`). Die Anonymisierung einer Person leert Inhalt, Identitätsvermerk, Bezug und Notizen ihrer Anfragen und löscht deren Historie; Art, Daten und Ergebnis bleiben als Nachweis.

**Frist als Aufgabe.** Jede offene Anfrage ist eine Aufgabe des Moduls `privacy` (Art `privacy-request`, „Datenschutzanfrage beantworten: Auskunft“, fällig an `deadline` = Verlängerung oder `dueOn`, Link auf die Anfrage) für alle mit `privacy.manage`, auch vor dem Step-up (`DeadlineInput.held`), in der Glocke, auf der Startseite und in der wöchentlichen E-Mail. Die Aufgabe nennt nur das Eingangsdatum, keine Person. Solange eine verlängerte Frist der Person nicht mitgeteilt ist, erinnert eine zweite Aufgabe `privacy-extension-notice` („Person über die Fristverlängerung unterrichten“) bis zur ursprünglichen Frist; die Seite der Anfrage zeigt dazu eine Warnung mit „Als unterrichtet vermerken“.

**Antwortschreiben** `GET /api/privacy/requests/:id/reply.pdf?text=&language=`: Brief mit Briefkopf, Anschrift der Person, Ort und Datum, Betreff und dem Baustein mit gefüllten Platzhaltern; ohne `text` der Baustein der Art (`REPLY_TEXT_OF_KIND`), bei abgelehnten Anfragen `replyRejection`. Ein ungeprüfter Baustein trägt den Vermerk „Vorlage – vor dem Versand mit dem Datenschutzbeauftragten prüfen“. Nur Bausteine `reply…` (sonst `400 privacy.noReplyText`). Audit `privacy.reply-created`.

**Seite der Anfrage** (Mockup `anfrage.html`): Eingang, Person (Link auf den Reiter „Datenschutz“), Identität, Inhalt, Bezug, Sprache, Frist; Warnung zur Unterrichtung über die Verlängerung; Bearbeitung (Stand, Bearbeiter, Sprache, Identität, Inhalt, Notizen, „Frist verlängern …“, „Abschließen …“ mit Ergebnis, Datum und Pflichtbegründung bei Ablehnung, „Wieder öffnen“); bei Berichtigung, Löschung und Einschränkung „Empfänger informieren (Art. 19)“ als Checkliste aus den Empfängern des Verzeichnisses (`GET /api/privacy/register/recipients`: Empfänger für alle Tätigkeiten, aus den Modulen, von der Gemeinde ergänzte und API-Tokens, je einmal mit ihren Tätigkeiten; ohne E-Mail-Server und Anmeldedienst); bei Einschränkung, Widerspruch, Löschung und Berichtigung die Einschränkung der Person mit „Verarbeitung einschränken …“ bzw. „Einschränkung aufheben …“; bei Löschung die [Löschprüfung](#löschprüfung-l7); bei Auskunft der Stand der Auskunft; „Antwortschreiben (PDF)“ mit Auswahl des Bausteins.

**Widerspruch (L19):** Art `objection` mit `activityKey` (Tätigkeit des Verzeichnisses) und `activity` (genauer Bezug). Der Platzhalter `{activity}` der Antwortschreiben nennt beides („Personalverwaltung: Telefonliste“). „Verarbeitung bis zur Entscheidung einschränken“ beim Erfassen (`restrict: true`, nur bei Widerspruch und Einschränkung, sonst `400 privacy.restrictNotForKind`) schränkt die Person sofort ein (Grund `objection-pending` bzw. `accuracy-contested`, mit `requestId`). Die Entscheidung mit Begründung steht im Antwortschreiben `replyObjection` bzw. `replyRejection`.

**Endpunkte** (`privacy.manage`, außer Mein Bereich und Datenschutzhinweis):

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/privacy/requests?state=open\|closed\|all&personId=` | Anfragen (`PrivacyRequest[]`) mit `personName`, `assigneeName`, `createdByName`, `deadline` |
| `GET` | `/privacy/requests/:id` | eine Anfrage; unbekannt `404 privacy.requestUnknown` |
| `POST` | `/privacy/requests` | erfassen (`PrivacyRequestInput`). Fehler `privacy.personUnknown`, `privacy.receivedInFuture`, `privacy.restrictNotForKind`. Audit `privacy.request-created` |
| `PUT` | `/privacy/requests/:id` | Stand (`received`/`in-review`), Bearbeiter, Identität, Inhalt, Notizen, Sprache, Bezug (`PrivacyRequestUpdate` mit `version`). Fehler `privacy.requestClosed` (`409`), `privacy.assigneeWithoutPermission`, `conflict.stale`. Audit `privacy.request-status-changed` bei geändertem Stand |
| `POST` | `/privacy/requests/:id/extend` | verlängern (`months` 1 oder 2, `reason`). Fehler `privacy.alreadyExtended` (`409`), `privacy.deadlinePassed`. Audit `privacy.request-extended` |
| `POST` | `/privacy/requests/:id/extension-notified` | Unterrichtung vermerken (`notifiedOn`). Fehler `privacy.notExtended` |
| `POST` | `/privacy/requests/:id/close` | abschließen (`outcome` `done`/`rejected`, `closedOn`, `reason`). Fehler `privacy.closedBeforeReceived`. Audit `privacy.request-closed` |
| `POST` | `/privacy/requests/:id/reopen` | wieder öffnen (Stand `in-review` bzw. `extended`). Audit `privacy.request-reopened` |
| `PUT` | `/privacy/requests/:id/recipients` | informierte Empfänger. Audit `privacy.recipients-notified` |
| `GET` | `/privacy/requests/:id/reply.pdf?text=&language=` | Antwortschreiben |
| `GET` | `/privacy/assignees` | Benutzer mit `privacy.manage` (Gesamtwehr) |
| `GET` | `/privacy/persons/:personId` | Reiter „Datenschutz“: Anfragen der Person, der vom verknüpften Benutzer zur Kenntnis genommene Hinweis, Einschränkung (`restriction`) und Information nach Art. 13/14 (`information`) (`PersonPrivacy`) |
| `GET` | `/privacy/me` | angemeldet: eigene Anfragen, `selfService`, DSB, eigener Stand des Hinweises (`MyPrivacy`) |
| `POST` | `/privacy/me/requests` | angemeldet, Sitzung: „Auskunft anfordern“ (`{ language }`); bei `instant` zusätzlich sofort die Auskunft. Fehler `privacy.noPerson`, `privacy.requestOpen` (`409`, schon eine offene Auskunft), `privacy.accessReportToday` (`409`, `instant`: heute schon erstellt), `privacy.ownRequestOnly` (Impersonation, API-Token) |
| `GET`, `PUT`, `POST` | `/privacy/texts`, `/privacy/texts/:key`, `/privacy/texts/:key/review` | Textbausteine |
| `GET` | `/privacy/notice`, `/privacy/notice.pdf` | ohne Anmeldung: Datenschutzhinweis |
| `GET` | `/privacy/notice/state` | angemeldet: Stand des Hinweises für die Sitzung (`SessionPrivacyNotice`: `version`, `acknowledgedVersion`, `due`) |
| `GET`, `POST` | `/privacy/notice/first-login`, `/privacy/notice/acknowledge` | angemeldet: Hinweis bei der ersten Anmeldung |

**Mein Bereich** (Abschnitt „Datenschutz“ mit „Meine Einwilligungen“ für jeden Benutzer mit verknüpfter Person, vom Modul über den Erweiterungspunkt `core.me.sections`; „Anmeldungen als Sie“ gehört dem Core; der Menüpunkt „Mein Bereich“ erscheint immer, wenn eine Person verknüpft ist): „Auskunft anfordern …“, „Berichtigung beantragen …“ (Sprache; legt eine Anfrage mit Weg „Mein Bereich“ an, Identität durch die Anmeldung geprüft; gesperrt, solange eine Auskunft offen ist), „Meine Anfragen“ mit Stand und Frist, Link auf den Datenschutzhinweis mit der zur Kenntnis genommenen Fassung, Ansprechpartner und DSB. Mit `privacy.selfServiceAccess.mode = instant` heißt der Knopf „Auskunft jetzt erstellen …“: Die Person erzeugt ihre Auskunft sofort selbst (siehe [Selbstauskunft](#selbstauskunft-in-mein-bereich)).

**Reiter „Datenschutz“ der Personalakte** (`/masterdata/persons/:id?tab=privacy`; das Modul Datenschutz trägt ihn über den Erweiterungspunkt `masterdata.person.tab` bei, Recht `privacy.manage` oder `privacy.consents`, ohne Step-up „Datenschutz anzeigen …“): „Anfragen der Person“ mit „Anfrage erfassen …“, „Einwilligungen“, „Information und Einschränkung“ (Datenschutzhinweis zur Kenntnis genommen bzw. kein Benutzerkonto, Information nach Art. 13/14, Verarbeitung) mit „Information vermerken …“ und „Verarbeitung einschränken …“ bzw. „Einschränkung aufheben …“.

## Einschränkung der Verarbeitung (Art. 18)

Im Modul Datenschutz, eine Zeile je eingeschränkter Person (Tabelle `privacy.restriction`, `ProcessingRestrictionEntity`, historisiert als `privacy.restriction`; beim Aufheben gelöscht): `person_id`, `restricted_at`, `reason` (`accuracy-contested` Richtigkeit bestritten, `unlawful-processing`, `legal-claims`, `objection-pending` Widerspruch wird geprüft, `retention` Löschung abgelehnt, Aufbewahrungsfrist läuft), `until` (geplantes Ende), `request_id`; in `PersonPrivacy.restriction`. Die Personalakte der Stammdaten meldet nur `processingRestricted` (ja/nein) für Hinweis und Plakette.

**Anbindung:** Das Modul meldet sich am Dienst `ProcessingRestrictions` des Core an (`register({ module, restrictedIds })`). Core und Module fragen nur diesen Dienst (`restrictedIds(ids?)`, `isRestricted(id)`); ist das Modul inaktiv oder nicht installiert, ist niemand eingeschränkt und alle Filter unten wirken nicht. Die gespeicherten Einschränkungen bleiben und gelten wieder, sobald das Modul eingeschaltet wird.

- `PUT /api/privacy/persons/:id/restriction` (`ProcessingRestrictionInput`: `reason`, `until`, `requestId`; Antwort `ProcessingRestriction`; unbekannte Person `404`) und `DELETE …/restriction` (`204`) mit `privacy.manage`. Audit `privacy.restricted` bzw. `privacy.restriction-lifted`. `GET /api/privacy/restricted` listet die eingeschränkten Personen (`RestrictedPerson[]`).
- Das geplante Ende ist eine Aufgabe `restriction-ends` des Moduls (Gegenstand `privacy.processing-restriction`, 14 Tage vorher, ohne Namen, Link auf den Reiter „Datenschutz“) für alle mit `privacy.manage`; die Einschränkung bleibt, bis jemand sie aufhebt.

**Wirkung.** Eine eingeschränkte Person …

| Bereich | Umsetzung |
| --- | --- |
| Personalakte | nur mit `privacy.manage` (sonst `403 privacy.processingRestricted`, mit gehaltenem Recht `auth.stepUpRequired`); Ändern ebenso (nur zur Berichtigung). Plakette „Verarbeitung eingeschränkt“ mit Hinweis; Führerscheinakte ebenso |
| Personenliste, Personalauswahl, Listen der Stammdaten, Lehrgangsplanung, Führerscheinkontrollen, Ehrungsurkunden | `PersonsService.visibleWhere` (mit `notRestricted()` aus `ProcessingRestrictions`) lässt sie immer weg, auch für `privacy.manage` (die Datenschutzseite listet sie) |
| Globale Suche | Treffer mit `SearchHit.personId` einer eingeschränkten Person fallen weg (`SearchRegistry`) |
| Fristen und wöchentliche E-Mail | `DeadlineRegistry` lässt Fristen mit `personId` bzw. Gegenstand `masterdata.person`/`core.me` einer eingeschränkten Person weg (Probezeit, Altersgrenzen, Qualifikationen, Führerschein, Atemschutz, Verdienstausfall ohne Betrag) |
| Andere Module über `PERSON_DIRECTORY` | `search`, `membersOn`, `memberPeriods`, `careers()` ohne IDs und `offices` lassen sie weg; `isRestricted(id)` und `restrictedIds(ids?)` (reichen an `ProcessingRestrictions` weiter) für Daten in eigenen Tabellen. `snapshots`, `summaries`, `paymentDetails` und `careers(ids)` liefern sie weiter (Namen in bestehenden Datensätzen) |
| Infoterminal | keine Namenskachel, keine Suche, nicht unter den Eingetragenen von Einsatz und Dienst; Eintragen und Selbstkontrolle des Führerscheins wie bei einer unbekannten Person |
| Einsätze | Reiter „Einsätze“ der Person nur mit `privacy.manage`; nicht in „Einsatzstunden je Person“, nicht als Verfasser in „Offene Einsatzberichte“, nicht in der Auswahl der Verfasser und der Besatzung des letzten Einsatzes; keine Erinnerungs- und Rückgabe-E-Mails |
| Dienste | nicht neu in Anwesenheitslisten (`training.unknownPerson`), nicht in Teilnehmerliste, Ausbilderstunden, Unterschriftenliste und Teilnahmeübersicht |
| Atemschutz | nicht in Übersicht, Listen und Fristen; Seite der Person nur mit `privacy.manage`; keine E-Mail beim Wechsel auf Rot |
| Entschädigung | nicht in den Jahressummen und unter den Funktionsträgern; Posten der Person nur mit `privacy.manage` |
| Beförderungen | nicht unter den Vorschlägen, in den Listen und den Ausschlüssen; nicht manuell hinzufügbar; Seite der Person nur mit `privacy.manage` |
| Kleiderkammer | nicht in „Ausgegebene Schutzausrüstung“, in „Fällige Wäsche und Prüfungen“ ohne Namen; keine Ausgabe (`privacy.processingRestricted`); Seite der Person nur mit `privacy.manage` |
| Einsatzleiter vom Dienst | keine neuen Dienste (`privacy.processingRestricted`) |
| Mein Bereich | die Person selbst sieht und berichtigt ihre Daten weiter |

Weiter verarbeitet werden (Art. 18 Abs. 2, gesetzliche Pflichten): die Jahresstatistik (`membersOn(…, { includeRestricted: true })`, nur Zahlen), bereits erfasste Einsatzberichte und Dienste mit ihrem Personal, Auszahlungsläufe und Abrechnungen, Prüfprotokolle der Geräte mit dem Prüfer und der Vollexport. Seiten eines Moduls über eine einzelne Person prüfen die Einschränkung mit `assertNotRestricted(user, restricted)` aus `@forga/core-api` (öffnet mit `RESTRICTED_PERSONS_PERMISSION` = `privacy.manage`); neue Einträge lehnt `refuseRestricted(restricted)` ab.

**Tests:** `apps/server/src/privacy.integration.ts` (Recht und Step-up, Einstellungen, Fassungen der Texte, Hinweis mit erster Anmeldung und Impersonation, Information, Anfragen mit Frist, Verlängerung, Antwortschreiben, Empfänger, Abschluss, Mein Bereich, Einschränkung in Stammdaten, Suche, Listen, Fristen, Einsätzen, Atemschutz, Entschädigung, Kleiderkammer, Beförderungen, Diensten und Infoterminal) und Unit-Tests der `DeadlineRegistry` (auch ohne Modul Datenschutz und mit inaktivem Modul). `apps/server/src/privacy-module.integration.ts`: das Modul abgeschaltet – Endpunkte `modules.inactive`, niemand eingeschränkt, Listen ohne Einwilligungsfilter, kein Leseprotokoll, Step-up und Sitzungen wirken weiter; wieder eingeschaltet gelten Einschränkung und Einwilligungen wieder.

## Löschprüfung (L7)

Bei einer Anfrage auf Löschung (Art. 17) meldet jedes Modul je Datenbereich, ob es die Daten löschen darf, nur anonymisieren kann oder nach dem [Aufbewahrungsplan](aufbewahrung.md) bis zum Ende einer Frist aufbewahren muss (Art. 17 Abs. 3). Mockup `datenschutz/anfrage.html` (Karte „Löschprüfung“, Dialog „Löschung ausführen?“).

**Beitrag der Module:** `PersonDataHandler.erasure(personId, ctx)` liefert Zeilen `ErasureArea` (`core-contracts`, `erasure.ts`): `key` (`<modul>.<bereich>`), Bereich und Daten (`LocalizedText`, mit Zahlen), `count`, `outcome` (`delete` löschen, `anonymize` anonymisieren, `keep` einschränken), `keepUntil` und Grund. `ctx.retain(kategorie, seit)` fragt die Frist einer Kategorie des Aufbewahrungsplans ab (`RetentionService.periods`, mit `atLeastAs`): `null`, wenn sie abgelaufen ist; sonst Ende und Grund, z. B. „Grunddaten Ausgeschiedener: 15 Jahre nach Austritt“, „Frist beginnt mit Austritt“ (noch Mitglied) oder „keine Frist festgelegt“ (dann ohne Ende). `PersonDataHandler.erase(personId, areas, ctx)` löscht bzw. anonymisiert die übergebenen Bereiche.

| Bereich (`key`) | Daten | Ergebnis |
| --- | --- | --- |
| `masterdata.contact` | Kontakt, Geburtsdatum, Bankverbindung, Arbeitgeber, Bemerkungen (auch aus der Historie der Person) | löschen nach dem Austritt, vorher einschränken |
| `masterdata.person-file` | Personalakte: Qualifikationen, Lehrgänge, Ehrungen, Ämter, Ruhezeiten, Führerschein | einschränken bis Austritt + Frist `masterdata.person-file`, danach löschen |
| `masterdata.person-core` | Grunddaten: Name, Personalnummer, Mitgliedschaften, Dienstgrade | einschränken bis Austritt + Frist `masterdata.person-core`, danach anonymisieren („N.“) |
| `incidents.personnel` | Einsatzberichte als Einsatzkraft oder Verfasser | anonymisieren: Begründungen manueller Beträge geleert; die Einsätze bleiben im Wachbuch, der Name folgt den Grunddaten |
| `training.attendance` | Einträge in Anwesenheitslisten | anonymisieren: ohne Entschuldigungen |
| `respiratory-protection.evidence` | Nachweise und Eignungsuntersuchungen | löschen (samt Ampel) |
| `compensation.payouts` | Posten in Auszahlungsläufen | einschränken bis Auszahlung + Frist `compensation.runs` (Kassenunterlage; nicht ausgezahlte Läufe ohne Ende), danach anonymisieren |
| `compensation.open` | offene Posten, Funktionen mit Aufwandsentschädigung | löschen |
| `equipment.defects` | gemeldete Mängel | anonymisieren: Meldender „N. N.“ |
| `equipment.inspections` | durchgeführte Prüfungen | einschränken (Prüfnachweis, solange das Gerät im Bestand ist, danach Frist `equipment.retired`), danach ohne Prüfer |
| `promotions.exclusions`, `promotions.lists` | Ausschlüsse; Einträge in Beförderungslisten | löschen; anonymisieren („N.“, ohne Kommentar, auch in der Historie der Liste) |
| `clothing.sizes`, `clothing.issues` | Größen; Ausgaben und Rücknahmen | löschen; anonymisieren (ohne Notizen und Stornogründe), solange ein Stück ausgegeben ist einschränken |
| `duty-officer.roster` | Dienste im EvD-Dienstplan | anonymisieren: ohne Notizen |
| `mp-feuer.transfer` | Zeilen mit dem Namen in Laufberichten und Transferdateien, gemerkte Zuordnungen | anonymisieren: Berichtszeilen „N. N.“, Transferzeilen und Zuordnungen gelöscht |
| `core.account` | Benutzerkonto | anonymisieren: gesperrt, „N. N.“, ohne E-Mail, Passwort, zweiten Faktor, Sitzungen und Tokens |
| `privacy.requests` | Anfragen, Einwilligungen, erstellte Auskünfte (Modul Datenschutz) | anonymisieren: Art, Daten und Ergebnis bleiben als Nachweis, Texte und Auskünfte gelöscht |
| `privacy.access-log` | Leseprotokoll über die Person (Modul Datenschutz) | einschränken bis Frist `privacy.access-log`, danach löschen |
| `core.protocols` | Einträge des Kontos im Audit-Log | einschränken bis Frist `core.audit`, danach löschen |

Bereiche ohne Daten erscheinen nicht. Reihenfolge: Stammdaten, die übrigen Module (darunter Datenschutz), Core. Die Löschprüfung selbst (`ErasureService`, Endpunkte, Oberfläche) gehört dem Modul Datenschutz; die Verträge (`PersonDataHandler`, `ErasureArea`) und `PersonDataRegistry` liegen im Core, damit jedes Modul sie auch ohne das Modul Datenschutz erfüllt (die vollständige Anonymisierung braucht sie).

**Ausführen** (`POST /api/privacy/requests/:id/erasure`, `ErasureConfirmation` mit `confirmName`): nur bei offener Anfrage auf Löschung, einmal je Anfrage; der eingegebene Name muss zur Person passen (Groß-/Kleinschreibung und Leerzeichen egal). Die Module löschen bzw. anonymisieren, was die Prüfung zu diesem Zeitpunkt erlaubt (`PersonDataRegistry.erase`); wird dabei der Name gelöscht (Grunddaten), ersetzt der Core danach auch die Kopien der Namen wie bei der [vollständigen Anonymisierung](#vollständige-anonymisierung-l13). Für alles Aufzubewahrende wird die Verarbeitung eingeschränkt (Grund `retention`, bis zum spätesten Fristende bzw. ohne Ende, mit Bezug zur Anfrage; Audit `privacy.restricted`). Die Anfrage bekommt `erasure` (`ErasureExecution`: ausgeführt am, Zahl der Bereiche je Ergebnis, eingeschränkt bis); sie wird nicht abgeschlossen, das geschieht mit dem Antwortschreiben. Audit `privacy.erasure-executed` mit Anfrage, Person, Zahl der gelöschten, anonymisierten und eingeschränkten Bereiche und Zahl der Datensätze je Bereich, ohne Inhalte.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/privacy/requests/:id/erasure` | Löschprüfung (`ErasureCheck`: Name, Bereiche, Ende der Einschränkung, Ausführung). Fehler `privacy.notErasure` |
| `POST` | `/privacy/requests/:id/erasure` | Ausführen. Fehler `privacy.notErasure`, `privacy.erasureConfirmation`, `privacy.requestClosed` (`409`), `privacy.erasureExecuted` (`409`) |

Beide verlangen `privacy.manage` (mit Step-up).

**Oberfläche:** Karte „Löschprüfung“ auf der Seite der Anfrage mit Bereich, Daten, Ergebnis („löschen“, „anonymisieren“, „einschränken bis …“) und Grund, Warnung, wenn Teile eingeschränkt bleiben, „Ausführen …“ mit Dialog „Löschung ausführen?“ (Zahl der Bereiche je Ergebnis, Hinweis auf Sicherungen, Name zur Bestätigung); danach der Hinweis „Löschung ausgeführt am …“. Abweichung vom Mockup: Das Benutzerkonto wird anonymisiert statt gelöscht (andere Historien verweisen darauf), und die Protokolle sind ein eigener Bereich.

**Tests:** `apps/server/src/erasure.integration.ts`: Recht und Art der Anfrage, Prüfung bei einem Mitglied und nach dem Austritt mit Fristen, jeder Bereich der Seeds, Bestätigung, Einschränkung, Audit nur mit Zahlen, zweite Ausführung, danach nirgends mehr Name, E-Mail, Telefon, Geburtsdatum, IBAN oder Straße.

## Vollständige Anonymisierung (L13)

Nach Ablauf der Fristen hat kein Modul mehr Angaben, die die Person identifizieren, außer was aufzubewahren ist.

- **Ablauf:** Die Anonymisierung der Personalakte (Aufbewahrungsplan, `masterdata.person-file`, oder als erster Schritt der Grunddaten) ruft `PersonDataRegistry.anonymize(personIds)` auf. Der Core sammelt vorher die Namen („Vorname Nachname“, „Nachname, Vorname“) und die angezeigten Namen der verknüpften Konten (`AnonymizeContext`), dann anonymisiert jedes Modul seine Daten ([Wirkung je Modul](aufbewahrung.md#personendaten-in-den-modulen-persondataregistry)), zuletzt ersetzt der Core die gesammelten Namen in jeder Text- und JSON-Spalte des Core und der Module durch „N. N.“ (`replaceNames`): Audit-Log, Historie, Einstellungen, „erfasst von“, „storniert von“, Freitexte, Aussonderungsfälle, Sicherungsläufe und Wiederherstellungen (`userName`), Infoterminals (`createdBy`, `revokedBy`), Datenübernahmen (`createdBy`), Kostenbescheide (Bearbeitervermerke). Ersetzt werden nur Namen aus mindestens zwei Teilen, die keine andere Person und kein anderes Konto trägt; gleichnamige Personen lassen sich nicht unterscheiden.
- **Core:** Konten wie bisher, zusätzlich zweiter Faktor gelöscht; gemerkte Zuordnungen des Tabellen-Imports zur Person gelöscht.
- **Datenschutz:** Anfragen ohne Texte; erstellte Auskünfte gelöscht (Datei entfernt, `deletedAt`); Einschränkung, Information und Kenntnisnahmen der verknüpften Konten gelöscht; Einwilligungen und Leseprotokoll bleiben als Nachweis bis zu ihrer Frist. Der Beitrag läuft auch bei abgeschaltetem Modul.
- **Auskunft:** Für eine anonymisierte Person (`PersonSummary.anonymized`) lehnen Vorschau, Erstellen und Abschnitte die Auskunft ab (`409 privacy.personAnonymized`).
- **Startprüfung:** Jedes Modul mit `privacy.personData` muss `describePerson` und beim `PersonDataRegistry` `anonymize`, `erasure` und `erase` anmelden (`assertPersonDataComplete`, im Core beim Start); Module ohne Personendaten (Kostenersatz, Infoterminal, Datensicherung) erfasst die Namensersetzung.
- **Nicht erfasst:** gespeicherte PDF-Dateien der Kostenbescheide (eigene Frist als Kassenunterlage), Anhänge außerhalb der Datensätze der Person und Kopien in Sicherungen (eigene Aufbewahrung).
- **Tests:** `apps/server/src/anonymization.integration.ts`: Eine erfundene Person mit Daten in allen Modulen (Seeds der Auskunft), Auskunft, Anfrage mit Namen, Kopien des Kontonamens in Sicherung, Wiederherstellung, Infoterminal, Datenübernahme und Zuordnung tritt aus; der Aufbewahrungsplan anonymisiert sie; danach enthält keine Zeile einer Tabelle Vorname, E-Mail, Telefon, Geburtsdatum, IBAN oder Straße; die Auskunft wird abgelehnt. Unit-Test der Startprüfung (`access-report.spec.ts`).

## Verzeichnis der Verarbeitungstätigkeiten (L8)

Reiter „Verzeichnis“ der Seite „Verwaltung → Datenschutz“ (`/privacy/register`, Recht `privacy.manage` mit Step-up; Mockup `datenschutz/verzeichnis.html`). f.orga setzt einen **Entwurf** nach Art. 30 Abs. 1 DSGVO zusammen; die Gemeinde ergänzt ihn je Tätigkeit. Das Verzeichnis führt der Verantwortliche, der Entwurf ersetzt keine Prüfung.

**Zusammensetzung** (`PrivacyRegister`, `GET /api/privacy/register`, `ProcessingRegister`):

- **Tätigkeiten** aus den Manifesten der aktiven Module (`privacy.activities`, darunter `privacy.data-protection` des Moduls Datenschutz), danach `core.accounts` des Core. Ein deaktiviertes Modul fällt weg. Je Tätigkeit: Modul, Name, Zweck, Betroffene (`subjects`), Datenkategorien (`categories`), besondere Kategorien (`health` mit `healthNote`, z. B. „Verletzungen von Einsatzkräften und Beteiligten“), Hinweis zur Rechtsgrundlage (`legalBasisHint`, nur ein Hinweis, keine Rechtsberatung).
- **Löschfrist** aus `retention` je Aufbewahrungskategorie der Tätigkeit (`RetentionTexts`, dieselben Texte wie in der Auskunft: „Personalakte: 30 Jahre nach Austritt“, sonst „bis zur Festlegung einer Frist“).
- **Empfänger** (`RegisterRecipientView` mit `source`): aus dem Manifest (`module`), gültige API-Tokens mit Rechten des Moduls als „Schnittstelle „Name““ (`token`), von der Gemeinde ergänzte (`municipality`). E-Mail-Server und Anmeldedienst (OIDC) aus den Einstellungen sind technische Empfänger bzw. Auftragsverarbeiter (`processors`, `processor`) und stehen bei `core.accounts`.
- **Empfänger für alle Tätigkeiten** (`general`), z. B. die Stadtkasse.
- **Kostenersatz** hat eine Tätigkeit `cost-recovery.notices` (Kostenschuldner), aber keine Personendaten im Sinne der Auskunft (`personData: false`).
- **Technische Maßnahmen** (`TechnicalMeasure`: Titel, Stand, `tone` `ok`/`warning`/`info`) mit dem Stand beim Aufruf: Rechte je Abteilung (Zahl der Rollen und Benutzer), zweiter Faktor (Step-up; wie viele Benutzer mit Rechten unter Step-up ihn eingerichtet haben; Warnung ohne `FORGA_SECRET_KEY`), HTTPS (aus Sicht der Anfrage und der Adresse wie `GET /api/core/security/status`, „nein – Aufruf über http://“ als Warnung), Anmeldung (scrypt, Sperre, OIDC), Protokolle mit ihren Fristen, Verschlüsselung (Faktor, Zugangsdaten), E-Mails (Server, TLS, ohne Namen bei Gesundheitsbezug), System (Echt-, Testsystem, Entwicklung); das Modul Datenschutz meldet das Leseprotokoll mit seiner Frist (`privacy.access-log`) und die verschlüsselte Ablage der Auskünfte (`privacy.access-reports`), das Modul Datensicherung „nicht eingerichtet“ bzw. Zeitplan, Verschlüsselung und letzte erfolgreiche Sicherung (`backup.state`). Weitere Quellen melden sich am `TechnicalMeasureRegistry` an (`register({ module, measures(context) })`, Kontext wie `SecurityStatus`); Maßnahmen inaktiver Module fallen weg.

**Ergänzungen der Gemeinde** (Einstellungsabschnitt `privacy.activities`, `PrivacyActivities`; historisiert wie jede Einstellung, Historie unter `core.setting`):

| Endpunkt | Zweck |
| --- | --- |
| `PUT /api/privacy/register/activities/:key` | `ActivityRecordInput`: Rechtsgrundlage, weitere Empfänger (`id`, `name`, `note`), Übermittlung in Drittländer (leer = keine), Bemerkungen, `version`. Eine Änderung erhöht `version` und macht die Tätigkeit wieder zum Entwurf (`reviewedAt` leer). Fehler `404 privacy.activityUnknown` (nicht im Kern oder einem aktiven Modul), `409 conflict.stale`. Audit `privacy.activity-changed` |
| `POST /api/privacy/register/activities/:key/review` | „Als geprüft markieren“ mit `version`: `reviewedAt`, `reviewedBy` (Anzeigename). Audit `privacy.activity-reviewed` |
| `PUT /api/privacy/register/recipients` | Empfänger für alle Tätigkeiten. Audit `privacy.recipients-changed` |
| `GET /api/privacy/register/activities` | Tätigkeiten zur Auswahl (`ActivityOption`: Widerspruch, Datenpanne) |
| `GET /api/privacy/register/recipients` | Empfänger nach Art. 19 (`RecipientOption`) für die Anfragen |
| `GET /api/privacy/register/export/pdf`, `…/xlsx` `?language=` | Export; Audit `privacy.register-exported` mit Format und Sprache |

`PUT /api/core/settings/privacy.activities` antwortet `400 settings.dedicatedEndpoint`.

**Übernahme der früheren Empfängerliste:** Den Einstellungsabschnitt `privacy.recipients` (Empfänger nach Art. 19) gibt es nicht mehr. Beim Start verschiebt der Server gespeicherte Einträge mit ihren IDs in die Empfänger für alle Tätigkeiten (`PrivacyRegister.migrateLegacyRecipients`; ungültige Einträge entfallen, schon vorhandene IDs bleiben) und löscht den alten Abschnitt; Audit `privacy.recipients-migrated` mit der Zahl. In Anfragen abgehakte Empfänger bleiben dadurch abgehakt. Eine Datenbankmigration ist dafür nicht nötig (Einstellungen sind JSON).

**Export** (Entscheidung 10: PDF und Excel):

- **PDF** (`renderRegisterPdf`, Rahmen wie die Briefe): Titel „Verzeichnis von Verarbeitungstätigkeiten nach Art. 30 Abs. 1 DSGVO“, Hinweis „Entwurf aus f.orga …“, Verantwortlicher und DSB aus `privacy.contacts` (fehlende als „[in den Einstellungen Datenschutz eintragen]“), Übersicht, je Tätigkeit eine Tabelle Zweck, Betroffene, Daten, besondere Kategorien, Empfänger, Drittland, Löschfrist, Rechtsgrundlage (ohne Eintrag „mit dem DSB festlegen“ mit dem Hinweis des Moduls), Bemerkungen und „Geprüft“, danach Empfänger für alle Tätigkeiten, technische Empfänger und technische Maßnahmen.
- **Excel** (`renderRegisterXlsx`, `addStyledSheet`): Blatt „Verzeichnis“ mit einer Zeile je Tätigkeit zum Weiterbearbeiten, Blatt „Empfänger“ mit Herkunft, Blatt „Technische Maßnahmen“.

**Oberfläche:** Hinweis „Entwurf aus den aktiven Modulen …“, „Excel“ und „PDF herunterladen“; Tabelle Tätigkeit, Modul, Betroffene, besondere Kategorien (Plakette), Frist, Geprüft (Plakette „Entwurf“ bzw. Datum und Name); darunter die gewählte Tätigkeit mit den Angaben aus f.orga und den Feldern der Gemeinde (Rechtsgrundlage, Drittland, weitere Empfänger, Bemerkungen), „Als geprüft markieren …“ (Bestätigung) und „Speichern“; Karten „Empfänger für alle Tätigkeiten“ (früher „Einstellungen → Kontakte → Empfänger (Art. 19)“), „Technische Empfänger und Auftragsverarbeiter“ und „Technische Maßnahmen“ mit Plakette „prüfen“ bei Warnungen.

## Datenpannen (L20)

Reiter „Datenpannen“ (`/privacy/breaches`) und Seite einer Datenpanne (`/privacy/breaches/:id`), Recht `privacy.manage` mit Step-up.

**Datenpanne** (`privacy.breach`, `PrivacyBreachEntity`, historisiert; Historie nur mit `privacy.manage`; die Historie ist Teil der Dokumentation nach Art. 33 Abs. 5):

| Feld | Bedeutung |
| --- | --- |
| `title`, `description` | Kurzbeschreibung, was passiert ist |
| `discoveredAt` | bekannt geworden am (Zeitpunkt, nicht in der Zukunft: `privacy.discoveredInFuture`); `notifyBy` = + 72 Stunden (`BREACH_NOTIFICATION_HOURS`) |
| `occurredFrom`, `occurredUntil` | Zeitraum des Vorfalls, falls bekannt (`privacy.periodInvalid`) |
| `activityKeys`, `dataCategories`, `health` | betroffene Tätigkeiten des Verzeichnisses (`privacy.activityUnknown`), betroffene Daten als Text, besondere Kategorien |
| `affectedCount`, `affectedPersonIds`, `affectedSource` | geschätzte Zahl; ermittelte Personen und woraus |
| `consequences`, `measures`, `risk` | wahrscheinliche Folgen, Maßnahmen (Art. 33 Abs. 3 c, d), Risiko `unlikely`, `risk`, `high` |
| `authorityNotifiedOn`, `authorityReference`, `authorityNotRequired`, `authorityNote` | Meldung an die Aufsichtsbehörde mit Aktenzeichen, oder nicht meldepflichtig mit Begründung (beides zugleich: `privacy.authorityNotifiedAndNotRequired`; vor dem Bekanntwerden: `privacy.notifiedBeforeDiscovered`) |
| `subjectsNotifiedOn`, `subjectsNotifiedVia`, `subjectsNote` | Benachrichtigung der Personen (Art. 34) mit Weg `letter`, `email`, `in-person`, `posting`, `other` (Datum ohne Weg: `privacy.notificationWayMissing`) |
| `status`, `closedOn` | `open`, `closed` |

**Frist als Aufgabe.** Solange eine offene Datenpanne weder gemeldet noch als nicht meldepflichtig vermerkt ist, haben alle mit `privacy.manage` die Aufgabe `privacy-breach` „Datenpanne der Aufsichtsbehörde melden (bis 31.10.2026, 14:30)“, fällig am Tag von `notifyBy`, auch vor dem Step-up (`held`; die Aufgabe nennt keinen Inhalt). Bei hohem Risiko ohne Benachrichtigung zusätzlich `privacy-breach-subjects` „Betroffene Personen über die Datenpanne benachrichtigen (Art. 34)“. Beim Erfassen bekommen alle, deren Rolle `privacy.manage` ausdrücklich nennt, eine E-Mail ohne Inhalt („Datenpanne erfasst … bis …, Einzelheiten nur in f.orga“, Audit `privacy.breach-mailed`).

**Endpunkte** (`/api/privacy/breaches`):

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `?state=open\|closed` | Liste (`PrivacyBreach[]` mit `notifyBy`, `affectedPersons` mit Namen, `createdByName`) |
| `GET`, `POST`, `PUT` | `/`, `/:id` | lesen, erfassen (`PrivacyBreachInput`), ändern (`PrivacyBreachUpdate` mit `version`; abgeschlossen: `409 privacy.breachClosed`). Audit `privacy.breach-recorded`, `privacy.breach-changed`, bei neuer Meldung `privacy.breach-authority-notified` (Datum, Aktenzeichen), `privacy.breach-not-notifiable` (Begründung), `privacy.breach-subjects-notified` (Datum, Weg) |
| `PUT` | `/:id/affected` | ermittelte Personen übernehmen (`personIds`, `source`; unbekannte Personen `privacy.personUnknown`). Audit `privacy.breach-affected-recorded` mit Zahl |
| `GET` | `/:id/contacts.xlsx?language=` | Kontaktliste für die Benachrichtigung (Art. 34): Name, Anschrift, E-Mail, Telefon (mobil, sonst privat), benachrichtigt am; Hinweis „nur für die Benachrichtigung, danach löschen“. Audit `privacy.breach-contacts-exported` mit Zahl |
| `POST` | `/:id/close`, `/:id/reopen` | abschließen (nur gemeldet oder nicht meldepflichtig: `privacy.breachAuthorityOpen`; Datum nicht vor dem Bekanntwerden), wieder öffnen. Audit `privacy.breach-closed`, `privacy.breach-reopened` |

**Hilfen** (`/api/privacy/breach-tools`):

- **Protokolle exportieren** (`GET protocols.xlsx?from=&to=&userId=&breachId=&language=`): je Protokoll ein Blatt für den Zeitraum (Tage in Europe/Berlin) und optional einen Benutzer (auch als Administrator bei „Anmelden als“); das Audit-Log (`core.audit`, vom Core angemeldet, `CoreProtocols`) mit Zeitpunkt, Benutzer, „Angemeldet als durch“, Vorgang lesbar und als Code, Details (höchstens 50 000 Zeilen) und das Leseprotokoll (`privacy.access-log`, vom Modul angemeldet, `AccessLogStore.query`: Tag, Benutzer, Person bzw. „alle Personen“, Bereich, Zugriffe, erster und letzter Zugriff; höchstens 2000 Zeilen). Weitere Protokolle melden sich am `ProtocolRegistry` des Core an (`ProtocolSource`: `key`, `title`, `columns`, `rows(filter, language)`); `GET protocols` nennt sie. Audit `privacy.breach-protocol-exported`. `GET accounts` liefert alle Konten zur Auswahl (auch technische und gesperrte).
- **Betroffene Personen ermitteln** (`GET sources?from=&to=&userId=` listet die Audit-Einträge `lists.exported`, `data.exported`, `data.person-exported`, `privacy.access-report-created`, `privacy.access-report-downloaded` mit lesbarem Namen und Zahl der Personen; `POST affected` mit `{ source: 'audit', auditId }` oder `{ source: 'account', userId }`, Ergebnis `AffectedPersons`):
  - **Liste exportiert:** Das Audit `lists.exported` enthält die Parameter (`params`), den Zweck und die IDs der genannten Personen (`personIds`), wenn die Liste sie liefert (`ListContent.personIds`; alle Listen über Personen, siehe [Zweck der Listen](#zweck-der-listen-und-exporte-l11)). Ergebnis mit dem Stand des Exports (`basis: recorded`). Die Audit-Seite zeigt `personIds` nur als Zahl.
  - **Auskunft, Auskunft als JSON:** die Person des Eintrags.
  - **Vollexport** (`data.exported`): alle Personen, berechnet aus den heutigen Daten (`basis: current`).
  - **Benutzerkonto:** die Personen, die das Konto heute mit `masterdata.persons.read` lesen kann (ohne eingeschränkte; technische Benutzer mit den Rechten ihres Tokens), `basis: current`.
  - Einträge ohne Personen: `400 privacy.sourceWithoutPersons`. Audit `privacy.breach-affected-determined` (Quelle, Zahl).
- **Alle Sitzungen beenden und alle Tokens widerrufen** (`POST lockdown`, `{ reason }` mit mindestens 10 Zeichen, optional `breachId`; Endpunkt mit `@StepUp()`): beendet alle Sitzungen außer der eigenen (auch Impersonationen), widerruft alle API-Tokens und sperrt die Geräteschlüssel der Module (`LockdownRegistry` des Core; heute die Infoterminals, siehe [Infoterminal](#infoterminal-als-öffentlich-zugängliches-gerät-l22)). Antwort `{ sessions, tokens, devices }`, Audit `privacy.breach-lockdown` mit Grund und Zahlen.

Für die Hilfen liefert die Stammdaten zusätzlich `OrganizationProvider.readablePersonIds(user)`, `allPersonIds()` und `PersonSummary.phone`.

**Oberfläche:** Reiter „Datenpannen“ mit Hinweis auf Art. 33/34, Filter offen/abgeschlossen/alle, „Datenpanne erfassen …“ (Kurzbeschreibung, bekannt geworden am, Zeitraum, Beschreibung, Tätigkeiten, Daten, Zahl, besondere Kategorien, Risiko), Tabelle Bekannt seit, Vorfall, Meldung bis, Aufsichtsbehörde (Plakette „gemeldet …“, „nicht meldepflichtig“, „offen“ bzw. rot „überfällig“), Betroffene, Stand; Karten „Protokolle exportieren“ und „Notfall: alle Sitzungen beenden“ (Bestätigung mit Pflichtgrund). Seite der Datenpanne: Hinweis mit verbleibenden Stunden bzw. „abgelaufen“, alle Felder, Meldung an die Aufsichtsbehörde, Benachrichtigung der Personen, „Abschließen …“/„Wieder öffnen“, „Betroffene Personen“ mit „Betroffene ermitteln …“ (Audit-Log eines Zeitraums oder Benutzerkonto, Ergebnis mit Herkunft, „In die Datenpanne übernehmen“) und „Kontaktliste für die Benachrichtigung (Excel)“, Protokolle und Notfall zur Datenpanne, Verlauf.

**Demodaten:** `npm run seed` trägt die Stadtkasse als Empfänger für alle Tätigkeiten ein, ergänzt die Personalverwaltung um eine Beispiel-Rechtsgrundlage und legt eine erfundene, abgeschlossene Datenpanne an („[Beispiel] Ausdruck der Telefonliste im Schulungsraum liegen gelassen“, nicht meldepflichtig).

**Tests:** `apps/server/src/privacy-register.integration.ts` (Recht und Step-up, Entwurf aus aktiven Modulen mit Fristen, Empfänger aus Tokens, SMTP und OIDC, technische Maßnahmen einschließlich Datensicherung, Ergänzung mit Fassung, Prüfung und Historie, Übernahme von `privacy.recipients`, Empfänger nach Art. 19 und Widerspruch mit Tätigkeit, Export PDF und Excel; Datenpanne mit Aufgabe und E-Mail ohne Inhalt, Meldungen, Prüfungen der Felder, Betroffene aus Listenexport, Vollexport und Konto, Kontaktliste, Protokolle, Abschluss, Notfall mit Step-up).

## Sitzungen (L16)

**Abmeldung ohne Bedienung.** Jede Sitzung (`core.session`) merkt sich die letzte Bedienung (`lastActivityAt`, höchstens einmal je Minute geschrieben) und endet nach der Leerlaufzeit des Einstellungsabschnitts `security`:

| Feld | Bedeutung | Standard |
| --- | --- | --- |
| `idleMinutesPrivileged` | Konten mit Rechten unter Step-up oder `privileged` (Verwaltung, sensible Daten; `PermissionRegistry.isPrivilegedAccount`) und jede Impersonation | 60 Minuten (5–1440) |
| `idleMinutesOther` | alle anderen Konten | 480 Minuten (5–10 080) |
| `allowRemember` | „Angemeldet bleiben“ wird angeboten | an |

- Gezählt wird die Eingabe im Browser, nicht die Anfrage: Der API-Client im `web-sdk` schickt mit jeder Anfrage `x-forga-idle` (Sekunden seit der letzten Tastatur-, Maus- oder Touch-Eingabe). Der Server setzt die Aktivität auf „jetzt minus diese Zeit“; Seiten, die nur Daten nachladen (z. B. ein offener Einsatzbericht), halten eine Sitzung so nicht offen. Ohne Kopfzeile (Skripte mit Cookie) zählt die Anfrage.
- Eine abgelaufene Sitzung wird gelöscht, die Anfrage antwortet `401 auth.required`, die Shell zeigt die Anmeldung. Audit `auth.session-idle-ended` mit `idleMinutes` (Benutzer bzw. Administrator der Impersonation).
- Die Einstellungen stehen unter „Verwaltung → Einstellungen → Sicherheit → Sitzungen“ (Core); der Server liest sie nach einer Änderung neu.

**Angemeldet bleiben.** Die Anmeldeseite bietet den Haken an, solange `allowRemember` an ist (`GET /api/core/setup` liefert `rememberAllowed`). `POST /api/core/login` mit `remember: true` öffnet für Konten ohne privilegierte Rechte eine dauerhafte Sitzung (`persistent`): Cookie mit `Max-Age` 14 Tage, keine Leerlauf-Abmeldung; die Antwort nennt `persistent`. Für privilegierte Konten wird der Wunsch ignoriert. Ohne Haken (auch bei OIDC, Einrichtung und Impersonation) ist das Cookie ein Sitzungs-Cookie des Browsers, das mit dem Schließen des Browsers endet; die Sitzung selbst gilt höchstens 14 Tage. Bekommt ein Konto später privilegierte Rechte oder wird `allowRemember` abgeschaltet, gilt für bestehende dauerhafte Sitzungen wieder die Leerlaufzeit. `GET /api/core/session` liefert `current: { persistent, idleMinutes }`.

**Angemeldete Geräte** (Profil, Abschnitt „Angemeldete Geräte“):

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/core/me/sessions` | eigene Sitzungen ohne Impersonationen (`MySession`: öffentliche ID `ref`, Browser und System aus dem User-Agent, z. B. „Firefox 131 · Windows“, gekürzte Adresse `203.0.113.x` bzw. die ersten drei Gruppen einer IPv6-Adresse, angemeldet seit, letzte Aktivität, `persistent`, `current`) |
| `DELETE` | `/api/core/me/sessions/:id` | ein anderes Gerät abmelden (die eigene Sitzung: `400 auth.sessionCurrent`, fremde oder unbekannte: `404 auth.sessionNotFound`). Audit `auth.session-ended` |
| `POST` | `/api/core/me/sessions/end-others` | „Alle anderen abmelden“. Audit `auth.other-sessions-ended` mit Zahl |

Während einer Impersonation und mit API-Tokens sind die Endpunkte gesperrt (`auth.impersonationNotAllowed`, `auth.sessionRequired`). Browser und Adresse werden beim Öffnen der Sitzung gespeichert und mit ihr gelöscht; der Cookie-Wert bleibt nur als Hash gespeichert, nach außen geht nur `ref`. Das Infoterminal hat ein eigenes Gerätecookie und ist davon nicht betroffen.

## Verschlüsselung (L17)

- **Zugangsdaten in den Einstellungen:** Das SMTP-Passwort (`smtp.password`) und das Client-Secret des Anmeldedienstes (`oidc.clientSecret`) liegen mit `FORGA_SECRET_KEY` verschlüsselt (AES-256-GCM, Präfix `enc:`; `ENCRYPTED_SETTING_FIELDS` in `settings.ts`). `SettingsService.get` liefert sie entschlüsselt, Antworten und Historie enthalten sie nie. Beim Start verschlüsselt der Server im Klartext gespeicherte Werte (ohne Historie). Ohne `FORGA_SECRET_KEY` bleiben sie im Klartext; mit einem anderen Schlüssel sind sie nicht lesbar und müssen neu eingegeben werden. Die technischen Maßnahmen des Verzeichnisses melden beides als Warnung.
- **Sicherungen:** Das Modul Datensicherung verschlüsselt standardmäßig (unverschlüsselt nur mit Bestätigung), die Seite „Sicherheit“ und das Verzeichnis zeigen den Stand. `docker/backup.sh --encrypt` verschlüsselt jede Datei beim Schreiben mit `openssl` (siehe [Betrieb](betrieb.md#komplette-sicherung-mit-dockerbackupsh)).
- **Datenbank und Anhänge** bleiben unverschlüsselt in PostgreSQL (Entscheidung 5): Festplattenverschlüsselung des Servers gehört zum Betrieb ([Datenschutz im Betrieb](betrieb.md#datenschutz-im-betrieb)).
- **Datenbankrolle:** Die Anwendung verbindet sich in Compose als `forga_app` ohne Superuser-Rechte; eine Sicherung wird nur wiederhergestellt, wenn ihr Inhaltsverzeichnis nur Schemas, Tabellen, Daten, Sequenzen, Vorgabewerte, Constraints und Indizes enthält (siehe [Betrieb](betrieb.md#datenbankrolle-der-anwendung)).

## Gesperrte Benutzer ohne Person (L21)

- Benutzer haben `lockedAt` („gesperrt seit“): gesetzt beim Sperren (`PUT /api/core/users/:id` mit `active: false`, auch beim Anlegen als gesperrt), geleert beim Entsperren; beim Start bekommen gesperrte Konten ohne Datum das aktuelle. Die Benutzerliste zeigt „gesperrt seit …“ (`User.lockedAt`).
- Aufbewahrungskategorie `core.locked-accounts` „Gesperrte Benutzer ohne Person“ (Ereignis „Sperre“, Aktionen anonymisieren oder nichts, Standard **2 Jahre, anonymisieren**; in der Tätigkeit `core.accounts`): gesperrte, nicht technische Konten ohne verknüpfte Person, die noch nicht anonymisiert sind. Anonymisiert wird wie bei verknüpften Konten (`anonymizeAccounts`): Benutzername `anonymized-<id>`, Name „N. N.“, ohne E-Mail, Passwort und OIDC-Verknüpfung, Sitzungen, Links und eigene Historie gelöscht, Tokens widerrufen. Konten mit Person folgen der Frist der Person.

## Infoterminal als öffentlich zugängliches Gerät (L22)

- **Namenssuche** nur über Personen der Abteilungen des Terminals und der Abteilungen darunter (Jugendfeuerwehr, Altersabteilung); mit der Einstellung `info-terminal.general.searchAllPersons` („Namenssuche über alle Personen der Feuerwehr“) wie bisher über alle. Eingeschränkte Personen (Art. 18) erscheinen weder in den Namenskacheln noch in der Suche.
- **Einsatzort** nur als Straße ohne Hausnummer (`streetWithoutNumber`: „Hauptstr. 12a“ → „Hauptstr.“), auch in den passenden Einsätzen bei „Neuer Einsatz“.
- **Notfall:** „Alle Sitzungen beenden“ einer Datenpanne gibt jedem nicht widerrufenen Terminal einen unbekannten Schlüssel und löscht den gespeicherten Link; die Geräte arbeiten erst mit einem neuen Link weiter. Audit `info-terminal.keys-blocked` mit Zahl.
- Die Verwaltung der Terminals weist darauf hin, das Gerät nicht in öffentlich zugänglichen Räumen aufzustellen.
- Begrenzungen (falsche Schlüssel, Änderungen, Suchen, unbekannte Führerschein-Aufkleber) zählt die Datenbank (L24).

## API-Tokens (L23)

- `ApiTokenInput` verlangt **Empfänger/System** (`recipient`), **Zweck** (`purpose`) und ein **Ablaufdatum** (`expiresOn`, frühestens heute, höchstens 2 Jahre: `tokens.expiryInPast`, `tokens.expiryTooLate` mit `days`). Optional **erlaubte Adressen** (`allowedAddresses`, IPv4/IPv6 oder Netz mit Präfix, höchstens 20; `tokens.addressInvalid`): Anfragen von anderen Adressen gelten als nicht angemeldet (`401`), Audit `tokens.address-rejected` höchstens einmal je Token und Stunde. Hinter einem Reverse Proxy zählt die Adresse nur mit `FORGA_TRUST_PROXY`.
- **Verzeichnis und Auskunft** nennen Tokens als „Schnittstelle „Name“ – Empfänger“ mit dem Zweck (`tokenRecipientName`).
- **Erinnerung:** Aufgabe `api-token-expiry` „API-Token „…“ läuft ab“ für alle mit `core.tokens.manage`, 30 Tage vor dem Ablauf (`API_TOKEN_REMINDER_DAYS`); Tokens aus der Zeit vor dem Pflichtablauf erscheinen sofort als „ohne Ablauf – neu mit Ablaufdatum ausstellen“.
- Die Token-Seite warnt bei Bereichen mit Personendaten (`masterdata.persons.*`) und zeigt Empfänger, Zweck, Ablauf („läuft bald ab“, „ohne Ablauf“) und erlaubte Adressen.

## Passwörter und Anfragebegrenzung (L24)

- **Passwortregeln** (`assertPasswordAllowed`, bei Einrichtung, Passwortwechsel, Zurücksetzen und Anlegen bzw. Ändern durch die Verwaltung): mindestens 10 Zeichen wie bisher; abgelehnt werden Passwörter aus einer mitgelieferten Liste häufiger Passwörter, häufige Wörter mit angehängten Ziffern oder Zeichen (z. B. „Feuerwehr112!“, „Sommer2026“) und triviale Folgen (`auth.passwordCommon`) sowie Benutzername, Name oder E-Mail-Adresse mit Ziffern (`auth.passwordPersonal`). Die Oberfläche empfiehlt einen Passwortmanager.
- **Anfragebegrenzung in der Datenbank** (`RateLimits`, Tabelle `core.rate_limit`, nicht historisiert): Zähler je Bereich und Schlüssel, gespeichert nur als SHA-256 von Bereich und Schlüssel (Benutzername, Adresse), mit Fenster und Sperre. Ein Neustart oder eine zweite Server-Instanz setzt nichts zurück. Die Regel `core.rate-limits` des Aufbewahrungslaufs löscht Zähler einen Tag nach der letzten Nutzung. Bereiche: `login` (5 Fehlversuche je Benutzername und Adresse in 15 Minuten, dann 1 Minute gesperrt), `password-reset.address` (20 in 15 Minuten), `password-reset.account` (3 in 15 Minuten), `tokens.address-logged`, `info-terminal.key`, `info-terminal.write`, `info-terminal.search`, `info-terminal.license-code` und deren Protokoll-Zähler. Module nutzen `RateLimits.hit`, `blocked` und `reset`.
- **Anmeldung ohne Benutzer-Enumeration:** Für unbekannte Benutzernamen prüft der Server gegen einen Dummy-Hash, die Antwort dauert so lange wie bei einem falschen Passwort.
- **Login-CSRF:** Ändernde Anfragen ohne API-Token brauchen `x-forga: 1` auch ohne Sitzung (Anmeldung, Einrichtung, Passwort vergessen, E-Mail bestätigen), sonst `403 auth.csrf`.

## Auftragsverarbeiter und Betrieb (L25)

Das Verzeichnis listet unter „Technische Empfänger und Auftragsverarbeiter“ aus der Konfiguration (`ProcessorRegistry`; Module melden eigene an, Quellen inaktiver Module fallen weg): den **Server von f.orga** mit der Adresse von f.orga (Hosting, Betrieb und Fernwartung), den **E-Mail-Server**, den **Anmeldedienst** (OIDC) und das **Sicherungsziel** des Moduls Datensicherung (Ordner, verschlüsselt ja/nein), sobald dessen Einstellungen gespeichert sind. Die Betriebsanleitung hat den Abschnitt [Datenschutz im Betrieb](betrieb.md#datenschutz-im-betrieb).

## Hinweis auf die Folgenabschätzung (L26)

- Tätigkeiten mit Gesundheitsdaten (`health`) tragen im Verzeichnis (Seite, PDF) den Hinweis „Prüfen, ob eine Datenschutz-Folgenabschätzung nötig ist (Art. 35 DSGVO)“.
- `GET /api/privacy/register/export/pdf?scope=dpia` (bzw. `xlsx`) liefert „Angaben für eine Datenschutz-Folgenabschätzung nach Art. 35 DSGVO“: nur die Tätigkeiten mit Gesundheitsdaten mit Zweck, Daten, Empfängern, Fristen, dazu technische Empfänger und technische Maßnahmen. Audit `privacy.register-exported` mit `scope: dpia`. Ob eine Folgenabschätzung nötig ist, entscheidet der Verantwortliche.

## Anhänge (L27)

- Beim Hochladen entfernt der Server aus Fotos die Metadaten (`stripImageMetadata`): JPEG ohne EXIF (Standort, Kamera, Zeit), XMP, IPTC und Kommentare; die Ausrichtung bleibt als minimales EXIF, Farbprofil (APP2), JFIF und Adobe-Marker bleiben. PNG ohne `eXIf`, `tEXt`, `iTXt`, `zTXt`, `tIME`; WebP ohne `EXIF` und `XMP ` (Kennzeichen im `VP8X` gelöscht). PDFs bleiben unverändert. Audit `attachments.added` mit `metadataRemoved`.
- Höchstens 50 Anhänge je Datensatz (`ATTACHMENT_MAX_PER_RECORD`, `400 attachments.tooMany`), 10 MB je Datei wie bisher.
- Die Oberfläche nennt das Entfernen der Metadaten; Einsatzberichte weisen zusätzlich darauf hin, nur nötige Fotos ohne Gesichter, Kennzeichen oder Verletzte hochzuladen.
- Anhänge folgen weiter der Frist ihres Datensatzes ([Aufbewahrung](aufbewahrung.md)).

## MP-Feuer-Übernahme (L28)

- Die Zeilen mit Meldungen und die Beispielzeilen des Berichts (sie nennen Personen aus MP-Feuer) entfernt der Aufbewahrungslauf 90 Tage nach dem Ende eines Laufs (Regel `mp-feuer.messages`, `MESSAGES_KEEP_DAYS`); Lauf und Zähler bleiben, `RunReport.messagesRemovedAt` nennt den Zeitpunkt.
- „Umstellung abgeschlossen“ in den Einstellungen des Moduls: `POST /api/mp-feuer/runs/remove-messages` (`mp-feuer.transfer`) entfernt sie sofort für alle beendeten Läufe. Audit `mp-feuer.messages-removed` mit Zahl.
- Nur aktivierte Felder der Personalakte werden übernommen: Der Personenimport, über den die Datenübernahme läuft, lässt abgeschaltete Felder (`masterdata.personFields`, L10) weg, z. B. Geschlecht oder Telefon privat.
- Die 90-Tage-Regel gilt neben der Aufbewahrungskategorie `mp-feuer.run-reports` (L29), die ganze Läufe mit ihren Berichten nach einem Jahr löscht.
- Nach einer Übernahme mit neuen Personen weist das Ergebnis darauf hin, die Mitglieder nach Art. 14 zu informieren (Link auf „Verwaltung → Datenschutz → Information“, `/privacy/information`, bei aktivem Modul Datenschutz).
- Hochgeladene Transferdateien werden wie bisher nur im Speicher gelesen, die Datenbank daraus in einem temporären Ordner geöffnet und gelöscht; gelesene Zeilen gehen nach der Übernahme bzw. nach 7 Tagen.

## Weitere Härtung (Prüfung)

- `GET /api/core/roles` nur mit `core.roles.manage` oder `core.users.manage` (Rollen mit ihren Rechten zeigen, wer was darf).
- `GET /api/cost-recovery/incidents/:id/offense` nur für Leser eines Berichts des Einsatzes oder mit `cost-recovery.read`, `cost-recovery.write`, `incidents.costs`; sonst `404 cost-recovery.unknownIncident`.
- Kalender-Abo der Dienste: Tokens werden in konstanter Zeit verglichen; jede Abteilung hat eine eigene Adresse mit eigenem, aus dem Feed-Token abgeleitetem Token (HMAC), das nur ihre Dienste liefert. `GET /api/training/feed-links` liefert die Adressen für die Verwalter der Einstellungen.
- `GET /api/mp-feuer/runs/<keine UUID>` antwortet `404 mp-feuer.runNotFound` statt `500`.

## Tests (Phase 5)

`apps/server/src/hardening.integration.ts`: Login-CSRF, Anmeldesperre in der Datenbank ohne Klartext, Passwortregeln, Rollen nur für Verwalter; Geräte mit Browser und Adresse, einzeln und „alle anderen“ abmelden, Leerlauf-Abmeldung privilegiert und normal mit `x-forga-idle`, „Angemeldet bleiben“ und Einstellungen; verschlüsselte Zugangsdaten und Verschlüsselung beim Start; API-Tokens mit Pflichtfeldern, Ablauf, Adressen, Verzeichnis und Aufgabe; Auftragsverarbeiter und Export für die Folgenabschätzung; gesperrte Konten nach Frist anonymisiert; Metadaten von Fotos und Höchstzahl der Anhänge; Kalender-Abo je Abteilung; Tatbestand des Kostenersatzes; Lauf-IDs und Meldungen von MP-Feuer. `apps/server/src/mp-feuer.integration.ts`: nur aktivierte Felder werden übernommen. `apps/server/src/info-terminal.integration.ts`: Namenssuche je Abteilung, Straße ohne Hausnummer, Sperre der Geräteschlüssel im Notfall. Unit-Tests: `image-metadata.spec.ts`, `password-policy.spec.ts` (Passwörter, Adressen, Geräte), `database.spec.ts` (Inhaltsverzeichnis der Sicherung).
