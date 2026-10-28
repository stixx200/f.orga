"""Mockups der MP-Feuer-Brücke (`apps/mp-feuer-bridge`): eigener Dienst mit eigener Oberfläche, der MP-Feuer-Dateien
über die API an f.orga (Echt- oder Testsystem) übergibt. Dazu die geänderte Import-Seite von f.orga."""
from rahmen import SYMBOLE, sym, mockup_hinweis, SPRACHE, FUSS, kopf_html, schreiben, beschriften, tabelle, dialog, leer, seite

SYMBOLE.update({
    'verlauf': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    'export': '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v5h16v-5"/>',
    'datei': '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    'link': '<path d="M10 14l4-4"/><path d="M8 12l-2 2a3 3 0 0 0 4 4l2-2M16 12l2-2a3 3 0 0 0-4-4l-2 2"/>',
})

ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'
O = 'mp-feuer-bruecke/'

NAV = [
    ('Übernahme', [('start.html', 'start', 'Übersicht'), ('uebernahme.html', 'import', 'Neue Übernahme'), ('verlauf.html', 'verlauf', 'Verlauf')]),
    ('Ausgang', [('export.html', 'export', 'Export nach MP-Feuer')]),
    ('Verwaltung', [('einstellungen.html', 'einstellungen', 'Einstellungen')]),
]

ZIELE = {
    'echt': ('Echtsystem', 'http://forga-real:3000', 'start.html'),
    'test': ('Testsystem', 'http://forga-test:3000', 'start-test.html'),
}


def ziel_leiste(ziel):
    """Umschalter Echt-/Testsystem unter dem Kopf, auf jeder Seite sichtbar. Beim Testsystem gelb mit Hinweis."""
    knoepfe = ''
    for k, (name, _, ziel_seite) in ZIELE.items():
        an = k == ziel
        knoepfe += (f'<a href="{ziel_seite}" class="{"aktiv" if an else ""}" aria-current="{"true" if an else "false"}">'
                    f'<span class="punkt ok" aria-hidden="true"></span>{name}</a>')
    name, url, _ = ZIELE[ziel]
    hinweis = ('<span class="ziel-band">Testsystem: Übernahmen ändern nur die Testdaten.</span>' if ziel == 'test'
               else '<span class="ziel-info">verbunden · f.orga 1.4.0 · <span translate="no">' + url + '</span></span>')
    return (f'<div class="ziel-leiste{" test" if ziel == "test" else ""}"><span class="ziel-label">Ziel</span>'
            f'<nav class="ziel-schalter" aria-label="Zielsystem wählen">{knoepfe}</nav>{hinweis}</div>')


def bseite(pfad, titel, inhalt, *, nav=None, ziel='echt', aktionen='', dialoge='', brot=None):
    """Seite der Brücke: eigener Kopf (ohne Suche), Zielleiste, eigene Seitenleiste."""
    pfad = O + pfad
    p = '../'
    inhalt = beschriften(inhalt.replace('{P}', p), 'f')
    dialoge = beschriften(dialoge.replace('{P}', p), 'd')
    eintraege = []
    for gruppe, punkte in NAV:
        eintraege.append(f'<div class="gruppe">{gruppe}</div>')
        for z, ic, t in punkte:
            aktiv = ' class="aktiv" aria-current="page"' if O + z == (O + nav if nav else pfad) else ''
            eintraege.append(f'<a href="{z}"{aktiv}>{sym(ic)}<span>{t}</span></a>')
    eintraege.append('<div class="gruppe">f.orga</div>')
    eintraege.append(f'<a href="{p}shell/start.html">{sym("link")}<span>f.orga öffnen</span></a>')
    brot_html = ''
    if brot:
        brot_html = '<nav class="brotkrumen" aria-label="Pfad">' + ' <span aria-hidden="true">›</span> '.join(
            f'<a href="{z}">{t}</a>' if z else f'<span>{t}</span>' for t, z in brot) + '</nav>'
    akt = f'<div class="aktionen">{aktionen}</div>' if aktionen else ''
    html = kopf_html(titel, p) + f'''<body>
<a class="sprung" href="#inhalt">Zum Inhalt springen</a>
{mockup_hinweis(p)}
<header class="kopf">
  <button type="button" class="symbol-knopf menue-knopf" aria-label="Menü" aria-controls="hauptmenue" aria-expanded="false">{sym('menue')}</button>
  <a class="marke" href="start.html">
    <img src="{p}assets/logo.svg" alt="Wappen">
    <span><span class="kicker">Freiwillige Feuerwehr Musterstadt</span><span class="produkt">MP-Feuer-Brücke</span></span>
  </a>
  <div class="werkzeuge" style="margin-left:auto">
    <div class="nicht-mobil">{SPRACHE}</div>
    <details class="benutzermenue nicht-mobil">
      <summary><span class="avatar">MV</span><span class="name">m.vogt<small>Konto der Brücke</small></span></summary>
      <div class="menue-liste"><a href="anmeldung.html">{sym('abmelden')}Abmelden</a></div>
    </details>
  </div>
</header>
{ziel_leiste(ziel)}
<div class="rahmen">
<nav class="seitenleiste" id="hauptmenue" aria-label="Hauptnavigation">
<div class="nur-mobil menue-kopf">
  <div class="benutzer-zeile"><span class="avatar">MV</span><span><strong>m.vogt</strong><br><span class="meta">Konto der Brücke</span></span></div>
  <div class="menue-sprache"><span class="meta">Sprache</span>{SPRACHE}</div>
  <a href="anmeldung.html">{sym('abmelden')}Abmelden</a>
</div>
{chr(10).join(eintraege)}
</nav>
<main class="inhalt" id="inhalt">
<div class="seitenkopf"><div>{brot_html}<h1>{titel}</h1></div>{akt}</div>
{inhalt}
</main>
{FUSS}
</div>
<div class="menue-schleier" aria-hidden="true"></div>
{dialoge}
</body>
</html>
'''
    schreiben(pfad, html)


