# Jahresstatistik Baden-Württemberg: Abgabeformat

Grundlage sind zwei Dateien der Feuerwehr Musterstadt:

- **Import-Vorlage des Statistikportals der LFS BW**, Datei „Import Antworten FULL.xlsx“, Stand 04/2023. In diesem Format meldet f.orga die Statistik.
- **MP-Feuer-Export** „2025_Statistik.csv“. So sieht die bisherige Abgabe aus.

Die Umsetzung in f.orga plant [Jahresstatistik](../geplant/jahresstatistik.md).

## Überblick

- Die Vorlage ist **ein Blatt mit 129 Zahlenfeldern** (IDs `F1`–`F129`).
- Jede **Frage hat eine Zeile**, jede **Organisationsart eine Spalte**.
- Eine Datei enthält genau eine Feuerwehr. Jahr, Gemeindekennung und Einwohnerzahl stehen nicht in der Datei. Die Zuordnung läuft vermutlich über die Anmeldung im Landesportal.
- Die MP-Feuer-CSV enthält **dieselben 129 Positionen in derselben Reihenfolge**. Davor stehen Jahr und Einwohnerzahl.
- Die Vorlage enthält **keine Personendaten**, nur Summen. Abgefragt werden weder Übungsdienst noch Ausbildungsstunden, Einsatzzeiten oder Einsatzkräfte je Einsatz.

## Aufbau der Import-Vorlage

| Merkmal | Befund |
| --- | --- |
| Blatt | nur `Tabelle1`, Bereich A1:J160 |
| Zeile 1 | leer |
| Spalte A | ID `F1` … `F129` (Text). In den Abschnittsköpfen steht dort `ID`. |
| Spalte B | Fragetext. Abschnittsköpfe heißen „Seite 1: …“ bis „Seite 14: …“. Unterpunkte beginnen mit `-` (davon) bzw. `--` (davon-davon). |
| Spalten C–J | Wertespalten. Ihre Bedeutung wechselt je Abschnitt (siehe unten). |
| Abschnitte | 14 Blöcke mit eigener Kopfzeile, dazwischen Leerzeilen |
| Datentyp | Ganzzahl. Eingabezellen haben das Zahlenformat `0` und eine Füllfarbe. Dezimalwerte und Datumsangaben kommen nicht vor. |
| Prüfungen, Formeln, Namen, verbundene Zellen | keine |
| Pflichtfelder | nicht gekennzeichnet. Leere Zellen bedeuten im Beispiel 0. |
| Metadaten | Ersteller und ein lokaler Windows-Pfad des Dienstleisters stehen in den Dokumenteigenschaften. Beim Befüllen werden sie neutralisiert. |

Die Fragetexte enthalten Tippfehler. Sie bleiben unverändert, weil der Import sie möglicherweise vergleicht:

- „Feuerwehdienst“
- „Gerette Menschen“
- „Rust- und Gerätewagen“
- „böswillige  Alarme“ mit doppeltem Leerzeichen

### Spaltenbedeutung je Abschnitt

| Abschnitt (Zeilen) | C | D | E | F | G | H | I | J |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S. 1 Organisation (2–13) | BF | FF | HA | JF | Alt.-A | Mus.-A | WF | JF (WF) |
| S. 2 Feuerwehrangehörige (15–29) | BF | FF | HA | JF | Alt.-A | Mus.-A | WF | JF (WF) |
| S. 3 Im Feuerwehrdienst (31–33) | BF | FF | HA | JF | Alt.-A | Mus.-A | WF | – |
| S. 4–7 Einsätze, Gerettete, Tote (36–77) | BF/HA | FF | BF/HA + FF gemeinsam | WF | – | – | – | – |
| S. 8–14 Fahrzeuge, Funk (80–160) | BF | FF | HA | WF | – | – | – | – |

BF = Berufsfeuerwehr, FF = Freiwillige Feuerwehr, HA = hauptamtliche Kräfte, JF = Jugendfeuerwehr, Alt.-A = Altersabteilung, Mus.-A = Musikabteilung, WF = Werkfeuerwehr.

### Zulässige Zellen

Nur gefüllte Zellen sind Eingabezellen. Die übrigen sind umrandet, aber nicht gefüllt.

| IDs | Zulässige Spalten |
| --- | --- |
| F1 | I, J |
| F2 | C–I |
| F3–F11 | C, D, E, I |
| F12 | F, G, H, J |
| F13–F22, F25 | C, D, E, I |
| F23 | C–J |
| F24 | C, D, E, F, G, I |
| F26, F27 | C–I |
| F28–F129 | C–F |

