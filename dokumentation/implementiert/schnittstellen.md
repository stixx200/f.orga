# HTTP-Schnittstellen (umgesetzter Stand)

Alle Pfade liegen unter `/api`.

**Anmeldung.** Sofern nicht als „offen“ markiert, braucht jeder Endpunkt eine Anmeldung:
- per Sitzungs-Cookie `forga_session`, bei ändernden Methoden zusätzlich mit dem Header `x-forga: 1`,
- oder per `Authorization: Bearer forga_…`.

**Rechte.** Die Spalte „Recht“ nennt die Berechtigung, die der Aufrufer in mindestens einer Abteilung braucht.

**Fehler.** Fehlerantworten tragen einen `code`. Typische Codes:

| Code | Status | Bedeutung |
| --- | --- | --- |
| `auth.required` | `401` | nicht angemeldet |
| `auth.forbidden` | `403` | Berechtigung fehlt |
| `auth.csrf` | `403` | Header `x-forga` fehlt |
| `validation.failed` | `400` | Eingabe ungültig |
| `codes.taken` | `400`/`409` | Barcode oder RFID-Chip (`field`, `value`) gehört schon zu einem anderen Gegenstand des Moduls |

## Core

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/core/setup` | offen | `{ required, brigadeName, oidc }`: Ist die Ersteinrichtung nötig? `oidc: { label }` nur, wenn die Anmeldung mit dem Konto der Gemeinde eingerichtet und die Adresse von f.orga bekannt ist |
| `POST` | `/core/setup` | offen, nur vor der Einrichtung, mit Einrichtungsschlüssel | Feuerwehrname, Standardrollen aus den Rollenvorlagen und ersten Benutzer (Administrator, mit `email`) anlegen, anmelden (`Setup` mit `setupToken`). Fehler: `setup.invalidToken` (`403`), `setup.done` (`409`) |
| `POST` | `/core/password-reset` | offen | Link zum Zurücksetzen anfordern (`{ login }`), Antwort immer `{ ok: true }`. Fehler: `auth.resetNotConfigured` (`503`), `auth.resetRateLimited` (`429`) |
| `POST` | `/core/password-reset/confirm` | offen | Passwort mit Link aus Zurücksetzen oder Einladung setzen (`{ token, password }`). Fehler: `auth.resetInvalid` |
| `GET` | `/core/oidc/start`, `/core/oidc/callback` | offen | Anmeldung mit dem Konto der Gemeinde (Weiterleitungen) |
| `POST` | `/core/oidc/link` | angemeldet (Sitzung) | Eigenes Konto beim Anbieter verknüpfen; Antwort `{ url }` zum Anbieter |
| `POST` | `/core/login` | offen | Anmelden (`Login`), setzt das Cookie. Fehler: `auth.invalidCredentials` (`401`), `auth.locked` (`429`) |
| `POST` | `/core/logout` | offen | Sitzung beenden, Cookie löschen (`204`) |
| `GET` | `/core/session` | angemeldet | Benutzer (mit `language`, `email`, `receiveDigest`) und wirksame Berechtigungen (`brigade` oder Liste von Abteilungs-IDs) |
| `PUT` | `/core/profile` | angemeldet | Eigene Sprache, Sammel-E-Mail, ausgeblendete Aufgaben und E-Mail-Adresse ändern (`UpdateProfile`: `language`, `receiveDigest`, optional `hiddenTasks`, `email` mit `currentPassword`). Antwort `{ ok, confirmationSent }`; eine neue Adresse gilt erst nach Bestätigung. Fehler: `auth.passwordRequired` (`401`), `auth.emailTaken` (`409`) |
| `POST` | `/core/email-confirmation` | öffentlich | Neue E-Mail-Adresse bestätigen (`ConfirmEmail`: `token`). Fehler: `auth.emailLinkInvalid`, `auth.emailTaken` |
| `PUT` | `/core/password` | angemeldet | Eigenes Passwort ändern (`ChangePassword`) |
| `GET` | `/core/users` | `core.users.manage` | Benutzer ohne technische Benutzer |
| `GET` | `/core/users/:id` | `core.users.manage` | Ein Benutzer |
| `POST` | `/core/users` | `core.users.manage` | Benutzer anlegen (`UserInput`, Passwort nötig). Fehler: `users.roleWider`, `users.unknownDepartment`, `users.unknownPerson`, `users.personTaken`, `users.personForbidden`, `users.emailTaken`, `users.usernameTaken` |
| `PUT` | `/core/users/:id` | `core.users.manage` | Benutzer ändern, Rollen setzen, Passwort optional zurücksetzen. Nur für Benutzer ohne Rechte, die dem Verwalter fehlen (`users.targetWider`). Man kann sich nicht selbst deaktivieren und die Person des eigenen Benutzers nicht ändern (`users.cannotRelinkSelf`); eine Person verknüpfen braucht `masterdata.persons.sensitive` in ihrer Abteilung oder für die Gesamtwehr (`users.personForbidden`); ein aktiver Administrator muss bleiben (`users.lastAdministrator`). |
| `POST` | `/core/users/invitations` | `core.users.manage` | Person einladen (`UserInvitation`: `personId`, optional `username`, `language`, `roles`); Antwort der neue Benutzer. Fehler: `users.personWithoutEmail`, `users.personTaken`, `users.personForbidden`, `users.emailTaken`, `auth.resetNotConfigured`, `mail.notConfigured`, `mail.*` (dann wird nichts angelegt) |
| `POST` | `/core/users/invitations/bulk` | `core.users.manage` | Mehrere Personen einladen (`BulkUserInvitation`); Antwort `{ invited, skipped }`, `skipped` je Person mit `reason` (`unknownPerson`, `hasUser`, `noEmail`, `emailTaken`, `usernameTaken`, `forbidden`, `mailFailed` mit `code`) |
| `POST` | `/core/users/:id/invitation` | `core.users.manage` | Einladung erneut senden, solange kein Passwort gesetzt ist (`users.alreadyActivated`) |
| `DELETE` | `/core/users/:id/oidc` | `core.users.manage` | Verknüpfung mit dem Konto der Gemeinde lösen (`users.targetWider` wie beim Ändern) |
| `POST` | `/core/users/:id/impersonate` | `core.users.impersonate` | Als dieser Benutzer anmelden (`{ reason }`), höchstens 60 Minuten. Fehler: `auth.impersonationSelf`, `auth.impersonationWider`, `auth.impersonationNested`, `auth.impersonationUnknownUser` |
| `POST` | `/core/impersonation/end` | angemeldet | Impersonation beenden, eigene Sitzung wiederherstellen |
| `GET` | `/core/permissions` | `core.roles.manage` oder `core.tokens.manage` | Alle Berechtigungen von Core und Modulen (`name` als `{ de, en }`) |
| `GET` | `/core/roles` | angemeldet | Rollen (mit `templateKey`, falls aus einer Vorlage; `name` und `description` als `{ de, en }`) |
| `GET` | `/core/roles/templates` | `core.roles.manage` | Zusammengeführte Rollenvorlagen von Core und Modulen (`key`, `name`, `description`, `permissions`) |
| `POST` | `/core/roles/templates` | `core.roles.manage` | Fehlende Standardrollen in der Sprache des Benutzers anlegen. Antwort `{ created, skipped }` (Schlüssel) |
| `POST` | `/core/roles` | `core.roles.manage` | Rolle anlegen (`RoleInput`, `name` und `description` als `{ de, en }` oder ein Text für beide). Unbekannte Muster ergeben `roles.unknownPermissions`, ein vergebener Name `roles.nameTaken`. |
| `PUT` | `/core/roles/:id` | `core.roles.manage` | Rolle ändern. Hinzugefügte Rechte muss der Verwalter selbst haben (`users.roleWider`); ein aktiver Administrator muss bleiben (`users.lastAdministrator`) |
| `POST` | `/core/roles/:id/apply-template` | `core.roles.manage` | Standardrolle auf ihre Vorlage zurücksetzen; gleiche Prüfungen wie beim Ändern |
| `DELETE` | `/core/roles/:id` | `core.roles.manage` | Rolle löschen, nur innerhalb der eigenen Rechte. Ein aktiver Administrator muss bleiben (`users.lastAdministrator`). |
| `GET` | `/core/tokens` | `core.tokens.manage` | API-Tokens ohne Klartext |
| `POST` | `/core/tokens` | `core.tokens.manage` | Token anlegen (`ApiTokenInput`). Die Antwort enthält den Klartext genau einmal. Fehler: `tokens.unknownScopes`, `tokens.coreScopes` (keine `core.*`-Bereiche), `tokens.scopesWider` (`403`, Bereich fehlt dem Ersteller) |
| `DELETE` | `/core/tokens/:id` | `core.tokens.manage` | Token widerrufen (`204`) |
| `GET` | `/core/settings/:section` | angemeldet; `smtp`, `oidc`, `privacy`, `reminders` nur Verwalter | Einstellungsabschnitt ohne geheime Felder und ohne Felder nur für Verwalter (z. B. `training.general.feedToken`), `null` wenn unvollständig |
| `PUT` | `/core/settings/:section` | `core.settings.manage` bzw. `<modul>.settings.manage` | Einstellungsabschnitt speichern |
| `POST` | `/core/settings/oidc/test` | `core.settings.manage` | Konfiguration des OIDC-Anbieters laden; Antwort `{ issuer, redirectUri }`. Fehler: `auth.oidcDiscoveryFailed` (`502`), `auth.oidcIncomplete`, `auth.oidcNoPublicUrl` |
| `GET` | `/core/onboarding` | `core.settings.manage` oder `core.users.manage` | Einrichtungsliste (`OnboardingItem[]`: `key`, `done`, `to`, bei Modulen `label`) |
| `GET` | `/core/modules` | angemeldet | Aktive Module mit Name, Navigation und `frontend.entry` (`/modules/<id>/remoteEntry.js`) |
| `GET` | `/core/modules/status` | `core.modules.manage` | Alle installierten Module mit Name, Version, `active`, `requires` und `optional` |
| `PUT` | `/core/modules/:id` | `core.modules.manage` | Aktivieren/Deaktivieren (`ModuleActivation`). Fehler: `modules.requirementsInactive`, `modules.requiredByActive` |
| `GET` | `/core/history/:entity/:id` | Prüfung des Moduls (`HistoryAccessRegistry`), sonst eine Berechtigung des Moduls von `:entity` | Historieneinträge des Datensatzes und seiner Kinddatensätze (`parentEntity`/`parentId`), neueste zuerst. Maskierte Felder haben `hidden: true`. Ohne Leserecht `404`. `:entity` z. B. `masterdata.person` |
| `GET` | `/core/codes?code=` | angemeldet; Treffer je nach Rechten im Modul | Gegenstände mit genau diesem Code (`SearchHit[]`): Barcode, RFID-Chip (Trennzeichen und Schreibweise egal), Inventar-, Seriennummer oder URL eines QR-Etiketts |
| `GET` | `/core/codes/modules` | angemeldet | Module, in denen der Benutzer Codes suchen kann (`string[]`) |
| `GET` | `/core/audit?from=&to=&userId=&action=&q=&limit=` | `core.audit.read` | Audit-Einträge, neueste zuerst (höchstens 1000), mit `userName` und `impersonatorName`. `action` mit `.` am Ende filtert nach Präfix |
| `GET` | `/core/audit/filters` | `core.audit.read` | `{ actions, users }` für die Filter |
| `GET` | `/core/export` | `core.data.export` | Module mit Vollexport, einschließlich `core` |
| `GET` | `/core/export/:module` | `core.data.export` | Vollexport eines Moduls (JSON-Datei); bei `core` Abschnitte und Felder nur für Verwalter nur für diese |
| `GET` | `/core/export/person/:personId` | `core.data.export` | Auskunft zu einer Person über alle Module (JSON-Datei). Fehler: `data.invalidPersonId` (`400`), `data.unknownPerson` (`404`) |
| `POST` | `/core/retention/run` | `core.settings.manage` | Aufbewahrungsregeln anwenden (`RetentionRun`: `dryRun`, nur im Probelauf `settings` mit anderen Werten). Antwort `{ dryRun, counts }` |
| `GET` | `/core/lists` | angemeldet | Listenvorlagen, für die der Benutzer das Recht hat (`ListInfo` mit `departments`: `brigade` oder die erlaubten Abteilungen) |
| `GET` | `/core/lists/:id?<parameter>&lang=` | Recht der Liste | Listeninhalt für die Vorschau (`ListData`: Titel, Untertitel, Spalten, Zeilen). Ungültige Parameter `400`, unbekannte oder nicht erlaubte Liste `404` |
| `GET` | `/core/lists/:id/parameters/:key/options?q=` | Recht der Liste | Auswahl für Parameter vom Typ `person` (Namenssuche ab 2 Zeichen) oder `choice` (Einträge des Moduls), höchstens 50 (`ListOption[]`) |
| `GET` | `/core/lists/:id/export/:format?<parameter>&lang=` | Recht der Liste | Datei als `pdf`, `xlsx` oder `csv` (Download). Unbekanntes Format: `lists.unknownFormat` |
| `GET` | `/core/tasks?asOf=&all=` | angemeldet | Fristen, für die der Benutzer zuständig ist (`Deadline[]`, optional mit Link `to`), früheste zuerst, ohne die im Profil ausgeblendeten (`all=true`: alle). `asOf` (`JJJJ-MM-TT`) für eine Vorschau, sonst heute |
| `POST` | `/core/tasks/digest` | `core.settings.manage` | Sammel-E-Mail sofort verschicken, Antwort `{ sent }`. Ohne SMTP: `mail.notConfigured` |
| `GET` | `/core/imports/profiles` | angemeldet | Importprofile, für die der Benutzer das Recht hat (`ImportProfileInfo`, `transfer` = Profil liest auch MP-Feuer-Transferdateien) |
| `POST` | `/core/imports` | Recht eines Importprofils | Datei hochladen (`multipart/form-data`, Feld `file`, `.xlsx`/`.csv`/`.txt`/`.ics`, höchstens 10 MB). Antwort `ImportUpload` mit Überschriften, Beispielzeilen und vorgeschlagener Zuordnung je Profil. Fehler: `imports.fileMissing`, `imports.unsupportedFormat`, `imports.empty` |
| `POST` | `/core/imports/:id/preview` | Recht des Profils | Probelauf (`ImportRequest`: `profile`, `mapping`, `options`, `mappings` = Art → Wert der Datei → Schlüssel des gewählten Eintrags), ändert nichts. Antwort `ImportResult` mit `dryRun`, `counts`, `rows` und `unmatched` (`{ kind, value, count }`, offene Werte je Art und Wert) |
| `POST` | `/core/imports/:id/apply` | Recht des Profils | Übernahme; danach ist der Upload gelöscht. Die benutzten Zuordnungen aus `mappings` werden als Aliasse der gewählten Einträge gespeichert. Fehler: `imports.uploadNotFound`, `imports.unknownProfile`, `imports.requiredFieldUnmapped`, `imports.unknownColumn`, `imports.unknownLookup` (`kind`), `imports.unknownMappingTarget` (`kind`, `value`, `key`) |
| `GET` | `/core/imports/lookups` | Recht eines Importprofils | Nachschlagelisten für nicht zugeordnete Werte (`ImportLookupInfo`: `kind`, `name`, `keyFormat` `slug`/`text`, `creatable` = Benutzer darf Einträge anlegen) |
| `GET` | `/core/imports/lookups/:kind` | Recht eines Importprofils | Wählbare Einträge (`ImportLookupEntry`: `key`, `name`). Fehler: `imports.unknownLookup` (404) |
| `POST` | `/core/imports/lookups/:kind` | Recht der Liste (z. B. `masterdata.catalogs.manage`) | Eintrag anlegen (`ImportLookupEntryInput`: `key`, `name`). Antwort `ImportLookupEntry` (201). Fehler: `auth.forbidden` mit `permissions`, `catalog.keyTaken` (409), `validation.failed`; Audit `imports.lookupEntryCreated` |
| `POST` | `/core/imports/transfers` | Recht eines Profils mit Datenübernahme | MP-Feuer-Transferdateien hochladen (`multipart/form-data`, Feld `files`, bis 40 Dateien, je 200 MB). Antwort `TransferUpload` mit Archiven (`key`, `fileName`, `label`) und Datensätzen je Profil in Importreihenfolge (`TransferDataset`: `profile`, `rowCount`, bei Profilen mit Einheiten `units`: `label`, `none`, `entries` mit `key` und `name`, z. B. „Einsatzberichte als“ mit den Einheiten aktiver Module). Fehler: `imports.fileMissing`, `imports.transferUnreadable`, `imports.transferEncrypted`, `imports.transferTooLarge` (entpackt über 500 MB je Datei oder 2 GB zusammen; jeweils mit `name`) |
| `POST` | `/core/imports/transfers/:id/preview` | Recht des Profils | Probelauf eines Profils (`TransferRequest`: `profile`, `departments` = Archivschlüssel → Abteilungsname, `units` = Archivschlüssel → Schlüssel einer Einheit aus `TransferDataset.units`, nur für Profile mit Einheiten, sonst ignoriert, `options`, `mappings` wie beim Dateiimport, gelten für alle Archive). Antwort `ImportResult`. Fehler: `imports.unknownUnit` |
| `POST` | `/core/imports/transfers/:id/apply` | Recht des Profils | Übernahme eines Profils; die Übernahme bleibt für die nächsten Profile erhalten. Die benutzten Zuordnungen werden als Aliasse gespeichert. Fehler: `imports.uploadNotFound`, `imports.unknownProfile` |
| `DELETE` | `/core/imports/transfers/:id` | Hochladender | Datenübernahme verwerfen (204) |

**Einstellungsabschnitte des Core:** `brigade` (`publicUrl` nur `https://`, `http://` für `localhost`; `email` als E-Mail-Adresse), `smtp` (Passwort nur schreibbar), `reminders` (`enabled`, `weekday` 1–7 mit 1 = Montag, `hour` 0–23, Europe/Berlin), `privacy` (`anonymizeLeftAfterYears`, Standard `null` = nie; `auditRetentionMonths`), `oidc` (Client-Secret nur schreibbar).

