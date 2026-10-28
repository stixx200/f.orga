from rahmen import seite, tabelle, dialog, leer, sym, mockup_hinweis, FUSS, SPRACHE

# ---------- Anmeldung ----------
seite('shell/anmeldung.html', 'Anmeldung', f'''
<div class="anmelde-seite">
{mockup_hinweis('../')}
<div class="anmelde-oben">{SPRACHE}</div>
<main class="anmelde-mitte">
  <form class="anmelde-box" action="start.html">
    <div class="logo">
      <img src="../assets/logo.svg" alt="Wappen der Freiwilligen Feuerwehr Musterstadt">
      <div><div class="meta" style="color:var(--dienst);font-weight:bold">Freiwillige Feuerwehr Musterstadt</div><h1 style="margin:0">f.orga</h1></div>
    </div>
    <div class="feld"><label for="b">Benutzername</label><input id="b" type="text" value="m.vogt" autocomplete="username" autocapitalize="none"></div>
    <div class="feld"><label for="p">Passwort</label><input id="p" type="password" value="geheimgeheim" autocomplete="current-password"></div>
    <div class="feld"><label class="schalter"><input type="checkbox" checked> Angemeldet bleiben (30 Tage)</label></div>
    <a class="knopf primaer gross voll" href="start.html">Anmelden</a>
    <p style="text-align:center;margin:14px 0 0"><a href="#">Passwort vergessen?</a></p>
    <hr class="trenner">
    <a class="knopf voll" href="start.html">Mit Konto der Gemeinde anmelden</a>
    <p class="meta" style="text-align:center;margin-top:8px">Erscheint nur, wenn eine Gemeinde-Anmeldung (OIDC) eingerichtet ist.</p>
  </form>
</main>
{FUSS}
</div>''', ohne_rahmen=True)

# ---------- Startseite ----------
def aufgabe(stufe, klasse, titel, unter, ziel):
    return f'<li><a href="{ziel}"><span class="plakette {klasse}">{stufe}</span><span><strong>{titel}</strong><br><span class="meta">{unter}</span></span><span class="pfeil" aria-hidden="true">›</span></a></li>'