Für eine Freiwillige Feuerwehr wie Musterstadt sind praktisch nur **D (FF)** sowie auf den Seiten 1–3 **F, G, H (JF, Alt.-A, Mus.-A)** belegt.

## Fragenkatalog

**Seite 1: Organisation und Aufgaben**

| ID | Frage |
| --- | --- |
| F1 | Werkfeuerwehr |
| F2 | Abteilungen |
| F3–F9 | davon mit: Rettungsdienst, NAW-Betrieb, Strahlenschutz, Gefahrstoff, Höhenrettung, Tauchdienst, Führungseinheit (ab Stufe C) |
| F10 | Feuerwehrhäuser/-wachen |
| F11 | davon mit ständiger Besetzung |

**Seite 2: Feuerwehrangehörige (FA)**

| ID | Frage |
| --- | --- |
| F12 | FA (sonstige) |
| F13 | FA (Einsatzabteilungen) |
| F14 | davon hauptberuflich |
| F15–F18 | darunter höherer, gehobener, mittlerer Dienst, Beschäftigte Feuerwehrdienst |
| F19 | davon weibliche FA |
| F20 | davon Atemschutzgeräteträger |
| F21 | davon Führerschein C/CE |
| F22 | davon Gruppenführer |
| F23 | davon Zugführer |
| F24 | davon Musiker |
| F25 | Beschäftigte Verwaltung |

**Seite 3: Im Feuerwehrdienst**

| ID | Frage |
| --- | --- |
| F26 | verletzte FA |
| F27 | tödlich verunglückte FA |

**Seite 4: Art der Einsätze**

| ID | Frage |
| --- | --- |
| F28 | Brände/Explosionen in der eigenen Gemeinde |
| F29–F32 | davon Kleinbrände A, Kleinbrände B, Mittelbrände, Großbrände |
| F33 | Brände/Explosionen als Überlandhilfe |
| F34 | Technische Hilfe als Überlandhilfe |

**Seite 5: Art der Einsätze (nur eigene Gemeinde)**

| ID | Frage |
| --- | --- |
| F35 | Katastrophen-Voralarme |
| F36 | Katastrophen-Einsätze |
| F37 | Technische Hilfe insgesamt |
| F38 | davon 1 mit Menschenrettung |
| F39 | davon 2 mit Gefahrstoff ohne 3 |
| F40 | davon 3 Ölspur |
| F41 | davon 4 Tierrettung ohne 5 |
| F42 | davon 5 Insekten |
| F43 | davon 6 Hochwasser/Unwetter |
| F44 | davon 7 infolge Sturms |
| F45 | davon 8 sonstiger Art |
| F46 | Rettungsdiensteinsätze |
| F47, F48 | davon NAW, RTW |
| F49 | Krankentransporte |
| F50 | Sonstige Einsätze |
| F51 | Fehlalarmierungen insgesamt |
| F52 | davon Täuschungsalarm in gutem Glauben |
| F53 | davon böswillige Alarme |
| F54 | davon durch Brandmeldeanlagen |

**Seite 6: Gerettete Menschen (eigene Gemeinde)**

| ID | Frage |
| --- | --- |
| F55 | bei Bränden |
| F56 | davon Fahrzeugbrände |
| F57 | davon mit Rauchgasintoxikation |
| F58 | bei Technischer Hilfe |

**Seite 7: Tote (eigene Gemeinde)**

| ID | Frage |
| --- | --- |
| F59 | bei Bränden |
| F60 | davon Fahrzeugbrände |
| F61 | bei Technischer Hilfe |
| F62 | davon Verkehrsunfälle |

**Seite 8: Löschfahrzeuge**

| ID | Fahrzeug |
| --- | --- |
| F63 | TSF |
| F64 | TSF-W |
| F65 | StLF 10/6, MLF |
| F66 | LF 8 |
| F67 | LF 8/6, (H)LF 10/6, LF 10, HLF 10 |
| F68 | LF 16, LF 20 |
| F69 | LF 16-TS, LF KatS |
| F70 | LF 16/12, (H)LF 20/16, HLF 20 |
| F71 | LF 24 |
| F72 | TLF 8/18, TLF 2000 |
| F73 | TLF 16/24-Tr, TLF 3000 |
| F74 | TLF 16/25 |
| F75 | TLF 24/50, TLF 20/40-SL |
| F76 | TLF 20/40, TLF 4000 |
| F77 | Sonstige Löschfahrzeuge |

**Seite 9: Hubrettungsfahrzeuge**

