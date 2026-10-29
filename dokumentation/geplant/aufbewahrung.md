# Aufbewahrungsplan: offene Punkte

Umgesetzt ist der Aufbewahrungsplan mit Kategorien, Vorlage „Kommunaler Aktenplan (Beispiel)“, Aussonderung und Anbietung an das Archiv, siehe [implementiert/aufbewahrung.md](../implementiert/aufbewahrung.md). Offen ist:

## Mit Hauptamt und Archiv zu klären

1. **Zuordnung der Aktenplan-Positionen** zu den Kategorien, vor allem „Freiwillige Feuerwehr“ (heute: ausgesonderte Fahrzeuge und Geräte) und „Datenerfassungsprotokolle“ (heute: Audit-Log und Historie). Die Vorlage ist ein Vorschlag; die Feuerwehr klärt mit dem Hauptamt, welche Akten der Aktenplan meint.
2. **Format für das Archiv:** Heute ZIP mit PDF je Datensatz, Anbietungsverzeichnis (PDF), CSV und JSON. Ob das Archiv ein bestimmtes Format braucht (z. B. PDF/A oder ein Aussonderungsformat wie xdomea), ist mit dem Archiv zu klären.
3. **Sicherungen:** Gelöschte Daten bleiben in älteren Sicherungen (Modul [Datensicherung](module/backup.md)) bis zu deren Ablauf. *Empfehlung:* im Verzeichnis der Verarbeitungstätigkeiten so vermerken; die Aufbewahrung der Sicherungen (Standard 30 Tage) ist kurz genug.
4. **Haushaltsrechtliche Fristen** für Kostenbescheide und Auszahlungsläufe: mit der Kämmerei abstimmen; die Vorlage setzt bewusst keinen Wert.

## Noch nicht umgesetzt

- **Wirkung erst ab dem nächsten Tag:** Ein echter Lauf („Jetzt anwenden“, täglicher Lauf) nimmt die gespeicherten Regeln sofort. Vorgeschlagen war, neu gespeicherte Regeln, die direkt anonymisieren oder löschen, erst ab dem nächsten Tag automatisch anzuwenden; heute zeigt die Einstellungsseite vorher die betroffene Zahl je Zeile.
- **Führerscheinkontrollen** ([Konzept](module/fuehrerscheinkontrolle.md)) gehören zur Personalakte: Sobald es sie gibt, entfernt die Anonymisierung der Personalakte sie mit (heute nur die Führerscheinangaben der Person).
- **Rollenvorlage `administration`** („Verwaltung / Kasse“) bekommt `core.retention.manage` nur auf Wunsch; heute hat es nur `administrator`.
- **Namen als Freitext anderer Benutzer** bleiben bei der Anonymisierung einer Person: Anzeigenamen von Benutzern in Prüfungen von Geräten (`recordedBy`), in Versionen von Einsatzberichten (`userName`) und in Bearbeitungsvermerken von Kostenbescheiden. Sie verweisen auf Benutzer, nicht auf Personen; ein Abgleich über den Namen ist nicht eindeutig.
- **Kostenbescheide eines anonymisierten Einsatzes** behalten ihre eigene Kopie der Einsatzdaten (Ort, Kostenschuldner) bis zu ihrer eigenen Frist.
- **Fahrzeuge mit Verweisen** (z. B. aus aufbewahrten, anonymisierten Einsätzen) bleiben blockiert; ob ausgesonderte Fahrzeuge ohne Verweise auf ihre Einsätze gelöscht werden sollen, ist offen.
