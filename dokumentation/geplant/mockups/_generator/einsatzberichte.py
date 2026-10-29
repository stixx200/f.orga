from rahmen import seite, tabelle, dialog, leer, sym

H = lambda a: f'<span class="plakette haupt">{a}</span>'
N = lambda a: f'<span class="plakette neben">{a}</span>'
S_ENTWURF = '<span class="plakette gelb">Entwurf</span>'
S_PRUEF = '<span class="plakette">Zur Prüfung</span>'
S_ENT = '<span class="plakette ok">Freigabe Entschädigung</span>'
S_ABR = '<span class="plakette ok">Freigabe Abrechnung</span>'
GESPERRT = '<span class="plakette grau">' + sym('schloss') + 'gesperrt</span>'
ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'

# ---------- Einsatzliste ----------
def e(datum, nr, stw, ort, ber, status, kl=''):
    z = [f'<a href="einsatz.html">{stw}</a><span class="unter-text">{nr}</span>', datum, ort, f'<div class="plaketten">{ber}</div>', f'<div class="plaketten">{status}</div>']
    return (kl, z) if kl else z

seite('einsatzberichte/einsaetze.html', 'Einsätze', '''
<div class="chips"><a class="chip aktiv" href="#" aria-current="true">Alle</a><a class="chip" href="#">Nur meine</a><a class="chip" href="#">Offen (7)</a><a class="chip" href="#">Zur Prüfung (4)</a><a class="chip" href="#">Freigegeben</a><a class="chip" href="#">Ohne Hauptbericht (1)</a></div>
<div class="filter">
  <div class="feld breit"><label>Suche</label><input type="search" placeholder="Leitstellennummer, Stichwort, Ort"></div>
  <div class="feld"><label>Zeitraum</label><select><option>2026</option><option>letzte 30 Tage</option><option>frei wählen</option></select></div>
  <div class="feld"><label>Abteilung</label><select><option>Alle Abteilungen</option><option>Musterstadt</option><option>Weidenhain</option></select></div>
  <div class="feld"><label>Einsatzart</label><select><option>Alle</option><option>Brand</option><option>Technische Hilfe</option><option>Fehlalarm</option></select></div>
</div>
''' + tabelle(['Stichwort', 'Alarm', 'Einsatzort', 'Berichte (Haupt / Neben)', 'Status'], [
    e('21.10.2026 13:05', '2026-104711', 'B2 Brand Wohnung', 'Weidenhain, Hauptstraße 12', H('Weidenhain') + N('Musterstadt') + N('FüGr'), S_ENTWURF),
    e('20.10.2026 07:41', '2026-104388', 'TH1 Ölspur', 'Musterstadt, B 311', H('Musterstadt'), S_PRUEF),
    e('18.10.2026 22:13', '2026-103902', 'BMA Brandmeldeanlage', 'Musterstadt, Gewerbegebiet Nord', H('Musterstadt') + N('Birkenhain'), S_ENT + GESPERRT),
    e('15.10.2026 16:30', '2026-103455', 'TH2 VU eingeklemmte Person', 'Pappelhain, K 7370', H('Musterstadt') + N('Pappelhain'), S_ABR + GESPERRT),
    e('12.10.2026 03:22', '2026-102918', 'B1 Brand Container', 'Ahornfeld, Kirchweg', N('Ahornfeld') + N('Musterstadt') + '<span class="plakette warn">kein Hauptbericht</span>', S_PRUEF, 'warnung'),
    e('09.10.2026 18:00', 'BSW-2026-014', 'Brandsicherheitsdienst', 'Musterstadt, Festhalle', N('Sonderdienste'), S_ABR + GESPERRT),
    e('05.10.2026 11:47', '2026-101207', 'TH Tier in Notlage', 'Eschenbrunn, Flussufer', H('Eschenbrunn'), S_ABR + GESPERRT),
], 'stapel') + '''
<p class="meta" style="margin-top:10px">7 von 143 Einsätzen 2026 · Der Hauptbericht ist dunkelrot, Nebenberichte hellrot.</p>''',
    brot=[('Einsatzberichte', None), ('Einsätze', None)],
    aktionen='<a class="knopf" href="jahresstatistik.html">Auswertungen</a><a class="knopf primaer" href="einsatz.html">+ Einsatz anlegen</a>')

# ---------- Einsatz ----------
def berichtkarte(abt, haupt, verfasser, status, personal, fahrzeuge, zeit, hinweis='', ziel='bericht.html'):
    art = H('Hauptbericht') if haupt else N('Nebenbericht')
    h = f'<div class="meldung warnung" style="margin:10px 0 0"><span class="ic">!</span><span>{hinweis}</span></div>' if hinweis else ''
    akt = '<span></span>' if haupt else '<button type="button" class="knopf klein text" data-dialog="d-haupt">Zum Hauptbericht machen …</button>'
    return f'''<section class="karte{' haupt' if haupt else ''}">
  <div class="karte-kopf"><h3>{abt}</h3><div class="plaketten">{art}{status}</div></div>
  <dl class="daten"><dt>Verfasser</dt><dd>{verfasser}</dd><dt>Zeit</dt><dd>{zeit}</dd><dt>Personal</dt><dd>{personal}</dd><dt>Fahrzeuge</dt><dd>{fahrzeuge}</dd></dl>{h}
  <div class="formular-fuss" style="justify-content:space-between;align-items:center">{akt}<a class="knopf klein sekundaer" href="{ziel}">Bericht öffnen</a></div>
</section>'''

def zaehler(label, wert, hilfe=''):
    h = f'<div class="hilfe">{hilfe}</div>' if hilfe else ''
    return f'<div class="feld"><label>{label}</label><div class="zaehler"><button type="button" data-zaehler="-1" aria-label="weniger">−</button><input type="number" inputmode="numeric" min="0" value="{wert}"><button type="button" data-zaehler="1" aria-label="mehr">+</button></div>{h}</div>'

def wahl(name, optionen, typ='radio', klasse=''):
    t = ''
    for wert, text, klein, an in optionen:
        k = f'<small>{klein}</small>' if klein else ''
        t += f'<label><input type="{typ}" name="{name}" value="{wert}"{" checked" if an else ""}><span>{text}{k}</span></label>'
    return f'<div class="wahl {klasse}" id="wahl-{name}">{t}</div>'

TH = [('1', 'Menschenrettung'), ('2', 'Gefahrstoff (ohne Ölspur)'), ('3', 'Ölspur'), ('4', 'Tierrettung (ohne Insekten)'),
      ('5', 'Insekten'), ('6', 'Hochwasser / Unwetter'), ('7', 'Sturm'), ('8', 'sonstige Technische Hilfe')]

