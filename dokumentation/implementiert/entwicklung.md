# Entwicklung

## Voraussetzungen

- Node.js 24 und npm 11
- Docker für die Datenbank

## Einrichten

```bash
npm install
docker compose -f docker/compose.dev.yml up -d   # PostgreSQL auf Port 5433
```

Nx lädt beim Start des Servers die Datei `apps/server/.env` mit `DATABASE_URL`, dem Einrichtungsschlüssel und einem festen Server-Schlüssel `FORGA_SECRET_KEY` nur für die Entwicklung (für die Links der Infoterminals und die Passphrase der Datensicherung). Ausstehende Migrationen spielt der Server beim Start selbst ein.

## Starten

```bash
npm run dev
```

| Dienst | Adresse |
| --- | --- |
| Shell (Einstieg) | http://localhost:4200 |
| Server | http://localhost:3000/api |
| Modul-Frontends | http://localhost:4201 … 4208 (`/modules/<id>/`, Ports in `tools/federation.mts`) |

- Die Shell leitet `/api` an den Server und `/modules/<id>/` an die Modul-Frontends weiter. Im Browser gibt es also nur eine Adresse.
- Die Ports stehen in `tools/federation.mts`.
- Beim ersten Aufruf einer leeren Datenbank erscheint die Ersteinrichtung. Sie legt den Feuerwehrnamen und das erste Administratorkonto an.

## Befehle

| Zweck | Befehl |
| --- | --- |
| Alles wie in der CI, vor jedem Commit | `npm run check` |
| Lint und Modulgrenzen | `npm run lint` |
| Typprüfung aller Projekte (Nx-Ziele, danach `tools/typecheck-sources.mjs`: jedes Projekt mit `tsc --noEmit` aus den Quellen, weil `tsc --build` Änderungen in Verträgen anderer Projekte übersehen kann) | `npm run typecheck` |
| Unit-Tests | `npm run test` |
| Integrationstests (PostgreSQL) | `npm run integration` |
| Alles bauen | `npm run build` |
| Migration erstellen | `npm run migration:create -- <modul\|core> <name>` |
| Migrationen einspielen | `npm run migration:run` |
| Demodaten einspielen (Server muss laufen) | `npm run seed` |
| Plugin-Schlüssel erzeugen, Plugin-Paket bauen und signieren | `npm run plugin -- keygen <name>`, `npm run plugin -- pack <ordner> --key <datei>` |
| Plugins in der Entwicklung | `FORGA_PLUGIN_DIR=<ordner> FORGA_PLUGINS_ALLOW_UNSIGNED=true npm run dev` |
| E2E-Tests (Anwendung läuft mit Demodaten) | `npm run e2e` |
| Projektgraph | `npx nx graph` |

## Demodaten

`npm run seed` (`tools/seed.mts`) füllt eine laufende Instanz über die API mit erfundenen Daten. Echte Personen kommen nicht vor. Für die Ersteinrichtung einer leeren Datenbank nimmt es den Einrichtungsschlüssel aus `FORGA_SETUP_TOKEN` oder aus `apps/server/.env` (Entwicklung: `dev-setup-token`).

