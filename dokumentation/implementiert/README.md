# Implementiert

Was hier steht, existiert im Code. Umgesetzt sind:

- das technische Grundgerüst, das die [Zielarchitektur](../geplant/architektur.md) trägt
- das Backend der Shell: Einrichtung, Anmeldung, Benutzer, Rollen mit Rollenvorlagen, API-Tokens, Einstellungen, Modulverwaltung, Audit, Listen, Fristen mit Sammel-E-Mail, Import (Excel, CSV, iCal)
- das Backend der Stammdaten
- das Backend der Einsatzberichte mit Prüfregeln, Entschädigung, Freigabe, externer API, Abrechnungsexport, Dienstplan und Jahresstatistik
- die Mehrsprachigkeit (Deutsch/Englisch)
- die Oberfläche der Shell: Rahmen, Startseite, Profil, Listen, Import-Assistent, Benutzer, Rollen, Module, API-Tokens, Einstellungen, Audit-Log
- Demodaten für die Entwicklung (`npm run seed`)

Die Oberflächen der Stammdaten und Einsatzberichte folgen als Nächstes.

Der Code ist durchgehend englisch, die Dokumentation deutsch. Die Zuordnung der Begriffe steht im [Glossar](../geplant/fachmodell.md#glossar-fachbegriff--code).

| Dokument | Inhalt |
| --- | --- |
| [architektur.md](architektur.md) | Aufbau des Repositorys, Modulvertrag, Datenhaltung, Historie, Sicherheit, Mehrsprachigkeit, Modulgrenzen |
| [schnittstellen.md](schnittstellen.md) | Vorhandene HTTP-Endpunkte mit Rechten |
| [entwicklung.md](entwicklung.md) | Entwicklungsumgebung, Befehle, Tests, Migrationen, CI |
| [betrieb.md](betrieb.md) | Docker-Image und Compose-Stack |
