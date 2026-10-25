# Regeln aus den Altanwendungen

Die Programme `Einsatzberichte` (Prüf-App, Flask) und `Einsatzabrechnung` (`auswertung.py`) im Ordner `feuerwehr` arbeiten auf Exporten aus MP-Feuer. Ihre Regeln fließen in f.orga ein.

## Datenquellen aus MP-Feuer

- **Personalexport** (`MP-EXCEL.xlsx` bzw. `Einsaetze_Personal.xlsx`): eine Zeile je Person und Bericht, 78 Spalten. Die Berichtsdaten stehen redundant in jeder Zeile.
  - Wichtige Spalten: `Name` („Nachname Vorname“), `von`, `bis`, `BE` (Bereitschaft), `AS`, `V-A` (Verdienstausfall), `Vergütung`, `Aufgabe`, `Fzg.-Nr.`, `Bezeichnung` (1. Vorkommen Fahrzeug, 2. Vorkommen Abteilung), `Funkrufname`, `Kennzeichen`, `Einsatz-Nr.`, `Beginn`, `Ende`, `Alarmstichwort`, `Leitstellen-Nr.`, `Statistik`, `bei Ges. Stat. anzeigen`, `bei Abt. Stat. anzeigen`, `Zusatzfeld 1` (Verantwortlicher bzw. „abgeschlossen“), `Zusatzfeld 2` (Freigabestatus), `Pers.-Rettung`, `Verletzte`, `Tier-Rettung`, `kostenpflichtiger Einsatz`, `überörtlicher Einsatz`.
- **Berichtsexport** (`Einsatzberichte_Zusatz.xlsx`): eine Zeile je Bericht, mit zusätzlichen Spalten wie `Wettereinfluss`, `Wetterlage`, `Sachschaden`, `Brandfläche` und `GUID`.
- **Personalstamm** (`Personal.xlsx`): `Anrede`, `Vorname`, `Nachname`, `Straße`, `PLZ`, `Ort`, `Bezeichnung` (Personalabteilung).
- **Statistikwerte** sehen so aus: `#L TH1-Menschenrettung`, `#L Fehlalarm.BMA`, `#L Kleinbrände A`, `#L TH-Überlandhilfe`, `#L Sonstige Einsätze`.
  - `Lage`, `Verlauf` und `Ursache` sind kurze Auswahlwerte, der Freitext steht in `Bericht`.
- **Stammdatenliste**: `Pers.-Nr.` (zweimal), `Vorname`, `Nachname`, `Straße`, `Ort`, `E-Mail privat`.
- **Jugendfeuerwehr** (ebenfalls `MP-EXCEL.xlsx`, 86 Spalten): `Jug.-Nr.`, `Anrede`, `Vorname`, `Nachname`, `Geschlecht` (M/W), `Geb.-Datum`, Kontaktdaten (`Tel. privat`, `Handy privat`, `E-Mail privat` …), Erziehungsberechtigte (`Erzieh.ber. 1/2` mit `EZB1 …`/`EZB2 …`), `Einheiten` (Jugendgruppen), `Funktionen`, `Aktiv von`, `Aktiv bis`, `Grund`, `Bezeichnung` (z. B. „Gesamt-Jugendfeuerwehr“), dazu Gesundheitsangaben, die f.orga nicht übernimmt.
- **Transferdateien** (`MPTRA_<Nr>_<Zeitstempel>_<Einheit>.zip`, MP-Feuer-Version 2025 B): eine je Abteilung, Altersabteilung, Jugendfeuerwehr, Führungsgruppe, Sonderdienste und Gesamtfeuerwehr. Inhalt `MPTRA.IFO` (`type=transfer`, `encrypted`), `content.xml` (Menübaum der Tabellen) und `transfer.db` (SQLite).
  - Tabellen mit Präfix je Bereich, z. B. `PER_*` (Personal: `STAMM`, `LEHRG`, `HIST`, `PRUEF`, `AUSR`, `WETTK`), `JUG_*`, `EIN_*` (Einsätze: `STAMM`, `PERS`, `FAHRZ`, `MAT`, `BETR`), `UPE_*` (Übungen), `EIW_*` (Einsatzwachen), `VPE_*` (Vergütungen), `FZG_*` (Fahrzeuge), `GAS_*`, `GSO_*`, `GFU_*` … (Geräte), `KLD_*` (Kleiderkammer), `SYS_DELETED` (Löschprotokoll).
  - Schlüssel sind GUIDs (`<Präfix>_ID`); Kindtabellen verweisen mit `<Präfix>_INDEX` auf die Elternzeile. Merkmale sind 0/1, Zeiten `JJJJ-MM-TT hh:mm:ss.000`, „kein Datum“ ist `1899-12-30`. Auswahlwerte stehen zusätzlich als Text in Spalten mit `_OW` (z. B. `PER_GESCHLECHT_OW` M/W, `EIN_KATEGORIE_OW`).
  - Die Personalnummer (`PER_NR`) zählt je Abteilung; dieselbe Nummer gehört in verschiedenen Abteilungen verschiedenen Personen. Wer ausgeschieden ist, ist archiviert (`PER_ARCHIV_DAT`); `PER_AKTIV_BD` allein markiert in den Altersabteilungen das Ende des aktiven Dienstes.
  - `PER_PRUEF` enthält G26-Untersuchungen, Belastungsübungen (`AS-Strecke`), Heißausbildung (`AS-BÜC`), Führerscheinkontrollen und Unterweisungen; `PER_HIST` die Kategorien Dienstgrad, Ehrung, Funktion, Dienststellung, Einheit, Abteilung und Unterbrechung.

