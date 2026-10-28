"""Gemeinsamer Seitenrahmen der Mockups (Kopf, Seitenleiste, Fußzeile) und Bausteine."""
import os
import re

ZIEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Einfarbige Strichsymbole (24 × 24, currentColor). Bewusst keine Emoji: die färben sich je Gerät anders.
SYMBOLE = {
    'start': '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    'einsatz': '<path d="M2 17V7h11v10"/><path d="M13 10h5l3 4v3h-2"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/>',
    'pruefung': '<path d="M4 12l5 5L20 6"/>',
    'offen': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
    'statistik': '<path d="M4 20V11M10 20V5M16 20v-7M2 20h20"/>',
    'einstellungen': '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    'person': '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    'organisation': '<rect x="9" y="3" width="6" height="5"/><rect x="3" y="16" width="6" height="5"/><rect x="15" y="16" width="6" height="5"/><path d="M12 8v4M6 16v-4h12v4"/>',
    'fahrzeug': '<path d="M3 16V8h10v8M13 11h4l4 4v1"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5 5h6"/>',
    'lehrgang': '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    'listen': '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h1M4 12h1M4 18h1"/>',
    'import': '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v5h16v-5"/>',
    'benutzer': '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.5.5 4 2.5 4 5.5"/>',
    'rollen': '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    'module': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    'token': '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4"/>',
    'glocke': '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    'menue': '<path d="M4 6h16M4 12h16M4 18h16"/>',
    'suche': '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    'schloss': '<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    'abmelden': '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    'schliessen': '<path d="M6 6l12 12M18 6L6 18"/>',
    'terminal': '<rect x="4" y="3" width="16" height="13" rx="1"/><path d="M9 21h6M12 16v5"/><path d="M8 8h3M8 11h8"/>',
    'qr': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3"/>',
}


def sym(name, klasse='sym'):
    return f'<svg class="{klasse}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{SYMBOLE[name]}</svg>'


NAVIGATION = [
    ('Übersicht', [
        ('shell/start.html', 'start', 'Startseite', None),
    ]),
    ('Einsatzberichte', [
        ('einsatzberichte/einsaetze.html', 'einsatz', 'Einsätze', None),
        ('einsatzberichte/pruefung.html', 'pruefung', 'Zur Prüfung', '4'),
        ('einsatzberichte/offene-berichte.html', 'offen', 'Offene Berichte', '7'),
        ('einsatzberichte/jahresstatistik.html', 'statistik', 'Jahresstatistik', None),
        ('einsatzberichte/einstellungen.html', 'einstellungen', 'Einstellungen', None),
    ]),
    ('Stammdaten', [
        ('stammdaten/personen.html', 'person', 'Personen', None),
        ('stammdaten/organisation.html', 'organisation', 'Organisation', None),
        ('stammdaten/fahrzeug.html', 'fahrzeug', 'Fahrzeuge', None),
        ('stammdaten/lehrgangsplanung.html', 'lehrgang', 'Lehrgangsplanung', None),
        ('stammdaten/listen.html', 'listen', 'Listen', None),
        ('stammdaten/import.html', 'import', 'Import', None),
    ]),
    ('Verwaltung', [
        ('shell/benutzer.html', 'benutzer', 'Benutzer', None),
        ('shell/rollen.html', 'rollen', 'Rollen', None),
        ('shell/module.html', 'module', 'Module', None),
        ('shell/api-tokens.html', 'token', 'API-Tokens', None),
        ('infoterminal/verwaltung.html', 'terminal', 'Infoterminals', None),
        ('shell/einstellungen.html', 'einstellungen', 'Einstellungen', None),
    ]),
]

FUSS = '''<footer class="fuss">
  <p>Freiwillige Feuerwehr Musterstadt · Feuerwehrstraße 1 · 12345 Musterstadt</p>
  <p>Telefon 01234/5678-0 · Fax 01234/5678-99 · www.feuerwehr-musterstadt.example</p>
</footer>'''

SPRACHE = '''<div class="sprache" role="group" aria-label="Sprache">
  <button type="button" data-sprache="de" aria-pressed="true" lang="de" title="Deutsch">DE</button><button type="button" data-sprache="en" aria-pressed="false" lang="en" title="English">EN</button>
</div>'''


