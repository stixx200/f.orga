# Führerscheinkontrolle: offene Punkte

Die Führerscheinkontrolle ist als Teil der Stammdaten umgesetzt, siehe [Führerscheinkontrolle](../../implementiert/architektur.md#führerscheinkontrolle) (Klassen mit Befristung, Kontrollen, erneute Vorlage, Fristen in beiden Modi, Liste und Nachweis für die Gemeinde, Einstellungen, Transponder und Selbstkontrolle am Infoterminal). Offen ist:

## Prüfregel im Einsatzbericht (nicht entschieden)

Vorschlag für die Einsatzberichte, standardmäßig aus, umzusetzen erst nach Rückmeldung aus dem Betrieb:
- `driver-license-check-overdue` (Warnung): Eine Person mit der Funktion Maschinist (oder einer als Fahrer markierten Funktion) hat am Einsatztag eine überfällige Frist der Führerscheinkontrolle oder keine Ersterfassung.
- `driver-license-class-missing` (Warnung): Ihr fehlt am Einsatztag die Klasse, die der Fahrzeugtyp verlangt. Dafür bekäme der Fahrzeugtyp im Katalog ein Zusatzfeld `requiredLicenseClass` (z. B. C für LF 20, C1 für MLF) und die Funktion ein Kennzeichen `driver`.

Die Daten kämen über `PERSON_DIRECTORY.snapshots()` (heute nur die Namen der Klassen; dazu Befristung und Stand der Kontrolle zum Stichtag). Eine Warnung braucht wie alle Warnungen eine Begründung, sperrt also nichts. Bedenken: Im Einsatzbericht wird der Maschinist nachträglich erfasst; die Regel stellt fest, verhindert aber nichts. Sinnvoller Ort für eine echte Kontrolle wäre eine spätere Fahrzeugbesetzung vor dem Ausrücken.

## Weitere offene Punkte

- **Unterschrift im Nachweis:** Die Liste „Führerscheinkontrollen: Nachweis für die Gemeinde“ hat noch keine wählbare Unterschriftenspalte bzw. Unterschriftszeile des Kommandanten.
- **Aufbewahrung der Kontrollen:** Fristen nach dem [Aufbewahrungsplan](../aufbewahrung.md) (Vorschlag: Kontrollen bis zum Austritt plus Frist der Personalakte). Heute entfernt erst die Anonymisierung Ausgeschiedener die Kontrollen.
- **Führerscheinkontrollen aus MP-Feuer:** `PER_PRUEF` der Transferdateien enthält Führerscheinkontrollen (z. B. „FS-Prüf“); die Datenübernahme könnte sie als Kontrollen der Art `legacy` übernehmen. Heute werden sie übergangen.
- **Selbstkontrolle in „Mein Bereich“:** bewusst nicht umgesetzt, weil ein kopierter Code am eigenen Handy leichter zu missbrauchen ist als am Terminal in der Wache. „Mein Bereich“ zeigt nur den Stand; das Mockup `shell/mein-fuehrerschein.html` zeigt noch den Knopf „Selbst kontrollieren“.
