"""Mockups des Moduls Infoterminal (`info-terminal`): Kiosk-Seiten je Wache und Verwaltung der Terminals."""
import random

from rahmen import seite, tabelle, dialog, leer, sym, mockup_hinweis, SPRACHE, FUSS

ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'
WACHE = 'Feuerwehrhaus Musterstadt'


def tk(pfad, titel, inhalt, *, dialoge='', uhr='14:32', wache=WACHE):
    """Kiosk-Seite: kein Shell-Rahmen, keine Navigation, keine Anmeldung. Kopf mit Wache, Uhr und Sprache."""
    rumpf = ('<div class="tk">' + mockup_hinweis('{P}') +
             '<header class="tk-kopf"><img src="{P}assets/logo.svg" alt="Wappen">'
             '<div class="tk-wache"><span class="kicker">Infoterminal · Freiwillige Feuerwehr Musterstadt</span>'
             f'<strong>{wache}</strong></div><span class="tk-uhr" translate="no">{uhr}</span>{SPRACHE}</header>'
             f'<main class="tk-inhalt" id="inhalt">{inhalt}</main>{FUSS}</div>')
    seite(pfad, titel, rumpf, ohne_rahmen=True, dialoge=dialoge)


def zurueck(ziel, text='‹ Übersicht'):
    return f'<a class="tk-zurueck" href="{ziel}">{text}</a>'


def qr_svg(seed=7, n=25):
    """Nur ein Platzhalter mit QR-Optik (Suchmuster in drei Ecken, zufällige Module)."""
    r = random.Random(seed)
    teile = []
    for y in range(n):
        for x in range(n):
            ecke = (x < 8 and y < 8) or (x >= n - 8 and y < 8) or (x < 8 and y >= n - 8)
            if not ecke and r.random() < .48:
                teile.append(f'M{x} {y}h1v1h-1z')
    finder = ''
    for fx, fy in ((0, 0), (n - 7, 0), (0, n - 7)):
        finder += f'M{fx} {fy}h7v7h-7zM{fx + 1} {fy + 1}v5h5v-5zM{fx + 2} {fy + 2}h3v3h-3z'
    return (f'<svg class="qr" viewBox="0 0 {n} {n}" role="img" aria-label="QR-Code des Links" shape-rendering="crispEdges">'
            f'<path fill="#222" fill-rule="evenodd" d="{finder}{"".join(teile)}"/></svg>')


# Fahrzeuge immer mit Bezeichnung · Funkrufname (Abteilung), wie vehicleLabel() in masterdata-contracts
FZ = [
    ('lf', 'LF 20/16 · Florian Musterstadt 1/44 (Musterstadt)', '5 von 9 Plätzen'),
    ('dla', 'DLA(K) 23-12 · Florian Musterstadt 1/33 (Musterstadt)', '1 von 3 Plätzen'),
    ('elw', 'ELW 1 · Florian Musterstadt 1/11 (Musterstadt)', '0 von 4 Plätzen'),
    ('mlf', 'MLF 10/6 · Florian Musterstadt 1/42 (Musterstadt)', '0 von 6 Plätzen'),
    ('mtw', 'MTW · Florian Musterstadt 1/19 (Musterstadt)', '0 von 9 Plätzen'),
]


def wahl(name, optionen, klasse=''):
    t = ''
    for wert, text, klein, an in optionen:
        k = f'<small>{klein}</small>' if klein else ''
        t += f'<label><input type="radio" name="{name}" value="{wert}"{" checked" if an else ""}><span>{text}{k}</span></label>'
    return f'<div class="wahl {klasse}">{t}</div>'


