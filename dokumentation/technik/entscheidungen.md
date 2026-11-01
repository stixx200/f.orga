# Entscheidungen

Getroffene Architektur- und Produktentscheidungen. Offene Entscheidungen werden als GitHub-Issues geführt.

| Nr. | Thema | Status |
| --- | --- | --- |
| [E1](#e1-datenbank) | Datenbank | entschieden |
| [E2](#e2-mandanten) | Mandanten | entschieden |
| [E3](#e3-anmeldung) | Anmeldung | entschieden |
| [E4](#e4-entschädigung-in-release-1) | Entschädigung in Release 1 | entschieden |
| [E5](#e5-atemschutz-regel) | Atemschutz-Regel | entschieden |
| [E6](#e6-modul-nachladen) | Modul-Nachladen | entschieden |
| [E7](#e7-hosting) | Hosting | entschieden |
| [E8](#e8-jahresstatistik) | Jahresstatistik | entschieden |
| [E9](#e9-beförderung-und-probezeit) | Beförderung und Probezeit | entschieden |
| [E10](#e10-personal-doppelung) | Personal-Doppelung | entschieden |
| [E11](#e11-sprache) | Sprache | entschieden |
| [E12](#e12-rettungsdienst-und-krankentransport-nicht-erfassen) | Rettungsdienst und Krankentransport nicht erfassen | entschieden |
| [E13](#e13-einsatzleiter-pauschale-über-dienstplan) | Einsatzleiter-Pauschale über Dienstplan | entschieden |
| [E14](#e14-rolle-lehrgangsbeauftragter) | Rolle Lehrgangsbeauftragter | entschieden |
| [E15](#e15-automatisch-speichern-nachvollziehbar-und-rückgängig) | Automatisch speichern, nachvollziehbar und rückgängig | entschieden |
| [E16](#e16-freigabe-zweistufig-prüfung-vor-auszahlung) | Freigabe zweistufig, Prüfung vor Auszahlung | entschieden |
| [E17](#e17-primärfarbe-und-formen) | Primärfarbe und Formen | entschieden |

## E1 Datenbank

- **Frage**: PostgreSQL oder MariaDB?
- **Entscheidung**: Nur **PostgreSQL**.
 - Es wird nur ein SQL-Dialekt getestet und migriert.
 - Historie und Listenkonfiguration liegen als JSONB.
 - Partielle Unique-Indizes erzwingen „genau ein Hauptbericht je Einsatz“ in der Datenbank.
 - Gesichert wird mit `pg_dump`.
- **Status**: entschieden

## E2 Mandanten

- **Frage**: Soll eine Installation mehrere Feuerwehren (Gemeinden) verwalten können?
- **Entscheidung**: Eine Feuerwehr je Installation, mit beliebig vielen Abteilungen. Wer mehrere Gemeinden betreut, betreibt mehrere Stacks.
- **Status**: entschieden

## E3 Anmeldung

- **Frage**: Eigene Benutzerverwaltung oder Anbindung an einen Identitätsdienst?
- **Vorschlag**: Release 1 mit lokalen Konten:
 - Passwort mit scrypt
 - Sitzungs-Cookie
 - Passwort-Reset per E-Mail

 OIDC (z. B. Microsoft 365 der Gemeinde, Keycloak) folgt in Release 4 als zusätzliche Option. Rechte und Rollen bleiben immer in f.orga.
- **Konsequenz**: Keine weitere Infrastruktur nötig. Mitglieder brauchen ein eigenes Passwort.
- **Status**: entschieden; lokale Konten und OIDC sind umgesetzt (siehe [Architektur → Sicherheit](./architektur.md#sicherheit))

## E4 Entschädigung in Release 1

- **Frage**: Release 1 umfasst Einsatzberichte und Stammdaten. Wie viel der Entschädigung gehört dazu?
- **Entscheidung**:
 - **Release 1**: Die Berechnung je Person liegt im Einsatzbericht: Sätze mit Gültigkeit, Rundung, Bereitschaft, Arbeitszeit-Kennzeichen. Dazu kommt ein Excel-Export der freigegebenen Berichte, der `auswertung.py` ersetzt.
 - **Release 2**: Das Modul [Entschädigungen](./architektur.md#modul-entschädigungen-compensation) bringt Auszahlungsläufe, Korrekturposten, PDF je Person, Dienste und Pauschalen. Die Sätze für Einsätze liegen dann in diesem Modul; eine Migration übernimmt sie.
- **Status**: entschieden

## E5 Atemschutz-Regel

- **Frage**: Nach welcher Regel ist eine Person atemschutztauglich?
- **Entscheidung**: Die Regel ist einstellbar, der Standard folgt der **FwDV 7**:
 - gültige Eignungsuntersuchung
 - Unterweisung, Belastungsübung (80 kJ, ab 50 Jahren 60 kJ) sowie Einsatzübung oder Realeinsatz unter Atemschutz, jeweils höchstens 12 Monate zurück

 Details siehe [Modul Atemschutz](./architektur.md#modul-atemschutz-respiratory-protection).
- **Status**: entschieden

## E6 Modul-Nachladen

- **Frage**: Wie werden Zusatzprodukte „reingeladen“?
- **Vorschlag**:
 - **Release 0/1**: Alle Module des Repositorys sind im Image enthalten und werden in der Shell aktiviert oder deaktiviert. Das Frontend lädt aktive Module zur Laufzeit per Module Federation.
 - **Release 4**: Externe Plugin-Pakete (`.tgz` mit Backend-Bundle, Frontend-Bundle und Manifest) per Upload oder Volume `/plugins`, mit Neustart und Signaturprüfung.
- **Konsequenz**: Der Modulvertrag wird von Anfang an so gebaut, dass externe Pakete ihn ohne Änderung nutzen können. Die eingebauten Module sind der Prüfstein dafür.
- **Status**: entschieden; eingebaute Module und signierte Plugin-Pakete sind umgesetzt (siehe [Architektur → Plugins](./architektur.md#plugins))

## E7 Hosting

- **Frage**: Wo läuft f.orga im Regelbetrieb?
- **Entscheidung**: **Self-Hosting** per Docker Compose auf einem Server oder NAS der Gemeinde bzw. bei einem deutschen Hoster. HTTPS über den optionalen Caddy-Container mit Let's Encrypt, alternativ hinter einem vorhandenen Reverse Proxy der Gemeinde.
- **Konsequenz**:
  - Keine Kosten für SaaS; die Daten bleiben bei der Gemeinde.
  - Sicherung und Updates verantwortet der Betreiber.
  - Betriebsdoku und Varianten: [Betrieb](./betrieb.md#hosting).
- **Status**: entschieden

## E8 Jahresstatistik

- **Frage**: Welche Merkmale erhebt die Feuerwehrstatistik BW, und in welchem Format wird abgegeben?
- **Entscheidung**: Abgegeben wird über die Import-Vorlage des Statistikportals der LFS BW mit den Fragen F1–F129 (siehe Modul Einsatzberichte in [architektur.md](architektur.md#modul-einsatzberichte-incidents)).
  - f.orga befüllt die Vorlage und erzeugt zusätzlich eine CSV im bisherigen MP-Feuer-Format.
  - Die Merkmale im Einsatzbericht richten sich nach den Fragen der Vorlage.
  - Offene Ausbaupunkte (CSV/PDF, Drill-down, Portal-Klärung): [#87](https://github.com/stixx200/f.orga/issues/87).
  - Einzelne Zählweisen sind noch mit dem Landesportal zu klären. Bis dahin gelten einstellbare Standards.
- **Status**: entschieden

## E9 Beförderung und Probezeit

- **Frage**: Wer befördert, und wie lang ist die Probezeit?
- **Entscheidung**: Regelt die örtliche Feuerwehrsatzung Beförderungen nicht, gilt die VwV Feuerwehrbekleidung und Dienstgrade.
 - **Befördernde Stelle**: Einstellung, Standard ist der Kommandant nach Anhörung des Feuerwehrausschusses.
 - **Probezeit**: 12 Monate als Einstellung. Aufnahme auf Probe, Verkürzung, Verlängerung und endgültige Aufnahme sind Schritte in den [Stammdaten](architektur.md#modul-stammdaten-masterdata). Entscheidendes Gremium ist der Feuerwehrausschuss.
- **Status**: entschieden

## E10 Personal-Doppelung

- **Frage**: Was gilt, wenn dieselbe Person zur gleichen Zeit in zwei Berichten steht?
- **Entscheidung**:

  | Fall | Verhalten |
  | --- | --- |
  | Im **selben Einsatz**, sich überschneidende Zeiträume | **Fehler** – Bericht kann nicht fertig gemeldet werden |
  | Über **verschiedene Einsätze** hinweg | **Warnung** (doppelte Entschädigung möglich), mit Begründung bestätigbar (z. B. Folgeeinsatz) |
  | Aneinandergrenzende Zeiträume | keine Überschneidung |

- **Konsequenz**: Entspricht der Duplikatprüfung der bisherigen Abrechnung. Die Prüfung läuft beim Speichern und Fertigmelden (nicht erst bei der Abrechnung). Umgesetzt als Prüfregeln `personnel-overlap-incident` (Fehler) und `personnel-overlap-other` (Warnung) im Modul `incidents`; die Oberfläche verlangt für Warnungen eine Begründung.
- **Status**: entschieden

## E11 Sprache

- **Frage**: In welcher Sprache werden Code, Oberfläche und Dokumentation geschrieben?
- **Entscheidung**:
 - **Code englisch**: Bezeichner, Kommentare, Datei- und Ordnernamen, API-Pfade, Datenbank-Schemas und -Tabellen, Berechtigungs-IDs und Testnamen.
 - **Oberfläche zweisprachig** (Deutsch und Englisch, umschaltbar). Die Sprache ist Teil des Benutzerprofils. Jede sichtbare Zeichenkette läuft über einen Übersetzungsschlüssel mit Einträgen für beide Sprachen.
 - **Dokumentation deutsch**, mit einem [Glossar](glossar.md), das Fachbegriffe den Code-Begriffen zuordnet.
- **Konsequenz**:
 - Listen und Ausdrucke entstehen in der Sprache des Benutzers.
 - Amtliche Formate (Jahresstatistik, Kostenbescheid) bleiben deutsch.
- **Status**: entschieden

## E12 Rettungsdienst und Krankentransport nicht erfassen

- **Frage**: Braucht der Einsatzbericht die Einsatzhauptarten Rettungsdienst NAW, Rettungsdienst RTW und Krankentransport (Landesvorlage F46–F49)?
- **Entscheidung**: Nein. Die Feuerwehr leistet keinen Rettungsdienst. Einsatzhauptarten sind Brand/Explosion, Technische Hilfe, Fehlalarm und Sonstiges. Unterstützung des Rettungsdienstes zählt als Technische Hilfe „sonstige“. F46–F49 bleiben in der Abgabedatei leer.
- **Konsequenz**: umgesetzt im Modul `incidents` (`MainType`, Stichwortvorlage, Jahresstatistik).
- **Status**: entschieden

## E13 Einsatzleiter-Pauschale über Dienstplan

- **Frage**: Wird die Pauschalentschädigung des Einsatzleiters im Einsatzbericht erfasst?
- **Entscheidung**: Nein. Der Einsatzleiter vom Dienst ist ein EvD-Dienst nach Kalender. Die Termine werden aus einer iCal-Datei übernommen (Importprofil `duty-officer.roster`) oder von Hand gepflegt und je vollem Tag entschädigt (Musterstadt: 10 € je Tag). Im Bericht gibt es keine Einsatzleiter-Pauschale; Zuschläge bleiben für andere Fälle konfigurierbar.
- **Konsequenz**: umgesetzt als EvD-Dienstplan im Modul [Einsatzleiter vom Dienst](./architektur.md#modul-einsatzleiter-vom-dienst-duty-officer), enthalten im Abrechnungsexport. Das Modul [Entschädigungen](./architektur.md#modul-entschädigungen-compensation) übernimmt den Dienstplan. Der EvD schreibt zusätzlich zu jedem Einsatz einen eigenen EvD-Bericht; dessen Einsatzstunden werden standardmäßig neben der Pauschale vergütet (`dutyOfficerReportPaid`).
- **Status**: entschieden

## E14 Rolle Lehrgangsbeauftragter

- **Frage**: Wer plant Lehrgangsvormerkungen und -anmeldungen?
- **Entscheidung**: Die Standardrolle „Lehrgangsbeauftragter“ (Vorlage `course-coordinator`) mit `masterdata.persons.read` und `masterdata.courses.plan`. Sie pflegt Vormerkungen und Anmeldungen, nutzt die Lehrgangsplanung und trägt Teilnahmen mit Ergebnis ein. Personendaten ändert sie nicht; den Lehrgangskatalog pflegt der Administrator.
- **Konsequenz**: umgesetzt über die Rollenvorlagen des Core; Teilnahmen dürfen mit `masterdata.persons.write` oder `masterdata.courses.plan` eingetragen werden.
- **Status**: entschieden

## E15 Automatisch speichern, nachvollziehbar und rückgängig

- **Frage**: Braucht der Berichtseditor einen Speichern-Knopf?
- **Entscheidung**: Nein, die Oberfläche speichert automatisch. Jede Änderung ist über die Historie nachvollziehbar und über Versionen des Berichts rückgängig zu machen.
- **Konsequenz**: Berichtsversionen sind umgesetzt (siehe [Modul Einsatzberichte](./architektur.md#modul-einsatzberichte-incidents)): Speicherungen desselben Benutzers innerhalb von 10 Minuten bilden eine Version, Wiederherstellen ist eine normale Speicherung. Die Oberfläche zeigt eine Aktion „Versionen“.
- **Status**: entschieden

## E16 Freigabe zweistufig, Prüfung vor Auszahlung

- **Frage**: Welche Freigabe ist der Normalfall?
- **Entscheidung**: Zuerst „zur Entschädigungsauszahlung“, dann „zur Abrechnung“; am Ende wird beides gebraucht. Die erste Stufe ist per Einstellung abschaltbar (`incidents.general.compensationRelease`). Vor der Auszahlung wird geprüft, ob Berichte des Zeitraums noch Probleme beim Personal haben (kein Personal, kein Betrag, keine oder ungültige Zeit, kein Fahrzeug, Doppelungen) oder nicht freigegeben sind.
- **Konsequenz**: umgesetzt als Einstellung `compensationRelease` und Prüfung `GET /api/incidents/compensation/check`; das Blatt „Hinweise“ des Abrechnungsexports zeigt dieselben Probleme.
- **Status**: entschieden

## E17 Primärfarbe und Formen

- **Frage**: Darf Rot auch für „Anlegen“ und die Navigation stehen, und wie rund sind die Formen?
- **Entscheidung**: Ja, die Dienstfarbe ist Primärfarbe für die Hauptaktion (Speichern, Anlegen, Freigeben) und die aktive Navigation; je Ansicht eine rote Hauptaktion. Die Gestaltung ist eckig und Material-nah: Eckenradius 4 px, flache Schatten nach Höhenstufen, Reiter mit roter Unterstreichung.
- **Konsequenz**: `Stil.md` (Abschnitt „Hauptaktion und Formen“), Theme in `libs/web/web-ui` und das Theme in `libs/web/web-ui` folgen dem.
- **Status**: entschieden
