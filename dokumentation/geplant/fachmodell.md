# Fachmodell

## Organisationsstruktur

```
Feuerwehr (Gesamtwehr, genau eine je Installation)
└── Abteilung (1..n)           Typ: Einsatzabteilung | Jugendfeuerwehr | Altersabteilung |
    │                               Musikabteilung | Kinderfeuerwehr | Sonderdienst | Führungseinheit
    ├── Wache / Gerätehaus (0..n)
    ├── Fahrzeug (0..n)         gehört zu einer Abteilung, steht an einer Wache
    ├── Gerät (0..n)            gehört zu einer Abteilung, optional auf einem Fahrzeug (Modul Geräte)
    └── Mitgliedschaft (0..n)   Person ↔ Abteilung mit Zeitraum und Status
```

- **Jugend-, Alters- und Musikabteilung** sind eigene Abteilungen mit Typ. So bleiben Listen und Rechte einheitlich.
  - Eine Altersabteilung hat eine übergeordnete Einsatzabteilung. „Altersabteilung Weidenhain“ gehört so erkennbar zu Weidenhain.
  - Eine Jugendfeuerwehr kann zu einer Einsatzabteilung gehören oder gesamtwehrweit sein, dann ohne übergeordnete Abteilung. In Musterstadt gibt es nur eine Gesamtjugendfeuerwehr.
- **Führungseinheiten** und **Sonderdienste** (Führungsgruppe, Sicherheitsdienst, PSNV) sind Abteilungen vom passenden Typ. Für sie gelten in den Einsatzberichten Ausnahmen (keine Gesamtstatistik, keine Fahrzeugpflicht). Die Ausnahmen hängen am Typ, nicht am Namen.
- Eine Person kann mehrere Mitgliedschaften haben, z. B. Einsatzabteilung Musterstadt und Führungsgruppe. Genau eine davon ist die **Stammabteilung**. Nach ihr werden Entschädigungen gruppiert.

## Begriffe

| Begriff | Bedeutung |
| --- | --- |
| Einsatz | Ein Ereignis der Leitstelle mit einer Leitstellennummer. Mehrere Abteilungen können beteiligt sein. |
| Einsatzbericht | Der Bericht **einer** Abteilung zu einem Einsatz. Genau einer je Einsatz ist der Hauptbericht. Daneben gibt es Berichte gesamtwehrweiter Einheiten (z. B. den EvD-Bericht), die keiner Abteilung angehören und nie Hauptbericht sind. |
| Einsatzleiter vom Dienst (EvD) | Führungskraft, die nach Dienstplan für die ganze Feuerwehr Bereitschaft hat. Er bekommt je Diensttag eine Pauschale und schreibt zu jedem Einsatz einen eigenen EvD-Bericht. |
| Kosten und Bemerkungen | Gelten für den ganzen Einsatz, nicht je Bericht: kostenpflichtig mit Begründung, Bemerkungen und der Tatbestand für den Kostenersatz. Der Kommandant (oder wer das Recht hat) trägt sie ein. |
| Funktion | Rolle einer Person im Einsatz: Einsatzleiter, Gruppenführer, Maschinist, Angriffstrupp, … (konfigurierbarer Katalog) |
| Qualifikation | Was eine Person kann oder darf, mit optionalem Ablaufdatum: Atemschutzgeräteträger, Maschinist, Führerschein C, … Sie entsteht aus einem bestandenen Lehrgang oder wird direkt eingetragen. |
| Lehrgang | Eintrag im Lehrgangskatalog (vom Administrator gepflegt). Eine **Lehrgangsteilnahme** hat Datum, Ergebnis (bestanden/nicht bestanden) und verweist auf den Katalogeintrag. |
| Lehrgangsvormerkung | Eine Person ist für einen Lehrgang vorgesehen. Grundlage der Lehrgangsplanung. |
| Nachweis | Ein datiertes Ereignis mit Gültigkeit: Eignungsuntersuchung, Belastungsübung, Unterweisung, Geräteprüfung. |
| Erinnerung | Hinweis auf einen fällig werdenden Nachweis. |

