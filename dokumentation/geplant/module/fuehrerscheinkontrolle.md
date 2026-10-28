# Führerscheinkontrolle

Geplante Erweiterung des Moduls Stammdaten (`masterdata`). Sie bekommt ein eigenes Dokument, weil sie über die Personalakte hinausgeht: Fristen, Nachweisliste, Einstellungen, Selbstkontrolle am Infoterminal und in „Mein Bereich“. Ein eigenes Modul lohnt sich nicht, denn der Führerschein gehört zur Person, und die Jahresstatistik (F21, Klasse C/CE) liest ihn schon heute über `PERSON_DIRECTORY`.

Mockups (zur Freigabe): `stammdaten/person-fuehrerschein.html`, `stammdaten/fuehrerscheinkontrollen.html`, `stammdaten/fuehrerschein-einstellungen.html`, `infoterminal/fuehrerschein.html`, `infoterminal/fuehrerschein-bestaetigen.html`, `shell/mein-fuehrerschein.html` und die Aufgabe auf `shell/start.html` (siehe [Mockups](../mockups/README.md#seiten)).

## Heutiger Stand

- An der Person steht `driverLicense` als JSON: `classes` (Liste von Texten), `expiresOn` (ein Datum für alles), `lastCheckedOn`. Gepflegt im Reiter „Feuerwehr“, Karte „Führerschein“.
- Es gibt nur die Frist `driver-license-expires` („Führerschein läuft ab“, 60 Tage Vorlauf). Wer wann kontrolliert hat und ob das Original vorlag, steht nirgends; `lastCheckedOn` überschreibt sich bei jeder Änderung und ist nur über die Historie der Person nachvollziehbar.

## Rechtlicher Hintergrund

Grundlage ist der Fachartikel von R. Fischer, „Unnötige Bürokratie oder gesetzliche Pflicht? – die regelmäßige Führerscheinkontrolle in der Feuerwehr“, BRANDSCHUTZ Deutsche Feuerwehr-Zeitung 6/26, S. 489–491. Kurz zusammengefasst:

- Die Pflicht folgt aus der Halterhaftung nach § 21 StVG (Halter ist die Gemeinde, vertreten durch den Bürgermeister; die Aufgabe lässt sich an den Feuerwehrkommandanten übertragen).
- Eine feste Prüffrist ordnen weder das StVG noch die DGUV-Vorschriften an. Nach der Rechtsprechung genügt eine einmalige Kontrolle; erneut zu prüfen ist bei konkreten Anhaltspunkten.
- Die halbjährliche Kontrolle ist eine Empfehlung der DGUV Regel 105-049 (Abschnitt 4.5), keine Vorschrift. Ein Gesetzentwurf des Bundesrats (Drucksache 21/1386) will die einmalige Vorlage gesetzlich klarstellen; sein Ausgang ist offen.
- Daraus folgt: Den Führerschein **einmal** im Original vorlegen lassen. Erneut vorlegen lassen bei **konkreten Anhaltspunkten** und bei **befristeten Klassen** (z. B. C/CE alle 5 Jahre) **zum Ablauf der Befristung**. Personalverwaltungsprogramme sollen das überwachen.
- Zu dokumentieren sind nur die erforderlichen Daten: Klassen und gegebenenfalls deren Befristung. **Kopien oder Fotos des Führerscheins sind datenschutzrechtlich unzulässig.**

f.orga gibt deshalb keinen Rhythmus vor. Der Standard ist die anlassbezogene Kontrolle; ein regelmäßiges Intervall lässt sich zuschalten, wenn die Gemeinde es so festlegt. Die Texte der Oberfläche nennen den Artikel als Quelle und keine weiteren Vorschriften.

## Begriffe

| Begriff | Bedeutung |
| --- | --- |
| Führerscheinklasse | Klasse mit optionaler Befristung („gültig bis“). Befristet sind vor allem C1, C1E, C und CE. |
| Führerscheinkontrolle | Nachweis, dass der Führerschein vorlag: Datum, Prüfer, Art, „Original vorgelegt“, die festgestellten Klassen mit Befristung, Bemerkung. Wird nie geändert, nur storniert. |
| Ersterfassung | erste Kontrolle mit Vorlage des Originals. Ohne sie gilt eine Person der Zielgruppe als „nicht kontrolliert“. |
| Erneute Vorlage | Aufforderung aus konkretem Anlass (z. B. Hinweis auf Fahrverbot, Unfall, neue Klasse) mit Grund und Frist; erledigt durch die nächste Kontrolle. |
| Selbstkontrolle | Die Person hält ihren registrierten Transponder oder Barcode an ein Lesegerät und bestätigt, dass ihr Führerschein gültig ist. Nur im periodischen Modus und nur, wenn eingeschaltet. |
| Transponder | NFC-Aufkleber oder Barcode-Aufkleber auf dem Führerschein, dessen Kennung einer Person zugeordnet ist. |
| Zielgruppe | Personen, deren Führerschein überwacht wird. |

## Zielgruppe

Überwacht werden Personen mit Status Probezeit oder aktiv, die
- mindestens eine Klasse aus den **überwachten Klassen** haben (Einstellung, Standard C1, C1E, C, CE; B und BE lassen sich hinzunehmen), **oder**
- eine der **Qualifikationen für Fahrer** haben (Einstellung, Standard `machinist`; z. B. `aerial-ladder-operator` hinzunehmen).

Wer Maschinist ist, aber keine Klasse eingetragen hat, erscheint mit „Klassen fehlen“ in der Liste; seine Ersterfassung ist fällig. Jugendfeuerwehr, Altersabteilung, Passive und Ausgeschiedene sind ausgenommen.

## Datenmodell

Die Änderung betrifft das JSON-Feld `driverLicense` der Person und zwei neue Entitäten im Schema `masterdata`, alle historisiert mit Elternbezug `person`.

**`driverLicense` (geändert):**

| Feld | Inhalt |
| --- | --- |
| `classes` | Liste `{ class, expiresOn }` statt Texten: je Klasse eine eigene Befristung (`null` = unbefristet) |
| `documentExpiresOn` | optional: Ablauf des Dokuments (Kartenführerscheine sind befristet ausgestellt), erzeugt nur einen Hinweis |
| `expiresOn` | entfällt, ersetzt durch die Befristung je Klasse |
| `lastCheckedOn` | entfällt als Eingabefeld; wird aus der jüngsten gültigen Kontrolle berechnet und weiter geliefert (`PERSON_DIRECTORY`, Listen) |

Alte Werte werden beim Lesen umgedeutet (Zod-`preprocess` im Vertrag), es braucht dafür keine Datenmigration: Texte werden zu Klassen ohne Befristung; ein altes `expiresOn` wird den befristbaren Klassen C1, C1E, C und CE zugeordnet, gibt es keine davon, wird es `documentExpiresOn`; ein altes `lastCheckedOn` erzeugt beim ersten Speichern eine Kontrolle der Art `legacy` („aus Altdaten, Prüfer unbekannt“). `snapshots()` liefert weiter `driverLicenseClasses` als Liste der Klassennamen, die Jahresstatistik ändert sich nicht.

**`DriverLicenseCheck`** (Tabelle `driver_license_check`):

| Feld | Inhalt |
| --- | --- |
| `person` | Person |
| `checkedOn` | Tag der Kontrolle (nicht in der Zukunft) |
| `method` | `in-person` (Original gesehen), `transponder`, `barcode` (Selbstkontrolle), `legacy` (Altdaten) |
| `checkedBy` | prüfende Person (bei `in-person` Pflicht, vorbelegt mit der Person des Benutzers); bei Selbstkontrolle leer |
| `originalPresented` | Original vorgelegt (bei `in-person` Pflicht `true`; eine Kopie oder ein Foto zählt nicht) |
| `classes` | festgestellte Klassen mit Befristung (Stand zum Zeitpunkt der Kontrolle) |
| `selfDeclaration` | bei Selbstkontrolle: bestätigter Text in der Sprache der Oberfläche |
| `terminalId`, `device` | Infoterminal bzw. „Mein Bereich“ (Browser) bei Selbstkontrolle |
| `requestId` | erledigte erneute Vorlage, falls eine offen war |
| `note` | Bemerkung |
| `cancelledAt`, `cancelledBy`, `cancelReason` | Storno statt Löschen |

Eine Kontrolle `in-person` übernimmt ihre Klassen in `driverLicense` der Person (der Dialog ist zugleich die Pflege der Klassen). Eine Selbstkontrolle ändert die Klassen nie.

**`DriverLicenseRequest`** (Tabelle `driver_license_request`): Person, Grund (Text, Pflicht), fällig am, angefordert von/am, erledigt durch Kontrolle (`checkId`) oder zurückgenommen (mit Grund).

**`DriverLicenseToken`** (Tabelle `driver_license_token`): Person, Art (`nfc` oder `barcode`), `codeHash`, Endung (letzte 4 Zeichen zum Wiedererkennen), registriert am/von, gesperrt am/von mit Grund. Höchstens ein nicht gesperrter Token je Person. `codeHash` ist ein HMAC-SHA-256 der normalisierten Kennung (`normalizeRfid` wie bei der Code-Suche) mit einem aus `FORGA_SECRET_KEY` abgeleiteten Schlüssel; die Kennung selbst wird nicht gespeichert. Ohne `FORGA_SECRET_KEY` lässt sich kein Transponder registrieren (`masterdata.noSecretKey`). Ein HMAC statt eines einfachen Hashes, weil NFC-Kennungen nur 4–10 Byte haben und ein einfacher Hash sich durchprobieren ließe. Gleiche Kennung bei zwei Personen: `409 masterdata.tokenTaken`.

Keine Datei, kein Foto, kein Scan des Führerscheins: Es gibt keinen Anhang an Kontrollen, und die Oberfläche sagt das im Dialog.

## Modi und Fristen

Einstellung `masterdata.driverLicense` (Seite „Verwaltung → Module → Stammdaten → Führerscheinkontrolle“, auch über „Einstellungen“ auf der Liste, Recht `masterdata.settings.manage`):

| Feld | Bedeutung | Standard |
| --- | --- | --- |
| `mode` | `on-occasion` (anlassbezogen) oder `periodic` (zusätzlich regelmäßig) | `on-occasion` |
| `intervalMonths` | nur `periodic`: Abstand der Kontrollen, 3–24 Monate; die Oberfläche bietet 6 und 12 an und nennt die DGUV Regel 105-049 als Empfehlung | 6 |
| `monitoredClasses` | überwachte Klassen | C1, C1E, C, CE |
| `driverQualifications` | Qualifikationen für Fahrer | `machinist` |
| `leadDays` | Vorlauf der Fristen | 30 |
| `selfCheck` | Selbstkontrolle erlauben (nur `periodic`) | aus |
| `selfCheckChannels` | `info-terminal`, `me` | beide |
| `inPersonEveryMonths` | auch bei Selbstkontrolle spätestens nach so vielen Monaten im Original vorlegen, 6–36 | 12 |

Fristen (`DeadlineProvider` der Stammdaten, zuständig ist, wer `masterdata.licenses.check` für eine Abteilung der Person hat):

| Art (`kind`) | Fällig | Modus |
| --- | --- | --- |
| `driver-license-first-check` | Ersterfassung fehlt: sofort bei Aufnahme in die Zielgruppe (Klasse eingetragen, Qualifikation erworben, aktiv geworden) | beide |
| `driver-license-class-expires` | je befristeter überwachter Klasse ihr Ablauf; erledigt durch eine Kontrolle `in-person` mit neuer Befristung | beide |
| `driver-license-request` | erneute Vorlage: das gesetzte Fälligkeitsdatum | beide |
| `driver-license-check-due` | jüngste gültige Kontrolle + `intervalMonths` | `periodic` |
| `driver-license-in-person-due` | jüngste Kontrolle `in-person` + `inPersonEveryMonths`; Selbstkontrollen schieben sie nicht hinaus | `periodic` mit Selbstkontrolle |
| `driver-license-expires` | entfällt, aufgegangen in `driver-license-class-expires` | – |

Im anlassbezogenen Modus gibt es also keine regelmäßige Frist. Ein abgelaufenes Dokument (`documentExpiresOn`) erscheint nur als Hinweis in Akte und Liste.

## Rechte und Rollen

| Recht | Bereich | Inhalt |
| --- | --- | --- |
| `masterdata.licenses.check` (neu) | Abteilung | Kontrolle erfassen und stornieren, erneute Vorlage anfordern und zurücknehmen, Transponder registrieren und sperren, Liste „Führerscheinkontrollen“ |
| `masterdata.persons.read` | Abteilung | Führerschein und Kontrollen in der Akte lesen |
| `masterdata.self` | – | eigene Klassen und Kontrollen in „Mein Bereich“, Selbstkontrolle dort |
| `masterdata.settings.manage` | Gesamtwehr | Einstellungen |

Rollenvorlagen: `commander` (über `masterdata.*`) und `department-commander` erhalten `masterdata.licenses.check`. Das Recht lässt sich einer eigenen Rolle „Fahrerbeauftragter“ geben, wenn der Kommandant die Aufgabe delegiert. Die Frist erscheint bei allen mit dem Recht in einer Abteilung der Person.

## Abläufe

**Kontrolle erfassen** (Akte → Führerschein → „Kontrolle erfassen“, auch aus der Liste und aus der Aufgabe):
1. Datum (heute), Prüfer (eigene Person, änderbar auf eine Person mit dem Recht), „Original vorgelegt“ (Pflicht).
2. Klassen wie auf dem Original mit „gültig bis“ je Klasse; vorbelegt aus der Akte, Änderungen hervorgehoben.
3. Bemerkung. Offene erneute Vorlage wird angezeigt und mit erledigt.
4. Optional im selben Dialog: Transponder registrieren (siehe unten).

**Erneute Vorlage anfordern** (Akte oder Liste): Grund (Pflicht, z. B. „Hinweis auf Fahrverbot“, „neue Klasse angegeben“, „Unfall mit Dienstfahrzeug“), fällig am (Standard in 14 Tagen). Bis zur Kontrolle steht die Person in der Liste als „Vorlage angefordert“ und die Aufgabe bei den Zuständigen. Der Grund ist nur für Benutzer mit `masterdata.licenses.check` sichtbar, weil er auf persönliche Umstände schließen lässt.

**Stornieren** einer Kontrolle mit Grund (z. B. falsche Person); sie bleibt in der Historie sichtbar und zählt nicht mehr.

## Selbstkontrolle mit Transponder oder Barcode

Manche Feuerwehrleute haben auf ihrem Führerschein einen Transponder (NFC-Aufkleber) oder Barcode-Aufkleber. Wird er gescannt, gilt der Führerschein als kontrolliert. Das ist eine **optionale Komfortfunktion für Feuerwehren mit periodischem Intervall**. Im anlassbezogenen Modus gibt es keine Selbstkontrolle: Ein Scan zeigt dort nur „Ihr Führerschein ist erfasst, nächste Kontrolle bei Ablauf der Klasse CE am …“.

**Registrieren:** Nur bei einer Kontrolle `in-person`, also nachdem der Prüfer das Original gesehen hat. Der Prüfer scannt den Aufkleber auf dem Original: Handscanner oder NFC-Lesegerät im Tastaturmodus, auf dem Handy Kamera (Barcode-Erkennung bzw. ZXing wie bei der Code-Suche) oder Web NFC (`CodeInput` aus `web-ui`). Empfehlung im Dialog: ein Siegel-Aufkleber, der beim Ablösen sichtbar zerstört wird, damit er nicht auf ein anderes Dokument wandern kann. Ersetzen sperrt den alten Token; Sperren mit Grund (verloren, neuer Führerschein, Missbrauch).

**Am Infoterminal** (Kiosk, nur wenn `selfCheck` an und Kanal `info-terminal`):
- Die Übersicht bekommt die Kachel „Führerschein kontrollieren“ (im freigegebenen Mockup der Übersicht nicht eingezeichnet; sie führt zu `infoterminal/fuehrerschein.html`). Ein Lesegerät im Tastaturmodus darf auch direkt auf der Übersicht lesen: Eine Eingabe, die mit Enter endet und nicht in einem Feld steht, gilt als Scan.
- Auf Android-Tablets mit Chrome liest das Terminal NFC über Web NFC, sonst Barcode und QR über die Kamera (vorhandener Code-Scanner).
- Nach dem Scan zeigt das Terminal Vorname und Nachname, die Klassen und die Selbsterklärung „Mein Führerschein ist gültig. Gegen mich besteht kein Fahrverbot und keine Entziehung der Fahrerlaubnis.“ mit „Bestätigen“ und „Das bin ich nicht“. Erst die Bestätigung legt die Kontrolle an (`method` `transponder` bzw. `barcode`, `terminalId`, Zeitpunkt, Text der Erklärung).
- Unbekannter oder gesperrter Code: „Dieser Führerschein ist nicht registriert. Bitte beim Kommandanten im Original vorzeigen.“ Es wird nicht verraten, ob der Code gesperrt ist oder nie registriert war.
- Ist eine Kontrolle im Original fällig (`driver-license-in-person-due`, Ablauf einer Klasse, erneute Vorlage), nimmt das Terminal keine Selbstkontrolle an und nennt den Grund ohne Einzelheiten („Bitte den Führerschein im Original vorzeigen“).
- Kiosk-Endpunkt `POST /api/info-terminal/kiosk/driver-license` mit Code und Bestätigung, umgesetzt über einen Vertrag der Stammdaten (`MASTERDATA_LICENSE_SELF_CHECK`) wie das Eintragen in Einsatzberichte. Das Terminal liest dabei nur Name und Klassen der getroffenen Person, nie die Liste der Tokens. Begrenzung wie bei den übrigen Kiosk-Anfragen, zusätzlich 10 unbekannte Codes je Terminal in 10 Minuten.

**In „Mein Bereich“** (nur wenn Kanal `me`): Abschnitt „Mein Führerschein“ mit Klassen, letzter Kontrolle, nächster Fälligkeit und „Selbst kontrollieren“ (Web NFC oder Kamera). Gleiche Selbsterklärung. Der gescannte Code muss zum Token der eigenen Person passen; ein fremder Token wird abgelehnt, ohne den Inhaber zu nennen.

**Grenzen, die die Oberfläche nennt:**
- Ein Aufkleber beweist, dass jemand den Aufkleber hat, nicht dass die Fahrerlaubnis gilt. Eine Entziehung oder ein Fahrverbot erkennt er nicht; dafür stehen die Selbsterklärung und die Kontrolle im Original nach `inPersonEveryMonths`.
- NFC-Kennungen (UID) lassen sich kopieren, Barcodes erst recht. Der Siegel-Aufkleber erschwert das Umkleben, nicht das Kopieren.
- Selbstkontrollen erscheinen in Liste und Nachweis immer als solche („Selbstkontrolle Transponder“), nie als Kontrolle im Original.

## Liste und Nachweis für die Gemeinde

Seite `/masterdata/driver-licenses` (Menü Stammdaten → „Führerscheinkontrollen“, Recht `masterdata.licenses.check`): Personen der Zielgruppe in den Abteilungen des Benutzers mit Klassen, nächster Befristung, letzter Kontrolle (Art, Prüfer), Transponder ja/nein und Stand: „kontrolliert“, „fällig in n Tagen“, „überfällig“, „Ersterfassung fehlt“, „Vorlage angefordert“, „Klassen fehlen“. Filter nach Abteilung, Stand und Art der letzten Kontrolle. Aktionen je Zeile: „Kontrolle erfassen“, „Erneute Vorlage anfordern“.

Listenvorlagen (`ListRegistry`):

| ID | Inhalt | Recht |
| --- | --- | --- |
| `masterdata.driver-licenses` | Stand je Person der Zielgruppe (wie die Seite) | `masterdata.licenses.check` |
| `masterdata.driver-license-checks` | Nachweis für den Halter: alle Kontrollen im Zeitraum mit Datum, Person, Klassen und Befristung, Art, Prüfer, „Original vorgelegt“; optional mit Unterschriftenspalte des Kommandanten. PDF für die Gemeinde | `masterdata.licenses.check` |

Der Nachweis enthält keine Gründe erneuter Vorlagen und keine Transponder-Kennungen.

## Datenschutz und Audit

- Gespeichert werden nur Klassen, Befristungen, Datum, Prüfer und Art der Kontrolle. Keine Führerscheinnummer, keine Kopie, kein Foto.
- Transponder: nur HMAC und Endung; Registrieren, Ersetzen und Sperren stehen im Audit-Log (`masterdata.license-token-registered`, `.license-token-revoked`), Selbstkontrollen in der Historie der Person. Unbekannte Codes am Terminal: `info-terminal.unknown-license-code` (höchstens ein Eintrag je Terminal und Stunde).
- Auskunft (Art. 15 DSGVO) enthält Kontrollen, Anforderungen und Tokens (ohne Hash). Die Anonymisierung entfernt Kontrollen, Anforderungen und Tokens.
- Aufbewahrung der Kontrollen: siehe [Aufbewahrung](../aufbewahrung.md); Vorschlag: Kontrollen bis zum Austritt plus Frist der Personalakte.

## Optional: Prüfregel im Einsatzbericht (nicht entschieden)

Vorschlag für die Einsatzberichte, standardmäßig aus:
- `driver-license-check-overdue` (Warnung): Eine Person mit der Funktion Maschinist (oder einer als Fahrer markierten Funktion) hat am Einsatztag eine überfällige Frist der Führerscheinkontrolle oder keine Ersterfassung.
- `driver-license-class-missing` (Warnung): Ihr fehlt am Einsatztag die Klasse, die der Fahrzeugtyp verlangt. Dafür bekäme der Fahrzeugtyp im Katalog ein Zusatzfeld `requiredLicenseClass` (z. B. C für LF 20, C1 für MLF) und die Funktion ein Kennzeichen `driver`.

Die Daten kommen über `PERSON_DIRECTORY.snapshots()` (Klassen mit Befristung und Stand der Kontrolle zum Stichtag). Eine Warnung braucht wie alle Warnungen eine Begründung, sperrt also nichts. Bedenken: Im Einsatzbericht wird der Maschinist nachträglich erfasst; die Regel stellt fest, verhindert aber nichts. Sinnvoller Ort für eine echte Kontrolle wäre eine spätere Fahrzeugbesetzung vor dem Ausrücken.

## Offene Entscheidungen

1. **Ort im Code:** Teil der Stammdaten oder eigenes Modul? *Empfehlung:* Stammdaten (Daten der Person, F21 der Statistik, Fristen dort schon vorhanden).
2. **Standardmodus:** anlassbezogen nach dem Fachartikel, periodisch nur auf Wunsch der Gemeinde. *Empfehlung:* so; der Wechsel zum periodischen Modus zeigt einen Hinweis, dass das eine Empfehlung der DGUV Regel 105-049 ist.
3. **Zielgruppe:** überwachte Klassen C1/C1E/C/CE plus Qualifikation Maschinist; B/BE nur auf Wunsch. *Empfehlung:* so; Feuerwehren mit MTW und Kommandowagen der Klasse B nehmen B hinzu.
4. **Selbstkontrolle:** nur im periodischen Modus, standardmäßig aus, Kontrolle im Original spätestens alle 12 Monate. *Empfehlung:* so; im anlassbezogenen Modus bringt sie keinen Nutzen, weil es keine regelmäßige Frist gibt.
5. **„Mein Bereich“ als Kanal:** Selbstkontrolle auch am eigenen Handy? Sie ist leichter zu missbrauchen als am Terminal in der Wache (kopierter Code genügt). *Empfehlung:* Kanal anbieten, aber standardmäßig nur `info-terminal` einschalten.
6. **Prüfregel im Einsatzbericht** mit Pflichtklasse am Fahrzeugtyp. *Empfehlung:* später, nach Rückmeldung aus dem Betrieb; zuerst Liste und Fristen.
7. **Altdaten:** altes `expiresOn` den Klassen C1/C1E/C/CE zuordnen. *Empfehlung:* so und in der Liste „Befristung prüfen“ markieren, bis die erste Kontrolle im neuen Dialog erfasst ist.
