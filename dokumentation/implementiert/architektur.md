# Architektur (umgesetzter Stand)

## Technik

| Bereich | Einsatz |
| --- | --- |
| Monorepo | Nx 24 mit npm Workspaces (`apps/*`, `libs/*/*`, `modules/*/*`) |
| Backend | Node.js 24, NestJS 11, MikroORM 7 mit PostgreSQL 17; TypeScript-Ziel ES2023 |
| Verträge | Zod 4 in den `*-contracts`-Paketen |
| Ausgaben und E-Mail | pdfmake (PDF), exceljs (Excel lesen und schreiben), nodemailer (SMTP) |
| Frontend | React 19, Vite 8, `@module-federation/vite`, Mantine 9, TanStack Query 5, React Router 8, i18next |
| Tests | Jest (Unit-Tests der Bibliotheken), Vitest mit `unplugin-swc` und `supertest` (Integrationstests gegen PostgreSQL) |
| Lint | oxlint, Modulgrenzen über `tools/module-boundaries.mjs` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

## Projekte

| Projekt | Pfad | Inhalt |
| --- | --- | --- |
| `@forga/server` | `apps/server` | NestJS-Host. Bindet MikroORM, den Core und die installierten Module ein (`installed-modules.ts`). Liefert im Betrieb auch die Frontends aus. |
| `shell` | `apps/shell` | React-Host. Enthält Einrichtung, Anmeldung, Rahmen, Startseite, Profil, Listen, Import-Assistent und Verwaltung, lädt die Modul-Frontends zur Laufzeit. |
| `@forga/core-api` | `libs/core/core-api` | Modulvertrag, Modulverwaltung, Historie, Sicherheit, Einstellungen, Audit, Zod-Validierung |
| `@forga/core-contracts` | `libs/core/core-contracts` | Schemas für Manifest, aktive Module, Historie, Sicherheit, Einstellungen, Sprachen |
| `@forga/web-sdk` | `libs/web/web-sdk` | `defineWebModule`, API-Client, Sitzung, i18n |
| `@forga/web-ui` | `libs/web/web-ui` | Mantine-Theme mit den Farben aus `Stil.md` (Primärfarbe `brand`) |
| `@forga/masterdata-*` | `modules/masterdata` | Backend der Stammdaten (Kataloge, Organisation, Personen, Lehrgänge, Schnittstellen für andere Module), Frontend-Seite „Organisation“ (bearbeitbar) |
| `@forga/incidents-*` | `modules/incidents` | Backend der Einsatzberichte (Stichworte, Einsätze, Berichte, Prüfregeln, Entschädigung, Ablauf, externe API, MP-Feuer-Import, Auswertungen, Abrechnungsexport, Dienstplan, Jahresstatistik), Frontend für Einsätze, Berichte und Prüfung |

## Modulvertrag

Ein Modul besteht aus drei Paketen unter `modules/<id>/`:

| Paket | Inhalt |
| --- | --- |
| `<id>-contracts` | Manifest (`<ID>_MANIFEST`) und Zod-Schemas |
| `<id>-api` | Nest-Modul, Entitäten, Migrationen |
| `<id>-web` | Federation-Provider, exponiert `./Module` |

Das Backend meldet ein Modul mit `defineModule` an:

```ts
export const masterdataModule = defineModule({
  manifest: MASTERDATA_MANIFEST,   // id, name, version, requires, optional, permissions, navigation, frontend
  nestModule: MasterdataModule,
  entities: [CatalogEntry, Department, Person, Membership /* … */],
  historized: [Person, { entity: Membership, parent: 'person' } /* … */],
  migrations: MASTERDATA_MIGRATIONS,
  settings: MASTERDATA_SETTINGS,   // eigene Einstellungsabschnitte, Schlüssel `<id>.<abschnitt>`
});
```

