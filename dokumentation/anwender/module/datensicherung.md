# Datensicherung

Administratoren sichern die Installation verschlüsselt in einen Ordner auf dem Server oder auf ein eingebundenes NAS und können eine Sicherung wiederherstellen.

## Einrichten

Unter **Verwaltung → Datensicherung → Einstellungen**:

1. Zielordner festlegen und prüfen.
2. Passphrase setzen.
3. Zeitplan für automatische Sicherungen wählen.

Die Passphrase wird mit dem Server-Schlüssel der Installation verwahrt. Ohne Server-Schlüssel ist nur „Jetzt sichern“ mit Eingabe der Passphrase möglich.

## Sichern und prüfen

- Unter **Übersicht** mit **Jetzt sichern** eine Sicherung starten.
- Unter **Sicherungen** die Liste sehen, eine Sicherung prüfen (Wiederherstellungstest), herunterladen oder löschen.

Sicherungen enthalten **nicht** den Server-Schlüssel. Bewahren Sie ihn getrennt im Passwortsafe auf.

## Wiederherstellen

Unter **Wiederherstellen** führt der Assistent bis zur Bestätigung. Danach geht die Instanz in den Wartungsmodus und startet neu. Prüfen Sie anschließend den Namen der Feuerwehr und die Passphrase.

Technische Details zu Volumes und Umgebungsvariablen: [`technik/betrieb.md`](../../technik/betrieb.md#datensicherung).
