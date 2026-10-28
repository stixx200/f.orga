# Modul Infoterminal – offene Punkte

Das Modul ist umgesetzt, siehe [Modul Infoterminal](../../implementiert/architektur.md#modul-infoterminal-info-terminal), die [Oberfläche](../../implementiert/architektur.md#oberfläche-infoterminal) und die [Schnittstellen](../../implementiert/schnittstellen.md#info-terminal). Mockups: [`mockups/infoterminal/`](../mockups/README.md#seiten).

Offen:

- **Parallelbetrieb mit MP-Feuer:** Sobald Berichte als `managedBy: 'mp-feuer'` geführt werden können (ersetzt `externallyManaged`), nimmt das Terminal in solche Berichte keine Eintragungen an (`incidents.ledByMpFeuer`) und zeigt sie auf der Übersicht wie fertig gemeldete Berichte. Eine Eintragung beendet dann `managedBy: 'api'` statt `externallyManaged`.
- **E2E-Tests** (Playwright) für die Kernabläufe am Terminal: Link öffnen, eintragen, ändern, austragen, „Neuer Einsatz“, Dienst.
