from rahmen import seite, tabelle, dialog, leer, sym

AS = '<span class="plakette ok">AGT</span>'
MA = '<span class="plakette">Maschinist</span>'
GF = '<span class="plakette">Gruppenführer</span>'
C = '<span class="plakette">C</span>'

# ---------- Personenliste ----------
def p(name, abt, dg, eintritt, mobil, kenn, status='<span class="plakette ok">aktiv</span>', kl=''):
    z = [f'<a href="person.html">{name}</a>', abt, dg, eintritt, mobil, f'<div class="plaketten">{kenn}</div>', status]
    return (kl, z) if kl else z

seite('stammdaten/personen.html', 'Personen', '''
<div class="chips">
  <a class="chip aktiv" href="#" aria-current="true">Aktive (212)</a><a class="chip" href="#">Probezeit (5)</a><a class="chip" href="#">Jugendfeuerwehr (48)</a><a class="chip" href="#">Altersabteilung (61)</a><a class="chip" href="#">Ausgeschieden</a><a class="chip" href="#">Alle</a>
</div>
<div class="filter">
  <div class="feld breit"><label>Suche</label><input type="search" placeholder="Name, Personalnummer, Ort …"></div>
  <div class="feld"><label>Abteilung</label><select><option>Alle Abteilungen</option><option>Musterstadt</option><option>Birkenhain</option><option>Weidenhain</option><option>Pappelhain</option><option>Ahornfeld</option><option>Eschenbrunn</option></select></div>
  <div class="feld"><label>Qualifikation</label><select><option>Alle</option><option>Atemschutzgeräteträger</option><option>Maschinist</option><option>Gruppenführer</option></select></div>
  <div class="feld"><label>Dienstgrad</label><select><option>Alle</option><option>Feuerwehrmann</option><option>Löschmeister</option></select></div>
  <button type="button" class="knopf">Spalten wählen</button>
</div>
''' + tabelle(['Name', 'Abteilung', 'Dienstgrad', 'Mitglied seit', 'Mobil', 'Kennzeichen', 'Status'], [
    p('Bauer, Michael', 'Musterstadt', 'Hauptfeuerwehrmann', '01.03.2009', '0171 2345678', AS + MA),
    p('Brenner, Lena', 'Weidenhain', 'Oberfeuerwehrfrau', '15.09.2016', '0160 9876543', AS + C),
    p('Eberle, Stefan', 'Birkenhain', 'Löschmeister', '01.04.2005', '0152 1122334', GF + MA),
    p('Fischer, Jana', 'Musterstadt', 'Feuerwehrfrau', '01.02.2023', '0176 5566778', ''),
    p('Hagel, Sabine', 'Weidenhain', 'Oberbrandmeisterin', '01.05.1998', '0171 9988776', GF + AS),
    p('Keller, Jonas', 'Musterstadt', 'Oberlöschmeister', '01.01.2007', '0151 4455667', AS + GF + '<span class="plakette warn">G26 abgelaufen</span>', kl='warnung'),
    p('Maier, Lukas', 'Pappelhain', 'Feuerwehrmann (Probezeit)', '01.09.2026', '0157 3344556', '', '<span class="plakette gelb">Probezeit</span>'),
    p('Rief, Tobias', 'Musterstadt', 'Löschmeister', '01.06.2008', '0170 2233445', GF + AS + MA),
    p('Schmid, Andreas', 'Ahornfeld', 'Hauptlöschmeister', '01.03.1996', '0172 6677889', GF + C),
    p('Vogt, Markus', 'Musterstadt', 'Hauptbrandmeister', '01.04.1994', '0171 1234567', GF),
    p('Wagner, Carina', 'Eschenbrunn', 'Oberfeuerwehrfrau', '01.07.2015', '0162 7788990', AS),
], 'stapel') + '''
<div class="knopfreihe" style="margin-top:10px;justify-content:space-between"><span class="meta">11 von 212 Personen</span><span class="knopfreihe"><a class="knopf klein" href="#">‹ Zurück</a><span class="meta">Seite 1 von 20</span><a class="knopf klein" href="#">Weiter ›</a></span></div>''',
    brot=[('Stammdaten', None), ('Personen', None)],
    aktionen='<a class="knopf" href="listen.html">Listen und Export</a><a class="knopf primaer" href="person-neu.html">+ Person anlegen</a>')

# ---------- Personenakte ----------
VERDECKT = '<div class="verdeckt nur-ohne-recht">' + sym('schloss') + '<span>Ausgeblendet. Für diese Angaben fehlt Ihnen das Recht „Sensible Felder“.</span></div>'
MASKE = '<span class="maskiert nur-ohne-recht">' + sym('schloss') + 'Wert ausgeblendet</span>'