seite('shell/start.html', 'Guten Morgen, Markus', '''
<p class="neben" style="margin-top:-8px">Freitag, 23. Oktober 2026 · Sie sehen Daten der Gesamtwehr.</p>
<section class="karte">
  <div class="karte-kopf"><h2>Meine offenen Berichte</h2><span class="meta">2 Berichte</span></div>
  <ul class="liste aufgaben">
    ''' + aufgabe('Entwurf', 'gelb', 'B2 Brand Wohnung · Führungsgruppe', 'Alarm 21.10. 13:05 · 1 Fehler: Personaldoppelung', '{P}einsatzberichte/bericht.html') + '''
    ''' + aufgabe('überfällig', 'warn', 'TH1 Ölspur · Abt. Musterstadt', 'Alarm 20.10. 07:41 · Lage und Verlauf fehlen', '{P}einsatzberichte/bericht.html') + '''
  </ul>
</section>
<div class="raster vier" style="margin-bottom:16px">
  <a class="kachel warn" href="{P}einsatzberichte/pruefung.html"><div class="wert">4</div><div class="titel">Zur Prüfung</div><div class="unter">warten auf Ihre Freigabe</div></a>
  <a class="kachel" href="{P}einsatzberichte/offene-berichte.html"><div class="wert">7</div><div class="titel">Offene Berichte</div><div class="unter">davon 2 älter als 14 Tage</div></a>
  <a class="kachel warn" href="#aufgaben"><div class="wert">2</div><div class="titel">Fristen überfällig</div><div class="unter">3 weitere in den nächsten 60 Tagen</div></a>
  <a class="kachel" href="{P}einsatzberichte/einsaetze.html"><div class="wert">143</div><div class="titel">Einsätze 2026</div><div class="unter">Vorjahr bis heute: 131</div></a>
</div>
<div class="raster zwei">
  <section class="karte" id="aufgaben">
    <div class="karte-kopf"><h2>Fristen und Aufgaben</h2><span class="meta">für Ihre Rollen</span></div>
    <ul class="liste aufgaben">
      ''' + aufgabe('überfällig', 'warn', 'Eignungsuntersuchung Atemschutz', 'Jonas Keller · fällig seit 02.10.', '{P}stammdaten/person.html') + '''
      ''' + aufgabe('überfällig', 'warn', 'Probezeit endet – Aufnahme beschließen', 'Lukas Maier · Probezeit bis 31.10. · Ausschuss am 28.10.', '{P}stammdaten/person.html') + '''
      ''' + aufgabe('in 7 Tagen', 'gelb', 'Führerscheinkontrolle fällig', 'Lena Brenner · Klasse CE läuft am 04.11. ab', '{P}stammdaten/person-fuehrerschein.html') + '''
      ''' + aufgabe('in 30 Tagen', 'gelb', 'Eignungsuntersuchung Atemschutz', 'Tobias Rief · 22.11.', '{P}stammdaten/person.html') + '''
      ''' + aufgabe('in 41 Tagen', 'gelb', 'Gruppenführer-Lehrgang: Meldung an den Kreis', '3 Vormerkungen · Meldeschluss 03.12.', '{P}stammdaten/lehrgangsplanung.html') + '''
    </ul>
    <p class="meta" style="margin:10px 0 0">Eine Frist ist erledigt, sobald der neue Nachweis eingetragen ist. Sammel-E-Mail jeden Montag.</p>
  </section>
  <section class="karte">
    <div class="karte-kopf"><h2>Letzte Einsätze</h2><a class="knopf klein" href="{P}einsatzberichte/einsaetze.html">Alle Einsätze</a></div>
    ''' + tabelle(['Stichwort', 'Alarm', 'Berichte', 'Status'], [
        ['<a href="{P}einsatzberichte/einsatz.html">B2 Brand Wohnung</a><span class="unter-text">Weidenhain, Hauptstr. 12</span>', '21.10. 13:05', '<div class="plaketten"><span class="plakette haupt">Weidenhain</span><span class="plakette neben">Musterstadt</span><span class="plakette neben">FüGr</span></div>', '<span class="plakette gelb">In Arbeit</span>'],
        ['<a href="{P}einsatzberichte/einsatz.html">TH1 Ölspur</a><span class="unter-text">Musterstadt, B 311</span>', '20.10. 07:41', '<div class="plaketten"><span class="plakette haupt">Musterstadt</span></div>', '<span class="plakette">Zur Prüfung</span>'],
        ['<a href="{P}einsatzberichte/einsatz.html">BMA Brandmeldeanlage</a><span class="unter-text">Musterstadt, Gewerbegebiet Nord</span>', '18.10. 22:13', '<div class="plaketten"><span class="plakette haupt">Musterstadt</span><span class="plakette neben">Birkenhain</span></div>', '<span class="plakette ok">Freigegeben</span>'],
    ], 'stapel') + '''
  </section>
</div>''', brot=[('Startseite', None)], aktionen='<a class="knopf primaer" href="{P}einsatzberichte/pruefung.html">Berichte prüfen (4)</a>')

