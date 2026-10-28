# Releaseplan

Jeder Release ist für sich nutzbar. Vor jeder Frontend-Umsetzung werden für die betroffene App **Mockups erstellt und freigegeben** (siehe [mockups/](mockups/README.md)).

## Definition of Done (für jeden Schritt)

- **Fachlogik getestet**:
  - Unit-Tests für Regeln und Berechnungen (Prüfregeln, Entschädigung, Tauglichkeit, Beförderungsregeln)
  - Integrationstests der API gegen eine echte PostgreSQL (Testcontainer)
- **Oberfläche**: Kernabläufe mit Playwright abgedeckt. Die Oberfläche ist auf dem Handy (375 px) bedienbar.
- **Verträge**: Zod-Schemas in `*-contracts`. Die OpenAPI-Beschreibung ist aktuell.
- **Datenbank**: Migrationen vorhanden, Historie für alle neuen Entitäten aktiv.
- **Dokumentation**: Die Beschreibung des umgesetzten Teils ist von `geplant/` nach `implementiert/` **verschoben**, nicht kopiert. `geplant/` enthält danach nur noch Offenes.
- **Betrieb**: `docker compose up` startet den Stand ohne Handarbeit.

## Release 0 – Grundgerüst und Architektur-Durchstich

Umgesetzt, siehe [implementiert/](../implementiert/README.md).

## Release 1 – Shell, Stammdaten, Einsatzberichte

Ziel: MP-Feuer für Personal und Einsatzberichte ablösen, inklusive Abrechnungsexport.

### Shell

