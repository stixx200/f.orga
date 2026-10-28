# Aufbewahrungsplan

Geplante Erweiterung der Aufbewahrung im Core (`RetentionRegistry`, Einstellung `privacy`) und in den Modulen. Ziel: je Datenkategorie eine Aufbewahrungsfrist und eine Aktion nach Ablauf, darunter „dem Archiv anbieten“. Mockups (zur Freigabe): `shell/aufbewahrung.html` (Einstellungen → Datenschutz → Aufbewahrung) und `shell/aussonderung.html` (Fristablauf: Archiv anbieten, löschen, anonymisieren), siehe [Mockups](mockups/README.md#seiten).

## Heutiger Stand

Umgesetzt ist (siehe [Daten: Aufbewahrung](../implementiert/architektur.md#daten-suche-vollexport-auskunft-aufbewahrung)):

| Was | Frist | Aktion |
| --- | --- | --- |
| Ausgeschiedene Mitglieder (`privacy.anonymizeLeftAfterYears`) | 1–50 Jahre ab Austritt, Standard nie | anonymisieren, Statistik bleibt |
| Audit-Log (`privacy.auditRetentionMonths`) | 6–240 Monate, Standard 24 | löschen |
| Import-Uploads und Datenübernahmen | 24 Stunden | löschen |
| Einsätze, Berichte, Dienste, Anhänge, Historie, Kostenbescheide, Entschädigungen, Geräte | – | nie gelöscht |

Es gibt also weder Fristen für Einsätze und Dienste noch eine Anbietung an ein Archiv.

## Fristen aus dem kommunalen Aktenplan

Der Nutzer hat diese Löschfristen aus dem kommunalen Aktenplan genannt. Sie sind **heute nicht abgebildet**, außer dass sich die Anonymisierung Ausgeschiedener und das Audit-Log auf passende Werte stellen lassen:

| Aktenplan | Frist | Abgebildet heute | Kategorie in f.orga (Vorschlag) |
| --- | --- | --- | --- |
| Personalstammrolle (Feuerwehr) | 15 Jahre | teilweise (Anonymisierung Ausgeschiedener) | Grunddaten Ausgeschiedener |
| Feuerwehrangehörige | 30 Jahre oder Sonderfall | teilweise (dieselbe Einstellung, nur eine Frist) | Personalakte Ausgeschiedener |
| Wachbücher der Feuerwehr | 3/30 Jahre oder Sonderfall | nein | Einsätze und Berichte |
| Freiwillige Feuerwehr | 30 Jahre oder Sonderfall | nein | Organisation, ausgesonderte Fahrzeuge und Geräte |
| Datenerfassungsprotokolle | 2–10 Jahre | teilweise (Audit-Log bis 20 Jahre) | Audit-Log, Historie |
| Dienstbesprechungen, Niederschriften | 5–30 Jahre | nein | Dienste der Arten für Besprechungen, mit Anhängen |
| Niederschriften über Ausschusssitzungen | 30 Jahre | nein | Dienste der Art „Sitzung / Ausschuss“ (`meeting`), mit Anhängen |

Protokolle hängen als Anhang (PDF) am Dienst, z. B. an einer Kommandantenbesprechung oder einer Sitzung des Feuerwehrausschusses. Deshalb lassen sich Dienste je Art mit eigener Frist führen.

**Landesarchivgesetz Baden-Württemberg:** Öffentliche Stellen bieten Unterlagen, die sie nicht mehr benötigen, vor dem Löschen dem zuständigen Archiv an; für die Gemeinde und ihre Feuerwehr ist das das Gemeinde- oder Kreisarchiv. Das gilt auch für elektronische Daten. f.orga unterstützt das mit der Aktion „dem Archiv anbieten“; welche Unterlagen archivwürdig sind, entscheidet das Archiv. Die genauen Vorschriften und Fristen stimmt die Feuerwehr mit dem Hauptamt bzw. dem Archiv ab; f.orga liefert keine rechtlich geprüften Werte.

## Datenkategorien

Jedes Modul meldet seine Kategorien beim `RetentionRegistry` an (neu: `registerCategory`). Eine Kategorie hat Schlüssel, Namen (`LocalizedText`), Ereignis, ab dem die Frist läuft, erlaubte Aktionen, optional Unterarten und die Funktionen `candidates(asOf, rule)` (fällige Datensätze mit Anzeigename), `export(ids)` und `execute(ids, action)`.

| Schlüssel | Kategorie | Frist ab | Aktionen | Unterarten | Modul |
| --- | --- | --- | --- | --- | --- |
| `masterdata.person-core` | Grunddaten Ausgeschiedener (Personalstammrolle): Name, Mitgliedschaften, Dienstgrade, Status | Austritt | anbieten, anonymisieren, nichts | – | `masterdata` |
| `masterdata.person-file` | Personalakte Ausgeschiedener: Kontakt, sensible Felder, Qualifikationen, Lehrgänge, Ehrungen, Ämter, Ruhezeiten, Führerscheinkontrollen; dazu die Daten anderer Module über `PersonDataRegistry` (Atemschutznachweise, Kleiderkammer, Beförderungen) | Austritt | anbieten, anonymisieren, nichts | – | `masterdata` |
| `incidents.incidents` | Einsätze mit allen Berichten (Wachbuch) | Alarm | anbieten, anonymisieren, löschen, nichts | Einsätze mit Besonderheiten (Verletzte oder Tote, Kostenersatz, Kat-Einsatz) / übrige | `incidents`, EvD-Berichte folgen dem Einsatz |
| `training.sessions` | Dienste | Beginn des Dienstes | anbieten, löschen, nichts | je Art des Dienstes, z. B. „Sitzung / Ausschuss“, „Dienstbesprechung“, Übung | `training` |
| `equipment.retired` | ausgesonderte Geräte mit Prüfungen und Mängeln | Aussonderung | anbieten, löschen, nichts | – | `equipment` |
| `masterdata.vehicles-retired` | ausgesonderte Fahrzeuge | Außerdienststellung | anbieten, löschen, nichts | – | `masterdata` |
| `cost-recovery.notices` | Kostenbescheide mit Zahlungen | Bestandskraft bzw. letzte Zahlung | anbieten, löschen, nichts | – | `cost-recovery` |
| `compensation.runs` | Auszahlungsläufe mit Posten | Auszahlung | anbieten, löschen, nichts | – | `compensation` |
| `core.audit` | Audit-Log (Datenerfassungsprotokoll) | Eintrag | löschen | – | Core (heute `auditRetentionMonths`) |
| `core.history` | Historie und Versionen | Eintrag | löschen, nichts | – | Core |

Anhänge folgen immer ihrem Datensatz: Wird ein Dienst angeboten, gehen seine Anhänge mit in den Export; wird er gelöscht, werden sie gelöscht. Abhängige Datensätze werden nie für sich ausgesondert (Bericht ohne Einsatz, Prüfung ohne Gerät).

Kostenbescheide und Entschädigungen sind Kassen- bzw. Buchungsunterlagen; für sie gelten haushaltsrechtliche Aufbewahrungsfristen der Gemeinde. Die Seite zeigt dort den Hinweis „Frist mit der Kämmerei abstimmen“ und bietet keinen Vorlagewert an.

## Regel je Kategorie

Einstellung `privacy.retention` mit einem Eintrag je Kategorie (und je Unterart):

| Feld | Inhalt |
| --- | --- |
| `years` | Frist in Jahren, 1–100; leer heißt unbegrenzt |
| `action` | `offer-archive`, `anonymize`, `delete`, `none` |
| `afterDecision` | nur bei `offer-archive`: was nach der Entscheidung des Archivs mit dem Datensatz in f.orga geschieht (`anonymize` oder `delete`) |
| `specialCase` | Kennzeichen „Sonderfall prüfen“: fällige Datensätze kommen immer in die Liste, auch bei `anonymize` und `delete`, und werden erst nach Bestätigung bearbeitet |
| `note` | Herkunft, z. B. „Aktenplan 13.20“ (freier Text) |

**Standard:** alle Kategorien `none` (nichts geschieht), außer den heutigen Werten für Audit-Log (24 Monate) und Import-Uploads. Es wird nichts automatisch gelöscht, bis ein Administrator Fristen und Aktionen wählt. Die bestehenden Felder `anonymizeLeftAfterYears` und `auditRetentionMonths` gehen in `masterdata.person-file` (bzw. `person-core`) und `core.audit` auf.

**Spannen** wie „5–30 Jahre“ oder „3/30 Jahre“ bildet die Seite so ab: Wo f.orga die Daten unterscheiden kann, je Unterart ein Wert (z. B. Einsätze mit Besonderheiten 30, übrige 3; Sitzung / Ausschuss 30, übrige Besprechungen 5). Wo nicht, gilt der eingetragene Wert mit „Sonderfall prüfen“, sodass jeder Fall vor dem Löschen in der Liste erscheint.

**Prüfung der Regeln** beim Speichern: Die Grunddaten müssen mindestens so lange bleiben wie die Personalakte (eine Akte ohne Namen nützt nichts). Ist die Frist der Grunddaten kürzer, gilt für beide die längere, und die Seite warnt (`privacy.personCoreShorter`). Ebenso warnt sie, wenn Einsätze vor Kostenbescheiden oder Auszahlungen gelöscht würden, die auf sie verweisen.

## Vorlage „Kommunaler Aktenplan (Beispiel)“

Ein Knopf setzt die Werte des Nutzers in das Formular, erst nach Klick und gekennzeichnet als Vorlage; gespeichert wird erst mit „Speichern“. Die Vorlage enthält nur die genannten Werte, keine weiteren:

| Kategorie | Frist | Aktion | Sonderfall prüfen |
| --- | --- | --- | --- |
| Grunddaten Ausgeschiedener | 15 Jahre (wirksam 30, weil die Personalakte länger bleibt) | anbieten, danach anonymisieren | nein |
| Personalakte Ausgeschiedener | 30 Jahre | anbieten, danach anonymisieren | ja |
| Einsätze mit Besonderheiten | 30 Jahre | anbieten, danach anonymisieren | ja |
| übrige Einsätze | 3 Jahre | anbieten, danach anonymisieren | ja |
| ausgesonderte Fahrzeuge und Geräte | 30 Jahre | anbieten, danach löschen | ja |
| Audit-Log | 2 Jahre (Spanne 2–10) | löschen | – |
| Historie | 10 Jahre (Spanne 2–10) | löschen | ja |
| Dienste „Sitzung / Ausschuss“ | 30 Jahre | anbieten, danach löschen | nein |
| Dienste der Besprechungsarten | 5 Jahre (Spanne 5–30) | anbieten, danach löschen | ja |
| übrige Dienste, Kostenbescheide, Auszahlungsläufe | – (nicht im Beispiel) | nichts | – |

Die Zuordnung „Freiwillige Feuerwehr“ → ausgesonderte Fahrzeuge und Geräte und „Datenerfassungsprotokolle“ → Audit-Log und Historie ist ein Vorschlag; welche Akten der Aktenplan damit meint, klärt die Feuerwehr mit dem Hauptamt.

## Aussonderung (Liste „Fristablauf“)

Seite `/admin/retention` (Menü „Verwaltung → Aussonderung“, Recht `core.retention.manage`, neu; Rollenvorlage `administrator`, auf Wunsch `administration`):

- Der tägliche Lauf (wie heute, `FORGA_RETENTION_SCHEDULER`) legt für jeden fälligen Datensatz mit Aktion `offer-archive` oder mit „Sonderfall prüfen“ einen **Aussonderungsfall** an (`core.retention_case`: Kategorie, Unterart, Datensatz, Anzeigename, fällig seit, Status). Anonymisieren und Löschen ohne Sonderfall führt er direkt aus, mit Zählung im Audit-Log.
- Die Liste zeigt die Fälle nach Kategorie mit Status: **fällig**, **angeboten** (Datum, Archiv, Export), **übernommen** (Archiv hat übernommen), **kassiert** (Archiv lehnt ab), **erledigt** (in f.orga anonymisiert oder gelöscht), **zurückgestellt** (Sonderfall: bleibt bis Datum, mit Grund).
- **Dem Archiv anbieten:** Auswahl → Export als ZIP mit einer PDF je Datensatz (lesbar, mit Kopf nach Stil.md), CSV-Übersicht, JSON (`forga.export`) und allen Anhängen; dazu ein Anbietungsverzeichnis als PDF. Status „angeboten“ mit Datum und Empfänger.
- **Entscheidung des Archivs** je Fall oder für die Auswahl erfassen: übernommen oder kassiert, Datum, Bemerkung. Danach führt „Ausführen“ `afterDecision` aus (Bestätigung mit Zahl der Datensätze). Bis dahin bleibt der Datensatz unverändert.
- Jeder Schritt steht im Audit-Log (`retention.offered`, `retention.decided`, `retention.executed`, `retention.deferred`). Der Aussonderungsfall selbst bleibt als Nachweis (Kategorie, Anzeigename, Daten der Schritte), auch wenn der Datensatz gelöscht ist; der Anzeigename wird dabei auf Kategorie, Datum und Nummer gekürzt (z. B. „Einsatz 2026-104950 vom 12.03.2026“), nicht auf Namen von Personen.

## Auswirkungen

| Aktion | Wirkung |
| --- | --- |
| Personen anonymisieren | wie heute: Name „N. N.“, Kontakt und sensible Daten, Qualifikationen, Lehrgänge, Ehrungen entfernt; Mitgliedschaften, Dienstgrade und Verweise in Berichten bleiben, die Statistik stimmt weiter |
| Einsätze anonymisieren (neu) | Beteiligte (Namen, Anschriften, Kennzeichen), Freitexte von Lage und Verlauf, Personal als Namen entfernt; Stichwort, Zeiten, Ort (nur Gemeinde/Ortsteil), Fahrzeuge, Zahl der Einsatzkräfte und Stunden und die Statistikmerkmale bleiben. Jahresstatistik und Einsatzzahlen bleiben erhalten |
| Einsätze löschen | Einsatz, Berichte, Versionen, EvD-Bericht, Anhänge und Historie weg. Folgen: Jahresstatistik und Auswertungen vergangener Jahre ändern sich (abgeschlossene Jahresstatistiken behalten ihre gespeicherten Werte), Entschädigungsposten und Kostenbescheide verlieren ihren Verweis. Gelöscht wird deshalb nur, wenn kein Kostenbescheid offen ist und der Auszahlungslauf selbst ausgesondert ist (`retention.blockedBy` mit Grund in der Liste) |
| Dienste löschen | Anwesenheiten, Anhänge (Protokolle) und Historie weg; Dienstbeteiligung und Atemschutznachweise (Belastungsübung) vergangener Jahre ändern sich. Nachweise im Modul Atemschutz, die aus einem Dienst stammen, bleiben als eigene Nachweise |
| Historie löschen | Versionen und „Wiederherstellen“ älterer Stände nicht mehr möglich; der aktuelle Stand bleibt |
| Geräte und Fahrzeuge löschen | nur ausgesonderte; Einsatz- und Verbrauchsverweise zeigen dann „ausgesondertes Gerät“ |

## Offene Entscheidungen

1. **Zuordnung der Aktenplan-Positionen** zu den Kategorien (vor allem „Freiwillige Feuerwehr“ und „Datenerfassungsprotokolle“). *Empfehlung:* wie oben als Vorschlag, mit dem Hauptamt klären.
2. **Einsätze anonymisieren statt löschen** als empfohlene Aktion. *Empfehlung:* ja, damit Statistik und Einsatzzahlen erhalten bleiben; Löschen nur ausdrücklich.
3. **Unterscheidung bei Einsätzen** (3/30 Jahre): Merkmale für „mit Besonderheiten“. *Empfehlung:* Verletzte oder Tote, Kostenersatz, Kat-Einsatz aus den vorhandenen Statistikmerkmalen; dazu ein manuelles Kennzeichen „dauernd aufbewahren“ am Einsatz.
4. **Automatisches Löschen ohne Liste**, wenn kein Sonderfall gesetzt ist. *Empfehlung:* ja wie heute bei der Anonymisierung, aber mit Vorschau der Zahlen beim Speichern und erst ab dem nächsten Tag.
5. **Recht `core.retention.manage`** getrennt von `core.settings.manage`. *Empfehlung:* ja, damit die Verwaltung die Liste abarbeiten kann, ohne alle Einstellungen zu ändern.
6. **Format für das Archiv:** PDF, CSV und JSON im ZIP. *Empfehlung:* so beginnen und mit dem Archiv klären, ob es ein bestimmtes Format braucht (z. B. PDF/A oder ein Aussonderungsformat).
7. **Sicherungen:** Gelöschte Daten bleiben in älteren Sicherungen (Modul [Datensicherung](module/backup.md)) bis zu deren Ablauf. *Empfehlung:* im Verzeichnis der Verarbeitungstätigkeiten so vermerken; die Aufbewahrung der Sicherungen (Standard 30 Tage) ist kurz genug.