# ---------- Benutzer ----------
seite('shell/benutzer.html', 'Benutzer', '''
<div class="raster seite">
<section>
  <div class="filter">
    <div class="feld breit"><label for="bs">Suche</label><input id="bs" type="search" placeholder="Name oder Benutzername"></div>
    <div class="feld"><label for="br">Rolle</label><select id="br"><option>Alle Rollen</option><option>Kommandant</option><option>Gruppenführer</option></select></div>
    <div class="feld"><label for="bst">Status</label><select id="bst"><option>Aktiv</option><option>Gesperrt</option><option>Alle</option></select></div>
  </div>
  ''' + tabelle(['Benutzer', 'Person', 'Rollen', 'Letzte Anmeldung', 'Status'], [
      ['<a href="#">m.vogt</a>', 'Markus Vogt', 'Kommandant (Gesamtwehr) · Administrator', 'heute 07:52', '<span class="plakette ok">aktiv</span>'],
      ['<a href="#">s.hagel</a>', 'Sabine Hagel', 'Abteilungskommandantin (Weidenhain)', 'gestern', '<span class="plakette ok">aktiv</span>'],
      ('gewaehlt', ['<a href="#">t.rief</a>', 'Tobias Rief', 'Gruppenführer (Musterstadt, Pappelhain)', '19.10.2026', '<span class="plakette ok">aktiv</span>']),
      ['<a href="#">j.keller</a>', 'Jonas Keller', 'Atemschutzgerätewart (Gesamtwehr)', '14.10.2026', '<span class="plakette ok">aktiv</span>'],
      ['<a href="#">a.mayer</a>', 'Anja Mayer', 'Kassier (Gesamtwehr)', '02.10.2026', '<span class="plakette ok">aktiv</span>'],
      ['<a href="#">leitstelle-api</a>', '<span class="meta">technisch</span>', 'API: incidents.api.create', 'heute 06:14', '<span class="plakette grau">technisch</span>'],
      ['<a href="#">p.straub</a>', 'Peter Straub', 'Gruppenführer (Ahornfeld)', '11.03.2026', '<span class="plakette warn">gesperrt</span>'],
  ], 'stapel') + '''
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Tobias Rief</h2><span class="plakette ok">aktiv</span></div>
  <div class="feld"><label for="u1">Benutzername</label><input id="u1" type="text" value="t.rief"></div>
  <div class="feld"><label for="u2">E-Mail</label><input id="u2" type="email" value="tobias.rief@example.org"></div>
  <div class="felder zwei">
    <div class="feld"><label for="u3">Verknüpfte Person</label><select id="u3"><option>Tobias Rief (Pers.-Nr. 1043)</option></select><div class="hilfe">Für „Meine Berichte“ und eigene Daten.</div></div>
    <div class="feld"><label for="u4">Sprache</label><select id="u4"><option>Deutsch</option><option>English</option></select><div class="hilfe">Gilt auf jedem Gerät nach der Anmeldung.</div></div>
  </div>
  <h3>Rollenzuweisungen</h3>
  ''' + tabelle(['Rolle', 'Bereich', ''], [
      ['Gruppenführer', 'Abt. Musterstadt', '<a class="knopf klein text" href="#">Entfernen</a>'],
      ['Gruppenführer', 'Abt. Pappelhain', '<a class="knopf klein text" href="#">Entfernen</a>'],
      ['Mitglied', 'eigene Person', '<span class="meta">automatisch</span>'],
  ]) + '''
  <div class="felder" style="margin-top:12px">
    <div class="feld"><label for="u5">Rolle</label><select id="u5"><option>Gerätewart</option><option>Abteilungskommandant</option></select></div>
    <div class="feld"><label for="u6">Bereich</label><select id="u6"><option>Gesamtwehr</option><option selected>Abt. Musterstadt</option><option>Abt. Weidenhain</option></select></div>
  </div>
  <a class="knopf sekundaer klein" href="#">+ Rolle zuweisen</a>
  <hr class="trenner">
  <div class="formular-fuss"><a class="knopf" href="#">Passwort-Link senden</a><button type="button" class="knopf" data-dialog="d-sperren">Sperren …</button><a class="knopf primaer" href="#">Speichern</a></div>
</section>
</div>''', brot=[('Verwaltung', None), ('Benutzer', None)], aktionen='<a class="knopf primaer" href="#">+ Benutzer anlegen</a>',
    dialoge=dialog('d-sperren', 'Tobias Rief sperren?', '<p>t.rief kann sich danach nicht mehr anmelden. Offene Sitzungen enden sofort. Berichte und Daten bleiben erhalten.</p><div class="feld"><label for="sp1">Grund (steht im Audit-Log)</label><input id="sp1" type="text" placeholder="z. B. aus der Feuerwehr ausgeschieden"></div>', '<button class="knopf" value="abbrechen">Abbrechen</button><button class="knopf primaer" value="ok">Benutzer sperren</button>'))

