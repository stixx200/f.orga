# Betrieb

## Bestandteile

| Container | Inhalt |
| --- | --- |
| `forga` | Ein Node-Prozess: API unter `/api`, Shell unter `/`, Modul-Frontends unter `/modules/<id>/`; dazu die PostgreSQL-17-Clientwerkzeuge (`pg_dump`, `pg_restore`, `psql`) für die Datensicherung. Volumes `forga-plugins` (`/plugins`) und `forga-backups` (`/backups`) |
| `db` | PostgreSQL 17, Daten im Volume `forga-db` |

So entsteht das Image aus `docker/Dockerfile`:

1. Abhängigkeiten installieren.
2. Shell und Modul-Frontends bauen. Den Server mit `prune` bauen: Bundle, gekürzte `package.json` mit Lockfile und die Workspace-Pakete.
3. Das Laufzeit-Image aus den Produktionsabhängigkeiten zusammenstellen, mit `postgresql17-client` aus Alpine. Die Frontends liegen dort unter `/app/web/shell` und `/app/web/modules/<id>`.

## Starten

```bash
cp docker/.env.example docker/.env      # Passwort setzen
docker compose -f docker/compose.yml up -d --build
```

- **Adresse:** Die Anwendung ist danach unter `http://<server>:8080` erreichbar.
- **Migrationen:** Beim Start spielt der Server ausstehende Datenbank-Migrationen ein. Für ein Update genügen ein neues Image und ein Neustart.
- **Ersteinrichtung:** Beim ersten Aufruf mit leerer Datenbank fragt die Anwendung den Einrichtungsschlüssel, den Namen der Feuerwehr und das erste Administratorkonto (mit E-Mail-Adresse) ab. Der Schlüssel verhindert, dass jemand, der die frische Installation zuerst erreicht, sich zum Administrator macht. Ist `FORGA_SETUP_TOKEN` gesetzt, ist er dessen Wert; sonst erzeugt der Server beim Start einen zufälligen Schlüssel und schreibt ihn ins Protokoll (`docker compose -f docker/compose.yml logs forga`, Zeile „Setup token: …“). Nach einem Neustart gilt ein neuer Schlüssel. Sobald ein Benutzer existiert, ist die Einrichtung gesperrt.
- **Nach der Einrichtung:** Die Startseite zeigt Administratoren eine Liste, was noch fehlt: Adresse von f.orga, E-Mail-Versand, Abteilungen, Kataloge, die Einstellungen jedes aktiven Moduls und weitere Benutzer. Weitere Benutzer lädt man unter „Verwaltung → Benutzer“ aus der Personalakte ein; dafür müssen Adresse und E-Mail-Versand eingerichtet sein.

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Datenbankpasswort, Pflicht | – |
| `FORGA_PORT` | Port auf dem Host | `8080` |
| `FORGA_SECURE_COOKIES` | Sitzungs-Cookie nur über HTTPS senden. Auf `true` setzen, sobald f.orga per HTTPS erreichbar ist. | `false` |
| `FORGA_MAIL_TRANSPORT` | `memory`: E-Mails nur im Speicher sammeln statt per SMTP zu senden (Tests, Vorführung) | SMTP |
| `FORGA_DIGEST_SCHEDULER` | `off`: wöchentliche Sammel-E-Mail nicht automatisch senden | an |
| `FORGA_RETENTION_SCHEDULER` | `off`: Aufbewahrungsplan (Audit-Log kürzen, Uploads löschen, Fristen je Datenkategorie, neue Fälle der Aussonderung) nicht automatisch anwenden, sondern nur über „Einstellungen → Datenschutz → Jetzt anwenden“ oder „Aussonderung → Liste aktualisieren“. Sonst laufen sie eine Minute nach dem Start und danach täglich. | an |
| `FORGA_SETUP_TOKEN` | Einrichtungsschlüssel für die Ersteinrichtung. Ohne Angabe erzeugt der Server einen und schreibt ihn ins Protokoll. | zufällig |
| `FORGA_PLUGIN_DIR` | Plugin-Verzeichnis; im Container das Volume `forga-plugins` unter `/plugins`. Ohne Angabe sind Plugins aus. | `/plugins` (Compose) |
| `FORGA_PLUGIN_KEYS` | Öffentliche Schlüssel vertrauenswürdiger Plugin-Herausgeber (Base64, kommagetrennt); alternativ die Datei `trusted-keys` im Plugin-Verzeichnis | – |
| `FORGA_PLUGINS_ALLOW_UNSIGNED` | `true`: auch unsignierte Plugin-Pakete annehmen. Nur für die Entwicklung. | `false` |
| `FORGA_TRUST_PROXY` | Reverse Proxy vor f.orga, dem `X-Forwarded-For` geglaubt wird (Express `trust proxy`): `true` (jeder), Anzahl der Proxys (z. B. `1`) oder Adressen/Netze, kommagetrennt (z. B. `loopback`, `10.0.0.0/8`). Nur dann gelten Anfragebegrenzung und Anmeldesperre für die Adresse des Benutzers statt für die des Proxys. Nur setzen, wenn wirklich ein Proxy davor steht, sonst kann jeder seine Adresse fälschen. | aus |
| `FORGA_PUBLIC_URL` | Adresse von f.orga, falls nicht in den Einstellungen (`brigade.publicUrl`); für Links in E-Mails und die Rücksprungadresse der OIDC-Anmeldung. In den Einstellungen nur `https://…` (`http://` nur für `localhost`). | – |
| `FORGA_SECRET_KEY` | Server-Schlüssel (32 Byte, Base64, z. B. `openssl rand -base64 32`). Verschlüsselt die Geräteschlüssel der Infoterminals (AES-256-GCM), damit sich ihr Link wieder anzeigen lässt, die beim Import gemerkten Kalenderadressen (ohne ihn wird keine Adresse gemerkt) und die Passphrase der Datensicherung. **Pflicht für das Modul Infoterminal und für geplante Sicherungen:** Ohne ihn lässt sich kein Terminal anlegen (`info-terminal.noSecretKey`) und keine Passphrase speichern (`backup.noSecretKey`, dann nur „Jetzt sichern“ mit Eingabe der Passphrase). Wird er geändert, lassen sich vorhandene Links nicht mehr anzeigen (die Geräte arbeiten weiter, bis ein neuer Link erzeugt wird) und die Passphrase muss neu eingegeben werden. Er steht in keiner Sicherung: getrennt im Passwortsafe aufbewahren. Je System ein eigener Wert. | – |
| `FORGA_BACKUP_ROOT` | Wurzel der Zielordner der Datensicherung; im Container `/backups` (Compose). Ohne Angabe ist das Modul nur lesbar („nicht eingerichtet“). | `/backups` (Compose) |
| `FORGA_BACKUP_DIR` | Nur Compose: Ordner auf dem Host, der als `/backups` eingebunden wird (z. B. ein auf dem Host eingebundenes NAS), Eigentümer UID 1000 (`node`). Leer: Docker-Volume `forga-backups`. | Volume |
| `FORGA_INSTANCE` | Name der Installation in Dateinamen und Sicherungen (`forga-<name>-JJJJ-MM-TT_HHMM.forgabackup`); bei den Stufen `real` und `test` | `forga` |
| `FORGA_BACKUP_SCHEDULER` | `off`: keine geplanten Sicherungen (Tests; beim Testsystem der Stufen Standard, `FORGA_BACKUP_SCHEDULER_TEST=on` schaltet sie ein) | an |
| `FORGA_PG_BIN` | Ordner mit `pg_dump`, `pg_restore` und `psql`, falls sie nicht im `PATH` liegen (Entwicklung: `tools/pg-docker`, siehe [Entwicklung](entwicklung.md)) | `PATH` |
| `FORGA_MAINTENANCE_FILE` | Merker des Wartungsmodus während einer Wiederherstellung; muss den Neustart des Prozesses überstehen | `/tmp/forga-maintenance` |
| `FORGA_RESTORE_EXIT` | `off`: der Prozess beendet sich nach einer Wiederherstellung nicht selbst (Tests) | an |
| `FORGA_IMPORT_URL_ALLOW_PRIVATE` | `true`: Kalender beim Import auch von lokalen und privaten Adressen laden (Loopback, `10.…`, `172.16–31.…`, `192.168.…`, `fd…`, Link-Local), z. B. von einem Kalenderserver im eigenen Netz. Sonst lehnt der Server solche Adressen ab (`imports.urlForbidden`), damit niemand über den Import Dienste im internen Netz abfragt. | `false` |

