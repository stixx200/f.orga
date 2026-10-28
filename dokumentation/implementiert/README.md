# Implementiert

Was hier steht, existiert im Code. Umgesetzt sind:

- das technische Grundgerüst, das die [Zielarchitektur](../geplant/architektur.md) trägt
- das Backend der Shell: Einrichtung, Anmeldung, Benutzer, Rollen mit Rollenvorlagen, API-Tokens, Einstellungen, Modulverwaltung, Audit, Listen, Fristen mit Sammel-E-Mail, Import (Excel, CSV, iCal)
- das Backend der Stammdaten
- das Backend der Einsatzberichte mit Prüfregeln, Entschädigung, Freigabe, externer API, Abrechnungsexport, Jahresstatistik und Berichten gesamtwehrweiter Einheiten
- das Modul Einsatzleiter vom Dienst mit EvD-Dienstplan und EvD-Bericht zu jedem Einsatz
- die Module Übungsdienst, Atemschutz, Entschädigungen, Geräte, Kostenersatz, Beförderungen und Kleiderkammer
- Plugins (signierte Zusatzmodule)
- die Mehrsprachigkeit (Deutsch/Englisch)
- die Oberfläche der Shell: Rahmen, Startseite, Profil, Listen, Import-Assistent, Benutzer, Rollen, Module, API-Tokens, Einstellungen, Audit-Log
- die Oberflächen aller Module
- Demodaten für die Entwicklung (`npm run seed`)

Der Code ist durchgehend englisch, die Dokumentation deutsch. Die Zuordnung der Begriffe steht im [Glossar](../geplant/fachmodell.md#glossar-fachbegriff--code).

| Dokument | Inhalt |
| --- | --- |
| [gesamtbild.md](gesamtbild.md) | Diagramme: Laufzeit, Pakete eines Moduls, Beiträge je Modul, Zusammenlauf im Core, zwischen Modulen und im Frontend |
| [architektur.md](architektur.md) | Aufbau des Repositorys, Modulvertrag, Datenhaltung, Historie, Sicherheit, Mehrsprachigkeit, Modulgrenzen |
| [schnittstellen.md](schnittstellen.md) | Vorhandene HTTP-Endpunkte mit Rechten |
| [entwicklung.md](entwicklung.md) | Entwicklungsumgebung, Befehle, Tests, Migrationen, CI |
| [betrieb.md](betrieb.md) | Docker-Image und Compose-Stack |
| [parallelbetrieb-mp-feuer.md](parallelbetrieb-mp-feuer.md) | Arbeitsweise während der Umstellung: Einsätze in MP-Feuer, Bescheide und Entschädigungen in f.orga; Verhalten beim erneuten Import |