# ---------- Rollen ----------
def recht(id_, name, an, bereich='Abteilung'):
    return [f'<label class="schalter"><input type="checkbox"{" checked" if an else ""}> {name}</label>', f'<code>{id_}</code>', bereich]

seite('shell/rollen.html', 'Rollen', '''
<div class="raster seite">
<section class="karte">
  <div class="karte-kopf"><h2>Rolle: Gruppenführer</h2><span class="meta">12 Benutzer</span></div>
  <div class="felder zwei">
    <div class="feld"><label for="r1">Name</label><input id="r1" type="text" value="Gruppenführer"></div>
    <div class="feld"><label for="r2">Beschreibung</label><input id="r2" type="text" value="Schreibt Einsatzberichte der eigenen Abteilung"></div>
  </div>
  <h3>Berechtigungen · Einsatzberichte</h3>
  ''' + tabelle(['Recht', 'Kennung', 'Bereich'], [
      recht('incidents.reports.read', 'Einsatzberichte lesen', True),
      recht('incidents.reports.write', 'Einsatzberichte schreiben', True),
      recht('incidents.reports.release', 'Freigeben und sperren', False, 'Gesamtwehr'),
      recht('incidents.reports.unlock', 'Sperre aufheben', False, 'Gesamtwehr'),
      recht('incidents.settings.manage', 'Einstellungen verwalten', False, 'Gesamtwehr'),
      recht('incidents.statistics', 'Jahresstatistik abschließen und exportieren', False, 'Gesamtwehr'),
  ]) + '''
  <h3 style="margin-top:16px">Berechtigungen · Stammdaten</h3>
  ''' + tabelle(['Recht', 'Kennung', 'Bereich'], [
      recht('masterdata.persons.read', 'Personen lesen', True),
      recht('masterdata.persons.write', 'Personen bearbeiten', False),
      recht('masterdata.persons.sensitive', 'Sensible Felder (Geburtsdatum, Bank, Arbeitgeber)', False),
      recht('masterdata.organization.manage', 'Organisation bearbeiten', False),
      recht('masterdata.courses.plan', 'Lehrgänge planen', False),
      recht('masterdata.catalogs.manage', 'Kataloge verwalten', False, 'Gesamtwehr'),
  ]) + '''
  <div class="formular-fuss"><a class="knopf" href="#">Kopieren</a><a class="knopf primaer" href="#">Speichern</a></div>
</section>
<section class="karte">
  <h2>Alle Rollen</h2>
  <ul class="liste">
    <li><strong>Administrator</strong><span class="rechts meta">1</span></li>
    <li><strong>Kommandant</strong><span class="rechts meta">2</span></li>
    <li><strong>Abteilungskommandant</strong><span class="rechts meta">6</span></li>
    <li class="gewaehlt" aria-current="true"><strong>Gruppenführer</strong><span class="rechts meta">12</span></li>
    <li><strong>Atemschutzgerätewart</strong><span class="rechts meta">2</span></li>
    <li><strong>Gerätewart</strong><span class="rechts meta">6</span></li>
    <li><strong>Lehrgangsbeauftragter</strong> <span class="meta">Personen lesen, Lehrgänge planen und Teilnahmen eintragen</span><span class="rechts meta">1</span></li>
    <li><strong>Kassier / Verwaltung</strong><span class="rechts meta">1</span></li>
    <li><strong>Mitglied</strong><span class="rechts meta">automatisch</span></li>
  </ul>
  <p class="meta" style="margin-top:12px">Der Bereich (Gesamtwehr oder Abteilung) wird bei der Zuweisung an einen Benutzer gewählt.</p>
</section>
</div>''', brot=[('Verwaltung', None), ('Rollen', None)], aktionen='<a class="knopf primaer" href="#">+ Rolle anlegen</a>')

