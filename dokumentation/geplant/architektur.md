# Zielarchitektur

## Leitlinien

- **Klein betreibbar.** Eine Feuerwehr betreibt f.orga mit einem Docker-Compose-Stack aus zwei Containern (Anwendung und Datenbank) auf einem kleinen Server oder NAS.
- **Modular, aber kein Microservice-Zoo.** Backend und Frontend sind getrennt. Jedes Fachmodul bringt beides mit. Zur Laufzeit läuft das Backend als ein Prozess (modularer Monolith), das Frontend lädt die Module per Module Federation nach.
- **Eine Sprache durchgehend.** TypeScript im Backend, im Frontend und in den gemeinsamen Verträgen. Typen und Validierung werden nur einmal geschrieben.
- **Code englisch, Oberfläche zweisprachig.** Bezeichner, Kommentare, API und Datenbank sind englisch. Die Oberfläche lässt sich zwischen Deutsch und Englisch umschalten. Die Dokumentation ist deutsch, die Zuordnung der Begriffe steht im [Glossar](fachmodell.md#glossar-fachbegriff--code). Siehe [Entscheidung E11](entscheidungen.md#e11-sprache).
- **Konfiguration statt Code** für alles, was sich von Gemeinde zu Gemeinde unterscheidet: Entschädigungssätze, Rundung, Prüffristen, Lehrgangskatalog, Beförderungsregeln, Statistikmerkmale.

## Technikauswahl

| Bereich | Wahl | Begründung |
| --- | --- | --- |
| Monorepo | Nx 24, npm Workspaces | Gefordert. Generatoren für React-Module-Federation und NestJS, Abhängigkeitsgraph, Modulgrenzen per Tags. |
| Backend | Node.js 24, NestJS 11 | Modulsystem mit Dependency Injection passt direkt auf Fachmodule. Guards für Berechtigungen, gute OpenAPI-Unterstützung. |
| ORM | MikroORM 7 | Unit of Work mit Änderungsmengen (`onFlush`). Daraus entsteht die Historie aller Entitäten automatisch, ohne Code im Fachmodul. Entitäten je Modul registrierbar, Migrationen je Modul. |
| Datenbank | PostgreSQL 17 | Einzige unterstützte Datenbank, siehe [Entscheidung E1](entscheidungen.md#e1-datenbank). |
| Validierung / Verträge | Zod 4 | Ein Schema je DTO in den `*-contracts`-Bibliotheken, genutzt von Backend (Validierung, OpenAPI) und Frontend (Formulare, Typen). |
| Frontend | React 19, Vite 8, `@module-federation/vite` | Nx-Generatoren `consumer`/`provider` registrieren Remotes zur Laufzeit. Genau das braucht das Nachladen von Modulen. |
| UI-Bibliothek | Mantine 9 | Vollständige Formular-, Tabellen-, Datums- und Benachrichtigungskomponenten, Lokalisierung, Theming über Design-Tokens aus `Stil.md`. |
| Mehrsprachigkeit | i18next, react-i18next | Eine geteilte Instanz für Shell und Module, Übersetzungen je Modul als Namespace. |
| Datenzugriff im Frontend | TanStack Query | Caching, Invalidierung, Offline-tolerante Mutationen für die mobile Erfassung. |
| Routing | React Router 8 | Die Shell besitzt den Router, Module liefern ihre Routen als Objekte. |
| Listen / Ausdrucke | PDF über `pdfmake`, Excel über `exceljs` | Serverseitig. Einheitliche Kopf- und Fußzeile nach `Stil.md`. |
| Tests | Jest (Backend, Verträge), Vitest + Testing Library (Frontend), Playwright (Ende-zu-Ende) | |

## Repository-Struktur

```
apps/
  server/                     NestJS-Host: lädt Core + Module, liefert auch die gebauten Frontends aus
  shell/                      React-Host (Module-Federation-Consumer)
libs/
  core/core-api/              Core-Backend: Benutzer, Rechte, Einstellungen, Modulregistrierung,
                              Historie, Erinnerungen, Import/Export-Gerüst, API-Tokens
  core/core-contracts/        Gemeinsame Typen: Modulmanifest, Berechtigungen, Historie, Paginierung
  web/web-sdk/                Schnittstelle Shell ↔ Modul im Browser (API-Client, Sitzung, Rechte, i18n)
  web/web-ui/                 Theme und gemeinsame Komponenten (Tabellen, Formularbausteine, Historie-Ansicht)
modules/
  <id>/<id>-api/              Nest-Modul des Fachmoduls
  <id>/<id>-contracts/        Zod-Schemas und Typen, von Backend und Frontend genutzt
  <id>/<id>-web/              Module-Federation-Provider (eigene Vite-App)
dokumentation/
docker/
```

Nx-Tags erzwingen die Grenzen:

- `scope:core` darf nur `scope:core` nutzen.
- `scope:module-x` darf `scope:core` und die **Contracts** anderer Module nutzen, nie deren `-api` oder `-web`.
- `type:web` darf nicht `type:api` importieren.

## Modulsystem

### Was ein Modul ist

Ein Modul ist ein Fachthema (z. B. Einsatzberichte, Modul-ID `incidents`), bestehend aus drei Paketen: `-api`, `-contracts` und `-web`. Es beschreibt sich selbst mit einem Manifest. Namen sind `LocalizedText` mit Deutsch und Englisch:

```ts
export const INCIDENTS_MANIFEST = {
  id: 'incidents',
  name: { de: 'Einsatzberichte', en: 'Incident reports' },
  version: '1.0.0',
  requires: ['masterdata'],           // harte Abhängigkeit
  optional: ['equipment'],            // Erweiterung, wenn installiert
  permissions: [
    { id: 'incidents.reports.read', name: { de: 'Einsatzberichte lesen', en: 'Read incident reports' }, scope: 'department' },
    { id: 'incidents.reports.write', … },
    { id: 'incidents.reports.release', … },
  ],
  frontend: { remote: 'incidents_web', exposed: './Module' },
};

export const incidentsModule = defineModule({
  manifest: INCIDENTS_MANIFEST,
  nestModule: IncidentsModule,
  entities: [Incident, IncidentReport, …],
  historized: [Incident, IncidentReport, …],
  migrations: INCIDENTS_MIGRATIONS,
  settings: { 'incidents.compensation': CompensationSettings },
});
```

### Backend

- Der Server baut beim Start aus der Modulliste ein Nest-Root-Modul. Alle installierten Module werden geladen, ihre Entitäten bei MikroORM registriert und ihre Migrationen ausgeführt.
- Ob ein Modul **aktiv** ist, steht in der Datenbank (`core.module`). Eine Middleware sperrt die Routen inaktiver Module mit `404`. Daten bleiben beim Deaktivieren erhalten.
- Module sprechen nicht direkt miteinander. Dafür gibt es drei Wege:
  1. **Lesende Schnittstellen**: Ein Modul veröffentlicht einen Dienst über ein Token aus seinem `-contracts`-Paket, z. B. `PERSON_DIRECTORY` aus Stammdaten (umgesetzt, siehe [implementiert/](../implementiert/architektur.md#modul-stammdaten-masterdata)). Andere Module injizieren das Token, nie die Klasse.
  2. **Ereignisse**: über `DomainEvents` im Core (umgesetzt, siehe [implementiert/](../implementiert/architektur.md#ereignisse-zwischen-modulen)). Beispiel: `incidents.report.released` mit den Personen unter Atemschutz. Das Atemschutzmodul hört darauf, Einsatzberichte kennt Atemschutz nicht.
  3. **Erweiterungspunkte**: Ein Modul bietet einen benannten Punkt an, z. B. `incidents.report.sections`. Ein anderes Modul (Geräte) hängt dort Daten und eine Frontend-Komponente ein.
- **Zusatzprodukte von außen** kommen als signierte Plugin-Pakete; umgesetzt, siehe [implementiert/architektur.md → Plugins](../implementiert/architektur.md#plugins).

### Frontend

- Die Shell fragt beim Start `GET /api/core/modules` ab. Sie bekommt die aktiven Module mit Remote-URL und Navigationseinträgen; die Rechte des Benutzers kommen aus `GET /api/core/session`.
- Sie registriert die Remotes zur Laufzeit (`registerRemotes`) und lädt je Modul `./Module`. Das Modul exportiert:

```ts
export default defineWebModule({
  routes: [...],             // unterhalb von /<modul-id>/
  translations: { de, en },  // Texte des Moduls, Namespace = Modul-ID
  dashboard: [...],          // Kacheln für die Startseite ("3 Berichte offen")
  extensions: {...},         // Komponenten für Erweiterungspunkte anderer Module
});
```

- Geteilte Singletons: `react`, `react-dom`, `react-router`, `@mantine/core`, `@tanstack/react-query`, `i18next`, `react-i18next`, `@forga/web-sdk`, `@forga/web-ui`. So teilen sich Shell und Module Theme, Router, Query-Cache, Sprache und Anmeldung.
- Fällt ein Modul aus (z. B. Bundle nicht ladbar), zeigt die Shell an seiner Stelle einen Hinweis. Der Rest bleibt bedienbar.

## Gestaltung

- Grundlage ist `Stil.md` im Ordner `feuerwehr` (Abschnitt „Hauptaktion und Formen“): Die Dienstfarbe ist Primärfarbe für die Hauptaktion (Speichern, Anlegen, Freigeben) und die aktive Navigation, je Ansicht eine rote Hauptaktion.
- Die Formen sind eckig und Material-nah: Eckenradius 4 px für Karten, Felder, Schaltflächen und Dialoge, flache Schatten nach Höhenstufen, Reiter mit roter Unterstreichung ([E17](entscheidungen.md#e17-primärfarbe-und-formen)).
- Umgesetzt im gemeinsamen Theme `forgaTheme` (`libs/web/web-ui`, siehe [implementiert/architektur.md](../implementiert/architektur.md#frontend)); Shell und Module teilen es als Singleton. Die Mockups folgen derselben Gestaltung.
- Bearbeitungsseiten speichern automatisch; Änderungen sind über die Historie nachvollziehbar und über Versionen rückgängig zu machen ([E15](entscheidungen.md#e15-automatisch-speichern-nachvollziehbar-und-rückgängig)).

## Datenhaltung

- Eine Datenbank, ein Schema je Modul (`core`, `masterdata`, `incidents`, …; Schema = Modul-ID mit `_` statt `-`). Fremdschlüssel nur auf Tabellen des eigenen Moduls oder auf **abhängige** Module (`requires`). Für optionale Module werden IDs ohne Fremdschlüssel gespeichert.
- IDs sind UUIDv7: sortierbar, im Import/Export stabil, nicht erratbar.
- Jede Entität hat `createdAt`, `createdBy`, `updatedAt`, `updatedBy` und eine Versionsnummer für optimistisches Sperren. Zwei Personen, die denselben Bericht bearbeiten, überschreiben sich nicht stillschweigend.
- Löschen ist bei Stammdaten ein Archivieren (`archivedAt`). Echte Löschung nur für Fehleingaben und für die DSGVO-Löschung (siehe [Fachmodell](fachmodell.md#datenschutz)).

### Historie

Umgesetzt, siehe [implementiert/](../implementiert/architektur.md#historie): Einträge mit Elternbezug für Kinddatensätze und Leseregeln je Entität (`HistoryAccessRegistry`). Offen sind die Aktion `archived` beim Archivieren, Anzeigetexte für Bezüge und die gemeinsame Anzeige („Historie“-Reiter) in `web-ui`.

## Sicherheit

- **Anmeldung**: Benutzername und Passwort (scrypt), Sitzung als HttpOnly-Cookie, CSRF-Schutz. Optional OIDC (z. B. Microsoft 365 oder Keycloak der Gemeinde). Siehe [Entscheidung E3](entscheidungen.md#e3-anmeldung).
- **Benutzer und Person** sind getrennt. Ein Benutzer kann mit einer Person verknüpft sein, damit „meine Berichte“ und Self-Service funktionieren.
- **Rollen** bündeln Berechtigungen. Eine Rollenzuweisung gilt für die Gesamtwehr oder für einzelne Abteilungen. Beispiel: Rolle „Gruppenführer“ in Abteilung Weidenhain erlaubt Berichte der Abteilung Weidenhain zu schreiben.
- **API-Tokens** (für Leitstellen- oder Alarmierungs-Anbindung) haben Bereiche (`incidents.api.create`), ein Ablaufdatum und werden nur als Hash gespeichert. Sie sind einem technischen Benutzer zugeordnet, damit die Historie zeigt, woher ein Datensatz kam.
- Ein Audit-Log der Anmeldungen, Rechteänderungen und Exporte liegt im Core.

## Mehrsprachigkeit

- Die Oberfläche ist zwischen Deutsch und Englisch umschaltbar. Die Sprache gehört zum Benutzerprofil, vor der Anmeldung gilt die Wahl im Browser.
- Jedes Modul liefert seine Texte in beiden Sprachen (`translations`). Gemeinsame Texte und die Fehlermeldungen zu den Fehlercodes des Servers liegen im `web-sdk`.
- Der Server liefert keine fertigen Meldungen, sondern Fehlercodes. Texte aus Manifesten (Modulnamen, Navigation, Berechtigungen) sind `LocalizedText` mit `de` und `en`. Katalogeinträge, die die Feuerwehr selbst pflegt (Stichworte, Lehrgänge, Funktionen …), haben eine deutsche und optional eine englische Bezeichnung. Fehlt die englische, wird die deutsche angezeigt.
- **Listen und PDF-Ausdrucke** entstehen in der Sprache des Benutzers, sie ist beim Export wählbar.
- **Ausnahme:** Amtliche Formate wie die Jahresstatistik für das Landesportal und Kostenbescheide bleiben im vorgeschriebenen deutschen Format.
- Datums- und Zahlenformate folgen der gewählten Sprache.

## Betrieb

```
docker compose
├── forga        Node-Prozess: API unter /api, Shell unter /, Module unter /modules/<id>/
├── db           PostgreSQL 17, Volume für Daten
└── (optional) caddy   TLS per Let's Encrypt, wenn kein Reverse Proxy vorhanden ist
```

- Ein Image für die Anwendung. Es enthält Server, Shell und alle Module des Repositorys.
- Migrationen laufen beim Start.
- Sicherung: `pg_dump` per Cron-Container plus Export der Dateianhänge. Wiederherstellung ist dokumentiert und getestet.
- Dateianhänge (Fotos, PDFs) liegen in einem Volume, nicht in der Datenbank.
- E-Mail-Versand (Erinnerungen) über SMTP der Gemeinde.
