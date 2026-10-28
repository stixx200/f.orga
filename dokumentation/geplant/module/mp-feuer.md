# Modul MP-Feuer (`mp-feuer`)

**Status: Konzept zur Freigabe.** Mockups: [`mockups/mp-feuer/`](../mockups/README.md#modul-mp-feuer).

Alles, was MP-Feuer betrifft, kommt in ein eigenes Modul von f.orga. Das Modul übernimmt die Transferdateien von MP-Feuer. Später erzeugt es auch Dateien für den Tabellen-Import von MP-Feuer. Es wird in der Modulverwaltung aktiviert und nach der Umstellung wieder abgeschaltet. Der Core behält den allgemeinen Tabellen-Import (Excel, CSV, iCal) mit allen Profilen, Nachschlagelisten und Zusatzzielen. Gewählte Zuordnungen landen nicht mehr als Alias an Katalogeinträgen, Fahrzeugen, Alarmstichworten und Diensttypen. Sie stehen in eigenen Zuordnungslisten: eine des Tabellen-Imports im Core und eine des Moduls `mp-feuer`.

## Ziele

- MP-Feuer-spezifischer Code steht in einem Modul. Dazu gehören Zip- und SQLite-Lesen, Tabellen und Spalten von MP-Feuer sowie die Deutung von Zusatzfeld 2 und Statistik-Schlüssel. Der Core und die anderen Module kennen kein MP-Feuer-Format mehr.
- Die Datenübernahme gibt es nur, solange das Modul aktiv ist. Nach dem [Parallelbetrieb](../../implementiert/parallelbetrieb-mp-feuer.md) wird es abgeschaltet.
- Große Übernahmen laufen im Hintergrund, mit Fortschritt, in Teilen und abbrechbar. Jeder Lauf bleibt im Verlauf nachvollziehbar.

## Modul

| | |
| --- | --- |
| ID | `mp-feuer`; Schema `mp_feuer`; API `/api/mp-feuer/…`; Oberfläche `/mp-feuer/…` |
| Pakete | `modules/mp-feuer/mp-feuer-contracts`, `mp-feuer-api`, `mp-feuer-web` |
| Abhängigkeiten | `requires: ['masterdata']`; `optional: ['incidents', 'training', 'respiratory-protection']` |
| Navigation | „Verwaltung → MP-Feuer“ (`section: 'administration'`), wie „Infoterminals“ |
| Rechte | `mp-feuer.transfer` „MP-Feuer-Datenübernahme durchführen“ (Gesamtwehr), `mp-feuer.read` „Verlauf der Datenübernahmen lesen“ (Gesamtwehr) |
| Einstellungen | `mp-feuer.remembered` (gemerkte Auswahl, nur über die Übernahme gepflegt), später `mp-feuer.inbox` (Eingangsordner, Zeitplan) |
| Entitäten | `mp_feuer.run`, `mp_feuer.run_dataset`, `mp_feuer.mapping` (Lauf und Zuordnungen historisiert über `historized`) |

- `duty-officer` braucht das Modul nicht direkt. Die Einheit „EvD“ kommt über `INCIDENT_UNITS` aus `incidents`. Ohne `training` oder `respiratory-protection` fehlen nur deren Datensätze. Ohne `incidents` fehlt das Einsatzpersonal.
- Zusätzlich zu `mp-feuer.transfer` prüft jeder Datensatz das Recht seines Importprofils, z. B. `incidents.reports.release` für Einsatzpersonal. Wer ein Profil nicht darf, sieht den Datensatz gesperrt.
- Ein eigener Menüpunkt in der Hauptnavigation wäre für ein Werkzeug auf Zeit zu prominent. Das Modul gehört deshalb unter „Verwaltung“.

## Aufteilung

| Bleibt im Core bzw. in den Modulen | Zieht ins Modul `mp-feuer` | Entfällt |
| --- | --- | --- |
| Tabellen-Import mit allen Profilen (Personen, Laufbahn, G26, Belastungsübungen, Dienste, Einsatzpersonal, EvD-Dienstplan, Inventar, Zahlungen) | Lesen der `MPTRA_*.zip` (`transfer-archive.ts`: Zip, `transfer.db` mit `node:sqlite`, Größengrenzen), `transferPersons`, `transferFlag`, `groupRows` | Shell-Seite `TransferImport.tsx` und Umschalter Datei/Datenübernahme in `ImportPage.tsx` |
| `ImportRegistry`, Nachschlagelisten, Zusatzziele, „Nicht zugeordnete Bezeichnungen“, Zuordnungsliste des Tabellen-Imports (`core.import_mapping`, neu) | Leser `persons.transfer.ts`, `career.transfer.ts`, `evidence.transfer.ts`, `sessions.transfer.ts`, `mp-feuer.transfer.ts` | `core/imports/transfers*`, Tabelle `core.import_transfer` |
| Schutz im Parallelbetrieb in `incidents`: `managedBy`, `externalLeading`, `externalEventsFrom`, „In f.orga weiterführen“ | MP-Feuer-Eigenheiten: Zusatzfeld 2 → Freigabestatus, „bei Ges. Stat. anzeigen“ → Hauptbericht, Statistik-Schlüssel → Statistik (`mp-feuer-statistics.ts`), MP-Feuer-Spaltenüberschriften | `TransferReader`, `ImportProfile.transfer`, `ImportProfileInfo.transfer`, Option `transfer: false` |
| – | Gemerkte Auswahl (Abschnitt `mp-feuer.remembered`), eigene Zuordnungsliste `mp_feuer.mapping` | Einstellungsabschnitt `transfer`; `aliases` an Einträgen, `incidents.importFunctionRules` (siehe [Zuordnungslisten](#zuordnungslisten-statt-aliassen)) |
| Audit `imports.applied` | Verlauf der Läufe, Ergebnisbericht mit CSV, Export-Platzhalter | Audit `imports.transferApplied` |

### Profil für Einsatzberichte

`incidents.mp-feuer` wird zum allgemeinen Profil **`incidents.personnel`** „Einsatzpersonal (eine Zeile je Person und Bericht)“. Das Verhalten bleibt: Einsatz über die Leitstellennummer, Bericht über Abteilung oder Einheit + Einsatznummer + Beginn, idempotent. Ein erneuter Import ersetzt nur unbearbeitete Berichte.

- **Status:** Die Spalte „Freigabestatus“ nimmt `draft`, `released-compensation`, `released-billing` oder deren Bezeichnungen.
- **Hauptbericht:** ja/nein.
- **Statistik:** eigene Spalten nach `IncidentStatistics`: `mainType`, `fireSize`, `technicalCategory`, `falseAlarmType`, `ownMunicipality`, `vehicleFire`, `trafficAccident`, `rescued`, `rescuedSmokeInhalation`, `dead`, `animalsRescued`. Die Werte sind Codes oder Bezeichnungen der Landesvorlage. Das Modul `mp-feuer` übersetzt die MP-Feuer-Werte vorher.
- **`managedBy`:** `ImportContext` bekommt `source` (`{ module, runId }`). Bei `source.module === 'mp-feuer'` setzt das Profil wie heute `managedBy: 'mp-feuer'`. Damit gelten Schutz, `externalLeading` und gemeldete Freigaben unverändert. Ein Tabellen-Import setzt den neuen Wert `import` (`ReportManagedBy`): Ein erneuter Import ersetzt den Bericht, solange er unbearbeitet ist. Schreibgeschützt ist er nicht.
- Die ID wird umbenannt, ohne Migration, weil noch vor dem ersten Release. Alte Audit-Einträge behalten `incidents.mp-feuer`.

Die übrigen Profile bleiben, wie sie sind, nur ohne `transfer`.

## Zusammenspiel mit dem Core

Das Modul läuft im selben Prozess. Es ruft die Profile der anderen Module nur über den Core auf, nie direkt und nie über HTTP:

- **`ImportService.runRows`** (neu, exportiert aus `core-api`). Eingabe: `user`, `profile`, `rows` (`ImportRow[]` mit Feldschlüsseln), `options`, `mappings`, `dryRun`, `source`. Die Methode prüft das Recht des Profils und die `mappings` und läuft über `ImportRegistry.run`. Mit `mappingList: 'core'` liest und ergänzt sie die Zuordnungsliste des Tabellen-Imports. Der Dateiimport nutzt intern dieselbe Methode so. Das Modul ruft sie mit `mappingList: 'none'` auf und gibt seine eigene Liste als `mappings` mit.
- Nachschlagelisten über `ImportRegistry` (Einträge, Anlegen, Zusatzziele). Die Oberfläche nutzt die vorhandenen Endpunkte `GET`/`POST /api/core/imports/lookups/:kind` und die Zuordnungstabelle aus `apps/shell/src/pages/ImportUnmatched.tsx`. Sie zieht als `UnmatchedValues` in `libs/web/web-sdk`, damit Shell und Modul sie teilen.
- Abteilungen über `ORGANIZATION` (`masterdata-contracts`), Einheiten über `INCIDENT_UNITS` (`incidents-contracts`, wenn aktiv).
- `tools/module-boundaries.mjs` bleibt gültig: Das Modul importiert `@forga/core-api` und `*-contracts`, keine `*-api` anderer Module.

**Keine Zeilen-API `POST /api/core/imports/rows`.** Das Modul braucht sie nicht, weil es im Prozess läuft. Skripte wie `local/erbach-setup.mts` nutzen die API des Moduls (siehe unten). Ein externes System, das Zeilen schicken will, gibt es derzeit nicht. Kommt eines, ist der Endpunkt eine dünne Hülle um `ImportService.runRows`.

## Ablauf und Hintergrundlauf

### API des Moduls

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `POST` | `/mp-feuer/runs` | `mp-feuer.transfer` | Transferdateien hochladen (`multipart/form-data`, Feld `files`, bis 40 Dateien, je 200 MB). Liest die Archive und legt einen Lauf an (`status: prepared`). Antwort: Lauf mit Archiven (Nummer, Datei, Einheit, Inhalt), Datensätzen (Profil, Zeilen, gesperrt ohne Recht oder Modul) und Vorbelegung aus `mp-feuer.remembered` |
| `PUT` | `/mp-feuer/runs/:id` | `mp-feuer.transfer` | Auswahl: je Archiv Abteilung, Einheit und überspringen; je Datensatz an/aus und Optionen; `mappings` |
| `POST` | `/mp-feuer/runs/:id/dry-run` | `mp-feuer.transfer` | Probelauf im Hintergrund starten (`202`) |
| `POST` | `/mp-feuer/runs/:id/apply` | `mp-feuer.transfer` | Übernahme im Hintergrund starten (`202`). Fehler: `mp-feuer.dryRunOutdated`, wenn sich Auswahl oder Zuordnungen seit dem letzten Probelauf geändert haben |
| `POST` | `/mp-feuer/runs/:id/cancel` | `mp-feuer.transfer` | Nach dem laufenden Teil anhalten |
| `GET` | `/mp-feuer/runs/:id` | `mp-feuer.read` | Stand und Fortschritt (zum Abfragen alle 2 s): Status, Datensatz, Teil x von y, Zeilen, Zähler, `unmatched` |
| `GET` | `/mp-feuer/runs/:id/report` | `mp-feuer.read` | Ergebnisbericht; `?format=csv` liefert alle Zeilen mit Meldung |
| `GET` | `/mp-feuer/runs` | `mp-feuer.read` | Verlauf |
| `DELETE` | `/mp-feuer/runs/:id` | `mp-feuer.transfer` | Vorbereiteten Lauf verwerfen (gelesene Zeilen löschen) |

### Lauf

- **`mp_feuer.run`:** Benutzer, Dateinamen, Archive mit Auswahl, Status (`prepared`, `dry-running`, `checked`, `applying`, `applied`, `cancelled`, `failed`), Fortschritt, Zähler je Datensatz, gruppierte Meldungen, `unmatched` und Zeitpunkte.
- **`mp_feuer.run_dataset`:** die gelesenen Zeilen je Profil als JSON (bei der Altdatenübernahme ca. 30 000 Zeilen Einsatzpersonal). Die Zeilen werden nach der Übernahme oder nach 7 Tagen gelöscht, im täglichen Aufbewahrungslauf. Der Lauf selbst bleibt für den Verlauf.
- **Hintergrundlauf:** Ein Worker im Server arbeitet die Datensätze in Reihenfolge ab: Personen (10), Laufbahn (20), G26 (30), Belastungsübungen (40), Dienste (50), Einsatzpersonal (60).
  - Jeder Datensatz läuft in Teilen von höchstens 2 000 Zeilen. Jeder Teil hat eine eigene Transaktion, beim Probelauf zurückgerollt.
  - Zusammengehörige Zeilen bleiben in einem Teil: alle Zeilen eines Einsatzes (Leitstellennummer, sonst Bericht), weil das Profil den Hauptbericht je Einsatz bestimmt. Ebenso alle Zeilen eines Dienstes.
  - Nach jedem Teil schreibt der Worker den Fortschritt und prüft auf Abbruch.
  - Je Instanz läuft höchstens ein Lauf zugleich (Datenbanksperre). Ein zweiter Start ergibt `409 mp-feuer.runActive`.
- **Neustart des Servers:** Ein laufender Lauf wird `failed` („unterbrochen“). Fertige Teile bleiben übernommen. Weil die Profile idempotent sind, ergänzt ein neuer Lauf mit denselben Dateien den Rest, ohne zu verdoppeln.
- **Abteilungen und Einheiten** setzt das Modul in die Zeilen ein (`department`, `unit`), bevor es sie an den Core gibt, wie bisher `TransferService.run`.
- **Gemerkte Auswahl:** Nach einer Übernahme speichert das Modul je Archivnummer Abteilung, Einheit und Überspringen, dazu je Datensatz An/Aus und Optionen (`mp-feuer.remembered`). Die benutzten Zuordnungen von Bezeichnungen speichert es in `mp_feuer.mapping`.
- **Audit:** `mp-feuer.run-applied` je Übernahme mit Lauf, Dateien und Zählern, dazu `mp-feuer.run-cancelled`. Zusätzlich `imports.applied` je Teil mit `source` (`mp-feuer`, `runId`), weil `ImportService.runRows` das immer schreibt.

### Oberfläche

1. **Übersicht:** letzter Lauf, laufender Lauf mit Fortschritt, Hinweis „Einsatzberichte führt: MP-Feuer“, wöchentliche Routine, „Neue Übernahme“.
2. **Dateien und Archive:** Alle `MPTRA_*.zip` hineinziehen. Je Archiv stehen Nummer, Einheit aus dem Dateinamen und Inhalt. Dazu wählt man Abteilung, „Einsatzberichte als“ und „Überspringen“, vorbelegt aus der gemerkten Auswahl, sonst über den Namen. Liegt dieselbe Nummer zweimal vor, gilt die neueste Datei.
3. **Datensätze und Probelauf:** Datensätze in Reihenfolge mit Zeilenzahl, An/Aus und Optionen, gesperrt ohne Recht oder Modul. „Probelauf“ zeigt die Zähler je Datensatz.
4. **Bezeichnungen zuordnen:** dieselbe Tabelle wie im Tabellen-Import, mit Filter nach Art. Die Zuordnung gilt für alle Datensätze des Laufs. Nach der Übernahme steht sie in der Zuordnungsliste des Moduls. Danach „Erneut prüfen“.
5. **Übernehmen:** Fortschritt je Datensatz und Teil, „Abbrechen …“. Die Seite darf geschlossen werden.
6. **Ergebnis:** Zähler je Datensatz und Meldungen nach Code und Wert, übersetzt, mit Anzahl und Beispielzeilen, dazu „Als CSV herunterladen“.
7. **Verlauf:** Läufe mit Benutzer, Dateien, Ergebnis und Bericht.
8. **Zuordnungen:** die Zuordnungsliste des Moduls (siehe unten), filter- und löschbar.
9. **Einstellungen:** gemerkte Auswahl je Archivnummer, Datensätze und Optionen, „Zurücksetzen“. Eingangsordner und Zeitplan kommen später.

### Eingangsordner und Zeitplan (später)

- Ordner im Server, z. B. `/data/mp-feuer/inbox` als Volume oder Netzfreigabe. Neue Dateien erscheinen auf der Übersicht.
- Optionaler Zeitplan, z. B. montags 6:00: Probelauf mit der gemerkten Auswahl über die Fristen und Aufgaben des Core („Datenübernahme prüfen“). Automatisch übernommen wird nur, wenn eingeschaltet und der Probelauf keine Fehler und keine offenen Bezeichnungen hat.

### Export nach MP-Feuer (vorbereitet)

MP-Feuer hat einen Tabellen-Import (CSV/Excel) mit Vorlagen. Beispiele liegen noch nicht vor, deshalb werden keine Formate geraten.

- Oberfläche: Reiter „Export nach MP-Feuer“ mit „in Vorbereitung“ und den geplanten Exporten (Personen, Lehrgänge, Einsätze), jeweils „Vorlage fehlt“.
- Schnittstelle im Modul:

```ts
interface MpFeuerExportAdapter {
  id: string;                          // z. B. 'persons'
  name: LocalizedText;
  /** Rechte, die der Benutzer braucht, z. B. ['masterdata.persons.read']. */
  permissions: string[];
  /** Parameter der Oberfläche, z. B. Abteilung, Zeitraum. */
  parameters: ExportParameter[];
  /** Liest über die Verträge der Module (z. B. PERSON_DIRECTORY) und schreibt die Datei nach der MP-Feuer-Vorlage. */
  build(user: AuthenticatedUser, params: Record<string, string>): Promise<{ fileName: string; mediaType: string; data: Uint8Array; warnings: ImportMessage[] }>;
}
```

- Je Vorlage ein Adapter mit Test gegen die Beispieldatei. Endpunkt später `POST /api/mp-feuer/exports/:id` mit eigenem Recht `mp-feuer.export`.

## Zuordnungslisten statt Aliassen

Bisher wurde eine gewählte Zuordnung als Alias am Eintrag gespeichert (#18). Funktionstexte ohne Funktion standen in `incidents.importFunctionRules` (#30). Beides entfällt. Die Stammdaten bleiben frei von Importbezeichnungen. Gemerkt wird in zwei getrennten Listen.

| Liste | Tabelle | Gefüllt von | Gelesen von |
| --- | --- | --- | --- |
| Zuordnungen des Tabellen-Imports | `core.import_mapping` | Übernahme im Tabellen-Import (Core) | Probelauf und Übernahme im Tabellen-Import |
| Zuordnungen von MP-Feuer | `mp_feuer.mapping` | Übernahme im Modul `mp-feuer` | Läufe des Moduls |

- **Eintrag:** Art (`kind`, z. B. `qualification`, `function`, `vehicle`, `alarm-keyword`, `session-type`), Bezeichnung im Original und normalisiert (`normalizeHeading`), Schlüssel des Ziels (Eintrag oder Zusatzziel wie `incidents:loss-of-earnings`), Profil der ersten Übernahme, angelegt von und am, zuletzt benutzt. Eindeutig je Liste über Art + normalisierte Bezeichnung.
- **Abgleich im Profil:** Das Profil sucht weiter selbst über Schlüssel, Name und Kürzel, aber nicht mehr über Aliasse. Findet es nichts, fragt es `context.mapped(kind, wert)`. Der Core antwortet zuerst aus den `mappings` des Requests, dann aus der gewählten Liste. Zusatzziele laufen genauso: Die Regel „Arbeitszeit Stadt Musterstadt → Keine Funktion – Arbeitszeit“ ist ein Eintrag der Liste.
- **Merken:** Nach einer Übernahme schreibt der Core (bzw. das Modul) jede benutzte Zuordnung in seine Liste und ersetzt einen älteren Eintrag derselben Bezeichnung. Ein Probelauf merkt nichts.
- **Verwaltung:**
  - Tabellen-Import: Abschnitt „Gemerkte Zuordnungen“ auf der Import-Seite. Endpunkte `GET /api/core/imports/mappings` (Filter Art, Text) und `DELETE /api/core/imports/mappings/:id`, Recht eines Importprofils.
  - MP-Feuer: Reiter „Zuordnungen“, `GET`/`DELETE /api/mp-feuer/mappings…`, `mp-feuer.read` bzw. `mp-feuer.transfer`.
  - Beide Listen zeigen das Ziel mit Namen. Ist es gelöscht oder deaktiviert, steht dort „Ziel gelöscht“ bzw. „Ziel inaktiv“; dafür prüft der Core das Ziel gegen `ImportLookup.entries()` und eine neue Abfrage auch inaktiver Einträge. Ein solcher Eintrag wird beim Import nicht angewandt; die Bezeichnung erscheint wieder als offen.
  - Löschen ist sofort wirksam und steht im Audit (`imports.mapping-deleted`, `mp-feuer.mapping-deleted`).
- **Rückbau aus #18 und #30:**
  - Feld `aliases` an Katalogeinträgen, Fahrzeugen, Alarmstichworten und Diensttypen, in Entitäten, Verträgen (`catalog.ts`, `vehicle.ts`, `keyword.ts`, `session.ts`) und Migrationen.
  - Eindeutigkeitsprüfung `masterdata.aliasTaken`, `incidents.aliasTaken`, `training.aliasTaken` in `catalog.ts`, `organization.controller.ts`, `keywords.controller.ts`, `sessions.controller.ts`, `type-aliases.ts`.
  - Feld „Aliasse“ in den Bearbeitungsdialogen (`AliasesInput` in `web-ui`, `CatalogsPage.tsx`, `organization/dialogs.tsx`, `SettingsPage.tsx` der Einsatzberichte, Diensttypen) und die Übersetzungen dazu.
  - Alias-Abgleich in den Profilen (`career.import.ts`, `persons.import.ts`, `sessions.import.ts`, `mp-feuer.import.ts`, `inventory.import.ts`, `masterdata/imports/lookups.ts`).
  - `ImportLookup.remember`, `ImportLookupExtras.remember` und die Aufrufe in `ImportRegistry`. `aliases.ts` behält nur die Normalisierung für die Listen.
  - `incidents.importFunctionRules` mit `function-targets.ts` (Speichern); die Zusatzziele selbst bleiben.
  - Der Hinweis in „Nicht zugeordnete Bezeichnungen“ lautet künftig: „wird in den gemerkten Zuordnungen gespeichert“.
- **Migration:** Keine Datenübernahme nötig. Bis zum ersten Release gibt es je Modul nur die Migration `initial`, die neu erzeugt wird (`npm run migration:reset`). Das Echtsystem wird ohnehin neu aufgesetzt. Gemerkte Zuordnungen entstehen bei der ersten Übernahme neu. Dabei hilft die Zuordnung, die `local/erbach-setup.mts` als `mappings` mitgibt.

## Umstellung

- **Für Benutzer:** „Import → MP-Feuer-Datenübernahme“ entfällt. Die Import-Seite zeigt nur den Tabellen-Import. Ist das Modul aktiv, steht dort der Hinweis „MP-Feuer-Transferdateien übernimmt das Modul MP-Feuer“ mit Link (Erweiterungspunkt der Shell). Zur Datenübernahme muss das Modul aktiviert sein.
- **Gemerkte Auswahl:** Der Abschnitt `transfer` entfällt. Weil noch vor dem ersten Release, wird bei der ersten Übernahme neu gewählt (siehe Migration oben).
- **Skripte wie `local/erbach-setup.mts`** rufen `POST /api/mp-feuer/runs`, `PUT …/:id` (Abteilungen, Einheiten, Zuordnungen), `POST …/dry-run` und `POST …/apply` auf und warten über `GET …/:id`. Die eigenen Regeln für Stichworte und Katalognamen gehen als `mappings` in den Lauf.
- **Dokumentation bei der Umsetzung:**
  - `architektur.md`: neues Kapitel „Modul MP-Feuer“, der Abschnitt „Datenübernahme aus MP-Feuer“ verweist darauf.
  - `schnittstellen.md`: `core/imports/transfers*` raus, Endpunkte `mp-feuer` rein, Profil `incidents.personnel`.
  - `parallelbetrieb-mp-feuer.md`: Routine Schritt 3–5 auf „Verwaltung → MP-Feuer“, Abschnitt `transfer` streichen.
  - `gesamtbild.md`: Modultabelle.
  - `fachmodell.md`: Glossar (Alias → gemerkte Zuordnung).
  - `CLAUDE.md`: Modul-ID.
- **Tests:** `mp-feuer-transfer.integration.ts` zieht als Integrationstest ins Modul. Die Unit-Tests der Leser kommen mit den Lesern.

## Umsetzungsschritte

1. Core: Zuordnungsliste `core.import_mapping` mit Verwaltung, Rückbau der Aliasse und von `incidents.importFunctionRules`, `ImportService.runRows` mit `source` und `mappingList`, `UnmatchedValues` nach `web-sdk`, Profil `incidents.personnel` mit Statistikspalten und `managedBy: 'import'`.
2. Modul `mp-feuer` anlegen (Generator), Leser und Archiv-Lesen aus Core und Modulen verschieben, Entitäten (Lauf, Zeilen, Zuordnungen), Worker, API, Migration `initial` (`npm run migration:reset`).
3. Oberfläche nach den freigegebenen Mockups; Hinweis auf der Import-Seite.
4. Aus Core und Shell entfernen: Transfer-Endpunkte, `TransferImport.tsx`, `transfer` an Profilen, Abschnitt `transfer`, `core.import_transfer`.
5. Später: Eingangsordner und Zeitplan; Export-Adapter, sobald die MP-Feuer-Vorlagen vorliegen.

## Offene Entscheidungen

1. **Navigation.** *Vorschlag:* „Verwaltung → MP-Feuer“. Es ist ein Werkzeug auf Zeit für Verwalter.
2. **Profil-ID `incidents.personnel`** statt `incidents.mp-feuer`. *Vorschlag:* umbenennen, ohne Migration.
3. **MP-Feuer-Spaltenüberschriften** (Feld-Aliasse wie `Zusatzfeld 2`) im Profil `incidents.personnel` behalten (Excel-Export direkt im Tabellen-Import)? *Vorschlag:* nein. Liest das Modul später auch Excel-Exporte von MP-Feuer, tut es das selbst.
4. **Zeilen-API für externe Systeme.** *Vorschlag:* nicht jetzt. `ImportService.runRows` ist so geschnitten, dass sie später eine dünne Hülle ist.
5. **Einsatzpersonal aus dem Tabellen-Import** bekommt `managedBy: 'import'`, ersetzbar, ohne Schreibschutz. *Vorschlag:* so umsetzen.
6. **Getrennte Zuordnungslisten.** Eine Bezeichnung, die im Tabellen-Import zugeordnet wurde, kennt der MP-Feuer-Lauf nicht und umgekehrt. *Vorschlag:* so lassen, wie gewünscht. Auf der Zuordnungsseite des Moduls gibt es „Aus dem Tabellen-Import übernehmen“ für einzelne Einträge, nur falls sich das als nötig zeigt.
7. **Profil in der Liste des Tabellen-Imports.** Gilt eine Zuordnung für alle Profile oder nur für das Profil, in dem sie gewählt wurde? *Vorschlag:* für alle Profile derselben Art. Das Profil wird nur angezeigt.
8. **Eingangsordner und Zeitplan.** *Vorschlag:* nach dem ersten Parallelbetrieb. Automatisch übernehmen bleibt standardmäßig aus.
