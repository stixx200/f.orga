# Mockups Release 1

**Status: zur Freigabe.** Das Frontend einer App wird erst umgesetzt, wenn ihre Mockups freigegeben sind. Die Mockups des Infoterminals (`infoterminal/` und die Karte der Wache in `stammdaten/organisation.html#wache`) und des [Aufbewahrungsplans](../../implementiert/aufbewahrung.md) (`shell/aufbewahrung.html`, `shell/aussonderung.html`, Karte „Aufbewahrung“ in `einsatzberichte/einsatz.html`) sind freigegeben und umgesetzt. Zur Freigabe sind die Mockups des Moduls MP-Feuer (`mp-feuer/`) und des Konzepts [Führerscheinkontrolle](../module/fuehrerscheinkontrolle.md). Die Mockups zum Datenschutz (`datenschutz/`) sind freigegeben.

Die Mockups zeigen Aufbau, Abläufe und Inhalte der Oberflächen von Shell, Stammdaten und Einsatzberichte, dazu das Modul Infoterminal (Kiosk-Seite je Wache) und das Modul MP-Feuer ([Konzept](../module/mp-feuer.md)). Sie funktionieren nicht und enthalten nur erfundene Daten. Farben, Schrift, Tabellen sowie Kopf- und Fußzeile folgen `Stil.md`.

## Öffnen

`index.html` per Doppelklick im Browser öffnen. Es braucht keinen Server und keine Internetverbindung.

- **Handyansicht**: Fenster unter 860 px schmal ziehen oder den Gerätemodus der Entwicklerwerkzeuge nutzen. Das Menü öffnet sich über ☰, die Suche über die Lupe.
- **Sprache**: Umschalter DE/EN oben rechts, auf dem Handy im Menü, auf der Anmeldeseite oben rechts. Die Wahl bleibt im Browser gespeichert. Ein Link mit `?sprache=en` öffnet eine Seite direkt auf Englisch.
- **Dialoge**: Ein Link mit `#<dialog-id>` öffnet einen Dialog direkt, z. B. `einsatzberichte/pruefung.html#d-sperre`. Im Berichtseditor springt `#s6` zum Schritt „Prüfen“. `#<id>` einer Auswahl wählt sie aus, z. B. `infoterminal/buchung.html#bereitschaft`.

## Gestaltung

- **Farben** nach `Stil.md`: Dienstfarbe `#8C1D18` für Titel, Tabellenkopf, aktive Navigation, aktive Reiter und Hauptaktionen. Wechselzeilen `#FBF7F6`, Hauptbericht `#F3E4E2`, Warnflächen `#F8ECEB`, erledigt `#EEF6F0`, Seitengrund `#F7F4F3`.
- **Ergänzungen** zu `Stil.md`: Rahmen von Eingabefeldern `#9B8A88` (3:1 gegen Weiß, WCAG 1.4.11) und Hinweisgelb `#FFF6E0` mit Text `#6B4B00` für Warnungen, die keine Fehler sind.
- **Schrift** Arial, ersatzweise Helvetica.
- **Formensprache** nach Material Design, eckig statt rund:
  - Eckenradius 4 px für Karten, Felder, Schaltflächen, Dialoge, Plaketten und Chips. Keine Pillen. Rund sind nur Avatare, Symbolknöpfe und die Nummern der Schritte.
  - Schatten nach Material-Höhenstufen: Karten und Tabellen elevation 1, Kopfzeile (App-Bar) elevation 4, Menüs und Vorschlagslisten elevation 8, aufgeklapptes Handymenü elevation 16, Dialoge elevation 24. Keine weichen großen Schatten, keine Glas- oder Unschärfe-Effekte.
  - Kopfzeile weiß mit elevation 4, Kicker in Dienstrot. Seitenleiste als flache Liste; die aktive Zeile liegt auf hellem Rot (`#F3E4E2`) mit rotem Text und roter Kante links.
  - Reiter wie MUI-Tabs: Text in Großbuchstaben, der aktive Reiter ist rot und 2 px rot unterstrichen. Die Schritte des Berichtseditors sind eine flache Leiste mit derselben Unterstreichung.
  - Eingabefelder in der Variante „outlined“: Label fett darüber, Rahmen `#9B8A88`, beim Fokus 2 px Dienstrot.
  - Abstände im 8-px-Raster.
  - Symbole sind einfarbige Strichsymbole statt Emoji.