# ---------- Module ----------
def modul(name, version, beschreibung, aktiv, abh='', hinweis='', release=''):
    status = '<span class="plakette ok">aktiv</span>' if aktiv else '<span class="plakette grau">nicht aktiv</span>'
    knopf = '<a class="knopf klein" href="#">Deaktivieren</a>' if aktiv else '<a class="knopf klein primaer" href="#">Aktivieren</a>'
    if release:
        knopf = f'<span class="plakette gelb">{release}</span>'
        status = '<span class="plakette grau">nicht installiert</span>'
    h = f'<div class="meldung warnung" style="margin:10px 0 0"><span class="ic">!</span><span>{hinweis}</span></div>' if hinweis else ''
    return f'''<section class="karte">
  <div class="karte-kopf"><h3>{name} <span class="meta" style="font-weight:normal">{version}</span></h3>{status}</div>
  <p class="neben">{beschreibung}</p>
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span class="meta">{abh}</span>{knopf}</div>{h}
</section>'''

seite('shell/module.html', 'Module', '''
<div class="meldung info"><span class="ic">i</span><span>Ein deaktiviertes Modul verschwindet aus Menü und Schnittstellen. Seine Daten bleiben erhalten.</span></div>
<div class="raster drei">
''' + modul('Stammdaten', '1.0.0', 'Personen, Abteilungen, Wachen, Fahrzeuge, Lehrgänge, Listen.', True, 'Wird benötigt von: Einsatzberichte') +
modul('Einsatzberichte', '1.0.0', 'Einsätze und Berichte je Abteilung, Freigabe, Statistik, Entschädigungsberechnung, API.', True, 'Benötigt: Stammdaten · nutzt optional: Geräte') +
modul('Dienste', '–', 'Übungsdienste und Sonderdienste, Anwesenheit, Ausbildungsnachweis.', False, 'Benötigt: Stammdaten', release='Release 2') +
modul('Atemschutz', '–', 'Eignungsuntersuchung, Belastungsübung, Einsatznachweis, Tauglichkeitsampel.', False, 'Benötigt: Stammdaten, Dienste', release='Release 2') +
modul('Entschädigungen', '–', 'Auszahlungsläufe, Abrechnung je Person als PDF, Export für die Kämmerei.', False, 'Benötigt: Stammdaten', release='Release 2') +
modul('Geräte', '–', 'Geräte mit Kategorien und Vorlagen, Prüffristen, Prüfprotokolle.', False, 'Benötigt: Stammdaten', release='Release 3') +
'''
</div>
<section class="karte">
  <div class="karte-kopf"><h2>Zusatzmodul installieren</h2><span class="plakette gelb">später</span></div>
  <p class="neben">Plugin-Paket (.tgz) hochladen. Es wird geprüft und nach dem nächsten Neustart geladen.</p>
  <input type="file" disabled>
</section>''', brot=[('Verwaltung', None), ('Module', None)])

