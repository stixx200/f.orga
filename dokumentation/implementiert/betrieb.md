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
- **Ersteinrichtung:** Beim ersten Aufruf mit leerer Datenbank fragt die Anwendung den Einrichtungsschlüssel, den Namen der Feuerwehr und das erste Administratorkonto (mit E-Mail-Adresse) ab. Der Schlüssel verhindert, dass jemand, der die frische Installation zuerst erreicht, sich zum Administrator macht. Ist `FORGA_SETUP_TOKEN` gesetzt, ist er dessen Wert; sonst erzeugt der Server beim Start einen zufälligen Schlüssel und schreibt ihn ins Protokoll (`docker compose -f docker/compose.yml logs forga`, Zeile „Setup token: …“). Nach einem Neustart gilt ein neuer Schlüssel. Sobald ein Benutzer existiert, ist die Einrichtung gesperrt.
- **Nach der Einrichtung:** Die Startseite zeigt Administratoren eine Liste, was noch fehlt: Adresse von f.orga, E-Mail-Versand, Abteilungen, Kataloge, die Einstellungen jedes aktiven Moduls und weitere Benutzer. Weitere Benutzer lädt man unter „Verwaltung → Benutzer“ aus der Personalakte ein; dafür müssen Adresse und E-Mail-Versand eingerichtet sein.

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Datenbankpasswort, Pflicht | – |
| `FORGA_PORT` | Port auf dem Host | `8080` |
| `FORGA_SECURE_COOKIES` | Sitzungs-Cookie nur über HTTPS senden. Auf `true` setzen, sobald f.orga per HTTPS erreichbar ist. | `false` |
| `FORGA_MAIL_TRANSPORT` | `memory`: E-Mails nur im Speicher sammeln statt per SMTP zu senden (Tests, Vorführung) | SMTP |
| `FORGA_DIGEST_SCHEDULER` | `off`: wöchentliche Sammel-E-Mail nicht automatisch senden | an |
| `FORGA_RETENTION_SCHEDULER` | `off`: Aufbewahrungsregeln (Audit-Log kürzen, Uploads löschen, ausgeschiedene Mitglieder anonymisieren) nicht automatisch anwenden, sondern nur über „Einstellungen → Datenschutz → Jetzt anwenden“. Sonst laufen sie eine Minute nach dem Start und danach täglich. | an |
| `FORGA_SETUP_TOKEN` | Einrichtungsschlüssel für die Ersteinrichtung. Ohne Angabe erzeugt der Server einen und schreibt ihn ins Protokoll. | zufällig |
| `FORGA_PLUGIN_DIR` | Plugin-Verzeichnis; im Container das Volume `forga-plugins` unter `/plugins`. Ohne Angabe sind Plugins aus. | `/plugins` (Compose) |
| `FORGA_PLUGIN_KEYS` | Öffentliche Schlüssel vertrauenswürdiger Plugin-Herausgeber (Base64, kommagetrennt); alternativ die Datei `trusted-keys` im Plugin-Verzeichnis | – |
| `FORGA_PLUGINS_ALLOW_UNSIGNED` | `true`: auch unsignierte Plugin-Pakete annehmen. Nur für die Entwicklung. | `false` |
| `FORGA_TRUST_PROXY` | Reverse Proxy vor f.orga, dem `X-Forwarded-For` geglaubt wird (Express `trust proxy`): `true` (jeder), Anzahl der Proxys (z. B. `1`) oder Adressen/Netze, kommagetrennt (z. B. `loopback`, `10.0.0.0/8`). Nur dann gelten Anfragebegrenzung und Anmeldesperre für die Adresse des Benutzers statt für die des Proxys. Nur setzen, wenn wirklich ein Proxy davor steht, sonst kann jeder seine Adresse fälschen. | aus |
| `FORGA_PUBLIC_URL` | Adresse von f.orga, falls nicht in den Einstellungen (`brigade.publicUrl`); für Links in E-Mails und die Rücksprungadresse der OIDC-Anmeldung. In den Einstellungen nur `https://…` (`http://` nur für `localhost`). | – |

**Echt- und Testsystem nebeneinander** (`docker/compose.stages.yml`): zwei getrennte Instanzen aus demselben Image, jede mit eigener Datenbank und eigenen Volumes. Das Echtsystem ist für echte Daten (z. B. die MP-Feuer-Datenübernahme), das Testsystem für Demodaten. Gewechselt wird über die Adresse; Sitzungen und Daten bleiben getrennt.

```bash
cp docker/.env.example docker/.env      # Passwörter und Einrichtungsschlüssel setzen
docker compose -f docker/compose.stages.yml up -d --build
FORGA_URL=http://localhost:8081 FORGA_SETUP_TOKEN=<FORGA_SETUP_TOKEN_TEST> npm run seed   # Demodaten ins Testsystem
```