SCHRITTE = [('uebernahme.html', 'Dateien & Archive'), ('probelauf.html', 'Datensätze & Probelauf'), ('zuordnung.html', 'Bezeichnungen zuordnen'),
            ('lauf.html', 'Übernehmen'), ('ergebnis.html', 'Ergebnis')]


def schritte(aktiv):
    teile = ''
    for i, (z, t) in enumerate(SCHRITTE, 1):
        if i < aktiv:
            teile += f'<li><a class="fertig" href="{z}"><span class="nr">✓</span><span class="text">{t}</span></a></li>'
        elif i == aktiv:
            teile += f'<li><a class="aktiv" href="{z}" aria-current="step"><span class="nr">{i}</span><span class="text">{t}</span></a></li>'
        else:
            teile += f'<li><a href="{z}"><span class="nr">{i}</span><span class="text">{t}</span></a></li>'
    return f'<ol class="schritte">{teile}</ol><p class="schritt-titel">Schritt {aktiv} von 5: {SCHRITTE[aktiv - 1][1]}</p>'


def balken(prozent, text):
    return (f'<div class="balken" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="{prozent}" aria-label="{text}">'
            f'<span style="width:{prozent}%"></span></div>')


def datei(name):
    return f'<code translate="no">{name}</code>'


# ---------- Anmeldung ----------
seite(O + 'anmeldung.html', 'Anmeldung', f'''
<div class="anmelde-seite">
{mockup_hinweis('../')}
<div class="anmelde-oben">{SPRACHE}</div>
<main class="anmelde-mitte">
  <form class="anmelde-box" action="start.html">
    <div class="logo">
      <img src="../assets/logo.svg" alt="Wappen der Freiwilligen Feuerwehr Musterstadt">
      <div><div class="meta" style="color:var(--dienst);font-weight:bold">Freiwillige Feuerwehr Musterstadt</div><h1 style="margin:0">MP-Feuer-Brücke</h1></div>
    </div>
    <div class="feld"><label for="b">Konto</label><input id="b" type="text" value="m.vogt" autocomplete="username" autocapitalize="none"></div>
    <div class="feld"><label for="p">Passwort</label><input id="p" type="password" value="geheimgeheim" autocomplete="current-password"></div>
    <a class="knopf primaer gross voll" href="start.html">Anmelden</a>
    <p class="meta" style="margin-top:16px">Konten der Brücke sind unabhängig von f.orga. Die Brücke ist nur im lokalen Netz erreichbar. Das erste Konto wird mit dem Einrichtungsschlüssel aus dem Protokoll des Dienstes angelegt.</p>
  </form>
</main>
{FUSS}
</div>''', ohne_rahmen=True)


# ---------- Übersicht ----------
def verbindung(ziel):
    name, url, _ = ZIELE[ziel]
    test = ziel == 'test'
    fehlt = ('<li><span class="plakette warn">fehlt</span><span><code translate="no">incidents.settings.manage</code> – Alarmstichworte können in der Zuordnung nur gewählt, nicht angelegt werden.</span></li>'
             if test else '')
    return f'''<section class="karte">
  <div class="karte-kopf"><h2>Verbindung zu {name}</h2><span class="plakette ok">verbunden</span></div>
  <dl class="daten">
    <dt>Adresse</dt><dd translate="no">{url}</dd>
    <dt>Feuerwehr</dt><dd>Freiwillige Feuerwehr Musterstadt</dd>
    <dt>Version</dt><dd translate="no">f.orga 1.4.0</dd>
    <dt>Token</dt><dd><code translate="no">forga_{'Qm4' if test else '7Kq'}…</code> · technischer Benutzer <span translate="no">mp-feuer-bruecke{'-test' if test else ''}</span> · gültig bis 31.12.2027</dd>
    <dt>Einsatzberichte führt</dt><dd><span class="plakette gelb">MP-Feuer</span> (Parallelbetrieb)</dd>
  </dl>
  <h3 style="margin-top:16px">Bereiche des Tokens</h3>
  <ul class="liste">
    <li><span class="plakette ok">vorhanden</span><span>Personen, Laufbahn, Kataloge, G26, Belastungsübungen, Dienste, Einsatzpersonal</span></li>
    {fehlt}
  </ul>
  <div class="formular-fuss"><button type="button" class="knopf">Verbindung prüfen</button></div>
</section>'''


def start(ziel):
    test = ziel == 'test'
    letzte = ('Probelauf 24.10.2026 18:40 · 7 Archive · 3 offene Bezeichnungen' if test
              else 'Übernommen 19.10.2026 19:12 · 7 Archive · 1 412 neu, 2 830 geändert, 4 Fehler')
    inhalt = f'''
<div class="meldung info"><span class="ic">i</span><span>Die Brücke liest MP-Feuer-Transferdateien (<code translate="no">MPTRA_*.zip</code>) und übergibt die Daten über die API an f.orga. Zuordnungen von Bezeichnungen merkt sich f.orga als Alias. Abteilungen und Einheiten der Archive merkt sich die Brücke je Ziel.</span></div>
<div class="raster drei" style="margin-bottom:24px">
  <a class="kachel{'' if test else ' warn'}" href="uebernahme.html"><div class="wert">{'0' if test else '7'}</div><div class="titel">Neue Dateien im Eingangsordner</div><div class="unter">{'Ordner leer' if test else 'seit Montag, 26.10.2026 06:00'}</div></a>
  <a class="kachel" href="ergebnis.html"><div class="wert">{'3' if test else '4'}</div><div class="titel">{'Offene Bezeichnungen' if test else 'Fehler der letzten Übernahme'}</div><div class="unter">{letzte}</div></a>
  <a class="kachel" href="verlauf.html"><div class="wert">{'5' if test else '12'}</div><div class="titel">Läufe</div><div class="unter">seit 01.09.2026</div></a>
</div>
<div class="raster seite">
{verbindung(ziel)}
<section class="karte">
  <h2>Wöchentliche Routine</h2>
  <ol style="margin:0 0 12px;padding-left:20px">
    <li>In MP-Feuer die Transferdateien aller Abteilungen exportieren.</li>
    <li>Dateien hier hochladen oder in den Eingangsordner legen.</li>
    <li>Probelauf, offene Bezeichnungen zuordnen, übernehmen.</li>
    <li>In f.orga Kostenbescheide und Auszahlungslauf.</li>
  </ol>
  <a class="knopf primaer voll" href="uebernahme.html">Neue Übernahme</a>
  <p class="meta" style="margin-top:12px">Zeitplan: montags 06:00 Probelauf mit der gemerkten Auswahl{' (aus)' if test else ''}. Übernommen wird nur nach Bestätigung.</p>
</section>
</div>'''
    bseite('start-test.html' if test else 'start.html', 'Übersicht', inhalt, nav='start.html', ziel=ziel)


