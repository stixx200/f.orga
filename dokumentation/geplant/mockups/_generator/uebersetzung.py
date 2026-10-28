"""Englische Texte für den Sprachumschalter der Mockups.

Format je Zeile: `Deutsch => English`. Zeilen ohne `=>` sind Daten, die in beiden Sprachen gleich bleiben
(Namen, Orte, Fahrzeuge, Stichworte der Leitstelle, Kataloge wie Dienstgrade, Funktionen und Lehrgänge,
technische Kennungen). bauen.py meldet jeden sichtbaren Text, der hier fehlt.

MUSTER: reguläre Ausdrücke für wiederkehrende Formen. Im Ersatz steht $1 für die unveränderte Gruppe,
%1 für die übersetzte Gruppe.
"""

MUSTER = [
    (r'(\d+) Hauptberichte', '$1 primary reports'),
    (r'(\d+) Einsätze', '$1 incidents'),
    (r'(\d+) Tage', '$1 days'),
    (r'in (\d+) Tagen', 'in $1 days'),
    (r'(\d+) Jahre', '$1 years'),
    (r'(\d+) Jahren', '$1 years'),
    (r'(\d+) Personen', '$1 people'),
    (r'(\d+) Mitglieder', '$1 members'),
    (r'(\d+) Berichte', '$1 reports'),
    (r'(\d+) Benutzer', '$1 users'),
    (r'(\d+) von (\d+) Plätzen', '$1 of $2 seats'),
    (r'(\d+) Personen · ([\d,]+ €)', '$1 people · $2'),
    (r'Alarm (\d\d\.\d\d\.)', 'Alarm $1'),
    (r'Feld für (.+)', 'Field for $1'),
    (r'Stufe: (.+)', 'Level: %1'),
    (r'Status ([^,]+, [^,]+)', 'Status $1'),
    (r'Person zu (.+) hinzufügen', 'Add person to %1'),
    (r'Abt\.-Kdt\. (.+) · (\d+) Mitglieder', 'Dept. cmdr. $1 · $2 members'),
    (r'Leitung (.+) · (\d+) Mitglieder', 'Led by $1 · $2 members'),
    (r'(Ahornfeld|Birkenhain|Musterstadt|Pappelhain) · Truppführer seit (\d{4})', '$1 · Truppführer since $2'),
    (r'(.+) · (\d+) Berichte', '$1 · $2 reports'),
    (r'(Florian Musterstadt \d/\d+) · (\d\d:\d\d–\d\d:\d\d)', '$1 · $2'),
    (r'(Gerätehaus \w+|Feuerwehrhaus Musterstadt) · pauschal 1 h', '$1 · flat 1 h'),
    (r'(.+) Tobias Rief · 2 Berichte', '$1 Tobias Rief · 2 reports'),
    (r'Infoterminal (\d\d:\d\d)', 'Info terminal $1'),
    # MP-Feuer-Brücke
    (r'([\d ]+) neu', '$1 new'),
    (r'([\d ]+) geändert', '$1 changed'),
    (r'([\d ]+) unverändert', '$1 unchanged'),
    (r'(\d+) Fehler', '$1 errors'),
    (r'(\d+) offene Bezeichnungen', '$1 open names'),
    (r'(\d+) Archive', '$1 archives'),
    (r'([\d ]+) neu · ([\d ]+) geändert · (\d+) Fehler', '$1 new · $2 changed · $3 errors'),
    (r'(\d+) Personen · (\d+) Einsätze · (\d+) Dienste', '$1 people · $2 incidents · $3 services'),
    (r'(\d+) Personen · (\d+) Dienste', '$1 people · $2 services'),
    (r'Eintrag für (.+)', 'Entry for $1'),
    (r'([\d ]+) Zeilen in 1 Teil · (\d+) s', '$1 rows in 1 part · $2 s'),
    (r'Teil (\d) von (\d) · ([\d ]+) von ([\d ]+) Zeilen · noch etwa (\d+) s', 'Part $1 of $2 · $3 of $4 rows · about $5 s left'),
    (r'(\d) (Personen|Lehrgänge, Dienstgrade, Ehrungen|G26-Untersuchungen|Belastungsübungen|Dienste|Einsatzpersonal)', '$1 %2'),
    (r'Archiv (\d+), Zeilen? ([\d ,]+?)( ·)?', 'Archive $1, row(s) $2$3'),
    (r'Schritt (\d) von 5: (.+)', 'Step $1 of 5: %2'),
    (r'Verbindung zu (.+)', 'Connection to %1'),
]