def mockup_hinweis(p):
    return f'<div class="mockup-hinweis">Mockup · nicht funktionsfähig · <a href="{p}index.html">Übersicht aller Mockups</a></div>'


def seitenleiste(pfad, p):
    teile = ['<nav class="seitenleiste" id="hauptmenue" aria-label="Hauptnavigation">',
             f'''<div class="nur-mobil menue-kopf">
  <div class="benutzer-zeile"><span class="avatar">MV</span><span><strong>Markus Vogt</strong><br><span class="meta">Kommandant</span></span></div>
  <div class="menue-sprache"><span class="meta">Sprache</span>{SPRACHE}</div>
  <a href="{p}shell/anmeldung.html">{sym('abmelden')}Abmelden</a>
</div>''']
    for gruppe, eintraege in NAVIGATION:
        teile.append(f'<div class="gruppe">{gruppe}</div>')
        for ziel, ic, titel, zahl in eintraege:
            aktiv = ' class="aktiv" aria-current="page"' if ziel == pfad else ''
            z = f'<span class="zahl">{zahl}</span>' if zahl else ''
            teile.append(f'<a href="{p}{ziel}"{aktiv}>{sym(ic)}<span>{titel}</span>{z}</a>')
    teile.append('</nav>')
    return '\n'.join(teile)


def kopf_html(titel, p):
    return f'''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titel} · f.orga</title>
<link rel="stylesheet" href="{p}assets/mockup.css">
<script src="{p}assets/i18n.js" defer></script>
<script src="{p}assets/mockup.js" defer></script>
</head>
'''


def schreiben(pfad, html):
    ziel = os.path.join(ZIEL, pfad)
    os.makedirs(os.path.dirname(ziel), exist_ok=True)
    with open(ziel, 'w', encoding='utf-8') as f:
        f.write(html)


def beschriften(html, praefix):
    """Verknüpft <label>Text</label> mit dem direkt folgenden Feld (for/id), damit Screenreader und Klick aufs Label funktionieren."""
    zaehler = [0]

    def ersetzen(m):
        if ' id="' in m.group(3):
            return m.group(0)
        zaehler[0] += 1
        fid = f'{praefix}{zaehler[0]}'
        return f'<label for="{fid}"{m.group(1)}>{m.group(2)}</label><{m.group(3)} id="{fid}"'
    return re.sub(r'<label((?: class="[^"]*")?)>([^<]+)</label>\s*<((?:input|select|textarea)\b[^>]*?)(?=[ >/])', ersetzen, html)