## Querschnittsthemen

Diese Funktionen stellt der Core bereit. Die Module nutzen sie, statt sie selbst zu bauen.

### Historie

Jede Entität hat einen Reiter „Historie“. Er zeigt wer wann welches Feld von welchem auf welchen Wert geändert hat. Einträge entstehen automatisch aus den Änderungen (siehe [Architektur](architektur.md#historie)). Untergeordnete Daten (Lehrgangsteilnahmen einer Person, Prüfungen eines Geräts) erscheinen in der Historie des übergeordneten Datensatzes.

### Erinnerungen und Fristen

Umgesetzt sind Fristen-Berechnung, Aufgabenliste und wöchentliche Sammel-E-Mail (siehe [implementiert/architektur.md](../implementiert/architektur.md#fristen-und-aufgaben)). Eine Frist ist erledigt, sobald der neue Nachweis eingetragen ist; eine Quittierung gibt es nicht.

Offen:
- Erinnerung an die betroffene Person selbst (z. B. Eignungsuntersuchung), wenn eine E-Mail-Adresse hinterlegt ist
- Dashboard-Kachel „Fällig“ in der Shell (Frontend)

### Listen

Umgesetzt sind Listenvorlagen der Module mit Parametern und die Ausgabe als Vorschau, PDF, Excel und CSV in der Sprache des Benutzers (siehe [implementiert/architektur.md](../implementiert/architektur.md#listen)). Amtliche Formate (Jahresstatistik, Kostenbescheid) bleiben deutsch.

Offen:
- eigene gespeicherte Listen: Vorlage kopieren, Spalten wählen, Filter und Sortierung speichern (kein freies SQL)
- Wappen im PDF-Kopf (braucht den Wappen-Upload in den Einstellungen)
- wählbare Zusatzspalten der Unterschriftenliste (z. B. Thema je Zeile)

### Import und Export

Umgesetzt sind der Import-Assistent (Hochladen, Zuordnen mit Vorschlägen, Probelauf, idempotente Übernahme, Audit), das Personenprofil mit den Überschriften des MP-Feuer-Exports `Personal.xlsx` und die Datenübernahme aus MP-Feuer-Transferdateien (siehe [implementiert/architektur.md](../implementiert/architektur.md#import)). Jede Liste ist als CSV/Excel exportierbar.

Offen:
- **Vollexport** je Modul als JSON (versioniertes Format, IDs bleiben erhalten) für Umzug, Sicherung auf Fachebene und Auswertungen außerhalb; Import solcher Dateien
- **MP-Feuer-Migration der Einsätze**: Profil für den Berichtsexport `Einsatzberichte_Zusatz.xlsx` (Wetter, Sachschaden, Brandfläche; Spalten siehe [Altanwendungen](../recherche/altanwendungen.md)). Der Personalexport `Einsaetze_Personal.xlsx` wird schon übernommen.
- **Jugendfeuerwehr aus MP-Feuer**: Erziehungsberechtigte (`JUG_EB_1/2_*`) und Jugendgruppen (`Einheiten`) aus dem Export bzw. der Transferdatei der Jugendfeuerwehr
- **Weitere Inhalte der MP-Feuer-Transferdateien** (die [Datenübernahme](../implementiert/architektur.md#datenübernahme-aus-mp-feuer) liest Personen, Lehrgänge, Dienstgrade, Ehrungen, G26, Belastungsübungen, Dienste und Einsätze): Fahrzeuge (`FZG_*`) und Geräte (`GAS_*`, `GSO_*`, `GFU_*` usw. mit Prüfungen) für Stammdaten und Gerätewartung, Fahrzeuge je Einsatz (`EIN_FAHRZ`), Funktionen und Dienststellungen aus `PER_HIST`, Atemschutz-Heißausbildung (`AS-BÜC`) und Atemschutzeinsätze aus `PER_PRUEF`, Einsatzwachen (`EIW_*`), Vergütungen (`VPE_*`), Kleiderkammer (`KLD_*`, `PER_AUSR`)
- Audit-Eintrag für Vollexporte

### Konfigurierbarkeit der Satzungsregeln

Ziel ist eine Software für jede Feuerwehr: Was eine örtliche Satzung regelt, gehört in die Einstellungen. Noch fest im Code sind:
- **Stammdaten:** die Abteilungstypen und Personenstatus (feste Aufzählung), welche Mitgliedschaften eine Übernahme beendet und welche Übernahmen es gibt (nur Jugend → Einsatzabteilung und → Altersabteilung; keine Kinderfeuerwehr → Jugend, Musik, Sonderdienst), keine Altersprüfung bei der Übernahme in die Altersabteilung.
- **Entschädigung:** Tageshöchstbetrag nur als Hinweis statt Kappung, Verdienstausfall ohne Höchstsatz oder Pauschale für Selbstständige, Satz für Haushaltsführende nur als Hinweis, Funktionszulagen nur jährlich, Nummernformat der Läufe, feste Texte der Abrechnung.
- **Kostenersatz:** Zuordnung Beschäftigung → Personalsatz, Vorschlag des Tatbestands über feste Schlüssel, Rollen der Kostenschuldner, Nummernformat der Bescheide, feste Texte (Einheiten, Abhilfe).
- **Atemschutz:** Schlüssel der Qualifikationen Atemschutz und CSA, „Bestätigung durch den Kommandanten“ im Listentext.
- **Einsätze:** keine Prüfregel für das Mindestalter im Einsatzdienst; Vorlagen der Stichworte und der Jahresstatistik nur für Baden-Württemberg.
- **Beförderungen und Ehrungen:** Überschrift „Urkunde“ und Ort/Datum-Format der Urkunden.

### Datenschutz

- Personendaten sind sensibel (Gesundheit: Eignungsuntersuchung). Untersuchungsergebnisse werden nur als „geeignet bis“ gespeichert, keine Befunde.
- Leserechte auf Personen sind abteilungsbezogen. Felder mit Gesundheitsbezug brauchen ein eigenes Recht.
- Ausgeschiedene Mitglieder werden nach einer konfigurierbaren Frist anonymisiert (Standard: nie, bis ein Administrator eine Frist wählt). Einsatzberichte behalten dann den neutralen Namen „N. N.“, die Statistik bleibt korrekt.
- Auskunft nach Art. 15 DSGVO: Export aller Daten zu einer Person als PDF/JSON.

## Rollen

Die Grundausstattung an Rollen ist umgesetzt: Core und Module bringen Rollenvorlagen mit, die Ersteinrichtung legt daraus die Standardrollen an. Inhalt und Rechte stehen in [implementiert/architektur.md](../implementiert/architektur.md#sicherheit) unter „Rollenvorlagen“. Rollen bleiben danach frei änderbar; eine Zuweisung gilt für die Gesamtwehr oder eine Abteilung.

| Rolle | Vorlage | Aufgabe |
| --- | --- | --- |
| Administrator | `administrator` | Benutzer, Rollen, Module, Einstellungen, Kataloge |
| Kommandant | `commander` | alles fachlich, Berichte freigeben und sperren |
| Abteilungskommandant | `department-commander` | Stammdaten und Berichte der Abteilung |
| Gruppenführer | `group-leader` | Berichte schreiben, Personen lesen |
| Lehrgangsbeauftragter | `course-coordinator` | Personen lesen, Lehrgänge planen: Vormerkungen und Anmeldungen pflegen, Teilnahmen mit Ergebnis eintragen. Den Lehrgangskatalog pflegt weiter der Administrator. |
| Atemschutzgerätewart | `breathing-apparatus-officer` | Personen und Berichte lesen; Atemschutznachweise mit dem Modul Atemschutz |
| Gerätewart | `equipment-officer` | Personen lesen; Geräte und Prüfungen mit dem Modul Geräte |
| Verwaltung / Kasse | `administration` | Entschädigungsexport, EvD-Dienstplan, Jahresstatistik, Listen |
| Einsatzleiter vom Dienst | `duty-officer` | EvD-Berichte schreiben, Einsatzberichte aller Abteilungen und den EvD-Dienstplan lesen |
| Mitglied | `member` | „Mein Bereich“: eigene Daten, Kontaktdaten ändern, eigene Dienste mit Entschuldigung, eigene Atemschutz-Nachweise, Mängel melden |

## Glossar Fachbegriff ↔ Code

Der Code ist englisch, die Dokumentation deutsch. Diese Tabelle ordnet die Begriffe zu.

### Organisation und Personen

| Fachbegriff | Code |
| --- | --- |
| Feuerwehr, Gesamtwehr | brigade (Geltungsbereich `brigade`, Einstellung `brigade`) |
| Abteilung | `Department` (Geltungsbereich `department`) |
| Abteilungstypen | `operational` (Einsatzabteilung), `youth` (Jugendfeuerwehr), `veterans` (Altersabteilung), `children` (Kinderfeuerwehr), `music` (Musikabteilung), `special-service` (Sonderdienst), `command` (Führungseinheit) |
| Wache, Gerätehaus | `Station` |
| Fahrzeug | `Vehicle` |
| Gerät | `EquipmentItem` |
| Person | `Person` |
| Mitgliedschaft | `Membership` |
| Übernahme in Einsatzabteilung / in Altersabteilung | transfer to operational / to veterans (`transfer-to-operational`, `transfer-to-veterans`) |
| Stammabteilung | primary department (`isPrimary`) |
| Lehrgang | `Course` |
| Lehrgangsteilnahme | `CourseAttendance` |
| Lehrgangsvormerkung | `CourseNomination` |
| Lehrgangstermin | `CourseRun` |
| Lehrgangsbedarf (Haben, Soll, Vorgemerkt je Lehrgang und Abteilung) | `CourseNeed`, Soll `targets` am Lehrgang |
| Gruppe (als Einheit einer Abteilung), Gruppenführer | `DepartmentGroup`, `leader` |
| Katalog, Katalogeintrag (Schlüssel) | `CatalogEntry` (`kind`, `key`) |
| Verwendung eines Katalogeintrags | catalog reference (`CATALOG_REFERENCES`, `catalog.inUse`) |
| Qualifikation | `Qualification` |
| Dienstgrad | `Rank` |
| Beförderung | `Promotion` |
| Mein Bereich (Self-Service) | `core.me.sections`, `*.self` |
| Ehrung | `Honor` |

### Einsatz

| Fachbegriff | Code |
| --- | --- |
| Einsatz | `Incident` |
| Einsatzbericht | `IncidentReport` |
| Hauptbericht / Nebenbericht | primary report / secondary report (`isPrimary`) |
| Leitstellennummer | `dispatchNumber` |
| Einsatzstichwort | `alarmKeyword` |
| Kosten und Bemerkungen des Einsatzes | `IncidentCosts` (`chargeable`, `chargeableReason`, `notes`), Recht `incidents.costs` |
| Bereitschaft (auf der Wache) | standby |
| Entschädigung | `Compensation` |
| Verdienstausfall | `lossOfEarnings` |
| Beteiligte | involved parties |
| Sonstige Kräfte | other agencies |
| Freigabe | release |
| Vorprüfung (Abteilungskommandant) | review, Recht `incidents.reports.review` |
| Sperre | lock |
| Ende bestätigt | `endConfirmed` |
| Gesamtwehrweite Einheit (schreibt eigene Berichte, z. B. EvD) | `IncidentUnit`, Register `INCIDENT_UNITS`, Feld `unit` am Bericht |
| Bericht einer Einheit (z. B. EvD-Bericht) | unit report (`departmentId: null`, `unit`), Dienst `INCIDENTS_UNIT_REPORTS` |
| Einsatz angelegt (Ereignis) | `incidents.incident.created` (`createdVia`: `ui`, `api`, `import`) |

### Nachweise und Fristen

| Fachbegriff | Code |
| --- | --- |
| Erinnerung | `Reminder` |
| Frist | deadline |
| Nachweis | `Evidence` |
| Übungsdienst | `Training` |
| Atemschutz | `RespiratoryProtection` |
| Eignungsuntersuchung | medical fitness examination |
| Prüfung (eines Geräts) | `Inspection` |

### Kostenersatz

| Fachbegriff | Code |
| --- | --- |
| Kostenersatz | `CostRecovery` |
| Kostenbescheid | cost notice |

### System

| Fachbegriff | Code |
| --- | --- |
| Historie | history (`core.history`, `HistoryEntry`) |
| Einstellungen | settings (`Setting`) |
| Rolle | `Role` (Vorlage: `RoleTemplate`, `templateKey`) |
| Lehrgangsbeauftragter | Rollenvorlage `course-coordinator` |
| Berechtigung | `Permission` |
| Benutzer | `User` |
| Audit-Log | audit (`core.audit`) |
| Kern (Shell-Backend) | core |
| Importprofil | `ImportProfile` |
| Nicht zugeordnete Bezeichnung (Import) | `ImportUnmatched`, Zuordnung `mappings` |
| Nachschlageliste (Import) | `ImportLookup` |

### Kleiderkammer

| Fachbegriff | Code |
| --- | --- |
| Persönliche Schutzausrüstung (PSA) | protective equipment |
| Artikel (Einsatzjacke, Handschuhe …) | `Article` (`ArticleEntity`) |
| inventarisierter Artikel / Verbrauchsartikel | `kind: 'inventory'` / `kind: 'consumable'` |
| Stück (mit Inventarnummer) | `Item` (`ClothingItemEntity`) |
| Träger | `holderId` |
| Ausgabe / Rücknahme | issue / return (`IssueEntity`, `kind`) |
| Waschen / Imprägnieren | care `wash` / `impregnation` (`CareEntity`) |
| Aussondern | retire (`status: 'retired'`) |
| Zählung (gezählter Bestand) | count (`ConsumableCountInput`, `counted`) |
| Kleiderwart | Rollenvorlage `clothing-officer` |
| Was eine Person noch hält | `PERSON_HOLDINGS` (Stammdaten-Vertrag) |

### Einsatzleiter vom Dienst

| Fachbegriff | Code |
| --- | --- |
| Einsatzleiter vom Dienst (EvD) | duty officer, Modul `duty-officer`, Rollenvorlage `duty-officer` |
| EvD-Dienst, Dienstplan | duty roster (`DutyAssignment`, `DutyAssignmentEntity`) |
| Sonderdienst (Art eines Dienstes im Dienstplan) | duty kind (`DutyKind`, Einstellung `dutyKinds`) |
| EvD-Pauschale je Diensttag | duty compensation (`dutyCompensation`), Ereignis `duty-officer.duty.changed` |
| EvD-Bericht | Bericht der Einheit `duty-officer` (`DUTY_OFFICER_UNIT`) |
| „EvD-Bericht für jeden Einsatz anlegen“ | `reportRequired` (Einstellung `duty-officer.general`) |
| „Kein EvD bei diesem Einsatz“ | incident exemption (`IncidentExemptionEntity`) |
| erwarteter EvD-Bericht | `ExpectedReportEntity` |
| „EvD-Bericht fehlt“ | Frist `evd-report-missing` |

### Modul-IDs

Die Modul-ID ist zugleich das Präfix der Berechtigungen und der Pfad in API und Oberfläche. Das Datenbankschema heißt wie die ID, mit `_` statt `-`.

| Modul | ID |
| --- | --- |
| Kern | `core` |
| Stammdaten | `masterdata` |
| Einsatzberichte | `incidents` |
| Übungsdienst | `training` |
| Atemschutz | `respiratory-protection` |
| Entschädigungen | `compensation` |
| Geräte | `equipment` |
| Kostenersatz | `cost-recovery` |
| Beförderungen | `promotions` |
| Kleiderkammer | `clothing` |
| Einsatzleiter vom Dienst | `duty-officer` |