TEXTE = r'''
· 01.02.2026 20:03 · angelegt => · 01.02.2026 20:03 · created
· 03.06.2026 09:15 · Lehrgangsvormerkung angelegt => · 03.06.2026 09:15 · course nomination created
· 12.10.2026 18:42 · geändert => · 12.10.2026 18:42 · changed
‹ Beteiligte & Sonstiges => ‹ Parties & other
– bitte wählen – => – please choose –
– erst zuweisen => – assign first
– ignorieren – => – ignore –
‹ Lage & Verlauf => ‹ Situation & course
‹ Personal & Fahrzeuge => ‹ Personnel & vehicles
‹ Statistik => ‹ Statistics
– Status aktiv => – status active
‹ Zeiten & Ort => ‹ Times & location
‹ Zurück => ‹ Back
, 1 Warnung => , 1 warning
, gesperrt von Markus Vogt am 19.10.2026 08:14. => , locked by Markus Vogt on 19.10.2026 08:14.
. Die Statistikmerkmale des Einsatzes stehen im Hauptbericht der Abteilung Weidenhain. Hier ist nichts auszufüllen. => . The statistics of this incident are in the primary report of the Weidenhain department. Nothing to fill in here.
(Kommandant). Danach können Sie ihn nur noch ändern, wenn er an Sie zurückgegeben wird. => (chief). After that you can only change it if it is returned to you.
(Personalnummer nicht vorhanden). => (no staff number in the file).
+ Abteilung anlegen => + New department
+ Benutzer anlegen => + New user
+ Bereitschaft => + Standby
+ Bericht anlegen => + Create report
+ Beteiligter => + Party
+ Datei oder Foto => + File or photo
+ Ehrung eintragen => + Add honor
+ Einsatz anlegen => + New incident
+ Fahrzeug => + Vehicle
+ Fahrzeug anlegen => + New vehicle
+ Gast => + Guest
+ Organisation => + Organization
+ Pauschale EL => + IC allowance
+ Person anlegen => + New person
+ Person hinzufügen => + Add person
+ Qualifikation eintragen => + Add qualification
+ Rolle anlegen => + New role
+ Rolle zuweisen => + Assign role
+ Satz => + Rate
+ Stichwort => + Keyword
+ Teilnahme eintragen => + Add attendance
+ Unterabteilung => + Sub-department
+ Wache => + Station
01.06.2008 (18 Jahre) => 01.06.2008 (18 years)
1 aus Berichten + 1 Dienstunfall bei Übung (Begründung: Unfallmeldung 14.05.) => 1 from reports + 1 duty accident during training (reason: accident report 14.05.)
1 Einsatz ohne Hauptbericht (B1 Brand Container, 12.10.). Er zählt sonst nicht. => 1 incident without primary report (B1 Brand Container, 12.10.). Otherwise it is not counted.
1 Fehler => 1 error
1 Fehler · 1 Warnung => 1 error · 1 warning
1 Menschenrettung · Verkehrsunfall => 1 Rescue of persons · Traffic accident
1 Spalte ist noch nicht zugeordnet. Nicht zugeordnete Spalten werden ignoriert. => 1 column is not mapped yet. Unmapped columns are ignored.
1 Stunde => 1 hour
1 Warnung begründet => 1 warning justified
1, begründet => 1, justified
11 von 212 Personen => 11 of 212 people
12 × 3 h Einsatz · 3 × 1 h Bereitschaft · 1 × Arbeitszeit (keine Entschädigung) · 1 × offen wegen Doppelung. Ausgezahlt wird nach Freigabe. => 12 × 3 h incident · 3 × 1 h standby · 1 × working hours (no compensation) · 1 × open due to duplicate. Paid out after release.
12 Monate nach Satzung. Abweichung nur mit Begründung. => 12 months under the bylaws. Deviations need a reason.
12,50 € (pauschal 1 h) => 12,50 € (flat 1 h)
143 Einsätze · jeder zählt einmal über seinen Hauptbericht => 143 incidents · each counts once via its primary report
15,00 € (pauschal 1 h) => 15,00 € (flat 1 h)
17 (14 Einsatz, 3 Bereitschaft) => 17 (14 incident, 3 standby)
19 Jahre · einsatzfähig ab 18 => 19 years · operational from 18
2 E-Mails senden => Send 2 emails
2 offen => 2 open
2 Personen vormerken => Nominate 2 people
2 Prüfungen offen => 2 checks open
2025 · abgegeben => 2025 · submitted
2026 (vorläufig) => 2026 (provisional)
2–3 C-Rohre => 2–3 C hoses
23 Einsätze · 61 Stunden · 915,00 € => 23 incidents · 61 hours · 915,00 €
29 (ohne Doppelungen) => 29 (without duplicates)
3 h 15 min
3 Ölspur => 3 Oil spill
3 Vormerkungen · Meldeschluss 03.12. => 3 nominations · deadline 03.12.
3 weitere in den nächsten 60 Tagen => 3 more in the next 60 days
30 Tage vor Ende der Probezeit erinnert f.orga den Abteilungskommandanten an die endgültige Aufnahme. Fehlt dann noch Truppmann Teil 1, gibt es 60 Tage vorher einen Hinweis. => 30 days before probation ends, f.orga reminds the department commander about final admission. If Truppmann Teil 1 is still missing, a notice comes 60 days before.
6 × Einsatz · 2 × Bereitschaft · 1 × Pauschale Einsatzleiter (10,00 €). Ausgezahlt wird nach Freigabe. => 6 × incident · 2 × standby · 1 × incident commander allowance (10,00 €). Paid out after release.
7 von 143 Einsätzen 2026 · Der Hauptbericht ist dunkelrot, Nebenberichte hellrot. => 7 of 143 incidents in 2026 · The primary report is dark red, secondary reports light red.
a.mayer
ab 01.01.2027 => from 01.01.2027
Abbrechen => Cancel
abgelaufen => expired
abgelehnt => declined
Abmelden => Sign out
Abschließen und exportieren => Finalize and export
Abschluss ab 01.01.2027 möglich · => Can be finalized from 01.01.2027 ·
Abschnitte des Berichts => Report sections
Absender => Sender
Abt. => Dept.
Abt. Musterstadt
Abt. Pappelhain
Abt. Weidenhain
Abteilung => Department
Abteilung „Abt. Musterstadtt“ unbekannt – ähnlich: Abt. Musterstadt => Department “Abt. Musterstadtt” unknown – similar: Abt. Musterstadt
Abteilung Ahornfeld
Abteilung Birkenhain
Abteilung Eschenbrunn
Abteilung Musterstadt
Abteilung Pappelhain
Abteilung Weidenhain
Abteilungen => Departments
Abteilungskommandant => Department commander
Abteilungskommandantin (Weidenhain) => Department commander (Weidenhain)
Administrator
AGT
Ähnliche Person vorhanden: => Similar person exists:
aktiv => active
Aktiv => Active
Aktive => Active
Aktive (212) => Active (212)
Alarm
Alarm 20.10. 07:41 · Lage und Verlauf fehlen => Alarm 20.10. 07:41 · situation and course missing
Alarm 21.10. 13:05 · 1 Fehler: Personaldoppelung => Alarm 21.10. 13:05 · 1 error: duplicate person
Alarmfax-Parser Leitstelle => Dispatch alarm fax parser
Alarmfax.pdf
Alarmiert durch => Alerted by
Alarmierung (von) => Alerted (from)
Alarmierung bis Einsatzbereitschaft => Alert until ready for service
Alarmierung bis Einsatzende => Alert until end of incident
Alle => All
Alle Abteilungen => All departments
alle Aktiven => all active members
Alle Änderungen => All changes
Alle Daten eines Moduls als JSON. Die IDs bleiben erhalten, damit ist ein Umzug oder eine Auswertung außerhalb möglich. => All data of a module as JSON. IDs are kept, so you can migrate or analyse the data elsewhere.
Alle Einsätze => All incidents
Alle Felder => All fields
Alle Felder je Person, Filter nach Abteilung und Status. => All fields per person, filtered by department and status.
Alle Rollen => All roles
Alles ankreuzen, was zutrifft. Es zählt die kleinste Nummer. => Tick everything that applies. The lowest number counts.
Alter => Veterans
Altersabteilung => Veterans department
Altersabteilung (61) => Veterans (61)
Altersabteilung Musterstadt
Altersgrenze => Age limit
Altersgrenzen => Age limits
am 19.10.2026 08:14. => on 19.10.2026 08:14.
Änderungen filtern => Filter changes
Andreas Schmid
Angaben der Feuerwehr => Fire brigade details
Angelegt über API (Alarmfax-Parser Leitstelle) am 21.10.2026 13:06 · Berichtsentwürfe automatisch für die alarmierten Abteilungen erstellt. => Created via API (dispatch alarm fax parser) on 21.10.2026 13:06 · draft reports created automatically for the alerted departments.
angemeldet => registered
Angemeldet => Registered
Angemeldet bleiben (30 Tage) => Stay signed in (30 days)
Angriffstrupp
Anhänge => Attachments
Anja Mayer
Anmelden => Sign in
Anmeldung => Sign in
Anpassen => Customize
Anrede => Salutation
Anschrift => Address
Ansprechpartner => Contact person
Anwendung => Applies to
Anzahl je Abteilung, Typ, Altersgruppe, Geschlecht – Grundlage der Jahresstatistik. => Count per department, type, age group, gender – basis of the annual statistics.
API-Tokens => API tokens
API: incidents.api.create
Arbeitgeber => Employer
Arbeitszeit => Working hours
Arbeitszeit beim Dienstherrn: keine Entschädigung => Working hours for the public employer: no compensation
Arbeitszeit und Verdienstausfall zugleich => Working hours and loss of earnings together
Art => Type
Art der Technischen Hilfe => Type of technical assistance
AS
AT
Atemschutz => Breathing apparatus
Atemschutz ohne Qualifikation / Untersuchung => Breathing apparatus without qualification / medical
Atemschutz tauglich bis 22.11.2026 => BA fit until 22.11.2026
Atemschutzgeräteträger
Atemschutzgerätewart => BA technician
Atemschutzgerätewart (Gesamtwehr) => BA technician (whole brigade)
Audit-Log aufbewahren => Keep audit log
auf 31.03.2009 => to 31.03.2009
auf eigenen Wunsch => at own request
Aufbewahrung und Löschung => Retention and deletion
Aufgaben => Tasks
Aufgaben (5) => Tasks (5)
Aufnahme => Admission
Aufnahme auf Probe => Admitted on probation
Aufnahme auf Probe am => Admitted on probation on
Aufnahme und Status => Admission and status
aus => off
Aus allen Berichten des Einsatzes => From all reports of the incident
Aus Bericht entfernen => Remove from report
Aus dem Personal aller Berichte dieses Einsatzes. Eintragen bei der Person im Abschnitt Personal. => From the personnel of all reports of this incident. Record it on the person in the Personnel section.
aus Personal.xlsx übernommen => imported from Personal.xlsx
Ausgeblendet. Für diese Angaben fehlt Ihnen das Recht „Sensible Felder“. => Hidden. You lack the “Sensitive fields” permission for these details.
Ausgeschieden => Left
Ausgeschiedene Mitglieder anonymisieren nach => Anonymize former members after
ausgesondert => decommissioned
Ausrücken => Departure
Ausschluss => Expulsion
außer Dienst => out of service
Außer Dienst seit => Out of service since
außerhalb der Gemeinde => outside the municipality
Austritt erfassen => Record leaving
Austritt erfassen … => Record leaving …
Austritt speichern => Save leaving
Austrittsdatum => Leaving date
Auswertungen => Reports
Auszahlungsläufe, Abrechnung je Person als PDF, Export für die Kämmerei. => Payout runs, statement per person as PDF, export for the treasury.
automatisch => automatic
Automatisch gespeichert 13:42 · => Saved automatically 13:42 ·
Automatisch gespeichert 14:05 · keine Fehler => Saved automatically 14:05 · no errors
B, BE, C, CE
B1 Brand Container
B2 Brand Wohnung
B2 Brand Wohnung · 2026-104711
B2 Brand Wohnung · Führungsgruppe
Ahornfeld
Ahornfeld, Kirchweg
Ahornfeld, ohne Verfasser => Ahornfeld, no author
Bankverbindung => Bank account
Bauer, Michael
Baujahr => Year built
Bearbeiten => Edit
Beförderungen => Promotions
Begründen … => Justify …
Begründung => Reason
Begründung für Abweichung => Reason for deviation
Begründung speichern => Save reason
Begründung: vorher 4 Jahre Jugendfeuerwehr · Beschluss Feuerwehrausschuss 18.03.2009 => Reason: 4 years in the youth fire brigade before · committee decision 18.03.2009
Beispiel: bereits gesperrter Bericht => Example: report already locked
Beispiel: leere Liste => Example: empty list
Beispielwert => Sample value
Belüftung => Ventilation
Belüftung, Brandwache, Übergabe an Polizei, Ölspur abgestreut … => Ventilation, fire watch, handover to police, oil spill absorbed …
Bemerkung => Note
Benötigt: Stammdaten => Requires: Master data
Benötigt: Stammdaten · nutzt optional: Geräte => Requires: Master data · optionally uses: Equipment
Benötigt: Stammdaten, Dienste => Requires: Master data, Services
Benutzer => Users
Benutzer sperren => Lock user
Benutzer und Rollenzuweisung => Users and role assignment
Benutzername => User name
Berechnen => Calculate
Berechnung => Calculation
Berechtigungen · Einsatzberichte => Permissions · Incident reports
Berechtigungen · Stammdaten => Permissions · Master data
Bereich => Scope
Bereiche => Scopes
Bereiche der Personenakte => Sections of the personnel file
Bereitschaft => Standby
Bereitschaft auf Wache => Standby at station
Bereitschaft Feuerwehrhaus Musterstadt => Standby Feuerwehrhaus Musterstadt
Bereitschaft Wache Musterstadt => Standby station Musterstadt
Bericht Abteilung Musterstadt => Report Musterstadt department
Bericht Abteilung Weidenhain => Report Weidenhain department
Bericht danach wieder auf => Set report back to
Bericht Musterstadt => Report Musterstadt
Bericht fertig melden? => Submit report?
Bericht freigeben? => Release report?
Bericht für weitere Abteilung => Report for another department
Bericht leer (Lage/Verlauf) => Report empty (situation/course)
Bericht öffnen => Open report
Bericht vollständig lesen und bearbeiten › => Read and edit full report ›
Berichte => Reports
Berichte (Haupt / Neben) => Reports (primary / secondary)
Berichte mit Fehler lassen sich erst freigeben, wenn der Fehler behoben ist. Beim Container-Brand fehlt ein Hauptbericht: einen der beiden Berichte zum Hauptbericht machen. => Reports with errors can only be released once the error is fixed. The container fire has no primary report: make one of the two reports the primary report.
Berichte prüfen (4) => Review reports (4)
Berichtseditor (Hauptbericht) => Report editor (primary report)
Berichtseditor (Nebenbericht) => Report editor (secondary report)
Besatzung überschritten => Crew exceeds seats
Besatzung wie letzter Einsatz => Crew as last incident
Besatzungsplätze => Seats
Beschäftigung => Employment
Beschluss Feuerwehrausschuss 18.03.2009 => Committee decision 18.03.2009
Beschluss vom => Decision of
Beschreibung => Description
bestanden => passed
Bestehende Person öffnen => Open existing person
Beteiligte => Parties involved
Beteiligte & Sonstiges => Parties & other
Beteiligtenrollen => Party roles
Betrag => Amount
Betroffene Person zusätzlich erinnern (wenn E-Mail hinterlegt) => Also remind the person concerned (if an email is on file)
Bezeichnung => Name
Bild ersetzen => Replace image
bis => until
bis 14:50 => until 14:50
Bitte eine Begründung eingeben. Sie steht in der Historie. => Please enter a reason. It is shown in the history.
bitte prüfen => please check
bitte zuweisen => please assign
BMA
BMA Brandmeldeanlage
BMA Brandmeldeanlage · Musterstadt
BMA Brandmeldeanlage · Musterstadt – freigegeben zur Entschädigungsauszahlung und gesperrt von => BMA Brandmeldeanlage · Musterstadt – released for compensation payout and locked by
böswillig => malicious
Brand => Fire
Brand · Mittelbrand · eigene Gemeinde · 1 gerettete Person => Fire · medium fire · own municipality · 1 person rescued
Brand / Explosion => Fire / explosion
Brand Gebäude groß
Brand klein
Brand Wohnung
Brände F28 = F29 + F30 + F31 + F32 · Technische Hilfe F37 = F38 … F45 · Fehlalarme F51 = F52 + F53 + F54 · kein „davon“ größer als seine Summe => Fires F28 = F29 + F30 + F31 + F32 · Technical assistance F37 = F38 … F45 · False alarms F51 = F52 + F53 + F54 · no “of which” larger than its total
Brände in der eigenen Gemeinde => Fires in own municipality
Brände Überlandhilfe => Fires, mutual aid
Brandgröße => Fire size
Brandmeldeanlage => Fire alarm system
Brandsicherheitsdienst
Brandwache => Fire watch
Brenner, Lena
Briefkopf für PDFs => Letterhead for PDFs
BSW
BSW-2026-014
Daniel Moser
Das Frontend einer App wird erst umgesetzt, wenn ihre Mockups freigegeben sind. Die Seiten zeigen Aufbau, Abläufe und Inhalte, keine Funktion. Alle Daten sind erfunden. => An app's frontend is only built once its mockups are approved. The pages show structure, flows and content, not function. All data is made up.
Das Stichwort füllt im Hauptbericht Einsatzhauptart und Unterkategorie vor. Die Brandgröße wählt der Verfasser. => The keyword prefills main type and subcategory in the primary report. The author chooses the fire size.
Datei => File
Datenblatt PDF => Data sheet PDF
Datenschutz => Data protection
Datum => Date
Dauer => Duration
Dauer über 24 Stunden => Duration over 24 hours
Dauer unter Atemschutz (Minuten) => Time under breathing apparatus (minutes)
davon 2 älter als 14 Tage => 2 of them older than 14 days
davon Brandmeldeanlage => of which fire alarm system
davon Großbrand => of which large fire
davon Kleinbrand A => of which small fire A
davon Kleinbrand B => of which small fire B
davon mit Rauchgasvergiftung => of which with smoke inhalation
davon Mittelbrand => of which medium fire
davon Ölspur => of which oil spill
DE
DE12 6305 0000 0001 2345 67
DE44 6305 0000 0009 8765 43
Deaktivieren => Deactivate
Birkenhain
Der Bereich (Gesamtwehr oder Abteilung) wird bei der Zuweisung an einen Benutzer gewählt. => The scope (whole brigade or department) is chosen when assigning the role to a user.
Der Bericht der => The report of the
Der Bericht geht als Entwurf zurück an => The report goes back as a draft to
Freigabe zur => Release for
für den Bericht => for the report
Der Bericht geht zur Prüfung an => The report goes for review to
Der Bericht ist bereits im Auszahlungslauf 10/2026. Änderungen am Personal erzeugen Korrekturposten. => The report is already in payout run 10/2026. Changes to personnel create correction entries.
Der Bericht wird gesperrt und kommt in den nächsten Auszahlungslauf. Tobias Rief bekommt eine Benachrichtigung. Rückgängig nur über „Sperre aufheben“. => The report is locked and goes into the next payout run. Tobias Rief is notified. Can only be undone with “Unlock”.
Der Kommandant sieht die Begründung bei der Prüfung. => The chief sees the reason during review.
Deutsch
Die Atemschutztauglichkeit (Untersuchung, Belastungsübung, Einsatz) kommt später aus dem Modul Atemschutz. => BA fitness (medical, endurance exercise, deployment) will later come from the Breathing apparatus module.
Die Seiten sind auf Handybreite (375 px) geprüft. Zum Ansehen das Browserfenster schmal ziehen oder die Entwicklerwerkzeuge im Gerätemodus nutzen. Der Schalter DE/EN oben stellt die Sprache um. => The pages are checked at phone width (375 px). To view, narrow the browser window or use the developer tools in device mode. The DE/EN switch at the top changes the language.
Die Statistikmerkmale gehen auf den neuen Hauptbericht über. Der Verfasser Tobias Rief muss sie prüfen. Sabine Hagel bekommt eine Benachrichtigung. => The statistics move to the new primary report. Its author Tobias Rief must check them. Sabine Hagel is notified.
Die Zuordnung wurde aus den Überschriften vorgeschlagen. Schlüssel für wiederholte Importe: => The mapping was suggested from the headings. Key for repeated imports:
Dienstgrad => Rank
Dienstjahre 10/15/25/40/50 im gewählten Jahr. => 10/15/25/40/50 years of service in the chosen year.
Dies ist ein => This is a
Dieser Reiter kommt aus dem Modul Einsatzberichte. => This tab comes from the Incident reports module.
DIVERA 24/7 Webhook
divera-api
divers => diverse
DLA(K)
DLA(K) 23-12
DLA(K) 23-12 · Florian Musterstadt 1/33
Eschenbrunn
Eschenbrunn, Flussufer
doppelt in Zeile 12 => duplicate of row 12
doppelt: auch FüGr => duplicate: also FüGr
E-Mail => Email
Ebene => Level
Eberle, Stefan
ehrenamtlich => volunteer
Ehrung => Honor
Ehrungen => Honors
Eigene Einsatzkräfte => Own personnel
Eigene Einsatzkräfte in diesem Bericht => Own personnel in this report
Eigene Gemeinde => Own municipality
Eigene Gemeinde (für Überlandhilfe) => Own municipality (for mutual aid)
eigene Person => own person
Eigentümer => Owner
Eignungsuntersuchung Atemschutz => BA medical examination
Eignungsuntersuchung Atemschutz seit 02.10.2026 abgelaufen. => BA medical examination expired since 02.10.2026.
Eignungsuntersuchung, Belastungsübung, Einsatznachweis, Tauglichkeitsampel. => Medical examination, endurance exercise, deployment record, fitness traffic light.
Ein deaktiviertes Modul verschwindet aus Menü und Schnittstellen. Seine Daten bleiben erhalten. => A deactivated module disappears from menu and APIs. Its data is kept.
Ein Klick auf die Herkunft zeigt die gezählten Einsätze. Korrigierte Werte sind markiert und haben eine Begründung. => Click a source to see the counted incidents. Corrected values are marked and have a reason.
Eine Frist ist erledigt, sobald der neue Nachweis eingetragen ist. Sammel-E-Mail jeden Montag. => A deadline is done as soon as the new record is entered. Digest email every Monday.
Eingereicht => Submitted
Einsatz => Incident
Einsatz drucken => Print incident
Einsatz mit Berichten => Incident with reports
Einsatz mit Berichten und Statistik => Incident with reports and statistics
Einsatz während Arbeitszeit beim Dienstherrn => Incident during working hours for the public employer
Einsatz zählt nicht => incident not counted
Einsatzabteilung => Operational department
Einsatzart => Incident type
Einsatzbereit (bis) => Ready for service (until)
Einsatzberichte => Incident reports
Einsatzberichte exportieren => Export incident reports
Einsatzberichte lesen => Read incident reports
Einsatzberichte schreiben => Write incident reports
Einsätze => Incidents
Einsätze (Auszug) => Incidents (extract)
Einsätze 2026 => Incidents 2026
Einsätze außerhalb zählen als Überlandhilfe. => Incidents outside count as mutual aid.
Einsätze und Berichte je Abteilung, Freigabe, Statistik, Entschädigungsberechnung, API. => Incidents and reports per department, release, statistics, compensation, API.
Einsätze und Berichtsentwürfe anlegen => Create incidents and draft reports
Einsatzende => End of incident
Einsatzhauptart => Main incident type
Einsatzkräfte => Personnel
Einsatzleiter => Incident commander
Einsatzleiter, Gruppenführer, Maschinist, Melder, Angriffstrupp, Wassertrupp, Schlauchtrupp, Führungsassistent …
Einsatzliste => Incident list
Einsatzort => Location
Einsatzort und Alarmierung => Location and alert
Einstellungen => Settings
Einstellungen Einsatzberichte => Incident report settings
Einstellungen verwalten => Manage settings
Eintrag => Entry
Eintreffen => Arrival
Einwohnerzahl => Population
EL
ELW 1
ELW 1 · Florian Musterstadt 1/11
ELW 1 (mit Musterstadt) => ELW 1 (with Musterstadt)
Empfänger => Recipients
EN
Ende vor Beginn => End before start
Endgültig aufgenommen => Finally admitted
Energieversorger (EnBW ODR) => Utility (EnBW ODR)
English
Entfernen => Remove
Entschädigung => Compensation
Entschädigung: 3 angefangene Stunden × 15,00 € (Einsatz, gültig ab 01.07.2025) = => Compensation: 3 started hours × 15,00 € (incident, valid from 01.07.2025) =
Entschädigungen => Compensation
Entschädigungsauszahlung => compensation payout
Entwurf => Draft
Entwurf oder zurückgegeben => draft or returned
Musterstadt
Musterstadt · AGT · Maschinistin
Musterstadt · B2 Brand Wohnung
Musterstadt · steht bereits im Bericht Weidenhain (13:05–16:20) => Musterstadt · already in the Weidenhain report (13:05–16:20)
Musterstadt 1/11
Musterstadt 1/33
Musterstadt 1/42
Musterstadt 1/44
Musterstadt 2/43
Musterstadt 4/47
Musterstadt zum Hauptbericht machen => Make Musterstadt the primary report
Musterstadt, B 311
Musterstadt, Festhalle
Musterstadt, Gewerbegebiet Nord
Erfüllen die Voraussetzung, sind nicht vorgemerkt. Auswählen und gemeinsam vormerken. => Meet the prerequisite but are not nominated. Select and nominate them together.
erfüllt => met
Ergebnis => Result
Erik Sauter
Erika Muster
Erinnerung senden? => Send reminder?
Erinnerungen => Reminders
Erscheinen in Kopf- und Fußzeile der Oberfläche und aller PDFs. => Shown in the header and footer of the app and all PDFs.
Erscheint nur, wenn eine Gemeinde-Anmeldung (OIDC) eingerichtet ist. => Only shown if a municipal sign-in (OIDC) is set up.
Pappelhain
Pappelhain, K 7370
Es wird nur jetzt angezeigt. Bitte sicher im Fremdsystem hinterlegen. => It is shown only now. Store it safely in the external system.
Eva Roth
Excel
f.orga
f.orga · Mockups Release 1
F66 · LF 20 / LF 20 KatS
FA
Fahrzeug => Vehicle
Fahrzeug / Funktion => Vehicle / function
Fahrzeug fehlt => Vehicle missing
Fahrzeug fehlt bei 2 Personen => Vehicle missing for 2 people
Fahrzeugbrand => Vehicle fire
Fahrzeugdaten => Vehicle data
Fahrzeuge => Vehicles
Fahrzeuge der Gesamtwehr => Vehicles of the brigade
Fahrzeuge je Abteilung und Wache mit Funkrufnamen. => Vehicles per department and station with radio call signs.
Fahrzeuge: => Vehicles:
Fahrzeugliste => Vehicle list
Fahrzeugpflicht => Vehicle required
Fahrzeugtyp => Vehicle type
fällig in 13 Tagen => due in 13 days
falls abweichend => if different
Fax
Fehlalarm => False alarm
Fehlalarme => False alarms
Fehler => Error
Fehler · Personal: => Error · Personnel:
Fehler verhindern das Fertigmelden. Warnungen brauchen eine Begründung. => Errors prevent submitting. Warnings need a reason.
Fehler: => Error:
Fehler: kein Hauptbericht => Error: no primary report
fehlt: Truppführer => missing: Truppführer
Feld in f.orga => Field in f.orga
Felix Ott
Fertig melden => Submit
Fertig melden geht, sobald kein Fehler mehr offen ist. Warnungen brauchen eine Begründung. => You can submit once no error is open. Warnings need a reason.
Feuerwehr => Fire brigade
Feuerwehr-Ehrenzeichen Silber (15 Jahre)
Feuerwehrfrau
Feuerwehrhaus Musterstadt
Feuerwehrhaus Musterstadt · ständig besetzt: nein => Feuerwehrhaus Musterstadt · permanently staffed: no
Feuerwehrhaus Musterstadt, Feuerwehrstraße 1
Feuerwehrmann
Feuerwehrmann (Probezeit) => Feuerwehrmann (probation)
Firma => Company
Fischer, Jana
Fischer, Thomas
Foto_1.jpg
Frage => Question
Frau => Ms
frei wählen => custom
Freigabe Abrechnung => Released for billing
Freigabe Entschädigung => Released for compensation
Freigeben und sperren => Release and lock
Freigeben zur Abrechnung => Release for billing
Freigeben zur Entschädigungsauszahlung => Release for compensation payout
Freigegeben => Released
Freitag, 23. Oktober 2026 · Sie sehen Daten der Gesamtwehr. => Friday, 23 October 2026 · You see data of the whole brigade.
Freitext, solange das Modul Geräte nicht aktiv ist => Free text while the Equipment module is not active
Freiwillige Feuerwehr Musterstadt
Freiwillige Feuerwehr Musterstadt · Feuerwehrstraße 1 · 12345 Musterstadt
Fristen überfällig => Deadlines overdue
Fristen und Aufgaben => Deadlines and tasks
FU
FüGr
Führerschein => Driving licence
Führerschein C => Driving licence C
Führerscheinkontrolle => Driving licence check
Führungseinheit => Command unit
Führungsgruppe Musterstadt
Funkrufname => Radio call sign
Funktion => Function
Funktionen => Functions
Für die Jahresstatistik (CSV) und später die Obergrenzen der Dienstgrade. => For the annual statistics (CSV) and later the rank limits.
Für Funkgeräte, Meldeempfänger und Sonderfälle. Die Begründung steht im PDF. => For radios, pagers and special cases. The reason appears in the PDF.
für Ihre Rollen => for your roles
Für „Meine Berichte“ und eigene Daten. => For “My reports” and own data.
Für Personalstärke und Jahresstatistik. => For staff strength and annual statistics.
G26 abgelaufen => G26 expired
Geb.-Datum
Geburtsdatum => Date of birth
Geburtsort => Place of birth
Geburtstage => Birthdays
Gefahrstoff => Hazardous materials
Gefahrstoff (ohne Ölspur) => Hazardous materials (excl. oil spill)
Gemeinde => Municipality
Genau eine Art. => Exactly one type.
Geräte => Equipment
Geräte mit Kategorien und Vorlagen, Prüffristen, Prüfprotokolle. => Equipment with categories and templates, inspection intervals, inspection records.
Geräte und Material => Equipment and material
Gerätehaus Ahornfeld
Gerätehaus Birkenhain
Gerätehaus Eschenbrunn
Gerätehaus Pappelhain
Gerätehaus Weidenhain
Gerätewart => Equipment technician
Gerettete Personen => Persons rescued
Gerettete Tiere => Animals rescued
Gesamtwehr => Whole brigade
Geschädigte => Injured party
Geschädigter, Verursacher, Zeuge, Eigentümer, Halter, Melder, Sonstige => Injured party, causer, witness, owner, keeper, caller, other
Geschlecht => Gender
gesperrt => locked
Gesperrt => Locked
gestern => yesterday
Gewitter => Thunderstorm
gewünscht => preferred
GF
Gilt auf jedem Gerät nach der Anmeldung. => Applies on every device after sign-in.
Glätte => Ice
Großbrand => Large fire
Grün hinterlegt: abgelaufene Sätze, gelten weiter für Einsätze in ihrem Zeitraum. => Green background: expired rates, still apply to incidents in their period.
Grund => Reason
Grund (steht im Audit-Log) => Reason (recorded in the audit log)
Grundlage für Personalzeiten und Entschädigung: 2 h 43 min → 3 angefangene Stunden. => Basis for personnel times and compensation: 2 h 43 min → 3 started hours.
Gruppenführer
Gruppenführer (Ahornfeld)
Gruppenführer (Musterstadt, Pappelhain)
Gruppenführer-Lehrgang: Meldung an den Kreis => Gruppenführer course: registration with the district
gültig ab => valid from
gültig bis => valid until
Gültig bis => Valid until
gültig bis (C) => valid until (C)
Guten Morgen, Markus => Good morning, Markus
Hagel, Sabine
Haupt => Primary
Hauptbericht => Primary report
Hauptbericht ansehen => View primary report
Hauptbericht fehlt (beim Freigeben) => Primary report missing (on release)
Hauptbericht wechseln? => Change primary report?
Hauptberichte: => Primary reports:
Hauptbrandmeister
Hauptfeuerwehrmann
Hauptlöschmeister
Hauptnavigation => Main navigation
Hauptstraße 12, 12345 Musterstadt-Weidenhain
Hausnummer => House number
Hausverwaltung Sonnig GmbH
Herkunft => Source
Herr => Mr
heute 06:14 => today 06:14
heute 06:14 · 10.12.3.4 => today 06:14 · 10.12.3.4
heute 07:52 => today 07:52
heute 08:00 => today 08:00
Hier entfernen => Remove here
Hier erscheinen Berichte, sobald ein Verfasser sie fertig meldet. Sie bekommen dann eine Benachrichtigung. => Reports appear here as soon as an author submits them. You will be notified.
Hinweise => Notes
Historie => History
Historie des Einsatzes => Incident history
Hitze => Heat
hoch => high
höchstens 1 C-Rohr => at most 1 C hose
höchstens so viele wie gerettet => at most as many as rescued
Hochwasser / Unwetter => Flood / severe weather
Höhenrettung => Rope rescue
HU, UVV und Gerätebeladung kommen mit dem Modul Geräte (Release 3). => Vehicle inspections and loading come with the Equipment module (release 3).
IBAN
im Hauptbericht => in primary report
immer 1 Stunde => always 1 hour
Import
Import / Export
Import MP-Feuer
Import wird im Audit-Log protokolliert. => The import is recorded in the audit log.
Import-Assistent => Import wizard
Import-Assistent öffnen => Open import wizard
import-test
In Arbeit => In progress
in Dienst => in service
In Dienst seit => In service since
in gutem Glauben => in good faith
incidents.api.create
incidents.reports.read
incidents.reports.release
incidents.reports.unlock
incidents.reports.write
incidents.settings.manage
incidents.statistics
Insekten => Insects
Interne Bemerkung => Internal note
Internet => Website
ist unter Atemschutz eingetragen, die Eignungsuntersuchung ist seit 02.10.2026 abgelaufen. => is recorded under breathing apparatus, but the medical examination expired on 02.10.2026.
j.keller
ja => yes
Jahr => Year
Jahresstatistik => Annual statistics
Jahresstatistik 2026 => Annual statistics 2026
Jahresstatistik abschließen und exportieren => Finalize and export annual statistics
Jan Ebert
Jana Fischer
je angefangene halbe Stunde => per started half hour
je angefangene Stunde => per started hour
je Einsatz, Funktion EL => per incident, function EL
Jeder Verfasser bekommt eine E-Mail mit seinen offenen Berichten und den Hinweisen dazu. => Each author gets an email listing their open reports and the notes on them.
Jetzt freigeben => Release now
Jonas Keller
Jonas Keller · fällig seit 02.10. => Jonas Keller · due since 02.10.
Jonas Keller ohne gültige Eignungsuntersuchung unter Atemschutz. => Jonas Keller under breathing apparatus without a valid medical examination.
Jubiläen => Anniversaries
Jugend => Youth
Jugendfeuerwehr => Youth fire brigade
Jugendfeuerwehr (48) => Youth (48)
Jugendfeuerwehr Musterstadt
Kai Weber
kann danach keine Einsätze mehr anlegen. Das lässt sich nicht rückgängig machen; für einen neuen Zugang erzeugen Sie ein neues Token. => will no longer be able to create incidents. This cannot be undone; create a new token for new access.
Karl Fink
Kassier (Gesamtwehr) => Treasurer (whole brigade)
Kassier / Verwaltung => Treasurer / administration
Kataloge => Catalogs
Kataloge verwalten => Manage catalogs
Katastrophen-Einsatz => Disaster deployment
Katastrophen-Voralarm => Disaster pre-alert
kein Einfluss => no influence
kein Hauptbericht => no primary report
Kein Personal => No personnel
keine => none
Keine Berichte zur Prüfung => No reports to review
Keine Fehler und keine Warnungen. Zeiten plausibel · Personal vollständig zugeordnet · Statistikmerkmale vollständig. => No errors and no warnings. Times plausible · personnel fully assigned · statistics complete.
„Keller hat Untersuchung am 15.10. gemacht, Bescheinigung kommt nach.“ => “Keller had the examination on 15.10., certificate will follow.”
Keller, Jonas
Kennung => Identifier
Kennzeichen => Flags
Kirchgasse 3
Klassen => Classes
Kleinbrand A => Small fire A
Kleinbrand B => Small fire B
Kleinlöschgeräte, kein Strahlrohr => portable extinguishers, no hose
KO
Kommandant => Chief
Kommandant (Gesamtwehr) · Administrator => Chief (whole brigade) · Administrator
Kommandant Markus Vogt => Chief Markus Vogt
Komplettdaten => Complete data
Kontakt => Contact
Kontoinhaber => Account holder
Kopfbild hochladen => Upload header image
Kopieren => Copy
korrigiert => corrected
Kosten und Anhänge => Costs and attachments
Kostenersatz-Kategorie => Cost recovery category
kostenpflichtiger Einsatz => chargeable incident
Kräfte => Personnel
Kreis => District
Kurz Anna
Kurzname => Short name
Lage & Verlauf => Situation & course
Lage bei Eintreffen => Situation on arrival
Lage und Verlauf fehlen · Statistik fehlt (Hauptbericht) => Situation and course missing · statistics missing (primary report)
Landesfeuerwehrschule => State fire academy
Lang, Martin
Lehrgang => Course
Lehrgänge => Courses
Lehrgänge planen => Plan courses
Lehrgangsbeauftragter => Course coordinator
Personen lesen, Lehrgänge planen und Teilnahmen eintragen => Read persons, plan courses and record attendances
Lehrgangsplanung => Course planning
Lehrgangsplanung 2027 => Course planning 2027
Leistungsabzeichen Bronze
Leitstelle (DME) => Dispatch centre (pager)
leitstelle-api
leitstelle-api · 21.10.2026 13:06 · angelegt => leitstelle-api · 21.10.2026 13:06 · created
Leitstellennummer => Dispatch number
Leitstellennummer, Stichwort, Ort => Dispatch number, keyword, place
Lena Brenner
Lena Brenner · 04.11.
letzte 30 Tage => last 30 days
Letzte Anmeldung => Last sign-in
Letzte Einsätze => Recent incidents
letzte Kontrolle => last check
Letzte Sammel-E-Mail: Montag, 19.10.2026 => Last digest email: Monday, 19.10.2026
LF 20 (Löschgruppenfahrzeug)
LF 20/16
LF 20/16 · DLA(K) 23-12 · ELW 1
LF 20/16 · Florian Musterstadt 1/44
LF 20/16 · Gruppenführer
LF 8/6
LF 8/6 · Florian Musterstadt 2/43
LF20 (205 €/h, VOKeFw 2024)
LFS Bruchsal
Lindenweg 7
Listen => Lists
Listen und Export => Lists and export
Löschen => Delete
Löschmeister
Löschmeister · Abt. Musterstadt (Stamm) · Führungsgruppe · Pers.-Nr. 1043 => Löschmeister · Abt. Musterstadt (primary) · Führungsgruppe · Staff no. 1043
Löschmeister seit 12.03.2021 => Löschmeister since 12.03.2021
Lukas Hahn
Lukas Maier · Probezeit bis 31.10. · Ausschuss am 28.10. => Lukas Maier · probation until 31.10. · committee on 28.10.
M. Vogt
m.vogt
MA
Maier, Lukas
männlich => male
manuell je Person => manually per person
Marktplatz 3, 12340 Kreisstadt
Markus Vogt
Markus Vogt · 02.02.2026
Markus Vogt doppelt im Einsatz (Führungsgruppe). => Markus Vogt twice in the incident (Führungsgruppe).
Markus Vogt steht auch im Bericht der Führungsgruppe. => Markus Vogt is also in the Führungsgruppe report.
Markus Vogt steht auch im Bericht Musterstadt (ELW 1, 13:07–15:50). Bitte nur einem Bericht zuordnen. => Markus Vogt is also in the Musterstadt report (ELW 1, 13:07–15:50). Please assign him to one report only.
Martin Lang
Maschinist
Maschinisten
Maßnahmen / Verlauf => Actions / course
masterdata.catalogs.manage
masterdata.courses.plan
masterdata.organization.manage
masterdata.persons.read
masterdata.persons.sensitive
masterdata.persons.write
Matrix Person × Qualifikation je Abteilung. => Matrix person × qualification per department.
Max Unger
ME
mehr => more
mehr als 3 C-Rohre => more than 3 C hoses
Meier,
Mein Profil => My profile
Meine Listen => My lists
Meine offenen Berichte => My open reports
Meldebild => Alarm message
Meldeliste Kreis => District registration list
Menschenrettung => Rescue of persons
Menü => Menu
Mia Scholz
Michael Bauer
Mindestdauer => Minimum duration
Minutengenau (Takt 10 min) => By the minute (10 min steps)
mit Fehlern, werden übersprungen => with errors, will be skipped
Mit Konto der Gemeinde anmelden => Sign in with municipal account
Mitglied => Member
Mitglied seit => Member since
Mitgliederliste => Member list
Mitgliedschaft => Membership
mittel => medium
Mittelbrand => Medium fire
MLF 10/6
MLF 10/6 · Bereitschaft (2) => MLF 10/6 · standby (2)
MLF 10/6 · Florian Musterstadt 1/42
MLF 10/6 · Florian Musterstadt 3/42
MLF 10/6 · Gruppenführer
Mobil => Mobile
Mockup · nicht funktionsfähig · => Mockup · not functional ·
Mockup-Ansicht: => Mockup view:
Mockups Release 1
Module => Modules
MTW · Florian Musterstadt 1/19
MTW · Florian Musterstadt 2/19
MTW Birkenhain hat keine Statistik-Kategorie. => MTW Birkenhain has no statistics category.
Musiker => Musician
MV
Nach 10 Jahren werden die Daten anonymisiert (Einstellung Datenschutz). => After 10 years the data is anonymized (data protection setting).
Nach den eingesetzten Löschmitteln. => By the extinguishing means used.
Nachname => Last name
Name
Name oder Benutzername => Name or user name
Name oder Personalnummer => Name or staff number
Name, Abteilung und leere Spalte für die Unterschrift. Titel und Datum frei. => Name, department and an empty column for the signature. Free title and date.
Name, Abteilung, Dienstgrad, Eintritt, Telefon. => Name, department, rank, joining date, phone.
Name, Mobilnummer, Funktion – kompakt für den Aushang. => Name, mobile number, function – compact for the notice board.
Name, Personalnummer, Ort … => Name, staff number, place …
Nebel => Fog
Neben => Secondary
Nebenbericht => Secondary report
nein => no
Neu => New
neu anlegen … => create new …
neu anzulegen => to be created
Neuer Status => New status
Neues Token => New token
nicht installiert => not installed
nicht wählbar => not selectable
Nico Hartmann, geb. 03.02.2007, Jugendfeuerwehr Musterstadt (ausgeschieden 31.08.2025). Ist das dieselbe Person? Dann bitte dort wieder aufnehmen, damit Lehrgänge und Historie erhalten bleiben. => Nico Hartmann, born 03.02.2007, Jugendfeuerwehr Musterstadt (left 31.08.2025). Is this the same person? Then readmit him there so courses and history are kept.
nie => never
niedrig => low
Nina Graf
Normbesatzung 1/8 · 9 Plätze => Standard crew 1/8 · 9 seats
Notarzt => Emergency doctor
nur Atemschutzgeräteträger => BA wearers only
Nur Lehrgänge => Courses only
Nur meine => Mine only
Nur Stammdaten => Master data only
Oberbrandmeisterin
Oberfeuerwehrfrau
Oberfeuerwehrmann
Oberlöschmeister
Objekt => Building
offen => open
Offen (7) => Open (7)
offen seit => open for
Offene Berichte => Open reports
Öffnen => Open
Ohne das Recht „Sensible Felder“ steht in der Historie nur, dass ein solches Feld geändert wurde, nicht der Wert. => Without the “Sensitive fields” permission, the history only shows that such a field changed, not the value.
ohne Hauptbericht => without primary report
Ohne Hauptbericht (1) => Without primary report (1)
ohne Recht „Sensible Felder“ ansehen => view without the “Sensitive fields” permission
ohne Verfasser => without author
Ohne Verfasser => Without author
Ölspur => Oil spill
optional
Optional ein breites Kopfbild (z. B. Kopfzeile.png). => Optionally a wide header image (e.g. Kopfzeile.png).
Organisation => Organization
Organisation bearbeiten => Edit organization
Ort => Town
Ortsteil => District
p.straub
passiv => inactive
Passwort => Password
Passwort ändern => Change password
Passwort vergessen? => Forgot password?
Passwort-Link senden => Send password link
Paul Ziegler
Pauschale => Allowance
Pauschalen => Allowances
PDF
PDF erzeugen => Create PDF
Person
Person anlegen => New person
Person suchen und zuordnen => Find and assign person
Personal => Personnel
Personal & Fahrzeuge => Personnel & vehicles
Personal geändert (17 Personen) => Personnel changed (17 people)
Personal.xlsx · Blatt „Personal“ => Personal.xlsx · sheet “Personal”
Personaldoppelung im Einsatz => Duplicate person in incident
Personaldoppelung mit Bericht Führungsgruppe => Duplicate person with Führungsgruppe report
Personalnummer => Staff number
Personalstärke => Staff strength
Personen => People
Personen bearbeiten => Edit people
Personen in der Probezeit mit Ende und Stand der Grundausbildung. => People on probation with end date and basic training status.
Personen lesen => Read people
Personen mit Kennzeichen Atemschutz. Tauglichkeit mit Fristen später aus dem Modul Atemschutz. => People flagged as BA wearers. Fitness with deadlines later from the Breathing apparatus module.
Personen und Tiere => People and animals
Personen, Abteilungen, Wachen, Fahrzeuge, Lehrgänge, Listen. => People, departments, stations, vehicles, courses, lists.
Personen, Fahrzeuge und Einsätze aus CSV, Excel oder JSON übernehmen. => Import people, vehicles and incidents from CSV, Excel or JSON.
Personen, Fahrzeuge, Einsätze suchen => Search people, vehicles, incidents
Personenakte mit Historie => Personnel file with history
Personenliste => Person list
Persönliche Angaben => Personal details
Peter Straub
Pfad => Path
Pflichtfelder sind mit * markiert. Weitere Angaben folgen in der Personenakte. => Required fields are marked *. Further details go in the personnel file.
Platz zugesagt => place confirmed
Plausibilitätsprüfung => Plausibility check
Plugin-Paket (.tgz) hochladen. Es wird geprüft und nach dem nächsten Neustart geladen. => Upload a plugin package (.tgz). It is checked and loaded after the next restart.
PLZ => Postcode
PLZ / Ort => Postcode / town
Polizei => Police
Polizei, Rettungsdienst, Notarzt, THW, Nachbarfeuerwehr, Energieversorger, Straßenmeisterei … => Police, ambulance, emergency doctor, THW, neighbouring brigade, utility, road maintenance …
Port
Position der Jahresstatistik (Landesvorlage). => Item in the annual statistics (state template).
Prio => Prio
Priorität => Priority
Probezeit => Probation
Probezeit (5) => Probation (5)
Probezeit 12 Monate, bis 31.05.2009 => Probation 12 months, until 31.05.2009
Probezeit endet – Aufnahme beschließen => Probation ends – decide on admission
Probezeit endet am => Probation ends on
Probezeit verkürzt => Probation shortened
Profil: MP-Feuer Personal => Profile: MP-Feuer Personal
Prüfen => Check
Prüfregeln => Check rules
Prüfung und Freigabe => Review and release
Prüfung vor dem Fertigmelden => Check before submitting
Prüfungen => Inspections
Quadratisch, mindestens 512 × 512 Pixel. => Square, at least 512 × 512 pixels.
Qualifikation => Qualification
Qualifikationen => Qualifications
Qualifikationsübersicht => Qualification overview
Quelle => Source
Ralf Kunz
Rauchentwicklung aus Wohnung, Person vermisst
Recht => Permission
Regel => Rule
Regen => Rain
Regen, Schnee, Glätte, Sturm, Hitze, Gewitter, Nebel => Rain, snow, ice, storm, heat, thunderstorm, fog
Release 2
Release 3
Rettungsdienst (DRK) => Ambulance (DRK)
Rief
Rief, Tobias
Weidenhain
Weidenhain (Haupt), Musterstadt, Führungsgruppe => Weidenhain (primary), Musterstadt, Führungsgruppe
Weidenhain liegt in der eigenen Gemeinde (Stadt Musterstadt). => Weidenhain is in the own municipality (Stadt Musterstadt).
Weidenhain, Hauptstr. 12
Weidenhain, Hauptstraße 12
Rolle => Role
Rolle: Gruppenführer => Role: Gruppenführer
Rollen => Roles
Rollen und Berechtigungen => Roles and permissions
Rollenzuweisungen => Role assignments
Roth, Sandra
Rufname => Preferred name
Rundung => Rounding
s.hagel
Sabine Hagel
sabine.hagel@example.org · 2 Berichte => sabine.hagel@example.org · 2 reports
Sammel-E-Mail => Digest email
Sandra Roth
Satz je Stunde => Rate per hour
Schlauchtrupp
Schließen => Close
Schmid, Andreas
Schmutz Thorsten
Schmutzzulage => Dirt allowance
Schnee => Snow
Schritt 2 von 3: Prüfen => Step 2 of 3: Check
Schritt 2 von 4: Spalten zuordnen => Step 2 of 4: Map columns
seit => since
Seite 1 von 20 => Page 1 of 20
Seite 1–3 · Organisation und Personal => Pages 1–3 · organization and staff
Seite 14 · Funk => Page 14 · radio
Seite 4–6 · Einsätze => Pages 4–6 · incidents
Seite 7–13 · Fahrzeuge => Pages 7–13 · vehicles
Seite der Landesvorlage => Page of the state template
Selbst zu Schaden gekommen => Injured themselves
sensibel => sensitive
Sensible Felder (Geburtsdatum, Bank, Arbeitgeber) => Sensitive fields (date of birth, bank, employer)
Server
Shell
Sie korrigieren selbst => you correct it yourself
SMTP-Server => SMTP server
Sonderaufgaben => Special tasks
Sonderdienst => Special service
Sonderdienste
SONST
Sonstige Kräfte => Other agencies
sonstige Technische Hilfe => other technical assistance
Sonstiges => Other
Spalte in der Datei => Column in file
Spalten wählen => Choose columns
Spalten zuordnen => Map columns
später => later
Speichern => Save
Sperre aufheben => Unlock
Sperre aufheben … => Unlock …
Sperren … => Lock …
Sprache => Language
Sprache der Liste => List language
Sprechfunker
Sprechfunker Digitalfunk
ST
Stadt Musterstadt (aus Einstellungen der Feuerwehr) => Stadt Musterstadt (from fire brigade settings)
Stamm => Primary
Stammabteilung => Primary department
Stammdaten => Master data
Stammdaten exportieren => Export master data
Standard für neue Mitglieder => default for new members
Startseite => Home
STARTTLS
Statistik => Statistics
Statistik bei Sonderdienst / Sonstiges => Statistics on special service / other
Statistik des Einsatzes fehlt (Hauptbericht) => Statistics of the incident missing (primary report)
Statistik vorbefüllt, nicht geprüft => Statistics prefilled, not checked
Statistik vorbefüllt, noch nicht geprüft. => Statistics prefilled, not yet checked.
Statistik-Kategorie => Statistics category
Statistik: Brand => Statistics: fire
Status
Status ändern => Change status
Status ändern … => Change status …
Status speichern => Save status
Status: zur Freigabe. => Status: for approval.
Std. => Hrs
steht auch im Bericht der Führungsgruppe (13:10–16:20). Eine Person darf im selben Einsatz nicht gleichzeitig in zwei Berichten stehen. => is also in the Führungsgruppe report (13:10–16:20). A person cannot be in two reports of the same incident at the same time.
Stellvertreter => Deputy
Stichwort => Keyword
Stichwort-Katalog => Keyword catalog
Stichworte und Statistik => Keywords and statistics
Straße => Street
Stufe => Level
Stundensätze => Hourly rates
Sturm => Storm
Suche => Search
Suchen => Search
Summe Entschädigung => Total compensation
t.rief
t.rief kann sich danach nicht mehr anmelden. Offene Sitzungen enden sofort. Berichte und Daten bleiben erhalten. => t.rief will no longer be able to sign in. Open sessions end immediately. Reports and data are kept.
täglich => daily
technisch => technical
Technische Hilfe => Technical assistance
Technischer Benutzer => Technical user
Telefon => Phone
Telefon 01234/5678-0 · Fax 01234/5678-99 · www.feuerwehr-musterstadt.example => Phone 01234/5678-0 · Fax 01234/5678-99 · www.feuerwehr-musterstadt.example
Telefon dienstlich => Work phone
Telefon privat => Home phone
Telefon- und Alarmliste => Phone and alert list
Test-E-Mail an mich senden => Send test email to me
Testzugang Import => Test access import
Textbaustein einfügen: => Insert text block:
Textbausteine => Text blocks
TH Baum auf Straße
TH Tier in Notlage
TH1
TH1 Ölspur
TH1 Ölspur · Abt. Musterstadt
TH2
TH2 VU eingeklemmte Person
Tierrettung (ohne Insekten) => Animal rescue (excl. insects)
Timo Kraus
Tippen auf eine Person öffnet Funktion, Zeiten, Atemschutz und Entschädigung. Gäste aus Nachbarwehren werden ohne Entschädigung erfasst. => Tap a person to edit function, times, breathing apparatus and compensation. Guests from neighbouring brigades are recorded without compensation.
Titel => Title
Tobias
Tobias Rief
Tobias Rief · 21.10.2026 19:12
Tobias Rief · 22.11.
Tobias Rief (Pers.-Nr. 1043) => Tobias Rief (staff no. 1043)
Tobias Rief sperren? => Lock Tobias Rief?
Tobias Rief wird zum Austrittsdatum ausgeschieden. Laufende Mitgliedschaften und Rollen enden an diesem Tag. Einsätze und Historie bleiben erhalten. => Tobias Rief leaves on the leaving date. Current memberships and roles end on that day. Incidents and history are kept.
Tod => Death
tödlich verunglückt => killed
Token erzeugen => Create token
Token erzeugt. => Token created.
Token widerrufen => Revoke token
Token widerrufen? => Revoke token?
Tote Personen => Persons dead
TR
Truppführer
Truppmann
Truppmann Teil 1
TSF
TSF · Florian Musterstadt 4/47
TSF · Florian Musterstadt 5/47
TSF · Florian Musterstadt 6/47
Typ => Type
überfällig => overdue
Übergabe an Polizei => Handover to police
Überlandhilfe => Mutual aid
Übernehmen => Apply
Überschneidung mit anderem Einsatz => Overlap with another incident
Übersicht => Overview
Übersicht aller Mockups => All mockups
Übungsdienste und Sonderdienste, Anwesenheit, Ausbildungsnachweis. => Training and special services, attendance, training record.
Dienste => Services
Uhrzeit => Time
MS-FW 1144
MS-FW 144
Umzug => Moved away
und der Anschrift. Bitte prüfen und bei Bedarf ändern. Diese Angaben zählen für die Jahresstatistik der Gesamtwehr. => and the address. Please check and change if needed. These details count for the brigade's annual statistics.
unter Atemschutz => under breathing apparatus
Unterkategorie => Subcategory
Unterschriftenliste => Signature list
Untersuchung abgelaufen => medical expired
Ursache (soweit bekannt) => Cause (if known)
Uwe Brandt
Verdienstausfall => Loss of earnings
Verdienstausfall ohne Betrag => Loss of earnings without amount
Verfasser => Author
Verfasser erinnern … => Remind authors …
Verfasser korrigiert => the author corrects it
Verfasser zuweisen => Assign author
Verfasser zuweisen … => Assign author …
Verfasser: Sabine Hagel => Author: Sabine Hagel
Verfasser: Tobias Rief => Author: Tobias Rief
Verkehrsunfall => Traffic accident
Verknüpfte Person => Linked person
verletzt => injured
Verletzte eigene Einsatzkräfte => Own personnel injured
vermittelt => grants
Verwaltung => Administration
Verwendete Geräte und Verbrauchsmaterial => Equipment and consumables used
Vogt, Markus
Vollexport => Full export
vollständig => complete
von => from
Voraussetzung => Prerequisite
Voraussetzung: Truppführer · Meldeschluss beim Kreis: 03.12.2026 => Prerequisite: Truppführer · district registration deadline: 03.12.2026
Vorbefüllt aus dem Stichwort => Prefilled from keyword
vorgemerkt => nominated
Vorgemerkt => Nominated
Vorgemerkt (3) => Nominated (3)
vorhanden, werden aktualisiert => existing, will be updated
Vorjahr bis heute: 131 => Last year to date: 131
Vorläufige Werte. Einsätze zählen nach Einsatzdatum, Personen und Fahrzeuge zum Stichtag 31.12.2026. Abgabedatei und CSV bleiben im deutschen Format der Landesvorlage. => Provisional values. Incidents count by incident date, people and vehicles as of 31.12.2026. Submission file and CSV stay in the German format of the state template.
Vorlaufzeit „bald fällig“ => Lead time “due soon”
Vormerkungen => Nominations
Vorname => First name
Vorname + Nachname => first name + last name
Vorname fehlt => First name missing
Vorschau (Schritt 3) => Preview (step 3)
Vorschau & Prüfung => Preview & check
Vorschau als PDF => Preview as PDF
Vorschau: Wappen und Kicker oben, Tabellenkopf weiß auf rot, Fußzeile mit Anschrift, Seitenzahl und Erstellungsdatum. => Preview: crest and kicker at the top, table header white on red, footer with address, page number and creation date.
Vorschläge => Suggestions
VU eingeklemmte Person
Wache => Station
Wagner, Carina
Wappen => Crest
Wappen der Freiwilligen Feuerwehr Musterstadt => Crest of the Freiwillige Feuerwehr Musterstadt
Warnung => Warning
Warnung · Personal: => Warning · Personnel:
Warnung begründen => Justify warning
Warnung begründet von T. Rief: => Warning justified by T. Rief:
Warnung: => Warning:
Warnungen => Warnings
warten auf Freigabe => awaiting release
warten auf Ihre Freigabe => awaiting your release
Was soll geändert werden? => What should be changed?
Wassertrupp
Weber, Kai
Wechsel in andere Feuerwehr => Moved to another brigade
weiblich => female
Weidner, Paul
Weiß, Anna
Weiter › => Next ›
Weiter zur Vorschau => Continue to preview
Weiter: Beteiligte & Sonstiges › => Next: Parties & other ›
Weiter: Lage & Verlauf › => Next: Situation & course ›
Weiter: Personal & Fahrzeuge › => Next: Personnel & vehicles ›
Weiter: Prüfen › => Next: Check ›
Weiter: Statistik › => Next: Statistics ›
Weitere Kandidaten => Further candidates
Weitere Kandidaten (4) => Further candidates (4)
„Weitere Kandidaten“ erfüllen die Voraussetzungen, sind aber noch nicht vorgemerkt. => “Further candidates” meet the prerequisites but are not nominated yet.
weniger => less
Wer im gewählten Jahr 18, 55 oder 65 wird. => Who turns 18, 55 or 65 in the chosen year.
Wert (FF) => Value (FF)
Wert ausgeblendet => value hidden
Wert korrigieren => Correct value
Wert korrigieren … => Correct value …
Wetterlage => Weather
Wetterlagen => Weather conditions
Widerrufen … => Revoke …
Wird benötigt von: Einsatzberichte => Required by: Incident reports
wird Hauptbericht. Der Bericht der => becomes the primary report. The report of the
wird Nebenbericht. => becomes a secondary report.
wöchentlich (Montag) => weekly (Monday)
WT
z. B. Alamos FE2 => e.g. Alamos FE2
z. B. aus der Feuerwehr ausgeschieden => e.g. left the fire brigade
z. B. Bitte Markus Vogt nur im Bericht der Führungsgruppe führen. => e.g. Please list Markus Vogt only in the Führungsgruppe report.
z. B. Personal nachgetragen => e.g. personnel added later
z. B. Übertritt aus anderer Feuerwehr => e.g. transfer from another brigade
z. B. Untersuchung erfolgt, Bescheinigung kommt nach => e.g. examination done, certificate will follow
z. B. vorher Jugendfeuerwehr => e.g. previously youth fire brigade
Zählen für die Jahresstatistik aus allen Berichten. Eintragen bei der Person im Abschnitt Personal. => Counted for the annual statistics from all reports. Record it on the person in the Personnel section.
Zählt als: => Counts as:
zählt in der Gesamtstatistik => counts in the overall statistics
Zeile => Row
Zeit => Time
Zeitbasis => Time basis
Zeiten => Times
Zeiten & Ort => Times & location
Zeiten plausibel · Lage und Verlauf ausgefüllt · alle Personen einem Fahrzeug oder der Bereitschaft zugeordnet => Times plausible · situation and course filled in · everyone assigned to a vehicle or standby
Zeitraum => Period
Zeitraum wählbar, runde Geburtstage markiert. => Period selectable, milestone birthdays marked.
zu: => to:
Zugführer
Zuletzt geändert 12.10.2026 von Markus Vogt => Last changed 12.10.2026 by Markus Vogt
Zuletzt genutzt => Last used
Zum Abschnitt => Go to section
Zum Hauptbericht machen … => Make primary report …
Zum Inhalt springen => Skip to content
zur => for
„Zur Abrechnung“ schließt die Entschädigungsauszahlung ein. Nach der Freigabe ist der Bericht für alle anderen gesperrt. => “For billing” includes the compensation payout. After release the report is locked for everyone else.
Zur Lehrgangsplanung => To course planning
zur Prüfung => for review
Zur Prüfung => For review
Zur Prüfung (4) => For review (4)
Zurück => Back
Zurück an Verfasser => Return to author
Zurück an Verfasser … => Return to author …
Zurückgeben => Return
Zusätzlicher Text (optional) => Additional text (optional)
Zusatzmodul installieren => Install add-on module
Zusatzspalten => Extra columns
Bericht angelegt => Report created
Jede automatische Speicherung legt eine Version an. Was sich geändert hat, steht in der Historie des Berichts. => Every automatic save creates a version. What changed is shown in the report history.
Lage und Verlauf geändert => Situation and course changed
Statistik: 1 gerettete Person => Statistics: 1 person rescued
Statistik: Brandgröße Mittelbrand => Statistics: fire size medium fire
Versionen => Versions
Versionen des Berichts => Report versions
Wiederherstellen => Restore
Wiederherstellen legt eine neue Version mit dem alten Stand an. Die aktuelle Version bleibt erhalten und lässt sich ebenso zurückholen. => Restoring creates a new version with the old content. The current version is kept and can be brought back the same way.
Zeitpunkt => Time
aktuell => current
Änderung => Change
Personal: 3 Personen hinzugefügt => Personnel: 3 people added
Personal: Markus Vogt hinzugefügt => Personnel: Markus Vogt added
Ausgeschaltet gibt der Kommandant direkt zur Abrechnung frei. Die Auszahlung ist darin enthalten. => When off, the chief releases directly for billing. The payout is included.
Freigabe => Release
Freigabe in zwei Stufen: erst zur Entschädigungsauszahlung, dann zur Abrechnung => Two-stage release: first for compensation payout, then for billing
(Stufe 2 von 2). => (stage 2 of 2).
12 freigegeben zur Entschädigungsauszahlung => 12 released for compensation payout
3 Fehler · 1 Hinweis => 3 errors · 1 notice
Abrechnung => billing
Auszahlung => Payout
Auszahlung exportieren => Export payout
Auszahlungslauf 10/2026 => Payout run 10/2026
Beispiel: Stufe 1 erledigt => Example: stage 1 done
Bericht ohne Personal => Report without personnel
Betroffen => Affected
Der Bericht geht an die Abrechnung der Stadt. Rückgängig nur über „Sperre aufheben“. => The report goes to the town's billing. Can only be undone via “Unlock”.
Doppelungen => Duplicates
Exportieren geht, sobald kein Fehler mehr offen ist. Nicht freigegebene Berichte bleiben draußen. => Export is possible once no errors are open. Reports not yet released are left out.
Fehler: 1 Person => Error: 1 person
Freigabe zur Abrechnung => Release for billing
Freigabe zur Entschädigungsauszahlung => Release for compensation payout
Freigeben zur Abrechnung … => Release for billing …
Hinweis: 4 Berichte => Notice: 4 reports
Fehlt die Statistik des Einsatzes, meldet der Hauptbericht einen Fehler mit „Zum Einsatz“; sie steht auf der Seite des Einsatzes. => If the statistics of the incident are missing, the primary report shows an error with "Go to incident"; they are on the page of the incident.
Keine Fehler und keine Warnungen. Zeiten plausibel · Personal vollständig zugeordnet · Statistik des Einsatzes vollständig. => No errors and no warnings. Times plausible · personnel fully assigned · statistics of the incident complete.
Personal geändert (8 Personen) => Personnel changed (8 people)
Die Statistik gehört zum Einsatz und bleibt unverändert. Sabine Hagel bekommt eine Benachrichtigung. => The statistics belong to the incident and stay unchanged. Sabine Hagel is notified.
Gilt für den ganzen Einsatz und zählt einmal in der Jahresstatistik. Eintragen können die Verfasser der Berichte dieses Einsatzes, solange ein Bericht in Bearbeitung ist, und die Freigeber bis zum Abschluss der Jahresstatistik. => Applies to the whole incident and counts once in the annual statistics. The authors of the reports of this incident enter them while a report is being written, the releasers until the annual statistics are closed.
Statistik entfernen => Remove statistics
Statistik speichern => Save statistics
und der Anschrift. Bitte prüfen und bei Bedarf ändern. => and the address. Please check and change if needed.
Ist die Stufe „Entschädigungsauszahlung“ in den Einstellungen abgeschaltet, gibt es nur „Freigeben zur Abrechnung“. Die Auszahlung ist darin enthalten. => If the “compensation payout” stage is switched off in the settings, there is only “Release for billing”. The payout is included.
Keine oder ungültige Zeit => Missing or invalid time
Lauf 10/2026, exportiert am 20.10.2026 => Run 10/2026, exported on 20.10.2026
Lena Bauer · TH1 Ölspur, Musterstadt (Funktion ohne Satz) => Lena Bauer · TH1 Ölspur, Musterstadt (function without rate)
Markus Vogt · B2 Brand Wohnung, Musterstadt und Führungsgruppe => Markus Vogt · B2 Brand Wohnung, Musterstadt and Führungsgruppe
Nicht freigegeben => Not released
Person ohne Betrag => Person without amount
Person ohne Fahrzeug oder Bereitschaft => Person without vehicle or standby
Peter Huber · BMA Brandmeldeanlage, Musterstadt (Ende vor Beginn) => Peter Huber · BMA Brandmeldeanlage, Musterstadt (end before start)
Probleme vor der Auszahlung => Problems before payout
Prüfung => Check
Stufe 1 von 2. Danach ist der Bericht für alle anderen gesperrt. Die Freigabe zur Abrechnung folgt nach der Auszahlung. => Stage 1 of 2. After that the report is locked for everyone else. The release for billing follows after the payout.
Summe => Total
Zum Bericht => To report
Zur Abrechnung freigeben? => Release for billing?
Zur Liste => To list
für 64 Personen => for 64 people
noch zur Prüfung, sie kommen in den nächsten Lauf => still awaiting review, they go into the next run
Infoterminals => Info terminals
Infoterminal => Info terminal
Infoterminal · Freiwillige Feuerwehr Musterstadt => Info terminal · Musterstadt Volunteer Fire Brigade
Startbildschirm der Wache => Station start screen
Wer sind Sie? (Namen und Suche) => Who are you? (names and search)
Eintragen mit Fahrzeug und Funktion => Sign in with vehicle and function
Eintragen mit Bereitschaft => Sign in for standby
Eingetragene mit Ändern und Austragen => Signed-in people with change and remove
Neuer Einsatz mit passenden Einsätzen => New incident with matching incidents
Dienst eintragen => Sign in for service
Nichts offen => Nothing open
Nicht freigeschaltet => Not activated
Verwaltung der Infoterminals => Managing info terminals
Wache mit Infoterminal => Station with info terminal
Anderes Fahrzeug … => Other vehicle …
B3 Brand Scheune · Alarm 13:12
Beträge, Atemschutzminuten und Verletzungen trägt der Verfasser im Bericht ein. => Amounts, breathing apparatus minutes and injuries are entered by the author in the report.
Bis => To
Von => From
DLA(K) 23-12 · Florian Musterstadt 1/33 (Musterstadt)
ELW 1 · Florian Musterstadt 1/11 (Musterstadt)
LF 20/16 · Florian Musterstadt 1/44 (Musterstadt)
LF 8/6 · Florian Musterstadt 2/43 (Birkenhain)
MLF 10/6 · Florian Musterstadt 1/42 (Musterstadt)
MLF 10/6 · Florian Musterstadt 3/42 (Weidenhain)
MTW · Florian Musterstadt 1/19 (Musterstadt)
MTW · Florian Musterstadt 2/19 (Birkenhain)
TSF · Florian Musterstadt 4/47 (Pappelhain)
Eingetragen => Signed in
Eingetragene ansehen => View signed-in people
Einsatz während der Arbeitszeit beim Dienstherrn => Incident during working hours for the employing authority
Eintragen => Sign in
Fahrzeug einer anderen Wache oder Abteilung => Vehicle of another station or department
Fertig => Done
Ich war nicht die ganze Zeit dabei => I was not there the whole time
Jana Fischer eintragen => Sign in Jana Fischer
Kommt in den Bericht der Abteilung Musterstadt, markiert „vom Infoterminal“. => Goes into the report of the Musterstadt department, marked “from info terminal”.
Leer: bis zum Ende des Einsatzes => Empty: until the end of the incident
Melder
Melder · ab 13:40 => Melder · from 13:40
Unter Atemschutz => Under breathing apparatus
Verdienstausfall beim Arbeitgeber => Loss of earnings at employer
Weitere Angaben => Further details
Bereitschaft gilt für die Zeiten des Berichts und zählt pauschal 1 Stunde. Atemschutz und abweichende Zeiten entfallen. => Standby applies for the times of the report and counts as a flat 1 hour. Breathing apparatus and different times do not apply.
Wo waren Sie? => Where were you?
keine Angabe => not specified
‹ Andere Person => ‹ Other person
Anwesend => Present
Anwesend eintragen => Sign in as present
Die Eintragung ist vorläufig, bis der Verantwortliche die Anwesenheit speichert, wie beim QR-Check-in. => The entry is provisional until the person in charge saves the attendance, as with the QR check-in.
Funktion (optional) => Function (optional)
z. B. Maschinist => e.g. Maschinist
‹ Übersicht => ‹ Overview
13:31 am Infoterminal => 13:31 at the info terminal
Angriffstrupp · Atemschutz => Angriffstrupp · breathing apparatus
Austragen => Remove
Austragen … => Remove …
B3 Brand Scheune
B3 Brand Scheune: Eingetragen (6) => B3 Brand Scheune: signed in (6)
Einsatz · Alarm 13:12 · Musterstadt, Lindenweg 4 => Incident · alarm 13:12 · Musterstadt, Lindenweg 4
Eintragungen „vom Verfasser“ stammen aus dem Bericht und lassen sich nur dort ändern. Eigene Eintragungen vom Infoterminal lassen sich hier ändern, bis das Eintragen schließt oder der Bericht fertig gemeldet ist. => Entries “by the author” come from the report and can only be changed there. Your own entries from the info terminal can be changed here until sign-in closes or the report is submitted.
Michael Bauer austragen? => Remove Michael Bauer?
Michael Bauer wird aus dem Bericht der Abteilung Musterstadt zu => Michael Bauer will be removed from the Musterstadt department report on
entfernt. Die Änderung steht in der Historie des Berichts. => . The change is recorded in the report history.
ganzer Einsatz => whole incident
vom Verfasser => by the author
Ändern => Change
Ändern öffnet das Formular mit den bisherigen Angaben. => Change opens the form with the previous details.
‹ Zur Namensliste => ‹ To the list of names
Der Link ist ungültig oder wurde widerrufen. Bitte wenden Sie sich an den Abteilungskommandanten oder den Administrator. Er richtet das Gerät unter „Verwaltung → Infoterminals“ oder auf der Seite der Wache neu ein. => The link is invalid or was revoked. Please contact the department commander or the administrator. They set up the device again under “Administration → Info terminals” or on the station page.
Dieses Gerät ist nicht als Infoterminal freigeschaltet => This device is not activated as an info terminal
Es werden keine Daten angezeigt. Fehlercode => No data is shown. Error code
Infoterminal nicht freigeschaltet => Info terminal not activated
+ Neuer Einsatz => + New incident
Dienstag, 27.10. 19:00 · Übung Atemschutz => Tuesday, 27.10. 19:00 · breathing apparatus drill
Einsätze erscheinen hier ab dem Alarm, Dienste 30 Minuten vor Beginn. Nächster Dienst: => Incidents appear here from the alarm, services 30 minutes before they start. Next service:
Gerade ist nichts zum Eintragen offen => Nothing is open for sign-in right now
Alarm 13:51 · Musterstadt, Mühlweg 5 · Berichte: Birkenhain => Alarm 13:51 · Musterstadt, Mühlweg 5 · reports: Birkenhain
B-BMA · Brandmeldeanlage
B1 · Kleinbrand
B2 · Brand Wohnung
TH-Wasser · Wasser im Gebäude / Unwetter
TH1 · Technische Hilfe klein
Den Bericht schreibt danach ein Verfasser der Abteilung in f.orga. Ein Einsatz von der Leitstelle (Schnittstelle) erscheint ohne dieses Formular auf der Übersicht. => An author of the department then writes the report in f.orga. An incident from the dispatch centre (interface) appears on the overview without this form.
Ein passender Einsatz ist schon angelegt (gleiches Stichwort, Alarm innerhalb von 2 Stunden): => A matching incident already exists (same keyword, alarm within 2 hours):
Gezeigt werden nur Stichwort, Alarm, Ort und beteiligte Abteilungen. Die Abteilung Musterstadt bekommt einen eigenen Bericht (Nebenbericht) zu diesem Einsatz. => Only keyword, alarm, location and departments involved are shown. The Musterstadt department gets its own report (secondary report) for this incident.
Gibt es den Einsatz schon? => Does the incident already exist?
Legt den Einsatz und den Bericht der Abteilung Musterstadt an => Creates the incident and the report of the Musterstadt department
Nein, neuen Einsatz anlegen => No, create a new incident
Neuer Einsatz => New incident
Straße und Hausnummer => Street and house number
Unseren Bericht hinzufügen => Add our report
Weiter => Next
falls bekannt, z. B. 2026-104950 => if known, e.g. 2026-104950
Abt. Birkenhain · steht schon im Bericht Birkenhain => Dept. Birkenhain · already in the Birkenhain report
Anna Weiß
Tim Brendel
B3 Brand Scheune: Wer sind Sie? => B3 Brand Scheune: who are you?
DLA(K) 23-12 · Maschinist
LF 20/16 · Angriffstrupp
LF 20/16 · Maschinist
Eingetragen (5) => Signed in (5)
Grün mit Haken: schon eingetragen. Antippen öffnet die eigene Eintragung zum Ändern oder Austragen. Nach 60 Sekunden ohne Eingabe kehrt das Terminal zur Übersicht zurück. => Green with a tick: already signed in. Tapping opens your entry to change or remove it. After 60 seconds without input the terminal returns to the overview.
Nach Anfangsbuchstaben springen => Jump by initial letter
Wer sind Sie? => Who are you?
4 eingetragen => 4 signed in
5 eingetragen => 5 signed in
Alarm 12:05 · Musterstadt, B 311
Alarm 13:12 · Musterstadt, Lindenweg 4
Dienst · heute 19:00–21:30 => Service · today 19:00–21:30
Einsatz · beendet 13:50 => Incident · ended 13:50
Einsatz · läuft => Incident · ongoing
Eintragen ab 18:30 => Sign-in from 18:30
Eintragen nur noch bis 14:50 => Sign-in only until 14:50
Freitag, 23.10.2026 => Friday, 23.10.2026
Wofür möchten Sie sich eintragen? => What do you want to sign in for?
Übung Technische Hilfe => Technical rescue drill
(Feuerwehrhaus Musterstadt) kann danach nicht mehr eintragen. Bisherige Eintragungen bleiben in den Berichten. Für das Gerät legen Sie später ein neues Infoterminal an. => (Feuerwehrhaus Musterstadt) can then no longer sign anyone in. Existing entries stay in the reports. For the device, create a new info terminal later.
Abt. Birkenhain => Dept. Birkenhain
Der bisherige Link von => The previous link of
Einsätze, Dienste => Incidents, services
Einsätze, Neuer Einsatz => Incidents, new incident
Einsätze, Neuer Einsatz, Dienste => Incidents, new incident, services
Erlaubt => Allowed
Feuerwehrhaus Musterstadt (Musterstadt)
Gerätehaus Birkenhain (Birkenhain)
Gerätehaus Weidenhain (Weidenhain)
Für Dienste eintragen (Modul Dienste) => Sign in for services (Services module)
Für Einsätze der Abteilung eintragen => Sign in for incidents of the department
Gerät => Device
Infoterminal angelegt. => Info terminal created.
Infoterminal anlegen => Create info terminal
Infoterminal widerrufen? => Revoke info terminal?
Link für das Infoterminal => Link for the info terminal
Link kopieren => Copy link
Neuen Einsatz anlegen => Create new incident
Neuen Link erzeugen => Generate new link
Neuen Link erzeugen? => Generate new link?
Neuer Link … => New link …
Neues Infoterminal => New info terminal
QR-Code des Links => QR code of the link
QR-Code mit der Kamera des Tablets scannen oder den Link kopieren. Wer den Link hat, kann für die Wache eintragen. Nicht per E-Mail oder Messenger weitergeben. => Scan the QR code with the tablet camera or copy the link. Whoever has the link can sign people in for the station. Do not pass it on by e-mail or messenger.
Sprache beim Start => Start language
Tablet
Widerrufen => Revoke
Widerrufene zeigen => Show revoked
Zuletzt gesehen => Last seen
heute 14:31 => today 14:31
seit 34 Tagen nicht gesehen => not seen for 34 days
widerrufen 02.10.2026 · Stefan Eberle => revoked 02.10.2026 · Stefan Eberle
wird sofort ungültig. Das Gerät zeigt dann „nicht freigeschaltet“, bis der neue Link geöffnet ist. => becomes invalid immediately. The device then shows “not activated” until the new link is opened.
z. B. Tablet Fahrzeughalle => e.g. tablet in the vehicle hall
Feuerwehrstraße 1, 12345 Musterstadt
Infoterminals verwalten => Manage info terminals
PC Funkraum => PC radio room
Ständig besetzt => Permanently staffed
Tablet Fahrzeughalle => Tablet vehicle hall
Wache Feuerwehrhaus Musterstadt => Station Feuerwehrhaus Musterstadt
zuletzt gesehen 21.10.2026 19:02 => last seen 21.10.2026 19:02
zuletzt gesehen heute 14:31 => last seen today 14:31
Ansicht Jugendfeuerwehr (nur Dienste) => Youth fire brigade view (services only)
B3 Brand Scheune · Bericht Abteilung Musterstadt. Ändern oder Austragen bis 19:12 hier am Terminal. Zurück zur Übersicht in 10 s. => B3 Brand Scheune · report of the Musterstadt department. Change or remove until 19:12 here at the terminal. Back to the overview in 10 s.
Abteilung wählen => Choose department
Zurück zur Übersicht => Back to overview
Dienst · heute 14:00–16:30 · Jugendfeuerwehr Musterstadt => Service · today 14:00–16:30 · Jugendfeuerwehr Musterstadt
Eintragen bis 17:30 => Sign-in until 17:30
Jugendfeuerwehrdienst: Leon Hartmann => Youth fire brigade service: Leon Hartmann
Mia Bauer, Finn Eberle, Lea Graf, Noah Kunz, Emma Lang, Ben Moser, Lina Ott, Paul Roth, Sophie Weber
Schon anwesend (9) => Already present (9)
z. B. Gruppensprecher => e.g. group spokesperson
„Unter Atemschutz“ gibt es nur in Diensten von Einsatzabteilungen. => “Under breathing apparatus” only exists in services of operational departments.
Ändern bis 19:12 => Change until 19:12
heute, höchstens 6 Stunden zurück => today, at most 6 hours ago
Alle Personen durchsuchen (ab 3 Buchstaben) => Search all people (3 letters or more)
Altersabteilung Weidenhain
Die Suche findet alle Personen aller Abteilungen, auch passive Mitglieder, Jugendfeuerwehr und Altersabteilung. Höchstens 10 Treffer, nur Name und Abteilung. Gäste aus Nachbarwehren trägt der Verfasser im Bericht ein. => The search finds all people of all departments, including passive members, youth fire brigade and veterans. At most 10 matches, name and department only. Guests from neighbouring brigades are entered by the author in the report.
Hans Brenner
Nicht dabei? => Not listed?
9 eingetragen => 9 signed in
Die Jugendfeuerwehr schreibt keine Einsatzberichte. In ihrer Ansicht stehen deshalb nur Dienste und kein „Neuer Einsatz“. => The youth fire brigade writes no incident reports. Its view therefore shows only services and no “New incident”.
Dienst · heute 14:00–16:30 => Service · today 14:00–16:30
Freitag, 23.10.2026 · Jugendfeuerwehr Musterstadt => Friday, 23.10.2026 · Jugendfeuerwehr Musterstadt
Jugendfeuerwehrdienst: Knoten und Stiche => Youth fire brigade service: knots and hitches
Eintragen bis 19:12 => Sign-in until 19:12
Eintragen geht während eines Einsatzes und bis eine Stunde nach seinem Ende, bei Diensten ab 30 Minuten vor Beginn bis eine Stunde nach dem Ende. Ohne eingetragenes Einsatzende schließt das Eintragen 6 Stunden nach dem Alarm. Den Bericht schreibt weiterhin der Verfasser in f.orga. => Sign-in is possible during an incident and up to one hour after its end, for services from 30 minutes before the start until one hour after the end. Without an entered end of the incident, sign-in closes 6 hours after the alarm. The author still writes the report in f.orga.
Abt. Musterstadt (Abteilung der Wache) => Dept. Musterstadt (department of the station)
Abt. Musterstadt, Jugendfeuerwehr Musterstadt, Altersabteilung Musterstadt => Dept. Musterstadt, Jugendfeuerwehr Musterstadt, Altersabteilung Musterstadt
Am Terminal wird die Abteilung umgeschaltet. Einsätze gibt es nur für Einsatzabteilungen, die übrigen tragen sich für Dienste ein. => The department is switched at the terminal. Incidents exist only for operational departments; the others sign in for services.
Das Anzeigen steht im Audit-Log. Wer den Link hat, kann für die Abteilungen dieses Terminals eintragen. Ist er in falsche Hände geraten: „Neuer Link“. => Showing the link is recorded in the audit log. Whoever has the link can sign people in for the departments of this terminal. If it got into the wrong hands: “New link”.
Ein Infoterminal ist ein Gerät an einer Wache. Es braucht kein Benutzerkonto, kann nur eintragen und nichts lesen außer Namen der Abteilung und den offenen Einsätzen und Diensten. Anlegen, Link anzeigen, neuer Link und Widerruf stehen im Audit-Log. => An info terminal is a device at a station. It needs no user account, can only sign people in and reads nothing except names of its departments and the open incidents and services. Creation, showing the link, new link and revocation are recorded in the audit log.
Feuerwehrhaus Musterstadt · Abt. Musterstadt, Jugendfeuerwehr Musterstadt, Altersabteilung Musterstadt => Feuerwehrhaus Musterstadt · Dept. Musterstadt, Jugendfeuerwehr Musterstadt, Altersabteilung Musterstadt
Infoterminal öffnen => Open info terminal
Link von Tablet Fahrzeughalle => Link of tablet vehicle hall
Weitere Abteilung => Additional department
Öffnen Sie den Link auf dem Gerät an der Wache; danach bleibt das Gerät angemeldet. Unter „Link anzeigen“ lässt er sich später wieder abrufen. => Open the link on the device at the station; the device then stays signed in. “Show link” brings it up again later.
Abt. Musterstadt · zuletzt gesehen 21.10.2026 19:02 => Dept. Musterstadt · last seen 21.10.2026 19:02
Abt. Musterstadt, Jugendfeuerwehr, Altersabteilung · zuletzt gesehen heute 14:31 => Dept. Musterstadt, youth fire brigade, veterans · last seen today 14:31
Link anzeigen => Show link
Mitglieder tragen sich dort nach Einsätzen und Diensten ein. „Öffnen“ startet das Infoterminal in diesem Browser, z. B. auf dem Tablet der Wache (nur mit dem Recht, Infoterminals zu verwalten). => Members sign in there after incidents and services. “Open” starts the info terminal in this browser, e.g. on the station tablet (only with the right to manage info terminals).
Anmeldung an der Brücke => Sign-in to the bridge
Dateien und Archive zuordnen => Assign files and archives
Datensätze und Probelauf => Datasets and dry run
Einstellungen: Ziele, Token, Gemerktes => Settings: targets, token, remembered choices
Ergebnisbericht => Result report
Export nach MP-Feuer (in Vorbereitung) => Export to MP-Feuer (in preparation)
MP-Feuer-Brücke => MP-Feuer bridge
Nicht zugeordnete Bezeichnungen => Unmatched names
Verlauf der Läufe => History of runs
f.orga: Import ohne MP-Feuer-Datenübernahme => f.orga: import without MP-Feuer data transfer
Übernahme mit Fortschritt => Import with progress
Übersicht im Testsystem => Overview in the test system
Übersicht mit Ziel und Verbindung => Overview with target and connection
Konten der Brücke sind unabhängig von f.orga. Die Brücke ist nur im lokalen Netz erreichbar. Das erste Konto wird mit dem Einrichtungsschlüssel aus dem Protokoll des Dienstes angelegt. => Bridge accounts are independent of f.orga. The bridge is reachable only in the local network. The first account is created with the setup key from the service log.
Konto => Account
1 Bereich fehlt => 1 scope missing
API-Token => API token
Abt. Ahornfeld => Dept. Ahornfeld
Abteilungen, Einheiten, übersprungene Archive und Optionen des Echtsystems werden vergessen. Bei der nächsten Übernahme schlägt die Brücke wieder über die Namen vor. Aliasse in f.orga bleiben. => Departments, units, skipped archives and options of the real system are forgotten. On the next import the bridge suggests by name again. Aliases in f.orga stay.
Abteilungsbericht => Department report
Adresse => Address
Adresse von f.orga => Address of f.orga
Archivnummer => Archive number
Ausgang => Output
Automatisch übernehmen, wenn der Probelauf keine Fehler und keine offenen Bezeichnungen hat => Import automatically if the dry run has no errors and no open names
Bearbeiten … => Edit …
Das Token wird verschlüsselt gespeichert und nicht wieder angezeigt. „Verbindung prüfen“ zeigt Version, Feuerwehr und fehlende Bereiche. => The token is stored encrypted and never shown again. “Check connection” shows version, brigade and missing scopes.
Datensätze und Optionen => Datasets and options
Der Ordner ist ein Verzeichnis im Volume der Brücke, z. B. als Netzwerkfreigabe eingebunden. Neue Dateien erscheinen auf der Übersicht. => The folder is a directory in the bridge's volume, e.g. mounted as a network share. New files appear on the overview.
Die Brücke speichert das Token verschlüsselt und zeigt es nie wieder an. => The bridge stores the token encrypted and never shows it again.
Echtsystem => Real system
Eingangsordner => Inbox folder
Eingangsordner und Zeitplan => Inbox folder and schedule
Einheit im Dateinamen => Unit in the file name
Einsatzberichte als => Incident reports as
Einsatzleiter vom Dienst (EvD) => Duty officer (EvD)
Export nach MP-Feuer => Export to MP-Feuer
Gemerkte Auswahl zurücksetzen … => Reset remembered choices …
Gemerkte Auswahl zurücksetzen? => Reset remembered choices?
Gemerkte Zuordnungen => Remembered assignments
Gesamtfeuerwehr
Gewählt => Selected
In f.orga unter „Verwaltung → API-Tokens“ ein Token „MP-Feuer-Brücke“ mit diesen Bereichen erzeugen und hier eintragen: => In f.orga under “Administration → API tokens”, create a token “MP-Feuer bridge” with these scopes and enter it here:
Konten => Accounts
Konto anlegen => Create account
Konto der Brücke => Bridge account
Neue Übernahme => New import
Ordner Echtsystem => Folder real system
Ordner Testsystem => Folder test system
Personen, Lehrgänge, G26, Belastungsübungen, Einsatzpersonal => Persons, courses, G26, stress exercises, incident personnel
Probelauf => Dry run
Standard: aus. Sonst wartet jeder Lauf auf Bestätigung. => Default: off. Otherwise every run waits for confirmation.
Test => Test
Testsystem => Test system
Testsystem (gelbes Band über allen Seiten) => Test system (yellow band above all pages)
Token => Token
Token in f.orga erzeugen => Create the token in f.orga
Unbekannte Stichworte anlegen => Create unknown keywords
Verbindung => Connection
Verbindung prüfen => Check connection
Verlauf => History
Vorhandene Personen aktualisieren => Update existing persons
Zeitplan => Schedule
Ziel => Target
Ziel bearbeiten => Edit target
Ziel hinzufügen => Add target
Ziele => Targets
Zielsystem wählen => Choose target system
Zuletzt => Last
Zuletzt angemeldet => Last sign-in
Zuordnungen von Bezeichnungen speichert f.orga als Alias am Eintrag, nicht die Brücke. => f.orga, not the bridge, stores the mapping of names as alias of the entry.
Zurücksetzen => Reset
an => on
f.orga öffnen => Open f.orga
gültig bis 30.06.2027 => valid until 30.06.2027
gültig bis 31.12.2027 => valid until 31.12.2027
heute 19:01 => today 19:01
leer lassen, um das gespeicherte Token zu behalten => leave empty to keep the stored token
verbunden => connected
verbunden · f.orga 1.4.0 · => connected · f.orga 1.4.0 ·
wöchentlich, Montag => weekly, Monday
Übernahme => Import
übersprungen => skipped
Als CSV herunterladen => Download as CSV
Anzahl => Count
Audit in f.orga => Audit in f.orga
Austritt nicht übernommen (vorhandene Person). => Exit not taken over (existing person).
Beispiele => Examples
Belastungsübungen => Stress exercises
Bericht in f.orga bearbeitet, nicht ersetzt. => Report edited in f.orga, not replaced.
Bezeichnungen zuordnen => Map names
Dateien & Archive => Files & archives
Datensatz => Dataset
Datensätze & Probelauf => Datasets & dry run
Die CSV enthält alle Zeilen mit Meldungen: Datensatz, Archiv, Zeile, Bezeichnung, Code und Text. => The CSV contains all rows with messages: dataset, archive, row, label, code and text.
Einsatzpersonal => Incident personnel
Ergebnis je Datensatz => Result per dataset
G26-Untersuchungen => G26 examinations
Geändert => Changed
Lehrgänge, Dienstgrade, Ehrungen => Courses, ranks, honours
Meldung => Message
Meldungen nach Art => Messages by type
Person nicht gefunden. Person in f.orga anlegen oder Datensatz „Personen“ übernehmen. => Person not found. Create the person in f.orga or import the dataset “Persons”.
Person steht zweimal im selben Bericht. => Person is listed twice in the same report.
Stichwort angelegt. => Keyword created.
Unverändert => Unchanged
Wert => Value
Zum Verlauf => To the history
am 26.10.2026 19:07 in 52 s. 4 Zeilen mit Fehlern wurden übersprungen. => on 26.10.2026 19:07 in 52 s. 4 rows with errors were skipped.
Übernommen => Imported
Adapter mit Parametern (z. B. Abteilung, Zeitraum) und Test gegen die Beispieldatei. => Adapter with parameters (e.g. department, period) and a test against the sample file.
Braucht im Token => Needs in the token
Daten aus f.orga => Data from f.orga
Einsatzberichte mit Personal => Incident reports with personnel
Export => Export
Hier erscheinen dann Parameter und „Datei erzeugen“; die Datei wird in MP-Feuer importiert. => Parameters and “Create file” then appear here; the file is imported into MP-Feuer.
In Vorbereitung. => In preparation.
Laufbahn der Personen => Career of the persons
Lehrgänge und Qualifikationen => Courses and qualifications
MP-Feuer übernimmt Daten über seinen Tabellen-Import mit Vorlagen (CSV/Excel). Sobald Beispieldateien der Vorlagen vorliegen, bekommt jeder Export einen eigenen Adapter. Bis dahin erzeugt die Brücke keine Dateien. => MP-Feuer takes data through its table import with templates (CSV/Excel). As soon as sample files of the templates are available, each export gets its own adapter. Until then the bridge creates no files.
So kommt ein Export dazu => How an export is added
Stammdaten, Mitgliedschaften => Master data, memberships
Stand => State
Vorlage fehlt => Template missing
Vorlage und Beispieldatei aus MP-Feuer bereitstellen. => Provide the template and a sample file from MP-Feuer.
) übernimmt die => ) are imported by the
. Sie übergibt die Daten über die API an f.orga; Übernahmen stehen im Audit-Log. => . It passes the data to f.orga through the API; imports are recorded in the audit log.
Datei wählen => Choose file
Eine Zeile je => One row per
Eintrag der Laufbahn => Career entry
EvD-Dienstplan => Duty officer roster
Excel (.xlsx), CSV (.csv, .txt) oder Kalender (.ics), höchstens 10 MB => Excel (.xlsx), CSV (.csv, .txt) or calendar (.ics), at most 10 MB
Importprofile => Import profiles
MP-Feuer-Brücke öffnen => Open MP-Feuer bridge
MP-Feuer-Transferdateien ( => MP-Feuer transfer files (
Nur Profile, für die Sie das Recht haben. Unbekannte Bezeichnungen lassen sich nach der Prüfung zuordnen und werden als Alias gemerkt. => Only profiles you have the permission for. Unknown names can be mapped after the check and are remembered as aliases.
Person und Bericht (Einsatz, Bericht, Status, Statistik in eigenen Spalten) => Person and report (incident, report, status, statistics in own columns)
Profil => Profile
Schritt 1 von 4: Datei => Step 1 of 4: File
Tabelle hierher ziehen => Drag a table here
Teilnahme an einem Dienst => Attendance at a service
Termin (.ics) => Appointment (.ics)
Untersuchung => Examination
Übung einer Person => Exercise of a person
Abbrechen … => Cancel …
Der laufende Teil wird noch fertig übernommen, danach hält die Brücke an. Bereits übernommene Teile bleiben in f.orga. => The running part is still imported completely, then the bridge stops. Parts already imported stay in f.orga.
Die Seite darf geschlossen werden; der Lauf geht weiter. => You may close the page; the run continues.
Jeder Teil ist in f.orga eine eigene Übernahme mit Audit-Eintrag. Einsätze werden nie auf zwei Teile verteilt. Ein abgebrochener Lauf lässt die fertigen Teile stehen; ein neuer Lauf mit denselben Dateien ergänzt den Rest, ohne zu verdoppeln. => Each part is an import of its own in f.orga with an audit entry. Incidents are never split across two parts. A cancelled run keeps the finished parts; a new run with the same files adds the rest without duplicating.
Nach diesem Teil anhalten => Stop after this part
Weiter übernehmen => Continue importing
Zum Ergebnis => To the result
fertig => done
gestartet 19:06 · Lauf => started 19:06 · run
läuft => running
Übernahme abbrechen? => Cancel import?
Übernahme ins Echtsystem läuft => Import into the real system is running
(26.10.2026 19:04, 41 s). Nichts wurde geändert. 9 Bezeichnungen sind offen, 4 Zeilen haben Fehler. => (26.10.2026 19:04, 41 s). Nothing was changed. 9 names are open, 4 rows have errors.
Auswahl und Optionen sind für das Echtsystem gemerkt. „Vorhandene Personen aktualisieren“ ist aus, damit f.orga für Personen führend bleibt. => Selection and options are remembered for the real system. “Update existing persons” is off so that f.orga stays leading for persons.
Datensätze => Datasets
Erneut prüfen => Check again
Optionen => Options
Probelauf fertig => Dry run finished
Probelauf in 3 Teilen je Datensatz mit mehr als 2 000 Zeilen => Dry run in 3 parts per dataset with more than 2 000 rows
Reihenfolge wie in f.orga: erst Personen, dann was auf sie verweist => Order as in f.orga: persons first, then what refers to them
Weiter zur Zuordnung (9) => Continue to mapping (9)
Zeilen => Rows
(Parallelbetrieb) => (parallel operation)
) und übergibt die Daten über die API an f.orga. Zuordnungen von Bezeichnungen merkt sich f.orga als Alias. Abteilungen und Einheiten der Archive merkt sich die Brücke je Ziel. => ) and passes the data to f.orga through the API. f.orga remembers mapped names as aliases. The bridge remembers departments and units of the archives per target.
Bereiche des Tokens => Scopes of the token
Dateien hier hochladen oder in den Eingangsordner legen. => Upload the files here or put them into the inbox folder.
Die Brücke liest MP-Feuer-Transferdateien ( => The bridge reads MP-Feuer transfer files (
Einsatzberichte führt => Incident reports led by
In MP-Feuer die Transferdateien aller Abteilungen exportieren. => Export the transfer files of all departments in MP-Feuer.
In f.orga Kostenbescheide und Auszahlungslauf. => In f.orga: cost notices and payout run.
Läufe => Runs
MP-Feuer
Neue Dateien im Eingangsordner => New files in the inbox folder
Offene Bezeichnungen => Open names
Ordner leer => Folder empty
Personen, Laufbahn, Kataloge, G26, Belastungsübungen, Dienste, Einsatzpersonal => Persons, career, catalogs, G26, stress exercises, services, incident personnel
Probelauf 24.10.2026 18:40 · 7 Archive · 3 offene Bezeichnungen => Dry run 24.10.2026 18:40 · 7 archives · 3 open names
Probelauf, offene Bezeichnungen zuordnen, übernehmen. => Dry run, map open names, import.
Testsystem: Übernahmen ändern nur die Testdaten. => Test system: imports change only the test data.
Verbindung zu Testsystem => Connection to test system
Verbindung zu Echtsystem => Connection to real system
Version => Version
Wöchentliche Routine => Weekly routine
Zeitplan: montags 06:00 Probelauf mit der gemerkten Auswahl (aus). Übernommen wird nur nach Bestätigung. => Schedule: Mondays 06:00 dry run with the remembered choices (off). Import only after confirmation.
Zeitplan: montags 06:00 Probelauf mit der gemerkten Auswahl. Übernommen wird nur nach Bestätigung. => Schedule: Mondays 06:00 dry run with the remembered choices. Import only after confirmation.
fehlt => missing
seit 01.09.2026 => since 01.09.2026
vorhanden => present
· gültig bis 31.12.2027 => · valid until 31.12.2027
· technischer Benutzer => · technical user
– Alarmstichworte können in der Zuordnung nur gewählt, nicht angelegt werden. => – alarm keywords can only be chosen in the mapping, not created.
Fehler der letzten Übernahme => Errors of the last import
seit Montag, 26.10.2026 06:00 => since Monday, 26.10.2026 06:00
Übernommen 19.10.2026 19:12 · 7 Archive · 1 412 neu, 2 830 geändert, 4 Fehler => Imported 19.10.2026 19:12 · 7 archives · 1 412 new, 2 830 changed, 4 errors
Abteilung in f.orga => Department in f.orga
Aus dem Eingangsordner (7) => From the inbox folder (7)
Datei und Inhalt => File and content
Dateien wählen => Choose files
Erkannte Archive (7) => Detected archives (7)
MPTRA-Dateien hierher ziehen => Drag MPTRA files here
Neues Archiv: Abteilung über den Namen vorgeschlagen. => New archive: department suggested by name.
Nr. => No.
Transferdateien von MP-Feuer, je Abteilung eine. Höchstens 40 Dateien, je 200 MB. => Transfer files of MP-Feuer, one per department. At most 40 files, 200 MB each.
Weiter zu den Datensätzen => Continue to the datasets
Ziel: => Target:
Zuordnung je Archivnummer gemerkt für das Echtsystem => Assignment per archive number remembered for the real system
gemerkt => remembered
lag ebenfalls vor. Es gilt die neuere Datei vom 26.10.2026. => was present as well. The newer file of 26.10.2026 is used.
neu, Vorschlag => new, suggested
oder => or
Überspringen => Skip
Alle Ziele => All targets
Bericht => Report
Dateien => Files
Läufe und Berichte bleiben 12 Monate gespeichert. Hochgeladene Dateien löscht die Brücke nach dem Lauf, spätestens nach 24 Stunden. => Runs and reports are kept for 12 months. The bridge deletes uploaded files after the run, at the latest after 24 hours.
Ziel filtern => Filter target
abgebrochen => cancelled
nach Teil 2 von 3, Einsatzpersonal => after part 2 of 3, incident personnel
wartet auf Bestätigung => waiting for confirmation
übernommen => imported
. Name auf Englisch und weitere Angaben lassen sich danach in f.orga ergänzen. => . The English name and further details can be added in f.orga afterwards.
6 von 9 zugeordnet => 6 of 9 mapped
Alarmstichwort => Alarm keyword
Alarmstichworte (1) => Alarm keywords (1)
Alle (9) => All (9)
Anderer Lehrgang
Anlegen und zuordnen => Create and map
Art filtern => Filter type
B2 BMA
B2 Brand Gebäude
Braucht im Token den Bereich => Needs the token scope
Diensttyp => Session type
Diensttypen (1) => Session types (1)
Diese Werte aus MP-Feuer passen zu keinem Eintrag im Echtsystem. Wählen Sie einen Eintrag oder legen Sie einen an; leer heißt ignorieren. Die Zuordnung gilt für alle Datensätze dieses Laufs und wird bei der Übernahme in f.orga als Alias gespeichert. Der nächste Import erkennt den Wert dann von selbst. => These values from MP-Feuer match no entry in the real system. Choose an entry or create one; empty means ignore. The mapping applies to all datasets of this run and is stored in f.orga as alias on import. The next import then recognises the value by itself.
Ehrennadel des Kreisfeuerwehrverbands
Ehrenzeichen Silber
Ehrungen (1) => Honours (1)
Eintrag in f.orga => Entry in f.orga
Fahrzeuge (1) => Vehicles (1)
Fahrzeuge werden in f.orga in der Organisation angelegt, hier nur gewählt. Falsche Zuordnungen lassen sich in f.orga am Eintrag unter „Aliasse“ entfernen. => Vehicles are created in f.orga under organisation and only chosen here. Wrong mappings can be removed in f.orga at the entry under “Aliases”.
Funktionen (1) => Functions (1)
Keine Funktion (ignorieren) => No function (ignore)
Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn => No function – incident during working hours for the employer
Keine Funktion – Verdienstausfall => No function – loss of earnings
Legt im Echtsystem einen Lehrgang an und ordnet „Drohnenpilot“ ihm zu. => Creates a course in the real system and maps “Drohnenpilot” to it.
Lehrgänge (4) => Courses (4)
Neuen Eintrag anlegen => Create new entry
Sanitätsausbildung
Schlüssel => Key
Truppmann Teil 2
Vorkommen => Occurrences
Wartung => Maintenance
Wert in MP-Feuer => Value in MP-Feuer
Zuordnungen geändert. Bitte erneut prüfen, bevor übernommen wird. => Mappings changed. Please check again before importing.
Übernehmen … => Import …
Übung => Exercise
'''

EN = {}
GLEICH = set()
for zeile in TEXTE.strip().splitlines():
    if ' => ' in zeile:
        de, en = zeile.split(' => ', 1)
        EN[de.strip()] = en.strip()
    elif zeile.strip():
        GLEICH.add(zeile.strip())