# ---------- Startbildschirm ----------
tk('infoterminal/start.html', 'Infoterminal', '''
<div class="tk-titel"><h1>Wofür möchten Sie sich eintragen?</h1><span class="meta">Freitag, 23.10.2026</span></div>
<div class="tk-ereignisse">
  <a class="tk-ereignis" href="personen.html"><span class="art">Einsatz · läuft</span><strong>B3 Brand Scheune</strong><span>Alarm 13:12 · Musterstadt, Lindenweg 4</span>
    <span class="fuss-zeile"><span class="plakette ok">5 eingetragen</span><span class="meta">Eintragen bis 01:12</span></span></a>
  <a class="tk-ereignis" href="personen.html"><span class="art">Einsatz · beendet 13:50</span><strong>TH1 Ölspur</strong><span>Alarm 12:05 · Musterstadt, B 311</span>
    <span class="fuss-zeile"><span class="plakette ok">4 eingetragen</span><span class="plakette gelb">Eintragen nur noch bis 14:50</span></span></a>
  <div class="tk-ereignis dienst zu" aria-disabled="true"><span class="art">Dienst · heute 19:00–21:30</span><strong>Übung Technische Hilfe</strong><span>Feuerwehrhaus Musterstadt</span>
    <span class="fuss-zeile"><span class="meta">Eintragen ab 18:30</span></span></div>
  <a class="tk-neu" href="neuer-einsatz.html">+ Neuer Einsatz</a>
</div>
<p class="meta">Eintragen geht während eines Einsatzes und bis eine Stunde nach seinem Ende, bei Diensten ab 30 Minuten vor Beginn bis eine Stunde nach dem Ende. Ohne eingetragenes Einsatzende schließt das Eintragen 12 Stunden nach dem Alarm. Den Bericht schreibt weiterhin der Verfasser in f.orga.</p>
''')

# ---------- Personenauswahl ----------
MITGLIEDER = [
    ('Bauer', 'Michael', 'LF 20/16 · Maschinist'), ('Fischer', 'Jana', ''), ('Graf', 'Nina', ''), ('Hahn', 'Lukas', 'LF 20/16 · Angriffstrupp'),
    ('Keller', 'Jonas', 'LF 20/16 · Angriffstrupp'), ('Kunz', 'Ralf', 'DLA(K) 23-12 · Maschinist'), ('Lang', 'Martin', ''), ('Moser', 'Daniel', ''),
    ('Ott', 'Felix', ''), ('Rief', 'Tobias', 'LF 20/16 · Gruppenführer'), ('Roth', 'Sandra', ''), ('Sauter', 'Erik', ''),
    ('Unger', 'Max', ''), ('Vogt', 'Markus', ''), ('Weber', 'Kai', ''), ('Weiß', 'Anna', ''), ('Ziegler', 'Paul', ''),
]


def name_kachel(nach, vor, gebucht, ziel='buchung.html'):
    if gebucht:
        return f'<a class="tk-name gebucht" href="eingetragen.html#d-aendern"><strong>{vor} {nach}</strong><span class="meta">{gebucht}</span></a>'
    return f'<a class="tk-name" href="{ziel}"><strong>{vor} {nach}</strong><span class="meta">Abt. Musterstadt</span></a>'


tk('infoterminal/personen.html', 'Wer sind Sie?', zurueck('start.html') + '''
<div class="tk-titel"><div><span class="meta">Einsatz · Alarm 13:12 · Musterstadt, Lindenweg 4</span><h1>B3 Brand Scheune: Wer sind Sie?</h1></div>
<a class="knopf" href="eingetragen.html">Eingetragen (5)</a></div>
<div class="tk-buchstaben" aria-label="Nach Anfangsbuchstaben springen"><a class="aktiv" href="#">Alle</a><a href="#">B</a><a href="#">F</a><a href="#">G</a><a href="#">H</a><a href="#">K</a><a href="#">L</a><a href="#">M</a><a href="#">O</a><a href="#">R</a><a href="#">S</a><a href="#">U</a><a href="#">V</a><a href="#">W</a><a href="#">Z</a></div>
<div class="tk-namen">''' + ''.join(name_kachel(n, v, g) for n, v, g in MITGLIEDER) + '''</div>
<section class="tk-abschnitt">
  <h2>Aus einer anderen Abteilung?</h2>
  <div class="feld"><label>Namen suchen (ab 3 Buchstaben)</label><input type="search" value="Bren" placeholder="Nachname"></div>
  <div class="tk-namen" style="margin-bottom:0">
    <a class="tk-name" href="buchung.html"><strong>Lena Brenner</strong><span class="meta">Abt. Weidenhain</span></a>
    <span class="tk-name gesperrt"><strong>Tim Brendel</strong><span class="meta">Abt. Birkenhain · steht schon im Bericht Birkenhain</span></span>
  </div>
  <p class="meta" style="margin:8px 0 0">Gezeigt werden höchstens 10 Treffer, nur Name und Abteilung. Gäste aus Nachbarwehren trägt der Verfasser im Bericht ein.</p>
</section>
<p class="meta">Grün mit Haken: schon eingetragen. Antippen öffnet die eigene Eintragung zum Ändern oder Austragen. Nach 60 Sekunden ohne Eingabe kehrt das Terminal zur Übersicht zurück.</p>
''')

