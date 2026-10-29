# Aufbewahrungsplan

Je Datenkategorie eine Aufbewahrungsfrist ab einem Ereignis und eine Aktion nach Ablauf, darunter „dem Archiv anbieten“ (Landesarchivgesetz Baden-Württemberg). Code: `libs/core/core-api/src/lib/retention/`, Verträge in `libs/core/core-contracts/src/lib/retention.ts`, Kategorien in den Modulen (`*.retention.ts`). Oberfläche: „Verwaltung → Einstellungen → Aufbewahrung“ (`RetentionSettings`, `/admin/settings?tab=retention`) und „Verwaltung → Aussonderung“ (`/admin/retention`, `RetentionPage`), nach den freigegebenen Mockups `shell/aufbewahrung.html` und `shell/aussonderung.html`. Offene Punkte: [geplant/aufbewahrung.md](../geplant/aufbewahrung.md).

## Grundsatz

- **Es wird nichts automatisch gelöscht, bis ein Administrator Fristen und Aktionen wählt.** Standard aller Kategorien ist `none`, außer den Protokollen ([Datenschutz L29](datenschutz.md#aufbewahrung-der-protokolle-und-laufberichte-l29)): Audit-Log (2 Jahre, löschen), Leseprotokoll (1 Jahr), Nachweise der Auskünfte (3 Jahre), Datenpannen (5 Jahre, mit „Sonderfall prüfen“), Laufberichte von MP-Feuer (1 Jahr) und Protokoll der Datensicherung (1 Jahr). Import-Uploads und Datenübernahmen werden wie bisher nach 24 Stunden gelöscht (`core.imports`), die Zeilen alter Läufe des Moduls MP-Feuer nach 7 Tagen (`mp-feuer.rows`); beides hat keine Einstellung. Gesperrte Benutzer ohne Person werden standardmäßig 2 Jahre nach der Sperre anonymisiert (`core.locked-accounts`); die Zeilen mit Meldungen der MP-Feuer-Läufe gehen nach 90 Tagen (`mp-feuer.messages`), die Zähler der Anfragebegrenzung einen Tag nach der letzten Nutzung (`core.rate-limits`).
- f.orga liefert keine rechtlich geprüften Werte. Die Vorlage „Kommunaler Aktenplan (Beispiel)“ enthält nur die Fristen, die die Feuerwehr genannt hat; welche Unterlagen archivwürdig sind, entscheidet das Archiv.
- Anhänge folgen immer ihrem Datensatz: Sie gehen mit in den Export für das Archiv und werden mit dem Datensatz anonymisiert bzw. gelöscht. Abhängige Datensätze (Bericht ohne Einsatz, Prüfung ohne Gerät) werden nie für sich ausgesondert.
- Anonymisieren und Löschen entfernen auch die Historie der Datensätze, weil sie die früheren Werte enthält.

## Kategorien

Module melden ihre Kategorien beim `RetentionRegistry` an (`registerCategory`): Schlüssel, Name und Beschreibung (`LocalizedText`), Ereignis, ab dem die Frist läuft, erlaubte Aktionen, optional Unterarten, und die Funktionen `candidates(query)` (fällige Datensätze mit Anzeigename, neutralem Namen, Ereignisdatum, Grund und Zahl der Anhänge), `export(ids)` (lesbare Felder, alle Daten, Anhänge, eigene Dateien), `execute(ids, action)`, optional `blockedBy(ids, action)`, `children(ids)` und `bulk` (für viele kleine Einträge).

| Schlüssel | Kategorie | Frist ab | Aktionen | Unterarten | Modul |
| --- | --- | --- | --- | --- | --- |
| `masterdata.person-core` | Grunddaten Ausgeschiedener (Personalstammrolle): Name, Personalnummer, Mitgliedschaften, Dienstgrade, Status | Austritt | anbieten, anonymisieren, nichts | – | `masterdata` |
| `masterdata.person-file` | Personalakte Ausgeschiedener: Kontakt, sensible Felder, Führerschein mit Kontrollen, erneuten Vorlagen und Transpondern, Qualifikationen, Lehrgänge, Ehrungen, Ämter, Ruhezeiten; dazu die Daten anderer Module über `PersonDataRegistry` | Austritt | anbieten, anonymisieren, nichts | – | `masterdata` |
| `masterdata.vehicles-retired` | ausgesonderte Fahrzeuge (Status `retired`) | Außerdienststellung | anbieten, löschen, nichts | – | `masterdata` |
| `incidents.incidents` | Einsätze mit allen Berichten (Wachbuch), auch EvD-Berichte, mit Anhängen | Alarm | anbieten, anonymisieren, löschen, nichts | `special` „Einsätze mit Besonderheiten“ / übrige | `incidents` |
| `incidents.involved-parties` | Angaben zu Beteiligten von Einsätzen (Name, Anschrift, Telefon, Kennzeichen, Notizen; die Rolle bleibt), mit Fassungen und Historie ([Daten Dritter](datenschutz.md#daten-dritter-l14)) | Alarm | anonymisieren, nichts | – | `incidents` |
| `training.sessions` | Dienste mit Anwesenheit und Anhängen (Protokolle) | Beginn | anbieten, löschen, nichts | je Art des Dienstes, nach Bedarf | `training` |
| `equipment.retired` | ausgesonderte Geräte mit Prüfungen, Mängeln und deren Anhängen | Aussonderung | anbieten, löschen, nichts | – | `equipment` |
| `cost-recovery.notices` | erledigte Kostenbescheide (bezahlt, aufgehoben, geändert, verworfen) mit Zahlungen und dem erlassenen PDF | Erledigung: Zahlung, Aufhebung, letzte Zahlung | anbieten, löschen, nichts | – | `cost-recovery` |
| `compensation.runs` | ausgezahlte Auszahlungsläufe mit Posten | Auszahlung | anbieten, löschen, nichts | – | `compensation` |
| `core.audit` | Audit-Log (Datenerfassungsprotokoll) | Eintrag | löschen | – | Core |
| `core.history` | Historie und Versionen; der aktuelle Stand bleibt | Eintrag | löschen, nichts | – | Core |
| `privacy.access-log` | Leseprotokoll: Zugriffe auf besonders geschützte Daten je Benutzer, Person, Bereich und Tag ([Datenschutz](datenschutz.md#leseprotokoll)) | Tag des Zugriffs | löschen | – | `privacy` |
| `core.locked-accounts` | gesperrte Benutzer ohne verknüpfte Person (z. B. externer Administrator, Kämmerei); Konten mit Person folgen der Person ([Datenschutz](datenschutz.md#gesperrte-benutzer-ohne-person-l21)) | Sperre | anonymisieren, nichts | – | Core |
| `privacy.access-reports` | Nachweise der Auskünfte nach Art. 15 (Erstellung, Übergabe; die Datei selbst geht nach 30 Tagen) | Erstellung | löschen, nichts | – | `privacy` |
| `privacy.breaches` | abgeschlossene Datenpannen mit Historie | Abschluss | anbieten, löschen, nichts | – | `privacy` |
| `mp-feuer.run-reports` | Laufberichte der Datenübernahme mit den Zeilen mit Meldungen | Ende des Laufs | löschen, nichts | – | `mp-feuer` |
| `backup.run-log` | Einträge gelöschter und fehlgeschlagener Sicherungen und abgeschlossener Wiederherstellungen | Löschung bzw. Ende | löschen | – | `backup` |

- **Unterarten:** Bei Einsätzen ist jede Unterart eine eigene Zeile (`subtypeMode: 'fixed'`); der Schlüssel der Kategorie gilt für die übrigen Einsätze. Ein Einsatz mit Besonderheiten ohne eigene Regel fällt nicht auf die Regel der übrigen zurück. Bei Diensten kommen Zeilen je Art nur bei Bedarf dazu (`optional`); Dienste einer Art ohne eigene Zeile folgen der Regel der Kategorie („Übrige Dienste“).
- **Einsätze mit Besonderheiten:** eigene Kräfte verletzt oder getötet, ein Beteiligter in der Rolle „Geschädigter“ oder Tote in der Statistik (Grund „Verletzte oder Tote“), kostenpflichtig („Kostenersatz“), Kat-Einsatz in der Statistik („Kat-Einsatz“), oder am Einsatz das Kennzeichen **„30 Jahre aufbewahren (Sonderfall)“** (`retentionSpecial`, z. B. Großbrand ohne Verletzte). Das Kennzeichen geht vor; die Liste „Aussonderung“ zeigt den Grund.
- **Kennzeichen am Einsatz:** Karte „Aufbewahrung“ auf der Einsatzseite, `PUT /api/incidents/incidents/:id/retention` (`IncidentRetention`: `retentionSpecial`, `version`). Setzen dürfen feuerwehrweite Freigeber, Inhaber von `incidents.costs` und die Schreiber des Hauptberichts, auch nach der Freigabe, weil das Kennzeichen die Aufbewahrung nur verlängert (`retentionSpecialEditable` im Einsatz). Audit `incidents.retention-changed`, die Änderung steht in der Historie des Einsatzes. Nach der Anonymisierung ist es nicht mehr änderbar (`incidents.anonymized`).
- **Kostenbescheide und Auszahlungsläufe** sind Kassen- bzw. Buchungsunterlagen (`financial`): Die Seite nennt „mit der Kämmerei abstimmen“, die Vorlage setzt keinen Wert.

## Regel je Kategorie

Einstellung `retention` des Core (`RetentionSettings`, Verwalter `core.settings.manage`): ein Eintrag je Kategorie und je Unterart (Schlüssel `<kategorie>:<unterart>`, z. B. `incidents.incidents:special`, `training.sessions:meeting`).

| Feld | Inhalt |
| --- | --- |
| `years` | Frist in Jahren, 1–100; `null` = unbegrenzt |
| `action` | `offer-archive`, `anonymize`, `delete`, `none` |
| `afterDecision` | bei `offer-archive` Pflicht: was nach der Entscheidung des Archivs geschieht (`anonymize`, `delete`) |
| `specialCase` | „Sonderfall prüfen“: jeder fällige Datensatz kommt in die Liste und wird erst nach Bestätigung bearbeitet, auch bei `anonymize` und `delete` |
| `note` | Herkunft, z. B. „Aktenplan 13.20“ |

- **Prüfung der Regeln** (Probelauf, `warnings`): Die Grunddaten bleiben mindestens so lange wie die Personalakte (`atLeastAs`); ist ihre Frist kürzer, gilt die längere (`effectiveYears`, Warnung `retention.personCoreShorter`). Würden Einsätze vor Kostenbescheiden oder Auszahlungsläufen gelöscht, die auf sie verweisen (`referencedBy`), warnt `retention.deletedBeforeReferences`. Eine Aktion, die die Kategorie nicht erlaubt, wird nicht ausgeführt (`retention.actionNotAllowed`).
- **Einstellungsseite** („Verwaltung → Einstellungen → Aufbewahrung“, `/admin/settings?tab=retention`): Tabelle mit Kategorie (Beschreibung, „Frist ab …“, Herkunft), Jahre, „Nach Ablauf“ (nichts, anbieten dann anonymisieren, anbieten dann löschen, anonymisieren, löschen; nur die erlaubten), „Sonderfall prüfen“ und „Jetzt betroffen“ (Probelauf mit den Werten des Formulars, kurz nach jeder Änderung; abweichende Frist als „wirksam n Jahre“). Unterarten der Dienste über „Weitere Art mit eigener Frist“. „Jetzt anwenden“ (mit Bestätigung) startet einen echten Lauf mit den gespeicherten Regeln.
- **Vorlage „Kommunaler Aktenplan (Beispiel)“** (`RETENTION_TEMPLATE_MUNICIPAL`): Ein Knopf zeigt die Positionen des Aktenplans und setzt nach Klick die Werte in das Formular, gekennzeichnet als „Vorlage eingesetzt, noch nicht gespeichert“; gespeichert wird erst mit „Speichern“. Kategorien ohne Wert im Beispiel stehen danach auf „nichts“.

| Kategorie | Frist | Aktion | Sonderfall prüfen | Aktenplan |
| --- | --- | --- | --- | --- |
| Grunddaten Ausgeschiedener | 15 Jahre (wirksam 30) | anbieten, danach anonymisieren | nein | Personalstammrolle (Feuerwehr) |
| Personalakte Ausgeschiedener | 30 Jahre | anbieten, danach anonymisieren | ja | Feuerwehrangehörige |
| Einsätze mit Besonderheiten | 30 Jahre | anbieten, danach anonymisieren | ja | Wachbücher der Feuerwehr |
| übrige Einsätze | 3 Jahre | anbieten, danach anonymisieren | ja | Wachbücher der Feuerwehr |
| ausgesonderte Fahrzeuge, ausgesonderte Geräte | 30 Jahre | anbieten, danach löschen | ja | Freiwillige Feuerwehr |
| Audit-Log | 2 Jahre | löschen | nein | Datenerfassungsprotokolle |
| Historie | 10 Jahre | löschen | ja | Datenerfassungsprotokolle |
| Dienste „Sitzung / Ausschuss“ | 30 Jahre | anbieten, danach löschen | nein | Niederschriften über Ausschusssitzungen |
| Dienste „Dienstbesprechung“ | 5 Jahre | anbieten, danach löschen | ja | Dienstbesprechungen, Niederschriften |

Die Vorlage der Diensttypen enthält dafür die Art `staff-meeting` „Dienstbesprechung“ neben `meeting` „Sitzung / Ausschuss“.

## Täglicher Lauf

`RetentionService.run` läuft eine Minute nach dem Start und dann täglich (abschaltbar mit `FORGA_RETENTION_SCHEDULER=off`) und auf Knopfdruck (`POST /api/core/retention/run`). Je Zeile mit Frist und Aktion:

- **Direkt** (Aktion `anonymize` oder `delete` ohne „Sonderfall prüfen“): Die fälligen Datensätze werden sofort bearbeitet, gezählt in `counts` und im Audit-Eintrag `retention.retention-applied`. Audit-Log und Historie werden dabei in einem Zug gelöscht (`bulk`).
- **Liste** (Aktion `offer-archive` oder „Sonderfall prüfen“): Für jeden fälligen Datensatz ohne offenen Fall entsteht ein **Aussonderungsfall** (`core.retention_case`, historisiert): Kategorie, Regel, Datensatz, Anzeigename, Grund, Ereignisdatum, fällig seit (Ereignis plus wirksame Frist), Zahl der Anhänge, Aktion und `afterDecision` der Regel zum Zeitpunkt der Entstehung. Bei „Sonderfall prüfen“ für Audit-Log und Historie ist ein Fall ein Jahr.
- **Blockiert:** Darf ein Datensatz nicht gelöscht werden, entsteht ein fälliger Fall mit Grund (`blockedBy`); der nächste Lauf prüft erneut und bearbeitet ihn, sobald nichts mehr blockiert. Gründe: `retention.costNoticeOpen` (Einsatz mit offenem Kostenbescheid), `retention.payoutKept` (Einsatz oder Dienst mit Entschädigungsposten eines noch aufbewahrten Laufs), `retention.referenced` (Fahrzeug, auf das noch Einsätze, Geräte oder andere Module verweisen).
- Zurückgestellte Fälle werden an ihrem Tag wieder fällig. Fällige Fälle, deren Datensatz nicht mehr fällig ist (Regel geändert, Datensatz anders gelöscht), verschwinden; Fälle mit Schritten bleiben.
- Ein Probelauf (`dryRun`) zählt nur, auf Wunsch mit nicht gespeicherten Regeln (`settings.retention`); ein echter Lauf nimmt immer die gespeicherten.

## Aussonderung

Seite `/admin/retention` (Menü „Verwaltung → Aussonderung“, Recht **`core.retention.manage`**; die Rollenvorlage `administrator` hat es über `*`). Die Fristen selbst ändert nur `core.settings.manage`.

- Reiter **Fällig**, **Angeboten**, **Entschieden** (übernommen oder kassiert), **Zurückgestellt**, **Erledigt**; Filter nach Kategorie und „Fällig bis“. Je Fall: Kategorie (mit Unterart), Datensatz mit Ereignis, Grund und Anhängen, fällig seit, Stand (z. B. „angeboten 15.10.2026 · Kreisarchiv“, „blockiert: Kostenbescheid offen“). „Liste aktualisieren“ startet einen Lauf.
- **Dem Archiv anbieten** (fällige oder schon angebotene Fälle): Archiv (Pflicht) und Bemerkung; Status „angeboten“ mit Datum, Archiv und Kennung der Anbietung. Danach lädt der Browser den Export herunter (`GET /api/core/retention/offers/:offerId/export`, auch später über den Link am Fall): ZIP mit `anbietungsverzeichnis.pdf` (Liste nach Stil.md), `uebersicht.csv`, `daten.json` (`format: 'forga.export'`, `kind: 'retention-offer'`) und je Datensatz einem Ordner mit `datensatz.pdf` (Kopf nach Stil.md, lesbare Felder, alle gespeicherten Daten) und `anhaenge/` (Anhänge und eigene Dokumente, z. B. das erlassene PDF eines Kostenbescheids). Englisch heißen die Dateien `offer-list.pdf`, `overview.csv`, `data.json`, `record.pdf`, `attachments/`. Der Datensatz bleibt bis zur Entscheidung unverändert.
- **Entscheidung des Archivs** für angebotene Fälle: übernommen (`accepted`) oder kassiert (`destroyed`), Datum, Bemerkung.
- **Zurückstellen** (Sonderfall): bis zu einem Tag in der Zukunft, mit Pflicht-Grund.
- **Ausführen** (mit Bestätigung und Zahl der Datensätze): nach der Entscheidung `afterDecision`, bei bestätigtem Sonderfall die Aktion der Regel. Ohne Entscheidung `retention.decisionMissing`; Blockierte bleiben mit Grund stehen. Erst laufen die abhängigen Module (`registerDependent`), dann die Kategorie.
- Der Fall bleibt als Nachweis; nach dem Ausführen trägt er nur noch den neutralen Namen (Nummer, Bezeichnung; nie Namen von Personen). Anzeigenamen sind verborgene Felder, die Historie enthält sie nicht.
- Audit: `retention.offered`, `retention.exported`, `retention.decided`, `retention.deferred`, `retention.executed`; die Kategorien erscheinen im Audit-Log mit ihrem Namen (Verweis `core.retention-category`).

## Wirkung

| Aktion | Wirkung |
| --- | --- |
| Personalakte anonymisieren | Kontakt, Anrede, Titel, Spitzname, Geburtsdatum und -ort, Arbeitgeber, Bankverbindung, Notizen, Führerschein mit Kontrollen, erneuten Vorlagen und Transpondern, Qualifikationen, Ehrungen, Ämter, Ruhezeiten, Lehrgangsteilnahmen und Vormerkungen entfernt, Historie gelöscht, `fileAnonymizedAt` gesetzt; dann `PersonDataRegistry` (siehe unten). Name, Personalnummer, Mitgliedschaften und Dienstgrade bleiben |
| Grunddaten anonymisieren | zuerst die Personalakte, dann Name „N.“/„N.“ (in jeder Sprache gleich), Personalnummer entfernt, `anonymizedAt`; Mitgliedschaften, Dienstgrade und Verweise in Berichten bleiben, die Statistik stimmt weiter |
| Einsätze anonymisieren | Meldebild, Straße, Hausnummer, Objekt, Zusatz und Koordinaten, Begründung der Kostenpflicht und Bemerkungen; in den Berichten Lage, Maßnahmen, Ursache, Einsatzleiter (Freitext), Rückgabekommentar, Sperrvermerk und Begründungen der Prüfregeln; Namen, Anschriften, Telefon, Kennzeichen und Notizen der Beteiligten (die Rolle bleibt); Namen von Gästen und Begründungen manueller Beträge; Notizen sonstiger Kräfte; alle Versionen, Anhänge und die Historie. Es bleiben Stichwort, Zeiten, Gemeinde, Ortsteil und PLZ, Fahrzeuge, Personal mit Funktion und Zeiten (Mitglieder als Verweis, ihre Namen folgen der Aufbewahrung der Personen), sonstige Kräfte und die Statistikmerkmale. Jahresstatistik und Einsatzzahlen ändern sich nicht. `anonymizedAt` gesetzt; die Einsatzseite zeigt den Hinweis. Ausnahmen „Kein EvD“ verlieren Grund und Namen |
| Einsätze löschen | Einsatz, Berichte mit Personal, Fahrzeugen, Beteiligten, Versionen, Anhänge und Historie; dazu erwartete EvD-Berichte und Ausnahmen, gewählter Tatbestand des Kostenersatzes, Geräteverwendungen. Nur ohne offenen Kostenbescheid und ohne Entschädigungsposten. Folgen: Auswertungen vergangener Jahre ändern sich (abgeschlossene Jahresstatistiken behalten ihre gespeicherten Werte) |
| Dienste löschen | Dienst, Anwesenheiten, Anhänge (Protokolle), Historie und Geräteverwendungen; nur ohne Entschädigungsposten. Dienstbeteiligung vergangener Jahre ändert sich; Nachweise im Modul Atemschutz bleiben als eigene Nachweise |
| Geräte löschen | nur ausgesonderte; mit Prüfungen, Mängeln, deren Anhängen, Verwendungen und Historie |
| Fahrzeuge löschen | nur ausgesonderte, auf die nichts mehr verweist |
| Kostenbescheide löschen | nur erledigte; mit Zahlungen, Mahnungen, PDF und Historie |
| Auszahlungsläufe löschen | mit ihren Posten und der Historie |
| Audit-Log, Historie löschen | Einträge älter als die Frist; bei Historie lassen sich ältere Stände nicht mehr wiederherstellen, der aktuelle Stand bleibt |

## Personendaten in den Modulen (`PersonDataRegistry`)

Die Anonymisierung der Personalakte ruft `PersonDataRegistry.anonymize(personIds)` auf; jedes Modul entfernt, was es über die Personen speichert, danach ersetzt der Core die Namen der Personen und ihrer Konten in allen Text- und JSON-Spalten durch „N. N.“ ([vollständige Anonymisierung](datenschutz.md#vollständige-anonymisierung-l13)). Dieselben Beiträge beantworten die [Löschprüfung](datenschutz.md#löschprüfung-l7) einer Anfrage auf Löschung (`erasure`, `erase`).

| Modul | Wirkung |
| --- | --- |
| Core | verknüpfte Benutzer gesperrt, „N. N.“, ohne E-Mail, Passwort, OIDC, zweiten Faktor, Sitzungen, Links, Tokens und Historie; gemerkte Zuordnungen des Tabellen-Imports zur Person gelöscht |
| Datenschutz | Datenschutzanfragen ohne Texte, erstellte Auskünfte gelöscht, Einschränkung, Information und Kenntnisnahmen des Datenschutzhinweises gelöscht; Einwilligungen und Leseprotokoll bleiben bis zu ihrer Frist (auch bei abgeschaltetem Modul) |
| Atemschutz | Eignungsuntersuchungen gelöscht, übrige Nachweise ohne Untersucher, Einrichtung, Einschränkungen und Notizen, Historie und gespeicherte Ampel |
| Kleiderkammer | Größen gelöscht, Notizen und Stornogründe der Ausgaben geleert |
| Beförderungen | Gründe der Ausschlüsse geleert, Namen und Kommentare in Beförderungslisten ersetzt, auch in der Historie der Listen |
| Übungsdienst | Entschuldigungstexte der Anwesenheiten geleert (samt Historie) |
| Einsatzleiter vom Dienst | Notizen der Dienste im EvD-Dienstplan geleert (samt Historie) |
| Entschädigungen | Name in Auszahlungen ohne Bankverbindung und in der Liste „ohne IBAN“ wird „N. N.“ (samt Historie der Läufe); Beträge und Verweis auf die Person bleiben als Buchungsunterlage |
| Geräte | gemeldete Mängel nennen statt des Namens „N. N.“, wenn ein Benutzer der Person sie gemeldet hat (samt Historie) |
| Einsätze | Begründungen manueller Beträge des Personals geleert (samt Historie der Personaleinträge); Personal und Verfasser bleiben als Verweis |
| MP-Feuer | Zeilen der Laufberichte mit dem Namen „N. N.“, Zeilen der Transferdateien mit dem Namen entfernt, gemerkte Zuordnungen zur Person gelöscht |

Einsatzberichte speichern Mitglieder nur als Verweis (Personal, Verfasser); ihre Namen folgen den Grunddaten. Kostenersatz, Infoterminal und Datensicherung speichern keine Daten über Mitglieder, nur Namen von Benutzern („erfasst von“, „eingerichtet von“, „gestartet von“); diese ersetzt die Namensersetzung des Core. Gespeicherte PDF-Dateien der Kostenbescheide bleiben unverändert bis zu ihrer Frist.

## Schnittstellen

| Methode | Pfad | Recht | Zweck |
| --- | --- | --- | --- |
| `GET` | `/core/retention/categories` | `core.settings.manage` oder `core.retention.manage` | Kategorien (`RetentionCategory[]`) mit Unterarten, Ereignis, erlaubten Aktionen, Standardregel |
| `POST` | `/core/retention/run` | `core.settings.manage` oder `core.retention.manage`; Probelauf mit `settings` nur `core.settings.manage` | Regeln anwenden (`RetentionRun`: `dryRun`, `settings.retention`). Antwort `RetentionResult`: `counts` und `cases` je Regel, `effectiveYears`, `warnings` |
| `GET` | `/core/retention/cases` | `core.retention.manage` | Aussonderungsfälle (`RetentionCase[]`) |
| `POST` | `/core/retention/cases/offer` | `core.retention.manage` | Anbieten (`RetentionOffer`: `caseIds`, `archive`, `note`); Antwort `{ offerId }`. Fehler `retention.notOfferable`, `retention.caseNotFound` |
| `GET` | `/core/retention/offers/:offerId/export?lang=` | `core.retention.manage` | ZIP für das Archiv. Fehler `retention.offerNotFound` |
| `POST` | `/core/retention/cases/decide` | `core.retention.manage` | Entscheidung (`RetentionDecision`: `decision` `accepted`/`destroyed`, `date`, `note`); 204. Fehler `retention.notOffered` |
| `POST` | `/core/retention/cases/defer` | `core.retention.manage` | Zurückstellen (`RetentionDeferral`: `until`, `reason`); 204. Fehler `retention.deferInPast`, `retention.alreadyDone` |
| `POST` | `/core/retention/cases/execute` | `core.retention.manage` | Ausführen (`RetentionExecution`); Antwort `{ executed, failed: [{ caseId, code }] }` mit `retention.decisionMissing`, `retention.deferred`, `retention.alreadyDone`, `retention.categoryUnavailable` oder dem Grund der Blockade |
| `PUT` | `/incidents/incidents/:id/retention` | Freigeber, `incidents.costs` oder Schreiber des Hauptberichts | „30 Jahre aufbewahren (Sonderfall)“ setzen |
