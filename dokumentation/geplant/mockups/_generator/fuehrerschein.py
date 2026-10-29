"""Mockups Führerscheinkontrolle (Erweiterung der Stammdaten): Akte, Liste, Einstellungen, Selbstkontrolle am Infoterminal und in „Mein Bereich“.

Konzept: dokumentation/geplant/module/fuehrerscheinkontrolle.md
"""
from rahmen import seite, tabelle, dialog, sym
from infoterminal import tk

ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'
KEINE_KOPIE = ('<div class="meldung info"><span class="ic">i</span><span>Keine Kopie und kein Foto des Führerscheins speichern. '
               'Erfasst werden nur Klassen, Befristung, Datum und Prüfer.</span></div>')


def klasse_zeile(kl, bis, an=True):
    return (f'<tr><td><label class="schalter"><input type="checkbox"{" checked" if an else ""}> {kl}</label></td>'
            f'<td><input type="date" aria-label="gültig bis {kl}" value="{bis}"></td></tr>')


KLASSEN_TABELLE = ('<div class="tabelle-huelle"><table><thead><tr><th scope="col">Klasse</th><th scope="col">gültig bis</th></tr></thead><tbody>'
                   + klasse_zeile('B', '') + klasse_zeile('BE', '') + klasse_zeile('C1', '2031-04-16') + klasse_zeile('C1E', '2031-04-16')
                   + klasse_zeile('C', '2031-04-16') + klasse_zeile('CE', '2031-04-16') + klasse_zeile('T', '', False)
                   + '</tbody></table></div><p class="meta">Leer heißt unbefristet. Befristet sind vor allem C1, C1E, C und CE (alle 5 Jahre).</p>')