# ---------- Buchungsformular ----------
tk('infoterminal/buchung.html', 'Eintragen', zurueck('personen.html', '‹ Andere Person') + '''
<div class="tk-titel"><div><span class="meta">B3 Brand Scheune · Alarm 13:12</span><h1>Jana Fischer eintragen</h1></div></div>
<section class="tk-abschnitt">
  <h2>Wo waren Sie?</h2>
  ''' + wahl('wo', [(k, t, p, k == 'lf') for k, t, p in FZ] +
             [('be', 'Bereitschaft', 'Feuerwehrhaus Musterstadt · pauschal 1 h', False)]) + '''
  <details style="margin-top:12px"><summary class="knopf text">Anderes Fahrzeug …</summary>
    <div class="feld" style="margin-top:8px"><label>Fahrzeug einer anderen Wache oder Abteilung</label><select>
      <option>– bitte wählen –</option><option>LF 8/6 · Florian Musterstadt 2/43 (Birkenhain)</option><option>MTW · Florian Musterstadt 2/19 (Birkenhain)</option>
      <option>MLF 10/6 · Florian Musterstadt 3/42 (Weidenhain)</option><option>TSF · Florian Musterstadt 4/47 (Pappelhain)</option></select></div>
  </details>
</section>
<section class="tk-abschnitt">
  <h2>Funktion</h2>
  ''' + wahl('fkt', [('gf', 'Gruppenführer', '', False), ('ma', 'Maschinist', '', False), ('me', 'Melder', '', True), ('at', 'Angriffstrupp', '', False),
                     ('wt', 'Wassertrupp', '', False), ('st', 'Schlauchtrupp', '', False), ('el', 'Einsatzleiter', '', False), ('ohne', 'keine Angabe', '', False)], 'eng') + '''
</section>
<section class="tk-abschnitt">
  <h2>Weitere Angaben</h2>
  <div class="schalter-liste">
    <label class="schalter"><input type="checkbox"> Unter Atemschutz</label>
    <label class="schalter"><input type="checkbox"> Verdienstausfall beim Arbeitgeber</label>
    <label class="schalter"><input type="checkbox"> Einsatz während der Arbeitszeit beim Dienstherrn</label>
    <label class="schalter"><input type="checkbox" checked> Ich war nicht die ganze Zeit dabei</label>
  </div>
  <div class="felder zwei" style="margin-top:8px">
    <div class="feld"><label>Von</label><input type="time" value="13:40"></div>
    <div class="feld"><label>Bis</label><input type="time" value=""><div class="hilfe">Leer: bis zum Ende des Einsatzes</div></div>
  </div>
  <p class="meta" style="margin:0">Beträge, Atemschutzminuten und Verletzungen trägt der Verfasser im Bericht ein.</p>
</section>
<div class="tk-leiste"><span class="status">Kommt in den Bericht der Abteilung Musterstadt, markiert „vom Infoterminal“.</span><a class="knopf" href="personen.html">Abbrechen</a><button type="button" class="knopf primaer gross" data-dialog="d-eingetragen">Eintragen</button></div>
''', dialoge=dialog('d-eingetragen', 'Eingetragen', '''
<div class="tk-erfolg"><div class="haken" aria-hidden="true">✓</div>
<p><strong>Jana Fischer</strong><br>LF 20/16 · Florian Musterstadt 1/44 (Musterstadt)<br>Melder · ab 13:40</p>
<p class="meta">B3 Brand Scheune · Bericht Abteilung Musterstadt. Ändern oder Austragen bis 01:12 hier am Terminal. Zurück zur Übersicht in 10 s.</p></div>''',
    '<a class="knopf" href="eingetragen.html">Eingetragene ansehen</a><a class="knopf primaer" href="start.html">Fertig</a>'))