- `apps/server/src/app/installed-modules.ts` listet die eingebauten Module; Plugins kommen beim Start dazu (siehe [Plugins](#plugins)).
- `ForgaCoreModule.forRoot` prüft die Liste mit `sortModules` und importiert danach die Nest-Module in Ladereihenfolge. Geprüft wird:
  - eindeutige IDs; `core` ist reserviert
  - vorhandene Abhängigkeiten (`requires`)
  - keine Zyklen
- `ormParts(modules)` liefert MikroORM die Entitäten von Core und Modulen, den Historien-Subscriber und die Migrationen.
- Namen und Navigationseinträge im Manifest sind `LocalizedText` (`{ de, en }`), damit die Shell sie in beiden Sprachen anzeigen kann.

## Plugins

Zusatzmodule von außen kommen als **Plugin-Paket** (`.tgz`) und nutzen denselben Modulvertrag wie die eingebauten Module (`libs/core/core-api/src/lib/plugins/`).

**Paket:**
- `forga-plugin.json`: `formatVersion` 1, `id` (Modul-ID, zugleich Ordner und URL-Präfix), `version`, `backend` (ESM-Einstieg, Standardexport aus `defineModule`), `frontend` (Ordner mit `remoteEntry.js`, gebaut mit Basis `/modules/<id>/`, oder `null`) und `files` mit dem SHA-256 jeder anderen Datei.
- `forga-plugin.sig`: Ed25519-Signatur (Base64) über genau die Bytes von `forga-plugin.json`.
- Das Backend bündelt die Pakete des Servers nicht mit (`@nestjs/*`, `@mikro-orm/*`, `@forga/core-api`, `@forga/*-contracts`, `zod`). Ein Auflösungs-Hook (`module.registerHooks`) lässt bloße Importe aus dem Plugin-Ordner so auflösen, als kämen sie vom Server; Plugin und Server teilen damit dieselben Instanzen (Dependency Injection, Entitäten, Verträge).
- Gelesen wird nur ustar mit regulären Dateien und Ordnern (PAX-Kopfzeilen werden übergangen, `._*` und `.DS_Store` verworfen); Pfade mit `..`, absolute Pfade, Verknüpfungen, mehr als 2.000 Dateien oder 50 MB werden abgelehnt.

**Prüfung:** Jede Datei muss in `files` stehen und ihren Hash haben, keine darf fehlen oder dazukommen. Die Signatur muss von einem vertrauenswürdigen Schlüssel stammen: `FORGA_PLUGIN_KEYS` (kommagetrennt, Base64-DER oder PEM) und die Datei `trusted-keys` im Plugin-Verzeichnis (ein Schlüssel je Zeile). Unsignierte Pakete gehen nur mit `FORGA_PLUGINS_ALLOW_UNSIGNED=true` (Entwicklung). Eingebaute Module lassen sich nicht ersetzen.

**Installieren:**
- Hochladen in der Shell (`POST /api/core/plugins`, `core.modules.manage`): Prüfen, nach `<FORGA_PLUGIN_DIR>/<id>` entpacken (über einen Zwischenordner, eine ältere Version wird ersetzt), Audit `plugins.installed`. Wirksam nach einem Neustart.
- Oder das `.tgz` in das Plugin-Verzeichnis legen: Beim Start wird es geprüft und entpackt und danach in `.tgz.installed` bzw. bei Fehlern `.tgz.rejected` umbenannt.
- `DELETE /api/core/plugins/:id` löscht den Ordner (Audit `plugins.removed`); nach einem Neustart fehlt das Modul, seine Daten bleiben.
- `GET /api/core/plugins`: eingeschaltet, unsignierte erlaubt, Fingerabdrücke der Schlüssel, je Plugin Version, Unterzeichner und Stand (`loaded`, `installed` = nach Neustart, `removed`, `error` mit Grund).

**Laden beim Start** (`loadPlugins` in `apps/server/src/main.ts`): Jeder Plugin-Ordner wird erneut geprüft (Hashes und Signatur der Dateien auf der Platte), danach wird das Backend importiert. Die Module kommen zu den eingebauten (`AppModule.register`), samt Entitäten, Migrationen (laufen beim Start mit), Rechten, Rollenvorlagen und Einstellungen. Ein fehlerhaftes Plugin wird gemeldet, der Server startet trotzdem. Das Frontend liefert der Server unter `/modules/<id>/` aus (auch in der Entwicklung; der Vite-Server der Shell leitet unbekannte `/modules/…` an den Server weiter).

**Werkzeug:** `npm run plugin -- keygen <name>` erzeugt ein Schlüsselpaar, `npm run plugin -- pack <ordner> --key <datei>` baut aus `plugin.json` (`id`, `version`, `backend`, `frontend`) und den gebauten Dateien das signierte Paket `<id>-<version>.tgz`.

## Datenhaltung

- **Schemas und IDs**:
  - Der Core nutzt das Schema `core`.
  - Jedes Modul hat ein eigenes Schema. Es heißt wie die Modul-ID, Bindestriche werden zu Unterstrichen (`schemaName`).
  - IDs sind UUIDv7.
  - Entitäten werden mit `defineEntity` beschrieben.
  - Änderbare Entitäten haben ein Feld `version` für optimistisches Sperren.
- **Migrationen**:
  - Ablage: Core unter `libs/core/core-api/src/migrations`, jedes Modul unter `modules/<id>/<id>-api/src/migrations`.
  - Eine Migration ändert nur das Schema ihres Moduls. Verweisen darf sie höchstens auf `core` und auf Module aus `requires`.
  - Der Server spielt beim Start alle ausstehenden Migrationen ein.
  - Reihenfolge: erst der Core, dann die Module nach ihren Abhängigkeiten, innerhalb eines Moduls die älteste zuerst.
  - Ausgeführte Migrationen stehen in der Tabelle `forga_migrations` unter dem Namen `<modul>/<Klasse>`.

## Historie

- Der `HistorySubscriber` schreibt in `onFlush` für jede Änderung an einer historisierten Entität einen Eintrag in `core.history`. Er läuft in derselben Transaktion wie die Änderung (`libs/core/core-api/src/lib/history/history.subscriber.ts`).
- Ein Eintrag hat diese Felder:

  | Feld | Inhalt |
  | --- | --- |
  | `entity` | Schema und Tabelle, z. B. `masterdata.department` |
  | `entityId` | ID des Datensatzes |
  | `parentEntity`, `parentId` | übergeordneter Datensatz bei Kinddatensätzen, z. B. `masterdata.person` bei einer Mitgliedschaft |
  | `action` | `created`, `updated` oder `deleted` |
  | `changes` | `{ feld: { old, new } }` |
  | `userId` | auslösender Benutzer |
  | `timestamp` | Zeitpunkt |

- **Nicht erfasst werden:**
  - der Primärschlüssel
  - die Technikfelder `version`, `createdAt`, `createdBy`, `updatedAt` und `updatedBy`
  - als `hidden` markierte Felder, etwa Passwort- und Token-Hashes

  Eine Änderung ohne geänderte Fachfelder erzeugt keinen Eintrag.
- **Historisiert sind:**
  - im Core: `User`, `Role`, `RoleAssignment` (mit Elternbezug `user`) und `Setting`
  - in den Modulen: die unter `historized` gemeldeten Entitäten
- **Elternbezug:** Ein Eintrag in `historized` kann `{ entity, parent }` sein (`HistorizedEntity`). `parent` ist die Many-to-one-Eigenschaft zum übergeordneten Datensatz. Die Einträge erscheinen dann auch in dessen Historie, z. B. Mitgliedschaften, Qualifikationen, Dienstgrade, Ehrungen, Lehrgangsteilnahmen und Vormerkungen in der Historie der Person.
- **Lesezugriff:** Module registrieren in der `HistoryAccessRegistry` je Entität eine Prüfung, unter dem Historiennamen `<schema>.<tabelle>` (z. B. `respiratory_protection.evidence`). Sie entscheidet, ob der Benutzer die Historie lesen darf, und kann Felder maskieren (`{ old: null, new: null, hidden: true }`). `registerPermission(name, recht)` genügt für Stammdaten wie Kataloge. Ohne Prüfung wird abgelehnt (`404`), auch für Kind-Entitäten, die nur in der Historie ihres Elternteils erscheinen.
- **Vollständigkeit:** Beim Start bricht der Server ab, wenn eine historisierte Entität ohne Elternbezug keine Prüfung hat oder eine Prüfung unter einem unbekannten Namen registriert ist.
- **Geheimnisse:** Nur schreibbare Felder der Einstellungen (`SECRET_SETTING_FIELDS`, z. B. das SMTP-Passwort) stehen in der Historie als `••••••`.
- Der Benutzer kommt aus dem `UserContext` (AsyncLocalStorage). Eine Middleware öffnet ihn je Anfrage, der Auth-Guard füllt ihn.

## Sicherheit

**Ersteinrichtung.** Solange es keinen (nicht technischen) Benutzer gibt, ist `POST /api/core/setup` offen. Gleichzeitige Aufrufe sind über eine Datenbanksperre serialisiert; nur der erste legt an. Der Aufruf legt Folgendes an:
- den Namen der Feuerwehr (Einstellung `brigade`)
- die Standardrollen aus den Rollenvorlagen, benannt in der gewählten Sprache (siehe unten)
- den ersten Benutzer mit der Rolle aus der Vorlage `administrator` (Muster `*`) für die Gesamtwehr

Danach ist der Benutzer angemeldet, und der Endpunkt antwortet mit `409`.

**Anmeldung**
- Benutzername und Passwort. Das Passwort wird mit scrypt gehasht (Format `scrypt$N$r$p$salz$hash`).
- Die Sitzung ist ein Zufallswert im Cookie `forga_session` mit `HttpOnly`, `SameSite=Lax` und 14 Tagen Laufzeit. `Secure` wird gesetzt, wenn `FORGA_SECURE_COOKIES=true` ist.
- In der Datenbank (`core.session`) liegt nur der SHA-256 des Werts.
- Nach 5 Fehlversuchen ist der Benutzername 1 Minute gesperrt (`429`). Der Zähler liegt im Speicher des Prozesses und hält höchstens 10.000 Benutzernamen.
- Ändert ein Benutzer sein Passwort (`PUT /api/core/password`), enden seine anderen Sitzungen. Setzt die Benutzerverwaltung ein Passwort oder sperrt den Benutzer, enden alle seine Sitzungen.
- Rechte deaktivierter Module zählen nicht: Ihre Listen, Importprofile, Suchtreffer und Fristen verschwinden mit dem Modul. Der Vollexport und die Auskunft je Person enthalten ihre Daten weiterhin (gespeichert ist gespeichert).

**Anmeldung mit dem Konto der Gemeinde (OIDC).** Optional zusätzlich zum Passwort, Einstellung `oidc` (Aussteller, Client-ID, Client-Secret als geheimes Feld, Scopes, Verknüpfung über `email` oder `username`, Beschriftung de/en), Bibliothek `openid-client`.
- `GET /api/core/setup` liefert `oidc: { label }`, wenn eingeschaltet und vollständig; die Anmeldeseite zeigt dann den Knopf.
- `GET /api/core/oidc/start` leitet zum Anbieter (Authorization Code mit PKCE, `state`, `nonce`). Die offene Anmeldung liegt 10 Minuten im Speicher des Prozesses, gefunden über das Cookie `forga_oidc` (`HttpOnly`, Pfad `/api/core/oidc`).
- `GET /api/core/oidc/callback` prüft State, Nonce und ID-Token (Signatur über JWKS, Aussteller, Zielgruppe) und öffnet eine normale Sitzung. Die Rücksprungadresse ist `<brigade.publicUrl bzw. FORGA_PUBLIC_URL>/api/core/oidc/callback`, nie aus Kopfzeilen der Anfrage; ohne Adresse ist OIDC aus.
- Nur vorhandene, aktive, nicht technische Benutzer melden sich an; Rollen und Rechte bleiben in f.orga. Die erste Anmeldung verknüpft das Konto (`core.user.oidc_subject` = `issuer|sub`) über die bestätigte E-Mail-Adresse (genau ein Treffer) bzw. den Benutzernamen (`preferred_username`), danach zählt nur die Verknüpfung. `DELETE /api/core/users/:id/oidc` löst sie (Benutzerverwaltung).
- Fehler leiten auf `/?oidcError=<code>` (`auth.oidcDisabled`, `auth.oidcExpired`, `auth.oidcFailed`, `auth.oidcUnknownUser`), die Anmeldeseite zeigt den Text; Fehlschläge stehen im Audit-Log (`auth.oidc-failed`).
- Aussteller über `http://` sind nur auf `localhost` erlaubt (Entwicklung, Tests).

**Passwort zurücksetzen.** `POST /api/core/password-reset` (`{ login }`: Benutzername oder E-Mail) schickt einen Einmal-Link `…/reset-password?token=…`, eine Stunde gültig (`core.password_reset`, nur der SHA-256 des Tokens). Die Antwort verrät nicht, ob es das Konto gibt. `POST /api/core/password-reset/confirm` setzt das neue Passwort und beendet alle Sitzungen des Benutzers. Die Adresse im Link kommt nur aus der Einstellung `brigade.publicUrl` oder der Umgebungsvariable `FORGA_PUBLIC_URL`, nie aus Kopfzeilen der Anfrage. Ist keine gesetzt, antwortet der Endpunkt mit `503` (`auth.resetNotConfigured`) und verschickt nichts.

**Impersonation („Anmelden als“).** Wer `core.users.impersonate` hat, kann über `POST /api/core/users/:id/impersonate` mit Grund als ein anderer Benutzer arbeiten, z. B. um zu prüfen, was ein Gruppenführer sieht.
- Erlaubt nur für aktive, nicht technische andere Benutzer, deren Rechte der Administrator selbst vollständig hat (sonst `auth.impersonationWider`). Impersonation erweitert also nie die eigenen Rechte. Keine verschachtelte Impersonation, kein Passwortwechsel währenddessen.
- Es entsteht eine eigene Sitzung (`core.session` mit `impersonator` und `impersonation_reason`) für höchstens 60 Minuten. Die eigene Sitzung bleibt im Cookie `forga_session_original` und wird mit `POST /api/core/impersonation/end` wiederhergestellt; Abmelden beendet beide.
- Beginn und Ende stehen im Audit-Log (`auth.impersonation-started` mit Grund, `auth.impersonation-ended`). Während der Impersonation tragen Audit- und Historieneinträge zusätzlich `impersonatorId`; Historie und Audit-Log zeigen „Administrator als Benutzer“.
- `GET /api/core/session` liefert dann `impersonator` (Name, Ende). Die Shell zeigt auf jeder Seite einen Hinweis mit „Zurück zu meinem Konto“; in der Benutzerverwaltung steht „Anmelden als …“.

**Auth-Guard.** Der Guard ist global. Ohne `@Public()` braucht jeder Endpunkt eine Anmeldung, über das Sitzungs-Cookie oder `Authorization: Bearer <token>`.

**CSRF.** Anfragen mit Sitzungs-Cookie und einer ändernden Methode (`POST`, `PUT`, `DELETE`) müssen den Header `x-forga: 1` tragen, sonst kommt `403`. Der API-Client im `web-sdk` setzt ihn immer.

**Rechte**
- Berechtigungen haben einen Geltungsbereich: `brigade` (Gesamtwehr) oder `department`. Der Core bringt eigene mit (`CORE_PERMISSIONS`), die Module deklarieren ihre im Manifest.
- Rollen enthalten Berechtigungs-IDs oder Muster:
  - `*` steht für alles.
  - `masterdata.*` steht für alles eines Moduls.

  Unbekannte Muster werden abgelehnt.
- Eine Rollenzuweisung gilt für die Gesamtwehr (`departmentId: null`) oder für eine Abteilung. Bei einer Zuweisung für eine Abteilung wirken nur Berechtigungen mit Bereich `department`.
- Jede Berechtigung einer Rolle gilt entweder **im zugewiesenen Bereich** (`permissions`: die Abteilung der Zuweisung bzw. die Gesamtwehr) oder **in allen Abteilungen** (`permissionsAllDepartments`: immer für die Gesamtwehr, auch bei Zuweisung für eine Abteilung). Beispiel: Der Abteilungskommandant bearbeitet Personen (mit sensiblen Daten), Fahrzeuge und Lehrgänge seiner Abteilung und sieht von den anderen Abteilungen nur das Personenverzeichnis (`masterdata.persons.directory`).
- `POST /api/core/roles/:id/apply-template` setzt eine Standardrolle auf die Rechte ihrer Vorlage zurück, z. B. nachdem ein Update neue Standardrechte gebracht hat.
- `@RequirePermissions(...)` verlangt die Berechtigung in mindestens einer Abteilung. Die Prüfung für eine bestimmte Abteilung macht der Handler mit `user.can(berechtigung, departmentId)`.

**Rollenvorlagen** (`RoleTemplates`, `libs/core/core-api/src/lib/security/role-templates.ts`)
- Der Core bringt die Standardrollen mit (`CORE_ROLE_TEMPLATES`): `administrator` (`*`), `commander`, `department-commander`, `group-leader`, `course-coordinator`, `breathing-apparatus-officer`, `equipment-officer`, `administration`, `member`. Namen und Beschreibungen sind `LocalizedText`.
- Module ergänzen im Manifest unter `roles` ihre Berechtigungen zu diesen Schlüsseln oder führen neue Schlüssel mit eigenem Namen ein. Vorlagen mit gleichem `key` werden zusammengeführt (Vereinigung der Berechtigungen).
- Ergebnis der Grundausstattung:

  | Schlüssel | Rolle (de) | Berechtigungen |
  | --- | --- | --- |
  | `administrator` | Administrator | `*` |
  | `commander` | Kommandant | `core.audit.read`, `masterdata.*`, `incidents.*` |
  | `department-commander` | Abteilungskommandant | in der eigenen Abteilung Personen lesen, schreiben, sensible Daten, Organisation, Lehrgänge planen; Einsatzberichte lesen und schreiben; in allen Abteilungen das Personenverzeichnis |
  | `group-leader` | Gruppenführer | `masterdata.persons.read`, `incidents.reports.read`, `incidents.reports.write` |
  | `course-coordinator` | Lehrgangsbeauftragter | `masterdata.persons.read`, `masterdata.courses.plan` |
  | `breathing-apparatus-officer` | Atemschutzgerätewart | `masterdata.persons.read`, `incidents.reports.read` |
  | `equipment-officer` | Gerätewart | `masterdata.persons.read` |
  | `administration` | Verwaltung / Kasse | Personen lesen und sensible Daten, `incidents.reports.read`, `incidents.compensation.export`, `incidents.statistics`, `incidents.duty.manage` |

- Rollen aus Vorlagen tragen das Feld `templateKey`. Jede Vorlage wird höchstens einmal angelegt; ist der Name schon von einer anderen Rolle belegt, wird die Vorlage übersprungen.
- `POST /api/core/roles/templates` legt fehlende Standardrollen nachträglich an, z. B. nach dem Hinzufügen eines Moduls (Audit `roles.templates-created`). Angelegte Rollen sind danach normale, änderbare Rollen.
- Beim Start ergänzt der Server die Berechtigungen aus den Rollenvorlagen jedes Moduls in den bestehenden Rollen mit gleichem Vorlagenschlüssel, und zwar jede Berechtigung nur einmal (`ModuleStateService.onApplicationBootstrap`). Welche schon ergänzt wurden, steht je Modul in `core.module.granted_templates`. So kann z. B. der Kommandant ein neu installiertes Modul sofort nutzen, und neue Rechte eines Modul-Updates kommen hinzu; vom Administrator entfernte Rechte kommen nicht wieder. Ein Modul, das schon vor dieser Buchführung installiert war (Zeile ohne `granted_templates`), schreibt beim ersten Start nur den aktuellen Stand als Ausgangspunkt fest und ergänzt nichts.

**API-Tokens**
- Format `forga_<zufall>`. Gespeichert werden nur der SHA-256 und ein Präfix zum Wiedererkennen.
- Jedes Token bekommt einen eigenen technischen Benutzer. So zeigt die Historie, welches System etwas geändert hat.
- Ein Token hat genau die Berechtigungen seiner `scopes`, immer für die Gesamtwehr. Ein Ablaufdatum ist optional.
- Beim Widerruf werden das Token und sein Benutzer gesperrt. Die letzte Nutzung wird mitgeschrieben.

**Audit.** `core.audit` protokolliert:
- Einrichtung, Anmeldungen und fehlgeschlagene Anmeldungen, Passwortänderungen
- Anlegen und Ändern von Benutzern und Rollen
- Tokens
- Aktivieren und Deaktivieren von Modulen

**Modulverwaltung**
- Die Tabelle `core.module` speichert, ob ein Modul aktiv ist. Ohne Eintrag gilt es als aktiv.
- Aktivieren setzt aktive Abhängigkeiten voraus. Deaktivieren ist nur möglich, wenn kein aktives Modul das Modul benötigt.
- Eine Middleware beantwortet Anfragen an `/api/<modul-id>/…` inaktiver Module mit `404` (`modules.inactive`). `GET /api/core/modules` liefert nur aktive Module.

**Historie lesen.** Entscheidet die Prüfung aus der `HistoryAccessRegistry` (siehe [Historie](#historie)); ohne Prüfung wird abgelehnt. Core: Benutzer mit `core.users.manage`, Rollen mit `core.roles.manage`, Einstellungen mit `core.settings.manage` oder `<modul>.settings.manage` für die Abschnitte des Moduls.

**Keine Rechteausweitung.** Wer Benutzer verwaltet, darf nur Rollen zuweisen, deren Rechte er selbst im selben Bereich hat; wer Rollen verwaltet, darf einer Rolle nur Rechte hinzufügen, die er selbst für die Gesamtwehr hat (`users.roleWider`). Gleiches gilt für die Impersonation (`auth.impersonationWider`).

**Gleichzeitiges Bearbeiten.** Einsatzbericht, Personalakte, Dienst und Gerät schicken beim Speichern die geladene `version` mit. Hat jemand anderes inzwischen gespeichert, antwortet der Server mit `409` (`conflict.stale`, `assertVersion` in `core-api`), statt dessen Änderung zu überschreiben. Ohne `version` (Importe, API) entfällt die Prüfung.

**Hochgeladene Dateien.** Wappen und Briefkopf müssen zum angegebenen Bildtyp passen (Signatur bzw. SVG-Dokument). Ausgeliefert werden sie mit `X-Content-Type-Options: nosniff` und einer Content-Security-Policy mit `sandbox`, sodass Skripte in einem SVG auch beim direkten Öffnen nicht laufen.

**Zeitzone.** Tagesgrenzen von Zeiträumen (Listen, Statistik, Exporte, Suchfilter) gelten in Europe/Berlin, unabhängig von der Zeitzone des Servers (`berlinDayStart`, `berlinDayAfter`, `berlinDayEnd`; `addBerlinDays` hält bei Serien die Uhrzeit über die Zeitumstellung). Das Frontend nimmt für „heute“ `localDate()` aus `web-sdk`.

**Fehler.** Fehlerantworten tragen einen maschinenlesbaren `code`, z. B. `auth.invalidCredentials` oder `modules.requiredByActive`, und bei Bedarf Details. Validierungsfehler kommen als `validation.failed` mit `issues` (`path`, `code`, `message`).

## Ereignisse zwischen Modulen

- `DomainEvents` im Core ist ein Ereignisbus im selben Prozess (`libs/core/core-api/src/lib/events/domain-events.ts`).
- Ein Modul ruft `publish(name, payload)` erst nach dem `flush`, also nach dem Commit seiner Änderung.
- Andere Module melden sich mit `subscribe(name, handler)` an. Die Handler laufen nacheinander. Schlägt einer fehl, versucht der Bus es einmal erneut. Schlägt er wieder fehl, steht das im Audit-Log (`events.handler-failed` mit Ereignis, Fehler und Daten) und als Aufgabe bei allen mit `core.audit.read`; weder der Aufrufer noch andere Handler sind betroffen. Einsatzberichte und Übungsdienst können ihre Ereignisse für einen Zeitraum erneut senden (siehe [Entschädigungen](#modul-entschädigungen-compensation)).

## Einstellungen

- Einstellungen liegen als JSON je Abschnitt in `core.setting`:
  - Der Core bringt `brigade` (Name, Anschrift, Kontakt), `smtp` und `reminders` (Sammel-E-Mail) mit.
  - Module registrieren eigene Abschnitte unter `<modul-id>.<abschnitt>`.
- Werte werden gegen das Schema des Abschnitts geprüft.
- Das SMTP-Passwort kann nur geschrieben werden. Bleibt es beim Speichern leer, gilt der gespeicherte Wert weiter.
- Lesen darf jeder angemeldete Benutzer. Schreiben darf, wer `core.settings.manage` hat; die Abschnitte eines Moduls darf zusätzlich speichern, wer `<modul-id>.settings.manage` hat (z. B. der Atemschutzgerätewart die Tauglichkeitsregel).

## Listen

- Module melden Listenvorlagen beim `ListRegistry` an (in `onModuleInit`). Die ID beginnt mit der Modul-ID, z. B. `masterdata.members`.
- Eine `ListDefinition` hat:
  - Name und Beschreibung als `LocalizedText`
  - die Berechtigung (`permission`), die der Benutzer in mindestens einer Abteilung braucht
  - Parameter (`parameters`, Typen `text`, `date`, `year`, `department`, `select`, `boolean`) mit einem Zod-Schema (`schema`) für die Query-Werte
  - Spalten (`columns`) mit relativer Breite und Ausrichtung
  - optional eine Unterschriftenspalte (`signatureColumn`) und das Querformat (`orientation`)
  - `rows(user, params, language)`: liefert die Zeilen und darf eigene Spalten (z. B. eine Matrix) und einen Untertitel setzen. Die Zeilen müssen die Rechte des Benutzers beachten.
- **Ausgabe** (`libs/core/core-api/src/lib/lists/`):
  - JSON für die Vorschau
  - PDF (pdfmake), Excel (exceljs), CSV (Semikolon, UTF-8 mit BOM, damit deutsches Excel die Datei richtig öffnet)
  - Gestaltung nach `Stil.md`:
    - Kopf mit Feuerwehrname und Titel in der Dienstfarbe
    - Tabellenkopf weiß auf `#8C1D18` in Großbuchstaben, Wechselzeilen `#FBF7F6`, Linien `#E0D2D0`
    - Fußzeile mit roter Linie, Anschrift aus der Einstellung `brigade`, Seitenzahl und Erstellungszeitpunkt
  - Schrift im PDF ist Helvetica, eine PDF-Standardschrift (Ersatzschrift für Arial nach `Stil.md`), in Excel Arial.
  - pdfmake kennt keine gewichteten Spaltenbreiten; die relativen Breiten werden auf A4 hoch oder quer umgerechnet.
  - Die Unterschriftenspalte ist leer und breit, die Zeilen sind höher.
  - Daten (`JJJJ-MM-TT`) werden je Sprache formatiert (Deutsch `TT.MM.JJJJ`), Wahrheitswerte als ja/nein bzw. yes/no.
- **Sprache:** Parameter `lang`, sonst die Sprache des Benutzers.
- **Sicherheit:** pdfmake lädt keine URLs. Lokal erlaubt sind nur die Namen der Standardschriften.
- Jeder Export steht im Audit-Log (`lists.exported`).

## Fristen und Aufgaben

- Module melden einen `DeadlineProvider` beim `DeadlineRegistry` an. Er berechnet die Fristen bei jeder Abfrage aus den aktuellen Daten; gespeichert wird nichts. Liegt der neue Nachweis vor, verschwindet die Frist von selbst.
- Eine Frist (`DeadlineInput`) hat ID, Art (`kind`), Titel als `LocalizedText`, Gegenstand (`subject`: Typ, ID, Anzeigename), Fälligkeit (`dueOn`), Vorlauf (`leadDays`), Abteilungen (`departmentIds`), eine Berechtigung (`permission`) und optional Personen (`personIds`).
- **Zuständig** ist, wer die Berechtigung in einer der Abteilungen hat. Ohne Abteilungen sehen nur Benutzer mit der Berechtigung für die Gesamtwehr die Frist. Sind `personIds` gesetzt, ist zusätzlich nur zuständig, wessen Benutzer mit einer dieser Personen verknüpft ist (z. B. der Verfasser eines Berichts).
- **Sichtbar** wird eine Frist ab `dueOn − leadDays`. Stufen:
  - `upcoming`: im Vorlauf
  - `due`: fällig in den nächsten 7 Tagen
  - `overdue`: Datum überschritten
- `GET /api/core/tasks` liefert die Fristen des angemeldeten Benutzers, früheste zuerst.
- **Sammel-E-Mail** (`DigestService`):
  - Einmal pro Woche erhält jeder aktive Benutzer mit E-Mail-Adresse, der sie nicht abbestellt hat (`receiveDigest`), eine E-Mail mit seinen Fristen in seiner Sprache. Benutzer ohne Fristen bekommen keine E-Mail. Fristen mit einer Gruppe (`DeadlineInput.group`, z. B. Geräte nach Kategorie und Fahrzeug) stehen eingerückt unter ihrer Überschrift, die übrigen davor.
  - Wochentag und Uhrzeit (Europe/Berlin) stehen in der Einstellung `reminders` (Standard Montag ab 7 Uhr, abschaltbar). Der Server prüft stündlich.
  - Jede E-Mail steht im Audit-Log als `reminders.digest-mail` (Stichtag, Benutzer). Ein erneuter Versuch nach einem Fehler schickt sie nicht doppelt. Erst wenn alle E-Mails durchgegangen sind, steht `reminders.digest-sent` mit dem Stichtag (`asOf`) im Audit-Log; daran erkennt der Server, dass am Tag schon verschickt wurde. Fehler der stündlichen Prüfung werden protokolliert und beenden den Prozess nicht.
  - `POST /api/core/tasks/digest` verschickt sofort an alle, auch an schon Benachrichtigte, z. B. zum Test der SMTP-Einstellungen.
- **Benachrichtigungen** (`Notifications`): sofortige E-Mails zu Ereignissen in der Sprache des Empfängers, mit Link auf die Seite in f.orga, wenn `brigade.publicUrl` oder `FORGA_PUBLIC_URL` gesetzt ist.
  - Empfänger sind aktive, nicht technische Benutzer mit E-Mail-Adresse, deren Rolle das Benachrichtigungsrecht (z. B. `equipment.defects.notify`) für die betroffene Abteilung oder die Gesamtwehr nennt, ausdrücklich oder über das Modul (`equipment.*`). Das globale `*` des Administrators zählt nicht, damit ein Administratorkonto nicht jede Meldung bekommt. Wer keine E-Mails will, bekommt eine Rolle ohne das Recht.
  - Jede verschickte Benachrichtigung steht mit den Empfängern im Audit-Log (z. B. `equipment.defect-notified`). Fehler beim Versand werden protokolliert und erreichen den Auslöser nicht.
- **Versand** (`MailService`) über den SMTP-Server aus der Einstellung `smtp`. Fehlen Server oder Absender, schlägt der Versand mit `mail.notConfigured` fehl.
- Umgebungsvariablen: `FORGA_MAIL_TRANSPORT=memory` sammelt E-Mails nur im Speicher (Tests, Vorführung), `FORGA_DIGEST_SCHEDULER=off` schaltet den stündlichen Versand ab.

## Import

- Module melden Importprofile beim `ImportRegistry` an. Ein Profil (`ImportProfile`) hat Felder mit Pflichtangabe und Aliassen (Spaltenüberschriften, die automatisch zugeordnet werden), Optionen und die Funktion `run(rows, context)`.
- **Ablauf:**
  1. Datei hochladen (`.xlsx`, `.csv`/`.txt` oder `.ics`, höchstens 10 MB). Bei Excel zählt das erste Blatt, die erste Zeile enthält die Überschriften. CSV erkennt `;` oder `,`, ein BOM und Anführungszeichen. Leere Zeilen fallen weg.
     - Wiederholte Überschriften werden nummeriert, z. B. die zwei Spalten „Bezeichnung“ im MP-Feuer-Export zu „Bezeichnung“ und „Bezeichnung (2)“. Excel-Werte mit Datum und Uhrzeit behalten die Uhrzeit.
     - Kalenderdateien (`parseIcs`) werden zu einer Tabelle mit einer Zeile je Termin (`VEVENT`) und den Spalten `UID`, `SUMMARY`, `DTSTART`, `DTEND`, `DESCRIPTION`, `LOCATION`. Umbrochene Zeilen werden zusammengefügt. Ganztägige Termine ergeben `JJJJ-MM-TT`, lokale Zeiten `JJJJ-MM-TTThh:mm:ss`, UTC-Zeiten enden auf `Z`.
  2. Die Antwort enthält Überschriften, Zeilenzahl, die ersten fünf Zeilen und je Profil eine vorgeschlagene Zuordnung. Überschriften werden dafür normalisiert (Kleinschreibung, Umlaute umschrieben, nur Buchstaben und Ziffern).
  3. Probelauf (`preview`) mit Zuordnung und Optionen: Ergebnis je Zeile (`create`, `update`, `unchanged`, `error`) mit Meldungscodes, ohne Änderung (der Import von MP-Feuer-Einsätzen läuft dafür in einer Transaktion, die immer zurückgerollt wird).
- Excel-Dateien werden vor dem Entpacken geprüft: Mehr als 100 MB entpackt oder ein unlesbares Zip ergibt `imports.fileTooLarge`.
- CSV-Ausgaben (Listen, Überweisungsdatei) setzen vor Texte, die mit `=`, `+`, `-`, `@` beginnen, ein Hochkomma, damit Tabellenprogramme sie nicht als Formel ausführen.
  4. Übernahme (`apply`): wie der Probelauf, aber gespeichert.
- Profile sind idempotent: Ein zweiter Lauf mit derselben Datei aktualisiert statt zu verdoppeln.
- Hilfsfunktionen: `parseDate` versteht `TT.MM.JJJJ`, `TT.MM.JJ` und `JJJJ-MM-TT`; Excel-Datumswerte kommen bereits als `JJJJ-MM-TT`. `parseLocalDateTime` macht aus `21.10.2026 13:05`, `2026-10-21 13:05` oder `2026-10-21T13:05:00` die lokale Form `2026-10-21T13:05:00`; `berlinTime` deutet sie in Europe/Berlin (mit Sommerzeit).
- Die hochgeladene Datei liegt bis zur Übernahme in `core.import_upload` und nur für den hochladenden Benutzer. Nach der Übernahme wird sie gelöscht, sonst nach 24 Stunden durch den täglichen Aufbewahrungslauf.
- Jede Übernahme steht im Audit-Log (`imports.applied`) mit Profil, Dateiname und Zählern.

### Datenübernahme aus MP-Feuer

Übernimmt einen vollständigen MP-Feuer-Datenexport, Oberfläche „Import → MP-Feuer-Datenübernahme“ (`apps/shell/src/pages/TransferImport.tsx`), Backend `imports/transfers.ts` und `imports/transfer-archive.ts`.
- **Quelle:** je Abteilung eine Transferdatei `MPTRA_<Nr>_<Zeitstempel>_<Einheit>.zip` aus MP-Feuer (unverschlüsselt). Sie enthält `MPTRA.IFO` (`type=transfer`, `encrypted=0`), `content.xml` und die SQLite-Datenbank `transfer.db` mit den MP-Feuer-Tabellen (z. B. `PER_STAMM`, `EIN_STAMM`, `UPE_STAMM`). Kindtabellen verweisen mit `<Präfix>_INDEX` auf die `<Präfix>_ID` der Elterntabelle.
- **Lesen:** Die Archive werden mit `fflate` beim Entpacken gezählt und gestreamt (die Größen im Zip-Kopf können falsch sein): höchstens 500 MB je `transfer.db` und 2 GB je Upload, sonst `imports.transferTooLarge` (Schutz vor Zip-Bomben). Die Datenbank wird in ein temporäres Verzeichnis geschrieben, mit `node:sqlite` nur lesend geöffnet und danach gelöscht. Werte kommen als Text: `NULL` und das MP-Feuer-Leerdatum `1899-12-30` werden leer, Zeitstempel verlieren die Millisekunden.
- **Profile mit Leser:** Ein Importprofil kann `transfer: { order, read(archives) }` anbieten. `read` bekommt alle Archive zugleich und liefert Zeilen mit Feldwerten und dem Schlüssel des Archivs. Die Zeilen laufen danach durch dasselbe `run` wie beim Dateiimport.
- **Reihenfolge:** Personen (10), Lehrgänge/Dienstgrade/Ehrungen (20), G26-Untersuchungen (30), Belastungsübungen (40), Dienste (50), Einsätze (60). Die Oberfläche lässt einen Schritt erst übernehmen, wenn die vorherigen übernommen oder übersprungen sind; prüfen geht jederzeit.
- **Abteilungen:** Der Schlüssel und die Einheit eines Archivs kommen aus dem Dateinamen (`01`, „Abt. Musterstadt“). In der Oberfläche wird jedem Archiv eine Abteilung von f.orga zugeordnet (vorgeschlagen über den Namen). Die Zuordnung ersetzt das Feld `department` der Zeilen dieses Archivs; ohne Zuordnung bleibt die Einheit aus dem Dateinamen.
- **Personen über Archive hinweg** (`transferPersons`): Mitglieder (`PER_STAMM`) und Jugendliche (`JUG_STAMM`) aller Archive nach MP-Feuer-ID. Andere Tabellen verweisen über diese ID (`EIN_PER_INDEX`, `UPE_PER_INDEX`, `PER_INDEX`) und werden als „Nachname Vorname“ (und Geburtsdatum) übergeben.
  - Die Personalnummern von MP-Feuer werden nicht übernommen und nicht zum Erkennen benutzt: MP-Feuer zählt sie je Abteilung, dieselbe Nummer gehört in verschiedenen Abteilungen verschiedenen Personen.
  - Ausgeschieden ist, wer in MP-Feuer archiviert ist (`ARCHIV_DAT`). „Aktiv bis“ allein beendet nur den aktiven Dienst, z. B. beim Wechsel in die Altersabteilung.
- **Zwischenspeicher:** Die gelesenen Zeilen liegen je Profil in `core.import_transfer` (nur für den hochladenden Benutzer), bis die Übernahme verworfen wird oder nach 24 Stunden (täglicher Aufbewahrungslauf). Jede Übernahme eines Profils steht im Audit-Log (`imports.transferApplied`) mit Profil, Dateinamen und Zählern.
- **Grenzen:** höchstens 40 Dateien je Upload und 200 MB je Datei.

## Modul Stammdaten (`masterdata`)

**Entitäten**
- `masterdata.entities.ts`: `Department`, `Station`, `Vehicle`, `Person`, `Membership`, `PersonQualification`, `RankAssignment`, `HonorAward`, `OfficeAssignment` (Amt aus dem Katalog `office`, Abteilung oder Gesamtwehr, von, bis, Bemerkung; historisiert), `RestPeriod` (Ruhezeit: Ruhen der Mitgliedschaft oder Mitgliedschaft in einer anderen Feuerwehr, von, bis oder offen; historisiert; `POST|PUT|DELETE /api/masterdata/persons/:id/rest-periods`). Organisation und Personen verweisen gegenseitig aufeinander (Kommandant einer Abteilung, Mitgliedschaften), deshalb liegen sie in einer Datei.
- `courses/course.entities.ts`: `Course`, `CourseAttendance`, `CourseNomination`
- `catalog/catalog.ts`: `CatalogEntry`

Alle Entitäten sind historisiert. Die Kinddatensätze der Person tragen den Elternbezug `person`.

**Kataloge**
- Arten (`CatalogKind`): `function`, `qualification`, `vehicle-type`, `honor`, `exit-reason`, `rank`.
- Jeder Eintrag hat einen stabilen `key` und einen zweisprachigen `name`. Andere Daten verweisen über den Schlüssel, deshalb können `kind` und `key` nach dem Anlegen nicht mehr geändert werden. Einträge werden deaktiviert statt gelöscht.
- Zusatzfelder je Art prüft `CatalogAttributes`:
  - Qualifikation: `validityMonths`
  - Fahrzeugtyp: `crew`, `seats`, `statisticsCategory`
  - Dienstgrad: `abbreviation`, `level`
  - Funktion: `abbreviation`
- **Vorlagen für Baden-Württemberg:**
  - `BW_CATALOG_TEMPLATE`: Dienstgrade nach VwV 2022, Qualifikationen (auch die Musiker-Lehrgänge Grundausbildung, D2, D3, C1, C2 für die Beförderungsregeln), Funktionen (im Einsatz), Ämter (Kommandant, Stellvertreter, Abteilungskommandant, Jugendfeuerwehrwart, Gerätewarte, Schriftführer …), Fahrzeugtypen, Ehrungen, Austrittsgründe
  - `BW_COURSE_TEMPLATE`: 14 Lehrgänge mit vermittelten Qualifikationen und Voraussetzungen

  Beim Anwenden kommen nur fehlende Schlüssel hinzu.
- Die Fahrzeugpositionen der Jahresstatistik F63–F120 sind fest im Code (`VEHICLE_STATISTICS_CATEGORIES`) und nicht änderbar.

**Organisation**
- `Department` hat:
  - Typ, übergeordnete Abteilung
  - Sonderaufgaben (`specialTasks`, Jahresstatistik F3–F9)
  - Kommandant (`commander`) und Stellvertreter (`deputyIds`)
  - `statisticsRelevant`: `null` heißt Standard des Typs. Standardmäßig zählen Einsatz-, Jugend-, Alters- und Musikabteilung.
  - `population`: Einwohner des Ortsteils der Abteilung, z. B. für Beförderungsregeln; `null` heißt die Einwohner der Gemeinde (`brigade.population`).
- `Station` hat das Merkmal `permanentlyStaffed`.
- `Vehicle` verweist auf einen Fahrzeugtyp aus dem Katalog. Sitzplätze und Statistik-Kategorie werden aus dem Typ übernommen, wenn sie nicht angegeben sind. Eine Statistik-Kategorie ist Pflicht.

**Personen**
- **Sichtbarkeit:**
  - Eine Person sieht, wer `masterdata.persons.read` für eine ihrer Abteilungen hat (Personalakte).
  - Mit `masterdata.persons.directory` erscheint sie nur im Personenverzeichnis: Die Liste `GET /masterdata/persons` enthält dann Name, Status und Abteilungen, alles andere ist leer und `restricted` ist `true`. Die Akte selbst gibt `404`. Die Suche nach der Personalnummer und der Filter nach Qualifikation wirken nur in den Akten, die der Benutzer lesen darf.
  - Maßgeblich sind die heute gültigen Mitgliedschaften. Bei Ausgeschiedenen zählen alle früheren.
  - Wer eine Person nicht sehen darf, erhält `404`.
- **Sensible Felder:** `birthDate`, `birthPlace`, `employer` und `bank` (`SENSITIVE_PERSON_FIELDS`) brauchen `masterdata.persons.sensitive`.
  - Ohne das Recht fehlen sie in der Antwort, und `sensitiveHidden` ist `true`.
  - Beim Schreiben werden sie ohne das Recht ignoriert.
  - In der Historie der Person werden sie maskiert.
- **Mitgliedschaften:**
  - Unter den heute gültigen ist genau eine die Stammabteilung (`primary`).
  - Wer Mitgliedschaften ändert, braucht `masterdata.persons.write` für die alten und die neuen Abteilungen.
- **Status:** `probation`, `active`, `passive`, `youth`, `veterans`, `left`.
  - Neue Personen beginnen standardmäßig in der Probezeit. Das Ende ist der Vortag des Jahrestags: Eintrittsdatum plus `probationMonths` der Einstellung `masterdata.membership` (Standard 12) minus ein Tag, am Monatsende abgefangen (`probationEnd` in `masterdata-contracts`, gleich für Anlegen, Import, Übernahme und Oberfläche).
  - Die Probezeit lässt sich mit Begründung verkürzen oder verlängern. Die Begründung kommt in die Bemerkung.
  - Die endgültige Aufnahme setzt `active` und das Beschlussdatum.
  - Der Austritt setzt `left`, beendet offene Mitgliedschaften zum Austrittsdatum und löst `masterdata.person.left` aus.
  - **Übernahme in Einsatzabteilung** (Feuerwehrsatzung, Schaltfläche bei Jugendlichen): nur aus `youth`, Zielabteilung vom Typ `operational`, Mindestalter `minimumAgeOperational` (17) am Übernahmetag. Die Mitgliedschaft in der Jugendfeuerwehr endet am Vortag und bleibt bis dahin die Stammabteilung, die neue ist es ab dem Übernahmetag. Probezeit regulär (`probationMonths`, endet am Vortag des Jahrestags), verkürzt (nicht vor dem Übernahmetag) oder entfallen; verkürzt und entfallen brauchen eine Begründung (`masterdata.probationReasonRequired`), die in die Bemerkung kommt. Ohne Probezeit ist die Person sofort `active` und aufgenommen.
  - **Übernahme in Altersabteilung** (Feuerwehrsatzung, Schaltfläche bei Aktiven und Passiven): Zielabteilung vom Typ `veterans`, vorgeschlagen die Altersabteilung der Stammabteilung. Mitgliedschaften in Einsatzabteilungen und Führungseinheiten enden am Vortag, andere (z. B. Musik) bleiben; Status `veterans`, der Dienstgrad bleibt. Kein Altersblock, weil die Übernahme auch bei Ende des Dienstes aus gesundheitlichen Gründen gilt; der Dialog nennt 55 Jahre auf Antrag und 65 Jahre.
  - Beide Übernahmen ändern nur Mitgliedschaften in Abteilungen, für die der Benutzer schreiben darf, sonst `auth.forbidden`. Das Übernahmedatum muss nach dem Beginn der endenden Mitgliedschaft liegen (`masterdata.transferBeforeMembership`).
  - Der einfache Statuswechsel führt nicht aus der Jugendfeuerwehr und nicht in die Altersabteilung (`masterdata.useTransfer`); dafür gibt es die Übernahmen. Die Oberfläche bietet bei Jugendlichen keinen Statuswechsel an und sonst nur aktiv und passiv (bei der Altersabteilung auch zurück).
- Der aktuelle Dienstgrad ist der jüngste Eintrag in `ranks`.
- Qualifikationen gelten bis `validUntil`. Fehlt das Datum, wird es aus `validityMonths` des Katalogs berechnet.

**Lehrgänge**
- Eine bestandene Teilnahme legt die Qualifikationen des Lehrgangs an (`courseAttendanceId` verweist zurück). Offene Vormerkungen der Person für den Lehrgang werden `completed`.
- Wird die Teilnahme gelöscht, verschwinden auch die so entstandenen Qualifikationen.
- Die Lehrgangsplanung (`course-planning/:course`) zeigt über alle Abteilungen, für die der Benutzer `masterdata.courses.plan` hat, zwei Gruppen:
  - die offenen Vormerkungen
  - die Kandidaten: aktive Personen und Personen in der Probezeit, die die Voraussetzungen erfüllen, den Lehrgang noch nicht haben und nicht vorgemerkt sind

  Eine Voraussetzung gilt als erfüllt bei bestandenem Lehrgang oder wenn alle Qualifikationen des Lehrgangs vorliegen, z. B. von Hand eingetragen.
- Lehrgangsteilnahmen eintragen und löschen darf, wer für die Person `masterdata.persons.write` **oder** `masterdata.courses.plan` hat. So kann der Lehrgangsbeauftragte (Rolle `course-coordinator`) Vormerkungen, Anmeldungen und Ergebnisse pflegen, ohne Personendaten ändern zu dürfen. Den Lehrgangskatalog pflegt weiter nur, wer `masterdata.catalogs.manage` hat.

**Listen** (`lists/masterdata.lists.ts`). Sie enthalten nur Personen, die der Benutzer sehen darf. Ohne Statusfilter fehlen Ausgeschiedene.

| ID | Inhalt | Recht |
| --- | --- | --- |
| `masterdata.members` | Mitgliederliste mit Abteilung, Dienstgrad, Status, Eintritt, Kontakt | `masterdata.persons.read` |
| `masterdata.signatures` | Unterschriftenliste mit Anlass und Datum | `masterdata.persons.read` |
| `masterdata.phones` | Telefonliste | `masterdata.persons.read` |
| `masterdata.complete` | Komplettdaten einschließlich Geburtsdatum und Arbeitgeber | `masterdata.persons.sensitive` |
| `masterdata.birthdays` | Geburtstage im Zeitraum, runde markiert | `masterdata.persons.sensitive` |
| `masterdata.jubilees` | Dienstjubiläen (10, 15, … 70 Jahre) im Jahr | `masterdata.persons.read` |
| `masterdata.qualification-matrix` | Matrix Person × aktive Qualifikation | `masterdata.persons.read` |
| `masterdata.breathing-apparatus` | Personen mit gültiger Qualifikation Atemschutz | `masterdata.persons.read` |
| `masterdata.probation` | Personen in der Probezeit mit Ende und Stand Truppmann Teil 1 | `masterdata.persons.read` |
| `masterdata.age-limits` | Personen, die im Jahr 18, 55 oder 65 werden | `masterdata.persons.sensitive` |
| `masterdata.strength` | Personalstärke je Stammabteilung nach Status, davon weiblich | `masterdata.persons.read` |
| `masterdata.vehicles` | Fahrzeuge ohne ausgesonderte | `masterdata.persons.read` |

**Urkunden für Ehrungen:** `GET /api/masterdata/persons/honors/certificates.pdf?from&to&honor` (Ehrungen im Zeitraum, optional einer Art) oder `?ids=` (einzelne Verleihungen) als Serien-PDF mit `renderCertificatesPdf`, nur für lesbare Personen (`masterdata.persons.read`). Text, Ort und Unterschrift aus der Einstellung `masterdata.certificates` (Platzhalter `{honor}`, `{name}`, `{date}`); Datum ist das der Verleihung. In der Oberfläche: Knopf „Ehrungsurkunden“ in der Personenliste (Administratoren pflegen dort die Texte) und je Ehrung in der Personenakte.

**Feuerwehrsatzung** (Einstellung `masterdata.membership`, Seite „Verwaltung → Feuerwehrsatzung“, Recht `masterdata.settings.manage`): Probezeit in Monaten, beschließendes Gremium (erscheint in den Beschlussfeldern), in der Probezeit zu erwerbende Qualifikationen (`probationQualifications`, Standard Truppmann Teil 1), Mindestalter Einsatzabteilung und Einsatzdienst, Ende Jugendfeuerwehr, Antrag Altersabteilung, Altersgrenze, Stellvertreter je Abteilungskommandant (`maxDeputies`, sonst `masterdata.tooManyDeputies`) und Dienstjubiläen (`jubileeYears`). Die Standardwerte sind übliche Beispielwerte.

**Fristen** (`deadlines/masterdata.deadlines.ts`). Zuständig ist, wer `masterdata.persons.write` für eine Abteilung der Person hat. Altersgrenzen und die Qualifikationen der Probezeit kommen aus der Einstellung `masterdata.membership`; die Listen Altersgrenzen, Geburtstage, Dienstjubiläen und Probezeit ebenso.

| Art (`kind`) | Fällig | Vorlauf |
| --- | --- | --- |
| `probation-ends` | Ende der Probezeit | 30 Tage |
| `basic-training-missing` | Ende der Probezeit, solange Truppmann Teil 1 fehlt | 60 Tage |
| `incident-age-reached` | Geburtstag mit Mindestalter Einsatzdienst (Personen in Probezeit oder aktiv); bleibt 30 Tage sichtbar | 30 Tage |
| `age-limit` | Geburtstag mit Altersgrenze Einsatzabteilung (Personen in Probezeit oder aktiv) | 90 Tage |
| `youth-ends` | Geburtstag mit Ende der Jugendfeuerwehr (Status `youth`) | 90 Tage |
| `driver-license-expires` | Ablauf des Führerscheins | 60 Tage |
| `qualification-expires` | `validUntil` des jüngsten Eintrags je Qualifikation | 60 Tage |

**Importprofil `masterdata.persons`** (`imports/persons.import.ts`), Recht `masterdata.persons.write`:
- Felder: Personalnummer, Anrede, Titel, Vor- und Nachname (Pflicht), Anschrift, Telefone, E-Mail, Geburtsdatum, Geschlecht, Eintritt, Abteilung, Status, Austritt, Austrittsgrund. Die Aliasse decken die MP-Feuer-Exporte `Personal.xlsx`, die Stammdatenliste und den Export der Jugendfeuerwehr ab (z. B. `Bezeichnung` → Abteilung, `Pers.-Nr.` → Personalnummer, `Geb.-Datum`, `Handy privat`, `Tel. gesch.`, `E-Mail privat`, `Aktiv von` → Eintritt). Die `Jug.-Nr.` wird nicht als Personalnummer zugeordnet, weil sie sich mit den Personalnummern der Einsatzabteilungen überschneiden kann; Jugendliche werden über Name und Geburtsdatum erkannt. Erziehungsberechtigte und Jugendgruppen werden nicht übernommen.
- **Erkennung:** über die Personalnummer, sonst über Vor- und Nachname (bei Angabe auch Geburtsdatum). Mehrere Treffer ergeben einen Fehler.
- **Abteilung:** „Abt. X“ und „Abteilung X“ treffen die Abteilung X, „Altersabt. X“ die Altersabteilung von X; „Sonderdienste“, „Führungsgruppe“ und „Jugend…“ ergeben die passenden Typen. Mit der Option `createDepartments` werden fehlende Abteilungen angelegt, Altersabteilungen unter ihrer Einsatzabteilung.
- **Neue Personen** bekommen den Status aus der Datei, sonst `active` (in einer Altersabteilung `veterans`, in einer Jugendfeuerwehr `youth`), und eine Stammmitgliedschaft ab Eintritt (sonst heute).
- **Ausgeschiedene:** Liegt der Austritt nicht in der Zukunft, wird eine neue Person mit Status `left`, Austrittsdatum und beendeter Mitgliedschaft angelegt. Der Austrittsgrund wird dem Katalog `exit-reason` zugeordnet, über den Schlüssel oder übliche Texte („verstorben“ → Tod, „umgezogen“ → Wegzug, „Krankheit“, „kein Interesse“ → eigener Wunsch); sonst bleibt er leer (`masterdata.import.unknownExitReason`). Bei vorhandenen Personen wird ein Austritt nur gemeldet (`masterdata.import.leftIgnored`), er läuft über den Austrittsdialog.
- **Vorhandene Personen** werden mit der Option `updateExisting` (Standard) aktualisiert, aber nur Felder mit Wert. Eine abweichende Abteilung wird nur gemeldet.
- Das Geschlecht ergibt sich auch aus der Anrede. Das Geburtsdatum wird ohne `masterdata.persons.sensitive` ignoriert und gemeldet.
- **Datenübernahme** (`imports/persons.transfer.ts`): `PER_STAMM` und `JUG_STAMM` aller Archive (Anschrift, Telefone, E-Mail, Geburtsdatum, Geschlecht, „Aktiv von“ → Eintritt; bei Archivierten „Aktiv bis“ bzw. Archivdatum → Austritt, „Aktiv Grund“ → Austrittsgrund; Jugendliche mit Status `youth`). Eine Person mit gleichem Namen und Geburtsdatum in mehreren Archiven wird einmal übernommen, bevorzugt der Datensatz eines aktuellen Mitglieds, dann der eines Erwachsenen statt der Jugendfeuerwehr.

**Importprofil `masterdata.career`** (`imports/career.import.ts`), Recht `masterdata.persons.write`:
- Eine Zeile je Lehrgang (Qualifikation), Beförderung (Dienstgrad) oder Ehrung mit Personalnummer oder „Nachname Vorname“ (und Geburtsdatum), Art, Bezeichnung, Datum und optional „gültig bis“.
- Die Bezeichnung wird dem Katalog zugeordnet (`imports/catalog-match.ts`): gleiche Wörter in Name, Schlüssel oder Kürzel, ohne Geschlechtsformen („/-frau“) und Füllwörter („Lehrgang auf Kreisebene“); sonst der eindeutig spezifischste Eintrag, dessen Wörter alle im Text stehen (Klammerzusätze und „BW“ zählen nicht). Mehrdeutige Namen (z. B. „Truppmann“ gegen „Truppmann Teil 1/2“) bleiben offen.
- Unbekannte Bezeichnungen ergeben `masterdata.import.unknownCatalogEntry`; mit der Option `createCatalogEntries` (und `masterdata.catalogs.manage`) werden sie im Katalog angelegt.
- Ein Eintrag mit gleichem Katalogschlüssel und Datum bleibt unverändert. Ohne „gültig bis“ gilt die Gültigkeit des Katalogeintrags.
- **Datenübernahme** (`imports/career.transfer.ts`): bestandene Lehrgänge aus `PER_LEHRG` (Datum = Ende, sonst Beginn oder Bestätigung) und die Kategorien „Dienstgrad“ und „Ehrung“ aus `PER_HIST`.

**Ereignisse:** `masterdata.person.left`, `masterdata.person.qualification-changed`, `masterdata.course.passed` (`MASTERDATA_EVENTS`).

**Schnittstellen für andere Module.** `MasterdataModule` ist `@Global()` und stellt zwei Tokens aus `@forga/masterdata-contracts` bereit. Beide prüfen keine Rechte; das ist Sache des aufrufenden Moduls.

| Token | Leistung |
| --- | --- |
| `PERSON_DIRECTORY` | `search`, `snapshots(ids, date)` mit Abteilungen, gültigen Qualifikationen, Dienstgrad, Geschlecht, Beschäftigung, Musiker und Führerscheinklassen zum Stichtag, `findByPersonnelNumber`, `memberPeriods` (Name und Mitgliedschaftszeiträume aller Personen, mit `membersOnDate` für Importe über viele Tage), `membersOn(date)` (alle Personen mit Mitgliedschaft am Tag), `careers(ids?)` (mit Ämtern), `offices({ offices? })` (Inhaber von Ämtern mit Zeitraum) |
| `ORGANIZATION` | `departments`, `stations`, `vehicles` |
| `PERSON_HOLDINGS` | `register(module, count(personId))`: andere Module melden, was eine Person noch hält (z. B. Schutzausrüstung); Austritt und Übernahme in die Altersabteilung lehnen dann mit `masterdata.personHoldsItems` ab |

## Modul Einsatzberichte (`incidents`)

Benötigt `masterdata`; Personen, Abteilungen, Wachen und Fahrzeuge kommen über `PERSON_DIRECTORY` und `ORGANIZATION`. Verweise auf Stammdaten werden als IDs ohne Fremdschlüssel gespeichert und beim Speichern geprüft.

**Entitäten** (`incidents.entities.ts`, Schema `incidents`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `AlarmKeywordEntity` | `alarm_keyword` | Stichwort (`key`), Name, Statistik-Vorbelegung (`mainType`, `technicalCategory`, `falseAlarmType`), `requiresVehicle`, `compensationKind` (`incident`, `standby`, `fire-watch`) |
| `IncidentEntity` | `incident` | Leitstellennummer (`dispatchNumber`, eindeutig), `internalNumber`, Stichwort, Meldebild, Alarmzeit, Einsatzort (`location` als JSON), Herkunft `createdVia` (`ui`, `api`, `import`) |
| `ReportEntity` | `report` | Bericht einer Abteilung: Nummer, `primary`, Status, Sperre, Rückgabekommentar, Verfasser, Zeiten, Lage/Maßnahmen/Ursache, Einsatzleiter, Statistik, Wetter, Kostenpflicht, Geräte (Freitext), Bemerkung, bestätigte Warnungen (`acknowledgements`), `externallyManaged` |
| `ReportPersonnelEntity` | `report_personnel` | Person oder Gast, Fahrzeug oder Bereitschaftswache, Funktion, Atemschutz mit Minuten, Gerät und CSA (Chemikalienschutzanzug), `from`/`to`, Verdienstausfall, Arbeitszeit beim Dienstherrn, Zuschläge, manueller Betrag, verletzt/getötet |
| `ReportVehicleEntity`, `InvolvedPartyEntity`, `OtherAgencyEntity` | `report_vehicle`, `involved_party`, `other_agency` | Fahrzeuge mit Zeiten und km, Beteiligte mit Rolle und Anschrift, sonstige Kräfte |
| `DutyAssignmentEntity` | `duty_assignment` | Sonderdienst aus dem Dienstplan (siehe unten) |
| `StatisticsYearEntity` | `statistics_year` | Korrekturen und Abschluss der Jahresstatistik eines Jahres |
| `ReportRevisionEntity` | `report_revision` | Gespeicherter Inhalt eines Berichts zum Rückgängigmachen (`content` im Format `ReportInput`, Benutzer, Zeitpunkt) |

Alle außer `ReportRevisionEntity` sind historisiert; Personal, Fahrzeuge, Beteiligte und sonstige Kräfte erscheinen in der Historie ihres Berichts. Die Historie eines Berichts liest, wer `incidents.reports.read` für seine Abteilung oder `incidents.reports.release` für die Gesamtwehr hat.

**Stichwort-Katalog.** `GET /api/incidents/keywords` für alle Angemeldeten, Pflege mit `incidents.settings.manage`. Der Schlüssel ist nach dem Anlegen fest. `POST /api/incidents/keywords/templates/bw` ergänzt fehlende Stichworte aus `BW_KEYWORD_TEMPLATE` (B1–B3, B-BMA, B-PKW, TH1/TH2, TH-Person, TH-VU, TH-Öl, TH-Tier, TH-Insekten, TH-Wasser, TH-Sturm, ABC, RD-Unterstützung als Technische Hilfe „sonstige“, BSW, Sicherheitsdienst, Sonstiges). Stichworte ohne `mainType` (BSW, Sicherheitsdienst, Sonstiges) werden statistisch nicht gezählt und verlangen kein Fahrzeug.

**Einsatz und Bericht**
- Ein Einsatz ohne Leitstellennummer bekommt eine interne Nummer `INT-JJJJ-nnnn` (höchste vergebene Nummer des Jahres + 1). Eine schon vergebene Leitstellennummer ergibt `incidents.dispatchNumberTaken`.
- Die Einsatzdaten (Stichwort, Alarmzeit, Ort, Nummer) ändert, wer den Hauptbericht schreiben darf, oder ein Freigeber (`incidents.notPrimaryWriter`). Einen Bericht für eine weitere Abteilung legt nur an, wer den Einsatz sehen darf.
- Je Einsatz und Abteilung gibt es höchstens einen Bericht. Die Berichtsnummer ist je Abteilung und Jahr fortlaufend (`JJJJ-nnn`).
- Der erste Bericht eines Einsatzes wird Hauptbericht. Ein partieller eindeutiger Index (`report_one_primary_per_incident`, in der Entität als `expression` deklariert) lässt höchstens einen Hauptbericht je Einsatz zu. Beim Wechsel (`POST …/primary`) wandern vorhandene Statistikmerkmale zum neuen Hauptbericht; Nebenberichte tragen keine.
- Ein neuer Bericht hat die Alarmzeit des Einsatzes und als Ende eine Stunde später.
- `from`/`to` einer Person sind `null`, solange die Zeiten des Berichts gelten.
- Speichern (`PUT …/reports/:id`) ersetzt den ganzen Inhalt samt Personal, Fahrzeugen, Beteiligten und sonstigen Kräften. Geprüft werden: Person existiert, Fahrzeug existiert, keine Person doppelt im selben Bericht.

**Versionen zum Rückgängigmachen.** Die Oberfläche speichert automatisch; nachvollziehbar ist jede Änderung über die Historie, rückgängig machen lässt sie sich über Versionen (`recordRevision` in `reports.service.ts`):
- Jede Speicherung legt den gespeicherten Inhalt als Version ab.
- Speichert derselbe Benutzer innerhalb von 10 Minuten erneut, wird seine letzte Version aktualisiert statt eine neue anzulegen (automatisches Speichern erzeugt so keine Flut).
- Vor der ersten Speicherung wird zusätzlich der bisherige Zustand abgelegt (`reportToInput`), z. B. nach Anlage, Import oder API, ohne Benutzer.
- Je Bericht bleiben höchstens die 50 jüngsten Versionen.
- Wiederherstellen (`POST …/revisions/:revisionId/restore`) ist eine normale Speicherung: gleiche Rechte und Prüfungen, Sperre durch Freigeber, neue Version – lässt sich also selbst wieder rückgängig machen.

**Prüfregeln** (`domain/rules.ts`, reine Funktion `evaluateRules`). Die Einstellung `incidents.general.rules` schaltet Regeln ab oder ändert ihre Stufe.

| Regel | Stufe | Bedingung |
| --- | --- | --- |
| `primary-missing` | Fehler | Einsatz ohne Hauptbericht (blockiert nur die Freigabe) |
| `report-empty` | Fehler | Lage und Maßnahmen leer |
| `statistics-missing` | Fehler | Hauptbericht eines gezählten Stichworts ohne Statistik |
| `statistics-not-allowed` | Fehler | Statistik im Nebenbericht oder bei Stichwort ohne `mainType` |
| `no-personnel` | Fehler | kein Personal |
| `vehicle-missing` | Fehler | Person ohne Fahrzeug und ohne Bereitschaft; nicht bei Abteilungstyp `command` oder `special-service` und nicht bei Stichworten mit `requiresVehicle: false` |
| `personnel-overlap-incident` | Fehler | Person in einem anderen Bericht desselben Einsatzes mit sich überschneidender Zeit (aneinandergrenzende Zeiten sind erlaubt) |
| `personnel-overlap-other` | Warnung | Überschneidung mit einem anderen Einsatz (Suche ±2 Tage, Zeiträume über 24 h werden ignoriert) |
| `times-invalid` | Fehler | Ende nicht nach Beginn (Bericht oder Person) |
| `duration-long` | Warnung | Bericht länger als 24 h |
| `rate-missing` | Warnung | kein Stundensatz für das Datum |
| `working-hours-and-loss-of-earnings` | Fehler | Arbeitszeit beim Dienstherrn und Verdienstausfall zugleich |
| `crew-exceeded` | Warnung | mehr Personen als Sitzplätze des Fahrzeugs |
| `breathing-without-qualification` | Warnung | Atemschutz ohne gültige Qualifikation `breathing-apparatus` |
| `breathing-not-fit` | Warnung | Atemschutz bei einer Person mit roter Atemschutz-Ampel am Einsatztag (nur mit Modul Atemschutz) |

Warnungen werden mit Begründung bestätigt (`acknowledgements`, je Regel und Gegenstand, z. B. Person). Die Befunde liefert jeder Bericht in `findings`, bestätigte Warnungen mit `acknowledged` und der Begründung (`reason`).

**Entschädigung** (`domain/compensation.ts`, Einstellung `incidents.general`)
- Stunden: `started-hour` (angefangene Stunde, Standard), `started-half-hour` oder `exact-minutes`.
- Satz: der Satz der Art (`incident`, `fire-watch` nach Stichwort, `standby` bei Bereitschaft) mit dem jüngsten `validFrom` bis zum Tag des Beginns (Europe/Berlin). Standard 15 € je Art ab 01.01.2026.
- Bereitschaft auf der Wache: immer `standbyHours` (Standard 1).
- Während der Arbeitszeit (beim Arbeitgeber, meist der Gemeinde) und für Gäste: keine Entschädigung; mit `compensateDuringWorkingHours` werden Einsätze während der Arbeitszeit normal vergütet.
- Zuschläge (`allowances`) werden addiert; die Standardeinstellung enthält keine. Eine Einsatzleiter-Pauschale gibt es im Bericht nicht, sie kommt aus dem Dienstplan.
- Ein manueller Betrag (`compensationOverride` mit Begründung) ersetzt den berechneten.
- Gäste und Einsätze während der Arbeitszeit beim Dienstherrn ergeben 0.

**Ablauf**

| Aktion | Recht | Von → nach |
| --- | --- | --- |
| `submit` | Schreibrecht | `draft` → `review`. Fehler blockieren (`incidents.findingsOpen`), unbestätigte Warnungen ebenfalls (`incidents.warningsNotAcknowledged`). |
| `return` | `incidents.reports.release` | `review` → `draft` mit Kommentar; hebt die Sperre auf. Der Verfasser bekommt eine E-Mail mit dem Kommentar und dem Link zum Bericht, wenn er eine E-Mail-Adresse hat (`incidents.author-notified`); ein Fehler beim Versand hält das Zurückgeben nicht auf |
| `release` (`compensation` oder `billing`) | `incidents.reports.release` | → `released-compensation` bzw. `released-billing`. Fehler blockieren, offene Warnungen gelten als bestätigt (Begründung `released`). Ereignis `incidents.report.released` |
| `unlock` | `incidents.reports.unlock` | Sperre aufheben, zurück nach `review` oder `draft`. Grund im Audit (`incidents.report-unlocked`), Ereignis `incidents.report.unlocked` |

Die Freigabe ist zweistufig: erst zur Entschädigungsauszahlung, dann zur Abrechnung (die Abrechnung schließt die Entschädigung ein). Mit `incidents.general.compensationRelease: false` entfällt die erste Stufe; `release` mit `compensation` ergibt dann `incidents.compensationReleaseDisabled`.

- Schreibrecht hat, wer `incidents.reports.write` für die Abteilung des Berichts hat, solange der Bericht ein Entwurf (sonst `incidents.notDraft`) und nicht gesperrt ist (`incidents.reportLocked`). Nach dem Fertigmelden ändert der Verfasser den Bericht also erst nach einer Rückgabe. Freigeber (`incidents.reports.release` für die Gesamtwehr) dürfen immer schreiben; ihr Speichern oder Freigeben sperrt den Bericht (`locked`, `lockedBy`, `lockedAt`).
- Löschen geht nur im Entwurf; ein Hauptbericht nur als letzter Bericht des Einsatzes.
- `incidents.report.released` enthält Personal (mit Atemschutz, Minuten und CSA) und Fahrzeuge, z. B. für das Atemschutzmodul.

**Statistikmerkmale.** Nur im Hauptbericht (`IncidentStatistics`): eigene Gemeinde oder Überlandhilfe, Einsatzhauptart `fire`, `technical-assistance`, `false-alarm` oder `other`, Brandgröße, TH-Kategorie 1–8 (`technicalCategoryByPrecedence` wählt die mit dem Vorrang), Fehlalarmart, Katastrophen-Voralarm/-Einsatz, gerettete Personen (davon Rauchgas), Tote, Fahrzeugbrand, Verkehrsunfall, Tierrettung. Pflichtunterfelder werden je Hauptart geprüft. Rettungsdienst und Krankentransport werden bewusst nicht erfasst; F46–F49 der Landesvorlage bleiben leer. Solange der Hauptbericht keine Statistik hat, liefert er `statisticsSuggestion` aus dem Stichwort und dem Einsatzort (eigene Gemeinde, wenn der Ort in `homeMunicipalities` steht oder diese leer sind).

**Externe API** (`POST /api/incidents/v1/incidents`, Recht `incidents.api.create`, z. B. per API-Token)
- Idempotent über die Leitstellennummer: legt Einsatz und fehlende Berichte an oder ergänzt sie.
- Abteilungen werden über ID, Namen oder Kurzname erkannt („Abt.“/„Abteilung“ wird ignoriert), Fahrzeuge über ID, Bezeichnung oder Funkrufnamen, Personen über die Personalnummer.
- Neue Berichte sind `externallyManaged`. Nur solche Berichte bekommen Personal von der API; sobald ein Mensch speichert, ändert die API den Bericht nicht mehr.
- Verfasser ist die Person mit Funktion `group-leader`, sonst der Kommandant der Abteilung.
- Nicht erkannte Werte führen nicht zum Abbruch, sondern zu `warnings` (`incidents.api.unknownDepartment`, `incidents.api.unknownPerson`, `incidents.api.unknownVehicle`).

**MP-Feuer-Import der Einsätze** (Importprofil `incidents.mp-feuer`, `imports/mp-feuer.import.ts`, Recht `incidents.reports.release`)
- Quelle ist der Personalexport von MP-Feuer (`Einsaetze_Personal.xlsx` bzw. `MP-EXCEL.xlsx`, eine Zeile je Person und Bericht). Die Aliasse ordnen die Spalten zu, z. B. `Leitstellen-Nr.`, `Einsatz-Nr.`, `Beginn`/`Ende`, `Alarmstichwort`, `Bezeichnung (2)` → Abteilung, `Name`, `Pers.-Nr.`, `von`/`bis`, `Funkrufname`, `BE`, `AS`, `V-A`, `Aufgabe`, `bei Ges. Stat. anzeigen`, `Zusatzfeld 2`, `Lage`, `Verlauf`, `Bericht`, `Ursache`, `Leitung`, `Statistik`, `Eins.-Art`, `Pers.-Rettung`, `Verluste`, `Tier-Rettung`, `kostenpflichtiger Einsatz`.
- Berichtstext: `Lage` → Lage; `Verlauf` (Auswahlwert) und `Bericht` (Freitext) zusammen → Maßnahmen.
- `Aufgabe` → Funktion im Einsatz über Name oder Kürzel im Katalog `function` (z. B. „Maschinist“, „Gruppenführer“, „EvD“); andere Werte bleiben leer (`incidents.import.unknownFunction`).
- Statistik (`imports/mp-feuer-statistics.ts`): Der Schlüssel `#L …` ergibt die Statistikmerkmale: Kleinbrände A/B, Mittel- und Großbrände → Brand mit Größe; `TH1`–`TH8` → Technische Hilfe der Kategorien 1–8; `TH-Überlandhilfe` → Technische Hilfe „sonstige“ außerhalb der Gemeinde; `Fehlalarm.BMA`/`.Täuschungsalarm`/`.böswillig` → Fehlalarm; `Sonstige Einsätze` → Sonstiges. Dazu gerettete Personen (`Pers.-Rettung`), Tote (`Verluste`), gerettete Tiere (`Tier-Rettung`) und Verkehrsunfall (`Eins.-Art`). Ein leerer oder unbekannter Schlüssel lässt die Statistik offen.
- Nicht übernommen wird `Vergütung`: f.orga berechnet die Entschädigung selbst nach der Satzung.
- Einsatz = Leitstellennummer. Ohne Nummer entsteht eine stabile Nummer `MP-<Jahr>-<Einsatz-Nr.>-<Abteilung>`, damit ein erneuter Import denselben Einsatz trifft.
- Bericht = Abteilung + Einsatznummer + Beginn. Hauptbericht ist der Bericht mit „bei Ges. Stat. anzeigen“.
- Status aus Zusatzfeld 2: enthält es „Abrechnung“ → `released-billing`, „Entschädigung“ oder „Auszahlung“ → `released-compensation`, sonst `draft`. Freigegebene Berichte werden gesperrt (`lockedBy` „MP-Feuer“).
- Personen über die Personalnummer, sonst über „Nachname Vorname“. Bereitschaft (`BE`) ergibt die erste Wache der Abteilung, sonst das Fahrzeug über Funkrufname oder Bezeichnung.
- Unbekannte Stichworte werden mit der Option `createKeywords` (Standard) angelegt.
- Wiederholbar: Importierte Berichte sind `externallyManaged` und werden bei einem erneuten Import ersetzt; Berichte, die seitdem ein Mensch bearbeitet hat, bleiben unverändert (`incidents.import.reportEdited`).
- Eine Zeile ohne Person trägt nur den Bericht (z. B. ein Bericht ohne Personal).
- Mehrere MP-Feuer-Berichte einer Abteilung zu derselben Leitstellennummer werden zu einem Bericht zusammengeführt: Felder aus dem ersten, Personal aus allen, Ende das späteste.
- Große Importe: Personen werden einmal über `memberPeriods` geladen und je Tag gefiltert; alle 50 Berichte werden die Änderungen geschrieben und der Unit of Work geleert (der Probelauf läuft in einer Transaktion, die zurückgerollt wird). Dasselbe gilt für `training.sessions`.
- Meldungen je Zeile: `masterdata.import.unknownDepartment`, `imports.invalidDate`, `incidents.unknownKeyword`, `incidents.import.unknownPerson`, `incidents.personTwiceInReport`, `incidents.api.unknownVehicle`, `incidents.import.unknownFunction`, `incidents.import.reportEdited`.
- **Datenübernahme** (`imports/mp-feuer.transfer.ts`): `EIN_STAMM` mit `EIN_PERS`. Die Berichtsfelder stehen nur in der ersten Zeile eines Berichts, die Personalzeilen wiederholen den Schlüssel. Felder: `EIN_LS_NR`, `EIN_NR`, `EIN_ZEIT_V/B`, Stichwort (`EIN_ALARMSTICHWORT`, ohne Stichwort die Einsatzart `EIN_ART`, sonst die Kategorie), `EIN_ERLAEUTERUNG`, Einsatzort, `EIN_MERKMAL_ST_GLOBAL` → Hauptbericht, `EIN_ZUSATZ_2` → Status, Lage, Verlauf, Bericht, Ursache, Leitung, Statistik, Rettungen und Verluste, `EIN_MERKMAL_KO` → kostenpflichtig; je Person Zeiten, Fahrzeug (Funkrufname, sonst Bezeichnung), Bereitschaft, Atemschutz, Verdienstausfall (`MERKMAL_VA`) und Aufgabe.

**Fristen** (`deadlines/incidents.deadlines.ts`)

| Art | Zuständig | Fällig |
| --- | --- | --- |
| `report-open` / `report-returned` | Verfasser (`personIds`) mit `incidents.reports.write` in der Abteilung | 7 Tage nach Alarm |
| `report-review` | `incidents.reports.release` für die Gesamtwehr | 14 Tage nach Alarm |

**Listen** (Recht `incidents.reports.read`, Zeilen nur aus lesbaren Abteilungen)

| ID | Inhalt |
| --- | --- |
| `incidents.open-reports` | Berichte im Entwurf oder zur Prüfung mit Verfasser, Zahl der Fehler und offenen Warnungen; ersetzt die frühere Prüf-App |
| `incidents.incidents` | Einsätze im Zeitraum mit Ort, Abteilung, Hauptbericht, Status |
| `incidents.per-department` | Berichte, Hauptberichte, Einsatzkräfte und Stunden je Abteilung |
| `incidents.hours-per-person` | Einsätze, Stunden, Bereitschaften, Atemschutzminuten je Person |

**Abrechnungsexport** (`GET /api/incidents/compensation/export?from&to&includeUnreleased&lang`, Recht `incidents.compensation.export`): Excel im Stil von `Stil.md`, ersetzt `auswertung.py`. Standardmäßig nur freigegebene Berichte. Blätter:
- Betrag pro Person (nach Stammabteilung): Einsätze, Stunden, Sonderdienste, Betrag, Gesamtzeile
- Summe je Abteilung (Abteilung des Berichts)
- Einsätze (eine Zeile je Person und Bericht)
- Sonderdienste (Dienstplan im Zeitraum)
- Hinweise: Ergebnis der Prüfung vor der Auszahlung (siehe unten)
- Überschneidungen derselben Person zwischen Einsätzen

Audit `incidents.compensation-exported`.

**Prüfung vor der Entschädigungsauszahlung** (`lists/compensation-check.ts`, `GET /api/incidents/compensation/check?from&to`, Recht `incidents.compensation.export`). Sie prüft alle lesbaren Berichte des Zeitraums, unabhängig vom Status, und liefert `CompensationCheck` (`reportsChecked`, `reportsReleased`, `problems`). Jedes Problem nennt Bericht, Leitstellennummer, Alarmzeit, Abteilung, Status, `code` und gegebenenfalls die Person:

| `code` | Bedeutung |
| --- | --- |
| `not-released` | Bericht nicht freigegeben; fehlt in der Auszahlung |
| `zero-amount` | Mitglied ohne Betrag, obwohl es entschädigt werden müsste (kein Satz für das Datum, keine Dauer); nicht bei Arbeitszeit beim Dienstherrn und nicht bei manuellem Betrag |
| `no-personnel`, `vehicle-missing`, `personnel-overlap-incident`, `personnel-overlap-other`, `times-invalid`, `working-hours-and-loss-of-earnings` | Befunde der Prüfregeln zum Personal |

Das Blatt „Hinweise“ des Abrechnungsexports enthält dieselben Probleme mit Text in der gewählten Sprache.

**Dienstplan / Sonderdienste** (`duty/duty.ts`, Recht `incidents.duty.manage`)
- Sonderdienste wie der Einsatzleiter vom Dienst (EvD) stehen nicht in Berichten. Sie werden je vollem Tag (24 h) entschädigt; Satz nach Tag des Beginns.
- Arten und Tagessätze in `incidents.general.dutyKinds`; Standard `duty-officer` „Einsatzleiter vom Dienst (EvD)“ mit 10 € je Tag ab 01.01.2026. Je Art `unit`: nur volle Tage (24 Stunden, Standard) oder angefangene Tage.
- Pflege von Hand (`/api/incidents/duty`) oder per **iCal-Import** über das Importprofil `incidents.duty-roster`:
  - Felder `uid`, `title`, `from`, `to` (Pflicht), `notes`; Vorschläge über `UID`, `SUMMARY`, `DTSTART`, `DTEND`, `DESCRIPTION`.
  - Die Person wird am Namen im Titel erkannt („EvD Max Test“, „Test, Max“) unter den Mitgliedern am ersten Tag. Kein oder mehrere Treffer: `incidents.duty.unknownPerson` bzw. `incidents.duty.ambiguousPerson`.
  - Ganztägige und lokale Zeiten gelten in Europe/Berlin.
  - Idempotent über die Termin-UID (`externalUid`): ein erneuter Import aktualisiert geänderte Termine.
  - Importierte Dienste bekommen die erste Art aus `dutyKinds`.
- Jede Änderung (anlegen, ändern, löschen, Import) sendet `incidents.duty.changed` mit Tagen, Satz und Betrag; `POST /api/incidents/reports/republish` sendet die Dienste des Zeitraums erneut.

**Jahresstatistik** (`statistics/`, Recht `incidents.statistics`)
- `computeAnnualStatistics` berechnet die Werte F1–F120 der Landesvorlage, Stichtag 31.12.:
  - Organisation (F2–F11) aus Abteilungen, Sonderaufgaben und Wachen
  - Feuerwehrangehörige (F12–F25) aus `membersOn` (Einsatzabteilung: Status aktiv oder Probezeit; Spalten D = FF, F = Jugend, G = Altersabteilung, H = Musik)
  - eigene Verletzte/Tote (F26, F27) aus allen Berichten des Jahres; dazu Verletzte aus abgeschlossenen Diensten des Übungsdienstes (F26, Quelle `training`, über `TRAINING_CASUALTIES`, falls das Modul installiert ist)
  - Einsätze (F28–F62) einmal je Einsatz über die Statistik des Hauptberichts; Seiten 5–7 nur eigene Gemeinde
  - Fahrzeuge (F63–F120) nach Statistik-Kategorie, in Dienst am Stichtag
- Funkgeräte (F121–F129) und Abweichungen werden als Korrekturen (`<Frage>:<Spalte>`) eingetragen; jeder Wert zeigt berechnet, korrigiert und gültig.
- Prüfungen (`checkAnnualStatistics`): Summen Brandgrößen, TH-Kategorien, Fehlalarme, hauptberufliche Kräfte; Teilmengen gerettete/tote Personen; dazu Hauptberichte ohne Statistik und nicht freigegebene Hauptberichte. Fehlgeschlagene Prüfungen blockieren den Export nicht.
- Abschluss (`close`) friert die Korrekturen ein (`incidents.statisticsClosed`), `reopen` hebt das auf.
- Export füllt die eingebettete Import-Vorlage des Landesportals (`state-template.ts`, Base64, Dokumenteigenschaften neutralisiert, Ersteller `f.orga`) in den Spalten D/F/G/H. Felder ohne Wert bleiben leer. Audit `incidents.statistics-exported`.

**Einstellungen** `incidents.general`: `homeMunicipalities`, `rates`, `rounding`, `compensationRelease`, `compensateDuringWorkingHours`, `standbyHours`, `longDurationHours` (Standard 24: längere Einsätze werden markiert, längere Einsätze einer Person nicht auf Überschneidungen geprüft), `allowances`, `dutyKinds`, `rules`.

**Ereignisse:** `incidents.report.released`, `incidents.report.unlocked`, `incidents.duty.changed` (`INCIDENTS_EVENTS`).

## Modul Übungsdienst (`training`)

Benötigt `masterdata`, nutzt optional `respiratory-protection` und `compensation`. Personen, Abteilungen und Wachen kommen über `PERSON_DIRECTORY` und `ORGANIZATION`; Verweise sind IDs ohne Fremdschlüssel.

**Entitäten** (`training.entities.ts`, Schema `training`, alle historisiert, Anwesenheiten in der Historie ihres Dienstes):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `SessionTypeEntity` | `session_type` | Art des Dienstes: Schlüssel, Name, `countsForParticipation`, `compensation` (`training`, `fire-watch`, `none`), Nachweis `record` (`training-track` = Atemschutzstrecke, `stress-exercise`, `briefing`, `exercise-under-ba`, `chemical-suit-exercise`), aktiv, Reihenfolge |
| `SessionEntity` | `session` | Typ, Titel, Beginn/Ende, Wache, Abteilungen (`departmentIds`, `text[]`), Verantwortlicher, Ausbilder (`instructorIds`), Thema, Lernziele, Ablauf, Material, Status, Abschluss (wann, wer), Code für den QR-Check-in |
| `AttendanceEntity` | `attendance` | je Dienst und Person höchstens einmal: Status (`present`, `excused`, `absent`), abweichende Zeiten, Funktion, Atemschutz, kJ und bestanden (Belastungsübung), verletzt, Zeitpunkt des Check-ins, bestätigt (`false` nach einem Check-in bis zum Speichern der Liste) |

**Arten von Diensten.** `GET /api/training/types` für alle Angemeldeten, Pflege mit `training.settings.manage`. `POST /api/training/types/templates/bw` ergänzt fehlende Arten aus `SESSION_TYPE_TEMPLATE`:

| Art (Vorlage) | Nachweis | Entschädigung | Beteiligung |
| --- | --- | --- | --- |
| Übung, Unterricht, Maschinistenfortbildung, Arbeitsdienst / Gerätepflege | – | wie Übungsdienst | ja |
| Atemschutz-Belastungsübung (Übungsstrecke) | Belastungsübung mit kJ | wie Übungsdienst | ja |
| Atemschutz-Unterweisung | Unterweisung | wie Übungsdienst | ja |
| Atemschutz-Einsatzübung | Übung unter Atemschutz | wie Übungsdienst | ja |
| CSA-Übung | CSA-Übung | wie Übungsdienst | ja |
| Brandsicherheitswache | – | eigener Satz | nein |
| Sitzung / Ausschuss | – | keine | nein |
| Jugendfeuerwehrdienst | – | keine | ja |

**Dienste.** Sichtbar sind Dienste, deren Abteilungen sich mit dem Bereich von `training.read` überschneiden (`$overlap`).
- `GET /api/training/sessions?from&to&departmentId&type`, `POST …/sessions`, `PUT …/sessions/:id`, `DELETE …/sessions/:id` (nur nicht abgeschlossene).
- `POST /api/training/sessions/series` legt eine Serie an: gleicher Wochentag und gleiche Uhrzeit alle 1–8 Wochen bis zu einem Datum.
- `POST /api/training/sessions/copy` (`{ from, to, weeks, departmentId? }`) übernimmt die Dienste eines Zeitraums, z. B. den Vorjahresplan: um 1–104 Wochen verschoben (52 Wochen behalten den Wochentag), gleiche Uhrzeit in Europe/Berlin, mit Inhalt, Verantwortlichem und Ausbildern, ohne Anwesenheit. Kopiert werden nur Dienste, die der Benutzer in allen ihren Abteilungen planen darf. Eine schon vorhandene Kopie (Art, Titel, Beginn, Abteilungen) wird übersprungen; die Antwort nennt `created` und `skipped`.
- Jeder Dienst meldet Überschneidungen (`overlaps`) mit anderen Diensten derselben Abteilungen.
- Planen braucht `training.plan` für alle gewählten Abteilungen.

**Ablauf.** `planned` → `held` → `closed`.
- `PUT …/sessions/:id/attendance` (`training.attendance`) ersetzt die Anwesenheitsliste. Vorhandene Zeilen werden aktualisiert (Check-in-Zeitpunkt bleibt), fehlende entfernt. Die Oberfläche schickt deshalb immer alle erfassten Zeilen mit, auch die von Personen, die der Benutzer nicht sieht, samt abweichender Zeiten und Funktion. Mit mindestens einer anwesenden Person ist der Dienst `held`, sonst wieder `planned`.
- `POST …/close` (`training.close`) geht nur bei `held` (sonst `training.notHeld`). Danach ist der Dienst gesperrt (`training.closed`). `POST …/reopen` öffnet ihn wieder und sendet `training.session.reopened`: Atemschutz zieht die Nachweise des Dienstes zurück, Entschädigungen entfernt offene Posten bzw. bucht ausgezahlte Beträge zurück, bis der Dienst wieder abgeschlossen ist. Der Import schreibt nicht in abgeschlossene Dienste (`training.closed`).
- Der Abschluss veröffentlicht `training.session.closed` (`SessionClosedEvent`): Art, Entschädigungsart, Abteilungen, je anwesender Person Zeiten, Minuten, Atemschutz, verletzt, und die Nachweise aus der Art des Dienstes (mit kJ und bestanden). Abnehmer sind Atemschutz und Entschädigungen.

**Textbausteine:** Die Einstellung `training.general` enthält `snippets` (Bezeichnung, Text; höchstens 200). Beim Planen und Bearbeiten eines Dienstes hängt „Baustein einfügen“ an Lernzielen und Ablauf den gewählten Text an.

**QR-Check-in.** `GET …/sessions/:id/check-in` (`training.attendance`) liefert den Code und das Zeitfenster: ab `checkInBeforeMinutes` (Einstellung `training.general`, Standard 30) vor Beginn bis zum Ende. Mit `POST /api/training/check-in { code }` trägt sich jeder angemeldete Benutzer mit verknüpfter Person als anwesend ein (`training.noPerson`, `training.unknownCode`, `training.checkInClosed`). Die Eintragung ist unbestätigt (`confirmed: false`), außer die Person war schon als anwesend erfasst. Das Speichern der Anwesenheit durch jemanden mit `training.attendance` bestätigt alle Zeilen; solange eine Eintragung unbestätigt ist, lässt sich der Dienst nicht abschließen (`training.unconfirmedCheckIns`).

**Kalender-Abo.** `GET /api/training/feed/<feedToken>.ics?departmentId=…` ohne Anmeldung, solange in `training.general` ein `feedToken` gesetzt ist. Enthält die Dienste ab 90 Tagen zurück.

**Dienstbeteiligung.** `GET /api/training/participation?from&to&departmentId`: je Person die Zahl der durchgeführten Dienste, die für die Beteiligung zählen, anwesend, entschuldigt, Quote in Prozent und Stunden.

**Listen:** Dienstplan eines Jahres (`training.schedule`: Wochentag, Datum, Zeit, Art, Thema, Ort, Abteilungen, Verantwortlicher; je Abteilung oder gesamt), Dienstbuch, Dienstbeteiligung, Teilnehmerliste eines Dienstes, Unterschriftenliste eines Dienstes (vorbelegt mit den Mitgliedern der Abteilungen), Ausbilderstunden.

**Fristen:** vergangene Dienste ohne Anwesenheit („Anwesenheit erfassen“, 2 Tage nach Ende) und durchgeführte, nicht abgeschlossene Dienste („Dienst abschließen“, 14 Tage nach Ende).

**Import** `training.sessions`: Zeilen mit Datum, Beginn, Ende, Art, Titel, Abteilung und optional Teilnehmer (Name oder Personalnummer); Zeilen gleichen Datums, Titels und gleicher Abteilung bilden einen Dienst. Für die Übernahme aus MP-Feuer „Übungen“. Optional Anwesenheit („entschuldigt“, „krank“, „Urlaub“ → entschuldigt, „abwesend“ → abwesend, sonst anwesend) und Atemschutz; eine Zeile ohne Teilnehmer legt nur den Dienst an. Datenübernahme (`imports/sessions.transfer.ts`): `UPE_STAMM` (erste Zeile des Themas als Titel, sonst die Art) mit `UPE_PERS` (Merkmale entschuldigt, krank und Urlaub → entschuldigt; Atemschutz).

**Daten:** Dienste in der globalen Suche, Vollexport, Auskunft je Person (Anwesenheiten).

## Modul Atemschutz (`respiratory-protection`)

Benötigt `masterdata`, nutzt optional `incidents` und `training`. Personen kommen über `PERSON_DIRECTORY`; Geräteträger sind Mitglieder mit der Qualifikation `breathing-apparatus` (CSA-Träger zusätzlich `chemical-suit`).

**Entitäten** (Schema `respiratory_protection`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `EvidenceEntity` | `evidence` | Nachweis einer Person: Art (`examination`, `stress-exercise`, `training-track`, `briefing`, `exercise`, `incident`, `chemical-suit`), Datum, bei Untersuchungen „gültig bis“, Arzt/Stelle, Einschränkungen (keine Befunde) und Gerätegruppe (bis/über 5 kg), sonst Gerät (Pressluftatmer, Regenerationsgerät, Filtergerät), Übungsanlage, kJ, bestanden, Minuten, Bemerkung, Herkunft (`manual`, `training`, `incidents`, `import`) mit Dienst bzw. Bericht, `withdrawn`. Historisiert. |
| `StatusEntity` | `status` | zuletzt bekannte Ampel je Person, um Wechsel zu melden |

**Tauglichkeit** (`evaluateFitness` in `respiratory-protection-contracts`, reine Funktion, auch im Frontend nutzbar). Maßgeblich ist das Alter am Tag des Nachweises (Intervall der Untersuchung, Mindest-kJ). Bedingungen nach FwDV 7 Nr. 6 und Anlage 4:

| Bedingung | erfüllt bis |
| --- | --- |
| Eignungsuntersuchung | „gültig bis“ der Bescheinigung, sonst Datum + Intervall (nach Alter: 36 Monate, über 50 Jahre 12 Monate, mit der Gerätegruppe „bis 5 kg“ (G 26.2) 24 Monate; oder fest 1–3 Jahre) |
| Unterweisung | Datum + 12 Monate (oder Ende des Folgejahres) |
| Belastungsübung | wie Unterweisung; zählt nur bestanden und mit mindestens 80 kJ, ab 50 Jahren 60 kJ (ohne kJ-Wert genügt „bestanden“). Ein Durchgang der Atemschutzstrecke (`training-track`) zählt ebenso |
| Einsatzübung | wie Unterweisung; ein Einsatz unter Atemschutz ersetzt sie |
| CSA-Übung | nur für CSA-Träger |
| Mindestalter | 18 Jahre (FwDV 7); bis zum 18. Geburtstag rot, angezeigt als „erst ab“ dem Geburtstag; ohne Geburtsdatum keine Prüfung, keine Frist |

- Ampel: grau ohne Qualifikation, rot wenn eine Bedingung nicht erfüllt ist, gelb wenn ein Nachweis innerhalb der Vorlaufzeit (Standard 60 Tage) abläuft, sonst grün.
- Die Regel ist die Einstellung `respiratory-protection.rule` (`FitnessRule`): Bedingungen einzeln an/aus, Zeitfenster `twelve-months` oder `calendar-year`, Mindest-kJ, Mindestalter (`minimumAge`, 18), Alter für die ältere Gruppe (`olderFromAge`, 50) und die Untersuchungsintervalle nach Alter (`examinationMonths` 36, `examinationMonthsOlder` 12, `examinationMonthsOlderLight` 24 für Geräte bis 5 kg), Intervall der Untersuchung, „Einsatz ersetzt Übung“, Vorlauf, Arbeit (`trackKilojoules`) und Dauer (`trackMinutes`) der Atemschutzstrecke. Änderungen stehen in der Historie der Einstellung.
- **Atemschutzstrecke:** eine Belastungsübung, bei der Arbeit und Dauer vorgegeben sind. Ein Durchgang (Einzelnachweis, Schnelleingabe, Dienstart mit Nachweis `training-track` oder Import) erfasst nur „bestanden“; kJ und Minuten kommen aus der Regel, solange keine eigenen Werte angegeben sind. Ohne Vorgabe in der Regel zählt ein bestandener Durchgang.
- Ausgewertet wird bei jeder Abfrage; nichts wird zwischengespeichert. Zurückgezogene Nachweise und Nachweise nach dem Stichtag zählen nicht.

**Nachweise aus anderen Modulen** (über `DomainEvents`):
- `training.session.closed`: Nachweise des Dienstes (Belastungsübung mit kJ, Unterweisung, Einsatzübung, CSA-Übung) mit den Minuten der Anwesenheit. Erneuter Abschluss ersetzt sie.
- `incidents.report.released`: je Person „unter Atemschutz“ ein Einsatz mit Datum (Alarmzeit, Ortszeit), Atemschutzminuten und Gerät (Pressluftatmer, Regenerationsgerät, Filtergerät), mit „CSA“ zusätzlich ein CSA-Nachweis. Jede Freigabe ersetzt die Nachweise des Berichts.
- `incidents.report.unlocked`: Nachweise des Berichts gelten als zurückgezogen, bis er wieder freigegeben ist.
- Nachweise aus Übungsdienst und Einsatzberichten lassen sich hier nicht ändern (`respiratory-protection.fromOtherModule`).

**Ampelwechsel.** Nach jeder Änderung von Nachweisen und einmal täglich (`FORGA_STATUS_SCHEDULER=off` schaltet das ab) vergleicht `refresh` die Ampeln mit `status` und sendet `respiratory-protection.status.changed` (Person, alte und neue Farbe). Wechselt eine Person von Grün, Gelb oder Grau auf Rot, geht eine [Benachrichtigung](#fristen-und-aufgaben) an alle mit `respiratory-protection.notify` in ihrer Stammabteilung (Atemschutzgerätewart, Abteilungskommandant). Die erste Ampel einer Person löst keine aus.

**Für andere Module.** `RESPIRATORY_PROTECTION_FITNESS` (`FitnessLookup.colors(personIds, date)`) liefert die Ampel zu einem Datum. Einsatzberichte nutzen es optional für die Prüfregel `breathing-not-fit`: eine Person mit Qualifikation ist unter Atemschutz eingetragen, ihre Ampel war am Einsatztag rot (Warnung).

**Schnittstelle**

| Methode und Pfad | Recht | Zweck |
| --- | --- | --- |
| `GET /api/respiratory-protection/status?departmentId` | `read` | Ampel aller sichtbaren Geräteträger mit Bedingungen und nächster Fälligkeit |
| `GET /api/respiratory-protection/persons/:personId` | `read` | Ampel und Nachweise einer Person; Untersuchungen nur mit `examinations` |
| `POST /api/respiratory-protection/evidence` | `evidence`, Untersuchungen `examinations` | Nachweis erfassen |
| `POST /api/respiratory-protection/evidence/quick` | `evidence` | ein Nachweis für mehrere Personen |
| `PUT`/`DELETE /api/respiratory-protection/evidence/:id` | wie Erfassen | nur erfasste und importierte Nachweise |

Die Rechte gelten je Abteilung der Person. `respiratory-protection.notify` (E-Mail beim Wechsel auf Rot) haben Atemschutzgerätewart und Abteilungskommandant. Der Atemschutzgerätewart hat `read`, `evidence` und `examinations` für alle Abteilungen und stellt die Regel ein (`respiratory-protection.settings.manage`).

**Listen:** Atemschutztauglichkeit (Ampel und Fälligkeit je Bedingung, Filter Abteilung und Farbe), fällige Eignungsuntersuchungen (nur mit `examinations`), Atemschutznachweis einer Person (FwDV 7, mit Unterschriftsspalte), Einsatzzeiten unter Atemschutz je Jahr, Planung Übungsstrecke (ohne Belastungsübung im laufenden Jahr), fehlende Nachweise im laufenden Jahr (Unterweisung, Belastungsübung, Übung/Einsatz seit 1. Januar; „fehlt“ mit dem letzten Datum, nicht verlangte Bedingungen leer).

**Fristen:** je Geräteträger und Bedingung eine Frist zum Ablaufdatum (fehlende Nachweise: heute) mit der Vorlaufzeit der Regel; Untersuchungen für `examinations`, sonst für `evidence`. Dieselben Fristen bekommt der Geräteträger selbst (`breathing-apparatus-own-…`, nur der mit ihm verknüpfte Benutzer mit `respiratory-protection.self`): in der Aufgabenliste und der wöchentlichen E-Mail, der Link führt nach „Mein Bereich“ (Gegenstand `core.me`).

**Importe:** `respiratory-protection.examinations` (Recht `examinations`): Untersuchungen mit Personalnummer oder Name, Datum, „gültig bis“, Arzt/Stelle, Einschränkungen. `respiratory-protection.stress-exercises` (Recht `evidence`): Durchgänge einer Atemschutzübungsanlage mit Personalnummer oder Name, Datum, kJ, optional bestanden (ja/nein), Minuten und Anlage; ohne „bestanden“ entscheidet die kJ-Grenze der Regel; eine Art mit „Strecke“ ergibt einen Durchgang der Atemschutzstrecke mit kJ und Minuten aus der Regel. Beide aktualisieren einen Eintrag derselben Person am selben Tag. Datenübernahme (`imports/evidence.transfer.ts`) aus `PER_PRUEF` aktueller Mitglieder: Prüfungen mit „G26“ im Namen → Untersuchungen (gültig bis, Ort als Arzt/Stelle), „AS-Strecke“ → Atemschutzstrecke, andere „Belastungsübung“ → Belastungsübung (bestanden aus `PER_PRUEF_OK`).

**Daten:** Vollexport und Auskunft je Person (Nachweise).

## Modul Entschädigungen (`compensation`)

Benötigt `masterdata`, nutzt optional `incidents` und `training`. Ersetzt `auswertung.py`: Aus freigegebenen Einsätzen, abgeschlossenen Diensten, Funktionspauschalen und Posten von Hand entstehen Auszahlungsläufe für die Kämmerei. Die Beträge der Einsätze rechnet der Einsatzbericht mit den Sätzen der Satzung aus diesem Modul; das Modul übernimmt sie mit der Freigabe.

**Entitäten** (Schema `compensation`, alle historisiert):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `ItemEntity` | `item` | Posten: Person, Abteilung (Einsatz- bzw. Dienstabteilung, sonst Stammabteilung), Quelle (`incident`, `training`, `function`, `manual`, `duty`, `course`) mit Bericht/Dienst/`<jahr>:<funktion>`/Sonderdienst/Lehrgangsteilnahme, Bezeichnung, Art (`compensation`, `loss-of-earnings`, `flat-rate`, `expenses`), Datum, von–bis, Stunden, Satz, Betrag (`null` bis der Verdienstausfall bekannt ist), Arbeitszeit „(AZ)“, `correction`, Begründung, Lauf |
| `RunEntity` | `run` | Auszahlungslauf: Nummer `JJJJ-nn`, Zeitraum, Status (`draft`, `closed`, `handed-over`, `paid`), Abschluss, Übergabe, Auszahlung |
| `FunctionHolderEntity` | `function_holder` | Inhaber einer Funktion mit Pauschale, mit Zeitraum |

**Posten aus anderen Modulen** (`DomainEvents`):
- `incidents.report.released` trägt je Person Zeiten, Stunden, Satz und Betrag des Berichts, Arbeitszeit und Verdienstausfall. Daraus entsteht je Person ein Entschädigungsposten (bei Arbeitszeit 0 € mit „(AZ)“, höchstens `maxPerService`), bei Verdienstausfall ein Posten ohne Betrag und bei mehr als `refreshment.afterHours` Stunden der Erfrischungszuschuss als Pauschalposten, wenn die Satzung einen Betrag nennt (`incidentPayout` in den Verträgen).
- `masterdata.course.passed`: Nennt die Satzung für den Lehrgang eine Pauschale (`courseAllowances`, gültig am Lehrgangsende), entsteht ein Pauschalposten „Lehrgangspauschale …“ (Quelle `course`). Der Antrag gilt mit dem Eintrag des bestandenen Lehrgangs als gestellt.
- `incidents.duty.changed`: je Sonderdienst ein Pauschalposten (Quelle `duty`, z. B. „Einsatzleiter vom Dienst (EvD) (3 Tage)“) mit dem Betrag des Dienstplans; ein gelöschter Dienst entfernt ihn bzw. bucht ihn zurück, wenn er schon ausgezahlt ist.
- `training.session.closed`: je anwesender Person Stunden (Rundung der Einstellung) × Satz für Übungsdienst bzw. Brandsicherheitswache, gültig am Tag des Dienstes, höchstens `maxPerService`. Arten ohne Entschädigung ergeben keine Posten. Fehlt der Satz für den Tag, bleibt der Betrag offen (Hinweis „Betrag fehlt“, verhindert den Abschluss) und wird im Lauf eingetragen.
- `training.session.reopened`: offene Posten des Dienstes verschwinden, ausgezahlte werden zurückgebucht.
- Jede erneute Freigabe bzw. jeder erneute Abschluss bringt die Posten der Quelle auf den neuen Stand (`ItemsService.apply`): Offene Posten werden ersetzt; ein eingetragener Verdienstausfall bleibt. Ist ein Betrag schon in einem abgeschlossenen Lauf, entsteht ein **Korrekturposten** mit der Differenz für den nächsten Lauf; fällt eine Person weg, wird ihr Betrag zurückgebucht. Abgeschlossene Läufe bleiben unverändert.
- **Vorhandene Daten übernehmen:** `POST /api/incidents/reports/republish` und `POST /api/training/sessions/republish` (`{ from, to }`, Freigabe- bzw. Abschlussrecht für die Gesamtwehr) senden die Ereignisse für freigegebene Berichte bzw. abgeschlossene Dienste eines Zeitraums erneut, z. B. nach dem Einrichten des Moduls. Das ist wiederholbar, ohne Posten zu verdoppeln.

**Funktionspauschalen** (§ 16 Abs. 2 FwG): Die Pauschalen stehen in der Einstellung (Vorlage Satzung Musterstadt 2026), die Inhaber mit Zeitraum im Modul. Ist einer Pauschale ein Amt der Personalakte zugeordnet (`office`, optional nur für `departmentIds`, z. B. Abteilungskommandant der Kernstadt bzw. der Teilorte), kommen ihre Inhaber aus den Ämtern der Stammdaten (`PERSON_DIRECTORY.offices`); in der Liste stehen sie als „aus den Ämtern der Personalakte“, Inhaber von Hand sind dann abgelehnt (`compensation.functionFromOffices`). Ohne Zuordnung (Standard) pflegt das Modul die Inhaber selbst. `POST /api/compensation/functions/generate { year }` erzeugt je Funktion und Person einen Posten zum 31.12. – anteilig nach Monaten oder voll für den Inhaber am 31.12. (`functionSplit`) – und meldet Funktionen mit mehr Inhabern als erlaubt.

**Auszahlungslauf** (`compensation.runs`):
- Anlegen mit Zeitraum: Der Lauf übernimmt alle Posten bis zum Ende des Zeitraums, die in keinem Lauf sind (auch ältere). Es gibt höchstens einen Entwurf; „Neue Posten übernehmen“ ergänzt ihn.
- Prüfung: Betrag fehlt (verhindert den Abschluss), Zeit fehlt, Arbeitszeit mit Betrag oder Verdienstausfall, doppelt (gleicher Beginn), Überschneidung (Aneinandergrenzen erlaubt, Zeiträume über 24 h zählen nicht), keine Bankverbindung; im Entwurf außerdem Einsatzberichte des Zeitraums, die noch nicht freigegeben sind (`report-not-released`, nur Hinweis: ihre Posten fehlen im Lauf), über `INCIDENTS_LOOKUP.unreleased(from, to)`. Hinweise aus der Satzung, ohne den Abschluss zu verhindern: Erfrischungszuschuss prüfen (Einsatz über `refreshment.afterHours` Stunden, Satzung ohne Betrag, `refreshment`), mehrtägiger Einsatz mit Einzelabrechnung und dem Satz für Haushaltsführende (`multi-day`), Höchstbetrag je Person und Tag überschritten (`above-day-maximum`).
- Abschließen schreibt die Posten fest und sendet `compensation.run.completed`; Posten von Personen mit negativer Summe (Rückbuchungen nach einer Auszahlung) bleiben offen und werden mit späteren Beträgen verrechnet (Hinweis `negative-total`); danach „An Kämmerei übergeben“ und „Ausgezahlt“. Ein Entwurf lässt sich löschen; seine Posten kommen in den nächsten Lauf.
- Ausgaben: Abrechnungen als PDF-Brief mit einer Seite je Person (`GET …/runs/:id/statements.pdf`, optional `?departmentId=` für die Personen einer Stammabteilung: Anschrift, Zeitraum, Posten mit Stunden, Satz und Betrag, Summe, Konto mit den letzten vier Stellen), Excel (`GET …/runs/:id/export.xlsx`: Betrag pro Person, Summe je Abteilung, Posten, Hinweise, Verdienstausfall je Arbeitgeber), Überweisungsdatei (`…/transfer.csv`: Name, IBAN, Betrag, Verwendungszweck), SEPA-Datei für das Online-Banking (`…/transfer.xml?executionDate=`, pain.001.001.09, `sepa.ts` in den Contracts: Auftraggeber aus der Einstellung `payer`, IBAN mit Prüfziffer, Texte im SEPA-Zeichensatz; abgelehnt ohne Auftraggeber (`compensation.payerMissing`), für einen Entwurf oder wenn Personen keine gültige IBAN haben (`compensation.invalidIban` mit Namen)), Abrechnungsübersicht als Liste.
- Bankverbindung, Anschrift und Arbeitgeber liefert `PersonDirectory.paymentDetails` der Stammdaten (nur auf dem Server).
- **Abtretung des Verdienstausfalls:** Ist am Arbeitgeber in der Personalakte „Verdienstausfall abgetreten ab“ gesetzt (mit IBAN des Arbeitgebers), gehen die Verdienstausfall-Posten ab diesem Datum nicht an die Person, sondern an den Arbeitgeber: eigene Überweisung je Arbeitgeberkonto in CSV und SEPA-Datei (Verwendungszweck „… – Verdienstausfall“), Hinweis in der Abrechnung der Person.

**Weitere Schnittstellen:** `GET /api/compensation/items?open=true` (offene Posten sichtbarer Personen), `GET …/persons/:personId/items?year`, `POST …/items` (von Hand, `compensation.items.manual`, Begründung Pflicht, negativ für Korrekturen), `PUT …/items/:id/amount` (Verdienstausfall eintragen), `DELETE …/items/:id` (offene Posten von Hand), `GET …/year-totals?year`, Vorschau mit `compensation.settings.manage`: `GET …/preview/reports?from&to` (`INCIDENTS_LOOKUP.inPeriod`) und `POST …/preview { incidentId, settings }` (`INCIDENTS_LOOKUP.compensationPreview` rechnet den Einsatz mit den übergebenen Sätzen, Rundung und Mindestdauer, das Modul ergänzt Höchstbetrag und Hinweise).

**Rechte:** `compensation.read` je Abteilung (Posten der Mitglieder), `compensation.runs`, `compensation.items.manual` und `compensation.settings.manage` für die Gesamtwehr. Die Rolle Verwaltung/Kasse hat alle.

**Einstellung** `compensation.general` (Satzung, Vorlage Musterstadt 2026): Stundensätze für Dienste und für Einsätze (Einsatz, Bereitschaft im Gerätehaus, Brandsicherheitswache) mit Gültig-ab, je mit Rundung, Mindestdauer eines Einsatzes (`incidentMinimumHours`, nicht für Bereitschaft; Zeitbasis sind die Zeiten des Berichts, Alarmierung bis Wiederherstellung der Einsatzbereitschaft), Erfrischungszuschuss (ab mehr als 4 h, Betrag leer, solange die Satzung keinen nennt), mehrtägige Einsätze (ab mehr als 2 Kalendertagen) mit Stundensatz für Haushaltsführende (15 €), Lehrgangspauschalen je Lehrgang der Stammdaten (Truppmann Teil 1 150 €, Truppführer 70 €, Atemschutzgeräteträger 60 €, Sprechfunker 30 €, Maschinisten 70 €), Höchstbeträge je Einsatz oder Dienst und je Person und Tag (leer: keine), Funktionspauschalen mit Höchstzahl, Aufteilung bei Wechsel, steuerfreie Beträge (3.000 € im Jahr, 250 € im Monat, R 3.12 LStR) und Verwendungszweck.

**Sätze für Einsätze (E4):** Ist das Modul aktiv, rechnet der Einsatzbericht mit den Einsatz-Sätzen, der Rundung und der Mindestdauer aus `compensation.general` (`COMPENSATION_STATUTE` aus den Verträgen, vom Einsatzbericht optional eingebunden); die Sätze in `incidents.general` gelten nur ohne das Modul. Vorhandene Sätze übernimmt die Migration `incident_rates` der Entschädigungen. Die Einstellungen der Einsatzberichte zeigen dann statt der Sätze einen Verweis (Erweiterungspunkt `incidents.settings.rates`).

**Listen:** Abrechnungsübersicht (Posten je Person mit Anschrift eines Laufs oder Jahres, „(AZ)“ und Korrekturen markiert), Jahressummen je Person nach Art mit Hinweis auf die steuerfreien Beträge (Verdienstausfall und Auslagen zählen dafür nicht).

**Fristen:** Verdienstausfall ohne Betrag für alle mit `compensation.runs`. **Daten:** Vollexport und Auskunft je Person (Posten, Funktionen).

## Modul Geräte (`equipment`)

Benötigt `masterdata`, nutzt optional `incidents`. Fahrzeuge, Wachen und Abteilungen kommen über `ORGANIZATION`; Abteilungen, Wachen und Fahrzeuge mit Geräten lassen sich nicht löschen (`ORGANIZATION_REFERENCES`).

**Entitäten** (Schema `equipment`, historisiert außer der Verwendung im Bericht):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `CategoryEntity` | `category` | Kategorie mit Schlüssel, Name, übergeordneter Kategorie, Erfassung als Einzelstück oder Bestand (`tracking`), Kennzeichen Atemschutz |
| `EquipmentTypeEntity` | `equipment_type` | Gerätetyp mit Hersteller, Modell, Eigenschaften (z. B. Länge) und Prüfarten |
| `EquipmentItemEntity` | `item` | Gerät: Inventarnummer (eindeutig), Typ, Kategorie, Seriennummer, Barcode und RFID-Chip (je eindeutig, wenn gesetzt), Hersteller, Baujahr, Beschaffung, Eigenschaften, Abteilung, Fahrzeug mit Beladeplatz oder Wache, Menge (Bestand), Ablaufdatum, eigene Prüfarten, Status, fällig gesetzte Prüfungen (`triggered`), Aussonderung, `forVehicleId` |
| `InspectionEntity` | `inspection` | Prüfung: Prüfart, Datum, Prüfer (Person oder Firma), Ergebnis, Checkliste, Messwerte, nächste Fälligkeit, Hinweis auf fehlende Qualifikation |
| `DefectEntity` | `defect` | Mangel mit Beschreibung, Status (`reported`, `in-progress`, `fixed`, `retired`), Erledigung |
| `UsageEntity` | `usage` | im Einsatzbericht verwendete Geräte und Verbrauchsmaterial mit Menge und „nach Einsatz prüfen“ |

**Prüfarten** (`InspectionType`): Name, Intervall in Monaten, Anlass (`periodic`, `after-use`, `after-incident`, `after-washing`), Prüfer (`user`, `competent-person`, `fall-protection-expert`, `electrician`, `expert`), Checkliste. Ein Gerät übernimmt die Prüfarten seines Typs oder hat eigene.

**Fälligkeit** (`computeDues` in `equipment-contracts`, reine Funktion): regelmäßige Prüfungen nach letzter Prüfung + Intervall (oder dem dort gesetzten Datum), ohne Prüfung sofort fällig; Prüfungen „nach …“ erst, wenn sie nach der letzten Prüfung ausgelöst wurden (`POST …/items/:id/trigger`, bei Freigabe eines Einsatzberichts automatisch).

**Vorlage DGUV Grundsatz 305-002:** `POST /api/equipment/templates/dguv` ergänzt fehlende Kategorien und rund 25 Gerätetypen mit Prüfarten und Prüfern (Tabelle 1, Ausgabe 2021), darunter Pressluftatmer, Vollmaske, Atemluftflasche, Schläuche, Leitern, hydraulisches Rettungsgerät, Stromerzeuger, Feuerlöscher, Funk und Feuerwehrfahrzeug (Prüfung nach DGUV 305-002, HU, Sicherheitsprüfung, DGUV Vorschrift 70). `POST /api/equipment/vehicles/sync` legt für jedes Fahrzeug der Stammdaten ein Gerät dieses Typs an.

**Prüfung** (`equipment.inspect` in der Abteilung des Geräts): `POST …/items/:id/inspections`; Sammelprüfung `POST /api/equipment/inspections/bulk` für viele Geräte einer Prüfart. Prüft eine Person als befähigte Person, wird ihre Qualifikation geprüft (Gerätewart, bei Atemschutz Atemschutzgerätewart); fehlt sie, trägt die Prüfung einen Hinweis. „Nicht bestanden“ setzt das Gerät auf defekt und legt einen Mangel an.

**Mängel:** Jedes Mitglied mit `equipment.defects.report` in der Abteilung meldet über die Geräteseite (QR-Code) einen Mangel (`POST …/items/:id/defects`, Ereignis `equipment.defect.reported`). Eine [Benachrichtigung](#fristen-und-aufgaben) geht an alle mit `equipment.defects.notify` in der Abteilung des Geräts (Gerätewart). Der Gerätewart setzt ihn auf „in Bearbeitung“ (Gerät in Reparatur) und „behoben“ (Gerät wieder einsatzbereit, wenn kein weiterer Mangel offen ist).

**Aussonderung** (`POST …/items/:id/retire`): Datum, Grund, Verbleib; offene Mängel werden mit ausgesondert. Ausgesonderte Geräte bleiben mit Historie erhalten, erscheinen aber nicht in Listen und Fristen.

**Einsatzbericht:** Der Erweiterungspunkt `incidents.report.sections` zeigt im Abschnitt „Beteiligte & Sonstiges“ eine Karte „Geräte“: Geräte der Fahrzeuge des Berichts und Bestand (Verbrauchsmaterial mit Menge), je Gerät „nach Einsatz prüfen“ (`GET/PUT /api/equipment/reports/:reportId/usage`). Stehen Personen eines Fahrzeugs unter Atemschutz, schlägt die Karte je Gerätetyp der Atemschutz-Kategorien (Pressluftatmer, Maske, Flasche …) so viele Geräte dieses Fahrzeugs vor, wie dort Personen unter Atemschutz waren („Übernehmen“ trägt sie mit „nach Einsatz prüfen“ ein). Dazu übergibt der Bericht dem Erweiterungspunkt `breathingVehicleIds`. Mit der Freigabe des Berichts werden für markierte Geräte die Prüfungen „nach Gebrauch“ und für alle Geräte der Fahrzeuge die Prüfungen „nach Einsatz“ fällig. Andere Module lesen die Verwendung über `EQUIPMENT_USAGE`.

**Übungsdienst:** Über `training.session.sections` hat jeder Dienst einen Reiter „Geräte“ mit den Geräten der Abteilungen des Dienstes und „nach Gebrauch prüfen“ (`GET/PUT /api/equipment/sessions/:sessionId/usage`, ändern mit `training.attendance` oder `training.plan`). Mit dem Abschluss des Dienstes (`training.session.closed`) werden für markierte Geräte die Prüfungen „nach Gebrauch“ fällig. Die Verwendung steht in `equipment.usage` mit `source` (`incidents` oder `training`). Umgekehrt listet `GET /api/equipment/items/:id/incidents` (`equipment.read`) die Einsatzberichte, in denen das Gerät steht, mit Einsatz, Ort, Menge und „nach Einsatz prüfen“, über `INCIDENTS_LOOKUP.reports(reportIds)`; ohne Modul Einsatzberichte ist die Liste leer.

**Rechte:** `equipment.read`, `equipment.write`, `equipment.inspect`, `equipment.defects.report`, `equipment.defects.notify` (E-Mail bei neuen Mängeln) je Abteilung, `equipment.settings.manage` für Kategorien und Typen. Der Gerätewart hat alles in allen Abteilungen, der Atemschutzgerätewart liest und prüft in allen Abteilungen.

**Listen:** fällige Prüfungen (mit Unterschriftsspalte), Inventarliste, Beladeliste je Fahrzeug, Prüfhistorie, Prüfprotokoll (`equipment.inspection-report`: eine Prüfung über `inspectionId` oder alle Prüfungen eines Tages, mit Checkliste, Messwerten, Prüfer und Unterschriftsspalte), offene Mängel, ausgesonderte Geräte, Bestand. **Fristen:** jede Prüfart eines Geräts (Vorlauf 30 Tage, für `equipment.inspect`), Ablaufdatum (60 Tage, `equipment.write`), gemeldete Mängel; Prüfungen und Ablauf in der wöchentlichen E-Mail gruppiert nach Kategorie und Fahrzeug. **Import** `equipment.inventory`: Inventar mit Abteilung, Fahrzeug, Beladeplatz, Menge, Barcode, RFID-Chip und letzter Prüfung (fehlen die Spalten für die Codes, bleiben die gespeicherten; ein Code eines anderen Geräts ergibt `codes.taken`). **Suche** nach Inventar-, Seriennummer, Bezeichnung, Barcode und RFID-Chip; **Code-Suche** (siehe unten) zusätzlich über die URL des QR-Etiketts; Vollexport.

## Modul Kostenersatz (`cost-recovery`)

Benötigt `masterdata` und `incidents`, nutzt optional `equipment`. Aus einem kostenpflichtigen Einsatz (Haken „kostenpflichtig“ im Bericht) entsteht ein Kostenbescheid nach § 34 FwG, VOKeFw und Satzung. Die Zahlungsüberwachung bleibt bei der Kämmerei.

**Daten aus den Einsatzberichten** über `INCIDENTS_LOOKUP` (`incidents-contracts`): `chargeable(from, to)` liefert Einsätze mit kostenpflichtigem Bericht (Objekt, Hauptart, Fehlalarmart, freigegeben), `forCostRecovery(id)` die Berichte mit Personal und Zeiten, Fahrzeugen mit Ausrück- und Rückkehrzeit und Beteiligten, `reports(ids)` Berichte mit Nummer, Status und Einsatz (Geräteakte), `unreleased(from, to)` nicht freigegebene Berichte eines Zeitraums (Auszahlungslauf).

**Entitäten** (Schema `cost_recovery`, historisiert): `NoticeEntity` (`notice`: Aktenzeichen `KE-JJJJ-nnn`, Einsatz, Tatbestand, Kostenschuldner, Positionen, Begründung, Rechtsbehelfsbelehrung, Kassenzeichen, Status, Erlass, Fälligkeit, das erlassene PDF, Widerspruch, Aufhebung, Zahlung) und `AddressBookEntity` (`address_book`: häufige Kostenschuldner).

**Einstellung** `cost-recovery.general`: Tatbestände (Katalog, Vorlage § 34 Abs. 1 Satz 2 Nr. 1–7 und Abs. 2 FwG), Fahrzeugsätze je Kostenersatz-Kategorie mit Gültig-ab (Vorlage VOKeFw vom 18.03.2016, gültig ab 26.04.2016, VOKeFw vom 11.03.2024, gültig ab 19.03.2024, örtliche Sätze wie für ein LF 8/6 werden ergänzt), Personalsätze nach der örtlichen Satzung (ohne Vorgabe), Material mit Preis, Takt (`rounding`) und eigener Takt für Fahrzeuge (`vehicleRounding`), Bereitschaft berechnen (`chargeStandby`, Standard nein), Behörde, Satzung (ohne Vorgabe), Rechtsgrundlage ohne Tatbestand (`defaultLegalBasis`, § 34 FwG), Landesverordnung (`regulation`, VOKeFw) und Hinweis zur Gesamtschuld (`jointLiability`; leer = entfällt), Bankverbindung, Haushaltsstelle, Zahlungsfrist, Unterschrift und die Textbausteine für Begründung (mit `{date}`, `{location}`, `{basis}`) und Rechtsbehelfsbelehrung.

**Berechnung** (`calculation.ts` in den Contracts):
- Takt: `half-then-hour` (bis 30 Minuten eine halbe Stunde, darüber angefangene Stunden, wie manche Kostenersatzsatzungen zählen), `started-half-hour` oder `started-hour`.
- Personal je Bericht und Personalart: Summe der Stunden der eingesetzten Personen (ohne Bereitschaft auf der Wache) × Satz am Einsatztag. Die Art kommt aus der Beschäftigung in der Personalakte: Ehrenamt, Hauptamt nach Laufbahn (mittlerer, gehobener, höherer Dienst mit eigenem Satz, sonst der allgemeine Hauptamt-Satz), Feuerwehrangestellte zum allgemeinen Hauptamt-Satz; bei Stichworten mit Entschädigungsart `fire-watch` alle zum Satz Brandsicherheitswache. Fehlt ein Satz, steht „kein Satz“ in der Position.
- Fahrzeuge: Ausrücken bis Rückkehr des Fahrzeugs (sonst die Zeiten des Berichts) × Satz der Kategorie (Kostenersatz-Kategorie am Fahrzeug, sonst Fahrzeugtyp). „als MTW“ stellt eine Position auf den MTW-Satz um.
- Material: Verbrauchsmaterial aus dem Abschnitt „Geräte“ des Berichts mit dem Preis aus der Einstellung.
- Fehlt ein Satz, steht die Position mit 0 € und „kein Satz“ da; der Bescheid lässt sich so nicht erlassen (`cost-recovery.rateMissing`).
- Jede Abweichung vom berechneten Betrag braucht eine Begründung (`cost-recovery.reasonMissing`); Positionen von Hand (Material, Kosten Dritter, anderer Feuerwehren, Pauschalen) sind frei.
- Vorschläge: Tatbestand aus der Fehlalarmart (BMA → Nr. 6, böswillig → Nr. 5) bzw. Brandsicherheitswache → Abs. 2; Kostenschuldner aus den Beteiligten mit Rolle Verursacher, Halter oder Eigentümer, Anschrift aus dem Adressbuch, wenn der Name passt.

**Ablauf:** `draft` → `review` (`cost-recovery.write`) → `issued` (`cost-recovery.issue`: Fälligkeit nach Zahlungsfrist, PDF wird erzeugt und unveränderlich gespeichert, Ereignis `cost-recovery.notice.issued`) → `handed-over` → `paid`. Widerspruch mit Datum und Ergebnis (offen, abgeholfen → aufgehoben, zurückgewiesen → wieder bei der Kämmerei). Aufheben mit Begründung (Verzicht bei unbilliger Härte oder öffentlichem Interesse). Nur Entwurf und Prüfung sind änderbar; „Neu berechnen“ im Entwurf behält Positionen von Hand. **Änderungsbescheid:** Zu einem erlassenen, übergebenen oder angefochtenen Bescheid legt `amend` einen Entwurf mit Aktenzeichen `…-Ä1`, `…-Ä2` an (Kopie mit Verweis, höchstens einer offen). Mit seinem Erlass wird der ursprüngliche Bescheid `amended` (bleibt als Dokument, zählt aber in Listen und bei kostenpflichtigen Einsätzen nicht mehr); das PDF heißt „Änderungsbescheid“ und nennt den ersetzten Bescheid.

**PDF** (`renderLetterPdf` im Core): Briefkopf aus den Einstellungen (sonst Wappen), Behörde, Datum, Aktenzeichen, Kassenzeichen, Kostenschuldner, Einsatz, Rechtsgrundlage (Tatbestand, VOKeFw, Satzung), Positionstabelle, Gesamtbetrag, Fälligkeit und Bankverbindung, Hinweis auf Gesamtschuld bei mehreren Schuldnern, Begründung, Rechtsbehelfsbelehrung, Unterschrift. Vor dem Erlass gibt es eine Vorschau.

**Schnittstelle:** `GET /api/cost-recovery/candidates?from&to`, `GET|POST /api/cost-recovery/notices`, `GET|PUT …/notices/:id`, `POST …/notices/:id/(recalculate|submit|return|issue|hand-over|paid|objection|cancel|amend)`, `GET …/notices/:id/pdf`, `GET /api/cost-recovery/export` (Sollstellung erlassener Bescheide oder `?ids=…` im Format der Einstellung `handover`: Excel oder CSV mit Semikolon und UTF-8, Spalten und Reihenfolge wählbar aus Aktenzeichen, Kassenzeichen, Schuldner, Anschrift, Betrag, Fälligkeit, Erlassdatum, Haushaltsstelle, Einsatz), Adressbuch `…/debtors`. **Tatbestand im Einsatzbericht:** Über `incidents.report.sections` zeigt ein kostenpflichtiger Bericht die Karte „Kostenersatz“ mit der Auswahl des Tatbestands (`GET|PUT /api/cost-recovery/incidents/:incidentId/offense`, ändern mit dem Schreib- oder Freigaberecht für Berichte oder `cost-recovery.write`; Tabelle `incident_offense`, historisiert). Der gewählte Tatbestand geht dem Vorschlag aus Stichwort und Statistik vor, in der Liste der kostenpflichtigen Einsätze und beim Anlegen des Bescheids. **Import** `cost-recovery.payments` (Recht `write`): Zahlungseingänge der Kämmerei mit Aktenzeichen oder Kassenzeichen, Datum und optional Betrag setzen offene Bescheide auf bezahlt; Teilzahlungen, unbekannte und nicht offene Bescheide werden gemeldet und nicht übernommen. Rechte für die Gesamtwehr: `read`, `write`, `issue`, `settings.manage`.

**Listen:** kostenpflichtige Einsätze ohne Bescheid, offene Bescheide, Bescheide je Jahr mit Summen je Tatbestand, BMA-Fehlalarme je Objekt.

## Modul Beförderungen (`promotions`)

Benötigt `masterdata`. Das System schlägt vor, wer zum Stichtag die Voraussetzungen für den nächsten Dienstgrad erfüllt; Menschen entscheiden. Die Regeln sind Konfiguration, nicht Code (Lehre aus FeuerON).

**Daten aus den Stammdaten** über `PERSON_DIRECTORY`: `careers(ids?)` liefert Status, Abteilungen, Eintritt, Ende der Probezeit, Musiker, Dienstgrade mit Datum, Qualifikationen mit Erwerbsdatum (auch abgelaufene), Ämter mit Zeitraum und Ruhezeiten; `recordPromotion(personId, { rank, since, notes })` trägt einen Dienstgrad in die Akte ein. Die Rangfolge der Dienstgrade kommt aus dem Katalog (`ORGANIZATION.catalog('rank')`, Attribut `level`). Personen in Probezeit ohne Dienstgrad zählen als `probation`; ohne Dienstgrad-Eintrag gilt der Eintritt als Beginn der Dienstzeit im Dienstgrad.

**Regeln** (Einstellung `promotions.general`, `rules.ts` in den Contracts): je Regel Schlüssel, Ziel-Dienstgrad, Beschreibung (`LocalizedText`), aktiv und ein Bedingungsbaum aus `and`/`or` mit den Bausteinen `rank` (aktueller Dienstgrad ist einer von), `years-in-rank`, `min-interval` (Abstand zur letzten Beförderung), `years-since-joining`, `qualification` (einer der Lehrgänge), `probation-ended`, `musician`, `office` (eines der Ämter aktuell oder auch früher innegehabt, optional mindestens `years` lang) und `population` (Einwohner der Gemeinde aus den Einstellungen `brigade`; mit `scope: 'department'` die des Ortsteils der Stammabteilung, wenn dort angegeben). Dazu Vorschau in Monaten (Standard 3), Text, Ort und Unterschrift der Urkunden.

**Wer befördert werden kann:** Mitglieder mit einem Status aus `eligibleStatuses` (Einstellung `promotions.general`, Standard aktiv und in der Probezeit).

**Vorlage VwV Feuerwehrbekleidung und Dienstgrade 2022, Anlage 2** (`VWV_2022_RULES`): FM (Probezeit beendet, Truppmann Teil 1 bzw. Musiker-Grundausbildung), OFM, HFM, LM (Gruppenführer, auch als Sprung), OLM, HLM, BM (Zugführer, auch als Sprung), OBM, HBM (nur über 15.000 Einwohner) mit Musiker-Pfaden und jeweils einem Jahr Mindestabstand. LHBM nur für den amtierenden Kommandanten (`office` `commander`) einer Gemeinde über 15.000 Einwohnern. Die Musiker-Lehrgänge (`music-basic`, `music-d2`, `music-d3`, `music-c1`, `music-c2`) zählen, sobald es sie im Qualifikationskatalog gibt.

**Auswertung** (`evaluate.ts`, Unit-Tests in `evaluate.spec.ts`): Jede Bedingung sagt, ob sie am Stichtag erfüllt ist und ab wann (Zeitbedingungen, Lehrgänge mit Datum). Ein `and` ist ab der spätesten, ein `or` ab der frühesten Bedingung erfüllt. Ruhezeiten der Personalakte verlängern die Zeitbedingungen (`years-in-rank`, `min-interval`, `years-since-joining`) um ihre Tage innerhalb der Dienstzeit; während einer Ruhezeit ohne Ende ist der Zeitpunkt offen (`serviceEnd`). Relevant sind aktive Regeln mit höherem Ziel-Dienstgrad, deren `rank`-Bedingung zum aktuellen Dienstgrad passt. Ergebnis je Person: **erfüllt**, **demnächst** (bis Stichtag + Vorschau), **offen** mit den fehlenden Bedingungen der zuerst erfüllbaren Möglichkeit, oder **ausgeschlossen**. Bei mehreren erfüllten Regeln gewinnt der höchste Ziel-Dienstgrad (Sprung), bei offenen die zuerst erfüllbare. Ausgewertet werden aktive Mitglieder und Personen in Probezeit.

**Entitäten** (Schema `promotions`, historisiert): `PromotionListEntity` (`promotion_list`: Bezeichnung, Stichtag, wirksam ab, Status, Einträge als JSON, Bemerkungen, Beschluss mit Datum und Person, Durchführung) und `ExclusionEntity` (`exclusion`: Person, von, bis oder offen, optional nur für einen Ziel-Dienstgrad, Grund, angelegt von). Ein Ausschluss für einen Dienstgrad gilt nur, wenn die nächste Beförderung der Person zu diesem Dienstgrad führt.

**Ablauf einer Beförderungsliste:**
1. Anlegen (`promotions.decide`) mit Stichtag und Datum der Wirksamkeit: Erfüllte werden mit *befördern* übernommen, Personen der Vorschau mit *zurückgestellt*. Ausgeschlossene stehen nicht auf der Liste; solange sie ein Entwurf ist, liefert `GET …/lists/:id` sie unter `excluded` (Personen, die nach den Regeln zum Stichtag erfüllt oder in der Vorschau wären), mit Zeitraum und Grund des Ausschlusses nur für `promotions.exclude`.
2. Vorschläge: Abteilungskommandanten (`promotions.propose`) entscheiden für ihre Abteilungen *befördern*, *zurückgestellt* oder *nicht befördern* (mit Begründung) und kommentieren; sie sehen nur Einträge ihrer Abteilungen. Der Kommandant kann Beförderungen außerhalb der Regel mit Begründung hinzufügen (nur auf einen höheren Dienstgrad). „Neu prüfen“ wertet erneut aus und behält Entscheidungen und Kommentare.
3. Beschluss mit Datum (nach Anhörung des Ausschusses): Die Liste ist danach unveränderlich, „Wieder öffnen“ hebt den Beschluss auf.
4. Durchführung: Alle Einträge *befördern* werden mit dem Datum der Wirksamkeit und der Bezeichnung der Liste als Bemerkung in die Personalakten eingetragen; Ereignis `promotions.list.executed`. Hat sich ein Dienstgrad seit der Auswertung geändert, wird abgelehnt (`promotions.rankChanged`). Eine durchgeführte Liste ist nicht löschbar.

**Urkunden** als Serien-PDF (`renderCertificatesPdf` im Core, eine Seite je Person mit Wappen, Name der Feuerwehr, Name, Text mit `{date}`, `{rank}`, `{name}`, Ort und Datum des Beschlusses, Unterschrift) für beschlossene und durchgeführte Listen, gesamt oder je Person.

**Schnittstelle:** `GET /api/promotions/candidates?on`, `GET /api/promotions/persons/:id` (Dienstgrad, nächste Beförderung mit Erklärung, Listen), `GET|POST /api/promotions/lists`, `GET|PUT|DELETE …/lists/:id`, `POST …/lists/:id/(refresh|decide|reopen|execute)`, `PUT|DELETE …/lists/:id/entries/:personId`, `POST …/lists/:id/entries` (außerhalb der Regel), `GET …/lists/:id/certificates.pdf?personId`, Ausschlüsse `GET|POST /api/promotions/exclusions`, `PUT|DELETE …/exclusions/:id`. Rechte: `read` und `propose` je Abteilung, `decide`, `exclude` und `settings.manage` für die Gesamtwehr. Den Grund eines Ausschlusses sieht nur, wer `promotions.exclude` hat.

**Listen:** Beförderungsvorschau zum Stichtag (erfüllt und demnächst); Beförderungsliste (`promotions.list`, `listId`, optional `departmentId`) mit Dienstgrad, Ziel, Grundlage (Beschreibung der Regel bzw. „außerhalb der Regel“), Entscheidung und Bemerkung, gesamt oder je Abteilung, als PDF oder Excel.

## Modul Kleiderkammer (`clothing`)

Verwaltet die persönliche Schutzausrüstung (PSA). Backend `modules/clothing/clothing-api`, Oberfläche `clothing-web`, Verträge `clothing-contracts`.

**Rechte:** `clothing.read` (einsehen), `clothing.issue` (ausgeben, zurücknehmen, Wäsche und Prüfungen erfassen), `clothing.manage` (Stücke anlegen, ändern, aussondern; der Artikelkatalog braucht das Recht für die Gesamtwehr), alle abteilungsbezogen, und `clothing.self` (eigene Ausrüstung in „Mein Bereich“). Rollenvorlage „Kleiderwart“ (`clothing-officer`) mit `clothing.*` und `masterdata.persons.read`.

**Artikel** (`ArticleEntity`, `article`, historisiert): Schlüssel, Name, Art und Größen.
- `consumable` (z. B. Mütze, Handschuhe): wird nur abgegeben, nicht zugeordnet; die Abgabe steht im Verlauf der Person.
- `inventory` (z. B. Einsatzjacke, Hose, Atemschutz-Überhose, Stiefel, Helm): Einzelstücke mit Inventarnummer, einer Person zugeordnet.
- Inventarisierte Artikel können Textil sein (`textile`: Wäsche wird erfasst) mit Imprägnier-Intervall (`impregnationMonths`) und ein Prüfintervall haben (`inspectionMonths`).
- Vorlage `ARTICLE_TEMPLATE` (Einsatzjacke und -hose 12 Monate Imprägnieren und Prüfen, Atemschutz-Überhose, Stiefel, Helm, Flammschutzhaube, Handschuhe, Mütze, T-Shirt), ergänzt nur fehlende Schlüssel.

**Stücke** (`ClothingItemEntity`, `item`, historisiert): Artikel, Inventarnummer (eindeutig), Größe, Hersteller, Seriennummer, Barcode und RFID-Chip (z. B. waschbarer Textil-Chip; je eindeutig, wenn gesetzt), Anschaffung, Kleiderkammer der Abteilung, Status `stock`/`issued`/`retired`, Träger und Ausgabedatum.

**Ausgabe und Rücknahme** (`IssueEntity`, `issue`): Jede Ausgabe (Stück oder Verbrauchsartikel mit Größe und Anzahl) und jede Rücknahme ist ein Eintrag im Verlauf der Person mit Datum, Bemerkung und Erfasser. Ausgeben darf, wer `clothing.issue` für die Kleiderkammer des Stücks und für eine Abteilung der Person hat; an Ausgeschiedene wird nichts ausgegeben. Bei der Rücknahme kann das Stück direkt ausgesondert werden.

**Wäsche** (`CareEntity`, `care`): Waschen oder Imprägnieren (schließt Waschen ein) mit Datum und Ort, für mehrere Textil-Stücke auf einmal. Fällig ist das Imprägnieren `impregnationMonths` nach dem letzten Imprägnieren, ohne eines nach der Anschaffung (sonst nach der Erfassung); Waschen dazwischen ist beliebig oft möglich und ändert die Frist nicht.

**Prüfungen** (`ClothingInspectionEntity`, `inspection`): Datum, bestanden, Prüfer; fällig `inspectionMonths` nach der letzten Prüfung (sonst nach der Anschaffung).

**Austritt:** Die Kleiderkammer meldet sich beim `PERSON_HOLDINGS` der Stammdaten. Solange einer Person Stücke zugeordnet sind, lehnen Austritt und Übernahme in die Altersabteilung mit `masterdata.personHoldsItems` (409) ab.

**Oberfläche:** Schutzausrüstung (Bestand, beim Öffnen „Im Lager“, mit Suche und Filtern nach Status, Artikel und Größe, je Mehrfachauswahl; die Größen kommen aus den vorhandenen Stücken der gewählten Artikel; Fristen farbig), Stück (Stammdaten, Ausgabe, Rücknahme, Wäsche, Prüfung, Verlauf), Ausgabe (Person wählen: Stück aus dem Lager ausgeben, Verbrauchsartikel abgeben, zurücknehmen, Verlauf), Wäsche (mehrere Stücke, „Fällige auswählen“), Verwaltung → Kleiderkammer (Artikel, Vorlage). Reiter „Kleiderkammer“ in der Personalakte und „Meine Schutzausrüstung“ in „Mein Bereich“.

**Fristen:** Imprägnieren und Prüfung je Stück (30 Tage Vorlauf, zuständig `clothing.issue` der Kleiderkammer). **Listen:** ausgegebene Schutzausrüstung, fällige Wäsche und Prüfungen. **Daten:** Suche nach Inventar-, Seriennummer, Barcode und RFID-Chip, Code-Suche, Vollexport. Abteilungen mit Stücken lassen sich nicht löschen.

## Mehrsprachigkeit

- Die Oberfläche ist zwischen Deutsch (`de`, Standard) und Englisch (`en`) umschaltbar.
- Grundlage ist eine einzige i18next-Instanz im `web-sdk`. Sie wird per Module Federation geteilt, deshalb wechseln Shell und Module gemeinsam die Sprache.
- Jedes Modul liefert seine Texte mit `defineWebModule({ translations: { de, en }, … })`. Die Shell registriert sie unter der Modul-ID als Namespace.
- Gemeinsame Texte und die Fehlercodes des Cores liegen im Namespace `common` (`errors.<code>`). Fehlercodes eines Moduls (`masterdata.…`, `incidents.…`) liefert das Modul-Frontend unter `errors` in seinen Übersetzungen. `ApiError.translated()` und `translateCode()` liefern die Meldung in der aktuellen Sprache.
- Texte, die der Server liefert (Modulnamen, Navigation, Berechtigungen), sind `LocalizedText` mit `de` und `en`. `useLocalized()` wählt die passende Sprache.
- **Welche Sprache gilt:**
  - Vor der Anmeldung: die im Browser gespeicherte Wahl, sonst die Browsersprache.
  - Nach der Anmeldung: die Sprache aus dem Benutzerprofil (`language`).
  - Der Sprachumschalter speichert die Wahl im Browser und für angemeldete Benutzer zusätzlich im Profil (`PUT /api/core/profile`).

## Frontend

- Die Shell prüft beim Start `GET /api/core/setup` und `GET /api/core/session` und zeigt je nach Ergebnis die Ersteinrichtung, die Anmeldung oder die Anwendung.
- Nach der Anmeldung lädt sie die Module (`apps/shell/src/modules.ts`):
  1. `GET /api/core/modules` abrufen.
  2. Die Frontends mit `registerRemotes` registrieren.
  3. Je Modul `<remote>/Module` laden.
  4. Die Übersetzungen registrieren.
- Die Routen eines Moduls hängen unter `/<modul-id>/`. Die Navigation entsteht aus dem Manifest und zeigt nur Einträge, für die der Benutzer die Berechtigung hat.
- Ist ein Modul-Bundle nicht ladbar, zeigt der Rahmen über jeder Seite einen Hinweis. Der Rest bleibt bedienbar.
- Geteilte Singletons (`tools/federation.mts`): `react`, `react-dom`, `react-router`, `@mantine/core`, `@mantine/hooks`, `@mantine/notifications`, `@mantine/dates`, `@tanstack/react-query`, `i18next`, `react-i18next`, `@forga/web-sdk`, `@forga/web-ui`.
- Modul-Frontends werden mit `base: /modules/<id>/` gebaut. Die Adresse `/modules/<id>/remoteEntry.js` ist in Entwicklung und Betrieb dieselbe.

### Rahmen der Shell

`apps/shell/src/frame/`, gestaltet nach den freigegebenen [Mockups](../geplant/mockups/README.md):

- **Kopfzeile:** hochgeladenes Wappen, sonst das neutrale f.orga-Symbol (`public/logo.svg`, auch Favicon; Anmeldung `public/logo-full.svg`), Name der Feuerwehr aus den Einstellungen, globale Suche, Aufgaben-Glocke mit Zahl der fälligen und überfälligen Fristen, Sprachumschalter, Benutzermenü (Profil, Abmelden). Die Anmeldeseite zeigt das vollständige Logo (`public/logo-full.png`).
- **Seitenleiste:** Abschnitte „Übersicht“ (Startseite, Listen, Import), je aktivem Modul einer mit den Einträgen aus dem Manifest (Symbol über `icon`, Zähler über `useNavigationBadges` des Moduls) und „Verwaltung“ (nur Einträge, für die der Benutzer das Recht hat). Navigationseinträge mit `section: 'administration'` stehen unter „Verwaltung“, weil sie für die ganze Anwendung gelten (Kataloge, Einstellungen der Einsatzberichte). Auf dem Handy ein Menü mit Suche und Sprachumschalter.
- **Fußzeile:** Anschrift und Kontakt aus den Einstellungen `brigade`.
- **Globale Suche:** `GET /api/core/search`, Treffer nach Gruppe (Personen, Fahrzeuge, Einsätze).
- **Code suchen** (`/scan`, Eintrag unter „Übersicht“, wenn `GET /api/core/codes/modules` ein Modul liefert): großes Eingabefeld mit Fokus, in das Handscanner und RFID-Lesegeräte wie eine Tastatur schreiben (Enter sucht). Auf dem Handy „Mit Kamera scannen“ (Barcode-Erkennung des Browsers: QR, Code 128/39/93, EAN-13/8, UPC-A, Data Matrix, ITF) und „RFID/NFC lesen“ (Web NFC, Kennung des Chips). Genau ein Treffer öffnet den Gegenstand, mehrere erscheinen als Liste nach Modul, keiner als Hinweis. `/scan?code=…` sucht sofort (z. B. als Link auf einem NFC-Tag).

### Daten: Suche, Vollexport, Auskunft, Aufbewahrung

`libs/core/core-api/src/lib/data/data.ts`. Module melden sich in `onModuleInit` an:
- **Suche** (`SearchRegistry`): `GET /api/core/search?q=` (ab 2 Zeichen) fragt die Quellen der Module, für die der Benutzer überhaupt Rechte hat; jede Quelle prüft die Rechte selbst. Stammdaten: Personen (sichtbare), Fahrzeuge; Einsatzberichte: Einsätze (Leitstellennummer, Stichwort, Meldebild).
- **Code-Suche** (`CodeRegistry`): `GET /api/core/codes?code=` fragt die Quellen der Module mit gekennzeichneten Gegenständen (Geräte, Kleiderkammer) nach dem exakten Code: Barcode, RFID-Chip, Inventar- oder Seriennummer (ohne Groß-/Kleinschreibung) oder die URL eines QR-Etiketts von f.orga. Jede Quelle prüft die Rechte selbst. Codes sind `ItemCode`/`RfidCode` aus `core-contracts`: leer bedeutet keiner; RFID-Kennungen werden ohne Trennzeichen in Großbuchstaben gespeichert und verglichen (`normalizeRfid`), weil Lesegeräte sie unterschiedlich ausgeben. Eingabefelder für Codes (`CodeInput` in `web-ui`) füllen sich per Handscanner, Kamera (Barcode) oder NFC (RFID).
- **Vollexport** (`ExportRegistry`, Recht `core.data.export`): `GET /api/core/export/:modul` liefert alle Daten des Moduls mit IDs als JSON (`{ format: 'forga.export', version: 1, module, exportedAt, data }`), `GET /api/core/export/person/:personId` alles zu einer Person über alle Module (Auskunft nach Art. 15 DSGVO). Beides steht im Audit-Log (`data.exported`, `data.person-exported`).
- **Aufbewahrung** (`RetentionRegistry`, `RetentionService`, Einstellung `privacy`): eine Minute nach dem Start und dann täglich (abschaltbar mit `FORGA_RETENTION_SCHEDULER=off`) und auf Knopfdruck (`POST /api/core/retention/run` mit `dryRun`). Der Core löscht Audit-Einträge älter als `auditRetentionMonths` und nicht übernommene Import-Uploads und Datenübernahmen älter als 24 Stunden (`core.imports`). Die Stammdaten anonymisieren Personen, die vor mehr als `anonymizeLeftAfterYears` Jahren ausgeschieden sind: Name „Person (ausgeschieden)“, Kontakt- und sensible Daten, Qualifikationen, Ehrungen, Lehrgänge und ihre Historie werden entfernt, `anonymizedAt` gesetzt; Mitgliedschaften, Dienstgrade und Verweise in Einsatzberichten bleiben für die Statistik.

**Anhänge** (`attachments/attachments.ts`, Tabelle `core.attachment`): Fotos (PNG, JPEG, WebP) und PDF bis 10 MB an Datensätzen der Module, gespeichert in der Datenbank. Der Inhalt muss zum angegebenen Typ passen (Signatur der Datei), sonst `attachments.type`.
- Module melden je Art des Datensatzes an, wer Anhänge sehen und wer sie hinzufügen oder entfernen darf (`Attachments.register(ownerType, { read, write })`); unbekannte Arten werden abgelehnt. Löscht ein Modul einen Datensatz, entfernt es dessen Anhänge (`removeAll`).
- `GET /api/core/attachments?type&id` (Liste), `POST /api/core/attachments?type&id` (Datei `file`), `GET /api/core/attachments/:id/file` (inline, `nosniff`, Sandbox), `DELETE /api/core/attachments/:id`. Ohne Leserecht antwortet der Server mit `404`. Hinzufügen und Entfernen stehen im Audit-Log (`attachments.added`, `attachments.removed`).
- Arten: `training.session` (lesen wie der Dienst, ändern mit Planungs- oder Anwesenheitsrecht), `equipment.inspection` (lesen mit `equipment.read`, ändern mit `equipment.inspect`), `equipment.defect` (lesen mit `equipment.read` oder als Meldender, ändern mit `equipment.write` oder als Meldender, solange der Mangel gemeldet ist), `incidents.report` (lesen wie der Bericht, ändern solange der Benutzer den Bericht bearbeiten darf).

**Wappen und Briefkopf** (`settings/assets.ts`): `PUT /api/core/assets/logo|letterhead` (PNG, JPEG, WebP, SVG, bis 2 MB), öffentlich lesbar über `GET /api/core/assets/:key` (die Anmeldeseite zeigt das Wappen). Kopfzeile und Anmeldung nutzen das hochgeladene Wappen, sonst das neutrale f.orga-Symbol; f.orga bringt kein Wappen einer bestimmten Feuerwehr mit. Alle PDFs (Listen, Abrechnungen, Kostenbescheide, Urkunden) zeigen das Wappen; PNG, JPEG und SVG sind möglich, WebP nicht.

**PDF-Rahmen** (`lists/renderers.ts`): Listen und Briefe haben denselben Seitenkopf nach Stil.md (Wappen links, daneben der Name der Feuerwehr in der Dienstfarbe und der Titel, darunter eine Linie in `#8C1D18`; Briefe mit hinterlegtem Briefkopf zeigen stattdessen diesen) und dieselbe Fußzeile (Linie, Anschrift und Kontakt der Feuerwehr, Seite x/y, Erstellungszeit). Tabellen: Kopf weiß auf `#8C1D18` in Großbuchstaben mit Innenabstand (`pdfHeaderCell`), nur waagrechte Linien, Zebrastreifen (`PDF_TABLE_LAYOUT`). Die Spaltenbreiten der Listen ergeben sich aus dem Inhalt (`columnWidths`): jede Spalte bekommt mindestens ihr längstes Wort und die Überschrift, so dass nichts mitten im Wort umbricht; der Rest verteilt sich auf Spalten mit langen Texten. `POST /api/core/settings/smtp/test` schickt eine Test-E-Mail an den angemeldeten Benutzer.

**OpenAPI.** Unter `/api/docs` steht die Beschreibung aller Endpunkte (`@nestjs/swagger`), als JSON unter `/api/docs/openapi.json`. Die Schemas der Request-Bodies stehen in den Zod-Verträgen der `*-contracts`-Pakete und sind dort noch nicht abgebildet.

### Seiten der Shell

| Pfad | Seite | Recht |
| --- | --- | --- |
| `/` | Startseite: Begrüßung, Kennzahlen und Karten der Module (`dashboard` mit `area` `kpi`, `main`, `side`), Fristen und Aufgaben | angemeldet |
| `/profile` | Sprache, wöchentliche E-Mail, Passwort ändern | angemeldet |
| `/scan` | Code suchen: Barcode, RFID-Chip, QR-Etikett oder Inventarnummer per Handscanner, Lesegerät, Kamera oder NFC | Lesen in einem Modul mit Code-Suche |
| `/lists` | Listen nach Modul, Parameter, Vorschau, Download als PDF, Excel, CSV | je Liste |
| `/import` | Import-Assistent: Datei, Inhalt (passendstes Profil vorgewählt), Spaltenzuordnung mit Beispielwerten, Prüfung (Probelauf), Übernahme | je Importprofil |
| `/admin/users` | Benutzer mit Filter, Bearbeiten daneben: Person verknüpfen, Sprache, Passwort setzen, Rollen je Bereich zuweisen, sperren | `core.users.manage` |
| `/admin/roles` | Rollen mit Berechtigungen je Modul, „alle Rechte des Moduls“, kopieren, löschen, fehlende Standardrollen anlegen | `core.roles.manage` |
| `/admin/modules` | Installierte Module mit Version und Abhängigkeiten, aktivieren und deaktivieren (danach lädt die Shell neu), geplante Module der späteren Releases | `core.modules.manage` |
| `/admin/tokens` | API-Tokens erzeugen (einmal sichtbar, kopierbar), Ablauf, letzte Nutzung, widerrufen | `core.tokens.manage` |
| `/admin/settings` | Reiter Feuerwehr (`brigade` mit Gemeinde, Einwohnerzahl, Adresse von f.orga; Wappen und Briefkopf), E-Mail (`smtp`, Test-E-Mail), Erinnerungen (`reminders`), Datenschutz (`privacy`, Prüfen und Anwenden der Aufbewahrungsregeln), Anmeldung (`oidc`), Export (Vollexport je Modul, Link zu OpenAPI) | `core.settings.manage` |
| `/admin/audit` | Audit-Log mit Suche | `core.audit.read` |

Personen und Abteilungen für die Benutzerverwaltung kommen aus der Stammdaten-API. Ist das Modul nicht aktiv, bleiben die Auswahlfelder leer.

### Oberfläche Einsatzberichte

`modules/incidents/incidents-web/src/`, nach den freigegebenen Mockups:

| Pfad | Seite |
| --- | --- |
| `/incidents/incidents` | Einsätze des Jahres mit Ansichten (alle, nur meine, offen, zur Prüfung, freigegeben), Suche und Abteilungsfilter. „+ Einsatz anlegen“ legt Einsatz und Berichtsentwürfe für die gewählten Abteilungen an und öffnet den ersten Bericht. |
| `/incidents/incidents/:id` | Einsatzdaten (bearbeitbar), Karte je Bericht mit Status, Verfasser, Zeit, Personal und Betrag, Hauptbericht wechseln, Bericht für weitere Abteilung |
| `/incidents/reports/:id` | Berichtseditor (siehe unten) |
| `/incidents/review` | Berichte zur Prüfung und zur Entschädigung freigegebene Berichte; Detail mit begründeten Warnungen und den Aktionen des Freigebers |
| `/incidents/open` | Offene Berichte (Entwürfe, zurückgegebene) nach Verfasser mit Hinweisen und offen seit; Kennzahlen (offen, zur Prüfung, ohne Hauptbericht, ohne Verfasser); Verfasser zuweisen (`POST /incidents/reports/:id/author`, ohne zu sperren); „Verfasser erinnern“ per E-Mail (`POST /incidents/open-reports/remind`); Excel |
| `/incidents/compensation` | Auszahlungslauf: Zeitraum wählen, Prüfung (`GET /incidents/compensation/check`) mit Problemen je Art, Export erst ohne Probleme |
| `/incidents/duty` | EvD-Dienst: Dienste des Einsatzleiters vom Dienst und weitere Sonderdienste je Jahr, anlegen, bearbeiten, löschen; Kalender-Import über den Import-Assistenten |
| `/incidents/statistics` | Jahresstatistik: Werte je Frage und Spalte (FF, JF, Alt.-A, Mus.-A) mit den Texten der Landesvorlage (`STATISTICS_QUESTIONS`), Filter nach Seite, Korrektur per Klick, Plausibilitätsprüfungen, Abschließen/Wiederöffnen, Export der Landesvorlage |
| `/incidents/settings` | Einstellungen (im Menü unter „Verwaltung → Einsatzberichte“): Entschädigung (Stundensätze mit Gültigkeit und Rundung, solange das Modul Entschädigungen nicht aktiv ist; Bereitschaft, zweistufige Freigabe, eigene Gemeinde), Stichwort-Katalog (anlegen, bearbeiten, BW-Vorlage), Prüfregeln (an/aus, Stufe), Sonderdienste (Satz je Tag) |

**Berichtseditor** (`report/`): Abschnitte Zeiten & Ort, Personal & Fahrzeuge, Lage & Verlauf, Statistik, Beteiligte & Sonstiges (mit Anhängen: Fotos, Alarmfax, Skizzen), Prüfen; jeder Abschnitt zeigt seinen Stand (vollständig, fehlt, Fehler, Warnungen).
- `useReportEditor` hält eine lokale Kopie des Inhalts und speichert 0,8 s nach der letzten Änderung (`PUT /incidents/reports/:id`), immer nur eine Anfrage gleichzeitig. Die Antwort aktualisiert Prüfergebnisse und Entschädigung. Vor dem Fertigmelden und beim Verlassen wird gespeichert.
- Personalzeiten gleich den Berichtszeiten werden als `null` gespeichert und folgen so späteren Änderungen der Berichtszeiten.
- Personal: Person (oder Gast) suchen und mit einem Klick einem Fahrzeug oder der Bereitschaft zuordnen; Karte je Fahrzeug mit Besetzung und Plätzen; Dialog je Person mit Fahrzeug, Funktion, Zeiten, Atemschutz, Verdienstausfall, Arbeitszeit, Schaden und berechneter Entschädigung.
- Statistik nur im Hauptbericht: Vorschlag aus Stichwort und Einsatzort übernehmen; gespeichert wird erst, wenn alle Pflichtangaben gemacht sind.
- Prüfen: Fehler mit Sprung zum Abschnitt, Warnungen mit Begründungsfeld. Gleiche Befunde zu einer Person werden zusammengefasst (`mergeFindings`).
- Fertig melden geht ohne offene Fehler und mit begründeten Warnungen. Danach ist der Bericht für den Verfasser schreibgeschützt, bis er zurückgegeben wird (Server: `incidents.notDraft`).
- Versionen (wiederherstellen) und Verlauf (Historie) als Dialog; die Aktionsleiste zeigt den Speicherstand und die Zahl der Fehler und Warnungen.
- `WorkflowActions` zeigt Freigebern je nach Status „Freigeben zur Entschädigungsauszahlung“ bzw. „zur Abrechnung“ (je nach Einstellung `compensationRelease`), „Zurück an Verfasser“ mit Pflichthinweis und „Sperre aufheben“ mit Begründung und Zielstatus.
- Startseite: Kacheln „Berichte zur Prüfung“ (Freigeber) und „Meine offenen Berichte“ (Verfasser), Karte „Letzte Einsätze“; Zähler an „Zur Prüfung“ im Menü; Einsätze in der globalen Suche.

### Oberfläche Übungsdienst

`modules/training/training-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/training/sessions` | Dienste als Liste oder Monatskalender (Raster ab Montag; blättern je Monat) oder Wochenansicht (Montag bis Sonntag mit Zeiten, Kalenderwoche; blättern je Woche); ein Klick öffnet den Dienst, die Wahl der Ansicht merkt sich der Browser, Filter Abteilung und Art. „+ Dienst planen“ mit Termin, Inhalt und optional als Serie; „Plan übernehmen“ kopiert die Dienste eines Zeitraums (Vorgabe: Vorjahr, 52 Wochen später); „Dienstplan (PDF)“ für das Jahr des angezeigten Monats und die gewählte Abteilung. |
| `/training/sessions/:id` | Reiter Termin und Inhalt (bearbeiten), Anwesenheit, Anhänge (Fotos, Unterlagen), Historie. Aktionen Kopieren (öffnet „Dienst planen“ mit den Angaben eine Woche später), Löschen (geplant), Abschließen (durchgeführt), Wieder öffnen (abgeschlossen). Hinweis bei Überschneidungen. |
| `/training/check-in?code=…` | Ziel des QR-Codes: „Ich bin da“ trägt die angemeldete Person ein |
| `/training/participation` | Dienstbeteiligung im Zeitraum je Person mit Quote |
| `/training/settings` | Einstellungen (im Menü unter „Verwaltung → Übungsdienst“): Arten von Diensten (anlegen, bearbeiten, Vorlage BW), Zeitfenster des QR-Check-ins, Textbausteine, Kalender-Abo ein/aus mit Adressen je Abteilung |

- **Anwesenheit:** alle Mitglieder der Abteilungen des Dienstes als Liste mit Status je Person (–, anwesend, entschuldigt, unentschuldigt), Atemschutz, verletzt, bei Belastungsübungen kJ und bestanden. „Übrige unentschuldigt“ füllt die offenen Zeilen. Solange der Dienst offen ist, steht darüber der QR-Code für den Check-in. Per QR eingetragene, noch unbestätigte Personen sind markiert („per QR, nicht bestätigt“), ein Hinweis nennt ihre Zahl.
- **Startseite:** Kachel „Dienste abzuschließen“ (`training.close`), Karte „Nächste Dienste“ (30 Tage).
- **Personalakte:** Reiter „Dienste“ (Erweiterungspunkt `masterdata.person.tab`) mit den Diensten der Person im Jahr.

### Oberfläche Atemschutz

`modules/respiratory-protection/respiratory-protection-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/respiratory-protection/overview` | Kacheln grün/gelb/rot (Klick filtert), Tabelle der Geräteträger mit Ampel, fehlenden Bedingungen und nächster Fälligkeit; Zeile öffnet die Personalakte; Liste als PDF |
| `/respiratory-protection/quick-entry` | Schnellerfassung: Art, Datum, Übungsanlage; Geräteträger auswählen, je Person kJ, bestanden und Minuten |
| `/respiratory-protection/settings` | Tauglichkeitsregel (im Menü unter „Verwaltung → Atemschutz“), „Standard FwDV 7“ setzt sie zurück |

- **Personalakte:** Reiter „Atemschutz“ (Erweiterungspunkt `masterdata.person.tab`) mit Ampel und Bedingungen, Atemschutznachweis als PDF, Nachweisen (Herkunft, Bearbeiten und Löschen erfasster Nachweise) und „+ Nachweis eintragen“. Untersuchungen sieht und erfasst nur, wer `examinations` hat.
- **Startseite:** Kachel „Geräteträger nicht einsatzbereit“ mit der Zahl der gelben als Hinweis.
- `KpiTile` aus `web-ui` kann statt eines Links als Schalter (`onClick`, `selected`) dienen.

### Oberfläche Entschädigungen

`modules/compensation/compensation-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/compensation/runs` | Auszahlungsläufe mit Zeitraum, Posten, Summe und Status; „+ Neuer Lauf“ (Vorgabe Vormonat); „Vorhandene Daten übernehmen“ für Berechtigte der anderen Module |
| `/compensation/runs/:id` | Lauf: Reiter Personen, Abteilungen, Posten (Verdienstausfall per Klick eintragen), Hinweise; Excel, Abrechnungsübersicht (PDF), Überweisungsdatei; Abschließen, übergeben, ausgezahlt, Entwurf löschen |
| `/compensation/items` | offene Posten; „+ Posten von Hand“ mit Begründung |
| `/compensation/functions` | Funktionsinhaber, „Pauschalen erzeugen“ je Jahr mit Hinweis auf überschrittene Höchstzahlen, Jahressummen mit Steuerhinweis |
| `/compensation/settings` | Einstellungen (im Menü unter „Verwaltung → Entschädigungen“): Sätze für Dienste und Einsätze, Satzung, Lehrgangspauschalen, **Vorschau** (Einsatz eines Zeitraums wählen, „Berechnen“ zeigt je Bericht und Person Stunden, Satz, Betrag des Berichts, Auszahlung und Hinweise mit den noch nicht gespeicherten Einstellungen), Funktionspauschalen, Auszahlung |

- **Personalakte:** Reiter „Entschädigung“ mit den Posten eines Jahres und der Summe.
- **Startseite:** Kachel „Offene Entschädigungen“ mit Summe; rot, solange Verdienstausfälle ohne Betrag sind.

### Oberfläche Geräte

`modules/equipment/equipment-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/equipment/items` | Geräte mit Suche und Filtern (Kategorie, Abteilung, Status, fällig), nächste Prüfung mit Ampel, offene Mängel; „+ Gerät“ |
| `/equipment/items/:id` | Geräteakte: Stammdaten mit QR-Code, Prüfungen (Fälligkeiten, „Prüfen“, „Fällig setzen“, Historie), Mängel, Einsätze (Klick öffnet den Bericht), Historie; „Protokoll“ je Prüfung als PDF; „Anhänge“ je Prüfung (z. B. Protokoll des Prüfstands) und je Mangel (Fotos); beim Melden eines Mangels optional ein Foto; Mangel melden, Status ändern, aussondern. Wer nur Mängel melden darf, sieht nur „Mangel melden“. |
| `/equipment/inspections` | fällige Prüfungen; mit gewählter Prüfart Sammelprüfung, Auswahl auch nacheinander per QR-Code („Per QR-Code auswählen“: Kamera über die Barcode-Erkennung des Browsers, sonst Eingabe von Code, Inventarnummer, Barcode oder RFID-Chip, z. B. mit einem Handscanner); „Tagesprotokoll (PDF)“ aller Prüfungen von heute (gewählte Abteilung) |
| `/equipment/defects` | Mängel mit Bearbeitung |
| `/equipment/labels` | QR-Etiketten zum Drucken |
| `/equipment/settings` | Gerätetypen mit Prüfarten, Kategorien als Baum (eingerückt unter der übergeordneten, „+ Unterkategorie“ je Zeile), Vorlage DGUV 305-002, Fahrzeuge übernehmen (im Menü unter „Verwaltung → Geräte“) |

- **Startseite:** Kachel „Prüfungen fällig“ mit der Zahl defekter Geräte.

### Oberfläche Kostenersatz

`modules/cost-recovery/cost-recovery-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/cost-recovery/candidates` | kostenpflichtige Einsätze im Zeitraum mit vorgeschlagenem Tatbestand, Freigabestand und Bescheid; „Bescheid erstellen“ |
| `/cost-recovery/notices` | Bescheide je Jahr und Status; Sollstellung für die Kämmerei (Excel oder CSV nach Einstellung) |
| `/cost-recovery/notices/:id` | Bescheid: Tatbestand, Kassenzeichen, Kostenschuldner (auch aus dem Adressbuch), Verweis auf geänderten bzw. ersetzenden Bescheid, „Änderungsbescheid erstellen“ (unter „Weitere“), Positionen mit Begründung bei Abweichung und „als MTW“ (hinzufügen: Pauschalen der Satzung mit Fundstelle, Material, Kosten Dritter, andere Feuerwehren, Sonstiges), Textbausteine; Vorschau bzw. PDF, Neu berechnen, Zur Prüfung, Erlassen, Übergeben, Zahlung, Widerspruch, Aufheben |
| `/cost-recovery/debtors` | Adressbuch |
| `/cost-recovery/settings` | Sätze, Material, Pauschalen der Satzung (Bezeichnung, Betrag, Fundstelle; leer bis aus der Satzung eingetragen), Behörde, Sollstellung (Format, Spalten) und Textbausteine (im Menü unter „Verwaltung → Kostenersatz“) |

- **Startseite:** Kachel „Kostenpflichtig ohne Bescheid“.

### Oberfläche Beförderungen

`modules/promotions/promotions-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/promotions/lists` | Reiter „Listen“ (Stichtag, wirksam ab, Zahl der Beförderungen, Status; „Neue Liste“) und „Vorschau“ (Stichtag wählbar, erfüllt und demnächst oder alle, was fehlt; Klick zeigt die Regel Schritt für Schritt; Drucken) |
| `/promotions/lists/:id` | Liste: Vorschläge mit Dienstgrad, Ziel, Stand und Entscheidung; Entscheiden je Eintrag, außerhalb der Regel, Ausgeschlossene ausgegraut darunter (Entwurf), Neu prüfen, Beschließen, Wieder öffnen, Durchführen, Urkunden (gesamt und je Person), Löschen; „Drucken“ (für alle mit Leserecht) mit der Beförderungsliste gesamt als PDF oder Excel und je Abteilung als PDF |
| `/promotions/exclusions` | Ausschlüsse mit Zeitraum, Geltung (alle Beförderungen oder ein Dienstgrad) und Grund |
| `/promotions/rules` | Regeln als Tabelle mit lesbarem Text, Editor für Schlüssel, Ziel, Beschreibung und Bedingung (grafisch als Baum aus „Alle der folgenden“/„Eine der folgenden“ mit Bausteinen beliebiger Tiefe, oder als JSON mit lesbarer Vorschau) und „Diese Person prüfen“ (die noch nicht gespeicherte Regel mit Bedingungsbaum und Stand einer Person, `POST /api/promotions/rules/test`), Vorlage VwV 2022, Vorschau und Urkundentexte (im Menü unter „Verwaltung → Beförderungen“) |

- **Personenakte:** Reiter „Dienstgrad“ mit aktuellem Dienstgrad, nächster Beförderung als Bedingungsbaum (erfüllt, erfüllt ab, fehlt) und den Listen der Person.
- **Startseite:** Kachel „Beförderungen möglich“ mit der Zahl der demnächst erfüllten.

### Oberfläche Stammdaten

`modules/masterdata/masterdata-web/src/organization/`, Seite `/masterdata/organization` nach dem Mockup „Organisation“:

- Links der Abteilungsbaum (Unterabteilungen über `parentId`) mit Typ und Zahl der Mitglieder, rechts die gewählte Abteilung mit Typ, Kurzname, Leitung, Stellvertretern, Einwohnern im Ortsteil, Statistik, Sonderaufgaben und Kennzahlen.
- Mit `masterdata.organization.manage`: Abteilung bearbeiten (für die Gesamtwehr auch anlegen, Unterabteilung anlegen und löschen), Wache und Fahrzeug anlegen, bearbeiten und löschen (Zeile anklicken). Ein Fahrzeug wechselt die Abteilung über das Feld „Abteilung“.
- Löschen geht nur, solange nichts mehr darauf verweist. Andere Module melden ihre Verweise über `ORGANIZATION_REFERENCES` (Einsatzberichte: Berichte, Fahrzeuge und Bereitschaft im Personal; der Core: Rollenzuweisungen). Sonst nennt die Meldung den Grund; genutzte Fahrzeuge werden ausgesondert.
- Mitglieder: Liste der Personen mit Stamm- oder zusätzlicher Mitgliedschaft. Mit `masterdata.persons.write` lässt sich eine Person zusätzlich aufnehmen (z. B. die Einsatzleiter vom Dienst in einer Führungseinheit „Gesamtfeuerwehr“) und eine zusätzliche Mitgliedschaft beenden (Ende gestern; am selben Tag begonnene werden entfernt). Gespeichert wird über `PUT /masterdata/persons/:id/memberships`.
- Wer nur Rechte für einzelne Abteilungen hat, sieht in der Personensuche eines Berichts nur deren Mitglieder; zusätzliche Mitgliedschaften zählen dabei mit.

Weitere Seiten der Stammdaten:

| Pfad | Seite |
| --- | --- |
| `/masterdata/persons` | Personen mit Suche und Filtern nach Status (Mehrfachauswahl als Chips, Standard aktiv), Abteilung, Qualifikation und Dienstgrad (je Mehrfachauswahl, eine passende genügt). Die Abteilungen sind anfangs die eigenen: die der verknüpften Person, sonst die mit `masterdata.persons.read` |
| `/masterdata/persons/new` | Person anlegen mit Stammabteilung, Aufnahmedatum, Status und Probezeitende (Abweichung mit Begründung). Hinweis auf gleichnamige Personen, auch ausgeschiedene. |
| `/masterdata/persons/:id` | Personalakte: Kopf mit Dienstgrad, Abteilungen, Status und Qualifikationen; Reiter Stammdaten (sensible Felder nur mit Recht), Feuerwehr (Ruhezeiten, Probezeit ändern, endgültig aufnehmen, Übernahme in Einsatzabteilung bzw. Altersabteilung, Status ändern, Austritt, Abteilungen, Beförderungen, Führerschein), Lehrgänge (Teilnahmen, Vormerkungen), Qualifikationen, Ehrungen, Ämter (mit Abteilung und Zeitraum, beenden über „bis“), Reiter anderer Module, Historie. Stammdaten werden gesammelt mit „Speichern“ übernommen, alles andere sofort. |
| `/masterdata/vehicles` | Alle Fahrzeuge, bearbeiten über den Fahrzeugdialog |
| `/masterdata/courses` | Lehrgangsplanung: Lehrgänge mit Zahl der Vormerkungen und Anmeldungen; je Lehrgang Vorgemerkte mit Voraussetzung und Status, weitere Kandidaten gemeinsam vormerken |
| `/masterdata/catalogs` | Kataloge (im Menü unter „Verwaltung“, sie gelten für die ganze Anwendung) (Funktionen, Qualifikationen, Fahrzeugtypen, Ehrungen, Austrittsgründe, Dienstgrade) und Lehrgänge pflegen, BW-Vorlage ergänzen; Einträge werden deaktiviert statt gelöscht |

**Erweiterungspunkte:** Ein Modul-Frontend kann über `extensions` in `defineWebModule` Inhalte in andere Module einhängen (`Extension` mit `label`, `permission`, `component`). Die Shell registriert sie beim Laden (`registerExtensions`), das Zielmodul fragt sie mit `extensionsOf(punkt)` ab. Vorhanden: `masterdata.person.tab` (Reiter der Personalakte, Props `{ personId }`); die Einsatzberichte liefern damit den Reiter „Einsätze“ (`GET /api/incidents/persons/:personId/assignments?year=`); `incidents.report.sections` (Karten im Bericht, Props `{ reportId, incidentId, chargeable, departmentId, vehicleIds, breathingVehicleIds, disabled }`); `training.session.sections` (Reiter eines Dienstes, Props `{ sessionId, departmentIds, disabled }`); `core.me.sections` (Mein Bereich); `incidents.settings.rates` (ersetzt in den Einstellungen der Einsatzberichte Stundensätze und Rundung, wenn ein Modul sie führt).

### Mein Bereich (Self-Service)

Die Shell zeigt unter `/me` („Mein Bereich“, in der Seitenleiste unter „Übersicht“, wenn der Benutzer mit einer Person verknüpft ist) die Beiträge der Module zum Erweiterungspunkt `core.me.sections` (Reihenfolge über `order`), jeweils mit der `personId` des Benutzers. Die Endpunkte arbeiten immer mit der verknüpften Person des Benutzers, nie mit einer übergebenen ID; Rechte `*.self` (Bereich Abteilung, jede Zuweisung genügt) aus der Rollenvorlage `member` und den anderen Standardrollen.

| Modul | Abschnitt | Schnittstelle |
| --- | --- | --- |
| Stammdaten | Meine Personalakte (Abteilung, Dienstgrad, Eintritt, Qualifikationen, Ehrungen) und Kontakt mit Bankverbindung zum Ändern; interne Bemerkungen bleiben verborgen, Änderungen stehen in der Historie | `GET`, `PUT /api/masterdata/me` (`masterdata.self`) |
| Übungsdienst | nächste Dienste der eigenen Abteilungen (8 Wochen) mit Entschuldigen (Grund freiwillig), Grund ändern, Zurücknehmen; letzte Dienste (90 Tage) mit eigenem Stand; Beteiligung im Jahr. Der Gruppenführer sieht den Grund in der Anwesenheit; als anwesend Eingetragene können sich nicht entschuldigen | `GET /api/training/me`, `PUT`, `DELETE …/me/sessions/:id/excuse` (`training.self`); Feld `note` an der Anwesenheit |
| Atemschutz | eigene Tauglichkeit mit Bedingungen und die letzten Nachweise (auch Untersuchungen, eigene Daten); nur für Geräteträger | `GET /api/respiratory-protection/me` (`respiratory-protection.self`) |
| Geräte | Mangel melden über Inventarnummer oder Bezeichnung (Geräte der Abteilungen mit `equipment.defects.report`), eigene Meldungen mit Stand | `GET /api/equipment/me/items?q`, `GET /api/equipment/me/defects`; Mängel merken sich den meldenden Benutzer (`reported_by_user_id`) |

### Bausteine für Modul-Frontends

`@forga/web-ui` (`libs/web/web-ui/src/lib/components/`):

| Baustein | Zweck |
| --- | --- |
| `PageHeader` | Brotkrumen, Titel in Dienstrot, Plaketten, Untertitel, Aktionen |
| `Panel` | Karte mit Titel und Zusatz rechts |
| `StatusBadge` | Plakette mit Ton `neutral`, `error`, `warning`, `done`, `primary`, `highlight` |
| `Notice` | Meldung `error`, `warning`, `info`, `done`; Fehler und Warnungen mit Textpräfix |
| `KpiTile` | Kennzahl mit Beschriftung, optional Link und Hervorhebung |
| `EmptyState` | Leerer Zustand mit Text und Aktion |
| `ActionBar` | Klebende Aktionsleiste am unteren Rand |
| `DataTable` | Tabelle mit rotem Kopf und Zebrastreifen, auf dem Handy als Kartenstapel; Zeilenklick, Auswahl, Hervorhebung. Darunter „Als Excel exportieren“: lädt die Tabelle so, wie sie angezeigt wird (Zelltexte aller Zeilen, Zahlen als Zahl, Kopfzeile fett, fixiert und mit Filter), als `<Titel>_<Datum>.xlsx`; der Titel ist `exportName`, sonst die Überschrift des Panels oder der Seite. Spalten ohne Überschrift (Schaltflächen) und mit `export: false` fehlen. `exportable={false}` blendet den Export aus (Dashboard-Kacheln, Eingabeformulare, Berichtsabschnitte, Verwaltung von Tokens, Plugins, Listen und Beförderungsregeln). Die Datei erzeugt `xlsx.ts` im Browser mit `fflate`. |
| `ResponsiveDialog`, `ConfirmDialog` | Dialog (auf dem Handy von unten), Bestätigung kritischer Aktionen mit optionalem Pflichtgrund |
| `HistoryTimeline` | Änderungsverlauf eines Datensatzes aus `GET /api/core/history` |
| `Attachments` | Anhänge eines Datensatzes (`type`, `id`): Vorschaubild bzw. PDF-Symbol mit Link, mit `editable` Hinzufügen und Entfernen |
| `useAction`, `notifyError`, `notifySuccess` | Mutation mit Fehlermeldung in der Oberflächensprache, Erfolgsmeldung und Neuladen von Abfragen |

`@forga/web-sdk` liefert dazu `api`, `send`, `upload` (Datei als `multipart/form-data`), `withQuery`, `apiUrl` (Download-Links), `useCan`, die Formatierung von Datum, Uhrzeit und Geldbeträgen in Europe/Berlin (`format.ts`) und `translateCode`: Codes, die mit einer Modul-ID beginnen, stehen unter `errors` im Namespace des Moduls, alle anderen in `common`.

- Das Theme (`libs/web/web-ui/src/lib/theme.ts`, `forgaTheme`) folgt `Stil.md` mit Dienstrot als Primärfarbe und ist eckig und Material-nah: Eckenradius 4 px (`defaultRadius: 'xs'`, Stufen bis `md` 4 px), Schatten nach Material-Höhenstufen.

## Modulgrenzen

Jedes Projekt trägt zwei Nx-Tags. `tools/module-boundaries.mjs` prüft die Abhängigkeiten im Nx-Projektgraphen. Die Prüfung läuft als Teil von `npm run lint`.

| Tag | Werte |
| --- | --- |
| `scope:*` | `core`, `module-<id>`, `app` |
| `type:*` | `contracts`, `api`, `web`, `server`, `shell` |

| Typ | darf importieren |
| --- | --- |
| `contracts` | `contracts` |
| `api` | `api`, `contracts` |
| `web` | `web`, `contracts` |
| `server` | `api`, `contracts` |
| `shell` | `web`, `contracts` |

**Bereichsregeln:**
- Der Core nutzt nur den Core.
- Ein Modul nutzt den Core, sich selbst und die `contracts` anderer Module.
- Apps unterliegen nur der Typregel.