| ID | Fahrzeug |
| --- | --- |
| F78 | DL 16-4 |
| F79 | DL 12-9 |
| F80 | DLAK 12-9 |
| F81 | DL 18-12 |
| F82 | DLAK 18-12 |
| F83 | DL 23-12 |
| F84 | DLAK 23-12 |
| F85 | GM/TM |
| F86 | Sonstige |

**Seite 10: Rüst- und Gerätewagen**

| ID | Fahrzeug |
| --- | --- |
| F87 | RW 1 |
| F88 | RW (RW 2/RW 3) |
| F89 | GW-G1 |
| F90 | GW-G (GW-G2 alt) |
| F91 | GW-A |
| F92 | GW-AS |
| F93 | GW-Öl |
| F94 | GW-Str |
| F95 | VRW/VGW |
| F96 | Sonstige RW |
| F97 | Sonstige GW |

**Seite 11: Sonstige Fahrzeuge (Straße/Wasser)**

| ID | Fahrzeug |
| --- | --- |
| F98 | KdoW (ELW 1 alt) |
| F99 | ELW 1 (ELW 2 alt) |
| F100 | ELW 2 (ELW 3 alt) |
| F101 | SW 1000 |
| F102 | SW 2000 |
| F103 | FwK |
| F104 | WLF |
| F105 | AB |
| F106 | GW-T (auch als SW), GW-L |
| F107 | MTW |
| F108 | Feuerlöschboot |
| F109 | MZB |
| F110 | RTB 2 |
| F111 | Sonstige Fahrzeuge |

**Seite 12: Feuerwehranhänger**

| ID | Fahrzeug |
| --- | --- |
| F112 | FwA-TS |
| F113 | Sonstige FwA |

**Seite 13: Sanitätsfahrzeuge**

| ID | Fahrzeug |
| --- | --- |
| F114 | KTW |
| F115 | RTW |
| F116 | NAW |
| F117 | NEF |
| F118 | GRTW |
| F119 | GKTW |
| F120 | Sonstige Sanitätsfahrzeuge |

**Seite 14: Funkanlagen**

| ID | Gerät |
| --- | --- |
| F121 | Ortsfeste Funkanlagen 4 m |
| F122 | Ortsfeste Funkanlagen digital |
| F123 | Fahrzeug-Funkanlagen 4 m |
| F124 | Fahrzeug-Funkanlagen digital |
| F125 | Fahrzeug-Funkanlagen 2 m |
| F126 | Handsprechfunkgeräte 2 m |
| F127 | Handsprechfunkgeräte 4 m |
| F128 | Handsprechfunkgeräte digital |
| F129 | Meldeempfänger |

## Aufbau der MP-Feuer-CSV

| Merkmal | Befund |
| --- | --- |
| Kodierung | UTF-8 mit BOM, Zeilenende CRLF |
| Trennzeichen | `;`, kein Quoting |
| Kopf | Zeile 1 `Jahr;2025`, Zeile 2 `Anzahl Einwohner der Gemeinde/Stadt;14300` |
| Struktur | keine Spaltenüberschriften. Blöcke sind durch zwei Leerzeilen getrennt. Jede Zeile enthält Bezeichnung und Werte, leere Felder bedeuten 0. |
| Zeilen | 129 Datenzeilen. Sie entsprechen F1–F129 in Reihenfolge und Bedeutung. Die Bezeichnungen weichen leicht ab, z. B. fehlen die `-`-Präfixe und es heißt „Gerettete Menschen bei …“. |

**Werte je Zeile.** Die Zuordnung ist aus Plausibilität erschlossen, weil die CSV keine Überschriften hat:

| CSV-Block | Werte | Zuordnung |
| --- | --- | --- |
| F1–F11 | 7 | BF, FF, HA, JF, Alt.-A, Mus.-A, WF |
| F12–F25 | 8 | Summe (nicht durchgehend gefüllt, wird ignoriert), BF, FF, HA, JF, Alt.-A, Mus.-A, WF |
| F26–F27 | 7 | BF, FF, HA, JF, Alt.-A, Mus.-A, WF |
| F28–F129 | 5 | Summe, dann die Spalten C–F der Vorlage |

**Plausibilität.** Im Beispiel 2025 sind die Summen stimmig, die Unterkategorien schließen sich also gegenseitig aus:

- TH gesamt = Summe der Kategorien 1–8
- Fehlalarme gesamt = gutgläubig + böswillig + BMA
- Brände = Kleinbrand A + Kleinbrand B + Mittelbrand + Großbrand

Die Meldeempfänger (F129) übersteigen die Zahl der Feuerwehrangehörigen. Gezählt werden also Geräte, nicht Personen.

## Herkunft der Werte

Legende:

