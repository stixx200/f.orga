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
| `GET` | `/core/setup` | offen | `{ required, brigadeName }`: Ist die Ersteinrichtung nötig? |
| `POST` | `/core/setup` | offen, nur vor der Einrichtung | Feuerwehrname, Standardrollen aus den Rollenvorlagen und ersten Benutzer (Administrator) anlegen, anmelden (`Setup`) |
| `POST` | `/core/login` | offen | Anmelden (`Login`), setzt das Cookie. Fehler: `auth.invalidCredentials` (`401`), `auth.locked` (`429`) |
| `POST` | `/core/logout` | offen | Sitzung beenden, Cookie löschen (`204`) |
| `GET` | `/core/session` | angemeldet | Benutzer (mit `language`, `email`, `receiveDigest`) und wirksame Berechtigungen (`brigade` oder Liste von Abteilungs-IDs) |
| `PUT` | `/core/profile` | angemeldet | Eigene Sprache und Sammel-E-Mail ändern (`UpdateProfile`: `language`, `receiveDigest`) |
| `PUT` | `/core/password` | angemeldet | Eigenes Passwort ändern (`ChangePassword`) |
| `GET` | `/core/users` | `core.users.manage` | Benutzer ohne technische Benutzer |
| `GET` | `/core/users/:id` | `core.users.manage` | Ein Benutzer |
| `POST` | `/core/users` | `core.users.manage` | Benutzer anlegen (`UserInput`, Passwort nötig) |
| `PUT` | `/core/users/:id` | `core.users.manage` | Benutzer ändern, Rollen setzen, Passwort optional zurücksetzen. Man kann sich nicht selbst deaktivieren. |
| `POST` | `/core/users/:id/impersonate` | `core.users.impersonate` | Als dieser Benutzer anmelden (`{ reason }`), höchstens 60 Minuten. Fehler: `auth.impersonationSelf`, `auth.impersonationWider`, `auth.impersonationNested`, `auth.impersonationUnknownUser` |
| `POST` | `/core/impersonation/end` | angemeldet | Impersonation beenden, eigene Sitzung wiederherstellen |
| `GET` | `/core/permissions` | `core.roles.manage` | Alle Berechtigungen von Core und Modulen (`name` als `{ de, en }`) |
| `GET` | `/core/roles` | angemeldet | Rollen (mit `templateKey`, falls aus einer Vorlage) |
| `GET` | `/core/roles/templates` | `core.roles.manage` | Zusammengeführte Rollenvorlagen von Core und Modulen (`key`, `name`, `description`, `permissions`) |
| `POST` | `/core/roles/templates` | `core.roles.manage` | Fehlende Standardrollen in der Sprache des Benutzers anlegen. Antwort `{ created, skipped }` (Schlüssel) |
| `POST` | `/core/roles` | `core.roles.manage` | Rolle anlegen (`RoleInput`). Unbekannte Muster ergeben `roles.unknownPermissions`. |
| `PUT` | `/core/roles/:id` | `core.roles.manage` | Rolle ändern |
| `DELETE` | `/core/roles/:id` | `core.roles.manage` | Rolle löschen. Die letzte Rolle mit `*` bleibt erhalten (`roles.lastAdministrator`). |
| `GET` | `/core/tokens` | `core.tokens.manage` | API-Tokens ohne Klartext |
| `POST` | `/core/tokens` | `core.tokens.manage` | Token anlegen (`ApiTokenInput`). Die Antwort enthält den Klartext genau einmal. |
| `DELETE` | `/core/tokens/:id` | `core.tokens.manage` | Token widerrufen (`204`) |
| `GET` | `/core/settings/:section` | angemeldet | Einstellungsabschnitt ohne geheime Felder, `null` wenn unvollständig |
| `PUT` | `/core/settings/:section` | `core.settings.manage` | Einstellungsabschnitt speichern |
| `GET` | `/core/modules` | angemeldet | Aktive Module mit Name, Navigation und `frontend.entry` (`/modules/<id>/remoteEntry.js`) |
| `GET` | `/core/modules/status` | `core.modules.manage` | Alle installierten Module mit Name, Version, `active`, `requires` und `optional` |
| `PUT` | `/core/modules/:id` | `core.modules.manage` | Aktivieren/Deaktivieren (`ModuleActivation`). Fehler: `modules.requirementsInactive`, `modules.requiredByActive` |
| `GET` | `/core/history/:entity/:id` | Prüfung des Moduls (`HistoryAccessRegistry`), sonst eine Berechtigung des Moduls von `:entity` | Historieneinträge des Datensatzes und seiner Kinddatensätze (`parentEntity`/`parentId`), neueste zuerst. Maskierte Felder haben `hidden: true`. Ohne Leserecht `404`. `:entity` z. B. `masterdata.person` |
| `GET` | `/core/codes?code=` | angemeldet; Treffer je nach Rechten im Modul | Gegenstände mit genau diesem Code (`SearchHit[]`): Barcode, RFID-Chip (Trennzeichen und Schreibweise egal), Inventar-, Seriennummer oder URL eines QR-Etiketts |
| `GET` | `/core/codes/modules` | angemeldet | Module, in denen der Benutzer Codes suchen kann (`string[]`) |
| `GET` | `/core/audit?limit=` | `core.audit.read` | Audit-Einträge, neueste zuerst (höchstens 1000) |
| `GET` | `/core/lists` | angemeldet | Listenvorlagen, für die der Benutzer das Recht hat (`ListInfo`) |
| `GET` | `/core/lists/:id?<parameter>&lang=` | Recht der Liste | Listeninhalt für die Vorschau (`ListData`: Titel, Untertitel, Spalten, Zeilen). Ungültige Parameter `400`, unbekannte oder nicht erlaubte Liste `404` |
| `GET` | `/core/lists/:id/export/:format?<parameter>&lang=` | Recht der Liste | Datei als `pdf`, `xlsx` oder `csv` (Download). Unbekanntes Format: `lists.unknownFormat` |
| `GET` | `/core/tasks?asOf=` | angemeldet | Fristen, für die der Benutzer zuständig ist (`Deadline[]`), früheste zuerst. `asOf` (`JJJJ-MM-TT`) für eine Vorschau, sonst heute |
| `POST` | `/core/tasks/digest` | `core.settings.manage` | Sammel-E-Mail sofort verschicken, Antwort `{ sent }`. Ohne SMTP: `mail.notConfigured` |
| `GET` | `/core/imports/profiles` | angemeldet | Importprofile, für die der Benutzer das Recht hat (`ImportProfileInfo`, `transfer` = Profil liest auch MP-Feuer-Transferdateien) |
| `POST` | `/core/imports` | Recht eines Importprofils | Datei hochladen (`multipart/form-data`, Feld `file`, `.xlsx`/`.csv`/`.txt`/`.ics`, höchstens 10 MB). Antwort `ImportUpload` mit Überschriften, Beispielzeilen und vorgeschlagener Zuordnung je Profil. Fehler: `imports.fileMissing`, `imports.unsupportedFormat`, `imports.empty` |
| `POST` | `/core/imports/:id/preview` | Recht des Profils | Probelauf (`ImportRequest`: `profile`, `mapping`, `options`), ändert nichts. Antwort `ImportResult` |
| `POST` | `/core/imports/:id/apply` | Recht des Profils | Übernahme; danach ist der Upload gelöscht. Fehler: `imports.uploadNotFound`, `imports.unknownProfile`, `imports.requiredFieldUnmapped`, `imports.unknownColumn` |
| `POST` | `/core/imports/transfers` | Recht eines Profils mit Datenübernahme | MP-Feuer-Transferdateien hochladen (`multipart/form-data`, Feld `files`, bis 40 Dateien, je 200 MB). Antwort `TransferUpload` mit Archiven (`key`, `fileName`, `label`) und Datensätzen je Profil in Importreihenfolge. Fehler: `imports.fileMissing`, `imports.transferUnreadable`, `imports.transferEncrypted`, `imports.transferTooLarge` (entpackt über 500 MB je Datei oder 2 GB zusammen; jeweils mit `name`) |
| `POST` | `/core/imports/transfers/:id/preview` | Recht des Profils | Probelauf eines Profils (`TransferRequest`: `profile`, `departments` = Archivschlüssel → Abteilungsname, `options`). Antwort `ImportResult` |
| `POST` | `/core/imports/transfers/:id/apply` | Recht des Profils | Übernahme eines Profils; die Übernahme bleibt für die nächsten Profile erhalten. Fehler: `imports.uploadNotFound`, `imports.unknownProfile` |
| `DELETE` | `/core/imports/transfers/:id` | Hochladender | Datenübernahme verwerfen (204) |