# ---------- Eingetragene mit Korrektur ----------
def zeile(name, fkt, quelle, aenderbar=True):
    if aenderbar:
        pl = f'<span class="plakette ok">Infoterminal {quelle}</span>'
        akt = '<button type="button" class="knopf" data-dialog="d-aendern">Ändern</button>'
    else:
        pl = '<span class="plakette grau">' + sym('schloss') + 'vom Verfasser</span>'
        akt = ''
    return f'<li><span class="wer"><strong>{name}</strong><br><span class="meta">{fkt}</span></span>{pl}{akt}</li>'


tk('infoterminal/eingetragen.html', 'Eingetragen', zurueck('personen.html', '‹ Zur Namensliste') + '''
<div class="tk-titel"><div><span class="meta">Einsatz · Alarm 13:12 · Musterstadt, Lindenweg 4</span><h1>B3 Brand Scheune: Eingetragen (6)</h1></div><span class="plakette gelb">Ändern bis 01:12</span></div>
<section class="tk-abschnitt"><h2>LF 20/16 · Florian Musterstadt 1/44 (Musterstadt)</h2><p class="meta">5 von 9 Plätzen</p><ul class="tk-besatzung">''' +
    zeile('Tobias Rief', 'Gruppenführer', '', False) + zeile('Michael Bauer', 'Maschinist', '13:31') + zeile('Jonas Keller', 'Angriffstrupp · Atemschutz', '13:33') +
    zeile('Lukas Hahn', 'Angriffstrupp · Atemschutz', '13:34') + zeile('Jana Fischer', 'Melder · ab 13:40', '14:32') + '''</ul></section>
<section class="tk-abschnitt"><h2>DLA(K) 23-12 · Florian Musterstadt 1/33 (Musterstadt)</h2><p class="meta">1 von 3 Plätzen</p><ul class="tk-besatzung">''' +
    zeile('Ralf Kunz', 'Maschinist', '13:36') + '''</ul></section>
<p class="meta">Eintragungen „vom Verfasser“ stammen aus dem Bericht und lassen sich nur dort ändern. Eigene Eintragungen vom Infoterminal lassen sich hier ändern, bis das Eintragen schließt oder der Bericht fertig gemeldet ist.</p>
''', dialoge=dialog('d-aendern', 'Michael Bauer', '''
<dl class="daten"><dt>Fahrzeug</dt><dd>LF 20/16 · Florian Musterstadt 1/44 (Musterstadt)</dd><dt>Funktion</dt><dd>Maschinist</dd><dt>Zeit</dt><dd>ganzer Einsatz</dd><dt>Eingetragen</dt><dd>13:31 am Infoterminal</dd></dl>
<p class="meta" style="margin-top:12px">Ändern öffnet das Formular mit den bisherigen Angaben.</p>''',
    '<button type="button" class="knopf" data-dialog="d-austragen">Austragen …</button><a class="knopf primaer" href="buchung.html">Ändern</a>') +
    dialog('d-austragen', 'Michael Bauer austragen?', '<p>Michael Bauer wird aus dem Bericht der Abteilung Musterstadt zu <strong>B3 Brand Scheune</strong> entfernt. Die Änderung steht in der Historie des Berichts.</p>',
           ABBRECHEN + '<button class="knopf primaer" value="ok">Austragen</button>', gefahr=True))