# ---------- Einstellungen ----------
seite('shell/einstellungen.html', 'Einstellungen', '''
<div data-reitergruppe>
<div class="reiter">
  <button class="aktiv" data-reiter="r-fw">Feuerwehr</button>
  <button data-reiter="r-mail">E-Mail</button>
  <button data-reiter="r-erinnerung">Erinnerungen</button>
  <button data-reiter="r-daten">Datenschutz</button>
  <button data-reiter="r-export">Import / Export</button>
</div>
<div class="reiter-inhalt aktiv" id="r-fw">
  <div class="raster seite">
  <section class="karte">
    <h2>Angaben der Feuerwehr</h2>
    <p class="meta">Erscheinen in Kopf- und Fußzeile der Oberfläche und aller PDFs.</p>
    <div class="felder zwei">
      <div class="feld"><label>Name</label><input type="text" value="Freiwillige Feuerwehr Musterstadt"></div>
      <div class="feld"><label>Gemeinde</label><input type="text" value="Stadt Musterstadt"><div class="hilfe">Einsätze außerhalb zählen als Überlandhilfe.</div></div>
      <div class="feld"><label>Straße</label><input type="text" value="Feuerwehrstraße 1"></div>
      <div class="feld"><label>PLZ / Ort</label><input type="text" value="12345 Musterstadt"></div>
      <div class="feld"><label>Telefon</label><input type="tel" value="01234/5678-0"></div>
      <div class="feld"><label>Fax</label><input type="tel" value="01234/5678-99"></div>
      <div class="feld"><label>Internet</label><input type="text" value="www.feuerwehr-musterstadt.example"></div>
      <div class="feld"><label>Einwohnerzahl</label><input type="number" value="13600"><div class="hilfe">Für die Jahresstatistik (CSV) und später die Obergrenzen der Dienstgrade.</div></div>
    </div>
    <div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
  </section>
  <section class="karte">
    <h2>Wappen</h2>
    <div style="display:flex;gap:16px;align-items:center"><img src="../assets/logo.svg" alt="" width="96" height="96"><div><a class="knopf" href="#">Bild ersetzen</a><p class="meta" style="margin-top:6px">Quadratisch, mindestens 512 × 512 Pixel.</p></div></div>
    <h3 style="margin-top:18px">Briefkopf für PDFs</h3>
    <p class="meta">Optional ein breites Kopfbild (z. B. Kopfzeile.png).</p>
    <a class="knopf" href="#">Kopfbild hochladen</a>
  </section>
  </div>
</div>
<div class="reiter-inhalt" id="r-mail">
  <section class="karte">
    <h2>SMTP-Server</h2>
    <div class="felder">
      <div class="feld"><label>Server</label><input type="text" value="smtp.musterstadt.example"></div>
      <div class="feld"><label>Port</label><input type="number" value="587"></div>
      <div class="feld"><label>Absender</label><input type="email" value="feuerwehr@musterstadt.example"></div>
      <div class="feld"><label>Benutzer</label><input type="text" value="feuerwehr"></div>
      <div class="feld"><label>Passwort</label><input type="password" value="xxxxxxxx"></div>
    </div>
    <label class="schalter"><input type="checkbox" checked> STARTTLS</label>
    <div class="formular-fuss"><a class="knopf" href="#">Test-E-Mail an mich senden</a><a class="knopf primaer" href="#">Speichern</a></div>
  </section>
</div>
<div class="reiter-inhalt" id="r-erinnerung">
  <section class="karte">
    <h2>Erinnerungen</h2>
    <div class="felder">
      <div class="feld"><label>Vorlaufzeit „bald fällig“</label><select><option>30 Tage</option><option selected>60 Tage</option><option>90 Tage</option></select></div>
      <div class="feld"><label>Sammel-E-Mail</label><select><option>täglich</option><option selected>wöchentlich (Montag)</option><option>aus</option></select></div>
    </div>
    <label class="schalter"><input type="checkbox" checked> Betroffene Person zusätzlich erinnern (wenn E-Mail hinterlegt)</label>
    <div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
  </section>
</div>
<div class="reiter-inhalt" id="r-daten">
  <section class="karte">
    <h2>Aufbewahrung und Löschung</h2>
    <div class="felder">
      <div class="feld"><label>Ausgeschiedene Mitglieder anonymisieren nach</label><select><option>5 Jahren</option><option selected>10 Jahren</option><option>nie</option></select></div>
      <div class="feld"><label>Audit-Log aufbewahren</label><select><option selected>2 Jahre</option><option>5 Jahre</option></select></div>
    </div>
    <p class="meta">Geplant: Fristen je Datenkategorie mit „dem Archiv anbieten“.</p>
    <div class="formular-fuss"><a class="knopf" href="aufbewahrung.html">Aufbewahrungsfristen</a><a class="knopf primaer" href="#">Speichern</a></div>
  </section>
</div>
<div class="reiter-inhalt" id="r-export">
  <section class="karte">
    <h2>Vollexport</h2>
    <p class="neben">Alle Daten eines Moduls als JSON. Die IDs bleiben erhalten, damit ist ein Umzug oder eine Auswertung außerhalb möglich.</p>
    <div class="plaketten" style="gap:8px"><a class="knopf" href="#">Stammdaten exportieren</a><a class="knopf" href="#">Einsatzberichte exportieren</a></div>
    <hr class="trenner">
    <h2>Import</h2>
    <p class="neben">Personen, Fahrzeuge und Einsätze aus CSV, Excel oder JSON übernehmen.</p>
    <a class="knopf sekundaer" href="{P}stammdaten/import.html">Import-Assistent öffnen</a>
  </section>
</div>
</div>''', brot=[('Verwaltung', None), ('Einstellungen', None)])