**Einstellungsabschnitte des Core:** `brigade`, `smtp` (Passwort nur schreibbar), `reminders` (`enabled`, `weekday` 1–7 mit 1 = Montag, `hour` 0–23, Europe/Berlin).

**Importprofil `masterdata.persons`**, Meldungscodes je Zeile: `imports.requiredValueMissing`, `imports.invalidDate`, `masterdata.import.unknownDepartment`, `masterdata.import.departmentRequired`, `masterdata.import.ambiguous`, `masterdata.import.departmentCreated`, `masterdata.import.departmentDiffers`, `masterdata.import.unknownStatus`, `masterdata.import.sensitiveIgnored`, `masterdata.import.unknownExitReason`, `masterdata.import.leftIgnored`, `auth.forbidden`.

**Importprofil `masterdata.career`** (Lehrgänge, Dienstgrade und Ehrungen, Option `createCatalogEntries`), Meldungscodes je Zeile: `imports.invalidDate`, `masterdata.import.unknownCareerKind`, `masterdata.import.unknownPerson`, `masterdata.import.ambiguous`, `masterdata.import.unknownCatalogEntry`, `masterdata.import.catalogEntryCreated`, `auth.forbidden`.

## Masterdata

Schemas aus `@forga/masterdata-contracts`. „Abteilungsbezogen“ heißt: Das Recht muss für die betroffene Abteilung oder die Gesamtwehr vorliegen.