**Importprofil `masterdata.persons`**, Meldungscodes je Zeile: `imports.requiredValueMissing`, `imports.invalidDate`, `masterdata.import.unknownDepartment`, `masterdata.import.departmentRequired`, `masterdata.import.ambiguous`, `masterdata.import.departmentCreated`, `masterdata.import.departmentDiffers`, `masterdata.import.unknownStatus`, `masterdata.import.sensitiveIgnored`, `masterdata.import.unknownExitReason` (`kind` `exit-reason`, `value`), `masterdata.import.leftIgnored`, `auth.forbidden`.

**Importprofil `masterdata.career`** (Lehrgänge, Dienstgrade und Ehrungen, Option `createCatalogEntries`, nicht in der Datenübernahme), Meldungscodes je Zeile: `imports.invalidDate`, `masterdata.import.unknownCareerKind`, `masterdata.import.unknownPerson`, `masterdata.import.ambiguous`, `masterdata.import.unknownCatalogEntry` (`kind` `qualification`/`rank`/`honor`, `value`, `name`), `masterdata.import.catalogEntryCreated`, `auth.forbidden`.

**Nachschlagelisten für Importe** (`ImportRegistry.registerLookup`): `qualification`, `rank`, `honor`, `exit-reason`, `function` (Kataloge, anlegen mit `masterdata.catalogs.manage`), `vehicle` (Fahrzeuge, Schlüssel = ID, nicht anlegbar), `alarm-keyword` (anlegen mit `incidents.settings.manage`), `session-type` (anlegen mit `training.settings.manage`).

