# Marktübersicht Feuerwehr-Verwaltungssoftware

Stand der Recherche: Oktober 2026. Die meisten Angaben kommen von den Herstellern selbst. Unabhängige Bewertungen gibt es kaum.

## MP-FEUER (MP-BOS, früher MP-SOFT-4-U)

- **Module**:
  - Personal (mit Jugend und Beiträgen), Kleiderkammer/PSA, Lager, Geräte, Fahrzeuge, Funk, Objekte, Hydranten, Wachen
  - Einsätze, Übungen, Atemschutz, Einsatzberichte, Kostenbescheide, Dokumente
  - Vorbeugender Brandschutz, GIS, Barcode/RFID
  - Laut Hersteller 180 bis 280 Listen und über 80 Statistiken
- **Betrieb**: Windows-Desktop in den Editionen Start, Profi und Profi-Netzwerk. Mobile Apps (PER, GER, ASD) nur über den kostenpflichtigen Webservice. Einmal im Jahr erscheint eine neue Version, Updates gibt es nur mit Servicevertrag.
- **Cloud-Nachfolger MPBOS.one**: beginnt mit Mitgliedern (Laufbahn, G26, Führerschein), Werkstätten, Fahrzeugen und Hydranten. Ein Einsatzmodul ist noch nicht beschrieben.
- **Bis zu 999 Abteilungen**. Für die Landesstatistik gibt es Parameterdateien je Bundesland.
- **Schnittstellen** (alle kostenpflichtig): Leitstellen, DIVERA, FE2, Atemschutzwerkstatt (Dräger, MSA) und Schlauchpflege.
- **Einschätzung**: Die Funktionsbreite ist über Jahre gewachsen. Ohne Schulung ist das Programm schwer zu bedienen, mobiler Zugang ist teuer. Das deckt sich mit dem Eindruck „überladen“.

## Vergleichbare Produkte

| Produkt | Kern | Modell | Was f.orga übernehmen sollte |
| --- | --- | --- | --- |
| FeuerON (Niedersachsen, Dräger) | Berichte, Dienstbuch, Personal, Lehrgänge, Atemschutz | landesweit, mandantenfähig | **Haupt-/Nebenbericht**: genau ein Hauptbericht je Einsatz, Nebenberichte werden ihm zugeordnet. Gruppenführer erfassen, Ortsbrandmeister prüft und **sperrt**, erst dann zählt die Statistik. Der fest verdrahtete Beförderungsvorschlag scheiterte an der komplexen Vorschrift. |
| fireplan (Raum Stuttgart) | Alarmierung, Berichte, Abrechnung, Personal, Geräte, Statistik | Windows und Browser, Updates inklusive | „Einsatzverrechnung mit wenigen Klicks“ |
| FLOW (vomatec) | Mitglieder, Material, Dienste, Berichte, Abrechnung | SaaS, Freemium | Leitstellendaten automatisch, **fehlende Berichte sofort sichtbar**, Kostenersatzpositionen aus der Satzung per Klick, Crew-App mit Mängelfoto und Atemschutzpass. Gilt als „selbsterklärend“. |
| FWportal | Personal, Berichte, Inventar, Atemschutz, Ausbildung, Kasse | Basic kostenlos | Regel-Editor |
| FireManager | Personal, Geräte, Kalender, SEPA | ab 22 €/Monat | Mehrwehren: zentrale Geräteübersicht, einheitliche Wartungsdefinitionen |
| FEUERnetz (maksFIRE) | Personal mit Beförderung und Urkunde, Lehrgangsplanung, Prüffristen | SaaS, eigene Instanz | Erinnerungen bei Qualifikationsfristen, Nachrichten an Rollen |
| Fox-112 | Personal, Geräte, Berichte, Lehrgänge, Atemschutz | je Kreis/Gemeinde | Import von Atemschutzstrecken-Daten |
| DIVERA 24/7, FF Agent, Alamos FE2, Fireboard | Alarmierung, Verfügbarkeit, Einsatzführung | | Keine Verwaltung, aber **Datenquellen** für Einsatz und Besatzung |
| Open Source | nur Teillösungen (z. B. `abrain/einsatzverwaltung` für WordPress) | | Hier gibt es eine Marktlücke. |

## Schlussfolgerungen für f.orga

**Rechtlicher Rahmen in BW**: Entschädigung (§ 16 FwG BW) und Kostenersatz (§ 34 FwG BW mit VOKeFw 2024) sind je Gemeinde per Satzung geregelt, und die Rundung unterscheidet sich:
- Musterstadt: angefangene Stunde
- Stuttgart und Singen: halbe Stunde
- Karlsruhe: 10-Minuten-Takt

Deshalb müssen Sätze und Rundung **konfigurierbar** sein.

**Umfang**

- **Muss:**
  - Einsatzberichte nach dem Muster Haupt-/Nebenbericht, mit Prüfen und Sperren
  - Liste fehlender Berichte
  - Übungsdienst mit schneller Anwesenheit
  - Entschädigung als Export für die Kämmerei
  - Kostenersatz aus dem Einsatz
  - Stammdaten mit Abteilungsstruktur
  - Geräte mit Prüffristen
  - Atemschutz-Ampel
  - Lehrgänge mit Planung
  - Beförderung als Vorschlagsliste mit konfigurierbaren Regeln
  - 15–25 gute Listen
  - abteilungsbezogene Rechte
- **Später:**
  - Mitglieder-Self-Service
  - QR-Codes für Geräte
  - Import aus Prüfständen
  - PSA-Ausgabe
  - iCal
  - Urkunden
- **Bewusst nicht** (anbinden statt nachbauen):
  - Alarmierung
  - Einsatzführung und Lagekarte
  - Atemschutzüberwachung in Echtzeit
  - Vorbeugender Brandschutz
  - Vereinskasse und SEPA
  - Hydranten-GIS
  - Funk- und Lagerverwaltung
  - Mandanten für Landkreise

**UX**

- Mobil erfassen.
- Vorbefüllen statt tippen.
- Dashboard mit Aufgaben je Rolle.
- Geführte Erfassung, Pflichtfelder erst beim Abschluss.
- Wenige gute Listen.
- Konfiguration statt Code.
- Ohne Schulung bedienbar.

## Quellen

- https://www.mpbos.de/produkte/software-mp-feuer/mp-feuer-allgemeine-infos/
- https://www.mpbos.de/produkte/mpbos-one-funktionsumfang/
- https://www.mpbos.de/produkte/schnittstellen/
- https://feueron.de/hilfe/tsk_nebenbericht_hauptbericht_zuordnen.htm
- https://wiki.feueron-lk-dh.de/allgemeine_hinweise/befoerderungsvorschlaege
- https://www.fireplan.de/
- https://vomatec.de/produkte/flow/
- https://www.fwportal.de/
- https://www.firemanager.de/
- https://fox112.de/
- https://www.divera247.com/funktionen.html
- https://github.com/abrain/einsatzverwaltung
- https://www.lfs-bw.de/service/feuerwehrstatistiken/
