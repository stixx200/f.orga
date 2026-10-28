# Modul Infoterminal

Release offen (siehe [Releaseplan](../roadmap.md#infoterminal)). Benötigt: Stammdaten, Einsatzberichte. Nutzt optional: Dienste. Modul-ID `info-terminal`, Datenbankschema `info_terminal`, Rechte `info-terminal.*`, API unter `/api/info-terminal/…`. Alle Oberflächen sind deutsch und englisch.

**Status: Konzept und Mockups freigegeben.** Nichts davon ist umgesetzt. Mockups: [`mockups/infoterminal/`](../mockups/README.md#seiten).

## Zweck

Nach einem Einsatz oder Dienst tragen sich die Einsatzkräfte an einem Gerät in ihrer Wache selbst ein, mit Fahrzeug oder Bereitschaft, Funktion und den Angaben für die Entschädigung. In MP-Feuer heißt das „Infoterminal“. Der Verfasser des Berichts muss das Personal dann nicht mehr von Zetteln abschreiben, sondern nur prüfen.

- Jede Wache hat ihr eigenes Infoterminal. Damit ist die Abteilung und deren Bericht festgelegt.
- Eintragen geht nur in einem Zeitfenster um den Einsatz oder Dienst (siehe [Zeitfenster](#zeitfenster)).
- Das Terminal ist eine eigenständige Seite ohne Shell-Rahmen und ohne Benutzerkonto. Es kann nur eintragen, nichts lesen außer dem Nötigsten.
- Die Seite der Wache in den Stammdaten zeigt die Terminals der Wache und verlinkt ihre Verwaltung.

## Begriffe

| Begriff | Bedeutung |
| --- | --- |
| Infoterminal | Ein freigeschaltetes Gerät (Tablet, PC) an einer Wache. Mehrere Terminals je Wache sind möglich, z. B. „Tablet Fahrzeughalle“ und „PC Funkraum“. |
| Geräteschlüssel | Geheimer Zufallswert, mit dem sich ein Terminal ausweist. Er steckt im Einrichtungslink und danach in einem Cookie des Geräts. |
| Eintragung | Eine Zeile, die eine Person am Terminal anlegt: im Personal des Abteilungsberichts oder in der Anwesenheit eines Dienstes, gekennzeichnet „vom Infoterminal“. |
| Zeitfenster | Zeitraum, in dem ein Einsatz oder Dienst am Terminal erscheint und Eintragungen angenommen oder geändert werden. |

## Rollen und Rechte

| Recht | Bereich | Inhalt |
| --- | --- | --- |
| `info-terminal.read` | Abteilung | Terminals der Wachen der Abteilung sehen (Status, zuletzt gesehen) |
| `info-terminal.manage` | Abteilung | Terminals für Wachen der Abteilung anlegen, umbenennen, neuen Link erzeugen, widerrufen |
| `info-terminal.settings.manage` | Gesamtwehr | Einstellungen des Moduls (`info-terminal.general`) |

- Maßgeblich ist die Abteilung der Wache. Wer `info-terminal.manage` für die Gesamtwehr hat, verwaltet alle Terminals.
- Rollenvorlagen: `commander` bekommt `info-terminal.*`, `department-commander` `info-terminal.read` und `info-terminal.manage` (Abteilung), `group-leader` `info-terminal.read`.
- Das Terminal selbst hat keine Rolle. Es darf genau die Aktionen unten, nur für seine Wache, und bekommt keine API-Rechte. Für die Historie bekommt jedes Terminal einen technischen Benutzer im Core wie ein API-Token (Name „Infoterminal Feuerwehrhaus Musterstadt · Tablet Fahrzeughalle“). So zeigt die Historie des Berichts, welches Gerät eingetragen hat.
- **Audit:** `info-terminal.created`, `info-terminal.key-rotated`, `info-terminal.revoked`, `info-terminal.renamed`, `info-terminal.incident-created` (Einsatz am Terminal angelegt oder Bericht hinzugefügt), `info-terminal.invalid-key` (gesammelt, höchstens ein Eintrag je Adresse und Stunde). Einzelne Eintragungen stehen nicht im Audit-Log, sondern in der Historie des Berichts bzw. Dienstes.

## Lebenszyklus eines Terminals

1. **Anlegen** in „Verwaltung → Infoterminals“ oder auf der Seite der Wache: Wache, Bezeichnung des Geräts, erlaubte Aktionen (Einsätze eintragen immer; „Neuer Einsatz“ und „Dienste“ abschaltbar), Sprache beim Start.
2. **Link und QR-Code** erscheinen genau einmal: `https://<adresse>/terminal#k=fit_<zufall>`. Der Schlüssel steht im Fragment (`#`), damit er nicht in Protokollen von Server und Proxy landet. Gespeichert wird nur sein SHA-256 und ein Präfix zum Wiedererkennen (wie bei API-Tokens). Die Adresse kommt aus `brigade.publicUrl` bzw. `FORGA_PUBLIC_URL`; ohne sie kann kein Terminal angelegt werden (`503` `info-terminal.noPublicUrl`).
3. **Einrichten auf dem Gerät:** Die Terminalseite liest den Schlüssel aus dem Fragment, tauscht ihn mit `POST /api/info-terminal/kiosk/session` gegen ein Cookie `forga_terminal` (`HttpOnly`, `SameSite=Strict`, `Secure` wie die Sitzung, Pfad `/api/info-terminal/kiosk`, 400 Tage, bei Nutzung verlängert) und entfernt das Fragment aus der Adresse (`history.replaceState`). Ein Lesezeichen enthält danach keinen Schlüssel mehr.
   - Kurzweg auf der Seite der Wache: „Dieses Gerät als Infoterminal einrichten …“ legt für den angemeldeten Verwalter ein neues Terminal an und öffnet es direkt auf dem aktuellen Gerät. Die eigene Sitzung bleibt davon getrennt (anderes Cookie, anderer Pfad); der Verwalter meldet sich danach auf dem Gerät ab.
   - Der Link lässt sich später nicht wieder anzeigen. Wer ihn verloren hat, erzeugt einen neuen Link.
4. **Zuletzt gesehen:** Jede Anfrage aktualisiert `lastSeenAt` (höchstens einmal je Minute). Die Verwaltung markiert Terminals, die länger als 30 Tage nicht gesehen wurden.
5. **Neuer Link:** erzeugt einen neuen Schlüssel; der alte gilt sofort nicht mehr (z. B. wenn der Link in falsche Hände geraten ist).
6. **Widerrufen:** jederzeit, sofort wirksam, mit Bestätigung. Das Gerät zeigt „nicht freigeschaltet“. Eintragungen bleiben in Berichten und Diensten. Ein widerrufenes Terminal lässt sich nicht wieder aktivieren.
7. **Automatisch ungültig:** wenn die Wache gelöscht wird (Verweis über `ORGANIZATION_REFERENCES`: Wachen mit Terminals lassen sich erst nach dem Widerruf löschen) oder das Modul deaktiviert ist (`404` `modules.inactive`, das Terminal zeigt „abgeschaltet“).

## Abläufe am Terminal

Die Mockups zeigen jeden Schritt. Nach 60 Sekunden ohne Eingabe und 10 Sekunden nach einer Bestätigung kehrt das Terminal zur Übersicht zurück, damit kein Name offen stehen bleibt.

### Startbildschirm

- Kopf mit Wache, Uhr und Sprachumschalter. Kein Menü, keine Suche, kein Link in die Anwendung.
- Kacheln für alle **Einsätze mit Bericht der Abteilung der Wache** und alle **Dienste der Wache**, deren Zeitfenster gerade offen ist, je mit Stichwort bzw. Titel, Alarm bzw. Uhrzeit, Ort, Zahl der Eingetragenen und dem Ende des Zeitfensters. Dienste, deren Fenster bald öffnet, stehen ausgegraut mit „Eintragen ab …“.
- „+ Neuer Einsatz“, wenn das Terminal es darf.
- Leerer Zustand: „Gerade ist nichts zum Eintragen offen“ mit dem nächsten Dienst und „+ Neuer Einsatz“.

### Einsatz eintragen

1. Einsatz antippen → **Wer sind Sie?** Namenskacheln aller Personen mit heute gültiger Mitgliedschaft in der Abteilung der Wache (Status Probezeit oder aktiv), sortiert nach Nachnamen, mit Sprungleiste nach Anfangsbuchstaben. Schon Eingetragene sind grün mit Haken und zeigen Fahrzeug und Funktion.
2. **Andere Abteilung:** Suchfeld ab 3 Buchstaben über alle aktiven Mitglieder von Einsatzabteilungen (höchstens 10 Treffer, nur Name und Kurzname der Abteilung). Personen, die schon in einem anderen Bericht desselben Einsatzes stehen, sind nicht wählbar und nennen die Abteilung.
3. **Formular:**
   - **Wo waren Sie?** Fahrzeuge der Wache als Kacheln mit belegten Plätzen, dann „Bereitschaft“ auf dieser Wache. „Anderes Fahrzeug …“ öffnet eine Auswahl aller Fahrzeuge in Dienst. Fahrzeuge heißen überall **Bezeichnung · Funkrufname (Abteilung)**, z. B. „LF 20/16 · Florian Musterstadt 1/44 (Musterstadt)“, gebildet mit `vehicleLabel(vehicle, departmentShortName)` aus `@forga/masterdata-contracts`, damit gleichnamige Fahrzeuge (mehrere „Anhänger“) unterscheidbar sind.
   - **Funktion** aus dem Katalog `function` (aktive Einträge, Reihenfolge des Katalogs), dazu „keine Angabe“.
   - **Weitere Angaben:** unter Atemschutz, Verdienstausfall beim Arbeitgeber, Einsatz während der Arbeitszeit beim Dienstherrn, „Ich war nicht die ganze Zeit dabei“ mit Von/Bis.
   - **Bei Bereitschaft** entfallen „Unter Atemschutz“ und „Ich war nicht die ganze Zeit dabei“ samt Von/Bis; stattdessen steht der Hinweis, dass die Bereitschaft für die Zeiten des Berichts gilt und pauschal zählt (Mockup `buchung.html#bereitschaft`). Eine Bereitschaftseintragung vom Terminal hat damit immer die Zeiten des Berichts (`from`/`to` = `null`) und keinen Atemschutz; wechselt jemand beim Ändern vom Fahrzeug zur Bereitschaft, werden beide Angaben entfernt.
4. **Eintragen** → Bestätigung mit Name, Fahrzeug, Funktion und Zeit, „Eingetragene ansehen“ oder „Fertig“.

### Ändern und Austragen

- Antippen eines grünen Namens oder „Eingetragen (n)“ zeigt die Eingetragenen je Fahrzeug.
- Eintragungen **vom Infoterminal** lassen sich ändern (Formular mit den bisherigen Angaben) und austragen (mit Bestätigung), solange das Zeitfenster offen und der Bericht ein ungesperrter Entwurf ist.
- Eintragungen **vom Verfasser** (Editor, Import, API) und Terminal-Eintragungen, die ein Benutzer im Editor geändert hat, sind am Terminal gesperrt („vom Verfasser“). Damit kann am Terminal niemand die Arbeit des Verfassers überschreiben.
- Ohne PIN kann jeder am Terminal jede Terminal-Eintragung ändern, ohne zeitliche Sperre innerhalb des Zeitfensters. Die Historie zeigt jede Änderung mit Terminal und Zeit; das genügt.

### Neuer Einsatz

Nur wenn kein passender Einsatz auf der Übersicht steht, z. B. weil die Leitstelle keine Schnittstelle hat.

1. Formular: Stichwort (Pflicht, Katalog der Einsatzberichte), Alarm (Pflicht, Uhrzeit heute; höchstens 12 Stunden zurück, nicht in der Zukunft), Leitstellennummer (optional), Straße und Ort (Ort vorbelegt mit dem Ort der Wache).
2. „Weiter“ prüft wie der Dialog „Einsatz anlegen“ mit `matches` auf passende Einsätze (gleiche Leitstellennummer oder ±2 Stunden mit gleichem Stichwort oder Ort). Gezeigt werden nur Stichwort, Alarm, Ort und beteiligte Abteilungen.
   - „Unseren Bericht hinzufügen“ legt den Bericht der Abteilung zu diesem Einsatz an (Nebenbericht; Hauptbericht nur nach der bestehenden Regel, wenn der Einsatz bisher nur Berichte von Einheiten hat).
   - „Nein, neuen Einsatz anlegen“ legt Einsatz und Bericht der Abteilung an (Hauptbericht).
3. Danach geht es direkt zu „Wer sind Sie?“.

Der neue Bericht hat **keinen Verfasser**; die Frist „Verfasser für Einsatzbericht zuweisen“ geht wie heute an die Schreiber der Abteilung. `incidents.incident.created` trägt `createdVia: 'terminal'` (neuer Wert), sodass z. B. das Modul Einsatzleiter vom Dienst wie gewohnt den EvD-Bericht anlegt. Ein am Terminal angelegter Einsatz hat Ende = Alarm + 1 h, unbestätigt, wie jeder neue Bericht.

### Dienst eintragen (mit Modul Dienste)

- Gezeigt werden Dienste, deren Wache die Wache des Terminals ist, oder ohne Wache, wenn die Abteilung der Wache zu den Abteilungen des Dienstes gehört. Abgeschlossene Dienste nie.
- Namenskacheln: Mitglieder der Abteilungen des Dienstes, die zu dieser Wache gehören, dazu die Suche wie oben.
- Formular: anwesend (fest), unter Atemschutz, „nicht die ganze Zeit dabei“ mit Von/Bis, Funktion als freier Text (wie die Rolle der Anwesenheit).
- Die Eintragung ist wie ein QR-Check-in **unbestätigt** (`confirmed: false`), bis jemand mit `training.attendance` die Anwesenheit speichert. Ein Dienst mit unbestätigten Eintragungen lässt sich nicht abschließen (bestehende Regel `training.unconfirmedCheckIns`).

## Zeitfenster

| Fall | Öffnet | Schließt |
| --- | --- | --- |
| Einsatz, Ende des Berichts bestätigt (`endConfirmed`) | Alarmzeit des Einsatzes | Ende des Abteilungsberichts + 60 Minuten |
| Einsatz, Ende noch nicht bestätigt | Alarmzeit des Einsatzes | Alarm + **12 Stunden**; bestätigt der Verfasser später ein Ende, gilt Ende + 60 Minuten, auch wenn das früher ist |
| Dienst | Beginn − `checkInBeforeMinutes` (Einstellung `training.general`, Standard 30) | geplantes Ende + 60 Minuten |

Immer gilt zusätzlich:
- Eintragen und Ändern nur, solange der Bericht ein **Entwurf** und **nicht gesperrt** ist (Server: dieselbe Prüfung wie beim Speichern, `incidents.notDraft`, `incidents.reportLocked`, `incidents.reportReleased`). Sonst zeigt die Kachel „Bericht schon fertig gemeldet, bitte an den Verfasser wenden“ und das Terminal nimmt nichts mehr an.
- Beim Dienst nur, solange er nicht abgeschlossen ist (`training.closed`).
- Maßgeblich ist die Serverzeit in Europe/Berlin. Das Terminal zeigt das Ende des Fensters an jeder Kachel.
- Die Nachlaufzeit (60 Minuten) und die Dauer bei offenem Ende (12 Stunden) sind Einstellungen des Moduls (`info-terminal.general`: `afterEndMinutes`, `openEndHours`); der Vorlauf vor Diensten kommt aus den Diensten.
- Fenster lassen sich nicht von Hand vorzeitig schließen oder verlängern, weder bei Diensten noch bei Einsätzen. Bei Diensten gilt immer das geplante Ende; Einsätze schließen spätestens mit dem Fertigmelden des Berichts.

## Was ins Personal bzw. die Anwesenheit geschrieben wird

**Einsatzbericht** (`ReportPersonnelEntity`, Bericht der Abteilung der Wache):

| Feld | Am Terminal | Bemerkung |
| --- | --- | --- |
| Person | ja | nur Personen aus den Stammdaten, keine Gäste |
| Fahrzeug oder Bereitschaftswache | ja | Bereitschaft immer auf der Wache des Terminals; ein neues Fahrzeug kommt wie im Editor in die Fahrzeuge des Berichts (`addCrewVehicles`) |
| Funktion | ja | Katalog `function`, optional |
| Atemschutz | ja/nein, nur bei Fahrzeug | Minuten, Gerät und CSA trägt der Verfasser nach; bei Bereitschaft immer nein |
| `from` / `to` | optional, nur bei Fahrzeug | leer = Zeiten des Berichts (`null`), wie im Editor; bei Bereitschaft immer `null` |
| Verdienstausfall | ja/nein | Betrag trägt der Verfasser ein (Warnung „Verdienstausfall ohne Betrag“ bleibt bis dahin) |
| Arbeitszeit beim Dienstherrn | ja/nein | |
| Zuschläge, manueller Betrag, verletzt/getötet | nein | nur im Editor |
| Herkunft | automatisch | neu: `bookedVia: 'info-terminal'`, `bookedAt`, `terminalId`; der Editor zeigt die Plakette „Infoterminal“ |

**Dienst** (`AttendanceEntity`): Person, `present`, abweichende Zeiten, Funktion (Text), Atemschutz, `checkedInAt`, `confirmed: false`, neu `checkedInVia: 'info-terminal'` (bestehende Check-ins `qr`).

## Zusammenspiel mit den bestehenden Regeln

- **Prüfregeln** laufen unverändert beim Speichern und Fertigmelden. Das Terminal zeigt keine Befunde; der Verfasser sieht sie im Editor. Ausnahme: Eine Person, die schon in einem anderen Bericht desselben Einsatzes steht, lehnt das Terminal ab (`info-terminal.personInOtherReport` mit dem Namen der Abteilung), statt den Fehler `personnel-overlap-incident` zu erzeugen.
- **Doppelt im selben Bericht** geht nicht: Ein schon eingetragener Name öffnet die vorhandene Eintragung.
- **Gleichzeitiges Bearbeiten:** Eintragungen ändern den Bericht, während der Verfasser ihn vielleicht offen hat. Damit das automatische Speichern des Editors sie nicht überschreibt und keinen Konflikt `conflict.stale` auslöst, arbeiten Eintragungen wie Check-ins bei Diensten: Sie ändern nur ihre eigene Personalzeile und nicht die `version` des Berichts. `PUT …/reports/:id` lässt Terminal-Zeilen stehen, die der Client nicht kannte (Abgleich über `bookedAt` gegenüber dem geladenen Stand). Der Editor lädt das Personal regelmäßig nach und zeigt „2 neue Eintragungen vom Infoterminal“. Erst wenn ein Benutzer die Zeile im Editor speichert, gehört sie zum normalen Inhalt (und ist am Terminal gesperrt).
- **Versionen:** Jede Eintragung legt eine Version des Berichts an (Benutzer = technischer Benutzer des Terminals), damit „Versionen“ und „Wiederherstellen“ sie kennen.
- **Hauptbericht:** keine neue Regel. Der Bericht der Abteilung wird Hauptbericht nur nach den bestehenden Regeln.
- **Berichte gesamtwehrweiter Einheiten (EvD):** am Terminal **nicht** eintragbar. Der EvD schreibt seinen Bericht selbst; Einheiten haben keine Wache.
- **Nur Einsatzabteilungen:** Terminals gibt es nur an Wachen von Einsatzabteilungen, weil nur sie Einsatzberichte schreiben. Wachen anderer Abteilungstypen (z. B. Jugendfeuerwehr) bekommen ein Terminal nur für Dienste; „Für Einsätze eintragen“ und „Neuer Einsatz“ sind dort nicht wählbar.
- **Keine Gäste:** Gäste aus Nachbarwehren trägt nur der Verfasser im Bericht ein.
- **Externe API und Import:** Ein Bericht mit Terminal-Eintragungen gilt als von Menschen bearbeitet; die API ändert sein Personal nicht mehr (`externallyManaged` endet mit der ersten Eintragung).
- **Entschädigung:** wird wie für jede Personalzeile berechnet; die Freigabe bleibt beim Kommandanten.

## Sicherheit und Datenschutz

- **Geräteschlüssel:** 32 Byte Zufall, Präfix `fit_`, gespeichert als SHA-256, Vergleich in konstanter Zeit. Nie in Antworten, Protokollen oder dem Audit-Log; der Link erscheint nur beim Anlegen und bei „Neuer Link“.
- **Eigener Guard:** Die Endpunkte unter `/api/info-terminal/kiosk/…` sind `@Public()` für den Auth-Guard und verlangen stattdessen das Terminal-Cookie. Sitzungs-Cookies und API-Tokens gelten dort nicht, das Terminal-Cookie gilt nirgends sonst. CSRF: Header `x-forga: 1` wie überall, dazu `SameSite=Strict`.
- **Begrenzung:** falsche Schlüssel je Adresse 10 Versuche in 10 Minuten (`429`), danach Sperre der Adresse für 10 Minuten; je Terminal höchstens 120 Schreibaktionen in 10 Minuten und 30 Suchanfragen je Minute. Zähler im Speicher des Prozesses wie bei der Anmeldung.
- **Was das Terminal liest:**
  - Vor- und Nachname der Mitglieder der Abteilung der Wache; aus der Suche Name und Kurzname der Abteilung. Kein Geburtsdatum, keine Personalnummer, keine Kontaktdaten, keine Qualifikationen.
  - Von Einsätzen: Stichwort, Alarm, Ort (Straße, Ort), Zahl und Liste der Eingetragenen des eigenen Berichts mit Fahrzeug und Funktion. Keine Lage, keine Beteiligten, keine Beträge, keine anderen Berichte (außer den Mindestdaten der `matches` beim Anlegen).
  - Von Diensten: Titel, Zeit, Wache, Liste der Anwesenden.
  - Fahrzeuge in Dienst mit `vehicleLabel` und Sitzplätzen, Funktionen und Stichworte aus den Katalogen.
- **Kein Lesen von Berichten:** Es gibt keinen Endpunkt, der einen Bericht oder Dienst als Ganzes an das Terminal liefert.
- **Inaktivität:** Rückkehr zur Übersicht nach 60 Sekunden; die Seite speichert nichts im Browser außer dem Cookie und der Sprache.

## Schnittstellen zwischen den Modulen

Das Modul importiert nur Verträge (`*-contracts`):

| Vertrag | Neu oder vorhanden | Zweck |
| --- | --- | --- |
| `ORGANIZATION`, `PERSON_DIRECTORY` (Stammdaten) | vorhanden | Wachen, Abteilungen, Fahrzeuge, Mitglieder, Suche |
| `vehicleLabel()` (`masterdata-contracts`) | angekündigt | Beschriftung der Fahrzeuge |
| `ORGANIZATION_REFERENCES` (Stammdaten) | vorhanden | Wachen mit Terminals nicht löschen |
| Erweiterungspunkt `masterdata.station.sections` (Stammdaten-Frontend) | **neu** | Karte „Infoterminal“ an der Wache |
| `INCIDENTS_TERMINAL_BOOKING` (Einsatzberichte) | **neu** | offene Berichte einer Abteilung im Zeitfenster, Eintragung anlegen, ändern, entfernen, Einsatz anlegen bzw. Bericht hinzufügen, `matches` mit Mindestdaten; prüft Status, Sperre und Personalregeln |
| `TRAINING_TERMINAL_CHECK_IN` (Dienste) | **neu** | Dienste einer Wache im Zeitfenster, Anwesenheit eintragen, ändern, entfernen (wie der QR-Check-in, unbestätigt) |

`requires: ['masterdata', 'incidents']`, `optional: ['training']`. Ohne aktives Modul Dienste entfallen Dienste am Terminal und der Schalter in der Verwaltung.

**Entitäten** (Schema `info_terminal`, historisiert): `TerminalEntity` (Wache, Bezeichnung, Hash und Präfix des Schlüssels, erlaubte Aktionen, Sprache, technischer Benutzer, angelegt von/am, widerrufen von/am, `lastSeenAt`). Die Eintragungen selbst liegen in den Modulen Einsatzberichte und Dienste.

**Frontend:** `info-terminal-web` exponiert neben `./Module` (Verwaltung, Karte an der Wache) eine Kiosk-Seite. Die Shell bekommt dafür eine öffentliche Route `/terminal`, die nur dieses Bundle ohne Anmeldung lädt; eine eigene App gibt es nicht.

## Einstellungen

`info-terminal.general`: `afterEndMinutes` (60), `openEndHours` (12), `maxAlarmAgeHours` für „Neuer Einsatz“ (12), `idleSeconds` (60), `notSeenWarningDays` (30).