## Masterdata

Schemas aus `@forga/masterdata-contracts`. „Abteilungsbezogen“ heißt: Das Recht muss für die betroffene Abteilung oder die Gesamtwehr vorliegen.

**Kataloge**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/catalog?kind=` | angemeldet | Katalogeinträge, optional einer Art (`CatalogKind`) |
| `POST` | `/masterdata/catalog` | `masterdata.catalogs.manage` | Eintrag anlegen (`CatalogEntryInput`, optional `aliases`). Fehler: `catalog.keyTaken` (`409`), `masterdata.aliasTaken` (`409`, mit `alias`), `validation.failed` für `attributes.*` |
| `PUT` | `/masterdata/catalog/:id` | `masterdata.catalogs.manage` | Name, Reihenfolge, `active`, Zusatzfelder und Aliasse ändern (ohne `aliases` bleiben sie unverändert). `kind` und `key` sind fest (`catalog.keyImmutable`). Fehler: `masterdata.aliasTaken` (`409`) |
| `DELETE` | `/masterdata/catalog/:id` | `masterdata.catalogs.manage` | Unbenutzten Eintrag löschen (`204`). Fehler (`409`): `catalog.inUse` mit `usages: [{ module, count }]` (Verweise je Modul, `CATALOG_REFERENCES`), `catalog.required` mit `modules` (vom Code benötigter Eintrag) |
| `POST` | `/masterdata/catalog/templates/bw` | `masterdata.catalogs.manage` | BW-Vorlage anwenden, Antwort `{ added: { <art>: anzahl } }` |
| `GET` | `/masterdata/vehicle-statistics-categories` | angemeldet | Feste Statistik-Kategorien F63–F120 |

**Organisation**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/departments` | angemeldet | Abteilungen |
| `POST` | `/masterdata/departments` | `masterdata.organization.manage` für die Gesamtwehr | Abteilung anlegen (`DepartmentInput`) |
| `PUT` | `/masterdata/departments/:id` | `masterdata.organization.manage`, abteilungsbezogen | Abteilung ändern. Typ, übergeordnete Abteilung, Sonderaufgaben, Statistik und Einwohner nur mit dem Recht für die Gesamtwehr (`masterdata.departmentFieldsBrigadeOnly`, `403`). Eine andere übergeordnete Abteilung braucht zusätzlich `core.roles.manage` (`masterdata.departmentMoveNeedsRoles`, `403`) und steht im Audit-Log (`masterdata.department-moved`). Fehler: `masterdata.unknownDepartment`, `masterdata.departmentOwnParent`, `masterdata.departmentCycle`, `masterdata.unknownPerson`, `masterdata.shortNameTaken` (`409`, auch beim Anlegen) |
| `GET` | `/masterdata/groups?departmentId=` | angemeldet | Gruppen (`DepartmentGroup`) der Abteilungen mit `masterdata.persons.read`, dazu die selbst geführten |
| `GET` | `/masterdata/groups/mine` | angemeldet | Gruppen, deren Gruppenführer die verknüpfte Person ist („Meine Gruppe“) |
| `POST`, `PUT`, `DELETE` | `/masterdata/groups`, `/masterdata/groups/:id` | `masterdata.organization.manage`, abteilungsbezogen | Gruppe anlegen/ändern (`DepartmentGroupInput`: `departmentId`, `name`, `leaderId`, `memberIds`) bzw. löschen. Fehler: `masterdata.groupMemberNotInDepartment`, `masterdata.groupNameTaken` (`409`), `masterdata.groupDepartmentImmutable` |
| `DELETE` | `/masterdata/departments/:id` | `masterdata.organization.manage` (Gesamtwehr) | Unbenutzte Abteilung löschen (`204`). Fehler (`409`): `masterdata.departmentHasChildren`, `masterdata.departmentHasMembers` (auch frühere), `masterdata.departmentHasStations`, `masterdata.departmentHasVehicles`, `masterdata.inUse` (Berichte, Rollenzuweisungen) |
| `GET` | `/masterdata/stations?departmentId=` | angemeldet | Wachen |
| `POST`, `PUT` | `/masterdata/stations`, `/masterdata/stations/:id` | `masterdata.organization.manage`, abteilungsbezogen (alte und neue Abteilung) | Wache anlegen/ändern (`StationInput`) |
| `DELETE` | `/masterdata/stations/:id` | `masterdata.organization.manage`, abteilungsbezogen | Unbenutzte Wache löschen. Fehler: `masterdata.stationHasVehicles`, `masterdata.inUse` (Bereitschaft in Berichten) |
| `GET` | `/masterdata/vehicles?departmentId=&includeRetired=` | angemeldet | Fahrzeuge, ausgesonderte nur mit `includeRetired=true` |
| `POST`, `PUT` | `/masterdata/vehicles`, `/masterdata/vehicles/:id` | `masterdata.organization.manage`, abteilungsbezogen (alte und neue Abteilung) | Fahrzeug anlegen/ändern (`VehicleInput`, optional `aliases`; ohne bleiben sie beim Ändern unverändert). Sitzplätze und Statistik-Kategorie kommen ohne Angabe vom Fahrzeugtyp. Fehler: `catalog.unknownKey`, `masterdata.statisticsCategoryRequired`, `masterdata.unknownStation`, `masterdata.aliasTaken` (`409`, mit `alias`) |
| `DELETE` | `/masterdata/vehicles/:id` | `masterdata.organization.manage`, abteilungsbezogen | Nie genutztes Fahrzeug löschen. Fehler: `masterdata.inUse` (in Berichten); genutzte Fahrzeuge werden ausgesondert (`status: retired`) |

