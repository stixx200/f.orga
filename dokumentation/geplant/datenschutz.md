# Datenschutz (DSGVO)

Konzept mit Lückenanalyse. Ziel: f.orga liefert der Feuerwehr und der Gemeinde alles, was sie für einen DSGVO-konformen Betrieb brauchen, und macht den datenschutzfreundlichen Weg zum Standard. Konzept und Mockups sind **freigegeben** (Mockups: `datenschutz/` siehe [Mockups](mockups/README.md#datenschutz)); die Entscheidungen sind [festgelegt](#entscheidungen).

Der [Aufbewahrungsplan](aufbewahrung.md) und das [Modul Datensicherung](module/backup.md) sind eigene Konzepte; dieses Konzept baut auf ihnen auf.

## Was die Anwendung leisten kann und was nicht

„Vollständig DSGVO-konform“ ist keine Eigenschaft einer Software, sondern des Betriebs. **Verantwortlicher** im Sinne von Art. 4 Nr. 7 DSGVO ist in der Regel die Gemeinde als Trägerin der Feuerwehr; das klärt die Feuerwehr mit dem Datenschutzbeauftragten (DSB) der Gemeinde. Für öffentliche Stellen in Baden-Württemberg gilt ergänzend das Landesdatenschutzgesetz (LDSG); die Aufgaben der Feuerwehr ergeben sich aus dem Feuerwehrgesetz (FwG). f.orga liefert keine rechtlich geprüften Texte und trifft keine Rechtsentscheidungen.

| f.orga liefert (technisch) | bleibt beim Verantwortlichen (organisatorisch) |
| --- | --- |
| Schutz der Daten nach dem Stand der Technik (Art. 25, 32): Rechte, sichere Anmeldung, Protokolle, Verschlüsselung der Sicherungen | Rechtsgrundlage je Verarbeitung festlegen (Art. 6, 9), Satzung bzw. Dienstanweisung |
| Werkzeuge für die Rechte der Betroffenen (Art. 15–21): Auskunft als PDF, Berichtigung, Löschung, Einschränkung, Widerspruch, mit Fristen | Anträge prüfen und beantworten, Identität prüfen, Ausnahmen begründen |
| Einwilligungen erfassen, nachweisen und widerrufen (Art. 7) | entscheiden, wofür eine Einwilligung nötig ist, Texte formulieren |
| Datenschutzhinweis in der Anwendung, Hinweis bei der ersten Anmeldung (Art. 13) | Inhalt des Hinweises mit dem DSB abstimmen |
| Entwurf des Verzeichnisses der Verarbeitungstätigkeiten aus den Modulen (Art. 30), Beschreibung der technischen Maßnahmen | Verzeichnis führen, prüfen, ergänzen (Zwecke, Rechtsgrundlagen, Empfänger außerhalb von f.orga) |
| Aufbewahrungsfristen je Datenkategorie ([Aufbewahrungsplan](aufbewahrung.md)) | Fristen festlegen (Aktenplan, Archiv, Kämmerei) |
| Unterstützung bei Datenpannen (Art. 33/34): Protokolle, betroffene Personen ermitteln | Meldung an die Aufsichtsbehörde binnen 72 Stunden, Benachrichtigung |
| Hinweise auf Auftragsverarbeiter im Verzeichnis | Verträge zur Auftragsverarbeitung (Art. 28) mit Hosting, IT-Dienstleister, E-Mail- und Anmeldedienst |
| | DSB benennen (Art. 37), Datenschutz-Folgenabschätzung (Art. 35), Schulung und Verpflichtung der Benutzer, physischer Schutz von Server und Infoterminals |

Alle Textvorlagen in f.orga (Auskunft, Datenschutzhinweis, Einwilligungen) sind deutlich als **Vorlage** gekennzeichnet: Sie nennen nur Titel von DSGVO-Artikeln und Platzhalter und müssen mit dem DSB der Gemeinde geprüft werden, bevor sie gelten. Solange eine Vorlage nicht als geprüft markiert ist, zeigt die Einrichtungsliste der Startseite „Datenschutztexte prüfen“.

## Heutiger Stand

Umgesetzt ist (siehe [implementiert/architektur.md](../implementiert/architektur.md#daten-suche-vollexport-auskunft-aufbewahrung)):

- **Rechte** je Abteilung, sensible Felder der Person nur mit `masterdata.persons.sensitive`, Untersuchungsergebnisse im Atemschutz nur mit `respiratory-protection.examinations`; Maskierung in der Historie.
- **Protokolle:** Audit-Log (Anmeldungen, Rechte, Exporte, Importe, Impersonation mit Grund), Historie aller Änderungen, Leseprotokoll für besonders geschützte Daten.
- **Auskunft** als lesbares PDF mit den Angaben nach Art. 15 Abs. 1 aus allen Modulen (`describePerson`), verschlüsselt 30 Tage abgelegt, Übergabe auch in „Mein Bereich“ ([implementiert/datenschutz.md](../implementiert/datenschutz.md#auskunft-nach-art-15-als-pdf-l3)); dazu weiter das JSON `GET /api/core/export/person/:personId` (`data.person-exported`).
- **Aufbewahrung** ([Aufbewahrungsplan](../implementiert/aufbewahrung.md), Einstellung `privacy.retention`): Frist und Aktion je Datenkategorie (Grunddaten und Personalakte Ausgeschiedener, Einsätze, Dienste, ausgesonderte Geräte und Fahrzeuge, Kostenbescheide, Auszahlungsläufe, Audit-Log, Historie) mit Aussonderung und Anbietung an das Archiv; Standard nichts außer Audit-Log 2 Jahre. Import-Uploads 24 Stunden, Zeilen von MP-Feuer-Läufen 7 Tage. `PersonDataRegistry` mit Beiträgen aller Module mit Personendaten.
- **Sicherheit:** scrypt, Sitzung höchstens 14 Tage als `HttpOnly`-Cookie mit Leerlauf-Abmeldung, CSRF-Header, Anmeldesperre in der Datenbank, API-Tokens als Hash mit Bereichen, Empfänger und Ablauf, OIDC, verschlüsselte Geräteschlüssel und Zugangsdaten, zweiter Faktor (TOTP) als Step-up bei sensiblen Daten und Verwaltung ([Datenschutz, umgesetzt](../implementiert/datenschutz.md)).
- **Phase 1** ([implementiert/datenschutz.md](../implementiert/datenschutz.md)): HTTPS mit Caddy, `Secure`-Cookies bei `https://`-Adresse, Sicherheitsheader, `/api/docs` nur angemeldet (L1); `FORGA_STAGE` mit Band und Sperren im Testsystem (L6); Verletzte im Bericht nur mit `incidents.injuries.read`, Hinweise an Freitexten, Entschuldigungsgrund als Auswahl (L5, Teil); E-Mails mit Gesundheitsbezug ohne Namen (L18, Teil).
- **Phase 2, Teil 1** ([implementiert/datenschutz.md](../implementiert/datenschutz.md#recht-und-seite-datenschutz)): Recht `core.privacy.manage`, Seite „Verwaltung → Datenschutz“ mit Kontakten, versionierten Textbausteinen, Selbstauskunft, Sicherheit und Aufbewahrung; Datenschutzhinweis `/privacy` mit Fassungen, PDF und Hinweis bei der ersten Anmeldung, „Information erteilt am“ mit Liste und Massenaktion (L4); Betroffenenanfragen mit Frist, Verlängerung, Antwortschreiben und Empfängern nach Art. 19, Einschränkung der Verarbeitung über alle Module (L7 ohne Löschprüfung); Widerspruch (L19); „Auskunft anfordern“ in Mein Bereich.
- **Phase 3, Teil 1** ([implementiert/datenschutz.md](../implementiert/datenschutz.md#verzeichnis-der-verarbeitungstätigkeiten-l8)): Verzeichnis der Verarbeitungstätigkeiten als Entwurf aus den Manifesten mit Ergänzungen der Gemeinde, technischen Maßnahmen und Export als PDF und Excel (L8); Widerspruch und Empfänger nach Art. 19 aus dem Verzeichnis; Datenpannen mit 72-Stunden-Frist, Meldungen, betroffenen Personen, Kontaktliste, Protokollen und „Alle Sitzungen beenden“ (L20).
- **Phase 3, Teil 2** ([implementiert/datenschutz.md](../implementiert/datenschutz.md#einwilligungen-l9)): Katalog der Einwilligungen mit Fassungen und Vorlagen, Einwilligungen an der Person mit Nachweis und Widerruf, Wirkung in Telefonliste und Geburtstagsliste, Mein Bereich und erste Anmeldung (L9); „Berichtigung beantragen“ mit Aufgabe für die Abteilung, Wert in der Historie unkenntlich machen (L12); Leseprotokoll mit eigener Aufbewahrung, „Anmeldungen als Sie“ mit E-Mail (L15).
- **Phase 4, Teil A** ([implementiert/datenschutz.md](../implementiert/datenschutz.md#löschprüfung-l7)): Löschprüfung je Modul mit Ausführen und Einschränkung des Aufzubewahrenden (L7); vollständige Anonymisierung über alle Module mit Namensersetzung und Startprüfung (L13).
- **Phase 5** ([implementiert/datenschutz.md](../implementiert/datenschutz.md#sitzungen-l16)): Leerlauf-Abmeldung, „Angemeldet bleiben“ und „Angemeldete Geräte“ (L16); verschlüsselte Zugangsdaten in den Einstellungen, `docker/backup.sh --encrypt`, Datenbankrolle ohne Superuser und Prüfung des Inhaltsverzeichnisses vor der Wiederherstellung (L17); gesperrte Benutzer ohne Person nach Frist anonymisiert (L21); Infoterminal mit Namenssuche je Abteilung, Straße ohne Hausnummer und Sperre im Notfall (L22); API-Tokens mit Empfänger, Zweck, Pflichtablauf, Erinnerung und erlaubten Adressen (L23); Passwortregeln und Anfragebegrenzung in der Datenbank (L24); technische Empfänger und „Datenschutz im Betrieb“ (L25); Hinweis und Export für die Folgenabschätzung (L26); Metadaten von Fotos entfernt, Höchstzahl der Anhänge (L27); Meldungen der MP-Feuer-Läufe nach 90 Tagen bzw. „Umstellung abgeschlossen“ entfernt, Hinweis „Mitglieder informieren“ (L28).
- **Mein Bereich:** Kontakt und Bankverbindung selbst ändern, eigene Dienste, Einsätze, Entschädigung, Atemschutz, Schutzausrüstung, Einwilligungen, Berichtigung beantragen, Anmeldungen als Sie.

## Auskunft nach Art. 15 als PDF

Umgesetzt (siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#auskunft-nach-art-15-als-pdf-l3)): lesbare Auskunft aus allen Modulen (`describePerson`), PDF mit Anschreiben aus Kontakten und Textbausteinen der Einstellungen „Datenschutz“, verschlüsselte Ablage mit Ablauf nach 30 Tagen, Bezug zur Betroffenenanfrage, Übergabe und Herunterladen in „Mein Bereich“, Selbstauskunft `request` und `instant`, Einwilligungen und „Zugriffe auf besonders geschützte Daten“. Offen ist:

- Herkunft (g) genauer aus der Datenübernahme bzw. dem Import selbst (`ImportSource` am Datensatz statt der Zeitnähe zum Audit-Eintrag).

Die Inhalte von Mein Bereich (eigene Einsätze, Dienste, Entschädigung) sind kein Ersatz für die Auskunft, weil Art. 15 Abs. 1 Angaben verlangt, die dort fehlen.

## Lückenanalyse

Priorität: **kritisch** (Pflicht nach DSGVO oder hohes Risiko, vor dem Echtbetrieb mit Daten aller Mitglieder umsetzen), **wichtig** (Pflicht, aber mit organisatorischem Behelf überbrückbar), **empfohlen** (Stand der Technik, Risiko mindern).

### Übersicht

| Nr. | Thema | DSGVO | Priorität |
| --- | --- | --- | --- |
| L1 | HTTPS, sichere Cookies, Sicherheitsheader | Art. 32 | kritisch (umgesetzt) |
| L2 | Zweiter Faktor beim Öffnen sensibler Daten (Step-up) | Art. 32 | kritisch |
| L3 | Verständliche Auskunft mit Angaben nach Art. 15 Abs. 1 | Art. 12, 15 | kritisch (umgesetzt) |
| L4 | Informationspflichten: Datenschutzhinweis, erste Anmeldung, Information bei Übernahme | Art. 13, 14 | kritisch (umgesetzt bis auf Verzeichnis und Einwilligungen) |
| L5 | Gesundheitsdaten: Zugriff, Protokoll, Weitergabe per E-Mail | Art. 9, 32 | kritisch (teilweise umgesetzt) |
| L6 | Echtdaten nur im Echtsystem; Test- und Entwicklungsdaten | Art. 5 Abs. 1 f, 32 | kritisch (umgesetzt) |
| L7 | Betroffenenanfragen mit Frist; Löschung und Einschränkung je Person | Art. 12, 17, 18 | kritisch (umgesetzt bis auf das Kennzeichen in Datensätzen anderer Module) |
| L8 | Verzeichnis der Verarbeitungstätigkeiten und technische Maßnahmen | Art. 30, 32 | wichtig (umgesetzt) |
| L9 | Einwilligungen erfassen, nachweisen, widerrufen (auch Minderjährige) | Art. 6, 7, 8 | wichtig (umgesetzt) |
| L10 | Datenminimierung der Felder und Freitexte | Art. 5 Abs. 1 c, 25 | wichtig |
| L11 | Zweckbindung der Listen und Exporte | Art. 5 Abs. 1 b, 25 | wichtig |
| L12 | Berichtigung durch die Person; falsche Werte in der Historie | Art. 16, 19 | wichtig (umgesetzt) |
| L13 | Vollständige Anonymisierung über alle Module | Art. 5 Abs. 1 e, 17 | wichtig (umgesetzt) |
| L14 | Daten Dritter (Beteiligte, Kostenschuldner, Anrufer) | Art. 14, 15, 17 | wichtig |
| L15 | Protokollierung von Lesezugriffen; Transparenz der Impersonation | Art. 5 Abs. 2, 32 | wichtig (umgesetzt) |
| L16 | Sitzungen: Leerlauf-Abmeldung, Geräteübersicht | Art. 32 | wichtig (umgesetzt) |
| L17 | Verschlüsselung der Sicherungen und der gespeicherten Daten | Art. 32 | wichtig (umgesetzt) |
| L18 | E-Mails: Inhalt der Sammel-E-Mail und Benachrichtigungen | Art. 5 Abs. 1 c, f, 32 | wichtig (teilweise umgesetzt) |
| L19 | Widerspruch | Art. 21 | wichtig (umgesetzt) |
| L20 | Unterstützung bei Datenpannen | Art. 33, 34 | wichtig (umgesetzt) |
| L21 | Benutzer ohne Person; gesperrte Konten | Art. 5 Abs. 1 e | empfohlen (umgesetzt) |
| L22 | Infoterminal als öffentlich zugängliches Gerät | Art. 25, 32 | empfohlen (umgesetzt) |
| L23 | API-Tokens: Ablauf, Bereiche, Empfänger | Art. 5 Abs. 1 f, 32 | empfohlen (umgesetzt) |
| L24 | Passwortregeln, Anfragebegrenzung dauerhaft | Art. 32 | empfohlen (umgesetzt) |
| L25 | Auftragsverarbeiter und Hinweise für den Betrieb | Art. 28 | empfohlen (umgesetzt) |
| L26 | Datenschutz-Folgenabschätzung | Art. 35 | empfohlen (umgesetzt) |
| L27 | Anhänge (Fotos) | Art. 5, 9 | empfohlen (umgesetzt) |
| L28 | MP-Feuer-Übernahme und Dateien aus MP-Feuer | Art. 5, 14, 32 | empfohlen (umgesetzt bis auf aktivierte Felder) |
| L29 | Aufbewahrung von Protokollen und Laufberichten | Art. 5 Abs. 1 e | empfohlen |

### L1 HTTPS, sichere Cookies, Sicherheitsheader (kritisch)

- **Umgesetzt:** siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#https-und-sicherheitsheader-l1). Abweichung vom Konzept: Kamera und NFC gelten in der `Permissions-Policy` für die ganze Anwendung (eigener Ursprung), nicht nur für `/scan`, weil die Shell eine einzige Seite ist und auch Kleiderkammer, Geräte, Führerscheinkontrolle und Infoterminal die Kamera brauchen.
- **Organisatorisch:** Betrieb nur im Netz der Gemeinde oder hinter TLS; Zertifikat und Erneuerung beim IT-Dienstleister.

### L2 Zweiter Faktor beim Öffnen sensibler Daten (kritisch)

- **Heute:** Umgesetzt als Step-up ([implementiert/datenschutz.md](../implementiert/datenschutz.md#zweiter-faktor-bei-sensiblen-daten-step-up)): TOTP mit Wiederherstellungscodes, 30 Minuten je Sitzung, für Gesundheitsdaten, sensible Personendaten und die Verwaltung; Anmeldung weiter mit Passwort oder OIDC.
- **Offen:** Bereiche, die es noch nicht gibt, bekommen `stepUp` mit ihrer Einführung (`incidents.injuries.read`, `core.privacy.manage`), siehe [Step-up](#step-up-zweiter-faktor-bei-sensiblen-daten).
- **Organisatorisch:** Ablauf bei verlorenem Telefon (Wiederherstellungscodes, Zurücksetzen durch einen Administrator); Benutzer mit sensiblen Rechten richten den Faktor bei der Übergabe ihrer Rolle ein; `FORGA_SECRET_KEY` setzen und sichern.

### L3 Verständliche Auskunft (kritisch)

- **Umgesetzt:** lesbare Auskunft als PDF aus allen Modulen mit Anschreiben, verschlüsselter Ablage und Übergabe, siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#auskunft-nach-art-15-als-pdf-l3). Abweichungen vom Konzept: keine eigene Vorschauseite (das PDF lässt sich wegen `frame-ancestors 'none'` nicht einbetten, „Ansehen“ öffnet es im Browser); ein hinterlegter Briefkopf wird nicht verwendet, weil die Kopfzeile jeder Seite die Auskunft benennt; MP-Feuer ordnet Berichtszeilen über den Namen zu (keine Personen-ID).
- **Soll:** präzise, verständlich, in klarer Sprache (Art. 12 Abs. 1), mit allen Angaben nach Art. 15 Abs. 1 und einer Kopie (Abs. 3), ohne Rechte Dritter zu verletzen (Abs. 4).
- **Offen:** Herkunft aus dem Datensatz; siehe [Auskunft nach Art. 15 als PDF](#auskunft-nach-art-15-als-pdf).
- **Organisatorisch:** Textbausteine mit dem DSB prüfen; Identität vor der Herausgabe prüfen.

### L4 Informationspflichten (kritisch)

- **Soll:** Information bei Erhebung (Art. 13), bei Daten aus anderer Quelle innerhalb eines Monats (Art. 14 Abs. 3).
- **Umgesetzt:** Datenschutzhinweis `/privacy` aus Textbausteinen und Kontakten mit Fassungen und PDF, Hinweis bei der ersten Anmeldung und nach einer neuen Fassung, „Information erteilt am“ an der Person mit Liste und Massenaktion; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#datenschutzhinweis-l4). Abweichung: Der Hinweis bei der ersten Anmeldung erscheint erst, wenn alle Bausteine des Hinweises als geprüft markiert sind, weil eine ungeprüfte Vorlage noch nicht gilt.
- **Offen:**
  - Zwecke, Rechtsgrundlagen, Empfänger und Fristen je Tätigkeit aus dem Verzeichnis (L8, umgesetzt) statt aus dem Baustein `noticeProcessing`.
- **Organisatorisch:** Text abstimmen; Mitglieder bei Aufnahme und nach der Umstellung informieren (Dienstabend, Aushang, Schreiben).

### L5 Gesundheitsdaten (kritisch)

- **Heute:** Gesundheitsdaten (Art. 9) liegen vor als Ergebnis und Einschränkungen der Eignungsuntersuchung (geschützt durch `examinations`), als „verletzt/getötet“ im Personal eines Berichts (nur Verfasser, Freigeber und `incidents.injuries.read`), mittelbar in Ruhezeiten, Übernahme in die Altersabteilung „aus gesundheitlichen Gründen“, Entschuldigungen (Grund als Auswahl, Text nur für den Gruppenführer) und freien Bemerkungen. Lesezugriffe werden nicht protokolliert.
- **Soll:** Zugriff nur, wer es für seine Aufgabe braucht; Nachvollziehbarkeit; keine Gesundheitsangaben in E-Mails.
- **Umgesetzt:** Verletzte im Bericht nur mit Recht, Hinweise an Freitexten, Entschuldigungsgrund als Auswahl ([implementiert](../implementiert/datenschutz.md#gesundheitsdaten-l5-teil)).
- **Offen:**
  - Kennzeichen `health` an Feldern und Entitäten im Manifest (`personData.categories`), ausgewertet in Auskunft und Leseprotokoll (L15); je Verarbeitungstätigkeit gibt es `health` bereits (Verzeichnis).
  - Leseprotokoll für die Liste „fällige Eignungsuntersuchungen“ (die Untersuchungen der Person stehen im Leseprotokoll, siehe L15).
- **Organisatorisch:** Rechtsgrundlage für Untersuchungsdaten klären; Ärzte liefern nur die Bescheinigung „Bedenken/keine Bedenken“, keine Befunde.

### L6 Echtdaten nur im Echtsystem (kritisch)

- **Umgesetzt:** `FORGA_STAGE` mit Band, Sperren und Löschen nach 7 Tagen, `.gitignore`, `npm run seed` nicht ins Echtsystem; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#echt--test--und-entwicklungssystem-l6). Abweichung: Der Tabellen-Import von Personen nimmt im Testsystem die als Demodaten gekennzeichneten Daten von `npm run seed` an (`demoData`), sonst ließe sich das Testsystem nicht füllen; die Oberfläche bietet das nicht an.
- **Organisatorisch:** Echte Dateien nach der Umstellung löschen; Entwicklungsrechner mit verschlüsselter Festplatte; Testsystem nicht für alle Benutzer freigeben.

### L7 Betroffenenanfragen, Löschung und Einschränkung (kritisch)

- **Soll:** Antwort binnen eines Monats (Art. 12 Abs. 3); Löschung, soweit keine Ausnahme nach Art. 17 Abs. 3 greift (u. a. rechtliche Pflicht, öffentliche Aufgabe, Archivzwecke); Einschränkung statt Löschung (Art. 18), Mitteilung an Empfänger (Art. 19).
- **Umgesetzt:** Seite „Verwaltung → Datenschutz → Anfragen“ mit Arten, Frist als Aufgabe, Verlängerung, Status, Bearbeiter, Notizen, Antwortschreiben als PDF und Empfängern nach Art. 19; Einschränkung an der Person mit Wirkung in allen Modulen ([implementiert/datenschutz.md](../implementiert/datenschutz.md#betroffenenanfragen-l7-l19), [Einschränkung](../implementiert/datenschutz.md#einschränkung-der-verarbeitung-art-18)); Löschprüfung je Modul mit Ausführen, Einschränkung des Aufzubewahrenden und Audit `privacy.erasure-executed` ([Löschprüfung](../implementiert/datenschutz.md#löschprüfung-l7)). Die Empfänger nach Art. 19 kommen aus dem Verzeichnis (L8). Abweichungen: Eine Einschränkung endet nicht von selbst am Datum „bis“, sondern wird dann als Aufgabe vorgelegt; Personalakte und Modulseiten öffnen sich mit `core.privacy.manage`, Listen, Suche und Personalauswahl lassen eingeschränkte Personen auch dafür weg; bestehende Einsatzberichte, Dienste, Auszahlungsläufe und Prüfprotokolle zeigen die Person weiter (Art. 18 Abs. 2).
- **Offen:**
  - Kennzeichen „eingeschränkt“ in bestehenden Datensätzen anderer Module (z. B. Name im Einsatzbericht nur noch mit Hinweis).
- **Organisatorisch:** Wer bearbeitet Anfragen (Kommandant, Hauptamt, DSB)? Begründung von Ablehnungen.

### L8 Verzeichnis der Verarbeitungstätigkeiten (wichtig)

- **Soll:** Verzeichnis nach Art. 30 Abs. 1 (Verantwortlicher, DSB, Zwecke, Kategorien von Betroffenen und Daten, Empfänger, Drittland, Fristen, technische und organisatorische Maßnahmen).
- **Umgesetzt:** Entwurf aus den Tätigkeiten der aktiven Module (Manifest mit `subjects`, `categories`, `health`, `legalBasisHint`), Fristen aus `privacy.retention`, Empfänger aus Manifest, API-Tokens, SMTP und OIDC, Ergänzungen der Gemeinde je Tätigkeit (`privacy.activities`, historisiert, „geprüft am/von“), technische Maßnahmen mit dem aktuellen Stand, Export als PDF und Excel; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#verzeichnis-der-verarbeitungstätigkeiten-l8). Abweichungen vom Mockup: Die technischen Maßnahmen stehen einmal als eigener Abschnitt statt in jeder Tätigkeit, weil sie für alle gelten; weitere Empfänger sind eine Liste (Bezeichnung, Hinweis) statt eines Freitexts, damit Anfragen sie nach Art. 19 zum Abhaken anbieten können; die Gemeinde ergänzt zusätzlich „Drittland“ und „Bemerkungen“; eine Änderung macht eine geprüfte Tätigkeit wieder zum Entwurf (wie bei den Textbausteinen). Kostenersatz hat eine eigene Tätigkeit (Kostenschuldner).
- **Organisatorisch:** Verzeichnis führt der Verantwortliche; der Entwurf ersetzt keine Prüfung.

### L9 Einwilligungen (wichtig)

- **Umgesetzt:** Katalog mit Fassungen, Vorlagen und Wirkung, Einwilligung an der Person mit Nachweis und Widerruf (auch über eine Anfrage), Wirkung in Telefonliste und Geburtstagsliste über `CONSENTS`, Mein Bereich und erste Anmeldung, Minderjährige; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#einwilligungen-l9). Abweichungen: Der Katalog nennt die Zahl der Personen mit Einwilligung ohne „von n“; die Telefonliste hat zusätzlich den Zweck „Führungskräfte“ (Amt oder Führungsqualifikation, immer mit Nummer, Entscheidung 9); eine Einwilligung zu einer neuen Fassung löst die alte ab (`superseded_on`) statt sie zu widerrufen.
- **Offen:** weitere Wirkungen, sobald Module sie brauchen (z. B. Fotos in Berichten); Papierformular „Einwilligung“ als PDF aus dem Katalog.
- **Organisatorisch:** entscheiden, welche Verarbeitungen eine Einwilligung brauchen und welche auf der Aufgabe beruhen; Texte prüfen; Papierformulare für Mitglieder ohne Konto.

### L10 Datenminimierung (wichtig)

- **Heute:** Die Personalakte hat Felder, deren Zweck nicht jede Feuerwehr hat: Geburtsort, Titel, Rufname, Arbeitgeber mit Anschrift und IBAN, private Bankverbindung, Telefon dienstlich, Bemerkung. Freitexte (Bemerkung, Entschuldigung, Beteiligte, Lage) können beliebiges enthalten.
- **Soll:** nur, was für den Zweck nötig ist (Art. 5 Abs. 1 c); Voreinstellungen datenschutzfreundlich (Art. 25 Abs. 2).
- **Umsetzung:** Einstellung „Felder der Personalakte“: optionale Felder abschaltbar (abgeschaltete werden nicht angezeigt, nicht importiert und nach Bestätigung geleert). Je Feld ein Hinweis „Wofür?“ (z. B. Arbeitgeber: Verdienstausfall und Freistellung; Geburtsort: Urkunden, Lehrgangsanmeldung). Die MP-Feuer-Übernahme übernimmt nur aktive Felder. Freitexte bekommen eine Längenbegrenzung und den Hinweis aus L5.
- **Organisatorisch:** Feldliste mit dem DSB durchgehen; nicht benötigte Felder abschalten.

### L11 Zweckbindung der Listen und Exporte (wichtig)

- **Heute:** Die Telefonliste und die Mitgliederliste mit Kontakt darf jeder mit `masterdata.persons.read` ausgeben (z. B. Gruppenführer); Geburtstage und Komplettdaten brauchen `sensitive`. Exporte stehen im Audit-Log, ohne Zweck. Die Excel-Ausgabe jeder Tabelle (`DataTable`) geht an allen Listen vorbei.
- **Soll:** Daten nur für festgelegte Zwecke; Ausdrucke verlassen kontrolliert das System.
- **Umgesetzt (Teil):** Telefonliste und Geburtstage haben einen Parameter „Zweck“ mit der Wirkung der Einwilligungen (L9); Listen mit Kontakt- oder sensiblen Daten stehen im Leseprotokoll (L15).
- **Umsetzung:** Listen tragen im Manifest einen Zweck und optional eine Einwilligung (L9); Listen mit Kontakt- oder sensiblen Daten bekommen ein eigenes Recht `masterdata.lists.contact` (Standard Kommandant, Abteilungskommandant). Fußzeile von PDF und Excel: „Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten“. Beim Export von Listen mit Kontakt- oder Gesundheitsdaten Pflichtfeld „Zweck“ (Audit). Excel-Ausgabe der Tabellen nur für Tabellen ohne Kontaktspalten bzw. mit demselben Recht.
- **Organisatorisch:** Dienstanweisung zum Umgang mit Ausdrucken und Messenger-Gruppen.

### L12 Berichtigung (wichtig)

- **Umgesetzt:** „Berichtigung beantragen“ in Mein Bereich mit Anfrage, Frist und Aufgabe für die Zuständigen der Abteilung, die die Berichtigung vermerken; „Wert in der Historie unkenntlich machen“ mit Pflichtgrund und Audit; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#berichtigung-l12). Abweichung: „Was ist falsch?“ und „Wie ist es richtig?“ sind zwei Felder statt eines.
- **Offen:** Mitteilung an Empfänger (Art. 19) aus dem Verzeichnis statt aus der Liste der Einstellungen (wie L7).
- **Organisatorisch:** wer prüft Anträge; Kämmerei bei geänderter Bankverbindung informieren (Hinweis in der Anfrage).

### L13 Vollständige Anonymisierung (wichtig)

- **Umgesetzt:** siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#vollständige-anonymisierung-l13).
- **Organisatorisch:** –

### L14 Daten Dritter (wichtig)

- **Heute:** Einsatzberichte speichern Beteiligte (Name, Anschrift, Telefon, Kennzeichen, Rolle Geschädigter/Verursacher/Zeuge/Anrufer); der Kostenersatz Kostenschuldner mit Adressbuch und Bescheiden. Diese Personen sind keine `Person` der Stammdaten: Weder Auskunft noch Löschung noch Information sind abgebildet.
- **Soll:** Auch Dritte haben die Rechte nach Art. 14–18; Fristen gelten auch für sie.
- **Umsetzung:** „Auskunft zu einer anderen Person“ auf der Seite Anfragen: Suche nach Name, Anschrift oder Kennzeichen über Beteiligte und Kostenschuldner (`SearchRegistry` mit eigener Quelle `privacy.third-parties`, nur `core.privacy.manage`); dieselbe PDF-Auskunft mit den Abschnitten „Einsätze, an denen Sie beteiligt waren“ (Datum, Stichwort, Rolle, gespeicherte Angaben zu Ihnen) und „Kostenbescheide“. Anonymisierung der Beteiligten über den Aufbewahrungsplan (Einsätze anonymisieren). Hinweis im Berichtseditor: nur Angaben, die für Kostenersatz, Versicherung oder Polizei nötig sind.
- **Organisatorisch:** Informationspflicht nach Art. 14 gegenüber Beteiligten (Ausnahmen mit dem DSB klären), Hinweis im Kostenbescheid.

### L15 Lesezugriffe und Impersonation (wichtig)

- **Umgesetzt:** Leseprotokoll `core.access_log` (zusammengefasst je Benutzer, Person, Bereich und Tag) mit eigener Aufbewahrung, Einsicht mit `core.audit.read`, Abschnitt in der Auskunft; „Anmeldungen als Sie“ im Profil und in Mein Bereich, E-Mail beim Start mit Einstellung; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#leseprotokoll-und-anmelden-als-l15). Abweichungen: Bereiche sind fest benannt statt aus einem Kennzeichen `health`/`sensitive` im Manifest abgeleitet (L5); während einer Impersonation steht der Administrator als Leser im Protokoll; die Liste der Anmeldungen kommt aus dem Audit-Log und reicht so weit zurück, wie es aufbewahrt wird.
- **Offen:** weitere Listen mit Gesundheitsdaten im Leseprotokoll (z. B. „fällige Eignungsuntersuchungen“, L5); Bereiche aus dem Kennzeichen `health` im Manifest.
- **Organisatorisch:** Regel, wann das Leseprotokoll ausgewertet wird (nur anlassbezogen, Beteiligung Personalrat bzw. Feuerwehrausschuss klären).

### L16 Sitzungen (wichtig)

- **Umgesetzt:** Leerlauf-Abmeldung (Einstellung `security`, 60 Minuten für privilegierte Konten, 8 Stunden für andere), „Angemeldet bleiben“ nur für Konten ohne privilegierte Rechte (höchstens 14 Tage), Profil „Angemeldete Geräte“ mit Browser, gekürzter Adresse, letzter Aktivität, einzeln und „Alle anderen abmelden“; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#sitzungen-l16). Abweichungen: Als Aktivität zählt die letzte Eingabe im Browser (Kopfzeile `x-forga-idle`), nicht jede Anfrage, damit nachladende Seiten keine Sitzung offen halten; ohne „Angemeldet bleiben“ ist das Cookie ein Sitzungs-Cookie des Browsers; „Angemeldet bleiben“ lässt sich in den Einstellungen abschalten; privilegiert ist ein Konto mit Rechten unter Step-up oder `privileged`; Impersonationen erscheinen nicht in den Geräten (sie stehen unter „Anmeldungen als Sie“).
- **Organisatorisch:** geteilte Rechner mit eigenem Benutzerkonto des Betriebssystems und Bildschirmsperre.

### L17 Verschlüsselung (wichtig)

- **Umgesetzt:** Das Modul `backup` verschlüsselt standardmäßig; `docker/backup.sh --encrypt` verschlüsselt jede Datei mit `openssl`; SMTP-Passwort und OIDC-Client-Secret liegen mit `FORGA_SECRET_KEY` verschlüsselt; die Anwendung verbindet sich als Datenbankrolle ohne Superuser-Rechte, und eine Sicherung wird nur mit geprüftem Inhaltsverzeichnis wiederhergestellt; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#verschlüsselung-l17). Keine Feldverschlüsselung (Entscheidung 5). Abweichungen: `backup.sh` nutzt nur `openssl` (überall vorhanden), nicht `age`; ob Sicherungen verschlüsselt sind, zeigen die technischen Maßnahmen des Verzeichnisses und die Seite der Datensicherung, nicht der Reiter „Sicherheit“.
- **Organisatorisch:** Host mit verschlüsseltem Datenträger, Zutritt zum Serverraum, Passphrase und `FORGA_SECRET_KEY` im Passwortsafe.

### L18 E-Mails (wichtig)

- **Umgesetzt:** Einstellung `security` („Verwaltung → Datenschutz → Einstellungen → Sicherheit“) mit „Fristen mit Gesundheitsbezug ohne Namen“ (Standard an) und „Alle Fristen ohne Namen“, Fristen mit `health: true` (Eignungsuntersuchung), Ampel auf Rot ohne Namen, Warnung bei SMTP ohne TLS; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#e-mails-ohne-gesundheitsbezug-l18-teil).
- **Offen:** Keine Anhänge mit Personendaten (Auskunft nur zum Herunterladen, siehe L3).
- **Organisatorisch:** E-Mail-Adressen der Gemeinde statt privater Anbieter, wo möglich.

### L19 Widerspruch (wichtig)

- **Soll:** Bei Verarbeitung für eine öffentliche Aufgabe kann die Person aus Gründen ihrer besonderen Situation widersprechen (Art. 21 Abs. 1); dann ist abzuwägen.
- **Umgesetzt:** Art „Widerspruch“ mit Bezug auf eine Verarbeitungstätigkeit des Verzeichnisses und genauerem Bezug als Text (ältere Anfragen behalten ihren Text), Einschränkung bis zur Entscheidung, Antwortschreiben ([implementiert](../implementiert/datenschutz.md#betroffenenanfragen-l7-l19)).
- **Organisatorisch:** Abwägung durch den Verantwortlichen.

### L20 Datenpannen (wichtig)

- **Umgesetzt:** „Datenpanne erfassen“ unter Datenschutz mit 72-Stunden-Frist als Aufgabe und E-Mail ohne Inhalt, Meldung an die Aufsichtsbehörde (Datum, Aktenzeichen) oder Begründung ohne Meldung, Benachrichtigung der Personen (Datum, Weg), Abschluss; Hilfen: Audit-Log eines Zeitraums oder Benutzers als Excel, betroffene Personen aus einem Listenexport (`lists.exported` mit Parametern und Personen), Vollexport, Auskunft oder Konto, Kontaktliste als Excel, „Alle Sitzungen beenden und alle Tokens widerrufen“ mit Step-up und Grund; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#datenpannen-l20). Abweichungen: Personen eines Listenexports stehen im Audit-Eintrag (`personIds`), statt die Liste mit den gespeicherten Parametern erneut zu erzeugen, weil nur so der Stand des Exports erhalten bleibt; Vollexport und Konto werden aus den heutigen Daten berechnet (so gekennzeichnet); die eigene Sitzung bleibt beim Notfall bestehen.
- **Offen:**
  - Personen in den Listen der anderen Module (Dienste, Atemschutz, Entschädigung, Beförderungen); heute liefern die Personenlisten der Stammdaten `personIds`.
  - Dokumentation einer Datenpanne als PDF.
- **Organisatorisch:** Meldung an die Aufsichtsbehörde, Dokumentation (Art. 33 Abs. 5).

### L21 Benutzer ohne Person (empfohlen)

- **Umgesetzt:** „gesperrt seit“ am Benutzer und in der Benutzerliste; Aufbewahrungskategorie „Gesperrte Benutzer ohne Person“ (Standard 2 Jahre nach der Sperre, anonymisieren wie verknüpfte Konten); siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#gesperrte-benutzer-ohne-person-l21). Technische Benutzer der API-Tokens zählen nicht dazu (sie tragen nur den Namen des Tokens).

### L22 Infoterminal (empfohlen)

- **Umgesetzt:** Namenssuche nur über die Abteilungen des Terminals und die Abteilungen darunter (Einstellung „über alle Personen“), eingeschränkte Personen nie, Einsatzort ohne Hausnummer, Hinweis zum Aufstellort in der Verwaltung, Geräteschlüssel beim Notfall einer Datenpanne gesperrt; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#infoterminal-als-öffentlich-zugängliches-gerät-l22). Abweichung: Die Suche richtet sich nach den Abteilungen des Terminals statt nach den Mitgliedschaften „in derselben Wache“, weil Wachen in f.orga einer Abteilung gehören.
- **Organisatorisch:** Aufstellort, Bildschirmschutz.

### L23 API-Tokens (empfohlen)

- **Umgesetzt:** Ablauf Pflicht (höchstens 2 Jahre, Aufgabe 30 Tage vorher), Empfänger/System und Zweck im Verzeichnis und in der Auskunft, optional erlaubte Adressen, Warnung bei Bereichen mit Personendaten; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#api-tokens-l23). Abweichung: Tokens aus der Zeit ohne Pflichtablauf wirken weiter und erscheinen als Aufgabe „ohne Ablauf – neu ausstellen“.

### L24 Passwörter und Begrenzungen (empfohlen)

- **Umgesetzt:** Abgleich mit einer mitgelieferten Liste häufiger Passwörter und Wörter, Ablehnung von Benutzername, Name und E-Mail-Adresse als Passwort, Hinweis auf Passwortmanager, Zähler der Anmeldesperre, von „Passwort vergessen“ und der Infoterminals in der Datenbank; dazu Anmeldung ohne Benutzer-Enumeration und mit CSRF-Kopfzeile; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#passwörter-und-anfragebegrenzung-l24). Abweichung: Die Liste ist bewusst kurz (häufige Passwörter ab 10 Zeichen und typische Wörter mit Ziffern) statt einer großen Datei aus Passwortlecks.

### L25 Auftragsverarbeiter und Betrieb (empfohlen)

- **Umgesetzt:** Das Verzeichnis nennt Server von f.orga (Hosting), E-Mail-Server, Anmeldedienst und Sicherungsziel als technische Empfänger; die Betriebsanleitung hat den Abschnitt „Datenschutz im Betrieb“ (Auftragsverarbeiter, Hosting, Fernwartung, Protokolle des Reverse Proxy und ihre Löschung); siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#auftragsverarbeiter-und-betrieb-l25) und [Betrieb](../implementiert/betrieb.md#datenschutz-im-betrieb).
- **Organisatorisch:** Verträge nach Art. 28 mit Hoster, IT-Dienstleister, E-Mail- und Anmeldedienst, ggf. dem Entwickler bei Fernwartung.

### L26 Datenschutz-Folgenabschätzung (empfohlen)

- **Umgesetzt:** Hinweis „Prüfen, ob eine Folgenabschätzung nötig ist“ bei Tätigkeiten mit Gesundheitsdaten, Export der Angaben (Tätigkeiten mit Gesundheitsdaten, Daten, Empfänger, Fristen, technische Maßnahmen) als PDF und Excel; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#hinweis-auf-die-folgenabschätzung-l26).
- **Organisatorisch:** Ob eine Folgenabschätzung nötig ist, entscheidet der Verantwortliche mit dem DSB.

### L27 Anhänge (empfohlen)

- **Umgesetzt:** Metadaten (EXIF mit Standort, XMP, IPTC, Kommentare) werden beim Hochladen aus Fotos entfernt, die Ausrichtung bleibt; Hinweis beim Hochladen, bei Einsatzberichten mit dem Zusatz zu Gesichtern, Kennzeichen und Verletzten; höchstens 50 Anhänge je Datensatz; Anhänge folgen der Frist ihres Datensatzes; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#anhänge-l27). Abweichung: PDFs bleiben unverändert (ihre Metadaten nennen höchstens den Ersteller des Dokuments).

### L28 MP-Feuer-Übernahme (empfohlen)

- **Umgesetzt:** Zeilen mit Meldungen nach 90 Tagen bzw. mit „Umstellung abgeschlossen“ entfernt (Bericht behält Zähler), Hinweis „Mitglieder informieren“ nach einer Übernahme mit neuen Personen; siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#mp-feuer-übernahme-l28).
- **Offen:** nur aktivierte Felder übernehmen, sobald es abschaltbare Felder gibt (L10).
- **Organisatorisch:** Transferdateien nach der Übernahme auf allen Rechnern löschen; MP-Feuer-Datenbestand nach dem Parallelbetrieb nach Aufbewahrungsregeln löschen oder archivieren; Vertrag mit dem Anbieter von MP-Feuer zum Ende.

### L29 Aufbewahrung von Protokollen (empfohlen)

- **Heute:** Audit-Log 24 Monate (einstellbar), Historie unbegrenzt; Laufberichte des MP-Feuer-Moduls unbegrenzt.
- **Umsetzung:** Über den [Aufbewahrungsplan](aufbewahrung.md) (`core.history`, `core.audit` und das Leseprotokoll `core.access-log` sind umgesetzt); die Meldungen der Laufberichte entfernt L28 (umgesetzt). Ausgewogen: Das Protokoll muss lang genug sein, um Missbrauch nachzuweisen, und kurz genug, um nicht selbst ein Datenbestand über das Verhalten der Benutzer zu werden.

## Step-up: zweiter Faktor bei sensiblen Daten

Umgesetzt (Faktor, Auslöser, Durchsetzung, Oberfläche): siehe [implementiert/datenschutz.md](../implementiert/datenschutz.md#zweiter-faktor-bei-sensiblen-daten-step-up). Offen ist:

- **Weitere Bereiche mit `stepUp`**, sobald es sie gibt (`incidents.injuries.read`, `core.privacy.manage` und das Leseprotokoll unter `core.audit.read` tragen es bereits). Der Mechanismus ist allgemein: Die Berechtigung bekommt im Manifest `stepUp: true`, Lesepfade mit solchen Feldern prüfen `user.can` (bzw. `needsStepUp` für `stepUpAvailable`), Schreibpfade antworten mit `user.denied(...)`.
- **Reiter „Sicherheit“** in „Verwaltung → Datenschutz → Einstellungen“ (umgesetzt mit HTTPS, System, E-Mails und Sitzungen): Zahl der Benutzer mit sensiblen Rechten und eingerichtetem Faktor, Stand der Sicherung.
- Später zusätzlich **WebAuthn** (Passkeys) als zweiter Faktor.

## Einstellungen „Datenschutz“

Umgesetzt: Seite „Verwaltung → Datenschutz“ mit den Reitern Anfragen, Information, Verzeichnis (`privacy.activities`), Datenpannen und Einstellungen (Kontakte, Texte, Einwilligungen, Selbstauskunft, Sicherheit mit „Benutzer bei Anmelden als benachrichtigen“, Aufbewahrung) und den Abschnitten `privacy.contacts`, `privacy.texts`, `privacy.consents`, `privacy.selfServiceAccess` ([implementiert](../implementiert/datenschutz.md#recht-und-seite-datenschutz)). Offen:

| Reiter | Inhalt |
| --- | --- |
| Sicherheit | zusätzlich Stand des Step-up (Benutzer mit sensiblen Rechten und eingerichtetem Faktor), Stand der Sicherung |

## Rechte und Rollen

| Recht | Bereich | Zweck | Vorlage |
| --- | --- | --- | --- |
| `masterdata.lists.contact` | Abteilung | Listen mit Kontaktdaten ausgeben | `commander`, `department-commander` |

`core.privacy.manage` (Gesamtwehr, privilegiert, `stepUp`, Vorlage `administrator`; [implementiert](../implementiert/datenschutz.md#recht-und-seite-datenschutz)) und `core.privacy.consents` (Abteilung, Vorlagen `commander`, `department-commander`; [implementiert](../implementiert/datenschutz.md#einwilligung-an-der-person)) sind umgesetzt; `core.privacy.manage` deckt Auskünfte, Verzeichnis, Datenpannen und die Löschung ab. Die Vorlage `administration` bekommt es nur auf Wunsch.

## Entscheidungen

Alle Entscheidungen sind festgelegt (wie empfohlen, Nr. 2 abweichend).

1. **Wer bearbeitet Betroffenenanfragen in der Anwendung?** **Festgelegt:** Recht `core.privacy.manage` für Kommandant und eine Person der Gemeindeverwaltung; der DSB bekommt bei Bedarf ein Konto mit Leserecht auf Anfragen und Verzeichnis.
2. **Zwei-Faktor:** wann wird der zweite Faktor verlangt? **Festgelegt:** nur beim Öffnen sensibler Daten und Verwaltungsfunktionen (Step-up), danach 30 Minuten je Sitzung; die Anmeldung selbst bleibt ohne zweiten Faktor. API-Tokens bekommen keine Rechte mit Step-up, das Infoterminal braucht nie einen. Siehe [Step-up](#step-up-zweiter-faktor-bei-sensiblen-daten).
3. **Selbstauskunft sofort oder nach Freigabe?** **Festgelegt:** nach Freigabe (`request`), damit die Verwaltung die Frist führt und Rechte Dritter prüft; `instant` nach einem Jahr Erfahrung erwägen.
4. **Echtdaten im Testsystem:** ganz sperren oder mit Begründung erlauben (Wiederherstellungsprobe nach dem Sicherungskonzept)? **Festgelegt:** Datenübernahme und Personenimport im Testsystem sperren; die Wiederherstellungsprobe einer echten Sicherung nur mit Begründung und mit automatischem Löschen der Testinstanz nach 7 Tagen.
5. **Feldverschlüsselung** für Untersuchungsergebnisse und Bankverbindungen? **Festgelegt:** nein; Festplattenverschlüsselung des Hosts und verschlüsselte Sicherungen, weil der Schlüssel sonst auf demselben Server läge.
6. **Leseprotokoll:** Umfang und Frist. **Festgelegt:** nur Gesundheits- und sensible Daten, zusammengefasst je Tag, 12 Monate; Auswertung nur anlassbezogen.
7. **Verletzte im Bericht:** eigenes Recht oder für alle Leser des Berichts? **Festgelegt:** eigenes Recht `incidents.injuries.read`, Verfasser und Freigeber sehen es immer.
8. **Entschuldigungsgrund als Auswahl statt Freitext.** **Festgelegt:** ja, Freitext optional.
9. **Einwilligung oder Aufgabe** für Telefonliste und Geburtstage: **Festgelegt:** Telefonliste der Führungskräfte und Alarmierung als Aufgabe; Handynummer für alle Mitglieder der Abteilung und Geburtstage im Aushang nur mit Einwilligung. Die Entscheidung trifft der Verantwortliche.
10. **Format des Verzeichnisses:** PDF und Excel oder zusätzlich Word? **Festgelegt:** PDF und Excel; Word nur, wenn die Gemeinde ihr Verzeichnis in Word führt.

## Umsetzungsreihenfolge

| Phase | Inhalt | Lücken |
| --- | --- | --- |
| 1 – vor dem Echtbetrieb | umgesetzt: zweiter Faktor als Step-up, HTTPS mit Caddy und Sicherheitsheader, `FORGA_STAGE` mit Band und Sperren im Testsystem, E-Mails ohne Gesundheitsbezug, Verletzte nur mit Recht (mit `stepUp`) ([implementiert](../implementiert/datenschutz.md)) | L1, L2, L5 (Teil), L6, L18 (Teil) |
| 2 – Rechte der Betroffenen | umgesetzt: Datenschutzhinweis und erste Anmeldung, Anfragen mit Frist, Einschränkung, Widerspruch, Auskunft als PDF mit `describePerson` in allen Modulen ([implementiert](../implementiert/datenschutz.md#datenschutzhinweis-l4)) | umgesetzt L3, L4, L7 (Anfragen, Einschränkung), L19 |
| 3 – Nachweise | umgesetzt: Verzeichnis aus den Manifesten mit technischen Maßnahmen, Datenpannen ([implementiert](../implementiert/datenschutz.md#verzeichnis-der-verarbeitungstätigkeiten-l8)), Einwilligungen, Berichtigung in Mein Bereich, Leseprotokoll, Impersonation sichtbar ([implementiert](../implementiert/datenschutz.md#einwilligungen-l9)) | umgesetzt L8, L9, L12, L15, L20 |
| 4 – Löschen und Minimieren | umgesetzt: Löschprüfung je Modul, vollständige Anonymisierung mit Startprüfung ([implementiert](../implementiert/datenschutz.md#löschprüfung-l7)); offen: Daten Dritter; abschaltbare Felder; Zweck der Listen; Aufbewahrungsplan | L7 (Löschung), L10, L11, L13, L14, L29 |
| 5 – Härtung | umgesetzt: Sitzungen, Verschlüsselung, Benutzer ohne Person, Infoterminal, API-Tokens, Passwörter, Auftragsverarbeiter und Betriebsanleitung, Folgenabschätzung, Anhänge, MP-Feuer-Laufberichte ([implementiert](../implementiert/datenschutz.md#sitzungen-l16)) | umgesetzt L16, L17, L21–L28 (L28 ohne aktivierte Felder) |

Phase 1 ist klein und senkt das größte Risiko; Phase 2 erfüllt die Pflichten, die jedes Mitglied direkt einfordern kann. Die Mockups in `mockups/datenschutz/` sind freigegeben.