# ---------- Neuer Einsatz ----------
tk('infoterminal/neuer-einsatz.html', 'Neuer Einsatz', zurueck('start.html') + '''
<div class="tk-titel"><h1>Neuer Einsatz</h1><span class="meta">Legt den Einsatz und den Bericht der Abteilung Musterstadt an</span></div>
<section class="tk-abschnitt">
  <div class="feld"><label class="pflicht">Stichwort</label><select><option>– bitte wählen –</option><option selected>TH-Wasser · Wasser im Gebäude / Unwetter</option><option>B1 · Kleinbrand</option><option>B2 · Brand Wohnung</option><option>TH1 · Technische Hilfe klein</option><option>B-BMA · Brandmeldeanlage</option></select></div>
  <div class="felder zwei">
    <div class="feld"><label class="pflicht">Alarm</label><input type="time" value="13:58"><div class="hilfe">heute, höchstens 12 Stunden zurück</div></div>
    <div class="feld"><label>Leitstellennummer</label><input type="text" placeholder="falls bekannt, z. B. 2026-104950"></div>
  </div>
  <div class="felder zwei">
    <div class="feld"><label>Straße und Hausnummer</label><input type="text" value="Mühlweg 7"></div>
    <div class="feld"><label>Ort</label><input type="text" value="Musterstadt"></div>
  </div>
</section>
<div class="meldung info"><span class="ic">i</span><span>Den Bericht schreibt danach ein Verfasser der Abteilung in f.orga. Ein Einsatz von der Leitstelle (Schnittstelle) erscheint ohne dieses Formular auf der Übersicht.</span></div>
<div class="tk-leiste"><a class="knopf" href="start.html">Abbrechen</a><button type="button" class="knopf primaer gross" data-dialog="d-treffer">Weiter</button></div>
''', dialoge=dialog('d-treffer', 'Gibt es den Einsatz schon?', '''
<p>Ein passender Einsatz ist schon angelegt (gleiches Stichwort, Alarm innerhalb von 2 Stunden):</p>
<section class="karte" style="margin-bottom:8px"><strong>TH-Wasser · Wasser im Gebäude / Unwetter</strong><br><span class="meta">Alarm 13:51 · Musterstadt, Mühlweg 5 · Berichte: Birkenhain</span>
<div class="formular-fuss" style="justify-content:flex-start"><a class="knopf sekundaer" href="personen.html">Unseren Bericht hinzufügen</a></div></section>
<p class="meta">Gezeigt werden nur Stichwort, Alarm, Ort und beteiligte Abteilungen. Die Abteilung Musterstadt bekommt einen eigenen Bericht (Nebenbericht) zu diesem Einsatz.</p>''',
    '<a class="knopf" href="personen.html">Nein, neuen Einsatz anlegen</a>'))

# ---------- Dienst ----------
tk('infoterminal/dienst.html', 'Dienst eintragen', zurueck('start.html') + '''
<div class="tk-titel"><div><span class="meta">Dienst · heute 19:00–21:30 · Abt. Musterstadt</span><h1>Übung Technische Hilfe: Jana Fischer</h1></div><span class="plakette gelb">Eintragen bis 22:30</span></div>
<section class="tk-abschnitt">
  <h2>Anwesend</h2>
  <div class="schalter-liste">
    <label class="schalter"><input type="checkbox"> Unter Atemschutz</label>
    <label class="schalter"><input type="checkbox"> Ich war nicht die ganze Zeit dabei</label>
  </div>
  <div class="feld" style="margin-top:8px"><label>Funktion (optional)</label><input type="text" placeholder="z. B. Maschinist"></div>
</section>
<div class="meldung warnung"><span class="ic">!</span><span>Die Eintragung ist vorläufig, bis der Verantwortliche die Anwesenheit speichert, wie beim QR-Check-in.</span></div>
<section class="tk-abschnitt"><h2>Schon anwesend (14)</h2><p class="meta" style="margin:0">Michael Bauer, Nina Graf, Lukas Hahn, Jonas Keller, Ralf Kunz, Martin Lang, Daniel Moser, Felix Ott, Tobias Rief, Sandra Roth, Erik Sauter, Kai Weber, Anna Weiß, Paul Ziegler</p></section>
<div class="tk-leiste"><a class="knopf" href="start.html">Abbrechen</a><a class="knopf primaer gross" href="start.html">Anwesend eintragen</a></div>
''', uhr='19:42')