**Echt- und Testsystem nebeneinander** (`docker/compose.stages.yml`): zwei getrennte Instanzen aus demselben Image, jede mit eigener Datenbank und eigenen Volumes. Das Echtsystem ist für echte Daten (z. B. die MP-Feuer-Datenübernahme), das Testsystem für Demodaten. Gewechselt wird über die Adresse; Sitzungen und Daten bleiben getrennt.

```bash
cp docker/.env.example docker/.env      # Passwörter und Einrichtungsschlüssel setzen
docker compose -f docker/compose.stages.yml up -d --build
FORGA_URL=http://localhost:8081 FORGA_SETUP_TOKEN=<FORGA_SETUP_TOKEN_TEST> npm run seed   # Demodaten ins Testsystem
```

| System | Adresse | Variablen |
| --- | --- | --- |
| Echtsystem | `http://<server>:8080` | `POSTGRES_PASSWORD_REAL`, `FORGA_SETUP_TOKEN_REAL`, `FORGA_SECRET_KEY_REAL`, `FORGA_BACKUP_DIR_REAL`, `FORGA_REAL_PORT` |
| Testsystem | `http://<server>:8081` | `POSTGRES_PASSWORD_TEST`, `FORGA_SETUP_TOKEN_TEST`, `FORGA_SECRET_KEY_TEST`, `FORGA_BACKUP_DIR_TEST`, `FORGA_BACKUP_SCHEDULER_TEST`, `FORGA_TEST_PORT` |

