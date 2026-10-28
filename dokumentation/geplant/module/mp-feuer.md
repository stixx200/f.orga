# Modul MP-Feuer (`mp-feuer`) – offene Punkte

Das Modul ist umgesetzt, siehe [Modul MP-Feuer](../../implementiert/architektur.md#modul-mp-feuer-mp-feuer), die [gemerkten Zuordnungen](../../implementiert/architektur.md#gemerkte-zuordnungen) und den [Parallelbetrieb](../../implementiert/parallelbetrieb-mp-feuer.md). Mockups: [`mockups/mp-feuer/`](../mockups/README.md#modul-mp-feuer). Offen ist:

## Eingangsordner und Zeitplan

- Ordner im Server, z. B. `/data/mp-feuer/inbox` als Volume oder Netzfreigabe. Neue Dateien erscheinen auf der Übersicht.
- Optionaler Zeitplan, z. B. montags 6:00: Probelauf mit der gemerkten Auswahl über die Fristen und Aufgaben des Core („Datenübernahme prüfen“). Automatisch übernommen wird nur, wenn eingeschaltet und der Probelauf keine Fehler und keine offenen Bezeichnungen hat; standardmäßig aus.
- Einstellungen dazu im Abschnitt `mp-feuer.inbox`. Die Seite „Einstellungen“ zeigt den Platz dafür schon als „später“.
- Erst nach dem ersten Parallelbetrieb.

## Export nach MP-Feuer

MP-Feuer hat einen Tabellen-Import (CSV/Excel) mit Vorlagen. Beispiele liegen noch nicht vor, deshalb werden keine Formate geraten. Die Schnittstelle `MpFeuerExportAdapter` und der Reiter „Export nach MP-Feuer“ (Platzhalter) gibt es.

- Je Vorlage ein Adapter mit Test gegen die Beispieldatei: Personen, Lehrgänge und Qualifikationen, Einsätze.
- Endpunkt `POST /api/mp-feuer/exports/:id` mit Parametern des Adapters und eigenem Recht `mp-feuer.export`; die Oberfläche zeigt dann Parameter und „Datei erzeugen“.

## Excel-Exporte von MP-Feuer

Die Spaltenüberschriften von MP-Feuer (z. B. „Zusatzfeld 2“, „bei Ges. Stat. anzeigen“) kennt das Profil `incidents.personnel` nicht. Sollen Excel-Exporte von MP-Feuer (`MP-EXCEL.xlsx`, `Einsatzberichte_Zusatz.xlsx`) übernommen werden, liest das Modul sie selbst und übersetzt sie wie die Transferdateien in die Spalten des Profils.

## Nur bei Bedarf

- **Zuordnungen aus dem Tabellen-Import übernehmen:** Die beiden Zuordnungslisten sind getrennt. Zeigt sich, dass dieselben Bezeichnungen in beiden gebraucht werden, bekommt die Seite „Zuordnungen“ des Moduls „Aus dem Tabellen-Import übernehmen“ für einzelne Einträge.
- **Zeilen-API für externe Systeme:** Ein Endpunkt `POST /api/core/imports/rows` wäre eine dünne Hülle um `ImportService.runRows`. Derzeit gibt es kein System, das Zeilen schicken will.
