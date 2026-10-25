# Betrieb

## Bestandteile

| Container | Inhalt |
| --- | --- |
| `forga` | Ein Node-Prozess: API unter `/api`, Shell unter `/`, Modul-Frontends unter `/modules/<id>/` |
| `db` | PostgreSQL 17, Daten im Volume `forga-db` |

So entsteht das Image aus `docker/Dockerfile`:

1. Abhängigkeiten installieren.
2. Shell und Modul-Frontends bauen. Den Server mit `prune` bauen: Bundle, gekürzte `package.json` mit Lockfile und die Workspace-Pakete.
3. Das Laufzeit-Image aus den Produktionsabhängigkeiten zusammenstellen. Die Frontends liegen dort unter `/app/web/shell` und `/app/web/modules/<id>`.

## Starten

```bash
cp docker/.env.example docker/.env      # Passwort setzen
docker compose -f docker/compose.yml up -d --build
```

- **Adresse:** Die Anwendung ist danach unter `http://<server>:8080` erreichbar.
- **Migrationen:** Beim Start spielt der Server ausstehende Datenbank-Migrationen ein. Für ein Update genügen ein neues Image und ein Neustart.
- **Ersteinrichtung:** Beim ersten Aufruf mit leerer Datenbank fragt die Anwendung den Namen der Feuerwehr ab und legt das erste Administratorkonto an.

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Datenbankpasswort, Pflicht | – |
| `FORGA_PORT` | Port auf dem Host | `8080` |
| `FORGA_SECURE_COOKIES` | Sitzungs-Cookie nur über HTTPS senden. Auf `true` setzen, sobald f.orga per HTTPS erreichbar ist. | `false` |
| `FORGA_MAIL_TRANSPORT` | `memory`: E-Mails nur im Speicher sammeln statt per SMTP zu senden (Tests, Vorführung) | SMTP |
| `FORGA_DIGEST_SCHEDULER` | `off`: wöchentliche Sammel-E-Mail nicht automatisch senden | an |
| `FORGA_PLUGIN_DIR` | Plugin-Verzeichnis; im Container das Volume `forga-plugins` unter `/plugins`. Ohne Angabe sind Plugins aus. | `/plugins` (Compose) |
| `FORGA_PLUGIN_KEYS` | Öffentliche Schlüssel vertrauenswürdiger Plugin-Herausgeber (Base64, kommagetrennt); alternativ die Datei `trusted-keys` im Plugin-Verzeichnis | – |
| `FORGA_PLUGINS_ALLOW_UNSIGNED` | `true`: auch unsignierte Plugin-Pakete annehmen. Nur für die Entwicklung. | `false` |
| `FORGA_PUBLIC_URL` | Adresse von f.orga, falls nicht in den Einstellungen (`brigade.publicUrl`); für Links in E-Mails und die Rücksprungadresse der OIDC-Anmeldung | – |

**Plugins:** Ein signiertes Paket wird unter „Verwaltung → Module“ hochgeladen oder als `.tgz` in das Volume `/plugins` gelegt. Es wirkt nach einem Neustart des Containers (`docker compose -f docker/compose.yml restart forga`); Migrationen des Plugins laufen dabei mit. Abgelehnte Pakete heißen danach `*.tgz.rejected`, der Grund steht im Protokoll des Containers.

**E-Mail:** Für die wöchentliche Sammel-E-Mail mit den Fristen braucht es in den Einstellungen (Abschnitt `smtp`) Server und Absender. Wochentag und Uhrzeit stehen im Abschnitt `reminders`. Benutzer bekommen die E-Mail nur mit hinterlegter E-Mail-Adresse.

## Einschränkungen des aktuellen Stands

- HTTPS ist nicht eingerichtet. Ohne vorgeschalteten Reverse Proxy mit TLS gehört der Stack deshalb nicht ins Internet.
- Sicherung und Wiederherstellung sind noch nicht eingerichtet.
- Die Sperre nach Fehlversuchen bei der Anmeldung liegt im Speicher des Prozesses. Ein Neustart setzt sie zurück.