| System | Adresse | Variablen |
| --- | --- | --- |
| Echtsystem | `http://<server>:8080` | `POSTGRES_PASSWORD_REAL`, `FORGA_SETUP_TOKEN_REAL`, `FORGA_REAL_PORT` |
| Testsystem | `http://<server>:8081` | `POSTGRES_PASSWORD_TEST`, `FORGA_SETUP_TOKEN_TEST`, `FORGA_TEST_PORT` |

Die Datei hat den eigenen Projektnamen `forga-stages` und feste Volumenamen (`forga_real_db`, `forga_test_db` …), damit sie nicht mit `docker/compose.dev.yml` im selben Verzeichnis kollidiert. Das Testsystem lässt sich jederzeit neu aufsetzen, ohne das Echtsystem zu berühren: `docker compose -f docker/compose.stages.yml rm -sf forga-test db-test && docker volume rm forga_test_db`, danach `up -d` und erneut `npm run seed`.

**Plugins:** Ein signiertes Paket wird unter „Verwaltung → Module“ hochgeladen oder als `.tgz` in das Volume `/plugins` gelegt. Es wirkt nach einem Neustart des Containers (`docker compose -f docker/compose.yml restart forga`); Migrationen des Plugins laufen dabei mit. Abgelehnte Pakete heißen danach `*.tgz.rejected`, der Grund steht im Protokoll des Containers.

**E-Mail:** Für die wöchentliche Sammel-E-Mail mit den Fristen, Einladungen und „Passwort vergessen“ braucht es in den Einstellungen (Abschnitt `smtp`) Server und Absender. Wochentag und Uhrzeit stehen im Abschnitt `reminders`. Benutzer bekommen die E-Mail nur mit hinterlegter E-Mail-Adresse. Scheitert der Versand, nennt die Meldung die Ursache (`mail.authFailed`: Benutzer/Passwort, `mail.connectionFailed`: Server/Port, `mail.tlsFailed`: Port/STARTTLS, `mail.rejected`: Absender/Empfänger); Einzelheiten stehen im Protokoll des Containers. Der Knopf „Test-E-Mail an mich senden“ prüft die gespeicherten Einstellungen.

**Anmeldung mit dem Konto der Gemeinde (OIDC):** Der Anmeldeknopf erscheint nur mit eingetragener Adresse von f.orga. „Verbindung testen“ in den Einstellungen lädt die Konfiguration des Anbieters; ist er nicht erreichbar oder der Aussteller falsch, lautet der Fehler `auth.oidcDiscoveryFailed`. Die erste Anmeldung verknüpft nur über eine vom Anbieter bestätigte E-Mail-Adresse (`email_verified`). Mit „Verknüpfen über Benutzername“ wird nie automatisch verknüpft, weil der Benutzername beim Anbieter weder eindeutig noch bestätigt ist; dann verknüpft jeder Benutzer sein Konto selbst im Profil. Ebenso Konten mit Verwaltungsrechten: Verwaltung von f.orga (`*`, `core.*`) oder feuerwehrweite Verwaltung eines Moduls (`….manage`).

**Aufbewahrung:** Ausgeschiedene Mitglieder werden erst anonymisiert, wenn ein Administrator unter „Einstellungen → Datenschutz“ eine Frist wählt (Standard: nie). Die Seite zeigt vorher, wie viele Personen die gewählte Frist jetzt betreffen würde. Gerade nach einer Datenübernahme mit alten Austritten sollte die Frist bewusst gewählt werden; die Anonymisierung lässt sich nicht rückgängig machen.

**Passwort vergessen:** Die Antwort ist immer gleich, ob es das Konto gibt oder nicht; Suche und Versand laufen nach der Antwort. Je Absenderadresse sind 20 Anfragen in 15 Minuten erlaubt, je Konto werden höchstens drei Links in 15 Minuten verschickt. Hinter einem Reverse Proxy zählt die Adresse des Benutzers nur mit `FORGA_TRUST_PROXY`, sonst teilen sich alle die Adresse des Proxys. Eine E-Mail-Adresse gehört zu höchstens einem aktiven Benutzer; haben ältere Daten eine Adresse doppelt, setzt sie keines der Konten zurück, dann hilft der Benutzername.

**Anmeldesperre:** Nach fünf falschen Passwörtern ist der Benutzername eine Minute gesperrt, aber nur für die Adresse, von der die Versuche kamen; der Inhaber meldet sich von seinem Gerät weiter an. Hinter einem Reverse Proxy braucht das `FORGA_TRUST_PROXY`, sonst sperren Fehlversuche den Benutzernamen für alle.

## Einschränkungen des aktuellen Stands

- HTTPS ist nicht eingerichtet. Ohne vorgeschalteten Reverse Proxy mit TLS gehört der Stack deshalb nicht ins Internet.
- Sicherung und Wiederherstellung sind noch nicht eingerichtet.
- Die Sperre nach Fehlversuchen bei der Anmeldung und die Begrenzung von „Passwort vergessen“ liegen im Speicher des Prozesses. Ein Neustart setzt sie zurück.
