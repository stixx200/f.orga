# Oberfläche

Nach der Anmeldung arbeiten Sie in drei Bereichen:

- **Seitenleiste** – Menü (nur Einträge, für die Sie Rechte haben und deren Modul aktiv ist)
- **Hauptbereich** – die geöffnete Seite
- **Kopfzeile** – Suche und Profil; bei Bedarf der Hinweis „Angemeldet als …“

## Startseite

Auf der Startseite finden Sie:

- **Aufgaben und Fristen** – was für Sie fällig ist (Probezeit, Prüfungen, offene Berichte, Datenschutz …). Eine Aufgabe verschwindet, sobald der Nachweis oder die Aktion erledigt ist.
- **Einrichtungsliste** (nur Administratoren) – was an der Installation noch fehlt; ein- und ausklappbar.
- **Kurzüberblicke** der Module – z. B. offene Berichte oder fällige Prüfungen.

## Menü „Übersicht“

| Eintrag | Damit können Sie … |
| --- | --- |
| **Startseite** | Aufgaben und Überblicke sehen |
| **Mein Bereich** | Ihre eigenen Daten pflegen (nur wenn Ihr Konto mit einer Person verknüpft ist) → [Mein Bereich](mein-bereich.md) |
| **Listen** | Listen als Vorschau, PDF, Excel oder CSV ausgeben (oft mit Angabe des Zwecks) |
| **Code suchen** | Gerät oder Kleidungsstück per Barcode, RFID, QR oder Inventarnummer finden |
| **Import** | Daten aus Excel, CSV oder iCal übernehmen (Datei wählen, Spalten zuordnen, Probelauf, Übernehmen) |

## Suchen

Über die Suche in der Kopfzeile finden Sie Personen und andere Datensätze, für die Sie Leserecht haben. Personen mit Einschränkung der Verarbeitung erscheinen für Unberechtigte nicht.

## Menü „Verwaltung“

| Eintrag | Damit können Sie … |
| --- | --- |
| **Benutzer** | Konten aus der Personalakte anlegen, sperren, Rollen zuweisen, Zwei-Faktor zurücksetzen |
| **Rollen** | Rechte je Rolle festlegen (eine Abteilung oder alle Abteilungen); Vorlagen zurücksetzen |
| **Module** | Module ein- oder ausschalten und zu den Modul-Einstellungen springen |
| **API-Tokens** | Technische Zugänge mit Empfänger, Zweck, Bereich und Ablauf anlegen |
| **Einstellungen** | Feuerwehr, E-Mail, Sicherheit, Aufbewahrung, Anmeldung über die Gemeinde, Vollexport |
| **Audit-Log** | Aktionen, Exporte und Anmeldungen nachvollziehen |
| **Aussonderung** | Fällige Fälle des Aufbewahrungsplans dem Archiv anbieten, anonymisieren oder löschen |

Je nach aktiven Modulen erscheinen hier außerdem z. B. Infoterminals, Persönliche Zugänge, Datenschutz, MP-Feuer, Datensicherung oder Kataloge.

### Systemeinstellungen

Unter **Verwaltung → Einstellungen**:

| Abschnitt | Inhalt |
| --- | --- |
| Feuerwehr | Name, Adresse von f.orga, Gemeinde, Einwohnerzahl, Wappen, Briefkopf |
| E-Mail | SMTP-Server; Test-E-Mail senden |
| Erinnerungen | Sammel-E-Mail mit Fristen |
| Sicherheit | Vorgaben zum Zwei-Faktor, HTTPS, Sitzungen |
| Aufbewahrung | Fristen je Datenkategorie, Vorlage, „Jetzt anwenden“ |
| Anmeldung | OpenID Connect der Gemeinde |
| Export | Vollexport der Daten (eigenes Recht) |

Die Einstellungen eines Fachmoduls öffnen Sie über das Modul selbst oder über **Module** und die jeweilige Karte.

## Historie eines Datensatzes

Viele Seiten haben den Reiter **Historie**. Dort sehen Sie, wer wann welches Feld geändert hat. Untergeordnete Daten (z. B. Lehrgänge einer Person) stehen in der Historie des übergeordneten Datensatzes.

## Als anderer Benutzer anmelden

Administratoren können sich vorübergehend **als** ein anderer Benutzer anmelden, um dessen Sicht zu prüfen. Die Oberfläche zeigt das deutlich an. Der Vorgang wird im Audit-Log und beim Betroffenen unter „Anmeldungen als Sie“ protokolliert.
