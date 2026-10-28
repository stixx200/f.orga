# Jahresstatistik (Landesportal)

Release 1. Diese Auswertung ist modulübergreifend: Einsatzberichte und Stammdaten liefern je einen Teil der Werte. Sie erzeugt die Abgabedatei für das Statistikportal der Landesfeuerwehrschule BW. Format und Fragenkatalog stehen in [Jahresstatistik BW](../recherche/jahresstatistik-bw.md).

**Bereits umgesetzt (Backend, im Modul `incidents`)**, siehe [implementiert/architektur.md](../implementiert/architektur.md#modul-einsatzberichte-incidents): Berechnung F1–F120, Korrekturen je Wert (auch F121–F129), Plausibilitätsprüfungen, Abschließen/Wiederöffnen, Export in die eingebettete Landesvorlage (Spalten D, F, G, H).

**Offen:**
- CSV im MP-Feuer-Format und PDF zur Ablage
- Vorschau mit Drill-down auf die gezählten Einsätze, Personen und Fahrzeuge (Oberfläche)
- Begründung je Korrektur, gespeicherte Abgabefassungen mit Versionen
- Einstellungen für die Zählweisen aus „Offene Punkte“ und die Einwohnerzahl
- Prüfung „jedes Fahrzeug hat eine Statistik-Kategorie“ (heute durch Pflichtfeld am Fahrzeug erzwungen)

Die folgenden Abschnitte beschreiben das Zielbild.

## Ergebnis

- **Abgabedatei**: die Import-Vorlage „Import Antworten FULL.xlsx“, befüllt mit den Werten des Jahres.
  - Die Vorlage liegt als Schablone im Repository. Ihre Dokumenteigenschaften (Ersteller, Pfad) sind neutralisiert.
  - Zeilen, IDs und Fragetexte bleiben unverändert, auch die Tippfehler. Nur die zulässigen Zellen C–J werden als Ganzzahl gefüllt.
  - Für eine Freiwillige Feuerwehr füllt f.orga Spalte **D (FF)**, auf den Seiten 1–3 zusätzlich **F (JF)**, **G (Altersabteilung)** und **H (Musikabteilung)**.
- **CSV im MP-Feuer-Format** (UTF-8 mit BOM, `;`, Kopfzeilen Jahr und Einwohnerzahl), damit sich die Werte mit den Vorjahren vergleichen lassen.
- **PDF** mit allen Fragen und Werten zur Ablage und für die Hauptversammlung.
- **Sprache**: Abgabedatei und CSV bleiben im deutschen Format der Landesvorlage, unabhängig von der Oberflächensprache. Das PDF entsteht in der Sprache des Benutzers. Die Fragetexte der Vorlage bleiben dabei deutsch.

## Zeitbezug

- **Einsätze** (F26–F62): Kalenderjahr, maßgeblich ist das Einsatzdatum.
- **Personen, Organisation, Fahrzeuge, Funk** (F1–F25, F63–F129): Stand am **Stichtag 31.12.** Personen, Mitgliedschaften und Fahrzeuge werden dafür mit ihren Gültigkeitszeiträumen zum Stichtag ausgewertet. Möglich ist das, weil Mitgliedschaften von–bis und Fahrzeuge Indienst- und Außerdienststellung haben.

## Herkunft der Werte

| Fragen | Liefert | Grundlage |
| --- | --- | --- |
| F1–F11 | Stammdaten, Organisation | Abteilungen nach Typ, Sonderaufgaben-Kennzeichen der Abteilung (Rettungsdienst, NAW, Strahlenschutz, Gefahrstoff, Höhenrettung, Tauchdienst, Führungseinheit ab Stufe C), Wachen mit Kennzeichen „ständig besetzt“ |
| F12–F25 | Stammdaten, Personen | Status und Mitgliedschaft am Stichtag, Abteilungstyp, Geschlecht, Beschäftigungsart, Führerschein C/CE, Qualifikationen Atemschutzgeräteträger, Gruppenführer und Zugführer, Kennzeichen Musiker |
| F26–F27 | Einsatzberichte, Dienste | verletzte bzw. tödlich verunglückte eigene Einsatzkräfte aus Einsätzen; Verletzte aus abgeschlossenen Diensten (F26). Tödliche Unfälle außerhalb von Einsätzen manuell. |
| F28–F62 | Einsatzberichte | Statistikmerkmale der Einsätze (siehe [Einsatzberichte](module/einsatzberichte.md#statistikmerkmale-feuerwehrstatistik-bw)). Rettungsdienst und Krankentransport (F46–F49) erfasst die Feuerwehr nicht; diese Felder bleiben leer ([E12](entscheidungen.md#e12-rettungsdienst-und-krankentransport-nicht-erfassen)). |
| F63–F120 | Stammdaten, Fahrzeuge | Fahrzeuge im Dienst am Stichtag, gruppiert nach ihrer **Statistik-Kategorie** |
| F121–F129 | manuell | Funkgeräte und Meldeempfänger, bis das Modul [Geräte](../implementiert/architektur.md#modul-geräte-equipment) den Bestand liefert |

**Zählung der Einsätze.** Jeder Einsatz zählt genau einmal, mit seinen Statistikmerkmalen. Personenschäden und eigene Verletzte werden aus allen Berichten des Einsatzes summiert. Doppelte Personen werden dabei nicht doppelt gezählt.

## Nötige Daten in den Modulen

| Modul | Daten |
| --- | --- |
| Stammdaten, Abteilung | Typ (einschließlich Musikabteilung), Sonderaufgaben-Kennzeichen |
| Stammdaten, Wache | Kennzeichen „ständig besetzt“ |
| Stammdaten, Person | Geschlecht, Beschäftigungsart (ehrenamtlich, hauptberuflich mit Laufbahn, Beschäftigte Feuerwehrdienst, Beschäftigte Verwaltung), Führerscheinklassen, Kennzeichen Musiker |
| Stammdaten, Fahrzeug | Statistik-Kategorie aus einem Katalog der Positionen F63–F120 |
| Einsatzberichte | Statistikmerkmale des Einsatzes, eigene Verletzte und Tote |
| Einstellungen | Einwohnerzahl der Gemeinde (für die CSV), Bestand an Funkgeräten und Meldeempfängern |

## Ablauf

1. Jahr wählen. f.orga berechnet alle 129 Werte.
2. **Vorschau** in der Gliederung der Vorlage (Seite 1–14). Jeder Wert zeigt seine Herkunft und ist klickbar: Ein Klick zeigt die gezählten Einsätze, Personen oder Fahrzeuge.
3. **Plausibilitätsprüfung**:

   | Prüfung | Bedingung |
   | --- | --- |
   | Brände | F28 = F29 + F30 + F31 + F32 |
   | Technische Hilfe | F37 = F38 + … + F45 |
   | Fehlalarme | F51 = F52 + F53 + F54 |
   | „davon“-Werte | kein „davon“ größer als seine Summe (z. B. F14 ≤ F13, F19–F24 ≤ F13, F56 ≤ F55, F57 ≤ F55, F60 ≤ F59, F62 ≤ F61, F11 ≤ F10) |
   | Hauptberichte | jeder Einsatz des Jahres hat einen Hauptbericht und vollständige Statistikmerkmale |
   | Fahrzeuge | jedes Fahrzeug im Dienst hat eine Statistik-Kategorie |

   Offene Prüfungen verlinken direkt auf den betroffenen Bericht oder Datensatz.
4. **Manuelle Korrektur** einzelner Werte mit Begründung, z. B. für Funkgeräte oder einen Sonderfall. Korrigierte Werte sind markiert.
5. **Abschließen und exportieren**:
   - Die Werte werden als Abgabe des Jahres gespeichert und sind danach unveränderlich.
   - Erzeugt werden die XLSX, die CSV und das PDF.
   - Eine erneute Abgabe ist als neue Fassung mit Begründung möglich.

## Offene Punkte

Die Fragen an das Statistikportal (0 oder leere Zelle, Import nach ID oder Position, Zählweise ZF/GF und Atemschutzgeräteträger, Brandgrößen) stehen in [Jahresstatistik BW](../recherche/jahresstatistik-bw.md#offene-punkte). Umgesetzt ist bis zur Klärung:

- Felder ohne Wert bleiben leer.
- Zellpositionen und IDs bleiben exakt wie in der Vorlage.
- F22 und F23 zählen die gültigen Qualifikationen `group-leader` bzw. `platoon-leader`; ein Zugführer zählt nur dann auch als Gruppenführer, wenn er diese Qualifikation hat.
- F20 zählt alle aktiven Mitglieder mit gültiger Qualifikation `breathing-apparatus`.

Später soll jede dieser Regeln eine Einstellung sein.

## Rechte

`incidents.statistics` (Gesamtwehr): Vorschau, Korrektur, Abschluss und Export.