start('echt')
start('test')


# ---------- Schritt 1: Dateien & Archive ----------
def archiv(nr, datei_name, inhalt, abteilung, einheit, ueberspringen=False, gemerkt=True, warnung=''):
    abt_optionen = ['Abt. Musterstadt', 'Abt. Ahornfeld', 'Abt. Birkenhain', 'Abt. Pappelhain', 'Jugendfeuerwehr Musterstadt', 'Altersabteilung Musterstadt', 'Gesamtwehr']
    abt = ''.join(f'<option{" selected" if a == abteilung else ""}>{a}</option>' for a in abt_optionen)
    ein = ''.join(f'<option{" selected" if e == einheit else ""}>{e}</option>' for e in ['Abteilungsbericht', 'Einsatzleiter vom Dienst (EvD)'])
    status = ('<span class="plakette grau">übersprungen</span>' if ueberspringen else
              '<span class="plakette ok">gemerkt</span>' if gemerkt else '<span class="plakette gelb">neu, Vorschlag</span>')
    w = f'<div class="unter-text">{warnung}</div>' if warnung else ''
    return ('grau' if ueberspringen else '', [
        f'<strong translate="no">{nr}</strong>',
        f'{datei(datei_name)}<div class="meta">{inhalt}</div>{w}',
        f'<select aria-label="Abteilung in f.orga"{" disabled" if ueberspringen else ""}>{abt}</select>',
        f'<select aria-label="Einsatzberichte als"{" disabled" if ueberspringen else ""}>{ein}</select>',
        f'<div class="plaketten">{status}</div><label class="schalter"><input type="checkbox"{" checked" if ueberspringen else ""}> Überspringen</label>',
    ])


bseite('uebernahme.html', 'Neue Übernahme', schritte(1) + '''
<section class="karte">
  <div class="ablage">''' + sym('import') + '''<strong>MPTRA-Dateien hierher ziehen</strong><span class="meta">oder</span>
    <div class="knopfreihe" style="justify-content:center"><button type="button" class="knopf sekundaer">Dateien wählen</button><button type="button" class="knopf">Aus dem Eingangsordner (7)</button></div>
    <span class="meta">Transferdateien von MP-Feuer, je Abteilung eine. Höchstens 40 Dateien, je 200 MB.</span></div>
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Erkannte Archive (7)</h2><span class="meta">Zuordnung je Archivnummer gemerkt für das Echtsystem</span></div>
  ''' + tabelle(['Nr.', 'Datei und Inhalt', 'Abteilung in f.orga', 'Einsatzberichte als', 'Status'], [
      archiv('01', 'MPTRA_01_20261026_1832_Abt. Musterstadt.zip', '96 Personen · 312 Einsätze · 48 Dienste', 'Abt. Musterstadt', 'Abteilungsbericht'),
      archiv('02', 'MPTRA_02_20261026_1834_Abt. Ahornfeld.zip', '41 Personen · 87 Einsätze · 22 Dienste', 'Abt. Ahornfeld', 'Abteilungsbericht'),
      archiv('03', 'MPTRA_03_20261026_1835_Abt. Birkenhain.zip', '38 Personen · 64 Einsätze · 20 Dienste', 'Abt. Birkenhain', 'Abteilungsbericht'),
      archiv('04', 'MPTRA_04_20261026_1837_Jugendfeuerwehr.zip', '34 Personen · 31 Dienste', 'Jugendfeuerwehr Musterstadt', 'Abteilungsbericht'),
      archiv('05', 'MPTRA_05_20261026_1838_Altersabteilung.zip', '27 Personen', 'Altersabteilung Musterstadt', 'Abteilungsbericht',
             gemerkt=False, warnung='Neues Archiv: Abteilung über den Namen vorgeschlagen.'),
      archiv('90', 'MPTRA_90_20261026_1840_Gesamtfeuerwehr.zip', '196 Einsätze', 'Gesamtwehr', 'Einsatzleiter vom Dienst (EvD)'),
      archiv('99', 'MPTRA_99_20261026_1841_Sonderdienste.zip', '12 Personen · 9 Dienste', 'Gesamtwehr', 'Abteilungsbericht', ueberspringen=True),
  ], 'stapel') + '''
  <div class="meldung warnung" style="margin-top:16px"><span class="ic">!</span><span><strong>Warnung:</strong> <code translate="no">MPTRA_02_20261019_1902_Abt. Ahornfeld.zip</code> lag ebenfalls vor. Es gilt die neuere Datei vom 26.10.2026.</span></div>
</section>
<div class="aktionsleiste"><span class="status">Ziel: <strong>Echtsystem</strong></span><a class="knopf" href="start.html">Abbrechen</a><a class="knopf primaer" href="probelauf.html">Weiter zu den Datensätzen</a></div>
''', nav='uebernahme.html', brot=[('Übernahme', None), ('Neue Übernahme', None)])