STATISTIK_EINSATZ = '''
<section class="karte" id="statistik">
  <div class="karte-kopf"><h2>Statistik</h2></div>
  <p class="meta" style="margin:0 0 8px">Gilt für den ganzen Einsatz und zählt einmal in der Jahresstatistik. Eintragen können die Verfasser der Berichte dieses Einsatzes, solange ein Bericht in Bearbeitung ist, und die Freigeber bis zum Abschluss der Jahresstatistik.</p>
  <div class="meldung info"><span class="ic">i</span><span>Vorbefüllt aus dem Stichwort <strong>B2</strong> und der Anschrift. Bitte prüfen und bei Bedarf ändern.</span></div>
  <div class="stat-block">
    <h3>Einsatzort</h3><p class="meta">Weidenhain liegt in der eigenen Gemeinde (Stadt Musterstadt).</p>
    ''' + wahl('ort', [('eigen', 'Eigene Gemeinde', '', True), ('ueberland', 'Überlandhilfe', 'außerhalb der Gemeinde', False)], klasse='eng') + '''
  </div>
  <div class="stat-block">
    <h3>Einsatzhauptart</h3><p class="meta">Genau eine Art.</p>
    ''' + wahl('art', [('brand', 'Brand / Explosion', '', True), ('th', 'Technische Hilfe', '', False), ('fehl', 'Fehlalarm', '', False),
                       ('sonst', 'Sonstiges', '', False)], klasse='eng') + '''
  </div>
  <div class="stat-block bedingt" data-wenn="art=brand">
    <h3>Brandgröße</h3><p class="meta">Nach den eingesetzten Löschmitteln.</p>
    ''' + wahl('bg', [('ka', 'Kleinbrand A', 'Kleinlöschgeräte, kein Strahlrohr', False), ('kb', 'Kleinbrand B', 'höchstens 1 C-Rohr', False),
                      ('mittel', 'Mittelbrand', '2–3 C-Rohre', True), ('gross', 'Großbrand', 'mehr als 3 C-Rohre', False)]) + '''
  </div>
  <div class="stat-block bedingt" data-wenn="art=th" hidden>
    <h3>Art der Technischen Hilfe</h3><p class="meta">Alles ankreuzen, was zutrifft. Es zählt die kleinste Nummer.</p>
    <div class="wahl" id="th-gruppe">''' + ''.join(f'<label><input type="checkbox" name="th" value="{n}"><span class="rang">{n}</span><span class="th-name">{t}</span></label>' for n, t in TH) + '''</div>
    <p class="ergebnis">Zählt als: <strong data-rang-ergebnis="th-gruppe">–</strong></p>
  </div>
  <div class="stat-block bedingt" data-wenn="art=fehl" hidden>
    <h3>Fehlalarm</h3>
    ''' + wahl('fa', [('gut', 'in gutem Glauben', '', True), ('boes', 'böswillig', '', False), ('bma', 'Brandmeldeanlage', '', False)], klasse='eng') + '''
  </div>
  <div class="stat-block">
    <h3>Kennzeichen</h3>
    <div class="wahl">
      <label><input type="checkbox" name="kz"><span>Fahrzeugbrand</span></label>
      <label><input type="checkbox" name="kz"><span>Verkehrsunfall</span></label>
      <label><input type="checkbox" name="kz"><span>Katastrophen-Voralarm</span></label>
      <label><input type="checkbox" name="kz"><span>Katastrophen-Einsatz</span></label>
    </div>
  </div>
  <div class="stat-block">
    <h3>Personen und Tiere</h3>
    <div class="felder">
      ''' + zaehler('Gerettete Personen', 1) + zaehler('davon mit Rauchgasvergiftung', 1, 'höchstens so viele wie gerettet') + zaehler('Tote Personen', 0) + zaehler('Gerettete Tiere', 0) + '''
    </div>
  </div>
  <div class="stat-block">
    <h3>Eigene Einsatzkräfte</h3>
    <dl class="daten"><dt>verletzt</dt><dd>0</dd><dt>tödlich verunglückt</dt><dd>0</dd></dl>
    <p class="meta" style="margin:6px 0 0">Aus dem Personal aller Berichte dieses Einsatzes. Eintragen bei der Person im Abschnitt Personal.</p>
  </div>
  <div class="stat-block">
    <h3>Aus allen Berichten des Einsatzes</h3>
    <dl class="daten"><dt>Einsatzkräfte</dt><dd>29 (ohne Doppelungen)</dd><dt>Fahrzeuge</dt><dd>5</dd><dt>unter Atemschutz</dt><dd>6</dd><dt>Dauer</dt><dd>3 h 15 min</dd></dl>
  </div>
  <div class="formular-fuss"><button type="button" class="knopf text">Statistik entfernen</button><button type="button" class="knopf primaer">Statistik speichern</button></div>
</section>'''


