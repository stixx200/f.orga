# MP-Feuer-Brücke

**Status: Konzept zur Freigabe.** Mockups: [`mockups/mp-feuer-bruecke/`](../mockups/README.md#mp-feuer-brücke).

Die MP-Feuer-Brücke ist ein eigener Dienst neben f.orga. Sie liest die Dateien von MP-Feuer, ordnet sie zu und übergibt die Daten über die API an f.orga. Später erzeugt sie auch Dateien für den Tabellen-Import von MP-Feuer. f.orga selbst kennt danach kein MP-Feuer-Dateiformat mehr. Der normale Tabellen-Import (Excel, CSV, iCal) bleibt in f.orga, mit allen Profilen.

Code-Name `mp-feuer-bridge` (App `apps/mp-feuer-bridge`), Fachbegriff „MP-Feuer-Brücke“.

## Ziele

- MP-Feuer-spezifischer Code liegt an einer Stelle und läuft nicht im f.orga-Server: Zip- und SQLite-Lesen, Tabellen und Spalten von MP-Feuer, Deutung von Zusatzfeld 2 und Statistik-Schlüssel.
- Die Brücke wird für den [Parallelbetrieb](../../implementiert/parallelbetrieb-mp-feuer.md) gebraucht und danach abgeschaltet, ohne f.orga zu ändern.
- Wöchentliche Datenübernahme in wenigen Schritten, wahlweise ins Echt- oder Testsystem.
- f.orga bekommt eine allgemeine Schnittstelle für Importzeilen. Auch Skripte und andere Systeme können sie nutzen.

## Aufteilung

| Bleibt in f.orga | Zieht in die Brücke | Entfällt |
| --- | --- | --- |
| Tabellen-Import (Hochladen, Spalten zuordnen, Probelauf, Übernahme) mit allen Profilen: Personen, Laufbahn, G26, Belastungsübungen, Dienste, Einsatzpersonal, Stichworte, Inventar, Zahlungen, EvD-Dienstplan | Lesen der Transferarchive `MPTRA_*.zip` (`transfer-archive.ts`: Zip, `transfer.db`, Größengrenzen) | Seite „Import → MP-Feuer-Datenübernahme“ (`TransferImport.tsx`), Umschalter Datei/Datenübernahme |
| Nachschlagelisten, Zusatzziele, „Nicht zugeordnete Bezeichnungen“, Aliasse (`aliases.ts`) | Leser je Datensatz: `persons.transfer.ts`, `career.transfer.ts`, `evidence.transfer.ts`, `sessions.transfer.ts`, `mp-feuer.transfer.ts` mit `transferPersons`, `transferFlag`, `groupRows` | Endpunkte `core/imports/transfers*`, Tabelle `core.import_transfer` |
| Schutz im Parallelbetrieb: `managedBy`, `externalLeading`, `externalEventsFrom`, „In f.orga weiterführen“, `incidents.import.reportEdited` | Deutung von MP-Feuer-Werten: Zusatzfeld 2 → Freigabestatus, „bei Ges. Stat. anzeigen“ → Hauptbericht, Statistik-Schlüssel → Statistik des Einsatzes (`mp-feuer-statistics.ts`) | `TransferReader` und `transfer` an `ImportProfile`, `ImportProfileInfo.transfer`, Option `transfer: false` |
| Gemerkte Funktionsregeln `incidents.importFunctionRules` (gelten für jeden Import) | Gemerkte Auswahl je Ziel: Archiv → Abteilung, Einheit, Überspringen; Optionen je Datensatz | Einstellungsabschnitt `transfer` (`TransferSettings`) |
| Audit `imports.applied` | Spaltenüberschriften der MP-Feuer-Excel-Exporte (z. B. `Zusatzfeld 2`, `Bezeichnung (2)`, `Leitstellen-Nr.`) | Audit `imports.transferApplied` |

### Profil für Einsatzberichte

`incidents.mp-feuer` wird zum allgemeinen Profil **`incidents.personnel`** „Einsatzpersonal (eine Zeile je Person und Bericht)“. Verhalten wie bisher: Einsatz über die Leitstellennummer, Bericht über Abteilung oder Einheit + Einsatznummer + Beginn, idempotent, ein erneuter Import ersetzt nur unbearbeitete Berichte.

- **`managedBy`:** Heute setzt das Profil immer `managedBy: 'mp-feuer'`. Künftig entscheidet die Quelle des Requests (`source.system`, siehe unten): Bei `mp-feuer-bridge` bleibt es `mp-feuer`. Schutz, `externalLeading` und gemeldete Freigaben gelten dann unverändert. Jeder andere Import setzt den neuen Wert `import` (`ReportManagedBy`), auch der Tabellen-Import aus der Oberfläche. Solche Berichte ersetzt ein erneuter Import, solange niemand sie bearbeitet hat. Schreibgeschützt sind sie nicht.
- **Status:** Die Spalte „Freigabestatus“ nimmt `draft`, `released-compensation`, `released-billing` oder die deutschen bzw. englischen Bezeichnungen. Die Brücke übersetzt Zusatzfeld 2 vorher in diese Werte.
- **Hauptbericht:** ja/nein. Die Brücke setzt es aus „bei Ges. Stat. anzeigen“.
- **Statistik:** Statt des MP-Feuer-Textes `statistics` hat das Profil eigene Spalten nach `IncidentStatistics`: `mainType`, `fireSize`, `technicalCategory`, `falseAlarmType`, `ownMunicipality`, `vehicleFire`, `trafficAccident`, `rescued`, `rescuedSmokeInhalation`, `dead`, `animalsRescued`. Die Werte sind Codes oder die Bezeichnungen der Landesvorlage. `statisticsFromMpFeuer` zieht in die Brücke.
- **Überschriften:** Die Felder behalten ihre neutralen Bezeichnungen als Aliasse („Leitstellennummer“, „Beginn“ …). MP-Feuer-Überschriften kennt nur noch die Brücke.
- Weil vor dem ersten Release, wird die ID umbenannt, ohne Migration: Alte Audit-Einträge behalten `incidents.mp-feuer`, gespeicherte Auswahl gibt es in f.orga nicht mehr.

Die übrigen Profile (`masterdata.persons`, `masterdata.career`, `respiratory-protection.examinations`, `respiratory-protection.stress-exercises`, `training.sessions`) bleiben, wie sie sind, nur ohne `transfer`. Bisher nahmen ihre Werte schon Texte wie „jugend“, „anwesend“ oder „entschuldigt“ an. Das bleibt so.

## Schnittstelle f.orga ↔ Brücke

Die Brücke spricht mit f.orga nur über die öffentliche API, mit `Authorization: Bearer forga_…`. Sie kennt keine Interna von f.orga. Die Typen kommen aus `@forga/core-contracts` (Zod).

### Neu in f.orga

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `POST` | `/core/imports/rows` | Recht des Profils | Zeilen ohne Datei importieren (`ImportRowsRequest`, siehe unten). Antwort `ImportResult` |
| `GET` | `/core/imports/lookups/department` | Recht eines Importprofils | Abteilungen (`key` = ID, `name`, dazu `type`), Liste ohne Anlegen, Anmeldung durch `masterdata` |
| `GET` | `/core/imports/lookups/incident-unit` | Recht eines Importprofils | Feuerwehrweite Einheiten aktiver Module, z. B. EvD. Ersetzt `TransferReader.units`, Anmeldung durch `incidents` |
| `GET` | `/core/info` | angemeldet (auch Token) | Name der Feuerwehr, Version, aktive Module, eigene Berechtigungen des Tokens, `incidents.general.externalLeading`. Für die Verbindungsprüfung der Brücke |

`ImportRowsRequest`:

```ts
{
  profile: string;                       // z. B. 'incidents.personnel'
  rows: { row: number; values: Record<string, string> }[]; // Feldschlüssel des Profils, keine Spaltenzuordnung
  options?: Record<string, boolean>;
  mappings?: ImportValueMappings;        // wie beim Dateiimport, werden bei der Übernahme als Alias gemerkt
  dryRun: boolean;
  details?: 'all' | 'messages';          // Standard 'messages': nur Zeilen mit Meldung oder Fehler
  source?: { system: string; runId: string; files?: string[]; chunk?: { index: number; count: number } };
}
```

- **Felder statt Spalten:** Die Werte stehen schon unter den Feldschlüsseln des Profils (`GET /core/imports/profiles` liefert `fields`). Unbekannte Schlüssel ergeben `imports.unknownField`, fehlende Pflichtfelder je Zeile wie bisher `imports.requiredValueMissing`.
- **Grenzen:** höchstens 5 000 Zeilen und 10 MB je Request (`imports.tooManyRows`, `413`). Der JSON-Body-Parser des Servers bekommt dafür für diesen Pfad ein höheres Limit (heute gilt der Standard von 100 kB).
- **Probelauf und Übernahme** laufen wie beim Dateiimport über `ImportRegistry.run`. Die Zuordnungen werden nur bei der Übernahme als Alias gemerkt (`ImportLookup.remember`, Zusatzziele vom anbietenden Modul).
- **Wiederholbar:** Die Profile sind idempotent. Ein nach Zeitüberschreitung wiederholter Teil legt nichts doppelt an. Freigaben werden nur bei einer Änderung erneut gemeldet. Einen eigenen Idempotenzschlüssel braucht es deshalb nicht.
- **Audit:** `imports.applied` je Übernahme-Request mit Profil, Zählern und `source` (System, `runId`, Teil x von y, Dateinamen). In der Audit-Ansicht findet die Suche nach der `runId` alle Teile eines Laufs. Der technische Benutzer des Tokens steht als Benutzer am Eintrag und in der Historie der geänderten Daten.
- **Quelle:** `source.system` ist frei, aber nur `mp-feuer-bridge` bewirkt `managedBy: 'mp-feuer'` am Einsatzbericht.

### Bereits vorhanden und genutzt

`GET /core/imports/profiles`, `GET /core/imports/lookups`, `GET` und `POST /core/imports/lookups/:kind` (Eintrag anlegen), `GET /core/settings/incidents.general`.

### API-Token der Brücke

Je Zielsystem ein Token „MP-Feuer-Brücke“ (Verwaltung → API-Tokens), mit eigenem technischem Benutzer. Bereiche:

| Bereich | Wofür |
| --- | --- |
| `masterdata.persons.write` | Personen, Laufbahn (Profil-Recht) |
| `masterdata.catalogs.manage` | Lehrgänge, Dienstgrade, Ehrungen, Austrittsgründe, Funktionen aus der Zuordnung anlegen |
| `respiratory-protection.examinations`, `respiratory-protection.evidence` | G26, Belastungsübungen |
| `training.plan`, `training.settings.manage` | Dienste, Diensttypen anlegen |
| `incidents.reports.release`, `incidents.settings.manage` | Einsatzpersonal (das Profil verlangt das Freigaberecht), Alarmstichworte anlegen |

Die Brücke zeigt nach der Verbindungsprüfung, welche Bereiche fehlen, und sperrt die betroffenen Datensätze. Ohne die Rechte zum Anlegen kann man in der Zuordnung nur vorhandene Einträge wählen. `core.*` braucht die Brücke nicht.

### Große Datenmengen

Eine Altdatenübernahme hat etwa 30 000 Zeilen Einsatzpersonal.
- Die Brücke teilt jeden Datensatz in Teile von höchstens 2 000 Zeilen. Zusammengehörige Zeilen bleiben zusammen: bei Einsätzen alle Zeilen eines Einsatzes (Leitstellennummer, sonst Bericht), weil das Profil den Hauptbericht je Einsatz bestimmt. Bei Diensten alle Zeilen eines Dienstes.
- Die Teile laufen nacheinander. Jeder Teil ist in f.orga eine eigene Transaktion. Ein abgebrochener Lauf lässt die übernommenen Teile stehen. Ein neuer Lauf mit denselben Dateien ergänzt den Rest, weil die Profile idempotent sind.
- Zeitüberschreitung je Teil 120 s, bei Netzfehlern bis zu drei Wiederholungen.
- Der Probelauf geht auch in Teilen. Die Brücke fasst Zähler, Meldungen und `unmatched` zusammen (offene Werte je Art und Wert mit Summe der Vorkommen).

## Dienst MP-Feuer-Brücke

### Technik

- `apps/mp-feuer-bridge`: Node 24, NestJS wie der f.orga-Server (Guards, `ZodPipe`, Konfiguration), ESM. Er liefert API (`/api/…`) und Oberfläche aus einem Prozess, Port 8090.
- `apps/mp-feuer-bridge-web`: React + Mantine mit dem Theme aus `libs/web/web-ui` (Gestaltung nach `Stil.md`), Texte de/en über eigene Übersetzungsschlüssel. Fehlercodes von f.orga übersetzt die Brücke, unbekannte zeigt sie als Code.
- `libs/mp-feuer/mp-feuer-transfer`: Leser der Transferarchive und Datensätze (aus `core-api` und den Modulen verschoben), mit den bisherigen Unit-Tests und Testarchiven.
- Nx-Tags `scope:mp-feuer-bridge`. Die Brücke importiert nur `*-contracts` (z. B. `IncidentStatistics`, `ImportResult`), nie `*-api`. `tools/module-boundaries.mjs` prüft das.
- Keine Datenbank. Daten liegen im Volume `/data`:
  - `config.json`: Ziele, Konten, Eingangsordner
  - `remembered/<ziel>.json`: Archiv → Abteilung, Einheit, überspringen; Optionen je Datensatz
  - `runs.sqlite` über `node:sqlite`: Läufe mit Zählern, Meldungen und Bericht
  - `work/`: hochgeladene Dateien bis zum Ende des Laufs, nach 24 Stunden gelöscht
- Grenzen wie bisher: 40 Dateien je Übernahme, 200 MB je Datei, 500 MB entpackt je `transfer.db`, 2 GB je Übernahme.

### Ziele (Echt- und Testsystem)

- Beliebig viele Ziele mit Name, Adresse (z. B. `http://forga-real:3000`), API-Token und Kennzeichen „Testsystem“. Voreingestellt sind „Echtsystem“ und „Testsystem“ aus den Umgebungsvariablen.
- Das Token liegt mit AES-256-GCM verschlüsselt in `config.json` (Schlüssel `BRIDGE_SECRET_KEY`). Die Oberfläche zeigt nur das Präfix und lässt es ersetzen, nie lesen.
- Umschalter oben im Kopf, immer sichtbar. Beim Testsystem liegt ein gelbes Band „Testsystem“ über jeder Seite. Ein laufender Lauf bleibt beim Wechsel an sein Ziel gebunden.
- **Verbindungsprüfung** beim Wechsel und auf der Übersicht über `GET /core/info`. Angezeigt werden erreichbar ja/nein, Version, Feuerwehr, Token gültig bis, fehlende Bereiche und „Einsatzberichte führt“.

### Ablauf einer Übernahme

1. **Dateien:** Alle `MPTRA_*.zip` hineinziehen oder hochladen, wahlweise aus dem Eingangsordner übernehmen. Später kommen die Excel-Exporte von MP-Feuer dazu (z. B. `Einsaetze_Personal.xlsx`, `Personal.xlsx`). Die Brücke ordnet dann die MP-Feuer-Überschriften selbst zu.
2. **Archive zuordnen:** Je Archiv stehen Nummer, Einheit aus dem Dateiname, Zeitstempel und Inhalt (Personen, Einsätze, Dienste …). Dazu wählt man die Abteilung in f.orga, „Einsatzberichte als“ und „Überspringen“. Das ist je Ziel und Archivnummer gemerkt (z. B. Archiv 99 „Sonderdienste“ überspringen, „Gesamtfeuerwehr“ → Einsatzberichte als EvD). Neue Archive bekommen einen Vorschlag über den Namen. Liegt dieselbe Nummer zweimal vor, gilt die neueste Datei.
3. **Datensätze:** Personen (10), Laufbahn (20), G26 (30), Belastungsübungen (40), Dienste (50), Einsatzpersonal (60), je mit Zeilenzahl, An/Aus und Optionen (z. B. „Vorhandene Personen aktualisieren“, „Unbekannte Stichworte anlegen“). Auswahl und Optionen sind je Ziel gemerkt.
4. **Probelauf** aller gewählten Datensätze gegen das Ziel. Ergebnis je Datensatz: neu, geändert, unverändert, Fehler, offene Bezeichnungen.
5. **Nicht zugeordnete Bezeichnungen:** Die Tabelle sieht aus wie in f.orga. Je Wert stehen Art und Vorkommen, dazu eine Auswahl mit Einträgen und Zusatzzielen aus `GET /core/imports/lookups/:kind`. „Neuen Eintrag anlegen“ legt über `POST /core/imports/lookups/:kind` an. Die Zuordnungen gelten für alle Datensätze des Laufs und werden bei der Übernahme in f.orga als Alias gemerkt. Die Brücke speichert sie nicht selbst. Danach „Erneut prüfen“.
6. **Übernehmen:** Datensätze in Reihenfolge, je Datensatz in Teilen mit Fortschritt (Teil, Zeilen, Dauer). „Abbrechen“ hält nach dem laufenden Teil an.
7. **Ergebnis:** Zähler je Datensatz. Fehler und Meldungen sind nach Code und Wert gruppiert und mit Anzahl und Beispielzeilen übersetzt. „Als CSV herunterladen“ liefert alle Zeilen mit Meldungen, mit Datensatz, Archiv, Zeile, Bezeichnung, Code und Text. Links führen in f.orga zu Einsätzen und Audit.
8. **Verlauf:** Jeder Lauf mit Ziel, Benutzer, Dateien, Datensätzen, Zählern, Dauer und Ergebnis (Probelauf, übernommen, abgebrochen, mit Fehlern). Der Bericht lässt sich wieder öffnen.

### Eingangsordner und Zeitplan (optional)

- Ordner `/data/inbox/<ziel>` (z. B. als Freigabe eingebunden). Neue `MPTRA_*.zip` erscheinen auf der Übersicht als „Neue Dateien im Eingangsordner“.
- Optionaler Zeitplan je Ziel, z. B. montags 6:00: Probelauf mit der gemerkten Auswahl, Ergebnis im Verlauf. Automatisch übernommen wird nur, wenn eingeschaltet und der Probelauf keine Fehler und keine offenen Bezeichnungen hat. Sonst wartet der Lauf auf den Menschen.

### Anmeldung und Sicherheit

- Die Brücke hält Tokens mit Freigaberecht. Sie ist deshalb nur im lokalen Netz erreichbar: Port nicht nach außen, kein Reverse Proxy ins Internet.
- Eigene Anmeldung mit Konten der Brücke (Name, Passwort mit scrypt, Sitzungs-Cookie `HttpOnly`, `SameSite=Strict`, Header `x-bridge: 1` gegen CSRF). Das erste Konto wird mit dem Einrichtungsschlüssel `BRIDGE_SETUP_TOKEN` angelegt, wie bei f.orga. Fehlversuche sind begrenzt.
- Der Verlauf nennt das Konto, das einen Lauf gestartet hat. In f.orga steht der technische Benutzer des Tokens.

### Ausgang nach MP-Feuer (vorbereitet)

MP-Feuer hat einen Tabellen-Import (CSV/Excel) mit Vorlagen. Die Vorlagen liegen noch nicht vor. Formate werden deshalb nicht geraten.

- Oberfläche: Menüpunkt „Export nach MP-Feuer“ mit dem Hinweis „in Vorbereitung“ und den geplanten Exporten (z. B. Personen, Lehrgänge, Einsätze für den Rückweg nach der Umstellung). Jeder Export ist als „Vorlage fehlt“ gekennzeichnet.
- Schnittstelle in der Brücke:

```ts
interface MpFeuerExportAdapter {
  id: string;                         // z. B. 'persons'
  name: LocalizedText;
  /** Bereiche, die das Token im Ziel dafür braucht, z. B. ['masterdata.persons.read']. */
  scopes: string[];
  /** Parameter der Oberfläche, z. B. Abteilung, Zeitraum. */
  parameters: ExportParameter[];
  /** Holt die Daten über die API von f.orga und schreibt die Datei nach der Vorlage von MP-Feuer. */
  build(target: TargetClient, params: Record<string, string>): Promise<{ fileName: string; mediaType: string; data: Uint8Array; warnings: ImportMessage[] }>;
}
```

- Je Vorlage ein Adapter mit Test gegen die Beispieldatei. Gelesen wird über vorhandene Endpunkte von f.orga (z. B. Personen, Listen), mit eigenen Lese-Bereichen am Token.

## Betrieb

`docker/compose.stages.yml` bekommt einen Dienst `mp-feuer-bridge` für beide Ziele:

```yaml
  mp-feuer-bridge:
    image: forga-mp-feuer-bridge:latest
    build: { context: .., dockerfile: docker/Dockerfile.bridge }
    restart: unless-stopped
    environment:
      BRIDGE_SECRET_KEY: ${BRIDGE_SECRET_KEY:?BRIDGE_SECRET_KEY is missing}
      BRIDGE_SETUP_TOKEN: ${BRIDGE_SETUP_TOKEN:-}
      BRIDGE_TARGET_REAL_URL: http://forga-real:3000
      BRIDGE_TARGET_TEST_URL: http://forga-test:3000
    volumes:
      - mp-feuer-bridge-data:/data
    ports:
      - '${BRIDGE_PORT:-8090}:3000'
```

- Ein gemeinsamer Dienst statt einem je Stufe: Dieselben Dateien gehen oft erst ins Testsystem und dann ins Echtsystem. Die gemerkte Auswahl ist je Ziel getrennt.
- Die Ziele werden über das Docker-Netz angesprochen (`forga-real:3000`), die Links der Oberfläche über `brigade.publicUrl` aus `GET /core/info`.
- Tokens werden nach dem Start in der Oberfläche eingetragen, nicht als Umgebungsvariable.
- Volume `mp-feuer-bridge-data` (fester Name `forga_mp_feuer_bridge_data`) mit Konfiguration, Verlauf und Eingangsordner. Es gehört in die Sicherung, weil es die verschlüsselten Tokens enthält. Ohne `BRIDGE_SECRET_KEY` lassen sie sich nicht lesen und müssen neu erzeugt werden.
- `compose.yml` (einzelnes System) bekommt den Dienst als Profil `bridge` (`docker compose --profile bridge up`).
- Entwicklung: `npm run bridge` startet Brücke und Oberfläche (`nx run-many -t serve -p mp-feuer-bridge mp-feuer-bridge-web`). `apps/mp-feuer-bridge/.env` zeigt auf `http://localhost:3000`. Ein Entwicklungs-Token legt `npm run seed` an und schreibt es in die Konsole.
- `npm run check` prüft die Brücke mit: Lint, Grenzen, Typen, Unit-Tests der Leser, Integrationstest Brücke ↔ f.orga mit Testarchiven, ersetzt `mp-feuer-transfer.integration.ts`.

## Umstellung

- **Für Benutzer:** „Import → MP-Feuer-Datenübernahme“ gibt es in f.orga nicht mehr. Die Import-Seite zeigt nur den Tabellen-Import und einen Hinweis „MP-Feuer-Dateien übernimmt die MP-Feuer-Brücke“ mit Link, wenn ihre Adresse eingetragen ist (Einstellung `imports.bridgeUrl` im Abschnitt Import/Export, optional).
- **Gemerkte Auswahl:** Der Abschnitt `transfer` entfällt. Abteilungen und Einheiten werden bei der ersten Übernahme in der Brücke einmal neu gewählt. Aliasse und `incidents.importFunctionRules` bleiben in f.orga und wirken sofort.
- **Dokumentation bei der Umsetzung:**
  - `parallelbetrieb-mp-feuer.md`: Routine Schritt 3–5 auf die Brücke umstellen, Einstellungsabschnitt `transfer` streichen.
  - `architektur.md`: Abschnitt „Datenübernahme aus MP-Feuer“ wird kurz und verweist auf die Brücke. Neues Kapitel „MP-Feuer-Brücke“ beschreibt die Brücke.
  - `schnittstellen.md`: `core/imports/transfers*` raus; `core/imports/rows`, `core/info` und Lookups `department` und `incident-unit` rein; Profil `incidents.personnel`.
  - `betrieb.md`: Dienst, Port, Variablen, Volume, Sicherung.
  - `gesamtbild.md`: Importprofil `incidents.personnel`, Brücke als externes System.
- **Skripte wie `local/erbach-setup.mts`:** Sie rufen statt `core/imports/transfers` die API der Brücke auf (`POST /api/runs` mit Dateien, Ziel und Zuordnungen, dann `…/dry-run`, `…/apply`). Alternativ lesen sie die Archive mit `libs/mp-feuer/mp-feuer-transfer` selbst und schicken Zeilen an `POST /api/core/imports/rows` von f.orga. Die Regeln für Stichworte (`keywordFor`) und Katalognamen können als Zuordnungen in den Lauf gehen.

## Umsetzungsschritte

1. f.orga: `POST /core/imports/rows`, `GET /core/info`, Lookups `department` und `incident-unit`, Profil `incidents.personnel` mit Statistikspalten und `source`, Integrationstests.
2. `libs/mp-feuer/mp-feuer-transfer` aus `core-api` und den Modulen herauslösen, Tests mitnehmen.
3. Brücke: Backend (Ziele, Läufe, Teile, Verlauf), Oberfläche nach den freigegebenen Mockups, Integrationstest gegen f.orga.
4. In f.orga entfernen: Transfer-Endpunkte, `TransferImport.tsx`, `transfer` an Profilen, Abschnitt `transfer`, `core.import_transfer` (Migration `initial` neu erzeugen).
5. Compose, Betriebsdoku, Umstellung der Skripte.
6. Später: Eingangsordner und Zeitplan; Export-Adapter, sobald die MP-Feuer-Vorlagen vorliegen.

## Offene Entscheidungen

1. **Profil-ID `incidents.personnel` statt `incidents.mp-feuer`.** *Vorschlag:* umbenennen, ohne Migration (vor dem ersten Release).
2. **MP-Feuer-Überschriften im f.orga-Profil.** Bleiben `Zusatzfeld 2`, `bei Ges. Stat. anzeigen` usw. als Aliasse, damit der MP-Feuer-Excel-Export weiter direkt in f.orga geht? *Vorschlag:* nein. Die Brücke liest auch die Excel-Exporte. f.orga bleibt frei von MP-Feuer.
3. **Anmeldung an der Brücke.** Eigene Konten oder Anmeldung mit dem f.orga-Konto des Ziels. *Vorschlag:* eigene Konten (wenige, lokal). Eine Anmeldung über f.orga machte die Brücke abhängig vom gerade gewählten Ziel.
4. **Audit je Teil oder je Lauf.** *Vorschlag:* je Teil mit `runId` (zustandslos, einfach). Ein Lauf-Objekt in f.orga nur, wenn die Audit-Ansicht das braucht.
5. **Ein Dienst für beide Ziele.** *Vorschlag:* ja (siehe Betrieb).
6. **Eingangsordner und Zeitplan.** *Vorschlag:* in Schritt 6, nach dem ersten Parallelbetrieb. Automatisches Übernehmen bleibt standardmäßig aus.
7. **Tabellen-Import von Einsatzpersonal ohne Schutz.** Berichte aus dem Tabellen-Import bekommen `managedBy: 'import'`. Ein erneuter Import ersetzt sie, solange sie unbearbeitet sind. Der Schutz „MP-Feuer führt“ gilt für sie nicht. *Vorschlag:* so umsetzen. Wer MP-Feuer-Daten übernimmt, nutzt die Brücke.
