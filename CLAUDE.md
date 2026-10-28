# f.orga – Hinweise für die Arbeit im Repository

- **Code englisch:** Bezeichner, Kommentare, Datei- und Ordnernamen, API-Pfade, Datenbank-Schemas und -Tabellen, Berechtigungs-IDs und Testnamen. Keine deutschen Bezeichner im Code.
- **Oberfläche zweisprachig (de/en):** Jede sichtbare Zeichenkette läuft über einen Übersetzungsschlüssel mit Einträgen für `de` und `en`.
  - Module liefern ihre Texte in `defineWebModule({ translations })`.
  - Gemeinsame Texte und Fehlercodes stehen im Namespace `common` (`libs/web/web-sdk/src/lib/common.i18n.ts`).
  - Texte vom Server (Manifest-Namen, Navigation, Berechtigungen) sind `LocalizedText` `{ de, en }`.
  - Der Server liefert Fehlercodes (`{ code }`), keine fertigen Meldungen.
- **Dokumentation deutsch:** Sie beschreibt in `dokumentation/` immer den aktuellen Stand, ohne Änderungsverlauf.
  - `implementiert/` enthält nur, was im Code existiert, `geplant/` nur Offenes.
  - Wird etwas umgesetzt, wird die Beschreibung von `geplant/` nach `implementiert/` verschoben, nicht kopiert.
  - Fachbegriff ↔ Code-Begriff steht im Glossar in `dokumentation/geplant/fachmodell.md`.
- **Mockups vor Frontends:** Vor der Umsetzung eines Frontends müssen die Mockups der App in `dokumentation/geplant/mockups/` freigegeben sein. Gestaltung nach `../Stil.md` (Theme in `libs/web/web-ui`).
- **Modul-IDs:** `core`, `masterdata`, `incidents`, `training`, `respiratory-protection`, `compensation`, `equipment`, `cost-recovery`, `promotions`, `clothing`, `duty-officer`, `info-terminal`.
  - Die ID ist Präfix der Berechtigungen und der API-Pfade (`/api/<id>/…`).
  - Das Datenbankschema heißt wie die ID, mit `_` statt `-`.
- **Modulgrenzen:** Module importieren voneinander nur `*-contracts`-Pakete. Verträge (Zod) liegen in `*-contracts` und werden von Backend und Frontend genutzt. Geprüft wird das mit `tools/module-boundaries.mjs` über die Nx-Tags `scope:*` und `type:*`.
- **ESM:** Backend-Bibliotheken sind ESM (`nodenext`). Relative Importe enden auf `.js`.
- **Historie:** Neue Entitäten werden im Modul unter `historized` gemeldet, damit die Historie entsteht.
- **Migrationen:** Bis zum ersten Release nur eine `initial` je Modul: nach Änderungen an Entitäten `npm run migration:reset` und die Entwicklungsdatenbank neu anlegen (danach `npm run seed`). Migrationen nie von Hand schreiben.
- **Vor jedem Commit:** `npm run check` (Lint, Modulgrenzen, Typprüfung, Unit- und Integrationstests, Build).

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