Verwaltung und sensible Daten verlangen den zweiten Faktor ([Step-up](datenschutz.md#zweiter-faktor-bei-sensiblen-daten-step-up)). Beim ersten Lauf richtet das Skript den Faktor des Administrators ein, gibt das Geheimnis aus (zum Eintragen in eine Authenticator-App) und legt es in `tmp/seed-totp.json` ab; spätere Läufe nehmen es von dort oder aus `FORGA_ADMIN_TOTP_SECRET`. Nach dem Neuanlegen der Datenbank die Datei löschen. Demobenutzer mit sensiblen Rechten (z. B. `commander`, `administration`) richten ihren Faktor beim ersten Öffnen sensibler Daten im Browser ein; im Testsystem setzt ihn der Administrator in der Benutzerverwaltung zurück.

- Ersteinrichtung, falls nötig: „Freiwillige Feuerwehr Musterstadt“, Administrator aus `FORGA_ADMIN_USER` / `FORGA_ADMIN_PASSWORD` (Vorgabe `admin` / `sehr-geheim-123`). Server-Adresse aus `FORGA_URL` (Vorgabe `http://localhost:3000`). Die Ersteinrichtung braucht den Einrichtungsschlüssel in `FORGA_SETUP_TOKEN` (aus dem Protokoll des Servers oder derselbe Wert, mit dem der Server gestartet wurde).
- Einstellungen der Feuerwehr, BW-Vorlagen (Kataloge, Lehrgänge, Alarmstichworte, Vorlagewerte der Feuerwehrsatzung) und die Standardrollen.
- Vier Einsatzabteilungen, Altersabteilung und Jugendfeuerwehr, je ein Feuerwehrhaus und zehn Fahrzeuge.
- Rund 140 Personen über den Personenimport aus einer erzeugten Datei im Format des MP-Feuer-Exports `Personal.xlsx`, dazu Qualifikationen und Dienstgrade nach Dienstjahren.
- Ein Benutzer je Standardrolle: Benutzername = Schlüssel der Rolle (z. B. `commander`, `group-leader`), Passwort aus `FORGA_SEED_PASSWORD` (Vorgabe `demo-passwort-2026`). Abteilungskommandant, Gruppenführer und Mitglied gelten für die Abteilung Musterstadt und gehören zu passenden Personen dort: Der Abteilungskommandant hat das Amt und ist Kommandant der Abteilung, der Gruppenführer die Qualifikation Gruppenführer, das Mitglied ist Atemschutzgeräteträger, damit alle Abschnitte von „Mein Bereich“ Inhalt haben. Gerätewart und Atemschutzgerätewart haben ihre Qualifikationen.
- Drei Gruppen in Musterstadt; der Benutzer `group-leader` führt die 1. Gruppe.
- Lehrgangsplanung: Soll je Abteilung (u. a. Truppmann Teil 1 für die Jugendfeuerwehr, Atemschutz und Führungslehrgänge für Musterstadt, teils über dem Bestand), ein vergangener Termin Truppmann Teil 2 mit Ergebnissen (zwei bestanden, einer nicht), kommende Termine mit angemeldeten bzw. zugesagten Personen und weitere Vormerkungen ohne Termin.
- Bankverbindungen für 20 aktive Mitglieder mit erfundenen IBANs (gültige Prüfziffer, Bankleitzahl 00000000, die keine Bank nutzt).
- Einsätze seit Anfang des Vorjahres über den Import „Einsätze aus MP-Feuer“ aus einer erzeugten Datei im Format von `MP-EXCEL.xlsx`. Ältere Berichte sind zur Abrechnung freigegeben, jüngere zur Entschädigungsauszahlung oder noch in Bearbeitung.
- Einsatzleiter vom Dienst: Vorlage der Dienstarten, EvD-Dienstplan für 16 Wochen über den iCal-Import (Importprofil `duty-officer.roster`) und einige neue Einsätze über die API nach dem Einschalten, die damit einen EvD-Bericht bekommen; die aus MP-Feuer importierten Einsätze haben keinen. Benutzer `duty-officer` mit der Rollenvorlage „Einsatzleiter vom Dienst“, verknüpft mit einer Person aus Musterstadt mit der Qualifikation Gruppenführer.
- Atemschutz-Nachweise (Untersuchung, Unterweisung, Belastungsübung, Einsatzübung) für alle Geräteträger: die meisten einsatzbereit, einige laufen bald ab, einige sind nicht einsatzbereit.
- Entschädigungen: Übernahme der freigegebenen Einsätze und abgeschlossenen Dienste der letzten zwei Jahre, einige Funktionsinhaber mit Pauschalen und ein ausgezahlter Lauf für das Vorjahr.
- Geräte: Vorlage DGUV 305-002, die Fahrzeuge und je Fahrzeug Atemschutz, Leiter, Elektro, Feuerlöscher, Funk und einzelne Schläuche mit früheren Prüfungen (einige überfällig) und einzelnen Mängeln.
- Kostenersatz: Behörde und Material in den Einstellungen; drei BMA-Fehlalarme als kostenpflichtig markiert, davon ein erlassener Bescheid und ein Entwurf.
- Beförderungen: Regeln aus der Vorlage VwV 2022 und eine Beförderungsliste (Entwurf) zur Hauptversammlung im Januar des Folgejahres.
- Arten von Diensten (Vorlage BW) und je Einsatzabteilung ein Übungsdienst alle zwei Wochen im laufenden Jahr; vergangene Dienste mit Anwesenheit, ältere als zwei Wochen abgeschlossen. Dazu vier Sonderdienste (Unterstützung Gerätewart, Brandschutzerziehung): drei vergangene mit Anwesenheit, abgeschlossen und mit dem Satz für Sonderdienste entschädigt, einer geplant.

Ein fester Zufallsstartwert je Schritt erzeugt bei jedem Lauf dieselben Daten. Ein erneuter Lauf legt nichts doppelt an, sondern aktualisiert nur.

## Tests

| Art | Werkzeug | Dateien |
| --- | --- | --- |
| Unit-Tests | Jest | `*.spec.ts` |
| Integrationstests | Vitest mit `unplugin-swc` (Decorator-Metadaten für NestJS) und `supertest` | `apps/server/src/*.integration.ts` |

- **E2E-Tests** (Playwright, `e2e/*.e2e.ts`, Konfiguration `e2e/playwright.config.ts`) laufen gegen eine laufende Anwendung mit Demodaten (`FORGA_E2E_URL`, Vorgabe `http://localhost:4200`). Lokal nutzen sie das installierte Chrome, in CI das Playwright-Chromium. Sie melden sich mit den Benutzern aus `npm run seed` an.
  - `incident-report.e2e.ts`: Der Gruppenführer der Abteilung Musterstadt legt einen Einsatz an, teilt drei Personen auf ein Fahrzeug ein (eine unter Atemschutz; die vorgeschlagenen Atemschutzgeräte werden übernommen), füllt Lage, Verlauf und Statistik aus und meldet fertig. Der Kommandant gibt zurück, der Gruppenführer ergänzt die Ursache und meldet erneut, der Kommandant gibt zur Entschädigung und dann zur Abrechnung frei. Danach ist der Bericht für den Gruppenführer gesperrt.
  - `organization.e2e.ts`: Der Administrator legt eine Führungseinheit mit Wache und Fahrzeug an, ändert sie, versucht sie mit Wache zu löschen (abgelehnt) und löscht dann Fahrzeug, Wache und Einheit.
  - `persons.e2e.ts`: Der Kommandant legt eine Person in Probezeit an, pflegt Stammdaten, trägt einen bestandenen Lehrgang ein (Qualifikation entsteht), nimmt endgültig auf, befördert, trägt ein Amt ein, ergänzt eine zweite Abteilung und erfasst den Austritt.
  - `masterdata.e2e.ts`: Fahrzeuge, Lehrgangsplanung (Kandidat vormerken) und Kataloge (Eintrag anlegen und deaktivieren).
  - `incident-admin.e2e.ts`: Der Kommandant nutzt Offene Berichte, Entschädigung, EvD-Dienst (Dienst anlegen und löschen), Jahresstatistik (Wert korrigieren und Korrektur entfernen) und die Einstellungen.
  - `impersonation.e2e.ts`: Der Administrator meldet sich als Gruppenführer an, sieht den Hinweis und das eingeschränkte Menü und kehrt zurück; das Audit-Log enthält das Ende.
  - `roles.e2e.ts`: Der Administrator stellt für eine Rolle ein, ob eine Berechtigung im zugewiesenen Bereich oder in allen Abteilungen gilt, und setzt die Standardrolle auf die Vorlage zurück.
  - `training.e2e.ts`: Der Kommandant plant einen laufenden Dienst für die Abteilung Musterstadt (Reiter „Geräte“ des Moduls Geräte), der Gruppenführer trägt sich über den Code des QR-Codes ein, der Kommandant ergänzt die Anwesenheit, speichert, schließt den Dienst ab, öffnet ihn aus Monats- und Wochenkalender und öffnet die Dienstbeteiligung.
  - `respiratory-protection.e2e.ts`: Der Atemschutzgerätewart filtert die Tauglichkeit nach Rot, öffnet eine Person, trägt im Reiter „Atemschutz“ eine Unterweisung ein und erfasst in der Schnellerfassung eine Belastungsübung für zwei Geräteträger.
  - `compensation.e2e.ts`: Die Verwaltung/Kasse erfasst einen Posten von Hand, legt einen Lauf an, sieht Personen, Posten und Hinweise, löscht den Entwurf und den Posten wieder und erzeugt die Funktionspauschalen.
  - `cost-recovery.e2e.ts`: Der Kommandant erstellt für einen kostenpflichtigen Einsatz einen Bescheid, ergänzt Material, gibt ihn zur Prüfung, erlässt ihn und hebt ihn wieder auf.
  - `equipment.e2e.ts`: Der Gerätewart prüft einen Pressluftatmer der Abteilung Musterstadt mit Checkliste, der Gruppenführer meldet über die Geräteseite einen Mangel, der Gerätewart behebt ihn; fällige Prüfungen, QR-Etiketten, ein PDF als Anhang einer Prüfung und eine Unterkategorie im Kategorienbaum.
  - `promotions.e2e.ts`: Der Kommandant prüft die Vorschau mit Erklärung, legt eine Beförderungsliste an, entscheidet einen Eintrag mit Kommentar, beschließt, lädt die Urkunden, öffnet wieder und löscht; Regeln in Worten.
  - `self-service.e2e.ts`: Ein Mitglied öffnet „Mein Bereich“, ändert die Mobilnummer (und zurück), entschuldigt sich für den nächsten Dienst und nimmt es zurück, sucht ein Gerät für eine Mangelmeldung.
  - `shell.e2e.ts`: „Passwort vergessen?“, Seite zum Zurücksetzen (ungültiger Link), globale Suche, Datenschutz-Prüfung, Vollexport, Wappen und Einwohnerzahl in den Einstellungen, Reiter „Anmeldung“ (OIDC).
  - Die Tests laufen nacheinander (`workers: 1`), weil sie dieselbe Instanz nutzen.
  - Jeder Lauf legt einen Einsatz mit der Leitstellennummer `E2E-<Zeitstempel>` an. Personen aus früheren Läufen erzeugen Doppelungswarnungen, die der Test begründet.
  - Ergebnisse und Traces liegen in `dist/e2e-results`, der Bericht in `dist/e2e-report`.
- Die Integrationstests laufen gegen die Datenbank aus `TEST_DATABASE_URL`. Ohne Angabe nutzen sie `forga_test` auf der Entwicklungsdatenbank (Port 5433).
- Vor jeder Testdatei löscht `resetTestDatabase()` (`apps/server/src/testing/test-database.ts`) die f.orga-Schemas und spielt alle Migrationen neu ein.
- `testing/test-app.ts` startet die komplette Nest-Anwendung gegen die leere Testdatenbank (`startTestApp`) und führt die Ersteinrichtung aus (`setUp`). Dabei sammelt sie E-Mails nur im Speicher (`FORGA_MAIL_TRANSPORT=memory`) und schaltet den automatischen Versand der Sammel-E-Mail, die tägliche Aufbewahrungsprüfung und die tägliche Ampelprüfung ab (`FORGA_DIGEST_SCHEDULER=off`, `FORGA_RETENTION_SCHEDULER=off`, `FORGA_STATUS_SCHEDULER=off`).
- **PostgreSQL-Werkzeuge** (`pg_dump`, `pg_restore`, `psql` der Version 17) braucht das Modul Datensicherung, auch `backup.integration.ts`. Sie kommen aus `FORGA_PG_BIN` (Ordner, relativ zum Repository) oder aus dem `PATH`; die CI installiert `postgresql-client-17` aus dem PGDG-Repository (`/usr/lib/postgresql/17/bin`). Die Verbindung kommt aus `TEST_DATABASE_URL`. Fehlen die Werkzeuge lokal oder sind sie älter: `FORGA_PG_BIN=tools/pg-docker npm run integration`. Die Wrapper in `tools/pg-docker/` rufen das gleichnamige Werkzeug im Datenbank-Container von `docker/compose.dev.yml` auf (`docker exec`, Container `FORGA_PG_CONTAINER`, Standard `docker-db-1`) und reichen Benutzer, Passwort und Datenbank aus den `PG*`-Variablen weiter (Host und Port nicht, im Container gilt der Socket). Für den Entwicklungsserver: `FORGA_PG_BIN=<repository>/tools/pg-docker` und `FORGA_BACKUP_ROOT=<ordner>` in `apps/server/.env` eintragen; ohne `FORGA_BACKUP_ROOT` zeigt das Modul nur einen Hinweis. Nach einer Wiederherstellung beendet sich der Server; `npm run dev` neu starten.
- Testdateien:
  - `backup.integration.ts`: Rechte (`backup.manage`, kein API-Token), ohne `FORGA_BACKUP_ROOT` nur lesbar, Passphrase verschlüsselt und nur schreibbar (nicht in Antworten, Historie mit `••••••`), Ziel unterhalb der Wurzel, „Jetzt sichern“ mit Prüfung, Wiederherstellung testen in eine temporäre Datenbank, Herunterladen mit Audit, fremde und hochgeladene Dateien, Löschen, geplante Sicherung mit Aufbewahrung, Fehlschlag mit Aufgabe und E-Mail an `backup.notify`, Ablehnung bei falschem Namen, falscher Passphrase und neuerer Version, gescheitertes Einspielen lässt die Datenbank unverändert, Wiederherstellung mit Wartungsmodus (`503`), Tausch der Datenbanken und Abschluss nach dem Neustart (eigene, temporäre Datenbanken `<testdatenbank>_restore_…`/`_before_…`)
  - `history.integration.ts`: Historie und optimistisches Sperren auf ORM-Ebene
  - `security.integration.ts`: Einrichtung und Anmeldung, CSRF-Schutz, Rechte je Abteilung, API-Tokens, Modulsperre (auch Listen und Importe), Rechte aus Rollenvorlagen bei Installation und Update, Historie mit Lesezugriff und ohne Geheimnisse, Sitzungsende nach Passwortänderung, fehlgeschlagene Ereignis-Handler, keine Rechteausweitung über Benutzer- und Rollenverwaltung
  - `catalog.integration.ts`: Löschen von Katalogeinträgen: unbenutzt (mit Recht und Historie), benutzt in einer Personalakte, im Personal eines Einsatzberichts und in Einstellungen (Funktionspauschale, Beförderungsregel, Probezeit-Qualifikationen) mit `catalog.inUse` je Modul, vom Code benötigte Einträge (`catalog.required`)
  - `masterdata.integration.ts`: Katalogvorlagen, Organisation, Personen mit Probezeit und Aufnahme, Sichtbarkeit und sensible Felder je Abteilung, maskierte Historie, Lehrgangsplanung (Prüfung der Vormerkungen, Sammeländerung, nicht bestanden schließt die Vormerkung, Bestätigung bei vorhandenen Qualifikationen, gesperrte Termine, Bedarf nach zugelassenem Status), Lehrgangsbeauftragter, Austritt mit Ereignis, `PERSON_DIRECTORY`, Ehrungsurkunden als Serien-PDF, Ämter und Dienstgrade je Berechtigungsbereich, Verschieben von Abteilungen (Rollenrecht, Audit, Zyklen), Plausibilität von Status, Alter und Daten, keine Übernahmen im Voraus
  - `incidents.integration.ts`: Einsätze und Berichte, Entschädigung, Prüfregeln, Fertigmelden mit bestätigten Warnungen, Zurückgeben (mit E-Mail an den Verfasser), Freigabe mit Sperre und Ereignis, Sperre aufheben, Hauptberichtwechsel, Historie und Leserechte, Fristen, externe API, Listen, Abrechnungsexport, Dienstplan mit iCal-Import, Jahresstatistik mit Korrekturen und Export in die Landesvorlage
  - `training.integration.ts`: Modulname „Dienste“, Arten von Diensten mit Kategorie (Sonderdienste der Vorlage), Filter nach Kategorie, Sonderdienste ohne Einfluss auf die Dienstbeteiligung, Planung, Serien und Übernahme eines Zeitraums je Abteilung, Anhänge (entfernt mit dem Dienst), Anwesenheit, Abschluss mit Ereignis, Dienstbeteiligung, QR-Check-in (unbestätigt sperrt den Abschluss, während der Bearbeitung eingegangene Check-ins bleiben erhalten, erneutes Speichern bestätigt), wechselnder Code (alter oder gefälschter abgelehnt) nur für Mitglieder der Abteilungen, Prüfung der Zeiten und kein Erfassen oder Abschließen vor Beginn, Kalender-Abo, Import und Dienstbuch
  - `respiratory-protection.integration.ts`: Geräteträger je Abteilung, Untersuchungen nur mit Recht für Gesundheitsdaten (Ergebnis Pflicht, „gültig bis“ nach dem Datum und im Intervall, „Bedenken“ nur für Berechtigte sichtbar), Mindestarbeit der Belastungsübung, Nachweise aus Diensten und Einsatzberichten (Ersetzen, Zurückziehen, Stichwort und Nummer), Ampelwechsel mit E-Mail an den Atemschutzgerätewart (nachgeholt nach fehlgeschlagenem Versand), Schutz fremder Nachweise, einstellbare Regel, Listen, Fristen und Import mit Ergebnis
  - `duty-officer.integration.ts`: Dienstplan (Vorlage der Dienstarten, iCal-Import, Pauschale über das Ereignis, Blatt „EvD-Dienste“, Rechte), EvD-Bericht zu neuen Einsätzen (auch als einziger Bericht auf Wunsch) aus Oberfläche und API (nicht beim Import, nicht bei ausgeschalteter Einstellung), Verfasser aus dem Dienstplan, Schreibrecht des EvD statt der Abteilungsschreiber, Freigabe, „Kein EvD bei diesem Einsatz“ und „EvD-Bericht anlegen“, Aufgabe „EvD-Bericht fehlt“, Posten zur Stammabteilung und `dutyOfficerReportPaid`, „Personal EvD“ im Kostenbescheid und Erlass erst nach Freigabe des EvD-Berichts, inaktives Modul
  - `compensation.integration.ts`: Posten aus Freigaben und Diensten ohne Doppelung (auch bei Übernahme), Sonderdienste mit eigenem Satz („Sonderdienst · …“, nur Status aus `paidStatuses`), Sichtbarkeit je Abteilung, Lauf mit Prüfung, Verdienstausfall und Abschluss, Excel und Überweisungsdatei, Korrekturposten, Posten von Hand, Funktionspauschalen, Jahressummen und Listen
  - `cost-recovery.integration.ts`: kostenpflichtige Einsätze mit Vorschlag, Berechnung nach VOKeFw und Satzung (Takt, Fahrzeugzeiten), Begründungspflicht, Erlass mit PDF, Sollstellung (Excel und CSV mit gewählten Spalten), Widerspruch, Zahlungsimport (mit Teilzahlung), Personal nach Laufbahn, Tatbestand aus dem Bericht, Änderungsbescheid, Listen, Adressbuch
  - `equipment.integration.ts`: Vorlage DGUV 305-002 (Fahrzeuge nach Gewichtsklasse, Schläuche als Einzelstücke) und Fahrzeuge, Geräte je Abteilung, reduzierte Ansicht für Meldende, erste Fälligkeit aus Beschaffung oder übernommenen Prüfungen, eigene Intervalle, Barcode und RFID-Chip mit Code-Suche (auch für Meldende), Prüfungen mit Qualifikationshinweis und Datumsprüfung, Korrigieren und Stornieren, Prüfung nach Wäsche, Sammelprüfung, Mängel mit Status (nicht bestanden bleibt fällig, behoben nur mit Erledigung und danach „in Prüfung“), Atemschutzgeräte beim Atemschutzgerätewart (Mängel, E-Mails, Fristen), Sperre bei überfälliger Prüfung, Etiketten, Verwendung im Bericht und Dienst nur mit Zugriff darauf, Prüfungen nach Einsatz, Aussonderung, Schutz der Organisation, Listen, Fristen, Suche und Import je Prüfart
  - `clothing.integration.ts`: Artikelvorlage, Stücke mit Ausgabe und Verlauf der Person, Barcode und RFID-Chip mit Code-Suche, Wäsche und Imprägnieren, Prüfungen, Austritt nur ohne zugeordnete Schutzausrüstung; Datumsprüfungen (Zukunft, vor Anschaffung oder letzter Rücknahme), keine Ausgabe an die Altersabteilung, Sperre nach nicht bestandener Prüfung (Frist bleibt) und „zur Wäsche“, überfällige Prüfung nur mit Bestätigung, Ausgabe und Rücknahme mehrerer Stücke (alle oder keines), Stornieren mit Grund, Größen gegen den Artikel, inaktive Artikel, Bestand nach Größe mit Mindestbestand und Zähler der Verbrauchsartikel, Größen der Person, Code-Suche eigener Stücke für Mitglieder
  - `mp-feuer.integration.ts`: Modul MP-Feuer mit erzeugten Transferdateien (`testing/mp-feuer.ts`): Ablehnung fremder Dateien, Archive mit Vorschlag und gemerkter Abteilung, Datensätze in Reihenfolge, Probelauf ohne Änderung und Pflicht zum Probelauf, Übernahme im Hintergrund mit Zählern, Bericht und CSV, `managedBy: mp-feuer`, gelöschte Zeilen, Audit je Lauf und Teil, idempotente Wiederholung, Verwerfen, Einsätze erst ab einem Datum; Zuordnungen in `mp_feuer.mapping` (nicht an den Einträgen, nicht in der Liste des Tabellen-Imports) mit Zusatzzielen, Sammeleintrag, Löschen und inaktivem Ziel; Teile mit ungeteilten Einsätzen, Fortschritt, ein Lauf zugleich, Abbruch nach einem Teil und Ergänzung durch einen neuen Lauf, unterbrochener Lauf; Rechte, gesperrte Datensätze, abgeschaltete Module
  - `mp-feuer-parallel.integration.ts`: Parallelbetrieb über Läufe des Moduls: gemerkte Auswahl, Schutz der Berichte, gemeldete Freigaben, Korrekturen, Weiterführen in f.orga
  - `import-mappings.integration.ts`: gemerkte Zuordnungen des Tabellen-Imports: nach der Übernahme gemerkt, im nächsten Import angewandt, inaktives Ziel nicht angewandt, Löschen mit Audit, Zusatzziele, `managedBy: import`, Recht eines Importprofils
  - `other-course.integration.ts`: Sammellehrgang „Anderer Lehrgang“: BW-Vorlage (Lehrgang ohne Qualifikation), Beschreibung Pflicht (auch bei „Teilnahme erfassen“), „bestanden“ je Beschreibung, Anzeige in „Lehrgänge im Jahr“, nicht im Lehrgangsbedarf und nicht in der Qualifikationsmatrix; Werdegang-Import mit Ziel `course:other-course` (Teilnahme mit Beschreibung, ohne Qualifikation, wiederholt unverändert) und mit Lehrgangsnamen (Teilnahme vermittelt die Qualifikationen)
  - `oidc.integration.ts`: Anmeldung über einen nachgebildeten OpenID-Anbieter: aus bis eingerichtet, geheimes Client-Secret, Verknüpfung über die E-Mail-Adresse, danach über das Subject, unbekannte Konten, gefälschter State, abgelaufene Anmeldung, Verknüpfung lösen
  - `plugins.integration.ts`: signiertes Paket im Plugin-Verzeichnis wird beim Start installiert und geladen, sein Controller nutzt Dienste des Servers, Frontend unter `/modules/<id>/`, Liste mit Unterzeichner, Ablehnung unsignierter, fremd signierter, eingebauter und kaputter Pakete, Update für den nächsten Start, Entfernen
  - `promotions.integration.ts`: Auswertung mit fehlenden Bedingungen und Vorschau, Sichtbarkeit je Abteilung, Ausschluss (auch ausgegraut im Entwurf), Liste mit Vorschlägen der Abteilung, Begründungspflicht, Beschluss, Urkunden, Durchführung in die Personalakte, Audit-Einträge zu Beschluss und Durchführung, Zählung nur sichtbarer Einträge in der Übersicht, Ablehnung bei geändertem Dienstgrad
  - `self-service.integration.ts`: „Mein Bereich“ eines Mitglieds: eigene Akte ohne interne Bemerkungen, Kontaktdaten und Bankverbindung mit Versionsprüfung, Dienste der eigenen Abteilung mit Entschuldigung und Zurücknehmen, eigener Atemschutzstand, Mangelmeldung mit Gerätesuche, Foto als Anhang (Typprüfung) und E-Mail an den Gerätewart der Abteilung und eigenen Meldungen; kein Zugriff auf fremde Daten
  - `retention.integration.ts`: Aufbewahrungsplan: ohne Fristen wird nichts gelöscht, Rechte (`core.retention.manage`, Probelauf mit eigenen Regeln nur für Verwalter der Einstellungen), Vorlage „Kommunaler Aktenplan (Beispiel)“ erst mit Speichern (wirksame Frist der Grunddaten), Probelauf je Unterart mit „30 Jahre aufbewahren (Sonderfall)“ (Rechte, Audit, Historie), Anonymisieren von Einsätzen ohne Änderung der Jahresstatistik, Anbieten mit ZIP-Export (Anhänge, Verzeichnis, CSV, JSON), Kassation und Löschen samt Anhängen, Zurückstellen, Übernahme und Anonymisieren der Personalakte (auch Daten anderer Module), Blockade durch offenen Kostenbescheid, Aufräumen fälliger Fälle, Historie in einem Zug löschen
  - `setup.integration.ts`: gleichzeitige Ersteinrichtung legt genau einen Administrator an
  - `shell-foundations.integration.ts`: Personenimport mit MP-Feuer-Überschriften (Vorschläge, Probelauf, Anlegen fehlender Abteilungen, Idempotenz), Listen als JSON, PDF, Excel und CSV, Fristen und Sammel-E-Mail

## Projektverweise

`npm run typecheck` schlägt fehl, wenn die TypeScript-Projektverweise nicht zu den Abhängigkeiten in den `package.json`-Dateien passen (Meldung „The workspace is out of sync“). Dann `npx nx sync` ausführen und die geänderten `tsconfig`-Dateien mit committen.

## Migrationen

**Bis zum ersten Release gibt es keine fortlaufenden Migrationen:** Core und jedes Modul haben genau eine Migration `initial`. Nach einer Änderung an Entitäten werden alle Migrationen neu erzeugt und die Entwicklungsdatenbank neu angelegt:

```bash
npm run migration:reset   # löscht alle Migrationen, erzeugt je Modul eine neue `initial`
```

1. `migration:reset` arbeitet in einer eigenen, vorübergehenden Datenbank (`forga_migration_reset`, anderer Name über `FORGA_RESET_DATABASE`, z. B. je Worktree). Ein laufender Entwicklungsserver bleibt ungestört. Integrationstests nutzen `TEST_DATABASE_URL` (Standard `forga_test`).
2. Danach die Entwicklungsdatenbank neu anlegen. Der Server spielt die neuen Migrationen beim nächsten Start ein, `npm run seed` füllt die Demodaten.
3. Datenmigrationen (`--blank`) braucht es bis dahin nicht.

Die einzelnen Befehle (ab dem ersten Release wieder der normale Weg):

```bash
npm run migration:create -- <modul|core> <name>   # z. B. masterdata persons
npm run migration:run
```

`migration:create` geht so vor:

1. Es spielt die ausstehenden Migrationen in die Entwicklungsdatenbank ein.
2. Es vergleicht die Entitäten mit der Datenbank.
3. Es übernimmt nur die Anweisungen, die das Schema des gewählten Moduls ändern. Änderungen anderer Module bleiben für deren eigene Migration übrig.
4. Es legt die Datei in `src/migrations` des Moduls ab und trägt sie in die `index.ts` dort ein.

Verweist eine Anweisung auf das Schema eines Moduls, das nicht in `requires` steht, bricht der Befehl ab. Migrationen nie von Hand anlegen.

Für Datenänderungen ohne Schemaänderung (z. B. Werte bereinigen) legt `npm run migration:create -- <modul|core> <name> --blank` eine leere, schon eingetragene Migration an; das SQL kommt in deren `up`.

Indizes, die MikroORM nicht aus Eigenschaften ableiten kann (z. B. partielle Indizes), werden in der Entität mit `expression` deklariert, wie `report_one_primary_per_incident` in `incidents.entities.ts`. Stehen sie nur in einer Migration, erzeugt `migration:create` beim nächsten Lauf Anweisungen, die sie wieder löschen.

## CI

`.github/workflows/ci.yml` läuft bei jedem Push auf `main` und bei Pull Requests:

1. Lint und Modulgrenzen
2. Typprüfung
3. Unit-Tests
4. Integrationstests mit einem PostgreSQL-17-Dienst
5. Build
6. Bau des Docker-Images

## Neues Modul anlegen

Beispiel-ID `<m>`: englisch, Kleinbuchstaben, Bindestriche erlaubt.

1. **Contracts:** `npx nx g @nx/js:library modules/<m>/<m>-contracts --bundler=tsc --linter=none --unitTestRunner=jest`.
   - Das Manifest heißt `<M>_MANIFEST`.
   - Name, Berechtigungen und Navigation brauchen `{ de, en }`.
2. **Backend:** `npx nx g @nx/nest:library modules/<m>/<m>-api --buildable --linter=none --unitTestRunner=jest`.
   - In `package.json` `"type": "module"` setzen.
   - `src/migrations/index.ts` mit `<M>_MIGRATIONS` anlegen.
   - Das Modul mit `defineModule` exportieren und in `apps/server/src/app/installed-modules.ts` eintragen.
   - Das Datenbankschema heißt wie die Modul-ID, mit `_` statt `-`.
3. **Frontend:** `npx nx g @nx/react:provider modules/<m>/<m>-web --bundler=vite --consumer=shell`.
   - In `vite.config.mts` nach dem Muster der vorhandenen Module `base: '/modules/<m>/'` setzen, `./Module` exponieren und `SHARED` aus `tools/federation.mts` verwenden.
   - `src/module.tsx` exportiert `defineWebModule({ routes, translations: { de, en } })`.
   - Den Port in `MODULE_PORTS` eintragen.
4. **Tags:** In jedem neuen Projekt `scope:module-<m>` und `type:contracts|api|web` setzen.
5. **Abhängigkeiten:** Abhängigkeiten zwischen Workspace-Paketen in der jeweiligen `package.json` eintragen, danach `npm install` und `npx nx sync` ausführen.

## Konventionen

- **Sprache des Codes:** Englisch. Das gilt für Bezeichner, Kommentare, Datei- und Ordnernamen, API-Pfade, Datenbank-Schemas und -Tabellen, Berechtigungs-IDs und Testnamen. Die Zuordnung zu den deutschen Fachbegriffen steht im [Glossar](../geplant/fachmodell.md#glossar-fachbegriff--code).
- **Oberfläche:** zweisprachig. Jede sichtbare Zeichenkette läuft über einen Übersetzungsschlüssel mit Einträgen für `de` und `en`.
  - Module legen ihre Texte in `translations` ab, gemeinsame Texte liegen im Namespace `common` des `web-sdk`.
  - Texte vom Server sind `LocalizedText`.
  - Neue Fehlercodes des Servers bekommen einen Eintrag unter `errors.<code>` in `common`.
- **Importe:** Backend-Bibliotheken sind ESM mit `moduleResolution: nodenext`. Relative Importe enden deshalb auf `.js`.
- **Modulgrenzen:** Module importieren voneinander nur `-contracts`-Pakete.
- **Dokumentation:** Deutsch. Sie beschreibt immer den aktuellen Stand.
