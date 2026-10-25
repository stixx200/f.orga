# Modul Einsatzberichte

Release 1. Benötigt: Stammdaten. Nutzt optional: Geräte, Atemschutz, Entschädigungen, Kostenersatz. Modul-ID `incidents`. Alle Oberflächen sind deutsch und englisch (siehe [Mehrsprachigkeit](../architektur.md#mehrsprachigkeit)).

**Bereits umgesetzt (Backend)**, beschrieben in [implementiert/architektur.md](../../implementiert/architektur.md#modul-einsatzberichte-incidents) und [Schnittstellen](../../implementiert/schnittstellen.md#incidents):
- Stichwort-Katalog mit BW-Vorlage, Einsätze mit Leitstellen- oder interner Nummer, Berichte je Abteilung mit allen Abschnitten, Hauptbericht-Eindeutigkeit
- Prüfregeln mit Stufen und bestätigten Warnungen, Entschädigung je Person
- Ablauf mit Fertigmelden, Zurückgeben, zweistufiger Freigabe (erst Entschädigung, dann Abrechnung; erste Stufe abschaltbar, [E16](../entscheidungen.md#e16-freigabe-zweistufig-prüfung-vor-auszahlung)), Sperre und Sperre aufheben
- Versionen zum Rückgängigmachen beim automatischen Speichern ([E15](../entscheidungen.md#e15-automatisch-speichern-nachvollziehbar-und-rückgängig))
- Prüfung vor der Entschädigungsauszahlung (nicht freigegebene Berichte, Personalprobleme)
- Statistikmerkmale im Hauptbericht mit Vorschlag, Jahresstatistik für das Landesportal
- externe API, MP-Feuer-Import der Einsätze, Listen, Abrechnungsexport, Dienstplan (Sonderdienste) mit iCal-Import, Fristen für Verfasser und Freigeber

**Bereits umgesetzt (Oberfläche)**, beschrieben in [implementiert/architektur.md](../../implementiert/architektur.md#oberfläche-einsatzberichte): Einsatzliste mit Anlegen, Einsatzseite mit Berichtskarten und Hauptberichtswechsel, Berichtseditor mit sechs Abschnitten, automatischem Speichern, Versionen und Verlauf, Fertigmelden mit begründeten Warnungen, „Zur Prüfung“ mit Zurückgeben, zweistufiger Freigabe und Sperre aufheben, Kacheln auf der Startseite. Das Szenario Gruppenführer/Kommandant ist durch einen E2E-Test abgedeckt.

Ebenso umgesetzt: Offene Berichte mit „Verfasser erinnern“, Entschädigung (Prüfung und Export), Dienstplan, Jahresstatistik und Einstellungen.

**Offen:**
- Textbausteine, „Besatzung wie letzter Einsatz“, Vorschläge mit Qualifikationen und Doppelungen bei der Personensuche
- OpenAPI-Beschreibung unter `/api/docs`
- Vorschlag der Brandgröße aus den eingesetzten Rohren (mit Modul Geräte)
- CSV der Jahresstatistik im MP-Feuer-Format

Die folgenden Abschnitte beschreiben das Zielbild.

## Grundbegriffe

- **Einsatz**: Ereignis der Leitstelle, eindeutig über die **Leitstellennummer**. Einsätze ohne Leitstellennummer (z. B. Brandsicherheitsdienst, Selbstalarmierung) bekommen eine interne Nummer.
- **Einsatzbericht**: Bericht **einer** Abteilung zu einem Einsatz. Je Einsatz und Abteilung gibt es höchstens einen Bericht.
- **Hauptbericht**: Genau ein Bericht je Einsatz. Er trägt die Statistikmerkmale für die Gesamtwehr. Alle anderen sind Nebenberichte. Wird ein Bericht zum Hauptbericht, verliert der bisherige Hauptbericht diese Eigenschaft in derselben Aktion. Die Datenbank sichert die Eindeutigkeit über einen partiellen Unique-Index.

## Inhalt eines Einsatzberichts

| Abschnitt | Felder |
| --- | --- |
| Kopf | Einsatz (Leitstellennummer), Abteilung, Berichtsnummer der Abteilung (fortlaufend je Jahr), Haupt-/Nebenbericht, Verfasser (Person, Standard: wer anlegt), Status |
| Zeiten | Alarmierung, Ausrücken, Eintreffen, Einsatzende, Einrücken. Für Entschädigung und Personal zählen **von** (Alarmierung) bis **bis** (Einrücken bzw. Einsatzbereitschaft wiederhergestellt). |
| Einsatzort | Straße, Hausnummer, PLZ, Ort, Ortsteil, Objekt, Zusatz, optional Koordinaten |
| Alarmierung | Einsatzstichwort (Katalog der Leitstelle, z. B. „B2 Brand Wohnhaus“, „TH1 Person in Not“), Alarmiert durch, Meldebild |
| Lage und Verlauf | Lage bei Eintreffen, Maßnahmen/Verlauf, Ursache (soweit bekannt), Einsatzleiter. Freitext mit Bausteinen. |
| Statistik | Merkmale der Feuerwehrstatistik BW, vorbefüllt (siehe unten), nur im Hauptbericht Pflicht |
| Personal | Person, Fahrzeug **oder** „Bereitschaft auf Wache“ (Wache wählbar), Funktion, unter Atemschutz ja/nein (mit Dauer, optional), von/bis (Standard aus den Berichtszeiten, je Person änderbar), Verdienstausfall, „Einsatz während Arbeitszeit beim Dienstherrn“ |
| Fahrzeuge | Fahrzeug, Ausrücken/Einrücken (Standard aus den Berichtszeiten), km, Besatzung ergibt sich aus dem Personal |
| Geräte | Verwendete Geräte und Verbrauchsmaterial. Mit Modul Geräte: Auswahl aus dem Bestand und Rückmeldung „Prüfung nach Einsatz nötig“. Ohne Modul: Freitext. |
| Wetter | Wettereinfluss ja/nein, Wetterlage (Katalog: Regen, Schnee, Glätte, Sturm, Hitze, Gewitter, Nebel) |
| Beteiligte | Rolle (Geschädigter, Verursacher, Zeuge, Eigentümer, Halter, Melder, Sonstige), Name, Anschrift, Telefon, Kennzeichen, Bemerkung. Grundlage für Kostenersatz. |
| Sonstige Kräfte | Organisation (Polizei, Rettungsdienst, THW, Notarzt, Nachbarfeuerwehr, Energieversorger, …, freier Eintrag möglich), Anzahl Kräfte/Fahrzeuge, Bemerkung |
| Personenschäden | gerettete Personen (davon mit Rauchgasintoxikation), tote Personen, verletzte bzw. tödlich verunglückte eigene Einsatzkräfte, Tierrettung |
| Kosten | kostenpflichtig ja/nein, Begründung. Mit Modul Kostenersatz: Übergabe an den Bescheid. |
| Anhänge | Fotos, Alarmfax, Skizzen |

### Regeln für das Personal

- Jede Person ist **entweder** einem Fahrzeug **oder** der Bereitschaft auf einer Wache zugeordnet. Ausnahmen: Berichte von Führungseinheiten und Sonderdiensten sowie Einsatzarten ohne Fahrzeugpflicht (z. B. Sicherheitsdienst). Diese Ausnahmen hängen am Abteilungstyp und am Stichwort-Katalog, nicht an festen Namen.
- Die Besatzung eines Fahrzeugs darf die Besatzungsplätze nicht übersteigen (Warnung).
- **Keine Doppelungen innerhalb eines Einsatzes**: Eine Person darf in den Berichten desselben Einsatzes nicht in sich überschneidenden Zeiträumen stehen. Das ist ein Fehler. Eine Person kann also nacheinander erst für Abteilung A und dann für B eingesetzt sein, aber nicht gleichzeitig.
- **Überschneidung mit anderen Einsätzen** derselben Person ist eine Warnung, denn sie ergäbe eine doppelte Entschädigung. Zeiträume, die genau aneinander grenzen, gelten nicht als Überschneidung.
- Personen kommen aus den Stammdaten. Auswahl schnell per Suchfeld und per „Besatzung von Fahrzeug X wie beim letzten Einsatz“. Gäste (Nachbarwehr) werden als Freitext erfasst und nicht entschädigt.

### Entschädigung im Bericht

Für jede Person berechnet der Bericht die Entschädigung des Einsatzes:

- **Einsatz**: angefangene Einsatzstunden × Stundensatz. Beispiel: 13:05–14:10 ergibt 2 Stunden.
- **Bereitschaft auf der Wache**: immer genau 1 Stunde × Stundensatz.
- **Sätze** sind konfigurierbar mit Gültigkeitszeitraum (z. B. 12,50 € bis 30.06.2025, ab 01.07.2025 15,00 €) und je Art (Einsatz, Bereitschaft, ggf. weitere Arten). Die Rundungsregel ist ebenfalls einstellbar (angefangene Stunde als Standard, halbe Stunde oder Minuten-Takt für andere Satzungen).
- **Zuschläge** (z. B. Atemschutz-Zuschlag, Schmutzzulage) sind optionale Positionen je Person; die Standardeinstellung enthält keine. Eine Einsatzleiter-Pauschale gibt es im Bericht nicht: Pauschalen für den Einsatzleiter vom Dienst kommen aus dem Dienstplan (Sonderdienste, iCal-Import), siehe [E13](../entscheidungen.md#e13-einsatzleiter-pauschale-über-dienstplan).
- „Einsatz während der Arbeitszeit beim Dienstherrn“ ergibt keine Entschädigung. Bei dieser Markierung sind Verdienstausfall und Betrag gesperrt.
- Der berechnete Betrag ist sichtbar, kann aber von Berechtigten mit Begründung überschrieben werden.
- Die Auszahlungslisten und Personen-PDFs erzeugt das Modul [Entschädigungen](../../implementiert/architektur.md#modul-entschädigungen-compensation). In Release 1 gibt es dafür einen Excel-Export der freigegebenen Berichte eines Zeitraums, der die heutige `auswertung.py` ersetzt (Betrag pro Person, Summe je Abteilung, Einsätze, Sonderdienste, Hinweise, Überschneidungen).
- **Vor der Auszahlung** prüft das System alle Berichte des Zeitraums auf Probleme beim Personal (kein Personal, kein Betrag, keine oder ungültige Zeit, kein Fahrzeug, Doppelungen) und auf nicht freigegebene Berichte. Die Oberfläche zeigt die Liste vor dem Export; im Export steht sie im Blatt „Hinweise“ (umgesetzt, siehe [implementiert/architektur.md](../../implementiert/architektur.md#modul-einsatzberichte-incidents)).

## Ablauf und Status

```
            Verfasser                        Kommandant (Recht incidents.reports.release)
  ┌─────────┐  fertig melden  ┌──────────────┐  freigeben   ┌──────────────────────────────┐
  │ Entwurf │ ──────────────▶ │ Zur Prüfung  │ ───────────▶ │ Freigegeben zur              │
  └─────────┘ ◀────────────── └──────────────┘              │ Entschädigungsauszahlung     │
       ▲        zurückgeben         │                       └──────────────┬───────────────┘
       │                            │ freigeben (beides)                   │ freigeben
       │                            ▼                                      ▼
       │                       ┌──────────────────────────────────────────────┐
       │                       │ Freigegeben zur Abrechnung                   │
       │                       │ (schließt Entschädigungsauszahlung ein)      │
       │                       └──────────────────────────────────────────────┘
       │
       └──── Sperre aufheben (Kommandant): zurück nach „Zur Prüfung“ oder „Entwurf“
```

- **Verfasser** ist der Gruppenführer oder Abteilungskommandant, der den Bericht schreibt. Der Bericht ist ihm zugewiesen, er sieht ihn unter „Meine offenen Berichte“. Die Zuweisung lässt sich ändern.
- **Fertig melden** prüft alle Fehlerregeln. Offene Fehler verhindern das Fertigmelden. Warnungen müssen bestätigt oder mit Begründung ignoriert werden.
- **Sperre**: Sobald jemand mit dem Recht `incidents.reports.release` den Bericht ändert oder freigibt, ist er für alle anderen schreibgeschützt. Die Sperre zeigt, wer sie wann gesetzt hat.
- **Sperre aufheben** ist eine eigene Aktion mit Begründung (steht in der Historie). Ist der Bericht bereits in einem Auszahlungslauf enthalten, erscheint ein Hinweis. Änderungen am Personal erzeugen dann Korrekturposten im Modul Entschädigungen.
- **Zurückgeben** an den Verfasser mit Kommentar ist aus „Zur Prüfung“ möglich.
- **Zweistufige Freigabe** ist der Normalfall: erst zur Entschädigungsauszahlung, dann zur Abrechnung. Die erste Stufe lässt sich in den Einstellungen abschalten; dann gibt es nur die Freigabe zur Abrechnung (umgesetzt, [E16](../entscheidungen.md#e16-freigabe-zweistufig-prüfung-vor-auszahlung)).
- **Automatisch speichern**: Der Editor hat keinen Speichern-Knopf. Jede Änderung steht in der Historie, über „Versionen“ lässt sich ein früherer Stand wiederherstellen (umgesetzt, [E15](../entscheidungen.md#e15-automatisch-speichern-nachvollziehbar-und-rückgängig)).
- Alle Statuswechsel stehen in der Historie, und der Verfasser bekommt eine Benachrichtigung.

## Prüfregeln

Die Regeln stammen aus der heutigen Prüf-App (siehe [Altanwendungen](../../recherche/altanwendungen.md)). Viele werden durch das Datenmodell ohnehin unmöglich. Die übrigen laufen beim Speichern und beim Fertigmelden. Jede Regel ist in den Einstellungen abschaltbar und hat eine Stufe.

| Regel | Stufe | Bedingung |
| --- | --- | --- |
| Hauptbericht fehlt | Fehler (beim Freigeben) | Einsatz hat keinen Hauptbericht |
| Bericht leer | Fehler | Lage/Verlauf leer |
| Statistik fehlt | Fehler | Hauptbericht ohne Statistikmerkmale, außer bei Einsatzarten ohne Statistik |
| Statistik bei Sonderdienst | Fehler | Nebenbericht eines Sonderdienstes oder Stichwort „Sonstiges“ mit Statistikmerkmalen |
| Kein Personal | Fehler | Bericht ohne Personal |
| Fahrzeug fehlt | Fehler | Person ohne Fahrzeug und ohne Bereitschaft (mit Ausnahmen, siehe oben) |
| Personaldoppelung im Einsatz | Fehler | siehe Regeln für das Personal |
| Überschneidung mit anderem Einsatz | Warnung | siehe Regeln für das Personal |
| Zeiten unplausibel | Fehler/Warnung | Ende vor Beginn (Fehler), Dauer über 24 h (Warnung) |
| Verdienstausfall ohne Betrag | Warnung | |
| Arbeitszeit und Verdienstausfall | Fehler | |
| Besatzung überschritten | Warnung | |
| Atemschutz ohne Qualifikation | Warnung | Person unter Atemschutz ohne Kennzeichen Atemschutzgeräteträger |

Die Liste **Offene Berichte** gruppiert nach Verfasser und Abteilung und zeigt die Hinweise. Eine Sammel-E-Mail an die Verfasser ersetzt den heutigen Mailversand der Prüf-App.

## Statistikmerkmale (Feuerwehrstatistik BW)

Die Merkmale entsprechen den Fragen F26–F62 der Import-Vorlage des Landesportals (siehe [Jahresstatistik BW](../../recherche/jahresstatistik-bw.md)). Sie werden **nur im Hauptbericht** erfasst und sind dort Pflicht; ein Nebenbericht mit Statistik ergibt einen Fehler.

| Merkmal | Werte | Fragen |
| --- | --- | --- |
| Einsatzort | eigene Gemeinde oder Überlandhilfe | trennt F28–F32 von F33/F34, Seiten 5–7 nur eigene Gemeinde |
| Einsatzhauptart | genau eine: Brand/Explosion, Technische Hilfe, Fehlalarm, Sonstiges. Rettungsdienst und Krankentransport erfasst die Feuerwehr nicht ([E12](../entscheidungen.md#e12-rettungsdienst-und-krankentransport-nicht-erfassen)); F46–F49 bleiben leer. | F28, F33, F34, F37, F50, F51 |
| Brandgröße | bei Brand: Kleinbrand A, Kleinbrand B, Mittelbrand, Großbrand | F29–F32 |
| TH-Unterkategorie | bei TH genau eine, nach Rangfolge: 1 Menschenrettung, 2 Gefahrstoff (ohne Ölspur), 3 Ölspur, 4 Tierrettung (ohne Insekten), 5 Insekten, 6 Hochwasser/Unwetter, 7 Sturm, 8 sonstige | F38–F45 |
| Fehlalarmart | bei Fehlalarm: in gutem Glauben, böswillig, Brandmeldeanlage | F52–F54 |
| Katastrophenfall | Kennzeichen Katastrophen-Voralarm, Katastrophen-Einsatz | F35, F36 |
| Gerettete Personen | Anzahl, davon mit Rauchgasintoxikation | F55, F57, F58 |
| Tote | Anzahl | F59, F61 |
| Fahrzeugbrand | Kennzeichen | F56, F60 |
| Verkehrsunfall | Kennzeichen | F62 |
| Eigene Einsatzkräfte | verletzt, tödlich verunglückt (je Person aus dem Personal, mit Abteilungstyp) | F26, F27 |

**Regeln**

- **Rangfolge der TH-Unterkategorie**: Sie wird bei der Auswahl erzwungen. Hat ein Einsatz Menschenrettung und Gefahrstoff, zählt er als 1.
- **Vorbefüllung**:
  - Der Stichwort-Katalog ordnet jedem Stichwort Einsatzhauptart und Unterkategorie zu, z. B. B2 → Brand; TH1 Person in Not → TH 1; BMA → Fehlalarm Brandmeldeanlage.
  - Ob der Einsatzort in der eigenen Gemeinde liegt, ergibt sich aus der Anschrift und der Gemeinde in den Einstellungen.
  - Die Brandgröße schlägt das System aus den eingesetzten Rohren vor, sobald das Modul Geräte installiert ist. Sonst wählt der Verfasser.
- Der Verfasser bestätigt oder korrigiert die Vorbefüllung.
- **Zählung**: Jeder Einsatz zählt in der Jahresstatistik genau einmal, über seinen Hauptbericht. Nebenberichte tragen keine Statistikmerkmale. Eigene verletzte Einsatzkräfte werden aus allen Berichten des Einsatzes gezählt.
- Die **Jahresstatistik** erzeugt die Abgabedatei für das Landesportal. Sie ist modulübergreifend beschrieben in [Jahresstatistik](../jahresstatistik.md).

## API für externe Systeme

Ein API-Token mit dem Bereich `incidents.api.create` darf Einsätze und Berichtsentwürfe anlegen, z. B. aus dem Alarmfax-Parser, DIVERA 24/7 oder Alamos FE2.

```http
POST /api/incidents/v1/incidents
Authorization: Bearer forga_xxx
Content-Type: application/json

{
  "dispatchNumber": "2026-123456",
  "alarmKeyword": "B2",
  "alarmMessage": "Rauchentwicklung aus Wohnung",
  "alarmedAt": "2026-10-21T13:05:00+02:00",
  "location": { "street": "Hauptstraße", "houseNumber": "12", "postalCode": "12345", "city": "Musterstadt", "district": "Weidenhain" },
  "departments": ["weidenhain", "musterstadt"],
  "personnel": [ { "personnelNumber": "1234", "vehicle": "Florian Musterstadt 1/44", "department": "musterstadt" } ]
}
```

- Idempotent über die Leitstellennummer: Ein zweiter Aufruf ergänzt, überschreibt aber nichts, was ein Mensch bereits bearbeitet hat.
- Für jede genannte Abteilung entsteht ein Berichtsentwurf. Den Verfasser setzt eine Regel: der Abteilungskommandant oder die Person mit der Funktion Gruppenführer auf dem ersten Fahrzeug.
- Antwort enthält die IDs und Links der Berichte.
- Beschreibung in OpenAPI unter `/api/docs`.

## Oberfläche

- **Einsatzliste**: Tabelle mit Datum, Leitstellennummer, Stichwort, Ort, beteiligte Abteilungen (Plaketten, Hauptbericht hervorgehoben mit `#F3E4E2`), Status. Filter: Zeitraum, Abteilung, Status, „nur meine“.
- **Einsatz-Ansicht**: Kopf mit den Einsatzdaten, darunter die Berichte der Abteilungen als Karten. Aktion „Bericht für Abteilung anlegen“, „zum Hauptbericht machen“.
- **Berichtseditor**: Abschnitte als Schritte (Zeiten & Ort → Personal & Fahrzeuge → Lage & Verlauf → Statistik → Beteiligte & Sonstiges → Prüfen). Jeder Abschnitt zeigt seine Hinweise direkt. Zwischenspeichern automatisch. Auf dem Handy einspaltig.
- **Personal-Erfassung**: Fahrzeuge als Spalten oder Karten, Personen per Suche oder Ziehen zuordnen, Bereitschaft als eigene Karte je Wache. Besatzungsstärke im Format 1/8 sichtbar.
- **Prüfansicht für den Kommandanten**: Liste „Zur Prüfung“, Bericht lesen, direkt korrigieren, freigeben (Entschädigung oder Abrechnung) mit einem Klick.
- **Auswertungen**: Offene Berichte, Jahresstatistik (Landesportal, siehe [Jahresstatistik](../jahresstatistik.md)), Einsätze je Abteilung, Einsatzstunden je Person, Abrechnungsexport.

## Rechte

`incidents.reports.read`, `incidents.reports.write` (eigene Abteilung), `incidents.reports.release` (Kommandant), `incidents.reports.unlock`, `incidents.settings.manage` (Sätze, Stichworte, Regeln), `incidents.statistics` (Jahresstatistik abschließen und exportieren), `incidents.duty.manage` (Dienstplan), `incidents.compensation.export` (Abrechnungsexport), API-Bereich `incidents.api.create`.

## Dienstplan (Sonderdienste)

Sonderdienste wie der Einsatzleiter vom Dienst stehen nicht in Einsatzberichten. Sie werden aus einem Kalender (iCal) übernommen oder von Hand gepflegt und je vollem Tag entschädigt (Musterstadt: 10 € je Tag, Entschädigungssatzung § 4). Sie erscheinen im Abrechnungsexport. Umgesetzt, siehe [implementiert/architektur.md](../../implementiert/architektur.md#modul-einsatzberichte-incidents).

## Einstellungen

Umgesetzt: Stichwort-Katalog mit Zuordnung zu Einsatzhauptart und Unterkategorie, Gemeinden für „eigene Gemeinde/Überlandhilfe“, Entschädigungssätze mit Gültigkeit, Rundungsregel, zweistufige Freigabe an/aus, Bereitschaftsstunden, Zuschläge, Sonderdienstarten mit Tagessätzen, Prüfregeln (an/aus, Stufe). Offen: Kategorien für sonstige Kräfte, Beteiligtenrollen und Textbausteine als pflegbare Kataloge.

## Ereignisse

`incidents.report.released` (mit Personal, Atemschutz-Einsätzen, Fahrzeugen, Geräten), `incidents.report.unlocked`. Das Modul Atemschutz zählt daraus die Realeinsätze unter Atemschutz. Das Modul Geräte markiert benutzte Geräte zur Prüfung.

## Import

Umgesetzt als Importprofil `incidents.mp-feuer`, siehe [implementiert/architektur.md](../../implementiert/architektur.md#modul-einsatzberichte-incidents). Offen ist nur die Ergänzung aus `Einsatzberichte_Zusatz.xlsx` (Berichte ohne Personal, Wetter, Sachschaden). Zuordnungsprofil MP-Feuer `MP-EXCEL.xlsx` / `Einsaetze_Personal.xlsx` (eine Zeile je Person und Bericht) und `Einsatzberichte_Zusatz.xlsx`. Dabei gilt:

- Einsatz = Leitstellennummer.
- Bericht = Abteilung + Einsatznummer + Beginn.
- Hauptbericht = „bei Ges. Stat. anzeigen“.
- Der Status wird aus Zusatzfeld 2 übernommen.

## Leistung

- **Prüfung vor der Auszahlung** lädt Kontext und Prüfregeln je Bericht einzeln (rund drei Abfragen je Bericht). Für einen Monat genügt das; für Jahreszeiträume sollen Personen, Einstellungen und Überschneidungen einmal für alle Berichte geladen werden.
