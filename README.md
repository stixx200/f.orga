# f.orga

Modular administration software for small and medium-sized volunteer fire brigades: incident reports, master data, training, respiratory protection, equipment, compensation, cost recovery and promotions. Each topic is a module with its own backend and frontend that the shell loads at runtime. The user interface is available in German and English.

Tech stack: Nx monorepo, NestJS + MikroORM + PostgreSQL, React + Vite + Module Federation + Mantine, i18next.

```bash
pnpm install
docker compose -f docker/compose.dev.yml up -d
pnpm exec nx run-many -t serve -p @forga/server shell masterdata-web incidents-web   # http://localhost:4200
pnpm run check                                                                  # lint, typecheck, tests, build
```

The documentation is written in German:

- Overview: [`dokumentation/`](dokumentation/README.md)
- User manual: [`dokumentation/anwender/`](dokumentation/anwender/README.md)
- Development: [`dokumentation/technik/entwicklung.md`](dokumentation/technik/entwicklung.md)
- Operations: [`dokumentation/technik/betrieb.md`](dokumentation/technik/betrieb.md)
- Glossary German ↔ code terms: [`dokumentation/technik/glossar.md`](dokumentation/technik/glossar.md)