**Kataloge**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/catalog?kind=` | angemeldet | Katalogeinträge, optional einer Art (`CatalogKind`) |
| `POST` | `/masterdata/catalog` | `masterdata.catalogs.manage` | Eintrag anlegen (`CatalogEntryInput`). Fehler: `catalog.keyTaken` (`409`), `validation.failed` für `attributes.*` |
| `PUT` | `/masterdata/catalog/:id` | `masterdata.catalogs.manage` | Name, Reihenfolge, `active`, Zusatzfelder ändern. `kind` und `key` sind fest (`catalog.keyImmutable`). |
| `POST` | `/masterdata/catalog/templates/bw` | `masterdata.catalogs.manage` | BW-Vorlage anwenden, Antwort `{ added: { <art>: anzahl } }` |
| `GET` | `/masterdata/vehicle-statistics-categories` | angemeldet | Feste Statistik-Kategorien F63–F120 |

**Organisation**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/departments` | angemeldet | Abteilungen |
| `POST` | `/masterdata/departments` | `masterdata.organization.manage` für die Gesamtwehr | Abteilung anlegen (`DepartmentInput`) |
| `PUT` | `/masterdata/departments/:id` | `masterdata.organization.manage`, abteilungsbezogen | Abteilung ändern. Fehler: `masterdata.unknownDepartment`, `masterdata.departmentOwnParent`, `masterdata.unknownPerson` |
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
| `GET` | `/masterdata/persons/:id` | Person mit Mitgliedschaften, Qualifikationen, Dienstgraden, Ehrungen. Sensible Felder nur mit `masterdata.persons.sensitive`, sonst `sensitiveHidden: true` |
| `POST` | `/masterdata/persons` | Anlegen (`CreatePersonInput`, mindestens eine Mitgliedschaft). Status Standard `probation`, Probezeitende aus `masterdata.membership`. Fehler: `masterdata.personnelNumberTaken` (`409`), `masterdata.primaryMembershipRequired`, `masterdata.unknownDepartment` |
| `PUT` | `/masterdata/persons/:id` | Stammdaten ändern (`PersonInput`). Sensible Felder ohne Recht werden ignoriert. |
| `PUT` | `/masterdata/persons/:id/memberships` | Alle Mitgliedschaften ersetzen (Liste von `MembershipInput`). Recht für alte und neue Abteilungen nötig. Fehler: `masterdata.membershipPeriodInvalid`, `masterdata.primaryMembershipRequired` |
| `POST`, `DELETE` | `/masterdata/persons/:id/qualifications`, `…/qualifications/:entryId` | Qualifikation eintragen (`PersonQualificationInput`) bzw. entfernen. Löst `masterdata.person.qualification-changed` aus. |
| `POST`, `DELETE` | `/masterdata/persons/:id/ranks`, `…/ranks/:entryId` | Dienstgrad eintragen (`RankAssignmentInput`) bzw. entfernen |
| `POST`, `DELETE` | `/masterdata/persons/:id/honors`, `…/honors/:entryId` | Ehrung eintragen (`HonorAwardInput`) bzw. entfernen |
| `PUT` | `/masterdata/persons/:id/probation` | Probezeitende ändern (`ProbationChange`). Fehler: `masterdata.notInProbation` |
| `POST` | `/masterdata/persons/:id/admission` | Endgültige Aufnahme (`Admission`). Fehler: `masterdata.notInProbation` |
| `POST` | `/masterdata/persons/:id/status` | Statuswechsel (`StatusChange`), nicht aus `probation` oder `left` (`masterdata.statusChangeNotAllowed`); aus `youth` heraus und nach `veterans` nur über die Übernahmen (`masterdata.useTransfer`) |
| `POST` | `/masterdata/persons/:id/transfer-to-operational` | Übernahme aus der Jugendfeuerwehr (`TransferToOperational`: `departmentId`, `on`, `probationEndsOn` oder `null` = Verzicht, `reason`, `decidedOn`). Fehler: `masterdata.transferNotAllowed`, `masterdata.wrongDepartmentType`, `masterdata.belowMinimumAge`, `masterdata.probationReasonRequired`, `masterdata.transferBeforeMembership` |
| `POST` | `/masterdata/persons/:id/transfer-to-veterans` | Übernahme in die Altersabteilung (`TransferToVeterans`: `departmentId`, `on`, `decidedOn`), nur aus `active` oder `passive`. Fehler: `masterdata.personHoldsItems` (409, noch Schutzausrüstung zugeordnet), `masterdata.transferNotAllowed`, `masterdata.wrongDepartmentType`, `masterdata.transferBeforeMembership` |
| `POST` | `/masterdata/persons/:id/leave` | Austritt (`Leave`), beendet offene Mitgliedschaften, löst `masterdata.person.left` aus. Fehler: `masterdata.alreadyLeft`, `masterdata.personHoldsItems` (409) |