## Datenmodell der Prüf-App

- **Bericht** = Abteilung + Einsatz-Nr. + Beginn.
- **Einsatz** = alle Berichte mit derselben Leitstellen-Nr.
- **Hauptbericht** = „bei Ges. Stat. anzeigen“ ist gesetzt. Genau einer je Einsatz.
- Der **Verantwortliche** steht in Zusatzfeld 1, bis dort „abgeschlossen“ eingetragen ist.
- Namen werden für den Abgleich normalisiert: Vor- und Nachname in beliebiger Reihenfolge.
- **Ausnahmen** gelten für die Abteilungen „Sonderdienste“ und „Gesamtfeuerwehr“ sowie die Stichworte „Sicherheitsdienst“, „Brandsicherheitsdienst“ und „Sonstiges“.

## Prüfregeln

| Regel | Bedingung |
| --- | --- |
| kein Hauptbericht | Kein Bericht des Einsatzes hat Ges.-Stat. |
| mehrere Hauptberichte | Mehr als ein Bericht hat Ges.-Stat. Ein manuell festgelegter Hauptbericht hat Vorrang. |
| Ges.-Stat. bzw. Abt.-Stat. verboten | Bei Sonderdiensten, Sicherheitsdienst, Brandsicherheitsdienst und Sonstiges |
| Abt.-Stat. fehlt | Jeder normale Bericht zählt in der Abteilungsstatistik. |
| Bericht leer | kein Berichtstext |
| Statistik fehlt | Hauptbericht ohne Statistik |
| Statistik verboten | Sicherheitsdienst der Sonderdienste oder Stichwort Sonstiges |
| Fahrzeug fehlt | Person ohne Fahrzeug und nicht in Bereitschaft, außer bei Sonderdiensten, Gesamtfeuerwehr, Sicherheitsdienst und Sonstiges |
| Vergütung fehlt | V-A gesetzt, aber kein Betrag. 0 gilt als Betrag. |
| Verantwortlicher | Zusatzfeld 1 ist leer oder noch nicht „abgeschlossen“. |
| kein Personal | Bericht nur im Berichtsexport vorhanden |
| Widerspruch | Berichtsfelder unterscheiden sich zwischen den Personalzeilen. Das ist ein Fehler im Export. |

- Jede Regel ist abschaltbar, jeder Hinweis lässt sich je Bericht ignorieren.
- Offene Berichte werden nach Verantwortlichem gruppiert und per Mail verschickt.
- Hinzu kommen eine Excel-Liste und eine MP-Feuer-Filterdatei (`.flt`).

## Abrechnung

- `auswertung.py` **rechnet nicht selbst**, sondern summiert die Spalte `Vergütung` aus MP-Feuer.
- Aus den Daten ergibt sich:
  - Satz × angefangene Stunden: 12,50 €/h bis etwa Mitte 2025, danach 15,00 €/h
  - Bereitschaft wird zum selben Satz abgerechnet.
  - Einzelne Pauschalen (90 €, 385 €, 500 €) und EvD-Pauschalen über ein Halbjahr
- **Filter**: Zeitraum über `von`, der Endtag zählt ganz. Nur Zeilen mit Status „zur Abrechnung freigegeben“.
- **Fehler**:
  - fehlender Beginn oder fehlendes Ende
  - fehlender Betrag bei V-A
  - V-A oder Betrag bei „Arbeitszeit Stadt Musterstadt“
  - nicht freigegeben
- **Duplikate**:
  - gleicher Zeitpunkt
  - überlappender Zeitraum derselben Person (Aneinandergrenzen ist erlaubt, Zeiträume über 24 h werden ignoriert)
- **Gruppierung**: Betrag pro Person nach Personalabteilung, Summe je Abteilung nach Einsatz-Abteilung.
- **Ausgabe**:
  - Excel mit den Blättern Betrag pro Person, Summe je Abteilung, Fehler, Fehler je Abteilung, Duplikate, Einsätze
  - Je Personalabteilung ein PDF mit einer Abrechnungsübersicht je Person: Anschrift, Einsätze, Summe, „(AZ)“ bei Arbeitszeit

## Stammdaten aus den Daten

- **Abteilungen**:
  - Musterstadt, Birkenhain, Weidenhain, Pappelhain, Ahornfeld, Eschenbrunn
  - je eine Altersabteilung
  - Führungsgruppe Musterstadt, Sonderdienste, Gesamtfeuerwehr
- **Fahrzeuge**: LF 20/16, LF KatS, MLF 10/6, MTW, KdoW, DLA (K) 23-12 GLT, ELW 1, RW 2, TSF, LF 8/6, GW-L1, Bootsanhänger, Mehrzweckboot
- **Funktionen**: Maschinist, Gruppenführer, Einheitsführer, EvD, Einsatzleiter, Angriffs-/Wassertrupp, Führungsgruppe, F1–F7, PEER, Praktikant