# ---------- Schritt 2: Datensätze & Probelauf ----------
def satz(nr, name, zeilen, optionen, ergebnis, an=True, gesperrt=''):
    opt = ''.join(f'<label class="schalter"><input type="checkbox"{" checked" if o_an else ""}> {o}</label>' for o, o_an in optionen)
    g = f'<div class="unter-text">{gesperrt}</div>' if gesperrt else ''
    return ('' if an else 'grau', [
        f'<label class="schalter"><input type="checkbox"{" checked" if an else ""}{" disabled" if gesperrt else ""}> <strong>{nr} {name}</strong></label>{g}',
        f'<span translate="no">{zeilen}</span>',
        f'<div class="schalter-liste">{opt}</div>' if opt else '<span class="meta">–</span>',
        ergebnis,
    ])


def zaehl(neu, geaendert, gleich, fehler, offen=0):
    t = f'<div class="plaketten"><span class="plakette ok">{neu} neu</span><span class="plakette">{geaendert} geändert</span><span class="plakette grau">{gleich} unverändert</span>'
    if fehler:
        t += f'<span class="plakette warn">{fehler} Fehler</span>'
    if offen:
        t += f'<a class="plakette gelb" href="zuordnung.html">{offen} offene Bezeichnungen</a>'
    return t + '</div>'