seite('einsatzberichte/einsatz.html', 'B2 Brand Wohnung', '''
<section class="karte">
  <div class="raster vier">
    <div><span class="label">Leitstellennummer</span>2026-104711</div>
    <div><span class="label">Alarm</span>21.10.2026, 13:05</div>
    <div><span class="label">Einsatzort</span>Weidenhain, Hauptstraße 12</div>
    <div><span class="label">Meldebild</span>Rauchentwicklung aus Wohnung, Person vermisst</div>
  </div>
  <p class="meta" style="margin:10px 0 0">Angelegt über API (Alarmfax-Parser Leitstelle) am 21.10.2026 13:06 · Berichtsentwürfe automatisch für die alarmierten Abteilungen erstellt.</p>
</section>
<div class="raster drei" style="margin-bottom:16px">
''' + berichtkarte('Abteilung Weidenhain', True, 'Sabine Hagel', S_ENTWURF, '8 Personen', 'MLF 10/6 · Bereitschaft (2)', '13:05 – 16:20', '', 'bericht-haupt.html') +
berichtkarte('Abteilung Musterstadt', False, 'Tobias Rief', S_ENTWURF, '17 Personen', 'LF 20/16 · DLA(K) 23-12 · ELW 1', '13:07 – 15:50', 'Markus Vogt steht auch im Bericht der Führungsgruppe.') +
berichtkarte('Führungsgruppe Musterstadt', False, 'Markus Vogt', S_ENTWURF, '4 Personen', 'ELW 1 (mit Musterstadt)', '13:10 – 16:20', 'Markus Vogt steht auch im Bericht Musterstadt (ELW 1, 13:07–15:50). Bitte nur einem Bericht zuordnen.') + '''
</div>''' + STATISTIK_EINSATZ + '''
<section class="karte">
  <h2>Aufbewahrung</h2>
  <label class="schalter"><input type="checkbox"> 30 Jahre aufbewahren (Sonderfall)</label>
  <p class="meta" style="margin:8px 0 0">Z. B. Großbrand ohne Verletzte: Der Einsatz wird wie ein Einsatz mit Besonderheiten aufbewahrt und in der Aussonderung mit diesem Grund angezeigt.</p>
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Bericht für weitere Abteilung</h2></div>
  <div class="filter" style="margin:0"><div class="feld"><label>Abteilung</label><select><option>Birkenhain</option><option>Pappelhain</option><option>Ahornfeld</option><option>Eschenbrunn</option><option>Sonderdienste</option></select></div><a class="knopf sekundaer" href="bericht.html">+ Bericht anlegen</a></div>
</section>
<section class="karte">
  <h2>Historie des Einsatzes</h2>
  <ul class="historie">
    <li><div class="wer">Tobias Rief · 21.10.2026 19:12</div><div class="aenderung"><span>Bericht Musterstadt</span><span>Personal geändert (17 Personen)</span></div></li>
    <li><div class="wer">leitstelle-api · 21.10.2026 13:06 · angelegt</div><div class="aenderung"><span>Berichte</span><span class="neu">Weidenhain (Haupt), Musterstadt, Führungsgruppe</span></div></li>
  </ul>
</section>''', nav='einsatzberichte/einsaetze.html', brot=[('Einsatzberichte', None), ('Einsätze', 'einsatzberichte/einsaetze.html'), ('2026-104711', None)],
    aktionen='<a class="knopf" href="#">Einsatz drucken</a>',
    dialoge=dialog('d-haupt', 'Hauptbericht wechseln?', '''
  <p>Der Bericht der <strong>Abteilung Musterstadt</strong> wird Hauptbericht. Der Bericht der <strong>Abteilung Weidenhain</strong> wird Nebenbericht.</p>
  <div class="meldung info"><span class="ic">i</span><span>Die Statistik gehört zum Einsatz und bleibt unverändert. Sabine Hagel bekommt eine Benachrichtigung.</span></div>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Musterstadt zum Hauptbericht machen</button>'))

# ---------- Berichtseditor ----------
AS_ = '<span class="plakette ok">AS</span>'

def person(fkt, name, betrag, zustand='', extra=''):
    kl = f' class="{zustand}"' if zustand else ''
    pl = f'<span class="plaketten">{extra}</span>' if extra else ''
    return f'<li{kl}><button type="button" data-dialog="d-person"><span class="fkt">{fkt}</span><span class="wer">{name}{pl}</span><span class="betrag">{betrag}</span></button></li>'

def fahrzeug(name, funk, zeit, staerke, plaetze, personen, bereitschaft=False):
    zus = '' if bereitschaft else '<button type="button" class="knopf klein text">Besatzung wie letzter Einsatz</button>'
    return f'''<div class="fahrzeug{' bereitschaft' if bereitschaft else ''}">
    <div class="fahrzeug-kopf"><div><strong>{name}</strong><div class="meta">{funk} · {zeit}</div></div><span class="staerke">{staerke}<small>{plaetze}</small></span></div>
    <ul class="besatzung">{''.join(personen)}</ul>
    <div class="hinzu"><label class="unsichtbar">Person zu {name} hinzufügen</label><input type="search" placeholder="+ Person hinzufügen">{zus}</div>
  </div>'''

FAHRZEUGE_MUSTERSTADT = '<div class="fahrzeuge">' + fahrzeug('LF 20/16', 'Florian Musterstadt 1/44', '13:07–15:50', '1/8', '9 von 9 Plätzen', [
    person('GF', 'Tobias Rief', '3 h · 45,00 €'),
    person('MA', 'Michael Bauer', '3 h · 45,00 €'),
    person('ME', 'Jana Fischer', '3 h · 45,00 €'),
    person('AT', 'Jonas Keller', '3 h · 45,00 €', 'warnzeile', AS_ + '<span class="plakette gelb">Untersuchung abgelaufen</span>'),
    person('AT', 'Lukas Hahn', '3 h · 45,00 €', extra=AS_),
    person('WT', 'Nina Graf', '3 h · 45,00 €', extra=AS_),
    person('WT', 'Felix Ott', '3 h · 45,00 €', extra=AS_),
    person('ST', 'Paul Ziegler', '3 h · 45,00 €'),
    person('ST', 'Max Unger', '0,00 €', extra='<span class="plakette grau">Arbeitszeit</span>'),
]) + fahrzeug('DLA(K) 23-12', 'Florian Musterstadt 1/33', '13:09–15:30', '0/2', '2 von 3 Plätzen', [
    person('MA', 'Ralf Kunz', '3 h · 45,00 €'),
    person('KO', 'Daniel Moser', '3 h · 45,00 €'),
]) + fahrzeug('ELW 1', 'Florian Musterstadt 1/11', '13:08–15:50', '1/2', '3 von 4 Plätzen', [
    person('EL', 'Markus Vogt', 'offen', 'problem', '<span class="plakette warn">doppelt: auch FüGr</span>'),
    person('FA', 'Lena Brenner', '3 h · 45,00 €'),
    person('FU', 'Kai Weber', '3 h · 45,00 €'),
]) + fahrzeug('Bereitschaft', 'Feuerwehrhaus Musterstadt', 'pauschal 1 h', '3', 'Personen', [
    person('', 'Sandra Roth', '1 h · 15,00 €'),
    person('', 'Martin Lang', '1 h · 15,00 €'),
    person('', 'Erik Sauter', '1 h · 15,00 €'),
], bereitschaft=True) + '</div>'

FAHRZEUGE_WEIDENHAIN = '<div class="fahrzeuge">' + fahrzeug('MLF 10/6', 'Florian Musterstadt 3/42', '13:05–16:20', '1/5', '6 von 6 Plätzen', [
    person('EL', 'Sabine Hagel', '4 h · 60,00 €', extra='<span class="plakette grau">+ Pauschale EL</span>'),
    person('MA', 'Uwe Brandt', '4 h · 60,00 €'),
    person('AT', 'Lena Brenner', '2 h · 30,00 €', extra=AS_ + '<span class="plakette grau">bis 14:50</span>'),
    person('AT', 'Timo Kraus', '4 h · 60,00 €', extra=AS_),
    person('WT', 'Jan Ebert', '4 h · 60,00 €'),
    person('WT', 'Mia Scholz', '4 h · 60,00 €'),
]) + fahrzeug('Bereitschaft', 'Gerätehaus Weidenhain', 'pauschal 1 h', '2', 'Personen', [
    person('', 'Karl Fink', '1 h · 15,00 €'),
    person('', 'Eva Roth', '1 h · 15,00 €'),
], bereitschaft=True) + '</div>'

SUCHE = '''<div class="filter" style="margin-bottom:6px">
  <div class="feld breit"><label>Person suchen und zuordnen</label><input type="search" value="Wei" placeholder="Name oder Personalnummer"></div>
  <a class="knopf" href="#">+ Fahrzeug</a><a class="knopf" href="#">+ Bereitschaft</a><a class="knopf" href="#">+ Gast</a>
</div>
<ul class="vorschlaege" aria-label="Vorschläge">
  <li><span class="wer"><strong>Weiß, Anna</strong><span class="unter-text">Musterstadt · AGT · Maschinistin</span></span><span class="ziele"><span class="meta">zu:</span><button type="button" class="knopf klein">LF 20/16</button><button type="button" class="knopf klein">DLA(K)</button><button type="button" class="knopf klein">ELW 1</button><button type="button" class="knopf klein">Bereitschaft</button></span></li>
  <li><span class="wer"><strong>Weidner, Paul</strong><span class="unter-text">Musterstadt · steht bereits im Bericht Weidenhain (13:05–16:20)</span></span><span class="plakette warn">nicht wählbar</span></li>
</ul>
<p class="meta" style="margin:6px 0 16px">Tippen auf eine Person öffnet Funktion, Zeiten, Atemschutz und Entschädigung. Gäste aus Nachbarwehren werden ohne Entschädigung erfasst.</p>
'''

def schritt_nav(zurueck=None, weiter=None):
    z = f'<button type="button" class="knopf" data-reiter="{zurueck[0]}" data-nach-oben>‹ {zurueck[1]}</button>' if zurueck else '<span></span>'
    w = f'<button type="button" class="knopf sekundaer" data-reiter="{weiter[0]}" data-nach-oben>Weiter: {weiter[1]} ›</button>' if weiter else ''
    return f'<div class="formular-fuss" style="justify-content:space-between;margin-top:8px">{z}{w}</div>'

TITEL = {'s1': 'Zeiten &amp; Ort', 's2': 'Personal &amp; Fahrzeuge', 's3': 'Lage &amp; Verlauf', 's5': 'Beteiligte &amp; Sonstiges', 's6': 'Prüfen'}

def schritte(aktiv, zustand):
    """zustand: dict schritt -> ('fertig'|'fehler'|'', Kurztext)"""
    teile = []
    for i, k in enumerate(TITEL, 1):
        z, txt = zustand.get(k, ('', ''))
        kl = ' '.join(x for x in [z, 'aktiv' if k == aktiv else ''] if x)
        nr = '✓' if z == 'fertig' else ('!' if z == 'fehler' else str(i))
        cur = ' aria-current="step"' if k == aktiv else ''
        zt = f'<span class="zustand">{txt}</span>' if txt else ''
        teile.append(f'<li><button type="button" class="{kl}" data-reiter="{k}"{cur}><span class="nr">{nr}</span><span class="text">{TITEL[k]}{zt}</span></button></li>')
    return '<ol class="schritte" aria-label="Abschnitte des Berichts">' + ''.join(teile) + '</ol>' + f'<p class="schritt-titel" aria-hidden="true">{TITEL[aktiv]}</p>'

PERSON_DIALOG = dialog('d-person', 'Jonas Keller', '''
  <div class="meldung warnung"><span class="ic">!</span><span>Eignungsuntersuchung Atemschutz seit 02.10.2026 abgelaufen.</span></div>
  <div class="felder zwei">
    <div class="feld"><label>Fahrzeug</label><select><option>LF 20/16</option><option>DLA(K) 23-12</option><option>ELW 1</option><option>Bereitschaft Feuerwehrhaus Musterstadt</option></select></div>
    <div class="feld"><label>Funktion</label><select><option>Angriffstrupp</option><option>Wassertrupp</option><option>Schlauchtrupp</option></select></div>
    <div class="feld"><label>von</label><input type="time" value="13:07"></div>
    <div class="feld"><label>bis</label><input type="time" value="15:50"></div>
  </div>
  <div class="schalter-liste">
    <label class="schalter"><input type="checkbox" checked> unter Atemschutz</label>
  </div>
  <div class="feld" style="max-width:220px"><label>Dauer unter Atemschutz (Minuten)</label><input type="number" inputmode="numeric" value="28"></div>
  <div class="schalter-liste">
    <label class="schalter"><input type="checkbox"> Verdienstausfall</label>
    <label class="schalter"><input type="checkbox"> Einsatz während Arbeitszeit beim Dienstherrn</label>
  </div>
  <fieldset style="margin-top:8px"><legend>Selbst zu Schaden gekommen</legend><div class="wahl eng">
    <label><input type="radio" name="schaden" checked><span>nein</span></label><label><input type="radio" name="schaden"><span>verletzt</span></label><label><input type="radio" name="schaden"><span>tödlich verunglückt</span></label>
  </div></fieldset>
  <p class="meta" style="margin:0">Entschädigung: 3 angefangene Stunden × 15,00 € (Einsatz, gültig ab 01.07.2025) = <strong>45,00 €</strong></p>''',
    '<button class="knopf text" value="entfernen" style="margin-right:auto">Aus Bericht entfernen</button>' + ABBRECHEN + '<button class="knopf primaer" value="ok">Übernehmen</button>')


def versionen_dialog(eintraege):
    """Versionen des Berichts: gespeichert wird automatisch, jede Version lässt sich wiederherstellen."""
    zeilen = []
    for i, (wann, wer, was) in enumerate(eintraege):
        aktion = '<span class="plakette ok">aktuell</span>' if i == 0 else '<button class="knopf klein sekundaer" value="ok">Wiederherstellen</button>'
        zeilen.append(('haupt' if i == 0 else '', [wann, wer, was, aktion]))
    return dialog('d-versionen', 'Versionen des Berichts', '''
  <p class="meta">Jede automatische Speicherung legt eine Version an. Was sich geändert hat, steht in der Historie des Berichts.</p>
  ''' + tabelle(['Zeitpunkt', 'Benutzer', 'Änderung', ''], zeilen, 'stapel') + '''
  <p class="meta" style="margin:16px 0 0">Wiederherstellen legt eine neue Version mit dem alten Stand an. Die aktuelle Version bleibt erhalten und lässt sich ebenso zurückholen.</p>''',
        '<button class="knopf" value="abbrechen">Schließen</button>')


def berichtseite(pfad, titel, *, haupt, aktiv, zustand, kopfplaketten, personal, pruefung, status, fertig_frei, brot_abt, versionen):
    s2_meldungen = '' if haupt else '''
<div class="meldung fehler" role="alert"><span class="ic">✕</span><span><span class="art">Fehler:</span> <strong>Markus Vogt</strong> steht auch im Bericht der Führungsgruppe (13:10–16:20). Eine Person darf im selben Einsatz nicht gleichzeitig in zwei Berichten stehen.</span><button type="button" class="knopf klein aktion">Hier entfernen</button></div>
<div class="meldung warnung"><span class="ic">!</span><span><span class="art">Warnung:</span> <strong>Jonas Keller</strong> ist unter Atemschutz eingetragen, die Eignungsuntersuchung ist seit 02.10.2026 abgelaufen.</span><button type="button" class="knopf klein aktion" data-dialog="d-ignorieren">Begründen …</button></div>'''
    summe = '<strong style="color:var(--dienst)">8 Personen · 405,00 €</strong>' if haupt else '<strong style="color:var(--dienst)">17 Personen · 585,00 €</strong>'
    summe_text = '6 × Einsatz · 2 × Bereitschaft · 1 × Pauschale Einsatzleiter (10,00 €)' if haupt else '12 × 3 h Einsatz · 3 × 1 h Bereitschaft · 1 × Arbeitszeit (keine Entschädigung) · 1 × offen wegen Doppelung'
    fertig = ('<button type="button" class="knopf primaer" data-dialog="d-fertig">Fertig melden</button>' if fertig_frei
              else '<button type="button" class="knopf primaer" data-reiter="s6">Fertig melden</button>')
    inhalt = '''
<div class="plaketten" style="margin:-8px 0 14px">''' + kopfplaketten + '''</div>
<div data-reitergruppe>
''' + schritte(aktiv, zustand) + f'''

<div class="reiter-inhalt{' aktiv' if aktiv == 's1' else ''}" id="s1">
<div class="raster zwei">
<section class="karte">
  <h2>Zeiten</h2>
  <div class="felder zwei">
    <div class="feld"><label class="pflicht">Alarmierung (von)</label><input type="datetime-local" value="2026-10-21T13:07"></div>
    <div class="feld"><label>Ausrücken</label><input type="time" value="13:12"></div>
    <div class="feld"><label>Eintreffen</label><input type="time" value="13:19"></div>
    <div class="feld"><label>Einsatzende</label><input type="time" value="15:20"></div>
    <div class="feld"><label class="pflicht">Einsatzbereit (bis)</label><input type="datetime-local" value="2026-10-21T15:50"><div class="hilfe">Grundlage für Personalzeiten und Entschädigung: 2 h 43 min → 3 angefangene Stunden.</div></div>
  </div>
</section>
<section class="karte">
  <h2>Einsatzort und Alarmierung</h2>
  <div class="felder zwei">
    <div class="feld"><label>Straße</label><input type="text" value="Hauptstraße"></div>
    <div class="feld"><label>Hausnummer</label><input type="text" value="12"></div>
    <div class="feld"><label>Ortsteil</label><select><option>Weidenhain</option></select></div>
    <div class="feld"><label>Objekt</label><input type="text" value="Mehrfamilienhaus"></div>
    <div class="feld"><label class="pflicht">Stichwort</label><select><option>B2 Brand Wohnung</option></select><div class="hilfe">Statistik: Brand</div></div>
    <div class="feld"><label>Alarmiert durch</label><select><option>Leitstelle (DME)</option></select></div>
  </div>
</section>
</div>
''' + schritt_nav(None, ('s2', 'Personal &amp; Fahrzeuge')) + f'''
</div>

<div class="reiter-inhalt{' aktiv' if aktiv == 's2' else ''}" id="s2">
''' + s2_meldungen + SUCHE + personal + f'''
<section class="karte" style="margin-top:16px">
  <div class="karte-kopf"><h3>Summe Entschädigung</h3>{summe}</div>
  <p class="meta" style="margin:0">{summe_text}. Ausgezahlt wird nach Freigabe.</p>
</section>
''' + schritt_nav(('s1', 'Zeiten &amp; Ort'), ('s3', 'Lage &amp; Verlauf')) + f'''
</div>

<div class="reiter-inhalt{' aktiv' if aktiv == 's3' else ''}" id="s3">
<section class="karte">
  <div class="feld"><label class="pflicht">Lage bei Eintreffen</label><textarea>Starke Rauchentwicklung aus Fenster 1. OG, Bewohnerin auf dem Balkon.</textarea></div>
  <div class="feld"><label class="pflicht">Maßnahmen / Verlauf</label><textarea>Menschenrettung über DLK, Innenangriff mit 1 C-Rohr unter PA, Belüftung. Übergabe der Person an den Rettungsdienst.</textarea>
    <div class="plaketten" style="margin-top:6px"><span class="meta">Textbaustein einfügen:</span><button type="button" class="chip">Belüftung</button><button type="button" class="chip">Übergabe an Polizei</button><button type="button" class="chip">Brandwache</button></div></div>
  <div class="felder zwei">
    <div class="feld"><label>Ursache (soweit bekannt)</label><input type="text" value="vermutlich Küchenbrand"></div>
    <div class="feld"><label>Einsatzleiter</label><select><option>Sabine Hagel</option></select></div>
    <div class="feld"><label>Wetterlage</label><select><option>kein Einfluss</option><option>Regen</option><option>Schnee</option><option>Glätte</option><option>Sturm</option><option>Hitze</option><option>Gewitter</option><option>Nebel</option></select></div>
  </div>
</section>
''' + schritt_nav(('s2', 'Personal &amp; Fahrzeuge'), ('s5', 'Beteiligte &amp; Sonstiges')) + f'''
</div>

<div class="reiter-inhalt{' aktiv' if aktiv == 's5' else ''}" id="s5">
<div class="raster zwei">
<section class="karte">
  <div class="karte-kopf"><h2>Beteiligte</h2><a class="knopf klein sekundaer" href="#">+ Beteiligter</a></div>
  ''' + tabelle(['Name', 'Rolle', 'Anschrift', 'Telefon'], [
      ['Erika Muster', 'Geschädigte', 'Hauptstraße 12, 12345 Musterstadt-Weidenhain', '01234 9999'],
      ['Hausverwaltung Sonnig GmbH', 'Eigentümer', 'Marktplatz 3, 12340 Kreisstadt', '0123 12345'],
  ], 'stapel') + '''
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Sonstige Kräfte</h2><a class="knopf klein sekundaer" href="#">+ Organisation</a></div>
  ''' + tabelle(['Organisation', '>Kräfte', '>Fahrzeuge'], [
      ['Rettungsdienst (DRK)', '4', '2'], ['Notarzt', '1', '1'], ['Polizei', '2', '1'], ['Energieversorger (EnBW ODR)', '1', '1'],
  ]) + '''
</section>
<section class="karte">
  <h2>Geräte und Material</h2>
  <label>Verwendete Geräte und Verbrauchsmaterial</label>
  <textarea placeholder="Freitext, solange das Modul Geräte nicht aktiv ist">1 Lüfter, Wärmebildkamera, 2 × Brandfluchthaube</textarea>
</section>
<section class="karte">
  <h2>Kosten und Anhänge</h2>
  <label class="schalter"><input type="checkbox"> kostenpflichtiger Einsatz</label>
  <div class="feld" style="margin-top:10px"><span class="label">Anhänge</span><div class="plaketten"><span class="plakette">Alarmfax.pdf</span><span class="plakette">Foto_1.jpg</span><button type="button" class="knopf klein">+ Datei oder Foto</button></div></div>
</section>
</div>
''' + schritt_nav(('s3', 'Lage &amp; Verlauf'), ('s6', 'Prüfen')) + f'''
</div>

<div class="reiter-inhalt{' aktiv' if aktiv == 's6' else ''}" id="s6">
<section class="karte">
  <h2>Prüfung vor dem Fertigmelden</h2>
''' + pruefung + '''
</section>
''' + schritt_nav(('s5', 'Beteiligte &amp; Sonstiges'), None) + f'''
</div>
</div>
<div class="aktionsleiste"><span class="status">{status}</span><button type="button" class="knopf text" data-dialog="d-versionen">Versionen</button>{fertig}</div>
'''
    dialoge = versionen + PERSON_DIALOG + dialog('d-ignorieren', 'Warnung begründen', '''
  <p><strong>Jonas Keller</strong> ist unter Atemschutz eingetragen, die Eignungsuntersuchung ist seit 02.10.2026 abgelaufen.</p>
  <div class="feld"><label class="pflicht">Begründung</label><textarea style="min-height:80px" placeholder="z. B. Untersuchung erfolgt, Bescheinigung kommt nach"></textarea><div class="hilfe">Der Kommandant sieht die Begründung bei der Prüfung.</div></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Begründung speichern</button>') + dialog('d-fertig', 'Bericht fertig melden?', '''
  <p>Der Bericht geht zur Prüfung an <strong>Markus Vogt</strong> (Kommandant). Danach können Sie ihn nur noch ändern, wenn er an Sie zurückgegeben wird.</p>
  <dl class="daten"><dt>Personal</dt><dd>8 Personen · 405,00 €</dd><dt>Statistik</dt><dd>Brand · Mittelbrand · eigene Gemeinde · 1 gerettete Person</dd></dl>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Fertig melden</button>')
    seite(pfad, titel, inhalt, nav='einsatzberichte/einsaetze.html',
          brot=[('Einsatzberichte', None), ('Einsätze', 'einsatzberichte/einsaetze.html'), ('2026-104711', 'einsatzberichte/einsatz.html'), (brot_abt, None)],
          dialoge=dialoge)


berichtseite('einsatzberichte/bericht.html', 'Bericht Abteilung Musterstadt', haupt=False, aktiv='s2',
    zustand={'s1': ('fertig', 'vollständig'), 's2': ('fehler', '1 Fehler · 1 Warnung'), 's3': ('fertig', 'vollständig'), 's5': ('fertig', 'optional')},
    kopfplaketten=N('Nebenbericht') + S_ENTWURF + '<span class="plakette">B2 Brand Wohnung · 2026-104711</span><span class="plakette">Verfasser: Tobias Rief</span>',
    personal=FAHRZEUGE_MUSTERSTADT,
    pruefung='''  <div class="meldung fehler"><span class="ic">✕</span><span><span class="art">Fehler · Personal:</span> Markus Vogt doppelt im Einsatz (Führungsgruppe).</span><button type="button" class="knopf klein aktion" data-reiter="s2">Zum Abschnitt</button></div>
  <div class="meldung warnung"><span class="ic">!</span><span><span class="art">Warnung · Personal:</span> Jonas Keller ohne gültige Eignungsuntersuchung unter Atemschutz.</span><button type="button" class="knopf klein aktion" data-dialog="d-ignorieren">Begründen …</button></div>
  <div class="meldung ok"><span class="ic">✓</span><span>Zeiten plausibel · Lage und Verlauf ausgefüllt · alle Personen einem Fahrzeug oder der Bereitschaft zugeordnet</span></div>
  <p class="meta" style="margin:0">Fertig melden geht, sobald kein Fehler mehr offen ist. Warnungen brauchen eine Begründung.</p>''',
    status='Automatisch gespeichert 13:42 · <strong>1 Fehler</strong>, 1 Warnung', fertig_frei=False, brot_abt='Musterstadt',
    versionen=versionen_dialog([
        ('21.10.2026 19:12', 'Tobias Rief', 'Personal: Markus Vogt hinzugefügt'),
        ('21.10.2026 18:55', 'Tobias Rief', 'Lage und Verlauf geändert'),
        ('21.10.2026 18:40', 'Jonas Keller', 'Personal: 3 Personen hinzugefügt'),
        ('21.10.2026 17:02', 'Tobias Rief', 'Bericht angelegt'),
    ]))

berichtseite('einsatzberichte/bericht-haupt.html', 'Bericht Abteilung Weidenhain', haupt=True, aktiv='s6',
    zustand={'s1': ('fertig', 'vollständig'), 's2': ('fertig', '8 Personen'), 's3': ('fertig', 'vollständig'), 's5': ('fertig', 'optional')},
    kopfplaketten=H('Hauptbericht') + S_ENTWURF + '<span class="plakette">B2 Brand Wohnung · 2026-104711</span><span class="plakette">Verfasser: Sabine Hagel</span>',
    personal=FAHRZEUGE_WEIDENHAIN,
    pruefung='''  <div class="meldung ok"><span class="ic">✓</span><span>Keine Fehler und keine Warnungen. Zeiten plausibel · Personal vollständig zugeordnet · Statistik des Einsatzes vollständig.</span></div>
  <p class="meta" style="margin:0">Fehlt die Statistik des Einsatzes, meldet der Hauptbericht einen Fehler mit „Zum Einsatz“; sie steht auf der Seite des Einsatzes.</p>''',
    status='Automatisch gespeichert 14:05 · keine Fehler', fertig_frei=True, brot_abt='Weidenhain',
    versionen=versionen_dialog([
        ('22.10.2026 14:05', 'Sabine Hagel', 'Personal geändert (8 Personen)'),
        ('21.10.2026 20:30', 'Sabine Hagel', 'Lage und Verlauf geändert'),
        ('21.10.2026 17:10', 'Sabine Hagel', 'Bericht angelegt'),
    ]))

# ---------- Prüfung ----------
seite('einsatzberichte/pruefung.html', 'Zur Prüfung', '''
<div class="raster seite">
<section>
''' + tabelle(['Einsatz', 'Abteilung', 'Eingereicht', 'Verfasser', '>Personal', '>Betrag', 'Hinweise'], [
    ('gewaehlt', ['<a href="#detail">B2 Brand Wohnung</a><span class="unter-text">2026-104711</span>', 'Musterstadt ' + N('Neben'), '21.10. 19:12', 'Tobias Rief', '17', '585,00 €', '<span class="plakette gelb">1 Warnung begründet</span>']),
    ['<a href="#detail">TH1 Ölspur</a><span class="unter-text">2026-104388</span>', 'Musterstadt ' + H('Haupt'), '20.10. 21:40', 'Ralf Kunz', '6', '180,00 €', '<span class="plakette ok">keine</span>'],
    ('warnung', ['<a href="#detail">B1 Brand Container</a><span class="unter-text">2026-102918</span>', 'Ahornfeld ' + N('Neben'), '13.10. 08:05', 'Andreas Schmid', '8', '120,00 €', '<span class="plakette warn">Fehler: kein Hauptbericht</span>']),
    ('warnung', ['<a href="#detail">B1 Brand Container</a><span class="unter-text">2026-102918</span>', 'Musterstadt ' + N('Neben'), '12.10. 22:30', 'Tobias Rief', '9', '135,00 €', '<span class="plakette warn">Fehler: kein Hauptbericht</span>']),
], 'stapel') + '''
<p class="meta" style="margin-top:8px">Berichte mit Fehler lassen sich erst freigeben, wenn der Fehler behoben ist. Beim Container-Brand fehlt ein Hauptbericht: einen der beiden Berichte zum Hauptbericht machen.</p>
<h3 style="margin-top:20px">Beispiel: leere Liste</h3>
''' + leer('Keine Berichte zur Prüfung', 'Hier erscheinen Berichte, sobald ein Verfasser sie fertig meldet. Sie bekommen dann eine Benachrichtigung.') + '''
</section>
<section class="karte" id="detail">
  <div class="karte-kopf"><h2>Musterstadt · B2 Brand Wohnung</h2>''' + S_PRUEF + '''</div>
  <dl class="daten"><dt>Zeit</dt><dd>21.10.2026, 13:07 – 15:50</dd><dt>Verfasser</dt><dd>Tobias Rief</dd><dt>Personal</dt><dd>17 (14 Einsatz, 3 Bereitschaft)</dd><dt>Entschädigung</dt><dd><strong>585,00 €</strong></dd></dl>
  <div class="meldung warnung" style="margin-top:12px"><span class="ic">!</span><span><span class="art">Warnung begründet von T. Rief:</span> „Keller hat Untersuchung am 15.10. gemacht, Bescheinigung kommt nach.“</span></div>
  <p><a href="bericht.html">Bericht vollständig lesen und bearbeiten ›</a></p>
  <ol class="stufen"><li class="aktiv"><span class="nr">1</span><span>Freigabe zur Entschädigungsauszahlung</span></li><li><span class="nr">2</span><span>Freigabe zur Abrechnung</span></li></ol>
  <div style="display:grid;gap:8px">
    <button type="button" class="knopf primaer gross" data-dialog="d-freigabe">Freigeben zur Entschädigungsauszahlung</button>
    <p class="meta" style="margin:0">Stufe 1 von 2. Danach ist der Bericht für alle anderen gesperrt. Die Freigabe zur Abrechnung folgt nach der Auszahlung.</p>
    <button type="button" class="knopf" data-dialog="d-zurueck">Zurück an Verfasser …</button>
  </div>
  <hr class="trenner">
  <h3>Beispiel: Stufe 1 erledigt</h3>
  <div class="meldung info"><span class="ic">''' + sym('schloss') + '''</span><span>BMA Brandmeldeanlage · Musterstadt – freigegeben zur Entschädigungsauszahlung und gesperrt von <strong>Markus Vogt</strong> am 19.10.2026 08:14.</span></div>
  <div class="knopfreihe">
    <button type="button" class="knopf sekundaer" data-dialog="d-abrechnung">Freigeben zur Abrechnung …</button>
    <button type="button" class="knopf" data-dialog="d-sperre">Sperre aufheben …</button>
  </div>
  <p class="meta" style="margin:8px 0 0">Ist die Stufe „Entschädigungsauszahlung“ in den Einstellungen abgeschaltet, gibt es nur „Freigeben zur Abrechnung“. Die Auszahlung ist darin enthalten.</p>
</section>
</div>
<section class="karte" id="auszahlung" style="margin-top:24px">
  <div class="karte-kopf"><h2>Auszahlungslauf 10/2026</h2><span class="plakette warn">3 Fehler · 1 Hinweis</span></div>
  <dl class="daten"><dt>Zeitraum</dt><dd>01.10.2026 – 31.10.2026</dd><dt>Berichte</dt><dd>12 freigegeben zur Entschädigungsauszahlung</dd><dt>Summe</dt><dd><strong>2.340,00 €</strong> für 64 Personen</dd></dl>
  <h3 style="margin-top:24px">Probleme vor der Auszahlung</h3>
  ''' + tabelle(['Prüfung', 'Ergebnis', 'Betroffen', ''], [
      ('erledigt', ['Bericht ohne Personal', '<span class="plakette ok">keine</span>', '–', '']),
      ('warnung', ['Person ohne Betrag', '<span class="plakette warn">Fehler: 1 Person</span>', 'Lena Bauer · TH1 Ölspur, Musterstadt (Funktion ohne Satz)', '<a class="knopf klein" href="bericht.html">Zum Bericht</a>']),
      ('warnung', ['Keine oder ungültige Zeit', '<span class="plakette warn">Fehler: 1 Person</span>', 'Peter Huber · BMA Brandmeldeanlage, Musterstadt (Ende vor Beginn)', '<a class="knopf klein" href="bericht.html">Zum Bericht</a>']),
      ('erledigt', ['Person ohne Fahrzeug oder Bereitschaft', '<span class="plakette ok">keine</span>', '–', '']),
      ('warnung', ['Doppelungen', '<span class="plakette warn">Fehler: 1 Person</span>', 'Markus Vogt · B2 Brand Wohnung, Musterstadt und Führungsgruppe', '<a class="knopf klein" href="bericht.html">Zum Bericht</a>']),
      ['Nicht freigegeben', '<span class="plakette gelb">Hinweis: 4 Berichte</span>', 'noch zur Prüfung, sie kommen in den nächsten Lauf', '<a class="knopf klein" href="#inhalt">Zur Liste</a>'],
  ], 'stapel') + '''
  <div class="formular-fuss" style="margin-top:16px;align-items:center">
    <span class="meta" style="margin-right:auto">Exportieren geht, sobald kein Fehler mehr offen ist. Nicht freigegebene Berichte bleiben draußen.</span>
    <span class="knopf primaer" aria-disabled="true">Auszahlung exportieren</span>
  </div>
</section>''', brot=[('Einsatzberichte', None), ('Zur Prüfung', None)],
    dialoge=dialog('d-freigabe', 'Bericht freigeben?', '''
  <p>Freigabe zur <strong>Entschädigungsauszahlung</strong> für den Bericht <strong>Musterstadt · B2 Brand Wohnung</strong>.</p>
  <dl class="daten"><dt>Personen</dt><dd>17</dd><dt>Betrag</dt><dd><strong>585,00 €</strong></dd><dt>Warnungen</dt><dd>1, begründet</dd></dl>
  <p class="meta" style="margin-top:12px">Der Bericht wird gesperrt und kommt in den nächsten Auszahlungslauf. Tobias Rief bekommt eine Benachrichtigung. Rückgängig nur über „Sperre aufheben“.</p>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Jetzt freigeben</button>') +
    dialog('d-abrechnung', 'Zur Abrechnung freigeben?', '''
  <p>Freigabe zur <strong>Abrechnung</strong> für den Bericht <strong>BMA Brandmeldeanlage · Musterstadt</strong> (Stufe 2 von 2).</p>
  <dl class="daten"><dt>Auszahlung</dt><dd>Lauf 10/2026, exportiert am 20.10.2026</dd><dt>Betrag</dt><dd><strong>90,00 €</strong></dd></dl>
  <p class="meta" style="margin-top:12px">Der Bericht geht an die Abrechnung der Stadt. Rückgängig nur über „Sperre aufheben“.</p>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Jetzt freigeben</button>') +
    dialog('d-zurueck', 'Zurück an Verfasser', '''
  <p>Der Bericht geht als Entwurf zurück an <strong>Tobias Rief</strong>.</p>
  <div class="feld"><label class="pflicht">Was soll geändert werden?</label><textarea style="min-height:90px" placeholder="z. B. Bitte Markus Vogt nur im Bericht der Führungsgruppe führen."></textarea></div>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Zurückgeben</button>') +
    dialog('d-sperre', 'Sperre aufheben', '''
  <p><strong>BMA Brandmeldeanlage · Musterstadt</strong>, gesperrt von Markus Vogt am 19.10.2026 08:14.</p>
  <div class="meldung warnung"><span class="ic">!</span><span>Der Bericht ist bereits im Auszahlungslauf 10/2026. Änderungen am Personal erzeugen Korrekturposten.</span></div>
  <fieldset><legend>Bericht danach wieder auf</legend><div class="wahl eng">
    <label><input type="radio" name="ziel" checked><span>Zur Prüfung<small>Sie korrigieren selbst</small></span></label>
    <label><input type="radio" name="ziel"><span>Entwurf<small>Verfasser korrigiert</small></span></label>
  </div></fieldset>
  <div class="feld fehlerhaft"><label class="pflicht">Begründung</label><input type="text" placeholder="z. B. Personal nachgetragen"><div class="fehlertext">Bitte eine Begründung eingeben. Sie steht in der Historie.</div></div>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Sperre aufheben</button>'))

# ---------- Offene Berichte ----------
VERFASSER_WAHL = '<select aria-label="Verfasser zuweisen"><option>Verfasser zuweisen …</option><option>Andreas Schmid</option></select>'
seite('einsatzberichte/offene-berichte.html', 'Offene Berichte', '''
<div class="raster vier" style="margin-bottom:16px">
  <div class="kachel warn"><div class="wert">7</div><div class="titel">offen</div><div class="unter">Entwurf oder zurückgegeben</div></div>
  <a class="kachel" href="pruefung.html"><div class="wert">4</div><div class="titel">zur Prüfung</div><div class="unter">warten auf Freigabe</div></a>
  <div class="kachel warn"><div class="wert">1</div><div class="titel">ohne Hauptbericht</div><div class="unter">Einsatz zählt nicht</div></div>
  <div class="kachel"><div class="wert">1</div><div class="titel">ohne Verfasser</div><div class="unter">bitte zuweisen</div></div>
</div>
<section class="karte">
  <div class="karte-kopf"><h2>Tobias Rief</h2><span class="meta">tobias.rief@example.org · 2 Berichte</span></div>
  ''' + tabelle(['Einsatz', 'Abteilung', 'offen seit', 'Hinweise'], [
      ('warnung', ['<a href="bericht.html">TH1 Ölspur</a><span class="unter-text">Alarm 20.10.</span>', 'Musterstadt', '3 Tage', 'Lage und Verlauf fehlen · Statistik fehlt (Hauptbericht)']),
      ['<a href="bericht.html">B2 Brand Wohnung</a><span class="unter-text">Alarm 21.10.</span>', 'Musterstadt', '2 Tage', 'Personaldoppelung mit Bericht Führungsgruppe'],
  ], 'stapel') + '''
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Sabine Hagel</h2><span class="meta">sabine.hagel@example.org · 2 Berichte</span></div>
  ''' + tabelle(['Einsatz', 'Abteilung', 'offen seit', 'Hinweise'], [
      ['<a href="bericht-haupt.html">B2 Brand Wohnung</a><span class="unter-text">Alarm 21.10.</span>', 'Weidenhain ' + H('Haupt'), '2 Tage', 'Statistik vorbefüllt, nicht geprüft'],
      ('warnung', ['<a href="bericht.html">TH Baum auf Straße</a><span class="unter-text">Alarm 02.10.</span>', 'Weidenhain', '21 Tage', 'Fahrzeug fehlt bei 2 Personen']),
  ], 'stapel') + '''
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Ohne Verfasser</h2></div>
  ''' + tabelle(['Einsatz', 'Abteilung', 'offen seit', 'Verfasser'], [
      ['<a href="bericht.html">B1 Brand Container</a><span class="unter-text">Alarm 12.10.</span>', 'Ahornfeld', '11 Tage', VERFASSER_WAHL],
  ], 'stapel') + '''
</section>
<div class="aktionsleiste"><span class="status">Letzte Sammel-E-Mail: Montag, 19.10.2026</span><a class="knopf" href="#">Excel</a><button type="button" class="knopf primaer" data-dialog="d-erinnerung">Verfasser erinnern …</button></div>
''', brot=[('Einsatzberichte', None), ('Offene Berichte', None)],
    dialoge=dialog('d-erinnerung', 'Erinnerung senden?', '''
  <p>Jeder Verfasser bekommt eine E-Mail mit seinen offenen Berichten und den Hinweisen dazu.</p>
  <fieldset><legend>Empfänger</legend><div class="schalter-liste">
    <label class="schalter"><input type="checkbox" checked> Tobias Rief · 2 Berichte</label>
    <label class="schalter"><input type="checkbox" checked> Sabine Hagel · 2 Berichte</label>
    <label class="schalter"><input type="checkbox" disabled> <span>Ahornfeld, ohne Verfasser <span class="meta">– erst zuweisen</span></span></label>
  </div></fieldset>
  <div class="feld"><label>Zusätzlicher Text (optional)</label><textarea style="min-height:70px"></textarea></div>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">2 E-Mails senden</button>'))

# ---------- Jahresstatistik ----------
def f(id_, text, wert, herkunft, kl=''):
    z = [f'<strong>{id_}</strong>', text, f'<strong>{wert}</strong>', herkunft]
    return (kl, z) if kl else z

seite('einsatzberichte/jahresstatistik.html', 'Jahresstatistik 2026', '''
<div class="filter">
  <div class="feld" style="max-width:200px"><label>Jahr</label><select><option>2026 (vorläufig)</option><option>2025 · abgegeben</option></select></div>
  <div class="feld" style="max-width:260px"><label>Seite der Landesvorlage</label><select><option>Seite 4–6 · Einsätze</option><option>Seite 1–3 · Organisation und Personal</option><option>Seite 7–13 · Fahrzeuge</option><option>Seite 14 · Funk</option></select></div>
</div>
<ol class="schritte">
  <li><a class="fertig" href="#"><span class="nr">✓</span><span class="text">Berechnen<span class="zustand">heute 08:00</span></span></a></li>
  <li><a class="aktiv fehler" href="#" aria-current="step"><span class="nr">!</span><span class="text">Prüfen<span class="zustand">2 offen</span></span></a></li>
  <li><a href="#"><span class="nr">3</span><span class="text">Abschließen und exportieren<span class="zustand">ab 01.01.2027</span></span></a></li>
</ol>
<p class="schritt-titel">Schritt 2 von 3: Prüfen</p>
<div class="meldung info"><span class="ic">i</span><span>Vorläufige Werte. Einsätze zählen nach Einsatzdatum, Personen und Fahrzeuge zum Stichtag 31.12.2026. Abgabedatei und CSV bleiben im deutschen Format der Landesvorlage.</span></div>
<div class="raster seite">
<section class="karte">
  <div class="karte-kopf"><h2>Einsätze (Auszug)</h2><span class="meta">143 Einsätze · jeder zählt einmal über seinen Hauptbericht</span></div>
  ''' + tabelle(['Frage', 'Bezeichnung', '>Wert (FF)', 'Herkunft'], [
      f('F28', 'Brände in der eigenen Gemeinde', 38, '<a href="einsaetze.html">38 Hauptberichte</a>'),
      f('F29', 'davon Kleinbrand A', 12, '<a href="einsaetze.html">12 Hauptberichte</a>'),
      f('F30', 'davon Kleinbrand B', 15, '<a href="einsaetze.html">15 Hauptberichte</a>'),
      f('F31', 'davon Mittelbrand', 9, '<a href="einsaetze.html">9 Hauptberichte</a>'),
      f('F32', 'davon Großbrand', 2, '<a href="einsaetze.html">2 Hauptberichte</a>'),
      f('F33', 'Brände Überlandhilfe', 3, '<a href="einsaetze.html">3 Hauptberichte</a>'),
      f('F37', 'Technische Hilfe', 71, '<a href="einsaetze.html">71 Hauptberichte</a>'),
      f('F40', 'davon Ölspur', 31, '<a href="einsaetze.html">31 Hauptberichte</a>'),
      f('F51', 'Fehlalarme', 21, '<a href="einsaetze.html">21 Hauptberichte</a>'),
      f('F54', 'davon Brandmeldeanlage', 13, '<a href="einsaetze.html">13 Hauptberichte</a>'),
      f('F55', 'Gerettete Personen', 9, '<a href="einsaetze.html">7 Einsätze</a>'),
      f('F57', 'davon mit Rauchgasvergiftung', 4, '<a href="einsaetze.html">3 Einsätze</a>'),
      f('F26', 'Verletzte eigene Einsatzkräfte', '2 <span class="plakette gelb">korrigiert</span>', '1 aus Berichten + 1 Dienstunfall bei Übung (Begründung: Unfallmeldung 14.05.)'),
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Ein Klick auf die Herkunft zeigt die gezählten Einsätze. Korrigierte Werte sind markiert und haben eine Begründung.</p>
</section>
<section class="karte">
  <h2>Plausibilitätsprüfung</h2>
  <div class="meldung fehler"><span class="ic">✕</span><span><span class="art">Hauptberichte:</span> 1 Einsatz ohne Hauptbericht (B1 Brand Container, 12.10.). Er zählt sonst nicht.</span><a class="knopf klein aktion" href="einsatz.html">Öffnen</a></div>
  <div class="meldung fehler"><span class="ic">✕</span><span><span class="art">Fahrzeuge:</span> MTW Birkenhain hat keine Statistik-Kategorie.</span><a class="knopf klein aktion" href="../stammdaten/fahrzeug.html">Öffnen</a></div>
  <div class="meldung ok"><span class="ic">✓</span><span>Brände F28 = F29 + F30 + F31 + F32 · Technische Hilfe F37 = F38 … F45 · Fehlalarme F51 = F52 + F53 + F54 · kein „davon“ größer als seine Summe</span></div>
  <hr class="trenner">
  <h3>Wert korrigieren</h3>
  <p class="meta">Für Funkgeräte, Meldeempfänger und Sonderfälle. Die Begründung steht im PDF.</p>
  <a class="knopf klein" href="#">Wert korrigieren …</a>
</section>
</div>
<div class="aktionsleiste"><span class="status">Abschluss ab 01.01.2027 möglich · <strong>2 Prüfungen offen</strong></span><a class="knopf" href="#">Vorschau als PDF</a><span class="knopf primaer" aria-disabled="true">Abschließen und exportieren</span></div>
''', brot=[('Einsatzberichte', None), ('Jahresstatistik', None)])

# ---------- Einstellungen Einsatzberichte ----------
def regel(name, stufe, an=True):
    return [f'<label class="schalter"><input type="checkbox"{" checked" if an else ""}> {name}</label>', f'<select aria-label="Stufe: {name}"><option>{stufe}</option><option>{"Warnung" if stufe == "Fehler" else "Fehler"}</option></select>']

seite('einsatzberichte/einstellungen.html', 'Einstellungen Einsatzberichte', '''
<div data-reitergruppe>
<div class="reiter">
  <button class="aktiv" data-reiter="e-satz">Entschädigung</button>
  <button data-reiter="e-stw">Stichworte und Statistik</button>
  <button data-reiter="e-regel">Prüfregeln</button>
  <button data-reiter="e-kat">Kataloge</button>
</div>
<div class="reiter-inhalt aktiv" id="e-satz">
<div class="raster seite">
<section class="karte">
  <div class="karte-kopf"><h2>Stundensätze</h2><a class="knopf klein sekundaer" href="#">+ Satz</a></div>
  ''' + tabelle(['Art', '>Satz je Stunde', 'gültig ab', 'gültig bis'], [
      ['Einsatz', '15,00 €', '01.07.2025', '–'],
      ['Bereitschaft auf Wache', '15,00 € (pauschal 1 h)', '01.07.2025', '–'],
      ['Brandsicherheitsdienst', '12,00 €', '01.01.2024', '–'],
      ('erledigt', ['Einsatz', '12,50 €', '01.01.2022', '30.06.2025']),
      ('erledigt', ['Bereitschaft auf Wache', '12,50 € (pauschal 1 h)', '01.01.2022', '30.06.2025']),
  ]) + '''
  <p class="meta" style="margin-top:6px">Grün hinterlegt: abgelaufene Sätze, gelten weiter für Einsätze in ihrem Zeitraum.</p>
  <h3 style="margin-top:16px">Pauschalen</h3>
  ''' + tabelle(['Pauschale', '>Betrag', 'Anwendung'], [
      ['Einsatzleiter', '10,00 €', 'je Einsatz, Funktion EL'],
      ['Schmutzzulage', '5,00 €', 'manuell je Person'],
  ]) + '''
</section>
<section class="karte">
  <h2>Berechnung</h2>
  <div class="feld"><label>Rundung</label><select><option>je angefangene Stunde</option><option>je angefangene halbe Stunde</option><option>Minutengenau (Takt 10 min)</option></select></div>
  <div class="feld"><label>Zeitbasis</label><select><option>Alarmierung bis Einsatzbereitschaft</option><option>Alarmierung bis Einsatzende</option></select></div>
  <div class="feld"><label>Mindestdauer</label><select><option>1 Stunde</option><option>keine</option></select></div>
  <div class="feld"><label>Bereitschaft</label><select><option>immer 1 Stunde</option></select></div>
  <label class="schalter"><input type="checkbox" checked> Arbeitszeit beim Dienstherrn: keine Entschädigung</label>
  <h3 style="margin-top:16px">Freigabe</h3>
  <label class="schalter"><input type="checkbox" checked> Freigabe in zwei Stufen: erst zur Entschädigungsauszahlung, dann zur Abrechnung</label>
  <p class="meta" style="margin:4px 0 0">Ausgeschaltet gibt der Kommandant direkt zur Abrechnung frei. Die Auszahlung ist darin enthalten.</p>
  <div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
</section>
</div>
</div>
<div class="reiter-inhalt" id="e-stw">
<section class="karte">
  <div class="karte-kopf"><h2>Stichwort-Katalog</h2><a class="knopf klein sekundaer" href="#">+ Stichwort</a></div>
  <p class="meta">Das Stichwort füllt im Hauptbericht Einsatzhauptart und Unterkategorie vor. Die Brandgröße wählt der Verfasser.</p>
  ''' + tabelle(['Stichwort', 'Bezeichnung', 'Einsatzhauptart', 'Unterkategorie', 'Fahrzeugpflicht', 'Statistik'], [
      ['B1', 'Brand klein', 'Brand / Explosion', '–', 'ja', 'ja'],
      ['B2', 'Brand Wohnung', 'Brand / Explosion', '–', 'ja', 'ja'],
      ['B3', 'Brand Gebäude groß', 'Brand / Explosion', '–', 'ja', 'ja'],
      ['TH1', 'Ölspur', 'Technische Hilfe', '3 Ölspur', 'ja', 'ja'],
      ['TH2', 'VU eingeklemmte Person', 'Technische Hilfe', '1 Menschenrettung · Verkehrsunfall', 'ja', 'ja'],
      ['BMA', 'Brandmeldeanlage', 'Fehlalarm', 'Brandmeldeanlage', 'ja', 'ja'],
      ['BSW', 'Brandsicherheitsdienst', '–', '–', 'nein', 'nein'],
      ['SONST', 'Sonstiges', 'Sonstiges', '–', 'nein', 'nein'],
  ], 'stapel') + '''
  <div class="feld" style="margin-top:14px;max-width:360px"><label>Eigene Gemeinde (für Überlandhilfe)</label><select><option>Stadt Musterstadt (aus Einstellungen der Feuerwehr)</option></select></div>
</section>
</div>
<div class="reiter-inhalt" id="e-regel">
<section class="karte">
  <h2>Prüfregeln</h2>
  <p class="meta">Fehler verhindern das Fertigmelden. Warnungen brauchen eine Begründung.</p>
  ''' + tabelle(['Regel', 'Stufe'], [
      regel('Hauptbericht fehlt (beim Freigeben)', 'Fehler'),
      regel('Bericht leer (Lage/Verlauf)', 'Fehler'),
      regel('Statistik des Einsatzes fehlt (Hauptbericht)', 'Fehler'),
      regel('Kein Personal', 'Fehler'),
      regel('Fahrzeug fehlt', 'Fehler'),
      regel('Personaldoppelung im Einsatz', 'Fehler'),
      regel('Ende vor Beginn', 'Fehler'),
      regel('Arbeitszeit und Verdienstausfall zugleich', 'Fehler'),
      regel('Überschneidung mit anderem Einsatz', 'Warnung'),
      regel('Dauer über 24 Stunden', 'Warnung'),
      regel('Verdienstausfall ohne Betrag', 'Warnung'),
      regel('Besatzung überschritten', 'Warnung'),
      regel('Atemschutz ohne Qualifikation / Untersuchung', 'Warnung'),
  ]) + '''
  <div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
</section>
</div>
<div class="reiter-inhalt" id="e-kat">
<div class="raster drei">
<section class="karte"><h3>Funktionen</h3><p class="neben">Einsatzleiter, Gruppenführer, Maschinist, Melder, Angriffstrupp, Wassertrupp, Schlauchtrupp, Führungsassistent …</p><a class="knopf klein" href="#">Bearbeiten</a></section>
<section class="karte"><h3>Sonstige Kräfte</h3><p class="neben">Polizei, Rettungsdienst, Notarzt, THW, Nachbarfeuerwehr, Energieversorger, Straßenmeisterei …</p><a class="knopf klein" href="#">Bearbeiten</a></section>
<section class="karte"><h3>Beteiligtenrollen</h3><p class="neben">Geschädigter, Verursacher, Zeuge, Eigentümer, Halter, Melder, Sonstige</p><a class="knopf klein" href="#">Bearbeiten</a></section>
<section class="karte"><h3>Wetterlagen</h3><p class="neben">Regen, Schnee, Glätte, Sturm, Hitze, Gewitter, Nebel</p><a class="knopf klein" href="#">Bearbeiten</a></section>
<section class="karte"><h3>Textbausteine</h3><p class="neben">Belüftung, Brandwache, Übergabe an Polizei, Ölspur abgestreut …</p><a class="knopf klein" href="#">Bearbeiten</a></section>
</div>
</div>
</div>''', brot=[('Einsatzberichte', None), ('Einstellungen', None)])