- **E** = Einsatzbericht
- **P** = Personenstammdaten
- **Fz** = Fahrzeuge bzw. Inventar
- **O** = Organisationsstammdaten
- **M** = manuell

Personen- und Bestandszahlen gelten zum Stichtag 31.12., Einsatzzahlen für das Kalenderjahr.

| IDs | Quelle | Ableitung |
| --- | --- | --- |
| F1–F11 | O | Abteilungen nach Typ, Sonderaufgaben-Kennzeichen, Gerätehäuser mit Kennzeichen „ständig besetzt“ |
| F12 | P | aktive Mitglieder in Jugend-, Alters- und Musikabteilung |
| F13 | P | aktive Mitglieder der Einsatzabteilungen |
| F14–F18, F25 | P / M | Beschäftigungsart und Laufbahn; bei einer FF meist 0 |
| F19 | P | Geschlecht weiblich, je Abteilungstyp |
| F20 | P | Atemschutzgeräteträger (Kennzeichen bzw. Lehrgang). Ob eine gültige Tauglichkeit verlangt ist, ist offen. |
| F21 | P | Führerscheinklasse C oder CE |
| F22, F23 | P | Qualifikation Gruppenführer bzw. Zugführer |
| F24 | P | Kennzeichen Musiker bei Mitgliedern außerhalb der Musikabteilung |
| F26, F27 | E / M | Dienstunfälle eigener Kräfte (Einsatz; Übung bis zum Modul Übungsdienst manuell) |
| F28–F32 | E | Brand in der eigenen Gemeinde nach Brandgröße |
| F33, F34 | E | Brand bzw. TH als Überlandhilfe |
| F35, F36 | E | Kennzeichen Katastrophen-Voralarm bzw. Katastrophen-Einsatz |
| F37–F45 | E | TH in der eigenen Gemeinde mit genau einer Unterkategorie 1–8 |
| F46–F50 | E | Einsatzhauptart Rettungsdienst (NAW/RTW), Krankentransport, Sonstiges. In f.orga werden F46–F49 nicht erfasst ([E12](../geplant/entscheidungen.md#e12-rettungsdienst-und-krankentransport-nicht-erfassen)). |
| F51–F54 | E | Fehlalarm mit Art: gutgläubig, böswillig, BMA |
| F55–F58 | E | gerettete Personen, davon Rauchgasintoxikation, Kennzeichen Fahrzeugbrand |
| F59–F62 | E | Tote, Kennzeichen Fahrzeugbrand bzw. Verkehrsunfall |
| F63–F120 | Fz | Fahrzeugbestand am Stichtag, gruppiert nach Statistik-Kategorie |
| F121–F129 | M / Fz | Funkgeräte und Meldeempfänger nach Art und Band |

## Pflichtmerkmale im Einsatzbericht

1. Einsatzdatum (Jahr)
2. Eigene Gemeinde oder Überlandhilfe
3. Einsatzhauptart, genau eine: Brand/Explosion, Technische Hilfe, Fehlalarm, Rettungsdienst (NAW oder RTW), Krankentransport, Sonstiges. Dazu die Kennzeichen Katastrophen-Voralarm und Katastrophen-Einsatz.
4. Brandgröße bei Brand: Kleinbrand A, Kleinbrand B, Mittelbrand, Großbrand
5. TH-Unterkategorie bei TH, genau eine nach Rangfolge 1–8
6. Fehlalarmart: gutgläubig, böswillig, BMA
7. Gerettete Personen, davon mit Rauchgasintoxikation, sowie Tote. Kennzeichen Fahrzeugbrand und Verkehrsunfall.
8. Verletzte und tödlich verunglückte eigene Einsatzkräfte
9. Ein Einsatz mit mehreren Abteilungen zählt nur einmal.

Stichwort, Dauer, Fahrzeuge und Personal fragt die Vorlage nicht ab. Sie dienen nur zur Vorbelegung.

## Offene Punkte

| Punkt | Klärung bei |
| --- | --- |
| Erwartet der Import bei Wert 0 eine 0 oder eine leere Zelle? | Statistikportal LFS |
| Liest der Import nach ID (Spalte A) oder nach Zellposition? | Statistikportal LFS |
| Zählt ein Zugführer bei F22 auch als Gruppenführer? | LFS bzw. Kreisbrandmeister |
| Zählt F20 alle mit Lehrgang oder nur aktuell taugliche Geräteträger? | LFS bzw. Kreisbrandmeister |
| Definition der Brandgrößen | LFS. Üblich ist: A = Kleinlöschgerät oder bei Eintreffen erloschen, B = höchstens 1 C-Rohr, Mittelbrand = 2–3 C-Rohre, Großbrand = mehr. |