# ---------- Personalakte: Führerschein ----------
seite('stammdaten/person-fuehrerschein.html', 'Tobias Rief', '''
<section class="karte">
  <div class="akte-kopf">
    <div class="bild" aria-hidden="true">TR</div>
    <div style="flex:1;min-width:220px">
      <div class="neben">Löschmeister · Abt. Musterstadt (Stamm) · Führungsgruppe · Pers.-Nr. 1043</div>
      <div class="plaketten" style="margin-top:6px"><span class="plakette ok">aktiv</span><span class="plakette">Maschinist</span><span class="plakette ok">Führerschein kontrolliert</span></div>
    </div>
  </div>
</section>
<p class="meta">Ausschnitt aus dem Reiter „Feuerwehr“ der Personalakte (<a href="person.html">Personalakte</a>). Modus der Feuerwehr: anlassbezogen.</p>
<div class="raster seite">
  <section class="karte">
    <div class="karte-kopf"><h2>Führerschein</h2><div class="knopfreihe"><button type="button" class="knopf klein" data-dialog="d-vorlage">Erneute Vorlage anfordern …</button><button type="button" class="knopf primaer klein" data-dialog="d-kontrolle">Kontrolle erfassen …</button></div></div>
    ''' + tabelle(['Klasse', 'gültig bis', 'Stand'], [
        ['B, BE', 'unbefristet', '<span class="plakette ok">gültig</span>'],
        ['C1, C1E', '16.04.2031', '<span class="plakette ok">gültig</span>'],
        ['C, CE', '16.04.2031', '<span class="plakette ok">gültig</span>'],
    ]) + '''
    <dl class="daten" style="margin-top:12px">
      <dt>Ersterfassung</dt><dd>12.03.2021 · Original vorgelegt · Markus Vogt</dd>
      <dt>Letzte Kontrolle</dt><dd>16.04.2026 · Original vorgelegt · Markus Vogt</dd>
      <dt>Nächste Kontrolle</dt><dd>16.04.2031 (Ablauf C, CE) <span class="plakette grau">anlassbezogen</span></dd>
      <dt>Dokument gültig bis</dt><dd>16.04.2034</dd>
    </dl>
    <h3 style="margin-top:16px">Kontrollen</h3>
    ''' + tabelle(['Datum', 'Art', 'Prüfer', 'Klassen'], [
        ['16.04.2026', '<span class="plakette ok">Original vorgelegt</span><span class="unter-text">C/CE verlängert bis 16.04.2031</span>', 'Markus Vogt', 'B, BE, C1, C1E, C, CE'],
        ['14.10.2025', '<span class="plakette">Selbstkontrolle Transponder</span><span class="unter-text">Selbsterklärung bestätigt</span>', 'Infoterminal Tablet Fahrzeughalle', '–'],
        ['12.03.2021', '<span class="plakette ok">Original vorgelegt</span><span class="unter-text">Ersterfassung</span>', 'Markus Vogt', 'B, BE, C1, C1E, C, CE'],
        ['05.11.2019', '<span class="plakette grau">aus Altdaten</span>', 'unbekannt', 'B, BE, C, CE'],
    ], 'stapel') + '''
  </section>
  <section class="karte">
    <div class="karte-kopf"><h2>Transponder</h2></div>
    <dl class="daten"><dt>Art</dt><dd>NFC-Aufkleber</dd><dt>Kennung</dt><dd>…7F3A</dd><dt>registriert</dt><dd>12.03.2021 · Markus Vogt</dd></dl>
    <div class="knopfreihe" style="margin-top:8px"><button type="button" class="knopf klein" data-dialog="d-transponder">Ersetzen …</button><button type="button" class="knopf klein" data-dialog="d-sperren">Sperren …</button></div>
    <p class="meta" style="margin-top:12px">Selbstkontrolle ist bei Ihrer Feuerwehr ausgeschaltet (Modus anlassbezogen). Ein Scan zeigt am Infoterminal nur den Stand.</p>
    <h3 style="margin-top:16px">Erneute Vorlage</h3>
    <p class="meta">Keine offene Anforderung.</p>
  </section>
</div>''', nav='stammdaten/personen.html', brot=[('Stammdaten', None), ('Personen', 'stammdaten/personen.html'), ('Tobias Rief', 'stammdaten/person.html'), ('Führerschein', None)],
    dialoge=dialog('d-kontrolle', 'Führerscheinkontrolle erfassen', '''
<div class="felder zwei">
  <div class="feld"><label class="pflicht">Datum</label><input type="date" value="2026-10-28"></div>
  <div class="feld"><label class="pflicht">Prüfer</label><select><option>Markus Vogt</option><option>Stefan Eberle</option></select></div>
</div>
<label class="schalter"><input type="checkbox" checked> Original vorgelegt (Pflicht; eine Kopie oder ein Foto zählt nicht)</label>
<h3 style="margin-top:12px">Klassen wie auf dem Original</h3>
''' + KLASSEN_TABELLE + '''
<div class="feld"><label>Dokument gültig bis</label><input type="date" value="2034-04-16"><div class="hilfe">Feld 4b des Kartenführerscheins, optional</div></div>
<div class="feld"><label>Bemerkung</label><input type="text" placeholder="z. B. C/CE verlängert"></div>
<label class="schalter"><input type="checkbox"> Transponder oder Barcode jetzt registrieren</label>
''' + KEINE_KOPIE, ABBRECHEN + '<button class="knopf primaer" value="ok">Kontrolle speichern</button>')
    + dialog('d-vorlage', 'Erneute Vorlage anfordern', '''
<p class="neben">Bei konkreten Anhaltspunkten, z. B. Hinweis auf ein Fahrverbot, eine neu angegebene Klasse oder ein Unfall mit einem Dienstfahrzeug. Bis zur nächsten Kontrolle erscheint eine Aufgabe bei den Zuständigen.</p>
<div class="feld"><label class="pflicht">Grund</label><input type="text" placeholder="z. B. Hinweis auf Fahrverbot"><div class="hilfe">Sichtbar nur für Benutzer mit dem Recht „Führerscheine kontrollieren“.</div></div>
<div class="feld"><label class="pflicht">Vorlage bis</label><input type="date" value="2026-11-11"></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Anfordern</button>')
    + dialog('d-transponder', 'Transponder registrieren', '''
<p class="neben">Nur nach Sicht des Originals. Den Aufkleber auf dem Führerschein an das Lesegerät halten oder mit der Kamera scannen.</p>
<div class="feld"><label>Kennung</label><input type="text" placeholder="Lesegerät oder Handscanner schreibt hier"></div>
<div class="knopfreihe"><button type="button" class="knopf klein">''' + sym('qr') + '''Mit Kamera scannen</button><button type="button" class="knopf klein">RFID/NFC lesen</button></div>
<div class="meldung warnung" style="margin-top:12px"><span class="ic">!</span><span>Empfehlung: Siegel-Aufkleber verwenden, der beim Ablösen sichtbar zerstört wird. Gespeichert wird nur ein Prüfwert der Kennung, nicht die Kennung selbst. Der bisherige Transponder wird gesperrt.</span></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Registrieren</button>')
    + dialog('d-sperren', 'Transponder sperren?', '''
<p>Der Transponder …7F3A von Tobias Rief wird sofort gesperrt. Ein Scan zeigt danach „nicht registriert“.</p>
<div class="feld"><label class="pflicht">Grund</label><select><option>verloren</option><option>neuer Führerschein</option><option>Missbrauch vermutet</option><option>sonstiger Grund</option></select></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Sperren</button>', gefahr=True))

# ---------- Liste ----------
def z(name, abt, klassen, naechste, letzte, art, tr, stand, kl=''):
    letzte = f'{letzte} · {art}' if art != '–' else letzte
    zellen = [f'<a href="person-fuehrerschein.html">{name}</a>', abt, klassen, naechste, letzte, tr, stand,
              '<button type="button" class="knopf text klein" data-dialog="d-kontrolle">Kontrolle …</button>']
    return (kl, zellen) if kl else zellen


seite('stammdaten/fuehrerscheinkontrollen.html', 'Führerscheinkontrollen', '''
<div class="chips">
  <a class="chip aktiv" href="#" aria-current="true">Alle (64)</a><a class="chip" href="#">Überfällig (2)</a><a class="chip" href="#">Fällig in 30 Tagen (3)</a><a class="chip" href="#">Ersterfassung fehlt (4)</a><a class="chip" href="#">Vorlage angefordert (1)</a>
</div>
<div class="filter">
  <div class="feld breit"><label>Suche</label><input type="search" placeholder="Name"></div>
  <div class="feld"><label>Abteilung</label><select><option>Alle Ihre Abteilungen</option><option>Musterstadt</option><option>Birkenhain</option><option>Weidenhain</option></select></div>
  <div class="feld"><label>Letzte Kontrolle</label><select><option>alle Arten</option><option>Original vorgelegt</option><option>Selbstkontrolle</option></select></div>
</div>
''' + tabelle(['Name', 'Abteilung', 'Klassen', 'Nächste Befristung', 'Letzte Kontrolle', 'Transponder', 'Stand', ''], [
    z('Brenner, Lena', 'Weidenhain', 'B, C, CE', '04.11.2026 (CE)', '02.11.2021', 'Original', 'nein', '<span class="plakette gelb">fällig in 7 Tagen</span>'),
    z('Kunz, Ralf', 'Musterstadt', 'B, C, CE', '30.09.2026 (C, CE)', '01.10.2021', 'Original', 'ja', '<span class="plakette warn">überfällig</span>', 'warnung'),
    z('Bauer, Michael', 'Musterstadt', '–', '–', '–', '–', 'nein', '<span class="plakette warn">Klassen fehlen</span>', 'warnung'),
    z('Fischer, Jana', 'Musterstadt', 'B, C1', '18.06.2030 (C1)', '–', '–', 'nein', '<span class="plakette gelb">Ersterfassung fehlt</span>'),
    z('Eberle, Stefan', 'Birkenhain', 'B, BE, C, CE', '22.02.2029 (C, CE)', '22.02.2024', 'Original', 'nein', '<span class="plakette gelb">Vorlage angefordert bis 11.11.</span>'),
    z('Rief, Tobias', 'Musterstadt', 'B, BE, C1, C1E, C, CE', '16.04.2031 (C, CE)', '16.04.2026', 'Original', 'ja', '<span class="plakette ok">kontrolliert</span>'),
    z('Wagner, Carina', 'Eschenbrunn', 'B, C1', '03.03.2028 (C1)', '03.03.2023', 'Original', 'nein', '<span class="plakette ok">kontrolliert</span>'),
], 'stapel') + '''
<p class="meta" style="margin-top:10px">Zielgruppe: aktive Mitglieder und Mitglieder in Probezeit mit Klasse C1, C1E, C oder CE oder der Qualifikation Maschinist. Modus anlassbezogen: Kontrolle bei Ersterfassung, zum Ablauf einer befristeten Klasse und auf Anforderung.</p>''',
    brot=[('Stammdaten', None), ('Führerscheinkontrollen', None)],
    aktionen='<a class="knopf" href="listen.html">Nachweis für die Gemeinde (PDF)</a><a class="knopf" href="fuehrerschein-einstellungen.html">Einstellungen</a>',
    dialoge=dialog('d-kontrolle', 'Führerscheinkontrolle erfassen', '''
<p class="neben"><strong>Lena Brenner</strong> · Weidenhain · Klasse CE läuft am 04.11.2026 ab</p>
<div class="felder zwei">
  <div class="feld"><label class="pflicht">Datum</label><input type="date" value="2026-10-28"></div>
  <div class="feld"><label class="pflicht">Prüfer</label><select><option>Markus Vogt</option></select></div>
</div>
<label class="schalter"><input type="checkbox" checked> Original vorgelegt (Pflicht; eine Kopie oder ein Foto zählt nicht)</label>
''' + KLASSEN_TABELLE + KEINE_KOPIE, ABBRECHEN + '<button class="knopf primaer" value="ok">Kontrolle speichern</button>'))

# ---------- Einstellungen ----------
seite('stammdaten/fuehrerschein-einstellungen.html', 'Führerscheinkontrolle', '''
<div class="raster seite">
<div>
<section class="karte">
  <h2>Wann wird kontrolliert?</h2>
  <div class="wahl" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    <label><input type="radio" name="modus" checked><span>Anlassbezogen (Standard)<small>Einmal im Original bei der Ersterfassung, erneut zum Ablauf jeder befristeten Klasse und bei konkreten Anhaltspunkten (erneute Vorlage anfordern).</small></span></label>
    <label><input type="radio" name="modus"><span>Zusätzlich regelmäßig<small>Dazu eine Frist im festen Abstand. Empfehlung der DGUV Regel 105-049, keine Vorschrift.</small></span></label>
  </div>
  <div class="felder" style="margin-top:12px">
    <div class="feld"><label>Abstand (nur regelmäßig)</label><select disabled><option>6 Monate</option><option>12 Monate</option></select></div>
    <div class="feld"><label>Vorlauf der Fristen</label><select><option>14 Tage</option><option selected>30 Tage</option><option>60 Tage</option></select></div>
  </div>
  <div class="meldung info"><span class="ic">i</span><span>Hintergrund: R. Fischer, „Unnötige Bürokratie oder gesetzliche Pflicht? – die regelmäßige Führerscheinkontrolle in der Feuerwehr“, BRANDSCHUTZ 6/26, S. 489–491. Eine feste Prüffrist ist danach nicht vorgeschrieben; maßgeblich sind die einmalige Vorlage, befristete Klassen und konkrete Anhaltspunkte.</span></div>
</section>
<section class="karte">
  <h2>Wer wird überwacht?</h2>
  <div class="feld"><label>Überwachte Klassen</label><input type="text" value="C1, C1E, C, CE"><div class="hilfe">B und BE hinzunehmen, wenn Fahrzeuge der Klasse B im Einsatz gefahren werden.</div></div>
  <div class="feld"><label>Qualifikationen für Fahrer</label><input type="text" value="Maschinist"><div class="hilfe">Wer sie hat, wird überwacht, auch ohne eingetragene Klasse („Klassen fehlen“).</div></div>
  <p class="meta">Nur Personen in Probezeit oder aktiv. Jugendfeuerwehr, Altersabteilung und passive Mitglieder sind ausgenommen.</p>
</section>
<section class="karte">
  <h2>Selbstkontrolle mit Transponder oder Barcode</h2>
  <p class="neben">Nur im Modus „Zusätzlich regelmäßig“. Die Person scannt den registrierten Aufkleber auf ihrem Führerschein und bestätigt, dass der Führerschein gültig ist und kein Fahrverbot besteht.</p>
  <div class="schalter-liste">
    <label class="schalter"><input type="checkbox" disabled> Selbstkontrolle erlauben</label>
    <label class="schalter"><input type="checkbox" checked disabled> am Infoterminal der Wache</label>
    <label class="schalter"><input type="checkbox" disabled> in „Mein Bereich“ am eigenen Handy</label>
  </div>
  <div class="feld" style="margin-top:12px"><label>Original spätestens vorlegen alle</label><select disabled><option>6 Monate</option><option selected>12 Monate</option><option>24 Monate</option></select><div class="hilfe">Selbstkontrollen schieben diese Frist nicht hinaus.</div></div>
  <div class="meldung warnung"><span class="ic">!</span><span>Grenzen: Ein Aufkleber beweist nur, dass jemand den Aufkleber hat. Eine Entziehung der Fahrerlaubnis oder ein Fahrverbot erkennt er nicht, und NFC-Kennungen lassen sich kopieren. Selbstkontrollen erscheinen im Nachweis immer als solche.</span></div>
</section>
<div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
</div>
<section class="karte">
  <h2>Was entsteht</h2>
  <ul class="liste">
    <li><span><strong>Ersterfassung fehlt</strong><br><span class="meta">sobald jemand zur Zielgruppe gehört</span></span></li>
    <li><span><strong>Klasse läuft ab</strong><br><span class="meta">zum Ablauf jeder befristeten überwachten Klasse</span></span></li>
    <li><span><strong>Erneute Vorlage</strong><br><span class="meta">zum gesetzten Datum</span></span></li>
    <li><span><strong>Kontrolle fällig</strong><br><span class="meta">nur regelmäßig: letzte Kontrolle plus Abstand</span></span></li>
  </ul>
  <p class="meta">Zuständig ist, wer das Recht „Führerscheine kontrollieren“ für eine Abteilung der Person hat, standardmäßig Kommandant und Abteilungskommandant.</p>
</section>
</div>''', nav='shell/module.html', brot=[('Verwaltung', None), ('Module', 'shell/module.html'), ('Stammdaten', None), ('Führerscheinkontrolle', None)])

# ---------- Infoterminal: Selbstkontrolle ----------
tk('infoterminal/fuehrerschein.html', 'Führerschein kontrollieren', '''
<div class="tk-zentriert">
  <div class="symbol-gross">''' + sym('fuehrerschein') + '''</div>
  <h1>Führerschein an das Lesegerät halten</h1>
  <p class="neben">Den Aufkleber auf Ihrem Führerschein an das Lesegerät neben dem Bildschirm halten oder den Barcode vor die Kamera.</p>
  <p><a class="knopf gross" href="fuehrerschein-bestaetigen.html">Mit Kamera scannen</a></p>
  <p class="meta">Noch kein Aufkleber? Den Führerschein beim Kommandanten im Original vorzeigen; er registriert den Aufkleber dabei.</p>
</div>''', heim='start.html')

tk('infoterminal/fuehrerschein-bestaetigen.html', 'Führerschein kontrollieren', '''
<div class="tk-titel"><h1>Tobias Rief</h1><span class="meta">Abt. Musterstadt</span></div>
<section class="tk-abschnitt">
  <h2>Ihr Führerschein</h2>
  <dl class="daten"><dt>Klassen</dt><dd>B, BE, C1, C1E, C, CE</dd><dt>C, CE gültig bis</dt><dd>16.04.2031</dd><dt>Letzte Kontrolle</dt><dd>16.04.2026 · Original vorgelegt</dd></dl>
</section>
<section class="tk-abschnitt">
  <h2>Selbsterklärung</h2>
  <label class="schalter"><input type="checkbox"> Mein Führerschein ist gültig. Gegen mich besteht kein Fahrverbot und keine Entziehung der Fahrerlaubnis.</label>
  <p class="meta" style="margin:8px 0 0">Ansicht im Modus „Zusätzlich regelmäßig“ mit Selbstkontrolle. Gilt als Selbstkontrolle mit Transponder. Im Original vorzeigen spätestens bis 16.04.2027.</p>
</section>
<div class="tk-leiste"><a class="knopf" href="start.html">Das bin ich nicht</a><button type="button" class="knopf primaer gross" data-dialog="d-kontrolliert">Bestätigen</button></div>
''', dialoge=dialog('d-kontrolliert', 'Führerschein kontrolliert', '''
<div class="tk-erfolg"><div class="haken" aria-hidden="true">✓</div>
<p><strong>Tobias Rief</strong><br>Selbstkontrolle am 28.10.2026 um 14:32</p>
<p class="meta">Nächste Kontrolle fällig am 28.04.2027. Zurück zur Übersicht in 10 s.</p></div>''',
    '<a class="knopf primaer" href="start.html">Fertig</a>')
    + dialog('d-unbekannt', 'Nicht registriert', '''
<div class="tk-zentriert" style="margin:8px auto"><p>Dieser Führerschein ist nicht registriert. Bitte beim Kommandanten im Original vorzeigen.</p></div>''',
    '<a class="knopf primaer" href="start.html">Zurück zur Übersicht</a>'))

# ---------- Mein Bereich ----------
seite('shell/mein-fuehrerschein.html', 'Mein Bereich', '''
<section class="karte">
  <div class="karte-kopf"><h2>Mein Führerschein</h2><span class="plakette warn">Kontrolle überfällig</span></div>
  <dl class="daten"><dt>Klassen</dt><dd>B, BE, C1, C1E, C, CE</dd><dt>C, CE gültig bis</dt><dd>16.04.2031</dd><dt>Letzte Kontrolle</dt><dd>16.04.2026 · Original vorgelegt bei Markus Vogt</dd><dt>Nächste Kontrolle</dt><dd>16.10.2026 <span class="plakette warn">überfällig</span></dd></dl>
  <div class="knopfreihe" style="margin-top:12px"><button type="button" class="knopf primaer" data-dialog="d-selbst">Selbst kontrollieren</button></div>
  <p class="meta" style="margin-top:8px">Nur wenn Ihre Feuerwehr regelmäßige Kontrollen mit Selbstkontrolle eingestellt hat. Ihr Telefon liest den Aufkleber über NFC oder den Barcode über die Kamera.</p>
</section>
<p class="meta">Ausschnitt aus „Mein Bereich“; die übrigen Abschnitte (Personalakte, Dienste, Einsätze …) sind hier weggelassen.</p>''',
    nav='shell/start.html', brot=[('Übersicht', None), ('Mein Bereich', None)],
    dialoge=dialog('d-selbst', 'Führerschein selbst kontrollieren', '''
<div class="knopfreihe"><button type="button" class="knopf">RFID/NFC lesen</button><button type="button" class="knopf">''' + sym('qr') + '''Mit Kamera scannen</button></div>
<div class="meldung ok" style="margin-top:12px"><span class="ic">✓</span><span>Transponder …7F3A erkannt.</span></div>
<label class="schalter"><input type="checkbox"> Mein Führerschein ist gültig. Gegen mich besteht kein Fahrverbot und keine Entziehung der Fahrerlaubnis.</label>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Bestätigen</button>'))