def seite(pfad, titel, inhalt, *, nav=None, brot=None, aktionen='', ohne_rahmen=False, dialoge='', titel_zusatz=''):
    """Schreibt eine Seite. `pfad` relativ zum Mockup-Ordner, `nav` markiert den aktiven Menüpunkt."""
    tiefe = pfad.count('/')
    p = '../' * tiefe
    inhalt = beschriften(inhalt.replace('{P}', p), 'f')
    aktionen = aktionen.replace('{P}', p)
    dialoge = beschriften(dialoge.replace('{P}', p), 'd')
    kopf = kopf_html(titel, p)
    if ohne_rahmen:
        html = kopf + '<body>\n' + inhalt + '\n' + dialoge + '\n</body>\n</html>\n'
    else:
        brot_html = ''
        if brot:
            links = ' <span aria-hidden="true">›</span> '.join(f'<a href="{p}{z}">{t}</a>' if z else f'<span>{t}</span>' for t, z in brot)
            brot_html = f'<nav class="brotkrumen" aria-label="Pfad">{links}</nav>'
        akt = f'<div class="aktionen">{aktionen}</div>' if aktionen else ''
        html = kopf + f'''<body>
<a class="sprung" href="#inhalt">Zum Inhalt springen</a>
{mockup_hinweis(p)}
<header class="kopf">
  <button type="button" class="symbol-knopf menue-knopf" aria-label="Menü" aria-controls="hauptmenue" aria-expanded="false">{sym('menue')}</button>
  <a class="marke" href="{p}shell/start.html">
    <img src="{p}assets/logo.svg" alt="Wappen">
    <span><span class="kicker">Freiwillige Feuerwehr Musterstadt</span><span class="produkt">f.orga</span></span>
  </a>
  <form class="suche" role="search" action="#"><label class="unsichtbar" for="globale-suche">Suchen</label>{sym('suche')}<input id="globale-suche" type="search" placeholder="Personen, Fahrzeuge, Einsätze suchen"></form>
  <div class="werkzeuge">
    <button type="button" class="symbol-knopf such-knopf" aria-label="Suchen">{sym('suche')}</button>
    <a class="symbol-knopf" href="{p}shell/start.html#aufgaben" aria-label="Aufgaben (5)" title="Aufgaben">{sym('glocke')}<span class="zahl" aria-hidden="true">5</span></a>
    <div class="nicht-mobil">{SPRACHE}</div>
    <details class="benutzermenue nicht-mobil">
      <summary><span class="avatar">MV</span><span class="name">M. Vogt<small>Kommandant</small></span></summary>
      <div class="menue-liste">
        <a href="{p}shell/benutzer.html">Mein Profil</a>
        <a href="{p}shell/benutzer.html">Passwort ändern</a>
        <a href="{p}shell/anmeldung.html">{sym('abmelden')}Abmelden</a>
      </div>
    </details>
  </div>
</header>
<div class="rahmen">
{seitenleiste(nav or pfad, p)}
<main class="inhalt" id="inhalt">
<div class="seitenkopf"><div>{brot_html}<h1>{titel}{titel_zusatz}</h1></div>{akt}</div>
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


def _ohne_tags(s):
    return re.sub(r'<[^>]+>', '', s).strip()


def tabelle(kopf, zeilen, klasse=''):
    """kopf: Spaltentitel (Präfix '>' = rechtsbündig). zeilen: Liste von (klasse, [zellen]) oder [zellen].
    Klasse 'stapel': auf dem Handy wird jede Zeile zur Karte mit Beschriftung je Feld."""
    th = ''.join(f'<th class="zahl" scope="col">{k[1:]}</th>' if k.startswith('>') else f'<th scope="col">{k}</th>' for k in kopf)
    rechts = [k.startswith('>') for k in kopf]
    namen = [_ohne_tags(k.lstrip('>')) for k in kopf]
    body = []
    for z in zeilen:
        if isinstance(z, tuple):
            kl, zellen = z
        else:
            kl, zellen = '', z
        tds = ''
        for i, c in enumerate(zellen):
            attr = f' data-label="{namen[i]}"' if namen[i] else ''
            if 'stapel' in klasse and attr:
                c = f'<div class="zelle">{c}</div>'
            tds += f'<td class="zahl"{attr}>{c}</td>' if rechts[i] else f'<td{attr}>{c}</td>'
        body.append(f'<tr class="{kl}">{tds}</tr>' if kl else f'<tr>{tds}</tr>')
    return f'<div class="tabelle-huelle"><table class="{klasse}"><thead><tr>{th}</tr></thead><tbody>{"".join(body)}</tbody></table></div>'


def dialog(id_, titel, inhalt, aktionen, *, gefahr=False):
    """Bestätigungs- oder Bearbeitungsdialog. Öffnen über ein Element mit data-dialog="id"."""
    return f'''<dialog class="dialog{' gefahr' if gefahr else ''}" id="{id_}" aria-labelledby="{id_}-titel">
  <form method="dialog">
    <div class="dialog-kopf"><h2 id="{id_}-titel">{titel}</h2><button class="symbol-knopf" value="abbrechen" aria-label="Schließen">{sym('schliessen')}</button></div>
    <div class="dialog-inhalt">{inhalt}</div>
    <div class="dialog-fuss">{aktionen}</div>
  </form>
</dialog>'''


def leer(titel, text, aktion=''):
    """Leerer Zustand: sagt, was hier erscheinen wird und wie es dazu kommt."""
    return f'<div class="leer"><strong>{titel}</strong><p>{text}</p>{aktion}</div>'
