# Shell (Core)

Release 1. Die Shell ist der Rahmen. Sie hat selbst keine Feuerwehr-Fachlichkeit. Modul-ID `core`. Alle Oberflächen sind deutsch und englisch (siehe [Mehrsprachigkeit](../architektur.md#mehrsprachigkeit)).

**Bereits umgesetzt** (siehe [implementiert/](../../implementiert/architektur.md#sicherheit)):
- Backend für Ersteinrichtung, Anmeldung, Sitzung, Benutzer, Rollen, API-Tokens, Einstellungen (`brigade`, `smtp`, `reminders`), Modulverwaltung, Audit und Historie-Endpunkt
- Listen-Gerüst mit Ausgabe als PDF, Excel und CSV ([Listen](../../implementiert/architektur.md#listen))
- Fristen, Aufgabenliste und wöchentliche Sammel-E-Mail per SMTP, abbestellbar im Profil ([Fristen und Aufgaben](../../implementiert/architektur.md#fristen-und-aufgaben))
- Import-Assistent mit Zuordnung, Probelauf und idempotenter Übernahme ([Import](../../implementiert/architektur.md#import))
- die Mehrsprachigkeit
- die Oberfläche nach den Mockups: Rahmen mit Suche, Aufgaben-Glocke und Sprachumschalter, Startseite, Profil, Listen, Import-Assistent, Benutzer, Rollen, Module, API-Tokens, Einstellungen (Feuerwehr, E-Mail, Erinnerungen), Audit-Log ([Seiten der Shell](../../implementiert/architektur.md#seiten-der-shell))

- Passwort-Zurücksetzen per E-Mail, Test-E-Mail, Wappen- und Briefkopf-Upload, Gemeinde und Einwohnerzahl, Aufbewahrung und Anonymisierung, Vollexport und Auskunft, globale Suche auf dem Server, OpenAPI, Impersonation, Anmeldung per OIDC, Plugin-Pakete

Dieses Dokument beschreibt den vollständigen Zielumfang. Offen sind technische Benutzer für API-Tokens, der Import von Vollexporten und Zod-Schemas in der OpenAPI-Beschreibung.

## Umfang

| Bereich | Inhalt |
| --- | --- |
| Anmeldung | Login, Abmelden, Passwort ändern und zurücksetzen (E-Mail-Link), Sitzungsablauf, Konto der Gemeinde (OIDC). |
| Benutzer | Anlegen, sperren, Rollen zuweisen (Gesamtwehr oder je Abteilung), mit Person verknüpfen. Technische Benutzer für API-Tokens. |
| Rollen | Rollen anlegen und Berechtigungen aus allen aktiven Modulen zuordnen. Grundausstattung siehe [Fachmodell](../fachmodell.md#rollen). |
| API-Tokens | Erzeugen (einmal sichtbar), Bereich, Ablaufdatum, letzte Nutzung, widerrufen. |
| Sprache | Umschalter Deutsch/Englisch im Kopf und auf der Anmeldeseite. Die Wahl wird im Benutzerprofil gespeichert und gilt auf jedem Gerät. Vor der Anmeldung gilt die Wahl im Browser bzw. die Browsersprache. Neue Benutzer erhalten eine Profilsprache beim Anlegen. |
| Einstellungen | Name der Feuerwehr, Anschrift, Telefon, Web, Wappen (für Kopf- und Fußzeile), SMTP, Erinnerungsrhythmus, Aufbewahrungsfristen. Module hängen eigene Einstellungsseiten ein. |
| Module | Liste der installierten Module mit Version, Abhängigkeiten und Status. Aktivieren und Deaktivieren (Abhängigkeiten werden geprüft). Plugin-Pakete hochladen und entfernen. |
| Startseite | Dashboard aus den Kacheln der aktiven Module, gefiltert nach Rechten: offene Berichte, fällige Fristen, letzte Einsätze. |
| Aufgaben | Gesammelte Fälligkeiten und Arbeitsaufträge (Bericht zur Prüfung, Frist überfällig) für den angemeldeten Benutzer. |
| Historie / Audit | Gemeinsame Historie-Komponente; Audit-Log für Administratoren (Anmeldungen, Rechte, Exporte, Importe). |
| Import / Export | Assistent und Vollexport, siehe [Fachmodell](../fachmodell.md#import-und-export). |

## Oberfläche

- Kopf nach `Stil.md`: Wappen klein links, Kicker mit dem Namen der Feuerwehr, Seitentitel in Dienstfarbe.
- Navigation: links eine einklappbare Seitenleiste mit den Modulen (auf dem Handy ein Menü). Oben rechts Suche, Aufgaben-Glocke, Benutzer.
- **Globale Suche** über Personen, Fahrzeuge, Geräte, Einsätze. Module melden ihre Suchquellen an.
- Fußzeile mit Anschrift der Feuerwehr wie in den PDFs.

## Schnittstellen

Die vorhandenen Endpunkte stehen in [implementiert/schnittstellen.md](../../implementiert/schnittstellen.md). Offen: Import eines Vollexports (`POST /api/<modul>/import`).