seite('stammdaten/person.html', 'Tobias Rief', '''
<div class="mockup-schalter"><strong>Mockup-Ansicht:</strong><label class="schalter"><input type="checkbox" data-umschalten="ohne-sensibel"> ohne Recht „Sensible Felder“ ansehen</label></div>
<section class="karte">
  <div class="akte-kopf">
    <div class="bild" aria-hidden="true">TR</div>
    <div style="flex:1;min-width:220px">
      <div class="neben">Löschmeister · Abt. Musterstadt (Stamm) · Führungsgruppe · Pers.-Nr. 1043</div>
      <div class="plaketten" style="margin-top:6px"><span class="plakette ok">aktiv</span><span class="plakette ok">Atemschutz tauglich bis 22.11.2026</span><span class="plakette">Gruppenführer</span><span class="plakette">Maschinist</span><span class="plakette">Führerschein C</span></div>
    </div>
    <a class="knopf" href="listen.html">Datenblatt PDF</a>
  </div>
</section>
<div data-reitergruppe>
<div class="reiter" role="tablist" aria-label="Bereiche der Personenakte">
  <button class="aktiv" data-reiter="t-stamm">Stammdaten</button>
  <button data-reiter="t-fw">Feuerwehr</button>
  <button data-reiter="t-lg">Lehrgänge</button>
  <button data-reiter="t-qu">Qualifikationen</button>
  <button data-reiter="t-eh">Ehrungen</button>
  <button data-reiter="t-ei">Einsätze</button>
  <button data-reiter="t-hi">Historie</button>
</div>

<div class="reiter-inhalt aktiv" id="t-stamm">
<div class="raster zwei">
  <section class="karte">
    <h2>Person</h2>
    <div class="felder zwei">
      <div class="feld"><label>Anrede</label><select><option>Herr</option><option>Frau</option><option>keine</option></select></div>
      <div class="feld"><label>Titel</label><input type="text"></div>
      <div class="feld"><label class="pflicht">Vorname</label><input type="text" value="Tobias"></div>
      <div class="feld"><label class="pflicht">Nachname</label><input type="text" value="Rief"></div>
      <div class="feld"><label>Rufname</label><input type="text" placeholder="falls abweichend"></div>
      <div class="feld"><label>Geschlecht</label><select><option>männlich</option><option>weiblich</option><option>divers</option></select><div class="hilfe">Für Personalstärke und Jahresstatistik.</div></div>
    </div>
  </section>
  <section class="karte">
    <h2>Kontakt</h2>
    <div class="feld"><label>Straße</label><input type="text" value="Lindenweg 7"></div>
    <div class="felder zwei">
      <div class="feld"><label>PLZ</label><input type="text" inputmode="numeric" value="12345"></div>
      <div class="feld"><label>Ort</label><input type="text" value="Musterstadt"></div>
      <div class="feld"><label>Mobil</label><input type="tel" value="0170 2233445"></div>
      <div class="feld"><label>Telefon privat</label><input type="tel" value="01234 4411"></div>
      <div class="feld"><label>Telefon dienstlich</label><input type="tel"></div>
      <div class="feld"><label>E-Mail</label><input type="email" value="tobias.rief@example.org"></div>
    </div>
  </section>
  <section class="karte">
    <div class="karte-kopf"><h2>Persönliche Angaben</h2><span class="plakette grau">''' + sym('schloss') + '''sensibel</span></div>
    ''' + VERDECKT + '''
    <div class="felder zwei sensibel">
      <div class="feld"><label>Geburtsdatum</label><input type="date" value="1986-04-17"><div class="hilfe">40 Jahre</div></div>
      <div class="feld"><label>Geburtsort</label><input type="text" value="Kreisstadt"></div>
    </div>
  </section>
  <section class="karte">
    <div class="karte-kopf"><h2>Arbeitgeber</h2><span class="plakette grau">''' + sym('schloss') + '''sensibel</span></div>
    ''' + VERDECKT + '''
    <div class="sensibel">
    <div class="feld"><label>Firma</label><input type="text" value="Muster Maschinenbau GmbH"></div>
    <div class="felder zwei">
      <div class="feld"><label>Anschrift</label><input type="text" value="Industriestr. 4, 12345 Musterstadt"></div>
      <div class="feld"><label>Telefon</label><input type="tel" value="01234 1234-0"></div>
    </div>
    <div class="feld"><label>Ansprechpartner</label><input type="text" value="Frau Lehmann (Personal)"></div>
    </div>
  </section>
  <section class="karte">
    <div class="karte-kopf"><h2>Bankverbindung</h2><span class="plakette grau">''' + sym('schloss') + '''sensibel</span></div>
    ''' + VERDECKT + '''
    <div class="sensibel">
    <div class="feld"><label>IBAN</label><input type="text" value="DE12 6305 0000 0001 2345 67"></div>
    <div class="feld"><label>Kontoinhaber</label><input type="text" value="Tobias Rief"></div>
    </div>
  </section>
  <section class="karte">
    <h2>Bemerkung</h2>
    <div class="feld"><label>Interne Bemerkung</label><textarea style="min-height:80px"></textarea></div>
  </section>
</div>
</div>

<div class="reiter-inhalt" id="t-fw">
<div class="raster zwei">
  <section class="karte">
    <div class="karte-kopf"><h2>Mitgliedschaft</h2><div class="knopfreihe"><button type="button" class="knopf klein" data-dialog="d-status">Status ändern …</button><button type="button" class="knopf klein" data-dialog="d-austritt">Austritt erfassen …</button></div></div>
    <dl class="daten">
      <dt>Status</dt><dd><span class="plakette ok">aktiv</span></dd>
      <dt>Mitglied seit</dt><dd>01.06.2008 (18 Jahre)</dd>
      <dt>Personalnummer</dt><dd>1043</dd>
      <dt>Dienstgrad</dt><dd>Löschmeister seit 12.03.2021</dd>
      <dt>Beschäftigung</dt><dd>ehrenamtlich</dd>
      <dt>Musiker</dt><dd>nein</dd>
    </dl>
    <h3 style="margin-top:16px">Aufnahme und Status</h3>
    <ul class="zeitleiste">
      <li><span class="wann">01.06.2008</span><span><strong>Aufnahme auf Probe</strong><br><span class="meta">Probezeit 12 Monate, bis 31.05.2009</span></span></li>
      <li><span class="wann">20.03.2009</span><span><strong>Probezeit verkürzt</strong> auf 31.03.2009<br><span class="meta">Begründung: vorher 4 Jahre Jugendfeuerwehr · Beschluss Feuerwehrausschuss 18.03.2009</span></span></li>
      <li><span class="wann">01.04.2009</span><span><strong>Endgültig aufgenommen</strong> – Status aktiv<br><span class="meta">Beschluss Feuerwehrausschuss 18.03.2009</span></span></li>
    </ul>
    <h3 style="margin-top:16px">Abteilungen</h3>
    ''' + tabelle(['Abteilung', 'von', 'bis', 'Stamm'], [
        ['Jugendfeuerwehr Musterstadt', '01.06.2004', '31.05.2008', ''],
        ['Abt. Musterstadt', '01.06.2008', '', '<span class="plakette ok">Stamm</span>'],
        ['Führungsgruppe Musterstadt', '01.01.2019', '', ''],
    ]) + '''
  </section>
  <section class="karte">
    <h2>Beförderungen</h2>
    ''' + tabelle(['Dienstgrad', 'Datum'], [
        ['Löschmeister', '12.03.2021'], ['Hauptfeuerwehrmann', '15.03.2016'], ['Oberfeuerwehrmann', '20.03.2011'], ['Feuerwehrmann', '01.04.2009'],
    ]) + '''
    <h3 style="margin-top:16px">Führerschein</h3>
    <dl class="daten"><dt>Klassen</dt><dd>B, BE, C, CE</dd><dt>gültig bis (C)</dt><dd>16.04.2031</dd><dt>letzte Kontrolle</dt><dd>05.11.2025 <span class="plakette gelb">fällig in 13 Tagen</span></dd></dl>
  </section>
</div>
</div>

<div class="reiter-inhalt" id="t-lg">
<section class="karte">
  <div class="karte-kopf"><h2>Lehrgänge</h2><a class="knopf sekundaer klein" href="#">+ Teilnahme eintragen</a></div>
  ''' + tabelle(['Lehrgang', 'Ebene', 'Datum', 'Ergebnis', 'vermittelt'], [
      ['Gruppenführer', 'LFS Bruchsal', '08.–19.02.2021', '<span class="plakette ok">bestanden</span>', 'Gruppenführer'],
      ['Truppführer', 'Kreis', '03/2014', '<span class="plakette ok">bestanden</span>', 'Truppführer'],
      ['Maschinisten', 'Kreis', '10/2012', '<span class="plakette ok">bestanden</span>', 'Maschinist'],
      ['Atemschutzgeräteträger', 'Kreis', '04/2010', '<span class="plakette ok">bestanden</span>', 'Atemschutzgeräteträger'],
      ['Sprechfunker Digitalfunk', 'Kreis', '11/2009', '<span class="plakette ok">bestanden</span>', 'Sprechfunker'],
      ['Truppmann Teil 1', 'Gemeinde', '2008', '<span class="plakette ok">bestanden</span>', 'Truppmann'],
  ], 'stapel') + '''
  <div class="karte-kopf" style="margin-top:16px"><h3>Vormerkungen</h3><a class="knopf klein" href="lehrgangsplanung.html">Zur Lehrgangsplanung</a></div>
  ''' + tabelle(['Lehrgang', 'Priorität', 'gewünscht', 'Status'], [
      ['Zugführer', 'hoch', '2027', '<span class="plakette gelb">vorgemerkt</span>'],
  ]) + '''
</section>
</div>

<div class="reiter-inhalt" id="t-qu">
<section class="karte">
  <div class="karte-kopf"><h2>Qualifikationen</h2><a class="knopf sekundaer klein" href="#">+ Qualifikation eintragen</a></div>
  ''' + tabelle(['Qualifikation', 'seit', 'gültig bis', 'Quelle'], [
      ['Atemschutzgeräteträger', '04/2010', '–', 'Lehrgang'],
      ['Maschinist', '10/2012', '–', 'Lehrgang'],
      ['Gruppenführer', '02/2021', '–', 'Lehrgang'],
      ['Führerschein C', '2007', '16.04.2031', 'Eintrag'],
  ]) + '''
  <p class="meta" style="margin-top:10px">Die Atemschutztauglichkeit (Untersuchung, Belastungsübung, Einsatz) kommt später aus dem Modul Atemschutz.</p>
</section>
</div>

<div class="reiter-inhalt" id="t-eh">
<section class="karte">
  <div class="karte-kopf"><h2>Ehrungen</h2><a class="knopf sekundaer klein" href="#">+ Ehrung eintragen</a></div>
  ''' + tabelle(['Ehrung', 'Datum'], [['Feuerwehr-Ehrenzeichen Silber (15 Jahre)', '14.03.2024'], ['Leistungsabzeichen Bronze', '2011']]) + '''
</section>
</div>

<div class="reiter-inhalt" id="t-ei">
<section class="karte">
  <div class="karte-kopf"><h2>Einsätze 2026</h2><span class="meta">23 Einsätze · 61 Stunden · 915,00 €</span></div>
  ''' + tabelle(['Datum', 'Stichwort', 'Abteilung', 'Fahrzeug / Funktion', '>Std.', '>Betrag'], [
      ['21.10.2026', '<a href="../einsatzberichte/einsatz.html">B2 Brand Wohnung</a>', 'Musterstadt', 'LF 20/16 · Gruppenführer', '3', '45,00 €'],
      ['20.10.2026', '<a href="../einsatzberichte/einsatz.html">TH1 Ölspur</a>', 'Musterstadt', 'MLF 10/6 · Gruppenführer', '2', '30,00 €'],
      ['18.10.2026', '<a href="../einsatzberichte/einsatz.html">BMA Brandmeldeanlage</a>', 'Musterstadt', 'Bereitschaft Wache Musterstadt', '1', '15,00 €'],
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Dieser Reiter kommt aus dem Modul Einsatzberichte.</p>
</section>
</div>

<div class="reiter-inhalt" id="t-hi">
<section class="karte">
  <div class="karte-kopf"><h2>Historie</h2><div class="feld" style="margin:0"><label class="unsichtbar">Änderungen filtern</label><select style="width:auto"><option>Alle Änderungen</option><option>Nur Stammdaten</option><option>Nur Lehrgänge</option></select></div></div>
  <ul class="historie">
    <li><div class="wer"><strong>Markus Vogt</strong> · 12.10.2026 18:42 · geändert</div>
      <div class="aenderung"><span>Mobil</span><span><span class="alt">0170 1112223</span> → <span class="neu">0170 2233445</span></span></div>
      <div class="aenderung"><span>Straße</span><span><span class="alt">Kirchgasse 3</span> → <span class="neu">Lindenweg 7</span></span></div>
      <div class="aenderung"><span>IBAN</span><span><span class="sensibel"><span class="alt">DE44 6305 0000 0009 8765 43</span> → <span class="neu">DE12 6305 0000 0001 2345 67</span></span>''' + MASKE + '''</span></div>
    </li>
    <li><div class="wer"><strong>Sabine Hagel</strong> · 03.06.2026 09:15 · Lehrgangsvormerkung angelegt</div>
      <div class="aenderung"><span>Lehrgang</span><span class="neu">Zugführer</span></div>
      <div class="aenderung"><span>Priorität</span><span class="neu">hoch</span></div>
    </li>
    <li><div class="wer"><strong>Import MP-Feuer</strong> · 01.02.2026 20:03 · angelegt</div>
      <div class="aenderung"><span>Alle Felder</span><span class="neu">aus Personal.xlsx übernommen</span></div>
    </li>
  </ul>
  <p class="meta" style="margin:12px 0 0">Ohne das Recht „Sensible Felder“ steht in der Historie nur, dass ein solches Feld geändert wurde, nicht der Wert.</p>
</section>
</div>
</div>
<div class="aktionsleiste"><span class="status">Zuletzt geändert 12.10.2026 von Markus Vogt</span><a class="knopf" href="personen.html">Abbrechen</a><a class="knopf primaer" href="#">Speichern</a></div>
''', nav='stammdaten/personen.html', brot=[('Stammdaten', None), ('Personen', 'stammdaten/personen.html'), ('Tobias Rief', None)],
    dialoge=dialog('d-austritt', 'Austritt erfassen', '''
  <p>Tobias Rief wird zum Austrittsdatum ausgeschieden. Laufende Mitgliedschaften und Rollen enden an diesem Tag. Einsätze und Historie bleiben erhalten.</p>
  <div class="felder zwei">
    <div class="feld"><label class="pflicht">Austrittsdatum</label><input type="date" value="2026-12-31"></div>
    <div class="feld"><label class="pflicht">Grund</label><select><option>– bitte wählen –</option><option>auf eigenen Wunsch</option><option>Umzug</option><option>Wechsel in andere Feuerwehr</option><option>Altersgrenze</option><option>Tod</option><option>Ausschluss</option></select></div>
  </div>
  <div class="feld"><label>Bemerkung</label><input type="text"></div>
  <div class="meldung info"><span class="ic">i</span><span>Nach 10 Jahren werden die Daten anonymisiert (Einstellung Datenschutz).</span></div>''',
    '<button class="knopf" value="abbrechen">Abbrechen</button><button class="knopf primaer" value="ok">Austritt speichern</button>') +
    dialog('d-status', 'Status ändern', '''
  <fieldset><legend>Neuer Status</legend><div class="wahl eng">
    <label><input type="radio" name="st" checked>aktiv</label><label><input type="radio" name="st">passiv</label><label><input type="radio" name="st">Altersabteilung</label>
  </div></fieldset>
  <div class="felder zwei">
    <div class="feld"><label class="pflicht">gültig ab</label><input type="date" value="2026-11-01"></div>
    <div class="feld"><label>Beschluss vom</label><input type="date"></div>
  </div>
  <div class="feld"><label>Begründung</label><input type="text"></div>''',
    '<button class="knopf" value="abbrechen">Abbrechen</button><button class="knopf primaer" value="ok">Status speichern</button>'))

# ---------- Person anlegen ----------
seite('stammdaten/person-neu.html', 'Person anlegen', '''
<div class="meldung warnung"><span class="ic">!</span><span><strong>Ähnliche Person vorhanden:</strong> Nico Hartmann, geb. 03.02.2007, Jugendfeuerwehr Musterstadt (ausgeschieden 31.08.2025). Ist das dieselbe Person? Dann bitte dort wieder aufnehmen, damit Lehrgänge und Historie erhalten bleiben.</span><a class="knopf klein aktion" href="person.html">Bestehende Person öffnen</a></div>
<div class="raster zwei">
  <section class="karte">
    <h2>Person</h2>
    <div class="felder zwei">
      <div class="feld"><label class="pflicht">Vorname</label><input type="text" value="Nico"></div>
      <div class="feld"><label class="pflicht">Nachname</label><input type="text" value="Hartmann"></div>
      <div class="feld"><label>Geschlecht</label><select><option>männlich</option><option>weiblich</option><option>divers</option></select></div>
      <div class="feld"><label>Geburtsdatum</label><input type="date" value="2007-02-03"><div class="hilfe">19 Jahre · einsatzfähig ab 18</div></div>
      <div class="feld"><label>Mobil</label><input type="tel" value="0157 3344556"></div>
      <div class="feld"><label>E-Mail</label><input type="email"></div>
    </div>
    <div class="feld"><label>Anschrift</label><input type="text" value="Bergstraße 9, 12345 Musterstadt-Pappelhain"></div>
  </section>
  <section class="karte">
    <h2>Aufnahme</h2>
    <div class="felder zwei">
      <div class="feld"><label class="pflicht">Stammabteilung</label><select><option>Abt. Pappelhain</option><option>Abt. Musterstadt</option></select></div>
      <div class="feld"><label class="pflicht">Aufnahme auf Probe am</label><input type="date" value="2026-11-01"></div>
    </div>
    <fieldset><legend>Status</legend><div class="wahl eng">
      <label><input type="radio" name="neu-status" checked><span>Probezeit<small>Standard für neue Mitglieder</small></span></label>
      <label><input type="radio" name="neu-status"><span>aktiv<small>z. B. Übertritt aus anderer Feuerwehr</small></span></label>
      <label><input type="radio" name="neu-status"><span>Jugendfeuerwehr</span></label>
    </div></fieldset>
    <div class="felder zwei">
      <div class="feld"><label>Probezeit endet am</label><input type="date" value="2027-10-31"><div class="hilfe">12 Monate nach Satzung. Abweichung nur mit Begründung.</div></div>
      <div class="feld"><label>Begründung für Abweichung</label><input type="text" placeholder="z. B. vorher Jugendfeuerwehr"></div>
    </div>
    <div class="meldung info" style="margin:4px 0 0"><span class="ic">i</span><span>30 Tage vor Ende der Probezeit erinnert f.orga den Abteilungskommandanten an die endgültige Aufnahme. Fehlt dann noch Truppmann Teil 1, gibt es 60 Tage vorher einen Hinweis.</span></div>
  </section>
</div>
<div class="aktionsleiste"><span class="status">Pflichtfelder sind mit * markiert. Weitere Angaben folgen in der Personenakte.</span><a class="knopf" href="personen.html">Abbrechen</a><a class="knopf primaer" href="person.html">Person anlegen</a></div>
''', nav='stammdaten/personen.html', brot=[('Stammdaten', None), ('Personen', 'stammdaten/personen.html'), ('Neu', None)])

# ---------- Organisation ----------
def abt(name, art, kdt, n, wachen, fahrzeuge, offen=False, kinder=''):
    w = ''.join(f'<li class="blatt">{sym("start")}<a href="#wache">{x}</a></li>' for x in wachen)
    f = ''.join(f'<li class="blatt">{sym("fahrzeug")}<a href="fahrzeug.html">{x}</a></li>' for x in fahrzeuge)
    gew = ' class="gewaehlt"' if offen else ''
    return f'''<li><details{" open" if offen else ""}><summary{gew}><strong>{name}</strong> <span class="plakette">{art}</span><span class="meta">{kdt} · {n} Mitglieder</span></summary>
<ul>{w}{f}{kinder}</ul></details></li>'''

seite('stammdaten/organisation.html', 'Organisation', '''
<div class="raster seite">
<section class="karte">
  <ul class="baum">
  <li><details open><summary><strong style="color:var(--dienst)">Freiwillige Feuerwehr Musterstadt</strong><span class="meta">Kommandant Markus Vogt</span></summary>
  <ul>
  ''' + abt('Abteilung Musterstadt', 'Einsatzabteilung', 'Abt.-Kdt. Ralf Kunz', 64, ['Feuerwehrhaus Musterstadt, Feuerwehrstraße 1'], ['LF 20/16 · Florian Musterstadt 1/44', 'DLA(K) 23-12 · Florian Musterstadt 1/33', 'ELW 1 · Florian Musterstadt 1/11', 'MLF 10/6 · Florian Musterstadt 1/42', 'MTW · Florian Musterstadt 1/19'], True,
    kinder='<li><details><summary>Jugendfeuerwehr Musterstadt <span class="plakette">Jugend</span><span class="meta">22 Mitglieder</span></summary></details></li><li><details><summary>Altersabteilung Musterstadt <span class="plakette">Alter</span><span class="meta">18 Mitglieder</span></summary></details></li>') +
  abt('Abteilung Birkenhain', 'Einsatzabteilung', 'Abt.-Kdt. Stefan Eberle', 31, ['Gerätehaus Birkenhain'], ['LF 8/6 · Florian Musterstadt 2/43', 'MTW · Florian Musterstadt 2/19']) +
  abt('Abteilung Weidenhain', 'Einsatzabteilung', 'Abt.-Kdt. Sabine Hagel', 28, ['Gerätehaus Weidenhain'], ['MLF 10/6 · Florian Musterstadt 3/42']) +
  abt('Abteilung Pappelhain', 'Einsatzabteilung', 'Abt.-Kdt. Holger Frank', 24, ['Gerätehaus Pappelhain'], ['TSF · Florian Musterstadt 4/47']) +
  abt('Abteilung Ahornfeld', 'Einsatzabteilung', 'Abt.-Kdt. Andreas Schmid', 19, ['Gerätehaus Ahornfeld'], ['TSF · Florian Musterstadt 5/47']) +
  abt('Abteilung Eschenbrunn', 'Einsatzabteilung', 'Abt.-Kdt. Carina Wagner', 17, ['Gerätehaus Eschenbrunn'], ['TSF · Florian Musterstadt 6/47']) +
  abt('Führungsgruppe Musterstadt', 'Führungseinheit', 'Leitung Tobias Rief', 12, [], []) +
  abt('Sonderdienste', 'Sonderdienst', 'Leitung N. N.', 9, [], []) + '''
  </ul></details></li>
  </ul>
</section>
<div class="stapel-abstand">
<section class="karte">
  <div class="karte-kopf"><h2>Abteilung Musterstadt</h2><a class="knopf klein" href="#">Bearbeiten</a></div>
  <dl class="daten">
    <dt>Typ</dt><dd>Einsatzabteilung</dd>
    <dt>Kurzname</dt><dd>Abt. Musterstadt</dd>
    <dt>Kommandant</dt><dd>Ralf Kunz</dd>
    <dt>Stellvertreter</dt><dd>Tobias Rief</dd>
    <dt>Statistik</dt><dd>zählt in der Gesamtstatistik</dd>
    <dt>Sonderaufgaben</dt><dd><div class="plaketten"><span class="plakette">Gefahrstoff</span><span class="plakette">Höhenrettung</span></div></dd>
    <dt>Wache</dt><dd>Feuerwehrhaus Musterstadt · ständig besetzt: nein</dd>
  </dl>
  <hr class="trenner">
  <div class="raster zwei">
    <div class="kachel"><div class="wert">64</div><div class="unter">Aktive</div></div>
    <div class="kachel"><div class="wert">5</div><div class="unter">Fahrzeuge</div></div>
  </div>
  <div class="formular-fuss" style="justify-content:flex-start"><a class="knopf klein" href="#">+ Wache</a><a class="knopf klein" href="fahrzeug.html">+ Fahrzeug</a><a class="knopf klein" href="#">+ Unterabteilung</a></div>
</section>
<section class="karte" id="wache">
  <div class="karte-kopf"><h2>Wache Feuerwehrhaus Musterstadt</h2><a class="knopf klein" href="#">Bearbeiten</a></div>
  <dl class="daten">
    <dt>Anschrift</dt><dd>Feuerwehrstraße 1, 12345 Musterstadt</dd>
    <dt>Abteilung</dt><dd>Abteilung Musterstadt</dd>
    <dt>Ständig besetzt</dt><dd>nein</dd>
    <dt>Fahrzeuge</dt><dd>5</dd>
  </dl>
  <hr class="trenner">
  <h3>Infoterminal</h3>
  <ul class="liste">
    <li><span>''' + sym('terminal') + '''</span><span><strong>Tablet Fahrzeughalle</strong> <span class="plakette ok">aktiv</span><br><span class="meta">Abt. Musterstadt, Jugendfeuerwehr, Altersabteilung · zuletzt gesehen heute 14:31</span></span><a class="rechts knopf klein sekundaer" href="{P}infoterminal/start.html">Öffnen</a></li>
    <li><span>''' + sym('terminal') + '''</span><span><strong>PC Funkraum</strong> <span class="plakette ok">aktiv</span><br><span class="meta">Abt. Musterstadt · zuletzt gesehen 21.10.2026 19:02</span></span><a class="rechts knopf klein sekundaer" href="{P}infoterminal/start.html">Öffnen</a></li>
  </ul>
  <p class="meta">Mitglieder tragen sich dort nach Einsätzen und Diensten ein. „Öffnen“ startet das Infoterminal in diesem Browser, z. B. auf dem Tablet der Wache (nur mit dem Recht, Infoterminals zu verwalten).</p>
  <div class="formular-fuss" style="justify-content:flex-start"><a class="knopf klein" href="{P}infoterminal/verwaltung.html">Infoterminals verwalten</a><a class="knopf klein" href="{P}infoterminal/verwaltung.html#d-link-anzeigen">Link anzeigen</a></div>
</section>
</div>
</div>''', brot=[('Stammdaten', None), ('Organisation', None)], aktionen='<a class="knopf primaer" href="#">+ Abteilung anlegen</a>')

# ---------- Fahrzeug ----------
seite('stammdaten/fahrzeug.html', 'LF 20/16 · Florian Musterstadt 1/44', '''
<div class="raster seite">
<section class="karte">
  <h2>Fahrzeugdaten</h2>
  <div class="felder zwei">
    <div class="feld"><label>Bezeichnung</label><input type="text" value="LF 20/16"></div>
    <div class="feld"><label>Funkrufname</label><input type="text" value="Florian Musterstadt 1/44"></div>
    <div class="feld"><label>Fahrzeugtyp</label><select><option>LF 20 (Löschgruppenfahrzeug)</option></select><div class="hilfe">Normbesatzung 1/8 · 9 Plätze</div></div>
    <div class="feld"><label>Kennzeichen</label><input type="text" value="MS-FW 1144"></div>
    <div class="feld"><label>Abteilung</label><select><option>Abt. Musterstadt</option></select></div>
    <div class="feld"><label>Wache</label><select><option>Feuerwehrhaus Musterstadt</option></select></div>
    <div class="feld"><label>Besatzungsplätze</label><input type="number" value="9"></div>
    <div class="feld"><label class="pflicht">Statistik-Kategorie</label><select><option>F66 · LF 20 / LF 20 KatS</option></select><div class="hilfe">Position der Jahresstatistik (Landesvorlage).</div></div>
    <div class="feld"><label>Kostenersatz-Kategorie</label><select><option>LF20 (205 €/h, VOKeFw 2024)</option></select></div>
    <div class="feld"><label>Baujahr</label><input type="number" value="2014"></div>
    <div class="feld"><label>In Dienst seit</label><input type="date" value="2014-11-08"></div>
    <div class="feld"><label>Status</label><select><option>in Dienst</option><option>außer Dienst</option><option>ausgesondert</option></select></div>
    <div class="feld"><label>Außer Dienst seit</label><input type="date"></div>
  </div>
  <div class="formular-fuss"><a class="knopf" href="organisation.html">Abbrechen</a><a class="knopf primaer" href="#">Speichern</a></div>
</section>
<aside>
  <section class="karte">
    <h2>Fahrzeuge der Gesamtwehr</h2>
    <ul class="liste">
      <li class="gewaehlt" aria-current="true"><strong>LF 20/16</strong><span class="rechts meta">Musterstadt 1/44</span></li>
      <li><a href="#">DLA(K) 23-12</a><span class="rechts meta">Musterstadt 1/33</span></li>
      <li><a href="#">ELW 1</a><span class="rechts meta">Musterstadt 1/11</span></li>
      <li><a href="#">MLF 10/6</a><span class="rechts meta">Musterstadt 1/42</span></li>
      <li><a href="#">LF 8/6</a><span class="rechts meta">Musterstadt 2/43</span></li>
      <li><a href="#">TSF</a><span class="rechts meta">Musterstadt 4/47</span></li>
    </ul>
  </section>
  <section class="karte">
    <h2>Prüfungen</h2>
    <p class="meta">HU, UVV und Gerätebeladung kommen mit dem Modul Geräte (Release 3).</p>
  </section>
  <section class="karte">
    <h2>Historie</h2>
    <ul class="historie">
      <li><div class="wer">Markus Vogt · 02.02.2026</div><div class="aenderung"><span>Kennzeichen</span><span><span class="alt">MS-FW 144</span> → <span class="neu">MS-FW 1144</span></span></div></li>
    </ul>
  </section>
</aside>
</div>''', brot=[('Stammdaten', None), ('Fahrzeuge', None), ('LF 20/16', None)], aktionen='<a class="knopf primaer" href="#">+ Fahrzeug anlegen</a>')

# ---------- Lehrgangsplanung ----------
def vorgemerkt(name, abt, prio, status, vor=True):
    v = '<span class="plakette ok">erfüllt</span>' if vor else '<span class="plakette warn">fehlt: Truppführer</span>'
    return [f'<a href="person.html">{name}</a>', abt, prio, v, f'<select aria-label="Status {name}"><option>{status}</option><option>angemeldet</option><option>Platz zugesagt</option><option>abgelehnt</option></select>']

seite('stammdaten/lehrgangsplanung.html', 'Lehrgangsplanung 2027', '''
<div class="filter">
  <div class="feld"><label>Jahr</label><select><option>2027</option><option>2026</option></select></div>
  <div class="feld"><label>Ebene</label><select><option>Alle</option><option>Gemeinde</option><option>Kreis</option><option>Landesfeuerwehrschule</option></select></div>
  <div class="feld"><label>Abteilung</label><select><option>Alle Abteilungen</option></select></div>
</div>
<div class="raster seite">
<section>
''' + tabelle(['Lehrgang', 'Ebene', '>Vorgemerkt', '>Angemeldet', '>Weitere Kandidaten'], [
    ('gewaehlt', ['<a href="#gf">Gruppenführer</a>', 'LFS Bruchsal', '3', '1', '4']),
    ['<a href="#gf">Truppführer</a>', 'Kreis', '6', '0', '9'],
    ['<a href="#gf">Atemschutzgeräteträger</a>', 'Kreis', '5', '5', '7'],
    ['<a href="#gf">Maschinisten</a>', 'Kreis', '4', '2', '11'],
    ['<a href="#gf">Sprechfunker Digitalfunk</a>', 'Kreis', '2', '0', '3'],
    ['<a href="#gf">Zugführer</a>', 'LFS Bruchsal', '1', '0', '2'],
    ['<a href="#gf">Truppmann Teil 1</a>', 'Gemeinde', '8', '8', '0'],
], 'stapel') + '''
<p class="meta" style="margin-top:8px">„Weitere Kandidaten“ erfüllen die Voraussetzungen, sind aber noch nicht vorgemerkt.</p>
</section>
<section class="karte" id="gf">
  <div class="karte-kopf"><h2>Gruppenführer</h2><a class="knopf klein" href="listen.html">Meldeliste Kreis</a></div>
  <p class="meta">Voraussetzung: Truppführer · Meldeschluss beim Kreis: 03.12.2026</p>
  <h3>Vorgemerkt (3)</h3>
  ''' + tabelle(['Person', 'Abt.', 'Prio', 'Voraussetzung', 'Status'], [
      vorgemerkt('Brenner, Lena', 'Weidenhain', 'hoch', 'angemeldet'),
      vorgemerkt('Bauer, Michael', 'Musterstadt', 'mittel', 'vorgemerkt'),
      ('warnung', vorgemerkt('Wagner, Carina', 'Eschenbrunn', 'mittel', 'vorgemerkt', vor=False)),
  ], 'stapel') + '''
  <h3 style="margin-top:16px">Weitere Kandidaten (4)</h3>
  <p class="meta">Erfüllen die Voraussetzung, sind nicht vorgemerkt. Auswählen und gemeinsam vormerken.</p>
  <ul class="liste">
    <li><label class="schalter" style="flex:1"><input type="checkbox" checked> <span>Fischer, Thomas<span class="unter-text">Musterstadt · Truppführer seit 2019</span></span></label></li>
    <li><label class="schalter" style="flex:1"><input type="checkbox" checked> <span>Lang, Martin<span class="unter-text">Pappelhain · Truppführer seit 2021</span></span></label></li>
    <li><label class="schalter" style="flex:1"><input type="checkbox"> <span>Roth, Sandra<span class="unter-text">Ahornfeld · Truppführer seit 2022</span></span></label></li>
    <li><label class="schalter" style="flex:1"><input type="checkbox"> <span>Weber, Kai<span class="unter-text">Birkenhain · Truppführer seit 2023</span></span></label></li>
  </ul>
  <div class="felder zwei" style="margin-top:10px">
    <div class="feld"><label>Priorität</label><select><option>mittel</option><option>hoch</option><option>niedrig</option></select></div>
    <div class="feld"><label>gewünscht</label><select><option>2027</option><option>2028</option></select></div>
  </div>
  <div class="formular-fuss"><a class="knopf primaer" href="#">2 Personen vormerken</a></div>
</section>
</div>''', brot=[('Stammdaten', None), ('Lehrgangsplanung', None)])

# ---------- Listen ----------
def liste(titel, beschr, formate='PDF · Excel · CSV'):
    return f'''<section class="karte">
  <h3>{titel}</h3><p class="neben">{beschr}</p>
  <div class="knopfreihe"><a class="knopf klein sekundaer" href="#">Öffnen</a><a class="knopf klein" href="#">PDF</a><a class="knopf klein" href="#">Excel</a><a class="knopf klein text" href="#">Anpassen</a></div>
</section>'''

seite('stammdaten/listen.html', 'Listen', '''
<div class="raster seite">
<div>
<div class="chips"><a class="chip aktiv" href="#" aria-current="true">Alle</a><a class="chip" href="#">Personen</a><a class="chip" href="#">Organisation</a><a class="chip" href="#">Lehrgänge</a><a class="chip" href="#">Meine Listen</a></div>
<div class="raster zwei">
''' + liste('Komplettdaten', 'Alle Felder je Person, Filter nach Abteilung und Status.') +
liste('Mitgliederliste', 'Name, Abteilung, Dienstgrad, Eintritt, Telefon.') +
liste('Unterschriftenliste', 'Name, Abteilung und leere Spalte für die Unterschrift. Titel und Datum frei.') +
liste('Telefon- und Alarmliste', 'Name, Mobilnummer, Funktion – kompakt für den Aushang.') +
liste('Geburtstage', 'Zeitraum wählbar, runde Geburtstage markiert.') +
liste('Jubiläen', 'Dienstjahre 10/15/25/40/50 im gewählten Jahr.') +
liste('Qualifikationsübersicht', 'Matrix Person × Qualifikation je Abteilung.') +
liste('Atemschutzgeräteträger', 'Personen mit Kennzeichen Atemschutz. Tauglichkeit mit Fristen später aus dem Modul Atemschutz.') +
liste('Fahrzeugliste', 'Fahrzeuge je Abteilung und Wache mit Funkrufnamen.') +
liste('Personalstärke', 'Anzahl je Abteilung, Typ, Altersgruppe, Geschlecht – Grundlage der Jahresstatistik.') +
liste('Probezeit', 'Personen in der Probezeit mit Ende und Stand der Grundausbildung.') +
liste('Altersgrenzen', 'Wer im gewählten Jahr 18, 55 oder 65 wird.') + '''
</div>
</div>
<section class="karte">
  <h2>Unterschriftenliste</h2>
  <div class="feld"><label>Titel</label><input type="text" value="Unterweisung Atemschutz"></div>
  <div class="felder zwei">
    <div class="feld"><label>Datum</label><input type="date" value="2026-11-06"></div>
    <div class="feld"><label>Abteilung</label><select><option>Abt. Musterstadt</option></select></div>
  </div>
  <div class="feld"><label>Personen</label><select><option>nur Atemschutzgeräteträger</option><option>alle Aktiven</option></select></div>
  <fieldset><legend>Zusatzspalten</legend><div class="schalter-liste">
  <label class="schalter"><input type="checkbox" checked> Dienstgrad</label>
  <label class="schalter"><input type="checkbox"> Uhrzeit</label>
  <label class="schalter"><input type="checkbox"> Bemerkung</label>
  </div></fieldset>
  <div class="feld"><label>Sprache der Liste</label><select><option>Deutsch</option><option>English</option></select></div>
  <div class="formular-fuss"><a class="knopf" href="#">Excel</a><a class="knopf primaer" href="#">PDF erzeugen</a></div>
  <hr class="trenner">
  <p class="meta">Vorschau: Wappen und Kicker oben, Tabellenkopf weiß auf rot, Fußzeile mit Anschrift, Seitenzahl und Erstellungsdatum.</p>
</section>
</div>''', brot=[('Stammdaten', None), ('Listen', None)])

# ---------- Import ----------
def zuord(quelle, ziel, beispiel, ok=True):
    sel = f'<select aria-label="Feld für {quelle}"><option>{ziel}</option><option>– ignorieren –</option></select>'
    return ('' if ok else 'warnung', [f'<strong>{quelle}</strong>', sel, f'<span class="meta">{beispiel}</span>'])

seite('stammdaten/import.html', 'Import', '''
<ol class="schritte">
  <li><a class="fertig" href="#"><span class="nr">✓</span><span class="text">Datei</span></a></li>
  <li><a class="aktiv" href="#" aria-current="step"><span class="nr">2</span><span class="text">Spalten zuordnen</span></a></li>
  <li><a href="#"><span class="nr">3</span><span class="text">Vorschau &amp; Prüfung</span></a></li>
  <li><a href="#"><span class="nr">4</span><span class="text">Übernehmen</span></a></li>
</ol>
<p class="schritt-titel">Schritt 2 von 4: Spalten zuordnen</p>
<section class="karte">
  <div class="karte-kopf"><h2>Personal.xlsx · Blatt „Personal“</h2><span class="plakette">Profil: MP-Feuer Personal</span></div>
  <p class="neben">Die Zuordnung wurde aus den Überschriften vorgeschlagen. Schlüssel für wiederholte Importe: <strong>Vorname + Nachname</strong> (Personalnummer nicht vorhanden).</p>
  ''' + tabelle(['Spalte in der Datei', 'Feld in f.orga', 'Beispielwert'], [
      zuord('Anrede', 'Anrede', 'Herr'),
      zuord('Vorname', 'Vorname', 'Tobias'),
      zuord('Nachname', 'Nachname', 'Rief'),
      zuord('Straße', 'Straße', 'Lindenweg 7'),
      zuord('PLZ', 'PLZ', '12345'),
      zuord('Ort', 'Ort', 'Musterstadt'),
      zuord('Bezeichnung', 'Stammabteilung', 'Abt. Musterstadt'),
      zuord('Geb.-Datum', '– bitte wählen –', '17.04.1986', ok=False),
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">1 Spalte ist noch nicht zugeordnet. Nicht zugeordnete Spalten werden ignoriert.</p>
</section>
<section class="karte">
  <h2>Vorschau (Schritt 3)</h2>
  <div class="raster drei" style="margin-bottom:12px">
    <div class="kachel"><div class="wert">198</div><div class="unter">neu anzulegen</div></div>
    <div class="kachel"><div class="wert">14</div><div class="unter">vorhanden, werden aktualisiert</div></div>
    <div class="kachel warn"><div class="wert">3</div><div class="unter">mit Fehlern, werden übersprungen</div></div>
  </div>
  ''' + tabelle(['Zeile', 'Name', 'Ergebnis'], [
      ('warnung', ['17', 'Schmutz Thorsten', 'Abteilung „Abt. Musterstadtt“ unbekannt – ähnlich: Abt. Musterstadt']),
      ('warnung', ['88', 'Meier, ', 'Vorname fehlt']),
      ('warnung', ['143', 'Kurz Anna', 'doppelt in Zeile 12']),
  ]) + '''
</section>
<div class="aktionsleiste"><span class="status">Import wird im Audit-Log protokolliert.</span><a class="knopf" href="#">Zurück</a><a class="knopf primaer" href="#">Weiter zur Vorschau</a></div>
''', brot=[('Stammdaten', None), ('Import', None)])
