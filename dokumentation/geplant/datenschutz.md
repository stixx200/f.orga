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
- **Protokolle:** Audit-Log (Anmeldungen, Rechte, Exporte, Importe, Impersonation mit Grund), Historie aller Änderungen.
- **Auskunft** `GET /api/core/export/person/:personId`: JSON mit internen IDs aus allen Modulen außer Kostenersatz und Infoterminal, im Audit-Log (`data.person-exported`). Keine Angaben nach Art. 15 Abs. 1, keine lesbare Fassung.
- **Aufbewahrung** ([Aufbewahrungsplan](../implementiert/aufbewahrung.md), Einstellung `privacy.retention`): Frist und Aktion je Datenkategorie (Grunddaten und Personalakte Ausgeschiedener, Einsätze, Dienste, ausgesonderte Geräte und Fahrzeuge, Kostenbescheide, Auszahlungsläufe, Audit-Log, Historie) mit Aussonderung und Anbietung an das Archiv; Standard nichts außer Audit-Log 2 Jahre. Import-Uploads 24 Stunden, Zeilen von MP-Feuer-Läufen 7 Tage. `PersonDataRegistry` mit Beiträgen von Core, Atemschutz, Kleiderkammer, Beförderungen, Diensten, Entschädigungen, Geräten und Einsatzleiter vom Dienst.
- **Sicherheit:** scrypt, Sitzung 14 Tage als `HttpOnly`-Cookie, CSRF-Header, Anmeldesperre, API-Tokens als Hash mit Bereichen, OIDC, verschlüsselte Geräteschlüssel; `Secure`-Cookie nur mit `FORGA_SECURE_COOKIES=true`. **HTTPS ist nicht eingerichtet** ([Betrieb](../implementiert/betrieb.md#einschränkungen-des-aktuellen-stands)).
- **Mein Bereich:** Kontakt und Bankverbindung selbst ändern, eigene Dienste, Einsätze, Entschädigung, Atemschutz, Schutzausrüstung.

## Auskunft nach Art. 15 als PDF

### Ablauf

1. **Antrag erfassen** (Personalakte, Reiter „Datenschutz“ → „Anfrage erfassen“, oder die Person stellt ihn in „Mein Bereich“): Art „Auskunft“, eingegangen am, Weg (schriftlich, E-Mail, persönlich, Mein Bereich), Identität geprüft (ja/wie). Daraus entsteht eine **Betroffenenanfrage** mit Frist eingegangen + 1 Monat (Art. 12 Abs. 3); die Frist erscheint als Aufgabe bei allen mit `core.privacy.manage` und in der Sammel-E-Mail. Verlängern um bis zu zwei Monate geht nur mit Begründung; die Person ist innerhalb eines Monats darüber zu unterrichten (die Seite erinnert daran).
2. **Auskunft erstellen** (Knopf in der Personalakte, Dialog `#d-auskunft`): Sprache (Deutsch/Englisch), Anhang „maschinenlesbare Fassung (JSON)“ optional, Bezug zur Anfrage. Der Umfang ist immer **alles**: Art. 15 kennt keine Auswahl. Der Dialog zeigt je Modul, wie viele Einträge enthalten sind.
3. Der Server erzeugt das PDF im Hintergrund (bei vielen Einsätzen mehrere Sekunden) und legt es **verschlüsselt mit Ablauf** ab (`core.privacy_document`, 30 Tage, dann gelöscht). Die Anfrage zeigt „erstellt am, von“, „übergeben am, Weg“. Audit `privacy.access-report-created`, `privacy.access-report-downloaded`, `privacy.access-report-handed-over`.
4. **Übergabe:** Herunterladen für die persönliche Übergabe oder den Postversand; Bereitstellen in „Mein Bereich“ (die Person lädt sie dort nach Anmeldung herunter). Kein Versand als E-Mail-Anhang: Die Auskunft enthält Gesundheitsdaten. Die E-Mail an die Person sagt nur „Ihre Auskunft liegt in f.orga bereit“.
5. „Anfrage erledigt“ setzt das Datum; die Frist verschwindet.

### Aufbau des PDF

Gestaltung wie die anderen PDFs (Wappen bzw. Briefkopf, Fußzeile mit Anschrift, Seite x/y, Erstellungszeit; `lists/renderers.ts`), A4 hoch, Schrift Helvetica. Kopfzeile jeder Seite „Auskunft nach Art. 15 DSGVO · Name · Stand“.

**Deckblatt (Brief):** Anschrift der Person, Ort/Datum, Betreff, dann die Angaben nach Art. 15 Abs. 1 aus den Textbausteinen der Einstellungen:

| Art. 15 Abs. 1 | Inhalt im PDF | Quelle |
| --- | --- | --- |
| Verarbeitungszwecke (a) | je Bereich, der Daten enthält, der Zweck | Verzeichnis der Verarbeitungstätigkeiten (Zweck je Tätigkeit) |
| Kategorien (b) | je Bereich die Datenkategorien, Gesundheitsdaten gekennzeichnet | Manifest des Moduls |
| Empfänger (c) | z. B. Gemeindeverwaltung/Kämmerei (Entschädigung), Kreisbrandmeister bzw. Statistikportal (Jahresstatistik, nur Zahlen), Leitstelle (Schnittstelle über API-Token), Ärztin/Arzt der Eignungsuntersuchung, Archiv (Aussonderung) | Empfänger im Verzeichnis; API-Tokens mit ihrer Bezeichnung |
| Speicherdauer (d) | je Bereich die Frist aus dem Aufbewahrungsplan bzw. „bis zur Festlegung einer Frist“ | `privacy.retention` |
| Rechte (e) | Berichtigung, Löschung, Einschränkung, Widerspruch (Titel der Art. 16, 17, 18, 21), Kontakt | Textbaustein |
| Beschwerderecht (f) | Aufsichtsbehörde: in Baden-Württemberg der Landesbeauftragte für den Datenschutz und die Informationsfreiheit; Anschrift aus der Einstellung | Einstellung `privacy.authority` |
| Herkunft (g) | je Bereich: eigene Erfassung, Mein Bereich, Infoterminal, Tabellen-Import (Datum), Datenübernahme aus MP-Feuer (Datum des Laufs), Schnittstelle (Name des Tokens) | Historie: erster Eintrag je Datensatz (Benutzer, technischer Benutzer, `ImportSource`) |
| automatisierte Entscheidung (h) | Textbaustein „findet nicht statt“; Ampel und Beförderungsvorschläge sind Entscheidungshilfen | Textbaustein |
| Abs. 2 Drittland | Textbaustein, Standard „keine Übermittlung“ | Textbaustein |

Dazu Kontakt des Verantwortlichen und des DSB. Jeder Textbaustein ist bearbeitbar (de/en) und als Vorlage markiert, bis jemand ihn als geprüft bestätigt.

**Danach je Bereich** (eine Überschrift je Modul, nur Bereiche mit Daten, Reihenfolge wie die Reiter der Personalakte):

- Stammdaten (Person, Kontakt, Mitgliedschaften, Dienstgrade, Qualifikationen, Lehrgänge, Ehrungen, Ämter, Ruhezeiten, Führerschein, Bemerkungen)
- Benutzerkonto (Benutzername, Rollen, Anmeldungen der letzten Monate, Impersonationen des Kontos, Einwilligungen)
- Einsätze (Datum, Stichwort, Ort auf Ortsteil gekürzt, Funktion, Fahrzeug, Zeiten, Atemschutz, verletzt)
- Dienste (Anwesenheit, Entschuldigungen mit Grund)
- Atemschutz (Nachweise, Untersuchungen mit Ergebnis; Gesundheitsdaten gekennzeichnet)
- Entschädigung (Posten mit Betrag, Läufe, Bankverbindung gekürzt auf die letzten vier Stellen)
- Kleiderkammer, Geräte (gemeldete Mängel, durchgeführte Prüfungen), Beförderungen, Einsatzleiter vom Dienst
- Protokolle: Änderungen an den Daten der Person (Historie, Datum, Bereich, geändert von) und Audit-Einträge des Kontos

Regeln der lesbaren Fassung:
- **Klartext statt Kennungen:** Beschriftungen in der gewählten Sprache, Daten formatiert (`21.10.2026`), Verweise aufgelöst (Abteilung, Fahrzeug, Katalogeintrag mit Namen), keine UUIDs, keine Feldnamen aus dem Code, Wahrheitswerte als ja/nein.
- **Rechte Dritter (Art. 15 Abs. 4):** Andere Personen erscheinen nicht mit Namen. Im Einsatz steht die eigene Funktion und das Fahrzeug, nicht die übrige Besatzung; „geändert von“ nennt Benutzer nur mit Funktion („Kommandant“), außer bei eigenen Änderungen. Beteiligte eines Einsatzes (Geschädigte, Zeugen) erscheinen nie.
- **Große Mengen** als Tabelle (Einsätze eines Jahres in einer Zeile je Einsatz), mit Summen je Jahr.
- **Interne Bewertungen** (Bemerkungen, Gründe von Beförderungsausschlüssen) sind personenbezogene Daten der Person und gehören dazu.

**Anhang (optional):** das bisherige JSON (`forga.export`) als Datei, eingebettet in das PDF (Dateianhang) bzw. als zweite Datei. Ein Recht auf Datenübertragbarkeit (Art. 20) besteht nur bei Einwilligung oder Vertrag, nicht bei Verarbeitung für eine öffentliche Aufgabe (Art. 20 Abs. 3); die maschinenlesbare Fassung ist deshalb ein Angebot.

### Umsetzung in den Modulen

`ExportSource` bekommt eine zweite, lesbare Methode neben `person(id)`:

```ts
describePerson?(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]>;
// DescribeContext: language, asOf, resolvePerson(id) => 'Kommandant' | eigener Name, formatDate, formatMoney
// PersonDataSection: { key, title: LocalizedText, activity: string, categories: string[], health?: boolean,
//                      blocks: Array<{ kind: 'fields', rows: { label, value }[] } | { kind: 'table', columns, rows } | { kind: 'text', text }> }
```

- Der Core rendert die Abschnitte mit pdfmake; die Module liefern nur Inhalte, keine Gestaltung.
- `activity` verweist auf die Verarbeitungstätigkeit des Moduls (siehe Verzeichnis); daraus kommen Zweck, Empfänger und Frist der Abschnittsüberschrift.
- **Vollständigkeit:** Beim Start bricht der Server ab, wenn ein Modul Personendaten meldet (`personData` im Manifest, siehe unten) aber kein `describePerson` und kein `anonymize` anbietet, wie heute bei der Historie. Ein Integrationstest erzeugt für eine Demo-Person mit Daten in jedem Modul die Auskunft und prüft, dass jeder Bereich vorkommt und keine UUID im Text steht.
- Fehlende Beiträge heute: Kostenersatz (Daten von Mitgliedern: keine; Kostenschuldner siehe L14), Infoterminal (Eintragungen stehen im Einsatz bzw. Dienst).

### Selbstauskunft in „Mein Bereich“

Abschnitt „Datenschutz“ in Mein Bereich: „Auskunft anfordern“ legt eine Anfrage an (Identität gilt durch die Anmeldung als geprüft; die Verwaltung sieht das). Einstellung `privacy.selfServiceAccess`:
- `request` (Standard): Die Verwaltung erstellt und gibt frei; die Person lädt das PDF in Mein Bereich herunter.
- `instant`: Die Person erzeugt ihre Auskunft sofort selbst, höchstens einmal je Tag.

Die Inhalte von Mein Bereich (eigene Einsätze, Dienste, Entschädigung) sind kein Ersatz für die Auskunft, weil Art. 15 Abs. 1 Angaben verlangt, die dort fehlen.

## Lückenanalyse

Priorität: **kritisch** (Pflicht nach DSGVO oder hohes Risiko, vor dem Echtbetrieb mit Daten aller Mitglieder umsetzen), **wichtig** (Pflicht, aber mit organisatorischem Behelf überbrückbar), **empfohlen** (Stand der Technik, Risiko mindern).

### Übersicht

| Nr. | Thema | DSGVO | Priorität |
| --- | --- | --- | --- |
| L1 | HTTPS, sichere Cookies, Sicherheitsheader | Art. 32 | kritisch |
| L2 | Zweiter Faktor beim Öffnen sensibler Daten (Step-up) | Art. 32 | kritisch |
| L3 | Verständliche Auskunft mit Angaben nach Art. 15 Abs. 1 | Art. 12, 15 | kritisch |
| L4 | Informationspflichten: Datenschutzhinweis, erste Anmeldung, Information bei Übernahme | Art. 13, 14 | kritisch |
| L5 | Gesundheitsdaten: Zugriff, Protokoll, Weitergabe per E-Mail | Art. 9, 32 | kritisch |
| L6 | Echtdaten nur im Echtsystem; Test- und Entwicklungsdaten | Art. 5 Abs. 1 f, 32 | kritisch |
| L7 | Betroffenenanfragen mit Frist; Löschung und Einschränkung je Person | Art. 12, 17, 18 | kritisch |
| L8 | Verzeichnis der Verarbeitungstätigkeiten und technische Maßnahmen | Art. 30, 32 | wichtig |
| L9 | Einwilligungen erfassen, nachweisen, widerrufen (auch Minderjährige) | Art. 6, 7, 8 | wichtig |
| L10 | Datenminimierung der Felder und Freitexte | Art. 5 Abs. 1 c, 25 | wichtig |
| L11 | Zweckbindung der Listen und Exporte | Art. 5 Abs. 1 b, 25 | wichtig |
| L12 | Berichtigung durch die Person; falsche Werte in der Historie | Art. 16, 19 | wichtig |
| L13 | Vollständige Anonymisierung über alle Module | Art. 5 Abs. 1 e, 17 | wichtig |
| L14 | Daten Dritter (Beteiligte, Kostenschuldner, Anrufer) | Art. 14, 15, 17 | wichtig |
| L15 | Protokollierung von Lesezugriffen; Transparenz der Impersonation | Art. 5 Abs. 2, 32 | wichtig |
| L16 | Sitzungen: Leerlauf-Abmeldung, Geräteübersicht | Art. 32 | wichtig |
| L17 | Verschlüsselung der Sicherungen und der gespeicherten Daten | Art. 32 | wichtig |
| L18 | E-Mails: Inhalt der Sammel-E-Mail und Benachrichtigungen | Art. 5 Abs. 1 c, f, 32 | wichtig |
| L19 | Widerspruch | Art. 21 | wichtig |
| L20 | Unterstützung bei Datenpannen | Art. 33, 34 | wichtig |
| L21 | Benutzer ohne Person; gesperrte Konten | Art. 5 Abs. 1 e | empfohlen |
| L22 | Infoterminal als öffentlich zugängliches Gerät | Art. 25, 32 | empfohlen |
| L23 | API-Tokens: Ablauf, Bereiche, Empfänger | Art. 5 Abs. 1 f, 32 | empfohlen |
| L24 | Passwortregeln, Anfragebegrenzung dauerhaft | Art. 32 | empfohlen |
| L25 | Auftragsverarbeiter und Hinweise für den Betrieb | Art. 28 | empfohlen |
| L26 | Datenschutz-Folgenabschätzung | Art. 35 | empfohlen |
| L27 | Anhänge (Fotos) | Art. 5, 9 | empfohlen |
| L28 | MP-Feuer-Übernahme und Dateien aus MP-Feuer | Art. 5, 14, 32 | empfohlen |
| L29 | Aufbewahrung von Protokollen und Laufberichten | Art. 5 Abs. 1 e | empfohlen |

### L1 HTTPS, sichere Cookies, Sicherheitsheader (kritisch)

- **Heute:** Der Stack spricht nur HTTP auf Port 8080; `FORGA_SECURE_COOKIES` ist standardmäßig aus. Keine HSTS-, CSP-, `X-Frame-Options`- oder `Referrer-Policy`-Header (nur Anhänge und Wappen haben eine CSP). Passwörter, Sitzungen und Gesundheitsdaten gingen im Netz unverschlüsselt.
- **Soll:** Im Echtbetrieb nur HTTPS (Art. 32 Abs. 1 a „Verschlüsselung“).
- **Umsetzung:** Optionaler Dienst `caddy` in `docker/compose.yml` (TLS per Let's Encrypt oder eigenes Zertifikat der Gemeinde), Profil „intern“ mit eigenem Zertifikat. Ist `brigade.publicUrl` eine `https://`-Adresse, gelten `Secure`-Cookies automatisch. Sicherheitsheader global (HSTS nur bei HTTPS, CSP `default-src 'self'` mit den Modul-Frontends, `frame-ancestors 'none'`, `Referrer-Policy: same-origin`, `Permissions-Policy` mit Kamera/NFC nur für `/scan`). Die Einrichtungsliste und eine Plakette in „Einstellungen → Datenschutz → Sicherheit“ warnen, solange die Anwendung über HTTP aufgerufen wird. `/api/docs` nur angemeldet.
- **Organisatorisch:** Betrieb nur im Netz der Gemeinde oder hinter TLS; Zertifikat und Erneuerung beim IT-Dienstleister.

### L2 Zweiter Faktor beim Öffnen sensibler Daten (kritisch)

- **Heute:** Nur Passwort oder OIDC. Ein erbeutetes Passwort eines Administrators öffnet alle Daten, auch Vollexport und Impersonation.
- **Soll:** Ein zweiter Faktor für den Zugriff auf Gesundheitsdaten, sensible Personendaten und die Verwaltung (Stand der Technik nach Art. 32).
- **Festgelegt: „Nur bei sensiblen Daten“ (Step-up).** Die Anmeldung bleibt wie heute (Passwort oder OIDC). Der zweite Faktor wird erst abgefragt, wenn der Benutzer sensible Daten oder Verwaltungsfunktionen öffnet, und gilt danach **30 Minuten für diese Sitzung**. Wer nie sensible Daten öffnet (die meisten Mitglieder, Mein Bereich), braucht keinen zweiten Faktor. Einzelheiten unter [Step-up](#step-up-zweiter-faktor-bei-sensiblen-daten).
- **Organisatorisch:** Ablauf bei verlorenem Telefon (Wiederherstellungscodes, Zurücksetzen durch einen Administrator); Benutzer mit sensiblen Rechten richten den Faktor bei der Übergabe ihrer Rolle ein.

### L3 Verständliche Auskunft (kritisch)

- **Heute:** JSON mit IDs und Feldnamen; die Angaben nach Art. 15 Abs. 1 fehlen; Kostenersatz und Infoterminal liefern nichts; andere Personen (Besatzung) könnten mitgeliefert werden.
- **Soll:** präzise, verständlich, in klarer Sprache (Art. 12 Abs. 1), mit allen Angaben nach Art. 15 Abs. 1 und einer Kopie (Abs. 3), ohne Rechte Dritter zu verletzen (Abs. 4).
- **Umsetzung:** siehe [Auskunft nach Art. 15 als PDF](#auskunft-nach-art-15-als-pdf).
- **Organisatorisch:** Textbausteine mit dem DSB prüfen; Identität vor der Herausgabe prüfen.

### L4 Informationspflichten (kritisch)

- **Heute:** Kein Datenschutzhinweis in der Anwendung; Mitglieder erfahren nicht, was f.orga speichert; nach der Übernahme aus MP-Feuer gibt es keine Information.
- **Soll:** Information bei Erhebung (Art. 13), bei Daten aus anderer Quelle innerhalb eines Monats (Art. 14 Abs. 3).
- **Umsetzung:**
  - Seite **Datenschutzhinweis** `/privacy` (ohne Anmeldung lesbar, Link in Fußzeile und Anmeldeseite), zusammengesetzt aus Textbausteinen und dem Verzeichnis: Verantwortlicher, DSB, Zwecke und Rechtsgrundlagen je Tätigkeit, Empfänger, Fristen, Rechte, Beschwerde. Versioniert: jede Änderung ist eine neue Fassung mit Datum.
  - **Hinweis bei der ersten Anmeldung** und nach einer neuen Fassung (Mockup `datenschutz/erste-anmeldung.html`): Kurzfassung, Link auf den vollständigen Text, „Zur Kenntnis genommen“ (mit Zeitpunkt gespeichert; keine Einwilligung), danach die angebotenen Einwilligungen, freiwillig und einzeln.
  - **Information ohne Benutzerkonto:** Die meisten Mitglieder haben kein Konto. „Datenschutzhinweis als PDF“ für den Aushang und als Beilage zur Aufnahme; Liste „Information nach Art. 13/14“ mit allen Personen, deren Information noch nicht vermerkt ist, und „Information erteilt am“ an der Person (auch als Massenaktion nach einer Datenübernahme).
- **Organisatorisch:** Text abstimmen; Mitglieder bei Aufnahme und nach der Umstellung informieren (Dienstabend, Aushang, Schreiben).

### L5 Gesundheitsdaten (kritisch)

- **Heute:** Gesundheitsdaten (Art. 9) liegen vor als Ergebnis und Einschränkungen der Eignungsuntersuchung (geschützt durch `examinations`), als „verletzt/getötet“ im Personal eines Berichts (sichtbar für jeden mit Leserecht auf den Bericht), mittelbar in Ruhezeiten, Übernahme in die Altersabteilung „aus gesundheitlichen Gründen“, Entschuldigungstexten der Dienste und freien Bemerkungen. Lesezugriffe werden nicht protokolliert. Die Ampel auf Rot geht per E-Mail mit Namen an Gerätewarte und Abteilungskommandanten; die Frist „Eignungsuntersuchung erforderlich“ nach „Bedenken“ steht mit Namen in der Sammel-E-Mail.
- **Soll:** Zugriff nur, wer es für seine Aufgabe braucht; Nachvollziehbarkeit; keine Gesundheitsangaben in E-Mails.
- **Umsetzung:**
  - Personal im Bericht: „verletzt“/„getötet“ nur für Verfasser, Freigeber und `incidents.injuries.read` (neu; Standard Kommandant). Andere Leser sehen „1 eigene Verletzte“ ohne Namen. Die Statistik zählt weiter.
  - Kennzeichen `health` an Feldern und Entitäten im Manifest (`personData.categories`), ausgewertet in Auskunft, Verzeichnis und Leseprotokoll (L15).
  - Leseprotokoll für Untersuchungen (`respiratory-protection.examination-viewed`) und für die Liste fällige Untersuchungen.
  - Hinweis an Freitextfeldern (Bemerkung, Entschuldigung, Ruhezeit): „Keine Gesundheitsangaben eintragen“; Entschuldigungsgrund als Auswahl (beruflich, privat, krank, Urlaub, sonstiges) statt Freitext, Freitext optional und nur für den Gruppenführer.
  - E-Mails ohne Gesundheitsbezug, siehe L18.
- **Organisatorisch:** Rechtsgrundlage für Untersuchungsdaten klären; Ärzte liefern nur die Bescheinigung „Bedenken/keine Bedenken“, keine Befunde.

### L6 Echtdaten nur im Echtsystem (kritisch)

- **Heute:** Das Testsystem ist für Demodaten gedacht ([Betrieb](../implementiert/betrieb.md)), aber nichts verhindert Echtdaten darin; das [Sicherungsmodul](module/backup.md) sieht vor, eine Sicherung des Echtsystems im Testsystem wiederherzustellen. Echte MP-Feuer-Dateien liegen auf dem Entwicklungsrechner im Ordner `local/`, der nur über `.git/info/exclude` und nicht über `.gitignore` von Git ausgenommen ist.
- **Soll:** Personendaten nur dort, wo der Zweck es verlangt; Entwicklung und Tests mit erfundenen Daten.
- **Umsetzung:** Umgebungsvariable `FORGA_STAGE` (`production`, `test`, `development`). Im Testsystem zeigt jede Seite das Band „Testsystem – nur Demodaten“; Datenübernahme aus MP-Feuer, Tabellen-Import von Personen und Wiederherstellung einer Sicherung des Echtsystems verlangen dort die Eingabe „Echtdaten im Testsystem“ mit Grund (Audit) oder sind gesperrt (siehe Entscheidung). `.gitignore` bekommt `local/`, `*.xlsx`, `MPTRA_*.zip`, `*.dump`, `*.forgabackup` außerhalb von Testdaten. `npm run seed` lehnt ein System mit `FORGA_STAGE=production` ab.
- **Organisatorisch:** Echte Dateien nach der Umstellung löschen; Entwicklungsrechner mit verschlüsselter Festplatte; Testsystem nicht für alle Benutzer freigeben.

### L7 Betroffenenanfragen, Löschung und Einschränkung (kritisch)

- **Heute:** Keine Erfassung von Anträgen, keine Frist; Löschen nur über die Anonymisierung nach Jahren; keine Einschränkung.
- **Soll:** Antwort binnen eines Monats (Art. 12 Abs. 3); Löschung, soweit keine Ausnahme nach Art. 17 Abs. 3 greift (u. a. rechtliche Pflicht, öffentliche Aufgabe, Archivzwecke); Einschränkung statt Löschung (Art. 18), Mitteilung an Empfänger (Art. 19).
- **Umsetzung:** Seite **Verwaltung → Datenschutz → Anfragen** (Mockup `datenschutz/anfragen.html`), Recht `core.privacy.manage` (neu; Rollenvorlage `administrator`, auf Wunsch `administration`). Arten: Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch, Widerruf einer Einwilligung. Je Anfrage Frist, Status (eingegangen, in Prüfung, verlängert, erledigt, abgelehnt mit Begründung), Bearbeiter, Notizen, Antwortschreiben als PDF aus Textbaustein.
  - **Löschprüfung:** Jedes Modul beantwortet über `PersonDataHandler.erasure(personId)` je Datenbereich: löschbar, nur anonymisierbar, aufzubewahren bis (mit Grund aus dem Aufbewahrungsplan, z. B. Auszahlungsläufe als Kassenunterlage). Die Seite zeigt das als Tabelle; „Ausführen“ löscht bzw. anonymisiert, was erlaubt ist, und setzt für den Rest eine Einschränkung bis zum Fristende. Audit `privacy.erasure-executed` mit Zählern, ohne gelöschte Inhalte.
  - **Einschränkung** an der Person (`restrictedAt`, Grund, bis): Die Person erscheint nicht mehr in Listen, Suche, Infoterminal, Personalauswahl, Fristen und E-Mails; Daten sind nur noch mit `core.privacy.manage` lesbar; Änderungen nur zur Berichtigung. Personalakte mit Plakette „Verarbeitung eingeschränkt“. Module fragen das über `PERSON_DIRECTORY` ab (`isRestricted`).
  - **Mitteilung an Empfänger (Art. 19):** Die Anfrage listet die Empfänger aus dem Verzeichnis (z. B. Kämmerei bei geänderter Bankverbindung) zum Abhaken.
- **Organisatorisch:** Wer bearbeitet Anfragen (Kommandant, Hauptamt, DSB)? Begründung von Ablehnungen.

### L8 Verzeichnis der Verarbeitungstätigkeiten (wichtig)

- **Heute:** Nichts in der Anwendung; die Gemeinde muss das Verzeichnis selbst schreiben.
- **Soll:** Verzeichnis nach Art. 30 Abs. 1 (Verantwortlicher, DSB, Zwecke, Kategorien von Betroffenen und Daten, Empfänger, Drittland, Fristen, technische und organisatorische Maßnahmen).
- **Umsetzung:** Module beschreiben ihre Tätigkeiten im Manifest:

  ```ts
  privacy: { activities: [{ key: 'incidents.reports', name: LocalizedText, purpose: LocalizedText,
    subjects: ['members', 'third-parties'], categories: [...], health: true,
    recipients: ['municipality', 'statistics-portal'], retentionCategory: 'incidents.incidents',
    legalBasisHint: LocalizedText }] }
  ```

  Der Core setzt daraus einen **Entwurf** zusammen (Mockup `datenschutz/verzeichnis.html`): eine Tätigkeit je Fachaufgabe (Personalverwaltung, Einsatzdokumentation, Entschädigung, Atemschutzüberwachung, Dienstbetrieb, Kostenersatz, Kleiderkammer, Geräteprüfung, Benutzerkonten und Protokolle), nur für aktive Module. Fristen kommen aus `privacy.retention`, Empfänger zusätzlich aus API-Tokens und SMTP/OIDC-Einstellungen. Die Gemeinde ergänzt je Tätigkeit Rechtsgrundlage, weitere Empfänger, Bemerkungen und „geprüft am/von“ (gespeichert in `privacy.activities`, historisiert). Export als PDF und als Word-kompatibles `.docx` bzw. Excel zum Weiterbearbeiten. Ein Abschnitt **Technische Maßnahmen** beschreibt, was f.orga tut (Rechte, Verschlüsselung, Protokolle, Sicherung) mit dem aktuellen Stand der Einstellungen (z. B. „Zweiter Faktor: bei sensiblen Daten (Step-up)“, „HTTPS: nein“).
- **Organisatorisch:** Verzeichnis führt der Verantwortliche; der Entwurf ersetzt keine Prüfung.

### L9 Einwilligungen (wichtig)

- **Heute:** Keine. Fotos in Berichten und auf der Website, Geburtstagsliste zum Aushang, Weitergabe der Handynummer an die Abteilung (Telefonliste) oder an Messenger-Gruppen beruhen heute auf stillschweigender Praxis.
- **Soll:** Wo die Verarbeitung nicht zur Aufgabe der Feuerwehr gehört, braucht es eine freiwillige, nachweisbare, jederzeit widerrufbare Einwilligung (Art. 6 Abs. 1 a, Art. 7). Bei Minderjährigen willigen in der Regel die Erziehungsberechtigten ein (für Dienste der Informationsgesellschaft regelt Art. 8 das Alter; für die Jugendfeuerwehr mit dem DSB klären).
- **Umsetzung:**
  - **Katalog der Einwilligungen** in „Einstellungen → Datenschutz“ (Mockup): Schlüssel, Titel und Text (de/en, versioniert), Zweck, wer erteilt (Person, Erziehungsberechtigte bei Minderjährigen), Wirkung in f.orga (`effects`), aktiv. Vorlagen (als Vorlage gekennzeichnet): „Fotos in Öffentlichkeitsarbeit“, „Geburtstag im Aushang“, „Handynummer in der Telefonliste der Abteilung“, „Geburtstagsgruß durch die Feuerwehr“.
  - **Einwilligung an der Person** (`core.consent`: Person, Schlüssel, Fassung, erteilt am, Weg: schriftlich/Mein Bereich/Erziehungsberechtigte, erfasst von, Nachweis als Anhang, widerrufen am, Weg). Nie löschen, nur widerrufen; die Historie ist der Nachweis.
  - **Wirkung:** Die Liste „Geburtstage“ mit Zweck „Aushang“ enthält nur Personen mit Einwilligung (Zweck „intern für den Kommandanten“ bleibt ohne); die Telefonliste zeigt die Handynummer nur mit Einwilligung, sonst „über Gruppenführer“. Module fragen `CONSENTS.has(personId, key)`.
  - In **Mein Bereich** sieht und ändert die Person ihre Einwilligungen selbst (Mockup), außer bei Minderjährigen (dann nur ansehen, Widerruf über die Verwaltung).
- **Organisatorisch:** entscheiden, welche Verarbeitungen eine Einwilligung brauchen und welche auf der Aufgabe beruhen; Texte prüfen; Papierformulare für Mitglieder ohne Konto.

### L10 Datenminimierung (wichtig)

- **Heute:** Die Personalakte hat Felder, deren Zweck nicht jede Feuerwehr hat: Geburtsort, Titel, Rufname, Arbeitgeber mit Anschrift und IBAN, private Bankverbindung, Telefon dienstlich, Bemerkung. Freitexte (Bemerkung, Entschuldigung, Beteiligte, Lage) können beliebiges enthalten.
- **Soll:** nur, was für den Zweck nötig ist (Art. 5 Abs. 1 c); Voreinstellungen datenschutzfreundlich (Art. 25 Abs. 2).
- **Umsetzung:** Einstellung „Felder der Personalakte“: optionale Felder abschaltbar (abgeschaltete werden nicht angezeigt, nicht importiert und nach Bestätigung geleert). Je Feld ein Hinweis „Wofür?“ (z. B. Arbeitgeber: Verdienstausfall und Freistellung; Geburtsort: Urkunden, Lehrgangsanmeldung). Die MP-Feuer-Übernahme übernimmt nur aktive Felder. Freitexte bekommen eine Längenbegrenzung und den Hinweis aus L5.
- **Organisatorisch:** Feldliste mit dem DSB durchgehen; nicht benötigte Felder abschalten.

### L11 Zweckbindung der Listen und Exporte (wichtig)

- **Heute:** Die Telefonliste und die Mitgliederliste mit Kontakt darf jeder mit `masterdata.persons.read` ausgeben (z. B. Gruppenführer); Geburtstage und Komplettdaten brauchen `sensitive`. Exporte stehen im Audit-Log, ohne Zweck. Die Excel-Ausgabe jeder Tabelle (`DataTable`) geht an allen Listen vorbei.
- **Soll:** Daten nur für festgelegte Zwecke; Ausdrucke verlassen kontrolliert das System.
- **Umsetzung:** Listen tragen im Manifest einen Zweck und optional eine Einwilligung (L9); Listen mit Kontakt- oder sensiblen Daten bekommen ein eigenes Recht `masterdata.lists.contact` (Standard Kommandant, Abteilungskommandant). Fußzeile von PDF und Excel: „Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten“. Beim Export von Listen mit Kontakt- oder Gesundheitsdaten Pflichtfeld „Zweck“ (Audit). Excel-Ausgabe der Tabellen nur für Tabellen ohne Kontaktspalten bzw. mit demselben Recht.
- **Organisatorisch:** Dienstanweisung zum Umgang mit Ausdrucken und Messenger-Gruppen.

### L12 Berichtigung (wichtig)

- **Heute:** In Mein Bereich lassen sich Kontakt und Bankverbindung ändern; für andere Angaben (Qualifikation fehlt, falsches Eintrittsdatum, falscher Einsatz) gibt es keinen Weg. Ein berichtigter Wert bleibt in der Historie sichtbar.
- **Soll:** unverzügliche Berichtigung (Art. 16), Mitteilung an Empfänger (Art. 19).
- **Umsetzung:** „Berichtigung beantragen“ in jedem Abschnitt von Mein Bereich (Mockup): Bereich, was ist falsch, wie richtig, optional Nachweis (PDF/Foto, kein Führerscheinfoto). Es entsteht eine Anfrage mit Frist und eine Aufgabe bei den Zuständigen der Abteilung (`masterdata.persons.write`). „Wert in der Historie unkenntlich machen“ für nachweislich falsche oder unzulässig erfasste Angaben (Recht `core.privacy.manage`, Grund Pflicht; der Eintrag bleibt mit „berichtigt, Wert entfernt am …“).
- **Organisatorisch:** wer prüft Anträge; Kämmerei bei geänderter Bankverbindung informieren (Hinweis in der Anfrage).

### L13 Vollständige Anonymisierung (wichtig)

- **Heute:** `PersonDataRegistry` haben Core, Atemschutz, Kleiderkammer, Beförderungen, Dienste, Entschädigungen (Namen in Auszahlungen ohne Bankverbindung), Geräte (Name des Meldenden bei Mängeln) und Einsatzleiter vom Dienst (Notizen im Dienstplan). Einsätze werden nach ihrer eigenen Frist anonymisiert (Beteiligte, Gastnamen, Freitexte, Anhänge, Versionen, Historie; [Aufbewahrungsplan](../implementiert/aufbewahrung.md#wirkung)). Ohne Beitrag zur Person: Einsatzberichte („verletzt“, Bemerkungen zum Personal, Infoterminal-Eintragungen bis zur Frist des Einsatzes), Entschädigungen (Begründungen der Posten), Geräte (durchgeführte Prüfungen mit Prüfername), Kostenersatz (Personalansätze mit Namen in Bescheiden). Gespeicherte PDFs (Kostenbescheide) und Anhänge werden nicht berücksichtigt; die Historie der Module außer Stammdaten behält Namen und alte Werte. Es gibt keine Prüfung, dass ein neues Modul einen Beitrag liefert.
- **Soll:** Nach Fristablauf darf kein Modul mehr Angaben haben, die die Person identifizieren, außer was aufzubewahren ist.
- **Umsetzung:** Manifestfeld `personData` (welche Entitäten Personen referenzieren, ob mit Namen in Freitext); Startprüfung wie bei der Historie; Beiträge für die fehlenden Module; Historie der betroffenen Datensätze wird mit anonymisiert (Werte der Felder mit Personenbezug ersetzt). Aufzubewahrende Kassenunterlagen (Auszahlungsläufe, Bescheide) bleiben bis zu ihrer eigenen Frist ([Aufbewahrungsplan](aufbewahrung.md)). Ein Integrationstest legt eine Person mit Daten in allen Modulen an, anonymisiert sie und sucht danach Namen, Geburtsdatum und E-Mail in allen Tabellen (auch `core.history`, `core.audit`).
- **Organisatorisch:** –

### L14 Daten Dritter (wichtig)

- **Heute:** Einsatzberichte speichern Beteiligte (Name, Anschrift, Telefon, Kennzeichen, Rolle Geschädigter/Verursacher/Zeuge/Anrufer); der Kostenersatz Kostenschuldner mit Adressbuch und Bescheiden. Diese Personen sind keine `Person` der Stammdaten: Weder Auskunft noch Löschung noch Information sind abgebildet.
- **Soll:** Auch Dritte haben die Rechte nach Art. 14–18; Fristen gelten auch für sie.
- **Umsetzung:** „Auskunft zu einer anderen Person“ auf der Seite Anfragen: Suche nach Name, Anschrift oder Kennzeichen über Beteiligte und Kostenschuldner (`SearchRegistry` mit eigener Quelle `privacy.third-parties`, nur `core.privacy.manage`); dieselbe PDF-Auskunft mit den Abschnitten „Einsätze, an denen Sie beteiligt waren“ (Datum, Stichwort, Rolle, gespeicherte Angaben zu Ihnen) und „Kostenbescheide“. Anonymisierung der Beteiligten über den Aufbewahrungsplan (Einsätze anonymisieren). Hinweis im Berichtseditor: nur Angaben, die für Kostenersatz, Versicherung oder Polizei nötig sind.
- **Organisatorisch:** Informationspflicht nach Art. 14 gegenüber Beteiligten (Ausnahmen mit dem DSB klären), Hinweis im Kostenbescheid.

### L15 Lesezugriffe und Impersonation (wichtig)

- **Heute:** Das Audit-Log enthält Anmeldungen, Änderungen an Rechten, Exporte, Importe; das Lesen einer Personalakte oder von Untersuchungen wird nicht protokolliert. Impersonation steht im Audit-Log, aber der betroffene Benutzer erfährt nichts.
- **Soll:** Nachweis, wer auf besonders schützenswerte Daten zugegriffen hat (Rechenschaftspflicht Art. 5 Abs. 2), ohne jeden Klick zu speichern.
- **Umsetzung:** Leseprotokoll `core.access_log` nur für Daten mit `health` oder `sensitive` (Personalakte mit sensiblen Feldern, Untersuchungen, Auskunft, Vollexport, Listen mit Kontaktdaten): Benutzer, Person, Bereich, Zeitpunkt; zusammengefasst je Benutzer, Person und Tag. Aufbewahrung eigene Frist (Standard 12 Monate). Einsicht mit `core.audit.read`; die betroffene Person sieht in ihrer Auskunft, welche Funktion wann zugegriffen hat. **Impersonation:** Der Benutzer sieht in Mein Bereich bzw. Profil „Anmeldungen als Sie“ mit Datum, Administrator und Grund; Einstellung, ob er eine E-Mail bekommt (Standard an).
- **Organisatorisch:** Regel, wann das Leseprotokoll ausgewertet wird (nur anlassbezogen, Beteiligung Personalrat bzw. Feuerwehrausschuss klären).

### L16 Sitzungen (wichtig)

- **Heute:** Sitzung 14 Tage fest, keine Abmeldung bei Inaktivität, keine Übersicht der eigenen Sitzungen. Auf einem geteilten PC in der Wache bleibt ein Kommandantenkonto zwei Wochen offen.
- **Umsetzung:** Leerlauf-Abmeldung (Einstellung, Standard 60 Minuten für privilegierte Konten, 8 Stunden für andere; „Angemeldet bleiben“ nur für nicht privilegierte Konten, höchstens 14 Tage). Profil „Angemeldete Geräte“ mit Browser, Adresse (gekürzt), letzte Aktivität, Abmelden einzeln und „Alle anderen abmelden“. Die Anmeldeseite des Infoterminals ist davon unberührt.
- **Organisatorisch:** geteilte Rechner mit eigenem Benutzerkonto des Betriebssystems und Bildschirmsperre.

### L17 Verschlüsselung (wichtig)

- **Heute:** Datenbank, Anhänge und Sicherungen aus `docker/backup.sh` sind unverschlüsselt; das [Sicherungsmodul](module/backup.md) plant AES-256-GCM.
- **Umsetzung:** Verschlüsselte Sicherung als Standard im Modul `backup` (unverschlüsselt nur mit Bestätigung, wie geplant); `docker/backup.sh` bekommt `--encrypt` mit `age` oder `openssl`. Die Seite „Sicherheit“ zeigt, ob Sicherungen verschlüsselt sind. Feldverschlüsselung in der Datenbank (z. B. Untersuchungsergebnisse) bringt wenig, solange Schlüssel und Datenbank auf demselben Server liegen; empfohlen ist Festplattenverschlüsselung des Hosts (siehe Entscheidung).
- **Organisatorisch:** Host mit verschlüsseltem Datenträger, Zutritt zum Serverraum, Passphrase und `FORGA_SECRET_KEY` im Passwortsafe.

### L18 E-Mails (wichtig)

- **Heute:** Die Sammel-E-Mail nennt je Frist Titel und Personen („Eignungsuntersuchung erforderlich – Funke, Felix“), die Ampel-Benachrichtigung den Namen der Person mit Rot. E-Mails gehen über den SMTP-Server der Einstellung, ob mit TLS, hängt von der Einstellung ab.
- **Umsetzung:** Einstellung „E-Mails ohne Personennamen“ (Standard an für Fristen mit Gesundheitsbezug, wählbar für alle): „3 Fristen im Atemschutz, davon 1 überfällig – in f.orga ansehen“. Fristarten tragen `health: true`. SMTP ohne TLS nur mit Warnung. Keine Anhänge mit Personendaten (Auskunft nur zum Herunterladen).
- **Organisatorisch:** E-Mail-Adressen der Gemeinde statt privater Anbieter, wo möglich.

### L19 Widerspruch (wichtig)

- **Heute:** Kein Weg.
- **Soll:** Bei Verarbeitung für eine öffentliche Aufgabe kann die Person aus Gründen ihrer besonderen Situation widersprechen (Art. 21 Abs. 1); dann ist abzuwägen.
- **Umsetzung:** Art „Widerspruch“ in den Anfragen mit Bezug auf eine Verarbeitungstätigkeit; bis zur Entscheidung optional Einschränkung (L7). Entscheidung mit Begründung als Antwortschreiben.
- **Organisatorisch:** Abwägung durch den Verantwortlichen.

### L20 Datenpannen (wichtig)

- **Heute:** Das Audit-Log ist filterbar, aber es gibt keinen Weg, betroffene Personen zu ermitteln.
- **Umsetzung:** „Datenpanne erfassen“ unter Datenschutz: Zeitpunkt bekannt geworden (Frist 72 Stunden als Aufgabe), Beschreibung, betroffene Daten. Hilfen: Audit- und Leseprotokoll eines Zeitraums oder Benutzers exportieren; „Betroffene Personen“ aus einem Export (`lists.exported` mit Parametern, Vollexport, Auskunft) oder einem Konto rekonstruieren (Personen, die der Benutzer lesen konnte); Liste mit Kontaktdaten für die Benachrichtigung (Art. 34); Sperren aller Sitzungen und Tokens auf Knopfdruck.
- **Organisatorisch:** Meldung an die Aufsichtsbehörde, Dokumentation (Art. 33 Abs. 5).

### L21 Benutzer ohne Person (empfohlen)

- **Heute:** Benutzer werden nur gesperrt, nie gelöscht; ohne verknüpfte Person werden sie nie anonymisiert (z. B. externer Administrator, Mitarbeiter der Kämmerei).
- **Umsetzung:** Gesperrte Benutzer ohne Person nach Frist (Einstellung, Standard 2 Jahre nach Sperre) anonymisieren wie verknüpfte; Benutzerliste zeigt „gesperrt seit“.

### L22 Infoterminal (empfohlen)

- **Heute:** Das Terminal zeigt Vor- und Nachnamen der Mitglieder der Abteilung und sucht über alle nicht ausgeschiedenen Personen; nach 60 Sekunden ohne Bedienung zurück zur Startseite. Einsätze mit Straße und Ort sind sichtbar.
- **Umsetzung:** Namenssuche auf die Abteilungen des Terminals und Personen mit Mitgliedschaft in derselben Wache beschränken (Einstellung); eingeschränkte Personen (L7) erscheinen nie; Einsatzort nur Straße ohne Hausnummer; Hinweis in der Verwaltung, das Gerät nicht in öffentlich zugänglichen Räumen aufzustellen. Kein Geburtsdatum, keine Kontaktdaten, keine Ampel am Terminal (heute schon so).
- **Organisatorisch:** Aufstellort, Bildschirmschutz.

### L23 API-Tokens (empfohlen)

- **Heute:** Ablauf optional; Bereiche gelten immer für die Gesamtwehr; die Empfänger (Leitstelle, Alarmierungsdienst) stehen nirgends als Empfänger.
- **Umsetzung:** Ablauf Pflicht (höchstens 2 Jahre, Erinnerung als Frist); Feld „Empfänger/System“ und „Zweck“, das in das Verzeichnis und die Auskunft eingeht; optional erlaubte Adressen. Bereiche mit Personendaten (`masterdata.persons.read`) mit Warnung.

### L24 Passwörter und Begrenzungen (empfohlen)

- **Heute:** mindestens 10 Zeichen; Anmeldesperre und Begrenzungen im Speicher des Prozesses.
- **Umsetzung:** Abgleich mit einer mitgelieferten Liste häufiger Passwörter; Hinweis auf Passwortmanager; Zähler in der Datenbank statt im Speicher.

### L25 Auftragsverarbeiter und Betrieb (empfohlen)

- **Heute:** Keine Hinweise.
- **Umsetzung:** Das Verzeichnis listet automatisch die technischen Empfänger aus der Konfiguration: SMTP-Server, OIDC-Anbieter, Sicherungsziel, Adresse von f.orga (Hosting). Die Betriebsanleitung bekommt einen Abschnitt „Datenschutz im Betrieb“ (Hosting, Fernwartung, Protokolle des Reverse Proxy mit IP-Adressen und ihre Löschung).
- **Organisatorisch:** Verträge nach Art. 28 mit Hoster, IT-Dienstleister, E-Mail- und Anmeldedienst, ggf. dem Entwickler bei Fernwartung.

### L26 Datenschutz-Folgenabschätzung (empfohlen)

- **Heute:** –
- **Umsetzung:** Hinweis im Verzeichnis bei Tätigkeiten mit `health: true` („Prüfen, ob eine Folgenabschätzung nötig ist“); Export der Angaben, die eine Folgenabschätzung braucht (Tätigkeiten, Daten, Empfänger, technische Maßnahmen).
- **Organisatorisch:** Ob eine Folgenabschätzung nötig ist, entscheidet der Verantwortliche mit dem DSB.

### L27 Anhänge (empfohlen)

- **Heute:** Fotos und PDFs an Berichten, Diensten, Geräten liegen in der Datenbank; sie können Verletzte, Kennzeichen oder Gesichter zeigen.
- **Umsetzung:** Hinweis beim Hochladen von Einsatzfotos; Metadaten (EXIF mit Standort) beim Hochladen entfernen; Anhänge folgen der Frist ihres Datensatzes ([Aufbewahrungsplan](aufbewahrung.md)).

### L28 MP-Feuer-Übernahme (empfohlen)

- **Heute:** Hochgeladene Transferdateien werden nach dem Lesen gelöscht, die gelesenen Zeilen nach der Übernahme bzw. nach 7 Tagen; Zeilen mit Meldungen und Laufberichte (mit Beispielzeilen und Namen) bleiben unbegrenzt. Die Archive in MP-Feuer selbst sind unverschlüsselt.
- **Umsetzung:** Zeilen mit Meldungen nach Abschluss der Umstellung bzw. nach 90 Tagen entfernen (Bericht behält Zähler); Hinweis nach der ersten Übernahme „Mitglieder informieren“ (L4); nur aktivierte Felder übernehmen (L10).
- **Organisatorisch:** Transferdateien nach der Übernahme auf allen Rechnern löschen; MP-Feuer-Datenbestand nach dem Parallelbetrieb nach Aufbewahrungsregeln löschen oder archivieren; Vertrag mit dem Anbieter von MP-Feuer zum Ende.

### L29 Aufbewahrung von Protokollen (empfohlen)

- **Heute:** Audit-Log 24 Monate (einstellbar), Historie unbegrenzt; Laufberichte des MP-Feuer-Moduls unbegrenzt.
- **Umsetzung:** Über den [Aufbewahrungsplan](aufbewahrung.md) (`core.history`, `core.audit`), dazu Leseprotokoll (L15) und Laufberichte (L28). Ausgewogen: Das Protokoll muss lang genug sein, um Missbrauch nachzuweisen, und kurz genug, um nicht selbst ein Datenbestand über das Verhalten der Benutzer zu werden.

## Step-up: zweiter Faktor bei sensiblen Daten

Mockup: `datenschutz/zwei-faktor.html` (Einrichten und Dialog `#d-stepup`), Dialog auch in `datenschutz/person.html#d-stepup`.

### Faktor

- **TOTP** (Authenticator-App, RFC 6238, 6 Ziffern, 30 Sekunden, ±1 Zeitschritt), Geheimnis mit `FORGA_SECRET_KEY` verschlüsselt (`core.user_mfa`, `hidden`, nie in Historie, Vollexport oder Antworten). Ein Code gilt nur einmal (letzter Zeitschritt gespeichert).
- **Zehn Wiederherstellungscodes**, je einmal gültig, nur als Hash gespeichert, nur bei der Einrichtung sichtbar; neu erzeugen im Profil (mit Step-up).
- **Einrichten** im Profil oder beim ersten Step-up, wenn noch kein Faktor besteht: aktuelles Passwort (bei OIDC-Benutzern entfällt es), QR-Code, Bestätigung mit einem Code. Die Einrichtung zählt als Step-up. Ohne `FORGA_SECRET_KEY` lässt sich kein Faktor einrichten (`auth.mfaNoSecretKey`); dann sind die Step-up-Bereiche gesperrt und die Einrichtungsliste der Startseite meldet das.
- **Zurücksetzen durch einen Administrator** (`DELETE /api/core/users/:id/mfa`, Recht `core.users.manage`, selbst mit Step-up, Grund Pflicht, nur für Benutzer ohne weitere Rechte als der eigene, `users.targetWider`): Faktor und Codes werden gelöscht, alle Sitzungen des Benutzers enden, er bekommt eine E-Mail. Audit `auth.mfa-reset`. Den eigenen Faktor setzt niemand über die Benutzerverwaltung zurück.
- Später zusätzlich WebAuthn (Passkeys) als zweiter Faktor.

### Was den Step-up auslöst

Berechtigungen bekommen im Manifest bzw. in `CORE_PERMISSIONS` das Kennzeichen `stepUp: true`. Jeder Endpunkt, der eine solche Berechtigung prüft, verlangt eine bestätigte Sitzung. Wo eine Seite auch ohne die sensiblen Teile nützlich ist, liefert der Server sie ohne diese Teile und kennzeichnet das (`sensitiveHidden`, `stepUpAvailable`); die Oberfläche zeigt „Sensible Daten anzeigen“.

| Bereich | Berechtigung mit `stepUp` | Verhalten ohne Bestätigung |
| --- | --- | --- |
| Atemschutz: Eignungsuntersuchungen (Ergebnis, Einschränkungen, Arzt), Liste „fällige Eignungsuntersuchungen“, Untersuchungen erfassen und importieren | `respiratory-protection.examinations` | Ampel und Fälligkeiten wie ohne das Recht (`redact`); Knopf „Untersuchungen anzeigen“ |
| Sensible Felder der Person (Geburtsdatum, Geburtsort, Arbeitgeber, Bank, Bemerkung, Austrittsgrund, Ruhezeiten), Listen „Komplettdaten“, „Geburtstage“, „Altersgrenzen“, Benutzer mit Person verknüpfen | `masterdata.persons.sensitive` | Personalakte wie ohne das Recht (`sensitiveHidden`); Knopf „Sensible Daten anzeigen“ |
| „Verletzt“/„getötet“ im Personal eines Berichts | `incidents.injuries.read` | Zahl ohne Namen („1 eigene Verletzte“) |
| Überweisungs- und SEPA-Datei, Abrechnungen mit Bankverbindung | `compensation.runs` (nur diese Ausgaben, Endpunkt-Kennzeichen `@StepUp()`) | Lauf und Posten lesbar, Download fragt nach |
| Datenschutz: Auskunft, Anfragen, Löschung, Einschränkung, Verzeichnis, Einstellungen Datenschutz | `core.privacy.manage` | ganze Seite |
| Benutzer, Rollen, API-Tokens, Einstellungen des Core, Module und Plugins | `core.users.manage`, `core.roles.manage`, `core.tokens.manage`, `core.settings.manage`, `core.modules.manage` | ganze Seite |
| Audit-Log und Leseprotokoll | `core.audit.read` | ganze Seite |
| Vollexport | `core.data.export` | Knopf fragt nach |
| Anmelden als (Impersonation) | `core.users.impersonate` | Start fragt nach |
| Datensicherung und Wiederherstellung | `backup.manage` | ganze Seite; die Wiederherstellung verlangt zusätzlich Passphrase und Namen wie im [Konzept](module/backup.md) |
| Aussonderung | `core.retention.manage` | ganze Seite |

Keinen Step-up brauchen: Einstellungen der Module (`<modul>.settings.manage`, z. B. Entschädigungssätze), Personalakte ohne sensible Felder, Einsatzberichte ohne Verletzte, Listen ohne sensible Daten, Einwilligungen erfassen (`core.privacy.consents`), **Mein Bereich** (eigene Daten einschließlich eigener Untersuchungen und Bankverbindung; die Anmeldung genügt, sonst bräuchte jedes Mitglied einen Faktor) und das **Infoterminal** (nie: es hat keine Sitzung eines Benutzers und liest keine sensiblen Daten).

Die Rollenseite zeigt an jeder Berechtigung mit `stepUp` das Kennzeichen „zweiter Faktor“, die Benutzerliste je Benutzer „Faktor eingerichtet“ bzw. „nötig, nicht eingerichtet“.

### Durchsetzung auf dem Server

- **Sitzung:** `core.session.elevated_until` (Zeitpunkt). `POST /api/core/step-up` (`{ code }` oder `{ recoveryCode }`, Sitzung mit CSRF-Header) setzt es auf jetzt + 30 Minuten. Die Frist verlängert sich nicht durch Aktivität; nach Ablauf fragt der nächste Zugriff erneut. Abmelden, Passwortwechsel, Zurücksetzen des Faktors und Ende der Sitzung beenden die Bestätigung. `POST /api/core/step-up/end` beendet sie vorzeitig („Bestätigung beenden“). `GET /api/core/session` liefert `elevatedUntil` und `mfa: { enrolled }`.
- **Guard:** `@RequirePermissions` prüft wie heute das Recht; trägt die Berechtigung `stepUp` (oder der Endpunkt `@StepUp()`) und ist `elevatedUntil` nicht in der Zukunft, antwortet der Server `403 auth.stepUpRequired` mit `{ enrolled: boolean }`. Felder mit `stepUp` (sensible Personenfelder, Untersuchungen, Verletzte) behandelt der Lesepfad wie fehlende Rechte, solange die Sitzung nicht bestätigt ist; der Schreibpfad lehnt mit `auth.stepUpRequired` ab, statt Felder still zu ignorieren.
- **Begrenzung:** 5 falsche Codes je Benutzer in 15 Minuten, danach 15 Minuten gesperrt (`429 auth.stepUpLocked`), Zähler in der Datenbank. Audit `auth.step-up` (Erfolg, Faktor oder Wiederherstellungscode), `auth.step-up-failed`, `auth.mfa-enrolled`, `auth.recovery-codes-renewed`, `auth.mfa-reset`.
- **Impersonation:** Die Impersonation-Sitzung ist nie bestätigt; Step-up während einer Impersonation prüft den Faktor des **Administrators** und gilt nur für diese Impersonation-Sitzung. Der Start der Impersonation selbst verlangt Step-up.
- **OIDC:** Die Anmeldung über den Anbieter bleibt ohne zweiten Faktor in f.orga. Meldet der Anbieter im ID-Token `amr` mit `mfa`, `otp` oder `hwk` und ist `auth_time` jünger als 30 Minuten, ist die Sitzung bis `auth_time` + 30 Minuten bestätigt. Danach gilt der Faktor in f.orga; alternativ „Beim Anbieter bestätigen“ (erneute Anmeldung mit `prompt=login` und `max_age=0`), wenn die Einstellung `oidc.stepUpViaProvider` an ist.
- **API-Tokens:** Ein Token kann keinen zweiten Faktor zeigen. Berechtigungen mit `stepUp` lassen sich keinem Token geben (`tokens.stepUpScope`), wie heute die `core.*`-Rechte. Ausnahme nur, wenn das Manifest die Berechtigung ausdrücklich mit `tokenAllowed: true` freigibt (heute keine). Vorhandene Tokens mit solchen Bereichen wirken nach dem Update für diese Bereiche nicht mehr; die Token-Seite zeigt den Bereich durchgestrichen mit Hinweis. Endpunkte mit Feldern unter `stepUp` liefern Tokens diese Felder nie.
- **Infoterminal:** Der `TerminalGuard` kennt keinen Step-up; Kiosk-Endpunkte dürfen keine Berechtigung mit `stepUp` prüfen (Startprüfung: Fehler beim Start, wenn ein Kiosk-Endpunkt ein solches Recht verlangt).

### Oberfläche

- Der API-Client im `web-sdk` fängt `auth.stepUpRequired` ab, zeigt den Dialog „Bitte bestätigen Sie mit Ihrem Code“ (Code-Feld mit `autocomplete="one-time-code"`, Link „Wiederherstellungscode verwenden“) und wiederholt danach die Anfrage. Ohne eingerichteten Faktor führt der Dialog zur Einrichtung. Abbrechen lässt die Seite ohne die sensiblen Teile.
- Solange die Sitzung bestätigt ist, zeigt die Kopfzeile eine Plakette „Bestätigt bis 10:42“ mit „Beenden“.
- Einstellung `security.stepUpMinutes` gibt es nicht: 30 Minuten sind fest. Die Seite „Sicherheit“ zeigt den Stand (Benutzer mit sensiblen Rechten und eingerichtetem Faktor).

## Einstellungen „Datenschutz“

Seite „Verwaltung → Datenschutz“ (neu, Recht `core.privacy.manage`; Mockup `datenschutz/einstellungen.html`) mit Reitern:

| Reiter | Inhalt |
| --- | --- |
| Kontakte | Verantwortlicher (Gemeinde, Anschrift, vertreten durch), Datenschutzbeauftragter (Name oder Stelle, Anschrift, E-Mail, Telefon), Aufsichtsbehörde (vorbelegt mit dem Namen der Behörde in Baden-Württemberg, Anschrift und Website einzutragen) |
| Texte | Textbausteine (de/en) für Deckblatt der Auskunft, Datenschutzhinweis, Antwortschreiben (Berichtigung, Löschung, Ablehnung, Fristverlängerung), Hinweis bei der ersten Anmeldung; je Baustein „Vorlage“ oder „geprüft am/von“ und Fassung |
| Einwilligungen | Katalog (L9) |
| Selbstauskunft | `selfServiceAccess`, Ansprechpartner in Mein Bereich |
| Sicherheit | Zwei-Faktor: Step-up bei sensiblen Daten (festgelegt, nur Anzeige des Stands), Leerlauf-Abmeldung, E-Mails ohne Namen, Stand HTTPS und Sicherung (nur Anzeige) |
| Aufbewahrung | wie im [Aufbewahrungsplan](aufbewahrung.md) |

Abschnitte in `core.setting`: `privacy` (erweitert), `privacy.contacts`, `privacy.texts`, `privacy.consents`, `privacy.activities`, `security`. Alle historisiert; nur Verwalter lesen sie, der Datenschutzhinweis ist öffentlich.

## Rechte und Rollen

| Recht | Bereich | Zweck | Vorlage |
| --- | --- | --- | --- |
| `core.privacy.manage` | Gesamtwehr | Anfragen, Auskünfte, Löschung, Einschränkung, Einwilligungen erfassen, Einstellungen Datenschutz, Verzeichnis | `administrator`, auf Wunsch `administration` |
| `core.privacy.consents` | Abteilung | Einwilligungen von Personen der Abteilung erfassen und widerrufen | `commander`, `department-commander` |
| `incidents.injuries.read` | Abteilung | Verletzte und Getötete im Personal sehen | `commander` |
| `masterdata.lists.contact` | Abteilung | Listen mit Kontaktdaten ausgeben | `commander`, `department-commander` |

`core.privacy.manage` gilt als privilegiert (`isPrivileged`) und trägt `stepUp` (siehe [Step-up](#step-up-zweiter-faktor-bei-sensiblen-daten)); ebenso `incidents.injuries.read`.

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
| 1 – vor dem Echtbetrieb | HTTPS mit Caddy und Sicherheitsheader; `FORGA_STAGE` mit Band im Testsystem und `.gitignore`; Zweiter Faktor als Step-up bei sensiblen Daten; E-Mails ohne Gesundheitsbezug; Verletzte nur mit Recht | L1, L2, L5 (Teil), L6, L18 |
| 2 – Rechte der Betroffenen | Datenschutzhinweis und erste Anmeldung; Anfragen mit Frist; Auskunft als PDF mit `describePerson` in allen Modulen; Einschränkung | L3, L4, L7 (Anfragen, Einschränkung), L19 |
| 3 – Nachweise | Verzeichnis aus den Manifesten mit technischen Maßnahmen; Einwilligungen; Berichtigung in Mein Bereich; Leseprotokoll; Impersonation sichtbar | L8, L9, L12, L15, L20 |
| 4 – Löschen und Minimieren | Löschprüfung je Modul; vollständige Anonymisierung mit Startprüfung; Daten Dritter; abschaltbare Felder; Zweck der Listen; Aufbewahrungsplan | L7 (Löschung), L10, L11, L13, L14, L29 |
| 5 – Härtung | Sitzungen, Benutzer ohne Person, Infoterminal, API-Tokens, Passwörter, Anhänge, MP-Feuer-Laufberichte, Betriebsanleitung | L16, L17, L21–L28 |

Phase 1 ist klein und senkt das größte Risiko; Phase 2 erfüllt die Pflichten, die jedes Mitglied direkt einfordern kann. Die Mockups in `mockups/datenschutz/` sind freigegeben.