**Personen.** Alle Endpunkte außer der Liste (dort genügt `masterdata.persons.directory`) brauchen `masterdata.persons.read`, ändernde zusätzlich `masterdata.persons.write`, jeweils abteilungsbezogen. Personen außerhalb der eigenen Abteilungen ergeben `404`. Ändernde Endpunkte liefern die vollständige Person (`Person`) zurück.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/masterdata/persons?q=&departmentId=&status=&qualification=&includeLeft=` | Sichtbare Personen als `PersonSummary`, Ausgeschiedene nur mit `includeLeft=true` oder `status=left`. Personen, die nur über `masterdata.persons.directory` sichtbar sind, kommen mit Name, Status und Abteilungen und `restricted: true` |
| `GET` | `/masterdata/persons/:id` | Person mit Mitgliedschaften, Qualifikationen, Dienstgraden, Ehrungen. Sensible Felder nur mit `masterdata.persons.sensitive`, sonst `sensitiveHidden: true`, `notes` leer, `restPeriods` leer und `exitReason` `null` |
| `POST` | `/masterdata/persons` | Anlegen (`CreatePersonInput`, mindestens eine Mitgliedschaft). Status Standard `probation`, Probezeitende aus `masterdata.membership`. Fehler: `masterdata.personnelNumberTaken` (`409`), `masterdata.primaryMembershipRequired`, `masterdata.unknownDepartment`, `masterdata.birthDateInFuture`, `masterdata.belowMinimumAge` (laufende Mitgliedschaft in einer Einsatzabteilung unter `minimumAgeOperational`), `masterdata.belowMinimumAgeYouth` (Jugendfeuerwehr unter `minimumAgeYouth`), `masterdata.statusDoesNotFitDepartment` (Status passt nicht zum Typ der Stammabteilung), `masterdata.dateBeforeBirth`, `validation.failed` mit `bank.iban` bzw. `employer.iban` (Prüfziffer) |
| `PUT` | `/masterdata/persons/:id` | Stammdaten ändern (`PersonInput`). Sensible Felder (auch `notes`) ohne Recht werden ignoriert. Fehler: `masterdata.birthDateInFuture`, `masterdata.dateBeforeBirth` (geändertes Geburtsdatum nach erfassten Daten bzw. geänderter Eintritt vor der Geburt) |
| `PUT` | `/masterdata/persons/:id/memberships` | Alle Mitgliedschaften ersetzen (Liste von `MembershipInput`). Recht für alte und neue Abteilungen nötig. Fehler: `masterdata.membershipPeriodInvalid`, `masterdata.primaryMembershipRequired`, `masterdata.belowMinimumAge` bzw. `masterdata.belowMinimumAgeYouth` (neue laufende Mitgliedschaft), `masterdata.dateBeforeBirth`, `masterdata.statusDoesNotFitDepartment` (neue Stammabteilung passt nicht zum Status) |
| `POST`, `PUT`, `DELETE` | `/masterdata/persons/:id/rest-periods`, `…/rest-periods/:entryId` | Ruhezeiten; zusätzlich `masterdata.persons.sensitive` |
| `POST`, `DELETE` | `/masterdata/persons/:id/qualifications`, `…/qualifications/:entryId` | Qualifikation eintragen (`PersonQualificationInput`) bzw. entfernen. Löst `masterdata.person.qualification-changed` aus. Fehler: `masterdata.dateBeforeBirth` |
| `POST`, `DELETE` | `/masterdata/persons/:id/ranks`, `…/ranks/:entryId` | Dienstgrad direkt eintragen (`RankAssignmentInput`) bzw. entfernen: Altdaten und Korrekturen, nur mit `masterdata.persons.write` für die Gesamtwehr (`auth.forbidden`); Beförderungen laufen über die Beförderungslisten. Fehler: `masterdata.dateBeforeBirth` |
| `POST`, `PUT`, `DELETE` | `/masterdata/persons/:id/offices`, `…/offices/:entryId` | Amt eintragen, ändern bzw. entfernen (`OfficeAssignmentInput`). Braucht `masterdata.persons.write` für die Abteilung des Amts, ohne Abteilung (Gesamtwehr) das Recht für die Gesamtwehr (`auth.forbidden`); beim Ändern für alte und neue Abteilung. Fehler: `masterdata.unknownDepartment`, `masterdata.dateBeforeBirth` |
| `POST`, `DELETE` | `/masterdata/persons/:id/honors`, `…/honors/:entryId` | Ehrung eintragen (`HonorAwardInput`) bzw. entfernen. Fehler: `masterdata.dateBeforeBirth` |
| `PUT` | `/masterdata/persons/:id/probation` | Probezeitende ändern (`ProbationChange`). Fehler: `masterdata.notInProbation` |
| `POST` | `/masterdata/persons/:id/admission` | Endgültige Aufnahme (`Admission`: `decidedOn`, `reason`). Vor dem Ende der Probezeit oder ohne die Qualifikationen der Probezeit nur mit Begründung (kommt in die Bemerkung). Fehler: `masterdata.notInProbation`, `masterdata.admissionReasonRequired` (mit `probationEndsOn`, `missing`), `masterdata.admissionBeforeJoining` |
| `GET` | `/masterdata/persons/honors/certificates?from&to&honor&ids` | Anzahl der Urkunden (`{ count }`) für dieselben Parameter wie das PDF |
| `POST` | `/masterdata/persons/:id/status` | Statuswechsel (`StatusChange`) nur zwischen `active` und `passive`; aus `youth` heraus und nach `veterans` über die Übernahmen (`masterdata.useTransfer`), alle anderen Wechsel `masterdata.statusChangeNotAllowed` |
| `POST` | `/masterdata/persons/:id/transfer-to-operational` | Übernahme aus der Jugendfeuerwehr (`TransferToOperational`: `departmentId`, `on`, `probationEndsOn` oder `null` = Verzicht, `reason`, `decidedOn`). Fehler: `masterdata.transferNotAllowed`, `masterdata.wrongDepartmentType`, `masterdata.belowMinimumAge`, `masterdata.probationReasonRequired`, `masterdata.transferBeforeMembership`, `masterdata.transferInFuture` (Übernahmedatum nach heute) |
| `POST` | `/masterdata/persons/:id/transfer-to-veterans` | Übernahme in die Altersabteilung (`TransferToVeterans`: `departmentId`, `on`, `decidedOn`), nur aus `active` oder `passive`. Fehler: `masterdata.personHoldsItems` (409, mit `modules` (Modul-IDs) und `count`), `masterdata.transferNotAllowed`, `masterdata.wrongDepartmentType`, `masterdata.transferBeforeMembership`, `masterdata.transferInFuture` |
| `POST` | `/masterdata/persons/:id/leave` | Austritt (`Leave`), beendet offene Mitgliedschaften, löst `masterdata.person.left` aus. Fehler: `masterdata.alreadyLeft`, `masterdata.personHoldsItems` (409) |

Unbekannte Katalogschlüssel ergeben `400` mit `catalog.unknownKey`.

**Lehrgänge**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/courses` | angemeldet | Lehrgangskatalog |
| `POST`, `PUT` | `/masterdata/courses`, `/masterdata/courses/:id` | `masterdata.catalogs.manage` | Lehrgang anlegen/ändern (`CourseInput`, auch `requiredQualifications`, `minimumAge`, `allowedStatuses`, `targets`). Fehler: `catalog.keyTaken`, `catalog.keyImmutable`, `catalog.unknownKey`, `masterdata.courseOwnPrerequisite`, `masterdata.unknownDepartment` |
| `POST` | `/masterdata/courses/templates/bw` | `masterdata.catalogs.manage` | BW-Lehrgänge anlegen (Qualifikationen der BW-Katalogvorlage müssen existieren), Antwort `{ added }` |
| `GET` | `/masterdata/persons/:id/course-attendances` | `masterdata.persons.read`, abteilungsbezogen | Teilnahmen der Person |
| `POST` | `/masterdata/persons/:id/course-attendances` | `masterdata.persons.write` oder `masterdata.courses.plan`, abteilungsbezogen | Teilnahme eintragen (`CourseAttendanceInput`, Ende nicht vor Beginn, Daten ab 1900). Bei `passed`: Qualifikationen anlegen, offene Vormerkungen `completed`, Ereignisse `masterdata.course.passed` und `masterdata.person.qualification-changed`; sind alle Qualifikationen schon gültig vorhanden, nur mit `confirmHeld: true`, dann ohne neue Qualifikation und ohne Ereignis. Bei `failed`: offene Vormerkungen dieses, eines früheren oder keines Termins `failed`. Fehler: `masterdata.courseNotFinished` (bestanden mit Ende nach heute), `masterdata.attendanceInFuture` (Beginn nach heute), `masterdata.dateBeforeBirth`, `masterdata.coursePassedAlready` (`409`), `masterdata.qualificationsHeld` (`409`) |
| `DELETE` | `/masterdata/persons/:id/course-attendances/:attendanceId` | `masterdata.persons.write` oder `masterdata.courses.plan`, abteilungsbezogen | Teilnahme und die daraus entstandenen Qualifikationen entfernen (`204`); die damit erledigte bzw. geschlossene Vormerkung wird wieder `confirmed`. Bei bestandener Teilnahme `masterdata.course.revoked` und `masterdata.person.qualification-changed` |
| `POST` | `/masterdata/course-results` | `masterdata.persons.write` oder `masterdata.courses.plan` je Person | Ergebnisse mehrerer Personen auf einmal (`CourseResultsInput`: `course`, `runId` oder Datum und Ort, `results`, `confirmHeld`); Antwort `{ recorded, skipped: [{ personId, code }] }`, übersprungen u. a. mit `masterdata.resultRecordedAlready` (Ergebnis für den Termin vorhanden) |
| `GET` | `/masterdata/course-runs?course=&year=` | `masterdata.courses.plan` | Lehrgangstermine (`CourseRun`) mit Zahl der zugeordneten Vormerkungen und erfassten Teilnahmen |
| `POST`, `PUT`, `DELETE` | `/masterdata/course-runs`, `/masterdata/course-runs/:id` | `masterdata.courses.plan` | Termin anlegen/ändern (`CourseRunInput`) bzw. löschen; mit erfassten Ergebnissen sind Löschen und das Verschieben der Daten gesperrt (`masterdata.courseRunHasResults`, `409`) |
| `GET` | `/masterdata/course-needs` | `masterdata.courses.plan` | Lehrgangsbedarf (`CourseNeed[]`): je aktivem Lehrgang und Abteilung `have`, `target`, `nominated`, gezählt über Mitglieder mit einem für den Lehrgang zugelassenen Status |
| `GET` | `/masterdata/course-nominations?course=` | `masterdata.courses.plan` | Vormerkungen der Personen, für die der Benutzer planen darf |
| `POST` | `/masterdata/course-nominations` | `masterdata.courses.plan`, abteilungsbezogen | Vormerken (`CourseNominationInput`, optional `runId`). Fehler: `masterdata.alreadyNominated` (`409`), `masterdata.statusNotAllowedForCourse`, `masterdata.courseHeldAlready`, `masterdata.courseConditionsNotMet`, `masterdata.nominationStatusByAttendance` (`completed`/`failed`), `masterdata.unknownCourseRun` |
| `POST` | `/masterdata/course-nominations/bulk` | `masterdata.courses.plan`, abteilungsbezogen je Person | Mehrere Personen vormerken (`BulkNominationInput`, optional `runId` und `status`); wer nicht vorgemerkt werden kann, wird mit denselben Codes wie beim Einzelnen übersprungen. Antwort `{ created, skipped: [{ personId, code }] }` |
| `POST` | `/masterdata/course-nominations/bulk-update` | `masterdata.courses.plan`, abteilungsbezogen je Person | Status und/oder Termin mehrerer Vormerkungen (`BulkNominationUpdate`); Antwort `{ updated, skipped: [{ nominationId, code }] }` |
| `PUT` | `/masterdata/course-nominations/:id` | `masterdata.courses.plan`, abteilungsbezogen | Priorität, Zeitraum, Status, Bemerkung und Termin ändern. Person und Lehrgang sind fest (`masterdata.nominationTargetImmutable`). `completed` und `failed` folgen nur aus Teilnahmen (`masterdata.nominationStatusByAttendance`); Wiedereröffnen neben einer anderen offenen Vormerkung: `masterdata.alreadyNominated` (`409`). |
| `DELETE` | `/masterdata/course-nominations/:id` | `masterdata.courses.plan`, abteilungsbezogen | Vormerkung löschen (`204`) |
| `GET` | `/masterdata/course-planning/:course` | `masterdata.courses.plan` | `CoursePlanning`: offene Vormerkungen mit `prerequisitesMet` (Status zugelassen, alle Bedingungen, Lehrgang noch nicht vorhanden), Kandidaten und Termine |

