# Modul Datensicherung – offene Punkte

Das Modul ist umgesetzt, siehe [Modul Datensicherung](../../implementiert/architektur.md#modul-datensicherung-backup), die [Oberfläche](../../implementiert/architektur.md#oberfläche-datensicherung), die [Schnittstellen](../../implementiert/schnittstellen.md#datensicherung) und den [Betrieb](../../implementiert/betrieb.md#datensicherung). Mockups: [`mockups/sicherung/`](../mockups/README.md#seiten).

Offen:

- **Sicherung außer Haus:** Ziel ist nur ein Ordner auf dem Server (ein NAS wird auf dem Host eingebunden). Ein zweites Ziel (S3, WebDAV) bei Bedarf später.
- **E2E-Tests** (Playwright) für Einrichten, „Jetzt sichern“ und den Assistenten der Wiederherstellung.
