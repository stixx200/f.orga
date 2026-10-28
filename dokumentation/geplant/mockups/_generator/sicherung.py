"""Mockups Modul Datensicherung (`backup`): Übersicht, Einstellungen, Sicherungen, Wiederherstellung, Wartungsseite.

Konzept: dokumentation/geplant/module/backup.md
"""
from rahmen import seite, tabelle, dialog, sym, mockup_hinweis, FUSS, SPRACHE

ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'
BROT = [('Verwaltung', None), ('Datensicherung', 'sicherung/uebersicht.html')]


def reiter(aktiv):
    teile = [('uebersicht.html', 'Übersicht'), ('sicherungen.html', 'Sicherungen'), ('einstellungen.html', 'Einstellungen')]
    return ('<nav class="chips" aria-label="Bereiche der Datensicherung">' + ''.join(
        f'<a class="chip{" aktiv" if z == aktiv else ""}" href="{z}"' + (' aria-current="page"' if z == aktiv else '') + f'>{t}</a>'
        for z, t in teile) + '</nav>')


JETZT = dialog('d-jetzt', 'Jetzt sichern', '''
<p>Sichert jetzt Datenbank und Plugins nach <code translate="no">/backups/forga</code>, verschlüsselt mit der gespeicherten Passphrase. Die Anwendung bleibt währenddessen nutzbar.</p>
<label class="schalter"><input type="checkbox" checked> Danach prüfen (entschlüsseln und Inhalt lesen)</label>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Sicherung starten</button>')

# ---------- Übersicht ----------
seite('sicherung/uebersicht.html', 'Datensicherung', reiter('uebersicht.html') + '''
<div class="raster vier" style="margin-bottom:16px">
  <div class="kachel"><div class="wert">02:31</div><div class="titel">Letzte Sicherung</div><div class="unter">heute · 48 MB · geprüft</div></div>
  <div class="kachel"><div class="wert">02:30</div><div class="titel">Nächste Sicherung</div><div class="unter">morgen, täglich</div></div>
  <div class="kachel"><div class="wert">14</div><div class="titel">Sicherungen</div><div class="unter">älteste vom 29.09.2026</div></div>
  <div class="kachel"><div class="wert">1,8 TB</div><div class="titel">Frei am Ziel</div><div class="unter">reicht für über 1000 Sicherungen</div></div>
</div>
<div class="meldung warnung"><span class="ic">!</span><span><strong>Warnung:</strong> Die Passphrase liegt nur verschlüsselt in f.orga. Ohne sie lässt sich keine Sicherung wiederherstellen. Bewahren Sie Passphrase und <code translate="no">FORGA_SECRET_KEY</code> getrennt von den Sicherungen auf, z. B. im Passwortsafe der Feuerwehr.</span></div>
<div class="raster zwei">
  <section class="karte">
    <div class="karte-kopf"><h2>Stand</h2><span class="plakette ok">in Ordnung</span></div>
    <dl class="daten">
      <dt>Ziel</dt><dd><code translate="no">/backups/forga</code> (NAS des Rathauses, auf dem Host eingebunden)</dd>
      <dt>Zeitplan</dt><dd>täglich 02:30, aufbewahrt: 14 Sicherungen und alle der letzten 30 Tage</dd>
      <dt>Verschlüsselung</dt><dd>AES-256-GCM mit Passphrase, Kennwert 3F9A·C21B</dd>
      <dt>Inhalt</dt><dd>Datenbank, Plugins, Einstellungen als Kopie</dd>
      <dt>Werkzeuge</dt><dd>pg_dump 17.6, Server PostgreSQL 17.6</dd>
      <dt>Benachrichtigung</dt><dd>bei Fehlschlag Aufgabe und E-Mail; Warnung nach 36 Stunden ohne Sicherung</dd>
    </dl>
  </section>
  <section class="karte">
    <div class="karte-kopf"><h2>Letzte Ereignisse</h2><a class="knopf klein" href="sicherungen.html">Alle Sicherungen</a></div>
    <ul class="zeitleiste">
      <li><span class="wann">28.10. 02:31</span><span><strong>Sicherung erstellt</strong> und geprüft<br><span class="meta">geplant · 48 MB · 1 min 12 s</span></span></li>
      <li><span class="wann">27.10. 19:40</span><span><strong>Wiederherstellung getestet</strong><br><span class="meta">Sicherung vom 27.10. · 412 Personen, 2.318 Einsätze wie in der Sicherung · Markus Vogt</span></span></li>
      <li><span class="wann">25.10. 02:30</span><span><strong>Sicherung fehlgeschlagen</strong><br><span class="meta">Ziel nicht erreichbar (NAS aus) · Aufgabe an Administratoren · am 26.10. wieder erfolgreich</span></span></li>
    </ul>
  </section>
</div>''', nav='sicherung/uebersicht.html', brot=BROT,
    aktionen='<a class="knopf" href="einstellungen.html">Einstellungen</a><button type="button" class="knopf primaer" data-dialog="d-jetzt">Jetzt sichern</button>',
    dialoge=JETZT)

# ---------- Einstellungen ----------
seite('sicherung/einstellungen.html', 'Datensicherung', reiter('einstellungen.html') + '''
<div class="raster seite">
<div>
<section class="karte">
  <h2>Ziel</h2>
  <div class="feld"><label class="pflicht">Ordner unter /backups</label><input type="text" value="forga"><div class="hilfe">Nur Ordner unterhalb von <code translate="no">FORGA_BACKUP_ROOT</code> (<code translate="no">/backups</code>). Ein NAS wird auf dem Server eingebunden und dem Container als <code translate="no">/backups</code> bereitgestellt.</div></div>
  <div class="meldung ok"><span class="ic">✓</span><span>Ziel beschreibbar · 1,8 TB frei · geprüft heute 09:12</span><button type="button" class="knopf klein aktion">Ziel prüfen</button></div>
</section>
<section class="karte">
  <h2>Zeitplan und Aufbewahrung</h2>
  <div class="felder">
    <div class="feld"><label>Sichern</label><select><option>aus</option><option selected>täglich</option><option>werktags</option></select></div>
    <div class="feld"><label>Uhrzeit</label><input type="time" value="02:30"></div>
    <div class="feld"><label>Mindestens behalten</label><input type="number" value="14"><div class="hilfe">neueste Sicherungen</div></div>
    <div class="feld"><label>Alle behalten aus den letzten</label><input type="number" value="30"><div class="hilfe">Tagen</div></div>
  </div>
  <label class="schalter"><input type="checkbox" checked> Nach jeder Sicherung prüfen</label>
</section>
<section class="karte">
  <h2>Verschlüsselung</h2>
  <label class="schalter"><input type="checkbox" checked> Sicherungen verschlüsseln (AES-256-GCM)</label>
  <div class="felder zwei" style="margin-top:12px">
    <div class="feld"><label>Neue Passphrase</label><input type="password" placeholder="unverändert"><div class="hilfe">mindestens 12 Zeichen; leer lassen, um die gespeicherte zu behalten</div></div>
    <div class="feld"><label>Passphrase wiederholen</label><input type="password"></div>
  </div>
  <div class="meldung warnung"><span class="ic">!</span><span><strong>Warnung:</strong> Ohne die Passphrase lässt sich keine Sicherung wiederherstellen, auch nicht durch den Hersteller. Eine neue Passphrase gilt nur für künftige Sicherungen.</span></div>
  <label class="schalter"><input type="checkbox"> Ich habe die Passphrase sicher aufbewahrt</label>
</section>
<section class="karte">
  <h2>Inhalt und Benachrichtigung</h2>
  <div class="schalter-liste">
    <label class="schalter"><input type="checkbox" checked disabled> Datenbank (alle Module, Anhänge, Historie, Audit-Log)</label>
    <label class="schalter"><input type="checkbox" checked> Plugins</label>
    <label class="schalter"><input type="checkbox" checked> Einstellungen zusätzlich als lesbare Kopie (ohne Passwörter)</label>
    <label class="schalter"><input type="checkbox" checked> Bei Fehlschlag Aufgabe und E-Mail an Administratoren</label>
  </div>
  <div class="feld" style="margin-top:12px"><label>Warnen, wenn keine Sicherung seit</label><select><option>24 Stunden</option><option selected>36 Stunden</option><option>7 Tagen</option></select></div>
</section>
<div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
</div>
<section class="karte">
  <h2>Nicht in der Sicherung</h2>
  <ul class="liste">
    <li><span><strong>docker/.env</strong><br><span class="meta">Datenbankpasswort und weitere Variablen</span></span></li>
    <li><span><strong>FORGA_SECRET_KEY</strong><br><span class="meta">ohne den alten Wert lassen sich Links der Infoterminals nicht mehr anzeigen und Transponder nicht mehr erkennen</span></span></li>
    <li><span><strong>Passphrase</strong><br><span class="meta">nur verschlüsselt in f.orga</span></span></li>
  </ul>
  <p class="meta">Für eine Sicherung des ganzen Servers (Echt- und Testsystem, .env) gibt es weiterhin das Skript <code translate="no">docker/backup.sh</code> auf dem Host.</p>
</section>
</div>''', nav='sicherung/uebersicht.html', brot=BROT + [('Einstellungen', None)])

# ---------- Sicherungen ----------
def s(zeit, ausl, groesse, status, pruef, kl='', fremd=False):
    akt = ('<div class="knopfreihe" style="flex-wrap:nowrap"><button type="button" class="knopf text klein" data-dialog="d-pruefen">Prüfen</button>'
           '<a class="knopf text klein" href="wiederherstellen.html">Wiederherstellen …</a>'
           '<button type="button" class="symbol-knopf" data-dialog="d-mehr" aria-label="Weitere Aktionen">' + sym('menue') + '</button></div>')
    zellen = [f'<strong>{zeit}</strong>', ausl, groesse, status, pruef, akt]
    return (kl, zellen) if kl else zellen


seite('sicherung/sicherungen.html', 'Datensicherung', reiter('sicherungen.html') + tabelle(
    ['Zeitpunkt', 'Auslöser', '>Größe', 'Status', 'Prüfung', ''], [
        s('28.10.2026 02:30', 'geplant', '48 MB', '<span class="plakette ok">erfolgreich</span>', 'geprüft 02:32'),
        s('27.10.2026 19:38', 'Jetzt sichern · Markus Vogt', '48 MB', '<span class="plakette ok">erfolgreich</span>', '<span class="plakette ok">Wiederherstellung getestet</span>'),
        s('27.10.2026 02:30', 'geplant', '47 MB', '<span class="plakette ok">erfolgreich</span>', 'geprüft 02:32'),
        s('26.10.2026 02:30', 'geplant', '47 MB', '<span class="plakette ok">erfolgreich</span>', 'geprüft 02:31'),
        ('warnung', ['<strong>25.10.2026 02:30</strong>', 'geplant', '–', '<span class="plakette warn">fehlgeschlagen</span>', 'Ziel nicht erreichbar', '']),
        s('12.10.2026 18:05', 'Sicherheitssicherung vor Wiederherstellung', '46 MB', '<span class="plakette ok">erfolgreich</span>', 'geprüft 18:06'),
        s('01.10.2026 22:14', '<span class="plakette grau">fremd</span> Testsystem', '31 MB', '<span class="plakette">nicht von dieser Instanz</span>', 'nicht geprüft'),
    ], 'stapel') + '''
<p class="meta" style="margin-top:10px">Ordner <code translate="no">/backups/forga</code>. Dateien, die nicht von f.orga stammen, erscheinen als „fremd“ und lassen sich prüfen und wiederherstellen, aber nicht löschen.</p>''',
    nav='sicherung/uebersicht.html', brot=BROT + [('Sicherungen', None)],
    aktionen='<a class="knopf" href="#">Sicherung hochladen</a><button type="button" class="knopf primaer" data-dialog="d-jetzt">Jetzt sichern</button>',
    dialoge=JETZT + dialog('d-pruefen', 'Sicherung prüfen', '''
<p>Sicherung vom 28.10.2026 02:30</p>
<ul class="liste">
  <li><span>Entschlüsselt, Prüfsummen stimmen</span><span class="plakette ok">ok</span></li>
  <li><span>Datenbank lesbar: 1.284 Objekte in 14 Schemas</span><span class="plakette ok">ok</span></li>
  <li><span>f.orga 1.4.0, alle Module vorhanden</span><span class="plakette ok">ok</span></li>
</ul>
<label class="schalter" style="margin-top:12px"><input type="checkbox"> Zusätzlich Wiederherstellung testen (in eine temporäre Datenbank, die Anwendung bleibt unberührt, dauert einige Minuten)</label>''',
        '<button class="knopf" value="abbrechen">Schließen</button><button class="knopf primaer" value="ok">Prüfen</button>')
    + dialog('d-mehr', 'Sicherung vom 28.10.2026 02:30', '''
<dl class="daten"><dt>Datei</dt><dd><code translate="no">forga-real-2026-10-28_0230.forgabackup</code></dd><dt>Version</dt><dd>f.orga 1.4.0 · PostgreSQL 17.6</dd><dt>Passphrase</dt><dd>Kennwert 3F9A·C21B</dd></dl>
<div class="knopfreihe" style="margin-top:12px"><a class="knopf" href="#">Herunterladen</a><button type="button" class="knopf" data-dialog="d-loeschen">Löschen …</button></div>
<p class="meta">Herunterladen und Löschen stehen im Audit-Log. Die Datei bleibt verschlüsselt.</p>''',
        '<button class="knopf" value="abbrechen">Schließen</button>')
    + dialog('d-loeschen', 'Sicherung löschen?', '<p>Die Sicherung vom 28.10.2026 02:30 (48 MB) wird aus dem Zielordner gelöscht. Das lässt sich nicht rückgängig machen.</p>',
             ABBRECHEN + '<button class="knopf primaer" value="ok">Löschen</button>', gefahr=True))

# ---------- Wiederherstellen ----------
seite('sicherung/wiederherstellen.html', 'Wiederherstellen', '''
<ol class="schritte">
  <li><a class="fertig" href="sicherungen.html"><span class="nr">✓</span><span class="text">Sicherung wählen</span></a></li>
  <li><a class="fertig" href="#"><span class="nr">✓</span><span class="text">Prüfen</span></a></li>
  <li><a class="aktiv" href="#" aria-current="step"><span class="nr">3</span><span class="text">Bestätigen</span></a></li>
  <li><a href="wiederherstellung-laeuft.html"><span class="nr">4</span><span class="text">Wiederherstellen</span></a></li>
</ol>
<p class="schritt-titel">Schritt 3 von 4: Bestätigen</p>
<div class="raster seite">
<section class="karte">
  <h2>Sicherung vom 27.10.2026 19:38</h2>
  <div class="meldung ok"><span class="ic">✓</span><span>Passphrase richtig, Prüfsummen stimmen, Version passt (Sicherung f.orga 1.4.0, laufend 1.4.0).</span></div>
  ''' + tabelle(['', '>Jetzt', '>In der Sicherung'], [
      ['Personen', '414', '412'], ['Einsätze', '2.321', '2.318'], ['Berichte', '3.107', '3.102'], ['Dienste', '1.877', '1.877'],
  ]) + '''
  <div class="meldung fehler" style="margin-top:16px"><span class="ic">!</span><span><strong>Alle Änderungen seit dem 27.10.2026 19:38 gehen verloren.</strong> Alle Benutzer werden abgemeldet, und f.orga ist einige Minuten nicht erreichbar. Vorher entsteht automatisch eine Sicherheitssicherung des jetzigen Stands.</span></div>
  <div class="feld"><label class="pflicht">Zur Bestätigung den Namen der Feuerwehr eingeben</label><input type="text" placeholder="Freiwillige Feuerwehr Musterstadt"></div>
  <label class="schalter"><input type="checkbox"> Ich habe die Benutzer informiert, dass f.orga kurz nicht erreichbar ist.</label>
  <div class="formular-fuss"><a class="knopf" href="sicherungen.html">Abbrechen</a><a class="knopf primaer" href="wiederherstellung-laeuft.html">Jetzt wiederherstellen</a></div>
</section>
<section class="karte">
  <h2>Was geschieht</h2>
  <ol class="liste">
    <li><span>Wartungsmodus: andere Benutzer und Infoterminals sehen eine Wartungsseite.</span></li>
    <li><span>Sicherheitssicherung des jetzigen Stands, 30 Tage aufbewahrt.</span></li>
    <li><span>Einspielen in eine neue Datenbank; die bisherige bleibt bis zum Tausch unberührt.</span></li>
    <li><span>Tausch der Datenbanken und Neustart von f.orga; Migrationen laufen beim Start.</span></li>
    <li><span>Die bisherige Datenbank bleibt 7 Tage als Rückfall erhalten.</span></li>
  </ol>
  <p class="meta">Abgelehnt werden Sicherungen einer neueren f.orga-Version und Sicherungen mit Modulen, die hier fehlen.</p>
</section>
</div>''', nav='sicherung/uebersicht.html', brot=BROT + [('Wiederherstellen', None)])

seite('sicherung/wiederherstellung-laeuft.html', 'Wiederherstellen', '''
<ol class="schritte">
  <li><a class="fertig" href="sicherungen.html"><span class="nr">✓</span><span class="text">Sicherung wählen</span></a></li>
  <li><a class="fertig" href="#"><span class="nr">✓</span><span class="text">Prüfen</span></a></li>
  <li><a class="fertig" href="wiederherstellen.html"><span class="nr">✓</span><span class="text">Bestätigen</span></a></li>
  <li><a class="aktiv" href="#" aria-current="step"><span class="nr">4</span><span class="text">Wiederherstellen</span></a></li>
</ol>
<p class="schritt-titel">Schritt 4 von 4: Wiederherstellen</p>
<section class="karte">
  <div class="karte-kopf"><h2>Wiederherstellung läuft</h2><span class="plakette gelb">Wartungsmodus</span></div>
  <ul class="liste">
    <li><span>Wartungsmodus an, 3 Sitzungen beendet</span><span class="plakette ok">erledigt</span></li>
    <li><span>Sicherheitssicherung 28.10.2026 14:41 (48 MB), geprüft</span><span class="plakette ok">erledigt</span></li>
    <li><span>Einspielen in neue Datenbank: 61 %</span><span class="plakette gelb">läuft</span></li>
    <li><span>Datenbanken tauschen</span><span class="plakette grau">wartet</span></li>
    <li><span>Neustart und Migrationen</span><span class="plakette grau">wartet</span></li>
  </ul>
  <p class="meta" style="margin-top:12px">Diese Seite aktualisiert sich selbst und führt nach dem Neustart zur Anmeldung. Kommt der Neustart nicht innerhalb von 2 Minuten, den Container neu starten: <code translate="no">docker compose restart forga</code></p>
  <div class="meldung info"><span class="ic">i</span><span>Bei einem Fehler beim Einspielen bleibt die bisherige Datenbank in Betrieb, der Wartungsmodus endet, und die Meldung nennt die Ursache.</span></div>
</section>''', nav='sicherung/uebersicht.html', brot=BROT + [('Wiederherstellen', None)])

# ---------- Wartungsseite für andere Benutzer ----------
seite('sicherung/wartung.html', 'Wartung', f'''
<div class="anmelde-seite">
{mockup_hinweis('../')}
<div class="anmelde-oben">{SPRACHE}</div>
<main class="anmelde-mitte">
  <div class="anmelde-box" style="text-align:center">
    <div class="logo" style="justify-content:center">
      <img src="../assets/logo.svg" alt="Wappen">
      <div><div class="meta" style="color:var(--dienst);font-weight:bold">Freiwillige Feuerwehr Musterstadt</div><h1 style="margin:0">f.orga</h1></div>
    </div>
    <h2>f.orga wird gerade wiederhergestellt</h2>
    <p class="neben">Ein Administrator spielt eine Datensicherung ein. Bitte in einigen Minuten neu laden. Die Seite versucht es selbst alle 15 Sekunden.</p>
    <p class="meta">Nicht gespeicherte Eingaben gehen verloren. Danach ist eine neue Anmeldung nötig.</p>
    <a class="knopf primaer gross voll" href="../shell/anmeldung.html">Neu laden</a>
  </div>
</main>
{FUSS}
</div>''', ohne_rahmen=True)
