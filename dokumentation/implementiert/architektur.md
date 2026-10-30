# Architektur (umgesetzter Stand)

Das [Gesamtbild](gesamtbild.md) zeigt in Diagrammen, welche Teile jedes Modul mitbringt und wo sie zusammenlaufen.

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
| `@forga/incidents-*` | `modules/incidents` | Backend der Einsatzberichte (Stichworte, Einsätze, Berichte, Prüfregeln, Entschädigung, Ablauf, externe API, Import des Einsatzpersonals, Auswertungen, Abrechnungsexport, Jahresstatistik, Berichte gesamtwehrweiter Einheiten), Frontend für Einsätze, Berichte und Prüfung |
| `@forga/duty-officer-*` | `modules/duty-officer` | Einsatzleiter vom Dienst: EvD-Dienstplan mit iCal-Import, EvD-Bericht zu jedem Einsatz, Einstellungen, Karte auf der Einsatzseite |
| `@forga/training-*` | `modules/training` | Dienste (Übungs- und Sonderdienste): Dienstarten mit Kategorie, Dienstplan, Teilnahmen, Kalender-Abonnement, Dienstbeteiligung |
| `@forga/respiratory-protection-*` | `modules/respiratory-protection` | Atemschutz: Nachweise (Untersuchung, Belastungsübung, Einsätze), Tauglichkeitsampel, Streckenplanung |
| `@forga/compensation-*` | `modules/compensation` | Entschädigungen: Satzung, Positionen aus Einsätzen, Diensten und Lehrgängen, Auszahlungsläufe |
| `@forga/equipment-*` | `modules/equipment` | Geräte: Kategorien, Gerätetypen, Prüfungen, Mängel, Verbrauch in Einsätzen und Diensten |
| `@forga/cost-recovery-*` | `modules/cost-recovery` | Kostenersatz: Tatbestände je Einsatz, Bescheide, Zahlungen |
| `@forga/promotions-*` | `modules/promotions` | Beförderungen: Regeln, Vorschlagslisten, Durchführung |
| `@forga/clothing-*` | `modules/clothing` | Kleiderkammer: Artikel, Ausgabe und Rücknahme, Pflege, Prüfungen, Größen |
| `@forga/mp-feuer-*` | `modules/mp-feuer` | MP-Feuer: Datenübernahme aus Transferdateien im Hintergrund, Zuordnungsliste, Verlauf, Export-Platzhalter |
| `@forga/privacy-*` | `modules/privacy` | Datenschutz: Betroffenenanfragen, Einschränkung, Löschprüfung, Datenschutzhinweis, Einwilligungen, Auskunft als PDF, Leseprotokoll, Verzeichnis der Verarbeitungstätigkeiten, Datenpannen (abschaltbar) |

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
- `frontend.kiosk` (`{ path, exposed }`) meldet eine Seite ohne Shell-Rahmen und ohne Anmeldung, die die Shell unter `/<path>` zeigt (z. B. das Infoterminal unter `/terminal`, exponiert als `./Kiosk` mit `defineKioskModule`). `GET /api/core/modules/kiosk/:path` (ohne Anmeldung) nennt nur Modul, Federation-Name und Einstieg; ist das Modul inaktiv, `404 modules.inactive`.

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

**Ersteinrichtung.** Solange es keinen (nicht technischen) Benutzer gibt, nimmt `POST /api/core/setup` die Einrichtung an, aber nur mit dem Einrichtungsschlüssel (`setupToken`): dem Wert von `FORGA_SETUP_TOKEN` oder einem Zufallswert, den der Server beim Start ins Protokoll schreibt (Vergleich in konstanter Zeit, falscher Schlüssel: `403` `setup.invalidToken`, Audit `setup.invalid-token`). Gleichzeitige Aufrufe sind über eine Datenbanksperre serialisiert; nur der erste legt an. Der Aufruf legt Folgendes an:
- den Namen der Feuerwehr (Einstellung `brigade`)
- die Standardrollen aus den Rollenvorlagen, mit Namen und Beschreibung auf Deutsch und Englisch (siehe unten)
- den ersten Benutzer mit E-Mail-Adresse und der Rolle aus der Vorlage `administrator` (Muster `*`) für die Gesamtwehr

Danach ist der Benutzer angemeldet, und der Endpunkt antwortet mit `409`.

**Anmeldung**
- Benutzername und Passwort. Das Passwort wird mit scrypt gehasht (Format `scrypt$N$r$p$salz$hash`); häufige und persönliche Passwörter werden abgelehnt ([Datenschutz](datenschutz.md#passwörter-und-anfragebegrenzung-l24)). Für unbekannte Benutzernamen rechnet der Server gegen einen Dummy-Hash, damit die Antwortzeit nichts verrät. `POST /api/core/login` braucht wie jede ändernde Anfrage ohne Token die Kopfzeile `x-forga: 1`.
- Die Sitzung ist ein Zufallswert im Cookie `forga_session` mit `HttpOnly` und `SameSite=Lax`; sie gilt höchstens 14 Tage und endet ohne Bedienung nach der Leerlaufzeit (60 Minuten für privilegierte Konten, sonst 8 Stunden). Nur mit „Angemeldet bleiben“ (`remember`, Konten ohne privilegierte Rechte) bleibt das Cookie 14 Tage, sonst ist es ein Sitzungs-Cookie des Browsers ([Sitzungen](datenschutz.md#sitzungen-l16)). `Secure` wird gesetzt mit `FORGA_SECURE_COOKIES=true`, bei einer Anfrage über HTTPS oder sobald die Adresse von f.orga eine `https://`-Adresse ist (`CookiePolicy`). Sicherheitsheader, Stufen des Systems und Schutz der Gesundheitsdaten: [Datenschutz](datenschutz.md).
- In der Datenbank (`core.session`) liegt nur der SHA-256 des Werts.
- Nach 5 Fehlversuchen ist der Benutzername 1 Minute gesperrt (`429`), und zwar nur für die Absenderadresse der Versuche (Schlüssel Benutzername + Adresse), damit niemand fremde Konten aussperrt. Die Adresse ist `req.ip`; hinter einem Reverse Proxy die des Benutzers nur mit `FORGA_TRUST_PROXY` (Express `trust proxy`, `applyTrustProxy`). Der Zähler liegt in der Datenbank (`RateLimits`, `core.rate_limit`, Schlüssel nur als Hash) und übersteht einen Neustart.
- Ändert ein Benutzer sein Passwort (`PUT /api/core/password`), enden seine anderen Sitzungen und alle offenen Links (Zurücksetzen, Einladung, E-Mail-Bestätigung). Setzt die Benutzerverwaltung ein Passwort oder sperrt den Benutzer, enden alle seine Sitzungen; ändert sie dabei die E-Mail-Adresse oder das Passwort, enden auch die offenen Links.
- Die eigene E-Mail-Adresse ändert der Benutzer im Profil (`PUT /api/core/profile` mit `email` und `currentPassword`; ohne richtiges Passwort `401` `auth.passwordRequired`; nicht während einer Impersonation). Eine neue Adresse gilt erst nach Bestätigung: Der Server schickt an sie einen Link `…/confirm-email?token=…` (24 Stunden gültig, gleicher Speicher wie „Passwort zurücksetzen“, `purpose: email`), die Seite bestätigt mit `POST /api/core/email-confirmation` (`{ token }`, ohne Anmeldung). Dann gilt die Adresse, alle anderen offenen Links des Benutzers enden, die alte Adresse bekommt einen Hinweis (Audit `auth.email-change-requested`, `auth.email-changed`). `GET /api/core/session` liefert die wartende Adresse als `pendingEmail`. Entfernen (`email: null`) braucht ebenfalls das Passwort und gilt sofort.
- Eine E-Mail-Adresse gehört zu höchstens einem aktiven, nicht technischen Benutzer (Groß-/Kleinschreibung egal): Benutzerverwaltung `409` `users.emailTaken`, Profil `auth.emailTaken`, Einladungen überspringen solche Personen (`emailTaken`).
- Rechte deaktivierter Module zählen nicht, weder für Sitzungen noch für API-Tokens: Ihre Listen, Importprofile, Suchtreffer und Fristen verschwinden mit dem Modul. Der Vollexport und die Auskunft je Person enthalten ihre Daten weiterhin (gespeichert ist gespeichert). Die Prüfungen gegen Rechteausweitung (siehe unten) rechnen dagegen mit allen Rechten, auch denen deaktivierter Module.

**Anmeldung mit dem Konto der Gemeinde (OIDC).** Optional zusätzlich zum Passwort, Einstellung `oidc` (Aussteller, Client-ID, Client-Secret als geheimes Feld, Scopes, Verknüpfung über `email` oder `username` = nur manuell, Beschriftung de/en), Bibliothek `openid-client`.
- `GET /api/core/setup` liefert `oidc: { label }`, wenn eingeschaltet, vollständig und die Adresse von f.orga bekannt ist; die Anmeldeseite zeigt dann den Knopf.
- `POST /api/core/settings/oidc/test` (`core.settings.manage`) lädt mit den gespeicherten Einstellungen die Konfiguration des Anbieters und liefert Aussteller und Rücksprungadresse. Ist der Anbieter nicht erreichbar oder der Aussteller falsch: `502` `auth.oidcDiscoveryFailed` (auch beim Anmelden), unvollständig: `auth.oidcIncomplete`, ohne Adresse: `auth.oidcNoPublicUrl`.
- `GET /api/core/oidc/start` leitet zum Anbieter (Authorization Code mit PKCE, `state`, `nonce`). Die offene Anmeldung liegt 10 Minuten im Speicher des Prozesses, gefunden über das Cookie `forga_oidc` (`HttpOnly`, Pfad `/api/core/oidc`).
- `GET /api/core/oidc/callback` prüft State, Nonce und ID-Token (Signatur über JWKS, Aussteller, Zielgruppe) und öffnet eine normale Sitzung. Die Rücksprungadresse ist `<brigade.publicUrl bzw. FORGA_PUBLIC_URL>/api/core/oidc/callback`, nie aus Kopfzeilen der Anfrage; ohne Adresse ist OIDC aus.
- Nur vorhandene, aktive, nicht technische Benutzer melden sich an; Rollen und Rechte bleiben in f.orga. Die erste Anmeldung verknüpft das Konto (`core.user.oidc_subject` = `issuer|sub`) über die E-Mail-Adresse, wenn der Anbieter sie bestätigt hat (`email_verified: true`, genau ein Treffer); danach zählt nur die Verknüpfung. Mit `matchBy: username` wird nie automatisch verknüpft (`auth.oidcLinkManually`), weil `preferred_username` weder eindeutig noch bestätigt ist; die Einstellungsseite sagt das.
- Privilegierte Benutzer werden nie automatisch verknüpft (`auth.oidcLinkManually`, `isPrivileged`): irgendeine `core.*`-Berechtigung (also auch `*`) oder eine Berechtigung `….manage` für die Gesamtwehr, jeweils auch aus deaktivierten Modulen. Sie verknüpfen ihr Konto selbst im Profil: `POST /api/core/oidc/link` (Sitzung mit CSRF-Header, keine Impersonation) liefert die Adresse beim Anbieter; der Rücksprung verknüpft den angemeldeten Benutzer und leitet auf `/profile?oidcLinked=1` (Audit `users.oidc-linked`). Ein schon anderweitig verknüpftes Konto des Anbieters wird abgelehnt (`auth.oidcLinkedElsewhere`).
- `DELETE /api/core/users/:id/oidc` löst die Verknüpfung (Benutzerverwaltung, nur für Benutzer mit nicht mehr Rechten als der eigene).
- Fehler leiten auf `/?oidcError=<code>` (`auth.oidcDisabled`, `auth.oidcDiscoveryFailed`, `auth.oidcExpired`, `auth.oidcFailed`, `auth.oidcUnknownUser`, `auth.oidcLinkManually`, `auth.oidcLinkedElsewhere`), die Anmeldeseite zeigt den Text; Fehlschläge stehen im Audit-Log (`auth.oidc-failed`).
- Aussteller über `http://` sind nur auf `localhost` erlaubt (Entwicklung, Tests).

**Passwort zurücksetzen.** `POST /api/core/password-reset` (`{ login }`: Benutzername oder E-Mail) schickt einen Einmal-Link `…/reset-password?token=…`, eine Stunde gültig (`core.password_reset`, nur der SHA-256 des Tokens).
- Die Antwort ist immer `{ ok: true }` und gleich schnell: Suche, Link und Versand laufen nach der Antwort, Versandfehler stehen nur im Protokoll. So verrät sie nicht, ob es das Konto gibt.
- Ein Benutzername gewinnt; eine E-Mail-Adresse muss genau ein aktives Konto treffen (Groß-/Kleinschreibung egal). Teilen sich mehrere Konten die Adresse, wird keines zurückgesetzt (Audit `auth.password-reset-ambiguous`).
- Begrenzung in der Datenbank (`RateLimits`): je Absenderadresse 20 Anfragen in 15 Minuten (danach `429` `auth.resetRateLimited`), je Konto höchstens drei Links in 15 Minuten (weitere werden still verworfen, Audit `auth.password-reset-limited`).
- `POST /api/core/password-reset/confirm` setzt das neue Passwort und beendet alle Sitzungen und anderen offenen Links des Benutzers; Links zur E-Mail-Bestätigung setzen kein Passwort. Die Adresse im Link kommt nur aus der Einstellung `brigade.publicUrl` oder der Umgebungsvariable `FORGA_PUBLIC_URL`, nie aus Kopfzeilen der Anfrage. Ist keine gesetzt, antwortet der Endpunkt mit `503` (`auth.resetNotConfigured`) und verschickt nichts.

**Einladungen.** Statt ein Passwort zu vergeben, lädt die Benutzerverwaltung Personen ein:
- `POST /api/core/users/invitations` (`personId`, optional `username`, `language`, `roles`) legt den Benutzer ohne Passwort an. Name und E-Mail-Adresse kommen aus der Personalakte (über den `OrganizationDirectory`, siehe unten), der Benutzername ist der Teil der Adresse vor dem `@` (bei Bedarf mit Nummer). Die Person bekommt einen Link zum Festlegen des Passworts, 7 Tage gültig (gleicher Mechanismus wie „Passwort zurücksetzen“). Bevor etwas angelegt wird, prüft der Server Adresse von f.orga (`503` `auth.resetNotConfigured`) und E-Mail-Versand (Server und Absender, `mail.notConfigured`); ohne E-Mail-Adresse der Person: `users.personWithoutEmail`. Benutzer, Rollen und Link entstehen in einer Transaktion mit dem Versand: Scheitert die E-Mail (`502` `mail.*`), bleibt kein Benutzer ohne Einladung zurück.
- `POST /api/core/users/invitations/bulk` (`personIds`, `roles`) lädt mehrere Personen mit denselben Rollen ein, jede für sich, und meldet übersprungene mit Grund (`unknownPerson`, `hasUser`, `noEmail`, `emailTaken`, `usernameTaken`, `forbidden`, `mailFailed` mit `code`); nach einem Fehler des Mail-Servers selbst (nicht erreichbar, Anmeldung, TLS) werden die übrigen ohne weiteren Versuch als `mailFailed` gemeldet (Audit `users.invitations-skipped`). Die Oberfläche zeigt danach, wer warum nicht eingeladen wurde.
- `POST /api/core/users/:id/invitation` schickt die Einladung erneut, solange kein Passwort gesetzt ist; frühere Links enden. Benutzer liefern dafür `passwordSet`; die Oberfläche zeigt „eingeladen“.
- Audit `users.invited`.

**Impersonation („Anmelden als“).** Wer `core.users.impersonate` hat, kann über `POST /api/core/users/:id/impersonate` mit Grund als ein anderer Benutzer arbeiten, z. B. um zu prüfen, was ein Gruppenführer sieht.
- Erlaubt nur für aktive, nicht technische andere Benutzer, deren Rechte der Administrator selbst vollständig hat (sonst `auth.impersonationWider`). Impersonation erweitert also nie die eigenen Rechte. Keine verschachtelte Impersonation, kein Passwortwechsel währenddessen.
- Es entsteht eine eigene Sitzung (`core.session` mit `impersonator` und `impersonation_reason`) für höchstens 60 Minuten. Die eigene Sitzung bleibt im Cookie `forga_session_original` und wird mit `POST /api/core/impersonation/end` wiederhergestellt; Abmelden beendet beide.
- Beginn und Ende stehen im Audit-Log (`auth.impersonation-started` mit Grund, `auth.impersonation-ended`). Während der Impersonation tragen Audit- und Historieneinträge zusätzlich `impersonatorId`; Historie und Audit-Log zeigen „Administrator als Benutzer“.
- `GET /api/core/session` liefert dann `impersonator` (Name, Ende). Die Shell zeigt auf jeder Seite einen Hinweis mit „Zurück zu meinem Konto“; in der Benutzerverwaltung steht „Anmelden als …“.

**Auth-Guard.** Der Guard ist global. Ohne `@Public()` braucht jeder Endpunkt eine Anmeldung, über das Sitzungs-Cookie oder `Authorization: Bearer <token>`.

**Zweiter Faktor (Step-up).** Berechtigungen mit `stepUp` (Verwaltung, sensible Personendaten, Eignungsuntersuchungen, Datensicherung, Datenschutz) und Endpunkte mit `@StepUp()` wirken nur in einer Sitzung, die in den letzten 30 Minuten mit dem zweiten Faktor (TOTP) bestätigt wurde; sonst `403` `auth.stepUpRequired`. Einzelheiten in [datenschutz.md](datenschutz.md#zweiter-faktor-bei-sensiblen-daten-step-up).

**Schnittstellen für den Datenschutz.** Der Core bringt die Sicherheit selbst mit (Step-up, Sitzungen, HTTPS, Anfragebegrenzung, Passwortregeln, Verschlüsselung, Aufbewahrungsplan). Für die Verwaltung des Datenschutzes stellt er Schnittstellen mit optionalem Anbieter bereit, die das Modul [Datenschutz](#modul-datenschutz-privacy) belegt; ohne aktives Modul wirken sie nicht (`libs/core/core-api/src/lib/privacy/`):
- `ProcessingRestrictions` (`restrictedIds(ids?)`, `isRestricted(id)`, `register({ module, restrictedIds })`): wer eingeschränkt ist (Art. 18). Genutzt von der Personensuche und den Listen der Stammdaten (`PersonsService.notRestricted`, `PERSON_DIRECTORY.isRestricted`/`restrictedIds`), der globalen Suche und dem `DeadlineRegistry`. `assertNotRestricted(user, restricted)` öffnet die Seiten einer eingeschränkten Person mit `RESTRICTED_PERSONS_PERMISSION` (`privacy.manage`), `refuseRestricted` lehnt neue Einträge ab. Ohne Anbieter ist niemand eingeschränkt.
- `AccessLog` (`registerArea`, `record`, `areaLabel`): Module melden Lesezugriffe auf besonders geschützte Daten; der Core reicht sie an den Anbieter weiter (`registerRecorder`). Ohne Anbieter wird nichts protokolliert. Bereich des Core: `core.export`.
- `Consents` hinter dem Token `CONSENTS` (`ConsentLookup`: `has`, `withEffect`; Wirkungen `CONSENT_EFFECTS`): ohne Anbieter keine Einwilligungsverwaltung, `has` ist `false`, `withEffect` liefert alle Personen.
- `ProtocolRegistry` (Protokolle für die Hilfen bei Datenpannen; der Core meldet das Audit-Log `core.audit` über `CoreProtocols`), `LockdownRegistry` (Geräteschlüssel der Module sperren), `TechnicalMeasureRegistry` (der Core meldet seine Maßnahmen über `CoreMeasures`), `ProcessorRegistry`, `ThirdPartyRegistry`, `RetentionTexts`: Module melden dort, auch wenn das Modul Datenschutz fehlt.
- `OnboardingRegistry` (`register({ module, items })`): weitere Schritte der Einrichtungsliste je aktivem Modul.
- Das Manifestfeld `privacy: { personData, activities }` und die Startprüfung `assertPersonDataComplete` (in `ForgaCoreModule.onApplicationBootstrap`) gehören zum Modulvertrag des Core; die Tätigkeit des Core ist `core.accounts` (`CORE_ACTIVITIES`).

**CSRF.** Anfragen mit Sitzungs-Cookie und einer ändernden Methode (`POST`, `PUT`, `DELETE`) müssen den Header `x-forga: 1` tragen, sonst kommt `403`. Der API-Client im `web-sdk` setzt ihn immer.

**Rechte**
- Berechtigungen haben einen Geltungsbereich: `brigade` (Gesamtwehr) oder `department`. Der Core bringt eigene mit (`CORE_PERMISSIONS`), die Module deklarieren ihre im Manifest.
- Rollen enthalten Berechtigungs-IDs oder Muster:
  - `*` steht für alles.
  - `masterdata.*` steht für alles eines Moduls.

  Unbekannte Muster werden abgelehnt.
- Eine Rollenzuweisung gilt für die Gesamtwehr (`departmentId: null`) oder für eine Abteilung. Bei einer Zuweisung für eine Abteilung wirken nur Berechtigungen mit Bereich `department`, und zwar auch in allen Abteilungen darunter (`parentId`, rekursiv): Der Abteilungskommandant einer Einsatzabteilung ist damit auch für deren Jugendfeuerwehr und Altersabteilung zuständig (Personen lesen und bearbeiten, Übernahmen, gemeinsame Dienste planen).
- Die Hierarchie kennt der Core nicht selbst: Das Stammdatenmodul meldet beim Start einen Anbieter am `OrganizationDirectory` an (`libs/core/core-api/src/lib/security/organization-directory.ts`) mit Abteilungen und Oberabteilung, Personen (Name, E-Mail) und der Zahl der Katalogeinträge. Der Core prüft damit auch Verweise der Benutzerverwaltung (Abteilung einer Rollenzuweisung: `users.unknownDepartment`; verknüpfte Person: `users.unknownPerson`). Eine Person gehört zu höchstens einem Benutzer (`users.personTaken`, eindeutiger Index auf `core.user.person_id`); die Benutzerverwaltung bietet nur Personen ohne Benutzer an. Ohne Stammdatenmodul entfallen diese Prüfungen.
- **Benutzer mit Personen verknüpfen.** Der verknüpfte Benutzer liest und ändert die eigenen Daten der Person samt sensibler Felder (`/api/masterdata/me`). Wer einen Benutzer mit einer Person verknüpft (Anlegen, Ändern, Einladen), braucht deshalb die Berechtigung, die der Anbieter nennt (`linkPermission`, beim Stammdatenmodul `masterdata.persons.sensitive`), in einer Abteilung der Person oder für die Gesamtwehr (`403` `users.personForbidden`, bei Masseneinladungen `forbidden`). Die Verknüpfung des eigenen Kontos ändert niemand, auch kein Administrator (`users.cannotRelinkSelf`). Jede Änderung steht im Audit-Log (`users.person-linked` mit `previousPersonId` und `personId`). Lösen braucht kein weiteres Recht.
- Jede Berechtigung einer Rolle gilt entweder **im zugewiesenen Bereich** (`permissions`: die Abteilung der Zuweisung bzw. die Gesamtwehr) oder **in allen Abteilungen** (`permissionsAllDepartments`: immer für die Gesamtwehr, auch bei Zuweisung für eine Abteilung). Beispiel: Der Abteilungskommandant bearbeitet Personen (mit sensiblen Daten), Fahrzeuge und Lehrgänge seiner Abteilung und sieht von den anderen Abteilungen nur das Personenverzeichnis (`masterdata.persons.directory`).
- `POST /api/core/roles/:id/apply-template` setzt eine Standardrolle auf die Rechte ihrer Vorlage zurück, z. B. nachdem ein Update neue Standardrechte gebracht hat.
- `@RequirePermissions(...)` verlangt die Berechtigung in mindestens einer Abteilung. Die Prüfung für eine bestimmte Abteilung macht der Handler mit `user.can(berechtigung, departmentId)`.

**Rollenvorlagen** (`RoleTemplates`, `libs/core/core-api/src/lib/security/role-templates.ts`)
- Der Core bringt die Standardrollen mit (`CORE_ROLE_TEMPLATES`): `administrator` (`*`), `commander`, `department-commander`, `group-leader`, `course-coordinator`, `breathing-apparatus-officer`, `equipment-officer`, `administration`, `member`. Namen und Beschreibungen sind `LocalizedText`.
- Module ergänzen im Manifest unter `roles` ihre Berechtigungen zu diesen Schlüsseln oder führen neue Schlüssel mit eigenem Namen ein. Vorlagen mit gleichem `key` werden zusammengeführt (Vereinigung der Berechtigungen), unabhängig von der Reihenfolge der Module; so ergänzen Module auch die Rolle eines anderen Moduls (z. B. `clothing-officer` um `training.self`). Ergänzungen zu einem Schlüssel, den keine Vorlage benennt (Modul nicht installiert), entfallen.
- Ergebnis der Grundausstattung:

  | Schlüssel | Rolle (de) | Berechtigungen |
  | --- | --- | --- |
  | `administrator` | Administrator | `*` |
  | `commander` | Kommandant | `core.audit.read`, `masterdata.*`, `incidents.*` |
  | `department-commander` | Abteilungskommandant | in der eigenen Abteilung Personen lesen, schreiben, sensible Daten, Organisation, Lehrgänge planen, Führerscheine kontrollieren; Einsatzberichte lesen und schreiben; in allen Abteilungen das Personenverzeichnis |
  | `group-leader` | Gruppenführer | `masterdata.persons.read`, `incidents.reports.read`, `incidents.reports.write` |
  | `course-coordinator` | Lehrgangsbeauftragter | `masterdata.persons.read`, `masterdata.courses.plan` |
  | `breathing-apparatus-officer` | Atemschutzgerätewart | `masterdata.persons.read`, `incidents.reports.read` |
  | `equipment-officer` | Gerätewart | `masterdata.persons.read` |
  | `administration` | Verwaltung / Kasse | Personen lesen und sensible Daten, `incidents.reports.read`, `incidents.compensation.export`, `incidents.statistics`, `duty-officer.read`, `duty-officer.roster.manage` |
  | `duty-officer` | Einsatzleiter vom Dienst | `duty-officer.read`, `duty-officer.reports.write`, `incidents.reports.read` und `masterdata.persons.directory` (je in allen Abteilungen), `incidents.self` |

- Rollen haben Name und Beschreibung auf Deutsch und Englisch (`LocalizedText`); die Oberfläche zeigt sie in der Sprache des Benutzers. Ein Name ist in jeder Sprache eindeutig, ohne Groß-/Kleinschreibung (`roles.nameTaken`). Die API nimmt für `name` und `description` auch einen einzelnen Text an, der dann für beide Sprachen gilt.
- Rollen aus Vorlagen tragen das Feld `templateKey` und die Namen der Vorlage in beiden Sprachen. Jede Vorlage wird höchstens einmal angelegt; ist einer ihrer Namen schon von einer anderen Rolle belegt, wird die Vorlage übersprungen.
- `POST /api/core/roles/templates` legt fehlende Standardrollen nachträglich an, z. B. nach dem Hinzufügen eines Moduls (Audit `roles.templates-created`). Angelegte Rollen sind danach normale, änderbare Rollen.
- Beim Start ergänzt der Server die Berechtigungen aus den Rollenvorlagen jedes Moduls in den bestehenden Rollen mit gleichem Vorlagenschlüssel, und zwar jede Berechtigung nur einmal (`ModuleStateService.onApplicationBootstrap`). Welche schon ergänzt wurden, steht je Modul in `core.module.granted_templates`. So kann z. B. der Kommandant ein neu installiertes Modul sofort nutzen, und neue Rechte eines Modul-Updates kommen hinzu; vom Administrator entfernte Rechte kommen nicht wieder. Ein Modul, das schon vor dieser Buchführung installiert war (Zeile ohne `granted_templates`), schreibt beim ersten Start nur den aktuellen Stand als Ausgangspunkt fest und ergänzt nichts.

**API-Tokens**
- Format `forga_<zufall>`. Gespeichert werden nur der SHA-256 und ein Präfix zum Wiedererkennen.
- Jedes Token bekommt einen eigenen technischen Benutzer. So zeigt die Historie, welches System etwas geändert hat.
- Ein Token hat genau die Berechtigungen seiner `scopes`, immer für die Gesamtwehr. Empfänger/System, Zweck und ein Ablaufdatum (höchstens 2 Jahre) sind Pflicht, erlaubte Adressen optional; Erinnerung 30 Tage vor dem Ablauf ([API-Tokens](datenschutz.md#api-tokens-l23)).
- Verwaltungsrechte (`core.*`) gibt es für Tokens nicht (`tokens.coreScopes`), und ein Token bekommt nur Rechte, die sein Ersteller selbst für die Gesamtwehr hat (`tokens.scopesWider`).
- Rechte, die im Manifest als `privileged` markiert sind (z. B. `backup.manage`: ganzen Datenbestand herunterladen und ersetzen), gibt es für Tokens ebenfalls nicht (`tokens.privilegedScopes`); auch ein Muster im Token gewährt sie nicht.
- Ebenso Rechte mit `stepUp` (`tokens.stepUpScope`), außer mit `tokenAllowed: true` im Manifest; ältere Tokens mit solchen Bereichen wirken dafür nicht mehr (`inactiveScopes`).
- Die Liste der Berechtigungen (`GET /api/core/permissions`) lesen Rollen- und Token-Verwalter (`core.roles.manage` oder `core.tokens.manage`).
- Beim Widerruf werden das Token und sein Benutzer gesperrt. Die letzte Nutzung wird mitgeschrieben.

**Audit.** `core.audit` protokolliert:
- Einrichtung, Anmeldungen und fehlgeschlagene Anmeldungen, Passwortänderungen
- zweiter Faktor: Step-up, falsche Codes, Einrichten, neue Wiederherstellungscodes, Zurücksetzen durch einen Administrator
- Anlegen, Einladen und Ändern von Benutzern und Rollen
- Tokens
- Aktivieren und Deaktivieren von Modulen

`GET /api/core/audit` (`core.audit.read`) filtert auf dem Server: `from`/`to` (Tage in Europe/Berlin), `userId` (auch als Impersonator), `action` (genau oder als Präfix mit `.` am Ende, z. B. `users.`), `q` (Wörter in Aktion oder Details), `limit` (höchstens 1000). Jeder Eintrag bringt `userName` und `impersonatorName` mit, sodass auch Leser ohne Benutzerverwaltung Namen sehen. `GET /api/core/audit/filters` liefert die vorkommenden Aktionen und Benutzer für die Auswahlfelder.

**Lesbare Audit-Einträge.** Details speichern IDs (z. B. `personId`); angezeigt werden Namen:
- Core und Module melden in `onModuleInit` beim `AuditReferenceRegistry` je Art von Datensatz, welche Detail-Schlüssel ihre IDs tragen und wie sie aufgelöst werden: `register('masterdata.person', { keys: ['personId', 'previousPersonId'], resolve(ids, user) })`. Der Resolver liefert je gefundener ID `{ label, to? }`; `label` ist Text oder `LocalizedText`, `to` die Seite in der Shell und nur gesetzt, wenn der Betrachter sie öffnen darf. Optional `actions` (genau oder Präfix mit `.`) beschränkt die Art auf Aktionen, z. B. `listId` bei `lists.` (Liste) und bei `promotions.` (Beförderungsliste); eine so beschränkte Art geht der allgemeinen vor. Ohne `uuid: false` werden nur UUIDs aufgelöst.
- `GET /api/core/audit` löst die IDs aller Einträge der Seite gesammelt auf, ein Aufruf je Art (kein N+1), auch in Listen und verschachtelten Objekten (z. B. `roles[].roleId`, `promotions[].personId`) und bei Anhängen über `ownerType`/`ownerId`. Jeder Eintrag bringt `references` mit, nach ID: `{ kind, label, to?, anonymized? }`. Kennt der Resolver eine ID nicht, ist `label` `null` (gelöscht); anonymisierte Personen kommen mit `anonymized: true` ohne Namen. Schlägt ein Resolver fehl, bleiben seine IDs unaufgelöst.
- Registriert sind: Core (Benutzer `userId`/`targetId`, Rolle, API-Token, Modul `moduleId`/`module`, Liste, Importprofil), Stammdaten (Person „Nachname, Vorname“, Abteilung, auch `departmentIds`, `departmentsBefore`/`departmentsAfter` und `from`/`to` bei `masterdata.department-moved`, Gerätehaus, Fahrzeug, Transponder des Führerscheins als Endung der Kennung bei `masterdata.license-token-*`), Einsatzberichte (Bericht „Nummer · Abteilung“, Einsatz mit Einsatznummer), Dienste (Titel und Tag), Entschädigungen und MP-Feuer (je `runId`, nach Aktion getrennt; MP-Feuer auch in `imports.applied`), Beförderungen, Kostenersatz (Bescheidnummer), Infoterminal, Geräte (Gerät, Mangel).
- Die Audit-Seite zeigt die Aktion mit ihrem Namen, den technischen Code beim Überfahren. Details stehen untereinander als „Bezeichnung: Wert“: Bezeichnungen aus `<modul>:audit.keys.<schlüssel>`, sonst `shell:audit.keys.<schlüssel>`, sonst der Schlüssel grau; Aktionen ebenso aus `audit.actions.<code>`. Verweise erscheinen mit Namen (verlinkt, wenn `to` gesetzt ist), „anonymisiert“ oder „gelöscht (ID …)“; die ID steht beim Überfahren. Datumswerte werden formatiert, Wahrheitswerte als ja/nein. Eine Exportfunktion für das Audit-Log gibt es nicht; der Vollexport enthält die Einträge unverändert mit IDs.

**Modulverwaltung**
- Die Tabelle `core.module` speichert, ob ein Modul aktiv ist. Ohne Eintrag gilt es als aktiv.
- Aktivieren setzt aktive Abhängigkeiten voraus. Deaktivieren ist nur möglich, wenn kein aktives Modul das Modul benötigt.
- Eine Middleware beantwortet Anfragen an `/api/<modul-id>/…` inaktiver Module mit `404` (`modules.inactive`). Sie vergleicht den Pfadabschnitt dekodiert und ohne Groß-/Kleinschreibung wie das Routing von Express (`/api/Cost-Recovery/…` ist gesperrt wie `/api/cost-recovery/…`). `GET /api/core/modules` liefert nur aktive Module.

**Historie lesen.** Entscheidet die Prüfung aus der `HistoryAccessRegistry` (siehe [Historie](#historie)); ohne Prüfung wird abgelehnt. Core: Benutzer mit `core.users.manage`, Rollen mit `core.roles.manage`, Einstellungen mit `core.settings.manage` oder `<modul>.settings.manage` für die Abschnitte des Moduls.

**Keine Rechteausweitung.**
- Alle diese Vergleiche rechnen auf beiden Seiten mit allen registrierten Rechten, auch denen deaktivierter Module (`AuthService.widerThanActor`). Sonst gälten Rechte eines abgeschalteten Moduls nie als „weiter“, und wer Rollen oder Tokens verwaltet, könnte sie vergeben; nach dem Aktivieren wirkten sie.
- Wer Benutzer verwaltet, darf nur Rollen zuweisen, deren Rechte er selbst im selben Bereich hat (`users.roleWider`). Einen Benutzer ändern (Passwort, E-Mail, Sperre, Rollen, OIDC-Verknüpfung, Einladung erneut senden) darf er nur, wenn dieser keine Rechte hat, die ihm selbst fehlen (`users.targetWider`); so übernimmt `core.users.manage` kein Administratorkonto.
- Wer Rollen verwaltet, darf einer Rolle nur Rechte hinzufügen, die er selbst für die Gesamtwehr hat; das gilt auch für „Vorlage übernehmen“ und das Löschen einer Rolle (`users.roleWider`).
- Gleiches gilt für die Impersonation (`auth.impersonationWider`) und API-Tokens.
- Nach jeder Änderung von Benutzern und Rollen muss mindestens ein aktiver Benutzer `*` für die Gesamtwehr behalten (`users.lastAdministrator`): `*` aus der letzten Administratorrolle nehmen, sie löschen, dem letzten Administrator (auch sich selbst) die Rolle nehmen oder ihn sperren wird abgelehnt und zurückgerollt.

**Gleichzeitiges Bearbeiten.** Einsatzbericht, Personalakte, Dienst und Gerät schicken beim Speichern die geladene `version` mit. Hat jemand anderes inzwischen gespeichert, antwortet der Server mit `409` (`conflict.stale`, `assertVersion` in `core-api`), statt dessen Änderung zu überschreiben. Ohne `version` (Importe, API) entfällt die Prüfung; nur `PUT /incidents/reports/:id` verlangt sie immer (`ReportUpdate`).

**Hochgeladene Dateien.** Wappen und Briefkopf müssen zum angegebenen Bildtyp passen (Signatur bzw. SVG-Dokument). Ausgeliefert werden sie mit `X-Content-Type-Options: nosniff` und einer Content-Security-Policy mit `sandbox`, sodass Skripte in einem SVG auch beim direkten Öffnen nicht laufen.

**Zeitzone.** Tagesgrenzen von Zeiträumen (Listen, Statistik, Exporte, Suchfilter) gelten in Europe/Berlin, unabhängig von der Zeitzone des Servers (`berlinDayStart`, `berlinDayAfter`, `berlinDayEnd`; `addBerlinDays` hält bei Serien die Uhrzeit über die Zeitumstellung). Das Frontend nimmt für „heute“ `localDate()` aus `web-sdk`.

**Fehler.** Fehlerantworten tragen einen maschinenlesbaren `code`, z. B. `auth.invalidCredentials` oder `modules.requiredByActive`, und bei Bedarf Details. Validierungsfehler kommen als `validation.failed` mit `issues` (`path`, `code`, `message`); die Oberfläche nennt die betroffenen Felder (`ApiError.fields`, Feldnamen aus `fields.<name>` der Übersetzungen, sonst der Pfad). Scheitert der E-Mail-Versand, antwortet der Server mit `502` und `mail.authFailed`, `mail.connectionFailed`, `mail.tlsFailed`, `mail.rejected` oder `mail.sendFailed`.

## Ereignisse zwischen Modulen

- `DomainEvents` im Core ist ein Ereignisbus im selben Prozess (`libs/core/core-api/src/lib/events/domain-events.ts`).
- Ein Modul ruft `publish(name, payload)` erst nach dem `flush`, also nach dem Commit seiner Änderung.
- Andere Module melden sich mit `subscribe(name, handler)` an. Die Handler laufen nacheinander. Schlägt einer fehl, versucht der Bus es einmal erneut. Schlägt er wieder fehl, steht das im Audit-Log (`events.handler-failed` mit Ereignis, Fehler und Daten) und als Aufgabe bei allen mit `core.audit.read`; weder der Aufrufer noch andere Handler sind betroffen. Einsatzberichte, Einsatzleiter vom Dienst und Dienste können ihre Ereignisse für einen Zeitraum erneut senden (siehe [Entschädigungen](#modul-entschädigungen-compensation)).

## Einstellungen

- Einstellungen liegen als JSON je Abschnitt in `core.setting`:
  - Der Core bringt `brigade` (Name, Anschrift, Kontakt), `smtp`, `reminders` (Sammel-E-Mail), `oidc`, `security` (Sitzungen, E-Mails) und `retention` (Aufbewahrungsplan) mit.
  - Module registrieren eigene Abschnitte unter `<modul-id>.<abschnitt>`.
- Werte werden gegen das Schema des Abschnitts geprüft.
- Das SMTP-Passwort und das OIDC-Client-Secret können nur geschrieben werden. Bleiben sie beim Speichern leer, gilt der gespeicherte Wert weiter. Mit `FORGA_SECRET_KEY` liegen sie verschlüsselt (`ENCRYPTED_SETTING_FIELDS`, [Verschlüsselung](datenschutz.md#verschlüsselung-l17)).
- Verwalter eines Abschnitts sind, wer `core.settings.manage` hat, bei den Abschnitten eines Moduls zusätzlich, wer `<modul-id>.settings.manage` hat (z. B. der Atemschutzgerätewart die Tauglichkeitsregel). Nur sie schreiben.
- Lesen darf jeder angemeldete Benutzer, weil Modul-Oberflächen die Einstellungen brauchen (z. B. `brigade`, `incidents.general`, `compensation.general`, `cost-recovery.general`). Ausnahmen (`SettingsAccess`): `smtp`, `oidc`, `retention`, `security` und `reminders` lesen nur die Verwalter (`CORE_SETTINGS_ACCESS`); Module melden eigene Einschränkungen in `defineModule({ settingsAccess })`, z. B. sieht das Feld `feedToken` von `training.general` (geheimer Teil der Kalender-Adresse) nur, wer die Einstellungen der Dienste verwaltet.
- `brigade.publicUrl` muss eine `https://`-Adresse sein (`http://` nur für `localhost`), `brigade.email` eine E-Mail-Adresse. Ein gespeicherter Wert, der eine spätere, strengere Regel verletzt, fällt beim Lesen auf den Standard zurück, statt den ganzen Abschnitt zu verlieren.

**Einrichtungsliste.** `GET /api/core/onboarding` (`core.settings.manage` oder `core.users.manage`) liefert, was auf einer neuen Installation noch fehlt: `publicUrl`, `smtp`, `departments` und `catalogs` (über den `OrganizationDirectory`), je aktivem Modul mit Einstellungen und Einstellungsseite `module:<id>` (erledigt, sobald ein Abschnitt des Moduls gespeichert ist; mit Beschriftung der Seite; nicht für Einstellungsseiten mit `onboarding: false`, z. B. MP-Feuer als Werkzeug für die Übergangszeit) und `users` (mehr als ein Benutzer), dazu die Schritte, die aktive Module über `OnboardingRegistry` melden (z. B. `privacyContacts`, `privacyTexts` des Moduls Datenschutz, mit `label`). Jeder Punkt nennt die Seite, auf der er erledigt wird. Die Startseite zeigt die offenen Punkte.

## Listen

- Module melden Listenvorlagen beim `ListRegistry` an (in `onModuleInit`). Die ID beginnt mit der Modul-ID, z. B. `masterdata.members`.
- Eine `ListDefinition` hat:
  - Name und Beschreibung als `LocalizedText`
  - die Berechtigung (`permission`), die der Benutzer in mindestens einer Abteilung braucht
  - Parameter (`parameters`, Typen `text`, `date`, `year`, `department`, `select`, `boolean`, `person`, `choice`) mit einem Zod-Schema (`schema`) für die Query-Werte. `person` wählt eine Person über die Namenssuche des Stammdatenmoduls (nur Personen, die der Benutzer sieht), `choice` einen Eintrag, den das Modul mit `choices(user, query, language)` anbietet (z. B. Dienste, Auszahlungsläufe, Beförderungslisten). Beide liefert `GET /api/core/lists/:id/parameters/:key/options?q=…` (`ListOption`: `value`, `label`, optional `description`; höchstens 50); der Wert bleibt die ID.
  - Spalten (`columns`) mit relativer Breite und Ausrichtung
  - optional eine Unterschriftenspalte (`signatureColumn`) und das Querformat (`orientation`)
  - optional die Art der Personendaten (`personalData`: `names`, `contact`, `sensitive`, `health`) und Zwecke (`purposes`: Schlüssel, Bezeichnung, die Spalten, die der Zweck braucht, und optional ein Recht), siehe [Zweck der Listen](datenschutz.md#zweck-der-listen-und-exporte-l11)
  - `rows(user, params, language, purpose)`: liefert die Zeilen und darf eigene Spalten (z. B. eine Matrix), einen Untertitel und die genannten Personen (`personIds`) setzen. Die Zeilen müssen die Rechte des Benutzers beachten.
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
- **Abteilungen:** `GET /api/core/lists` liefert je Liste `departments`: `brigade` oder die Abteilungen, in denen der Benutzer die Berechtigung der Liste hat. Ein Abteilungsparameter bietet nur diese an („Alle Ihre Abteilungen“ statt „Alle Abteilungen“, wenn er nicht alle sehen darf).
- **Sicherheit:** pdfmake lädt keine URLs. Lokal erlaubt sind nur die Namen der Standardschriften.
- Jeder Export steht im Audit-Log (`lists.exported`) mit Format, Zeilenzahl, Parametern, Zweck (`purpose`, bei „Anderer Zweck“ mit `purposeNote`) und, bei Listen über Personen, den IDs der genannten Personen (`ListContent.personIds`), damit sich bei einer Datenpanne die Betroffenen ermitteln lassen ([Datenpannen](datenschutz.md#datenpannen-l20)). PDF und Excel von Listen mit Personen tragen in der Fußzeile „Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten“ und unter dem Untertitel den Zweck.

## Fristen und Aufgaben

- Module melden einen `DeadlineProvider` beim `DeadlineRegistry` an. Er berechnet die Fristen bei jeder Abfrage aus den aktuellen Daten; gespeichert wird nichts. Liegt der neue Nachweis vor, verschwindet die Frist von selbst.
- Eine Frist (`DeadlineInput`) hat ID, Art (`kind`), Titel als `LocalizedText`, Gegenstand (`subject`: Typ, ID, Anzeigename, Personen als „Nachname, Vorname“), Fälligkeit (`dueOn`), Vorlauf (`leadDays`), Abteilungen (`departmentIds`), eine Berechtigung oder eine Liste von Berechtigungen (`permission`), optional Personen (`personIds`) und optional die Seite, auf der die Aufgabe erledigt wird (`to`, z. B. `/equipment/items/<id>`).
- Ohne `to` leitet die Shell den Link aus dem Typ des Gegenstands ab (`masterdata.person`, `incidents.report`, `equipment.item`, `clothing.item`, `training.session`, `compensation.item`, `core.audit`, `core.me`).
- Fristen inaktiver Module zählen nicht (`DeadlineRegistry` übergeht ihre Anbieter). Fristen über eine Person, deren Verarbeitung eingeschränkt ist, fallen weg (`ProcessingRestrictions`, Modul Datenschutz).
- Startseite und Glocke fassen Aufgaben gleicher Art und Fälligkeit zusammen („26 × Unterweisung · bis 29.11.“, aufklappbar); überfällige Aufgaben einer Art bilden eine Gruppe und stehen vorn. Die Startseite filtert nach Modul.
- **Zuständig** ist, wer die Berechtigung (bei einer Liste: eine davon) in einer der Abteilungen hat; jede Frist erscheint dabei einmal. Ohne Abteilungen sehen nur Benutzer mit der Berechtigung für die Gesamtwehr die Frist. Sind `personIds` gesetzt, ist zusätzlich nur zuständig, wessen Benutzer mit einer dieser Personen verknüpft ist (z. B. der Verfasser eines Berichts).
- **Sichtbar** wird eine Frist ab `dueOn − leadDays`. Stufen:
  - `upcoming`: im Vorlauf
  - `due`: fällig in den nächsten 7 Tagen
  - `overdue`: Datum überschritten
- `GET /api/core/tasks` liefert die Fristen des angemeldeten Benutzers, früheste zuerst, ohne die im Profil ausgeblendeten (`all=true` liefert alle). Ausblenden lassen sich ganze Module (`training`) oder Arten (`training:session-attendance`); die Auswahl steht in `core.user.hidden_tasks` (`PUT /api/core/profile` mit `hiddenTasks`, `GET /api/core/session` liefert sie) und gilt für Glocke und Startseite auf jedem Gerät, nicht für die wöchentliche E-Mail. Standard: alles sichtbar.
- **Sammel-E-Mail** (`DigestService`):
  - Einmal pro Woche erhält jeder aktive Benutzer mit E-Mail-Adresse, der sie nicht abbestellt hat (`receiveDigest`), eine E-Mail mit seinen Fristen in seiner Sprache. Benutzer ohne Fristen bekommen keine E-Mail. Fristen mit Gesundheitsbezug (`health`) stehen nur gezählt je Bereich darin, auf Wunsch alle Fristen (Einstellung `security`, siehe [Datenschutz](datenschutz.md#e-mails-ohne-gesundheitsbezug-l18-teil)). Fristen mit einer Gruppe (`DeadlineInput.group`, z. B. Geräte nach Kategorie und Fahrzeug) stehen eingerückt unter ihrer Überschrift, die übrigen davor.
  - Wochentag und Uhrzeit (Europe/Berlin) stehen in der Einstellung `reminders` (Standard Montag ab 7 Uhr, abschaltbar). Der Server prüft stündlich.
  - Jede E-Mail steht im Audit-Log als `reminders.digest-mail` (Stichtag, Benutzer). Ein erneuter Versuch nach einem Fehler schickt sie nicht doppelt. Erst wenn alle E-Mails durchgegangen sind, steht `reminders.digest-sent` mit dem Stichtag (`asOf`) im Audit-Log; daran erkennt der Server, dass am Tag schon verschickt wurde. Fehler der stündlichen Prüfung werden protokolliert und beenden den Prozess nicht.
  - `POST /api/core/tasks/digest` verschickt sofort an alle, auch an schon Benachrichtigte, z. B. zum Test der SMTP-Einstellungen.
- **Benachrichtigungen** (`Notifications`): sofortige E-Mails zu Ereignissen in der Sprache des Empfängers, mit Link auf die Seite in f.orga, wenn `brigade.publicUrl` oder `FORGA_PUBLIC_URL` gesetzt ist.
  - Empfänger sind aktive, nicht technische Benutzer mit E-Mail-Adresse, deren Rolle das Benachrichtigungsrecht (z. B. `equipment.defects.notify`) für die betroffene Abteilung oder die Gesamtwehr nennt, ausdrücklich oder über das Modul (`equipment.*`). Das globale `*` des Administrators zählt nicht, damit ein Administratorkonto nicht jede Meldung bekommt. Wer keine E-Mails will, bekommt eine Rolle ohne das Recht.
  - Jede verschickte Benachrichtigung steht mit den Empfängern im Audit-Log (z. B. `equipment.defect-notified`). Fehler beim Versand werden protokolliert und erreichen den Auslöser nicht.
- **Versand** (`MailService`) über den SMTP-Server aus der Einstellung `smtp`. Fehlen Server oder Absender, schlägt der Versand mit `mail.notConfigured` fehl; lehnt der Server ab oder ist er nicht erreichbar, mit `502` und einem `mail.*`-Code (`mailErrorCode`).
- Umgebungsvariablen: `FORGA_MAIL_TRANSPORT=memory` sammelt E-Mails nur im Speicher (Tests, Vorführung), `FORGA_DIGEST_SCHEDULER=off` schaltet den stündlichen Versand ab.

## Import

- Module melden Importprofile beim `ImportRegistry` an. Ein Profil (`ImportProfile`) hat Felder mit Pflichtangabe und weiteren Spaltenüberschriften (`aliases`), die automatisch zugeordnet werden, Optionen und die Funktion `run(rows, context)`.
- **Ablauf:**
  1. Datei hochladen (`.xlsx`, `.csv`/`.txt` oder `.ics`, höchstens 10 MB). Bei Excel zählt das erste Blatt, die erste Zeile enthält die Überschriften. CSV erkennt `;` oder `,`, ein BOM und Anführungszeichen. Leere Zeilen fallen weg.
     - Wiederholte Überschriften werden nummeriert, z. B. die zwei Spalten „Bezeichnung“ im MP-Feuer-Export zu „Bezeichnung“ und „Bezeichnung (2)“. Excel-Werte mit Datum und Uhrzeit behalten die Uhrzeit.
     - Kalenderdateien (`parseIcs`) werden zu einer Tabelle mit einer Zeile je Termin (`VEVENT`) und den Spalten `UID`, `SUMMARY`, `DTSTART`, `DTEND`, `DESCRIPTION`, `LOCATION`. Umbrochene Zeilen werden zusammengefügt. Ganztägige Termine ergeben `JJJJ-MM-TT`, lokale Zeiten `JJJJ-MM-TTThh:mm:ss`, UTC-Zeiten enden auf `Z`.
     - Statt einer Datei kann ein Kalender von einer Adresse geladen werden (siehe [Kalender von einer Adresse](#kalender-von-einer-adresse)); das Ergebnis ist dasselbe wie beim Hochladen einer `.ics`-Datei.
  2. Die Antwort enthält Überschriften, Zeilenzahl, die ersten fünf Zeilen und je Profil eine vorgeschlagene Zuordnung. Überschriften werden dafür normalisiert (Kleinschreibung, Umlaute umschrieben, nur Buchstaben und Ziffern).
  3. Probelauf (`preview`) mit Zuordnung und Optionen: Ergebnis je Zeile (`create`, `update`, `unchanged`, `error`) mit Meldungscodes, ohne Änderung (der Import des Einsatzpersonals läuft dafür in einer Transaktion, die immer zurückgerollt wird).
- Excel-Dateien werden vor dem Entpacken geprüft: Mehr als 100 MB entpackt oder ein unlesbares Zip ergibt `imports.fileTooLarge`.
- CSV-Ausgaben (Listen, Überweisungsdatei) setzen vor Texte, die mit `=`, `+`, `-`, `@` beginnen, ein Hochkomma, damit Tabellenprogramme sie nicht als Formel ausführen.
  4. Übernahme (`apply`): wie der Probelauf, aber gespeichert.
- Profile sind idempotent: Ein zweiter Lauf mit derselben Datei aktualisiert statt zu verdoppeln.
- Hilfsfunktionen: `parseDate` versteht `TT.MM.JJJJ`, `TT.MM.JJ` und `JJJJ-MM-TT`; Excel-Datumswerte kommen bereits als `JJJJ-MM-TT`. `parseLocalDateTime` macht aus `21.10.2026 13:05`, `2026-10-21 13:05` oder `2026-10-21T13:05:00` die lokale Form `2026-10-21T13:05:00`; `berlinTime` deutet sie in Europe/Berlin (mit Sommerzeit).
- Die hochgeladene Datei liegt bis zur Übernahme in `core.import_upload` und nur für den hochladenden Benutzer. Nach der Übernahme wird sie gelöscht, sonst nach 24 Stunden durch den täglichen Aufbewahrungslauf.
- Jede Übernahme steht im Audit-Log (`imports.applied`) mit Profil, Quelle, Dateiname und Zählern.
- **`ImportService.runRows`** (exportiert aus `core-api`) führt ein Profil im selben Prozess aus: Eingabe `user`, `profile`, `rows` (Feldschlüssel), `options` (fehlende mit Standardwert), `mappings`, `dryRun`, `source` und `mappingList`. Die Methode prüft das Recht des Profils (`404 imports.unknownProfile`) und die `mappings`, läuft über `ImportRegistry.run` und schreibt nach einer Übernahme `imports.applied`. Mit `mappingList: 'core'` liest und ergänzt sie die Zuordnungsliste des Tabellen-Imports (so nutzt sie der Dateiimport), mit `'none'` gibt der Aufrufer seine eigene Liste als `remembered` mit und merkt die zurückgegebenen `used` selbst (Modul MP-Feuer). Eine Zeilen-API über HTTP gibt es nicht.
- **Quelle** (`ImportContext.source`, `ImportSource`): `{ module: 'core' }` beim Tabellen-Import, `{ module: 'mp-feuer', runId }` bei Läufen des Moduls MP-Feuer. Profile können davon abhängen, z. B. setzt `incidents.personnel` `managedBy` danach.

### Kalender von einer Adresse

iCal-Kalender (z. B. der EvD-Dienstplan eines Online-Kalenders) lassen sich statt als Datei auch über ihre Adresse laden (`POST /core/imports/url`, `ImportService.fromUrl`, Abruf in `libs/core/core-api/src/lib/imports/url-fetch.ts`). Rechte und Ergebnis sind wie beim Hochladen: Der Kalender wird mit `parseIcs` gelesen und in `core.import_upload` abgelegt; Probelauf und Übernahme laufen danach unverändert.
- **Adressen:** `https://`, `http://`, `webcal://` (wird `http://`) und `webcals://` (wird `https://`), höchstens 2048 Zeichen; sonst `imports.urlInvalid`. Benutzername und Passwort in der Adresse werden als HTTP-Basic-Anmeldung gesendet.
- **Abruf durch den Server:** höchstens 15 Sekunden, höchstens 10 MB (größere Antworten werden beim Lesen abgebrochen, `imports.urlTooLarge`), höchstens drei Weiterleitungen (`imports.urlTooManyRedirects`), jede wie die erste Adresse geprüft. Nur Inhalt, der mit `BEGIN:VCALENDAR` beginnt, wird angenommen (`imports.urlNotCalendar`); Excel und CSV gibt es nur als Datei. Nicht erreichbar oder Zeitüberschreitung: `imports.urlUnreachable`, Antwort ohne 2xx: `imports.urlHttpStatus` mit `status`.
- **Schutz vor Anfragen ins interne Netz (SSRF):** Der Server löst den Hostnamen auf und lehnt ihn ab, wenn eine seiner Adressen Loopback, Link-Local, privat (RFC 1918, RFC 4193, auch Carrier-Grade-NAT), Multicast, reserviert oder unspezifiziert ist, auch als IPv4-gemappte IPv6-Adresse (`imports.urlForbidden` mit `host`). Die Verbindung geht an die geprüfte Adresse, eine zweite DNS-Antwort kann sie also nicht umlenken. Mit `FORGA_IMPORT_URL_ALLOW_PRIVATE=true` sind private Adressen erlaubt, z. B. für einen Kalenderserver im lokalen Netz.
- **Keine Geheimnisse im Protokoll:** Kalenderadressen enthalten oft ein Zugangstoken (im Pfad wie `…/private-<token>/basic.ics` oder in der Abfrage). Als Dateiname der Übernahme und damit im Audit-Log (`imports.applied`) steht nur Schema und Host, z. B. `https://calendar.example.org/…`.
- **Adresse merken:** Wer „Adresse merken“ wählt, dessen Adresse wird nach erfolgreichem Laden in `core.import_url` gespeichert (`ImportUrlEntity`: eine je Benutzer, nicht je Profil, weil das Profil erst nach dem Laden gewählt wird). Sie ist mit `FORGA_SECRET_KEY` verschlüsselt (AES-256-GCM, `security/server-key.ts`); ohne Server-Schlüssel wird nichts gespeichert (`canRemember: false`). Die volle Adresse geht nie zurück an die Oberfläche, nur Schema und Host (`display`); geladen wird sie mit `POST /core/imports/url` ohne `url`. Nur der Benutzer selbst sieht und nutzt sie und kann sie vergessen (`DELETE /core/imports/url`). Nach einem Wechsel des Server-Schlüssels lässt sie sich nicht mehr entschlüsseln (`imports.urlNotRemembered`) und muss neu eingegeben werden.
- **Oberfläche** (`ImportPage.tsx`, Schritt „Datei“): unter der Dateiauswahl „Kalender von Adresse laden“ mit Eingabefeld, „Laden“ und dem Häkchen „Adresse merken“; ist eine Adresse gespeichert, steht sie gekürzt darüber mit „Gespeicherten Kalender laden“ und „Vergessen“.

### Nicht zugeordnete Bezeichnungen

Passt ein Wert der Datei zu keinem Eintrag (z. B. ein Lehrgang, der nicht im Katalog steht), kann der Benutzer einen vorhandenen Eintrag wählen oder einen neuen anlegen. Das gilt für den Tabellen-Import und die Läufe des [Moduls MP-Feuer](#modul-mp-feuer-mp-feuer) gleichermaßen.
- **Nachschlagelisten (`ImportLookup`):** Module melden je Art (`kind`) beim `ImportRegistry` an (`registerLookup`), welche Einträge zur Wahl stehen (`entries()`, nur aktive), optional alle Einträge auch inaktive (`all()`, für den Zustand gemerkter Zuordnungen) und optional, wie aus dem Import heraus ein Eintrag angelegt wird (`create` mit eigenem Recht). `keyFormat` sagt der Oberfläche, wie sie den Schlüssel vorschlägt: `slug` (`drohnenpilot`) oder `text` (der Name selbst, bei Alarmstichworten).

  | Art | Modul | Einträge | Anlegen mit Recht |
  | --- | --- | --- | --- |
  | `qualification`, `rank`, `honor`, `exit-reason`, `function` | `masterdata` | Katalog gleicher Art; bei `qualification` danach die Lehrgänge des Lehrgangskatalogs als `course:<Schlüssel>` „<Name> (Lehrgangsteilnahme)“ (`COURSE_TARGET_PREFIX`) | `masterdata.catalogs.manage` (Katalogeintrag mit Name in beiden Sprachen, Reihenfolge am Ende, Zusatzfelder mit Standardwerten) |
  | `vehicle` | `masterdata` | Fahrzeuge (Schlüssel = ID) | – (Fahrzeuge werden in der Organisation angelegt) |
  | `alarm-keyword` | `incidents` | Alarmstichworte | `incidents.settings.manage` |
  | `session-type` | `training` | Diensttypen | `training.settings.manage` |

- **Zusätzliche Ziele anderer Module (`ImportLookupExtras`):** Ein Modul kann einer Nachschlageliste eines anderen Moduls weitere Ziele hinzufügen (`ImportRegistry.registerLookupExtras(modul, { kind, entries })`), z. B. bietet `incidents` bei `function` „Keine Funktion – …“ an. Die Schlüssel beginnen mit `<modul>:` (sonst Fehler beim Abruf), damit sie nie mit Schlüsseln der Liste zusammenfallen. `GET /core/imports/lookups/:kind` und die Prüfung der `mappings` sehen die Einträge der Liste und danach die Zusatzziele. Gemerkt werden sie wie Einträge in den Zuordnungslisten (siehe unten). Profile, die ein Zusatzziel nicht kennen, behandeln den Wert als nicht zugeordnet.

  | Art | Modul | Zusatzziele |
  | --- | --- | --- |
  | `function` | `incidents` | `incidents:during-working-hours` „Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn“, `incidents:loss-of-earnings` „Keine Funktion – Verdienstausfall“, `incidents:ignore` „Keine Funktion (ignorieren)“ |

- **Ablauf im Profil:** Das Profil sucht selbst über Schlüssel, Name, Kürzel und ähnliche Wörter. Findet es nichts, fragt es `context.mapped(kind, wert)`. Der Core antwortet zuerst aus den `mappings` des Requests, dann aus der gewählten Zuordnungsliste. Bleibt der Wert offen, meldet das Profil ihn mit `context.unmatched(kind, wert)` und schreibt eine Meldung an die Zeile, mit den Parametern `kind` und `value`.
- **Zuordnung im Request:** `mappings` (Art → Wert wie in der Datei → Schlüssel des Eintrags) in `ImportRequest` und in der Auswahl eines MP-Feuer-Laufs. Vor dem Lauf prüft der Core jede Zuordnung gegen die aktiven Einträge und Zusatzziele der Art (`ImportRegistry.assertMappings`): unbekannte Art → `imports.unknownLookup`, unbekannter Schlüssel → `imports.unknownMappingTarget` (mit `kind`, `value`, `key`).
- **Ergebnis:** `ImportResult.unmatched` listet die offenen Werte je Art und Wert einmal mit der Zahl der Zeilen (bei Einsätzen und Diensten: der Berichte bzw. Dienste). Der Core sammelt sie über den Kontext; Profile geben nur Zähler und Zeilen zurück (`ImportRunResult`). Dazu liefert `ImportRegistry.run` die benutzten Zuordnungen (`used`, je mit der Angabe, ob sie aus dem Request oder aus der Liste kam).
- **Was ohne Zuordnung passiert,** bestimmt das Profil:
  - `masterdata.career`: Zeile mit Fehler `masterdata.import.unknownCatalogEntry`. Ein Lehrgang als Ziel (`course:<Schlüssel>`) ergibt eine Lehrgangsteilnahme statt einer Qualifikation.
  - `masterdata.persons`: Austrittsgrund bleibt leer (`masterdata.import.unknownExitReason`).
  - `incidents.personnel`: Funktion bleibt leer (`incidents.import.unknownFunction`; statt einer Funktion kann auch ein Zusatzziel wie „Keine Funktion – Verdienstausfall“ gewählt werden), Fahrzeug bleibt leer (`incidents.api.unknownVehicle`). Ein unbekanntes Stichwort wird mit der Option `createKeywords` angelegt (`incidents.import.keywordCreated`, sonst Fehler `incidents.unknownKeyword`), steht aber trotzdem in `unmatched`, damit der Benutzer stattdessen ein vorhandenes Stichwort wählen kann.
  - `training.sessions`: Ein neuer Dienst bekommt den Typ `exercise` (`training.import.unknownType`).
- **Oberfläche** (`UnmatchedValues` in `libs/web/web-ui`, genutzt von der Import-Seite der Shell und vom Modul MP-Feuer): Nach der Prüfung erscheint „Nicht zugeordnete Bezeichnungen“ mit je Wert der Zahl der Vorkommen, der Art und einer durchsuchbaren Auswahl der Einträge; leer heißt „ignorieren“. Optional filtern Chips nach Art. Wer das Recht zum Anlegen hat (`creatable`), sieht „Neuen Eintrag anlegen“: Bezeichnung (vorbelegt mit dem Wert) und Schlüssel (daraus abgeleitet, änderbar); der neue Eintrag wird sofort zugeordnet.
  - Die Zuordnungen gelten für den ganzen Upload bzw. Lauf und werden mit jeder Prüfung und Übernahme gesendet. Bereits zugeordnete Werte bleiben in der Liste, damit sie geändert werden können.
  - Nach einer Änderung muss erneut geprüft werden („Erneut prüfen“), bevor übernommen werden kann.
- Jeder aus dem Import angelegte Eintrag steht im Audit-Log (`imports.lookupEntryCreated`) mit Art und Schlüssel.

### Gemerkte Zuordnungen

Gewählte Zuordnungen werden nicht an den Einträgen gespeichert; Kataloge, Fahrzeuge, Alarmstichworte und Diensttypen bleiben frei von Importbezeichnungen. Gemerkt wird in zwei getrennten Listen mit gleichem Aufbau (`mappingProperties`, `MappingStore` in `libs/core/core-api/src/lib/imports/mapping-store.ts`):

| Liste | Tabelle | Gefüllt von | Gelesen von |
| --- | --- | --- | --- |
| Zuordnungen des Tabellen-Imports | `core.import_mapping` (`ImportMappings`) | Übernahme im Tabellen-Import | Probelauf und Übernahme im Tabellen-Import |
| Zuordnungen von MP-Feuer | `mp_feuer.mapping` (`MpFeuerMappings`) | Übernahme eines MP-Feuer-Laufs | Läufe des Moduls MP-Feuer |

- **Eintrag:** Art (`kind`), Bezeichnung im Original (`value`) und normalisiert (`normalized`, wie Spaltenüberschriften mit `normalizeHeading`: ohne Groß- und Kleinschreibung, Umlaute als ae/oe/ue, ohne Leer- und Satzzeichen), Schlüssel des Ziels (`key`, Eintrag oder Zusatzziel wie `incidents:loss-of-earnings`), Profil der ersten Übernahme (`profile`, nur angezeigt: die Zuordnung gilt für alle Profile derselben Art), angelegt von und am, zuletzt benutzt. Eindeutig je Liste über Art und normalisierte Bezeichnung. Beide Listen sind historisiert; „zuletzt benutzt“ wird ohne Historie geschrieben.
- **Anwenden:** Vor dem Lauf liest der Aufrufer seine Liste (`MappingStore.remembered`) und gibt sie als `remembered` an `ImportRegistry.run`. Nur Einträge mit aktivem Ziel werden angewandt: Der Core prüft das Ziel gegen `ImportLookup.entries()` und die Zusatzziele (aktiv), gegen `ImportLookup.all()` (inaktiv) oder findet es nicht (gelöscht, auch wenn das anbietende Modul abgeschaltet ist). Eine Bezeichnung mit inaktivem oder gelöschtem Ziel erscheint wieder als offen.
- **Merken:** Nach einer Übernahme (nicht nach einem Probelauf) schreibt der Aufrufer jede benutzte Zuordnung in seine Liste (`MappingStore.remember`): eine im Request gewählte ersetzt einen älteren Eintrag derselben Bezeichnung, eine aus der Liste angewandte bekommt nur „zuletzt benutzt“.
- **Verwaltung:**
  - Tabellen-Import: Reiter „Gemerkte Zuordnungen“ auf der Import-Seite. `GET /api/core/imports/mappings` (Filter `kind`, `q`, `problems=true`) und `DELETE /api/core/imports/mappings/:id`, für Benutzer mit dem Recht eines Importprofils. Löschen steht im Audit-Log (`imports.mapping-deleted` mit Art, Wert, Schlüssel).
  - MP-Feuer: Reiter „Zuordnungen“ des Moduls, `GET`/`DELETE /api/mp-feuer/mappings…` mit `mp-feuer.read` bzw. `mp-feuer.transfer`, Audit `mp-feuer.mapping-deleted`.
  - Beide Listen (`RememberedMappings` in `libs/web/web-ui`) zeigen Bezeichnung, Art, Ziel mit Namen und dem Hinweis „Ziel gelöscht“ bzw. „Ziel inaktiv“, (Tabellen-Import: Profil,) zuletzt benutzt und angelegt von; mit Suche, Filter nach Art, „Nur Ziel gelöscht oder inaktiv“ und „Löschen …“ (mit Rückfrage, sofort wirksam). Eine Liste kennt die Zuordnungen der anderen nicht.

### Datenübernahme aus MP-Feuer

Die Transferdateien von MP-Feuer (`MPTRA_*.zip`) übernimmt das [Modul MP-Feuer](#modul-mp-feuer-mp-feuer); der Core kennt kein MP-Feuer-Format. Die Import-Seite weist darauf hin, solange das Modul aktiv ist.

## Modul Stammdaten (`masterdata`)

**Entitäten**
- `masterdata.entities.ts`: `Department`, `Station`, `Vehicle`, `Person`, `Membership`, `PersonQualification`, `RankAssignment`, `HonorAward`, `OfficeAssignment` (Amt aus dem Katalog `office`, Abteilung oder Gesamtwehr, von, bis, Bemerkung; historisiert), `RestPeriod` (Ruhezeit: Ruhen der Mitgliedschaft oder Mitgliedschaft in einer anderen Feuerwehr, von, bis oder offen; historisiert; `POST|PUT|DELETE /api/masterdata/persons/:id/rest-periods`), `DriverLicenseCheck`, `DriverLicenseRequest`, `DriverLicenseToken` (siehe [Führerscheinkontrolle](#führerscheinkontrolle)). Organisation und Personen verweisen gegenseitig aufeinander (Kommandant einer Abteilung, Mitgliedschaften), deshalb liegen sie in einer Datei.
- `courses/course.entities.ts`: `Course`, `CourseRun` (Lehrgangstermin, Kind des Lehrgangs), `CourseAttendance`, `CourseNomination`
- `organization/group.entities.ts`: `DepartmentGroup` (Gruppe einer Abteilung, Kind der Abteilung)
- `catalog/catalog.ts`: `CatalogEntry`

Alle Entitäten sind historisiert. Die Kinddatensätze der Person tragen den Elternbezug `person`.

**Kataloge**
- Arten (`CatalogKind`): `function`, `qualification`, `vehicle-type`, `honor`, `exit-reason`, `rank`, `office`.
- Jeder Eintrag hat einen stabilen `key`, einen zweisprachigen `name`. Andere Bezeichnungen aus Importen stehen nicht am Eintrag, sondern in den [gemerkten Zuordnungen](#gemerkte-zuordnungen). Andere Daten verweisen über den Schlüssel, deshalb können `kind` und `key` nach dem Anlegen nicht mehr geändert werden. Inaktive Einträge stehen nicht mehr zur Auswahl, bleiben aber an bestehenden Daten erhalten.
- **Löschen** (`DELETE /api/masterdata/catalog/:id`) geht nur, solange nichts den Eintrag verwendet; benutzte Einträge werden deaktiviert. Jedes Modul zählt seine Verweise selbst und meldet sie über `CATALOG_REFERENCES` (`register(module, count(kind, key))`, Registry `catalog/references.ts`). Sonst `409 catalog.inUse` mit `usages: [{ module, count }]` (die Oberfläche nennt die Modulnamen und bietet „Stattdessen deaktivieren“). Die Löschung steht in der Historie des Eintrags. Gezählt werden:

  | Modul | Verweise |
  | --- | --- |
  | `masterdata` | Qualifikationen der Personen, vermittelte und geforderte Qualifikationen der Lehrgänge, Probezeit-Qualifikationen der Einstellung `masterdata.membership`; Dienstgrade, Ehrungen und Ämter der Personen; Austrittsgrund; Fahrzeugtyp der Fahrzeuge |
  | `incidents` | Funktion im Personal der Berichte (auch EvD-Berichte) |
  | `compensation` | Amt einer Funktionspauschale (Einstellung `compensation.general`) |
  | `promotions` | Zieldienstgrad und Bedingungen (Dienstgrad, Qualifikation, Amt) der Regeln (Einstellung `promotions.general`), Dienstgrad und Zieldienstgrad der Einträge von Beförderungslisten, Zieldienstgrad von Sperren |

  Nicht als Verweis zählen: die Fahrzeugsätze des Kostenersatzes (Kategorien der Verordnung; maßgeblich ist der Fahrzeugtyp bzw. die Kostenersatz-Kategorie des Fahrzeugs), die Rollen der Dienst-Anwesenheit (freier Text) und die Lehrgangspauschalen der Entschädigung (Lehrgangsschlüssel, keine Katalogeinträge).
- **Vom Code benötigte Einträge** meldet ein Modul mit `require(module, kind, key)`; sie lassen sich nie löschen (`409 catalog.required` mit `modules`):

  | Eintrag | Modul | Grund |
  | --- | --- | --- |
  | Qualifikation `breathing-apparatus` | `masterdata`, `incidents`, `respiratory-protection` | Liste der Atemschutzgeräteträger, Prüfregel `breathing-without-qualification`, Atemschutzgeräteträger der Tauglichkeit |
  | Qualifikation `chemical-suit` | `respiratory-protection` | Bedingung CSA-Übung |
  | Qualifikationen `equipment-officer`, `breathing-apparatus-officer` | `equipment` | Qualifikationswarnung bei Prüfungen durch eine befähigte Person |
  | Dienstgrad `probation` | `promotions` | Dienstgrad von Personen in Probezeit ohne Dienstgrad-Eintrag |
  | Funktion `duty-officer` | `duty-officer` | Funktion des EvD in neuen EvD-Berichten |
- Zusatzfelder je Art prüft `CatalogAttributes`:
  - Qualifikation: `validityMonths`
  - Fahrzeugtyp: `crew`, `seats`, `statisticsCategory`
  - Dienstgrad: `abbreviation`, `level`
  - Funktion: `abbreviation`
- **Vorlagen für Baden-Württemberg:**
  - `BW_CATALOG_TEMPLATE`: Dienstgrade nach VwV 2022, Qualifikationen (auch die Musiker-Lehrgänge Grundausbildung, D2, D3, C1, C2 für die Beförderungsregeln), Funktionen (im Einsatz), Ämter (Kommandant, Stellvertreter, Abteilungskommandant, Jugendfeuerwehrwart, Gerätewarte, Schriftführer …), Fahrzeugtypen, Ehrungen, Austrittsgründe
  - `BW_COURSE_TEMPLATE`: 14 Lehrgänge mit vermittelten Qualifikationen und Voraussetzungen und der Sammellehrgang „Anderer Lehrgang“ `other-course` mit `describe` (vermittelt keine Qualifikation, siehe Lehrgänge)

  Beim Anwenden kommen nur fehlende Schlüssel hinzu.
- Die Fahrzeugpositionen der Jahresstatistik F63–F120 sind fest im Code (`VEHICLE_STATISTICS_CATEGORIES`) und nicht änderbar.

**Organisation**
- `Department` hat:
  - Typ, übergeordnete Abteilung
  - Sonderaufgaben (`specialTasks`, Jahresstatistik F3–F9)
  - Kommandant (`commander`) und Stellvertreter (`deputyIds`)
  - `statisticsRelevant`: `null` heißt Standard des Typs. Standardmäßig zählen Einsatz-, Jugend-, Alters- und Musikabteilung.
  - `population`: Einwohner des Ortsteils der Abteilung, z. B. für Beförderungsregeln; `null` heißt die Einwohner der Gemeinde (`brigade.population`).
  - Kurznamen sind eindeutig, ohne Groß- und Kleinschreibung (`masterdata.shortNameTaken`); der Import legt bei Gleichheit den vollen Namen als Kurznamen an.
  - Wer `masterdata.organization.manage` nur für die eigene Abteilung hat (Abteilungskommandant), ändert Name, Kurzname, Kommandant und Stellvertreter. Typ, übergeordnete Abteilung, Sonderaufgaben, Statistik und Einwohner brauchen das Recht für die Gesamtwehr (`masterdata.departmentFieldsBrigadeOnly`); der Dialog sperrt diese Felder.
  - **Übergeordnete Abteilung ändern:** Unterabteilungen erben die abteilungsbezogenen Rollen der übergeordneten Abteilungen. Ein Wechsel erweitert oder verengt also, wie weit Rollen reichen, auch für Rechte, die der Ändernde selbst nicht hat. Er braucht deshalb zusätzlich `core.roles.manage` (`masterdata.departmentMoveNeedsRoles`) und steht im Audit-Log (`masterdata.department-moved` mit Abteilung, alter und neuer übergeordneter Abteilung). Zyklen werden abgelehnt, auch über mehrere Ebenen (`masterdata.departmentCycle`; die Abteilung selbst: `masterdata.departmentOwnParent`).
- **Gruppen** (`DepartmentGroup`, „Gruppe als Einheit“): je Abteilung Name (eindeutig in der Abteilung), Gruppenführer und Mitglieder (`memberIds`); beide müssen heute Mitglieder der Abteilung sein (`masterdata.groupMemberNotInDepartment`). Pflege mit `masterdata.organization.manage` für die Abteilung. Sehen darf sie, wer Personen der Abteilung lesen darf; der Gruppenführer (verknüpfte Person) sieht seine Gruppe immer (`/masterdata/groups/mine`). Beim Austritt verschwindet die Person aus den Gruppen. Die Personenliste filtert nach Gruppe und bietet Gruppenführern „Meine Gruppe“.
- `Station` hat das Merkmal `permanentlyStaffed`.
- `Vehicle` verweist auf einen Fahrzeugtyp aus dem Katalog. Sitzplätze und Statistik-Kategorie werden aus dem Typ übernommen, wenn sie nicht angegeben sind. Eine Statistik-Kategorie ist Pflicht.

**Personen**
- **Sichtbarkeit:**
  - Eine Person sieht, wer `masterdata.persons.read` für eine ihrer Abteilungen hat (Personalakte).
  - Mit `masterdata.persons.directory` erscheint sie nur im Personenverzeichnis: Die Liste `GET /masterdata/persons` enthält dann Name, Status und Abteilungen, alles andere ist leer und `restricted` ist `true`. Die Akte selbst gibt `404`. Die Suche nach der Personalnummer und der Filter nach Qualifikation wirken nur in den Akten, die der Benutzer lesen darf.
  - Maßgeblich sind die heute gültigen Mitgliedschaften. Bei Ausgeschiedenen zählen alle früheren.
  - Wer eine Person nicht sehen darf, erhält `404`.
- **Sensible Felder:** `birthDate`, `birthPlace`, `employer`, `bank`, die interne Bemerkung `notes`, der Austrittsgrund `exitReason` und die Ruhezeiten `restPeriods` (`SENSITIVE_PERSON_FIELDS`) brauchen `masterdata.persons.sensitive`. So sieht z. B. ein Gruppenführer mit `masterdata.persons.read` keine Bemerkungen und Ruhezeiten.
  - Ohne das Recht fehlen sie in der Antwort bzw. sind leer (`notes: ''`, `restPeriods: []`, `exitReason: null`), und `sensitiveHidden` ist `true`.
  - Beim Schreiben werden sie ohne das Recht ignoriert; Ruhezeiten ändern braucht das Recht (`auth.forbidden`).
  - In der Historie der Person werden sie maskiert, die Einträge der Ruhezeiten ganz (`hiddenFields` mit `masterdata.rest_period`). Listen enthalten diese Felder nicht.
- **Prüfungen:**
  - Geburtsdatum nicht in der Zukunft (`masterdata.birthDateInFuture`).
  - Mindestalter bei bekanntem Geburtsdatum zum Beginn einer laufenden oder künftigen Mitgliedschaft: Einsatzabteilung `minimumAgeOperational` (`masterdata.belowMinimumAge`), Jugendfeuerwehr `minimumAgeYouth` (`masterdata.belowMinimumAgeYouth`); beim Anlegen und bei neuen Mitgliedschaften, beendete Mitgliedschaften gelten als Historie.
  - Der Status passt zum Typ der Stammabteilung (`STATUSES_BY_DEPARTMENT_TYPE`, `masterdata.statusDoesNotFitDepartment`): Jugend- und Kinderfeuerwehr nur `youth`, Altersabteilung nur `veterans`, alle anderen `probation`, `active` oder `passive`. Geprüft beim Anlegen und wenn sich die Stammabteilung über die Mitgliedschaften ändert; maßgeblich ist die heute gültige Stammabteilung, ohne eine solche die zuletzt beginnende.
  - Keine Daten vor der Geburt (`masterdata.dateBeforeBirth`): Eintritt, Beginn von Mitgliedschaften, Erwerb von Qualifikationen, Dienstgrade, Ehrungen, Ämter und Lehrgangsteilnahmen. Ein geändertes Geburtsdatum darf nicht nach bereits erfassten Daten liegen; unveränderte Altdaten werden beim Speichern anderer Felder nicht erneut geprüft.
  - IBAN von Person und Arbeitgeber mit Prüfziffer (`isValidIban` in `masterdata-contracts`, in Formularen als Feldfehler).
- **Mitgliedschaften:**
  - Unter den heute gültigen ist genau eine die Stammabteilung (`primary`).
  - Wer Mitgliedschaften ändert, braucht `masterdata.persons.write` für die alten und die neuen Abteilungen.
- **Status:** `probation`, `active`, `passive`, `youth`, `veterans`, `left`.
  - Neue Personen beginnen standardmäßig in der Probezeit. Das Ende ist der Vortag des Jahrestags: Eintrittsdatum plus `probationMonths` der Einstellung `masterdata.membership` (Standard 12) minus ein Tag, am Monatsende abgefangen (`probationEnd` in `masterdata-contracts`, gleich für Anlegen, Import, Übernahme und Oberfläche).
  - Die Probezeit lässt sich mit Begründung verkürzen oder verlängern. Die Begründung kommt in die Bemerkung.
  - Die endgültige Aufnahme setzt `active` und das Beschlussdatum. Sie liegt nicht vor dem Eintritt (`masterdata.admissionBeforeJoining`). Vor dem Ende der Probezeit oder solange Qualifikationen der Probezeit (`probationQualifications`) fehlen, braucht sie wie eine verkürzte Probezeit eine Begründung (`masterdata.admissionReasonRequired`), die in die Bemerkung kommt; der Dialog zeigt die Gründe und verlangt dann das Feld.
  - Der Austritt setzt `left`, beendet offene Mitgliedschaften zum Austrittsdatum und löst `masterdata.person.left` aus.
  - Übernahmen wirken sofort (Status, Probezeit, Mitgliedschaften) und werden deshalb am Übernahmetag oder danach erfasst, nicht im Voraus (`masterdata.transferInFuture`; der Dialog lässt kein künftiges Datum zu). So kann niemand in Probezeit sein oder aufgenommen werden, solange er noch in der Jugendfeuerwehr ist.
  - **Übernahme in Einsatzabteilung** (Feuerwehrsatzung, Schaltfläche bei Jugendlichen): nur aus `youth`, Zielabteilung vom Typ `operational`, Mindestalter `minimumAgeOperational` (17) am Übernahmetag. Die Mitgliedschaft in der Jugendfeuerwehr endet am Vortag und bleibt bis dahin die Stammabteilung, die neue ist es ab dem Übernahmetag. Probezeit regulär (`probationMonths`, endet am Vortag des Jahrestags), verkürzt (nicht vor dem Übernahmetag) oder entfallen; verkürzt und entfallen brauchen eine Begründung (`masterdata.probationReasonRequired`), die in die Bemerkung kommt. Ohne Probezeit ist die Person sofort `active` und aufgenommen.
  - **Übernahme in Altersabteilung** (Feuerwehrsatzung, Schaltfläche bei Aktiven und Passiven): Zielabteilung vom Typ `veterans`, vorgeschlagen die Altersabteilung der Stammabteilung. Mitgliedschaften in Einsatzabteilungen und Führungseinheiten enden am Vortag, andere (z. B. Musik) bleiben; Status `veterans`, der Dienstgrad bleibt. Kein Altersblock, weil die Übernahme auch bei Ende des Dienstes aus gesundheitlichen Gründen gilt; der Dialog nennt 55 Jahre auf Antrag und 65 Jahre.
  - Beide Übernahmen ändern nur Mitgliedschaften in Abteilungen, für die der Benutzer schreiben darf, sonst `auth.forbidden`. Das Übernahmedatum muss nach dem Beginn der endenden Mitgliedschaft liegen (`masterdata.transferBeforeMembership`).
  - Der einfache Statuswechsel wechselt nur zwischen `active` und `passive`. Aus der Jugendfeuerwehr und in die Altersabteilung führen die Übernahmen (`masterdata.useTransfer`); alle anderen Wechsel (z. B. Altersabteilung → aktiv, aktiv → Jugendfeuerwehr, aus der Probezeit) lehnt er ab (`masterdata.statusChangeNotAllowed`), weil sie andere Mitgliedschaften verlangen. Die Oberfläche bietet ihn nur Aktiven und Passiven an.
- Der aktuelle Dienstgrad ist der jüngste Eintrag in `ranks`. Beförderungen laufen über die Beförderungslisten (Modul `promotions`), deren Durchführung den Dienstgrad einträgt. Dienstgrade direkt eintragen oder löschen (Altdaten, Korrekturen) darf nur, wer `masterdata.persons.write` für die Gesamtwehr hat; Abteilungskommandanten sehen stattdessen einen Hinweis.
- **Ämter** mit Abteilung brauchen `masterdata.persons.write` für diese Abteilung, Ämter der Gesamtwehr (ohne Abteilung) das Recht für die Gesamtwehr; das gilt für Anlegen, Ändern (alte und neue Abteilung) und Löschen. Der Dialog bietet nur die Abteilungen an, für die der Benutzer schreiben darf.
- Qualifikationen gelten bis `validUntil`. Fehlt das Datum, wird es aus `validityMonths` des Katalogs berechnet.

**Lehrgänge**
- **Katalog:** Neben Ebene, vermittelten Qualifikationen und Voraussetzungen (andere Lehrgänge) hat ein Lehrgang weitere Bedingungen: gültige Qualifikationen (`requiredQualifications`, z. B. eine Untersuchung), ein Mindestalter zum Lehrgangsbeginn (`minimumAge`; ein unbekanntes Geburtsdatum schließt nicht aus) und die zugelassenen Status (`allowedStatuses`, Standard Probezeit und aktiv; in der BW-Vorlage Truppmann Teil 1 auch Jugendfeuerwehr). Dazu ein Soll je Abteilung (`targets`) für den Lehrgangsbedarf. Die BW-Vorlage setzt für Atemschutzgeräteträger ein Mindestalter von 18 Jahren (Vorlagewert nach FwDV 7, mit der geltenden Vorschrift abzugleichen).
- **Anderer Lehrgang (Sammellehrgang):** Ein Lehrgang mit `describe` („Beschreibung erforderlich“, Kontrollkästchen im Lehrgangsdialog) steht für Lehrgänge ohne eigenen Katalogeintrag, z. B. „Erste Hilfe“ oder „Holz in Spannung“ aus MP-Feuer. Die Teilnahme trägt in `description` den eigentlichen Lehrgang (`CourseAttendanceInput.description`, bei „Teilnahme erfassen“ eine für alle Ergebnisse); ohne Beschreibung oder mit nur dem Namen oder Schlüssel des Lehrgangs lehnt der Server ab (`masterdata.descriptionRequired`, `courses/course-description.ts`), bei anderen Lehrgängen wird sie leer gespeichert. „Nur einmal bestanden“ gilt je Beschreibung. Angezeigt wird „Anderer Lehrgang: Erste Hilfe“ (`courseLabel`): Lehrgänge der Akte, Liste „Lehrgänge im Jahr“, Lehrgangspauschale der Entschädigung (`courseName` im Ereignis `masterdata.course.passed`); die Auskunft und die Datensicherung enthalten das Feld. Der Sammellehrgang vermittelt in der BW-Vorlage keine Qualifikation, erscheint also nicht in der Qualifikationsmatrix und nicht in den Fristen. Er gilt nie als „vorhanden“ (Vormerkungen, Kandidaten) und hat keinen Lehrgangsbedarf.
- **Teilnahme:** Ende nicht vor Beginn; Daten nicht vor 1900 (`validation.failed`), nicht vor der Geburt (`masterdata.dateBeforeBirth`) und kein Beginn in der Zukunft (`masterdata.attendanceInFuture`); bestanden erst nach dem Ende (`masterdata.courseNotFinished`) und nur einmal je Lehrgang (`masterdata.coursePassedAlready`, nicht bestandene Versuche daneben bleiben möglich). Eine bestandene Teilnahme legt die Qualifikationen des Lehrgangs an (`courseAttendanceId` verweist zurück). Offene Vormerkungen der Person für den Lehrgang werden `completed` und merken sich die Teilnahme (`attendanceId`).
  - Hat die Person alle Qualifikationen des Lehrgangs schon gültig (z. B. importiert oder von Hand eingetragen), wird „bestanden“ nur mit Bestätigung eingetragen (`confirmHeld`, sonst `409 masterdata.qualificationsHeld`). Dann entsteht keine doppelte Qualifikation und kein `masterdata.course.passed`, also keine zweite Lehrgangspauschale. Fehlt nur ein Teil der Qualifikationen, werden die fehlenden angelegt.
  - Eine nicht bestandene Teilnahme schließt die offenen Vormerkungen der Person für den Lehrgang, die zu diesem Termin, zu einem früheren oder zu keinem Termin gehören: Status `failed` mit Verweis auf die Teilnahme. Für einen späteren Durchgang wird neu vorgemerkt.
- Wird die Teilnahme gelöscht, verschwinden auch die so entstandenen Qualifikationen, die damit erledigte bzw. geschlossene Vormerkung wird wieder `confirmed`, und bei einer bestandenen Teilnahme folgen `masterdata.course.revoked` und `masterdata.person.qualification-changed`. Die Entschädigungen nehmen daraufhin die Lehrgangspauschale zurück.
- **Lehrgangstermin** (`CourseRun`): ein Lehrgang mit Datum und Ort, z. B. Truppmann Teil 2 in der Gemeinde oder der Kreislehrgang, für den Personen angemeldet sind. Vormerkungen werden einem Termin zugeordnet (`runId`). „Teilnahme erfassen“ zeigt alle offenen Vormerkungen eines Termins (bzw. ohne Termin mit eigenem Datum) und trägt die Ergebnisse auf einmal ein (`POST /masterdata/course-results`); mit zugesagtem Platz ist „bestanden“ vorgewählt, sonst „nicht teilgenommen“. Wer nicht teilgenommen hat, bleibt weg; nicht eintragbare Personen werden mit Grund gemeldet, auch wer für den Termin schon ein Ergebnis hat (`masterdata.resultRecordedAlready`). Erfasste Personen sind nicht mehr offen und erscheinen nicht erneut. Ein Termin mit Ergebnissen lässt sich nicht löschen, und seine Daten bleiben fest (`masterdata.courseRunHasResults`); Ort und Bemerkung bleiben änderbar.
- Die Lehrgangsplanung (`course-planning/:course`) zeigt über alle Abteilungen, für die der Benutzer `masterdata.courses.plan` hat:
  - die offenen Vormerkungen; `prerequisitesMet` heißt: Status zugelassen, Bedingungen erfüllt und Lehrgang noch nicht vorhanden
  - die Kandidaten: Personen mit einem zugelassenen Status, die alle Bedingungen erfüllen, den Lehrgang noch nicht haben und nicht vorgemerkt sind
  - die Termine des Lehrgangs

  Eine Voraussetzung gilt als erfüllt bei bestandenem Lehrgang oder wenn alle Qualifikationen des Lehrgangs vorliegen, z. B. von Hand eingetragen. - **Vormerkungen** werden geprüft: zugelassener Status (`masterdata.statusNotAllowedForCourse`), Lehrgang bzw. alle seine Qualifikationen noch nicht vorhanden (`masterdata.courseHeldAlready`), Voraussetzungen, Bedingungen und Mindestalter (`masterdata.courseConditionsNotMet`) und keine zweite offene Vormerkung (`masterdata.alreadyNominated`, auch beim Wiedereröffnen einer abgelehnten über `PUT`). `completed` und `failed` ergeben sich nur aus Teilnahmen (`masterdata.nominationStatusByAttendance`).
  - Mehrere Personen werden mit einem Aufruf vorgemerkt (`course-nominations/bulk`), wahlweise gleich für einen Termin und mit Status (vorgemerkt, angemeldet, Platz zugesagt); wer nicht vorgemerkt werden kann, wird mit Grund übersprungen statt abzubrechen.
  - Status und Termin mehrerer Vormerkungen ändert `POST course-nominations/bulk-update` (`nominationIds`, `status` und/oder `runId`; Auslassen heißt unverändert), ebenfalls mit Grund je übersprungener Vormerkung. In der Planung über Auswahlkästchen und „Für Auswahl übernehmen“.
- **Lehrgangsbedarf** (`course-needs`): je aktivem Lehrgang und Abteilung, für die der Benutzer planen darf, die Mitglieder mit einem für den Lehrgang zugelassenen Status mit dem Lehrgang (`have`, z. B. Jugendliche bei Truppmann Teil 1), das Soll (`target`) und deren offene Vormerkungen (`nominated`). Abteilungen ohne solche Mitglieder und ohne Soll fehlen, so zeigt die Jugendfeuerwehr keine Führungslehrgänge.
- Lehrgangsteilnahmen eintragen und löschen darf, wer für die Person `masterdata.persons.write` **oder** `masterdata.courses.plan` hat. So kann der Lehrgangsbeauftragte (Rolle `course-coordinator`) Vormerkungen, Anmeldungen und Ergebnisse pflegen, ohne Personendaten ändern zu dürfen. Den Lehrgangskatalog pflegt weiter nur, wer `masterdata.catalogs.manage` hat.

**Listen** (`lists/masterdata.lists.ts`). Sie enthalten nur Personen, die der Benutzer sehen darf. Ohne Statusfilter fehlen Ausgeschiedene.

| ID | Inhalt | Recht |
| --- | --- | --- |
| `masterdata.members` | Mitgliederliste mit Abteilung, Dienstgrad, Status, Eintritt, Kontakt (Zweck „Übersicht“ ohne Kontakt, „Kontaktaufnahme“ mit `masterdata.lists.contact`) | `masterdata.persons.read` |
| `masterdata.signatures` | Unterschriftenliste mit Anlass und Datum | `masterdata.persons.read` |
| `masterdata.phones` | Telefonliste (Zweck Abteilung oder Führungskräfte) | `masterdata.lists.contact` |
| `masterdata.complete` | Komplettdaten einschließlich Geburtsdatum und Arbeitgeber (Zweck Personalverwaltung oder Anschriftenliste) | `masterdata.persons.sensitive` |
| `masterdata.birthdays` | Geburtstage im Zeitraum, runde markiert | `masterdata.persons.sensitive` |
| `masterdata.jubilees` | Dienstjubiläen (10, 15, … 70 Jahre) im Jahr | `masterdata.persons.read` |
| `masterdata.qualification-matrix` | Matrix Person × aktive Qualifikation (Sammeleinträge mit den Beschreibungen) | `masterdata.persons.read` |
| `masterdata.breathing-apparatus` | Personen mit gültiger Qualifikation Atemschutz | `masterdata.persons.read` |
| `masterdata.probation` | Personen in der Probezeit mit Ende und Stand Truppmann Teil 1 | `masterdata.persons.read` |
| `masterdata.age-limits` | Personen, die im Jahr 18, 55 oder 65 werden | `masterdata.persons.sensitive` |
| `masterdata.strength` | Personalstärke je Stammabteilung nach Status, davon weiblich | `masterdata.persons.read` |
| `masterdata.vehicles` | Fahrzeuge ohne ausgesonderte | `masterdata.persons.read` |
| `masterdata.course-nominations` | Lehrgangsvormerkungen (offen) mit Lehrgang, Abteilung, Priorität, Wunschzeitraum, Termin und Status | `masterdata.courses.plan` |
| `masterdata.course-year` | Lehrgänge im Jahr: Teilnahmen mit Datum, Ort, Abteilung und Ergebnis | `masterdata.courses.plan` |

**Urkunden für Ehrungen:** `GET /api/masterdata/persons/honors/certificates.pdf?from&to&honor` (Ehrungen im Zeitraum, optional einer Art) oder `?ids=` (einzelne Verleihungen) als Serien-PDF mit `renderCertificatesPdf`, nur für lesbare Personen (`masterdata.persons.read`). Text, Ort und Unterschrift aus der Einstellung `masterdata.certificates` (Platzhalter `{honor}`, `{name}`, `{date}`); Datum ist das der Verleihung. `GET …/honors/certificates` liefert vorab die Anzahl; der Dialog nennt sie im Knopf und zeigt bei null Ehrungen den Hinweis `masterdata.noHonors`, statt das PDF zu öffnen. In der Oberfläche: Knopf „Ehrungsurkunden“ in der Personenliste (Administratoren pflegen dort die Texte) und je Ehrung in der Personenakte.

**Feuerwehrsatzung** (Einstellung `masterdata.membership`, Seite „Verwaltung → Module → Stammdaten → Feuerwehrsatzung“, Recht `masterdata.settings.manage`): Probezeit in Monaten, beschließendes Gremium (erscheint in den Beschlussfeldern), in der Probezeit zu erwerbende Qualifikationen (`probationQualifications`), Mindestalter Jugendfeuerwehr (`minimumAgeYouth`, Standard 10), Einsatzabteilung und Einsatzdienst, Ende Jugendfeuerwehr, Antrag Altersabteilung, Altersgrenze, Stellvertreter je Abteilungskommandant (`maxDeputies`, sonst `masterdata.tooManyDeputies`) und Dienstjubiläen (`jubileeYears`). Gremium und Qualifikationen der Probezeit sind anfangs leer, die Alterswerte übliche Beispielwerte. „Vorlage Baden-Württemberg“ setzt die Vorlagewerte `BW_MEMBERSHIP_TEMPLATE` (u. a. Feuerwehrausschuss, Truppmann Teil 1, 12 Monate Probezeit) in das Formular; sie sind nicht rechtlich geprüft und vor dem Speichern mit der eigenen Satzung abzugleichen. Die Altersgrenzen haben Wertebereiche (`MEMBERSHIP_AGE_BOUNDS`: Mindestalter Jugendfeuerwehr 6–18, Mindestalter Einsatzabteilung und Einsatzdienst sowie Ende Jugendfeuerwehr 10–30, Antrag Altersabteilung 30–99, Altersgrenze 40–99), die Seite zeigt Abweichungen als Feldfehler.

**Fristen** (`deadlines/masterdata.deadlines.ts`; die der Führerscheinkontrolle siehe [dort](#führerscheinkontrolle)). Zuständig ist, wer `masterdata.persons.write` für eine Abteilung der Person hat. Altersgrenzen und die Qualifikationen der Probezeit kommen aus der Einstellung `masterdata.membership`; die Listen Altersgrenzen, Geburtstage, Dienstjubiläen und Probezeit ebenso.

| Art (`kind`) | Fällig | Vorlauf |
| --- | --- | --- |
| `probation-ends` | Ende der Probezeit | 30 Tage |
| `basic-training-missing` | Ende der Probezeit, solange Truppmann Teil 1 fehlt | 60 Tage |
| `incident-age-reached` | Geburtstag mit Mindestalter Einsatzdienst (Personen in Probezeit oder aktiv); bleibt 30 Tage sichtbar | 30 Tage |
| `age-limit` | Geburtstag mit Altersgrenze Einsatzabteilung (Personen in Probezeit oder aktiv) | 90 Tage |
| `youth-ends` | Geburtstag mit Ende der Jugendfeuerwehr (Status `youth`) | 90 Tage |
| `qualification-expires` | `validUntil` des jüngsten Eintrags je Qualifikation | 60 Tage |

**Importprofil `masterdata.persons`** (`imports/persons.import.ts`), Recht `masterdata.persons.write`:
- Felder: Personalnummer, Anrede, Titel, Vor- und Nachname (Pflicht), Anschrift, Telefone, E-Mail, Geburtsdatum, Geschlecht, Eintritt, Abteilung, Status, Austritt, Austrittsgrund, Führerscheinklassen und „Führerschein gültig bis“ (siehe [Führerscheinkontrolle](#führerscheinkontrolle)). Die weiteren Spaltenüberschriften der Felder decken die MP-Feuer-Exporte `Personal.xlsx`, die Stammdatenliste und den Export der Jugendfeuerwehr ab (z. B. `Bezeichnung` → Abteilung, `Pers.-Nr.` → Personalnummer, `Geb.-Datum`, `Handy privat`, `Tel. gesch.`, `E-Mail privat`, `Aktiv von` → Eintritt). Die `Jug.-Nr.` wird nicht als Personalnummer zugeordnet, weil sie sich mit den Personalnummern der Einsatzabteilungen überschneiden kann; Jugendliche werden über Name und Geburtsdatum erkannt. Erziehungsberechtigte und Jugendgruppen werden nicht übernommen.
- **Erkennung:** über die Personalnummer, sonst über Vor- und Nachname (bei Angabe auch Geburtsdatum). Mehrere Treffer ergeben einen Fehler.
- **Abteilung:** „Abt. X“ und „Abteilung X“ treffen die Abteilung X, „Altersabt. X“ die Altersabteilung von X; „Sonderdienste“, „Führungsgruppe“ und „Jugend…“ ergeben die passenden Typen. Mit der Option `createDepartments` werden fehlende Abteilungen angelegt, Altersabteilungen unter ihrer Einsatzabteilung.
- **Neue Personen** bekommen den Status aus der Datei, sonst `active` (in einer Altersabteilung `veterans`, in einer Jugendfeuerwehr `youth`), und eine Stammmitgliedschaft ab Eintritt (sonst heute).
- **Ausgeschiedene:** Liegt der Austritt nicht in der Zukunft, wird eine neue Person mit Status `left`, Austrittsdatum und beendeter Mitgliedschaft angelegt. Der Austrittsgrund wird dem Katalog `exit-reason` zugeordnet, über den Schlüssel oder übliche Texte („verstorben“ → Tod, „umgezogen“ → Wegzug, „Krankheit“, „kein Interesse“ → eigener Wunsch); sonst gilt der gewählte oder gemerkte Eintrag (Art `exit-reason`), sonst bleibt er leer (`masterdata.import.unknownExitReason`). Bei vorhandenen Personen wird ein Austritt nur gemeldet (`masterdata.import.leftIgnored`), er läuft über den Austrittsdialog.
- **Vorhandene Personen** werden mit der Option `updateExisting` (Standard) aktualisiert, aber nur Felder mit Wert. Eine abweichende Abteilung wird nur gemeldet.
- Das Geschlecht ergibt sich auch aus der Anrede. Das Geburtsdatum wird ohne `masterdata.persons.sensitive` ignoriert und gemeldet.
- Die Transferdateien von MP-Feuer liest das [Modul MP-Feuer](#modul-mp-feuer-mp-feuer) und gibt die Zeilen an dieses Profil.

**Importprofil `masterdata.career`** (`imports/career.import.ts`), Recht `masterdata.persons.write`:
- Eine Zeile je Lehrgang (Qualifikation oder Lehrgangsteilnahme), Beförderung (Dienstgrad) oder Ehrung mit Personalnummer oder „Nachname Vorname“ (und Geburtsdatum), Art, Bezeichnung, Datum und optional „gültig bis“.
- Die Bezeichnung wird dem Katalog zugeordnet: über gleiche Wörter (`imports/catalog-match.ts`) in Name, Schlüssel oder Kürzel, ohne Geschlechtsformen („/-frau“) und Füllwörter („Lehrgang auf Kreisebene“); sonst der eindeutig spezifischste Eintrag, dessen Wörter alle im Text stehen (Klammerzusätze und „BW“ zählen nicht). Mehrdeutige Namen (z. B. „Truppmann“ gegen „Truppmann Teil 1/2“) bleiben offen. Danach gilt die gewählte oder gemerkte Zuordnung (Art wie die Zeile).
- **Lehrgänge des Lehrgangskatalogs:** Passt die Bezeichnung eines Lehrgangs zu keiner Qualifikation, aber über dieselben Regeln zu einem aktiven Lehrgang des Lehrgangskatalogs (ohne Sammellehrgänge), oder ist sie einem Lehrgang zugeordnet (Schlüssel `course:<Lehrgang>` in der Nachschlageliste `qualification`, z. B. `course:other-course`), entsteht eine bestandene Lehrgangsteilnahme am Datum der Zeile (ohne Ort, ohne Termin, ohne Ereignisse, also ohne Lehrgangspauschale). Sie vermittelt die Qualifikationen des Lehrgangs, die die Person an dem Tag nicht gültig hat (mit Verweis auf die Teilnahme, Gültigkeit aus „gültig bis“ oder dem Katalog). Beim Sammellehrgang „Anderer Lehrgang“ wird die Bezeichnung die Beschreibung der Teilnahme; die Bezeichnung „Anderer Lehrgang“ selbst ergibt `masterdata.descriptionRequired`. Dieselbe Person, derselbe Lehrgang, dasselbe Datum und dieselbe Beschreibung bleiben unverändert; eine andere bestandene Teilnahme des Lehrgangs (beim Sammellehrgang mit derselben Beschreibung) ergibt `masterdata.coursePassedAlready`, ein Datum nach heute `masterdata.attendanceInFuture`.
- Unbekannte Bezeichnungen ergeben `masterdata.import.unknownCatalogEntry` (`kind`, `value`) und stehen in `unmatched`; der Benutzer kann einen Eintrag wählen oder anlegen (Arten `qualification`, `rank`, `honor`). Mit der Option `createCatalogEntries` (und `masterdata.catalogs.manage`) werden sie ungefragt im Katalog angelegt; die Datenübernahme bietet die Option nicht an (`transfer: false`).
- Ein Eintrag mit gleichem Katalogschlüssel und Datum bleibt unverändert. Ohne „gültig bis“ gilt die Gültigkeit des Katalogeintrags.
- Aus MP-Feuer-Transferdateien kommen die Zeilen über das [Modul MP-Feuer](#modul-mp-feuer-mp-feuer).

**Ereignisse:** `masterdata.person.left`, `masterdata.person.qualification-changed`, `masterdata.course.passed`, `masterdata.course.revoked` (gelöschte bestandene Teilnahme, `CourseRevokedEvent`) (`MASTERDATA_EVENTS`).

**Suche:** Personen mit lesbarer Akte stehen vorn (die der eigenen Abteilungen zuerst), dann Einträge, die nur im Personenverzeichnis sichtbar sind; diese nennen die Stammabteilung und führen zur Personenliste mit dem Namen als Suche (`/masterdata/persons?q=`), nicht zur Akte.

**Schnittstellen für andere Module.** `MasterdataModule` ist `@Global()` und stellt diese Tokens aus `@forga/masterdata-contracts` bereit. Sie prüfen keine Rechte; das ist Sache des aufrufenden Moduls.

| Token | Leistung |
| --- | --- |
| `PERSON_DIRECTORY` | `search`, `snapshots(ids, date)` mit Abteilungen, gültigen Qualifikationen, Dienstgrad, Geschlecht, Beschäftigung, Musiker und Führerscheinklassen (Namen der Klassen) zum Stichtag, `findByPersonnelNumber`, `memberPeriods` (Name und Mitgliedschaftszeiträume aller Personen mit Abteilung und Stammabteilung, mit `membersOnDate` für Importe über viele Tage), `membersOn(date)` (alle Personen mit Mitgliedschaft am Tag), `careers(ids?)` (mit Ämtern), `offices({ offices? })` (Inhaber von Ämtern mit Zeitraum) |
| `ORGANIZATION` | `departments`, `stations`, `vehicles` |
| `ORGANIZATION_REFERENCES` | `register(module, count(kind, id))`: Verweise auf Abteilungen, Wachen und Fahrzeuge; gelöscht wird nur, was niemand mehr nutzt (`masterdata.inUse`) |
| `CATALOG_REFERENCES` | `register(module, count(kind, key))` und `require(module, kind, key)`: Verweise auf Katalogeinträge und vom Code benötigte Einträge (siehe Kataloge; `catalog.inUse`, `catalog.required`) |
| `MASTERDATA_LICENSE_SELF_CHECK` | `enabled()`, `lookup(code)`, `confirm(code, { terminalId, device, language })`: Selbstkontrolle des Führerscheins mit registriertem Transponder (siehe [Führerscheinkontrolle](#führerscheinkontrolle)) |
| `PERSON_HOLDINGS` | `register(module, count(personId))`: andere Module melden, was eine Person noch hält (z. B. Schutzausrüstung); Austritt und Übernahme in die Altersabteilung lehnen dann mit `masterdata.personHoldsItems` ab (`modules`: Modul-IDs, die Oberfläche nennt die Modulnamen) |

### Führerscheinkontrolle

Teil der Stammdaten (`driver-licenses/`), weil der Führerschein zur Person gehört und die Jahresstatistik (F21, Klasse C/CE) ihn über `PERSON_DIRECTORY` liest. Mockups: `stammdaten/person-fuehrerschein.html`, `stammdaten/fuehrerscheinkontrollen.html`, `stammdaten/fuehrerschein-einstellungen.html`, `infoterminal/fuehrerschein.html`, `infoterminal/fuehrerschein-bestaetigen.html`, `shell/mein-fuehrerschein.html` (umgesetzt ohne „Selbst kontrollieren“, siehe unten).

**Rechtlicher Hintergrund.** Grundlage ist R. Fischer, „Unnötige Bürokratie oder gesetzliche Pflicht? – die regelmäßige Führerscheinkontrolle in der Feuerwehr“, BRANDSCHUTZ 6/26, S. 489–491: Die Pflicht folgt aus der Halterhaftung (§ 21 StVG, Halter ist die Gemeinde); eine feste Prüffrist schreibt nichts vor. Den Führerschein einmal im Original vorlegen lassen, erneut bei konkreten Anhaltspunkten und zum Ablauf befristeter Klassen. Die halbjährliche Kontrolle ist eine Empfehlung der DGUV Regel 105-049 (Abschnitt 4.5). Gespeichert werden nur Klassen, Befristung, Datum, Prüfer und Art; Kopien oder Fotos des Führerscheins sind unzulässig, f.orga bietet dafür keinen Anhang. Die Oberfläche nennt den Artikel als Quelle.

**Daten der Person** (`driverLicense`, JSON, Vertrag `DriverLicense` in `masterdata-contracts`):

| Feld | Inhalt |
| --- | --- |
| `classes` | Liste `{ class, expiresOn }`: je Klasse eine eigene Befristung (`null` = unbefristet) |
| `documentExpiresOn` | Ablauf des Dokuments (Kartenführerschein), nur ein Hinweis in Akte und Liste |
| `lastCheckedOn`, `lastCheckMethod` | jüngste gültige Kontrolle, vom Server aus den Kontrollen berechnet (keine Eingabe) |
| `legacyCheckedOn` | Kontrolldatum aus Altdaten ohne Prüfer; wird bei der nächsten Kontrolle zu einer Kontrolle der Art `legacy` |
| `expiryToVerify` | Befristungen stammen aus einem einzigen alten Datum („Befristung prüfen“), bis zur ersten Kontrolle im Dialog |

Alte Werte (Klassen als Texte, ein `expiresOn` für alles, `lastCheckedOn`) liest `readDriverLicense` (Zod-`preprocess`) ohne Datenmigration: Texte werden Klassen, das alte Datum geht an die befristbaren Klassen C1, C1E, C und CE (`TIME_LIMITED_CLASSES`), gibt es keine davon, an `documentExpiresOn`. Die Klassen ändern sich nur über eine Kontrolle im Original; `PUT /masterdata/persons/:id` nimmt sie nicht mehr an. `snapshots()` liefert weiter `driverLicenseClasses` als Klassennamen.

**Entitäten** (`masterdata.entities.ts`, historisiert mit Elternbezug `person`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `DriverLicenseCheck` | `driver_license_check` | Person, `checkedOn`, `method` (`in-person` Original gesehen, `transponder`, `barcode` Selbstkontrolle, `legacy` Altdaten), `checkedBy` (Person; bei Selbstkontrolle und Altdaten leer), `originalPresented`, festgestellte Klassen mit Befristung, `selfDeclaration` (bestätigter Text in der Sprache des Bildschirms), `terminalId` und `device` (Infoterminal), `requestId` (erledigte Anforderung), Bemerkung, `recordedAt`; Storno mit `cancelledAt`, `cancelledBy`, `cancelReason`. Wird nie geändert oder gelöscht, nur storniert |
| `DriverLicenseRequest` | `driver_license_request` | erneute Vorlage: Grund (Pflicht), fällig am, angefordert von/am, erledigt durch Kontrolle (`completedByCheckId`) oder zurückgenommen (von, am, Grund) |
| `DriverLicenseToken` | `driver_license_token` | Transponder oder Barcode-Aufkleber: Art (`nfc`, `barcode`), `codeHash` (`hidden`, nie in Historie, Antworten oder Export), Endung (letzte 4 Zeichen), registriert von/am, gesperrt von/am mit Grund. Höchstens ein nicht gesperrter je Person |

`codeHash` ist ein HMAC-SHA-256 der normalisierten Kennung (`normalizeRfid`) mit einem per HKDF aus `FORGA_SECRET_KEY` abgeleiteten Schlüssel; die Kennung selbst wird nicht gespeichert. Ein einfacher Hash ließe sich bei 4–10 Byte langen NFC-Kennungen durchprobieren. Ohne `FORGA_SECRET_KEY` lässt sich kein Transponder registrieren (`503 masterdata.noSecretKey`); dieselbe Kennung bei einer anderen Person: `409 masterdata.tokenTaken`.

**Einstellung** `masterdata.driverLicense` (`DriverLicenseSettings`, Seite „Verwaltung → Module → Stammdaten → Führerscheinkontrolle“, `masterdata.settings.manage`):

| Feld | Bedeutung | Standard |
| --- | --- | --- |
| `mode` | `on-occasion` (anlassbezogen) oder `periodic` (zusätzlich regelmäßig); der Wechsel zeigt den Hinweis auf die DGUV Regel 105-049 | `on-occasion` |
| `intervalMonths` | nur `periodic`: Abstand der Kontrollen, 3–24 Monate; die Oberfläche bietet 6 und 12 an | 6 |
| `monitoredClasses` | überwachte Klassen | C1, C1E, C, CE |
| `driverQualifications` | Qualifikationen für Fahrer (Katalogschlüssel) | `machinist` |
| `leadDays` | Vorlauf der Fristen, 0–120 Tage | 30 |
| `selfCheck` | Selbstkontrolle am Infoterminal (nur `periodic`) | aus |
| `inPersonEveryMonths` | mit Selbstkontrolle: Original spätestens nach so vielen Monaten, 6–36 | 12 |

**Zielgruppe:** Personen mit Status Probezeit oder aktiv mit einer überwachten Klasse oder einer Qualifikation für Fahrer. Wer nur die Qualifikation hat, steht mit „Klassen fehlen“ in der Liste.

**Fristen** (`driver-licenses/license-deadlines.ts`, berechnet in `license-status.ts`; Vorlauf `leadDays`, Ziel `/masterdata/persons/:id/driver-license`). Zuständig ist, wer `masterdata.licenses.check` für eine Abteilung der Person hat.

| Art (`kind`) | Fällig | Modus |
| --- | --- | --- |
| `driver-license-first-check` | keine gültige Kontrolle im Original: sofort (heute) | beide |
| `driver-license-class-expires` | je Ablaufdatum der befristeten überwachten Klassen (Klassen mit gleichem Datum zusammen); erledigt durch eine Kontrolle mit neuer Befristung | beide |
| `driver-license-request` | offene erneute Vorlage zum gesetzten Datum (der Titel nennt keinen Grund) | beide |
| `driver-license-check-due` | jüngste gültige Kontrolle (jeder Art) + `intervalMonths` | `periodic` |
| `driver-license-in-person-due` | jüngste Kontrolle im Original + `inPersonEveryMonths`; Selbstkontrollen schieben sie nicht hinaus | `periodic` mit Selbstkontrolle |

Stand einer Person (`DriverLicenseState`, in dieser Rangfolge): `classes-missing`, `overdue` (eine Frist liegt in der Vergangenheit), `requested`, `first-check-missing`, `due` (eine Frist im Vorlauf), `checked`. Stornierte Kontrollen zählen nicht.

**Rechte:** `masterdata.licenses.check` (Abteilung; in den Rollenvorlagen `commander` über `masterdata.*` und `department-commander`, für einen „Fahrerbeauftragten“ einer eigenen Rolle zuweisbar): Kontrolle erfassen und stornieren, erneute Vorlage anfordern und zurücknehmen, Transponder registrieren und sperren, Liste. Führerschein und Kontrollen einer Person liest, wer `masterdata.persons.read` oder `masterdata.licenses.check` für eine ihrer Abteilungen hat; die Gründe erneuter Vorlagen und die Transponder nur mit `masterdata.licenses.check`. In der Historie der Person sind Einträge der Anforderungen ohne das Recht ganz maskiert (`hiddenFields` mit `masterdata.driver_license_request`).

**Endpunkte** (`driver-licenses/driver-licenses.controller.ts`)

| Endpunkt | Inhalt |
| --- | --- |
| `GET /api/masterdata/persons/:id/driver-license` | Führerschein mit Modus, Zielgruppe, Stand, offenen Fristen, Ersterfassung, letzter Kontrolle, Kontrollen, Anforderungen und Transpondern (`DriverLicenseFile`) |
| `POST …/driver-license/checks` | Kontrolle im Original: Datum (nicht in der Zukunft, `masterdata.checkInFuture`), Prüfer (Person, `masterdata.unknownExaminer`), `originalPresented: true` (Pflicht), Klassen mit Befristung, Ablauf des Dokuments, Bemerkung, optional ein Transponder. Die Klassen ersetzen die der Person, offene Anforderungen sind erledigt, ein `legacyCheckedOn` wird vorher zur Kontrolle `legacy` |
| `POST …/checks/:checkId/cancel` | Storno mit Grund; die Klassen der Akte bleiben (`masterdata.checkCancelled` beim zweiten Mal) |
| `POST …/requests`, `POST …/requests/:id/withdraw` | erneute Vorlage mit Grund und Frist, zurücknehmen mit Grund (`masterdata.requestClosed`) |
| `POST …/tokens`, `POST …/tokens/:id/revoke` | Transponder registrieren (ersetzt und sperrt den bisherigen) bzw. sperren mit Grund |
| `GET /api/masterdata/driver-licenses` | Personen der Zielgruppe in den Abteilungen mit `masterdata.licenses.check`: Klassen, nächste Befristung, letzte Kontrolle mit Art und Prüfer, Transponder ja/nein, Stand, Fälligkeit |
| `GET /api/masterdata/me/driver-license` | „Mein Bereich“: eigene Klassen, letzte Kontrolle, nächste Frist und Stand (`masterdata.self`) |

**Selbstkontrolle** (Vertrag `MASTERDATA_LICENSE_SELF_CHECK`, `driver-licenses/self-check.ts`, genutzt vom Infoterminal): nur im Modus `periodic` mit `selfCheck`. `lookup(code)` liefert zur Kennung eines nicht gesperrten Transponders nur Vor- und Nachname, Klassen, letzte Kontrolle, nächste Frist und ob eine Selbstkontrolle möglich ist (`allowed`, `in-person`, `off`); unbekannte und gesperrte Kennungen sind nicht zu unterscheiden. `confirm` legt eine Kontrolle der Art `transponder` bzw. `barcode` mit Selbsterklärung („Mein Führerschein ist gültig. Gegen mich besteht kein Fahrverbot und keine Entziehung der Fahrerlaubnis.“, `SELF_DECLARATION`), Terminal und Zeitpunkt an. Abgelehnt wird sie, solange das Original fällig ist: keine Kontrolle im Original, offene Anforderung, abgelaufene überwachte Klasse oder `inPersonEveryMonths` erreicht (`409 masterdata.inPersonRequired`). Eine Selbstkontrolle ändert die Klassen nie und erscheint in Akte, Liste und Nachweis immer als solche. In „Mein Bereich“ gibt es keine Selbstkontrolle (ein kopierter Code am eigenen Handy wäre leichter zu missbrauchen); dort steht nur der Stand.

**Listen** (`driver-licenses/license-lists.ts`, Recht `masterdata.licenses.check`):
- `masterdata.driver-licenses` „Führerscheinkontrollen: Stand“: Personen der Zielgruppe mit Klassen und Befristung, letzter Kontrolle, Art, Prüfer, Transponder und Stand; Filter Abteilung und Stand.
- `masterdata.driver-license-checks` „Führerscheinkontrollen: Nachweis für die Gemeinde“: alle nicht stornierten Kontrollen im Zeitraum (Standard: laufendes Jahr) mit Datum, Person, Abteilung, Klassen und Befristung, Art, Prüfer (bei Selbstkontrolle das Terminal) und „Original vorgelegt“. Ohne Gründe erneuter Vorlagen und ohne Transponder-Kennungen.

**Import:** Das Profil `masterdata.persons` kennt die Felder „Führerscheinklassen“ (`Führerschein`, `FS-Klassen`, `Fahrerlaubnis`) und „Führerschein gültig bis“; sie werden wie Altdaten gelesen (ein Datum für C1, C1E, C und CE, markiert mit „Befristung prüfen“) und nur bei Personen ohne Klassen übernommen.

**Datenschutz und Audit:** Registrieren und Sperren stehen im Audit-Log (`masterdata.license-token-registered` mit Endung, `masterdata.license-token-revoked`), Selbstkontrollen in der Historie der Person, unbekannte Kennungen am Terminal als `info-terminal.unknown-license-code` (höchstens ein Eintrag je Terminal und Stunde). Die Auskunft enthält Kontrollen, Anforderungen und Transponder (ohne Hash), ebenso der Vollexport. Die Anonymisierung leert den Führerschein und löscht Kontrollen, Anforderungen und Transponder der Person.

## Modul Einsatzberichte (`incidents`)

Benötigt `masterdata`; Personen, Abteilungen, Wachen und Fahrzeuge kommen über `PERSON_DIRECTORY` und `ORGANIZATION`. Verweise auf Stammdaten werden als IDs ohne Fremdschlüssel gespeichert und beim Speichern geprüft.

**Entitäten** (`incidents.entities.ts`, Schema `incidents`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `AlarmKeywordEntity` | `alarm_keyword` | Stichwort (`key`), Name, Statistik-Vorbelegung (`mainType`, `technicalCategory`, `falseAlarmType`), `requiresVehicle`, `compensationKind` (`incident`, `standby`, `fire-watch`) |
| `IncidentEntity` | `incident` | Leitstellennummer (`dispatchNumber`, eindeutig), `internalNumber`, Stichwort, Meldebild, Alarmzeit, Einsatzort (`location` als JSON), Herkunft `createdVia` (`ui`, `api`, `import`), Kosten und Bemerkungen des ganzen Einsatzes: `chargeable`, `chargeableReason`, `notes`; Statistikmerkmale des Einsatzes (`statistics`, siehe Statistikmerkmale) |
| `ReportEntity` | `report` | Bericht einer Abteilung (`departmentId`) oder einer gesamtwehrweiten Einheit (`unit`, genau eines von beiden, Check-Constraint `report_department_or_unit`; jedes Fahrzeug mit Besatzung steht auch in den Fahrzeugen des Berichts, egal ob aus Editor, Import oder API: `addCrewVehicles`): Nummer, `primary`, Status, Sperre, Rückgabekommentar, Verfasser, Zeiten, `endConfirmed` (Ende vom Verfasser bestätigt), Lage/Maßnahmen/Ursache, Einsatzleiter, Wetter, Geräte (Freitext), bestätigte Warnungen (`acknowledgements`), `managedBy` (`api` oder `mp-feuer`: von einem anderen System angelegt und von keinem Menschen bearbeitet; `null`: f.orga) |
| `ReportPersonnelEntity` | `report_personnel` | Person oder Gast, Fahrzeug oder Bereitschaftswache, Funktion, Atemschutz mit Minuten, Gerät und CSA (Chemikalienschutzanzug), `from`/`to`, Verdienstausfall, Arbeitszeit beim Dienstherrn, Zuschläge, manueller Betrag, verletzt/getötet (sichtbar nur für Verfasser, Freigeber und `incidents.injuries.read`, siehe [Datenschutz](datenschutz.md#gesundheitsdaten-l5-teil)) |
| `ReportVehicleEntity`, `InvolvedPartyEntity`, `OtherAgencyEntity` | `report_vehicle`, `involved_party`, `other_agency` | Fahrzeuge mit Zeiten und km, Beteiligte mit Rolle und Anschrift, sonstige Kräfte |
| `StatisticsYearEntity` | `statistics_year` | Korrekturen und Abschluss der Jahresstatistik eines Jahres; beim Abschluss eingefrorene Werte und Prüfungen (`frozenValues`, `frozenChecks`) |
| `ReportRevisionEntity` | `report_revision` | Gespeicherter Inhalt eines Berichts zum Rückgängigmachen (`content` im Format `ReportInput`, Benutzer, Zeitpunkt) |

Alle außer `ReportRevisionEntity` sind historisiert; Personal, Fahrzeuge, Beteiligte und sonstige Kräfte erscheinen in der Historie ihres Berichts. Die Historie eines Berichts liest, wer ihn lesen darf (siehe Berichte gesamtwehrweiter Einheiten); bei Abteilungsberichten also `incidents.reports.read` für seine Abteilung oder `incidents.reports.release` für die Gesamtwehr.

**Stichwort-Katalog.** `GET /api/incidents/keywords` für alle Angemeldeten, Pflege mit `incidents.settings.manage`. Der Schlüssel ist nach dem Anlegen fest. `POST /api/incidents/keywords/templates/bw` ergänzt fehlende Stichworte aus `BW_KEYWORD_TEMPLATE` (B1–B3, B-BMA, B-PKW, TH1/TH2, TH-Person, TH-VU, TH-Öl, TH-Tier, TH-Insekten, TH-Wasser, TH-Sturm, ABC, RD-Unterstützung als Technische Hilfe „sonstige“, BSW, Sicherheitsdienst, Sonstiges). Stichworte ohne `mainType` (BSW, Sicherheitsdienst, Sonstiges) werden statistisch nicht gezählt und verlangen kein Fahrzeug.

**Einsatz und Bericht**
- Ein Einsatz ohne Leitstellennummer bekommt eine interne Nummer `INT-JJJJ-nnnn` (höchste vergebene Nummer des Jahres + 1). Eine schon vergebene Leitstellennummer ergibt `incidents.dispatchNumberTaken`.
- Ein Einsatz wird mit mindestens einer Abteilung angelegt (`incidents.departmentRequired`); nur Freigeber dürfen ihn ohne Bericht anlegen. Wer anlegt, wird Verfasser nur des Berichts seiner eigenen Abteilung (Mitgliedschaft seiner Person, sonst der zuerst gewählten Abteilung); die übrigen Berichte bleiben ohne Verfasser. Wird der letzte Abteilungsbericht eines Einsatzes gelöscht, werden der Einsatz und die Entwürfe gesamtwehrweiter Einheiten mit gelöscht (Audit `incidents.incident-deleted`), damit kein Einsatz zurückbleibt, den niemand in der Liste findet; ist ein solcher Bericht schon fertig gemeldet, freigegeben oder gesperrt, wird das Löschen abgelehnt (`incidents.primaryHasSiblings`).
- Nach dem Anlegen (Oberfläche, externe API, MP-Feuer-Import) sendet das Modul `incidents.incident.created` mit `createdVia` (`ui`, `api`, `import`). Die Antwort auf `POST /incidents/incidents` enthält schon die Berichte, die andere Module daraufhin anlegen (z. B. den EvD-Bericht).
- Die Einsatzdaten (Stichwort, Alarmzeit, Ort, Nummer) ändert, wer den Hauptbericht schreiben darf, oder ein Freigeber (`incidents.notPrimaryWriter`), immer mit der geladenen `version` (`IncidentUpdate`, sonst `conflict.stale`). Schreiber ändern sie nur, solange alle Berichte ungesperrte Entwürfe sind (`incidents.reportLocked`, `incidents.incidentSubmitted`); Freigeber, bis ein Bericht freigegeben ist (`incidents.incidentReleased`, erst die Sperre aufheben). Eine vergebene Leitstellennummer wird ohne Rücksicht auf Groß- und Kleinschreibung und Leerzeichen erkannt. Ändert sich die Alarmzeit, wandern Berichte, die mit der alten Alarmzeit beginnen, mit; ihr Ende verschiebt sich mit, solange es nicht bestätigt ist, ebenso Personal und Fahrzeuge, die zur alten Alarmzeit beginnen.
- Gemeinsame Einsätze: Beim Anlegen sucht `GET /incidents/incidents/matches` vorhandene Einsätze mit derselben Leitstellennummer (ohne Rücksicht auf Groß- und Kleinschreibung und Leerzeichen) oder innerhalb von ±2 Stunden mit demselben Stichwort oder demselben Ort (gleiche Straße, ohne Straße gleicher Ort), auch solche, die der Benutzer noch nicht lesen darf, und liefert nur Mindestdaten (Nummer, Stichwort, Alarm, Ort, beteiligte Abteilungen, dazu die für ihn lesbaren Berichte `ownReports`). Hat die eigene Abteilung schon einen Bericht, bietet der Dialog „Bericht öffnen“ an. Schreiber einer Abteilung fügen ihren Bericht jedem Einsatz hinzu, dessen ID sie kennen (`POST …/incidents/:id/reports`), statt einen doppelten Einsatz anzulegen.
- Je Einsatz und Abteilung gibt es höchstens einen Bericht. Die Berichtsnummer ist je Abteilung und Jahr fortlaufend (`JJJJ-nnn`).
- Einsatzberichte schreiben nur Einsatzabteilungen (Typ `operational`); Jugendfeuerwehr, Altersabteilung, Führungseinheiten, Sonderdienste usw. bekommen keinen Bericht (`requireOperational` in `createReport`, `incidents.departmentNotOperational` mit dem Namen der Abteilung): beim Anlegen eines Einsatzes, bei „Bericht für weitere Abteilung“, in der externen API (Warnung) und im MP-Feuer-Import (Zeilenmeldung). Die Oberfläche bietet nur Einsatzabteilungen an. Personen anderer Abteilungen dürfen trotzdem im Personal stehen (Warnungen `person-not-member` bzw. `person-not-operational`). Für gesamtwehrweite Aufgaben gibt es die Berichte der Einheiten.
- **Hauptbericht:** der erste Abteilungsbericht eines Einsatzes; solange ein Einsatz keinen Abteilungsbericht hat, der erste Bericht einer Einheit (z. B. ein Einsatz nur mit EvD-Bericht). Kommt ein Abteilungsbericht hinzu (Oberfläche, externe API, Import), wird er automatisch Hauptbericht, auch neben einem freigegebenen Einheitsbericht. Ein partieller eindeutiger Index (`report_one_primary_per_incident`, in der Entität als `expression` deklariert) lässt höchstens einen Hauptbericht je Einsatz zu. Beim Wechsel (`POST …/primary`, `setPrimary`) bleiben die Statistikmerkmale beim Einsatz. Der Hauptbericht zeigt den Befund `statistics-missing`, zählt den Einsatz in der Jahresstatistik und druckt die Statistik. Ist der bisherige Hauptbericht freigegeben, wird erst seine Sperre aufgehoben (`incidents.reportReleased`); nur der MP-Feuer-Import und das automatische Umsetzen auf einen neuen Abteilungsbericht setzen den Hauptbericht auch dann um. Ein Einheitsbericht wird nur Hauptbericht, solange der Einsatz keinen Abteilungsbericht hat (`incidents.unitReportNotPrimary`).
- Ein neuer Bericht hat die Alarmzeit des Einsatzes und als Ende eine Stunde später; dieses Ende gilt als nicht bestätigt (`endConfirmed: false`, Regel `end-unconfirmed`), bis der Verfasser es ändert oder bestätigt. Speichern ohne `endConfirmed` (andere Systeme, die eigene Zeiten senden) bestätigt es; der MP-Feuer-Import bestätigt es, wenn die Quelle ein Ende hat.
- **Zeiten von Personal und Fahrzeugen** (`effectiveTimes`/`inheritedTimes` in `incidents-contracts`, auf dem Server `assignmentTimes`): Im Normalfall gelten Alarmierung und Einsatzbereit des Berichts auch für Fahrzeuge und Personal. Die Zeiten gelten immer ab der Alarmierung; bei der Erstalarmierung ist Alarmierung gleich Ausrücken. Ein Fahrzeug kann eigene Zeiten haben (`alarmedAt` alarmiert, z. B. später nachalarmiert; `departedAt` ausgerückt; `returnedAt` eingerückt; `null` = Zeiten des Berichts), eine Person eigene Zeiten (`from`/`to`, `null` = geerbt), z. B. wenn sie früher herausgelöst wurde. Wirksam ist für den Beginn: eigene Zeit der Person, sonst Alarmierung ihres Fahrzeugs, sonst Alarmierung des Berichts; für das Ende: eigene Zeit der Person, sonst Eingerückt ihres Fahrzeugs, sonst Einsatzbereit des Berichts. Ausgerückt zählt nur für das Fahrzeug selbst (Kostenersatz, PDF, Prüfregeln), nicht für die Besatzung. Personen auf Bereitschaft folgen nur dem Bericht. Die wirksamen Zeiten gelten überall: Entschädigung, Prüfregeln (auch Überschneidungen mit anderen Berichten und Einsätzen), Bericht (`personnel[].from/to` sind immer wirksame Zeiten), PDF, Listen und Export, „Meine Einsätze“, Personalakte, Vorschau der Entschädigung, Kostenersatz und das Ereignis der Freigabe (Entschädigungen, Atemschutz). Ändert sich die Alarmzeit des Einsatzes, wandern eigene Zeiten von Personal und Fahrzeugen (Alarmiert, Ausgerückt) mit, die zur alten Alarmzeit beginnen.
- Speichern (`PUT …/reports/:id`, `ReportUpdate` mit der geladenen `version`) ersetzt den ganzen Inhalt samt Personal, Fahrzeugen, Beteiligten und sonstigen Kräften. Geprüft werden: Person existiert, Fahrzeug existiert, keine Person doppelt im selben Bericht.

**Berichte gesamtwehrweiter Einheiten** (`units/`). Ein Bericht gehört entweder einer Abteilung oder einer gesamtwehrweiten Einheit, die ein anderes Modul anmeldet (z. B. der Einsatzleiter vom Dienst, Modul `duty-officer`). Das Modul Einsatzberichte kennt selbst keine Einheit.
- Anmeldung über `INCIDENT_UNITS` (`IncidentUnit`): `key`, `module` (ID des anmeldenden Moduls), `label` und `shortLabel` (`LocalizedText`, z. B. „Einsatzleiter vom Dienst“ / „EvD“), `numberPrefix`, `readPermission`, `writePermission`, `reviewPermission`, `vehicleRequired`. `GET /api/incidents/units` liefert die Einheiten allen Angemeldeten, damit die Oberfläche Berichte benennt und Rechte prüft. Für neue Berichte aus Importen gelten nur Einheiten aktiver Module (`IncidentUnitsRegistry.active()`).
- Je Einsatz und Einheit höchstens ein Bericht; Nummer je Einheit und Jahr mit Präfix, z. B. `EvD-2026-001`. Hat der Einsatz keinen Abteilungsbericht, ist der erste Einheitsbericht Hauptbericht (Regeln `statistics-missing` und `incident-time-differs` wie bei Abteilungen), und seine Schreiber erfassen die Statistik des Einsatzes. Neben einem Abteilungsbericht ist ein Einheitsbericht nie Hauptbericht (siehe „Hauptbericht“).
- Lesen: Freigeber, wer `incidents.reports.read` für die Gesamtwehr hat, und wer eines der drei Rechte der Einheit hat. Schreiben: wer `writePermission` hat (Verfasserauswahl `GET /incidents/authors?unit=<key>`), sonst wie bei Abteilungsberichten (Entwurf, ungesperrt; Freigeber immer). Zurückgeben und Verfasser erinnern: Freigeber und wer `reviewPermission` hat. Freigeben, Sperre aufheben wie bei allen Berichten. Die Endpunkte zum Speichern, Fertigmelden, Wiederherstellen, Verfasser zuweisen und Löschen verlangen deshalb nur `incidents.reports.read` und prüfen das Schreibrecht am Bericht.
- Angelegt und gelöscht werden Einheitsberichte nur vom Modul der Einheit über `INCIDENTS_UNIT_REPORTS`: `createUnitReport(incidentId, unit, { authorPersonId, personnel })` (vorhandener Bericht bleibt unverändert, Audit `incidents.unit-report-created`), `deleteUnitReport` (nur ungesperrter Entwurf, sonst `incidents.unitReportNotDraft`; ein Hauptbericht gibt seine Rolle an einen anderen Einheitsbericht ab, als einziger Bericht des Einsatzes bleibt er: `incidents.unitReportOnlyReport`), `hasUnitReport`, `unitReports(incidentIds, unit)`, `incidents(ids)`. `DELETE /incidents/reports/:id` lehnt Einheitsberichte ab (`incidents.unitReportManaged`).
- Prüfregeln: `person-not-member` gilt nicht (Personen kommen aus allen Abteilungen); `vehicle-missing` nur, wenn die Einheit `vehicleRequired` meldet. Überschneidungen im selben Einsatz nennen die Einheit (Parameter `unit:<key>`, die Oberfläche setzt den Namen ein).
- Fristen: Entwürfe gehen an den Verfasser (mit `writePermission`), Entwürfe ohne schreibfähigen Verfasser und überfällige an `reviewPermission` und Freigeber, Berichte zur Prüfung an Freigeber und `reviewPermission`.
- Listen, PDF, Abrechnungsexport, Prüfung vor der Auszahlung, „Meine Einsätze“ und die Einsätze in der Personalakte nennen statt der Abteilung den Kurznamen der Einheit in der Sprache des Benutzers; das PDF nennt den vollen Namen, „Hauptbericht“ und die Statistik nur beim Hauptbericht. Eigene Verletzte aus Einheitsberichten zählen in der Jahresstatistik als Einsatzabteilung.
- `INCIDENTS_LOOKUP` liefert je Bericht `departmentId` (bei Einheiten `null`), `unit` und für den Kostenersatz `unitLabel`; `departmentIds` eines Einsatzes nennt nur Abteilungen, die Freigabestufe zählt alle Berichte. `incidents.report.released` trägt `unit` und `departmentId: null`.
- Die externe API ändert Einheitsberichte nicht; der Import des Einsatzpersonals legt sie an und ersetzt sie, wenn die Zeilen einer Einheit zugeordnet sind (Spalte `unit` bzw. „Einsatzberichte als“ im Modul MP-Feuer). `matches` nennt nur Abteilungsberichte.

**Versionen zum Rückgängigmachen.** Die Oberfläche speichert automatisch; nachvollziehbar ist jede Änderung über die Historie, rückgängig machen lässt sie sich über Versionen (`recordRevision` in `reports.service.ts`):
- Jede Speicherung legt den gespeicherten Inhalt als Version ab.
- Speichert derselbe Benutzer innerhalb von 10 Minuten erneut, wird seine letzte Version aktualisiert statt eine neue anzulegen (automatisches Speichern erzeugt so keine Flut).
- Vor der ersten Speicherung wird zusätzlich der bisherige Zustand abgelegt (`reportToInput`), z. B. nach Anlage, Import oder API, ohne Benutzer.
- Je Bericht bleiben höchstens die 50 jüngsten Versionen.
- Wiederherstellen (`POST …/revisions/:revisionId/restore`) ist eine normale Speicherung: gleiche Rechte und Prüfungen, Sperre durch Freigeber, neue Version – lässt sich also selbst wieder rückgängig machen.

**Eintragungen vom Infoterminal** (`terminal/terminal-booking.service.ts`, Vertrag `INCIDENTS_TERMINAL_BOOKING` für das Modul [Infoterminal](#modul-infoterminal-info-terminal)):
- Personalzeilen tragen ihre Herkunft: `bookedVia: 'info-terminal'`, `bookedAt` (eingetragen oder zuletzt am Terminal geändert), `terminalId` und `terminalEditable` (am Terminal noch änderbar). Der Bericht liefert `personnel[].bookedVia/bookedAt/terminalEditable` und `latestBookingAt`.
- Eintragungen ändern nur ihre eigene Personalzeile, nicht die `version` des Berichts; so löst das automatische Speichern des Editors keinen Konflikt `conflict.stale` aus. Sie werden unter Sperre des Berichts geschrieben, legen eine Version mit dem technischen Benutzer des Terminals an und setzen `managedBy` auf `null` (ohne die Version zu ändern): Ab dann ändern externe API und MP-Feuer-Import den Bericht nicht mehr. Führt MP-Feuer (`externalLeading: 'mp-feuer'`), nehmen Berichte mit `managedBy: 'mp-feuer'` keine Eintragungen an (`409 incidents.ledByMpFeuer`).
- Abgleich beim Speichern (`mergeBookings`): Der Editor schickt `bookingsKnownAt` (den geladenen `latestBookingAt`) und je Zeile das geladene `bookedAt`. Terminal-Zeilen, die danach eingetragen oder geändert wurden, bleiben stehen, auch wenn der Client sie nicht schickt; unverändert mitgeschickte bleiben am Terminal änderbar. Ändert der Benutzer eine Terminal-Zeile, gehört sie zum normalen Inhalt (Herkunft bleibt sichtbar) und ist am Terminal gesperrt; lässt er eine bekannte weg, ist sie entfernt. Eine am Terminal inzwischen ausgetragene Zeile fügt der Editor nicht wieder ein. Ohne `bookingsKnownAt` (z. B. Wiederherstellen einer Version) gilt alles als bekannt; eine wiederhergestellte Version gehört dem Verfasser.
- Einsätze vom Terminal haben `createdVia: 'terminal'`.

**Prüfregeln** (`domain/rules.ts`, reine Funktion `evaluateRules`). Die Einstellung `incidents.general.rules` schaltet Regeln ab oder ändert ihre Stufe.

| Regel | Stufe | Bedingung |
| --- | --- | --- |
| `primary-missing` | Fehler | Einsatz ohne Hauptbericht (blockiert nur die Freigabe) |
| `report-empty` | Fehler | Lage und Maßnahmen leer |
| `statistics-missing` | Fehler | Einsatz eines gezählten Stichworts ohne Statistikmerkmale; nur am Hauptbericht, damit er ohne sie weder fertig gemeldet noch freigegeben wird |
| `no-personnel` | Fehler | kein Personal |
| `vehicle-missing` | Fehler | Person ohne Fahrzeug und ohne Bereitschaft; nicht bei Einheiten mit `vehicleRequired: false` und nicht bei Stichworten mit `requiresVehicle: false` |
| `personnel-overlap-incident` | Fehler | Person in einem anderen Bericht desselben Einsatzes mit sich überschneidender Zeit (aneinandergrenzende Zeiten sind erlaubt) |
| `personnel-overlap-other` | Warnung | Überschneidung mit einem anderen Einsatz (Suche ±2 Tage; lange Zeiträume im anderen Einsatz werden ignoriert, eine lange Zeit im eigenen Bericht wird trotzdem verglichen) |
| `times-invalid` | Fehler | Ende nicht nach Beginn (Bericht oder Person) |
| `duration-long` | Warnung | Bericht länger als `longDurationHours` (Standard 24 h; der Text nennt die eingestellten Stunden) |
| `end-unconfirmed` | Fehler | Ende ist noch die Vorgabe (Alarm + 1 h) und nicht bestätigt |
| `times-order` | Warnung | Zeiten des Berichts in falscher Reihenfolge (Alarmierung, Ausrücken, Eintreffen, Einsatzende, Einsatzbereit) |
| `incident-time-differs` | Warnung | Hauptbericht beginnt nicht mit der Alarmzeit des Einsatzes; ein Nebenbericht beginnt vor ihr (später alarmierte Abteilungen beginnen später) |
| `personnel-duration-long` | Warnung | Person länger als `longDurationHours` eingetragen |
| `personnel-times-outside` | Warnung | eigene Zeiten einer Person außerhalb der Zeiten ihres Fahrzeugs (wenn es eine eigene Alarmierung oder ein eigenes Einrücken hat; der Text nennt das Fahrzeug), sonst außerhalb der Zeiten des Berichts |
| `vehicle-times-invalid` | Fehler | eigene Zeiten eines Fahrzeugs nicht in der Reihenfolge Alarmiert ≤ Ausgerückt ≤ Eingerückt, Eingerückt nach Alarmiert (fehlende Zeiten aus dem Bericht) |
| `vehicle-times-outside` | Warnung | Alarmierung oder Einrücken eines Fahrzeugs mit eigenen Zeiten außerhalb der Zeiten des Berichts |
| `person-not-operational` | Warnung | Person am Einsatztag mit Status Jugend, Altersabteilung, passiv oder ausgetreten (Stammdaten) |
| `person-not-member` | Warnung | Person am Einsatztag nicht Mitglied der Abteilung des Berichts (nicht bei Berichten von Einheiten) |
| `person-too-young` | Warnung | Person am Einsatztag jünger als `minimumAgeIncidents` aus `masterdata.membership` |
| `rate-missing` | Warnung | kein Stundensatz für das Datum (auch, solange gar keiner eingetragen ist) |
| `working-hours-and-loss-of-earnings` | Fehler | Arbeitszeit beim Dienstherrn und Verdienstausfall zugleich |
| `crew-exceeded` | Warnung | mehr Personen als Sitzplätze des Fahrzeugs; der Text nennt das Fahrzeug |
| `breathing-without-qualification` | Warnung | Atemschutz ohne gültige Qualifikation `breathing-apparatus` |
| `breathing-not-fit` | Warnung | Atemschutz bei einer Person mit roter Atemschutz-Ampel am Einsatztag (nur mit Modul Atemschutz) |

Warnungen werden mit Begründung bestätigt (`acknowledgements`, je Regel und Gegenstand, z. B. Person). Die Befunde liefert jeder Bericht in `findings`, bestätigte Warnungen mit `acknowledged` und der Begründung (`reason`).

**Entschädigung** (`domain/compensation.ts`, Einstellung `incidents.general`)
- Stunden: `started-hour` (angefangene Stunde, Standard), `started-half-hour` oder `exact-minutes`.
- Satz: der Satz der Art (`incident`, `fire-watch` nach Stichwort, `standby` bei Bereitschaft) mit dem jüngsten `validFrom` bis zum Tag des Beginns (Europe/Berlin). Standardmäßig ist kein Satz eingetragen; die Einstellungen bieten die Beispielwerte `RATE_TEMPLATE` (15 € je Art ab 01.01.2026) als „Vorlage übernehmen“ an.
- Bereitschaft auf der Wache: immer `standbyHours` (Standard 1).
- Während der Arbeitszeit (beim Arbeitgeber, meist der Gemeinde) und für Gäste: keine Entschädigung; mit `compensateDuringWorkingHours` werden Einsätze während der Arbeitszeit normal vergütet.
- Zuschläge (`allowances`) werden addiert; die Standardeinstellung enthält keine. Eine Einsatzleiter-Pauschale gibt es im Bericht nicht, sie kommt aus dem EvD-Dienstplan (Modul [Einsatzleiter vom Dienst](#modul-einsatzleiter-vom-dienst-duty-officer)).
- Ein manueller Betrag (`compensationOverride` mit Begründung) ersetzt den berechneten.
- Gäste und Einsätze während der Arbeitszeit beim Dienstherrn ergeben 0.

**Ablauf**

| Aktion | Recht | Von → nach |
| --- | --- | --- |
| `submit` | Schreibrecht | `draft` → `review`. Fehler blockieren (`incidents.findingsOpen`), unbestätigte Warnungen ebenfalls (`incidents.warningsNotAcknowledged`). Die mitgeschickten Begründungen werden nur bei Erfolg gespeichert. |
| `return` | `incidents.reports.release` (Gesamtwehr) oder `incidents.reports.review` für die Abteilung des Berichts; einen von einem Freigeber gesperrten Bericht nur Freigeber (`incidents.reportLocked`) | `review` → `draft` mit Kommentar (Audit `incidents.report-returned` mit Berichtsnummer); die Sperre hebt nur auf, wer auch `incidents.reports.unlock` hat, sonst bleibt der Entwurf gesperrt. Der Verfasser bekommt eine E-Mail in der Sprache seines Benutzers (sonst Deutsch) mit dem Kommentar und dem Link zum Bericht, wenn er eine E-Mail-Adresse hat (`incidents.author-notified`); ein Fehler beim Versand hält das Zurückgeben nicht auf |
| `release` (`compensation` oder `billing`) | `incidents.reports.release` | `compensation` nur aus `review`, `billing` aus `review` oder `released-compensation` (sonst `incidents.invalidTransition`); ein Entwurf wird also immer erst fertig gemeldet. Fehler blockieren, offene Warnungen gelten als bestätigt (Begründung `released`). Audit `incidents.report-released` mit Berichtsnummer, Ereignis `incidents.report.released`. `POST …/reports/release` gibt mehrere Berichte nacheinander frei und meldet nicht freigegebene mit Fehlercode zurück (`ReleaseManyResult`, Audit `incidents.reports-released`); die Oberfläche nennt jeden nicht freigegebenen Bericht mit Grund |
| `unlock` | `incidents.reports.unlock` | Sperre aufheben; ein freigegebener Bericht zurück nach `review` oder `draft`, ein gesperrter Entwurf nur nach `draft`. Grund im Audit (`incidents.report-unlocked` mit Berichtsnummer), Ereignis `incidents.report.unlocked` |

Die Freigabe ist zweistufig: erst zur Entschädigungsauszahlung, dann zur Abrechnung (die Abrechnung schließt die Entschädigung ein). Mit `incidents.general.compensationRelease: false` entfällt die erste Stufe; `release` mit `compensation` ergibt dann `incidents.compensationReleaseDisabled`.

- Freigegebene Berichte ändert niemand (Speichern, Version wiederherstellen, Hauptbericht, Verfasser, Anhänge: `incidents.reportReleased`), auch kein Freigeber; erst wird die Sperre aufgehoben, damit die Empfänger der Freigabe davon erfahren. Die Statistik gehört zum Einsatz und bleibt für Freigeber offen (siehe Statistikmerkmale).
- Sonst hat Schreibrecht, wer `incidents.reports.write` für die Abteilung des Berichts hat, solange der Bericht ein Entwurf (sonst `incidents.notDraft`) und nicht gesperrt ist (`incidents.reportLocked`). Nach dem Fertigmelden ändert der Verfasser den Bericht also erst nach einer Rückgabe. Freigeber (`incidents.reports.release` für die Gesamtwehr) dürfen Entwürfe und Berichte zur Prüfung schreiben; ihr Speichern oder Freigeben sperrt den Bericht (`locked`, `lockedBy`, `lockedAt`).
- Vorprüfung in der Abteilung: `incidents.reports.review` (Bereich Abteilung, Rollenvorlage `department-commander`) erlaubt, Berichte der eigenen Abteilungen zurückzugeben und ihre Verfasser zu erinnern; freigeben darf nur `incidents.reports.release`. Vorprüfer bekommen die Aufgabe `report-review` ihrer Abteilungen und sehen „Zur Prüfung“ (Menü mit `incidents.reports.review`) auf ihre Abteilungen gefiltert.
- Verfasser kann nur sein, wer ein aktives Benutzerkonto hat, das die Berichte der Abteilung schreiben (oder Berichte freigeben) darf; `GET /incidents/authors?departmentId` nennt diese Personen (`reports/report-writers.ts`), nur sie bietet die Oberfläche an. Ein Verfasser ohne solches Konto wird als „kann den Bericht nicht schreiben“ markiert, und der Entwurf wird wie ohne Verfasser zur Aufgabe der Schreiber der Abteilung und der Freigeber.
- Löschen geht nur im Entwurf; ein Hauptbericht nur als letzter Abteilungsbericht des Einsatzes. Audit `incidents.report-deleted` mit Berichtsnummer; das Ereignis `incidents.report.unlocked` (Grund `deleted`) lässt die Empfänger zurücknehmen, was von einer früheren Freigabe des Entwurfs übrig ist.
- `incidents.report.released` enthält Personal (mit Atemschutz, Minuten und CSA) und Fahrzeuge, z. B. für das Atemschutzmodul.

**Statistikmerkmale.** Einmal je Einsatz, nicht je Bericht (`IncidentEntity.statistics`, `IncidentStatistics`): eigene Gemeinde oder Überlandhilfe, Einsatzhauptart `fire`, `technical-assistance`, `false-alarm` oder `other`, Brandgröße, TH-Kategorie 1–8 (`technicalCategoryByPrecedence` wählt die mit dem Vorrang), Fehlalarmart, Katastrophen-Voralarm/-Einsatz, gerettete Personen (davon Rauchgas), Tote, Fahrzeugbrand, Verkehrsunfall, Tierrettung. Pflichtunterfelder werden je Hauptart geprüft. Rettungsdienst und Krankentransport werden bewusst nicht erfasst; F46–F49 der Landesvorlage bleiben leer.
- Der Einsatz (`Incident`) liefert `statistics`, `statisticsCounted` (das Stichwort hat eine `mainType`), `statisticsEditable` (der Benutzer darf sie jetzt ändern) und, solange ein gezählter Einsatz keine Statistik hat, `statisticsSuggestion` aus dem Stichwort und dem Einsatzort (eigene Gemeinde, wenn der Ort in `homeMunicipalities` steht oder diese leer sind).
- `PUT /incidents/incidents/:id/statistics` (`StatisticsUpdate` mit der geladenen `version` des Einsatzes, sonst `conflict.stale`) setzt oder entfernt (`null`) sie. Ändern dürfen Freigeber (`incidents.reports.release` für die Gesamtwehr), auch nach der Freigabe, und wer einen Bericht des Einsatzes schreiben darf (Abteilung des Berichts bzw. `writePermission` der Einheit), solange einer seiner Berichte ein ungesperrter Entwurf ist (sonst `incidents.statisticsSubmitted`; ohne Schreibrecht an einem Bericht `auth.forbidden`). Lesen darf sie, wer den Einsatz lesen darf.
- Ist die Jahresstatistik des Jahres der Alarmzeit (Europe/Berlin) abgeschlossen, ändert niemand mehr die Statistik ihrer Einsätze (`incidents.statisticsClosed`); erst wird das Jahr wieder geöffnet.
- Nur Stichworte, die in der Statistik zählen, bekommen Statistikmerkmale (`incidents.statisticsNotCounted`). Bekommt ein Einsatz später ein Stichwort ohne `mainType`, bleiben vorhandene Merkmale stehen, zählen aber nicht.
- Eine Änderung sperrt keinen Bericht, verlangt keine neue Freigabe und sendet keine Ereignisse (Entschädigung und Atemschutz hängen nicht davon ab). Audit `incidents.statistics-changed` mit Einsatz und Leitstellennummer; die Änderung steht in der Historie des Einsatzes.

**Externe API** (`POST /api/incidents/v1/incidents`, Recht `incidents.api.create`, z. B. per API-Token)
- Idempotent über die Leitstellennummer: legt Einsatz und fehlende Berichte an oder ergänzt sie.
- Abteilungen werden über ID, Namen oder Kurzname erkannt („Abt.“/„Abteilung“ wird ignoriert), Fahrzeuge über ID, Bezeichnung oder Funkrufnamen, Personen über die Personalnummer.
- Neue Berichte haben `managedBy: 'api'`. Nur solche Berichte bekommen Personal von der API; sobald ein Mensch speichert, fertigmeldet, freigibt oder entsperrt, ändert die API den Bericht nicht mehr.
- Verfasser ist die Person mit Funktion `group-leader`, sonst der Kommandant der Abteilung.
- Nicht erkannte Werte führen nicht zum Abbruch, sondern zu `warnings` (`incidents.api.unknownDepartment`, `incidents.api.unknownPerson`, `incidents.api.unknownVehicle`); eine Abteilung, die keine Einsatzabteilung ist, bekommt keinen Bericht (`incidents.departmentNotOperational`).

**Import des Einsatzpersonals** (Importprofil `incidents.personnel` „Einsatzpersonal“, `imports/personnel.import.ts`, Recht `incidents.reports.release`)
- Eine Zeile je Person und Bericht. Die Spalten werden über ihre Namen vorgeschlagen (z. B. „Leitstellennummer“, „Einsatznummer“, „Beginn“, „Alarmstichwort“, „Abteilung“, „Name“, „Funktion“, „Freigabestatus“, „Hauptbericht“, „Statistik: Einsatzhauptart“); MP-Feuer-Spaltenüberschriften kennt das Profil nicht. Transferdateien von MP-Feuer übersetzt das [Modul MP-Feuer](#modul-mp-feuer-mp-feuer) vorher in diese Spalten.
- Berichtstext: `Lage` → Lage; `Verlauf` und `Bericht` zusammen → Maßnahmen.
- Funktion über Name oder Kürzel im Katalog `function` (z. B. „Maschinist“, „Gruppenführer“, „EvD“); sonst die gewählte oder gemerkte Funktion bzw. das Ziel (Art `function`); andere Werte bleiben leer (`incidents.import.unknownFunction`).
- Texte, die keine Funktion sind (z. B. „Arbeitszeit Stadt Musterstadt“, wenn die Abteilung die Spalte für die Arbeitszeit genutzt hat), lassen sich unter „Nicht zugeordnete Bezeichnungen“ statt einer Funktion einem Ziel zuordnen (`imports/function-targets.ts`, Zusatzziele der Art `function`): „Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn“ (ohne Funktion, `duringWorkingHours`), „Keine Funktion – Verdienstausfall“ (ohne Funktion, `lossOfEarnings`, zusätzlich zur Spalte „Verdienstausfall“) oder „Keine Funktion (ignorieren)“ (ohne Funktion, ohne Meldung). Gemerkt wird die Zuordnung wie jede andere in der Zuordnungsliste des Aufrufers.
- Freigabestatus: `draft`, `released-compensation`, `released-billing` oder deren Bezeichnungen („Entwurf“, „Freigabe Entschädigung“, „Freigabe Abrechnung“); sonst nach Wörtern („Abrechnung“ → `released-billing`, „Entschädigung“ oder „Auszahlung“ → `released-compensation`), leer `draft`. Freigegebene Berichte werden gesperrt (`lockedBy` „MP-Feuer“ bzw. „Import“).
- Statistik in eigenen Spalten nach `IncidentStatistics` (`imports/personnel-columns.ts`): Einsatzhauptart, Brandgröße, Art der Technischen Hilfe, Fehlalarm (Codes oder Bezeichnungen der Landesvorlage), eigene Gemeinde, Fahrzeugbrand, Verkehrsunfall (ja/nein), gerettete Personen, davon Rauchgas, Tote, gerettete Tiere. Ohne Einsatzhauptart bleibt die Statistik offen; unvollständige oder unbekannte Werte ergeben `incidents.import.invalidStatistics` (mit `field`, `value`) an der ersten Zeile des Berichts.
- Nicht übernommen wird eine Vergütung: f.orga berechnet die Entschädigung selbst nach der Satzung.
- Einsatz = Leitstellennummer. Ohne Nummer entsteht eine stabile Nummer `MP-<Jahr>-<Einsatz-Nr.>-<Abteilung>`, damit ein erneuter Import denselben Einsatz trifft.
- Bericht = Abteilung + Einsatznummer + Beginn. Nur Einsatzabteilungen; die Zeilen anderer Abteilungen werden nicht übernommen (`incidents.departmentNotOperational`).
- Zeilen mit einer gesamtwehrweiten Einheit (optionale Spalte `unit` mit Schlüssel, Name oder Kurzname, z. B. „EvD“; im Modul MP-Feuer „Einsatzberichte als“) ergeben statt eines Abteilungsberichts den Bericht der Einheit zu diesem Einsatz, mit denselben Feldern, Status, Sperre und Ersetzungsregeln; die Abteilung der Zeile spielt dann keine Rolle, Bereitschaft ergibt keine Wache. Unbekannte Einheit: `incidents.import.unknownUnit`. Eine Einheitszeile mit derselben Leitstellennummer gehört zum Einsatz der Abteilungen; ohne Leitstellennummer lautet die stabile Nummer `MP-<Jahr>-<Einsatz-Nr.>-<Präfix der Einheit>`.
- Hauptbericht ist der Bericht mit „Hauptbericht: ja“; ein Einheitsbericht nur, solange der Einsatz keinen Abteilungsbericht hat (sonst gilt die Regel „Hauptbericht“). Die Statistik des Hauptberichts wird die des Einsatzes; ohne Statistik bleibt die vorhandene stehen. Ein erneuter Import setzt sie, solange der Hauptbericht vom Import verwaltet wird, aber nur, wenn der Einsatz noch keine Statistik hat oder MP-Feuer führt (`externalLeading`, nur bei Läufen des Moduls MP-Feuer); sonst bleibt die in f.orga gepflegte Statistik.
- Personen über die Personalnummer, sonst über „Nachname Vorname“. Bereitschaft ergibt die erste Wache der Abteilung, sonst das Fahrzeug über Funkrufname oder Bezeichnung oder das gewählte bzw. gemerkte Fahrzeug (Art `vehicle`).
- Zeiten und Kilometer des Fahrzeugs einer Person (optionale Felder „Fahrzeug alarmiert“, „Fahrzeug ausgerückt“, „Fahrzeug eingerückt“, „Fahrzeug Kilometer“) werden eigene Zeiten des Fahrzeugs im Bericht, soweit sie von den Zeiten des Berichts abweichen (Alarmiert von der Alarmierung, Ausgerückt vom Ausrücken, sonst der Alarmierung, Eingerückt von Einsatzbereit). Die Zeiten einer Person („Person von“/„Person bis“) werden nur dann eigene Zeiten, wenn sie von den geerbten (Fahrzeug, sonst Bericht) abweichen; so bleiben die Stunden der Quelle erhalten.
- Ein Stichwort, das es nicht als Schlüssel gibt, ersetzt das gewählte oder gemerkte (Art `alarm-keyword`); sonst wird es mit der Option `createKeywords` (Standard) angelegt (`incidents.import.keywordCreated`).
- **Wer den Bericht verwaltet** (`managedBy`) hängt von der Quelle ab (`ImportContext.source`): Läufe des Moduls MP-Feuer setzen `mp-feuer` (Schutz, `externalLeading` und gemeldete Freigaben im [Parallelbetrieb](parallelbetrieb-mp-feuer.md)), der Tabellen-Import setzt `import` (ersetzbar, solange unbearbeitet, aber nicht schreibgeschützt).
- Wiederholbar: Importierte Berichte werden bei einem erneuten Import ganz ersetzt, auch Personal und Fahrzeuge (ein in der Quelle entferntes Fahrzeug verschwindet); Berichte der API (`api`) übernimmt der Import ebenso. Berichte, die seitdem ein Mensch bearbeitet (gespeichert, fertiggemeldet, zurückgegeben, freigegeben, entsperrt) oder in f.orga weitergeführt hat, bleiben unverändert (`incidents.import.reportEdited`). Die Einsatzdaten eines vorhandenen Einsatzes ändert ein Lauf des Moduls MP-Feuer nur, solange MP-Feuer führt, dann nach dem Hauptbericht von MP-Feuer; „kostenpflichtig“ setzt der Import nur, nie zurück.
- Ereignisse: Neue Einsätze melden `incidents.incident.created` mit `createdVia: import`. Freigaben meldet nur ein Lauf des Moduls MP-Feuer und nur mit der Einstellung `externalEventsFrom` (für Berichte ab diesem Tag): `incidents.report.released` für freigegebene Berichte, deren Status, Zeiten, Personal, Fahrzeuge oder Stichwort sich geändert haben (`releaseSignature`), `incidents.report.unlocked` (Grund `mp-feuer`) für Berichte, deren Freigabe MP-Feuer zurückgenommen hat. Der Probelauf meldet nichts.
- Eine Zeile ohne Person trägt nur den Bericht (z. B. ein Bericht ohne Personal).
- Mehrere Berichte einer Abteilung zu derselben Leitstellennummer werden zu einem Bericht zusammengeführt: Felder aus dem ersten, Personal aus allen, Ende das späteste.
- Transaktion: Ein Aufruf läuft ganz in einer Transaktion; die Übernahme wird am Ende bestätigt (ein Teil eines großen Laufs ganz oder gar nicht), der Probelauf zurückgerollt. Die Ereignisse gehen erst nach der Bestätigung hinaus. Personen werden einmal über `memberPeriods` geladen und je Tag gefiltert; alle 50 Berichte werden die Änderungen geschrieben und der Unit of Work geleert. Ebenso übernimmt `training.sessions` in einer Transaktion.
- Meldungen je Zeile: `masterdata.import.unknownDepartment`, `incidents.departmentNotOperational`, `incidents.import.unknownUnit`, `imports.invalidDate`, `incidents.unknownKeyword`, `incidents.import.keywordCreated`, `incidents.import.invalidStatistics`, `incidents.import.unknownPerson`, `incidents.personTwiceInReport`, `incidents.api.unknownVehicle`, `incidents.import.unknownFunction`, `incidents.import.reportEdited`. Meldungen zum ganzen Bericht stehen an seiner ersten Zeile.

**Fristen** (`deadlines/incidents.deadlines.ts`)

| Art | Zuständig | Fällig |
| --- | --- | --- |
| `report-open` / `report-returned` | Verfasser (`personIds`) mit `incidents.reports.write` in der Abteilung | 7 Tage nach Alarm |
| `report-overdue` („Überfälligen Einsatzbericht fertigstellen lassen“) | nach Ablauf der Frist statt `report-open`: `incidents.reports.write` in der Abteilung (auch der Verfasser) oder `incidents.reports.release` | 7 Tage nach Alarm |
| `report-no-author` („Verfasser für Einsatzbericht zuweisen“) | ohne Verfasser oder mit einem Verfasser, der den Bericht nicht schreiben kann: `incidents.reports.write` in der Abteilung oder `incidents.reports.release` | 7 Tage nach Alarm |
| `report-locked` | `incidents.reports.release` für die Gesamtwehr: ein von einem Freigeber gesperrter Entwurf, den der Verfasser nicht mehr schreiben kann | 7 Tage nach Alarm |
| `report-review` („Einsatzbericht prüfen“) | `incidents.reports.release` für die Gesamtwehr oder `incidents.reports.review` in der Abteilung | 14 Tage nach Alarm |
| `report-billing` | `incidents.reports.release` für die Gesamtwehr, nur mit zweistufiger Freigabe: zur Entschädigung freigegeben, Abrechnung offen | 42 Tage nach Alarm |

Führt MP-Feuer (`externalLeading`), sind seine Berichte (`managedBy: 'mp-feuer'`) keine Fristen.

**Listen** (Recht `incidents.reports.read`, Zeilen nur aus lesbaren Abteilungen)

| ID | Inhalt |
| --- | --- |
| `incidents.open-reports` | Berichte im Entwurf oder zur Prüfung mit Verfasser, Zahl der Fehler und offenen Warnungen; ersetzt die frühere Prüf-App |
| `incidents.incidents` | Einsätze im Zeitraum mit Ort, Abteilung (Name aus `ORGANIZATION`), Hauptbericht, Status |
| `incidents.per-department` | Berichte, Hauptberichte, Einsatzkräfte und Stunden je Abteilung |
| `incidents.hours-per-person` | Einsätze, Stunden, Bereitschaften, Atemschutzminuten je Person |

**Abrechnungsexport** (`GET /api/incidents/compensation/export?from&to&includeUnreleased&lang`, Recht `incidents.compensation.export`): Excel im Stil von `Stil.md`, ersetzt `auswertung.py`. Standardmäßig nur freigegebene Berichte. Blätter:
- Betrag pro Person (nach Stammabteilung): Einsätze, Stunden, EvD-Dienste, Betrag, Gesamtzeile
- Summe je Abteilung (Abteilung des Berichts)
- Einsätze (eine Zeile je Person und Bericht)
- EvD-Dienste (EvD-Dienstplan im Zeitraum über `DUTY_ROSTER`, nur mit aktivem Modul `duty-officer`)
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

**Jahresstatistik** (`statistics/`, Recht `incidents.statistics`)
- `computeAnnualStatistics` berechnet die Werte F1–F120 der Landesvorlage, Stichtag 31.12.:
  - Organisation (F2–F11) aus Abteilungen, Sonderaufgaben und Wachen
  - Feuerwehrangehörige (F12–F25) aus `membersOn` (Einsatzabteilung: Status aktiv oder Probezeit; Spalten D = FF, F = Jugend, G = Altersabteilung, H = Musik)
  - eigene Verletzte/Tote (F26, F27) aus allen Berichten des Jahres; dazu Verletzte aus abgeschlossenen Diensten des Moduls Dienste (F26, Quelle `training`, über `TRAINING_CASUALTIES`, falls das Modul installiert ist)
  - Einsätze (F28–F62) einmal je Einsatz des Jahres mit Hauptbericht und gezähltem Stichwort, über die Statistik des Einsatzes; Seiten 5–7 nur eigene Gemeinde
  - Fahrzeuge (F63–F120) nach Statistik-Kategorie, in Dienst am Stichtag
- Funkgeräte (F121–F129) und Abweichungen werden als Korrekturen (`<Frage>:<Spalte>`) eingetragen; jeder Wert zeigt berechnet, korrigiert und gültig.
- Prüfungen (`checkAnnualStatistics`): Summen Brandgrößen, TH-Kategorien, Fehlalarme, hauptberufliche Kräfte; Teilmengen gerettete/tote Personen; dazu Einsätze gezählter Stichworte ohne Statistik (`statistics.incidentsWithoutStatistics`) und nicht freigegebene Hauptberichte. Fehlgeschlagene Prüfungen blockieren den Export nicht.
- Abschluss (`close`) speichert Werte und Prüfungen (`frozenValues`, `frozenChecks`) und sperrt Korrekturen (`incidents.statisticsClosed`). Mit offenen Prüfungen verlangt er `force: true` (sonst `incidents.statisticsChecksOpen`). Die Statistik der Einsätze des Jahres ist dann gesperrt (siehe Statistikmerkmale). Ein abgeschlossenes Jahr zeigt und exportiert die eingefrorenen Werte; `changedSinceClose` meldet, wenn die Daten inzwischen anders rechnen. `reopen` verwirft die eingefrorenen Werte.
- Export füllt die eingebettete Import-Vorlage des Landesportals (`state-template.ts`, Base64, Dokumenteigenschaften neutralisiert, Ersteller `f.orga`) in den Spalten D/F/G/H. Felder ohne Wert bleiben leer. Audit `incidents.statistics-exported`.

**Andere Module** (`INCIDENTS_LOOKUP`): `ChargeableIncident.released` ist nur wahr, wenn alle Berichte zur Abrechnung freigegeben sind (eine Freigabe nur zur Entschädigung zählt für den Kostenersatz nicht); `releaseLevel` (`none`, `compensation`, `billing`) nennt die niedrigste Freigabestufe der Berichte.

**Druck und eigene Einsätze**
- `GET /api/incidents/reports/:id/pdf?lang` liefert den Bericht als PDF im Briefstil der Wehr (`renderLetterPdf`: Briefkopf oder Wappen, Fußzeile mit Seiten) mit Einsatzdaten, Zeiten, Personal, Fahrzeugen, Lage und Verlauf, beim Hauptbericht der Statistik des Einsatzes, Beteiligten und sonstigen Kräften (`reports/report-pdf.ts`).
- `GET /api/incidents/me?year` („Meine Einsätze“, Recht `incidents.self`) liefert die eigenen Einsätze des Jahres mit Stunden, immer für die mit dem Benutzer verknüpfte Person (`incidents.noPerson` ohne Person).
- `GET /api/incidents/reports/:id/previous-crew?vehicleId` nennt die Besatzung des Fahrzeugs im letzten früheren Bericht derselben Abteilung (Personen und Funktionen, ohne Gäste).
- Die globale Suche findet Einsätze auch über Straße, Objekt, Ort und Ortsteil (JSON-Felder von `location`).

**Einstellungen** `incidents.general`: `homeMunicipalities`, `rates` (Standard leer), `rounding`, `compensationRelease`, `compensateDuringWorkingHours`, `standbyHours`, `longDurationHours` (Standard 24: längere Einsätze werden markiert, längere Einsätze einer Person nicht auf Überschneidungen geprüft), `allowances`, `rules`, `externalLeading` (`mp-feuer` oder `null`) und `externalEventsFrom` (Datum oder `null`) für den [Parallelbetrieb mit MP-Feuer](parallelbetrieb-mp-feuer.md).

**Parallelbetrieb mit MP-Feuer.** Mit `externalLeading: 'mp-feuer'` lehnt der Server bei Berichten mit `managedBy: 'mp-feuer'` Speichern, Version wiederherstellen, Fertigmelden, Zurückgeben, Freigeben (auch gesammelt), Sperre aufheben, Verfasser, Hauptbericht und Löschen ab (`409` `incidents.ledByMpFeuer`, `ReportsService.assertNotLedExternally`), ebenso die Einsatzdaten und die Statistik des Einsatzes (`PUT …/incidents/:id/statistics`, `statisticsEditable: false`), wenn ein Bericht des Einsatzes aus MP-Feuer kommt. Kosten und Bemerkungen, Anhänge und neue Berichte weiterer Abteilungen bleiben möglich. Solche Berichte sind keine Fristen. `POST …/reports/:id/take-over` (Freigeber der Gesamtwehr) setzt `managedBy` auf `null` (`incidents.notFromMpFeuer`, wenn der Bericht nicht aus MP-Feuer kommt; Audit `incidents.report-taken-over`). Report und Einsatz liefern `managedBy` je Bericht.

**Ereignisse:** `incidents.incident.created`, `incidents.report.released`, `incidents.report.unlocked` (`INCIDENTS_EVENTS`).

## Modul Dienste (`training`)

Das Modul heißt in der Oberfläche „Dienste“ (englisch „Services“); ID, Schema, API-Pfade und Rechte heißen weiter `training`. Ein Dienst gehört über seine Art zu einer Kategorie: **Übungsdienst** (Übungen, Unterricht, Atemschutz- und Maschinistenausbildung), **Sonderdienst** (z. B. Unterstützung Gerätewart, Brandschutzerziehung, Brandsicherheitswache) oder **Sonstiges** (z. B. Sitzungen). Sonderdienste werden hier als eigener Dienst erfasst, nicht als Einsatz, und wie Übungsdienste entschädigt.

Benötigt `masterdata`, nutzt optional `respiratory-protection` und `compensation`. Personen, Abteilungen und Wachen kommen über `PERSON_DIRECTORY` und `ORGANIZATION`; Verweise sind IDs ohne Fremdschlüssel.

**Entitäten** (`training.entities.ts`, Schema `training`, alle historisiert, Anwesenheiten in der Historie ihres Dienstes):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `SessionTypeEntity` | `session_type` | Art des Dienstes: Schlüssel, Name, Kategorie `category` (`training` = Übungsdienst, `special-service` = Sonderdienst, `other` = Sonstiges; Standard `training`), `countsForParticipation`, `compensation` (`training`, `special-service`, `fire-watch`, `none`), Nachweis `record` (`training-track` = Atemschutzstrecke, `stress-exercise`, `briefing`, `exercise-under-ba`, `chemical-suit-exercise`), aktiv, Reihenfolge |
| `SessionEntity` | `session` | Typ, Titel, Beginn/Ende, Wache, Abteilungen (`departmentIds`, `text[]`), Verantwortlicher, Ausbilder (`instructorIds`), Thema, Lernziele, Ablauf, Material, Status, Abschluss (wann, wer), Geheimnis für die wechselnden QR-Codes (`checkInSecret`) |
| `AttendanceEntity` | `attendance` | je Dienst und Person höchstens einmal: Status (`present`, `excused`, `absent`), abweichende Zeiten, Funktion, Atemschutz, kJ und bestanden (Belastungsübung), verletzt, Zeitpunkt und Weg des Check-ins (`checkedInVia`: `qr` oder `info-terminal`), bestätigt (`false` nach einem Check-in bis zum Speichern der Liste), Entschuldigungsgrund (`excuseReason`) und Text der Entschuldigung (`note`, nur für `training.attendance`) |

**Arten von Diensten.** `GET /api/training/types` für alle Angemeldeten, Pflege mit `training.settings.manage`. `POST /api/training/types/templates/bw` ergänzt fehlende Arten aus `SESSION_TYPE_TEMPLATE`:

| Art (Vorlage) | Kategorie | Nachweis | Entschädigung | Beteiligung |
| --- | --- | --- | --- | --- |
| Übung, Unterricht, Maschinistenfortbildung, Arbeitsdienst / Gerätepflege | Übungsdienst | – | Satz Übungsdienst | ja |
| Atemschutz-Belastungsübung (Übungsstrecke) | Übungsdienst | Belastungsübung mit kJ | Satz Übungsdienst | ja |
| Atemschutz-Unterweisung | Übungsdienst | Unterweisung | Satz Übungsdienst | ja |
| Atemschutz-Einsatzübung | Übungsdienst | Übung unter Atemschutz | Satz Übungsdienst | ja |
| CSA-Übung | Übungsdienst | CSA-Übung | Satz Übungsdienst | ja |
| Brandsicherheitswache | Sonderdienst | – | Satz Brandsicherheitswache | nein |
| Unterstützung Gerätewart (`equipment-support`) | Sonderdienst | – | Satz Sonderdienst | nein |
| Brandschutzerziehung (`fire-safety-education`) | Sonderdienst | – | Satz Sonderdienst | nein |
| Sitzung / Ausschuss | Sonstiges | – | keine | nein |
| Jugendfeuerwehrdienst | Übungsdienst | – | keine | ja |

Die Brandsicherheitswache ist ein Sonderdienst, behält aber ihren eigenen Satz. Arten ohne Kategorie (z. B. von Hand angelegt) sind Übungsdienst.

**Dienste.** Sichtbar sind Dienste, deren Abteilungen sich mit dem Bereich von `training.read` überschneiden (`$overlap`).
- `GET /api/training/sessions?from&to&departmentId&type&category` (`category`: nur Dienste, deren Art zu der Kategorie gehört; unbekannte Kategorie `400` `validation.failed`), `POST …/sessions`, `PUT …/sessions/:id`, `DELETE …/sessions/:id` (nur nicht abgeschlossene).
- `POST /api/training/sessions/series` legt eine Serie an: gleicher Wochentag und gleiche Uhrzeit alle 1–8 Wochen bis zu einem Datum.
- `POST /api/training/sessions/copy` (`{ from, to, weeks, departmentId? }`) übernimmt die Dienste eines Zeitraums, z. B. den Vorjahresplan: um 1–104 Wochen verschoben (52 Wochen behalten den Wochentag), gleiche Uhrzeit in Europe/Berlin, mit Inhalt, Verantwortlichem und Ausbildern, ohne Anwesenheit. Kopiert werden nur Dienste, die der Benutzer in allen ihren Abteilungen planen darf. Eine schon vorhandene Kopie (Art, Titel, Beginn, Abteilungen) wird übersprungen; die Antwort nennt `created` und `skipped`.
- Jeder Dienst meldet Überschneidungen (`overlaps`) mit anderen Diensten derselben Abteilungen.
- Planen braucht `training.plan` für alle gewählten Abteilungen.

**Ablauf.** `planned` → `held` → `closed`.
- `PUT …/sessions/:id/attendance` (`training.attendance`) ersetzt die Anwesenheitsliste. Vorhandene Zeilen werden aktualisiert (Check-in-Zeitpunkt bleibt), fehlende entfernt. Die Oberfläche schickt deshalb immer alle erfassten Zeilen mit, auch die von Personen, die der Benutzer nicht sieht, samt abweichender Zeiten und Funktion. Mit mindestens einer anwesenden Person ist der Dienst `held`, sonst wieder `planned`. Prüfungen: Anwesend und unentschuldigt erst ab Öffnung des QR-Check-ins vor Beginn (Entschuldigungen jederzeit, sonst `training.notStarted`); eigene Zeiten mit Ende nach Beginn (`training.attendanceEndBeforeStart`) und innerhalb der Dienstzeit mit 120 Minuten Toleranz (`ATTENDANCE_TOLERANCE_MINUTES`, sonst `training.attendanceOutsideSession`), jeweils mit `personId`. Neu aufgenommene Personen müssen im Personenverzeichnis stehen (Mitglieder der Abteilungen, Eingeladene oder Gäste anderer Abteilungen; sonst `training.unknownPerson` mit `personId`). Zusammenführen: Jede Zeile schickt `checkedInAt` mit, wie der Client sie geladen hat. Ein unbestätigter Check-in, den der Client nicht kannte (während der Bearbeitung eingegangen), bleibt unverändert stehen, auch wenn die Zeile fehlt oder einen anderen Status hat; erst ein Speichern, das ihn kennt, bestätigt ihn. Der Abschluss meldet Minuten nie negativ.
- `POST …/sessions/:id/check-ins/:personId/discard` (`training.attendance`) verwirft einen unbestätigten Check-in (z. B. der falschen Person): Die Zeile entfällt; hatte die Person sich vorher entschuldigt, steht sie wieder als entschuldigt da. Ohne unbestätigten Check-in `training.noUnconfirmedCheckIn` (409).
- `POST …/close` (`training.close`) geht nur bei `held` (sonst `training.notHeld`) und erst ab Beginn des Dienstes (`training.notStarted`). Danach ist der Dienst gesperrt (`training.closed`). Abschluss und Wiederöffnen stehen im Audit-Log (`training.session-closed`, `training.session-reopened` mit Dienst, Titel und Beginn). `POST …/reopen` öffnet ihn wieder und sendet `training.session.reopened`: Atemschutz zieht die Nachweise des Dienstes zurück, Entschädigungen entfernt offene Posten bzw. bucht ausgezahlte Beträge zurück, bis der Dienst wieder abgeschlossen ist. Der Import schreibt nicht in abgeschlossene Dienste (`training.closed`).
- Der Abschluss veröffentlicht `training.session.closed` (`SessionClosedEvent`): Art, Kategorie, Entschädigungsart, Abteilungen, je anwesender Person Zeiten, Minuten, Atemschutz, verletzt, und die Nachweise aus der Art des Dienstes (mit kJ und bestanden). Abnehmer sind Atemschutz und Entschädigungen.

**Textbausteine:** Die Einstellung `training.general` enthält `snippets` (Bezeichnung, Text; höchstens 200). Beim Planen und Bearbeiten eines Dienstes hängt „Baustein einfügen“ an Lernzielen und Ablauf den gewählten Text an.

**QR-Check-in.** `GET …/sessions/:id/check-in` (`training.attendance`) liefert den aktuellen Code, das Zeitfenster (ab `checkInBeforeMinutes`, Einstellung `training.general`, Standard 30, vor Beginn bis zum Ende), den Zeitpunkt des nächsten Codes (`rotatesAt`) und die Zahl der Check-ins (`checkedIn`). Der Code ist `<Dienst-ID>.<Signatur>`: HMAC-SHA256 aus Dienst und laufender Minute mit einem zufälligen Geheimnis des Dienstes (`checkInSecret`, wird nie ausgegeben). Er wechselt jede Minute (`CHECK_IN_ROTATION_SECONDS`) und gilt noch die folgende Minute; ein Foto des Codes funktioniert später nicht (`training.codeExpired`). Der QR-Code führt auf `GET /api/training/check-in/start?code=…` (ohne Anmeldung): Ein gültiger Code wird gegen ein Ticket getauscht, das `CHECK_IN_TICKET_MINUTES` (10) Minuten gilt (`<Dienst-ID>.<Ablauf>.<Signatur>`, HMAC mit demselben Geheimnis), und die Check-in-Seite öffnet sich damit; so läuft der Code beim Anmelden nicht ab. Ein Ticket wird nicht verlängert, ein ungültiger Code unverändert weitergegeben. Mit `POST /api/training/check-in { code }` (Code oder Ticket) trägt sich ein angemeldeter Benutzer mit verknüpfter Person als anwesend ein, wenn die Person einer Abteilung des Dienstes angehört, Verantwortlicher oder Ausbilder ist oder schon in der Liste steht (sonst `training.notInvited`, 403; außerdem `training.noPerson`, `training.unknownCode`, `training.checkInClosed`). Die Eintragung ist unbestätigt (`confirmed: false`), außer die Person war schon als anwesend erfasst. Das Speichern der Anwesenheit durch jemanden mit `training.attendance` bestätigt alle Zeilen; solange eine Eintragung unbestätigt ist, lässt sich der Dienst nicht abschließen (`training.unconfirmedCheckIns`). Dasselbe gilt für Eintragungen am [Infoterminal](#modul-infoterminal-info-terminal) (Vertrag `TRAINING_TERMINAL_CHECK_IN`, `sessions/terminal-check-in.service.ts`).

**Kalender-Abo.** `GET /api/training/feed/<feedToken>.ics` ohne Anmeldung, solange in `training.general` ein `feedToken` gesetzt ist; je Abteilung `…/feed/<Token der Abteilung>.ics?departmentId=…` mit eigenem, aus dem `feedToken` abgeleitetem Token (HMAC, `departmentFeedToken`), das nur diese Abteilung liefert. Tokens werden in konstanter Zeit verglichen. Die Adressen liefert `GET /api/training/feed-links` den Verwaltern der Einstellungen. Enthält die Dienste ab 90 Tagen zurück.

**Dienstbeteiligung.** `GET /api/training/participation?from&to&departmentId`: je Person die Zahl der durchgeführten Dienste, die für die Beteiligung zählen und die Person betreffen (Dienste ihrer Abteilungen an Tagen, an denen sie Mitglied war, mit `departmentId` nur dieser Abteilung, und Dienste, in deren Liste sie steht, z. B. als Gast), anwesend, entschuldigt, Quote in Prozent (anwesend durch diese Dienste) und Stunden, dazu die Stammabteilung am Ende des Zeitraums (`departmentId`). Es zählen nur Arten mit `countsForParticipation`; Sonderdienste und Sitzungen der Vorlage zählen nicht. Dasselbe gilt für „Dieses Jahr“ in „Mein Bereich“. Dafür liefert `PERSON_DIRECTORY.memberPeriods()` die Mitgliedschaften mit Abteilung.

**Listen:** Dienstplan eines Jahres (`training.schedule`: Wochentag, Datum, Zeit, Art, Thema, Ort, Abteilungen, Verantwortlicher; je Abteilung oder gesamt), Dienstbuch, Dienstbeteiligung (wie oben, mit Spalten Abteilung und Dienste), Teilnehmerliste eines Dienstes, Unterschriftenliste eines Dienstes (vorbelegt mit den Mitgliedern der Abteilungen), Ausbilderstunden.

**Fristen:** vergangene Dienste ohne Anwesenheit („Anwesenheit erfassen“, 2 Tage nach Ende) und durchgeführte, nicht abgeschlossene Dienste („Dienst abschließen“, 14 Tage nach Ende).

**Import** `training.sessions`: Zeilen mit Datum, Beginn, Ende, Art, Titel, Abteilung und optional Teilnehmer (Name oder Personalnummer); Zeilen gleichen Datums, Titels und gleicher Abteilung bilden einen Dienst. Für die Übernahme aus MP-Feuer „Übungen“. Optional Anwesenheit („entschuldigt“, „krank“, „Urlaub“ → entschuldigt, „abwesend“ → abwesend, sonst anwesend) und Atemschutz; eine Zeile ohne Teilnehmer legt nur den Dienst an. Die Art wird über Schlüssel oder Namen dem Diensttyp zugeordnet, sonst dem gewählten oder gemerkten (Art `session-type`); ein neuer Dienst mit unbekannter Art wird eine Übung (`training.import.unknownType` an der ersten Zeile des Dienstes). Eine Übernahme läuft in einer Transaktion. Aus MP-Feuer-Transferdateien liefert das [Modul MP-Feuer](#modul-mp-feuer-mp-feuer) die Zeilen (erste Zeile des Themas als Titel).

**Daten:** Dienste in der globalen Suche, Vollexport, Auskunft je Person (Anwesenheiten).

## Modul Atemschutz (`respiratory-protection`)

Benötigt `masterdata`, nutzt optional `incidents` und `training`. Personen kommen über `PERSON_DIRECTORY`; Geräteträger sind aktive Mitglieder und Mitglieder auf Probe (`WEARER_STATUSES`) mit der Qualifikation `breathing-apparatus` (CSA-Träger zusätzlich `chemical-suit`). Alters- und Ehrenabteilung, passive Mitglieder und Jugend zählen nicht: keine Ampel in der Übersicht, keine Fristen, keine E-Mail beim Wechsel auf Rot.

**Entitäten** (Schema `respiratory_protection`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `EvidenceEntity` | `evidence` | Nachweis einer Person: Art (`examination`, `stress-exercise`, `training-track`, `briefing`, `exercise`, `incident`, `chemical-suit`), Datum, bei Untersuchungen Ergebnis (`ExaminationResult`), „gültig bis“, Arzt/Stelle, Einschränkungen (keine Befunde) und Gerätegruppe (bis/über 5 kg), sonst Gerät (Pressluftatmer, Regenerationsgerät, Filtergerät), Übungsanlage, kJ, bestanden, Minuten, Bemerkung, Herkunft (`manual`, `training`, `incidents`, `import`) mit Dienst bzw. Bericht, `withdrawn`. Historisiert. |
| `StatusEntity` | `status` | zuletzt bekannte Ampel je Person, um Wechsel zu melden; `notifyPending`, solange die E-Mail zum Wechsel auf Rot noch nicht verschickt ist |

**Tauglichkeit** (`evaluateFitness` in `respiratory-protection-contracts`, reine Funktion, auch im Frontend nutzbar). Maßgeblich ist das Alter am Tag des Nachweises (Intervall der Untersuchung, Mindest-kJ). Zur älteren Gruppe gehört, wer an diesem Tag mindestens `olderFromAge` Jahre alt ist (Standard 50, einschließlich): Mit 50 gelten schon das kürzere Intervall und die geringere Mindestarbeit (`isOlder`, `examinationMonths`, `minimumKilojoules`). Bedingungen nach FwDV 7 Nr. 6 und Anlage 4:

| Bedingung | erfüllt bis |
| --- | --- |
| Eignungsuntersuchung | die jüngste Untersuchung: „gültig bis“ der Bescheinigung, sonst Datum + Intervall (nach Alter: 36 Monate, ab 50 Jahren 12 Monate, mit der Gerätegruppe „bis 5 kg“ (G 26.2) 24 Monate; oder fest 1–3 Jahre). Mit dem Ergebnis „Bedenken“ nicht erfüllt ab dem Untersuchungstag (`concerns` in der Bedingung). Ohne Ergebnis übernommene Untersuchungen (Import, Datenübernahme) zählen wie „keine Bedenken“ |
| Unterweisung | Datum + 12 Monate (oder Ende des Folgejahres) |
| Belastungsübung | wie Unterweisung; zählt nur bestanden und mit mindestens 80 kJ, ab 50 Jahren 60 kJ (ohne kJ-Wert genügt „bestanden“ – das kommt nur aus Diensten, Import, Datenübernahme oder einer Einzelerfassung mit Begründung). Ein Durchgang der Atemschutzstrecke (`training-track`) zählt ebenso. Bei Einzel- und Schnellerfassung verlangt der Server die kJ, sofern die Übung nicht als nicht bestanden erfasst ist (`respiratory-protection.kilojoulesRequired`; die Einzelerfassung erlaubt ohne Messung eine Begründung in der Bemerkung), und lehnt „bestanden“ unter der Mindestarbeit ab (`respiratory-protection.belowMinimum` mit `minimum`). Die Schnellerfassung setzt „bestanden“ nicht vor |
| Einsatzübung | wie Unterweisung; ein Einsatz unter Atemschutz ersetzt sie |
| CSA-Übung | nur für CSA-Träger |
| Mindestalter | 18 Jahre (FwDV 7); bis zum 18. Geburtstag rot, angezeigt als „erst ab“ dem Geburtstag; ohne Geburtsdatum keine Prüfung, keine Frist |

- Ampel: grau ohne Qualifikation, rot wenn eine Bedingung nicht erfüllt ist, gelb wenn ein Nachweis innerhalb der Vorlaufzeit (Standard 60 Tage) abläuft, sonst grün.
- Die Regel ist die Einstellung `respiratory-protection.rule` (`FitnessRule`): Bedingungen einzeln an/aus, Zeitfenster `twelve-months` oder `calendar-year`, Mindest-kJ, Mindestalter (`minimumAge`, 18), Alter für die ältere Gruppe (`olderFromAge`, 50) und die Untersuchungsintervalle nach Alter (`examinationMonths` 36, `examinationMonthsOlder` 12, `examinationMonthsOlderLight` 24 für Geräte bis 5 kg), Intervall der Untersuchung, „Einsatz ersetzt Übung“, Vorlauf, Arbeit (`trackKilojoules`) und Dauer (`trackMinutes`) der Atemschutzstrecke. Änderungen stehen in der Historie der Einstellung.
- **Atemschutzstrecke:** eine Belastungsübung, bei der Arbeit und Dauer vorgegeben sind. Ein Durchgang (Einzelnachweis, Schnelleingabe, Dienstart mit Nachweis `training-track` oder Import) erfasst nur „bestanden“; kJ und Minuten kommen aus der Regel, solange keine eigenen Werte angegeben sind. Ohne Vorgabe in der Regel zählt ein bestandener Durchgang.
- Ausgewertet wird bei jeder Abfrage; nichts wird zwischengespeichert. Zurückgezogene Nachweise und Nachweise nach dem Stichtag zählen nicht. `FitnessStatus.minimumKilojoules` nennt die Mindestarbeit der Person am heutigen Tag (Schnellerfassung).
- **Datum:** Nachweise liegen heute oder in der Vergangenheit – bei Einzel- und Schnellerfassung und in beiden Importen (`respiratory-protection.dateInFuture`).
- **Eignungsuntersuchung erfassen:** Ergebnis Pflicht (`no-concerns` „keine Bedenken“, `no-concerns-limited` „befristet keine Bedenken“, `no-concerns-conditional` „keine Bedenken unter bestimmten Voraussetzungen“, `concerns` „Bedenken“; sonst `respiratory-protection.resultRequired`). „Gültig bis“ liegt nach dem Datum (`respiratory-protection.validUntilNotAfterDate`) und höchstens beim Intervall der Regel für Alter und Gerätegruppe (`respiratory-protection.validUntilTooLate` mit `max`); bei „befristet“ ist es Pflicht (`respiratory-protection.validUntilRequired`). Ändern einer importierten Untersuchung verlangt ebenfalls ein Ergebnis.
- **Sichtbarkeit:** Ergebnis und Einschränkungen stehen nur in den Untersuchungen (Recht `examinations`). Ohne dieses Recht zeigt die Ampel eine Untersuchung mit „Bedenken“ nur als nicht erfüllt, ohne Datum und Grund (`visibleStatuses`); Fälligkeiten abgelaufener Untersuchungen bleiben sichtbar.

**Nachweise aus anderen Modulen** (über `DomainEvents`):
- `training.session.closed`: Nachweise des Dienstes (Belastungsübung mit kJ, Unterweisung, Einsatzübung, CSA-Übung) mit den Minuten der Anwesenheit. Erneuter Abschluss ersetzt sie.
- `incidents.report.released`: je Person „unter Atemschutz“ ein Einsatz mit Datum (Alarmzeit, Ortszeit), Atemschutzminuten und Gerät (Pressluftatmer, Regenerationsgerät, Filtergerät), mit „CSA“ zusätzlich ein CSA-Nachweis. Die Bemerkung nennt Stichwort, Einsatzort (über `INCIDENTS_LOOKUP.reports`, optional) und Leitstellennummer („B2 · Hauptstraße 1, Musterstadt · Nr. 2026-1“), so stehen sie im Atemschutznachweis; der Bericht bleibt als Herkunft verknüpft. Jede Freigabe ersetzt die Nachweise des Berichts.
- `incidents.report.unlocked`: Nachweise des Berichts gelten als zurückgezogen, bis er wieder freigegeben ist.
- Nachweise aus Diensten und Einsatzberichten lassen sich hier nicht ändern (`respiratory-protection.fromOtherModule`).

**Ampelwechsel.** Nach jeder Änderung von Nachweisen, eine Minute nach dem Start des Servers und danach täglich um 4 Uhr (Europe/Berlin, `nextRefresh` in `evidence/schedule.ts`; `FORGA_STATUS_SCHEDULER=off` schaltet das ab) vergleicht `refresh` die Ampeln mit `status` und sendet `respiratory-protection.status.changed` (Person, alte und neue Farbe). Wechselt eine Person von Grün, Gelb oder Grau auf Rot, geht eine [Benachrichtigung](#fristen-und-aufgaben) an alle mit `respiratory-protection.notify` in ihrer Stammabteilung (Atemschutzgerätewart, Abteilungskommandant): standardmäßig ohne Namen mit Link auf „Atemschutz → Tauglichkeit“, mit `security.mailHealthWithoutNames = false` mit Namen und Link auf den Reiter „Atemschutz“ der Personalakte. Die erste Ampel einer Person löst keine aus. Der Wechsel setzt zusammen mit der neuen Farbe `notifyPending`; erst nach dem Versand wird es gelöscht. Scheitert der Versand (Empfänger vorhanden, aber keine E-Mail verschickt) oder bricht der Server dazwischen ab, holt die nächste Prüfung der Person bzw. die tägliche Prüfung die E-Mail nach, solange die Person rot ist.

**Für andere Module.** `RESPIRATORY_PROTECTION_FITNESS` (`FitnessLookup.colors(personIds, date)`) liefert die Ampel zu einem Datum. Einsatzberichte nutzen es optional für die Prüfregel `breathing-not-fit`: eine Person mit Qualifikation ist unter Atemschutz eingetragen, ihre Ampel war am Einsatztag rot (Warnung).

**Schnittstelle**

| Methode und Pfad | Recht | Zweck |
| --- | --- | --- |
| `GET /api/respiratory-protection/status?departmentId` | `read` | Ampel aller sichtbaren Geräteträger mit Bedingungen und nächster Fälligkeit |
| `GET /api/respiratory-protection/persons/:personId` | `read` | Ampel und Nachweise einer Person; Untersuchungen nur mit `examinations` |
| `POST /api/respiratory-protection/evidence` | `evidence`, Untersuchungen `examinations` | Nachweis erfassen |
| `POST /api/respiratory-protection/evidence/quick` | `evidence` | ein Nachweis für mehrere Personen |
| `PUT`/`DELETE /api/respiratory-protection/evidence/:id` | wie Erfassen | nur erfasste und importierte Nachweise |

Die Rechte gelten je Abteilung der Person. `respiratory-protection.notify` (E-Mail beim Wechsel auf Rot) haben Atemschutzgerätewart und Abteilungskommandant. Der Atemschutzgerätewart hat `read`, `evidence` und `examinations` für alle Abteilungen und stellt die Regel ein (`respiratory-protection.settings.manage`). Der Kommandant liest nur (`read`): Nachweise erfassen und damit die Fristen aller Geräteträger liegen beim Atemschutzgerätewart und den Abteilungskommandanten (`evidence`), sonst bekäme der Kommandant je Geräteträger und Bedingung eine Aufgabe.

**Listen:** Atemschutztauglichkeit (Ampel und Fälligkeit je Bedingung, Filter Abteilung und Farbe), fällige Eignungsuntersuchungen (nur mit `examinations`), Atemschutznachweis einer Person (FwDV 7, mit Unterschriftsspalte), Einsatzzeiten unter Atemschutz je Jahr, Planung Übungsstrecke (ohne Belastungsübung im laufenden Jahr), fehlende Nachweise im laufenden Jahr (Unterweisung, Belastungsübung, Übung/Einsatz seit 1. Januar; „fehlt“ mit dem letzten Datum, nicht verlangte Bedingungen leer).

**Fristen:** je Geräteträger und Bedingung eine Frist zum Ablaufdatum (fehlende Nachweise: heute) mit der Vorlaufzeit der Regel, für alle mit `evidence` in einer Abteilung der Person, mit Link auf den Reiter „Atemschutz“ der Personalakte – auch „Eignungsuntersuchung erforderlich“ (`health: true`, in der wöchentlichen E-Mail nur gezählt), die nur das Ablaufdatum einer gültigen Untersuchung nennt. Nach einer Untersuchung mit „Bedenken“ ist sie wie eine fehlende heute fällig, ohne deren Datum. Ebenso zeigt die Ampel ohne `examinations` diese Untersuchung wie eine fehlende, und die nächste Fälligkeit (`nextDue`) lässt sie aus (`redact`). Dieselben Fristen bekommt der Geräteträger selbst (`breathing-apparatus-own-…`, nur der mit ihm verknüpfte Benutzer mit `respiratory-protection.self`): in der Aufgabenliste und der wöchentlichen E-Mail, der Link führt nach „Mein Bereich“ (Gegenstand `core.me`).

**Importe:** `respiratory-protection.examinations` (Recht `examinations`): Untersuchungen mit Personalnummer oder Name, Datum, „gültig bis“ (nach dem Datum), Arzt/Stelle, Einschränkungen und optional Ergebnis (`parseResult`: die Schlüssel oder die Wortlaute; nur ein Text mit „keine“ gilt als ohne Bedenken, „befristete gesundheitliche Bedenken“ sind Bedenken; Unbekanntes ergibt `respiratory-protection.import.unknownResult`; ohne Spalte bleibt ein gespeichertes Ergebnis). `respiratory-protection.stress-exercises` (Recht `evidence`): Durchgänge einer Atemschutzübungsanlage mit Personalnummer oder Name, Datum, kJ, optional bestanden (ja/nein), Minuten und Anlage; ohne „bestanden“ entscheidet die kJ-Grenze der Regel; eine Art mit „Strecke“ ergibt einen Durchgang der Atemschutzstrecke mit kJ und Minuten aus der Regel. Beide aktualisieren einen Eintrag derselben Person am selben Tag. Aus MP-Feuer-Transferdateien (`PER_PRUEF`) liefert das [Modul MP-Feuer](#modul-mp-feuer-mp-feuer) die Zeilen.

**Daten:** Vollexport und Auskunft je Person (Nachweise).

## Modul Entschädigungen (`compensation`)

Benötigt `masterdata`, nutzt optional `incidents`, `training` und `duty-officer`. Ersetzt `auswertung.py`: Aus freigegebenen Einsätzen, abgeschlossenen Diensten, Funktionspauschalen und Posten von Hand entstehen Auszahlungsläufe für die Kämmerei. Die Beträge der Einsätze rechnet der Einsatzbericht mit den Sätzen der Satzung aus diesem Modul; das Modul übernimmt sie mit der Freigabe.

**Entitäten** (Schema `compensation`, alle historisiert):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `ItemEntity` | `item` | Posten: Person, Abteilung (Einsatz- bzw. Dienstabteilung, bei Gästen aus anderen Abteilungen die Stammabteilung), Quelle (`incident`, `training`, `function`, `manual`, `duty`, `course`) mit Bericht/Dienst/`<jahr>:<funktion>`/Sonderdienst/Lehrgangsteilnahme, Bezeichnung, Art (`compensation`, `loss-of-earnings`, `flat-rate`, `expenses`), Datum, von–bis, Stunden, Satz, Betrag (`null` bis der Verdienstausfall bekannt ist), Arbeitszeit „(AZ)“, `correction`, Begründung, Lauf, `deferred_from` (aus diesem Entwurf in den nächsten Lauf verschoben) |
| `RunEntity` | `run` | Auszahlungslauf: Nummer `JJJJ-nn`, Zeitraum, Status (`draft`, `closed`, `handed-over`, `paid`), Abschluss mit Benutzer (`closed_by_id`), beim Abschluss bestätigte Empfänger ohne gültige IBAN (`without_iban`) und ihre Auszahlungen auf anderem Weg (`manual_payouts`: Empfänger, Personen, Betrag, ausgezahlt am/von), „sachlich richtig“ (`approved_at`, `approved_by`), Übergabe, Auszahlung |
| `FunctionHolderEntity` | `function_holder` | Inhaber einer Funktion mit Pauschale, mit Zeitraum |

**Posten aus anderen Modulen** (`DomainEvents`):
- `incidents.report.released` trägt je Person Zeiten, Stunden, Satz und Betrag des Berichts, Arbeitszeit und Verdienstausfall. Daraus entsteht je Person ein Entschädigungsposten (bei Arbeitszeit 0 € mit „(AZ)“, höchstens `maxPerService`), bei Verdienstausfall ein Posten ohne Betrag („… · Verdienstausfall“) und bei mehr als `refreshment.afterHours` Stunden der Erfrischungszuschuss als Pauschalposten, wenn die Satzung einen Betrag nennt (`incidentPayout` in den Verträgen). Die Posten gehören zur Abteilung des Berichts; beim Bericht einer gesamtwehrweiten Einheit (`departmentId: null`, z. B. EvD-Bericht) zur Stammabteilung der Person am Einsatztag. Ist `dutyOfficerReportPaid` aus, entstehen aus EvD-Berichten (`unit: 'duty-officer'`) weder Entschädigungsposten noch Erfrischungszuschuss, nur der Verdienstausfall.
- `incidents.report.unlocked` (Bericht zur Korrektur entsperrt oder gelöscht): Die Posten des Berichts werden auf „keine Posten“ gebracht (`apply('incident', reportId, [])`): offene verschwinden, schon ausgezahlte werden mit Korrekturposten zurückgebucht, bis der Bericht wieder freigegeben ist.
- `masterdata.course.passed`: Nennt die Satzung für den Lehrgang eine Pauschale (`courseAllowances`, gültig am Lehrgangsende), entsteht ein Pauschalposten „Lehrgangspauschale …“ (Quelle `course`). Der Antrag gilt mit dem Eintrag des bestandenen Lehrgangs als gestellt.
- `masterdata.course.revoked` (Teilnahme gelöscht): Die Pauschale wird wie bei anderen Quellen auf „keine Posten“ gebracht (`apply('course', attendanceId, [])`): ein offener Posten verschwindet, ein schon ausgezahlter wird mit einem Korrekturposten zurückgebucht.
- `duty-officer.duty.changed` (Modul Einsatzleiter vom Dienst): je EvD-Dienst ein Pauschalposten (Quelle `duty`, z. B. „Einsatzleiter vom Dienst (EvD) (3 Tage)“) mit dem Betrag des Dienstplans, zur Stammabteilung der Person; ein gelöschter Dienst entfernt ihn bzw. bucht ihn zurück, wenn er schon ausgezahlt ist.
- `training.session.closed`: je anwesender Person mit einem Status aus `paidStatuses` (Einstellung, Standard aktiv und Probezeit; Jugendfeuerwehr nur, wenn die Satzung es vorsieht) Stunden (Rundung der Einstellung, wie beim Übungsdienst auch für Sonderdienste) × Satz für Übungsdienst, Sonderdienst bzw. Brandsicherheitswache (nach der Entschädigungsart der Art), gültig am Tag des Dienstes, höchstens `maxPerService`. Posten von Sonderdiensten heißen „Sonderdienst · <Titel>“, die übrigen wie der Dienst. Arten ohne Entschädigung ergeben keine Posten. Fehlt der Satz für den Tag, bleibt der Betrag offen (Hinweis „Betrag fehlt“, verhindert den Abschluss) und wird im Lauf eingetragen.
- `training.session.reopened`: offene Posten des Dienstes verschwinden, ausgezahlte werden zurückgebucht.
- Jede erneute Freigabe bzw. jeder erneute Abschluss bringt die Posten der Quelle auf den neuen Stand (`ItemsService.apply`): Offene Posten werden je Person und Art an Ort und Stelle aktualisiert, bleiben also im Entwurf eines Laufs bzw. „verschoben“; ein von Hand eingetragener Betrag (Verdienstausfall, Posten ohne Satz) bleibt mit Begründung, solange die Quelle keinen Betrag liefert. Nicht mehr gewünschte offene Posten verschwinden. Ist ein Betrag schon in einem abgeschlossenen Lauf, entsteht ein **Korrekturposten** mit der Differenz für den nächsten Lauf; fällt eine Person weg, wird ihr Betrag zurückgebucht. Abgeschlossene Läufe bleiben unverändert.
- **Vorhandene Daten übernehmen:** `POST /api/incidents/reports/republish`, `POST /api/duty-officer/roster/republish` (Recht `duty-officer.roster.manage`) und `POST /api/training/sessions/republish` (`{ from, to }`, Freigabe- bzw. Abschlussrecht für die Gesamtwehr) senden die Ereignisse für freigegebene Berichte bzw. abgeschlossene Dienste eines Zeitraums erneut, z. B. nach dem Einrichten des Moduls. Das ist wiederholbar, ohne Posten zu verdoppeln.

**Funktionspauschalen** (nach der örtlichen Satzung): Die Pauschalen stehen in der Einstellung (anfangs leer, Beispielwerte über „Vorlage übernehmen“), die Inhaber mit Zeitraum im Modul. Ist einer Pauschale ein Amt der Personalakte zugeordnet (`office`, optional nur für `departmentIds`, z. B. Abteilungskommandant der Kernstadt bzw. der Teilorte), kommen ihre Inhaber aus den Ämtern der Stammdaten (`PERSON_DIRECTORY.offices`); in der Liste stehen sie als „aus den Ämtern der Personalakte“, Inhaber von Hand sind dann abgelehnt (`compensation.functionFromOffices`). Ohne Zuordnung (Standard) pflegt das Modul die Inhaber selbst. `POST /api/compensation/functions/generate { year }` erzeugt je Funktion und Person einen Posten zum 31.12. – anteilig nach Monaten oder voll für den Inhaber am 31.12. (`functionSplit`) – und meldet Funktionen mit mehr Inhabern als erlaubt.

**Auszahlungslauf** (`compensation.runs`):
- Anlegen mit Zeitraum: Der Lauf übernimmt alle Posten bis zum Ende des Zeitraums, die in keinem Lauf sind (auch ältere). Es gibt höchstens einen Entwurf; „Neue Posten übernehmen“ ergänzt ihn.
- **In nächsten Lauf verschieben:** `POST …/runs/:id/defer { itemIds }` nimmt Posten aus dem Entwurf (z. B. Verdienstausfall, dessen Betrag noch nicht feststeht); der Entwurf übernimmt sie nicht wieder, der nächste Lauf schon. `POST …/runs/:id/undefer` holt sie zurück. So blockiert ein offener Betrag nicht den ganzen Lauf. Mehrere Beträge auf einmal: `PUT /api/compensation/items/amounts [{ id, amount, reason }]`.
- Prüfung: Betrag fehlt (verhindert den Abschluss), Zeit fehlt, Arbeitszeit mit Betrag oder Verdienstausfall, doppelt (gleicher Beginn), Überschneidung (Aneinandergrenzen erlaubt, Zeiträume über 24 h zählen nicht), keine Bankverbindung; im Entwurf außerdem Einsatzberichte des Zeitraums, die noch nicht freigegeben sind (`report-not-released`, nur Hinweis: ihre Posten fehlen im Lauf), über `INCIDENTS_LOOKUP.unreleased(from, to)`. Hinweise aus der Satzung, ohne den Abschluss zu verhindern: Erfrischungszuschuss prüfen (Einsatz über `refreshment.afterHours` Stunden, Satzung ohne Betrag, `refreshment`), mehrtägiger Einsatz mit Einzelabrechnung und dem Satz für Haushaltsführende (`multi-day`), Höchstbetrag je Person und Tag überschritten (`above-day-maximum`).
- Abschließen schreibt die Posten fest und sendet `compensation.run.completed`; Posten von Personen mit negativer Summe (Rückbuchungen nach einer Auszahlung) bleiben offen und werden mit späteren Beträgen verrechnet (Hinweis `negative-total`). Haben Empfänger (Personen oder Arbeitgeber bei Abtretung) keine gültige IBAN, lehnt der Abschluss mit `compensation.ibanMissing` und den Namen ab, bis er mit `{ acceptMissingIban: true }` ausdrücklich bestätigt wird. Die bestätigten Empfänger stehen am Lauf als **Auszahlung auf anderem Weg** (`manualPayouts`), fehlen in Überweisungs- und SEPA-Datei (auch wenn später eine Bankverbindung oder Abtretung hinzukommt, keine doppelte Auszahlung), erscheinen in den Hinweisen als „Andere Zahlungsart (bestätigt)“ (`other-payment`) statt „Keine Bankverbindung“ und sind eine Aufgabe für `compensation.runs` (`compensation-manual-payout`), bis `POST …/runs/:id/payouts/:key/paid` sie als ausgezahlt markiert. Optional (Einstellung `factualApproval`) zeichnet jemand mit `compensation.approve` (Rolle Kommandant), aber nicht wer den Lauf abgeschlossen hat (`compensation.approverIsCloser`, 403), den abgeschlossenen Lauf „sachlich richtig“ (`POST …/runs/:id/approve`); vorher lehnen Übergabe, Überweisungs- und SEPA-Datei mit `compensation.approvalMissing` ab; danach „An Kämmerei übergeben“ und „Ausgezahlt“. Abschluss, Zeichnung, Übergabe, Auszahlung und Auszahlungen auf anderem Weg stehen im Audit-Log. Ein Entwurf lässt sich löschen; seine Posten kommen in den nächsten Lauf.
- Ausgaben: Abrechnungen als PDF-Brief mit einer Seite je Person (`GET …/runs/:id/statements.pdf`, optional `?departmentId=` für die Personen einer Stammabteilung: Anschrift, Zeitraum, Posten mit Stunden, Satz und Betrag, Verdienstausfall und Auslagen mit ihrer Art, Summe, Konto mit den letzten vier Stellen bzw. „auf anderem Weg ausgezahlt“), Excel (`GET …/runs/:id/export.xlsx`: Betrag pro Person, Summe je Abteilung, Posten mit Quelle im Klartext, Hinweise, Verdienstausfall je Arbeitgeber), Überweisungsdatei (`…/transfer.csv`: Name, IBAN, Betrag, Verwendungszweck; wie die SEPA-Datei nur für abgeschlossene Läufe, mit `factualApproval` erst nach der Zeichnung, ohne die beim Abschluss bestätigten Empfänger ohne IBAN, sonst `compensation.invalidIban`), SEPA-Datei für das Online-Banking (`…/transfer.xml?executionDate=`, pain.001.001.09, `sepa.ts` in den Contracts: Auftraggeber aus der Einstellung `payer`, IBAN mit Prüfziffer, Texte im SEPA-Zeichensatz; abgelehnt ohne Auftraggeber (`compensation.payerMissing`), für einen Entwurf oder wenn Personen keine gültige IBAN haben (`compensation.invalidIban` mit Namen)), Abrechnungsübersicht als Liste.
- Bankverbindung, Anschrift und Arbeitgeber liefert `PersonDirectory.paymentDetails` der Stammdaten (nur auf dem Server).
- **Abtretung des Verdienstausfalls:** Ist am Arbeitgeber in der Personalakte „Verdienstausfall abgetreten ab“ gesetzt (mit IBAN des Arbeitgebers), gehen die Verdienstausfall-Posten ab diesem Datum nicht an die Person, sondern an den Arbeitgeber: eigene Überweisung je Arbeitgeberkonto in CSV und SEPA-Datei (Verwendungszweck „… – Verdienstausfall“), Hinweis in der Abrechnung der Person.

**Weitere Schnittstellen:** `GET /api/compensation/items?open=true` (offene Posten sichtbarer Personen), `GET …/persons/:personId/items?year`, `POST …/items` (von Hand, `compensation.items.manual`, Begründung Pflicht, negativ für Korrekturen), `PUT …/items/:id/amount` (Verdienstausfall eintragen), `DELETE …/items/:id` (offene Posten von Hand), `GET …/year-totals?year`, Vorschau mit `compensation.settings.manage`: `GET …/preview/reports?from&to` (`INCIDENTS_LOOKUP.inPeriod`) und `POST …/preview { incidentId, settings }` (`INCIDENTS_LOOKUP.compensationPreview` rechnet den Einsatz mit den übergebenen Sätzen, Rundung und Mindestdauer, das Modul ergänzt Höchstbetrag und Hinweise).

**Rechte:** `compensation.read` je Abteilung (Posten der Mitglieder), `compensation.runs` (Läufe vorbereiten), `compensation.runs.read` (Läufe mit Excel und Abrechnungen einsehen, Menüeintrag), `compensation.approve` („sachlich richtig“), `compensation.items.manual` und `compensation.settings.manage` für die Gesamtwehr, `compensation.self` (eigene Posten, Mitglied und die anderen Standardrollen). Die Rolle Verwaltung/Kasse hat alle außer `approve` (die Zeichnung ist eine Kontrolle durch eine andere Person), der Kommandant `read`, `runs.read`, `approve`.

**Mein Bereich:** „Meine Entschädigung“ (`core.me.sections`, `GET /api/compensation/me?year`, `compensation.self`) zeigt die Posten der verknüpften Person eines Jahres mit Zustand und Summen: „offen“ (in keinem abgeschlossenen Lauf), „abgerechnet“ (Lauf abgeschlossen oder übergeben, oder Auszahlung auf anderem Weg noch offen), „ausgezahlt“ (Lauf ausgezahlt und überwiesen bzw. Auszahlung auf anderem Weg markiert).

**Einstellung** `compensation.general` (Satzung): Alle Satzungswerte sind anfangs leer; „Vorlage übernehmen“ (`SAMPLE_STATUTE` in den Contracts, nur auf ausdrücklichen Klick, wirksam mit „Speichern“) setzt Beispielwerte (15 € je Stunde, Sonderdienste 12 € je Stunde, Haushaltsführende 15 €, Lehrgangs- und Funktionspauschalen); es sind Beispiele, keine Werte einer echten Satzung. Ohne Stundensätze zeigen Einstellungen und Läufe „Satzung noch nicht gepflegt“; Dienste ergeben Posten ohne Betrag, und solange keine Einsatz-Sätze gepflegt sind, rechnen die Einsatzberichte mit ihren eigenen Einstellungen (`incidents.general`). Werte: Status, deren Dienste entschädigt werden (`paidStatuses`), Stundensätze für Dienste (Übungsdienst, Sonderdienst, Brandsicherheitswache) und für Einsätze (Einsatz, Bereitschaft im Gerätehaus, Brandsicherheitswache) mit Gültig-ab, je mit Rundung, Mindestdauer eines Einsatzes (`incidentMinimumHours`, nicht für Bereitschaft; Zeitbasis sind die Zeiten des Berichts, Alarmierung bis Wiederherstellung der Einsatzbereitschaft), Erfrischungszuschuss (ab mehr als 4 h, Betrag leer, solange die Satzung keinen nennt), mehrtägige Einsätze (ab mehr als 2 Kalendertagen) mit Stundensatz für Haushaltsführende, Lehrgangspauschalen je Lehrgang der Stammdaten, Höchstbeträge je Einsatz oder Dienst und je Person und Tag (leer: keine), Funktionspauschalen mit Höchstzahl, Aufteilung bei Wechsel, steuerfreie Beträge (3.000 € im Jahr, 250 € im Monat, R 3.12 LStR), Verwendungszweck, Auftraggeber der SEPA-Datei, „sachlich richtig vor der Auszahlung“ (`factualApproval`) und „Einsatzstunden aus EvD-Berichten vergüten“ (`dutyOfficerReportPaid`, Standard an).

**EvD-Pauschale und EvD-Bericht:** Standardmäßig erhält der Einsatzleiter vom Dienst beides: die Pauschale je Diensttag aus dem Dienstplan (Bereitschaft) und die Einsatzstunden aus seinem EvD-Bericht (Einsatz). Deckt die örtliche Satzung die Einsätze des EvD mit der Pauschale ab, wird `dutyOfficerReportPaid` ausgeschaltet.

**Sätze für Einsätze (E4):** Ist das Modul aktiv, rechnet der Einsatzbericht mit den Einsatz-Sätzen, der Rundung und der Mindestdauer aus `compensation.general` (`COMPENSATION_STATUTE` aus den Verträgen, vom Einsatzbericht optional eingebunden); die Sätze in `incidents.general` gelten nur ohne das Modul. Vorhandene Sätze übernimmt die Migration `incident_rates` der Entschädigungen. Die Einstellungen der Einsatzberichte zeigen dann statt der Sätze einen Verweis (Erweiterungspunkt `incidents.settings.rates`).

**Listen:** Abrechnungsübersicht (Posten je Person mit Anschrift eines Laufs oder Jahres, „(AZ)“ und Korrekturen markiert), Jahressummen je Person nach Art mit Hinweis auf die steuerfreien Beträge (Verdienstausfall und Auslagen zählen dafür nicht).

**Fristen:** Verdienstausfall ohne Betrag und Auszahlungen auf anderem Weg für alle mit `compensation.runs`. **Daten:** Vollexport und Auskunft je Person (Posten, Funktionen).

## Modul Geräte (`equipment`)

Benötigt `masterdata`, nutzt optional `incidents`. Fahrzeuge, Wachen und Abteilungen kommen über `ORGANIZATION`; Abteilungen, Wachen und Fahrzeuge mit Geräten lassen sich nicht löschen (`ORGANIZATION_REFERENCES`).

**Entitäten** (Schema `equipment`, historisiert außer der Verwendung im Bericht):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `CategoryEntity` | `category` | Kategorie mit Schlüssel, Name, übergeordneter Kategorie, Erfassung als Einzelstück oder Bestand (`tracking`), Kennzeichen Atemschutz (`breathingApparatus`), Sperre bei überfälliger Prüfung (`lockWhenOverdue`) |
| `EquipmentTypeEntity` | `equipment_type` | Gerätetyp mit Hersteller, Modell, Eigenschaften (z. B. Länge) und Prüfarten |
| `EquipmentItemEntity` | `item` | Gerät: Inventarnummer (eindeutig), Typ, Kategorie, Seriennummer, Barcode und RFID-Chip (je eindeutig, wenn gesetzt), Hersteller, Baujahr, Beschaffung, Eigenschaften, Abteilung, Fahrzeug mit Beladeplatz oder Wache, Menge (Bestand), Ablaufdatum, eigene Prüfarten, eigene Intervalle je Prüfart (`intervalOverrides`), Status, fällig gesetzte Prüfungen (`triggered`), Aussonderung, `forVehicleId`, Etikett gedruckt (`labelPrintedAt`), Erfassungstag (`createdOn`) |
| `InspectionEntity` | `inspection` | Prüfung: Prüfart, Datum, Prüfer (Person oder Firma), Ergebnis, Checkliste, Messwerte, nächste Fälligkeit, Hinweis auf fehlende Qualifikation, storniert (`cancelled`), Grund der letzten Korrektur bzw. Stornierung (`changeReason`), erledigter Anlass (`clearedTrigger`: Datum des „nach …“-Anlasses, den die Prüfung erledigt hat) |
| `DefectEntity` | `defect` | Mangel mit Beschreibung, Status (`reported`, `in-progress`, `fixed`, `retired`, `withdrawn` = Prüfung storniert oder auf „bestanden“ korrigiert), Erledigung; bei einem Befund einer Prüfung die Prüfung (`inspectionId`), der Name der Prüfart (`findingName`, `LocalizedText`) und das Ergebnis (`findingResult`), die Beschreibung ist dann die Bemerkung der Prüfung |
| `UsageEntity` | `usage` | im Einsatzbericht verwendete Geräte und Verbrauchsmaterial mit Menge und „nach Einsatz prüfen“ |

**Prüfarten** (`InspectionType`): Name, Intervall in Monaten, Anlass (`periodic`, `after-use`, `after-incident`, `after-washing`), Prüfer (`user`, `competent-person`, `fall-protection-expert`, `electrician`, `expert`), Checkliste. Ein Gerät übernimmt die Prüfarten seines Typs oder hat eigene; je Prüfart kann es ein eigenes Intervall haben (`intervalOverrides`, z. B. Hauptuntersuchung nach Zulassung des Fahrzeugs, `withIntervals`).

**Fälligkeit** (`computeDues` in `equipment-contracts`, reine Funktion): regelmäßige Prüfungen nach letzter nicht stornierter Prüfung + Intervall (oder dem dort gesetzten Datum). Eine nicht bestandene Prüfung bleibt fällig (ab ihrem Datum), sie schiebt die Fälligkeit nicht hinaus. Ein nie geprüftes Gerät ist ab Beschaffung + Intervall fällig, ohne Beschaffungsdatum ab dem Erfassungstag (fest, nicht täglich neu). Ausnahme: aus den Stammdaten übernommene Fahrzeuge (`forVehicleId`, `ItemDates.dueFromRecording: false`) – ihre regelmäßigen Prüfungen ohne Prüfung stehen auf „noch nicht erfasst“ (`Due.notRecorded`, keine Fälligkeit, keine Frist), bis die letzte Prüfung eingetragen ist. Prüfungen „nach …“ erst, wenn sie nach der letzten Prüfung ausgelöst wurden (`POST …/items/:id/trigger`, nur für Prüfarten des Geräts, sonst `equipment.unknownInspection`; bei Freigabe eines Einsatzberichts automatisch).

**Gesperrt** (`isBlocked`): Gehört ein Gerät zu einer Kategorie mit `lockWhenOverdue` (Vorlage: Atemschutz) und ist ein Fälligkeitsdatum überschritten (vor heute), ist es `blocked`: nicht einsatzbereit, unabhängig vom Status. Oberfläche und Inventarliste zeigen „gesperrt (Prüfung überfällig)“.

**Vorlage DGUV Grundsatz 305-002:** `POST /api/equipment/templates/dguv` (`{ hoseTracking: 'item' | 'stock' }`, Standard `item`: jeder Schlauch ein Einzelstück mit eigener Prüfhistorie) ergänzt fehlende Kategorien und rund 25 Gerätetypen mit Prüfarten und Prüfern (Tabelle 1, Ausgabe 2021), darunter Pressluftatmer, Vollmaske, Atemluftflasche, Schläuche, Leitern, hydraulisches Rettungsgerät, Stromerzeuger, Feuerlöscher, Funk und Feuerwehrfahrzeuge in drei Gewichtsklassen (zulässige Gesamtmasse), je mit der jährlichen Prüfung nach DGUV Vorschrift 70 / Grundsatz 305-002 einmal: „bis 3,5 t“ (`fire-vehicle-light`, z. B. KdoW, MTW: HU 24 Monate), „über 3,5 t bis 7,5 t“ (`fire-vehicle-medium`, z. B. TSF, TSF-W, MLF, ELW 1: HU 12 Monate, keine Sicherheitsprüfung) und „über 7,5 t“ (`fire-vehicle`: HU 12 Monate, Sicherheitsprüfung 6 Monate). Die Intervalle von HU und Sicherheitsprüfung sind Vorlagenwerte und als solche gekennzeichnet (Name „– Vorlagewerte prüfen“, Hinweis in der Oberfläche); sie sind je Fahrzeug zu prüfen und bei Bedarf am Gerät zu überschreiben. `POST /api/equipment/vehicles/sync` legt für jedes Fahrzeug der Stammdaten ein Gerät an, mit dem Typ seiner Klasse nach Fahrzeugtyp (`vehicleTemplateType`: `kdow`, `mtw` → bis 3,5 t; `tsf`, `tsf-w`, `mlf`, `elw-1` → bis 7,5 t; sonst über 7,5 t; fehlt der Typ einer Klasse, gilt `fire-vehicle`). Die Geräte haben noch keine Daten: ihre Prüfungen stehen auf „noch nicht erfasst“; die Oberfläche bittet nach der Übernahme, die letzte HU und Sicherheitsprüfung je Fahrzeug über „Prüfen“ mit deren Datum einzutragen.

**Gerät anlegen und bearbeiten:** `equipment.write` in der Abteilung, für Kategorien mit Kennzeichen Atemschutz auch `equipment.breathing.write` – geprüft am Gerät, wie es ist, und wie es nach der Änderung sein soll (Abteilung und Kategorie; ein Atemschutzgerätewart kann ein Gerät nicht in eine andere Kategorie verschieben). Ebenso das Aussondern. Optional je Prüfart die letzte Prüfung vor der Erfassung mit nächster Fälligkeit (`initialInspections`) und eigene Intervalle; unbekannte Prüfarten ergeben `equipment.unknownInspection`. Das Beschaffungsdatum liegt nicht in der Zukunft (`equipment.purchaseInFuture`) und nicht vor 1900 (`equipment.dateTooEarly`).

**Ansicht für Meldende:** `GET /api/equipment/items/:id` liefert Mitgliedern, die in der Abteilung nur Mängel melden dürfen (`equipment.defects.report` ohne `equipment.read`), nur `ItemSummary` (Inventarnummer, Bezeichnung, Abteilung, Status, gesperrt `blocked`, `reportOnly`; die Seite zeigt Status und „nicht einsatzbereit“) – ohne Preis, Seriennummer und Prüfungen; die Prüfhistorie verlangt `equipment.read`.

**Prüfung** (`equipment.inspect` in der Abteilung des Geräts, bei Atemschutz auch `equipment.breathing.inspect`): `POST …/items/:id/inspections`; Sammelprüfung `POST /api/equipment/inspections/bulk` für viele Geräte einer Prüfart, mit Prüfer (Person) oder Firma. Das Prüfdatum liegt nicht in der Zukunft (`equipment.inspectionInFuture`), nicht vor 1900 (`equipment.dateTooEarly`) und nicht vor der Beschaffung des Geräts (`equipment.inspectionBeforePurchase`), eine angegebene nächste Fälligkeit danach (`equipment.nextDueNotAfterDate`). Die Sammelprüfung prüft zuerst alle Geräte (Recht, Prüfart, Daten) und schreibt dann alles in einer Transaktion – oder nichts. Statuswechsel und Mängel-E-Mails gehen erst nach dem Speichern hinaus. Prüft eine Person als befähigte Person, wird ihre Qualifikation geprüft (Gerätewart, bei Atemschutz Atemschutzgerätewart); fehlt sie, trägt die Prüfung einen Hinweis. Ergebnisse:
- „Bestanden“: ein Gerät „in Prüfung“ oder „defekt“ wird einsatzbereit – nur, wenn kein Mangel offen ist und die letzte gültige Prüfung keiner Prüfart „nicht bestanden“ ist. Sie erledigt einen Anlass („nach Gebrauch“ …) bis zu ihrem Datum.
- „Mit Mängeln“: legt einen Mangel an, der Status bleibt.
- „Nicht bestanden“: setzt das Gerät auf defekt, legt einen Mangel an; die Prüfung bleibt fällig (keine nächste Fälligkeit).
- Der Mangel eines Befunds speichert keinen fertigen Text, sondern Prüfung, Prüfart (zweisprachig) und Ergebnis (`Defect.finding`); Oberfläche, Liste und E-Mail zeigen „Prüfart: Bemerkung“, ohne Bemerkung „Prüfart: nicht bestanden“ in der Sprache des Lesers.

**Korrigieren und Stornieren** (gleiches Recht wie Prüfen): `PUT /api/equipment/inspections/:id` ändert Datum, Prüfer, Ergebnis, Checkliste, Messwerte, Fälligkeit und Bemerkung mit Pflichtgrund (`reason`); `POST /api/equipment/inspections/:id/cancel { reason }` storniert. Stornierte Prüfungen bleiben in der Historie, zählen aber nicht für die Fälligkeit und fehlen in Prüfhistorie und Tagesprotokoll; erneutes Ändern ergibt `equipment.inspectionCancelled`. Der Grund steht an der Prüfung (`changeReason`) und in ihrer Historie. Die Folgen richten sich nach dem neuen Stand: Eine Korrektur auf „nicht bestanden“ legt wie eine neue Prüfung einen Mangel an und setzt das Gerät auf defekt; eine Korrektur auf „bestanden“ und eine Stornierung ziehen die offenen Mängel der Prüfung zurück (`withdrawn`, Grund als Erledigung). Eine Stornierung macht einen Anlass, den die Prüfung erledigt hatte, wieder fällig (`clearedTrigger`). Danach wird der Status neu bestimmt: ist die letzte gültige Prüfung einer Prüfart „nicht bestanden“, ist das Gerät defekt, sonst wird ein defektes Gerät ohne offene Mängel einsatzbereit.

**Mängel:** Jedes Mitglied mit `equipment.defects.report` in der Abteilung meldet über die Geräteseite (QR-Code) einen Mangel (`POST …/items/:id/defects`, Ereignis `equipment.defect.reported`). Eine [Benachrichtigung](#fristen-und-aufgaben) geht an alle mit `equipment.defects.notify` in der Abteilung des Geräts (Gerätewart), bei Atemschutzgeräten an alle mit `equipment.breathing.notify` (Atemschutzgerätewart). Bearbeitet werden Mängel mit `equipment.write`, bei Atemschutz auch mit `equipment.breathing.write`: „in Bearbeitung“ (Gerät in Reparatur), „behoben“ nur mit Erledigung (`equipment.resolutionRequired`). Ist dann kein weiterer Mangel offen, wird ein defektes Gerät „in Prüfung“ und erst mit einer bestandenen Prüfung einsatzbereit; ein Gerät ohne Prüfarten (nichts zu prüfen) wird gleich einsatzbereit. **Mein Bereich:** `GET /api/equipment/me/items?q=` bzw. `?code=` (gescanntes Etikett, Barcode, RFID-Chip oder Inventarnummer, exakt) liefert die meldbaren Geräte mit Standort (Fahrzeug oder Wache und Beladeplatz, `ReportableItem.place`), so lassen sich gleichnamige Geräte unterscheiden; die Oberfläche hat dazu einen Scan-Knopf (Kamera).

**Aussonderung** (`POST …/items/:id/retire`): Datum, Grund, Verbleib; offene Mängel werden mit ausgesondert. Ausgesonderte Geräte bleiben mit Historie erhalten, erscheinen aber nicht in Listen und Fristen.

**Einsatzbericht:** Der Erweiterungspunkt `incidents.report.sections` zeigt im Abschnitt „Beteiligte & Sonstiges“ eine Karte „Geräte“: Geräte der Fahrzeuge des Berichts und Bestand (Verbrauchsmaterial mit Menge), je Gerät „nach Einsatz prüfen“ (`GET/PUT /api/equipment/reports/:reportId/usage`). Der Zugriff folgt dem Bericht (über `INCIDENTS_LOOKUP.reports`, `ReportReference.locked`): Lesen mit `incidents.reports.read` oder `write` in seiner Abteilung oder als Freigeber der Gesamtwehr, Ändern mit `incidents.reports.write` der Abteilung nur im Entwurf ohne Sperre (`incidents.notDraft`, `incidents.reportLocked`), Freigeber der Gesamtwehr immer; unbekannte Berichte ergeben 404. Erlaubt sind Geräte der Abteilung des Berichts und Bestand (Kategorien mit `tracking: stock`) jeder Abteilung (sonst `equipment.otherDepartment`). Den Bericht einer gesamtwehrweiten Einheit (z. B. EvD-Bericht) lesen Freigeber und wer `incidents.reports.read` für die Gesamtwehr hat, ändern nur Freigeber; dort sind Geräte jeder Abteilung erlaubt. Stehen Personen eines Fahrzeugs unter Atemschutz, schlägt die Karte je Gerätetyp der Atemschutz-Kategorien (Pressluftatmer, Maske, Flasche …) so viele Geräte dieses Fahrzeugs vor, wie dort Personen unter Atemschutz waren („Übernehmen“ trägt sie mit „nach Einsatz prüfen“ ein). Dazu übergibt der Bericht dem Erweiterungspunkt `breathingVehicleIds`. Mit der Freigabe des Berichts werden für markierte Geräte die Prüfungen „nach Gebrauch“ und für alle Geräte der Fahrzeuge die Prüfungen „nach Einsatz“ fällig. Andere Module lesen die Verwendung über `EQUIPMENT_USAGE`.

**Dienste:** Über `training.session.sections` hat jeder Dienst einen Reiter „Geräte“ mit den Geräten der Abteilungen des Dienstes und „nach Gebrauch prüfen“ (`GET/PUT /api/equipment/sessions/:sessionId/usage`; Zugriff über `TRAINING_SESSIONS.sessions` des Übungsdienstes: lesen mit `training.read`, `attendance` oder `plan` in einer Abteilung des Dienstes, ändern mit `training.attendance` oder `training.plan`, nicht nach dem Abschluss (`training.closed`); Geräte der Abteilungen des Dienstes und Bestand). Mit dem Abschluss des Dienstes (`training.session.closed`) werden für markierte Geräte die Prüfungen „nach Gebrauch“ fällig. Die Verwendung steht in `equipment.usage` mit `source` (`incidents` oder `training`). Umgekehrt listet `GET /api/equipment/items/:id/incidents` (`equipment.read`) die Einsatzberichte, in denen das Gerät steht, mit Einsatz, Ort, Menge und „nach Einsatz prüfen“, über `INCIDENTS_LOOKUP.reports(reportIds)`; ohne Modul Einsatzberichte ist die Liste leer.

**Rechte:** `equipment.read`, `equipment.write`, `equipment.inspect`, `equipment.defects.report`, `equipment.defects.notify` (E-Mail bei neuen Mängeln) je Abteilung, `equipment.settings.manage` für Kategorien, Typen und Fristen. Nur für Geräte von Kategorien mit Kennzeichen Atemschutz gelten zusätzlich `equipment.breathing.write` (Status, Mängel, Etiketten), `equipment.breathing.inspect` (Prüfen, Fällig setzen) und `equipment.breathing.notify` (E-Mail bei neuen Mängeln an Atemschutzgeräten). Der Gerätewart hat die allgemeinen Rechte (ausdrücklich aufgezählt, ohne die Atemschutz-Rechte) in allen Abteilungen, der Atemschutzgerätewart liest in allen Abteilungen und hat die Atemschutz-Rechte. Anlegen, Bearbeiten und Aussondern von Geräten der Atemschutz-Kategorien erlaubt auch `equipment.breathing.write`; die übrigen Geräte, Kategorien und Typen bleiben bei `equipment.write` bzw. `equipment.settings.manage`.

**Listen:** fällige Prüfungen (`equipment.read`, mit Unterschriftsspalte, ohne Datum bis „bald fällig“), Inventarliste (gesperrte Geräte als „gesperrt (Prüfung überfällig)“), Beladeliste je Fahrzeug, Prüfhistorie, Prüfprotokoll (`equipment.inspection-report`: eine Prüfung über `inspectionId` oder alle Prüfungen eines Tages, mit Checkliste, Messwerten, Prüfer und Unterschriftsspalte), offene Mängel, ausgesonderte Geräte, Bestand. **Fristen:** jede Prüfart eines Geräts (für `equipment.inspect`, bei Atemschutzgeräten für `equipment.breathing.inspect`), Ablaufdatum und gemeldete Mängel (für `equipment.write` bzw. `equipment.breathing.write`); Prüfungen und Ablauf in der wöchentlichen E-Mail gruppiert nach Kategorie und Fahrzeug. Jede Frist führt auf die passende Seite (`to`): Prüfungen auf den Reiter „Prüfungen“, Mängel auf „Mängel“ des Geräts. Die Vorläufe stehen in der Einstellung `equipment.settings` (`EquipmentSettings`: `inspectionLeadDays` 30, `expiryLeadDays` 60, `dueSoonDays` 30 für „bald fällig“ in der Oberfläche und der Liste fälliger Prüfungen). **Import** `equipment.inventory`: Inventar mit Abteilung, Fahrzeug, Beladeplatz, Menge, Barcode, RFID-Chip, Prüfart (Schlüssel oder Name), letzter und nächster Prüfung; eine Zeile je Gerät und Prüfart, ohne Prüfart gilt die letzte Prüfung für die erste regelmäßige Prüfart des Typs. Ein vorhandenes Gerät übernimmt nur die Felder, deren Spalten die Datei hat (Typ, Kategorie, Seriennummer, Hersteller, Fahrzeug, Beladeplatz, Menge, Codes); fehlt eine Spalte, bleibt der gespeicherte Wert samt Prüfarten des Typs. Ein angegebener, aber unbekannter Typ, Fahrzeug oder ein ungültiges Datum ist ein Fehler (`equipment.unknownType`, `equipment.import.unknownVehicle`, `imports.invalidDate`); ein Code eines anderen Geräts ergibt `codes.taken`. Lässt sich eine „letzte Prüfung“ keiner Prüfart zuordnen, wird sie nicht übernommen und die Zeile meldet das in Vorschau und Übernahme (`equipment.import.inspectionDiscarded`). **Suche** nach Inventar-, Seriennummer, Bezeichnung, Barcode und RFID-Chip; **Code-Suche** (siehe unten) zusätzlich über die URL des QR-Etiketts: Leser öffnen den Reiter „Prüfungen“ (`?tab=inspections`); wer nur Mängel melden darf, bekommt einen Treffer „Mangel melden“ ohne Seriennummer (`?report=defect`, nicht für ausgesonderte Geräte). **Etiketten:** `GET …/items?withoutLabel=true`, `POST /api/equipment/items/labels/printed { itemIds }` (Schreibrecht je Gerät) setzt `labelPrintedAt`. Vollexport.

## Modul Kostenersatz (`cost-recovery`)

Benötigt `masterdata` und `incidents`, nutzt optional `equipment`. Aus einem kostenpflichtigen Einsatz (Haken „kostenpflichtig“ beim Einsatz, nicht je Bericht) entsteht ein Kostenbescheid nach dem Feuerwehrgesetz des Landes, der Landesverordnung zu den Sätzen und der örtlichen Satzung. Zahlungen, Teilzahlungen und Zahlungserinnerungen werden im Modul erfasst; die Buchhaltung bleibt bei der Kämmerei.

**Daten aus den Einsatzberichten** über `INCIDENTS_LOOKUP` (`incidents-contracts`): `chargeable(from, to)` liefert kostenpflichtige Einsätze (Objekt, Hauptart, Fehlalarmart, Begründung, `released` = alle Berichte zur Abrechnung freigegeben; das Modul prüft damit auch, ob ein Einsatz noch kostenpflichtig ist), `forCostRecovery(id)` die Berichte mit Personal und Zeiten, Fahrzeugen mit Ausrück- und Rückkehrzeit und Beteiligten, `reports(ids)` Berichte mit Nummer, Status und Einsatz (Geräteakte), `unreleased(from, to)` nicht freigegebene Berichte eines Zeitraums (Auszahlungslauf).

**Entitäten** (Schema `cost_recovery`, historisiert): `NoticeEntity` (`notice`: Aktenzeichen `KE-JJJJ-nnn`, Einsatz, Tatbestand, Kostenschuldner, Positionen, Begründung, Rechtsbehelfsbelehrung, Kassenzeichen, Status, Zur-Prüfung-gegeben von (`submitted_by_id`), letzte inhaltliche Änderung in der Prüfung (`last_edited_by_id`), Erlass, Fälligkeit, Übergabe an die Kämmerei (`handed_over_at`), Meldung einer Aufhebung nach der Übergabe (`change_reported_at`), das erlassene PDF, Widerspruch, Aufhebung bzw. Verwerfen, Zahlungen (`payments`, JSON: Datum, Betrag, Bemerkung, erfasst von, Storno mit Grund), Zahlungserinnerungen (`reminders`), Tag der vollständigen Zahlung, Zahl der nicht berechneten Gäste) und `AddressBookEntity` (`address_book`: häufige Kostenschuldner).

**Einstellung** `cost-recovery.general`: Alles Landesrechtliche ist anfangs leer: Tatbestände (Katalog mit Schlüssel, Bezeichnung de/en, Rechtsgrundlage), Fahrzeugsätze je Kostenersatz-Kategorie mit Gültig-ab, Rechtsgrundlage ohne Tatbestand (`defaultLegalBasis`), Landesverordnung bzw. Satzung zu den Sätzen (`regulation`), Hinweis zur Gesamtschuld (`jointLiability`; leer = entfällt) und Rechtsbehelfsbelehrung (`remedy`). „Vorlage Baden-Württemberg übernehmen“ (`BW_TEMPLATE` in den Contracts, nur auf ausdrücklichen Klick, wirksam erst mit „Speichern“) setzt Tatbestände nach § 34 Abs. 1 Satz 2 Nr. 1–7 und Abs. 2 FwG, Fahrzeugsätze der VOKeFw vom 18.03.2016 (gültig ab 26.04.2016) und vom 11.03.2024 (gültig ab 19.03.2024), „§ 34 FwG“, VOKeFw, Gesamtschuld nach § 34 Abs. 3 FwG, eine Begründung und den Widerspruch als Rechtsbehelf. **Ohne Tatbestände, Rechtsgrundlage, Landesverordnung und Rechtsbehelfsbelehrung lässt sich kein Bescheid erstellen** (`cost-recovery.notConfigured` mit `missing`; `missingConfiguration` in den Contracts, die Oberfläche nennt die fehlenden Teile). Weiter: Personalsätze nach der örtlichen Satzung, Material mit Preis, Pauschalen der Satzung, Takt (`rounding`) und eigener Takt für Fahrzeuge (`vehicleRounding`), Bereitschaft berechnen (`chargeStandby`, Standard nein), Gäste (`guests`: `none` = nicht berechnen und im Bescheid vermerken, auch wenn ein Bericht nur Gäste hat, `volunteer` = wie Ehrenamt), Behörde, Satzung, Bankverbindung, Haushaltsstelle, Zahlungsfrist, Kassenzeichen beim Erlass verpflichtend (`cashReferenceRequired`), Vier-Augen-Prinzip (`fourEyes`), Funktion unter der Unterschrift (`signer`), Textbaustein Begründung (mit `{date}`, `{location}`, `{basis}`) und Zahlungserinnerung (`reminder`: Überschrift, Text mit `{number}`, `{issuedOn}`, `{total}`, `{open}`, `{dueOn}`, `{newDueOn}`, neue Frist in Tagen).

**Berechnung** (`calculation.ts` in den Contracts):
- Takt: `half-then-hour` (bis 30 Minuten eine halbe Stunde, darüber angefangene Stunden, wie manche Kostenersatzsatzungen zählen), `started-half-hour` oder `started-hour`.
- Personal je Bericht und Personalart: Summe der Stunden der eingesetzten Personen (ohne Bereitschaft auf der Wache) × Satz am Einsatztag; die Position merkt sich Anzahl und Stunden je Person (`persons`, `hoursEach`, gleich lange Einsätze), das PDF zeigt „2 × 1,5 h“. Die Position heißt nach der Abteilung des Berichts, beim Bericht einer gesamtwehrweiten Einheit nach ihrem Kurznamen, z. B. „Personal EvD“; dessen Fahrzeuge (etwa der Kommandowagen des EvD) werden wie alle anderen einmal berechnet. Gäste ohne Personalakte werden nach der Einstellung `guests` berechnet oder gezählt (`guestsNotCharged`): Hinweis am Bescheid und Zeile „n Gäste ohne Personalakte wurden nicht berechnet“ im PDF. Die Art kommt aus der Beschäftigung in der Personalakte: Ehrenamt, Hauptamt nach Laufbahn (mittlerer, gehobener, höherer Dienst mit eigenem Satz, sonst der allgemeine Hauptamt-Satz), Feuerwehrangestellte zum allgemeinen Hauptamt-Satz; bei Stichworten mit Entschädigungsart `fire-watch` alle zum Satz Brandsicherheitswache. Fehlt ein Satz, steht „kein Satz“ in der Position.
- Fahrzeuge: alle Fahrzeuge der Berichte (dazu gehört jedes Fahrzeug mit Besatzung, siehe Einsatzberichte), Ausrücken bis Rückkehr des Fahrzeugs, sonst Ausrücken bzw. Rückkehr des Berichts (ohne Ausrückzeit die Alarmierung) × Satz der Kategorie. Steht ein Fahrzeug in mehreren Berichten des Einsatzes, wird es einmal berechnet, vom frühesten Ausrücken bis zur spätesten Rückkehr. (Kostenersatz-Kategorie am Fahrzeug, sonst Fahrzeugtyp). „als MTW“ stellt eine Position auf den MTW-Satz um.
- Material: Verbrauchsmaterial aus dem Abschnitt „Geräte“ des Berichts mit dem Preis aus der Einstellung.
- Fehlt ein Satz, steht die Position mit 0 € und „kein Satz“ da; der Bescheid lässt sich so nicht erlassen (`cost-recovery.rateMissing`).
- Beträge sind nie negativ. Jede Abweichung vom berechneten Betrag braucht eine Begründung, bei Positionen von Hand (Material, Kosten Dritter, anderer Feuerwehren, Pauschalen) die Abweichung von Menge × Satz (`cost-recovery.reasonMissing`, `missingReasons`/`expectedAmount`). Gutschriften gibt es nicht; eine Minderung ist ein niedrigerer Betrag mit Begründung.
- Vorschläge: Tatbestand mit Schlüssel `fire-alarm-system` aus der Fehlalarmart BMA, `false-alarm` bei böswilligem Alarm, `voluntary` bei Brandsicherheitswache (wenn der Katalog diese Schlüssel hat); Kostenschuldner aus den Beteiligten mit Rolle Verursacher, Halter oder Eigentümer aller Berichte, je Name und Anschrift nur einmal (`mergeDebtors`), Anschrift aus dem Adressbuch, wenn der Name passt. Der Ort wird ohne doppelte Teile übernommen (`cleanLocation`, z. B. Ortsteil gleich Ort).

**Ablauf:** Ein Bescheid entsteht nur für einen kostenpflichtigen Einsatz (`cost-recovery.notChargeable`) und ohne anderen gültigen Bescheid. `draft` (speicherbar auch ohne Schuldner) → `review` (`cost-recovery.write`; braucht Schuldner mit Namen, `debtorMissing`/`debtorIncomplete`; merkt sich wer und wann; eine inhaltliche Änderung in der Prüfung – nicht nur das Kassenzeichen – merkt sich die ändernde Person) → `issued` (`cost-recovery.issue`: nur wenn der Einsatz noch kostenpflichtig ist und alle Berichte zur Abrechnung freigegeben sind, auch der EvD-Bericht (`notReleased`; ohne EvD bei diesem Einsatz gibt es keinen), mit Vier-Augen-Prinzip weder durch den Einreichenden noch durch die Person, die in der Prüfung geändert hat (`fourEyes`, 403; „Zurück in den Entwurf“ setzt beides zurück), mit Kassenzeichen, wenn verpflichtend (`cashReferenceMissing`); ein Kassenzeichen gehört nur einem gültigen Bescheid (`cashReferenceUsed`, ein Änderungsbescheid übernimmt das seines Originals); Fälligkeit nach Zahlungsfrist, PDF wird erzeugt und unveränderlich gespeichert, Ereignis `cost-recovery.notice.issued`) → `handed-over` → `paid`. Ein Entwurf kann **gelöscht** werden (`DELETE …/notices/:id`, `cost-recovery.write`; danach nicht mehr in der Liste, das Aktenzeichen wird wieder frei; nicht im Entwurf: `cost-recovery.notDraft`, 409). Entwurf und Prüfung werden **verworfen** (`discard`, Grund freiwillig, Status `discarded`, „Verworfen“, bleibt in der Liste); erlassene Bescheide, auch bezahlte, werden **aufgehoben** (`cancel`, Begründung Pflicht, Verzicht bei unbilliger Härte oder öffentlichem Interesse). Widerspruch (auch gegen bezahlte Bescheide) mit Datum und Ergebnis: offen → `objection` (auch wenn bezahlt), abgeholfen → aufgehoben, zurückgewiesen → wieder der Stand davor (übergeben, wenn schon an die Kämmerei übergeben, sonst erlassen; bezahlt, wenn die Zahlungen reichen). Nur Entwurf und Prüfung sind änderbar; „Neu berechnen“ im Entwurf behält Positionen von Hand und bei Positionen, deren Berechnung sich nicht ändert (gleiches Fahrzeug bzw. gleiche Bezeichnung und gleicher berechneter Betrag), die begründete Abweichung (Betrag, „als MTW“, Begründung); die Bestätigung nennt die Positionen mit Abweichung. Einreichen, Erlass, Aufhebung, Verwerfen, Löschen eines Entwurfs, Widerspruch, Änderungsbescheid, Zahlungen, Stornos, Erstattungen, Zahlungserinnerungen, Übergaben und Zahlungsimporte stehen im Audit-Log (`cost-recovery.*`).

**Zahlungen:** `POST …/notices/:id/payments { date, amount, note }` erfasst auch Teilzahlungen (Datum nicht vor dem Erlass, `paymentBeforeIssue`, nicht in der Zukunft, `paymentInFuture`); `paid`, `balance` (Forderung minus gezahlt, nach einer Aufhebung ist die Forderung 0; negativ = überzahlt) und `refundDue` (zu erstatten) stehen am Bescheid. Reichen die Zahlungen, wird er `paid` mit dem Tag der letzten Zahlung. `POST …/payments/:paymentId/reverse { reason }` storniert eine Zahlung (bleibt mit Grund sichtbar); reicht der Rest nicht mehr, ist der Bescheid wieder offen im Stand davor. Beim Erlass eines Änderungsbescheids gehen die Zahlungen des Originals auf ihn über („aus KE-…“); das ersetzte Original hat danach keinen offenen Betrag. **Erstattung:** Überzahlungen (auch alle Zahlungen auf einen aufgehobenen Bescheid, z. B. nach einem niedrigeren Änderungsbescheid oder einem abgeholfenen Widerspruch) sind eine Aufgabe „Erstattung“ (`cost-recovery-refund`) für das Recht `cost-recovery.refund` (Rolle Verwaltung/Kasse), sichtbar in der Liste mit „Nur mit Erstattung“ (`refund=true`); `POST …/notices/:id/refunds { date, amount, note }` (`refund`) erfasst sie als negative Zahlung, höchstens den offenen Betrag (`refundTooHigh`, `noRefundDue`).

**Überfällig und Zahlungserinnerung:** Erlassen oder übergeben, geltende Zahlungsfrist vorbei (die Fälligkeit, nach einer Zahlungserinnerung deren neue Frist) und nicht voll bezahlt = überfällig (`overdue`; während eines Widerspruchs nicht). Überfällige Bescheide erscheinen als Aufgabe für `cost-recovery.write` (`cost-recovery-overdue`: „Kostenbescheid überfällig: Zahlungserinnerung“, nach Ablauf der Frist einer Erinnerung „Kostenbescheid trotz Zahlungserinnerung offen“); eine weitere Erinnerung ist erst nach Ablauf der Frist möglich (`notOverdue`). `POST …/notices/:id/reminders` vermerkt eine Zahlungserinnerung mit neuer Frist (`reminder.days`), `GET …/notices/:id/reminders/:index/pdf` liefert den Brief mit dem Text der Einstellung, festgesetztem, gezahltem und offenem Betrag. **Änderungsbescheid:** Zu einem erlassenen, übergebenen, angefochtenen oder bezahlten Bescheid legt `amend` einen Entwurf mit Aktenzeichen `…-Ä1`, `…-Ä2` an (Kopie mit Verweis, höchstens einer offen). Mit seinem Erlass wird der ursprüngliche Bescheid `amended` (bleibt als Dokument, zählt aber in Listen und bei kostenpflichtigen Einsätzen nicht mehr); das PDF heißt „Änderungsbescheid“ (auch in der Kopfzeile), nennt den ersetzten Bescheid und zeigt nach dem Gesamtbetrag „Bereits gezahlt“ und „Noch zu zahlen“ bzw. „Zu erstatten“ mit dem passenden Zahlungssatz.

**PDF** (`renderLetterPdf` im Core): Briefkopf aus den Einstellungen (sonst Wappen), Behörde, Datum, Aktenzeichen, Kassenzeichen (ohne Umbruch), Kostenschuldner, Einsatz mit Alarmierung, Ausrücken und Rückkehr, Rechtsgrundlage (Tatbestand, Landesverordnung, Satzung), Positionstabelle (Menge mit Einheit in einer Spalte, Personal als „Anzahl × Stunden“, Begründung abweichender Beträge), Gesamtbetrag, Takt der Zeitberechnung, Fälligkeit und Bankverbindung, Hinweis auf Gesamtschuld bei mehreren Schuldnern, Begründung, Rechtsbehelfsbelehrung, Unterschrift mit dem Namen der erlassenden Person (Name der verknüpften Person, sonst Anzeigename ohne Rolle in Klammern) und der Funktion aus `signer`. Vor dem Erlass gibt es eine Vorschau.

**Schnittstelle:** `GET /api/cost-recovery/candidates?from&to`, `GET /api/cost-recovery/notices?status&year&q&overdue&refund` (`q`: Wörter aus Aktenzeichen, Schuldner, Einsatz-Nr., Stichwort, Kassenzeichen, Ort), `POST …/notices`, `GET|PUT|DELETE …/notices/:id`, `POST …/notices/:id/(recalculate|submit|return|issue|hand-over|objection|discard|cancel|amend|payments|refunds|reminders)` (`hand-over` einzeln für gültige, noch nicht übergebene Bescheide), `POST …/payments/:paymentId/reverse`, `GET …/notices/:id/pdf`, `GET …/notices/:id/reminders/:index/pdf`. **Sollstellung:** `GET /api/cost-recovery/export` mit dem Filter der Liste (`status`, `year`, `q`, `overdue`, `ids`) im Format der Einstellung `handover` (Excel oder CSV mit Semikolon und UTF-8, Spalten wählbar aus Aktenzeichen, Kassenzeichen, Schuldner, Anschrift, Betrag, Fälligkeit, Erlassdatum, Haushaltsstelle, Einsatz; danach immer „Vorgang“, „Bezug“, „Differenz (€)“). Ohne Status enthält sie die gültigen Bescheide, die noch nicht übergeben sind – nach dem Übergabevermerk, nicht nach dem Status, also auch sofort bezahlte Änderungsbescheide und Bescheide im Widerspruch – und die noch nicht gemeldeten Aufhebungen von Bescheiden, die die Kämmerei kennt (selbst übergeben, oder bei einem noch nicht übergebenen Änderungsbescheid dessen übergebenes Original, dann mit diesem als Bezug und dessen Betrag); sie markiert nichts. `POST /api/cost-recovery/export/hand-over` (`write`) liefert dieselbe Datei und markiert in einem Schritt: Bescheide gelten als übergeben (erlassene werden `handed-over`, bezahlte und angefochtene behalten ihren Status), Aufhebungen als gemeldet (Kopfzeilen `X-Handed-Over`, `X-Changes`); ein zweiter Export wiederholt nichts. Vorgang „Sollstellung“, „Änderung“ (Änderungsbescheid zu einem übergebenen Bescheid, Bezug = ersetzter Bescheid, Differenz zum alten Betrag) oder „Aufhebung“ (Differenz = minus Betrag). Adressbuch `…/debtors`. **Einsatzseite:** Über `incidents.incident.sections` zeigt der Einsatz die Karte „Kostenersatz“: bei kostenpflichtigen Einsätzen die Auswahl des Tatbestands (`GET|PUT /api/cost-recovery/incidents/:incidentId/offense`, ändern mit `incidents.costs` oder `cost-recovery.write`, nur für bestehende (`unknownIncident`, 404) und kostenpflichtige Einsätze (`notChargeable`, 409), Leeren immer; Tabelle `incident_offense`, historisiert), mit `cost-recovery.read` die Bescheide des Einsatzes mit Status und Link (`GET …/incidents/:incidentId/notices`) und eine Warnung, wenn der Einsatz nicht mehr kostenpflichtig ist, aber ein Bescheid gilt oder in Arbeit ist. Der gewählte Tatbestand geht dem Vorschlag vor, in der Liste der kostenpflichtigen Einsätze und beim Anlegen des Bescheids. **Suche:** Die globale Suche findet Bescheide nach Aktenzeichen, Schuldner, Einsatz-Nr. und Kassenzeichen. **Import** `cost-recovery.payments` (Recht `write`): Zahlungseingänge mit Aktenzeichen oder Kassenzeichen, Datum und optional Betrag (ohne: der offene Betrag). Ein Kassenzeichen trifft nur gültige Bescheide (erlassen, übergeben, Widerspruch, bezahlt), passen mehrere, wird die Zeile abgelehnt (`import.ambiguous`); Beträge in deutscher Schreibweise („1.000“ = 1000 €, „1.234,50“) und international („1234.50“). Teilzahlungen werden erfasst und gemeldet, Überzahlungen gemeldet. Doppelte werden gegen die vor dem Import erfassten Zahlungen gezählt: Eine schon erfasste Zahlung (gleiches Datum und gleicher Betrag) wird nicht doppelt gebucht (`import.alreadyRecorded`), dieselbe Zahlung mehrfach in einer Datei (zwei Raten am selben Tag) wird mehrfach gebucht und gemeldet (`import.repeated`); Vorschau und Import zählen gleich. Rechte für die Gesamtwehr: `read`, `write`, `issue`, `refund`, `settings.manage`.

**Fristen:** überfällige Bescheide (`cost-recovery.write`) und Erstattungen (`cost-recovery.refund`). **Listen:** kostenpflichtige Einsätze ohne Bescheid, offene Bescheide (mit offenem Betrag und „überfällig“), Bescheide je Jahr mit Summen und gezahlten Beträgen je Tatbestand, BMA-Fehlalarme je Objekt.

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
4. Durchführung: Alle Einträge *befördern* werden mit dem Datum der Wirksamkeit und der Bezeichnung der Liste als Bemerkung in die Personalakten eingetragen; Ereignis `promotions.list.executed`. Beschluss und Durchführung stehen im Audit-Log (`promotions.list-decided`, `promotions.list-executed` mit Liste und Beförderungen). Hat sich ein Dienstgrad seit der Auswertung geändert, wird abgelehnt (`promotions.rankChanged`). Eine durchgeführte Liste ist nicht löschbar.

**Urkunden** als Serien-PDF (`renderCertificatesPdf` im Core, eine Seite je Person mit Wappen, Name der Feuerwehr, Name, Text mit `{date}`, `{rank}`, `{name}`, Ort und Datum des Beschlusses, Unterschrift) für beschlossene und durchgeführte Listen, gesamt oder je Person.

**Schnittstelle:** `GET /api/promotions/candidates?on`, `GET /api/promotions/persons/:id` (Dienstgrad, nächste Beförderung mit Erklärung, Listen), `GET|POST /api/promotions/lists`, `GET|PUT|DELETE …/lists/:id`, `POST …/lists/:id/(refresh|decide|reopen|execute)`, `PUT|DELETE …/lists/:id/entries/:personId`, `POST …/lists/:id/entries` (außerhalb der Regel), `GET …/lists/:id/certificates.pdf?personId`, Ausschlüsse `GET|POST /api/promotions/exclusions`, `PUT|DELETE …/exclusions/:id`. Rechte: `read` und `propose` je Abteilung, `decide`, `exclude` und `settings.manage` für die Gesamtwehr. Die Übersicht der Listen zählt nur die Einträge, die der Benutzer sieht (Abteilungskommandanten: ihre Abteilungen). Den Grund eines Ausschlusses sieht nur, wer `promotions.exclude` hat.

**Listen:** Beförderungsvorschau zum Stichtag (erfüllt und demnächst); Beförderungsliste (`promotions.list`, `listId`, optional `departmentId`) mit Dienstgrad, Ziel, Grundlage (Beschreibung der Regel bzw. „außerhalb der Regel“), Entscheidung und Bemerkung, gesamt oder je Abteilung, als PDF oder Excel.

## Modul Kleiderkammer (`clothing`)

Verwaltet die persönliche Schutzausrüstung (PSA). Backend `modules/clothing/clothing-api`, Oberfläche `clothing-web`, Verträge `clothing-contracts`.

**Rechte:** `clothing.read` (einsehen), `clothing.issue` (ausgeben, zurücknehmen, Wäsche und Prüfungen erfassen, Größen pflegen), `clothing.manage` (Stücke anlegen, ändern, aussondern, auch beim Zurücknehmen, Zugänge und Zählungen an Verbrauchsartikeln, fremde Einträge stornieren; der Artikelkatalog braucht das Recht für die Gesamtwehr), alle abteilungsbezogen, `clothing.self` (eigene Ausrüstung in „Mein Bereich“; in den Rollenvorlagen `member`, `commander`, `department-commander`, `group-leader`, `course-coordinator`, `breathing-apparatus-officer`, `equipment-officer` und `administration`) und `clothing.settings.manage` (Einstellungen, Gesamtwehr). Rollenvorlage „Kleiderwart“ (`clothing-officer`) mit `clothing.*` und `masterdata.persons.read`; die anderen Module geben ihr wie den übrigen Funktionsrollen die eigenen Bereiche (`masterdata.self`, `training.self`, `incidents.self`, `respiratory-protection.self`, `compensation.self`, `equipment.defects.report`). Abteilungskommandanten (`department-commander`) sehen die Kleiderkammer nur (`clothing.read`): Fristen der Wäsche und Prüfungen gehen an die Kleiderwarte.

**Artikel** (`ArticleEntity`, `article`, historisiert): Schlüssel, Name, Art, Größen, aktiv und Mindestbestand je Größe (`minimumStock`, `''` bei Artikeln ohne Größen; nur Größen des Artikels).
- `consumable` (z. B. Mütze, Handschuhe): wird nur abgegeben, nicht zugeordnet; die Abgabe steht im Verlauf der Person.
- `inventory` (z. B. Einsatzjacke, Hose, Atemschutz-Überhose, Stiefel, Helm): Einzelstücke mit Inventarnummer, einer Person zugeordnet.
- Inventarisierte Artikel können Textil sein (`textile`: Wäsche wird erfasst) mit Imprägnier-Intervall (`impregnationMonths`) und ein Prüfintervall haben (`inspectionMonths`).
- Inaktive Artikel werden nicht mehr ausgegeben und es werden keine neuen Stücke angelegt (`clothing.articleInactive`). Hat ein Artikel Größen, müssen Stücke und abgegebene Verbrauchsartikel eine davon haben (`clothing.unknownSize`; Stücke mit älterer Größe behalten sie).
- Vorlage `ARTICLE_TEMPLATE` (Einsatzjacke und -hose 12 Monate Imprägnieren und Prüfen, Atemschutz-Überhose, Stiefel, Helm, Flammschutzhaube, Handschuhe, Mütze, T-Shirt), ergänzt nur fehlende Schlüssel.

**Stücke** (`ClothingItemEntity`, `item`, historisiert): Artikel, Inventarnummer (eindeutig), Größe, Hersteller, Seriennummer, Barcode und RFID-Chip (z. B. waschbarer Textil-Chip; je eindeutig, wenn gesetzt), Anschaffung, Kleiderkammer der Abteilung, Status `stock`/`issued`/`retired`, Träger und Ausgabedatum. Daraus berechnet: letzte Wäsche, Imprägnierung und Prüfung (mit Ergebnis), Fristen und Sperren (`blockedBy`): `inspection` (letzte Prüfung nicht bestanden, „zur Reparatur“, bis eine Prüfung bestanden ist) und `laundry` („zur Wäsche“ zurückgenommen, bis eine Wäsche mit Datum ab der Rücknahme erfasst ist). Gesperrte Stücke werden nicht ausgegeben (`clothing.failedInspection`, `clothing.awaitingLaundry`).

**Ausgabe und Rücknahme** (`IssueEntity`, `issue`): Jede Ausgabe (Stück oder Verbrauchsartikel mit Größe und Anzahl) und jede Rücknahme ist ein Eintrag im Verlauf der Person mit Datum, Bemerkung und Erfasser (Name und Benutzer); Rücknahmen merken sich „ausgesondert“ und „zur Wäsche“.
- Ausgeben darf, wer `clothing.issue` für die Kleiderkammer des Stücks und für eine Abteilung der Person hat. An Ausgeschiedene (`clothing.personLeft`) und die Altersabteilung (`clothing.personVeteran`) wird nichts ausgegeben; bei passiven Mitgliedern und der Jugendfeuerwehr weist die Ausgabe darauf hin.
- Mehrere Stücke gehen in einem Schritt an eine Person, alle oder keines (`POST /clothing/issue`). Ist die Prüfung eines Stücks überfällig, wird es nur mit `acceptOverdueInspection` ausgegeben (`clothing.inspectionOverdue`, 409).
- Mehrere Stücke werden in einem Schritt zurückgenommen (`POST /clothing/return`), je ins Lager, zur Wäsche (nur Textil) oder ausgesondert. Aussondern braucht wie `POST /clothing/items/:id/retire` `clothing.manage` für die Kleiderkammer des Stücks.
- Datumsprüfungen: nichts in der Zukunft (`clothing.dateInFuture`, auch bei Wäsche, Prüfung und Anschaffung), Ausgabe nicht vor der Anschaffung (`clothing.issueBeforePurchase`) und nicht vor der letzten Rücknahme (`clothing.issueBeforeReturn`), Wäsche und Prüfung nicht vor der Anschaffung (`clothing.dateBeforePurchase`), Rücknahme nicht vor der Ausgabe. Für die Frist des Imprägnierens bleibt ein ausgegebenes Stück auch bei widersprüchlichen Altdaten im Einsatz (`usagePeriods` mit dem aktuellen Ausgabedatum).

**Stornieren:** Falsche Einträge werden nicht gelöscht, sondern mit Grund storniert (`cancelledAt`, `cancelledBy`, `cancelReason`); sie bleiben durchgestrichen sichtbar und zählen nicht mehr. Stornieren darf, wer den Eintrag erfasst hat (mit `clothing.issue`), und wer `clothing.manage` für die Abteilung hat (`clothing.notOwnEntry`). Wäsche und Prüfungen beliebig; bei Ausgabe und Rücknahme eines Stücks nur der letzte Eintrag (`clothing.notLastEntry`): Storno der Ausgabe legt das Stück zurück ins Lager, Storno der Rücknahme gibt es der Person zurück, mit denselben Prüfungen wie eine Ausgabe (nicht an Ausgeschiedene oder die Altersabteilung). Verbrauchsartikel jederzeit.

**Wäsche** (`CareEntity`, `care`, in der Historie des Stücks): Waschen oder Imprägnieren (schließt Waschen ein) mit Datum und Ort, für mehrere Textil-Stücke auf einmal. Imprägnieren ist nur für Stücke im Einsatz nötig: Fällig ist es, wenn das Stück `impregnationMonths` lang ausgegeben war, gezählt ab dem letzten Imprägnieren, ohne eines ab der ersten Ausgabe (`dueDates` mit den Ausgabezeiträumen aus dem Verlauf, `usagePeriods`). Zeit im Lager zählt nicht, ein Stück im Lager hat keine Frist. Waschen dazwischen ist beliebig oft möglich und ändert die Frist nicht.

**Prüfungen** (`ClothingInspectionEntity`, `inspection`, in der Historie des Stücks): Datum, bestanden, Prüfer, Bemerkung; einzeln oder für mehrere Stücke mit Ergebnis je Stück (`POST /clothing/inspections`). Fällig `inspectionMonths` nach der letzten **bestandenen** Prüfung (sonst nach der Anschaffung); eine nicht bestandene verschiebt die Frist nicht und sperrt das Stück.

**Bestand:** `GET /clothing/stock` je Artikel und Größe: verfügbare, gesperrte und ausgegebene Stücke der sichtbaren Abteilungen (optional eine Abteilung), Mindestbestand und „nachbestellen“ darunter. Verbrauchsartikel als Zähler für die ganze Wehr: Zugänge (`ConsumableReceiptEntity`, `consumable_receipt`, historisiert; `clothing.manage` in einer Abteilung) minus nicht stornierte Abgaben. Eine Zählung („gezählt: X“, `POST /clothing/consumables/counts`) setzt den Zähler auf die gezählte Anzahl; gespeichert wird sie als Zugang mit der Differenz und der Anzahl (`counted`). Hat ein Artikel Größen, brauchen Abgabe, Zugang und Zählung eine (`clothing.sizeRequired`). Reicht der Zähler für eine Abgabe nicht, fragt die Ausgabe nach (`clothing.stockInsufficient` mit `available`, abgegeben wird mit `acceptLowStock`); das gilt nur für Artikel, für die Zugänge erfasst sind.

**Größen der Person** (`SizeProfileEntity`, `size_profile`, historisiert): Größe je Artikelschlüssel, gepflegt im Reiter der Personalakte (`clothing.issue`), sichtbar in „Mein Bereich“. Hat der Artikel Größen, muss es eine davon sein; eine schon gespeicherte ältere Größe bleibt (`clothing.unknownSize`). Die Ausgabe zeigt damit nur passende Stücke (abschaltbar) und setzt die Größe der Verbrauchsartikel vor.

**Austritt:** Die Kleiderkammer meldet sich beim `PERSON_HOLDINGS` der Stammdaten. Solange einer Person Stücke zugeordnet sind, lehnen Austritt und Übernahme in die Altersabteilung mit `masterdata.personHoldsItems` (409) ab.

**Oberfläche:**
- Schutzausrüstung (beim Öffnen „Im Lager“, Ansichten Im Lager, Ausgegeben, Ausgesondert, „Alle (ohne ausgesonderte)“; Suche und Filter nach Artikel und Größe, je Mehrfachauswahl; Sperren als Plakette; Fristen farbig).
- Stück: Stammdaten, Sperren mit Hinweis, Ausgabe (Hinweis bei passiven Mitgliedern und Jugend, Bestätigung bei überfälliger Prüfung), Rücknahme (ins Lager, zur Wäsche, aussondern), Wäsche, Prüfung, Verlauf; Träger und Personen im Verlauf verlinken auf den Reiter „Kleiderkammer“ der Personalakte (`?tab=clothing`); „Stornieren“ mit Grund an Wäsche, Prüfungen und dem letzten Verlaufseintrag.
- Ausgabe (`/clothing/issue`, mit `?person=<id>` direkt für eine Person): Stücke aus dem Lager ankreuzen oder scannen und in einem Schritt ausgeben, Filter auf die Größen der Person, Suche auch nach Barcode und RFID; ein gescanntes Stück, das nicht ausgegeben werden kann, wird mit Grund gemeldet („J-0118 ist zur Wäsche gesperrt“, „… ist ausgegeben an …“, zur Reparatur, ausgesondert, Artikel inaktiv); Verbrauchsartikel mit Zählerstand abgeben (Größe Pflicht, wenn der Artikel Größen hat; reicht der Bestand nicht, „Trotzdem abgeben“); „Zurücknehmen …“ und „Alles zurücknehmen“ mit Ziel je Stück („aussondern“ nur mit `clothing.manage`); Verlauf mit Stornieren.
- Wäsche (`/clothing/care`): mehrere Stücke ankreuzen oder scannen (Barcode per Handscanner oder Kamera, RFID per Lesegerät oder NFC), „Fällige auswählen“ einschließlich „zur Wäsche“ zurückgenommener; eigene Meldung für Imprägnieren.
- Prüfung (`/clothing/inspections`): Stücke mit Prüfintervall, nach Fälligkeit sortiert, ankreuzen oder scannen, „Fällige auswählen“, Ergebnis und Bemerkung je Stück, Datum und Prüfer für alle.
- Bestand (`/clothing/stock`): Bestand nach Größe mit Mindestbestand und „nachbestellen“, Filter Abteilung und „Nur nachzubestellende“; „Zugang erfassen“ für Verbrauchsartikel als „Zugang“ oder „Gezählt“ (mit bisherigem Zählerstand).
- Verwaltung → Module → Kleiderkammer (Artikel mit Mindestbestand je Größe, Vorlage; mit `clothing.settings.manage` die Einstellung „Erinnerung ‚zur Wäsche‘ nach … Tagen“).
- Reiter „Kleiderkammer“ in der Personalakte („Ausgabe für diese Person“, „Alles zurücknehmen“, Stücke mit Imprägnier- und Prüffrist, Verlauf, Größen) und „Meine Schutzausrüstung“ in „Mein Bereich“ (mit Größen).

**Fristen** (zuständig `clothing.issue` der Kleiderkammer): Imprägnieren und Prüfung je Stück (30 Tage Vorlauf); „Stück zurückholen und reparieren lassen“ (`clothing-defective`), sofort fällig ab der nicht bestandenen Prüfung, solange das Stück noch ausgegeben ist; „Zur Wäsche: Wäsche erfassen“ (`clothing-laundry`) für ein zur Wäsche zurückgenommenes Stück ohne erfasste Wäsche, fällig `laundryReminderDays` nach der Rücknahme (Einstellung `clothing.settings`, Standard 14, 0 = nie). Die beiden neuen Fristen verlinken auf das Stück. **Listen:** ausgegebene Schutzausrüstung, fällige Wäsche und Prüfungen. **Daten:** Suche nach Inventar-, Seriennummer, Barcode und RFID-Chip, Code-Suche (Mitglieder mit `clothing.self` finden die eigenen Stücke, nur Artikel, Nummer und Größe, Ziel „Mein Bereich“), Vollexport. Abteilungen mit Stücken lassen sich nicht löschen.

## Modul Einsatzleiter vom Dienst (`duty-officer`)

Der Einsatzleiter vom Dienst (EvD) hat nach Dienstplan für die ganze Feuerwehr Bereitschaft und schreibt zu jedem Einsatz einen eigenen EvD-Bericht, der keiner Abteilung, sondern der Gesamtwehr gehört. Backend `modules/duty-officer/duty-officer-api`, Oberfläche `duty-officer-web`, Verträge `duty-officer-contracts`. Benötigt `masterdata` und `incidents`, nutzt optional `compensation`.

**Rechte** (alle für die Gesamtwehr): `duty-officer.read` (EvD-Dienst und EvD-Berichte einsehen), `duty-officer.reports.write` (EvD-Berichte schreiben), `duty-officer.reports.manage` (EvD-Berichte vorprüfen, „Kein EvD bei diesem Einsatz“), `duty-officer.roster.manage` (Dienstplan pflegen), `duty-officer.settings.manage`. Rollenvorlage „Einsatzleiter vom Dienst“ (`duty-officer`) mit `duty-officer.read`, `duty-officer.reports.write`, `incidents.reports.read` und `masterdata.persons.directory` (je in allen Abteilungen: Namen im Dienstplan, auf der Einsatzseite und im Personal des EvD-Berichts) und `incidents.self`; der Kommandant bekommt `duty-officer.*`, Verwaltung / Kasse `duty-officer.read` und `duty-officer.roster.manage`.

**Entitäten** (Schema `duty_officer`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `DutyAssignmentEntity` | `duty_assignment` | EvD-Dienst aus dem Dienstplan: Person, Art, von–bis, Bemerkung, Termin-UID des Kalenders (`externalUid`, eindeutig); historisiert (Historie mit `duty-officer.roster.manage`) |
| `ExpectedReportEntity` | `expected_report` | Einsatz, der einen EvD-Bericht bekommt (angelegt, während Modul und Einstellung aktiv waren); nur diese Einsätze können „EvD-Bericht fehlt“ melden |
| `IncidentExemptionEntity` | `incident_exemption` | „Kein EvD bei diesem Einsatz“: Einsatz (eindeutig), Grund, wer, wann; historisiert (Historie mit `duty-officer.read`) |

**Einstellung** `duty-officer.general`: `reportRequired` („EvD-Bericht für jeden Einsatz anlegen“, Standard an) und `dutyKinds` (Dienstarten mit Name, Satz je Tag mit Gültig-ab und `unit`: nur volle Tage von 24 Stunden, jeder angefangene Tag oder `midnight`: die Tage, an deren Beginn um 00:00 Uhr die Person eingetragen ist; der Beginn zählt, wenn er genau um 00:00 Uhr liegt, das Ende nicht). Die Dienstarten sind anfangs leer; „Vorlage übernehmen“ setzt `DUTY_KIND_TEMPLATE` (`duty-officer` „Einsatzleiter vom Dienst (EvD)“, 10 € je vollem Tag ab 01.01.2026). Satzungswerte sind Vorlagen, keine Standardwerte.

**Dienstplan** (`roster/roster.ts`)
- EvD-Dienste stehen nicht in Berichten; sie werden je Tag entschädigt (`dutyCompensation` in den Verträgen): volle, angefangene oder um 00:00 Uhr belegte Tage × Satz am Tag des Beginns.
- Pflege von Hand (`/api/duty-officer/roster`, Recht `duty-officer.roster.manage`; unbekannte Art `duty-officer.unknownKind`, unbekannte Person `duty-officer.unknownPerson`) oder per **iCal-Import** über das Importprofil `duty-officer.roster`:
  - Felder `uid`, `title`, `from`, `to` (Pflicht), `notes`; Vorschläge über `UID`, `SUMMARY`, `DTSTART`, `DTEND`, `DESCRIPTION`.
  - Die Person wird am Namen im Titel erkannt („EvD Max Test“, „Test, Max“) unter den Mitgliedern am ersten Tag. Kein oder mehrere Treffer: `duty-officer.unknownPerson` bzw. `duty-officer.ambiguousPerson`; ohne Dienstart `duty-officer.noKind`.
  - Ganztägige und lokale Zeiten gelten in Europe/Berlin.
  - Idempotent über die Termin-UID: ein erneuter Import aktualisiert geänderte Termine.
  - Importierte Dienste bekommen die erste Dienstart.
- Jede Änderung (anlegen, ändern, löschen, Import) sendet `duty-officer.duty.changed` (`DUTY_OFFICER_EVENTS`) mit Tagen, Satz und Betrag; `POST /api/duty-officer/roster/republish` sendet die Dienste eines Zeitraums erneut.
- Andere Module lesen den Dienstplan über `DUTY_ROSTER` (`startingIn(from, to)`), z. B. das Blatt „EvD-Dienste“ des Abrechnungsexports der Einsatzberichte.

**EvD-Bericht** (`reports/evd-reports.ts`)
- Das Modul meldet beim Start die Einheit `duty-officer` bei `INCIDENT_UNITS` an: Name „Einsatzleiter vom Dienst“, Kurzname „EvD“, Nummern `EvD-JJJJ-nnn`, Lesen `duty-officer.read`, Schreiben `duty-officer.reports.write`, Vorprüfen `duty-officer.reports.manage`, ohne Fahrzeugpflicht (der EvD kommt mit Kommandowagen oder eigenem Fahrzeug).
- Auf `incidents.incident.created` legt es bei aktivem Modul und eingeschalteter Einstellung den EvD-Bericht über `INCIDENTS_UNIT_REPORTS` an, nicht für importierte Einsätze (`createdVia: import`, z. B. historische MP-Feuer-Daten) und nicht bei einer Ausnahme. Verfasser ist, wer zur Alarmzeit laut Dienstplan Dienst hat (bei mehreren die Person der ersten Dienstart); sie steht schon im Personal, mit Funktion `duty-officer`, wenn der Funktionskatalog sie kennt. Der Einsatz wird als „erwartet“ vermerkt.
- Wer EvD-Berichte schreibt (oder freigibt), kann beim Anlegen eines Einsatzes den EvD-Bericht wählen, auch als einzigen Bericht (`CreateIncident.units`). Das Ereignis nennt die gewünschten Einheiten; der gewünschte EvD-Bericht entsteht unabhängig von der Einstellung. Verfasser ist der EvD laut Dienstplan, sonst wer den Einsatz angelegt hat.
- Hat ein Einsatz keinen Abteilungsbericht (z. B. nur mit EvD-Bericht angelegt oder ein übernommener Einsatz der Gesamtfeuerwehr), ist der EvD-Bericht Hauptbericht, und der EvD erfasst die Statistik des Einsatzes; der erste Abteilungsbericht wird Hauptbericht, die Statistik bleibt beim Einsatz.
- „Kein EvD bei diesem Einsatz“ (`POST /api/duty-officer/incidents/:id/exemption` mit Grund, Recht `duty-officer.reports.manage`) löscht den Entwurf des EvD-Berichts (fertig gemeldet, freigegeben oder gesperrt: `incidents.unitReportNotDraft`). Ist er der einzige Bericht des Einsatzes, wird die Ausnahme abgelehnt (`incidents.unitReportOnlyReport`), denn der Einsatz bliebe ohne Bericht; erst ein Abteilungsbericht macht sie möglich. und speichert Grund, Person und Zeitpunkt (Audit `duty-officer.exempted`). „EvD-Bericht anlegen“ (`POST …/report`) hebt die Ausnahme auf und legt den Bericht wieder an, auch für Einsätze von vor dem Modul (Audit `duty-officer.report-restored`).
- `GET /api/duty-officer/incidents/:id` (eines der drei Berichtsrechte) liefert den Stand für die Karte auf der Einsatzseite (`IncidentDutyOfficer`): Einstellung, erwartet, EvD-Bericht, Ausnahme, Dienst laut Plan, fehlt.
- **Frist** „EvD-Bericht fehlt“ (`evd-report-missing`, `duty-officer.reports.manage`, fällig am Einsatztag, Link zum Einsatz): ein erwarteter EvD-Bericht ohne Bericht und ohne Ausnahme, solange Modul und Einstellung aktiv sind. Ältere und importierte Einsätze sind nie erwartet und melden deshalb nichts.
- Der EvD-Bericht wird wie jeder Bericht geschrieben, fertig gemeldet und von den Freigebern freigegeben. Entschädigung und Kostenersatz behandeln ihn wie einen Abteilungsbericht (Posten zur Stammabteilung der Person, Position „Personal EvD“, siehe dort).
- Ist das Modul inaktiv, entstehen keine EvD-Berichte; vorhandene bleiben als Berichte des Einsatzes lesbar.

**Daten:** Vollexport mit Dienstplan, erwarteten Berichten und Ausnahmen; Auskunft je Person mit ihren Diensten.

## Modul Infoterminal (`info-terminal`)

Nach einem Einsatz oder Dienst tragen sich die Einsatzkräfte an einem Gerät in ihrer Wache selbst ein, mit Fahrzeug oder Bereitschaft, Funktion und den Angaben für die Entschädigung (in MP-Feuer „Infoterminal“). Der Verfasser des Berichts prüft das Personal nur noch. Backend `modules/info-terminal/info-terminal-api`, Oberfläche `info-terminal-web` (Verwaltung und Kiosk-Seite), Verträge `info-terminal-contracts`. Benötigt `masterdata` und `incidents`, nutzt optional `training`. Mockups: `dokumentation/geplant/mockups/infoterminal/`.

**Begriffe:** Ein *Infoterminal* ist ein freigeschaltetes Gerät (Tablet, PC) an einer Wache; mehrere je Wache sind möglich. Es gehört zu einer oder mehreren *Abteilungen* (Standard und immer dabei: die Abteilung der Wache, dazu z. B. Jugendfeuerwehr und Altersabteilung im selben Feuerwehrhaus). Die am Gerät gewählte *Abteilungsansicht* bestimmt Einsätze, Dienste und Namenskacheln. Es weist sich mit seinem *Geräteschlüssel* aus. Eine *Eintragung* ist eine Zeile im Personal des Abteilungsberichts oder in der Anwesenheit eines Dienstes, gekennzeichnet „vom Infoterminal“; sie ist nur im *Zeitfenster* um den Einsatz oder Dienst möglich.

**Rechte:** `info-terminal.read` (Abteilung: Terminals sehen, zu deren Abteilungen die eigene gehört), `info-terminal.manage` (Abteilung: anlegen, ändern, Link anzeigen und öffnen, neuer Link, widerrufen), `info-terminal.settings.manage` (Gesamtwehr). `info-terminal.manage` braucht es für **alle** Abteilungen des Terminals, vor und nach einer Änderung (`auth.forbidden`); so schaltet niemand ein Terminal für eine fremde Abteilung frei. Rollenvorlagen: `commander` `info-terminal.*`, `department-commander` `info-terminal.read` und `.manage` (wirkt wie alle Abteilungsrechte auch für die Abteilungen darunter), `group-leader` `info-terminal.read`. Das Terminal selbst hat keine Rolle und keine API-Rechte; für die Historie hat es einen technischen Benutzer im Core („Infoterminal Feuerwehrhaus Musterstadt · Tablet Fahrzeughalle“), der beim Widerruf deaktiviert wird.

**Entität** (Schema `info_terminal`, historisiert, Historie mit `info-terminal.read`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `TerminalEntity` | `terminal` | Wache (`stationId`), Abteilungen (`departmentIds`, die der Wache zuerst), Bezeichnung, erlaubte Aktionen (`allowNewIncident`, `allowTraining`), Sprache beim Start, SHA-256 (`keyHash`) und Präfix des Schlüssels, Schlüssel verschlüsselt (`keyEncrypted`), technischer Benutzer, angelegt von/am, widerrufen von/am, `lastSeenAt`. Hash und verschlüsselter Wert sind `hidden` und erscheinen nie in Historie, Listen oder Antworten |

**Einstellung** `info-terminal.general`: `afterEndMinutes` (60), `openEndHours` (6), `maxAlarmAgeHours` (6, höchstens `openEndHours`), `idleSeconds` (60), `notSeenWarningDays` (30).

**Lebenszyklus** (`terminals/terminals.service.ts`)
- **Anlegen:** Wache, Bezeichnung, weitere Abteilungen, erlaubte Aktionen („Neuer Einsatz“, „Dienste“), Sprache. Die Antwort enthält einmalig den Link `https://<adresse>/terminal#k=fit_<zufall>`; der Schlüssel steht im Fragment, damit er nicht in Protokollen von Server und Proxy landet. Die Adresse kommt aus `brigade.publicUrl` bzw. `FORGA_PUBLIC_URL` (sonst `503 info-terminal.noPublicUrl`).
- **Geräteschlüssel:** 32 Byte Zufall mit Präfix `fit_`. Geprüft wird über den SHA-256 in konstanter Zeit; zum erneuten Anzeigen liegt der Schlüssel mit AES-256-GCM verschlüsselt in der Datenbank, Server-Schlüssel aus `FORGA_SECRET_KEY` (32 Byte Base64; ohne ihn `503 info-terminal.noSecretKey`). Ein Datenbankauszug allein verrät ihn nicht. Wird `FORGA_SECRET_KEY` geändert, lassen sich vorhandene Links nicht mehr anzeigen (`409 info-terminal.linkUnavailable`); die Geräte arbeiten weiter, bis ein neuer Link erzeugt wird.
- **Link anzeigen** (anzeigen, kopieren oder öffnen) jederzeit mit `info-terminal.manage`, jedes Mal im Audit-Log. Die Liste liefert den Link nie mit.
- **Neuer Link:** neuer Schlüssel, der alte gilt sofort nicht mehr.
- **Widerrufen:** sofort und endgültig; der verschlüsselte Schlüssel wird gelöscht, der technische Benutzer deaktiviert. Das Gerät zeigt „nicht freigeschaltet“ (`403 info-terminal.revoked`). Eintragungen bleiben.
- **Zuletzt gesehen:** jede Anfrage des Terminals setzt `lastSeenAt` (höchstens einmal je Minute, ohne Historie) und verlängert dabei das Cookie. Die Verwaltung markiert Terminals, die länger als `notSeenWarningDays` nicht gesehen wurden.
- Wachen mit nicht widerrufenen Terminals lassen sich nicht löschen (`ORGANIZATION_REFERENCES`). Eine gelöschte weitere Abteilung fällt aus den Abteilungen des Terminals heraus. Ist das Modul inaktiv, antworten die Kiosk-Endpunkte `404 modules.inactive` und das Terminal zeigt „abgeschaltet“.
- **Audit:** `info-terminal.created`, `.changed` (alte und neue Abteilungen), `.link-shown` (mit Zweck), `.key-rotated`, `.revoked`, `.incident-created` (Einsatz angelegt oder Bericht hinzugefügt), `.invalid-key` (höchstens ein Eintrag je Adresse und Stunde). Einzelne Eintragungen stehen in der Historie bzw. den Versionen des Berichts und Dienstes.

**Kiosk** (`kiosk/`)
- Die Endpunkte unter `/api/info-terminal/kiosk/…` sind `@Public()` für den Auth-Guard; der `TerminalGuard` verlangt stattdessen das Cookie `forga_terminal` (`HttpOnly`, `SameSite=Strict`, `Secure` wie die Sitzung, Pfad `/api/info-terminal/kiosk`, 400 Tage). Sitzungs-Cookies und API-Tokens gelten dort nicht, das Terminal-Cookie gilt nirgends sonst. Änderungen brauchen `x-forga: 1`. `POST …/kiosk/session` tauscht den Schlüssel aus dem Link gegen das Cookie.
- Jede Anfrage nennt die gewählte Abteilung; sie muss zu den Abteilungen des Terminals gehören (`403 info-terminal.departmentNotAllowed`). Einsätze und „Neuer Einsatz“ nur in der Ansicht einer Einsatzabteilung (`403 info-terminal.notOperational`). Ohne aktives Modul Dienste oder ohne „Dienste“ erscheinen im Umschalter nur die Abteilung der Wache und weitere Einsatzabteilungen.
- **Begrenzung** (in der Datenbank, `RateLimits`): falsche Schlüssel je Adresse 10 in 10 Minuten, danach ist die Adresse 10 Minuten gesperrt (`429 info-terminal.tooManyAttempts`); je Terminal 120 Änderungen in 10 Minuten und 30 Suchen je Minute (`429 info-terminal.tooManyRequests`).
- **Was das Terminal liest:** Vor- und Nachname der Mitglieder der Abteilung (Namenskacheln: heute gültige Mitgliedschaft mit Status Probezeit oder aktiv, in Jugendfeuerwehr und Altersabteilung `youth` bzw. `veterans`); aus der Namenssuche (ab 3 Buchstaben, höchstens 10, Personen der Abteilungen des Terminals und der Abteilungen darunter außer ausgeschiedenen; mit der Einstellung `searchAllPersons` alle) Name und Kurzname der Abteilungen. Eingeschränkte Personen erscheinen nie. Von Einsätzen Stichwort, Alarm, Straße ohne Hausnummer und Ort, Ende des Zeitfensters und die Eintragungen des eigenen Berichts mit Fahrzeug und Funktion; Personen in anderen Berichten desselben Einsatzes nur mit dem Namen jener Abteilung bzw. Einheit. Von Diensten Titel, Zeit, Wache und Anwesende. Fahrzeuge in Dienst mit `vehicleLabel()` und Sitzplätzen, Funktionen und Stichworte aus den Katalogen. Es gibt keinen Endpunkt, der einen Bericht oder Dienst als Ganzes liefert.

**Zeitfenster** (Serverzeit; `bookingWindow()` in `incidents-contracts`, `terminalCheckInWindow()` in `training-contracts`)

| Fall | Öffnet | Schließt |
| --- | --- | --- |
| Einsatz, Ende des Abteilungsberichts bestätigt (`endConfirmed`) | Alarm | Ende des Berichts + `afterEndMinutes` (auch wenn das früher ist als Alarm + `openEndHours`) |
| Einsatz, Ende nicht bestätigt | Alarm | Alarm + `openEndHours` |
| Dienst | Beginn − `checkInBeforeMinutes` (`training.general`) | geplantes Ende + `afterEndMinutes` |

Fenster lassen sich nicht von Hand schließen oder verlängern. Außerhalb antwortet der Server `409 info-terminal.windowClosed`.

**Eintragen in den Einsatzbericht** (Vertrag `INCIDENTS_TERMINAL_BOOKING`, umgesetzt im Modul Einsatzberichte, siehe dort)
- Nur in Abteilungsberichte der gewählten Abteilung, nie in Berichte gesamtwehrweiter Einheiten (EvD). Nur solange der Bericht ein ungesperrter Entwurf ist (`incidents.notDraft`, `incidents.reportLocked`, `incidents.reportReleased`); sonst zeigt die Kachel „Bericht schon fertig gemeldet“.
- Nur Personen der Stammdaten, die nicht ausgeschieden sind, keine Gäste (`incidents.unknownPerson`). Steht die Person schon in einem anderen Bericht desselben Einsatzes, lehnt das Terminal ab (`409 info-terminal.personInOtherReport` mit dem Namen der Abteilung bzw. Einheit).
- Fahrzeug (in Dienst) oder Bereitschaft auf der Wache des Terminals; ein neues Fahrzeug kommt wie im Editor in die Fahrzeuge des Berichts. Funktion aus dem Katalog `function` (aktiv, sonst `info-terminal.unknownFunction`) oder keine. Atemschutz und eigene Zeiten („nicht die ganze Zeit dabei“) nur mit Fahrzeug; Zeiten gleich den geerbten (Fahrzeug, sonst Bericht) werden `null`. Bei Bereitschaft immer die Zeiten des Berichts und kein Atemschutz. Minuten, Gerät und CSA trägt der Verfasser nach. Dazu Verdienstausfall und Arbeitszeit beim Dienstherrn (ja/nein).
- Ein schon eingetragener Name öffnet die vorhandene Eintragung. Eintragungen vom Terminal lassen sich im Zeitfenster ändern und austragen; Eintragungen des Verfassers und Terminal-Eintragungen, die ein Benutzer im Editor geändert hat, sind am Terminal gesperrt (`409 info-terminal.entryLocked`).
- Eine Eintragung beendet die Verwaltung durch andere Systeme (`managedBy` wird `null`).
- **Parallelbetrieb mit MP-Feuer:** Führt MP-Feuer, sind Berichte mit `managedBy: 'mp-feuer'` am Terminal nicht eintragbar (Kachel wie ein fertig gemeldeter Bericht, Eintragen und Ändern `409 incidents.ledByMpFeuer`). „Unseren Bericht hinzufügen“ bei „Neuer Einsatz“ lehnt es ebenso ab, wenn der Bericht der Abteilung zu diesem Einsatz von MP-Feuer geführt wird; ein neuer Bericht der Abteilung zu einem solchen Einsatz bleibt möglich.

**Neuer Einsatz:** nur wenn das Terminal es darf (`403 info-terminal.newIncidentNotAllowed`) und in der Ansicht einer Einsatzabteilung. Stichwort (Katalog), Alarm (höchstens `maxAlarmAgeHours` zurück, `info-terminal.alarmTooOld`, nicht in der Zukunft, `info-terminal.alarmInFuture`), Leitstellennummer, Straße und Ort. „Weiter“ prüft wie der Dialog „Einsatz anlegen“ auf passende Einsätze (gleiche Leitstellennummer oder ±2 Stunden mit gleichem Stichwort oder Ort) und zeigt nur Stichwort, Alarm, Ort und beteiligte Abteilungen. „Unseren Bericht hinzufügen“ legt den Bericht der Abteilung zu diesem Einsatz an (ein vorhandener wird nur geöffnet), „Neuen Einsatz anlegen“ legt Einsatz und Bericht an (`createdVia: 'terminal'`, `incidents.incident.created` wie gewohnt, z. B. für den EvD-Bericht). Der Bericht hat keinen Verfasser; die Frist „Verfasser zuweisen“ geht an die Schreiber der Abteilung.

**Dienst eintragen** (Vertrag `TRAINING_TERMINAL_CHECK_IN`, umgesetzt im Modul Dienste): Dienste, zu deren Abteilungen die gewählte gehört, an der Wache des Terminals oder ohne Wache, nie abgeschlossene (`training.closed`). Anwesend mit Funktion als Text, abweichenden Zeiten (innerhalb des Dienstes, wie die Anwesenheitsliste) und Atemschutz (nur in der Ansicht einer Einsatzabteilung). Die Eintragung ist wie ein QR-Check-in unbestätigt (`confirmed: false`, `checkedInVia: 'info-terminal'`), bis jemand mit `training.attendance` die Anwesenheit speichert; bis dahin lässt sich der Dienst nicht abschließen (`training.unconfirmedCheckIns`). Unbestätigte Eintragungen vom Terminal lassen sich am Terminal ändern und austragen, bestätigte und QR-Check-ins nicht.

**Führerschein kontrollieren** (Vertrag `MASTERDATA_LICENSE_SELF_CHECK`, umgesetzt in den Stammdaten, siehe [Führerscheinkontrolle](#führerscheinkontrolle)): `POST /api/info-terminal/kiosk/driver-license` mit der gescannten Kennung (`code`), ohne `confirm` zum Anzeigen, mit `confirm: true` und der Sprache des Bildschirms zum Bestätigen der Selbsterklärung. Das Terminal erfährt nur Name, Klassen, letzte Kontrolle und nächste Frist der getroffenen Person, nie die Liste der Transponder. `KioskTerminal.driverLicenseCheck` sagt, ob die Selbstkontrolle eingeschaltet ist (Modus „zusätzlich regelmäßig“ mit Selbstkontrolle); sonst zeigt ein Scan nur den Stand und Bestätigen antwortet `403 info-terminal.licenseCheckOff`. Unbekannte und gesperrte Kennungen: `404 info-terminal.licenseNotRegistered`; je Terminal höchstens 10 davon in 10 Minuten, danach ist die Funktion für das Terminal 10 Minuten gesperrt (`429 info-terminal.tooManyRequests`), im Audit-Log höchstens ein Eintrag `info-terminal.unknown-license-code` je Terminal und Stunde. Ist das Original fällig, lehnt das Terminal ohne Einzelheiten ab (`409 info-terminal.licenseInPerson`). Bestätigen zählt zu den Änderungen des Terminals. Der Name des Terminals („Infoterminal Wache · Gerät“) steht an der Kontrolle.

**Daten:** kein Vollexport; die Geräteschlüssel verlassen die Datenbank nur in den Antworten auf Anlegen, „Link anzeigen“ und „Neuer Link“.

## Modul MP-Feuer (`mp-feuer`)

Übernimmt die Transferdateien von MP-Feuer in f.orga, solange die Feuerwehr parallel mit MP-Feuer arbeitet ([Parallelbetrieb](parallelbetrieb-mp-feuer.md)), und wird danach in der Modulverwaltung abgeschaltet. Alles MP-Feuer-Spezifische steht hier: Zip- und SQLite-Lesen, Tabellen und Spalten von MP-Feuer, Zusatzfeld 2, „bei Ges. Stat. anzeigen“ und der Statistik-Schlüssel. Core und andere Module kennen kein MP-Feuer-Format.

| | |
| --- | --- |
| Pakete | `modules/mp-feuer/mp-feuer-contracts`, `mp-feuer-api`, `mp-feuer-web` |
| Abhängigkeiten | `requires: ['masterdata']`, `optional: ['incidents', 'training', 'respiratory-protection']`; ohne ein optionales Modul fehlen nur dessen Datensätze |
| Navigation | „Verwaltung → MP-Feuer“ (`section: 'administration'`), Pfad `/mp-feuer/overview`; die Einstellungsseite `/mp-feuer/settings` (`section: 'settings'`) steht zusätzlich unter „Verwaltung → Module → MP-Feuer“ |
| Rechte | `mp-feuer.transfer` „MP-Feuer-Datenübernahme durchführen“, `mp-feuer.read` „Verlauf der Datenübernahmen lesen“ (beide Gesamtwehr; Rollenvorlage Kommandant: `mp-feuer.*`) |
| Entitäten | `mp_feuer.run` (Lauf, historisiert), `mp_feuer.run_dataset` (Zeilen je Profil), `mp_feuer.mapping` (gemerkte Zuordnungen, historisiert) |
| Einstellungen | `mp-feuer.remembered` (gemerkte Auswahl, nur für Verwalter lesbar, gepflegt über die Übernahme) |

**Zusammenspiel mit dem Core.** Das Modul ruft die Profile der anderen Module im selben Prozess über `ImportService.runRows` auf (`mappingList: 'none'`, eigene Liste als `remembered`, `source: { module: 'mp-feuer', runId }`), nie direkt und nie über HTTP. Es importiert nur `@forga/core-api` und `*-contracts` (Abteilungen über `ORGANIZATION` aus `masterdata-contracts`, Einheiten über `INCIDENT_UNITS` aus `incidents-contracts`, wenn `incidents` aktiv ist).

**Archive lesen** (`archive/transfer-archive.ts`):
- **Quelle:** je Abteilung eine Transferdatei `MPTRA_<Nr>_<Zeitstempel>_<Einheit>.zip` (unverschlüsselt) mit `MPTRA.IFO` (`type=transfer`, `encrypted=0`), `content.xml` und der SQLite-Datenbank `transfer.db` (z. B. `PER_STAMM`, `EIN_STAMM`, `UPE_STAMM`). Kindtabellen verweisen mit `<Präfix>_INDEX` auf die `<Präfix>_ID` der Elterntabelle.
- **Dateiname:** Nummer, Zeitstempel und Einheit, z. B. `MPTRA_01_2026-10-25-074935_Abt._Musterstadt.zip` oder `MPTRA_01_20261025_0749_Abt. Musterstadt.zip` → Archiv `01`, Einheit „Abt. Musterstadt“. Liegt dieselbe Nummer mehrmals vor, gilt die neueste Datei (nach Zeitstempel, sonst die spätere); die älteren stehen als `superseded` am Archiv.
- **Entpacken:** mit `fflate` gestreamt und gezählt (die Größen im Zip-Kopf können falsch sein): höchstens 500 MB je `transfer.db` und 2 GB je Upload, sonst `mp-feuer.archiveTooLarge` (Schutz vor Zip-Bomben). Kein Transfer-Archiv: `mp-feuer.archiveUnreadable`, verschlüsselt: `mp-feuer.archiveEncrypted` (jeweils mit `name`). Die Datenbank wird in ein temporäres Verzeichnis geschrieben, mit `node:sqlite` nur lesend geöffnet und danach gelöscht. Werte kommen als Text: `NULL` und das Leerdatum `1899-12-30` werden leer, Zeitstempel verlieren die Millisekunden.
- **Personen über Archive hinweg** (`transferPersons`): Mitglieder (`PER_STAMM`) und Jugendliche (`JUG_STAMM`) aller Archive nach MP-Feuer-ID. Andere Tabellen verweisen über diese ID und werden als „Nachname Vorname“ (und Geburtsdatum) übergeben. Die Personalnummern von MP-Feuer werden nicht benutzt, weil MP-Feuer sie je Abteilung zählt. Ausgeschieden ist, wer archiviert ist (`ARCHIV_DAT`); „Aktiv bis“ allein beendet nur den aktiven Dienst.

**Datensätze** (`datasets.ts`, Leser in `readers/`): je Importprofil ein Leser, in dieser Reihenfolge.

| Pos. | Profil | Leser | Inhalt |
| --- | --- | --- | --- |
| 10 | `masterdata.persons` | `persons.reader.ts` | `PER_STAMM`, `JUG_STAMM`: Anschrift, Telefone, E-Mail, Geburtsdatum, Geschlecht, „Aktiv von“ → Eintritt; Archivierte mit Austritt und Grund; dieselbe Person in mehreren Archiven einmal (aktuelles Mitglied vor Archiviertem, Mitglied vor Jugend) |
| 20 | `masterdata.career` | `career.reader.ts` | bestandene Lehrgänge aus `PER_LEHRG` (Datum = Ende, sonst Beginn oder Bestätigung), Kategorien „Dienstgrad“ und „Ehrung“ aus `PER_HIST`; Option `createCatalogEntries` wird nicht angeboten (die Zuordnung ersetzt sie) |
| 30 | `respiratory-protection.examinations` | `evidence.reader.ts` | G 26 aus `PER_PRUEF` (Kurz- oder Langname mit „G26“) aktueller Mitglieder |
| 40 | `respiratory-protection.stress-exercises` | `evidence.reader.ts` | Belastungsübungen und „AS-Strecke“ aus `PER_PRUEF` |
| 50 | `training.sessions` | `sessions.reader.ts` | `UPE_STAMM` mit `UPE_PERS` (entschuldigt, krank, Urlaub → entschuldigt; Atemschutz) |
| 60 | `incidents.personnel` | `incidents.reader.ts` | `EIN_STAMM` mit `EIN_PERS` und den Fahrzeugzeiten aus `EIN_FAHRZ`; Zusatzfeld 2 → Freigabestatus (`released-billing`, `released-compensation`, sonst `draft`), „bei Ges. Stat. anzeigen“ → Hauptbericht, Statistik-Schlüssel (`#L Kleinbrände A`, `#L TH1-Menschenrettung`, `#L Fehlalarm.BMA`, `#L TH-Überlandhilfe` …, `readers/statistics.ts`) mit Rettungs- und Verlustzahlen und Einsatzart „Verkehrsunfall“ → Statistikspalten |

- **Gesperrt** ist ein Datensatz, wenn der Benutzer das Recht des Profils nicht hat oder dessen Modul abgeschaltet ist (dann zählt das Recht nicht). Gesperrte Datensätze werden gezählt, aber ihre Zeilen nicht gespeichert und nicht übernommen. Gibt es das Profil nicht (Modul nicht installiert), fehlt der Datensatz.
- **Abteilungen und Einheiten:** Vor dem Lauf setzt das Modul in jede Zeile mit `department` die für ihr Archiv gewählte Abteilung (Name; ohne Wahl bleibt die Einheit aus dem Dateinamen) und bei `incidents.personnel` die gewählte Einheit (`unit`, z. B. `duty-officer` für die Einsatzberichte des Archivs „Gesamtfeuerwehr“). Übersprungene Archive fallen weg.

**Lauf** (`runs/runs.service.ts`):
- **Status:** `prepared` (gelesen) → `dry-running` → `checked` → `applying` → `applied`; dazu `cancelled` (Übernahme nach einem Teil abgebrochen) und `failed` (Fehler, Code in `error`; `mp-feuer.interrupted` nach einem Neustart). `applied`, `cancelled` und `failed` sind endgültig; für eine neue Übernahme werden die Dateien neu hochgeladen.
- **Auswahl** (`PUT …/runs/:id`, nur `prepared`/`checked`): je Archiv Abteilung (`mp-feuer.unknownDepartment`), Einheit (`mp-feuer.unknownUnit`) und Überspringen, je Datensatz an/aus (gesperrte bleiben aus), Optionen und für das Einsatzpersonal das Datum „Erst ab“ (`from`, `YYYY-MM-DD`; nur Berichte mit Beginn ab diesem Tag, `null` alle; bei anderen Datensätzen `400 mp-feuer.noDateFilter`), dazu `mappings` (geprüft wie im Tabellen-Import).
- **Probelauf vor der Übernahme:** Die Übernahme braucht einen Probelauf mit derselben Auswahl und denselben Zuordnungen (`checkedSignature`), sonst `409 mp-feuer.dryRunOutdated`. Der Lauf meldet das als `dryRunOutdated`.
- **Hintergrund:** `POST …/dry-run` und `…/apply` antworten sofort (`202`); der Server arbeitet die Datensätze in Reihenfolge ab. Je Datensatz Teile von höchstens 2 000 Zeilen (`MP_FEUER_PART_SIZE`); die Zeilen eines Einsatzes (Leitstellennummer, sonst Bericht) bzw. eines Dienstes bleiben in einem Teil, weil das Profil den Hauptbericht je Einsatz bestimmt. Jeder Teil ist ein Aufruf von `runRows`; die Profile übernehmen einen Aufruf in einer Transaktion, ein Probelauf ändert nichts. Nach jedem Teil schreibt der Lauf Fortschritt (`progress`: Datensatz, Teil, Zeilen) und Zähler (ohne Historie) und prüft, ob abgebrochen werden soll.
- **Ein Lauf zugleich:** Die Spalte `lock` ist eindeutig und während der Arbeit gesetzt, so arbeitet auch bei mehreren Server-Instanzen höchstens ein Lauf; ein zweiter Start ergibt `409 mp-feuer.runActive`.
- **Abbrechen** (`POST …/cancel`): Der laufende Teil wird fertig, danach hält der Lauf an. Ein abgebrochener Probelauf geht zurück auf `prepared`, eine abgebrochene Übernahme endet als `cancelled`; fertige Teile bleiben übernommen. Weil die Profile idempotent sind, ergänzt ein neuer Lauf mit denselben Dateien den Rest, ohne zu verdoppeln.
- **Neustart des Servers:** Beim Start wird ein arbeitender Lauf `failed` mit `mp-feuer.interrupted` („unterbrochen“).
- **Nach der Übernahme:** Die gelesenen Zeilen werden gelöscht, der Lauf bleibt für den Verlauf. Die benutzten Zuordnungen kommen nach jedem übernommenen Teil in `mp_feuer.mapping`. Die Auswahl wird im Abschnitt `mp-feuer.remembered` gemerkt: je Archivnummer Einheit aus dem Dateinamen, Abteilung, Einheit und Überspringen, je Datensatz an/aus, Optionen und „Erst ab“. Der nächste Upload belegt damit vor (Abteilung nur, wenn es sie noch gibt, Einheit nur, wenn sie angeboten wird); neue Archive bekommen einen Vorschlag über den Namen.
- **Aufbewahrung:** Zeilen von Läufen, die älter als 7 Tage sind, löscht der tägliche Aufbewahrungslauf (Regel `mp-feuer.rows`); Zeilen mit Meldungen 90 Tage nach dem Ende des Laufs (Regel `mp-feuer.messages`) oder sofort mit „Umstellung abgeschlossen“ (`POST …/runs/remove-messages`). Läufe und Zähler bleiben. Eine Lauf-ID, die keine UUID ist, ergibt `404 mp-feuer.runNotFound`.
- **Audit:** `imports.applied` je übernommenem Teil (von `runRows`, mit `source`, Dateien und Teil), `mp-feuer.run-applied` je Übernahme mit Lauf, Dateien und Zählern je Datensatz, `mp-feuer.run-cancelled`, `mp-feuer.mapping-deleted`, `mp-feuer.remembered-reset`.

**Bericht** (`GET …/runs/:id/report`): Zähler je Datensatz, Meldungen gruppiert nach Code, Wert und Fehler mit Anzahl und bis zu drei Beispielzeilen (Datensatz, Archiv, Zeile, Bezeichnung) und die Zahl der neu gemerkten Zuordnungen. `?format=csv` liefert alle Zeilen mit Meldungen (UTF-8 mit BOM, Semikolon): `dataset`, `archive`, `row`, `label`, `action`, `code`, `params` (JSON). Die Zeilennummer zählt innerhalb des Datensatzes.

**Export nach MP-Feuer (vorbereitet):** Schnittstelle `MpFeuerExportAdapter` (`exports/export-adapter.ts`: `id`, `name`, `permissions`, `parameters`, `build(user, params)` → Datei und Warnungen) und Registry `MpFeuerExports`; `GET /api/mp-feuer/exports` liefert die Adapter, die der Benutzer nutzen darf. Es gibt noch keinen Adapter, weil die Vorlagen des MP-Feuer-Tabellen-Imports fehlen.

**Oberfläche** (`modules/mp-feuer/mp-feuer-web`): Reiter Übersicht, Neue Übernahme, Verlauf, Zuordnungen, Export nach MP-Feuer, Einstellungen.
- **Übersicht:** Fehler der letzten Übernahme, Zahl der gemerkten Zuordnungen (mit Problemen), Läufe; Stand mit letzter Übernahme, laufendem Lauf, „Einsatzberichte führt: MP-Feuer/f.orga“ und „Freigaben melden ab“ aus `incidents.general`; wöchentliche Routine mit „Neue Übernahme“.
- **Neue Übernahme** in fünf Schritten (`/mp-feuer/transfer`, dann `/mp-feuer/runs/:id`): 1. Dateien und Archive (Nummer, Datei und Inhalt, Abteilung, „Einsatzberichte als“, Status gemerkt/neu/übersprungen, Warnung bei ersetzten Dateien, „Übernahme verwerfen“); 2. Datensätze und Probelauf (an/aus, Optionen, Zähler und offene Bezeichnungen je Datensatz); 3. Bezeichnungen zuordnen (`UnmatchedValues` mit Filter nach Art); 4. Übernehmen mit Fortschritt je Datensatz und Teil, „Abbrechen …“; 5. Ergebnis mit Zählern, Meldungen nach Art und „Als CSV herunterladen“. Die Seite fragt einen arbeitenden Lauf alle 2 Sekunden ab und darf geschlossen werden.
- **Verlauf:** Läufe mit Zeitpunkt, Benutzer, Dateien, Status (Probelauf, übernommen, abgebrochen, unterbrochen …) und Bericht.
- **Zuordnungen:** `RememberedMappings` auf `mp-feuer/mappings`.
- **Export nach MP-Feuer:** „in Vorbereitung“ mit den geplanten Exporten (Personen, Lehrgänge, Einsätze: „Vorlage fehlt“).
- **Einstellungen:** gemerkte Auswahl je Archivnummer und der Datensätze, „Gemerkte Auswahl zurücksetzen …“ (`DELETE /api/mp-feuer/remembered`; die Zuordnungen bleiben); Eingangsordner und Zeitplan als „später“.
- **Hinweis auf der Import-Seite:** Erweiterungspunkt `core.imports.notice` der Shell: „MP-Feuer-Transferdateien übernimmt das Modul MP-Feuer“ mit Link, für Benutzer mit `mp-feuer.read`, solange das Modul aktiv ist.

## Modul Datensicherung (`backup`)

Administratoren richten in der Oberfläche eine regelmäßige, verschlüsselte Sicherung der eigenen Instanz in einen Ordner auf dem Server ein, prüfen Sicherungen und stellen eine Sicherung ohne Konsole wieder her. Backend `modules/backup/backup-api`, Oberfläche `backup-web`, Verträge `backup-contracts`. Benötigt nur `core`. Mockups: `dokumentation/geplant/mockups/sicherung/`. Betrieb (Volumes, Variablen, Rücktausch von Hand): [Betrieb](betrieb.md#datensicherung).

**Abgrenzung:** Das Modul sichert die eigene Instanz. `docker/backup.sh` auf dem Host sichert alle Instanzen einer Compose-Datei und `docker/.env` und hilft, wenn die Anwendung nicht mehr startet. Der Vollexport (`core.data.export`) ist JSON zur Auswertung, keine Sicherung. Bei den Stufen sichert jede Instanz in ihren eigenen Ordner, mit eigener Passphrase und eigenem `FORGA_SECRET_KEY`.

**Rechte:** `backup.manage` (Gesamtwehr: einrichten, sichern, prüfen, herunterladen, hochladen, löschen, wiederherstellen) und `backup.notify` (E-Mail bei Fehlschlag). Keine Rollenvorlage außer `administrator` (`*`). `backup.manage` ist im Manifest `privileged`: Es lässt sich keinem API-Token geben (`tokens.privilegedScopes`), auch nicht über ein Muster wie `backup.*`, und wie jedes gesamtwehrweite `….manage` verknüpft OIDC Konten damit nicht automatisch.

**Voraussetzungen:** `FORGA_BACKUP_ROOT` (sonst nur lesbar, Warnung `backup.notConfigured`), `FORGA_SECRET_KEY` für die gespeicherte Passphrase (sonst `backup.noSecretKey`: nur „Jetzt sichern“ mit Eingabe der Passphrase), `pg_dump`/`pg_restore`/`psql` (`FORGA_PG_BIN` oder `PATH`, im Image `postgresql17-client`). Die Übersicht vergleicht `pg_dump --version` mit der Serverversion (`backup.clientMismatch`, `backup.toolsMissing`) und zeigt, ob die Datenbankrolle Datenbanken anlegen darf (Weg der Wiederherstellung).

**Entitäten** (Schema `backup`, nicht historisiert, weil Protokoll; Anlegen, Löschen und Wiederherstellen stehen im Audit-Log):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `BackupRun` | `run` | Eine Sicherung: Datei und Zielordner, Auslöser (`scheduled`, `manual`, `safety`, `upload`, `foreign`), Benutzer, Beginn und Ende, Größe, Status (`running`, `ok`, `failed` mit Code, `missing`, `deleted`), verschlüsselt, Kennwert der Passphrase, Instanz, Version, Manifest, Ergebnis der letzten Prüfung, `keepUntil` (Sicherheitssicherungen), `deletedAt` |
| `BackupRestore` | `restore` | Eine Wiederherstellung mit Schritten, Ergebnis, Weg (`swap`, `clean`), Sicherheitssicherung und voriger Datenbank |

**Einstellung** `backup.general` in `core.setting`, nicht als Einstellungsabschnitt des Moduls angemeldet: gelesen und geschrieben nur über `/api/backup/settings` mit `backup.manage` (der allgemeine Endpunkt kennt den Abschnitt nicht): `targetPath` (`forga`), `schedule` (`mode` `off`/`daily`/`weekdays`, `time` `02:30`, Europe/Berlin), `keepCount` (14), `keepDays` (30), `verifyAfterBackup` (an), `encryption` (an), `include` (`plugins`, `settingsCopy`), `notify` (`onFailure`, `staleHours` 36). Dazu nur schreibbar `passphraseEncrypted` (in `SECRET_SETTING_FIELDS`: nie in Antworten oder Vollexport, Historie mit `••••••`), der Kennwert `passphraseId` und die Kennung der Instanz `instanceId`.

**Optional:** Die Datensicherung ist freiwillig. Ohne `FORGA_BACKUP_ROOT` zeigt die Übersicht nur einen Hinweis; mit Wurzel, aber ohne gespeicherte Einstellungen gibt es keine geplanten Sicherungen, keine Warnungen, keine Aufgaben und keine E-Mails, und die Einrichtungsliste der Startseite nennt das Modul nicht.

**Zielordner** (`backups/rules.ts`): relativ zu `FORGA_BACKUP_ROOT`; absolute Pfade, `..`, die Wurzel selbst und Verknüpfungen nach außen lehnt der Server ab (`backup.pathOutsideRoot`), auch bevor er Ordner anlegt. „Ziel prüfen“ schreibt und löscht eine Testdatei und meldet den freien Speicher (`statfs`).

**Dateiformat** (`format/backup-format.ts`, Version 1): `forga-<instanz>-JJJJ-MM-TT_HHMM.forgabackup` (`FORGA_INSTANCE`, Ortszeit).
- Kopf unverschlüsselt: `FORGABAK`, Länge, JSON mit Format, Version von f.orga (`FORGA_VERSION`), Instanz und Kennung, Zeitpunkt, Auslöser, Kennwert der Passphrase und den Parametern der Verschlüsselung. Damit listet das Modul eine Datei ohne Passphrase.
- Danach Blöcke von höchstens 1 MiB, jeder mit AES-256-GCM, eigener zufälliger Nonce und Tag. Die zusätzlichen Daten jedes Blocks binden den SHA-256 des Kopfs, die Blocknummer und die Endmarke: geänderte, vertauschte, fehlende oder angehängte Blöcke und ein geänderter Kopf fallen auf (`backup.corrupt`). Schlüssel aus der Passphrase mit scrypt (N = 2^17, r = 8, p = 1, Salz je Datei); ein HMAC des Schlüssels im Kopf unterscheidet eine falsche Passphrase (`backup.wrongPassphrase`) von einer beschädigten Datei. Unverschlüsselt (nur nach ausdrücklicher Bestätigung) sind es dieselben Blöcke ohne Verschlüsselung.
- Inhalt: Einträge mit Name und Datenabschnitten, `manifest.json` (Format, Version, Instanz, Module mit Version, ausgeführte Migrationen, PostgreSQL-Versionen, Zahl der Personen, Einsätze, Berichte und Dienste, Inhalt), `database.dump` (`pg_dump --format=custom` der ganzen Datenbank), `plugins.tgz` (Plugin-Ordner, höchstens 50 MB), `settings.json` (Einstellungen ohne Geheimnisse) und zuletzt `checksums.json` (SHA-256 und Größe jedes Eintrags). Ein Container statt tar, weil die Länge des Dumps beim Streamen vorher nicht bekannt ist.
- Kennwert der Passphrase: erste 8 Hex-Zeichen eines HMAC über einen scrypt-Hash mit festem Salz, angezeigt als `3F9A·C21B`; er zeigt, welche Passphrase eine Sicherung braucht.
- `npm run backup -- info|decrypt <datei> [<ordner>]` (`tools/backup.mts`) liest und entpackt eine Sicherung ohne laufendes f.orga und prüft alle Prüfsummen; die Passphrase aus `FORGA_BACKUP_PASSPHRASE` oder abgefragt.

**Ablauf einer Sicherung** (`backups/backups.service.ts`)
1. Auslöser: Zeitplan (Prüfung jede Minute, `BackupScheduler`; eine verpasste Sicherung wird höchstens 12 Stunden nachgeholt, `FORGA_BACKUP_SCHEDULER=off` schaltet ab), „Jetzt sichern“ (`202`, läuft im Hintergrund) oder Sicherheitssicherung vor einer Wiederherstellung. Höchstens eine Sicherung gleichzeitig: Merker im Prozess (`409 backup.running`) und `pg_try_advisory_xact_lock` in der Datenbank.
2. Freien Speicher gegen die letzte Sicherung (+20 %) prüfen (`backup.diskFull`), `pg_dump` als Kindprozess in den Strom, Verschlüsselung dahinter, Datei als `.part` (Rechte `0600`), nach `fsync` umbenannt; bei einem Fehler wird die Teildatei gelöscht.
3. „Nach jeder Sicherung prüfen“ (Standard): erst danach gilt sie als `ok`. Audit `backup.created` bzw. `backup.failed`.
4. Aufbewahrung: Die neuesten `keepCount` und alle der letzten `keepDays` Tage bleiben, Sicherheitssicherungen zusätzlich 30 Tage (`keepUntil`); nur geplante, manuelle und Sicherheitssicherungen im aktuellen Zielordner. Audit `backup.pruned`. Einträge gelöschter und fehlgeschlagener Sicherungen und abgeschlossener Wiederherstellungen folgen der Kategorie `backup.run-log` des [Aufbewahrungsplans](aufbewahrung.md) (Standard 1 Jahr).
5. Fehlschlag (auch wenn eine geplante Sicherung gar nicht starten kann, z. B. Ziel nicht beschreibbar): Aufgabe „Datensicherung fehlgeschlagen“ für `backup.manage` (Fristen-Registry, bis zur nächsten erfolgreichen Sicherung) und E-Mail an Benutzer mit `backup.notify` (Audit `backup.failure-notified`), abschaltbar mit `notify.onFailure`. Ohne erfolgreiche Sicherung seit `staleHours` Aufgabe „Keine aktuelle Datensicherung“ und Warnung auf der Übersicht.

**Liste:** Sie gleicht den Zielordner mit den Einträgen ab. Dateien ohne Eintrag bekommen einen: mit der eigenen `instanceId` als das, was der Kopf sagt (so erscheint z. B. die Sicherheitssicherung nach einer Wiederherstellung wieder), sonst als „fremd“; fremde lassen sich prüfen und wiederherstellen, aber nicht löschen (`backup.foreignNotDeletable`). Einträge ohne Datei zeigen „Datei fehlt“. Dateien, die keine Sicherung sind, bleiben unberührt. **Hochladen** streamt in den Zielordner (Name nur aus Buchstaben, Ziffern, `._-` mit Endung `.forgabackup`, `backup.notABackup` für andere Dateien). **Herunterladen** liefert die Datei, wie sie liegt (Audit `backup.downloaded`).

**Prüfen:** Entschlüsseln, Prüfsummen vergleichen, Inhaltsverzeichnis des Dumps mit `pg_restore --list` lesen (Zahl der Objekte und Schemas; `pg_restore` endet nach dem Inhaltsverzeichnis, der Rest des Dumps wird verworfen), Version und Module mit dem Server vergleichen. **Wiederherstellung testen:** zusätzlich in eine temporäre Datenbank `<db>_restoretest_<zeit>` einspielen (ohne Migrationen), Personen, Einsätze, Berichte und Dienste zählen und mit dem Manifest vergleichen (`backup.restoreTestMismatch`), danach die Datenbank löschen. Fremde Sicherungen brauchen ihre Passphrase. Das Ergebnis steht an der Sicherung; Audit `backup.verified`, `backup.restore-tested` bzw. `backup.verify-failed`.

**Wiederherstellung** (`restore/restore.service.ts`)
1. Prüfen mit der erneut eingegebenen Passphrase (nie der gespeicherten). Abgelehnt werden eine neuere Version von f.orga oder eine Migration, die der Server nicht kennt (`backup.newerVersion`), und Module, die hier fehlen (`backup.missingModules`; Plugins der Sicherung zählen nicht als fehlend). Ältere Sicherungen sind erlaubt, ihre Migrationen laufen beim Neustart.
2. Bestätigen mit dem Namen der Feuerwehr (ohne Groß- und Kleinschreibung, `backup.confirmNameMismatch`) und „Benutzer informiert“. Die Antwort enthält ein Token für den Status; Audit `backup.restore-started`.
3. Im Hintergrund: Wartungsmodus an, laufende Anfragen höchstens 30 s auslaufen lassen, Zeitplan pausiert. Sicherheitssicherung des jetzigen Stands mit der gespeicherten Passphrase (ohne sie mit der eingegebenen), geprüft, 30 Tage aufbewahrt; scheitert sie, endet alles ohne Änderung (`backup.safetyBackupFailed`).
4. Mit `CREATEDB` (Weg `swap`): neue Datenbank `<db>_restore_<zeit>` (`template0`), `pg_restore --no-owner --exit-on-error`, Markierung als Kommentar der Datenbank. Dann der Tausch über `psql` in der Datenbank `postgres`: keine neuen Verbindungen zur laufenden Datenbank, offene beenden, `<db>` → `<db>_before_<zeit>`, neue → `<db>`. Scheitert das Einspielen, wird die neue Datenbank gelöscht und die alte bleibt (`backup.restoreFailed` mit Ausschnitt der Fehlerausgabe, Audit `backup.restore-failed`). Scheitert der Tausch, wird er zurückgenommen; gelingt auch das nicht, bleibt der Wartungsmodus an (`swapFailed`) und die Seite nennt die Befehle für die Konsole.
   Ohne `CREATEDB` (Weg `clean`): `pg_restore --clean --if-exists --single-transaction` in die laufende Datenbank; bei einem Fehler bleibt der alte Stand.
5. Plugins der Sicherung zurückschreiben (der Plugin-Ordner bekommt genau den gesicherten Inhalt).
6. Neustart: Der Prozess beendet sich mit Exit-Code 0 (`FORGA_RESTORE_EXIT=off` in Tests); Docker startet ihn neu. Beim Start laufen die Migrationen, dann schließt das Modul ab: Trägt die laufende Datenbank die Markierung, löscht es alle Sitzungen, schreibt die Wiederherstellung und Audit `backup.restored` in die neue Datenbank und beendet den Wartungsmodus. Ohne Markierung (von Hand zurückgetauscht) gilt sie als gescheitert (`backup.restoreRolledBack`); war der Prozess vor dem Tausch beendet worden, als unterbrochen (`backup.restoreInterrupted`).
7. Die vorige Datenbank bleibt 7 Tage und wird dann vom Modul gelöscht (täglich, `BackupScheduler`), oder sofort über „Alte Datenbank löschen“ (Audit `backup.previous-database-dropped`). Übrig gebliebene `_restore_`- und `_restoretest_`-Datenbanken löscht es nach einem Tag.

**Wartungsmodus** (`restore/maintenance.ts`): Merker im Prozess und in `FORGA_MAINTENANCE_FILE` (Standard `/tmp/forga-maintenance`, mit dem Stand der Wiederherstellung und dem SHA-256 des Status-Tokens; das Ergebnis bleibt in `<datei>.result`). Solange er an ist, antwortet jede Anfrage unter `/api` außer `GET /api/backup/restore/status` mit `503 maintenance` und `Retry-After`, auch Kiosk und API-Tokens; statische Dateien liefert der Server weiter. Der Status ist ohne Anmeldung abrufbar, aber nur mit dem Token der Seite, die die Wiederherstellung gestartet hat; so funktioniert er auch nach dem Neustart, wenn die Sitzung nicht mehr gilt.

**Audit-Log:** Die Aktionen `backup.*` und ihre Detailschlüssel haben Texte (`backup-web/src/audit.i18n.ts`); `backupId` zeigt den Dateinamen der Sicherung mit Link auf die Liste (`AuditReferenceRegistry`, Art `backup.run`).

**Daten:** Der Vollexport enthält die Einstellung ohne Passphrase, keine Sicherungen.

## Modul Datenschutz (`privacy`)

Die Verwaltung des Datenschutzes nach DSGVO: Betroffenenanfragen mit Frist, Einschränkung der Verarbeitung, Widerspruch, Löschprüfung, Berichtigung, Daten Dritter, Information nach Art. 13/14, Datenschutzhinweis mit Fassungen, Einwilligungen, Auskunft nach Art. 15 als PDF, Leseprotokoll, Verzeichnis der Verarbeitungstätigkeiten und Datenpannen. Backend `modules/privacy/privacy-api`, Oberfläche `privacy-web`, Verträge `privacy-contracts`. Benötigt `masterdata`. Einzelheiten der Funktionen: [Datenschutz](datenschutz.md); welche Sicherheit im Core bleibt: [Aufteilung](datenschutz.md#aufteilung-modul-datenschutz-und-sicherheit-des-core).

**Aktiv und abschaltbar:** Wie jedes Modul ist es aktiv, sobald der Server es zum ersten Mal sieht (neue Installation; `npm run seed` schaltet es zusätzlich ausdrücklich ein). Unter „Verwaltung → Module“ lässt es sich abschalten. Danach antworten `/api/privacy/…` und die Kiosk-Seite `/privacy-notice` `404 modules.inactive`, Menü, Seiten, Reiter und Abschnitte fehlen, es gibt keine Aufgaben, keinen Hinweis bei der ersten Anmeldung, keine Einschränkung, keine Einwilligungsverwaltung (Listen wie ohne Einwilligungen) und kein Leseprotokoll. Gespeicherte Daten bleiben und wirken nach dem Einschalten wieder. Der Beitrag zum `PersonDataRegistry` (Löschprüfung, Anonymisierung) läuft auch bei abgeschaltetem Modul.

**Rechte:** `privacy.manage` (Gesamtwehr, `privileged`, `stepUp`; Anfragen, Einschränkung, Hinweis, Einstellungen, Auskunft, Verzeichnis, Datenpannen) und `privacy.consents` (Abteilung; Einwilligungen von Personen erfassen und widerrufen; Rollenvorlagen `commander` und `department-commander`). Das Leseprotokoll liest `core.audit.read`.

**Entitäten** (Schema `privacy`):

| Entität | Tabelle | Inhalt |
| --- | --- | --- |
| `PrivacyRequestEntity` | `request` | Betroffenenanfrage mit Frist, Verlängerung, Stand, Empfängern, Berichtigung, Löschung (historisiert, `privacy.request`) |
| `PrivacyNoticeEntity` | `notice` | Fassungen des Datenschutzhinweises (historisiert, `privacy.notice`) |
| `NoticeAcknowledgementEntity` | `notice_acknowledgement` | „Zur Kenntnis genommen“ je Benutzer: Fassung und Zeitpunkt |
| `ProcessingRestrictionEntity` | `restriction` | Einschränkung der Verarbeitung je Person (historisiert, `privacy.restriction`) |
| `PrivacyInformationEntity` | `information` | Information nach Art. 13/14 je Person (historisiert, `privacy.information`) |
| `ConsentEntity` | `consent` | Einwilligungen mit Fassung und Widerruf (historisiert, `privacy.consent`) |
| `AccessLogEntity` | `access_log` | Leseprotokoll je Benutzer, Person, Bereich und Tag (Protokoll, nicht historisiert) |
| `PrivacyDocument` | `document` | Auskünfte nach Art. 15, verschlüsselt, 30 Tage (nicht historisiert) |
| `PrivacyBreachEntity` | `breach` | Datenpannen (historisiert, `privacy.breach`) |

**Einstellungen:** `privacy.contacts`, `privacy.texts`, `privacy.selfServiceAccess`, `privacy.activities`, `privacy.consents` (`PRIVACY_SETTINGS`, Verwalter nur `privacy.manage`; Texte, Verzeichnis und Einwilligungen nur über die eigenen Endpunkte). Einstellungsseite `/privacy/settings` (Abschnitt `settings`, `onboarding: false`); die Einrichtungsliste bekommt dafür die Schritte `privacyContacts` und `privacyTexts` über `OnboardingRegistry`.

**Endpunkte:** alle unter `/api/privacy/…` ([Schnittstellen](schnittstellen.md#datenschutz)). Öffentlich (`@Public()`) sind nur `notice` und `notice.pdf`.

**Was das Modul vom Core nutzt:**

| Schnittstelle des Core | Beitrag des Moduls |
| --- | --- |
| `ProcessingRestrictions.register` | eingeschränkte Personen (`PersonPrivacyService.restrictedIds`) |
| `AccessLog.registerRecorder`, `registerArea` | Ablage des Leseprotokolls (`AccessLogStore`), Bereich `privacy.access-report` |
| `Consents.register` (Token `CONSENTS`) | Wirkungen der Einwilligungen (`ConsentService`) |
| `ExportRegistry`, `PersonDataRegistry` | Vollexport, Auskunft je Person (JSON), `describePerson` (Einwilligungen, Einschränkung und Information, Zugriffe), Löschprüfung (`privacy.requests`, `privacy.access-log`) und Anonymisierung (`PrivacyData`) |
| `DeadlineRegistry` | Fristen der Anfragen, Verlängerungen, Berichtigungen, Datenpannen und das Ende einer Einschränkung |
| `RetentionRegistry` | Kategorien `privacy.access-log`, `privacy.access-reports`, `privacy.breaches` |
| `ProtocolRegistry` | Protokoll `privacy.access-log` für die Hilfen bei Datenpannen (das Audit-Log `core.audit` meldet der Core) |
| `TechnicalMeasureRegistry` | Maßnahmen `privacy.access-log`, `privacy.access-reports` im Verzeichnis |
| `LockdownRegistry`, `ProcessorRegistry`, `ThirdPartyRegistry` | liest sie für „Alle Sitzungen beenden“, Auftragsverarbeiter und Daten Dritter |
| `OnboardingRegistry` | Schritte `privacyContacts`, `privacyTexts` |
| `HistoryAccessRegistry`, `HistoryEntry` | Lesezugriff auf die eigenen Historien; „Wert in der Historie unkenntlich machen“ (`POST /api/privacy/history/:id/redact`) für die Historie aller Module |
| `Attachments.register` | Nachweise `privacy.consent`, `privacy.request` |
| `PERSON_DIRECTORY` (Stammdaten) | Personen ohne Information nach Art. 13/14 (`careers()`) |

**Oberfläche** (`modules/privacy/privacy-web`): Routen unter `/privacy` (Anfragen, `information`, `register`, `breaches`, `breaches/:id`, `requests/:id`, `settings`, `rectifications/:id`), Menü „Verwaltung → Datenschutz“ aus dem Manifest (`section: 'administration'`). Kiosk-Einstieg `./Notice` für die öffentliche Seite `/privacy-notice`. Erweiterungen: `core.session.gate` (Hinweis bei der ersten Anmeldung), `core.me.top` (bereitgestellte Auskunft), `core.me.sections` (Abschnitt „Datenschutz“ mit Einwilligungen, Anfragen und Hinweis), `core.me.section-actions` („Berichtigung beantragen …“ unter den Abschnitten der Module), `core.audit.tabs` (Reiter „Leseprotokoll“), `masterdata.person.tab` (Reiter „Datenschutz“), `masterdata.person.actions` („Auskunft erstellen …“).

**Tests:** `privacy.integration.ts`, `consents.integration.ts`, `access-report.integration.ts`, `privacy-register.integration.ts`, `erasure.integration.ts`, `minimisation.integration.ts`, `anonymization.integration.ts` und `privacy-module.integration.ts` (Modul abgeschaltet).

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
- **Seitenleiste:** Abschnitte „Übersicht“ (Startseite, Listen, Import), je aktivem Modul einer mit den Einträgen aus dem Manifest (Symbol über `icon`, Zähler über `useNavigationBadges` des Moduls) und „Verwaltung“ (nur Einträge, für die der Benutzer das Recht hat). Navigationseinträge mit `section: 'administration'` stehen unter „Verwaltung“, weil sie für die ganze Anwendung gelten (z. B. Kataloge, Infoterminals). Einstellungsseiten der Module (`section: 'settings'`) stehen nicht in der Seitenleiste, sondern auf „Verwaltung → Module“ beim jeweiligen Modul; der Eintrag „Module“ erscheint dafür auch für Benutzer, die nur die Einstellungen eines Moduls verwalten dürfen. Auf dem Handy ein Menü mit Suche und Sprachumschalter.
- **Fußzeile:** Anschrift und Kontakt aus den Einstellungen `brigade`; Link „Datenschutz“ auf `/privacy-notice`, wenn das Modul Datenschutz aktiv ist (ebenso auf der Anmeldeseite, die das über `GET /api/core/modules/kiosk/privacy-notice` prüft).
- **Globale Suche:** `GET /api/core/search`, Treffer nach Gruppe (Personen, Fahrzeuge, Einsätze).
- **Code suchen** (`/scan`, Eintrag unter „Übersicht“, wenn `GET /api/core/codes/modules` ein Modul liefert): großes Eingabefeld mit Fokus, in das Handscanner und RFID-Lesegeräte wie eine Tastatur schreiben (Enter sucht). Auf dem Handy „Mit Kamera scannen“ (Barcode-Erkennung des Browsers: QR, Code 128/39/93, EAN-13/8, UPC-A, Data Matrix, ITF) und „RFID/NFC lesen“ (Web NFC, Kennung des Chips). Genau ein Treffer öffnet den Gegenstand, mehrere erscheinen als Liste nach Modul, keiner als Hinweis. `/scan?code=…` sucht sofort (z. B. als Link auf einem NFC-Tag).

### Daten: Suche, Vollexport, Auskunft, Aufbewahrung

`libs/core/core-api/src/lib/data/data.ts`. Module melden sich in `onModuleInit` an:
- **Suche** (`SearchRegistry`): `GET /api/core/search?q=` (ab 2 Zeichen) fragt die Quellen der Module, für die der Benutzer überhaupt Rechte hat; jede Quelle prüft die Rechte selbst. Gesucht wird wortweise (`wordsWhere` in `core-api`): Jedes Wort der Eingabe muss in einem der Felder vorkommen, Reihenfolge und Kommas sind egal, also finden „Felix“, „Felix Funke“ und „Funke, Felix“ dieselbe Person. Genauso arbeiten die Suchfelder der Listen im Browser (`matchesSearch` in `web-ui`) und alle Auswahlfelder (`wordsFilter`, im Theme als Standard für `Select`, `MultiSelect`, `Autocomplete`). Datumsfelder (`DateInput`, Anzeige `TT.MM.JJJJ`) lesen getippte Daten im Theme mit `parseDateInput` (`web-sdk`): `21.10.2026`, `1.3.26`, `21/10/2026` oder `2026-10-21`, nie mit vertauschtem Tag und Monat; Unmögliches (z. B. `31.02.`) bleibt leer. Stammdaten: Personen (sichtbare), Fahrzeuge; Einsatzberichte: Einsätze (Leitstellennummer, Stichwort, Meldebild).
- **Code-Suche** (`CodeRegistry`): `GET /api/core/codes?code=` fragt die Quellen der Module mit gekennzeichneten Gegenständen (Geräte, Kleiderkammer) nach dem exakten Code: Barcode, RFID-Chip, Inventar- oder Seriennummer (ohne Groß-/Kleinschreibung) oder die URL eines QR-Etiketts von f.orga. Jede Quelle prüft die Rechte selbst. Codes sind `ItemCode`/`RfidCode` aus `core-contracts`: leer bedeutet keiner; RFID-Kennungen werden ohne Trennzeichen in Großbuchstaben gespeichert und verglichen (`normalizeRfid`), weil Lesegeräte sie unterschiedlich ausgeben. Eingabefelder für Codes (`CodeInput` in `web-ui`) füllen sich per Handscanner, Kamera (Barcode) oder NFC (RFID).
- **Vollexport** (`ExportRegistry`, Recht `core.data.export`): `GET /api/core/export/:modul` liefert alle Daten des Moduls mit IDs als JSON (`{ format: 'forga.export', version: 1, module, exportedAt, data }`), `GET /api/core/export/person/:personId` alles zu einer Person über alle Module (Auskunft nach Art. 15 DSGVO). Beides steht im Audit-Log (`data.exported`, `data.person-exported`).
  - Der Core exportiert als Modul `core` (`CoreExport`) Benutzer mit Rollenzuweisungen, Rollen, Einstellungen und API-Tokens (Name, Bereiche, Präfix, Daten); nie Passwort-Hashes, Sitzungs- oder Token-Geheimnisse und Felder, die nur geschrieben werden können.
  - Die Auskunft prüft die Person: keine gültige ID `400` `data.invalidPersonId`, unbekannte Person `404` `data.unknownPerson`. Module liefern über `person(id)`: Stammdaten (mit Führerscheinkontrollen, erneuten Vorlagen und Transpondern ohne Hash), Einsatzberichte, Dienste (Anwesenheiten), Atemschutz (Nachweise), Entschädigungen, Kostenersatz, Kleiderkammer (Ausgaben und Rücknahmen, gehaltene Stücke, Größen), Beförderungen (Ausschlüsse mit Grund, Einträge in Beförderungslisten), Geräte (von den Benutzern der Person gemeldete Mängel, von der Person durchgeführte Prüfungen), MP-Feuer (Zeilen der Laufberichte mit dem Namen der Person).
  - Im Vollexport des Core fehlen geheime Felder immer; Abschnitte nur für Verwalter (`smtp`, `oidc`, `retention`, `security`, `reminders`, `privacy.*`) und Felder nur für Verwalter (`managerFields`, z. B. `training.general.feedToken`) enthält er nur, wenn der Exportierende den Abschnitt verwaltet.
  - In der Auskunft zu einer Person stehen vom Core die mit ihr verknüpften Benutzer (Konto, Rollen, Sitzungen mit Beginn, Ende und ggf. Impersonation) und die Audit-Einträge, die diese Benutzer betreffen (als Handelnde, Impersonator oder in den Details); vom Modul Datenschutz Anfragen, Einwilligungen, Leseprotokoll, Einschränkung, Information und Kenntnisnahmen des Hinweises.
  - **Lesbare Auskunft (PDF):** `ExportSource.describePerson(personId, ctx)` liefert dieselben Daten lesbar als `PersonDataSection[]` (Felder, Tabellen, Texte; ohne IDs, andere Personen nur mit Funktion). Module, die im Manifest `privacy.personData` melden, müssen `describePerson` sowie `anonymize`, `erasure` und `erase` anbieten, sonst startet der Server nicht (Prüfung im Core). Die PDF-Auskunft selbst erstellt das Modul Datenschutz. Siehe [Datenschutz](datenschutz.md#auskunft-nach-art-15-als-pdf-l3).
- **Aufbewahrung** (`RetentionRegistry`, `RetentionService`, Einstellung `retention`): Aufbewahrungsplan mit Frist und Aktion je Datenkategorie, Vorlage „Kommunaler Aktenplan (Beispiel)“, täglichem Lauf und Liste „Aussonderung“ mit Anbietung an das Archiv, siehe [Aufbewahrungsplan](aufbewahrung.md). Ohne gewählte Fristen wird nichts gelöscht außer dem Audit-Log nach 2 Jahren; nicht übernommene Import-Uploads und Datenübernahmen werden nach 24 Stunden gelöscht (`core.imports`). Anonymisiert die Personalakte eine Person, ruft das Stammdatenmodul die `PersonDataRegistry` auf: Jedes Modul anonymisiert dort, was es über die Personen speichert (`anonymize(personIds)`), Übersicht im [Aufbewahrungsplan](aufbewahrung.md#personendaten-in-den-modulen-persondataregistry).

**Anhänge** (`attachments/attachments.ts`, Tabelle `core.attachment`): Fotos (PNG, JPEG, WebP) und PDF bis 10 MB an Datensätzen der Module, gespeichert in der Datenbank. Der Inhalt muss zum angegebenen Typ passen (Signatur der Datei), sonst `attachments.type`.
- Module melden je Art des Datensatzes an, wer Anhänge sehen und wer sie hinzufügen oder entfernen darf (`Attachments.register(ownerType, { read, write })`); unbekannte Arten werden abgelehnt. Löscht ein Modul einen Datensatz, entfernt es dessen Anhänge (`removeAll`).
- `GET /api/core/attachments?type&id` (Liste), `POST /api/core/attachments?type&id` (Datei `file`), `GET /api/core/attachments/:id/file` (inline, `nosniff`, Sandbox), `DELETE /api/core/attachments/:id`. Ohne Leserecht antwortet der Server mit `404`. Hinzufügen und Entfernen stehen im Audit-Log (`attachments.added`, `attachments.removed`).
- Arten: `training.session` (lesen wie der Dienst, ändern mit Planungs- oder Anwesenheitsrecht), `equipment.inspection` (lesen mit `equipment.read`, ändern mit `equipment.inspect`), `equipment.defect` (lesen mit `equipment.read` oder als Meldender, ändern mit `equipment.write` oder als Meldender, solange der Mangel gemeldet ist), `incidents.report` (lesen wie der Bericht, ändern solange der Benutzer den Bericht bearbeiten darf).

**Wappen und Briefkopf** (`settings/assets.ts`): `PUT /api/core/assets/logo|letterhead` (PNG, JPEG, WebP, SVG, bis 2 MB), öffentlich lesbar über `GET /api/core/assets/:key` (die Anmeldeseite zeigt das Wappen). Kopfzeile und Anmeldung nutzen das hochgeladene Wappen, sonst das neutrale f.orga-Symbol; f.orga bringt kein Wappen einer bestimmten Feuerwehr mit. Alle PDFs (Listen, Abrechnungen, Kostenbescheide, Urkunden) zeigen das Wappen; PNG, JPEG und SVG sind möglich, WebP nicht.

**PDF-Rahmen** (`lists/renderers.ts`): Listen und Briefe haben denselben Seitenkopf nach Stil.md (Wappen links, daneben der Name der Feuerwehr in der Dienstfarbe und der Titel, darunter eine Linie in `#8C1D18`; Briefe mit hinterlegtem Briefkopf zeigen stattdessen diesen) und dieselbe Fußzeile (Linie, Anschrift und Kontakt der Feuerwehr, Seite x/y, Erstellungszeit). Tabellen: Kopf weiß auf `#8C1D18` in Großbuchstaben mit Innenabstand (`pdfHeaderCell`), nur waagrechte Linien, Zebrastreifen (`PDF_TABLE_LAYOUT`). Die Spaltenbreiten der Listen ergeben sich aus dem Inhalt (`columnWidths`): jede Spalte bekommt mindestens ihr längstes Wort und die Überschrift, so dass nichts mitten im Wort umbricht; der Rest verteilt sich auf Spalten mit langen Texten. `POST /api/core/settings/smtp/test` schickt eine Test-E-Mail an den angemeldeten Benutzer.

**OpenAPI.** Unter `/api/docs` steht die Beschreibung aller Endpunkte (`@nestjs/swagger`), als JSON unter `/api/docs/openapi.json`, nur für angemeldete Benutzer und API-Tokens. Die Schemas der Request-Bodies stehen in den Zod-Verträgen der `*-contracts`-Pakete und sind dort noch nicht abgebildet.

### Seiten der Shell

| Pfad | Seite | Recht |
| --- | --- | --- |
| `/` | Startseite: Begrüßung, Einrichtungsliste (nur mit `core.settings.manage` oder `core.users.manage`, solange etwas fehlt), Kennzahlen und Karten der Module (`dashboard` mit `area` `kpi`, `main`, `side`), Fristen und Aufgaben gruppiert und nach Modul filterbar | angemeldet |
| `/profile` | Sprache, eigene E-Mail-Adresse (mit Passwort, Bestätigung per Link), wöchentliche E-Mail, Passwort ändern, Aufgaben ausblenden (Module und Arten), mit dem Konto der Gemeinde verknüpfen | angemeldet |
| `/terminal` | Kiosk-Seite des Infoterminals ohne Rahmen (siehe [Oberfläche Infoterminal](#oberfläche-infoterminal)); ist das Modul inaktiv, „abgeschaltet“ | ohne Anmeldung (Geräteschlüssel) |
| `/privacy-notice` | Kiosk-Seite des Moduls Datenschutz: Datenschutzhinweis mit Fassungen und PDF (siehe [Datenschutz](datenschutz.md#datenschutzhinweis-l4)); ist das Modul inaktiv, „abgeschaltet“. Nach der Anmeldung zeigt das Modul zuerst „Bevor Sie beginnen“ (Erweiterungspunkt `core.session.gate`), solange eine geltende Fassung nicht zur Kenntnis genommen ist | ohne Anmeldung |
| `/confirm-email` | neue E-Mail-Adresse mit dem Link aus der E-Mail bestätigen (Knopf, damit Linkprüfer von Mailservern den Link nicht verbrauchen) | ohne Anmeldung |
| `/scan` | Code suchen: Barcode, RFID-Chip, QR-Etikett oder Inventarnummer per Handscanner, Lesegerät, Kamera oder NFC | Lesen in einem Modul mit Code-Suche |
| `/lists` | Listen nach Modul, Parameter, Vorschau, Download als PDF, Excel, CSV | je Liste |
| `/import` | Import-Assistent: Datei, Inhalt (passendstes Profil vorgewählt), Spaltenzuordnung mit Beispielwerten, Prüfung (Probelauf) mit „Nicht zugeordnete Bezeichnungen“ (Eintrag wählen oder anlegen), Übernahme; Reiter „Gemerkte Zuordnungen“; Hinweise aktiver Module (Erweiterungspunkt `core.imports.notice`, z. B. MP-Feuer) | je Importprofil |
| `/admin/users` | Benutzer mit Filter, Bearbeiten daneben: Person verknüpfen, Sprache, Passwort setzen, Rollen je Bereich zuweisen, sperren; „Benutzer einladen“ und „Benutzer aus Personen anlegen“ (Einladung per E-Mail), Einladung erneut senden | `core.users.manage` |
| `/admin/roles` | Rollen mit Berechtigungen je Modul, „alle Rechte des Moduls“, kopieren, löschen, fehlende Standardrollen anlegen | `core.roles.manage` |
| `/admin/modules` | Installierte Module mit Version und Abhängigkeiten und den Knöpfen zu ihren Einstellungsseiten (nur die, deren Recht der Benutzer hat); mit `core.modules.manage` zusätzlich aktivieren und deaktivieren (danach lädt die Shell neu) und Plugins. Ohne dieses Recht zeigt die Seite nur die aktiven Module, deren Einstellungen der Benutzer ändern darf | `core.modules.manage` oder das Recht einer Einstellungsseite |
| `/admin/tokens` | API-Tokens erzeugen (einmal sichtbar, kopierbar), Ablauf, letzte Nutzung, widerrufen | `core.tokens.manage` |
| `/admin/settings` | Reiter (auch über `?tab=`) Feuerwehr (`brigade` mit Gemeinde, Einwohnerzahl, Adresse von f.orga; Wappen und Briefkopf), E-Mail (`smtp`, Test-E-Mail), Erinnerungen (`reminders`), Anmeldung (`oidc`, Warnungen, Verbindung testen), Sicherheit (`security`: HTTPS-Stand, System, Sitzungen, E-Mails, Hinweis zum zweiten Faktor), Aufbewahrung (`retention`: Fristen je Kategorie mit Vorlage „Kommunaler Aktenplan (Beispiel)“), Export (Vollexport je Modul einschließlich `core`, Link zu OpenAPI) | `core.settings.manage` |
| `/admin/retention` | Aussonderung: fällige, angebotene, entschiedene, zurückgestellte und erledigte Fälle; dem Archiv anbieten (Export als ZIP), Entscheidung des Archivs, zurückstellen, ausführen (siehe [Aufbewahrungsplan](aufbewahrung.md#aussonderung)) | `core.retention.manage` |
| `/privacy`, `/privacy/information`, `/privacy/register`, `/privacy/breaches`, `/privacy/requests/:id`, `/privacy/settings?tab=` | Seiten des Moduls Datenschutz (Menü „Verwaltung → Datenschutz“): Anfragen, Information nach Art. 13/14, Verzeichnis, Datenpannen, Anfrage, Einstellungen (Kontakte, Texte, Einwilligungen, Selbstauskunft); siehe [Datenschutz](datenschutz.md#recht-und-seite-datenschutz) | `privacy.manage` |
| `/admin/audit` | Audit-Log mit Filtern auf dem Server (Zeitraum, Benutzer, Aktion, Suche), übersetzten Aktionen des Core (Aktionen der Module mit ihrem Code), lesbaren Details; weitere Reiter der Module (Erweiterungspunkt `core.audit.tabs`, z. B. „Leseprotokoll“ des Moduls Datenschutz) | `core.audit.read` |

Personen und Abteilungen für die Benutzerverwaltung kommen aus der Stammdaten-API. Ist das Modul nicht aktiv, bleiben die Auswahlfelder leer.

### Oberfläche Einsatzberichte

`modules/incidents/incidents-web/src/`, nach den freigegebenen Mockups:

| Pfad | Seite |
| --- | --- |
| `/incidents/incidents` | Einsätze des Jahres mit Ansichten (alle, nur meine, offen, zur Prüfung, freigegeben, ohne Statistik; direkt aufrufbar mit `?view=…&year=…`), Suche und Abteilungsfilter (alle lesbaren Abteilungen). „+ Einsatz anlegen“ legt Einsatz und Berichtsentwürfe für die gewählten Einsatzabteilungen an (nur diese stehen zur Wahl), auf Wunsch auch die Berichte feuerwehrweiter Einheiten aktiver Module, deren Schreibrecht der Benutzer hat (z. B. „EvD-Bericht“; ein Einsatz kann auch nur aus diesem Bericht bestehen), und öffnet den ersten Bericht; passende vorhandene Einsätze (gleiche Leitstellennummer oder Stichwort ±2 h) werden angeboten und mit „Bericht … hinzufügen“ um den Bericht der eigenen Abteilung ergänzt. |
| `/incidents/incidents/:id` | Einsatzdaten (bearbeitbar mit Version), Karte je Bericht mit Status, Verfasser, Zeit, Personal und Betrag; „Bericht öffnen“ und „PDF“ nur für lesbare Berichte; Hauptbericht wechseln, Bericht für weitere Abteilung, „Alle Berichte freigeben“ für Freigeber, wenn mehrere Berichte zur Prüfung stehen; Karte „Statistik“ des ganzen Einsatzes (Felder wie unten beim Berichtseditor beschrieben: Vorschlag aus Stichwort und Einsatzort übernehmen, speichern erst mit allen Pflichtangaben, „Statistik entfernen“; nur lesen, wenn `statisticsEditable` fehlt; bei Stichworten ohne Statistik nur ein Hinweis); „Kosten und Bemerkungen“ des ganzen Einsatzes (kostenpflichtig, Begründung, Bemerkungen; bearbeiten mit `incidents.costs`, sonst nur lesen, auch nach der Freigabe) und daneben die Karten des Erweiterungspunkts `incidents.incident.sections` (Kostenersatz: Tatbestand; Einsatzleiter vom Dienst: EvD-Bericht). Berichte gesamtwehrweiter Einheiten (z. B. EvD-Bericht) stehen als eigene Karte mit dem Namen der Einheit statt einer Abteilung; Hauptbericht nur, solange der Einsatz keinen Abteilungsbericht hat. „Bericht für weitere Abteilung“ bietet nur Einsatzabteilungen an; Karte „Aufbewahrung“ mit „30 Jahre aufbewahren (Sonderfall)“ (Freigeber, `incidents.costs`, Schreiber des Hauptberichts) und dem Hinweis nach der Anonymisierung |
| `/incidents/reports/:id` | Berichtseditor (siehe unten) |
| `/incidents/review` | Berichte zur Prüfung und zur Entschädigung freigegebene Berichte (`?status=released-compensation`); Detail mit begründeten Warnungen und den Aktionen des Freigebers; fehlerfreie Berichte auswählen und gemeinsam freigeben (nicht freigegebene Berichte werden mit Grund als Warnung genannt). Vorprüfer sehen nur die Berichte zur Prüfung ihrer Abteilungen und geben zurück |
| `/incidents/open` | Offene Berichte (Entwürfe, zurückgegebene) nach Verfasser mit Hinweisen und offen seit; Kennzahlen (offen, zur Prüfung, ohne Hauptbericht, ohne Verfasser); Verfasser zuweisen oder ändern in jeder Zeile (`POST /incidents/reports/:id/author`, ohne zu sperren; angeboten werden nur Personen, die den Bericht schreiben können); „Verfasser erinnern“ per E-Mail (`POST /incidents/open-reports/remind`, Freigeber und Vorprüfer); Excel |
| `/incidents/compensation` | „Prüfung Entschädigung (Einsatzberichte)“: Zeitraum wählen, Prüfung (`GET /incidents/compensation/check`) mit Problemen je Art, Export erst ohne Probleme; bei aktivem Modul Entschädigungen ein Hinweis mit Link dorthin |
| `/incidents/statistics` | Jahresstatistik: Werte je Frage und Spalte (FF, JF, Alt.-A, Mus.-A) mit den Texten der Landesvorlage (`STATISTICS_QUESTIONS`), Filter nach Seite, Korrektur per Klick, Plausibilitätsprüfungen (Einsätze ohne Statistik verlinken die Ansicht „ohne Statistik“, nicht freigegebene Hauptberichte die Prüfung), Abschließen (mit offenen Prüfungen nach Rückfrage) mit Hinweis, wenn sich die Daten danach geändert haben, Wiederöffnen, Export der Landesvorlage |
| `/incidents/settings` | Einstellungen (unter „Verwaltung → Module → Einsatzberichte“): Entschädigung (Stundensätze mit Gültigkeit und Rundung, solange das Modul Entschädigungen nicht aktiv ist; ohne Satz „Vorlage übernehmen“ mit den Beispielwerten; Bereitschaft, zweistufige Freigabe, eigene Gemeinde), Stichwort-Katalog (anlegen, bearbeiten, BW-Vorlage), Prüfregeln (an/aus, Stufe), MP-Feuer (Parallelbetrieb: führendes System, Freigaben melden ab) |

**Berichtseditor** (`report/`): Abschnitte Zeiten & Ort, Personal & Fahrzeuge, Lage & Verlauf, Beteiligte & Sonstiges (mit Anhängen: Fotos, Alarmfax, Skizzen, und dem Hinweis, dass Kosten und Bemerkungen beim Einsatz stehen), Prüfen; jeder Abschnitt zeigt seinen Stand (vollständig, fehlt, Fehler, Warnungen).
- `useReportEditor` hält eine lokale Kopie des Inhalts und speichert 0,8 s nach der letzten Änderung (`PUT /incidents/reports/:id`), immer nur eine Anfrage gleichzeitig. Die Antwort aktualisiert Prüfergebnisse und Entschädigung. Vor dem Fertigmelden, beim Verlassen und beim Ausblenden der Seite (`visibilitychange`, `pagehide`) wird gespeichert; mit ungespeicherten Änderungen fragt der Browser vor dem Verlassen.
- Die gesendete Version ist die der letzten eigenen Speicherung, nie die eines Neuladens im Hintergrund (der Bericht wird beim Fokussieren des Fensters nicht neu geladen). Hat jemand anderes inzwischen gespeichert (`conflict.stale`), fragt ein Dialog: „Server-Stand laden“ oder „Meinen Stand übernehmen“.
- Eintragungen vom Infoterminal ändern die Version nicht. Entwürfe werden deshalb alle 30 Sekunden neu geladen; ist nichts ungespeichert, übernimmt der Editor neue oder geänderte Eintragungen und meldet „n neue Eintragungen vom Infoterminal“. Jede Speicherung schickt `bookingsKnownAt` mit, damit der Server unbekannte Eintragungen stehen lässt. Zeilen vom Terminal tragen die Plakette „Infoterminal“.
- Der Editor startet erst, wenn der Bericht frisch vom Server geladen ist (nicht aus einer älteren Kopie im Cache). Kommt später ein neuerer Stand (z. B. nach Rückgabe oder Entsperren) und ist nichts ungespeichert, übernimmt der Editor ihn.
- Ungespeicherte Inhalte liegen zusätzlich im Browser (`localStorage`, je Benutzer); beim nächsten Öffnen wird „Wiederherstellen“ angeboten. Wurde der Bericht seitdem anderswo gespeichert, führt „Wiederherstellen“ zum Konfliktdialog statt den neueren Stand zu überschreiben. Gepufferte Inhalte und Begründungen anderer Benutzer werden entfernt, sobald sich jemand anderes im Browser anmeldet. Fehlgeschlagene Speicherungen werden im Hintergrund wiederholt (5 s bis 60 s). Begründungen der Warnungen überstehen ein Neuladen bis zum Fertigmelden.
- Freigeber öffnen Entwürfe der Verfasser nur zum Lesen; „Bearbeiten (sperrt für Verfasser)“ schaltet nach einer Rückfrage frei. Eigene Entwürfe (Freigeber ist Verfasser) bearbeiten sie direkt.
- Berichte aus MP-Feuer tragen das Kennzeichen „aus MP-Feuer“. Führt MP-Feuer, sind sie schreibgeschützt (auch ohne Freigabe-Aktionen in `WorkflowActions`) mit dem Hinweis, sie in MP-Feuer zu ändern; Freigeber sehen „In f.orga weiterführen“ mit Rückfrage.
- Zeiten: Solange das Ende nicht bestätigt ist, bleibt der Abschnitt offen; „Ende bestätigen“ oder eine Änderung des Endes bestätigt es.
- Personalzeiten gleich den geerbten Zeiten (Fahrzeug, sonst Bericht) und Fahrzeugzeiten gleich den Berichtszeiten werden als `null` gespeichert und folgen so späteren Änderungen.
- Personal: Fahrzeug oder Bereitschaft und Funktion wählen, mehrere Personen (und einen Gast) auswählen und gemeinsam hinzufügen; ein neues Fahrzeug kommt dabei in den Bericht. „Besatzung vom letzten Einsatz übernehmen“ fügt die Besatzung des Fahrzeugs aus dem letzten Einsatz der Abteilung hinzu. Auf dem Telefon sind die Bedienelemente mindestens 44 px hoch. Karte je Fahrzeug mit Besetzung und Plätzen; „Zeiten“ auf der Karte öffnet den Dialog des Fahrzeugs mit Alarmiert (vorbelegt mit der Alarmierung des Berichts, nur bei Nachalarmierung zu ändern), Ausgerückt (vorbelegt mit dem Ausrücken, sonst der Alarmierung des Berichts), Eingerückt (vorbelegt mit Einsatzbereit) und gefahrenen Kilometern, „Zeiten des Berichts übernehmen“ setzt sie zurück; mit eigenen Zeiten zeigt die Karte „eigene Zeiten“ und die Zeit der Besatzung (Alarmiert bis Eingerückt). Dialog je Person mit Fahrzeug oder Bereitschaft, Funktion, Zeiten, Atemschutz, Verdienstausfall, Arbeitszeit, Schaden und berechneter Entschädigung; ohne „Eigene Zeiten“ nennt er die geerbten Zeiten („Wie das Fahrzeug“ bzw. „Wie der Bericht“), mit dem Schalter sind sie änderbar (vorbelegt mit den geerbten), ausgeschaltet gelten wieder die geerbten. „Bereitschaft“ (in der Zeile der Person als Symbol und im Dialog neben dem Fahrzeug) setzt die Person mit einem Klick auf Bereitschaft in der Wache der Abteilung; hat die Abteilung mehrere Wachen, fragt ein kleines Menü, ohne Wache ist die Aktion mit Hinweis gesperrt. Zurück auf ein Fahrzeug geht es über die Auswahl im Dialog.
- Die Statistik steht nicht im Bericht, sondern auf der Seite des Einsatzes (Karte „Statistik“, `pages/StatisticsPanel.tsx`): Vorschlag aus Stichwort und Einsatzort übernehmen; gespeichert wird erst, wenn alle Pflichtangaben gemacht sind. Die Art der Technischen Hilfe ist genau eine (Auswahl mit Hinweis auf den Vorrang). Fehlt sie, zeigt der Hauptbericht oben einen Hinweis und im Abschnitt „Prüfen“ den Befund `statistics-missing`, beide mit „Zum Einsatz“.
- Prüfen: Fehler mit Sprung zum Abschnitt, Warnungen mit Begründungsfeld. Gleiche Befunde zu einer Person werden zusammengefasst (`mergeFindings`).
- Fertig melden geht ohne offene Fehler und mit begründeten Warnungen; nach dem letzten Speichern werden die Hinweise erneut geprüft, und haben sie sich geändert, geht es zurück zum Abschnitt „Prüfen“. Danach ist der Bericht für den Verfasser schreibgeschützt, bis er zurückgegeben wird (Server: `incidents.notDraft`).
- Versionen (wiederherstellen) und Verlauf (Historie) als Dialog; die Aktionsleiste zeigt den Speicherstand und die Zahl der Fehler und Warnungen.
- `WorkflowActions` zeigt Freigebern je nach Status „Freigeben zur Entschädigungsauszahlung“ bzw. „zur Abrechnung“ (je nach Einstellung `compensationRelease`), „Zurück an Verfasser“ mit Pflichthinweis (auch für Vorprüfer der Abteilung, aber nicht bei gesperrten Berichten) und „Sperre aufheben“ mit Begründung und Zielstatus (gesperrte Entwürfe nur zurück an den Verfasser).
- „PDF“ in der Aktionsleiste öffnet den Bericht als PDF.
- Startseite: Kacheln „Berichte zur Prüfung“ (Freigeber und Vorprüfer, diese nur ihre Abteilungen), bei zweistufiger Freigabe „Berichte zur Abrechnung“ (Freigeber) und „Meine offenen Berichte“ (Verfasser), Karte „Letzte Einsätze“; Zähler an „Zur Prüfung“ im Menü (zur Prüfung und, bei zweistufiger Freigabe, zur Abrechnung); die zweistufige Freigabe gilt wie auf dem Server, solange sie nicht ausgeschaltet ist. Einsätze in der globalen Suche.
- Einsatzseite: „Einsatzdaten bearbeiten“ erscheint nur, solange der Server die Änderung zulässt (Schreiber: alle Berichte ungesperrte Entwürfe; Freigeber: kein Bericht freigegeben; nicht, solange MP-Feuer einen Bericht des Einsatzes führt, dann mit Hinweis). „Alle Berichte freigeben“ und „Hauptbericht“ lassen Berichte aus MP-Feuer aus.
- Berichte gesamtwehrweiter Einheiten: Die Oberfläche holt die Einheiten über `GET /api/incidents/units` und benennt den Bericht überall (Einsatzliste, Einsatzseite, Editor, Zur Prüfung, Offene Berichte, Befunde) mit dem Namen der Einheit; Lese-, Schreib- und Prüfrechte richten sich nach den Rechten der Einheit. Im Editor bietet die Personalauswahl alle aktiven Mitglieder der Gesamtwehr und alle Fahrzeuge an; Verfasser sind die Schreiber der Einheit.

### Oberfläche Einsatzleiter vom Dienst

`modules/duty-officer/duty-officer-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/duty-officer/roster` | EvD-Dienst (Recht `duty-officer.read`): Dienste des Einsatzleiters vom Dienst und weitere EvD-Dienste je Jahr; anlegen, bearbeiten, löschen mit `duty-officer.roster.manage`; Kalender-Import über den Import-Assistenten. Ohne Dienstarten ein Hinweis auf die Einstellungen |
| `/duty-officer/settings` | Einstellungen (unter „Verwaltung → Module → Einsatzleiter vom Dienst“, Recht `duty-officer.settings.manage`): „EvD-Bericht für jeden Einsatz anlegen“, Dienstarten mit Satz je Tag und „Vorlage übernehmen“ |

Karte „Einsatzleiter vom Dienst“ auf der Einsatzseite (Erweiterungspunkt `incidents.incident.sections`, sichtbar mit einem der Rechte `duty-officer.read`, `.reports.write`, `.reports.manage`): Stand des EvD-Berichts mit Link, wer laut Dienstplan Dienst hatte, Ausnahme mit Grund oder Hinweis „EvD-Bericht fehlt“; mit `duty-officer.reports.manage` „Kein EvD bei diesem Einsatz“ (mit Grund) und „EvD-Bericht anlegen“.

### Oberfläche Infoterminal

`modules/info-terminal/info-terminal-web/src/` nach den Mockups `infoterminal/`:

| Pfad | Seite |
| --- | --- |
| `/info-terminal/terminals` | Infoterminals (im Menü unter „Verwaltung“, Recht `info-terminal.read`): Terminals je Wache mit Abteilungen, erlaubten Aktionen, zuletzt gesehen und Status („seit n Tagen nicht gesehen“, widerrufen), Filter nach Abteilung, widerrufene einblendbar. Mit `info-terminal.manage` für alle Abteilungen des Terminals: anlegen (Abteilung der Wache vorbelegt und fest, Unterabteilungen zuerst angeboten), ändern, „Link anzeigen“ (Dialog mit QR-Code, kopieren, „Infoterminal öffnen“), „Neuer Link“ und „Widerrufen“ mit Rückfrage. `?stationId=` belegt die Wache vor |
| `/info-terminal/settings` | Einstellungen (Verwaltung → Module → Infoterminal, `info-terminal.settings.manage`): Nachlaufzeit, Dauer bei offenem Ende, höchstes Alter des Alarms bei „Neuer Einsatz“, Rückkehr zur Übersicht, Warnung „nicht gesehen“ |

Karte „Infoterminal“ je Wache in der Organisation der Stammdaten (`masterdata.station.sections`): Terminals der Wache mit Abteilungen und Status, „Öffnen“ (öffnet den Link in diesem Browser) und „Link anzeigen“ für Verwalter, „Infoterminals verwalten“.

**Kiosk-Seite** `/terminal` (`./Kiosk`, `src/kiosk/`), für Tablets mit großen Bedienflächen:
- Kopf mit Wappen, Wache, Uhr (Serverzeit) und Sprachumschalter, kein Menü und keine Suche. Außerhalb der Übersicht steht links ein großer, immer sichtbarer Knopf „Zurück zur Übersicht“.
- Der Schlüssel aus `#k=…` wird einmal gegen das Cookie getauscht und aus der Adresse entfernt. Unbekannter oder widerrufener Schlüssel: „nicht freigeschaltet“ mit Fehlercode; Modul inaktiv: „abgeschaltet“. Im Browser bleiben nur das Cookie und die gewählte Sprache.
- Abteilungsumschalter bei mehreren Abteilungen; vorgewählt ist die Abteilung der Wache. Nach `idleSeconds` ohne Eingabe und 10 Sekunden nach einer Bestätigung kehrt das Terminal zur Übersicht der Abteilung der Wache zurück.
- Übersicht: Kacheln der Einsätze (nur Einsatzabteilungen) und Dienste im Zeitfenster mit Ende des Fensters und Zahl der Eingetragenen, bald öffnende Dienste ausgegraut („Eintragen ab …“), fertig gemeldete Berichte mit Hinweis; „+ Neuer Einsatz“; leerer Zustand mit dem nächsten Dienst.
- „Wer sind Sie?“: Namenskacheln nach Nachnamen mit Sprungleiste, Eingetragene grün mit Fahrzeug und Funktion, in anderen Berichten des Einsatzes Stehende nicht wählbar (mit Abteilung); Namenssuche über alle Personen.
- Formular, Bestätigung, „Eingetragene ansehen“ je Fahrzeug mit Ändern und Austragen eigener Eintragungen; Eintragungen des Verfassers gesperrt. „Neuer Einsatz“ mit Trefferdialog. Dienste wie Einsätze, ohne Fahrzeug; Atemschutz nur in Einsatzabteilungen.
- „Führerschein kontrollieren“ (nur bei eingeschalteter Selbstkontrolle): Kachel in der Übersicht. Ein Lesegerät im Tastaturmodus darf auch direkt auf der Übersicht lesen (Eingabe außerhalb eines Feldes, die mit Enter endet). Auf Android-Tablets mit Chrome liest die Seite NFC über Web NFC, sonst Barcode und QR über die Kamera (`CodeCamera`). Danach Name, Klassen, letzte Kontrolle und die Selbsterklärung mit „Bestätigen“ und „Das bin ich nicht“; Bestätigung mit Haken und nächster Fälligkeit, nach 10 Sekunden zurück zur Übersicht. Unbekannter Code: „Dieser Führerschein ist nicht registriert. Bitte beim Kommandanten im Original vorzeigen.“

### Oberfläche Datensicherung

`modules/backup/backup-web/src/` nach den Mockups `sicherung/`, alle Seiten mit `backup.manage` (im Menü „Verwaltung → Datensicherung“), Reiter Übersicht, Sicherungen, Einstellungen:

| Pfad | Seite |
| --- | --- |
| `/backup` | Übersicht: Kacheln letzte Sicherung, nächste Sicherung, Zahl der Sicherungen, frei am Ziel; Warnungen (nicht eingerichtet, kein `FORGA_SECRET_KEY`, keine oder unlesbare Passphrase, unverschlüsselt, keine aktuelle Sicherung, letzte fehlgeschlagen, Ziel nicht beschreibbar, Werkzeuge fehlen oder zu alt) und der dauerhafte Hinweis zur Passphrase; Stand (Ziel, Zeitplan, Verschlüsselung mit Kennwert, Inhalt, Werkzeuge, Weg der Wiederherstellung, Benachrichtigung); letzte Ereignisse; vorige Datenbanken mit „Alte Datenbank löschen“; „Jetzt sichern“ mit „Danach prüfen“ (fragt die Passphrase, wenn keine lesbar gespeichert ist) |
| `/backup/backups` | Sicherungen mit Zeitpunkt, Auslöser, Größe, Status und Prüfung; „Prüfen“ (mit „Wiederherstellung testen“, Passphrase für fremde), „Wiederherstellen …“, Details mit Datei, Version, Kennwert, Herunterladen und Löschen; „Sicherung hochladen“ |
| `/backup/settings` | Auch als Knopf beim Modul unter „Verwaltung → Module“. Ziel mit „Ziel prüfen“, Zeitplan und Aufbewahrung, Verschlüsselung (neue Passphrase zweimal, Warnung und „Ich habe die Passphrase sicher aufbewahrt“; Ausschalten nur mit Bestätigung), Inhalt und Benachrichtigung; Seitenkarte „Nicht in der Sicherung“ |
| `/backup/restore/:id` | Assistent in vier Schritten: Sicherung, Prüfen (Passphrase erneut), Bestätigen (Zahlen jetzt und in der Sicherung, „Alle Änderungen seit … gehen verloren“, Name der Feuerwehr, „Benutzer informiert“, Ablauf), Wiederherstellen (Schritte live; das Token liegt in `sessionStorage`, die Seite übersteht so Neuladen und Neustart; nach 2 Minuten ohne Neustart der Hinweis auf `docker compose restart forga`) |

**Wartungsseite der Shell:** Antwortet der Server `503 maintenance`, meldet das der API-Client des Web-SDK (`reportMaintenance`), und die Shell zeigt statt der Anwendung „f.orga wird gerade wiederhergestellt“ (auf der Kiosk-Seite „Vorübergehend nicht verfügbar“); sie fragt alle 15 Sekunden nach und lädt neu, sobald der Server wieder antwortet. Der Assistent behält während der Wiederherstellung seine eigene Seite (`setMaintenanceHandledByPage`). Nach dem Neustart zeigt die Anmeldeseite einmal „Wiederhergestellt aus der Sicherung vom …“ (`setLoginNotice`).

### Oberfläche Dienste

`modules/training/training-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/training/sessions` | Dienste als Liste oder Monatskalender (Raster ab Montag; blättern je Monat) oder Wochenansicht (Montag bis Sonntag mit Zeiten, Kalenderwoche; blättern je Woche); ein Klick öffnet den Dienst, die Wahl der Ansicht merkt sich der Browser, Filter Abteilung, Kategorie (Übungsdienste, Sonderdienste, Sonstige) und Art; Sonderdienste und sonstige Dienste nennen ihre Kategorie vor der Art. „+ Dienst planen“ mit Termin, Inhalt und optional als Serie; „Plan übernehmen“ kopiert die Dienste eines Zeitraums (Vorgabe: Vorjahr, 52 Wochen später); „Dienstplan (PDF)“ für das Jahr des angezeigten Monats und die gewählte Abteilung. |
| `/training/sessions/:id` | Reiter Termin und Inhalt (bearbeiten), Anwesenheit, Anhänge (Fotos, Unterlagen), Historie. Aktionen Kopieren (öffnet „Dienst planen“ mit den Angaben eine Woche später), Löschen (geplant), Abschließen (durchgeführt), Wieder öffnen (abgeschlossen). Hinweis bei Überschneidungen. |
| `/training/check-in?code=…` | Ziel des QR-Codes (über `/api/training/check-in/start`, mit Ticket): „Ich bin da“ trägt die angemeldete Person ein |
| `/training/participation` | Dienstbeteiligung im Zeitraum je Person mit Abteilung und Quote |
| `/training/settings` | Einstellungen (unter „Verwaltung → Module → Dienste“): Arten von Diensten mit Kategorie, Entschädigung, Nachweis und Beteiligung (anlegen, bearbeiten, Vorlage BW), Zeitfenster des QR-Check-ins, Textbausteine, Kalender-Abo ein/aus mit Adressen je Abteilung |

- **Anwesenheit:** alle Mitglieder der Abteilungen des Dienstes als Liste mit Status je Person (–, anwesend, entschuldigt, unentschuldigt), Atemschutz, verletzt, bei Belastungsübungen kJ und bestanden. Suche nach Namen; „Übrige anwesend“ und „Übrige unentschuldigt“ füllen die offenen Zeilen. Auf dem Handy sind Status und Häkchen größer und der Status füllt die Breite. Solange der Dienst offen ist, steht darüber der wechselnde QR-Code für den Check-in mit der Zahl der Eingetragenen; währenddessen wird der Dienst alle 10 Sekunden neu geladen: ohne eigene Änderungen wird die Liste übernommen, sonst kommen nur neue Check-ins hinzu (als anwesend). Per QR oder am Infoterminal eingetragene, noch unbestätigte Personen sind markiert („per QR, nicht bestätigt“ bzw. „am Infoterminal, nicht bestätigt“) mit „Check-in verwerfen“ (nach Rückfrage), ein Hinweis nennt ihre Zahl. Ungespeicherte Änderungen: Wechsel auf eine andere Seite fragt nach, Schließen des Browsers warnt.
- **Startseite:** Kachel „Dienste abzuschließen“ (`training.close`), Karte „Nächste Dienste“ (30 Tage).
- **Personalakte:** Reiter „Dienste“ (Erweiterungspunkt `masterdata.person.tab`) mit den Diensten der Person im Jahr.

### Oberfläche Atemschutz

`modules/respiratory-protection/respiratory-protection-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/respiratory-protection/overview` | Kacheln grün/gelb/rot (Klick filtert), Tabelle der Geräteträger mit Ampel, fehlenden Bedingungen und nächster Fälligkeit; Zeile öffnet die Personalakte im Reiter „Atemschutz“ (`?tab=respiratory-protection`); Liste als PDF |
| `/respiratory-protection/quick-entry` | Schnellerfassung: Art, Datum, Übungsanlage, Namenssuche und „Alle auswählen“ (die gefundenen); Geräteträger auswählen, je Person kJ (mit Mindestarbeit der Person), bestanden und Minuten. Unter der Mindestarbeit ist „bestanden“ gesperrt und ein Hinweis nennt die Zahl der Personen |
| `/respiratory-protection/settings` | Tauglichkeitsregel (unter „Verwaltung → Module → Atemschutz“), „Standard FwDV 7“ setzt sie zurück |

- **Personalakte:** Reiter „Atemschutz“ (Erweiterungspunkt `masterdata.person.tab`) mit Ampel und Bedingungen (bei „Bedenken“ mit Hinweis), Atemschutznachweis als PDF, Nachweisen (Herkunft mit Link auf Einsatzbericht bzw. Dienst, Bearbeiten und Löschen erfasster Nachweise) und „+ Nachweis eintragen“ (Untersuchung mit Ergebnis; Belastungsübung mit Mindestarbeit der Person, darunter kein „bestanden“). Untersuchungen sieht und erfasst nur, wer `examinations` hat.
- **Startseite:** Kachel „Geräteträger nicht einsatzbereit“ mit der Zahl der gelben als Hinweis.
- `KpiTile` aus `web-ui` kann statt eines Links als Schalter (`onClick`, `selected`) dienen.

### Oberfläche Entschädigungen

`modules/compensation/compensation-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/compensation/runs` | Auszahlungsläufe mit Zeitraum, Posten, Summe und Status; „+ Neuer Lauf“ (Vorgabe Vormonat); „Vorhandene Daten übernehmen“ für Berechtigte der anderen Module |
| `/compensation/runs/:id` | Lauf: Reiter Personen, Abteilungen, Posten (Suche, Filter Person, Art, „Nur ohne Betrag“, Seiten zu 50 Posten; Betrag per Klick eintragen), „Beträge eintragen“ (Verdienstausfall und Posten ohne Betrag als Liste, gemeinsam speichern, Auswahl „In nächsten Lauf verschieben“), Hinweise (Klick öffnet den Posten bzw. die gefilterte Postenliste; „Betrag fehlt“ direkt verschieben), Verschoben (zurückholen); Excel, Abrechnungen (PDF), Überweisungs- und SEPA-Datei (nur abgeschlossen, mit `factualApproval` erst nach der Zeichnung); Abschließen (bei fehlender IBAN mit Bestätigung und Namensliste), Liste „Auszahlung auf anderem Weg“ mit „Als ausgezahlt markieren“, „Sachlich richtig zeichnen“, übergeben, ausgezahlt, Entwurf löschen. Mit `compensation.runs.read` nur lesend |
| `/compensation/items` | offene Posten; „+ Posten von Hand“ mit Begründung |
| `/compensation/functions` | Funktionsinhaber, „Pauschalen erzeugen“ je Jahr mit Hinweis auf überschrittene Höchstzahlen, Jahressummen mit Steuerhinweis |
| `/compensation/settings` | Einstellungen (unter „Verwaltung → Module → Entschädigungen“): „Vorlage übernehmen“ (mit Bestätigung) und Hinweis „Satzung noch nicht gepflegt“, Sätze für Dienste und Einsätze, Satzung (mit den Status, deren Dienste entschädigt werden), Lehrgangspauschalen, **Vorschau** (Einsatz eines Zeitraums wählen, „Berechnen“ zeigt je Bericht und Person Stunden, Satz, Betrag des Berichts, Auszahlung und Hinweise mit den noch nicht gespeicherten Einstellungen), Funktionspauschalen, Auszahlung |

- **Personalakte:** Reiter „Entschädigung“ mit den Posten eines Jahres und der Summe.
- **Startseite:** Kachel „Offene Entschädigungen“ mit Summe; rot, solange Verdienstausfälle ohne Betrag sind.

### Oberfläche Geräte

`modules/equipment/equipment-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/equipment/items` | Geräte mit Suche und Filtern (Kategorie, Abteilung, Status, fällig), nächste Prüfung mit Ampel, offene Mängel; „+ Gerät“ |
| `/equipment/items/:id` | Geräteakte: Stammdaten mit QR-Code und „Etikett drucken“, Prüfungen (Fälligkeiten mit Intervall, „Prüfen“, „Fällig setzen“, Historie mit „Prüfung korrigieren“ und „Prüfung stornieren“ mit Grund), Mängel, Einsätze (Klick öffnet den Bericht), Historie; „Protokoll“ je Prüfung als PDF; „Anhänge“ je Prüfung (z. B. Protokoll des Prüfstands) und je Mangel (Fotos); beim Melden eines Mangels optional ein Foto; Mangel melden, Status ändern, aussondern. `?tab=` öffnet einen Reiter (`data`, `inspections`, `defects`, `incidents`, `history`), `?report=defect` den Dialog „Mangel melden“. Hinweise bei gesperrten Geräten und „in Prüfung“ nach behobenem Mangel. Wer nur Mängel melden darf, sieht nur Bezeichnung, Nummer und „Mangel melden“. |
| `/equipment/inspections` | fällige Prüfungen (bis „bald fällig“); mit gewählter Prüfart (alle Prüfarten der sichtbaren Geräte) Sammelprüfung mit Datum, Prüfer (vorbelegt mit der eigenen Person), Firma und Ergebnis. Hinzufügen jedes Geräts mit dieser Prüfart, auch nicht fälliger, über Suche oder Scan („Per Scan auswählen“: Kamera, RFID/NFC wo der Browser es kann, oder Eingabe von Code, Inventarnummer, Barcode oder RFID-Chip, z. B. mit einem Handscanner; Treffer mit Vibration und Ton). Bei Prüfarten „nach …“ setzt der Schalter „Beim Scannen fällig setzen“ jedes gescannte Gerät fällig (z. B. gewaschene Schläuche). „Tagesprotokoll (PDF)“ aller Prüfungen von heute (gewählte Abteilung) |
| `/equipment/defects` | Mängel mit Bearbeitung („Behoben“ nur mit Erledigung) |
| `/equipment/labels` | QR-Etiketten zum Drucken: nach Abteilung und Kategorie, „Nur Geräte ohne Etikett“ oder einzelne Geräte (`?ids=`), „Als gedruckt markieren“. Die Etiketten verweisen auf die Adresse aus den Einstellungen der Feuerwehr (`publicUrl`); ohne sie auf die Adresse der Seite, mit Warnhinweis |
| `/equipment/settings` | Gerätetypen mit Prüfarten, Kategorien als Baum (eingerückt unter der übergeordneten, „+ Unterkategorie“ je Zeile; Kennzeichen Atemschutz und „Bei überfälliger Prüfung sperren“), Fristen (Vorläufe, „bald fällig“), Vorlage DGUV 305-002 (Dialog: Schläuche als Einzelstücke oder Bestand), Fahrzeuge übernehmen (unter „Verwaltung → Module → Geräte“) |
| `/equipment/items` (Dialog „+ Gerät“) | je Prüfart eigenes Intervall und beim Anlegen letzte Prüfung mit nächster Fälligkeit |

- **Startseite:** Kachel „Prüfungen fällig“ (`equipment.read`) mit der Zahl defekter und gesperrter Geräte.
- **Navigation:** „Prüfungen“ sehen alle mit `equipment.read`; erfassen kann, wer `equipment.inspect` bzw. für Atemschutz `equipment.breathing.inspect` hat.
- **Scannen** (`CodeScanner.tsx` in `web-ui`): Ohne Barcode-Erkennung des Browsers (Safari auf iOS, Firefox) liest ZXing (`@zxing/browser`, erst beim Öffnen der Kamera geladen) das Kamerabild; `signalScan` vibriert und piept bei einem Treffer.

### Oberfläche Kostenersatz

`modules/cost-recovery/cost-recovery-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/cost-recovery/candidates` | kostenpflichtige Einsätze im Zeitraum (Link zum Einsatz) mit vorgeschlagenem Tatbestand, Freigabe zur Abrechnung und Bescheid; „Bescheid erstellen“ (nur der angeklickte Knopf lädt; gesperrt mit Hinweis auf die fehlenden Einstellungen) |
| `/cost-recovery/notices` | Bescheide mit Suche (Aktenzeichen, Schuldner, Einsatz-Nr.), Jahr, Status, „Nur überfällige“ und „Nur mit Erstattung“; Spalten Betrag, offen (überzahlt rot), fällig, Status mit „überfällig“ und „Erstattung offen“; Auswahl je Zeile und „Alle angezeigten auswählen“ (die Auswahl gilt nur für angezeigte Bescheide); „Sollstellung exportieren (Excel bzw. CSV nach Einstellung)“ und „Exportieren und als übergeben markieren“ (mit Bestätigung) für die ausgewählten Bescheide (`ids`), ohne Auswahl gesperrt; übergeben werden davon die gültigen, noch nicht übergebenen und die nicht gemeldeten Aufhebungen |
| `/cost-recovery/notices/:id` | Bescheid: „Einsatz anzeigen“ öffnet den Einsatz in einer Seitenleiste ohne Abdunkelung, damit der Bescheid daneben bearbeitbar bleibt (Einsatzdaten, Kosten und Bemerkungen, je Bericht Zeiten, Einsatzleiter, Lage, Maßnahmen, Ursache, Fahrzeuge mit den berechneten Zeiten und Besatzung, Personal, Beteiligte; „Einsatz öffnen“ in neuem Tab; `GET /api/cost-recovery/notices/:id/incident`, `cost-recovery.read`); Tatbestand, Kassenzeichen, Kostenschuldner (auch aus dem Adressbuch), Verweis auf geänderten bzw. ersetzenden Bescheid, „Änderungsbescheid erstellen“ (unter „Weitere“), Positionen mit Begründung bei Abweichung und „als MTW“ (hinzufügen: Pauschalen der Satzung mit Fundstelle, Material, Kosten Dritter, andere Feuerwehren, Sonstiges), Textbausteine; Hinweise vor dem Erlass, wenn der Einsatz nicht mehr kostenpflichtig oder noch nicht zur Abrechnung freigegeben ist, wer den Bescheid zur Prüfung gegeben bzw. in der Prüfung geändert hat, wann er überfällig ist und was zu erstatten ist; „Ungespeicherte Änderungen“ in der Aktionsleiste, Warnung beim Verlassen der Seite, und jeder Schritt (Zur Prüfung, Erlassen, Neu berechnen …) speichert ungespeicherte Änderungen vorher; Zahlungen mit Stornieren und offenem bzw. überzahltem Betrag; Vorschau bzw. PDF, Neu berechnen, Zur Prüfung, Erlassen (mit Vier-Augen-Prinzip für den Einreichenden und die in der Prüfung ändernde Person gesperrt), Übergeben (gültige, noch nicht übergebene Bescheide), „Erstattung erfassen“ (`cost-recovery.refund`), „Neu berechnen“ mit Liste der Positionen mit Abweichung, unter „Weitere“ Zahlung erfassen, Zahlungserinnerung (bei Überfälligkeit, öffnet das PDF), Widerspruch, Änderungsbescheid; „Löschen …“ für Entwürfe (zurück zur Liste), „Verwerfen …“ für Bescheide in Prüfung, „Aufheben …“ für erlassene Bescheide |
| `/cost-recovery/debtors` | Adressbuch |
| `/cost-recovery/settings` | „Vorlage Baden-Württemberg übernehmen“ (mit Bestätigung, wirksam mit Speichern) und Hinweis auf fehlende Pflichtangaben; Sätze, Takt, Gäste, Material, Pauschalen der Satzung (Bezeichnung, Betrag, Fundstelle; leer bis aus der Satzung eingetragen), Tatbestände, Behörde, Rechtsgrundlage, Landesverordnung, Sollstellung (Format, Spalten), Kassenzeichen verpflichtend, Vier-Augen-Prinzip, Textbausteine und Zahlungserinnerung (unter „Verwaltung → Module → Kostenersatz“) |

- **Startseite:** Kachel „Kostenpflichtig ohne Bescheid“.

### Oberfläche Beförderungen

`modules/promotions/promotions-web/src/`:

| Pfad | Seite |
| --- | --- |
| `/promotions/lists` | Reiter „Listen“ (Stichtag, wirksam ab, Zahl der Beförderungen, Status; „Neue Liste“) und „Vorschau“ (Stichtag wählbar, erfüllt und demnächst oder alle, was fehlt; Klick zeigt die Regel Schritt für Schritt; Drucken) |
| `/promotions/lists/:id` | Liste: Vorschläge mit Dienstgrad, Ziel, Stand und Entscheidung; Entscheiden je Eintrag, außerhalb der Regel, Ausgeschlossene ausgegraut darunter (Entwurf), Neu prüfen, Beschließen, Wieder öffnen, Durchführen, Urkunden (gesamt und je Person), Löschen; „Drucken“ (für alle mit Leserecht) mit der Beförderungsliste gesamt als PDF oder Excel und je Abteilung als PDF |
| `/promotions/exclusions` | Ausschlüsse mit Zeitraum, Geltung (alle Beförderungen oder ein Dienstgrad) und Grund |
| `/promotions/rules` | Regeln als Tabelle mit lesbarem Text, Editor für Schlüssel, Ziel, Beschreibung und Bedingung (grafisch als Baum aus „Alle der folgenden“/„Eine der folgenden“ mit Bausteinen beliebiger Tiefe, oder als JSON mit lesbarer Vorschau) und „Diese Person prüfen“ (die noch nicht gespeicherte Regel mit Bedingungsbaum und Stand einer Person, `POST /api/promotions/rules/test`), Vorlage VwV 2022, Vorschau und Urkundentexte (unter „Verwaltung → Module → Beförderungen“) |

- **Personenakte:** Reiter „Dienstgrad“ mit aktuellem Dienstgrad, nächster Beförderung als Bedingungsbaum (erfüllt, erfüllt ab, fehlt) und den Listen der Person.
- **Startseite:** Kachel „Beförderungen möglich“ mit der Zahl der demnächst erfüllten.

### Oberfläche Stammdaten

`modules/masterdata/masterdata-web/src/organization/`, Seite `/masterdata/organization` nach dem Mockup „Organisation“:

- Links der Abteilungsbaum (Unterabteilungen über `parentId`) mit Typ und Zahl der Mitglieder, rechts die gewählte Abteilung mit Typ, Kurzname, Leitung, Stellvertretern, Einwohnern im Ortsteil, Statistik, Sonderaufgaben und Kennzahlen.
- Mit `masterdata.organization.manage`: Abteilung bearbeiten (für die Gesamtwehr auch anlegen, Unterabteilung anlegen und löschen), Wache und Fahrzeug anlegen, bearbeiten und löschen (Zeile anklicken). Ein Fahrzeug wechselt die Abteilung über das Feld „Abteilung“.
- Löschen geht nur, solange nichts mehr darauf verweist. Andere Module melden ihre Verweise über `ORGANIZATION_REFERENCES` (Einsatzberichte: Berichte, Fahrzeuge und Bereitschaft im Personal; der Core: Rollenzuweisungen). Sonst nennt die Meldung den Grund; genutzte Fahrzeuge werden ausgesondert.
- Unter den Wachen der Abteilung zeigt der Erweiterungspunkt `masterdata.station.sections` (Props `{ station }`) Karten anderer Module je Wache, z. B. die Infoterminals der Wache.
- Gruppen der Abteilung mit Gruppenführer und Mitgliedern; mit `masterdata.organization.manage` anlegen, bearbeiten und löschen.
- Mitglieder: Liste der Personen mit Stamm- oder zusätzlicher Mitgliedschaft. Mit `masterdata.persons.write` lässt sich eine Person zusätzlich aufnehmen (z. B. die Einsatzleiter vom Dienst in einer Führungseinheit „Gesamtfeuerwehr“) und eine zusätzliche Mitgliedschaft beenden (Ende gestern; am selben Tag begonnene werden entfernt). Gespeichert wird über `PUT /masterdata/persons/:id/memberships`.
- Wer nur Rechte für einzelne Abteilungen hat, sieht in der Personensuche eines Berichts nur deren Mitglieder; zusätzliche Mitgliedschaften zählen dabei mit.

Weitere Seiten der Stammdaten:

| Pfad | Seite |
| --- | --- |
| `/masterdata/persons` | Personen mit Suche und Filtern nach Status (Mehrfachauswahl als Chips, Standard aktiv), Abteilung, Qualifikation, Dienstgrad und Gruppe (je Mehrfachauswahl, eine passende genügt). Die Abteilungen sind anfangs die eigenen: die der verknüpften Person, sonst die mit `masterdata.persons.read`. Gruppenführer haben den Knopf „Meine Gruppe“. `?q=` (z. B. aus der globalen Suche) sucht in allen Abteilungen und Status außer ausgeschieden |
| `/masterdata/persons/new` | Person anlegen mit Stammabteilung, Aufnahmedatum, Status und Probezeitende (Abweichung mit Begründung). Hinweis auf gleichnamige Personen, auch ausgeschiedene. |
| `/masterdata/persons/:id` | Personalakte: Kopf mit Dienstgrad, Abteilungen, Status und Qualifikationen; Reiter Stammdaten (sensible Felder nur mit Recht), Feuerwehr (Ruhezeiten, Probezeit ändern, endgültig aufnehmen, Übernahme in Einsatzabteilung bzw. Altersabteilung, Status ändern, Austritt, Abteilungen, Beförderungen, Führerschein), Lehrgänge (Teilnahmen, beim Sammellehrgang mit Beschreibung „Anderer Lehrgang: …“; Vormerkungen), Qualifikationen, Ehrungen, Ämter (mit Abteilung und Zeitraum, beenden über „bis“), Reiter anderer Module, Historie. Stammdaten werden gesammelt mit „Speichern“ übernommen, alles andere sofort. Lehrgänge pflegt auch, wer nur `masterdata.courses.plan` hat. **Direktlink auf einen Reiter:** `/masterdata/persons/:id?tab=<reiter>` mit `master`, `brigade`, `courses`, `qualifications`, `honors`, `offices`, `history` oder der Modul-ID eines Erweiterungsreiters (`masterdata.person.tab`), z. B. `?tab=respiratory-protection`, `?tab=clothing`, `?tab=incidents`; unbekannte Werte öffnen die Stammdaten. Der gewählte Reiter steht in der Adresse. |
| `/masterdata/persons/:id/driver-license` | Führerschein einer Person (Mockup `stammdaten/person-fuehrerschein.html`, aus dem Reiter „Feuerwehr“ über „Führerschein und Kontrollen“): Klassen nach Befristung mit Stand, Ersterfassung, letzte und nächste Kontrolle mit Modus, Dokument gültig bis, Kontrollen mit Art, Prüfer und Klassen (Storno mit Grund); Karten „Transponder“ (registrieren, ersetzen, sperren mit Grund) und „Erneute Vorlage“ (mit Grund, zurücknehmen). Dialog „Kontrolle erfassen“: Datum, Prüfer (eigene Person vorbelegt), „Original vorgelegt“, Klassen wie auf dem Original mit „gültig bis“ je Klasse (Änderungen gegenüber der Akte markiert), Dokument gültig bis, Bemerkung, Transponder gleich mit registrieren (Kennung über Lesegerät, Kamera oder Web NFC, `CodeInput`), Hinweis „keine Kopie, kein Foto“ |
| `/masterdata/driver-licenses` | Führerscheinkontrollen (Menü Stammdaten, `masterdata.licenses.check`): Personen der Zielgruppe mit Klassen, nächster Befristung („Befristung prüfen“ bei Altdaten), letzter Kontrolle, Transponder und Stand; Chips Alle, Überfällig, Fällig im Vorlauf, Ersterfassung fehlt, Vorlage angefordert; Filter Name, Abteilung, Art der letzten Kontrolle; je Zeile „Vorlage …“ und „Kontrolle …“; Knöpfe zu den Listen (Nachweis für die Gemeinde) und zu den Einstellungen |
| `/masterdata/driver-licenses/settings` | Einstellungen der Führerscheinkontrolle (Verwaltung → Module → Stammdaten, `masterdata.settings.manage`): Modus, Abstand, Vorlauf, Zielgruppe, Selbstkontrolle mit Grenzen, „Was entsteht“ |
| `/masterdata/vehicles` | Alle Fahrzeuge, bearbeiten über den Fahrzeugdialog |
| `/masterdata/courses` | Lehrgangsplanung, Reiter „Lehrgänge“: Lehrgänge mit Zahl der Vormerkungen und Anmeldungen; je Lehrgang die Bedingungen (Namen statt Schlüssel), Termine (anlegen, ändern, löschen, „Teilnahme erfassen“ mit Ergebnis je Person, beim Sammellehrgang mit Beschreibung), Vorgemerkte mit Abteilung, Wunschzeitraum, Bedingungen und direkt änderbarer Priorität, Termin, Status und Bemerkung (Löschen mit Rückfrage), Kandidaten als Tabelle mit Abteilungsfilter, Sortierung und Mehrfachauswahl, gemeinsam vormerken. Reiter „Lehrgangsbedarf“: Lehrgang × Abteilung mit Haben, Soll, Vorgemerkt und Fehlen |
| `/masterdata/catalogs` | Kataloge (im Menü unter „Verwaltung“, sie gelten für die ganze Anwendung) (Funktionen, Qualifikationen, Fahrzeugtypen, Ehrungen, Austrittsgründe, Dienstgrade, Ämter) und Lehrgänge (mit Bedingungen, Soll je Abteilung und „Beschreibung erforderlich“) pflegen, BW-Vorlage ergänzen; unbenutzte Einträge löschen (mit Bestätigung; bei Verwendung nennt der Dialog die Module mit Anzahl und bietet „Stattdessen deaktivieren“) |

**Erweiterungspunkte:** Ein Modul-Frontend kann über `extensions` in `defineWebModule` Inhalte in andere Module einhängen (`Extension` mit `label`, `permission`, `component`). Die Shell registriert sie beim Laden (`registerExtensions`), das Zielmodul fragt sie mit `extensionsOf(punkt)` ab. Vorhanden: `masterdata.person.tab` (Reiter der Personalakte, Props `{ personId }`); die Einsatzberichte liefern damit den Reiter „Einsätze“ (`GET /api/incidents/persons/:personId/assignments?year=`); `incidents.report.sections` (Karten im Bericht, Props `{ reportId, incidentId, departmentId, vehicleIds, breathingVehicleIds, disabled }`); `incidents.incident.sections` (Karten beim Einsatz neben „Kosten und Bemerkungen“, Props `{ incidentId, chargeable, disabled }`; der Kostenersatz zeigt dort den Tatbestand); `training.session.sections` (Reiter eines Dienstes, Props `{ sessionId, departmentIds, disabled }`); `core.me.sections` (Abschnitte in Mein Bereich, Props `{ personId }`); `core.me.top` (über den Abschnitten in Mein Bereich, z. B. die bereitgestellte Auskunft); `core.me.section-actions` (unter jedem Abschnitt in Mein Bereich, Props `{ area }` mit der ID des Moduls, z. B. „Berichtigung beantragen …“); `core.session.gate` (umschließt die Anwendung nach der Anmeldung, Props `{ session, children }`; zeigt statt `children` eine eigene Seite, z. B. den Hinweis bei der ersten Anmeldung); `core.audit.tabs` (Reiter der Audit-Seite); `masterdata.person.actions` (Knöpfe in der Kopfzeile der Personalakte, Props `{ personId }`); `masterdata.station.sections` (Karten je Wache in der Organisation, Props `{ station }`); `incidents.settings.rates` (ersetzt in den Einstellungen der Einsatzberichte Stundensätze und Rundung, wenn ein Modul sie führt).

### Mein Bereich (Self-Service)

Die Shell zeigt unter `/me` („Mein Bereich“, in der Seitenleiste unter „Übersicht“, wenn der Benutzer mit einer Person verknüpft ist) die Beiträge der Module zum Erweiterungspunkt `core.me.sections` (Reihenfolge über `order`), jeweils mit der `personId` des Benutzers. Die Endpunkte arbeiten immer mit der verknüpften Person des Benutzers, nie mit einer übergebenen ID; Rechte `*.self` (Bereich Abteilung, jede Zuweisung genügt) aus der Rollenvorlage `member` und den anderen Standardrollen.

| Modul | Abschnitt | Schnittstelle |
| --- | --- | --- |
| Stammdaten | Meine Personalakte (Abteilung, Dienstgrad, Eintritt, Qualifikationen, Ehrungen), „Mein Führerschein“ (Klassen, Befristungen, letzte und nächste Kontrolle, Stand; nur mit Klassen oder in der Zielgruppe, ohne Selbstkontrolle) und Kontakt mit Bankverbindung zum Ändern; interne Bemerkungen bleiben verborgen, Änderungen stehen in der Historie | `GET`, `PUT /api/masterdata/me`, `GET /api/masterdata/me/driver-license` (`masterdata.self`) |
| Dienste | nächste Dienste der eigenen Abteilungen (8 Wochen) mit Entschuldigen (Grund als Auswahl: beruflich, privat, krank, Urlaub, sonstiges; Bemerkung freiwillig mit Hinweis „Keine Gesundheitsangaben eintragen.“), Grund ändern, Zurücknehmen; letzte Dienste (90 Tage) mit eigenem Stand; Beteiligung im Jahr. Den Grund sehen die Leser des Dienstes, die Bemerkung nur der Gruppenführer (`training.attendance`) in der Anwesenheit; als anwesend Eingetragene können sich nicht entschuldigen | `GET /api/training/me`, `PUT` (`{ reason, note }`), `DELETE …/me/sessions/:id/excuse` (`training.self`); Felder `excuseReason` und `note` an der Anwesenheit |
| Entschädigungen | Meine Entschädigung: Posten eines Jahres mit Status offen, abgerechnet bzw. ausgezahlt und den Summen | `GET /api/compensation/me?year` (`compensation.self`) |
| Atemschutz | eigene Tauglichkeit mit Bedingungen und die letzten Nachweise (auch Untersuchungen, eigene Daten); nur für Geräteträger | `GET /api/respiratory-protection/me` (`respiratory-protection.self`) |
| Einsatzberichte | Meine Einsätze des Jahres mit Stunden, Abteilung und Status | `GET /api/incidents/me?year` (`incidents.self`) |
| Geräte | Mangel melden über Inventarnummer oder Bezeichnung (Geräte der Abteilungen mit `equipment.defects.report`), eigene Meldungen mit Stand | `GET /api/equipment/me/items?q`, `GET /api/equipment/me/defects`; Mängel merken sich den meldenden Benutzer (`reported_by_user_id`) |
| Kleiderkammer | Meine Schutzausrüstung: zugeordnete Stücke mit Fristen, Verlauf der Ausgaben, eigene Größen; die Code-Suche findet die eigenen Stücke und führt hierher | `GET /api/clothing/me` (`clothing.self`) |
| Datenschutz | Abschnitt „Datenschutz“ mit Meine Einwilligungen, Auskunft anfordern, Meine Anfragen, Datenschutzhinweis und Ansprechpartnern; darüber die bereitgestellte Auskunft (`core.me.top`), unter jedem Abschnitt „Berichtigung beantragen …“ (`core.me.section-actions`) | `GET /api/privacy/me`, `/api/privacy/me/consents`, `/api/privacy/me/access-reports`, `POST /api/privacy/me/requests`, `/api/privacy/me/rectifications` (angemeldet, verknüpfte Person) |

Der Core zeigt in Mein Bereich zusätzlich „Anmeldungen als Sie“ (`GET /api/core/me/impersonations`), auch ohne Modul Datenschutz.

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
| `HistoryTimeline` | Änderungsverlauf eines Datensatzes aus `GET /api/core/history`; mit wirksamem `privacy.manage` „Unkenntlich machen …“ an jedem Wert (`POST /api/privacy/history/:id/redact`, Modul Datenschutz) |
| `Attachments` | Anhänge eines Datensatzes (`type`, `id`): Vorschaubild bzw. PDF-Symbol mit Link, mit `editable` Hinzufügen und Entfernen |
| `UnmatchedValues` | „Nicht zugeordnete Bezeichnungen“ eines Imports: Eintrag oder Zusatzziel wählen, anlegen oder ignorieren, optional Filter nach Art (Tabellen-Import, Modul MP-Feuer); dazu `mergeUnmatched`, `setMapping`, `slugKey` |
| `RememberedMappings` | Liste gemerkter Zuordnungen (`path` der API) mit Suche, Filter nach Art, Zustand des Ziels und „Löschen …“ |
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