Jedes System sichert sich selbst in einen eigenen Ordner (`FORGA_BACKUP_DIR_REAL` bzw. `_TEST`, sonst die Volumes `forga_real_backups` und `forga_test_backups`), mit eigener Passphrase und eigenem `FORGA_SECRET_KEY`. Das Testsystem kann eine Sicherung des Echtsystems wiederherstellen (z. B. zum Üben): Datei unter „Sicherungen“ hochladen, mit der Passphrase des Echtsystems.

Die Datei hat den eigenen Projektnamen `forga-stages` und feste Volumenamen (`forga_real_db`, `forga_test_db` …), damit sie nicht mit `docker/compose.dev.yml` im selben Verzeichnis kollidiert. Das Testsystem lässt sich jederzeit neu aufsetzen, ohne das Echtsystem zu berühren: `docker compose -f docker/compose.stages.yml rm -sf forga-test db-test && docker volume rm forga_test_db`, danach `up -d` und erneut `npm run seed`.

**Plugins:** Ein signiertes Paket wird unter „Verwaltung → Module“ hochgeladen oder als `.tgz` in das Volume `/plugins` gelegt. Es wirkt nach einem Neustart des Containers (`docker compose -f docker/compose.yml restart forga`); Migrationen des Plugins laufen dabei mit. Abgelehnte Pakete heißen danach `*.tgz.rejected`, der Grund steht im Protokoll des Containers.

**E-Mail:** Für die wöchentliche Sammel-E-Mail mit den Fristen, Einladungen und „Passwort vergessen“ braucht es in den Einstellungen (Abschnitt `smtp`) Server und Absender. Wochentag und Uhrzeit stehen im Abschnitt `reminders`. Benutzer bekommen die E-Mail nur mit hinterlegter E-Mail-Adresse. Scheitert der Versand, nennt die Meldung die Ursache (`mail.authFailed`: Benutzer/Passwort, `mail.connectionFailed`: Server/Port, `mail.tlsFailed`: Port/STARTTLS, `mail.rejected`: Absender/Empfänger); Einzelheiten stehen im Protokoll des Containers. Der Knopf „Test-E-Mail an mich senden“ prüft die gespeicherten Einstellungen.

