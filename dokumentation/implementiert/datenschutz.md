# Datenschutz (umgesetzter Stand)

Was vom [Datenschutzkonzept](../geplant/datenschutz.md) im Code existiert: Phase 1 (L1, L2, L5 teilweise, L6, L18 teilweise), aus Phase 2 Datenschutzhinweis und Information (L4), Betroffenenanfragen mit Frist und Einschränkung der Verarbeitung (L7 ohne Löschprüfung) sowie Widerspruch (L19) und die Auskunft als PDF (L3), aus Phase 3 Einwilligungen (L9), Berichtigung (L12) sowie Leseprotokoll und Transparenz der Impersonation (L15). Offene Punkte stehen dort. Weitere umgesetzte Bausteine: Rechte je Abteilung, sensible Felder, Historie und Audit-Log ([Architektur](architektur.md#sicherheit)), Auskunft als JSON und Aufbewahrungsplan ([Aufbewahrung](aufbewahrung.md)).

## Zweiter Faktor bei sensiblen Daten (Step-up)

Die Anmeldung bleibt wie bisher (Passwort oder Konto der Gemeinde über OIDC). Einen zweiten Faktor fragt f.orga erst ab, wenn jemand sensible Daten oder die Verwaltung öffnet; danach gilt die Bestätigung **30 Minuten für diese Sitzung**. Wer nie sensible Daten öffnet (die meisten Mitglieder, Mein Bereich), braucht keinen zweiten Faktor. Die 30 Minuten sind fest (`STEP_UP_MINUTES`), es gibt keine Einstellung dafür.

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
| Datenschutz: Anfragen, Einschränkung, Information, Einstellungen „Datenschutz“, Reiter „Datenschutz“ der Personalakte | `core.privacy.manage` | ganze Seite bzw. Reiter („Datenschutz anzeigen …“); die Aufgaben zu Anfragen erscheinen schon vorher (sie nennen keine Namen) |
| „verletzt“/„getötet“ im Personal eines Berichts | `incidents.injuries.read` (Verfasser und Freigeber sehen sie immer, ohne Step-up) | Zahl ohne Namen (`injuries.hidden`, dazu `stepUpAvailable`); Knopf „Verletzte anzeigen …“ |

Keinen Step-up brauchen Einstellungen der Module (`<modul>.settings.manage`), die Personalakte ohne sensible Felder, Einsatzberichte ohne Verletzte, Listen ohne sensible Daten, Mein Bereich (eigene Daten einschließlich eigener Untersuchungen und Bankverbindung) und das Infoterminal. Die Einrichtungsliste der Startseite (`GET /api/core/onboarding`) genügt das gehaltene Recht, weil sie nur meldet, was noch fehlt. Die wöchentliche Fristen-E-Mail rechnet wie bisher mit allen Rechten des Empfängers.

### Durchsetzung auf dem Server

- **Sitzung:** `core.session.elevated_until`. `POST /api/core/step-up` (`{ code }` oder `{ recoveryCode }`, Sitzung mit CSRF-Header) setzt es auf jetzt + 30 Minuten; Aktivität verlängert nichts. `POST /api/core/step-up/end` beendet die Bestätigung vorzeitig, ebenso Abmelden, Passwortwechsel (die eigene Sitzung bleibt, aber unbestätigt), Zurücksetzen des Passworts, Zurücksetzen des Faktors und Ende der Sitzung. `GET /api/core/step-up` antwortet `204` in einer bestätigten Sitzung, sonst `403` `auth.stepUpRequired` (die Oberfläche fragt damit vor Downloads nach).
- `GET /api/core/session` liefert zusätzlich `elevatedUntil`, `stepUpPermissions` (gehaltene Rechte mit `stepUp`) und `mfa: { enrolled, available, passwordRequired, recoveryCodesLeft, viaProvider }`. `permissions` enthält die gehaltenen Rechte einschließlich der wartenden, damit Navigation und Seiten erscheinen.
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
- **Profil:** Abschnitt „Zwei-Faktor“ mit Stand, Bereichen mit und ohne Code, „Einrichten …“ und „Wiederherstellungscodes neu erzeugen …“ (Herunterladen als Textdatei).
- **Rollen:** Berechtigungen mit `stepUp` tragen die Plakette „zweiter Faktor“. **Benutzer:** Spalte „Zweiter Faktor“ (`eingerichtet`, `nötig, nicht eingerichtet`, `nicht nötig`; `mfaEnrolled`, `mfaNeeded`) und „Zweiten Faktor zurücksetzen …“ mit Pflichtgrund. **API-Tokens:** Rechte mit `stepUp` werden nicht angeboten.
- **Einstellungen → Anmeldung mit dem Konto der Gemeinde:** Schalter „Zweiten Faktor auch beim Anbieter bestätigen“.

### Demodaten und Tests

- `npm run seed` richtet beim ersten Lauf den zweiten Faktor des Administrators ein, gibt das Geheimnis einmal aus und legt es in `tmp/seed-totp.json` ab (nicht versioniert); spätere Läufe lesen es dort oder aus `FORGA_ADMIN_TOTP_SECRET` und bestätigen ihre Sitzung selbst. Der Server braucht dafür `FORGA_SECRET_KEY` (in der Entwicklung aus `apps/server/.env`). Demobenutzer mit sensiblen Rechten richten ihren Faktor beim ersten Step-up im Browser mit einer Authenticator-App ein; ein verlorener Faktor wird in der Benutzerverwaltung zurückgesetzt. Die E2E-Tests bestätigen die Sitzung über die API und richten fehlende Faktoren dabei selbst ein (Geheimnisse ebenfalls in `tmp/seed-totp.json`).
- In den Integrationstests gilt eine Sitzung aus `login()`/`setUp()` als bestätigt (Abkürzung über die Datenbank); `login(…, { elevated: false })` liefert eine Sitzung wie nach einer echten Anmeldung (`apps/server/src/step-up.integration.ts`).

## Auskunft nach Art. 15 als PDF (L3)

Eine lesbare Auskunft über alle Daten einer Person als PDF: Anschreiben mit den Angaben nach Art. 15 Abs. 1, danach je Bereich die Daten, am Ende die Änderungen an den Daten. Mockups `datenschutz/person.html` (Dialog `#d-auskunft`), `auskunft-vorschau.html`, `mein-bereich.html`.

### Recht

Erstellen, Ansehen, Herunterladen und Übergeben verlangen `core.privacy.manage` (`ACCESS_REPORT_PERMISSION` = `PRIVACY_PERMISSION`, mit `stepUp`). Das Herunterladen in „Mein Bereich“ braucht kein Recht und keinen zweiten Faktor. Die JSON-Auskunft `GET /api/core/export/person/:personId` bleibt beim Vollexport (`core.data.export`).

### Beiträge der Module (`describePerson`)

`ExportSource` hat neben `person(id)` (JSON) die lesbare Methode `describePerson(personId, ctx)`; sie liefert `PersonDataSection[]` (`core-api`, `access-report/person-description.ts`):

- `key`, `title`, `activity` (Verarbeitungstätigkeit aus dem Manifest), `categories` (Datenkategorien als Text), `health` (Gesundheitsdaten, im PDF gekennzeichnet), `blocks`: `fields` (Beschriftung/Wert), `table` (Spalten, Zeilen, `summary` z. B. Summen je Jahr), `text`.
- `records`: eigene Datensätze der Person (Historienname, IDs, lesbarer Name); ihre Änderungen und die ihrer untergeordneten Einträge erscheinen im Protokoll, ihr erster Eintrag ergibt die Herkunft. Gemeinsame Datensätze (Einsatz, Dienst, Beförderungsliste) gehören nicht dazu, sonst kämen Änderungen an Daten anderer ins Protokoll. `labels` benennt untergeordnete Einträge („Mitgliedschaft“).
- `DescribeContext` (`ctx`): Sprache, Stichtag, `text`/`t`, `date` (`21.10.2026` bzw. `21 Oct 2026`, Zeiten in Europe/Berlin), `dateTime`, `time`, `money`, `number`, `yesNo`, `value` („–“ für leer), `iban` („IBAN endet auf 4711“), `actor(userId)` und `person(personId)`: die Person selbst mit Namen bzw. „Sie selbst“, andere Benutzer nur mit ihrer Funktion (Namen ihrer Rollen), technische Benutzer als „Schnittstelle „Name““, Personen ohne Konto als „andere Person“, ohne Benutzer „automatisch (System)“.
- Regeln: Klartext, keine IDs, keine Feldnamen aus dem Code, andere Personen nie mit Namen, große Mengen als Tabelle mit Summen je Jahr, interne Bemerkungen gehören dazu.

**Manifest:** `privacy: { personData, activities }`. `personData: true` heißt, das Modul speichert Daten über Personen; dann muss es `describePerson` oder `anonymize` (`PersonDataRegistry`) anbieten, sonst bricht der Server beim Start ab (`assertPersonDataComplete`), wie bei der Historie. Tätigkeiten (`ProcessingActivity`: `key` mit der Modul-ID als Präfix, `name`, `purpose`, `recipients`, `retention` mit Kategorien des Aufbewahrungsplans) liefern Zweck, Empfänger und Speicherdauer je Abschnitt; die Tätigkeit des Core ist `core.accounts` (`CORE_ACTIVITIES`).

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
| Einwilligungen (`core.consents`, Tätigkeit `core.accounts`) | Einwilligung, Fassung, erteilt mit Weg, erfasst von (Funktion), Stand mit Widerruf bzw. neuer Fassung; nur wenn es Einwilligungen gibt |
| Zugriffe auf besonders geschützte Daten (`core.access-log`, Tätigkeit `core.accounts`) | aus dem Leseprotokoll: Tag, Funktion des Lesers, Bereich, Zahl der Zugriffe |
| Änderungen an Ihren Daten (`core.protocol`) | Historie der `records` aller Bereiche: Zeitpunkt, Bereich, Änderung („Mitgliedschaft angelegt“), durch (Funktion bzw. „Sie selbst“) |

Kein Abschnitt: **Kostenersatz** (speichert keine Daten über Mitglieder; Bescheide nennen nur den Anzeigenamen des ausstellenden Benutzers als Text), **Infoterminal** (Eintragungen stehen als Anwesenheit im Dienst bzw. im Personal des Berichts; das Modul selbst speichert nur Geräte), **Datensicherung** (Kopien der ganzen Datenbank mit eigener Aufbewahrung; Sicherung und Wiederherstellung stehen im Audit-Log des Kontos).

### Inhalt des PDF

`access-report.pdf.ts`, Rahmen wie die anderen Briefe (`renderLetterPdf` mit Wappen, Fußzeile mit Anschrift, Seite x/y, Erstellungszeit), A4, Helvetica, Kopfzeile jeder Seite „Auskunft nach Art. 15 DSGVO · Name · Stand“. Ein hinterlegter Briefkopf wird hier nicht verwendet, weil er die Kopfzeile ersetzen würde.

- **Anschreiben:** Anschrift der Person (`OrganizationProvider.postalAddress` der Stammdaten), Ort und Datum, Betreff, bei einer Anfrage „Ihre Anfrage vom …“, Anrede, Einleitung, „Angaben nach Art. 15 Abs. 1 DSGVO“: Verantwortlicher, Datenschutzbeauftragter, Zwecke (a, aus den Tätigkeiten der Bereiche mit Daten), Kategorien (b, Gesundheitsdaten gekennzeichnet), Empfänger (c, aus den Tätigkeiten und den gültigen API-Tokens als „Schnittstelle „Name““), Speicherdauer (d, Verweis auf die Bereiche), Rechte (e), Beschwerderecht (f), Herkunft (g), automatisierte Entscheidung (h), Drittländer (Abs. 2).
- **Kontakte und Textbausteine** (`AccessReportTexts`) aus den Einstellungen „Datenschutz“: Verantwortlicher (mit „vertreten durch“), DSB und Aufsichtsbehörde aus `privacy.contacts` (fehlende als „[in den Einstellungen Datenschutz eintragen]“), Einleitung `accessReportIntro` (Platzhalter `{brigade}`, `{name}`, `{receivedOn}` = Eingang der Anfrage bzw. Tag der Auskunft), Rechte `rights`, automatisierte Entscheidung `automatedDecisions`, Drittland `thirdCountry` aus `privacy.texts` in der Sprache der Auskunft. Solange einer dieser Bausteine nicht als geprüft markiert ist, trägt das Anschreiben den Hinweis „Vorlage: Die Textbausteine dieses Schreibens sind noch nicht vom Datenschutzbeauftragten geprüft.“
- **Je Bereich** eine nummerierte Überschrift (Reihenfolge: Module in Ladereihenfolge, Benutzerkonto und Protokoll am Ende), Plakette „Gesundheitsdaten“, Zeile mit Zweck, Speicherdauer (Regeln aus `privacy.retention` je Kategorie der Tätigkeit, z. B. „Personalakte Ausgeschiedener: 30 Jahre nach Austritt“, sonst „bis zur Festlegung einer Frist“), Empfängern und Herkunft.
- **Herkunft** je Bereich aus dem ersten Historieneintrag der `records`: „Ihre Angaben in Mein Bereich“ (eigenes Konto), „Schnittstelle „Name““ (technischer Benutzer, ohne Token mit seinem Anzeigenamen, z. B. ein Infoterminal), „automatisch (z. B. Infoterminal)“ (ohne Benutzer), „Tabellen-Import am …“ bzw. „Datenübernahme aus MP-Feuer am …“ (Audit `imports.applied`, mit `source.module: mp-feuer` als Datenübernahme, bzw. `mp-feuer.run-applied` desselben Benutzers bis 30 Minuten danach), sonst „Erfassung durch die Feuerwehr“.
- **Anhang:** auf Wunsch das JSON (`forga.person`, wie `GET /api/core/export/person/:personId`) als eingebettete Datei `auskunft.json`; die letzte Seite sagt, ob es beigefügt ist.

### Ablage, Übergabe und Ablauf

- **Erstellen** (`POST /api/core/privacy/access-reports`): legt `core.privacy_document` (`PrivacyDocument`) mit `status: pending` an, antwortet `202` und erzeugt das PDF im Hintergrund; danach `ready` bzw. `failed` mit `privacy.generationFailed`. Beim Start des Servers werden noch wartende als `failed` (`privacy.generationInterrupted`) markiert. Audit `privacy.access-report-created` (Person, Dokument, Sprache, JSON).
- **Verschlüsselt:** Das PDF liegt mit `FORGA_SECRET_KEY` verschlüsselt in der Datenbank (AES-256-GCM, `encryptBytes`/`decryptBytes` in `server-key.ts`). Ohne Schlüssel lehnt der Server das Erstellen ab (`503 privacy.noSecretKey`), es gibt keine unverschlüsselte Ablage. Lässt sich die Datei nicht entschlüsseln (Schlüssel gewechselt), `409 privacy.documentUnreadable`.
- **Ablauf:** 30 Tage (`ACCESS_REPORT_DAYS`). Ein stündlicher Lauf (`purgeExpired`, aus mit `FORGA_PRIVACY_SCHEDULER=off`) löscht die Datei; die Zeile bleibt mit Erstellung und Übergabe („gelöscht nach 30 Tagen“). Abgelaufene Auskünfte antworten `410 privacy.documentExpired`.
- **Herunterladen** (`…/:id/file`, `?inline=1` zum Ansehen im Browser): Dateiname ohne Namen der Person (`auskunft-2026-10-29.pdf`), `Cache-Control: no-store`. Audit `privacy.access-report-downloaded` mit `by: administration` bzw. `person`.
- **Übergabe vermerken** (`…/:id/hand-over`): Tag und Weg (`self-service` in Mein Bereich bereitgestellt, `in-person` persönlich, `post` per Post). „In Mein Bereich“ verlangt ein aktives Konto der Person (`400 privacy.noAccount`) und schickt ihr eine E-Mail, die nur sagt, dass die Auskunft in f.orga bereitliegt (mit Link auf `/me`, ohne Inhalt); kein Versand als Anhang. Audit `privacy.access-report-handed-over`.
- **Bezug zur Anfrage:** `requestId` beim Erstellen (nur eine Anfrage auf Auskunft derselben Person, sonst `400 privacy.requestMismatch`); die Anfrage bekommt `accessReportDocumentId` (`PrivacyRequests.attachAccessReport`). „Anfrage damit erledigt“ beim Vermerken der Übergabe (`closeRequest`) setzt die Anfrage auf erledigt mit dem Tag der Übergabe (Audit `privacy.request-closed`).
- **Nicht historisiert:** Die Entität kommt in keinem Export vor; Erstellung, Herunterladen und Übergabe stehen im Audit-Log, eine Historie würde die Löschung der Datei überdauern.

### Oberfläche

- **Personalakte:** Knopf „Auskunft erstellen …“ in der Kopfzeile (Erweiterungspunkt `masterdata.person.actions`, von der Shell belegt; ersetzt den früheren Knopf für die JSON-Auskunft). Dialog: „Zur Anfrage“ (offene Anfragen auf Auskunft der Person, die älteste vorgewählt, oder „ohne Anfrage“), Sprache (Deutsch/Englisch), Tabelle der Bereiche mit Zahl der Einträge und Plakette Gesundheitsdaten (`…/preview`), „Maschinenlesbare Fassung (JSON) als Anhang beifügen“, Hinweis auf Rechte Dritter und „kein Versand per E-Mail“.
- **Reiter „Datenschutz“** der Personalakte: Abschnitt „Erstellte Auskünfte“ (mit „Auskunft erstellen …“) mit erstellt am/von, Sprache, Übergabe bzw. Stand („wird erstellt …“, „noch nicht übergeben“, „persönlich 28.10.2026“, „gelöscht nach 30 Tagen“), „Ansehen“, „Herunterladen“ (beide nach dem zweiten Faktor) und „Übergabe vermerken …“ (Tag, Weg, „Anfrage damit erledigt“; „in Mein Bereich bereitgestellt“ benachrichtigt die Person). Dieselbe Liste, auf die Anfrage beschränkt, steht auf der Seite der Anfrage. Die Liste fragt nach, solange eine Auskunft entsteht. Eine eigene Vorschauseite (`auskunft-vorschau.html`) gibt es nicht: „Ansehen“ öffnet das PDF im Browser, weil `frame-ancestors 'none'` das Einbetten verbietet.
- **Mein Bereich:** Abschnitt „Meine Daten“ mit „Ihre Auskunft liegt bereit (erstellt …, bis …)“ und „PDF herunterladen“, solange eine bereitgestellte Auskunft nicht abgelaufen ist; während eine Auskunft entsteht „Ihre Auskunft wird erstellt …“.

### Selbstauskunft in Mein Bereich

Einstellung `privacy.selfServiceAccess.mode`:
- `request` (Standard): „Auskunft anfordern …“ legt eine Anfrage an; die Verwaltung erstellt die Auskunft und stellt sie in Mein Bereich bereit.
- `instant`: „Auskunft jetzt erstellen …“ (`POST /api/core/privacy/me/requests`) legt eine Anfrage auf Auskunft mit Weg „Mein Bereich“ an und erstellt sofort die Auskunft (Sprache aus dem Dialog, ohne JSON), bereits als „in Mein Bereich bereitgestellt“; ist sie fertig, wird die Anfrage erledigt. Höchstens eine je Tag und Person (`409 privacy.accessReportToday`, gezählt werden nicht fehlgeschlagene Auskünfte des eigenen Kontos der letzten 24 Stunden). Nicht während einer Impersonation. Die Verwaltung sieht Anfrage und Auskunft wie sonst.

### Tests

`apps/server/src/access-report.integration.ts` mit Daten je Modul aus `apps/server/src/testing/access-report/*.ts`: Eine erfundene Person mit Daten in allen Modulen bekommt eine Auskunft; jeder Bereich kommt vor, keine UUID im Text, der Name einer zweiten Person und die vom Seed verbotenen Texte (Straße des Einsatzes, Geschädigte) fehlen, Gesundheitsdaten sind gekennzeichnet, eigene Änderungen heißen „Sie selbst“, die anderer die Funktion; dazu Erstellen im Hintergrund, verschlüsselte Ablage, Download, Übergabe in Mein Bereich mit E-Mail ohne Inhalt, Ablauf nach 30 Tagen, fehlender Schlüssel und Audit. `ACCESS_REPORT_MODULES=incidents,training` beschränkt den Test auf einzelne Module, `ACCESS_REPORT_PDF=<Datei>` schreibt das erzeugte PDF zum Ansehen. Dazu Bezug zur Anfrage mit „Anfrage damit erledigt“, Anschreiben aus Kontakten und Textbausteinen, Selbstauskunft `instant` mit Grenze je Tag. Unit-Tests: Startprüfung, Formate des Kontexts, Verschlüsselung (`access-report.spec.ts`).

## Einwilligungen (L9)

Wo eine Verarbeitung nicht zur Aufgabe der Feuerwehr gehört, braucht sie eine freiwillige, nachweisbare und jederzeit widerrufbare Einwilligung (Art. 6 Abs. 1 a, Art. 7, Art. 8 DSGVO). Mockups `datenschutz/einstellungen.html` (Katalog), `person.html` (Einwilligungen der Person), `mein-bereich.html`, `erste-anmeldung.html`.

### Katalog

Einstellungsabschnitt `privacy.consents` (`PrivacyConsents`, je Eintrag `ConsentDefinition`; Verwalter `core.privacy.manage`, nur über die eigenen Endpunkte, `PUT /api/core/settings/privacy.consents` antwortet `400 settings.dedicatedEndpoint`; historisiert wie alle Einstellungen):

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
- Endpunkte (`core.privacy.manage`): `GET /api/core/privacy/consents` (`ConsentCatalog` mit Zahl der Personen mit gültiger Einwilligung je Eintrag und den Wirkungen), `POST …/consents/templates`, `PUT …/consents/:key` (`ConsentDefinitionInput` mit `version` des gespeicherten Eintrags; veraltet `409 conflict.stale`), `POST …/consents/:key/review` (`{ version }`), `DELETE …/consents/:key`. Audit `privacy.consent-templates-inserted`, `privacy.consent-definition-changed`, `privacy.consent-definition-reviewed`, `privacy.consent-definition-removed`.
- Oberfläche: Reiter „Einwilligungen“ unter „Verwaltung → Datenschutz → Einstellungen“ (`?tab=consents`): Warnung bei Vorlagen, Tabelle mit Wirkung, Erteilt durch, Fassung, Zahl der Personen und Stand (Vorlage/geprüft, inaktiv), „Vorlagen einfügen“, „Einwilligung anlegen“, darunter der gewählte Eintrag mit beiden Sprachen, Wirkung, aktiv, „Als geprüft markieren …“ und „Entfernen“. Abweichung vom Mockup: die Spalte „Erteilt“ nennt die Zahl der Personen ohne „von 118“, weil der Core die Zahl der Mitglieder nicht kennt.

### Einwilligung an der Person

Tabelle `core.consent` (`ConsentEntity`, historisiert; die Historie ist der Nachweis): Person, Schlüssel, Fassung (`definition_version`) mit Titel und Text dieser Fassung, erteilt am, Weg (`ConsentWay`: `written` schriftlich, `in-person` persönlich, `guardians` durch Erziehungsberechtigte, `my-area` Mein Bereich, `first-login` erste Anmeldung), erfasst von, widerrufen am, Weg des Widerrufs (`ConsentWithdrawalWay`: `written`, `email`, `in-person`, `my-area`, `request` über eine Anfrage), widerrufen von, Anfrage, `superseded_on` (die Person hat einer neueren Fassung zugestimmt). Einwilligungen werden **nie gelöscht**, nur widerrufen bzw. durch eine neue Fassung abgelöst; gültig ist eine Einwilligung ohne Widerruf und ohne Ablösung. Der Nachweis (Scan der Unterschrift) ist ein Anhang (`core.consent`).

- **Recht** `core.privacy.consents` („Einwilligungen von Personen erfassen und widerrufen“, Abteilung, ohne Step-up; Rollenvorlagen `commander`, `department-commander`) für Personen der Abteilung; `core.privacy.manage` für alle. Ohne Recht `403 auth.forbidden` (mit wartendem `core.privacy.manage` `auth.stepUpRequired`).
- `GET /api/core/privacy/persons/:personId/consents` (`PersonConsents`: Einwilligungen mit Nachweisen, erfassbare Einträge, `minor`), `POST …/persons/:personId/consents` (`ConsentRecordInput`: Eintrag, erteilt am, Weg `written`/`in-person`/`guardians`; nicht in der Zukunft `privacy.consentInFuture`; dieselbe Fassung schon erteilt `409 privacy.consentGiven`; Minderjährige bei „Person oder Erziehungsberechtigte“ nur mit Weg `guardians`, sonst `400 privacy.consentGuardiansRequired`), `POST /api/core/privacy/given-consents/:id/withdraw` (`ConsentWithdrawalInput`: Tag, Weg, optional `requestId`; schon widerrufen `409 privacy.consentWithdrawn`, vor der Einwilligung `privacy.withdrawnBeforeGiven`). Audit `privacy.consent-given` und `privacy.consent-withdrawn` (Person, Schlüssel, Fassung, Weg).
- **Minderjährig** (unter 18 am heutigen Tag) bestimmt die Stammdaten über `OrganizationProvider.minors`.
- **Widerruf über eine Anfrage:** Hat die Anfrage die Art „Widerruf einer Einwilligung“, zeigt ihre Seite die gültigen Einwilligungen der Person mit „Widerruf erfassen …“. Der Widerruf mit `requestId` (nur `core.privacy.manage`, nur eine offene Anfrage dieser Art derselben Person, sonst `400 privacy.requestMismatch`) setzt den Weg `request` und erledigt die Anfrage mit dem Tag des Widerrufs.
- Oberfläche: Abschnitt „Einwilligungen“ im Reiter „Datenschutz“ der Personalakte (zwischen Anfragen und Auskünften) mit Fassung, Weg, erfasst von, Nachweisen, Stand (erteilt, widerrufen, neue Fassung erteilt), „Einwilligung erfassen …“ (Einwilligung mit Fassung, erteilt am, Weg, Nachweis) und „Widerruf erfassen …“. Der Reiter erscheint auch mit `core.privacy.consents` allein (`anyPermission` am Erweiterungspunkt); dann zeigt er nur die Einwilligungen.

### Wirkung

Module fragen den Core über den Vertrag `CONSENTS` (`ConsentLookup` aus `@forga/core-contracts`, vom Core als `ConsentService` bereitgestellt): `has(personId, key)` und `withEffect(effect, personIds)`. Es zählt jede gültige Einwilligung eines Eintrags mit der Wirkung, auch einer älteren Fassung oder eines inaktiven Eintrags.

| Liste (Stammdaten) | Parameter „Zweck“ | Wirkung |
| --- | --- | --- |
| Telefonliste `masterdata.phones` | `department` (Standard, Telefonliste der Abteilung) | Handynummer nur mit Einwilligung, sonst „über Gruppenführer“ (leer, wenn keine Nummer gespeichert ist) |
| | `leaders` (Führungskräfte: Personen mit einem laufenden Amt oder der Qualifikation Gruppen-, Zug- oder Verbandsführer) | alle Nummern, weil die Erreichbarkeit der Führungskräfte zur Aufgabe gehört (Entscheidung 9 des Konzepts) |
| Geburtstage `masterdata.birthdays` | `internal` (Standard, intern für den Kommandanten) | alle Personen |
| | `posting` (Aushang) | nur Personen mit Einwilligung; Untertitel „· Aushang“ |

Die übrigen Telefonnummern (privat, dienstlich) und die Mitgliederliste bleiben unverändert.

### Mein Bereich und erste Anmeldung

- **Meine Einwilligungen** (`GET /api/core/privacy/me/consents`, `MyConsents`): die geltenden Einträge und die eigenen Einwilligungen, je mit Schalter, „erteilt …“ bzw. „widerrufen …“ und „Text lesen“. `PUT /api/core/privacy/me/consents/:key` (`MyConsentInput`: `given`, `version` der angebotenen Fassung, sonst `409 conflict.stale`; `firstLogin`) erteilt mit Weg `my-area` bzw. `first-login` oder widerruft sofort (Weg `my-area`). Gibt es eine neue Fassung, bittet Mein Bereich um erneute Zustimmung; bis dahin gilt die alte weiter. Nicht während einer Impersonation und nicht mit API-Tokens (`403 privacy.ownConsentOnly`). **Minderjährige** sehen ihre Einwilligungen nur (`403 privacy.consentMinor`); die Erziehungsberechtigten willigen schriftlich ein, ein Widerruf geht über die Feuerwehr.
- **Erste Anmeldung:** Nach dem Hinweis „Bevor Sie beginnen“ bietet die Seite die geltenden, noch nicht erteilten Einwilligungen an („Freiwillige Einwilligungen“, einzeln, nichts vorausgewählt, mit „Text lesen“); „Weiter“ nimmt den Hinweis zur Kenntnis und speichert danach die gewählten Einwilligungen mit `firstLogin`. Minderjährigen wird nichts angeboten. Die Seite erscheint wie bisher nur, wenn der Hinweis fällig ist.

### Auskunft und Export

Die Auskunft (`describePerson` des Core) hat den Abschnitt „Einwilligungen“ (`core.consents`: Einwilligung, Fassung, erteilt mit Weg, erfasst von als Funktion, Stand mit Widerruf bzw. neuer Fassung; Änderungen im Protokoll), der Export je Person (`GET /api/core/export/person/:personId`) im Teil `core` die Liste `consents` mit Fassung, Text und Widerruf. Die Anonymisierung lässt Einwilligungen als Nachweis stehen (sie nennen nur die Person-ID und den Text der Fassung).

## Berichtigung (L12)

**„Berichtigung beantragen …“** in Mein Bereich: unter jedem Abschnitt eines Moduls (Bereich vorgewählt) und im Abschnitt „Datenschutz“ (Mockup `mein-bereich.html`, `#d-berichtigung`). Dialog: Bereich (Abschnitte der Module, „Benutzerkonto“, „Sonstiges“), „Was ist falsch?“, „Wie ist es richtig?“, Nachweis (PDF oder Foto, optional, mit dem Hinweis „Bitte keine Kopie des Führerscheins“). Abweichung vom Mockup: zwei Felder statt eines, damit die Zuständigen beides getrennt sehen.

- `POST /api/core/privacy/me/rectifications` (`MyRectificationInput`: `area` = Modul-ID, `core` oder `other`, `wrong`, `correct`) legt eine Anfrage der Art `rectification` an (Weg Mein Bereich, Identität durch die Anmeldung geprüft, Frist eingegangen + 1 Monat, Sprache des Benutzers, `rectification` mit Bereich, falsch, richtig) und antwortet mit ihrer ID; der Nachweis wird danach als Anhang `core.privacy-request` hochgeladen (lesen: die Person selbst, `core.privacy.manage`, die Zuständigen; hinzufügen: die Person, solange die Anfrage offen ist, und `core.privacy.manage`). Nicht während einer Impersonation (`403 privacy.ownRequestOnly`), ohne verknüpfte Person `400 privacy.noPerson`.
- **Aufgaben:** Wie jede Anfrage eine Aufgabe „Datenschutzanfrage beantworten“ für `core.privacy.manage`; dazu die Aufgabe „Berichtigung prüfen: <Bereich>“ (`privacy-rectification`, ohne Namen) für alle mit `masterdata.persons.write` in einer Abteilung der Person, mit Link auf `/privacy/rectifications/:id`. Die Aufgabe entfällt nicht bei einer Einschränkung der Person.
- **Seite „Berichtigung prüfen“** (`GET /api/core/privacy/rectifications/:id`, `RectificationView`, für die Zuständigen und `core.privacy.manage`, sonst `404`): Person mit Link auf die Personalakte, Eingang, Frist, falsch, richtig, Nachweis, „Als berichtigt vermerken“ (`POST …/rectifications/:id/corrected`, schon vermerkt `409 privacy.alreadyCorrected`; Audit `privacy.rectification-corrected`). Danach endet deren Aufgabe; die Anfrage bleibt beim Datenschutz, der antwortet und sie abschließt.
- Die Seite der Anfrage zeigt den Abschnitt „Berichtigung“ mit Stand („noch nicht berichtigt“ bzw. „berichtigt am … von …“), Nachweis und dem Hinweis auf die Kämmerei bei geänderter Bankverbindung; „Meine Anfragen“ in Mein Bereich zeigt „Berichtigung: <was falsch ist> (<Bereich>)“. Auskunft als JSON und Anonymisierung behandeln `rectification` wie den Inhalt der Anfrage.

**„Wert in der Historie unkenntlich machen“** für nachweislich falsche oder unzulässig erfasste Angaben: `POST /api/core/history/entries/:id/redact` (`HistoryRedactionInput`: Feld, `side` `old` oder `new`, Grund mindestens 10 Zeichen) mit `core.privacy.manage` (Step-up) und Leserecht auf die Historie des Datensatzes. Der Wert wird im Eintrag durch `null` ersetzt, `core.history.redactions` vermerkt Zeitpunkt, Benutzer und Grund je Feld und Seite; die Historie liefert dafür `redactedOld` bzw. `redactedNew` und zeigt „berichtigt, Wert entfernt am …“. Fehler: `history.unknownField`, `history.nothingToRedact` (leerer Wert), `409 history.alreadyRedacted`. Audit `privacy.history-redacted` mit Datensatz, Feld, Seite und Grund, nie mit dem Wert. In jeder Historie (`HistoryTimeline`) steht dafür bei bestätigter Sitzung mit `core.privacy.manage` „Unkenntlich machen …“ an jedem Wert.

## Leseprotokoll und Anmelden als (L15)

### Leseprotokoll

Tabelle `core.access_log` (`AccessLogEntity`): Benutzer, Person (`null` = alle Personen, z. B. Vollexport), Bereich, Tag (Europe/Berlin), Zahl, erster und letzter Zugriff; eine Zeile je Benutzer, Person, Bereich und Tag (`insert … on conflict` zählt hoch). Protokolliert wird nur das Lesen besonders geschützter Daten, nie der Inhalt:

| Bereich | Wann |
| --- | --- |
| `masterdata.person-sensitive` „Personalakte mit sensiblen Feldern“ | `GET /api/masterdata/persons/:id`, wenn der Leser die sensiblen Felder sieht |
| `respiratory-protection.examinations` „Eignungsuntersuchungen (Gesundheitsdaten)“ | Atemschutz der Person, wenn Untersuchungen dabei sind und der Leser sie sehen darf |
| `core.access-report` „Auskunft nach Art. 15“ | Erstellen und Herunterladen durch die Verwaltung |
| `core.export` „Vollexport bzw. Auskunft als JSON“ | Vollexport eines Moduls (Person „alle“) und JSON je Person |
| `masterdata.lists` „Listen mit Kontakt- oder sensiblen Daten“ | Mitgliederliste, Telefonliste, Komplettdaten, Geburtstage, Altersgrenzen: je Person der Liste, auch in der Vorschau |

- Eigene Daten werden nicht protokolliert. Während einer Impersonation ist der Administrator der Leser. Ein Fehler beim Schreiben hält die Anfrage nicht auf (nur Server-Log).
- **Dienst** `AccessLog` (aus `@forga/core-api`): `record(user, personIds, area)`, `registerArea(key, label)` für Module, `query({ from, to, userId, personId, area, limit })` und `forPerson(personId)` für andere Funktionen (z. B. die Hilfen bei Datenpannen).
- **Einsicht** mit `core.audit.read` (Step-up): `GET /api/core/access-log` (`AccessLogEntry[]`, neueste zuerst, höchstens 2000) und `GET /api/core/access-log/filters`; Seite „Verwaltung → Audit-Log“, Reiter „Leseprotokoll“ (`/admin/audit?tab=access`) mit Zeitraum, Benutzer, Bereich und Person.
- **Aufbewahrung:** eigene Kategorie `core.access-log` „Leseprotokoll“ im Aufbewahrungsplan (Standard 1 Jahr = 12 Monate, löschen; nach dem letzten Zugriff des Tages), auch in der Tätigkeit `core.accounts`.
- **Auskunft:** Abschnitt „Zugriffe auf besonders geschützte Daten“ (`core.access-log`): Tag, Funktion des Lesers (nie der Name), Bereich, Zahl; im Export je Person im Teil `core` die Liste `accessLog`.

### Anmelden als

- Der Grund war schon Pflicht (mindestens 3 Zeichen).
- **E-Mail an den Benutzer** beim Start, wenn er eine Adresse hat und die Einstellung `security.notifyImpersonation` an ist (Standard; „Verwaltung → Datenschutz → Einstellungen → Sicherheit → E-Mails“, Schalter „Benutzer bei „Anmelden als“ benachrichtigen“): Administrator und Grund, Hinweis auf Mein Profil; Versandfehler halten nichts auf.
- **„Anmeldungen als Sie“** im Profil und in Mein Bereich (`GET /api/core/me/impersonations`, `MyImpersonation`): Beginn und Ende (Ende der Impersonation bzw. nach höchstens einer Stunde), Administrator, Grund; aus dem Audit-Log (`auth.impersonation-started`/`-ended`), also so lange, wie das Audit-Log aufbewahrt wird.
- In der Auskunft stehen die Anmeldungen als die Person im Protokoll des Kontos.

### Tests

`apps/server/src/consents.integration.ts`: Recht und Vorlagen, Katalog mit Fassungen und Prüfung, Erfassen in der eigenen Abteilung mit Nachweis, Minderjährige und Erziehungsberechtigte, Mein Bereich und erste Anmeldung, Impersonation, Wirkung in Telefonliste (Abteilung, Führungskräfte) und Geburtstagsliste (Aushang), Widerruf über eine Anfrage, neue Fassung, Auskunft und Export; Berichtigung mit Frist, Aufgabe der Abteilung, Nachweis, Vermerk und Fehlerfällen; Wert in der Historie unkenntlich machen; Leseprotokoll für Personalakte, Listen, Exporte und Untersuchungen mit Recht, Step-up, Aufbewahrung und Auskunft; E-Mail und Liste „Anmeldungen als Sie“ mit Einstellung.

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

**Warnung bei HTTP.** Die Einrichtungsliste der Startseite zeigt den ersten Punkt „f.orga über HTTPS aufrufen“ (`key: https`), solange die Anfrage nicht über HTTPS kam; auf dem Entwicklungsrechner (`FORGA_STAGE=development`) nicht. „Verwaltung → Datenschutz → Einstellungen → Sicherheit“ (`/admin/privacy/settings?tab=security`; der alte Link `/admin/settings?tab=security` leitet dorthin) zeigt den Stand: HTTPS (aus Sicht des Browsers und des Servers, Plakette „nein – Aufruf über http://“ mit Warnung), Cookies nur über HTTPS, System (Echtsystem, Testsystem, Entwicklung). Daten: `GET /api/core/security/status` (`core.settings.manage` oder `core.privacy.manage`, `SecurityStatus`: `stage`, `https`, `publicUrlHttps`, `secureCookies`).

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

Einstellung `security` (nur Verwalter lesen sie: `core.settings.manage` oder `core.privacy.manage`; „Verwaltung → Datenschutz → Einstellungen → Sicherheit → E-Mails“):

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

**Recht `core.privacy.manage`** („Datenschutz verwalten“): Gesamtwehr, `privileged` (nie für API-Tokens), `stepUp`. Rollenvorlage: `administrator` über `*`; andere Rollen (Kommandant, eine Person der Gemeindeverwaltung, DSB) bekommen es bei Bedarf. Einwilligungen von Personen der Abteilung erfasst `core.privacy.consents` (siehe [Einwilligungen](#einwilligungen-l9)).

**Seite „Verwaltung → Datenschutz“** (Menüpunkt mit `core.privacy.manage` oder `core.settings.manage`) mit den Reitern:

| Reiter | Route | Recht | Inhalt |
| --- | --- | --- | --- |
| Anfragen | `/admin/privacy` | `core.privacy.manage` | Kacheln „Frist in 7 Tagen“, „Offene Anfragen“ (älteste), „Eingeschränkte Personen“, „Information nach Art. 13/14 offen“; Filter offen/abgeschlossen/alle; Tabelle Art, Person, Eingang mit Weg, Frist (rot überfällig, gelb in 7 Tagen), Stand, Bearbeiter; „Anfrage erfassen …“; Karte „Eingeschränkte Personen“ |
| Anfrage | `/admin/privacy/requests/:id` | `core.privacy.manage` | siehe [Betroffenenanfragen](#betroffenenanfragen-l7-l19) |
| Information | `/admin/privacy/information` | `core.privacy.manage` | siehe [Information nach Art. 13/14](#information-nach-art-1314) |
| Einstellungen | `/admin/privacy/settings?tab=` | je Reiter | Kontakte, Texte, Einwilligungen, Selbstauskunft (`core.privacy.manage`); Sicherheit, Aufbewahrung (`core.privacy.manage` oder `core.settings.manage`) |

Die Reiter „Datenschutz“ (Aufbewahrungsfristen) und „Sicherheit“ der Seite „Einstellungen“ sind hierher gezogen; alte Links (`/admin/settings?tab=privacy`, `?tab=security`) leiten weiter. Der Reiter „Verzeichnis“ (L8) fehlt noch.

**Einstellungsabschnitte** (`core.setting`, historisiert; lesen und ändern nur ihre Verwalter, `SettingsAccess.managers`):

| Abschnitt | Schema (`@forga/core-contracts`) | Verwalter | Inhalt |
| --- | --- | --- | --- |
| `privacy.contacts` | `PrivacyContacts` | `core.privacy.manage` | `controller` (`name`, `address`, `representedBy`), `dpo` (`name`, `address`, `email`, `phone`), `authority` (`name`, vorbelegt mit dem Landesbeauftragten für den Datenschutz und die Informationsfreiheit Baden-Württemberg, `address`, `website`) |
| `privacy.texts` | `PrivacyTexts`, `PrivacyTextBlock` | `core.privacy.manage`, nur über die eigenen Endpunkte (`PUT /api/core/settings/privacy.texts` antwortet `400 settings.dedicatedEndpoint`) | Textbausteine, siehe unten |
| `privacy.selfServiceAccess` | `PrivacySelfService` | `core.privacy.manage` | `mode` `request` (Standard) oder `instant`; `contact` (Ansprechpartner in Mein Bereich) |
| `privacy.recipients` | `PrivacyRecipients` | `core.privacy.manage` | Empfänger für Art. 19 (`id`, `name`, `note`), bis das Verzeichnis der Verarbeitungstätigkeiten Empfänger je Tätigkeit nennt |
| `privacy.consents` | `PrivacyConsents`, `ConsentDefinition` | `core.privacy.manage`, nur über die eigenen Endpunkte | Katalog der Einwilligungen, siehe [Einwilligungen](#einwilligungen-l9) |
| `privacy` (Aufbewahrung), `security` | wie bisher | `core.settings.manage` oder `core.privacy.manage` | |

**Textbausteine** (`privacy.texts`; je Baustein `text: { de, en }`, `version`, `changedAt`, `changedBy`, `reviewedAt`, `reviewedBy`; `PRIVACY_TEXT_BLOCKS` nennt Verwendung und Platzhalter):

| Schlüssel | Verwendet in | Platzhalter |
| --- | --- | --- |
| `noticeIntro`, `noticeProcessing` | Datenschutzhinweis | `{brigade}` |
| `rights`, `automatedDecisions`, `thirdCountry` | Datenschutzhinweis, Deckblatt der Auskunft (Art. 15 Abs. 1 e, h, Abs. 2) | `{brigade}` |
| `firstLogin` | Hinweis bei der ersten Anmeldung | `{brigade}` |
| `accessReportIntro` | Einleitung der Auskunft | `{brigade}`, `{name}`, `{receivedOn}` |
| `replyAccess`, `replyRectification`, `replyErasure`, `replyRestriction`, `replyObjection`, `replyConsentWithdrawal`, `replyRejection`, `replyExtension` | Antwortschreiben | `{brigade}`, `{name}`, `{receivedOn}`, `{dueOn}`, `{extendedUntil}`, `{kind}`, `{activity}`, `{reason}`, `{authority}`, `{today}` |

- Nie gespeicherte Bausteine kommen mit ihrer **Vorlage** (`PRIVACY_TEXT_TEMPLATES`, beginnt mit „[Vorlage]“, nennt nur Titel von DSGVO-Artikeln und Platzhalter in eckigen Klammern). `PrivacyTexts.parse(await settings.get('privacy.texts') ?? {})` liefert immer alle Bausteine; `fillPlaceholders(text, values)` ersetzt `{platzhalter}`. Absätze trennt eine Leerzeile, Zeilen mit „- “ sind Aufzählungen.
- `PUT /api/core/privacy/texts/:key` (`{ text, version }`): Ein geänderter Text erhöht `version` und gilt wieder als Vorlage (`reviewedAt` leer); eine veraltete `version` antwortet `409 conflict.stale`. Audit `privacy.text-changed`.
- `POST /api/core/privacy/texts/:key/review` (`{ version }`): „Als geprüft markieren“ setzt `reviewedAt` und `reviewedBy` (Anzeigename). Audit `privacy.text-reviewed`.
- Oberfläche (Reiter „Texte“): Warnung „n Textbausteine sind Vorlagen“, Tabelle mit Verwendung, Fassung und Stand („Vorlage – mit dem DSB prüfen“ bzw. „geprüft …“), darunter der gewählte Baustein Deutsch und Englisch nebeneinander mit Platzhaltern, „Speichern“ und „Als geprüft markieren …“ (Bestätigung).
- Einrichtungsliste der Startseite: `privacyContacts` (Verantwortlicher und DSB eingetragen) und `privacyTexts` (alle Bausteine geprüft), beide mit Link auf den Reiter.

**Für die Auskunft als PDF** (L3): Das Deckblatt liest `privacy.contacts` (Verantwortlicher, DSB, Aufsichtsbehörde) und `privacy.texts` (`rights`, `automatedDecisions`, `thirdCountry`, `accessReportIntro`). Die Anfrage hat das Feld `accessReportDocumentId` (`PrivacyRequest`); `PrivacyRequests.attachAccessReport(requestId, documentId)` (aus `@forga/core-api`) trägt die erstellte Auskunft ein. Die Seite einer Anfrage auf Auskunft zeigt die Auskünfte zu ihr mit Stand und Übergabe und „Auskunft erstellen …“ (siehe [Auskunft nach Art. 15 als PDF](#auskunft-nach-art-15-als-pdf-l3)); `PrivacyRequests.closeDone` setzt eine offene Anfrage auf erledigt.

## Datenschutzhinweis (L4)

**Fassungen.** Der Hinweis setzt sich aus Feuerwehrname, `privacy.contacts` und den Bausteinen `noticeIntro`, `noticeProcessing`, `rights`, `automatedDecisions`, `thirdCountry` zusammen (`composeNotice`), mit den Abschnitten Worum es geht, Verantwortlicher und Datenschutzbeauftragter, Welche Daten wir wofür verarbeiten, Ihre Rechte, Beschwerde (Aufsichtsbehörde), Automatisierte Entscheidungen, Übermittlung in Drittländer. Jede Änderung, die den Text oder den Stand „Vorlage“ ändert, legt eine neue **Fassung** an (`core.privacy_notice`: `version`, `publishedAt`, `sections` in beiden Sprachen, `template`; historisiert, Audit `privacy.notice-published`). Auslöser sind Änderungen der Abschnitte `brigade`, `privacy.contacts` und `privacy.texts` (`SettingsService.onChange`); die erste Fassung entsteht beim ersten Abruf.

**Öffentlich lesbar** (ohne Anmeldung):
- Seite `/privacy` mit Fassung und Datum, früheren Fassungen zur Auswahl, Hinweis „Vorlage – noch nicht mit dem Datenschutzbeauftragten geprüft“ und „Als PDF“. Links in der Fußzeile jeder Seite, auf der Anmeldeseite, in Mein Bereich und in den Einstellungen.
- `GET /api/core/privacy/notice?version=` (`PrivacyNotice` mit `versions`; unbekannte Fassung `404 privacy.noticeUnknown`), `GET /api/core/privacy/notice.pdf?language=&version=` (Briefkopf bzw. Wappen; für den Aushang und als Beilage zur Aufnahme).

**Hinweis bei der ersten Anmeldung und nach einer neuen Fassung** (Mockup `erste-anmeldung.html`; die angebotenen Einwilligungen siehe [Einwilligungen](#mein-bereich-und-erste-anmeldung)): Die Sitzung meldet `privacyNotice: { version, acknowledgedVersion, due }`. Ist `due`, zeigt die Shell vor allen Seiten „Bevor Sie beginnen“ mit dem Baustein `firstLogin` (`GET /api/core/privacy/notice/first-login`), Link auf den vollständigen Hinweis, dem Haken „Datenschutzhinweis (Fassung n) zur Kenntnis genommen“ und „Weiter“ (oder „Abmelden“). `POST /api/core/privacy/notice/acknowledge` (`{ version }`) speichert Fassung und Zeitpunkt am Benutzer (`core.user.privacy_notice_version`, `privacy_notice_acknowledged_at`; Historie des Benutzers, Audit `privacy.notice-acknowledged`). Das ist keine Einwilligung.
- `due` gilt erst, wenn alle Bausteine des Hinweises geprüft sind (`template: false`): Eine ungeprüfte Vorlage gilt noch nicht und wird niemandem zur Kenntnis vorgelegt. Danach fragt jede neue Fassung erneut.
- Nicht während einer Impersonation (`due: false`, Bestätigen `403 privacy.acknowledgeOwnOnly`), nicht für technische Benutzer und API-Tokens. Eine inzwischen veraltete Fassung antwortet `409 privacy.noticeOutdated`.

## Information nach Art. 13/14

Die meisten Mitglieder haben kein Benutzerkonto. An der Person stehen deshalb „Information erteilt am“ und der Weg (`masterdata.person.privacy_informed_on`, `privacy_informed_via`: `letter` Schreiben, `in-person` persönlich, `posting` Aushang, `email`, `other`; in `Person.privacyInformation`).

- **Liste** `GET /api/masterdata/privacy/uninformed` (`core.privacy.manage`, `UninformedPerson[]`): Personen ohne vermerkte Information, deren verknüpfter Benutzer den Hinweis auch nicht zur Kenntnis genommen hat; ohne Ausgeschiedene, Anonymisierte und Eingeschränkte.
- **Massenaktion** `POST /api/masterdata/privacy/information` (`PrivacyInformationInput`: `personIds`, `informedOn`, `via`; Antwort `{ count }`), z. B. nach einer Datenübernahme. Audit `privacy.information-recorded` mit Zahl, Datum und Weg (bei einer Person mit `personId`).
- Oberfläche: Reiter „Information“ mit „Datenschutzhinweis als PDF“, Auswahl je Person und „Alle auswählen“, „Information vermerken (n) …“ (Datum, Weg); einzeln auch im Reiter „Datenschutz“ der Personalakte.

## Betroffenenanfragen (L7, L19)

**Anfrage** (`core.privacy_request`, historisiert; Historie und Audit-Referenz `requestId` nur mit `core.privacy.manage`):

| Feld | Bedeutung |
| --- | --- |
| `kind` | `access` Auskunft, `rectification` Berichtigung, `erasure` Löschung, `restriction` Einschränkung, `objection` Widerspruch, `consent-withdrawal` Widerruf einer Einwilligung |
| `receivedOn`, `channel` | eingegangen am (nicht in der Zukunft), Weg: `letter` schriftlich, `email`, `in-person` persönlich, `my-area` Mein Bereich |
| `identityChecked`, `identityNote` | Identität geprüft und wie (bei Mein Bereich durch die Anmeldung) |
| `content`, `language`, `activity` | Inhalt, Sprache von Antwort und Auskunft, beim Widerspruch die Verarbeitungstätigkeit als Text (bis es das Verzeichnis gibt) |
| `dueOn` | eingegangen + 1 Monat (Art. 12 Abs. 3; am Monatsende auf den letzten Tag gekürzt, `addMonthsToDate`) |
| `extendedUntil`, `extensionReason`, `extensionNotifiedOn` | Verlängerung um 1 oder 2 Monate mit Begründung (mindestens 10 Zeichen), nur einmal und nur vor Ablauf der Frist; Person unterrichtet am |
| `status` | `received` eingegangen, `in-review` in Prüfung, `extended` verlängert, `done` erledigt, `rejected` abgelehnt (mit Begründung) |
| `closedOn`, `rejectionReason` | abgeschlossen am, Begründung der Ablehnung |
| `assigneeId`, `notes` | Bearbeiter (nur Inhaber von `core.privacy.manage`), Notizen |
| `recipients` | informierte Empfänger nach Art. 19 (`id`, `name`, `notifiedOn`) |
| `accessReportDocumentId` | erstellte Auskunft (Feature „Auskunft als PDF“) |

Die Auskunft als JSON (`GET /api/core/export/person/:personId`) enthält die Anfragen der Person (`core.privacyRequests`: Art, Daten, Inhalt, Stand) und die zur Kenntnis genommene Fassung des Hinweises am Benutzer. Die Anonymisierung einer Person leert Inhalt, Identitätsvermerk, Bezug und Notizen ihrer Anfragen und löscht deren Historie; Art, Daten und Ergebnis bleiben als Nachweis.

**Frist als Aufgabe.** Jede offene Anfrage ist eine Aufgabe (Bereich „Verwaltung“, Art `privacy-request`, „Datenschutzanfrage beantworten: Auskunft“, fällig an `deadline` = Verlängerung oder `dueOn`, Link auf die Anfrage) für alle mit `core.privacy.manage`, auch vor dem Step-up (`DeadlineInput.held`), in der Glocke, auf der Startseite und in der wöchentlichen E-Mail. Die Aufgabe nennt nur das Eingangsdatum, keine Person. Solange eine verlängerte Frist der Person nicht mitgeteilt ist, erinnert eine zweite Aufgabe `privacy-extension-notice` („Person über die Fristverlängerung unterrichten“) bis zur ursprünglichen Frist; die Seite der Anfrage zeigt dazu eine Warnung mit „Als unterrichtet vermerken“.

**Antwortschreiben** `GET /api/core/privacy/requests/:id/reply.pdf?text=&language=`: Brief mit Briefkopf, Anschrift der Person, Ort und Datum, Betreff und dem Baustein mit gefüllten Platzhaltern; ohne `text` der Baustein der Art (`REPLY_TEXT_OF_KIND`), bei abgelehnten Anfragen `replyRejection`. Ein ungeprüfter Baustein trägt den Vermerk „Vorlage – vor dem Versand mit dem Datenschutzbeauftragten prüfen“. Nur Bausteine `reply…` (sonst `400 privacy.noReplyText`). Audit `privacy.reply-created`.

**Seite der Anfrage** (Mockup `anfrage.html` ohne die Löschprüfung): Eingang, Person (Link auf den Reiter „Datenschutz“), Identität, Inhalt, Bezug, Sprache, Frist; Warnung zur Unterrichtung über die Verlängerung; Bearbeitung (Stand, Bearbeiter, Sprache, Identität, Inhalt, Notizen, „Frist verlängern …“, „Abschließen …“ mit Ergebnis, Datum und Pflichtbegründung bei Ablehnung, „Wieder öffnen“); bei Berichtigung, Löschung und Einschränkung „Empfänger informieren (Art. 19)“ als Checkliste aus `privacy.recipients`; bei Einschränkung, Widerspruch, Löschung und Berichtigung die Einschränkung der Person mit „Verarbeitung einschränken …“ bzw. „Einschränkung aufheben …“; bei Auskunft der Stand der Auskunft; „Antwortschreiben (PDF)“ mit Auswahl des Bausteins.

**Widerspruch (L19):** Art `objection` mit `activity`. „Verarbeitung bis zur Entscheidung einschränken“ beim Erfassen (`restrict: true`, nur bei Widerspruch und Einschränkung, sonst `400 privacy.restrictNotForKind`) schränkt die Person sofort ein (Grund `objection-pending` bzw. `accuracy-contested`, mit `requestId`). Die Entscheidung mit Begründung steht im Antwortschreiben `replyObjection` bzw. `replyRejection`.

**Endpunkte** (`core.privacy.manage`, außer Mein Bereich und Datenschutzhinweis):

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/core/privacy/requests?state=open\|closed\|all&personId=` | Anfragen (`PrivacyRequest[]`) mit `personName`, `assigneeName`, `createdByName`, `deadline` |
| `GET` | `/core/privacy/requests/:id` | eine Anfrage; unbekannt `404 privacy.requestUnknown` |
| `POST` | `/core/privacy/requests` | erfassen (`PrivacyRequestInput`). Fehler `privacy.personUnknown`, `privacy.receivedInFuture`, `privacy.restrictNotForKind`. Audit `privacy.request-created` |
| `PUT` | `/core/privacy/requests/:id` | Stand (`received`/`in-review`), Bearbeiter, Identität, Inhalt, Notizen, Sprache, Bezug (`PrivacyRequestUpdate` mit `version`). Fehler `privacy.requestClosed` (`409`), `privacy.assigneeWithoutPermission`, `conflict.stale`. Audit `privacy.request-status-changed` bei geändertem Stand |
| `POST` | `/core/privacy/requests/:id/extend` | verlängern (`months` 1 oder 2, `reason`). Fehler `privacy.alreadyExtended` (`409`), `privacy.deadlinePassed`. Audit `privacy.request-extended` |
| `POST` | `/core/privacy/requests/:id/extension-notified` | Unterrichtung vermerken (`notifiedOn`). Fehler `privacy.notExtended` |
| `POST` | `/core/privacy/requests/:id/close` | abschließen (`outcome` `done`/`rejected`, `closedOn`, `reason`). Fehler `privacy.closedBeforeReceived`. Audit `privacy.request-closed` |
| `POST` | `/core/privacy/requests/:id/reopen` | wieder öffnen (Stand `in-review` bzw. `extended`). Audit `privacy.request-reopened` |
| `PUT` | `/core/privacy/requests/:id/recipients` | informierte Empfänger. Audit `privacy.recipients-notified` |
| `GET` | `/core/privacy/requests/:id/reply.pdf?text=&language=` | Antwortschreiben |
| `GET` | `/core/privacy/assignees` | Benutzer mit `core.privacy.manage` (Gesamtwehr) |
| `GET` | `/core/privacy/persons/:personId` | Reiter „Datenschutz“: Anfragen der Person und der vom verknüpften Benutzer zur Kenntnis genommene Hinweis (`PersonPrivacy`) |
| `GET` | `/core/privacy/me` | angemeldet: eigene Anfragen, `selfService`, DSB, eigener Stand des Hinweises (`MyPrivacy`) |
| `POST` | `/core/privacy/me/requests` | angemeldet, Sitzung: „Auskunft anfordern“ (`{ language }`); bei `instant` zusätzlich sofort die Auskunft. Fehler `privacy.noPerson`, `privacy.requestOpen` (`409`, schon eine offene Auskunft), `privacy.accessReportToday` (`409`, `instant`: heute schon erstellt), `privacy.ownRequestOnly` (Impersonation, API-Token) |
| `GET`, `PUT`, `POST` | `/core/privacy/texts`, `/core/privacy/texts/:key`, `/core/privacy/texts/:key/review` | Textbausteine |
| `GET` | `/core/privacy/notice`, `/core/privacy/notice.pdf` | ohne Anmeldung: Datenschutzhinweis |
| `GET`, `POST` | `/core/privacy/notice/first-login`, `/core/privacy/notice/acknowledge` | angemeldet: Hinweis bei der ersten Anmeldung |

**Mein Bereich** (Abschnitte „Meine Einwilligungen“, „Datenschutz“ und „Anmeldungen als Sie“ für jeden Benutzer mit verknüpfter Person; der Menüpunkt „Mein Bereich“ erscheint deshalb immer, wenn eine Person verknüpft ist): „Auskunft anfordern …“, „Berichtigung beantragen …“ (Sprache; legt eine Anfrage mit Weg „Mein Bereich“ an, Identität durch die Anmeldung geprüft; gesperrt, solange eine Auskunft offen ist), „Meine Anfragen“ mit Stand und Frist, Link auf den Datenschutzhinweis mit der zur Kenntnis genommenen Fassung, Ansprechpartner und DSB. Mit `privacy.selfServiceAccess.mode = instant` heißt der Knopf „Auskunft jetzt erstellen …“: Die Person erzeugt ihre Auskunft sofort selbst (siehe [Selbstauskunft](#selbstauskunft-in-mein-bereich)).

**Reiter „Datenschutz“ der Personalakte** (`/masterdata/persons/:id?tab=privacy`; die Shell trägt ihn über den Erweiterungspunkt `masterdata.person.tab` bei, Recht `core.privacy.manage` oder `core.privacy.consents`, ohne Step-up „Datenschutz anzeigen …“): „Anfragen der Person“ mit „Anfrage erfassen …“, „Einwilligungen“, „Information und Einschränkung“ (Datenschutzhinweis zur Kenntnis genommen bzw. kein Benutzerkonto, Information nach Art. 13/14, Verarbeitung) mit „Information vermerken …“ und „Verarbeitung einschränken …“ bzw. „Einschränkung aufheben …“.

## Einschränkung der Verarbeitung (Art. 18)

An der Person (`masterdata.person`): `restricted_at`, `restriction_reason` (`accuracy-contested` Richtigkeit bestritten, `unlawful-processing`, `legal-claims`, `objection-pending` Widerspruch wird geprüft, `retention` Löschung abgelehnt, Aufbewahrungsfrist läuft), `restricted_until` (geplantes Ende), `restriction_request_id`; in `Person.processingRestriction`.

- `PUT /api/masterdata/persons/:id/restriction` (`ProcessingRestrictionInput`: `reason`, `until`, `requestId`) und `DELETE …/restriction` mit `core.privacy.manage`. Audit `privacy.restricted` bzw. `privacy.restriction-lifted`. `GET /api/masterdata/privacy/restricted` listet die eingeschränkten Personen (`RestrictedPerson[]`).
- Das geplante Ende ist eine Aufgabe `restriction-ends` (14 Tage vorher, ohne Namen, Link auf den Reiter „Datenschutz“) für alle mit `core.privacy.manage`; die Einschränkung bleibt, bis jemand sie aufhebt.

**Wirkung.** Eine eingeschränkte Person …

| Bereich | Umsetzung |
| --- | --- |
| Personalakte | nur mit `core.privacy.manage` (sonst `403 privacy.processingRestricted`, mit gehaltenem Recht `auth.stepUpRequired`); Ändern ebenso (nur zur Berichtigung). Plakette „Verarbeitung eingeschränkt“ mit Hinweis; Führerscheinakte ebenso |
| Personenliste, Personalauswahl, Listen der Stammdaten, Lehrgangsplanung, Führerscheinkontrollen, Ehrungsurkunden | `PersonsService.visibleWhere` lässt sie immer weg, auch für `core.privacy.manage` (die Datenschutzseite listet sie) |
| Globale Suche | Treffer mit `SearchHit.personId` einer eingeschränkten Person fallen weg (`SearchRegistry`) |
| Fristen und wöchentliche E-Mail | `DeadlineRegistry` lässt Fristen mit `personId` bzw. Gegenstand `masterdata.person`/`core.me` einer eingeschränkten Person weg (Probezeit, Altersgrenzen, Qualifikationen, Führerschein, Atemschutz, Verdienstausfall ohne Betrag) |
| Andere Module über `PERSON_DIRECTORY` | `search`, `membersOn`, `memberPeriods`, `careers()` ohne IDs und `offices` lassen sie weg; `isRestricted(id)` und `restrictedIds(ids?)` für Daten in eigenen Tabellen. `snapshots`, `summaries`, `paymentDetails` und `careers(ids)` liefern sie weiter (Namen in bestehenden Datensätzen) |
| Infoterminal | keine Namenskachel, keine Suche, nicht unter den Eingetragenen von Einsatz und Dienst; Eintragen und Selbstkontrolle des Führerscheins wie bei einer unbekannten Person |
| Einsätze | Reiter „Einsätze“ der Person nur mit `core.privacy.manage`; nicht in „Einsatzstunden je Person“, nicht als Verfasser in „Offene Einsatzberichte“, nicht in der Auswahl der Verfasser und der Besatzung des letzten Einsatzes; keine Erinnerungs- und Rückgabe-E-Mails |
| Dienste | nicht neu in Anwesenheitslisten (`training.unknownPerson`), nicht in Teilnehmerliste, Ausbilderstunden, Unterschriftenliste und Teilnahmeübersicht |
| Atemschutz | nicht in Übersicht, Listen und Fristen; Seite der Person nur mit `core.privacy.manage`; keine E-Mail beim Wechsel auf Rot |
| Entschädigung | nicht in den Jahressummen und unter den Funktionsträgern; Posten der Person nur mit `core.privacy.manage` |
| Beförderungen | nicht unter den Vorschlägen, in den Listen und den Ausschlüssen; nicht manuell hinzufügbar; Seite der Person nur mit `core.privacy.manage` |
| Kleiderkammer | nicht in „Ausgegebene Schutzausrüstung“, in „Fällige Wäsche und Prüfungen“ ohne Namen; keine Ausgabe (`privacy.processingRestricted`); Seite der Person nur mit `core.privacy.manage` |
| Einsatzleiter vom Dienst | keine neuen Dienste (`privacy.processingRestricted`) |
| Mein Bereich | die Person selbst sieht und berichtigt ihre Daten weiter |

Weiter verarbeitet werden (Art. 18 Abs. 2, gesetzliche Pflichten): die Jahresstatistik (`membersOn(…, { includeRestricted: true })`, nur Zahlen), bereits erfasste Einsatzberichte und Dienste mit ihrem Personal, Auszahlungsläufe und Abrechnungen, Prüfprotokolle der Geräte mit dem Prüfer und der Vollexport. Seiten eines Moduls über eine einzelne Person prüfen die Einschränkung mit `assertNotRestricted(user, restricted)` aus `@forga/core-api`; neue Einträge lehnt `refuseRestricted(restricted)` ab.

**Tests:** `apps/server/src/privacy.integration.ts` (Recht und Step-up, Einstellungen, Fassungen der Texte, Hinweis mit erster Anmeldung und Impersonation, Information, Anfragen mit Frist, Verlängerung, Antwortschreiben, Empfänger, Abschluss, Mein Bereich, Einschränkung in Stammdaten, Suche, Listen, Fristen, Einsätzen, Atemschutz, Entschädigung, Kleiderkammer, Beförderungen, Diensten und Infoterminal) und Unit-Tests der `DeadlineRegistry`.