Unbekannte Katalogschlüssel ergeben `400` mit `catalog.unknownKey`.

**Lehrgänge**

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/masterdata/courses` | angemeldet | Lehrgangskatalog |
| `POST`, `PUT` | `/masterdata/courses`, `/masterdata/courses/:id` | `masterdata.catalogs.manage` | Lehrgang anlegen/ändern (`CourseInput`). Fehler: `catalog.keyTaken`, `catalog.keyImmutable`, `catalog.unknownKey`, `masterdata.courseOwnPrerequisite` |
| `POST` | `/masterdata/courses/templates/bw` | `masterdata.catalogs.manage` | BW-Lehrgänge anlegen (Qualifikationen der BW-Katalogvorlage müssen existieren), Antwort `{ added }` |
| `GET` | `/masterdata/persons/:id/course-attendances` | `masterdata.persons.read`, abteilungsbezogen | Teilnahmen der Person |
| `POST` | `/masterdata/persons/:id/course-attendances` | `masterdata.persons.write` oder `masterdata.courses.plan`, abteilungsbezogen | Teilnahme eintragen (`CourseAttendanceInput`). Bei `passed`: Qualifikationen anlegen, offene Vormerkungen `completed`, Ereignisse `masterdata.course.passed` und `masterdata.person.qualification-changed` |
| `DELETE` | `/masterdata/persons/:id/course-attendances/:attendanceId` | `masterdata.persons.write` oder `masterdata.courses.plan`, abteilungsbezogen | Teilnahme und die daraus entstandenen Qualifikationen entfernen (`204`) |
| `GET` | `/masterdata/course-nominations?course=` | `masterdata.courses.plan` | Vormerkungen der Personen, für die der Benutzer planen darf |
| `POST` | `/masterdata/course-nominations` | `masterdata.courses.plan`, abteilungsbezogen | Vormerken (`CourseNominationInput`). Fehler: `masterdata.alreadyNominated` (`409`) |
| `PUT` | `/masterdata/course-nominations/:id` | `masterdata.courses.plan`, abteilungsbezogen | Priorität, Zeitraum, Status, Bemerkung ändern. Person und Lehrgang sind fest (`masterdata.nominationTargetImmutable`). |
| `DELETE` | `/masterdata/course-nominations/:id` | `masterdata.courses.plan`, abteilungsbezogen | Vormerkung löschen (`204`) |
| `GET` | `/masterdata/course-planning/:course` | `masterdata.courses.plan` | `CoursePlanning`: offene Vormerkungen mit `prerequisitesMet` und Kandidaten |

**Ungültige Eingaben** ergeben `400`:

```json
{ "code": "validation.failed", "issues": [{ "path": "name", "code": "too_small", "message": "…" }] }
```

## Incidents

Abteilungsbezogene Rechte gelten für die Abteilung des Berichts. Wer `incidents.reports.release` für die Gesamtwehr hat, liest und schreibt alle Berichte.

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/incidents/keywords` | angemeldet | Stichwort-Katalog (`AlarmKeyword[]`) |
| `POST`, `PUT` | `/incidents/keywords`, `/incidents/keywords/:id` | `incidents.settings.manage` | Stichwort anlegen/ändern (`AlarmKeywordInput`); der Schlüssel bleibt fest. Fehler: `catalog.keyTaken` |
| `POST` | `/incidents/keywords/templates/bw` | `incidents.settings.manage` | Fehlende Stichworte der BW-Vorlage anlegen, Antwort `{ added }` |
| `GET` | `/incidents/incidents?from&to&departmentId&status&mine` | `incidents.reports.read` | Einsätze mit mindestens einem lesbaren Bericht, neueste zuerst (höchstens 500) |
| `POST` | `/incidents/incidents` | `incidents.reports.write` für jede genannte Abteilung | Einsatz (`IncidentInput` und `departmentIds`) mit je einem Berichtsentwurf anlegen. Fehler: `incidents.dispatchNumberTaken` (`409`), `incidents.unknownKeyword` |
| `GET` | `/incidents/incidents/:id` | `incidents.reports.read` | Einsatz mit Berichtsübersicht |
| `PUT` | `/incidents/incidents/:id` | Schreibrecht für einen Bericht des Einsatzes | Einsatzdaten ändern; nicht, solange ein Bericht gesperrt ist (außer Freigeber) |
| `PUT` | `/incidents/incidents/:id/costs` | `incidents.costs` | Kosten und Bemerkungen des ganzen Einsatzes (`IncidentCosts`: `chargeable`, `chargeableReason`, `notes`, `version`); auch nach der Freigabe der Berichte |
| `POST` | `/incidents/incidents/:id/reports` | `incidents.reports.write` für die Abteilung | Bericht für eine weitere Abteilung anlegen (`NewReportInput`). Fehler: `incidents.reportExists` (`409`) |
| `GET` | `/incidents/reports/:id` | `incidents.reports.read` | Bericht (`Report`) mit Entschädigung je Person, `compensationTotal`, `findings`, `statisticsSuggestion`. Ohne Leserecht `404` |
| `PUT` | `/incidents/reports/:id` | Schreibrecht | Inhalt speichern (`ReportInput`). Fehler: `incidents.reportLocked` (`403`), `incidents.unknownPerson`, `incidents.unknownVehicle`, `incidents.personTwiceInReport` |
| `GET` | `/incidents/reports/:id/revisions` | `incidents.reports.read` | Versionen des Berichts, neueste zuerst (`ReportRevision[]`: `id`, `savedAt`, `userName`, `personnelCount`) |
| `POST` | `/incidents/reports/:id/revisions/:revisionId/restore` | Schreibrecht | Version wiederherstellen; wie Speichern (neue Version, Sperre durch Freigeber). Fehler wie `PUT` |
| `POST` | `/incidents/reports/:id/primary` | Schreibrecht | Zum Hauptbericht machen |
| `POST` | `/incidents/reports/:id/submit` | Schreibrecht | Fertig melden (`Submit` mit `acknowledgements`). Fehler: `incidents.findingsOpen`, `incidents.warningsNotAcknowledged` (`400`), `incidents.invalidTransition` (`409`) |
| `POST` | `/incidents/reports/:id/return` | `incidents.reports.release` | Zurückgeben (`ReturnToAuthor`) |
| `POST` | `/incidents/reports/:id/release` | `incidents.reports.release` | Freigeben (`Release`: `compensation` oder `billing`). Fehler: `incidents.findingsOpen`, `incidents.invalidTransition`, `incidents.compensationReleaseDisabled` (`400`, wenn `compensationRelease` aus ist) |
| `POST` | `/incidents/reports/:id/unlock` | `incidents.reports.unlock` | Sperre aufheben (`Unlock`: `reason`, `toStatus`). Fehler: `incidents.notLocked` |
| `DELETE` | `/incidents/reports/:id` | Schreibrecht | Entwurf löschen (`204`). Fehler: `incidents.invalidTransition`, `incidents.primaryHasSiblings` |
| `POST` | `/incidents/v1/incidents` | `incidents.api.create` | Externe API (`ExternalIncidentInput`), idempotent über die Leitstellennummer. Antwort `ExternalIncidentResult` mit `warnings` |
| `GET` | `/incidents/compensation/check?from&to` | `incidents.compensation.export` | Prüfung vor der Auszahlung (`CompensationCheck`: nicht freigegebene Berichte und Personalprobleme) |
| `GET` | `/incidents/compensation/export?from&to&includeUnreleased&lang` | `incidents.compensation.export` | Abrechnungsexport als Excel; Blatt „Hinweise“ mit dem Ergebnis der Prüfung |
| `GET` | `/incidents/duty?from&to` | `incidents.duty.manage` | Sonderdienste mit Tagen, Satz und Betrag (`DutyAssignment[]`) |
| `POST`, `PUT`, `DELETE` | `/incidents/duty`, `/incidents/duty/:id` | `incidents.duty.manage` | Sonderdienst pflegen (`DutyAssignmentInput`). Fehler: `incidents.duty.unknownKind`, `incidents.unknownPerson` |
| `GET` | `/incidents/statistics/:year` | `incidents.statistics` | Jahresstatistik (`AnnualStatistics`: Werte mit berechnet/korrigiert/gültig, Prüfungen, Abschluss) |
| `PUT` | `/incidents/statistics/:year/corrections` | `incidents.statistics` | Korrekturen (`StatisticsCorrections`, Schlüssel `F121:D`, `null` entfernt). Fehler: `incidents.statisticsClosed` (`409`) |
| `POST` | `/incidents/statistics/:year/close`, `/incidents/statistics/:year/reopen` | `incidents.statistics` | Abschließen bzw. wieder öffnen |
| `GET` | `/incidents/statistics/:year/export` | `incidents.statistics` | Ausgefüllte Import-Vorlage des Landesportals (`Jahresstatistik_<Jahr>.xlsx`) |