- **Schaltflächen** wie MUI, Beschriftung in Großbuchstaben mit leichter Laufweite, 36 px hoch (auf dem Handy mindestens 44 px):
  - *contained* in Dienstrot mit weißer Schrift: die eine Hauptaktion eines Bereichs, z. B. Speichern, Anlegen, Fertig melden, Freigeben, auch „Berichte prüfen (4)“ als Einstieg.
  - *outlined* in Dienstrot: eine zweite Aktion gleicher Art.
  - *outlined* neutral: alle übrigen Aktionen.
  - *text*: Nebenaktionen wie „Versionen“ oder „Besatzung wie letzter Einsatz“.
- **Zustände** stehen immer als Text in der Plakette (z. B. „überfällig“, „Fehler: kein Hauptbericht“). Die Farbe unterstützt nur.
- **Meldungen** beginnen mit „Fehler:“ oder „Warnung:“ und nennen die Abhilfe. Fehler verhindern das Fertigmelden, Warnungen brauchen eine Begründung.
- **Kritische Aktionen** fragen in einem Dialog nach und zeigen, was passiert:
  - Freigeben, Zurückgeben, Sperre aufheben (mit Pflicht-Begründung und Zielstatus)
  - Hauptbericht wechseln
  - Verfasser erinnern: E-Mail-Versand nur über diesen Dialog, wie in `Stil.md` gefordert
  - Benutzer sperren, Token widerrufen, Austritt erfassen
- **Barrierefreiheit**:
  - Jedes Feld hat ein verknüpftes Label; der Generator setzt `for`/`id` automatisch.
  - Fokus ist überall sichtbar (3 px Dienstfarbe, bei Eingabefeldern 2 px Rahmen in Dienstfarbe), dazu ein Sprunglink „Zum Inhalt springen“.
  - Kontraste erfüllen WCAG AA.
  - Touch-Ziele sind auf dem Handy mindestens 44 px hoch.
- **Handy**:
  - Die Seite scrollt nie waagerecht; das ist für alle Seiten in beiden Sprachen bei 375 px geprüft.
  - Listen-Tabellen (Klasse `stapel`) werden zu Karten mit Beschriftung je Feld.
  - Dialoge erscheinen als Blatt vom unteren Rand.
  - Die Aktionsleiste klebt unten.

## Seiten