**Bereits umgesetzt** (siehe [implementiert/](../implementiert/architektur.md#sicherheit)):
- Ersteinrichtung, Anmeldung mit Sitzungen, Sperre nach Fehlversuchen
- Benutzer, Rollen mit Abteilungsbezug, Rollenvorlagen (Standardrollen inkl. Lehrgangsbeauftragter, [E14](entscheidungen.md#e14-rolle-lehrgangsbeauftragter)), Berechtigungs-Guard, CSRF-Schutz
- Einstellungs-Grundgerüst (`brigade`, `smtp`, Abschnitte der Module)
- Modulverwaltung mit Abhängigkeitsprüfung und Sperre inaktiver Module
- API-Tokens mit Scopes, Audit-Log, Historie-Endpunkt
- Fristen-Gerüst mit Aufgabenliste und wöchentlicher Sammel-E-Mail
- Listen-Gerüst mit Ausgabe als PDF, Excel und CSV nach `Stil.md`, in der Sprache des Benutzers
- Import-Assistent (Excel, CSV, iCal; Upload, Spaltenzuordnung, Probelauf, idempotente Übernahme)
- Mehrsprachigkeit (Deutsch/Englisch)
- funktionale Einrichtungs- und Anmeldeseite
- Mockups der Shell (freigegeben) und Frontend danach: Rahmen, Startseite mit Aufgaben, Profil, Listen, Import-Assistent, Benutzer, Rollen, Module, API-Tokens, Einstellungen, Audit-Ansicht; Historie-Komponente in `web-ui`
- Demodaten (`npm run seed`)

Offen:

- Passwort-Zurücksetzen, Test-E-Mail, Wappen und Briefkopf (auch im PDF-Kopf), Gemeinde und Einwohnerzahl, Aufbewahrung und Anonymisierung, Vollexport und Auskunft, Suche auf dem Server, OpenAPI, Impersonation, Rechte je Abteilung oder für alle Abteilungen

1. Eigene gespeicherte Listen (Spaltenauswahl, Filter).
2. Import eines Vollexports.

### Stammdaten

**Bereits umgesetzt (Backend)**, siehe [implementiert/](../implementiert/architektur.md#modul-stammdaten-masterdata):
- Organisation mit Abteilungen, Wachen und Fahrzeugen
- Personen mit Mitgliedschaften, Qualifikationen, Dienstgraden und Ehrungen
- Probezeit und Aufnahme
- Kataloge mit BW-Vorlage
- Lehrgangskatalog, Teilnahmen, Vormerkungen und Lehrgangsplanung (auch durch den Lehrgangsbeauftragten)
- Schnittstellen `PERSON_DIRECTORY` und `ORGANIZATION`
- Fristen zu Probezeit, Grundausbildung, Altersgrenzen, Führerschein und Qualifikationen
- 12 Listenvorlagen
- Importprofil für Personen inklusive MP-Feuer `Personal.xlsx`

- Mockups (freigegeben) und Frontend: Personen, Person anlegen, Personalakte, Organisation (anlegen, bearbeiten, löschen), Fahrzeuge, Lehrgangsplanung, Kataloge; E2E-Tests

Offen:

1. Datenblatt der Person als PDF, Spaltenauswahl in der Personenliste, Wiederaufnahme ausgeschiedener Personen.

### Einsatzberichte

Umgesetzt (Backend), siehe [implementiert/architektur.md](../implementiert/architektur.md#modul-einsatzberichte-incidents):
- Einsatz und Bericht mit allen Abschnitten, Hauptbericht-Eindeutigkeit
- Personalregeln und Prüfregeln mit Stufen und bestätigten Warnungen
- Ablauf mit Sperre, Sperre aufheben, Zurückgeben; Fristen für Verfasser und Freigeber
- Entschädigung je Person, Abrechnungsexport (Excel wie `auswertung.py`)
- Statistikmerkmale nach der Landesvorlage (ohne Rettungsdienst/Krankentransport, [E12](entscheidungen.md#e12-rettungsdienst-und-krankentransport-nicht-erfassen)) mit Vorbefüllung
- API für externe Systeme, MP-Feuer-Import der Einsätze, Listen
- Dienstplan für EvD-Dienste mit iCal-Import, heute im Modul Einsatzleiter vom Dienst mit EvD-Bericht zu jedem Einsatz ([E13](entscheidungen.md#e13-einsatzleiter-pauschale-über-dienstplan))

Offen:

- Mockups (freigegeben) und Frontend: Einsätze, Einsatzseite, Berichtseditor, Zur Prüfung, Freigabe, Offene Berichte, Entschädigung, Dienstplan, Jahresstatistik, Einstellungen; E2E-Tests

1. Ergänzung des MP-Feuer-Imports um `Einsatzberichte_Zusatz.xlsx`.
2. Mobil optimierte Personal-Erfassung (Textbausteine, Besatzung wie letzter Einsatz).

### Jahresstatistik

Umgesetzt (Backend): Werte F1–F120 aus Einsatzberichten und Stammdaten, Korrekturen (auch Funkgeräte F121–F129), Plausibilitätsprüfungen, Abschluss je Jahr, Export als befüllte Import-Vorlage (XLSX). Siehe [Jahresstatistik](jahresstatistik.md).

Offen:

1. Mockup der Statistik-Vorschau freigeben.
2. CSV im MP-Feuer-Format und PDF; Begründung je Korrektur.
3. Abgleich mit der MP-Feuer-Statistik 2025.

### Abschluss Release 1

1. Migration der Echtdaten aus MP-Feuer in einer Testinstallation, Abgleich mit den heutigen Auswertungen.
2. Betriebsanleitung (Installation, Sicherung, Wiederherstellung, Update).
3. Parallelbetrieb mit MP-Feuer für einen Abrechnungszeitraum.

## Release 2 – Dienste, Atemschutz, Entschädigungen

Umgesetzt, mit Oberflächen ohne eigene Mockups (Gestaltung nach den Bausteinen aus Release 1). Release 2 ist vollständig umgesetzt.

## Release 3 – Geräte und Kostenersatz

Umgesetzt, mit Oberflächen ohne eigene Mockups; die Geräteseite (QR-Code) funktioniert auf dem Handy. Release 3 ist vollständig umgesetzt.

## Release 4 – Beförderungen und Erweiterbarkeit

Umgesetzt, mit Oberflächen ohne eigene Mockups: Beförderungen, Urkunden (Beförderung, Ehrung), Anmeldung per OIDC, Mitglieder-Self-Service („Mein Bereich“) und signierte Plugin-Pakete. Release 4 ist vollständig umgesetzt.

## Infoterminal

Noch keinem Release zugeordnet. Konzept: [Modul Infoterminal](module/infoterminal.md).

1. Konzept und Mockups (`mockups/infoterminal/`, Karte an der Wache in `stammdaten/organisation.html`) freigeben, offene Entscheidungen klären.
2. Vorarbeiten in bestehenden Modulen: `vehicleLabel()` in `masterdata-contracts`, Erweiterungspunkt `masterdata.station.sections`, Eintragungen ohne Versionskonflikt im Einsatzbericht (`bookedVia`, Abgleich beim Speichern, Editor lädt nach), `createdVia: 'terminal'`, `checkedInVia` bei der Anwesenheit, öffentliche Kiosk-Route in der Shell.
3. Modul `info-terminal`: Terminals mit Geräteschlüssel, Verwaltung, Kiosk-Seite für Einsätze und „Neuer Einsatz“.
4. Dienste am Terminal (mit Modul Dienste).