# ---------- Nichts offen ----------
tk('infoterminal/leer.html', 'Infoterminal', '''
<div class="tk-zentriert">
  <div class="symbol-gross">''' + sym('terminal') + '''</div>
  <h1>Gerade ist nichts zum Eintragen offen</h1>
  <p class="neben">Einsätze erscheinen hier ab dem Alarm, Dienste 30 Minuten vor Beginn. Nächster Dienst: <strong>Dienstag, 27.10. 19:00 · Übung Atemschutz</strong>.</p>
  <a class="knopf primaer gross" href="neuer-einsatz.html">+ Neuer Einsatz</a>
</div>''', uhr='09:15')

# ---------- Ungültig / widerrufen ----------
tk('infoterminal/gesperrt.html', 'Infoterminal nicht freigeschaltet', '''
<div class="tk-zentriert">
  <div class="symbol-gross">''' + sym('schloss') + '''</div>
  <h1>Dieses Gerät ist nicht als Infoterminal freigeschaltet</h1>
  <p class="neben">Der Link ist ungültig oder wurde widerrufen. Bitte wenden Sie sich an den Abteilungskommandanten oder den Administrator. Er richtet das Gerät unter „Verwaltung → Infoterminals“ oder auf der Seite der Wache neu ein.</p>
  <p class="meta">Es werden keine Daten angezeigt. Fehlercode <code translate="no">info-terminal.invalidKey</code></p>
</div>''', wache='Infoterminal', uhr='14:32')

