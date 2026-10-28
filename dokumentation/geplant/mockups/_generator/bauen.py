"""Erzeugt alle Mockup-Seiten, das englische Wörterbuch assets/i18n.js und prüft Links und Übersetzungen.

Aufruf: python3 _generator/bauen.py
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(__file__))
import shell, stammdaten, einsatzberichte, infoterminal  # noqa: F401,E401  (erzeugen Seiten beim Import)
from rahmen import ZIEL, FUSS, SPRACHE, mockup_hinweis, schreiben, kopf_html
from uebersetzung import EN, MUSTER, GLEICH

GRUPPEN = [
    ('Shell', [('shell/anmeldung.html', 'Anmeldung'), ('shell/start.html', 'Startseite'), ('shell/benutzer.html', 'Benutzer und Rollenzuweisung'),
               ('shell/rollen.html', 'Rollen und Berechtigungen'), ('shell/module.html', 'Module'), ('shell/einstellungen.html', 'Einstellungen'), ('shell/api-tokens.html', 'API-Tokens')]),
    ('Stammdaten', [('stammdaten/personen.html', 'Personenliste'), ('stammdaten/person.html', 'Personenakte mit Historie'), ('stammdaten/person-neu.html', 'Person anlegen'),
                    ('stammdaten/organisation.html', 'Organisation'), ('stammdaten/fahrzeug.html', 'Fahrzeug'), ('stammdaten/lehrgangsplanung.html', 'Lehrgangsplanung'),
                    ('stammdaten/listen.html', 'Listen'), ('stammdaten/import.html', 'Import-Assistent')]),
    ('Einsatzberichte', [('einsatzberichte/einsaetze.html', 'Einsatzliste'), ('einsatzberichte/einsatz.html', 'Einsatz mit Berichten'),
                         ('einsatzberichte/bericht.html', 'Berichtseditor (Nebenbericht)'), ('einsatzberichte/bericht-haupt.html', 'Berichtseditor (Hauptbericht, Statistik)'),
                         ('einsatzberichte/pruefung.html', 'Prüfung und Freigabe'), ('einsatzberichte/offene-berichte.html', 'Offene Berichte'),
                         ('einsatzberichte/jahresstatistik.html', 'Jahresstatistik'), ('einsatzberichte/einstellungen.html', 'Einstellungen')]),
    ('Infoterminal', [('infoterminal/start.html', 'Startbildschirm der Wache'), ('infoterminal/personen.html', 'Wer sind Sie? (Namen und Suche)'),
                      ('infoterminal/buchung.html', 'Eintragen mit Fahrzeug und Funktion'), ('infoterminal/buchung.html#bereitschaft', 'Eintragen mit Bereitschaft'),
('infoterminal/eingetragen.html', 'Eingetragene mit Ändern und Austragen'),
                      ('infoterminal/neuer-einsatz.html', 'Neuer Einsatz mit passenden Einsätzen'), ('infoterminal/dienst.html', 'Dienst eintragen'),
                      ('infoterminal/leer.html', 'Nichts offen'), ('infoterminal/gesperrt.html', 'Nicht freigeschaltet'),
                      ('infoterminal/verwaltung.html', 'Verwaltung der Infoterminals'), ('stammdaten/organisation.html#wache', 'Wache mit Infoterminal')]),
]

karten = ''.join(
    f'<section class="karte"><h2>{g}</h2><ul class="liste">' + ''.join(f'<li><a href="{p}">{t}</a><span class="rechts meta" translate="no">{p.split("/")[1]}</span></li>' for p, t in s) + '</ul></section>'
    for g, s in GRUPPEN)

html = kopf_html('Mockups Release 1', '') + f'''<body>
{mockup_hinweis('')}
<header class="kopf"><a class="marke" href="index.html"><img src="assets/logo.svg" alt="Wappen"><span><span class="kicker">Freiwillige Feuerwehr Musterstadt</span><span class="produkt">f.orga · Mockups Release 1</span></span></a><div style="margin-left:auto">{SPRACHE}</div></header>
<main class="inhalt" style="max-width:1100px;margin:0 auto">
<div class="seitenkopf"><h1>Mockups Release 1</h1></div>
<div class="meldung warnung"><span class="ic">!</span><span><strong>Status: zur Freigabe.</strong> Das Frontend einer App wird erst umgesetzt, wenn ihre Mockups freigegeben sind. Die Seiten zeigen Aufbau, Abläufe und Inhalte, keine Funktion. Alle Daten sind erfunden.</span></div>
<div class="raster drei">{karten}</div>
<p class="meta" style="margin-top:16px">Die Seiten sind auf Handybreite (375 px) geprüft. Zum Ansehen das Browserfenster schmal ziehen oder die Entwicklerwerkzeuge im Gerätemodus nutzen. Der Schalter DE/EN oben stellt die Sprache um.</p>
</main>
{FUSS}
</body>
</html>
'''
schreiben('index.html', html)

# Wörterbuch für den Sprachumschalter
with open(os.path.join(ZIEL, 'assets', 'i18n.js'), 'w', encoding='utf-8') as f:
    f.write('// Erzeugt von _generator/bauen.py aus _generator/uebersetzung.py. Nicht von Hand ändern.\n')
    f.write('window.FORGA_EN = ' + json.dumps(EN, ensure_ascii=False, indent=0, sort_keys=True) + ';\n')
    f.write('window.FORGA_EN_MUSTER = ' + json.dumps(MUSTER, ensure_ascii=False) + ';\n')


# ---------- Prüfungen ----------
class Texte(HTMLParser):
    """Sammelt Textknoten und übersetzbare Attribute wie mockup.js (ohne script/style/textarea/translate=no)."""
    LEER = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'col', 'area', 'base', 'wbr', 'path', 'circle', 'rect'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stapel = []
        self.texte = []

    def ausgeschlossen(self):
        return any(t in ('script', 'style', 'textarea', 'title', 'head') or no for t, no in self.stapel)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if not self.ausgeschlossen() or tag == 'title':
            for k in ('placeholder', 'title', 'aria-label', 'alt', 'data-label'):
                if a.get(k) and not self.ausgeschlossen():
                    self.texte.append(a[k])
        if tag not in self.LEER:
            self.stapel.append((tag, a.get('translate') == 'no'))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.LEER and self.stapel:
            self.stapel.pop()

    def handle_endtag(self, tag):
        for i in range(len(self.stapel) - 1, -1, -1):
            if self.stapel[i][0] == tag:
                del self.stapel[i:]
                break

    def handle_data(self, data):
        if not self.ausgeschlossen():
            self.texte.append(data)


def uebersetzbar(t):
    t = re.sub(r'\s+', ' ', t).strip()
    if not t or not re.search(r'[A-Za-zÄÖÜäöüß]{2,}', t):
        return None
    return t


def bekannt(t):
    if t in EN or t in GLEICH:
        return True
    return any(re.fullmatch(m, t) for m, _ in MUSTER)


fehler = 0
fehlend = {}
for wurzel, _, dateien in os.walk(ZIEL):
    if '_generator' in wurzel:
        continue
    for d in sorted(dateien):
        if not d.endswith('.html'):
            continue
        pfad = os.path.join(wurzel, d)
        text = open(pfad, encoding='utf-8').read()
        for ziel in re.findall(r'(?:href|src)="([^"#]+)', text):
            if ziel.startswith(('http', 'mailto')):
                continue
            if not os.path.exists(os.path.normpath(os.path.join(wurzel, ziel))):
                print('FEHLT', os.path.relpath(pfad, ZIEL), '->', ziel)
                fehler += 1
        p = Texte()
        p.feed(text)
        titel = re.search(r'<title>(.*?) · ', text)
        for t in p.texte + ([titel.group(1)] if titel else []):
            u = uebersetzbar(t)
            if u and not bekannt(u):
                fehlend.setdefault(u, os.path.relpath(pfad, ZIEL))

print('Linkfehler:', fehler)
print('Ohne Übersetzung:', len(fehlend))
if fehlend:
    with open(os.path.join(os.path.dirname(__file__), 'fehlende-uebersetzungen.txt'), 'w', encoding='utf-8') as f:
        for t, p in sorted(fehlend.items(), key=lambda x: (x[1], x[0])):
            f.write(f'{p}\t{t}\n')
    print('Liste: _generator/fehlende-uebersetzungen.txt')
else:
    try:
        os.remove(os.path.join(os.path.dirname(__file__), 'fehlende-uebersetzungen.txt'))
    except FileNotFoundError:
        pass
sys.exit(1 if fehler or fehlend else 0)