# ---------- API-Tokens ----------
seite('shell/api-tokens.html', 'API-Tokens', '''
<div class="meldung ok" role="status"><span class="ic">✓</span><div><strong>Token erzeugt.</strong> Es wird nur jetzt angezeigt. Bitte sicher im Fremdsystem hinterlegen.<br><code style="font-size:.95rem;word-break:break-all" translate="no">forga_7Kq2mX9vB4tR1nW8pL3sD6yH0cJ5fG2a</code></div><button type="button" class="knopf klein aktion">Kopieren</button></div>
''' + tabelle(['Bezeichnung', 'Technischer Benutzer', 'Bereiche', 'Gültig bis', 'Zuletzt genutzt', ''], [
    ['<strong>Alarmfax-Parser Leitstelle</strong>', 'leitstelle-api', '<code>incidents.api.create</code>', '31.12.2027', 'heute 06:14 · 10.12.3.4', '<button type="button" class="knopf klein" data-dialog="d-widerruf">Widerrufen …</button>'],
    ['<strong>DIVERA 24/7 Webhook</strong>', 'divera-api', '<code>incidents.api.create</code>', '30.06.2027', '21.10.2026 13:06', '<button type="button" class="knopf klein" data-dialog="d-widerruf">Widerrufen …</button>'],
    ('warnung', ['<strong>Testzugang Import</strong>', 'import-test', '<code>masterdata.persons.read</code>', '<span class="plakette warn">abgelaufen</span>', '02.03.2026', '<a class="knopf klein" href="#">Löschen</a>']),
], 'stapel') + '''
<section class="karte" style="margin-top:16px;max-width:640px">
  <h2>Neues Token</h2>
  <div class="feld"><label for="t1" class="pflicht">Bezeichnung</label><input id="t1" type="text" placeholder="z. B. Alamos FE2"></div>
  <div class="felder zwei">
    <div class="feld"><label for="t2">Technischer Benutzer</label><select id="t2"><option>leitstelle-api</option><option>neu anlegen …</option></select></div>
    <div class="feld"><label for="t3">Gültig bis</label><input id="t3" type="date" value="2027-10-23"></div>
  </div>
  <fieldset><legend>Bereiche</legend><div class="schalter-liste">
  <label class="schalter"><input type="checkbox" checked> <span><code>incidents.api.create</code> Einsätze und Berichtsentwürfe anlegen</span></label>
  <label class="schalter"><input type="checkbox"> <span><code>masterdata.persons.read</code> Personen lesen</span></label>
  </div></fieldset>
  <div class="formular-fuss"><a class="knopf primaer" href="#">Token erzeugen</a></div>
</section>''', brot=[('Verwaltung', None), ('API-Tokens', None)],
    dialoge=dialog('d-widerruf', 'Token widerrufen?', '<p><strong>Alarmfax-Parser Leitstelle</strong> kann danach keine Einsätze mehr anlegen. Das lässt sich nicht rückgängig machen; für einen neuen Zugang erzeugen Sie ein neues Token.</p>', '<button class="knopf" value="abbrechen">Abbrechen</button><button class="knopf primaer" value="ok">Token widerrufen</button>'))
