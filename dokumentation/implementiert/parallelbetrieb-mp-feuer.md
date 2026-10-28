# Parallelbetrieb mit MP-Feuer

Während der Umstellung kann die Feuerwehr Einsätze weiter in MP-Feuer schreiben und freigeben. Die [Datenübernahme](architektur.md#datenübernahme-aus-mp-feuer) bringt sie regelmäßig nach f.orga. In f.orga entstehen daraus Kostenbescheide, Entschädigungen und alles andere, was MP-Feuer nicht kann. Dieses Dokument beschreibt die Arbeitsweise und was f.orga dabei tut.

## Wer führt was

| Daten | Führendes System im Parallelbetrieb | In f.orga |
| --- | --- | --- |
| Einsätze und Einsatzberichte (Zeiten, Personal, Fahrzeuge, Texte, Einsatzdaten, Statistik des Einsatzes) | MP-Feuer | schreibgeschützt; mit jeder Datenübernahme aktualisiert |
| Freigabe der Berichte zur Abrechnung | MP-Feuer (Zusatzfeld 2 „zur Abrechnung freigegeben“) | Status kommt mit der Datenübernahme |
| Kosten und Bemerkungen des Einsatzes, Tatbestand, Kostenbescheide, Zahlungen | f.orga | bleiben bei jeder Datenübernahme unverändert |
| Entschädigungen (Posten, Auszahlungsläufe) | f.orga | Posten entstehen aus den Freigaben von MP-Feuer |
| EvD-Dienstplan, Geräte, Dienste, Atemschutz, Kleiderkammer, Beförderungen | f.orga | – |
| Personen, Mitgliedschaften, Qualifikationen | nach der ersten Übernahme f.orga | neue Personen kommen mit dem Schritt „Personen“ dazu (siehe unten) |

## Einstellungen

„Verwaltung → Einsatzberichte → MP-Feuer“ (Abschnitt `incidents.general`):

- **Einsatzberichte führt** (`externalLeading`): `f.orga` (Standard) oder `MP-Feuer`. Mit MP-Feuer gilt der Schutz unten.
- **Freigaben aus MP-Feuer melden ab** (`externalEventsFrom`): Für Einsätze ab diesem Tag meldet der Import Freigaben von MP-Feuer an die anderen Module wie eine Freigabe in f.orga. Leer: Der Import meldet nichts (z. B. bei der einmaligen Übernahme der Altdaten, deren Entschädigung längst ausgezahlt ist). Der Tag ist der Beginn des ersten Auszahlungszeitraums, den f.orga abrechnet.

## Schutz der Berichte aus MP-Feuer

Ein Bericht aus dem Import trägt `managedBy: 'mp-feuer'` (die externe API setzt `api`). Solange MP-Feuer führt:

- Inhalt, Fertigmelden, Zurückgeben, Freigeben, Sperre aufheben, Verfasser, Hauptbericht und Löschen lehnt der Server mit `409` `incidents.ledByMpFeuer` ab, ebenso die Einsatzdaten (Stichwort, Alarmzeit, Ort, Nummer) und die Statistik des Einsatzes, sobald ein Bericht des Einsatzes aus MP-Feuer kommt (die Karte „Statistik“ ist dann nicht bearbeitbar, `statisticsEditable: false`).
- Offen bleiben „Kosten und Bemerkungen“ des Einsatzes, der Tatbestand, Kostenbescheide, Anhänge und „Bericht für weitere Abteilung“.
- Am [Infoterminal](architektur.md#modul-infoterminal-info-terminal) lassen sich in solche Berichte keine Eintragungen machen (`incidents.ledByMpFeuer`); ihre Kachel erscheint wie ein fertig gemeldeter Bericht. Führt f.orga, beendet eine Eintragung am Terminal die Verwaltung durch MP-Feuer wie jede Bearbeitung eines Menschen.
- Berichte aus MP-Feuer erzeugen keine Aufgaben (keine Fristen für Verfasser, Vorprüfer und Freigeber).
- Die Oberfläche zeigt am Bericht „aus MP-Feuer“ und den Hinweis, ihn in MP-Feuer zu ändern; Editor und Freigabe-Aktionen sind gesperrt, „Einsatzdaten bearbeiten“ fehlt.
- **In f.orga weiterführen:** Freigeber (`incidents.reports.release` für die Gesamtwehr) nehmen einen einzelnen Bericht nach einer Rückfrage aus MP-Feuer heraus (`POST /api/incidents/reports/:id/take-over`, Audit `incidents.report-taken-over`). Danach gilt der übliche Ablauf in f.orga, und spätere Datenübernahmen lassen den Bericht unverändert (`incidents.import.reportEdited`). Änderungen in MP-Feuer müssen dann von Hand nachgetragen werden.

Führt f.orga (Standard), beendet jede Bearbeitung eines Menschen die Verwaltung durch MP-Feuer: Speichern, Fertigmelden, Zurückgeben, Freigeben und Sperre aufheben setzen `managedBy` auf `null`. Eine Freigabe in f.orga nimmt der nächste Import so nicht wieder zurück.

## Verhalten beim erneuten Import

Jede Datenübernahme liest den vollständigen Stand von MP-Feuer. Was dann passiert:

| Fall | Ergebnis |
| --- | --- |
| Einsatz in MP-Feuer geändert, Bericht noch aus MP-Feuer | Der Bericht wird ganz ersetzt: Zeiten, Texte, Personal und Fahrzeuge (ein in MP-Feuer entferntes Fahrzeug verschwindet), Status und Sperre nach Zusatzfeld 2. Führt MP-Feuer, folgen die Einsatzdaten (Stichwort, Meldebild, Alarmzeit, Ort) und die Statistik des Einsatzes dem Hauptbericht von MP-Feuer; sonst bleiben die Einsatzdaten, wie sie beim Anlegen waren, und die Statistik wird nur gesetzt, solange der Einsatz keine hat. |
| Bericht in f.orga bearbeitet, freigegeben oder weitergeführt | bleibt unverändert (`incidents.import.reportEdited`) |
| Kostenbescheid in f.orga erstellt oder erlassen | Bescheid, Tatbestand, Kosten und Bemerkungen bleiben. Der Haken „kostenpflichtig“ wird vom Import nur gesetzt, nie entfernt. Ein erlassener Bescheid ist ein festes PDF; ändert MP-Feuer danach den Bericht, braucht es einen Änderungsbescheid. |
| Status | Zusatzfeld 2 mit „Abrechnung“ → zur Abrechnung freigegeben, mit „Entschädigung“ oder „Auszahlung“ → zur Entschädigung freigegeben, sonst Entwurf (auch „noch nicht abrechnen“). Freigegebene Berichte sind gesperrt (`lockedBy` „MP-Feuer“). |
| Kostenersatz | Ein Einsatz, dessen Berichte alle zur Abrechnung freigegeben sind, ist für den Bescheid freigegeben – egal ob die Freigabe aus MP-Feuer oder f.orga kommt. |
| Entschädigung | Mit „Freigaben aus MP-Feuer melden ab“: Für jeden Bericht ab diesem Tag, der nach dem Import freigegeben ist und dessen Status, Zeiten, Personal, Fahrzeuge oder Stichwort sich geändert haben (oder der neu ist), sendet der Import `incidents.report.released`; nimmt MP-Feuer eine Freigabe zurück, sendet er `incidents.report.unlocked` (Grund `mp-feuer`). Die Module ersetzen ihre Daten wie bei einer Freigabe in f.orga: Entschädigungsposten werden angelegt bzw. angepasst, nach einer Auszahlung mit Korrekturposten, und nie verdoppelt. Ein unveränderter Bericht wird nicht erneut gemeldet. Ohne die Einstellung meldet der Import nichts; dann übernimmt `POST /api/incidents/reports/republish` einen Zeitraum nachträglich. |
| Neuer Einsatz | angelegt mit `createdVia: import`; andere Module legen dazu keine eigenen Berichte an (z. B. keinen EvD-Bericht). |
| Einsatz oder Bericht in MP-Feuer gelöscht | bleibt in f.orga stehen und wird von Hand gelöscht (nur Entwürfe; führt MP-Feuer, erst nach „In f.orga weiterführen“). |
| Personen | Erkannt über Vor- und Nachname (und Geburtsdatum). Vorhandene Personen werden mit den nicht leeren Werten aus MP-Feuer aktualisiert (Option „Vorhandene Personen aktualisieren“); Austritt und Abteilungswechsel übernimmt der Import bei vorhandenen Personen nicht (`masterdata.import.leftIgnored`, `masterdata.import.departmentDiffers`). |
| Lehrgänge, Dienstgrade, Ehrungen | Fehlende Einträge (gleicher Eintrag und Datum) kommen dazu; nichts wird entfernt. |
| Dienste | Teilnehmer kommen dazu; abgeschlossene Dienste lehnt der Import ab (`training.closed`). |

## Routine

Zum Beispiel wöchentlich und vor jedem Auszahlungslauf:

1. In MP-Feuer Berichte fertig schreiben; was abgerechnet werden kann, im Zusatzfeld 2 „zur Abrechnung freigegeben“ setzen.
2. In MP-Feuer die Transferdateien aller Abteilungen exportieren (je Abteilung eine `MPTRA_…zip`, auch „Gesamtfeuerwehr“ für die EvD-Berichte).
3. In f.orga „Import → MP-Feuer-Datenübernahme“: alle Dateien hochladen. Abteilungen, Einheiten („Einsatzberichte als“) und Optionen sind wie bei der letzten Übernahme vorbelegt (Einstellungsabschnitt `transfer`, gespeichert mit jeder Übernahme). Bekannte Bezeichnungen erkennt der Import über die gespeicherten Aliasse.
4. „Personen“ nur prüfen und übernehmen, wenn neue Mitglieder in MP-Feuer stehen; damit f.orga führend bleibt, die Option „Vorhandene Personen aktualisieren“ ausschalten (wird ebenfalls gemerkt). Die übrigen Schritte bis „Einsätze“ überspringen, wenn sie in f.orga geführt werden.
5. „Einsätze aus MP-Feuer“ prüfen, offene Bezeichnungen zuordnen, übernehmen.
6. In f.orga: Kostenersatz → kostenpflichtige Einsätze → Bescheid erstellen und erlassen; Entschädigungen → Auszahlungslauf mit den neuen Posten.

## Umstellung

1. Einen Stichtag festlegen; ab dann wird in MP-Feuer nichts mehr geändert.
2. Letzte Datenübernahme wie in der Routine.
3. Einstellung „Einsatzberichte führt“ auf `f.orga` stellen. Die Berichte aus MP-Feuer sind danach normal bearbeitbar; die erste Bearbeitung beendet ihre Verwaltung durch MP-Feuer.
4. „Freigaben aus MP-Feuer melden ab“ leeren, damit eine versehentliche spätere Übernahme nichts meldet.
5. Neue Einsätze werden nur noch in f.orga angelegt.
