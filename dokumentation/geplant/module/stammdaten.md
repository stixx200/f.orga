# Modul Stammdaten

Release 1. Grundlage aller anderen Fachmodule. Modul-ID `masterdata`. Alle Oberflächen sind deutsch und englisch (siehe [Mehrsprachigkeit](../architektur.md#mehrsprachigkeit)).

**Bereits umgesetzt (Backend)**, siehe [implementiert/architektur.md](../../implementiert/architektur.md#modul-stammdaten-masterdata) und [Schnittstellen](../../implementiert/schnittstellen.md#masterdata):
- Kataloge mit BW-Vorlage, feste Statistik-Kategorien F63–F120
- Abteilungen mit Sonderaufgaben, Kommandant und Stellvertretern, Wachen, Fahrzeuge
- Personen mit Mitgliedschaften, Qualifikationen, Dienstgraden, Ehrungen, Führerschein, Beschäftigungsart
- sensible Felder mit eigenem Recht
- Probezeit, Aufnahme, Statuswechsel, Austritt
- Lehrgangskatalog mit BW-Vorlage und Bedingungen, Teilnahmen, Vormerkungen, Lehrgangstermine, Lehrgangsplanung und Lehrgangsbedarf
- Gruppen innerhalb der Abteilungen
- Historie inklusive Kinddatensätze
- Schnittstellen `PERSON_DIRECTORY` und `ORGANIZATION`, Ereignisse
- 14 Listenvorlagen (Mitglieder, Unterschriften, Telefon, Komplettdaten, Geburtstage, Jubiläen, Qualifikationsübersicht, Atemschutzgeräteträger, Probezeit, Altersgrenzen, Personalstärke, Fahrzeuge, Lehrgangsvormerkungen, Lehrgänge im Jahr), siehe [implementiert/architektur.md](../../implementiert/architektur.md#modul-stammdaten-masterdata)
- Fristen zu Probezeit, Grundausbildung, Mindestalter, Altersgrenze, Ende der Jugendfeuerwehr, Führerschein und ablaufenden Qualifikationen
- Importprofil `masterdata.persons` für Personen, auch aus dem MP-Feuer-Export `Personal.xlsx`

**Bereits umgesetzt (Oberfläche):** Organisation, Personen, Person anlegen, Personalakte, Fahrzeuge, Lehrgangsplanung, Kataloge, siehe [implementiert/architektur.md](../../implementiert/architektur.md#oberfläche-stammdaten).

**Offen:**
- Datenblatt der Person als PDF, Spaltenauswahl in der Personenliste, Historie auf der Fahrzeugseite
- Personalakte: Wiederaufnahme ausgeschiedener Personen
- Werte für die Jahresstatistik (Personal- und Bestandszahlen, siehe [Jahresstatistik](../jahresstatistik.md))
- Personalstärke nach Altersgruppen (die Liste zählt bisher nach Status und Geschlecht)
- Erinnerung an die Person selbst und Vollexport (siehe [Fachmodell](../fachmodell.md#erinnerungen-und-fristen))

Die folgenden Abschnitte beschreiben das vollständige Zielbild.

## Entitäten

Alle Entitäten sind historisiert (siehe [Historie](../fachmodell.md#historie)).

### Feuerwehr und Abteilung

| Feld | Bemerkung |
| --- | --- |
| Name, Kurzname | „Abteilung Weidenhain“, „Abt. Weidenhain“ |
| Typ | Einsatzabteilung, Jugendfeuerwehr, Altersabteilung, Musikabteilung, Kinderfeuerwehr, Sonderdienst, Führungseinheit |
| Übergeordnete Abteilung | bei Alters- und Jugendabteilung. Eine gesamtwehrweite Jugendfeuerwehr (wie in Musterstadt) hat keine übergeordnete Abteilung. |
| Sonderaufgaben | Kennzeichen für die Jahresstatistik: Rettungsdienst, NAW-Betrieb, Strahlenschutz, Gefahrstoff, Höhenrettung, Tauchdienst, Führungseinheit ab Stufe C |
| Abteilungskommandant, Stellvertreter | Verweis auf Person |
| Statistikrelevant | Typ legt den Standard fest, überschreibbar |

### Wache

Name, Anschrift, Abteilung, Kennzeichen „ständig besetzt“ (Jahresstatistik), Bemerkung.

Die Wache in der Organisation bekommt eine eigene Karte mit ihren Daten (Mockup `stammdaten/organisation.html#wache`). Die Karten anderer Module je Wache (Erweiterungspunkt `masterdata.station.sections`, z. B. die Infoterminals) sind umgesetzt und stehen bisher unter der Tabelle der Wachen.

### Fahrzeug

| Feld | Bemerkung |
| --- | --- |
| Bezeichnung | „LF 20/16“ |
| Funkrufname | „Florian Musterstadt 1/44“ |
| Kennzeichen | |
| Fahrzeugtyp | Katalog (LF 20, MLF, TSF, MTW, ELW 1, DLA(K) 23-12, RW, GW-L1, Anhänger, Boot) mit Normbesatzung (z. B. 1/8) |
| Abteilung, Wache | |
| Besatzungsplätze | Standard aus Typ, z. B. 9 |
| Baujahr, Indienststellung, Außerdienststellung | |
| Kostenersatz-Kategorie | für das spätere Modul Kostenersatz |
| Statistik-Kategorie | Position der Jahresstatistik (Katalog F63–F120, z. B. HLF 20 → F70), Pflichtfeld |
| Status | in Dienst, außer Dienst, ausgesondert |

Prüffristen des Fahrzeugs (HU, UVV) gehören ins Modul Geräte. Ohne dieses Modul gibt es nur die Stammdaten.

### Person

| Gruppe | Felder |
| --- | --- |
| Name | Anrede, Titel, Vorname, Nachname, Rufname |
| Kontakt | Anschrift (Straße, PLZ, Ort), Telefon privat/mobil/dienstlich, E-Mail |
| Persönlich | Geburtsdatum, Geburtsort, Geschlecht |
| Beschäftigung | ehrenamtlich, hauptberuflich (höherer, gehobener, mittlerer Dienst), Beschäftigte Feuerwehrdienst, Beschäftigte Verwaltung (Jahresstatistik) |
| Arbeitgeber | Name, Anschrift, Telefon, Ansprechpartner (für Verdienstausfall und Freistellung) |
| Feuerwehr | Personalnummer, Eintrittsdatum Feuerwehr („Mitglied seit“), Dienstgrad (aktueller Stand, Beförderungen als Liste), Status (Probezeit, aktiv, passiv, Jugend, Altersabteilung, ausgeschieden), Ende der Probezeit, Austrittsdatum und -grund, Kennzeichen Musiker |
| Mitgliedschaften | Abteilung, von, bis, Stammabteilung ja/nein |
| Kennzeichen | Atemschutzgeräteträger, Maschinist, … aus dem Qualifikationskatalog, mit Gültigkeit |
| Führerschein | Klassen (u. a. C/CE für die Jahresstatistik), Ablaufdatum, Datum der letzten Kontrolle |
| Bankverbindung | IBAN, Kontoinhaber (für Entschädigungen) |
| Ehrungen | Ehrung (Katalog), Datum |
| Bemerkung | Freitext |

Untergeordnete Listen an der Person: Lehrgangsteilnahmen, Lehrgangsvormerkungen, Qualifikationen, Beförderungen, Ehrungen, Mitgliedschaften. Andere Module hängen weitere Reiter ein (Atemschutz: Untersuchungen und Nachweise; Einsatzberichte: Einsätze der Person).

### Aufnahme, Probezeit und Altersgrenzen

Der Ablauf folgt der örtlichen Feuerwehrsatzung; ihre Werte (Probezeit, Altersgrenzen, entscheidendes Gremium) sind Einstellungen:

1. **Aufnahme auf Probe**: Die Person wird mit Status *Probezeit* angelegt. Das Ende der Probezeit ergibt sich aus der Einstellung (Standard 12 Monate).
2. **Verkürzen oder verlängern**: Das Ende der Probezeit ist mit Begründung änderbar, z. B. bei vorheriger Jugendfeuerwehr. Das Datum des Beschlusses (Feuerwehrausschuss) wird mitgespeichert.
3. **Endgültige Aufnahme**: Der Status wechselt mit Beschlussdatum auf *aktiv*.

Wer entscheidet, ist eine Einstellung. Standard ist der Feuerwehrausschuss nach Anhörung des Abteilungsausschusses.

**Erinnerungen und Listen:**

| Anlass | Standard | Empfänger |
| --- | --- | --- |
| Probezeit endet | 30 Tage vorher | Abteilungskommandant, Kommandant |
| Grundausbildung in der Probezeit fehlt | 60 Tage vor Ende der Probezeit, wenn Truppmann Teil 1 nicht bestanden ist | Abteilungskommandant |
| Mindestalter Einsatz (18) erreicht | am Geburtstag | Abteilungskommandant |
| Altersgrenze Einsatzabteilung (65) | 90 Tage vorher, mit Vorschlag zum Wechsel in die Altersabteilung | Kommandant |
| Antrag Altersabteilung möglich (55) | nur als Liste | – |
| Ende der Jugendfeuerwehr (18) | 90 Tage vorher, mit Vorschlag zum Übertritt in eine Einsatzabteilung | Jugendfeuerwehrwart |

Alle Altersgrenzen sind Einstellungen.

### Lehrgangskatalog, Lehrgangsteilnahme, Vormerkung

- **Katalog** (nur Administrator): Bezeichnung, Kürzel, Ebene (Gemeinde, Kreis, Landesfeuerwehrschule), vermittelte Qualifikation(en), Voraussetzungen (andere Lehrgänge), Gültigkeit der Qualifikation (z. B. keine, oder 1 Jahr). Ein Vorschlagskatalog für Baden-Württemberg wird bei der Installation angeboten (siehe [Vorschriften](../../recherche/vorschriften-bw.md)).
- **Teilnahme**: Lehrgang, Datum (von–bis), Ergebnis *bestanden* / *nicht bestanden*, Lehrgangsort, Bemerkung. Bei *bestanden* werden die Qualifikationen des Lehrgangs an der Person gesetzt.
- **Vormerkung**: Lehrgang, Person, Priorität, gewünschter Zeitraum, Status (vorgemerkt, angemeldet, Platz zugesagt, abgelehnt). Aus einer Vormerkung wird nach dem Lehrgang eine Teilnahme.
- **Lehrgangsplanung** (zentrale Ansicht): je Lehrgang alle Vormerkungen über alle Abteilungen, mit Erfüllung der Voraussetzungen. Daneben, wer die Voraussetzungen erfüllt, aber nicht vorgemerkt ist. Export für die Meldung an den Kreis.

### Kataloge

Funktionen (im Einsatz), Qualifikationen, Fahrzeugtypen, Statistik-Kategorien der Fahrzeuge (F63–F120, fest nach Landesvorlage), Ehrungen, Austrittsgründe, Dienstgrade. Alle außer den Statistik-Kategorien pflegbar durch den Administrator, mit Vorlage für Baden-Württemberg.

## Listen (Vorlagen)

| Liste | Inhalt |
| --- | --- |
| Komplettdaten | alle Felder je Person, Filter nach Abteilung und Status |
| Mitgliederliste | Name, Abteilung, Dienstgrad, Eintritt, Telefon |
| Unterschriftenliste | Name, Abteilung, leere Spalte Unterschrift; Titel und Datum frei |
| Telefonliste / Alarmliste | Name, Mobil, Funktion |
| Geburtstage | Zeitraum wählbar, runde Geburtstage markiert |
| Jubiläen | Dienstjahre 10/15/25/40/50 im gewählten Jahr |
| Qualifikationsübersicht | Matrix Person × Qualifikation |
| Lehrgangsplanung | siehe oben |
| Atemschutzgeräteträger | Personen mit Kennzeichen Atemschutz. Die Tauglichkeitsauswertung mit Fristen liefert das Modul Atemschutz. |
| Fahrzeugliste | Fahrzeuge je Abteilung und Wache |
| Personalstärke | Anzahl je Abteilung, Typ, Altersgruppe, Geschlecht |
| Probezeit | Personen in der Probezeit mit Ende und Stand der Grundausbildung |
| Altersgrenzen | Personen, die im gewählten Jahr 18, 55 oder 65 werden |

Die Werte für das Landesportal liefert die modulübergreifende [Jahresstatistik](../jahresstatistik.md).

## Oberfläche

- **Personenliste**: Suche oben, Filter Abteilung, Status, Qualifikation; Spalten wählbar; Zeile anklicken öffnet die Person.
- **Personenakte**: Kopf mit Name, Dienstgrad, Abteilung, Kennzeichen als Plaketten. Darunter Reiter: Stammdaten, Feuerwehr, Lehrgänge, Qualifikationen, Ehrungen, (Modulreiter), Historie. Bearbeiten direkt im Reiter, Speichern rot.
- **Organisation**: Baum Feuerwehr → Abteilungen mit Wachen und Fahrzeugen.
- **Lehrgangsplanung**: Tabelle je Lehrgang, Vormerkungen per Mehrfachauswahl anlegen.

## Rechte

`masterdata.persons.read`, `masterdata.persons.write`, `masterdata.persons.sensitive` (Geburtsdatum, Bank, Arbeitgeber), `masterdata.organization.manage`, `masterdata.courses.plan`, `masterdata.catalogs.manage`. Alle außer Katalog sind abteilungsbezogen.

## Schnittstellen zu anderen Modulen

- `PERSON_DIRECTORY`: Personen suchen (`search`), Personen mit Abteilungen, gültigen Qualifikationen und Dienstgrad zu einem Stichtag liefern (`snapshots`), Suche über Personalnummer (`findByPersonnelNumber`).
- `ORGANIZATION`: Abteilungen, Wachen, Fahrzeuge (`departments`, `stations`, `vehicles`).
- Ereignisse: `masterdata.person.left`, `masterdata.person.qualification-changed`, `masterdata.course.passed`, `masterdata.course.revoked`.

## Import

Zuordnungsprofil MP-Feuer `Personal.xlsx` (Anrede, Vorname, Nachname, Straße, PLZ, Ort, Abteilung). Weitere Spalten werden über den Spaltenzuordner gemappt.
