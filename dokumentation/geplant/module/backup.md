# Modul Datensicherung (`backup`)

Geplantes Modul. Administratoren richten in der Oberfläche eine regelmäßige, verschlüsselte Sicherung in einen Ordner auf dem Server ein, prüfen Sicherungen und stellen eine Sicherung wieder her. Heute gibt es dafür nichts in der Anwendung, nur das Skript auf dem Host (siehe [Betrieb: Datensicherung](../../implementiert/betrieb.md#datensicherung)).

Mockups (zur Freigabe): `sicherung/uebersicht.html`, `sicherung/einstellungen.html`, `sicherung/sicherungen.html`, `sicherung/wiederherstellen.html`, `sicherung/wiederherstellung-laeuft.html`, `sicherung/wartung.html` (siehe [Mockups](../mockups/README.md#seiten)).

## Abgrenzung

| Weg | Wer | Wofür |
| --- | --- | --- |
| Modul `backup` | Administrator in f.orga | regelmäßige Sicherung der eigenen Instanz, Prüfung, Wiederherstellung ohne Konsole |
| `docker/backup.sh` (Skript auf dem Host, siehe [Betrieb](../../implementiert/betrieb.md#datensicherung)) | Betreiber des Servers | Sicherung aller Instanzen einer Compose-Datei (Echt- und Testsystem) mit `pg_dump` je Datenbank, Plugins und optional `docker/.env`; Wiederherstellung über die Konsole. Bleibt als Alternative und für den Fall, dass die Anwendung nicht mehr startet. |
| Vollexport (`core.data.export`) | Administrator | JSON je Modul für Auswertung und Umzug, keine Sicherung (keine Historie, kein Audit, nicht wiederherstellbar) |

**Mehrere Stufen** (`docker/compose.stages.yml`): Jede Instanz sichert sich selbst, mit eigenem Zielordner, eigener Passphrase und eigenem `FORGA_SECRET_KEY`. Eine Sicherung trägt Name und Kennung der Instanz; das Testsystem kann eine Sicherung des Echtsystems wiederherstellen (z. B. zum Üben), nur mit deren Passphrase und nach der gleichen Bestätigung.

## Modul

- ID `backup`, Schema `backup`, API `/api/backup/…`, Frontend unter `/backup/…`, Menü „Verwaltung → Datensicherung“ für Übersicht und Sicherungen (Arbeitsseiten, keine reine Einstellungsseite); die Einstellungsseite erscheint wie bei allen Modulen zusätzlich unter „Verwaltung → Module → Datensicherung“.
- Rechte: `backup.manage` (Gesamtwehr: einrichten, sichern, prüfen, herunterladen, wiederherstellen) und `backup.notify` (E-Mail bei Fehlschlag). Keine Rollenvorlage außer `administrator` (`*`). Wer es hat, kann den gesamten Datenbestand herunterladen und ersetzen; das Recht gilt deshalb als privilegiert (`isPrivileged`, keine automatische OIDC-Verknüpfung) und lässt sich keinem API-Token geben.
- Benötigt nur `core`. Das Modul ist standardmäßig aktiv, tut aber nichts, solange kein Ziel eingerichtet ist; die Einrichtungsliste der Startseite nennt „Datensicherung einrichten“.

## Betrieb und Voraussetzungen

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `FORGA_BACKUP_ROOT` | Wurzel, unter der Zielordner liegen dürfen. Im Container ein Volume oder Bind-Mount, z. B. `/backups` ← `/mnt/nas/forga` auf dem Host. Ohne Angabe ist das Modul nur lesbar („nicht eingerichtet“). | – |
| `FORGA_SECRET_KEY` | verschlüsselt die gespeicherte Passphrase (siehe unten); Pflicht für geplante Sicherungen | – |
| `FORGA_BACKUP_SCHEDULER` | `off`: keine geplanten Sicherungen (Tests, Testsystem) | an |

- Das Laufzeit-Image bekommt die PostgreSQL-Clientwerkzeuge (`postgresql17-client` auf Alpine: `pg_dump`, `pg_restore`, `psql`) in der Version des Servers. Beim Start prüft das Modul `pg_dump --version` gegen die Serverversion und meldet Abweichungen auf der Übersicht (`backup.clientMismatch`).
- Compose bekommt ein Volume bzw. einen Bind-Mount für `/backups` und setzt `FORGA_BACKUP_ROOT=/backups`. Der Ordner auf dem Host gehört dem Benutzer des Containers (`node`, UID 1000). Ein NAS wird auf dem Host eingebunden (NFS/SMB), nicht im Container.
- Die Datenbankrolle `forga` ist Eigentümer aller Schemas; das genügt für `pg_dump` und `pg_restore --clean`. Für die Wiederherstellung in eine neue Datenbank braucht sie `CREATEDB` (siehe Wiederherstellung).

## Inhalt einer Sicherung

Eine Sicherung ist eine Datei `forga-<instanz>-<JJJJ-MM-TT_HHMM>.forgabackup` im Zielordner, bei Verschlüsselung als Ganzes verschlüsselt. Darin (tar):

| Teil | Inhalt |
| --- | --- |
| `manifest.json` | Format, Version von f.orga, Versionen aller Module und Plugins, letzte Migration je Modul, PostgreSQL-Version, Instanz, Zeitpunkt, Auslöser (geplant, manuell, Sicherheitssicherung), SHA-256 der Teile |
| `database.dump` | `pg_dump -Fc` der ganzen Datenbank (alle Schemas: `core` mit Anhängen, Wappen, Einstellungen, Audit, Historie; alle Module) |
| `plugins.tgz` | Inhalt von `FORGA_PLUGIN_DIR`, wenn Plugins eingeschaltet sind |
| `settings.json` | optional: Einstellungen als lesbare Kopie (ohne Geheimnisse) zum Nachsehen ohne Wiederherstellung |

Nicht enthalten: `docker/.env`, `FORGA_SECRET_KEY`, die Passphrase. Der Hinweis auf der Seite: Ohne den alten `FORGA_SECRET_KEY` lassen sich nach einer Wiederherstellung die Links der Infoterminals nicht mehr anzeigen und Transponder der Führerscheinkontrolle nicht mehr erkennen; die Geräte arbeiten weiter, Transponder müssen neu registriert werden. `FORGA_SECRET_KEY` und Passphrase gehören deshalb getrennt von der Sicherung in den Passwortsafe der Feuerwehr.

`pg_dump` läuft als Kindprozess mit Datenstrom (keine Zwischendatei im Container), die Verschlüsselung im Strom dahinter. Die Datei entsteht als `.part` und wird erst nach Abschluss und Prüfsumme umbenannt.

## Verschlüsselung

- AES-256-GCM in Blöcken von 1 MiB (je Block eigene Nonce und Tag, Reihenfolge und Ende authentisiert), Schlüssel aus der Passphrase mit scrypt (Salz je Datei). Kopf mit Format, Salz und scrypt-Parametern unverschlüsselt. Damit lässt sich eine Sicherung ohne f.orga mit einem kleinen mitgelieferten Werkzeug entschlüsseln (`npm run backup -- decrypt <datei>`), auch auf einem anderen Rechner.
- Die Passphrase (mindestens 12 Zeichen) wird beim Speichern zweimal eingegeben und mit `FORGA_SECRET_KEY` verschlüsselt (AES-256-GCM, wie die Geräteschlüssel der Infoterminals) gespeichert, damit geplante Sicherungen ohne Eingabe laufen. Sie ist nur schreibbar, erscheint nie in Antworten, Historie oder Vollexport.
- Ohne `FORGA_SECRET_KEY` gibt es nur manuelle Sicherungen mit Eingabe der Passphrase (`backup.noSecretKey` auf der Übersicht).
- **Warnung** beim Einrichten und Ändern, mit Kontrollkästchen „Ich habe die Passphrase sicher aufbewahrt“: Ohne die Passphrase lässt sich keine Sicherung wiederherstellen, auch nicht durch den Hersteller.
- Eine Änderung der Passphrase gilt für künftige Sicherungen. Die Liste zeigt je Sicherung einen Kennwert der Passphrase (erste 8 Zeichen eines HMAC), damit erkennbar ist, welche Passphrase sie braucht.
- Unverschlüsselt sichern ist möglich, aber nur mit ausdrücklicher Bestätigung und dauerhaftem Hinweis auf der Übersicht.

## Einstellungen

Abschnitt `backup.general` (lesen und schreiben nur mit `backup.manage`):

| Feld | Inhalt | Standard |
| --- | --- | --- |
| `targetPath` | Unterordner unter `FORGA_BACKUP_ROOT`, relativ; `..`, absolute Pfade und Verknüpfungen nach außen werden abgelehnt (`backup.pathOutsideRoot`). „Ziel prüfen“ schreibt und löscht eine Testdatei und zeigt freien Speicher. | `forga` |
| `schedule` | aus oder täglich um Uhrzeit (Europe/Berlin), optional nur an Wochentagen | täglich 02:30 |
| `keepCount`, `keepDays` | Aufbewahrung: die neuesten n Sicherungen und alle der letzten d Tage bleiben; Sicherheitssicherungen vor einer Wiederherstellung 30 Tage zusätzlich | 14, 30 |
| `encryption` | an/aus, Passphrase (nur schreibbar) | an |
| `include` | Plugins, Einstellungen als Kopie | beide |
| `notify` | bei Fehlschlag: Aufgabe für alle mit `backup.manage` und E-Mail an Benutzer mit `backup.notify`; Warnung, wenn seit `staleHours` keine erfolgreiche Sicherung | an, 36 h |

## Ablauf einer Sicherung

1. Auslöser: Zeitplan (stündliche Prüfung wie die Sammel-E-Mail), „Jetzt sichern“ oder Sicherheitssicherung vor einer Wiederherstellung. Höchstens eine Sicherung gleichzeitig (Sperre `pg_advisory_lock`); ein zweiter Auslöser bekommt `409 backup.running`.
2. Freien Speicher prüfen (geschätzt aus der letzten Sicherung), Datei `.part` anlegen, `pg_dump -Fc` streamen, Plugins anhängen, Manifest mit Prüfsummen schreiben, umbenennen.
3. Eintrag in `backup.run`: Zeitpunkt, Dauer, Auslöser, Benutzer, Datei, Größe, Status (`running`, `ok`, `failed` mit Code), Kennwert der Passphrase, Versionen. Audit `backup.created` bzw. `backup.failed`.
4. Aufbewahrung anwenden: ältere Dateien nach `keepCount`/`keepDays` löschen (Audit `backup.pruned`). Dateien im Zielordner, die f.orga nicht kennt (z. B. vom Skript), bleiben unberührt.

Die Liste liest den Zielordner und gleicht ihn mit `backup.run` ab: Dateien ohne Eintrag erscheinen als „fremd“ (z. B. aus einer anderen Instanz) und lassen sich prüfen und wiederherstellen; Einträge ohne Datei als „Datei fehlt“.

**Prüfen** („Prüfen“ je Sicherung, auf Wunsch nach jeder Sicherung automatisch): entschlüsseln, Prüfsummen vergleichen, `pg_restore --list` lesen und Zahl der Objekte melden. Ergebnis mit Zeitpunkt an der Sicherung. **Wiederherstellung testen** geht weiter: Wiederherstellung in eine temporäre Datenbank `forga_restore_test`, Migrationen nicht ausführen, Zeilen zentraler Tabellen zählen (Personen, Einsätze, Berichte, Dienste) und mit dem Manifest vergleichen, danach die Datenbank löschen. Die laufende Anwendung bleibt unberührt.

**Herunterladen** streamt die Datei (verschlüsselt, wie sie liegt), Audit `backup.downloaded`. **Löschen** mit Bestätigung, Audit `backup.deleted`. **Hochladen** einer Sicherung (z. B. vom alten Server) legt sie in den Zielordner; Grenze nach freiem Speicher, kein festes Limit.

## Wiederherstellung

Nur mit `backup.manage`, in einem Assistenten:

1. **Auswählen:** Sicherung aus der Liste (oder hochgeladen). Angezeigt: Zeitpunkt, Instanz, Version von f.orga, Module, Größe, letzte Prüfung.
2. **Prüfen:** Passphrase eingeben (nicht die gespeicherte, damit ein angemeldeter Fremder ohne Passphrase nichts zurückspielen kann), entschlüsseln, Prüfsummen und Inhalt prüfen. Abgelehnt wird:
   - eine Sicherung einer **neueren** f.orga-Version oder mit einer Migration, die die laufende Version nicht kennt (`backup.newerVersion`): erst f.orga aktualisieren;
   - eine Sicherung mit Modulen oder Plugins, die hier fehlen (`backup.missingModules`, mit Liste): erst installieren;
   - eine andere PostgreSQL-Hauptversion des Dumps als die des Clients ist erlaubt, wenn `pg_restore` sie lesen kann.
   Ältere Sicherungen sind erlaubt; ihre Migrationen laufen beim Neustart nach.
3. **Bestätigen:** Zusammenfassung „Alle Daten seit dem <Zeitpunkt> gehen verloren“ mit Zahlen (Einsätze, Berichte, Personen jetzt und in der Sicherung), Eingabe des Namens der Feuerwehr, Kontrollkästchen „Alle Benutzer werden abgemeldet“. Vorher entsteht automatisch eine **Sicherheitssicherung** des aktuellen Stands (verschlüsselt mit der gespeicherten Passphrase), die in der Liste markiert ist.
4. **Ausführen** (Fortschritt live, Seite pollt `GET /api/backup/restore/status`):
   1. Wartungsmodus an (siehe unten), laufende Anfragen auslaufen lassen (höchstens 30 s), Zeitpläne anhalten.
   2. Sicherheitssicherung schreiben und prüfen.
   3. Neue Datenbank `forga_restore_<zeit>` anlegen und die Sicherung mit `pg_restore --no-owner --exit-on-error` dorthin einspielen.
   4. Kurzer Tausch: Verbindungen zur alten Datenbank beenden, `forga` in `forga_before_<zeit>` umbenennen, die neue in `forga` umbenennen. Ist die neue Datenbank fehlerhaft, bleibt die alte unverändert in Betrieb.
   5. Plugins aus der Sicherung zurückschreiben (falls enthalten).
   6. Prozess beendet sich mit Exit-Code 0; Docker startet ihn neu (`restart: unless-stopped`). Beim Start laufen die Migrationen, der Wartungsmodus endet, alle Sitzungen sind ungültig (Sessions der Sicherung werden beim Start gelöscht).
   Audit `backup.restore-started` vorher in der alten und `backup.restored` (mit Sicherung, Benutzer, Sicherheitssicherung) nach dem Start in der neuen Datenbank, damit beide Seiten es wissen.
5. **Danach:** Anmeldeseite mit Hinweis „Wiederhergestellt aus der Sicherung vom …“ für den Administrator; die alte Datenbank `forga_before_<zeit>` bleibt 7 Tage liegen und wird dann vom Modul gelöscht (oder sofort über „Alte Datenbank löschen“).

**Fallback ohne `CREATEDB`:** `pg_restore --clean --if-exists --single-transaction` direkt in `forga`. Schlägt es fehl, rollt die Transaktion zurück und der alte Stand bleibt. Die Übersicht zeigt, welcher Weg möglich ist.

**Wartungsmodus:** Ein Merker im Prozess und in der Datei `/tmp/forga-maintenance`. Alle Anfragen außer `GET /api/backup/restore/status` (nur für die auslösende Sitzung) und den statischen Dateien antworten `503 maintenance` mit `Retry-After`. Die Shell zeigt dann statt der Anwendung die Wartungsseite („f.orga wird gerade wiederhergestellt. Bitte in einigen Minuten neu laden.“) und lädt selbst neu, sobald der Server wieder antwortet. Infoterminals zeigen „vorübergehend nicht verfügbar“. Endpunkte der Schnittstellen (API-Tokens) bekommen ebenfalls 503.

**Fehler:**
| Fehler | Folge |
| --- | --- |
| Passphrase falsch, Datei beschädigt | Abbruch in Schritt 2, nichts geändert |
| Sicherheitssicherung scheitert (z. B. Ziel voll) | Abbruch vor jeder Änderung, Wartungsmodus aus |
| `pg_restore` scheitert | neue Datenbank wird gelöscht, alte bleibt, Wartungsmodus aus, Meldung mit Ausschnitt des Fehlers, Audit `backup.restore-failed` |
| Tausch scheitert | Umbenennung wird zurückgenommen; gelingt das nicht, bleibt der Wartungsmodus an und die Seite nennt die Befehle für die Konsole |
| Neustart kommt nicht (Container ohne Restart-Regel, Entwicklung) | Seite zeigt nach 2 Minuten „Bitte den Container neu starten: `docker compose restart forga`“ |
| Migrationen scheitern nach dem Neustart | Server startet nicht; Betriebsanleitung beschreibt den Rücktausch auf `forga_before_<zeit>` mit `psql` |

## Oberfläche

| Pfad | Seite |
| --- | --- |
| `/backup` | Übersicht: Stand (letzte erfolgreiche Sicherung, nächste geplante, letzte Prüfung), Ziel mit freiem Speicher, Verschlüsselung, Warnungen (keine Sicherung seit 36 h, Ziel nicht erreichbar, Client-Version), „Jetzt sichern“ |
| `/backup/settings` | Ziel, Zeitplan, Aufbewahrung, Verschlüsselung, Inhalt, Benachrichtigung |
| `/backup/backups` | Sicherungen mit Zeitpunkt, Auslöser, Größe, Status, Prüfung; Prüfen, Wiederherstellung testen, Herunterladen, Wiederherstellen, Löschen; Hochladen |
| `/backup/restore/:id` | Assistent der Wiederherstellung |
| Shell | Wartungsseite bei `503 maintenance` |

## Schnittstellen

`GET /api/backup/status`, `GET|PUT /api/backup/settings`, `POST /api/backup/settings/test-target`, `GET /api/backup/backups`, `POST /api/backup/backups` (jetzt sichern), `POST /api/backup/backups/upload`, `POST /api/backup/backups/:id/verify` (mit `restoreTest`), `GET /api/backup/backups/:id/file`, `DELETE /api/backup/backups/:id`, `POST /api/backup/restore` (`backupId`, `passphrase`, `confirmName`), `GET /api/backup/restore/status`. Alle mit `backup.manage`. Fehlercodes `backup.*`, z. B. `backup.notConfigured`, `backup.pathOutsideRoot`, `backup.targetNotWritable`, `backup.diskFull`, `backup.running`, `backup.wrongPassphrase`, `backup.corrupt`, `backup.newerVersion`, `backup.missingModules`, `backup.confirmNameMismatch`, `backup.restoreFailed`.

## Datenhaltung

Schema `backup`: `run` (Sicherungen und Prüfungen, nicht historisiert, da Protokoll), `restore` (Wiederherstellungen mit Schritten und Ergebnis). Die Einstellung liegt in `core.setting` (Historie mit `••••••` für die Passphrase). Vollexport: nur `run` ohne Pfade außerhalb des Zielordners. Aufbewahrung: Einträge zu gelöschten Dateien nach 1 Jahr entfernen.

## Offene Entscheidungen

1. **Passphrase speichern:** mit `FORGA_SECRET_KEY` verschlüsselt (geplante Sicherungen laufen) oder gar nicht (nur manuell)? *Empfehlung:* verschlüsselt speichern; ein Angreifer mit Datenbank und `.env` hat ohnehin alle Daten.
2. **Wiederherstellungsweg:** neue Datenbank und Tausch oder `--clean` in die laufende Datenbank? *Empfehlung:* neue Datenbank und Tausch (alter Stand bleibt bis zum Ende unberührt), `--clean` nur als Rückfall ohne `CREATEDB`.
3. **Passphrase bei der Wiederherstellung erneut eingeben?** *Empfehlung:* ja, damit eine übernommene Sitzung allein nicht reicht.
4. **Neustart:** Prozess beendet sich selbst und Docker startet neu, oder Wiederherstellung ohne Neustart (Verbindungspool neu aufbauen, Migrationen im Prozess)? *Empfehlung:* Neustart, weil Plugins und Module beim Start geladen werden; die Seite erklärt, was zu tun ist, wenn er ausbleibt.
5. **Format:** eigenes AES-256-GCM-Format mit Werkzeug oder `age`? *Empfehlung:* eigenes Format mit Node-Bordmitteln (keine weitere Abhängigkeit im Image), dazu das Entschlüsselungswerkzeug im Repository.
6. **Sicherung außer Haus:** nur Ordner auf dem Server (NAS über den Host) oder auch S3/WebDAV? *Empfehlung:* zuerst nur Ordner; ein zweites Ziel später, falls gewünscht.
7. **Recht `backup.notify`** für E-Mails getrennt von `backup.manage`? *Empfehlung:* ja, wie bei den Benachrichtigungen der anderen Module, damit das Administratorkonto (`*`) nicht jede Meldung bekommt.