**Anmeldung mit dem Konto der Gemeinde (OIDC):** Der Anmeldeknopf erscheint nur mit eingetragener Adresse von f.orga. „Verbindung testen“ in den Einstellungen lädt die Konfiguration des Anbieters; ist er nicht erreichbar oder der Aussteller falsch, lautet der Fehler `auth.oidcDiscoveryFailed`. Die erste Anmeldung verknüpft nur über eine vom Anbieter bestätigte E-Mail-Adresse (`email_verified`). Mit „Verknüpfen über Benutzername“ wird nie automatisch verknüpft, weil der Benutzername beim Anbieter weder eindeutig noch bestätigt ist; dann verknüpft jeder Benutzer sein Konto selbst im Profil. Ebenso Konten mit Verwaltungsrechten: Verwaltung von f.orga (`*`, `core.*`) oder feuerwehrweite Verwaltung eines Moduls (`….manage`).

**Aufbewahrung:** Daten werden erst anonymisiert oder gelöscht, wenn ein Administrator unter „Einstellungen → Datenschutz“ Fristen und Aktionen wählt (Standard: nichts, nur das Audit-Log nach 2 Jahren). Die Seite zeigt je Zeile, wie viele Datensätze jetzt betroffen wären. Gerade nach einer Datenübernahme mit alten Austritten und Einsätzen sollten die Fristen bewusst gewählt werden; Anonymisieren und Löschen lassen sich nicht rückgängig machen. Gelöschte Daten bleiben in älteren Sicherungen bis zu deren Ablauf. Einzelheiten: [Aufbewahrungsplan](aufbewahrung.md).

**Passwort vergessen:** Die Antwort ist immer gleich, ob es das Konto gibt oder nicht; Suche und Versand laufen nach der Antwort. Je Absenderadresse sind 20 Anfragen in 15 Minuten erlaubt, je Konto werden höchstens drei Links in 15 Minuten verschickt. Hinter einem Reverse Proxy zählt die Adresse des Benutzers nur mit `FORGA_TRUST_PROXY`, sonst teilen sich alle die Adresse des Proxys. Eine E-Mail-Adresse gehört zu höchstens einem aktiven Benutzer; haben ältere Daten eine Adresse doppelt, setzt sie keines der Konten zurück, dann hilft der Benutzername.

**Anmeldesperre:** Nach fünf falschen Passwörtern ist der Benutzername eine Minute gesperrt, aber nur für die Adresse, von der die Versuche kamen; der Inhaber meldet sich von seinem Gerät weiter an. Hinter einem Reverse Proxy braucht das `FORGA_TRUST_PROXY`, sonst sperren Fehlversuche den Benutzernamen für alle.

## Datensicherung

**Was gesichert werden muss:** Alle Daten liegen in der PostgreSQL-Datenbank, auch Binärdaten: Anhänge (Fotos, Alarmfax, Unterlagen; `core.attachment`), Wappen und Briefkopf, die erlassenen PDF-Kostenbescheide und hochgeladene Importdateien. Außerhalb der Datenbank liegen nur die Plugins (Volume `forga-plugins` bzw. `forga_real_plugins`). Eine Sicherung besteht deshalb aus einem Abzug je Datenbank und, falls Plugins installiert sind, dem Plugin-Ordner. Die Umgebungsdatei `docker/.env` (Passwörter, `FORGA_SECRET_KEY`) gehört getrennt und geschützt aufbewahrt; ohne den alten `FORGA_SECRET_KEY` lassen sich die Links der Infoterminals nach einer Wiederherstellung nicht mehr anzeigen (neuer Link nötig).

### In der Anwendung (Modul Datensicherung)

