# Dokumentation f.orga

f.orga ist eine webbasierte, modulare Verwaltungssoftware für kleine und mittlere Freiwillige Feuerwehren. Sie deckt Einsatzberichte, Stammdaten, Dienste (Übungs- und Sonderdienste), Atemschutz, Geräte, Entschädigungen, Kostenersatz und Beförderungen ab. Jedes Thema ist ein eigenes Modul mit Backend und Frontend und lässt sich in die Shell laden. Die Oberfläche ist zwischen Deutsch und Englisch umschaltbar. Der Code ist englisch, diese Dokumentation deutsch.

## Aufbau dieses Ordners

Die Dokumentation ist streng zweigeteilt. Beide Teile beschreiben immer den aktuellen Stand, ohne Änderungsverlauf. Wird etwas umgesetzt, wandert die Beschreibung von `geplant/` nach `implementiert/` und wird in `geplant/` gelöscht.

| Ordner | Inhalt |
| --- | --- |
| [`implementiert/`](implementiert/README.md) | Was im Code existiert und läuft. Nur das. |
| [`geplant/`](geplant/README.md) | Zielbild, Fachkonzepte je Modul, Releaseplan, Mockups, offene Entscheidungen. |
| [`recherche/`](recherche/README.md) | Hintergrund: Marktübersicht, Vorschriften Baden-Württemberg, Regeln aus den Altanwendungen. |

## Schnellzugriff

- [Releaseplan](geplant/roadmap.md)
- [Zielarchitektur](geplant/architektur.md)
- [Entscheidungen](geplant/entscheidungen.md)
- [Entwicklungsumgebung](implementiert/entwicklung.md)
- [Glossar Fachbegriff ↔ Code](geplant/fachmodell.md#glossar-fachbegriff--code)