| App | Seite | Inhalt |
| --- | --- | --- |
| Shell | `shell/anmeldung.html` | Anmeldung mit Sprachumschalter, optional Gemeinde-Konto (OIDC) |
| | `shell/start.html` | Meine offenen Berichte, Kacheln (zur Prüfung, offene Berichte, Fristen, Einsätze), Fristen und Aufgaben mit Fälligkeit, letzte Einsätze |
| | `shell/benutzer.html` | Benutzerliste, Rollenzuweisung je Bereich, Verknüpfung mit Person, Profilsprache, Sperren mit Bestätigung |
| | `shell/rollen.html` | Rollen mit Berechtigungen der Module (Kennungen wie im Code, z. B. `incidents.reports.release`) |
| | `shell/module.html` | Module aktiv/inaktiv mit Abhängigkeiten, spätere Module |
| | `shell/einstellungen.html` | Feuerwehr (inkl. Gemeinde und Einwohnerzahl), Wappen, E-Mail, Erinnerungen, Datenschutz, Import/Export |
| | `shell/api-tokens.html` | Tokens mit Bereich, Ablauf, letzter Nutzung, Widerruf mit Bestätigung |
| Stammdaten | `stammdaten/personen.html` | Personenliste mit Statusfiltern (u. a. Probezeit), Filtern und Kennzeichen |
| | `stammdaten/person.html` | Personenakte mit Reitern. Sensible Karten (Geburtsdaten, Arbeitgeber, Bank) sind gekennzeichnet; ein Mockup-Schalter zeigt die Ansicht ohne Recht „Sensible Felder“, auch in der Historie (Wert ausgeblendet). Reiter Feuerwehr mit Aufnahme, Probezeit, Status ändern und Austritt erfassen |
| | `stammdaten/person-neu.html` | Person anlegen: Aufnahme auf Probe, Ende der Probezeit, Hinweis auf ähnliche Person |
| | `stammdaten/organisation.html` | Baum aus Gesamtwehr, Abteilungen, Wachen und Fahrzeugen; Sonderaufgaben der Abteilung |
| | `stammdaten/fahrzeug.html` | Fahrzeugdaten mit Statistik-Kategorie (Pflicht), Außerdienststellung und Historie |
| | `stammdaten/lehrgangsplanung.html` | Vormerkungen je Lehrgang mit Prüfung der Voraussetzung, weitere Kandidaten zum gemeinsamen Vormerken, Meldeliste |
| | `stammdaten/listen.html` | Listenvorlagen inkl. Probezeit und Altersgrenzen, Unterschriftenliste mit Sprache der Liste |
| | `stammdaten/import.html` | Import-Assistent: Spalten zuordnen, Vorschau mit Fehlern |
| Einsatzberichte | `einsatzberichte/einsaetze.html` | Einsatzliste mit Haupt- und Nebenbericht je Abteilung, Status, Sperre |
| | `einsatzberichte/einsatz.html` | Einsatz mit Berichtskarten je Abteilung, Hauptbericht hervorgehoben, Hauptbericht wechseln mit Bestätigung, Karte „Statistik“ des Einsatzes mit allen Merkmalen der Landesvorlage, Karte „Aufbewahrung“ mit „30 Jahre aufbewahren (Sonderfall)“ |
| | `einsatzberichte/bericht.html` | Berichtseditor, Nebenbericht Musterstadt, Schritt Personal mit Fehler und Warnung, Versionen mit Wiederherstellen |
| | `einsatzberichte/bericht-haupt.html` | Berichtseditor, Hauptbericht Weidenhain, Schritt Prüfen ohne Befunde |
| | `einsatzberichte/pruefung.html` | Prüfliste des Kommandanten, zweistufige Freigabe (Entschädigungsauszahlung, dann Abrechnung), Zurückgeben, Sperre aufheben, leerer Zustand, Auszahlungslauf mit „Probleme vor der Auszahlung“ vor dem Export |
| | `einsatzberichte/offene-berichte.html` | Offene Berichte nach Verfasser, Verfasser zuweisen, Erinnerung mit Bestätigung |
| | `einsatzberichte/jahresstatistik.html` | Jahresstatistik: Vorschau mit Herkunft je Wert, Plausibilitätsprüfung, Korrektur, Abschluss |
| | `einsatzberichte/einstellungen.html` | Entschädigungssätze mit Gültigkeit, Rundung, Freigabe in zwei Stufen (abschaltbar), Stichwort-Katalog mit Einsatzhauptart und Unterkategorie, Prüfregeln, Kataloge |
| Infoterminal (umgesetzt: [Modul Infoterminal](../../implementiert/architektur.md#modul-infoterminal-info-terminal)) | `infoterminal/start.html` | Kiosk-Seite einer Wache ohne Shell-Rahmen: Abteilungsumschalter, offene Einsätze und Dienste im Zeitfenster, „+ Neuer Einsatz“ |
| | `infoterminal/start-jugend.html` | Ansicht der Jugendfeuerwehr am selben Terminal: nur Dienste, kein „Neuer Einsatz“ |
| | `infoterminal/personen.html` | „Wer sind Sie?“: Namenskacheln der gewählten Abteilung mit Sprungleiste, Eingetragene mit Haken, Suche über alle Personen (auch passive und Altersabteilung) |
| | `infoterminal/buchung.html` | Eintragen: Fahrzeug (Bezeichnung · Funkrufname (Abteilung)) oder Bereitschaft, Funktion, Atemschutz, Verdienstausfall, Arbeitszeit, abweichende Zeit; bei Bereitschaft (`#bereitschaft`) ohne Atemschutz und abweichende Zeit; Bestätigung `#d-eingetragen` |
| | `infoterminal/eingetragen.html` | Eingetragene je Fahrzeug; eigene Eintragungen ändern und austragen (`#d-aendern`), Eintragungen des Verfassers gesperrt |
| | `infoterminal/neuer-einsatz.html` | Neuer Einsatz mit Stichwort und Alarm; passende Einsätze anderer Abteilungen `#d-treffer` |
| | `infoterminal/dienst.html` | Anwesenheit für einen Dienst der Jugendfeuerwehr eintragen (unbestätigt wie der QR-Check-in, ohne Atemschutz) |
| | `infoterminal/leer.html` | Nichts offen |
| | `infoterminal/gesperrt.html` | Link ungültig oder widerrufen |
| | `infoterminal/verwaltung.html` | Terminals je Wache mit Abteilungen und zuletzt gesehen, anlegen mit Abteilungsauswahl (`#d-link`), Link jederzeit anzeigen, kopieren und öffnen (`#d-link-anzeigen`), neuer Link, Widerruf; Menü „Verwaltung → Infoterminals“ |
| | `stammdaten/organisation.html#wache` | Karte der Wache mit ihren Infoterminals und Abteilungen, „Öffnen“, „Link anzeigen“ und Link zur Verwaltung |
| Führerscheinkontrolle (Konzept) | `stammdaten/person-fuehrerschein.html` | Führerschein in der Personalakte: Klassen mit Befristung je Klasse, Kontrollen mit Art und Prüfer, Transponder; Dialoge Kontrolle erfassen (`#d-kontrolle`, ohne Kopie/Foto), Erneute Vorlage anfordern (`#d-vorlage`), Transponder registrieren (`#d-transponder`) und sperren (`#d-sperren`) |
| | `stammdaten/fuehrerscheinkontrollen.html` | Liste der Zielgruppe mit Stand (überfällig, Ersterfassung fehlt, Vorlage angefordert, Klassen fehlen), Nachweis für die Gemeinde |
| | `stammdaten/fuehrerschein-einstellungen.html` | Modus anlassbezogen (Standard) oder zusätzlich regelmäßig, Zielgruppe, Selbstkontrolle mit Grenzen |
| | `infoterminal/fuehrerschein.html`, `infoterminal/fuehrerschein-bestaetigen.html` | Selbstkontrolle am Infoterminal: scannen, Selbsterklärung bestätigen (`#d-kontrolliert`), unbekannter Code (`#d-unbekannt`) |
| | `shell/mein-fuehrerschein.html` | „Mein Bereich“: eigener Führerschein, Selbstkontrolle mit NFC oder Kamera (`#d-selbst`) |
| | `shell/start.html#aufgaben` | Aufgabe „Führerscheinkontrolle fällig“ |
| Datensicherung | `sicherung/uebersicht.html` | Stand, letzte und nächste Sicherung, Ziel, Warnung zur Passphrase, „Jetzt sichern“ (`#d-jetzt`) |
| | `sicherung/einstellungen.html` | Ziel unter `/backups`, Zeitplan, Aufbewahrung, Verschlüsselung mit Passphrase, Inhalt, Benachrichtigung |
| | `sicherung/sicherungen.html` | Sicherungen mit Status und Prüfung; Prüfen (`#d-pruefen`) mit Wiederherstellung testen, Herunterladen und Löschen (`#d-mehr`) |
| | `sicherung/wiederherstellen.html`, `sicherung/wiederherstellung-laeuft.html` | Assistent: Bestätigen mit Name der Feuerwehr und Zahlen, Fortschritt mit Wartungsmodus |
| | `sicherung/wartung.html` | Wartungsseite für alle anderen Benutzer |
| Aufbewahrung | `shell/aufbewahrung.html` | Einstellungen → Datenschutz: Frist und Aktion je Datenkategorie, Vorlage „Kommunaler Aktenplan (Beispiel)“ (`#d-vorlage`) |
| | `shell/aussonderung.html` | Aussonderung: fällige Datensätze, dem Archiv anbieten (`#d-anbieten`), Entscheidung des Archivs (`#d-entscheidung`), zurückstellen (`#d-zurueck`) |

### Modul MP-Feuer

Seiten im Rahmen der Shell unter „Verwaltung → MP-Feuer“ ([Konzept](../module/mp-feuer.md)). Reiter verbinden die Seiten des Moduls.

| Seite | Inhalt |
| --- | --- |
| `mp-feuer/start.html` | Übersicht: letzte Übernahme, gemerkte Zuordnungen, Läufe, Stand („Einsatzberichte führt“), wöchentliche Routine |
| `mp-feuer/uebernahme.html` | Schritt 1: Dateien hochladen, erkannte Archive mit Abteilung, „Einsatzberichte als“, Überspringen und gemerkter Auswahl |
| `mp-feuer/probelauf.html` | Schritt 2: Datensätze in Reihenfolge mit Optionen und Ergebnis des Probelaufs |
| `mp-feuer/zuordnung.html` | Schritt 3: nicht zugeordnete Bezeichnungen wie im Tabellen-Import, Filter nach Art, Zusatzziele bei Funktionen, „Neuen Eintrag anlegen“ (`#d-neu`) |
| `mp-feuer/lauf.html` | Schritt 4: Hintergrundlauf in Teilen mit Fortschritt, Abbrechen nach dem laufenden Teil (`#d-abbrechen`) |
| `mp-feuer/ergebnis.html` | Schritt 5: Zähler je Datensatz, Meldungen nach Code und Wert mit Beispielen, CSV |
| `mp-feuer/verlauf.html` | Läufe mit Benutzer, Dateien und Ergebnis (auch abgebrochen, unterbrochen) |
| `mp-feuer/zuordnungen.html` | Zuordnungsliste des Moduls, Suche und Filter, Ziel gelöscht oder inaktiv markiert, Löschen (`#d-loeschen`) |
| `mp-feuer/einstellungen.html` | Gemerkte Auswahl je Archivnummer, Datensätze und Optionen, Zurücksetzen (`#d-vergessen`); Eingangsordner und Zeitplan als „später“ |
| `mp-feuer/export.html` | Export nach MP-Feuer: Platzhalter „in Vorbereitung“, geplante Exporte mit „Vorlage fehlt“ |
| `mp-feuer/tabellen-import.html` | Import-Seite des Core: Hinweis auf das Modul, Reiter „Gemerkte Zuordnungen“ mit der Zuordnungsliste des Tabellen-Imports (`#d-loeschen-core`) |

### Datenschutz

Seiten zum [Datenschutzkonzept](../datenschutz.md). Die Seiten der Verwaltung liegen unter „Verwaltung → Datenschutz“ mit Reitern (Anfragen, Verzeichnis, Einstellungen); der Menüeintrag fehlt in der Seitenleiste der Mockups, damit die übrigen Seiten unverändert bleiben.

| Seite | Inhalt |
| --- | --- |
| `datenschutz/person.html` | Personalakte, Reiter „Datenschutz“: sensible Daten ausgeblendet bis zum Step-up (`#d-stepup`), Anfragen der Person mit Frist, Einwilligungen mit Widerruf, Information nach Art. 13/14, Einschränkung (`#d-einschraenkung`), erstellte Auskünfte; „Auskunft erstellen“ (`#d-auskunft`), „Anfrage erfassen“ (`#d-anfrage`), „Einwilligung erfassen“ (`#d-einwilligung`) |
| `datenschutz/auskunft-vorschau.html` | Beispielseiten der Auskunft als PDF: Deckblatt mit den Angaben nach Art. 15 Abs. 1, Stammdaten, Einsätze ohne Namen anderer, Atemschutz als Gesundheitsdaten, Benutzerkonto und Protokolle; Übergabe vermerken (`#d-uebergabe`) |
| `datenschutz/anfragen.html` | Betroffenenanfragen mit Frist und Stand, Kennzahlen, Auskunft zu einer anderen Person (Beteiligte, Kostenschuldner, `#d-dritte`), Datenpanne |
| `datenschutz/anfrage.html` | Löschantrag mit Löschprüfung je Modul (löschen, anonymisieren, einschränken bis), Empfänger informieren, Ausführen mit Namensbestätigung (`#d-loeschen`) |
| `datenschutz/verzeichnis.html` | Verzeichnis der Verarbeitungstätigkeiten als Entwurf aus den Modulen, eine Tätigkeit im Detail mit Feldern der Gemeinde und technischen Maßnahmen |
| `datenschutz/einstellungen.html` | Kontakte (Verantwortlicher, DSB, Aufsichtsbehörde), Textbausteine als Vorlage oder geprüft, Katalog der Einwilligungen, Sicherheit (Zwei-Faktor, Leerlauf, E-Mails ohne Namen, Stand HTTPS und Sicherung) |
| `datenschutz/mein-bereich.html` | Mein Bereich: eigene Einwilligungen, Auskunft anfordern und herunterladen, Berichtigung beantragen (`#d-berichtigung`), eigene Anfragen, „Anmeldungen als Sie“ |
| `datenschutz/hinweis.html` | Datenschutzhinweis ohne Anmeldung, aus Textbausteinen und Verzeichnis |
| `datenschutz/erste-anmeldung.html` | Hinweis bei der ersten Anmeldung mit Kenntnisnahme und freiwilligen Einwilligungen |
| `datenschutz/zwei-faktor.html` | Zweiten Faktor einrichten (App verbinden, Code bestätigen, Wiederherstellungscodes); Bestätigung beim Öffnen sensibler Daten mit Übersicht der Bereiche und Dialog „Bitte bestätigen Sie mit Ihrem Code“ (`#d-stepup`) |

### Berichtseditor

Fünf Schritte. Jeder Schritt zeigt seinen Zustand (vollständig, Fehler, bitte prüfen). Auf dem Handy erscheinen nur die Nummern, der Titel des aktuellen Schritts steht darunter. Am Ende jedes Schritts führen „Zurück“ und „Weiter“ zum Nachbarschritt.

1. **Zeiten & Ort**
2. **Personal & Fahrzeuge**
   - Fahrzeugkarten mit Stärke (1/8) und belegten Plätzen, dazu Bereitschaft je Wache.
   - Die Personensuche schlägt Treffer vor. Ein Tipp auf das Ziel („LF 20/16“, „Bereitschaft“) ordnet die Person zu.
   - Personen, die schon in einem anderen Bericht stehen, sind nicht wählbar.
   - Ein Tipp auf eine Person öffnet den Dialog mit Fahrzeugwechsel, Funktion, Zeiten, Atemschutz, Verdienstausfall, Arbeitszeit und „Selbst zu Schaden gekommen“ (für die eigenen Verletzten der Statistik).
3. **Lage & Verlauf** mit Textbausteinen und Wetterlage
4. **Beteiligte & Sonstiges**
5. **Prüfen**: alle Fehler und Warnungen mit Sprung zum Abschnitt; fehlt die Statistik des Einsatzes, führt der Fehler am Hauptbericht zur Seite des Einsatzes

Die **Statistik** steht nicht im Bericht, sondern einmal je Einsatz auf der Seite des Einsatzes (Karte „Statistik“):
   - Einsatzort: eigene Gemeinde oder Überlandhilfe
   - Einsatzhauptart
   - je nach Art: Brandgröße (Kleinbrand A/B, Mittel-, Großbrand), TH-Kategorie 1–8 (ankreuzen, was zutrifft; die kleinste Nummer zählt) oder Fehlalarmart (gutgläubig, böswillig, BMA)
   - Kennzeichen Fahrzeugbrand, Verkehrsunfall, Kat-Voralarm, Kat-Einsatz
   - gerettete Personen, davon mit Rauchgasvergiftung, Tote, gerettete Tiere
   - eigene verletzte und tödlich verunglückte Einsatzkräfte aus dem Personal aller Berichte

„Fertig melden“ ist immer aktiv. Mit offenen Fehlern führt es zu Schritt 5, sonst fragt ein Dialog nach. Gespeichert wird automatisch, es gibt keine Schaltfläche „Speichern“. Die Aktionsleiste zeigt Zeitpunkt und offene Fehler. „Versionen“ listet jede gespeicherte Version mit Zeitpunkt, Benutzer und Änderung; „Wiederherstellen“ legt eine neue Version mit dem alten Stand an.

## Ändern

Die Seiten werden mit `python3 _generator/bauen.py` aus den Skripten in `_generator/` erzeugt. Die HTML-Dateien nicht von Hand ändern.

| Datei | Inhalt |
| --- | --- |
| `rahmen.py` | Kopf, Seitenleiste, Fußzeile, Symbole und Bausteine: `tabelle()`, `dialog()`, `leer()` |
| `shell.py`, `stammdaten.py`, `einsatzberichte.py`, `infoterminal.py`, `mpfeuer.py`, `datenschutz.py` | Seiteninhalte je App; `datenschutz.py` mit Reitern der Verwaltungsseiten (`vseite()`) und eigenen Stilen für die PDF-Vorschau; `infoterminal.py` baut die Kiosk-Seiten mit eigenem Kopf (`tk()`) ohne Seitenleiste, `mpfeuer.py` die Seiten des Moduls MP-Feuer mit Reitern (`mseite()`) |
| `fuehrerschein.py` | Konzept zur Freigabe: Führerscheinkontrolle (Stammdaten, Infoterminal, Mein Bereich) |
| `aufbewahrung.py` | Aufbewahrung und Aussonderung (freigegeben, umgesetzt) |
| `sicherung.py` | Modul Datensicherung (freigegeben, umgesetzt) |
| `uebersetzung_datenschutz.py` | Englische Texte der Datenschutz-Seiten, gleiches Format wie `uebersetzung.py` (dort eingebunden) |
| `uebersetzung.py` | Englische Texte als Zeilen `Deutsch => English`. Zeilen ohne `=>` sind Daten, die gleich bleiben (Namen, Orte, Fahrzeuge, Kataloge). Dazu Muster für wiederkehrende Formen. |
| `assets/mockup.css` | Gemeinsames Aussehen |
| `assets/mockup.js` | Reiter und Schritte, Menü, Dialoge, bedingte Statistikfelder, Sprachumschalter |
| `assets/i18n.js` | wird aus `uebersetzung.py` erzeugt |

`bauen.py` prüft am Ende:
- alle internen Links
- ob jeder sichtbare Text eine Übersetzung hat

Fehlende Texte stehen dann in `_generator/fehlende-uebersetzungen.txt`, und das Skript endet mit Fehlercode 1.

## Entschiedene Designfragen

1. **Speichern im Berichtseditor.** Der Editor speichert automatisch und hat keine Schaltfläche „Speichern“. Die Aktionsleiste zeigt „Automatisch gespeichert 13:42“, offline am Handy „Nicht gespeichert – keine Verbindung“. Änderungen sind über die Historie nachvollziehbar und über die Versionen des Berichts rückgängig zu machen.
2. **Freigabe in zwei Stufen.** Der Kommandant gibt zuerst zur Entschädigungsauszahlung frei, nach der Auszahlung zur Abrechnung. Die erste Stufe lässt sich in den Einstellungen der Einsatzberichte abschalten; dann gibt es nur „Freigeben zur Abrechnung“, die Auszahlung ist darin enthalten. Vor dem Export eines Auszahlungslaufs zeigt die Prüfseite „Probleme vor der Auszahlung“: Bericht ohne Personal, Person ohne Betrag, keine oder ungültige Zeit, Person ohne Fahrzeug oder Bereitschaft, Doppelungen und nicht freigegebene Berichte. Exportiert wird erst, wenn kein Fehler mehr offen ist.
3. **Rot ist Primärfarbe.** Dienstrot gilt für die Hauptaktion eines Bereichs (Speichern, Anlegen, Fertig melden, Freigeben) und für die aktive Navigation, je Bereich höchstens eine rote Schaltfläche.

## Offene Designfragen

4. **Kataloge in Englisch.** Dienstgrade, Funktionen, Lehrgänge, Qualifikationen und Leitstellen-Stichworte bleiben in der englischen Oberfläche deutsch, weil sie Daten der Feuerwehr bzw. der BW-Vorlage sind. Übersetzt werden die festen Kategorien der Landesstatistik und alle Oberflächentexte.
   *Vorschlag:* Kataloge bekommen optional ein Feld „Bezeichnung (englisch)“; ohne Eintrag wird der deutsche Name gezeigt.
5. **Datums- und Zahlenformat in Englisch.** Die Mockups zeigen auch auf Englisch `21.10.2026` und `45,00 €`.
   *Vorschlag:* Die echte Oberfläche formatiert nach der Sprache (`21 Oct 2026`, `€45.00`). Exporte für Behörden bleiben deutsch.
6. **Personal am Handy bei großen Einsätzen.** Bei vier und mehr Fahrzeugen wird die Seite lang.
   *Vorschlag:* Fahrzeugkarten auf dem Handy einklappbar machen (Kopf mit Stärke bleibt sichtbar). Dazu ein Filter „nur Personen mit Hinweis“.
7. **Erkennbarkeit der Statistik-Unterfelder.** Brandgröße, TH-Kategorie und Fehlalarmart erscheinen nur zur gewählten Einsatzhauptart. Im Mockup ist deshalb nur die Brandgröße zu sehen; die anderen zeigt ein Klick auf „Technische Hilfe“ bzw. „Fehlalarm“.
   *Vorschlag:* so lassen. Bei Wechsel der Hauptart bleiben bereits gewählte Unterwerte erhalten und werden beim Speichern verworfen.
8. **Brandgröße.** Die Erläuterungen (Kleinlöschgeräte, 1 C-Rohr, 2–3 C-Rohre, mehr) sind die üblichen Definitionen. Sie müssen noch mit der Fragestellung des Statistikportals abgeglichen werden (siehe offene Punkte in `jahresstatistik.md`).
   *Vorschlag:* Texte nach der Antwort des Portals anpassen.