**Ungültige Eingaben** ergeben `400`:

```json
{ "code": "validation.failed", "issues": [{ "path": "name", "code": "too_small", "message": "…" }] }
```

## Incidents

Abteilungsbezogene Rechte gelten für die Abteilung des Berichts. Wer `incidents.reports.release` für die Gesamtwehr hat, liest und schreibt alle Berichte. Berichte gesamtwehrweiter Einheiten (z. B. EvD-Bericht, `departmentId: null`, `unit`) liest, wer `incidents.reports.read` für die Gesamtwehr oder ein Recht der Einheit hat; „Schreibrecht“ heißt bei ihnen das Schreibrecht der Einheit, Vorprüfen ihr Prüfrecht.

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/incidents/keywords` | angemeldet | Stichwort-Katalog (`AlarmKeyword[]`) |
| `POST`, `PUT` | `/incidents/keywords`, `/incidents/keywords/:id` | `incidents.settings.manage` | Stichwort anlegen/ändern (`AlarmKeywordInput`, optional `aliases`; ohne bleiben sie beim Ändern unverändert); der Schlüssel bleibt fest. Fehler: `catalog.keyTaken`, `incidents.aliasTaken` (`409`, mit `alias`) |
| `POST` | `/incidents/keywords/templates/bw` | `incidents.settings.manage` | Fehlende Stichworte der BW-Vorlage anlegen, Antwort `{ added }` |
| `GET` | `/incidents/incidents?from&to&departmentId&status&mine&withoutStatistics` | `incidents.reports.read` | Einsätze mit mindestens einem lesbaren Bericht, neueste zuerst (höchstens 500); `withoutStatistics=true`: Hauptbericht eines gezählten Stichworts ohne Statistik |
| `POST` | `/incidents/incidents` | `incidents.reports.write` für jede genannte Abteilung | Einsatz (`CreateIncident`: `IncidentInput` und `departmentIds`) mit je einem Berichtsentwurf anlegen; ohne Abteilung nur für Freigeber. Sendet `incidents.incident.created`; die Antwort enthält auch die daraufhin angelegten Berichte anderer Module (z. B. EvD-Bericht). Fehler: `incidents.departmentRequired`, `incidents.dispatchNumberTaken` (`409`), `incidents.unknownKeyword` |
| `GET` | `/incidents/incidents/matches?dispatchNumber&alarmKeyword&alarmedAt&street&city` | `incidents.reports.write` | Vorhandene Einsätze mit derselben Nummer (Groß-/Kleinschreibung egal) oder ±2 h mit demselben Stichwort oder Ort, auch nicht lesbare, nur Mindestdaten und die lesbaren Berichte (`IncidentMatch[]` mit `ownReports`) |
| `GET` | `/incidents/authors?departmentId` bzw. `?unit` | Schreibrecht für die Abteilung bzw. Einheit | Personen, die Verfasser sein können (aktives Konto mit Schreibrecht für die Abteilung bzw. Einheit oder Freigaberecht), als ID-Liste |
| `GET` | `/incidents/units` | angemeldet | Gesamtwehrweite Einheiten mit eigenen Berichten (`IncidentUnit[]`: Schlüssel, Modul, Name, Kurzname, Nummernpräfix, Rechte, Fahrzeugpflicht) |
| `GET` | `/incidents/incidents/:id` | `incidents.reports.read` | Einsatz mit Berichtsübersicht (je Bericht auch `hasStatistics`) |
| `PUT` | `/incidents/incidents/:id` | Schreibrecht für den Hauptbericht | Einsatzdaten ändern (`IncidentUpdate` mit `version`); Schreiber nur, solange alle Berichte ungesperrte Entwürfe sind. Fehler: `conflict.stale`, `incidents.reportLocked`, `incidents.incidentSubmitted` (`403`), `incidents.incidentReleased` (`409`, ein Bericht ist freigegeben), `incidents.dispatchNumberTaken` |
| `PUT` | `/incidents/incidents/:id/costs` | `incidents.costs` | Kosten und Bemerkungen des ganzen Einsatzes (`IncidentCosts`: `chargeable`, `chargeableReason` – Pflicht, wenn kostenpflichtig –, `notes`, `version`); auch nach der Freigabe der Berichte |
| `POST` | `/incidents/incidents/:id/reports` | `incidents.reports.write` für die Abteilung | Bericht für eine weitere Abteilung anlegen (`NewReportInput`), auch bei einem Einsatz, den der Benutzer noch nicht lesen darf. Fehler: `incidents.reportExists` (`409`) |
| `GET` | `/incidents/reports/:id` | `incidents.reports.read` | Bericht (`Report`) mit Entschädigung je Person, `compensationTotal`, `findings`, `statisticsSuggestion`. Ohne Leserecht `404` |
| `PUT` | `/incidents/reports/:id` | `incidents.reports.read`, Schreibrecht am Bericht | Inhalt speichern (`ReportUpdate`: `ReportInput` mit Pflichtfeld `version`). Fehler: `conflict.stale`, `incidents.reportReleased`, `incidents.reportLocked`, `incidents.notDraft` (`403`), `incidents.unknownPerson`, `incidents.unknownVehicle`, `incidents.personTwiceInReport` |
| `GET` | `/incidents/reports/:id/pdf?lang` | `incidents.reports.read` | Bericht als PDF |
| `GET` | `/incidents/reports/:id/previous-crew?vehicleId` | `incidents.reports.read` | Besatzung des Fahrzeugs im letzten früheren Bericht der Abteilung (`PreviousCrew`) |
| `PUT` | `/incidents/reports/:id/statistics` | `incidents.reports.release` (Gesamtwehr) | Statistik eines Hauptberichts ohne neue Freigabe ändern oder entfernen (`StatisticsUpdate`: `statistics` oder `null`, `version`). Fehler: `incidents.notPrimary`, `incidents.statisticsNotCounted` (`400`), `conflict.stale` |
| `GET` | `/incidents/me?year` | `incidents.self` | Eigene Einsätze des Jahres (`MyIncidents`) der verknüpften Person |
| `GET` | `/incidents/reports/:id/revisions` | `incidents.reports.read` | Versionen des Berichts, neueste zuerst (`ReportRevision[]`: `id`, `savedAt`, `userName`, `personnelCount`) |
| `POST` | `/incidents/reports/:id/revisions/:revisionId/restore` | `incidents.reports.read`, Schreibrecht am Bericht | Version wiederherstellen; wie Speichern (neue Version, Sperre durch Freigeber). Fehler wie `PUT` |
| `POST` | `/incidents/reports/:id/primary` | `incidents.reports.read`, Schreibrecht am Bericht | Zum Hauptbericht machen. Fehler: `incidents.reportReleased` (der Bericht oder der bisherige Hauptbericht ist freigegeben), `incidents.unitReportNotPrimary` (`400`, Bericht einer Einheit) |
| `POST` | `/incidents/reports/:id/submit` | `incidents.reports.read`, Schreibrecht am Bericht | Fertig melden (`Submit` mit `acknowledgements`). Fehler: `incidents.findingsOpen`, `incidents.warningsNotAcknowledged` (`400`), `incidents.invalidTransition` (`409`) |
| `POST` | `/incidents/reports/:id/return` | `incidents.reports.release` (Gesamtwehr) oder `incidents.reports.review` für die Abteilung (bei Einheiten ihr Prüfrecht) | Zurückgeben (`ReturnToAuthor`); gesperrte Berichte nur Freigeber (`incidents.reportLocked`), die Sperre fällt nur mit `incidents.reports.unlock` |
| `POST` | `/incidents/reports/:id/release` | `incidents.reports.release` | Freigeben (`Release`: `compensation` nur aus `review`, `billing` aus `review` oder `released-compensation`). Fehler: `incidents.findingsOpen`, `incidents.invalidTransition`, `incidents.compensationReleaseDisabled` (`400`, wenn `compensationRelease` aus ist) |
| `POST` | `/incidents/reports/release` | `incidents.reports.release` | Mehrere Berichte freigeben (`ReleaseMany`), Antwort `ReleaseManyResult` (`released`, `failed` mit Fehlercode) |
| `POST` | `/incidents/reports/:id/unlock` | `incidents.reports.unlock` | Sperre aufheben (`Unlock`: `reason`, `toStatus`; ein gesperrter Entwurf nur nach `draft`). Fehler: `incidents.notLocked`, `incidents.invalidTransition` |
| `DELETE` | `/incidents/reports/:id` | `incidents.reports.read`, Schreibrecht am Bericht | Entwurf eines Abteilungsberichts löschen (`204`, Ereignis `incidents.report.unlocked` mit Grund `deleted`); der letzte Abteilungsbericht löscht den Einsatz und die Entwürfe der Einheiten mit. Fehler: `incidents.invalidTransition`, `incidents.primaryHasSiblings`, `incidents.unitReportManaged` (`409`, Bericht einer Einheit: nur über ihr Modul) |
| `POST` | `/incidents/v1/incidents` | `incidents.api.create` | Externe API (`ExternalIncidentInput`), idempotent über die Leitstellennummer. Antwort `ExternalIncidentResult` mit `warnings` (u. a. `incidents.departmentNotOperational` für Abteilungen, die keine Einsatzabteilung sind) |
| `GET` | `/incidents/compensation/check?from&to` | `incidents.compensation.export` | Prüfung vor der Auszahlung (`CompensationCheck`: nicht freigegebene Berichte und Personalprobleme) |
| `GET` | `/incidents/compensation/export?from&to&includeUnreleased&lang` | `incidents.compensation.export` | Abrechnungsexport als Excel; Blatt „Hinweise“ mit dem Ergebnis der Prüfung |
| `GET` | `/incidents/statistics/:year` | `incidents.statistics` | Jahresstatistik (`AnnualStatistics`: Werte mit berechnet/korrigiert/gültig, Prüfungen, Abschluss) |
| `PUT` | `/incidents/statistics/:year/corrections` | `incidents.statistics` | Korrekturen (`StatisticsCorrections`, Schlüssel `F121:D`, `null` entfernt). Fehler: `incidents.statisticsClosed` (`409`) |
| `POST` | `/incidents/statistics/:year/close`, `/incidents/statistics/:year/reopen` | `incidents.statistics` | Abschließen (`CloseStatistics`: `force` bei offenen Prüfungen, sonst `incidents.statisticsChecksOpen`; speichert die Werte) bzw. wieder öffnen |
| `GET` | `/incidents/statistics/:year/export` | `incidents.statistics` | Ausgefüllte Import-Vorlage des Landesportals (`Jahresstatistik_<Jahr>.xlsx`) |

**Listen** über `/core/lists`: `incidents.open-reports`, `incidents.incidents`, `incidents.per-department`, `incidents.hours-per-person`.

**Importprofil `incidents.mp-feuer`** (Recht `incidents.reports.release`, MP-Feuer-Personalexport `.xlsx`/`.csv`, Option `createKeywords`), Meldungscodes je Zeile: `masterdata.import.unknownDepartment`, `imports.invalidDate`, `incidents.unknownKeyword`, `incidents.import.keywordCreated` (`kind` `alarm-keyword`, `value`), `incidents.import.unknownPerson`, `incidents.personTwiceInReport`, `incidents.api.unknownVehicle` (`kind` `vehicle`, `value`), `incidents.import.unknownFunction` (`kind` `function`, `value`), `incidents.import.reportEdited`.

**Einstellungsabschnitt** `incidents.general`: `homeMunicipalities`, `rates`, `rounding`, `compensationRelease`, `standbyHours`, `allowances`, `rules`.

**Verträge für andere Module:** `INCIDENTS_LOOKUP`, `INCIDENT_UNITS` (Einheit anmelden), `INCIDENTS_UNIT_REPORTS` (Berichte einer Einheit anlegen, löschen – nur ungesperrter Entwurf, sonst `incidents.unitReportNotDraft` –, abfragen). Ereignisse: `incidents.incident.created` (`IncidentCreatedEvent` mit `createdVia`), `incidents.report.released` (mit `departmentId` oder `unit`), `incidents.report.unlocked`.

## Duty officer

Alle Rechte gelten für die Gesamtwehr.

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/duty-officer/roster?from&to` | `duty-officer.read` oder `duty-officer.roster.manage` | EvD-Dienste mit Tagen, Satz und Betrag (`DutyAssignment[]`) |
| `POST`, `PUT`, `DELETE` | `/duty-officer/roster`, `/duty-officer/roster/:id` | `duty-officer.roster.manage` | EvD-Dienst pflegen (`DutyAssignmentInput`). Fehler: `duty-officer.unknownKind`, `duty-officer.unknownPerson` |
| `POST` | `/duty-officer/roster/republish` | `duty-officer.roster.manage` | `duty-officer.duty.changed` für die Dienste eines Zeitraums erneut senden (`{ from, to }`), Antwort `{ duties }` |
| `GET` | `/duty-officer/incidents/:incidentId` | `duty-officer.read`, `.reports.write` oder `.reports.manage` | EvD-Stand eines Einsatzes (`IncidentDutyOfficer`: `reportRequired`, `expected`, `report`, `exemption`, `onDuty`, `missing`) |
| `POST` | `/duty-officer/incidents/:incidentId/exemption` | `duty-officer.reports.manage` | „Kein EvD bei diesem Einsatz“ (`ExemptionInput`: `reason`); löscht den Entwurf des EvD-Berichts. Fehler: `incidents.unitReportNotDraft` (`409`) |
| `POST` | `/duty-officer/incidents/:incidentId/report` | `duty-officer.reports.manage` | „EvD-Bericht anlegen“: Ausnahme aufheben und EvD-Bericht anlegen |