# ---------- Verwaltung ----------
seite('infoterminal/verwaltung.html', 'Infoterminals', '''
<div class="filter">
  <div class="feld"><label>Abteilung</label><select><option>Alle Abteilungen</option><option>Musterstadt</option><option>Birkenhain</option><option>Weidenhain</option></select></div>
  <label class="schalter"><input type="checkbox"> Widerrufene zeigen</label>
</div>
''' + tabelle(['Wache', 'Gerät', 'Erlaubt', 'Zuletzt gesehen', 'Status', ''], [
    ['<strong>Feuerwehrhaus Musterstadt</strong><span class="unter-text">Abt. Musterstadt</span>', 'Tablet Fahrzeughalle', 'Einsätze, Neuer Einsatz, Dienste', 'heute 14:31', '<span class="plakette ok">aktiv</span>',
     '<span class="knopfreihe"><button type="button" class="knopf klein" data-dialog="d-neuer-link">Neuer Link …</button><button type="button" class="knopf klein" data-dialog="d-widerruf">Widerrufen …</button></span>'],
    ['<strong>Feuerwehrhaus Musterstadt</strong><span class="unter-text">Abt. Musterstadt</span>', 'PC Funkraum', 'Einsätze, Dienste', '21.10.2026 19:02', '<span class="plakette ok">aktiv</span>',
     '<span class="knopfreihe"><button type="button" class="knopf klein" data-dialog="d-neuer-link">Neuer Link …</button><button type="button" class="knopf klein" data-dialog="d-widerruf">Widerrufen …</button></span>'],
    ('warnung', ['<strong>Gerätehaus Weidenhain</strong><span class="unter-text">Abt. Weidenhain</span>', 'Tablet', 'Einsätze, Neuer Einsatz', '19.09.2026 20:44', '<span class="plakette warn">seit 34 Tagen nicht gesehen</span>',
     '<span class="knopfreihe"><button type="button" class="knopf klein" data-dialog="d-neuer-link">Neuer Link …</button><button type="button" class="knopf klein" data-dialog="d-widerruf">Widerrufen …</button></span>']),
    ['<strong>Gerätehaus Birkenhain</strong><span class="unter-text">Abt. Birkenhain</span>', 'Tablet', 'Einsätze', '02.10.2026 08:10', '<span class="plakette grau">widerrufen 02.10.2026 · Stefan Eberle</span>', ''],
], 'stapel') + '''
<section class="karte" style="margin-top:16px;max-width:720px">
  <h2>Neues Infoterminal</h2>
  <div class="felder zwei">
    <div class="feld"><label class="pflicht">Wache</label><select><option>Feuerwehrhaus Musterstadt (Musterstadt)</option><option>Gerätehaus Birkenhain (Birkenhain)</option><option>Gerätehaus Weidenhain (Weidenhain)</option></select></div>
    <div class="feld"><label class="pflicht">Gerät</label><input type="text" placeholder="z. B. Tablet Fahrzeughalle"></div>
  </div>
  <fieldset><legend>Erlaubt</legend><div class="schalter-liste">
    <label class="schalter"><input type="checkbox" checked disabled> Für Einsätze der Abteilung eintragen</label>
    <label class="schalter"><input type="checkbox" checked> Neuen Einsatz anlegen</label>
    <label class="schalter"><input type="checkbox" checked> Für Dienste eintragen (Modul Dienste)</label>
  </div></fieldset>
  <div class="feld" style="max-width:260px"><label>Sprache beim Start</label><select><option>Deutsch</option><option>English</option></select></div>
  <div class="formular-fuss"><button type="button" class="knopf primaer" data-dialog="d-link">Infoterminal anlegen</button></div>
</section>
<p class="meta">Ein Infoterminal ist ein Gerät an einer Wache. Es braucht kein Benutzerkonto, kann nur eintragen und nichts lesen außer Namen der Abteilung und den offenen Einsätzen und Diensten. Anlegen, neuer Link und Widerruf stehen im Audit-Log.</p>
''', brot=[('Verwaltung', None), ('Infoterminals', None)], dialoge=dialog('d-link', 'Link für das Infoterminal', '''
<div class="meldung ok"><span class="ic">✓</span><span><strong>Infoterminal angelegt.</strong> Der Link wird nur jetzt angezeigt. Öffnen Sie ihn auf dem Gerät an der Wache; danach bleibt das Gerät angemeldet.</span></div>
''' + qr_svg() + '''
<code class="geheim" translate="no">https://forga.musterstadt.example/terminal#k=fit_Q7m2Xv9bR4tW1nL8pD3sH6yC0jF5gK2a</code>
<p class="meta" style="margin-top:8px">QR-Code mit der Kamera des Tablets scannen oder den Link kopieren. Wer den Link hat, kann für die Wache eintragen. Nicht per E-Mail oder Messenger weitergeben.</p>''',
    '<button type="button" class="knopf">Link kopieren</button><button class="knopf primaer" value="ok">Fertig</button>') +
    dialog('d-neuer-link', 'Neuen Link erzeugen?', '<p>Der bisherige Link von <strong>Tablet Fahrzeughalle</strong> wird sofort ungültig. Das Gerät zeigt dann „nicht freigeschaltet“, bis der neue Link geöffnet ist.</p>',
           ABBRECHEN + '<button class="knopf primaer" value="ok" data-dialog="d-link">Neuen Link erzeugen</button>') +
    dialog('d-widerruf', 'Infoterminal widerrufen?', '<p><strong>Tablet Fahrzeughalle</strong> (Feuerwehrhaus Musterstadt) kann danach nicht mehr eintragen. Bisherige Eintragungen bleiben in den Berichten. Für das Gerät legen Sie später ein neues Infoterminal an.</p>',
           ABBRECHEN + '<button class="knopf primaer" value="ok">Widerrufen</button>', gefahr=True))