**Listen** über `/core/lists`: `incidents.open-reports`, `incidents.incidents`, `incidents.per-department`, `incidents.hours-per-person`.

**Importprofil `incidents.mp-feuer`** (Recht `incidents.reports.release`, MP-Feuer-Personalexport `.xlsx`/`.csv`, Option `createKeywords`), Meldungscodes je Zeile: `masterdata.import.unknownDepartment`, `imports.invalidDate`, `incidents.unknownKeyword`, `incidents.import.unknownPerson`, `incidents.personTwiceInReport`, `incidents.api.unknownVehicle`, `incidents.import.reportEdited`.

**Importprofil `incidents.duty-roster`** (Recht `incidents.duty.manage`, Datei `.ics`), Meldungscodes je Zeile: `imports.invalidDate`, `incidents.duty.unknownPerson`, `incidents.duty.ambiguousPerson`, `incidents.duty.noKind`.

**Einstellungsabschnitt** `incidents.general`: `homeMunicipalities`, `rates`, `rounding`, `compensationRelease`, `standbyHours`, `allowances`, `dutyKinds`, `rules`.

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
| `POST` | `/clothing/items/:id/return` | `clothing.issue` | Zurücknehmen (`ItemReturnInput`, `retire` sondert aus, `laundry` sperrt bis zur Wäsche). Fehler: `clothing.notIssued`, `clothing.returnBeforeIssue`, `clothing.dateInFuture`, `clothing.notTextile` |
| `POST` | `/clothing/return` | `clothing.issue` | Mehrere Stücke zurücknehmen (`ReturnManyInput`: `date`, `notes`, `items` mit `itemId`, `retire`, `laundry`), alle oder keines |
| `POST` | `/clothing/items/:id/retire` | `clothing.manage` | Stück im Lager aussondern |
| `POST` | `/clothing/items/:id/inspections` | `clothing.issue` | Prüfung erfassen (`InspectionInput`). Fehler: `clothing.dateInFuture`, `clothing.retired` |
| `POST` | `/clothing/inspections` | `clothing.issue` | Prüfungen mehrerer Stücke (`InspectionsInput`: `date`, `inspector`, `results` mit `itemId`, `passed`, `notes`) |
| `POST` | `/clothing/care` | `clothing.issue` | Waschen oder Imprägnieren mehrerer Stücke (`CareInput`: `itemIds`, `kind`, `date`, `place`). Fehler: `clothing.notTextile`, `clothing.retired`, `clothing.dateInFuture` |
| `POST` | `/clothing/care/:id/cancel`, `/clothing/inspections/:id/cancel`, `/clothing/issues/:id/cancel` | `clothing.issue` als Erfasser oder `clothing.manage` der Abteilung | Eintrag mit Grund stornieren (`CancelInput`: `reason`). Fehler: `clothing.notOwnEntry` (403), `clothing.alreadyCancelled` (409), `clothing.notLastEntry` (409, nur letzte Ausgabe oder Rücknahme eines Stücks) |
| `POST` | `/clothing/consumables` | `clothing.issue` für eine Abteilung der Person | Verbrauchsartikel abgeben (`ConsumableIssueInput`); nur Eintrag im Verlauf. Fehler: `clothing.inventoried`, `clothing.articleInactive`, `clothing.unknownSize`, `clothing.dateInFuture`, `clothing.personLeft`, `clothing.personVeteran` |
| `POST` | `/clothing/consumables/receipts` | `clothing.manage` in einer Abteilung | Zugang an Verbrauchsartikeln (`ConsumableReceiptInput`, negative Anzahl als Korrektur); Antwort der neue Bestand (`StockRow[]`) |
| `GET` | `/clothing/stock?departmentId` | `clothing.read` | Bestand je Artikel und Größe mit Mindestbestand und `reorder` (`StockRow[]`) |
| `GET` | `/clothing/persons/:personId` | `clothing.read` für eine Abteilung der Person, sonst `404` | Zugeordnete Stücke, Verlauf und Größen (`PersonClothing`) |
| `PUT` | `/clothing/persons/:personId/sizes` | `clothing.issue` für eine Abteilung der Person | Größen der Person je Artikel (`SizeProfileInput`); leere und unbekannte Artikel entfallen |
| `GET` | `/clothing/me` | `clothing.self` | Eigene Schutzausrüstung |

## Inaktive Module

Anfragen an `/api/<modul-id>/…` eines deaktivierten Moduls ergeben `404` mit `{ "code": "modules.inactive", "module": "<id>" }`.