Optional: Unter „Verwaltung → Datensicherung“ richtet ein Administrator mit `backup.manage` eine regelmäßige, verschlüsselte Sicherung der eigenen Instanz ein, prüft Sicherungen und stellt eine Sicherung ohne Konsole wieder her (Einzelheiten in der [Architektur](architektur.md#modul-datensicherung-backup)). Voraussetzungen:

- `FORGA_BACKUP_ROOT` (Compose: `/backups`) mit einem Ordner auf dem Host (`FORGA_BACKUP_DIR`, Eigentümer UID 1000) oder, ohne Angabe, dem Volume `forga-backups`; Compose startet also auch ohne `FORGA_BACKUP_DIR`. Solange die Einstellungen nicht gespeichert sind, sichert das Modul nichts und meldet nichts (keine Warnungen, Aufgaben oder E-Mails). Ein NAS wird auf dem Host eingebunden (NFS/SMB), nicht im Container. Der Zielordner in den Einstellungen liegt darunter (Standard `forga`).
- `FORGA_SECRET_KEY` für die gespeicherte Passphrase (geplante Sicherungen).
- Die Datenbankrolle `forga` legt für die Wiederherstellung eine neue Datenbank an und benennt Datenbanken um; der Benutzer aus `POSTGRES_USER` darf das. Ohne `CREATEDB` stellt das Modul in die laufende Datenbank in einer Transaktion wieder her.

Eine Sicherung ist eine Datei `forga-<instanz>-JJJJ-MM-TT_HHMM.forgabackup` mit Datenbank (`pg_dump`, alle Schemas), Plugins und einer lesbaren Kopie der Einstellungen ohne Geheimnisse, verschlüsselt mit der Passphrase. Ohne f.orga, z. B. auf einem anderen Rechner mit dem Repository:

```bash
npm run backup -- info forga-real-2026-10-28_0230.forgabackup
FORGA_BACKUP_PASSPHRASE=… npm run backup -- decrypt forga-real-2026-10-28_0230.forgabackup ./entpackt
createdb forga && pg_restore --no-owner --dbname forga ./entpackt/database.dump
```

**Wiederherstellung und Neustart:** Am Ende einer Wiederherstellung beendet sich der Prozess mit Exit-Code 0; Docker startet den Container wegen `restart: unless-stopped` neu, beim Start laufen die Migrationen und die Wiederherstellung wird abgeschlossen. Ohne Neustart-Regel (oder in der Entwicklung mit `npm run dev`) bleibt der Server beendet; die Seite zeigt nach zwei Minuten „Bitte den Container neu starten: `docker compose restart forga`“. Der Wartungsmodus steht in `/tmp/forga-maintenance` im Container und übersteht den Neustart, nicht aber ein Neuanlegen des Containers (`docker compose up` mit geändertem Image); während einer Wiederherstellung den Container also nicht neu anlegen.

**Rücktausch von Hand,** falls der Server nach einer Wiederherstellung nicht startet (z. B. weil eine Migration scheitert): Die vorige Datenbank heißt `forga_before_<JJJJMMTT_HHMMSS>` (UTC) und bleibt 7 Tage liegen.

```bash
F=docker/compose.yml
docker compose -f $F stop forga
docker compose -f $F exec -T db psql -U forga -d postgres -c 'alter database forga rename to forga_failed' -c 'alter database forga_before_20261028_134100 rename to forga'
docker compose -f $F start forga
```

Bleibt der Wartungsmodus nach einem gescheiterten Tausch an, nennt die Seite der Wiederherstellung die Befehle; danach den Merker entfernen: `docker compose -f $F exec forga rm -f /tmp/forga-maintenance` und den Container neu starten.

### Komplette Sicherung mit `docker/backup.sh`

Das Skript bleibt für Betreiber des Servers: Es sichert alle Instanzen einer Compose-Datei (Echt- und Testsystem) und auf Wunsch `docker/.env`, und es hilft, wenn die Anwendung nicht mehr startet. Fremde Dateien im Zielordner des Moduls (z. B. vom Skript) lässt das Modul unberührt.

**Komplette Sicherung** mit `docker/backup.sh`: im laufenden Betrieb (konsistenter Abzug, der Dienst hält nicht an) je Datenbank-Dienst der Compose-Datei ein `pg_dump` (komprimiertes Format von `pg_dump`) und je Anwendungs-Container der Inhalt von `/plugins`, auf Wunsch auch `docker/.env`, in einen Ordner `forga-JJJJ-MM-TT_HHMM`. Ältere Sicherungen über die Aufbewahrung hinaus löscht das Skript.

```bash
docker/backup.sh -f docker/compose.stages.yml -d /srv/backup/forga -k 30 --with-env
```

| Option | Bedeutung | Standard |
| --- | --- | --- |
| `-f` | Compose-Datei; gesichert werden alle Dienste, deren Name mit `db` beginnt (bei den Stufen `db-real` und `db-test`) | `docker/compose.yml` |
| `-d` | Zielordner | `./backup` |
| `-k` | Anzahl aufbewahrter Sicherungen | `30` |
| `--with-env` | `docker/.env` mitsichern (Passwörter, `FORGA_SECRET_KEY`) | aus |

**Regelmäßig**, z. B. nächtlich um 2:30 Uhr:

- Linux (Cron des Benutzers, der Docker bedienen darf; `crontab -e`):

  ```cron
  30 2 * * * /opt/f.orga/docker/backup.sh -f docker/compose.stages.yml -d /srv/backup/forga -k 30 --with-env >> /var/log/forga-backup.log 2>&1
  ```

- macOS (Docker Desktop): eine LaunchAgent-Datei `~/Library/LaunchAgents/de.forga.backup.plist`, geladen mit `launchctl load ~/Library/LaunchAgents/de.forga.backup.plist`; sie läuft nur, solange der Benutzer angemeldet und Docker Desktop gestartet ist.

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0"><dict>
    <key>Label</key><string>de.forga.backup</string>
    <key>ProgramArguments</key><array>
      <string>/bin/sh</string><string>-c</string>
      <string>PATH=/usr/local/bin:/opt/homebrew/bin:$PATH /Pfad/zu/f.orga/docker/backup.sh -f docker/compose.stages.yml -d "$HOME/Backups/forga" -k 30 --with-env</string>
    </array>
    <key>StartCalendarInterval</key><dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer></dict>
    <key>StandardOutPath</key><string>/tmp/forga-backup.log</string>
    <key>StandardErrorPath</key><string>/tmp/forga-backup.log</string>
  </dict></plist>
  ```

Der Zielordner sollte auf einem anderen Datenträger liegen als die Docker-Volumes, mit einer weiteren Kopie außer Haus (z. B. verschlüsseltes NAS oder Cloud-Speicher der Feuerwehr). Ein Abzug lässt sich auch einzeln von Hand erstellen: `docker compose -f docker/compose.stages.yml exec -T db-real pg_dump -U forga -d forga -Fc > forga-real.dump`.

Die Abzüge enthalten personenbezogene Daten und Gesundheitsdaten (Atemschutz-Tauglichkeit): Sicherungsziel verschlüsselt und nur für Berechtigte zugänglich ablegen, eine Kopie außerhalb des Gebäudes halten.

**Wiederherstellen** (ersetzt den aktuellen Stand vollständig):

```bash
F=docker/compose.stages.yml
docker compose -f $F stop forga-real
docker compose -f $F exec -T db-real dropdb -U forga forga
docker compose -f $F exec -T db-real createdb -U forga forga
docker compose -f $F exec -T db-real pg_restore -U forga -d forga --no-owner < /srv/backup/forga/forga-2026-10-28_0230/db-real.dump
docker compose -f $F start forga-real
# Plugins (falls gesichert): docker compose -f $F exec -T forga-real tar xzf - -C /plugins < …/forga-real-plugins.tgz, danach Neustart
```

Beim Start spielt der Server fehlende Migrationen ein; ein Abzug aus einer älteren Version lässt sich also mit einem neueren Image wiederherstellen, nicht umgekehrt. Die Wiederherstellung sollte gelegentlich geprüft werden, am einfachsten ins Testsystem (`db-test`/`forga-test` statt `db-real`/`forga-real`).

**Größe:** Anhänge machen den größten Teil aus (bei etwa 300 Einsätzen im Jahr mit je fünf Fotos zu 2 MB rund 3 GB im Jahr); die übrigen Daten bleiben im Bereich weniger hundert MB.

## Einschränkungen des aktuellen Stands

- HTTPS ist nicht eingerichtet. Ohne vorgeschalteten Reverse Proxy mit TLS gehört der Stack deshalb nicht ins Internet.
- Die Datensicherung des Moduls sichert nur in einen Ordner (bzw. ein auf dem Host eingebundenes NAS), nicht direkt in S3 oder WebDAV; `docker/.env` sichert nur `docker/backup.sh` (siehe [Datensicherung](#datensicherung)).
- Die Sperre nach Fehlversuchen bei der Anmeldung und die Begrenzung von „Passwort vergessen“ liegen im Speicher des Prozesses. Ein Neustart setzt sie zurück.