bseite('probelauf.html', 'Neue Übernahme', schritte(2) + '''
<div class="meldung ok"><span class="ic">✓</span><span><strong>Probelauf fertig</strong> (26.10.2026 19:04, 41 s). Nichts wurde geändert. 9 Bezeichnungen sind offen, 4 Zeilen haben Fehler.</span></div>
<section class="karte">
  <div class="karte-kopf"><h2>Datensätze</h2><span class="meta">Reihenfolge wie in f.orga: erst Personen, dann was auf sie verweist</span></div>
  ''' + tabelle(['Datensatz', '>Zeilen', 'Optionen', 'Probelauf'], [
      satz('1', 'Personen', '236', [('Vorhandene Personen aktualisieren', False)], zaehl(3, 0, 233, 0)),
      satz('2', 'Lehrgänge, Dienstgrade, Ehrungen', '1 904', [], zaehl(12, 0, 1890, 0, 5)),
      satz('3', 'G26-Untersuchungen', '402', [], zaehl(4, 0, 398, 0)),
      satz('4', 'Belastungsübungen', '611', [], zaehl(9, 0, 602, 0)),
      satz('5', 'Dienste', '2 118', [], zaehl(31, 2, 2085, 0, 1), an=False),
      satz('6', 'Einsatzpersonal', '4 806', [('Unbekannte Stichworte anlegen', True)], zaehl(118, 46, 4638, 4, 3)),
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Auswahl und Optionen sind für das Echtsystem gemerkt. „Vorhandene Personen aktualisieren“ ist aus, damit f.orga für Personen führend bleibt.</p>
</section>
<div class="aktionsleiste"><span class="status">Probelauf in 3 Teilen je Datensatz mit mehr als 2 000 Zeilen</span><a class="knopf" href="uebernahme.html">Zurück</a><button type="button" class="knopf">Erneut prüfen</button><a class="knopf primaer" href="zuordnung.html">Weiter zur Zuordnung (9)</a></div>
''', nav='uebernahme.html', brot=[('Übernahme', None), ('Neue Übernahme', None)])


# ---------- Schritt 3: Nicht zugeordnete Bezeichnungen ----------
def offen(wert, art, anzahl, gewaehlt, optionen, anlegen=True):
    opt = '<option value="">– ignorieren –</option>' + ''.join(f'<option{" selected" if o == gewaehlt else ""}>{o}</option>' for o in optionen)
    neu = '<button type="button" class="knopf text klein" data-dialog="d-neu">Neuen Eintrag anlegen</button>' if anlegen else ''
    return ('' if gewaehlt else 'warnung', [
        f'<strong translate="no">{wert}</strong>', art, f'<span translate="no">{anzahl}</span>',
        f'<select aria-label="Eintrag für {wert}">{opt}</select>{neu}',
    ])


FUNKTIONEN = ['Gruppenführer', 'Maschinist', 'Truppführer', 'Truppmann', 'Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn', 'Keine Funktion – Verdienstausfall', 'Keine Funktion (ignorieren)']
bseite('zuordnung.html', 'Neue Übernahme', schritte(3) + '''
<section class="karte">
  <div class="karte-kopf"><h2>Nicht zugeordnete Bezeichnungen</h2>
    <div class="chips" role="group" aria-label="Art filtern"><button type="button" class="chip aktiv">Alle (9)</button><button type="button" class="chip">Lehrgänge (4)</button><button type="button" class="chip">Ehrungen (1)</button><button type="button" class="chip">Diensttypen (1)</button><button type="button" class="chip">Funktionen (1)</button><button type="button" class="chip">Fahrzeuge (1)</button><button type="button" class="chip">Alarmstichworte (1)</button></div></div>
  <p class="neben">Diese Werte aus MP-Feuer passen zu keinem Eintrag im Echtsystem. Wählen Sie einen Eintrag oder legen Sie einen an; leer heißt ignorieren. Die Zuordnung gilt für alle Datensätze dieses Laufs und wird bei der Übernahme in f.orga als Alias gespeichert. Der nächste Import erkennt den Wert dann von selbst.</p>
  ''' + tabelle(['Wert in MP-Feuer', 'Art', '>Vorkommen', 'Eintrag in f.orga'], [
      offen('Erste Hilfe', 'Lehrgang', 37, 'Anderer Lehrgang', ['Anderer Lehrgang', 'Sanitätsausbildung', 'Truppmann Teil 1']),
      offen('TM 1', 'Lehrgang', 22, 'Truppmann Teil 1', ['Truppmann Teil 1', 'Truppmann Teil 2']),
      offen('Atemschutzgeräteträger', 'Lehrgang', 18, '', ['Atemschutz', 'Anderer Lehrgang']),
      offen('Drohnenpilot', 'Lehrgang', 3, '', ['Anderer Lehrgang']),
      offen('Ehrennadel Kreis', 'Ehrung', 2, '', ['Ehrennadel des Kreisfeuerwehrverbands', 'Ehrenzeichen Silber']),
      offen('Gerätewartung', 'Diensttyp', 14, 'Wartung', ['Wartung', 'Übung', 'Sonstiges']),
      offen('Arbeitszeit Stadt Musterstadt', 'Funktion', 9, 'Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn', FUNKTIONEN),
      offen('Florian Musterstadt 1/19-2', 'Fahrzeug', 6, '', ['MTW · Florian Musterstadt 1/19 (Musterstadt)', 'ELW 1 · Florian Musterstadt 1/11 (Musterstadt)'], anlegen=False),
      offen('B 2 BMA', 'Alarmstichwort', 11, 'B2 BMA', ['B2 BMA', 'B2 Brand Gebäude']),
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Fahrzeuge werden in f.orga in der Organisation angelegt, hier nur gewählt. Falsche Zuordnungen lassen sich in f.orga am Eintrag unter „Aliasse“ entfernen.</p>
</section>
<div class="meldung warnung"><span class="ic">!</span><span><strong>Warnung:</strong> Zuordnungen geändert. Bitte erneut prüfen, bevor übernommen wird.</span></div>
<div class="aktionsleiste"><span class="status">6 von 9 zugeordnet</span><a class="knopf" href="probelauf.html">Zurück</a><button type="button" class="knopf sekundaer">Erneut prüfen</button><a class="knopf primaer" href="lauf.html">Übernehmen …</a></div>
''', nav='uebernahme.html', brot=[('Übernahme', None), ('Neue Übernahme', None)],
    dialoge=dialog('d-neu', 'Neuen Eintrag anlegen', '''
<p class="neben">Legt im Echtsystem einen Lehrgang an und ordnet „Drohnenpilot“ ihm zu.</p>
<div class="feld"><label class="pflicht">Bezeichnung</label><input type="text" value="Drohnenpilot"></div>
<div class="feld"><label class="pflicht">Schlüssel</label><input type="text" value="drohnenpilot" translate="no"></div>
<p class="meta">Braucht im Token den Bereich <code translate="no">masterdata.catalogs.manage</code>. Name auf Englisch und weitere Angaben lassen sich danach in f.orga ergänzen.</p>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Anlegen und zuordnen</button>'))


# ---------- Schritt 4: Übernehmen mit Fortschritt ----------
def fortschritt(name, prozent, text, plakette):
    return f'''<li class="fortschritt"><div class="fortschritt-kopf"><strong>{name}</strong>{plakette}</div>{balken(prozent, name)}<span class="meta">{text}</span></li>'''


bseite('lauf.html', 'Neue Übernahme', schritte(4) + '''
<section class="karte">
  <div class="karte-kopf"><h2>Übernahme ins Echtsystem läuft</h2><span class="meta">gestartet 19:06 · Lauf <code translate="no">r-2026-10-26-1906</code></span></div>
  <ul class="liste">
  ''' + fortschritt('1 Personen', 100, '236 Zeilen in 1 Teil · 4 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('2 Lehrgänge, Dienstgrade, Ehrungen', 100, '1 904 Zeilen in 1 Teil · 9 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('3 G26-Untersuchungen', 100, '402 Zeilen in 1 Teil · 2 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('4 Belastungsübungen', 100, '611 Zeilen in 1 Teil · 3 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('6 Einsatzpersonal', 66, 'Teil 2 von 3 · 3 180 von 4 806 Zeilen · noch etwa 20 s', '<span class="plakette gelb">läuft</span>') + '''
  </ul>
  <p class="meta" style="margin-top:8px">Jeder Teil ist in f.orga eine eigene Übernahme mit Audit-Eintrag. Einsätze werden nie auf zwei Teile verteilt. Ein abgebrochener Lauf lässt die fertigen Teile stehen; ein neuer Lauf mit denselben Dateien ergänzt den Rest, ohne zu verdoppeln.</p>
</section>
<div class="aktionsleiste"><span class="status">Die Seite darf geschlossen werden; der Lauf geht weiter.</span><button type="button" class="knopf" data-dialog="d-abbrechen">Abbrechen …</button><a class="knopf primaer" href="ergebnis.html">Zum Ergebnis</a></div>
''', nav='uebernahme.html', brot=[('Übernahme', None), ('Neue Übernahme', None)],
    dialoge=dialog('d-abbrechen', 'Übernahme abbrechen?', '<p>Der laufende Teil wird noch fertig übernommen, danach hält die Brücke an. Bereits übernommene Teile bleiben in f.orga.</p>',
                   '<button class="knopf" value="abbrechen">Weiter übernehmen</button><button class="knopf primaer" value="ok">Nach diesem Teil anhalten</button>', gefahr=True))


# ---------- Schritt 5: Ergebnis ----------
bseite('ergebnis.html', 'Neue Übernahme', schritte(5) + '''
<div class="meldung ok"><span class="ic">✓</span><span><strong>Übernommen</strong> am 26.10.2026 19:07 in 52 s. 4 Zeilen mit Fehlern wurden übersprungen.</span></div>
<section class="karte">
  <div class="karte-kopf"><h2>Ergebnis je Datensatz</h2><div class="knopfreihe"><a class="knopf klein" href="#">Als CSV herunterladen</a><a class="knopf klein" href="{P}shell/start.html">Audit in f.orga</a></div></div>
  ''' + tabelle(['Datensatz', '>Neu', '>Geändert', '>Unverändert', '>Fehler'], [
      ['Personen', '3', '0', '233', '0'],
      ['Lehrgänge, Dienstgrade, Ehrungen', '15', '0', '1 889', '0'],
      ['G26-Untersuchungen', '4', '0', '398', '0'],
      ['Belastungsübungen', '9', '0', '602', '0'],
      ['Einsatzpersonal', '118', '46', '4 638', '<strong>4</strong>'],
  ], 'stapel') + '''
</section>
<section class="karte">
  <h2>Meldungen nach Art</h2>
  ''' + tabelle(['Meldung', 'Wert', '>Anzahl', 'Beispiele'], [
      ('warnung', ['<strong>Fehler:</strong> Person nicht gefunden. Person in f.orga anlegen oder Datensatz „Personen“ übernehmen.<div class="meta" translate="no">incidents.import.unknownPerson</div>', '<span translate="no">Kurz Anna</span>', '3', 'Archiv 02, Zeilen 1 204, 1 377, 1 380 · <a href="#">E-2026-0412</a>']),
      ('warnung', ['<strong>Fehler:</strong> Person steht zweimal im selben Bericht.<div class="meta" translate="no">incidents.personTwiceInReport</div>', '<span translate="no">Rief Tobias</span>', '1', 'Archiv 01, Zeile 3 911 · <a href="#">E-2026-0398</a>']),
      ['Bericht in f.orga bearbeitet, nicht ersetzt.<div class="meta" translate="no">incidents.import.reportEdited</div>', '–', '7', '<a href="#">E-2026-0377</a>, <a href="#">E-2026-0381</a> …'],
      ['Stichwort angelegt.<div class="meta" translate="no">incidents.import.keywordCreated</div>', '<span translate="no">H1 Tür öffnen</span>', '2', 'Archiv 90, Zeilen 88, 141'],
      ['Austritt nicht übernommen (vorhandene Person).<div class="meta" translate="no">masterdata.import.leftIgnored</div>', '–', '1', 'Archiv 05, Zeile 19'],
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Die CSV enthält alle Zeilen mit Meldungen: Datensatz, Archiv, Zeile, Bezeichnung, Code und Text.</p>
</section>
<div class="aktionsleiste"><a class="knopf" href="verlauf.html">Zum Verlauf</a><a class="knopf primaer" href="{P}shell/start.html">f.orga öffnen</a></div>
''', nav='uebernahme.html', brot=[('Übernahme', None), ('Neue Übernahme', None)])


# ---------- Verlauf ----------
bseite('verlauf.html', 'Verlauf', '''
<div class="filter knopfreihe" style="margin-bottom:16px">
  <div class="chips" role="group" aria-label="Ziel filtern"><button type="button" class="chip aktiv">Alle Ziele</button><button type="button" class="chip">Echtsystem</button><button type="button" class="chip">Testsystem</button></div>
</div>
''' + tabelle(['Zeitpunkt', 'Ziel', 'Konto', 'Dateien', 'Ergebnis', ''], [
    ['26.10.2026 19:06', 'Echtsystem', '<span translate="no">m.vogt</span>', '6 Archive', '<span class="plakette ok">übernommen</span> <span class="meta">134 neu · 46 geändert · 4 Fehler</span>', '<a class="knopf klein" href="ergebnis.html">Bericht</a>'],
    ['26.10.2026 19:04', 'Echtsystem', '<span translate="no">m.vogt</span>', '6 Archive', '<span class="plakette grau">Probelauf</span> <span class="meta">9 offene Bezeichnungen</span>', '<a class="knopf klein" href="probelauf.html">Bericht</a>'],
    ['26.10.2026 06:00', 'Echtsystem', 'Zeitplan', '7 Archive', '<span class="plakette grau">Probelauf</span> <span class="meta">wartet auf Bestätigung</span>', '<a class="knopf klein" href="probelauf.html">Bericht</a>'],
    ['24.10.2026 18:40', 'Testsystem', '<span translate="no">s.keller</span>', '7 Archive', '<span class="plakette grau">Probelauf</span> <span class="meta">3 offene Bezeichnungen</span>', '<a class="knopf klein" href="probelauf.html">Bericht</a>'],
    ('warnung', ['21.10.2026 20:15', 'Testsystem', '<span translate="no">s.keller</span>', '7 Archive', '<span class="plakette warn">abgebrochen</span> <span class="meta">nach Teil 2 von 3, Einsatzpersonal</span>', '<a class="knopf klein" href="ergebnis.html">Bericht</a>']),
    ['19.10.2026 19:12', 'Echtsystem', '<span translate="no">m.vogt</span>', '7 Archive', '<span class="plakette ok">übernommen</span> <span class="meta">1 412 neu · 2 830 geändert · 4 Fehler</span>', '<a class="knopf klein" href="ergebnis.html">Bericht</a>'],
], 'stapel') + '''
<p class="meta" style="margin-top:8px">Läufe und Berichte bleiben 12 Monate gespeichert. Hochgeladene Dateien löscht die Brücke nach dem Lauf, spätestens nach 24 Stunden.</p>
''', brot=[('Übernahme', None), ('Verlauf', None)])


# ---------- Einstellungen ----------
bseite('einstellungen.html', 'Einstellungen', '''
<div data-reitergruppe>
<div class="reiter">
  <button class="aktiv" data-reiter="r-ziele">Ziele</button>
  <button data-reiter="r-gemerkt">Gemerkte Zuordnungen</button>
  <button data-reiter="r-eingang">Eingangsordner und Zeitplan</button>
  <button data-reiter="r-konten">Konten</button>
</div>
<div class="reiter-inhalt aktiv" id="r-ziele">
''' + tabelle(['Ziel', 'Adresse', 'Token', 'Verbindung', ''], [
    ['<strong>Echtsystem</strong>', '<span translate="no">http://forga-real:3000</span>', '<code translate="no">forga_7Kq…</code><div class="meta">gültig bis 31.12.2027</div>', '<span class="plakette ok">verbunden</span>', '<button type="button" class="knopf klein" data-dialog="d-ziel">Bearbeiten …</button>'],
    ['<strong>Testsystem</strong> <span class="plakette gelb">Test</span>', '<span translate="no">http://forga-test:3000</span>', '<code translate="no">forga_Qm4…</code><div class="meta">gültig bis 30.06.2027</div>', '<span class="plakette gelb">1 Bereich fehlt</span>', '<button type="button" class="knopf klein" data-dialog="d-ziel">Bearbeiten …</button>'],
], 'stapel') + '''
<div class="formular-fuss"><button type="button" class="knopf" data-dialog="d-ziel">Ziel hinzufügen</button></div>
<section class="karte" style="margin-top:16px">
  <h2>Token in f.orga erzeugen</h2>
  <p class="neben">In f.orga unter „Verwaltung → API-Tokens“ ein Token „MP-Feuer-Brücke“ mit diesen Bereichen erzeugen und hier eintragen:</p>
  <p><code translate="no">masterdata.persons.write</code> <code translate="no">masterdata.catalogs.manage</code> <code translate="no">respiratory-protection.examinations</code> <code translate="no">respiratory-protection.evidence</code> <code translate="no">training.plan</code> <code translate="no">training.settings.manage</code> <code translate="no">incidents.reports.release</code> <code translate="no">incidents.settings.manage</code></p>
  <p class="meta">Die Brücke speichert das Token verschlüsselt und zeigt es nie wieder an.</p>
</section>
</div>
<div class="reiter-inhalt" id="r-gemerkt">
  <div class="chips" role="group" aria-label="Ziel" style="margin-bottom:16px"><button type="button" class="chip aktiv">Echtsystem</button><button type="button" class="chip">Testsystem</button></div>
''' + tabelle(['Archivnummer', 'Einheit im Dateinamen', 'Abteilung', 'Einsatzberichte als', 'Zuletzt'], [
    ['<span translate="no">01</span>', 'Abt. Musterstadt', 'Abt. Musterstadt', 'Abteilungsbericht', '26.10.2026'],
    ['<span translate="no">02</span>', 'Abt. Ahornfeld', 'Abt. Ahornfeld', 'Abteilungsbericht', '26.10.2026'],
    ['<span translate="no">90</span>', 'Gesamtfeuerwehr', 'Gesamtwehr', 'Einsatzleiter vom Dienst (EvD)', '26.10.2026'],
    ('grau', ['<span translate="no">99</span>', 'Sonderdienste', '<span class="plakette grau">übersprungen</span>', '–', '26.10.2026']),
], 'stapel') + '''
  <section class="karte" style="margin-top:16px">
    <h2>Datensätze und Optionen</h2>
    <dl class="daten"><dt>Gewählt</dt><dd>Personen, Lehrgänge, G26, Belastungsübungen, Einsatzpersonal</dd><dt>Vorhandene Personen aktualisieren</dt><dd>aus</dd><dt>Unbekannte Stichworte anlegen</dt><dd>an</dd></dl>
    <p class="meta" style="margin-top:12px">Zuordnungen von Bezeichnungen speichert f.orga als Alias am Eintrag, nicht die Brücke.</p>
    <div class="formular-fuss"><button type="button" class="knopf" data-dialog="d-vergessen">Gemerkte Auswahl zurücksetzen …</button></div>
  </section>
</div>
<div class="reiter-inhalt" id="r-eingang">
  <section class="karte">
    <h2>Eingangsordner</h2>
    <div class="felder zwei">
      <div class="feld"><label>Ordner Echtsystem</label><input type="text" value="/data/inbox/echtsystem" translate="no"></div>
      <div class="feld"><label>Ordner Testsystem</label><input type="text" value="/data/inbox/testsystem" translate="no"></div>
    </div>
    <p class="meta">Der Ordner ist ein Verzeichnis im Volume der Brücke, z. B. als Netzwerkfreigabe eingebunden. Neue Dateien erscheinen auf der Übersicht.</p>
  </section>
  <section class="karte">
    <h2>Zeitplan</h2>
    <div class="felder zwei">
      <div class="feld"><label>Probelauf</label><select><option>aus</option><option selected>wöchentlich, Montag</option><option>täglich</option></select></div>
      <div class="feld"><label>Uhrzeit</label><input type="time" value="06:00"></div>
    </div>
    <label class="schalter"><input type="checkbox"> Automatisch übernehmen, wenn der Probelauf keine Fehler und keine offenen Bezeichnungen hat</label>
    <p class="meta">Standard: aus. Sonst wartet jeder Lauf auf Bestätigung.</p>
    <div class="formular-fuss"><button type="button" class="knopf primaer">Speichern</button></div>
  </section>
</div>
<div class="reiter-inhalt" id="r-konten">
''' + tabelle(['Konto', 'Zuletzt angemeldet', ''], [
    ['<strong translate="no">m.vogt</strong>', 'heute 19:01', '<button type="button" class="knopf klein">Passwort ändern</button>'],
    ['<strong translate="no">s.keller</strong>', '24.10.2026 18:32', '<button type="button" class="knopf klein">Sperren …</button>'],
], 'stapel') + '''
  <div class="formular-fuss"><button type="button" class="knopf">Konto anlegen</button></div>
</div>
</div>''', brot=[('Verwaltung', None), ('Einstellungen', None)],
    dialoge=dialog('d-ziel', 'Ziel bearbeiten', '''
<div class="feld"><label class="pflicht">Name</label><input type="text" value="Testsystem"></div>
<div class="feld"><label class="pflicht">Adresse von f.orga</label><input type="url" value="http://forga-test:3000" translate="no"></div>
<div class="feld"><label>API-Token</label><input type="password" placeholder="leer lassen, um das gespeicherte Token zu behalten"></div>
<label class="schalter"><input type="checkbox" checked> Testsystem (gelbes Band über allen Seiten)</label>
<p class="meta">Das Token wird verschlüsselt gespeichert und nicht wieder angezeigt. „Verbindung prüfen“ zeigt Version, Feuerwehr und fehlende Bereiche.</p>''',
        '<button class="knopf" value="pruefen">Verbindung prüfen</button>' + ABBRECHEN + '<button class="knopf primaer" value="ok">Speichern</button>')
    + dialog('d-vergessen', 'Gemerkte Auswahl zurücksetzen?', '<p>Abteilungen, Einheiten, übersprungene Archive und Optionen des Echtsystems werden vergessen. Bei der nächsten Übernahme schlägt die Brücke wieder über die Namen vor. Aliasse in f.orga bleiben.</p>',
             ABBRECHEN + '<button class="knopf primaer" value="ok">Zurücksetzen</button>', gefahr=True))


# ---------- Export nach MP-Feuer (Platzhalter) ----------
bseite('export.html', 'Export nach MP-Feuer', '''
<div class="meldung warnung"><span class="ic">!</span><span><strong>In Vorbereitung.</strong> MP-Feuer übernimmt Daten über seinen Tabellen-Import mit Vorlagen (CSV/Excel). Sobald Beispieldateien der Vorlagen vorliegen, bekommt jeder Export einen eigenen Adapter. Bis dahin erzeugt die Brücke keine Dateien.</span></div>
''' + tabelle(['Export', 'Daten aus f.orga', 'Braucht im Token', 'Stand'], [
    ['<strong>Personen</strong>', 'Stammdaten, Mitgliedschaften', '<code translate="no">masterdata.persons.read</code>', '<span class="plakette grau">Vorlage fehlt</span>'],
    ['<strong>Lehrgänge und Qualifikationen</strong>', 'Laufbahn der Personen', '<code translate="no">masterdata.persons.read</code>', '<span class="plakette grau">Vorlage fehlt</span>'],
    ['<strong>Einsätze</strong>', 'Einsatzberichte mit Personal', '<code translate="no">incidents.reports.read</code>', '<span class="plakette grau">Vorlage fehlt</span>'],
], 'stapel') + '''
<section class="karte" style="margin-top:16px">
  <h2>So kommt ein Export dazu</h2>
  <ol style="margin:0;padding-left:20px">
    <li>Vorlage und Beispieldatei aus MP-Feuer bereitstellen.</li>
    <li>Adapter mit Parametern (z. B. Abteilung, Zeitraum) und Test gegen die Beispieldatei.</li>
    <li>Hier erscheinen dann Parameter und „Datei erzeugen“; die Datei wird in MP-Feuer importiert.</li>
  </ol>
</section>
''', brot=[('Ausgang', None), ('Export nach MP-Feuer', None)])


# ---------- f.orga: Import-Seite ohne MP-Feuer-Datenübernahme ----------
seite(O + 'forga-import.html', 'Import', '''
<div class="meldung info"><span class="ic">i</span><span>MP-Feuer-Transferdateien (<code translate="no">MPTRA_*.zip</code>) übernimmt die <strong>MP-Feuer-Brücke</strong>. Sie übergibt die Daten über die API an f.orga; Übernahmen stehen im Audit-Log.</span><a class="knopf klein aktion" href="start.html">MP-Feuer-Brücke öffnen</a></div>
<ol class="schritte">
  <li><a class="aktiv" href="#" aria-current="step"><span class="nr">1</span><span class="text">Datei</span></a></li>
  <li><a href="#"><span class="nr">2</span><span class="text">Spalten zuordnen</span></a></li>
  <li><a href="#"><span class="nr">3</span><span class="text">Vorschau &amp; Prüfung</span></a></li>
  <li><a href="#"><span class="nr">4</span><span class="text">Übernehmen</span></a></li>
</ol>
<p class="schritt-titel">Schritt 1 von 4: Datei</p>
<section class="karte">
  <div class="ablage">''' + sym('import') + '''<strong>Tabelle hierher ziehen</strong><span class="meta">Excel (.xlsx), CSV (.csv, .txt) oder Kalender (.ics), höchstens 10 MB</span>
    <div class="knopfreihe" style="justify-content:center"><button type="button" class="knopf sekundaer">Datei wählen</button></div></div>
</section>
<section class="karte">
  <h2>Importprofile</h2>
  ''' + tabelle(['Profil', 'Eine Zeile je'], [
      ['<strong>Personen</strong>', 'Person'],
      ['<strong>Lehrgänge, Dienstgrade, Ehrungen</strong>', 'Eintrag der Laufbahn'],
      ['<strong>G26-Untersuchungen</strong>', 'Untersuchung'],
      ['<strong>Belastungsübungen</strong>', 'Übung einer Person'],
      ['<strong>Dienste</strong>', 'Teilnahme an einem Dienst'],
      ['<strong>Einsatzpersonal</strong>', 'Person und Bericht (Einsatz, Bericht, Status, Statistik in eigenen Spalten)'],
      ['<strong>EvD-Dienstplan</strong>', 'Termin (.ics)'],
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Nur Profile, für die Sie das Recht haben. Unbekannte Bezeichnungen lassen sich nach der Prüfung zuordnen und werden als Alias gemerkt.</p>
</section>
''', nav='stammdaten/import.html', brot=[('Stammdaten', None), ('Import', None)])
