# Datenschutz (umgesetzter Stand)

Was vom [Datenschutzkonzept](../geplant/datenschutz.md) im Code existiert. Offene Punkte stehen dort.

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
| Audit-Log | `core.audit.read` | ganze Seite |
| Vollexport und Auskunft je Person | `core.data.export` | Knopf fragt nach |
| Anmelden als (Impersonation) | `core.users.impersonate` | Start fragt nach |
| Datensicherung und Wiederherstellung | `backup.manage` | ganze Seite |
| Aussonderung | `core.retention.manage` | ganze Seite |

Keinen Step-up brauchen Einstellungen der Module (`<modul>.settings.manage`), die Personalakte ohne sensible Felder, Einsatzberichte, Listen ohne sensible Daten, Mein Bereich (eigene Daten einschließlich eigener Untersuchungen und Bankverbindung) und das Infoterminal. Die Einrichtungsliste der Startseite (`GET /api/core/onboarding`) genügt das gehaltene Recht, weil sie nur meldet, was noch fehlt. Die wöchentliche Fristen-E-Mail rechnet wie bisher mit allen Rechten des Empfängers.

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
