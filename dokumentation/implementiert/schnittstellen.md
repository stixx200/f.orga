# HTTP-Schnittstellen (umgesetzter Stand)

Alle Pfade liegen unter `/api`.

**Anmeldung.** Sofern nicht als „offen“ markiert, braucht jeder Endpunkt eine Anmeldung:
- per Sitzungs-Cookie `forga_session`, bei ändernden Methoden zusätzlich mit dem Header `x-forga: 1`,
- oder per `Authorization: Bearer forga_…`.

**Rechte.** Die Spalte „Recht“ nennt die Berechtigung, die der Aufrufer in mindestens einer Abteilung braucht. Berechtigungen mit `stepUp` (alle `core.*`-Verwaltungsrechte, `masterdata.persons.sensitive`, `respiratory-protection.examinations`, `backup.manage`) und die Überweisungsdateien und Abrechnungen der Entschädigung verlangen zusätzlich eine mit dem zweiten Faktor bestätigte Sitzung ([Step-up](datenschutz.md#zweiter-faktor-bei-sensiblen-daten-step-up)); API-Tokens bekommen solche Rechte nicht.

**Fehler.** Fehlerantworten tragen einen `code`. Typische Codes:

| Code | Status | Bedeutung |
| --- | --- | --- |
| `auth.required` | `401` | nicht angemeldet |
| `auth.forbidden` | `403` | Berechtigung fehlt |
| `auth.stepUpRequired` | `403` | Berechtigung vorhanden, aber Sitzung nicht mit dem zweiten Faktor bestätigt (`enrolled`: Faktor eingerichtet) |
| `auth.csrf` | `403` | Header `x-forga` fehlt |
| `validation.failed` | `400` | Eingabe ungültig |
| `codes.taken` | `400`/`409` | Barcode oder RFID-Chip (`field`, `value`) gehört schon zu einem anderen Gegenstand des Moduls |

## Core

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/core/setup` | offen | `{ required, brigadeName, oidc, stage }`: Ist die Ersteinrichtung nötig? `stage` ist `FORGA_STAGE` (Band im Testsystem). `oidc: { label }` nur, wenn die Anmeldung mit dem Konto der Gemeinde eingerichtet und die Adresse von f.orga bekannt ist |
| `POST` | `/core/setup` | offen, nur vor der Einrichtung, mit Einrichtungsschlüssel | Feuerwehrname, Standardrollen aus den Rollenvorlagen und ersten Benutzer (Administrator, mit `email`) anlegen, anmelden (`Setup` mit `setupToken`). Fehler: `setup.invalidToken` (`403`), `setup.done` (`409`) |
| `POST` | `/core/password-reset` | offen | Link zum Zurücksetzen anfordern (`{ login }`), Antwort immer `{ ok: true }`. Fehler: `auth.resetNotConfigured` (`503`), `auth.resetRateLimited` (`429`) |
| `POST` | `/core/password-reset/confirm` | offen | Passwort mit Link aus Zurücksetzen oder Einladung setzen (`{ token, password }`). Fehler: `auth.resetInvalid` |
| `GET` | `/core/oidc/start`, `/core/oidc/callback` | offen | Anmeldung mit dem Konto der Gemeinde (Weiterleitungen) |
| `POST` | `/core/oidc/link` | angemeldet (Sitzung) | Eigenes Konto beim Anbieter verknüpfen; Antwort `{ url }` zum Anbieter |
| `POST` | `/core/login` | offen | Anmelden (`Login`), setzt das Cookie. Fehler: `auth.invalidCredentials` (`401`), `auth.locked` (`429`) |
| `POST` | `/core/logout` | offen | Sitzung beenden, Cookie löschen (`204`) |
| `GET` | `/core/session` | angemeldet | Benutzer (mit `language`, `email`, `receiveDigest`) und gehaltene Berechtigungen (`brigade` oder Liste von Abteilungs-IDs), dazu `stepUpPermissions`, `elevatedUntil` und `mfa: { enrolled, available, passwordRequired, recoveryCodesLeft, viaProvider }` |
| `GET` | `/core/step-up` | angemeldet | `204` in einer mit dem zweiten Faktor bestätigten Sitzung, sonst `403` `auth.stepUpRequired` (`{ enrolled }`) |
| `POST` | `/core/step-up` | angemeldet (Sitzung) | Sitzung 30 Minuten bestätigen (`StepUpInput`: `{ code }` oder `{ recoveryCode }`); Antwort `{ elevatedUntil }`. Fehler: `auth.invalidCode` (`400`), `auth.stepUpLocked` (`429`), `auth.mfaNotEnrolled`, `auth.mfaNoSecretKey` (`503`) |
| `POST` | `/core/step-up/end` | angemeldet | Bestätigung beenden (`204`) |
| `POST` | `/core/mfa/enrolment` | angemeldet (Sitzung, keine Impersonation) | Zweiten Faktor einrichten (`{ password }`, ohne Passwort im Konto entfällt es); Antwort `{ secret, uri }`. Fehler: `auth.passwordRequired` (`401`), `auth.mfaEnrolled` (`409`), `auth.mfaNoSecretKey` (`503`) |
| `POST` | `/core/mfa/enrolment/confirm` | angemeldet (Sitzung, keine Impersonation) | Einrichtung mit einem Code bestätigen (`{ code }`); Antwort `{ recoveryCodes, elevatedUntil }`. Fehler: `auth.invalidCode`, `auth.stepUpLocked`, `auth.mfaNotStarted` |
| `POST` | `/core/mfa/recovery-codes` | bestätigte Sitzung | Zehn neue Wiederherstellungscodes, die alten enden |
| `POST` | `/core/oidc/step-up` | angemeldet (Sitzung, keine Impersonation), Einstellung `oidc.stepUpViaProvider` | Sitzung durch erneute Anmeldung beim Anbieter bestätigen (`{ returnTo }`); Antwort `{ url }`. Fehler: `auth.oidcStepUpDisabled` |
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
| `DELETE` | `/core/users/:id/mfa` | `core.users.manage` | Zweiten Faktor eines anderen Benutzers zurücksetzen (`MfaReset`: `reason`); beendet seine Sitzungen, E-Mail an ihn. Fehler: `users.mfaResetSelf`, `users.targetWider`, `auth.mfaNotEnrolled` |
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
| `GET` | `/core/settings/:section` | angemeldet; `smtp`, `oidc`, `privacy`, `reminders`, `security` und `privacy.*` nur Verwalter (`privacy`, `security` auch `core.privacy.manage`, `privacy.*` nur `core.privacy.manage`) | Einstellungsabschnitt ohne geheime Felder und ohne Felder nur für Verwalter (z. B. `training.general.feedToken`), `null` wenn unvollständig |
| `PUT` | `/core/settings/:section` | `core.settings.manage` bzw. `<modul>.settings.manage`; Abschnitte mit eigenen Verwaltern (`SettingsAccess.managers`) nur diese | Einstellungsabschnitt speichern. `privacy.texts` nur über `/core/privacy/texts/:key` (`settings.dedicatedEndpoint`) |
| `POST` | `/core/settings/oidc/test` | `core.settings.manage` | Konfiguration des OIDC-Anbieters laden; Antwort `{ issuer, redirectUri }`. Fehler: `auth.oidcDiscoveryFailed` (`502`), `auth.oidcIncomplete`, `auth.oidcNoPublicUrl` |
| `GET` | `/core/onboarding` | `core.settings.manage` oder `core.users.manage` | Einrichtungsliste (`OnboardingItem[]`: `key`, `done`, `to`, bei Modulen `label`); außer in der Entwicklung zuerst `https`, erledigt bei einem Aufruf über HTTPS |
| `GET` | `/core/security/status` | `core.settings.manage` oder `core.privacy.manage` | `SecurityStatus`: `stage`, `https` (Anfrage über HTTPS), `publicUrlHttps`, `secureCookies` |
| `GET` | `/core/modules` | angemeldet | Aktive Module mit Name, Navigation und `frontend.entry` (`/modules/<id>/remoteEntry.js`) |
| `GET` | `/core/modules/status` | `core.modules.manage` | Alle installierten Module mit Name, Version, `active`, `requires` und `optional` |
| `GET` | `/core/modules/kiosk/:path` | offen | Kiosk-Seite eines aktiven Moduls (`KioskFrontend`: `moduleId`, `remote`, `exposed`, `entry`), z. B. `terminal`. Inaktiv: `404 modules.inactive` |
| `PUT` | `/core/modules/:id` | `core.modules.manage` | Aktivieren/Deaktivieren (`ModuleActivation`). Fehler: `modules.requirementsInactive`, `modules.requiredByActive` |
| `GET` | `/core/history/:entity/:id` | Prüfung des Moduls (`HistoryAccessRegistry`), sonst eine Berechtigung des Moduls von `:entity` | Historieneinträge des Datensatzes und seiner Kinddatensätze (`parentEntity`/`parentId`), neueste zuerst. Maskierte Felder haben `hidden: true`. Ohne Leserecht `404`. `:entity` z. B. `masterdata.person` |
| `GET` | `/core/codes?code=` | angemeldet; Treffer je nach Rechten im Modul | Gegenstände mit genau diesem Code (`SearchHit[]`): Barcode, RFID-Chip (Trennzeichen und Schreibweise egal), Inventar-, Seriennummer oder URL eines QR-Etiketts |
| `GET` | `/core/codes/modules` | angemeldet | Module, in denen der Benutzer Codes suchen kann (`string[]`) |
| `GET` | `/core/audit?from=&to=&userId=&action=&q=&limit=` | `core.audit.read` | Audit-Einträge (`AuditEntry`), neueste zuerst (höchstens 1000), mit `userName`, `impersonatorName` und `references`: die IDs in `details`, nach ID aufgelöst zu `{ kind, label, to?, anonymized? }` (`label` Text oder `{ de, en }`, `null` = gelöscht; `to` nur, wenn der Leser die Seite öffnen darf). `action` mit `.` am Ende filtert nach Präfix |
| `GET` | `/core/audit/filters` | `core.audit.read` | `{ actions, users }` für die Filter |
| `GET`, `POST`, `PUT` | `/core/privacy/…` | `core.privacy.manage`; Datenschutzhinweis ohne Anmeldung, Mein Bereich angemeldet | Datenschutzhinweis, Textbausteine, Betroffenenanfragen, Mein Bereich; Tabelle in [Datenschutz](datenschutz.md#betroffenenanfragen-l7-l19) |
| `GET` | `/core/export` | `core.data.export` | Module mit Vollexport, einschließlich `core` |
| `GET` | `/core/export/:module` | `core.data.export` | Vollexport eines Moduls (JSON-Datei); bei `core` Abschnitte und Felder nur für Verwalter nur für diese |
| `GET` | `/core/export/person/:personId` | `core.data.export` | Auskunft zu einer Person über alle Module (JSON-Datei). Fehler: `data.invalidPersonId` (`400`), `data.unknownPerson` (`404`) |
| `GET` | `/core/privacy/access-reports/preview?personId=&language=` | `core.privacy.manage` | Bereiche der Auskunft mit Zahl der Einträge (`AccessReportSectionSummary[]`). Fehler: `data.invalidPersonId`, `data.unknownPerson` |
| `GET` | `/core/privacy/access-reports?personId=` | wie oben | Erstellte Auskünfte der Person (`AccessReport[]`) |
| `POST` | `/core/privacy/access-reports` | wie oben | Auskunft erstellen (`AccessReportCreate`: `personId`, `language`, `includeJson`, `requestId`); `202` mit `status: pending`, das PDF entsteht im Hintergrund. Fehler: `privacy.noSecretKey` (`503`), `data.unknownPerson` (`404`), `privacy.requestMismatch` (`400`) |
| `GET` | `/core/privacy/access-reports/:id` | wie oben | Eine Auskunft (`AccessReport`) |
| `GET` | `/core/privacy/access-reports/:id/file?inline=1` | wie oben | PDF (entschlüsselt). Fehler: `privacy.documentExpired` (`410`), `privacy.documentNotReady`, `privacy.documentUnreadable` (`409`) |
| `POST` | `/core/privacy/access-reports/:id/hand-over` | wie oben | Übergabe vermerken (`AccessReportHandOver`: `channel` `self-service`/`in-person`/`post`, `date`, `closeRequest`); `self-service` stellt in „Mein Bereich“ bereit und benachrichtigt die Person. Fehler: `privacy.noAccount` (`400`), `privacy.documentExpired`, `privacy.documentNotReady` |
| `GET` | `/core/me/access-reports` | angemeldet | In „Mein Bereich“ bereitgestellte, nicht abgelaufene Auskünfte der eigenen Person (`MyAccessReport[]`) |
| `GET` | `/core/me/access-reports/:id/file` | angemeldet, eigene Person | PDF herunterladen; andere Auskünfte `404` |
| `GET` | `/core/retention/categories` | `core.settings.manage` oder `core.retention.manage` | Datenkategorien des Aufbewahrungsplans (`RetentionCategory[]`) |
| `POST` | `/core/retention/run` | `core.settings.manage` oder `core.retention.manage`; Probelauf mit `settings` nur `core.settings.manage` | Aufbewahrungsregeln anwenden (`RetentionRun`: `dryRun`, nur im Probelauf `settings.retention` mit anderen Regeln). Antwort `RetentionResult` (`counts`, `cases`, `effectiveYears`, `warnings`) |
| `GET` | `/core/retention/cases` | `core.retention.manage` | Aussonderungsfälle (`RetentionCase[]`) |
| `POST` | `/core/retention/cases/offer` | `core.retention.manage` | Dem Archiv anbieten (`RetentionOffer`); Antwort `{ offerId }` |
| `GET` | `/core/retention/offers/:offerId/export?lang=` | `core.retention.manage` | Export der Anbietung als ZIP (PDF je Datensatz, Anbietungsverzeichnis, CSV, JSON, Anhänge) |
| `POST` | `/core/retention/cases/decide` | `core.retention.manage` | Entscheidung des Archivs (`RetentionDecision`: `accepted`/`destroyed`, Datum, Bemerkung) |
| `POST` | `/core/retention/cases/defer` | `core.retention.manage` | Zurückstellen (`RetentionDeferral`: bis, Grund) |
| `POST` | `/core/retention/cases/execute` | `core.retention.manage` | Ausführen: anonymisieren oder löschen; Antwort `{ executed, failed }`. Einzelheiten und Fehlercodes im [Aufbewahrungsplan](aufbewahrung.md#schnittstellen) |
| `GET` | `/core/lists` | angemeldet | Listenvorlagen, für die der Benutzer das Recht hat (`ListInfo` mit `departments`: `brigade` oder die erlaubten Abteilungen) |
| `GET` | `/core/lists/:id?<parameter>&lang=` | Recht der Liste | Listeninhalt für die Vorschau (`ListData`: Titel, Untertitel, Spalten, Zeilen). Ungültige Parameter `400`, unbekannte oder nicht erlaubte Liste `404` |
| `GET` | `/core/lists/:id/parameters/:key/options?q=` | Recht der Liste | Auswahl für Parameter vom Typ `person` (Namenssuche ab 2 Zeichen) oder `choice` (Einträge des Moduls), höchstens 50 (`ListOption[]`) |
| `GET` | `/core/lists/:id/export/:format?<parameter>&lang=` | Recht der Liste | Datei als `pdf`, `xlsx` oder `csv` (Download). Unbekanntes Format: `lists.unknownFormat` |
| `GET` | `/core/tasks?asOf=&all=` | angemeldet | Fristen, für die der Benutzer zuständig ist (`Deadline[]`, optional mit Link `to`), früheste zuerst, ohne die im Profil ausgeblendeten (`all=true`: alle). `asOf` (`JJJJ-MM-TT`) für eine Vorschau, sonst heute |
| `POST` | `/core/tasks/digest` | `core.settings.manage` | Sammel-E-Mail sofort verschicken, Antwort `{ sent }`. Ohne SMTP: `mail.notConfigured` |
| `GET` | `/core/imports/profiles` | angemeldet | Importprofile, für die der Benutzer das Recht hat (`ImportProfileInfo`) |
| `POST` | `/core/imports` | Recht eines Importprofils | Datei hochladen (`multipart/form-data`, Feld `file`, `.xlsx`/`.csv`/`.txt`/`.ics`, höchstens 10 MB). Antwort `ImportUpload` mit Überschriften, Beispielzeilen und vorgeschlagener Zuordnung je Profil. Fehler: `imports.fileMissing`, `imports.unsupportedFormat`, `imports.empty` |
| `POST` | `/core/imports/url` | Recht eines Importprofils | Kalender von einer Adresse laden statt hochladen (`ImportUrlRequest`: `url` mit `https://`, `http://`, `webcal://` oder `webcals://`; `remember` = Adresse verschlüsselt für den Benutzer merken, nur mit `FORGA_SECRET_KEY`; ohne `url` wird die gemerkte Adresse geladen). Abruf durch den Server mit 15 s Zeitlimit, 10 MB, drei Weiterleitungen, ohne private Adressen (außer `FORGA_IMPORT_URL_ALLOW_PRIVATE=true`). Antwort `ImportUpload` (201) wie beim Hochladen, `fileName` ist nur Schema und Host. Fehler: `imports.urlInvalid`, `imports.urlForbidden` (`host`), `imports.urlUnreachable`, `imports.urlHttpStatus` (`status`), `imports.urlTooManyRedirects`, `imports.urlTooLarge`, `imports.urlNotCalendar`, `imports.empty`, `imports.urlNotRemembered` (404) |
| `GET` | `/core/imports/url` | Recht eines Importprofils | Gemerkte Kalenderadresse des Benutzers (`ImportRememberedUrl`: `canRemember`, `remembered` = `{ display, savedAt }` oder `null`); die volle Adresse wird nie ausgegeben |
| `DELETE` | `/core/imports/url` | angemeldet | Gemerkte Kalenderadresse vergessen (204) |
| `POST` | `/core/imports/:id/preview` | Recht des Profils | Probelauf (`ImportRequest`: `profile`, `mapping`, `options`, `mappings` = Art → Wert der Datei → Schlüssel des gewählten Eintrags), ändert nichts. Antwort `ImportResult` mit `dryRun`, `counts`, `rows` und `unmatched` (`{ kind, value, count }`, offene Werte je Art und Wert) |
| `POST` | `/core/imports/:id/apply` | Recht des Profils | Übernahme; danach ist der Upload gelöscht. Angewandt werden die `mappings` und danach die gemerkten Zuordnungen des Tabellen-Imports (nur mit aktivem Ziel); die benutzten Zuordnungen werden in `core.import_mapping` gemerkt. Audit `imports.applied` mit `profile`, `source` (`{ module: 'core' }`), `fileName`, `counts`. Fehler: `imports.uploadNotFound`, `imports.unknownProfile`, `imports.requiredFieldUnmapped`, `imports.unknownColumn`, `imports.unknownLookup` (`kind`), `imports.unknownMappingTarget` (`kind`, `value`, `key`) |
| `GET` | `/core/imports/lookups` | Recht eines Importprofils | Nachschlagelisten für nicht zugeordnete Werte (`ImportLookupInfo`: `kind`, `name`, `keyFormat` `slug`/`text`, `creatable` = Benutzer darf Einträge anlegen) |
| `GET` | `/core/imports/lookups/:kind` | Recht eines Importprofils | Wählbare Einträge (`ImportLookupEntry`: `key`, `name`), danach die Zusatzziele anderer Module. Fehler: `imports.unknownLookup` (404) |
| `POST` | `/core/imports/lookups/:kind` | Recht der Liste (z. B. `masterdata.catalogs.manage`) | Eintrag anlegen (`ImportLookupEntryInput`: `key`, `name`). Antwort `ImportLookupEntry` (201). Fehler: `auth.forbidden` mit `permissions`, `catalog.keyTaken` (409), `validation.failed`; Audit `imports.lookupEntryCreated` |
| `GET` | `/core/imports/mappings?kind=&q=&problems=` | Recht eines Importprofils | Gemerkte Zuordnungen des Tabellen-Imports (`RememberedMapping`: `id`, `kind`, `kindName`, `value`, `key`, `targetName`, `targetState` `active`/`inactive`/`deleted`, `profile`, `profileName`, `createdBy`, `createdAt`, `lastUsedAt`); `problems=true`: nur mit inaktivem oder gelöschtem Ziel |
| `DELETE` | `/core/imports/mappings/:id` | Recht eines Importprofils | Zuordnung vergessen (204); Audit `imports.mapping-deleted`. Fehler: `imports.mappingNotFound` (404) |

**Einstellungsabschnitte des Core:** `brigade` (`publicUrl` nur `https://`, `http://` für `localhost`; `email` als E-Mail-Adresse), `smtp` (Passwort nur schreibbar), `reminders` (`enabled`, `weekday` 1–7 mit 1 = Montag, `hour` 0–23, Europe/Berlin), `privacy` (`retention`: Regel je Kategorie und Unterart mit `years`, `action`, `afterDecision`, `specialCase`, `note`; ohne Eintrag gilt die Standardregel der Kategorie, siehe [Aufbewahrungsplan](aufbewahrung.md#regel-je-kategorie)), `oidc` (Client-Secret nur schreibbar).

**Importprofil `masterdata.persons`**, Meldungscodes je Zeile: `imports.requiredValueMissing`, `imports.invalidDate`, `masterdata.import.unknownDepartment`, `masterdata.import.departmentRequired`, `masterdata.import.ambiguous`, `masterdata.import.departmentCreated`, `masterdata.import.departmentDiffers`, `masterdata.import.unknownStatus`, `masterdata.import.sensitiveIgnored`, `masterdata.import.unknownExitReason` (`kind` `exit-reason`, `value`), `masterdata.import.leftIgnored`, `auth.forbidden`.

**Importprofil `masterdata.career`** (Lehrgänge, Dienstgrade und Ehrungen, Option `createCatalogEntries`, im Modul MP-Feuer nicht angeboten), Meldungscodes je Zeile: `imports.invalidDate`, `masterdata.import.unknownCareerKind`, `masterdata.import.unknownPerson`, `masterdata.import.ambiguous`, `masterdata.import.unknownCatalogEntry` (`kind` `qualification`/`rank`/`honor`, `value`, `name`), `masterdata.import.catalogEntryCreated`, `masterdata.descriptionRequired` (die Bezeichnung ist der Name des Sammellehrgangs selbst, z. B. „Anderer Lehrgang“), `masterdata.coursePassedAlready`, `masterdata.attendanceInFuture`, `auth.forbidden`. **Lehrgänge als Ziel:** Die Nachschlageliste `qualification` enthält nach den Qualifikationen die Lehrgänge des Lehrgangskatalogs mit dem Schlüssel `course:<Lehrgang>`. Eine Zeile, deren Bezeichnung zu keiner Qualifikation, aber zu einem Lehrgang passt, oder deren Bezeichnung in `mappings` bzw. einer gemerkten Zuordnung auf `course:<Lehrgang>` zeigt, wird eine bestandene Lehrgangsteilnahme statt einer Qualifikation; sie vermittelt die Qualifikationen des Lehrgangs. Für „→ Anderer Lehrgang“ sendet ein Skript `mappings: { qualification: { "Erste Hilfe": "course:other-course" } }` (Tabellen-Import und `PUT /api/mp-feuer/runs/:id`); die Bezeichnung wird die `description` der Teilnahme, eine Qualifikation entsteht nicht. Die gewählte Zuordnung wird wie sonst gemerkt, die nächste Übernahme ordnet „Erste Hilfe“ also ohne Rückfrage zu. Eine Teilnahme gilt als schon vorhanden bei gleicher Person, gleichem Lehrgang, gleichem Datum und gleicher Beschreibung; eine wiederholte Übernahme legt nichts doppelt an.

**Nachschlagelisten für Importe** (`ImportRegistry.registerLookup`): `qualification`, `rank`, `honor`, `exit-reason`, `function` (Kataloge, anlegen mit `masterdata.catalogs.manage`), `vehicle` (Fahrzeuge, Schlüssel = ID, nicht anlegbar), `alarm-keyword` (anlegen mit `incidents.settings.manage`), `session-type` (anlegen mit `training.settings.manage`). Zusatzziele anderer Module (`ImportRegistry.registerLookupExtras`, Schlüssel `<modul>:…`, nach den Einträgen der Liste): bei `function` die Ziele `incidents:during-working-hours`, `incidents:loss-of-earnings`, `incidents:ignore`. Gemerkt werden Zuordnungen nicht an den Einträgen, sondern in `core.import_mapping` (Tabellen-Import) bzw. `mp_feuer.mapping` (Modul MP-Feuer).

**`ImportService.runRows`** (in-process, kein HTTP): `user`, `profile`, `rows`, `options`, `mappings`, `dryRun`, `source` (`{ module, runId? }`), `mappingList` (`core` oder `none` mit `remembered`), optional `audit`. Antwort `{ result: ImportResult, used }`. Fehler wie oben; schreibt nach einer Übernahme `imports.applied`.

## Masterdata

Schemas aus `@forga/masterdata-contracts`. „Abteilungsbezogen“ heißt: Das Recht muss für die betroffene Abteilung oder die Gesamtwehr vorliegen.

**Kataloge**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/catalog?kind=` | angemeldet | Katalogeinträge, optional einer Art (`CatalogKind`) |
| `POST` | `/masterdata/catalog` | `masterdata.catalogs.manage` | Eintrag anlegen (`CatalogEntryInput`). Fehler: `catalog.keyTaken` (`409`), `validation.failed` für `attributes.*` |
| `PUT` | `/masterdata/catalog/:id` | `masterdata.catalogs.manage` | Name, Reihenfolge, `active` und Zusatzfelder ändern. `kind` und `key` sind fest (`catalog.keyImmutable`) |
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
| `POST`, `PUT` | `/masterdata/vehicles`, `/masterdata/vehicles/:id` | `masterdata.organization.manage`, abteilungsbezogen (alte und neue Abteilung) | Fahrzeug anlegen/ändern (`VehicleInput`). Sitzplätze und Statistik-Kategorie kommen ohne Angabe vom Fahrzeugtyp. Fehler: `catalog.unknownKey`, `masterdata.statisticsCategoryRequired`, `masterdata.unknownStation` |
| `DELETE` | `/masterdata/vehicles/:id` | `masterdata.organization.manage`, abteilungsbezogen | Nie genutztes Fahrzeug löschen. Fehler: `masterdata.inUse` (in Berichten); genutzte Fahrzeuge werden ausgesondert (`status: retired`) |

**Personen.** Alle Endpunkte außer der Liste (dort genügt `masterdata.persons.directory`) brauchen `masterdata.persons.read`, ändernde zusätzlich `masterdata.persons.write`, jeweils abteilungsbezogen. Personen außerhalb der eigenen Abteilungen ergeben `404`. Ändernde Endpunkte liefern die vollständige Person (`Person`) zurück.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/masterdata/persons?q=&departmentId=&status=&qualification=&includeLeft=` | Sichtbare Personen als `PersonSummary`, Ausgeschiedene nur mit `includeLeft=true` oder `status=left`. Personen, die nur über `masterdata.persons.directory` sichtbar sind, kommen mit Name, Status und Abteilungen und `restricted: true` |
| `GET` | `/masterdata/persons/:id` | Person mit Mitgliedschaften, Qualifikationen, Dienstgraden, Ehrungen, `processingRestriction` und `privacyInformation`. Sensible Felder nur mit `masterdata.persons.sensitive`, sonst `sensitiveHidden: true`, `notes` leer, `restPeriods` leer und `exitReason` `null`. Eingeschränkte Personen nur mit `core.privacy.manage` (`403 privacy.processingRestricted`); Personenliste und Suche lassen sie weg |
| `PUT`, `DELETE` | `/masterdata/persons/:id/restriction` | `core.privacy.manage`: Verarbeitung einschränken (`ProcessingRestrictionInput`) bzw. aufheben; Audit `privacy.restricted`, `privacy.restriction-lifted` |
| `GET` | `/masterdata/privacy/restricted`, `/masterdata/privacy/uninformed` | `core.privacy.manage`: eingeschränkte Personen (`RestrictedPerson[]`), Personen ohne vermerkte Information (`UninformedPerson[]`) |
| `POST` | `/masterdata/privacy/information` | `core.privacy.manage`: „Information erteilt am“ für viele Personen (`PrivacyInformationInput`), Antwort `{ count }` |
| `POST` | `/masterdata/persons` | Anlegen (`CreatePersonInput`, mindestens eine Mitgliedschaft). Status Standard `probation`, Probezeitende aus `masterdata.membership`. Fehler: `masterdata.personnelNumberTaken` (`409`), `masterdata.primaryMembershipRequired`, `masterdata.unknownDepartment`, `masterdata.birthDateInFuture`, `masterdata.belowMinimumAge` (laufende Mitgliedschaft in einer Einsatzabteilung unter `minimumAgeOperational`), `masterdata.belowMinimumAgeYouth` (Jugendfeuerwehr unter `minimumAgeYouth`), `masterdata.statusDoesNotFitDepartment` (Status passt nicht zum Typ der Stammabteilung), `masterdata.dateBeforeBirth`, `validation.failed` mit `bank.iban` bzw. `employer.iban` (Prüfziffer) |
| `PUT` | `/masterdata/persons/:id` | Stammdaten ändern (`PersonInput`; der Führerschein ändert sich nur über eine Kontrolle). Sensible Felder (auch `notes`) ohne Recht werden ignoriert. Fehler: `masterdata.birthDateInFuture`, `masterdata.dateBeforeBirth` (geändertes Geburtsdatum nach erfassten Daten bzw. geänderter Eintritt vor der Geburt) |
| `PUT` | `/masterdata/persons/:id/memberships` | Alle Mitgliedschaften ersetzen (Liste von `MembershipInput`). Recht für alte und neue Abteilungen nötig. Fehler: `masterdata.membershipPeriodInvalid`, `masterdata.primaryMembershipRequired`, `masterdata.belowMinimumAge` bzw. `masterdata.belowMinimumAgeYouth` (neue laufende Mitgliedschaft), `masterdata.dateBeforeBirth`, `masterdata.statusDoesNotFitDepartment` (neue Stammabteilung passt nicht zum Status) |
| `POST`, `PUT`, `DELETE` | `/masterdata/persons/:id/rest-periods`, `…/rest-periods/:entryId` | Ruhezeiten; zusätzlich `masterdata.persons.sensitive` |
| `POST`, `DELETE` | `/masterdata/persons/:id/qualifications`, `…/qualifications/:entryId` | Qualifikation eintragen (`PersonQualificationInput`, `description` Pflicht bei Katalogeinträgen mit `describe`) bzw. entfernen. Löst `masterdata.person.qualification-changed` aus. Fehler: `masterdata.dateBeforeBirth`, `masterdata.descriptionRequired` |
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

**Führerscheinkontrolle.** Lesen mit `masterdata.persons.read` oder `masterdata.licenses.check`, alles andere mit `masterdata.licenses.check`, jeweils abteilungsbezogen. Antwort der Änderungen ist der Führerschein der Person (`DriverLicenseFile`).

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/masterdata/persons/:id/driver-license` | Führerschein mit Klassen und Befristung, Modus, Stand, Fristen, Kontrollen, Anforderungen (Grund nur mit `masterdata.licenses.check`) und Transpondern (nur mit `masterdata.licenses.check`) |
| `POST` | `/masterdata/persons/:id/driver-license/checks` | Kontrolle im Original (`DriverLicenseCheckInput`; optional `token`). Fehler: `masterdata.checkInFuture`, `masterdata.unknownExaminer` (`400`), `masterdata.tokenTaken` (`409`), `masterdata.noSecretKey` (`503`) |
| `POST` | `/masterdata/persons/:id/driver-license/checks/:checkId/cancel` | Storno mit Grund (`{ reason }`). Fehler: `masterdata.checkCancelled` (`409`) |
| `POST` | `/masterdata/persons/:id/driver-license/requests` | Erneute Vorlage anfordern (`DriverLicenseRequestInput`: `reason`, `dueOn`) |
| `POST` | `/masterdata/persons/:id/driver-license/requests/:requestId/withdraw` | Anforderung zurücknehmen (`{ reason }`). Fehler: `masterdata.requestClosed` (`409`) |
| `POST` | `/masterdata/persons/:id/driver-license/tokens` | Transponder registrieren (`DriverLicenseTokenInput`: `kind` `nfc`/`barcode`, `code`), sperrt den bisherigen. Fehler: `masterdata.tokenTaken` (`409`), `masterdata.noSecretKey` (`503`); Audit `masterdata.license-token-registered` |
| `POST` | `/masterdata/persons/:id/driver-license/tokens/:tokenId/revoke` | Transponder sperren (`{ reason }`); Audit `masterdata.license-token-revoked` |
| `GET` | `/masterdata/driver-licenses` | Personen der Zielgruppe mit Stand (`DriverLicenseOverview`) |
| `GET` | `/masterdata/me/driver-license` | eigener Führerschein (`MyDriverLicense`, Recht `masterdata.self`) |

**Einstellungsabschnitt** `masterdata.driverLicense` (`DriverLicenseSettings`): `mode`, `intervalMonths`, `monitoredClasses`, `driverQualifications`, `leadDays`, `selfCheck`, `inPersonEveryMonths`.

Unbekannte Katalogschlüssel ergeben `400` mit `catalog.unknownKey`.

**Lehrgänge**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/courses` | angemeldet | Lehrgangskatalog |
| `POST`, `PUT` | `/masterdata/courses`, `/masterdata/courses/:id` | `masterdata.catalogs.manage` | Lehrgang anlegen/ändern (`CourseInput`, auch `requiredQualifications`, `minimumAge`, `allowedStatuses`, `targets`, `describe` für Sammellehrgänge wie „Anderer Lehrgang“). Fehler: `catalog.keyTaken`, `catalog.keyImmutable`, `catalog.unknownKey`, `masterdata.courseOwnPrerequisite`, `masterdata.unknownDepartment` |
| `POST` | `/masterdata/courses/templates/bw` | `masterdata.catalogs.manage` | BW-Lehrgänge anlegen, auch den Sammellehrgang `other-course` „Anderer Lehrgang“ (`describe`, ohne Qualifikation); die Qualifikationen der BW-Katalogvorlage müssen existieren. Antwort `{ added }` |
| `GET` | `/masterdata/persons/:id/course-attendances` | `masterdata.persons.read`, abteilungsbezogen | Teilnahmen der Person |
| `POST` | `/masterdata/persons/:id/course-attendances` | `masterdata.persons.write` oder `masterdata.courses.plan`, abteilungsbezogen | Teilnahme eintragen (`CourseAttendanceInput`, Ende nicht vor Beginn, Daten ab 1900; `description` nur bei Lehrgängen mit `describe`, dort Pflicht: `masterdata.descriptionRequired`, „bestanden“ einmal je Beschreibung). Bei `passed`: Qualifikationen anlegen, offene Vormerkungen `completed`, Ereignisse `masterdata.course.passed` und `masterdata.person.qualification-changed`; sind alle Qualifikationen schon gültig vorhanden, nur mit `confirmHeld: true`, dann ohne neue Qualifikation und ohne Ereignis. Bei `failed`: offene Vormerkungen dieses, eines früheren oder keines Termins `failed`. Fehler: `masterdata.courseNotFinished` (bestanden mit Ende nach heute), `masterdata.attendanceInFuture` (Beginn nach heute), `masterdata.dateBeforeBirth`, `masterdata.coursePassedAlready` (`409`), `masterdata.qualificationsHeld` (`409`) |
| `DELETE` | `/masterdata/persons/:id/course-attendances/:attendanceId` | `masterdata.persons.write` oder `masterdata.courses.plan`, abteilungsbezogen | Teilnahme und die daraus entstandenen Qualifikationen entfernen (`204`); die damit erledigte bzw. geschlossene Vormerkung wird wieder `confirmed`. Bei bestandener Teilnahme `masterdata.course.revoked` und `masterdata.person.qualification-changed` |
| `POST` | `/masterdata/course-results` | `masterdata.persons.write` oder `masterdata.courses.plan` je Person | Ergebnisse mehrerer Personen auf einmal (`CourseResultsInput`: `course`, `runId` oder Datum und Ort, `results`, `description` bei Lehrgängen mit `describe`, `confirmHeld`); Antwort `{ recorded, skipped: [{ personId, code }] }`, übersprungen u. a. mit `masterdata.resultRecordedAlready` (Ergebnis für den Termin vorhanden) |
| `GET` | `/masterdata/course-runs?course=&year=` | `masterdata.courses.plan` | Lehrgangstermine (`CourseRun`) mit Zahl der zugeordneten Vormerkungen und erfassten Teilnahmen |
| `POST`, `PUT`, `DELETE` | `/masterdata/course-runs`, `/masterdata/course-runs/:id` | `masterdata.courses.plan` | Termin anlegen/ändern (`CourseRunInput`) bzw. löschen; mit erfassten Ergebnissen sind Löschen und das Verschieben der Daten gesperrt (`masterdata.courseRunHasResults`, `409`) |
| `GET` | `/masterdata/course-needs` | `masterdata.courses.plan` | Lehrgangsbedarf (`CourseNeed[]`): je aktivem Lehrgang (ohne Sammellehrgänge) und Abteilung `have`, `target`, `nominated`, gezählt über Mitglieder mit einem für den Lehrgang zugelassenen Status |
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
| `POST`, `PUT` | `/incidents/keywords`, `/incidents/keywords/:id` | `incidents.settings.manage` | Stichwort anlegen/ändern (`AlarmKeywordInput`); der Schlüssel bleibt fest. Fehler: `catalog.keyTaken` |
| `POST` | `/incidents/keywords/templates/bw` | `incidents.settings.manage` | Fehlende Stichworte der BW-Vorlage anlegen, Antwort `{ added }` |
| `GET` | `/incidents/incidents?from&to&departmentId&status&mine&withoutStatistics` | `incidents.reports.read` | Einsätze mit mindestens einem lesbaren Bericht, neueste zuerst (höchstens 500); `withoutStatistics=true`: Einsätze gezählter Stichworte ohne Statistik |
| `POST` | `/incidents/incidents` | `incidents.reports.write` für jede genannte Abteilung, das Schreibrecht der Einheit für jede genannte Einheit (Freigeber: alle) | Einsatz (`CreateIncident`: `IncidentInput`, `departmentIds` und `units`, Schlüssel feuerwehrweiter Einheiten wie `duty-officer`) mit je einem Berichtsentwurf anlegen; ein Einsatz kann auch nur den Bericht einer Einheit haben (z. B. nur den EvD-Bericht), ohne Abteilung und Einheit geht es nur für Freigeber. Sendet `incidents.incident.created` mit den gewünschten Einheiten; die Antwort enthält auch die daraufhin angelegten Berichte anderer Module (z. B. EvD-Bericht). Fehler: `incidents.departmentRequired`, `incidents.unknownUnit` (Einheit unbekannt oder ihr Modul inaktiv), `incidents.dispatchNumberTaken` (`409`), `incidents.unknownKeyword` |
| `GET` | `/incidents/incidents/matches?dispatchNumber&alarmKeyword&alarmedAt&street&city` | `incidents.reports.write` | Vorhandene Einsätze mit derselben Nummer (Groß-/Kleinschreibung egal) oder ±2 h mit demselben Stichwort oder Ort, auch nicht lesbare, nur Mindestdaten und die lesbaren Berichte (`IncidentMatch[]` mit `ownReports`) |
| `GET` | `/incidents/authors?departmentId` bzw. `?unit` | Schreibrecht für die Abteilung bzw. Einheit | Personen, die Verfasser sein können (aktives Konto mit Schreibrecht für die Abteilung bzw. Einheit oder Freigaberecht), als ID-Liste |
| `GET` | `/incidents/units?active` | angemeldet | Gesamtwehrweite Einheiten mit eigenen Berichten (`IncidentUnit[]`: Schlüssel, Modul, Name, Kurzname, Nummernpräfix, Rechte, Fahrzeugpflicht); `active=true`: nur die Einheiten aktiver Module |
| `GET` | `/incidents/incidents/:id` | `incidents.reports.read` | Einsatz mit Berichtsübersicht und Statistik (`statistics`, `statisticsSuggestion`, `statisticsCounted`, `statisticsEditable`) |
| `PUT` | `/incidents/incidents/:id` | Schreibrecht für den Hauptbericht | Einsatzdaten ändern (`IncidentUpdate` mit `version`); Schreiber nur, solange alle Berichte ungesperrte Entwürfe sind. Fehler: `conflict.stale`, `incidents.reportLocked`, `incidents.incidentSubmitted` (`403`), `incidents.incidentReleased` (`409`, ein Bericht ist freigegeben), `incidents.dispatchNumberTaken` |
| `PUT` | `/incidents/incidents/:id/costs` | `incidents.costs` | Kosten und Bemerkungen des ganzen Einsatzes (`IncidentCosts`: `chargeable`, `chargeableReason` – Pflicht, wenn kostenpflichtig –, `notes`, `version`); auch nach der Freigabe der Berichte |
| `PUT` | `/incidents/incidents/:id/retention` | `incidents.reports.read`, dazu feuerwehrweit `incidents.reports.release`, `incidents.costs` oder Schreibrecht am Hauptbericht | „30 Jahre aufbewahren (Sonderfall)“ (`IncidentRetention`: `retentionSpecial`, `version`), auch nach der Freigabe; Audit `incidents.retention-changed`. Fehler `incidents.anonymized` (409), `conflict.stale` |
| `POST` | `/incidents/incidents/:id/reports` | `incidents.reports.write` für die Abteilung | Bericht für eine weitere Abteilung anlegen (`NewReportInput`), auch bei einem Einsatz, den der Benutzer noch nicht lesen darf. Fehler: `incidents.reportExists` (`409`) |
| `GET` | `/incidents/reports/:id` | `incidents.reports.read` | Bericht (`Report`) mit Entschädigung je Person, `compensationTotal`, `findings`. Ohne Leserecht `404` |
| `PUT` | `/incidents/reports/:id` | `incidents.reports.read`, Schreibrecht am Bericht | Inhalt speichern (`ReportUpdate`: `ReportInput` mit Pflichtfeld `version`; `bookingsKnownAt` und `personnel[].bookedAt` für den Abgleich mit Eintragungen vom Infoterminal). Fehler: `conflict.stale`, `incidents.reportReleased`, `incidents.reportLocked`, `incidents.notDraft` (`403`), `incidents.unknownPerson`, `incidents.unknownVehicle`, `incidents.personTwiceInReport` |
| `GET` | `/incidents/reports/:id/pdf?lang` | `incidents.reports.read` | Bericht als PDF |
| `GET` | `/incidents/reports/:id/previous-crew?vehicleId` | `incidents.reports.read` | Besatzung des Fahrzeugs im letzten früheren Bericht der Abteilung (`PreviousCrew`) |
| `PUT` | `/incidents/incidents/:id/statistics` | `incidents.reports.read`, dazu Schreibrecht an einem Bericht des Einsatzes oder `incidents.reports.release` (Gesamtwehr) | Statistik des Einsatzes setzen oder entfernen (`StatisticsUpdate`: `statistics` oder `null`, `version` des Einsatzes), ohne neue Freigabe. Schreiber nur, solange einer ihrer Berichte ein ungesperrter Entwurf ist. Fehler: `auth.forbidden`, `incidents.statisticsSubmitted` (`403`), `incidents.statisticsClosed` (`409`, Jahresstatistik abgeschlossen), `incidents.statisticsNotCounted` (`400`), `conflict.stale` |
| `GET` | `/incidents/me?year` | `incidents.self` | Eigene Einsätze des Jahres (`MyIncidents`) der verknüpften Person |
| `GET` | `/incidents/reports/:id/revisions` | `incidents.reports.read` | Versionen des Berichts, neueste zuerst (`ReportRevision[]`: `id`, `savedAt`, `userName`, `personnelCount`) |
| `POST` | `/incidents/reports/:id/revisions/:revisionId/restore` | `incidents.reports.read`, Schreibrecht am Bericht | Version wiederherstellen; wie Speichern (neue Version, Sperre durch Freigeber). Fehler wie `PUT` |
| `POST` | `/incidents/reports/:id/primary` | `incidents.reports.read`, Schreibrecht am Bericht | Zum Hauptbericht machen. Fehler: `incidents.reportReleased` (der Bericht oder der bisherige Hauptbericht ist freigegeben), `incidents.unitReportNotPrimary` (`400`, Bericht einer Einheit) |
| `POST` | `/incidents/reports/:id/submit` | `incidents.reports.read`, Schreibrecht am Bericht | Fertig melden (`Submit` mit `acknowledgements`). Fehler: `incidents.findingsOpen`, `incidents.warningsNotAcknowledged` (`400`), `incidents.invalidTransition` (`409`) |
| `POST` | `/incidents/reports/:id/return` | `incidents.reports.release` (Gesamtwehr) oder `incidents.reports.review` für die Abteilung (bei Einheiten ihr Prüfrecht) | Zurückgeben (`ReturnToAuthor`); gesperrte Berichte nur Freigeber (`incidents.reportLocked`), die Sperre fällt nur mit `incidents.reports.unlock` |
| `POST` | `/incidents/reports/:id/release` | `incidents.reports.release` | Freigeben (`Release`: `compensation` nur aus `review`, `billing` aus `review` oder `released-compensation`). Fehler: `incidents.findingsOpen`, `incidents.invalidTransition`, `incidents.compensationReleaseDisabled` (`400`, wenn `compensationRelease` aus ist) |
| `POST` | `/incidents/reports/release` | `incidents.reports.release` | Mehrere Berichte freigeben (`ReleaseMany`), Antwort `ReleaseManyResult` (`released`, `failed` mit Fehlercode) |
| `POST` | `/incidents/reports/:id/unlock` | `incidents.reports.unlock` | Sperre aufheben (`Unlock`: `reason`, `toStatus`; ein gesperrter Entwurf nur nach `draft`). Fehler: `incidents.notLocked`, `incidents.invalidTransition` |
| `POST` | `/incidents/reports/:id/take-over` | `incidents.reports.release` (Gesamtwehr) | Bericht aus MP-Feuer in f.orga weiterführen (`managedBy` → `null`); spätere Läufe des Moduls MP-Feuer ändern ihn nicht mehr. Fehler: `incidents.notFromMpFeuer` (`409`) |
| `DELETE` | `/incidents/reports/:id` | `incidents.reports.read`, Schreibrecht am Bericht | Entwurf eines Abteilungsberichts löschen (`204`, Ereignis `incidents.report.unlocked` mit Grund `deleted`); der letzte Abteilungsbericht löscht den Einsatz und die Entwürfe der Einheiten mit. Fehler: `incidents.invalidTransition`, `incidents.primaryHasSiblings`, `incidents.unitReportManaged` (`409`, Bericht einer Einheit: nur über ihr Modul) |
| `POST` | `/incidents/v1/incidents` | `incidents.api.create` | Externe API (`ExternalIncidentInput`), idempotent über die Leitstellennummer. Antwort `ExternalIncidentResult` mit `warnings` (u. a. `incidents.departmentNotOperational` für Abteilungen, die keine Einsatzabteilung sind) |
| `GET` | `/incidents/compensation/check?from&to` | `incidents.compensation.export` | Prüfung vor der Auszahlung (`CompensationCheck`: nicht freigegebene Berichte und Personalprobleme) |
| `GET` | `/incidents/compensation/export?from&to&includeUnreleased&lang` | `incidents.compensation.export` | Abrechnungsexport als Excel; Blatt „Hinweise“ mit dem Ergebnis der Prüfung |
| `GET` | `/incidents/statistics/:year` | `incidents.statistics` | Jahresstatistik (`AnnualStatistics`: Werte mit berechnet/korrigiert/gültig, Prüfungen, Abschluss) |
| `PUT` | `/incidents/statistics/:year/corrections` | `incidents.statistics` | Korrekturen (`StatisticsCorrections`, Schlüssel `F121:D`, `null` entfernt). Fehler: `incidents.statisticsClosed` (`409`) |
| `POST` | `/incidents/statistics/:year/close`, `/incidents/statistics/:year/reopen` | `incidents.statistics` | Abschließen (`CloseStatistics`: `force` bei offenen Prüfungen, sonst `incidents.statisticsChecksOpen`; speichert die Werte) bzw. wieder öffnen |
| `GET` | `/incidents/statistics/:year/export` | `incidents.statistics` | Ausgefüllte Import-Vorlage des Landesportals (`Jahresstatistik_<Jahr>.xlsx`) |

**Listen** über `/core/lists`: `incidents.open-reports`, `incidents.incidents`, `incidents.per-department`, `incidents.hours-per-person`.

**Importprofil `incidents.personnel`** „Einsatzpersonal“ (Recht `incidents.reports.release`, eine Zeile je Person und Bericht, Option `createKeywords`). Felder: `dispatchNumber`, `incidentNumber`*, `begin`*, `end`, `keyword`*, `message`, `street`, `postalCode`, `city`, `district`, `object`, `department`*, `unit`, `personName`, `personnelNumber`, `from`, `to`, `vehicle`, `vehicleAlarmedAt`, `vehicleDepartedAt`, `vehicleReturnedAt`, `vehicleKilometres`, `standby`, `breathing`, `lossOfEarnings`, `primary` (ja/nein), `status` (`draft`, `released-compensation`, `released-billing` oder Bezeichnungen), `situation`, `actions`, `narrative`, `cause`, `commander`, `function`, Statistik `mainType`, `fireSize`, `technicalCategory`, `falseAlarmType` (Codes oder Bezeichnungen), `ownMunicipality`, `vehicleFire`, `trafficAccident` (ja/nein), `rescued`, `rescuedSmokeInhalation`, `dead`, `animalsRescued`, dazu `chargeable` (* Pflicht). `managedBy` der Berichte: `mp-feuer` bei `source.module = 'mp-feuer'`, sonst `import`. Meldungscodes je Zeile: `masterdata.import.unknownDepartment`, `incidents.departmentNotOperational`, `incidents.import.unknownUnit`, `imports.invalidDate`, `incidents.unknownKeyword`, `incidents.import.keywordCreated` (`kind` `alarm-keyword`, `value`), `incidents.import.invalidStatistics` (`field`, `value`), `incidents.import.unknownPerson`, `incidents.personTwiceInReport`, `incidents.api.unknownVehicle` (`kind` `vehicle`, `value`), `incidents.import.unknownFunction` (`kind` `function`, `value`), `incidents.import.reportEdited`. Für Funktionstexte, die keine Funktion sind, gibt es in `mappings.function` zusätzlich die Ziele `incidents:during-working-hours` (`duringWorkingHours`), `incidents:loss-of-earnings` (`lossOfEarnings`) und `incidents:ignore` (keine Meldung), jeweils ohne Funktion, z. B. `{ "function": { "Arbeitszeit Stadt Musterstadt": "incidents:during-working-hours" } }`; gemerkt werden sie in der Zuordnungsliste des Aufrufers.

**Einstellungsabschnitte** `incidents.general`: `homeMunicipalities`, `rates`, `rounding`, `compensationRelease`, `standbyHours`, `allowances`, `rules`, `externalLeading`, `externalEventsFrom`.

**Parallelbetrieb:** Führt MP-Feuer (`externalLeading: 'mp-feuer'`), antworten die ändernden Endpunkte der Berichte (Speichern, Wiederherstellen, Hauptbericht, Verfasser, Fertigmelden, Zurückgeben, Freigeben, Sperre aufheben, Löschen) bei Berichten mit `managedBy: 'mp-feuer'` mit `409` `incidents.ledByMpFeuer`, `PUT /incidents/incidents/:id` und `PUT /incidents/incidents/:id/statistics` ebenso, wenn ein Bericht des Einsatzes aus MP-Feuer kommt. `Report` und die Berichtsübersicht des Einsatzes liefern `managedBy` (`api`, `mp-feuer` oder `null`).

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

**Importprofil `duty-officer.roster`** (Recht `duty-officer.roster.manage`, Datei `.ics` oder Kalenderadresse), Meldungscodes je Zeile: `imports.invalidDate`, `duty-officer.unknownPerson`, `duty-officer.ambiguousPerson`, `duty-officer.noKind`.

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

## Info terminal

**Verwaltung.** Abteilungsrechte; ändernde Aktionen brauchen `info-terminal.manage` für alle Abteilungen des Terminals (vorher und nachher), sonst `auth.forbidden`. Unbekannte oder nicht lesbare Terminals: `404`. Widerrufene Terminals: `409 info-terminal.revoked`.

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/info-terminal/terminals?includeRevoked` | `info-terminal.read` | Terminals, zu deren Abteilungen eine lesbare gehört (`Terminal[]`, nie mit Schlüssel oder Link) |
| `POST` | `/info-terminal/terminals` | `info-terminal.manage` | Anlegen (`TerminalInput`); Antwort `TerminalLink` mit dem Link. Fehler: `info-terminal.unknownStation`, `masterdata.unknownDepartment`, `info-terminal.noPublicUrl` (`503`), `info-terminal.noSecretKey` (`503`) |
| `PUT` | `/info-terminal/terminals/:id` | `info-terminal.manage` | Bezeichnung, Abteilungen, erlaubte Aktionen, Sprache ändern (`TerminalUpdate` mit `version`) |
| `POST` | `/info-terminal/terminals/:id/link` | `info-terminal.manage` | Link erneut anzeigen (`{ purpose: 'show' \| 'copy' \| 'open' }`), Audit `info-terminal.link-shown`. Fehler: `info-terminal.linkUnavailable` (`409`, Server-Schlüssel geändert) |
| `POST` | `/info-terminal/terminals/:id/rotate` | `info-terminal.manage` | Neuer Link; der alte gilt sofort nicht mehr |
| `POST` | `/info-terminal/terminals/:id/revoke` | `info-terminal.manage` | Widerrufen, endgültig |

**Kiosk.** Offen für den Auth-Guard, angemeldet wird mit dem Cookie `forga_terminal` (Sitzungen und API-Tokens gelten nicht). Ändernde Methoden brauchen `x-forga: 1`. `departmentId` (Abfrage bzw. Body) muss eine Abteilung des Terminals sein (`403 info-terminal.departmentNotAllowed`). Fehler: `info-terminal.invalidKey` (`401`), `info-terminal.revoked` (`403`), `info-terminal.tooManyAttempts` bzw. `info-terminal.tooManyRequests` (`429`), `info-terminal.windowClosed` (`409`).

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `POST` | `/info-terminal/kiosk/session` | Schlüssel aus dem Link (`{ key }`) gegen das Cookie tauschen; Antwort `KioskTerminal` |
| `GET` | `/info-terminal/kiosk/terminal` | Wache, Abteilungen des Umschalters, erlaubte Aktionen, Sprache, Einstellungen, Serverzeit |
| `GET` | `/info-terminal/kiosk/overview?departmentId` | Einsätze und Dienste im Zeitfenster, bald öffnende Dienste, nächster Dienst (`KioskOverview`) |
| `GET` | `/info-terminal/kiosk/members?departmentId` | Namenskacheln |
| `GET` | `/info-terminal/kiosk/persons?departmentId&q` | Namenssuche (ab 3 Zeichen, höchstens 10) |
| `GET` | `/info-terminal/kiosk/reports/:reportId?departmentId` | Bericht für das Terminal (`KioskReport`: Eintragungen, Personen anderer Berichte, Fahrzeuge, Funktionen). Fehler: `info-terminal.notOperational` (`403`), `info-terminal.reportNotFound` (`404`) |
| `PUT` | `/info-terminal/kiosk/reports/:reportId/entries/:personId` | Eintragen oder ändern (`TerminalBookingInput` und `departmentId`). Fehler: `incidents.notDraft`, `incidents.reportLocked`, `incidents.reportReleased` (`403`), `incidents.unknownPerson`, `incidents.unknownVehicle`, `info-terminal.unknownFunction`, `info-terminal.endBeforeStart` (`400`), `info-terminal.personInOtherReport`, `info-terminal.entryLocked`, `incidents.ledByMpFeuer` (`409`, Bericht von MP-Feuer geführt) |
| `DELETE` | `/info-terminal/kiosk/reports/:reportId/entries/:personId?departmentId` | Eintragung vom Terminal austragen (`204`). Fehler: `info-terminal.entryNotFound`, `info-terminal.entryLocked` |
| `GET` | `/info-terminal/kiosk/keywords` | Alarmstichworte für „Neuer Einsatz“ |
| `POST` | `/info-terminal/kiosk/incidents/matches` | Passende Einsätze mit Mindestdaten (`KioskIncidentInput`, `KioskMatch[]`) |
| `POST` | `/info-terminal/kiosk/incidents` | Einsatz mit Bericht anlegen oder mit `joinIncidentId` den Bericht der Abteilung hinzufügen; Antwort `{ reportId }`. Fehler: `info-terminal.newIncidentNotAllowed` (`403`), `info-terminal.alarmTooOld`, `info-terminal.alarmInFuture` (`400`), `info-terminal.incidentNotFound` (`404`), `incidents.ledByMpFeuer` (`409`, vorhandener Bericht der Abteilung von MP-Feuer geführt) |
| `GET` | `/info-terminal/kiosk/sessions/:sessionId?departmentId` | Dienst mit Anwesenden (`KioskSessionDetail`). Fehler: `info-terminal.trainingNotAllowed` (`403`), `info-terminal.sessionNotFound` (`404`), `training.closed` (`409`) |
| `PUT` | `/info-terminal/kiosk/sessions/:sessionId/attendance/:personId` | Anwesenheit eintragen oder ändern (`TerminalCheckInInput` und `departmentId`), unbestätigt. Fehler: `training.unknownPerson`, `training.attendanceOutsideSession`, `info-terminal.entryLocked` |
| `DELETE` | `/info-terminal/kiosk/sessions/:sessionId/attendance/:personId?departmentId` | Unbestätigte Eintragung vom Terminal entfernen |
| `POST` | `/info-terminal/kiosk/driver-license` | Selbstkontrolle des Führerscheins (`KioskDriverLicenseInput`: `code`, `confirm`, `language`); Antwort `KioskDriverLicense` mit Name, Klassen, letzter Kontrolle, Stand (`allowed`, `in-person`, `off`) und nach Bestätigung `confirmed`. Fehler: `info-terminal.licenseNotRegistered` (`404`), `info-terminal.licenseCheckOff` (`403`), `info-terminal.licenseInPerson` (`409`), `info-terminal.tooManyRequests` (`429`, mehr als 10 unbekannte Codes in 10 Minuten) |

**Einstellungsabschnitt** `info-terminal.general`: `afterEndMinutes`, `openEndHours`, `maxAlarmAgeHours`, `idleSeconds`, `notSeenWarningDays`.

**Verträge anderer Module für das Infoterminal:** `INCIDENTS_TERMINAL_BOOKING` (Einsatzberichte), `TRAINING_TERMINAL_CHECK_IN` (Dienste, optional).

## MP-Feuer

Modul `mp-feuer`, Pfade unter `/api/mp-feuer`. Rechte `mp-feuer.transfer` (Gesamtwehr) und `mp-feuer.read` (Gesamtwehr); zusätzlich prüft jeder Datensatz das Recht seines Importprofils. Ist das Modul abgeschaltet: `404 modules.inactive`.

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `POST` | `/mp-feuer/runs` | `mp-feuer.transfer` | Transferdateien hochladen (`multipart/form-data`, Feld `files`, bis 40 Dateien, je 200 MB). Liest die Archive und legt einen Lauf an (`status: prepared`). Antwort `MpFeuerRun` (201): `archives` (`key`, `fileName`, `label`, `content` mit `persons`/`incidents`/`sessions`, vorbelegt `department`, `unit`, `skip`, `remembered`, `superseded`), `datasets` (`profile`, `name`, `order`, `rowCount`, `enabled`, `options`, `optionInfo`, `locked`, `counts`, `unmatched`, `parts`, `partsDone`, `durationMs`), `units` (Einheiten aktiver Module oder `null`), `mappings`, `progress`, `unmatched`, `error`, `cancelRequested`, `dryRunOutdated`. Fehler: `mp-feuer.filesMissing`, `mp-feuer.archiveUnreadable`, `mp-feuer.archiveEncrypted`, `mp-feuer.archiveTooLarge` (jeweils mit `name`) |
| `PUT` | `/mp-feuer/runs/:id` | `mp-feuer.transfer` | Auswahl (`RunSelection`, alle Teile optional): `archives` = Archivnummer → `{ department: Name \| null, unit: Schlüssel \| null, skip }`, `datasets` = Profil → `{ enabled, options }`, `mappings` = Art → Wert → Schlüssel. Antwort `MpFeuerRun`. Fehler: `mp-feuer.unknownDepartment` (`name`), `mp-feuer.unknownUnit` (`unit`), `imports.unknownLookup`, `imports.unknownMappingTarget`, `mp-feuer.runActive` (409), `mp-feuer.runFinished` (409) |
| `POST` | `/mp-feuer/runs/:id/dry-run` | `mp-feuer.transfer` | Probelauf im Hintergrund starten (202, Antwort `MpFeuerRun` mit `status: dry-running`). Fehler: `mp-feuer.runActive` (409, auch wenn ein anderer Lauf arbeitet), `mp-feuer.runFinished` (409), `mp-feuer.nothingSelected` |
| `POST` | `/mp-feuer/runs/:id/apply` | `mp-feuer.transfer` | Übernahme im Hintergrund starten (202). Fehler: `mp-feuer.dryRunOutdated` (409, ohne Probelauf oder wenn sich Auswahl oder Zuordnungen seither geändert haben), `mp-feuer.runActive` (409) |
| `POST` | `/mp-feuer/runs/:id/cancel` | `mp-feuer.transfer` | Nach dem laufenden Teil anhalten (202, `cancelRequested: true`). Fehler: `mp-feuer.runNotActive` (409) |
| `GET` | `/mp-feuer/runs/:id` | `mp-feuer.read` | Stand und Fortschritt (`MpFeuerRun`, zum Abfragen alle 2 s): `status` (`prepared`, `dry-running`, `checked`, `applying`, `applied`, `cancelled`, `failed`), `phase`, `progress` (`dataset`, `part`, `parts`, `rowsDone`, `rows`), Zähler je Datensatz, `unmatched`, `error` (z. B. `mp-feuer.interrupted`). Fehler: `mp-feuer.runNotFound` (404) |
| `GET` | `/mp-feuer/runs/:id/report` | `mp-feuer.read` | Ergebnisbericht (`RunReport`: `run`, `datasets` mit Zählern und Dauer, `messages` gruppiert nach `code`, `value`, `error` mit `count` und bis zu drei `examples` (`dataset`, `archive`, `row`, `label`), `remembered`). `?format=csv`: alle Zeilen mit Meldungen (`text/csv`, UTF-8 mit BOM, Semikolon; Spalten `dataset`, `archive`, `row`, `label`, `action`, `code`, `params`) |
| `GET` | `/mp-feuer/runs` | `mp-feuer.read` | Verlauf, neueste zuerst, höchstens 200 (`RunSummary`: `id`, `status`, `phase`, `createdBy`, `createdAt`, `finishedAt`, `files`, `counts`, `unmatched`, `error`, `progress`) |
| `DELETE` | `/mp-feuer/runs/:id` | `mp-feuer.transfer` | Vorbereiteten oder geprüften Lauf mit den gelesenen Zeilen verwerfen (204). Fehler: `mp-feuer.runActive`, `mp-feuer.runFinished` (409) |
| `GET` | `/mp-feuer/mappings?kind=&q=&problems=` | `mp-feuer.read` | Gemerkte Zuordnungen des Moduls (`RememberedMapping` wie beim Tabellen-Import) |
| `DELETE` | `/mp-feuer/mappings/:id` | `mp-feuer.transfer` | Zuordnung vergessen (204); Audit `mp-feuer.mapping-deleted`. Fehler: `mp-feuer.mappingNotFound` (404) |
| `GET` | `/mp-feuer/remembered` | `mp-feuer.read` | Gemerkte Auswahl (`MpFeuerRemembered`: `archives` je Nummer mit `label`, `department`, `unit`, `skip`, `at`; `datasets` je Profil mit `enabled`, `options`) |
| `DELETE` | `/mp-feuer/remembered` | `mp-feuer.transfer` | Gemerkte Auswahl zurücksetzen (204, Zuordnungen bleiben); Audit `mp-feuer.remembered-reset` |
| `GET` | `/mp-feuer/exports` | `mp-feuer.read` | Exporte nach MP-Feuer, die der Benutzer erzeugen darf (`MpFeuerExportInfo`); derzeit keine |

**Ablauf für Skripte** (z. B. eine Einrichtung mit Altdaten): `POST /mp-feuer/runs` mit allen Dateien → `PUT …/:id` mit Abteilungen, Einheiten, Überspringen, Datensätzen und `mappings` → `POST …/dry-run` → `GET …/:id`, bis `status` nicht mehr `dry-running` ist (`checked`; `unmatched` prüfen, ggf. `mappings` ergänzen und erneut prüfen) → `POST …/apply` → `GET …/:id`, bis `status` `applied`, `cancelled` oder `failed` ist → `GET …/:id/report`.

**Audit:** `imports.applied` je übernommenem Teil (`source: { module: 'mp-feuer', runId }`, `files`, `part`, `parts`, `counts`), `mp-feuer.run-applied` (`runId`, `files`, `counts` je Profil), `mp-feuer.run-cancelled`, `mp-feuer.mapping-deleted`, `mp-feuer.remembered-reset`.

**Einstellungsabschnitt** `mp-feuer.remembered` (nur für Verwalter lesbar; gepflegt über die Übernahme).

## Datensicherung

Alle Endpunkte brauchen `backup.manage` (privilegiert, nie für API-Tokens), außer dem Status einer Wiederherstellung. Fehlercodes `backup.*`, u. a. `backup.notConfigured`, `backup.pathOutsideRoot`, `backup.targetNotWritable`, `backup.diskFull`, `backup.running` (`409`), `backup.noPassphrase`, `backup.wrongPassphrase`, `backup.corrupt`, `backup.newerVersion` (mit `version`), `backup.missingModules` (mit `modules`), `backup.confirmNameMismatch`, `backup.restoreRunning` (`409`).

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/backup/status` | `backup.manage` | Übersicht (`BackupOverview`): letzte Sicherung, nächste geplante, Ziel mit freiem Speicher, Warnungen, Werkzeugversionen, Weg der Wiederherstellung, letzte Ereignisse, vorige Datenbanken |
| `GET` | `/backup/settings` | `backup.manage` | Einstellungen ohne Passphrase, mit `passphraseSet`, `passphraseId`, `passphraseUnreadable` |
| `PUT` | `/backup/settings` | `backup.manage` | Speichern (`BackupSettingsInput`); neue Passphrase mit `passphraseRepeat` und `passphraseKeptSafe`, Ausschalten der Verschlüsselung mit `unencryptedConfirmed`. Fehler: `backup.passphraseMismatch`, `backup.passphraseNotConfirmed`, `backup.unencryptedNotConfirmed`, `backup.noSecretKey` |
| `POST` | `/backup/settings/test-target` | `backup.manage` | „Ziel prüfen“ (`{ targetPath? }`): Testdatei schreiben und löschen, freier Speicher (`TargetCheck`) |
| `GET` | `/backup/backups` | `backup.manage` | Sicherungen, abgeglichen mit dem Zielordner (`BackupEntry[]`, auch „fremd“ und „Datei fehlt“) |
| `GET` | `/backup/backups/:id` | `backup.manage` | Eine Sicherung |
| `POST` | `/backup/backups` | `backup.manage` | „Jetzt sichern“ (`{ verify, passphrase? }`), `202` mit der laufenden Sicherung |
| `POST` | `/backup/backups/upload?name=` | `backup.manage` | Sicherung hochladen (Body: die Datei, `application/octet-stream`). Fehler: `backup.invalidFileName`, `backup.fileExists` (`409`), `backup.notABackup` |
| `POST` | `/backup/backups/:id/verify` | `backup.manage` | „Prüfen“ (`{ passphrase?, restoreTest }`); Ergebnis an der Sicherung, Audit `backup.verified`, `backup.restore-tested` bzw. `backup.verify-failed` |
| `GET` | `/backup/backups/:id/file` | `backup.manage` | Datei herunterladen (verschlüsselt, wie sie liegt), Audit `backup.downloaded` |
| `DELETE` | `/backup/backups/:id` | `backup.manage` | Löschen (`204`), Audit `backup.deleted`. Fehler: `backup.foreignNotDeletable` |
| `POST` | `/backup/restore/check` | `backup.manage` | Assistent, Schritt „Prüfen“ (`{ backupId, passphrase }`): Manifest, Prüfergebnis, Zahlen jetzt und in der Sicherung (`RestoreCheck`) |
| `POST` | `/backup/restore` | `backup.manage` | Wiederherstellung starten (`{ backupId, passphrase, confirmName, usersInformed: true, realDataReason? }`), `202` mit `{ token }`. Im Testsystem bei einer Sicherung des Echtsystems (`RestoreCheck.realData`) mit Begründung, sonst `400 backup.realDataReasonRequired` |
| `GET` | `/backup/restore/status?token=` | Token der Wiederherstellung (ohne Anmeldung) | Fortschritt (`RestoreProgress`), auch im Wartungsmodus und nach dem Neustart; unbekanntes Token `404` |
| `DELETE` | `/backup/previous-databases/:name` | `backup.manage` | „Alte Datenbank löschen“ (`<db>_before_<zeit>`), Audit `backup.previous-database-dropped` |

**Wartungsmodus:** Während einer Wiederherstellung antworten alle Anfragen unter `/api` außer dem Status `503` mit `{ "code": "maintenance", "retryAfter": 15 }` und `Retry-After: 15`, auch Kiosk und API-Tokens.

## Inaktive Module

Anfragen an `/api/<modul-id>/…` eines deaktivierten Moduls ergeben `404` mit `{ "code": "modules.inactive", "module": "<id>" }`.