**Importprofil `duty-officer.roster`** (Recht `duty-officer.roster.manage`, Datei `.ics`), Meldungscodes je Zeile: `imports.invalidDate`, `duty-officer.unknownPerson`, `duty-officer.ambiguousPerson`, `duty-officer.noKind`.

**Einstellungsabschnitt** `duty-officer.general`: `reportRequired`, `dutyKinds`.

**Verträge für andere Module:** `DUTY_ROSTER` (`startingIn(from, to)`), Ereignis `duty-officer.duty.changed` (`DutyChangedEvent`).

## Clothing

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/clothing/articles` | angemeldet | Artikel (`Article[]`, mit `minimumStock`) |
| `POST`, `PUT` | `/clothing/articles`, `/clothing/articles/:id` | `clothing.manage` für die Gesamtwehr | Artikel anlegen/ändern (`ArticleInput`, Mindestbestand je Größe). Fehler: `clothing.articleKeyTaken`, `clothing.articleKeyFixed`, `clothing.articleKindFixed` |
| `POST` | `/clothing/articles/template` | `clothing.manage` für die Gesamtwehr | Fehlende Artikel der Vorlage anlegen, Antwort `{ added }` |
| `GET` | `/clothing/items?status&articleKey&holderId&q` | `clothing.read`, abteilungsbezogen | Stücke mit letzter Wäsche, Imprägnierung, Prüfung (`lastInspectionPassed`), Fälligkeiten und Sperren (`blockedBy`) (`Item[]`); ohne `status` alle nicht ausgesonderten |
| `POST`, `PUT` | `/clothing/items`, `/clothing/items/:id` | `clothing.manage`, abteilungsbezogen | Stück anlegen/ändern (`ItemInput`, mit `barcode` und `rfid`). Fehler: `clothing.notInventoried`, `clothing.articleInactive`, `clothing.unknownSize`, `clothing.dateInFuture`, `clothing.inventoryNumberTaken` (409), `codes.taken` (409), `clothing.articleFixed` |
| `GET` | `/clothing/items/:id` | `clothing.read` | Stück mit Wäsche, Prüfungen und Verlauf, auch stornierte Einträge (`ItemDetail`) |
| `POST` | `/clothing/items/:id/issue` | `clothing.issue` für Stück und Person | Ausgeben (`ItemIssueInput`: `personId`, `date`, `notes`, `acceptOverdueInspection`). Fehler: `clothing.notInStock`, `clothing.articleInactive`, `clothing.failedInspection`, `clothing.awaitingLaundry`, `clothing.inspectionOverdue` (409), `clothing.issueBeforePurchase`, `clothing.issueBeforeReturn`, `clothing.dateInFuture`, `clothing.personLeft`, `clothing.personVeteran` |
| `POST` | `/clothing/issue` | wie oben | Mehrere Stücke an eine Person (`IssueManyInput`: zusätzlich `itemIds`), alle oder keines; Antwort `Item[]` |
| `POST` | `/clothing/items/:id/return` | `clothing.issue`; mit `retire` zusätzlich `clothing.manage` | Zurücknehmen (`ItemReturnInput`, `retire` sondert aus, `laundry` sperrt bis zur Wäsche). Fehler: `clothing.notIssued`, `clothing.returnBeforeIssue`, `clothing.dateInFuture`, `clothing.notTextile`, `auth.forbidden` (403, Aussondern ohne `clothing.manage`) |
| `POST` | `/clothing/return` | `clothing.issue`; mit `retire` zusätzlich `clothing.manage` | Mehrere Stücke zurücknehmen (`ReturnManyInput`: `date`, `notes`, `items` mit `itemId`, `retire`, `laundry`), alle oder keines |
| `POST` | `/clothing/items/:id/retire` | `clothing.manage` | Stück im Lager aussondern |
| `POST` | `/clothing/items/:id/inspections` | `clothing.issue` | Prüfung erfassen (`InspectionInput`). Fehler: `clothing.dateInFuture`, `clothing.dateBeforePurchase`, `clothing.retired` |
| `POST` | `/clothing/inspections` | `clothing.issue` | Prüfungen mehrerer Stücke (`InspectionsInput`: `date`, `inspector`, `results` mit `itemId`, `passed`, `notes`) |
| `POST` | `/clothing/care` | `clothing.issue` | Waschen oder Imprägnieren mehrerer Stücke (`CareInput`: `itemIds`, `kind`, `date`, `place`). Fehler: `clothing.notTextile`, `clothing.retired`, `clothing.dateInFuture`, `clothing.dateBeforePurchase` |
| `POST` | `/clothing/care/:id/cancel`, `/clothing/inspections/:id/cancel`, `/clothing/issues/:id/cancel` | `clothing.issue` als Erfasser oder `clothing.manage` der Abteilung | Eintrag mit Grund stornieren (`CancelInput`: `reason`). Fehler: `clothing.notOwnEntry` (403), `clothing.alreadyCancelled` (409), `clothing.notLastEntry` (409, nur letzte Ausgabe oder Rücknahme eines Stücks); Storno einer Rücknahme wie eine Ausgabe an die Person (`clothing.personLeft`, `clothing.personVeteran`) |
| `POST` | `/clothing/consumables` | `clothing.issue` für eine Abteilung der Person | Verbrauchsartikel abgeben (`ConsumableIssueInput`, mit `acceptLowStock`); nur Eintrag im Verlauf. Fehler: `clothing.inventoried`, `clothing.articleInactive`, `clothing.sizeRequired`, `clothing.unknownSize`, `clothing.dateInFuture`, `clothing.personLeft`, `clothing.personVeteran`, `clothing.stockInsufficient` (409, mit `available`; nur wenn für den Artikel Zugänge erfasst sind, mit `acceptLowStock` trotzdem) |
| `POST` | `/clothing/consumables/receipts` | `clothing.manage` in einer Abteilung | Zugang an Verbrauchsartikeln (`ConsumableReceiptInput`, Anzahl ab 1); Antwort der neue Bestand (`StockRow[]`). Fehler: `clothing.sizeRequired`, `clothing.unknownSize` |
| `POST` | `/clothing/consumables/counts` | `clothing.manage` in einer Abteilung | Ergebnis einer Zählung (`ConsumableCountInput`: `articleKey`, `size`, `counted`, `date`, `notes`): setzt den Zähler auf `counted`, gespeichert als Zugang mit der Differenz und der gezählten Anzahl; Antwort der neue Bestand |
| `GET` | `/clothing/stock?departmentId` | `clothing.read` | Bestand je Artikel und Größe mit Mindestbestand und `reorder` (`StockRow[]`) |
| `GET` | `/clothing/persons/:personId` | `clothing.read` für eine Abteilung der Person, sonst `404` | Zugeordnete Stücke, Verlauf und Größen (`PersonClothing`) |
| `PUT` | `/clothing/persons/:personId/sizes` | `clothing.issue` für eine Abteilung der Person | Größen der Person je Artikel (`SizeProfileInput`); leere und unbekannte Artikel entfallen. Eine Größe muss eine des Artikels sein, außer sie war schon gespeichert (`clothing.unknownSize`) |
| `GET` | `/clothing/me` | `clothing.self` | Eigene Schutzausrüstung |

## Inaktive Module

Anfragen an `/api/<modul-id>/…` eines deaktivierten Moduls ergeben `404` mit `{ "code": "modules.inactive", "module": "<id>" }`.
