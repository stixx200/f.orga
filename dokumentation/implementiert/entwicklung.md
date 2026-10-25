# Entwicklung

## Voraussetzungen

- Node.js 24 und npm 11
- Docker für die Datenbank

## Einrichten

```bash
npm install
docker compose -f docker/compose.dev.yml up -d   # PostgreSQL auf Port 5433
```

Nx lädt beim Start des Servers die Datei `apps/server/.env` mit `DATABASE_URL`. Ausstehende Migrationen spielt der Server beim Start selbst ein.

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

- Ersteinrichtung, falls nötig: „Freiwillige Feuerwehr Musterstadt“, Administrator aus `FORGA_ADMIN_USER` / `FORGA_ADMIN_PASSWORD` (Vorgabe `admin` / `sehr-geheim-123`). Server-Adresse aus `FORGA_URL` (Vorgabe `http://localhost:3000`). Die Ersteinrichtung braucht den Einrichtungsschlüssel in `FORGA_SETUP_TOKEN` (aus dem Protokoll des Servers oder derselbe Wert, mit dem der Server gestartet wurde).
- Einstellungen der Feuerwehr, BW-Vorlagen (Kataloge, Lehrgänge, Alarmstichworte) und die Standardrollen.
- Vier Einsatzabteilungen, Altersabteilung und Jugendfeuerwehr, je ein Feuerwehrhaus und zehn Fahrzeuge.
- Rund 140 Personen über den Personenimport aus einer erzeugten Datei im Format des MP-Feuer-Exports `Personal.xlsx`, dazu Qualifikationen und Dienstgrade nach Dienstjahren.
- Ein Benutzer je Standardrolle: Benutzername = Schlüssel der Rolle (z. B. `commander`, `group-leader`), Passwort aus `FORGA_SEED_PASSWORD` (Vorgabe `demo-passwort-2026`). Abteilungskommandant, Gruppenführer und Mitglied gelten für die Abteilung Musterstadt; das Mitglied ist ein Atemschutzgeräteträger, damit alle Abschnitte von „Mein Bereich“ Inhalt haben.
- Einsätze seit Anfang des Vorjahres über den Import „Einsätze aus MP-Feuer“ aus einer erzeugten Datei im Format von `MP-EXCEL.xlsx`. Ältere Berichte sind zur Abrechnung freigegeben, jüngere zur Entschädigungsauszahlung oder noch in Bearbeitung.
- EvD-Dienstplan für 16 Wochen über den iCal-Import.
- Atemschutz-Nachweise (Untersuchung, Unterweisung, Belastungsübung, Einsatzübung) für alle Geräteträger: die meisten einsatzbereit, einige laufen bald ab, einige sind nicht einsatzbereit.
- Entschädigungen: Übernahme der freigegebenen Einsätze und abgeschlossenen Dienste der letzten zwei Jahre, einige Funktionsinhaber mit Pauschalen und ein ausgezahlter Lauf für das Vorjahr.
- Geräte: Vorlage DGUV 305-002, die Fahrzeuge und je Fahrzeug Atemschutz, Leiter, Elektro, Feuerlöscher, Funk und einzelne Schläuche mit früheren Prüfungen (einige überfällig) und einzelnen Mängeln.
- Kostenersatz: Behörde und Material in den Einstellungen; drei BMA-Fehlalarme als kostenpflichtig markiert, davon ein erlassener Bescheid und ein Entwurf.
- Beförderungen: Regeln aus der Vorlage VwV 2022 und eine Beförderungsliste (Entwurf) zur Hauptversammlung im Januar des Folgejahres.
- Arten von Diensten (Vorlage BW) und je Einsatzabteilung ein Übungsdienst alle zwei Wochen im laufenden Jahr; vergangene Dienste mit Anwesenheit, ältere als zwei Wochen abgeschlossen.

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
- Testdateien:
  - `history.integration.ts`: Historie und optimistisches Sperren auf ORM-Ebene
  - `security.integration.ts`: Einrichtung und Anmeldung, CSRF-Schutz, Rechte je Abteilung, API-Tokens, Modulsperre (auch Listen und Importe), Rechte aus Rollenvorlagen bei Installation und Update, Historie mit Lesezugriff und ohne Geheimnisse, Sitzungsende nach Passwortänderung, fehlgeschlagene Ereignis-Handler, keine Rechteausweitung über Benutzer- und Rollenverwaltung
  - `masterdata.integration.ts`: Katalogvorlagen, Organisation, Personen mit Probezeit und Aufnahme, Sichtbarkeit und sensible Felder je Abteilung, maskierte Historie, Lehrgangsplanung, Lehrgangsbeauftragter, Austritt mit Ereignis, `PERSON_DIRECTORY`, Ehrungsurkunden als Serien-PDF
  - `incidents.integration.ts`: Einsätze und Berichte, Entschädigung, Prüfregeln, Fertigmelden mit bestätigten Warnungen, Zurückgeben (mit E-Mail an den Verfasser), Freigabe mit Sperre und Ereignis, Sperre aufheben, Hauptberichtwechsel, Historie und Leserechte, Fristen, externe API, Listen, Abrechnungsexport, Dienstplan mit iCal-Import, Jahresstatistik mit Korrekturen und Export in die Landesvorlage
  - `training.integration.ts`: Arten von Diensten, Planung, Serien und Übernahme eines Zeitraums je Abteilung, Anhänge (entfernt mit dem Dienst), Anwesenheit, Abschluss mit Ereignis, Dienstbeteiligung, QR-Check-in (unbestätigt sperrt den Abschluss, während der Bearbeitung eingegangene Check-ins bleiben erhalten, erneutes Speichern bestätigt), wechselnder Code (alter oder gefälschter abgelehnt) nur für Mitglieder der Abteilungen, Prüfung der Zeiten und kein Erfassen oder Abschließen vor Beginn, Kalender-Abo, Import und Dienstbuch
  - `respiratory-protection.integration.ts`: Geräteträger je Abteilung, Untersuchungen nur mit Recht für Gesundheitsdaten (Ergebnis Pflicht, „gültig bis“ nach dem Datum und im Intervall, „Bedenken“ nur für Berechtigte sichtbar), Mindestarbeit der Belastungsübung, Nachweise aus Übungsdienst und Einsatzberichten (Ersetzen, Zurückziehen, Stichwort und Nummer), Ampelwechsel mit E-Mail an den Atemschutzgerätewart (nachgeholt nach fehlgeschlagenem Versand), Schutz fremder Nachweise, einstellbare Regel, Listen, Fristen und Import mit Ergebnis
  - `compensation.integration.ts`: Posten aus Freigaben und Diensten ohne Doppelung (auch bei Übernahme), Sichtbarkeit je Abteilung, Lauf mit Prüfung, Verdienstausfall und Abschluss, Excel und Überweisungsdatei, Korrekturposten, Posten von Hand, Funktionspauschalen, Jahressummen und Listen
  - `cost-recovery.integration.ts`: kostenpflichtige Einsätze mit Vorschlag, Berechnung nach VOKeFw und Satzung (Takt, Fahrzeugzeiten), Begründungspflicht, Erlass mit PDF, Sollstellung (Excel und CSV mit gewählten Spalten), Widerspruch, Zahlungsimport (mit Teilzahlung), Personal nach Laufbahn, Tatbestand aus dem Bericht, Änderungsbescheid, Listen, Adressbuch
  - `equipment.integration.ts`: Vorlage DGUV 305-002 (Fahrzeuge nach Gewichtsklasse, Schläuche als Einzelstücke) und Fahrzeuge, Geräte je Abteilung, reduzierte Ansicht für Meldende, erste Fälligkeit aus Beschaffung oder übernommenen Prüfungen, eigene Intervalle, Barcode und RFID-Chip mit Code-Suche (auch für Meldende), Prüfungen mit Qualifikationshinweis und Datumsprüfung, Korrigieren und Stornieren, Prüfung nach Wäsche, Sammelprüfung, Mängel mit Status (nicht bestanden bleibt fällig, behoben nur mit Erledigung und danach „in Prüfung“), Atemschutzgeräte beim Atemschutzgerätewart (Mängel, E-Mails, Fristen), Sperre bei überfälliger Prüfung, Etiketten, Verwendung im Bericht und Dienst nur mit Zugriff darauf, Prüfungen nach Einsatz, Aussonderung, Schutz der Organisation, Listen, Fristen, Suche und Import je Prüfart
  - `clothing.integration.ts`: Artikelvorlage, Stücke mit Ausgabe und Verlauf der Person, Barcode und RFID-Chip mit Code-Suche, Wäsche und Imprägnieren, Prüfungen, Austritt nur ohne zugeordnete Schutzausrüstung; Datumsprüfungen (Zukunft, vor Anschaffung oder letzter Rücknahme), keine Ausgabe an die Altersabteilung, Sperre nach nicht bestandener Prüfung (Frist bleibt) und „zur Wäsche“, überfällige Prüfung nur mit Bestätigung, Ausgabe und Rücknahme mehrerer Stücke (alle oder keines), Stornieren mit Grund, Größen gegen den Artikel, inaktive Artikel, Bestand nach Größe mit Mindestbestand und Zähler der Verbrauchsartikel, Größen der Person, Code-Suche eigener Stücke für Mitglieder
  - `mp-feuer-transfer.integration.ts`: Datenübernahme aus erzeugten MP-Feuer-Transferdateien (zwei Abteilungen): Ablehnung fremder Dateien, Reihenfolge der Datensätze, aktuelle, ausgeschiedene und in die Altersabteilung gewechselte Personen ohne die abteilungsweisen Personalnummern, Lehrgänge, Dienstgrade und Ehrungen über den Katalog, G26 und Belastungsübung, Dienste mit Anwesenheit, Einsätze mit Bericht, Statistik und Personal (wiederholbar), Verwerfen
  - `oidc.integration.ts`: Anmeldung über einen nachgebildeten OpenID-Anbieter: aus bis eingerichtet, geheimes Client-Secret, Verknüpfung über die E-Mail-Adresse, danach über das Subject, unbekannte Konten, gefälschter State, abgelaufene Anmeldung, Verknüpfung lösen
  - `plugins.integration.ts`: signiertes Paket im Plugin-Verzeichnis wird beim Start installiert und geladen, sein Controller nutzt Dienste des Servers, Frontend unter `/modules/<id>/`, Liste mit Unterzeichner, Ablehnung unsignierter, fremd signierter, eingebauter und kaputter Pakete, Update für den nächsten Start, Entfernen
  - `promotions.integration.ts`: Auswertung mit fehlenden Bedingungen und Vorschau, Sichtbarkeit je Abteilung, Ausschluss (auch ausgegraut im Entwurf), Liste mit Vorschlägen der Abteilung, Begründungspflicht, Beschluss, Urkunden, Durchführung in die Personalakte, Ablehnung bei geändertem Dienstgrad
  - `self-service.integration.ts`: „Mein Bereich“ eines Mitglieds: eigene Akte ohne interne Bemerkungen, Kontaktdaten und Bankverbindung mit Versionsprüfung, Dienste der eigenen Abteilung mit Entschuldigung und Zurücknehmen, eigener Atemschutzstand, Mangelmeldung mit Gerätesuche, Foto als Anhang (Typprüfung) und E-Mail an den Gerätewart der Abteilung und eigenen Meldungen; kein Zugriff auf fremde Daten
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
