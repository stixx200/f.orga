"""Mockups des Moduls MP-Feuer (`mp-feuer`): Datenübernahme aus MP-Feuer-Transferdateien als Hintergrundlauf, eigene
Zuordnungsliste, Export-Platzhalter. Dazu der Tabellen-Import des Core mit seiner Zuordnungsliste."""
from rahmen import sym, tabelle, dialog, seite

ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'
O = 'mp-feuer/'
BROT = [('Verwaltung', None), ('MP-Feuer', None)]

REITER = [('start.html', 'Übersicht'), ('uebernahme.html', 'Neue Übernahme'), ('verlauf.html', 'Verlauf'), ('zuordnungen.html', 'Zuordnungen'),
          ('export.html', 'Export nach MP-Feuer'), ('einstellungen.html', 'Einstellungen')]
UEBERNAHME = {'uebernahme.html', 'probelauf.html', 'zuordnung.html', 'lauf.html', 'ergebnis.html'}


def mseite(pfad, inhalt, *, dialoge='', aktionen=''):
    """Seite des Moduls im Shell-Rahmen: Menüpunkt „Verwaltung → MP-Feuer“, Reiter zwischen den Seiten des Moduls."""
    aktiv = 'uebernahme.html' if pfad in UEBERNAHME else pfad
    reiter = '<nav class="reiter" aria-label="Seiten des Moduls MP-Feuer">' + ''.join(
        f'<a href="{z}"' + (' class="aktiv" aria-current="page"' if z == aktiv else '') + f'>{t}</a>' for z, t in REITER) + '</nav>'
    seite(O + pfad, 'MP-Feuer', reiter + inhalt, nav=O + 'start.html', brot=BROT, dialoge=dialoge, aktionen=aktionen)


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


# ---------- Übersicht ----------
mseite('start.html', '''
<div class="meldung info"><span class="ic">i</span><span>Das Modul übernimmt MP-Feuer-Transferdateien (<code translate="no">MPTRA_*.zip</code>) in f.orga. Es läuft im Hintergrund und in Teilen; die Seite darf während einer Übernahme geschlossen werden. Nach der Umstellung auf f.orga wird das Modul in der Modulverwaltung abgeschaltet.</span></div>
<div class="raster drei" style="margin-bottom:24px">
  <a class="kachel" href="ergebnis.html"><div class="wert">4</div><div class="titel">Fehler der letzten Übernahme</div><div class="unter">Übernommen 19.10.2026 19:12 · 7 Archive · 1 412 neu, 2 830 geändert, 4 Fehler</div></a>
  <a class="kachel" href="zuordnungen.html"><div class="wert">86</div><div class="titel">Gemerkte Zuordnungen</div><div class="unter">davon 1 mit gelöschtem Ziel</div></a>
  <a class="kachel" href="verlauf.html"><div class="wert">12</div><div class="titel">Läufe</div><div class="unter">seit 01.09.2026</div></a>
</div>
<div class="raster seite">
<section class="karte">
  <div class="karte-kopf"><h2>Stand</h2><span class="plakette gelb">Einsatzberichte führt: MP-Feuer</span></div>
  <dl class="daten">
    <dt>Letzte Übernahme</dt><dd>19.10.2026 19:12 von Markus Vogt · <a href="ergebnis.html">Bericht</a></dd>
    <dt>Laufender Lauf</dt><dd>keiner</dd>
    <dt>Freigaben melden ab</dt><dd>01.10.2026</dd>
  </dl>
  <h3 style="margin-top:16px">Datensätze</h3>
  <ul class="liste">
    <li><span class="plakette ok">verfügbar</span><span>Personen, Lehrgänge, G26, Belastungsübungen, Dienste, Einsatzpersonal</span></li>
  </ul>
  <p class="meta" style="margin-top:8px">Ein Datensatz ist gesperrt, wenn sein Modul nicht aktiv ist oder Ihnen das Recht seines Importprofils fehlt.</p>
</section>
<section class="karte">
  <h2>Wöchentliche Routine</h2>
  <ol style="margin:0 0 12px;padding-left:20px">
    <li>In MP-Feuer die Transferdateien aller Abteilungen exportieren.</li>
    <li>Hier hochladen, Probelauf, offene Bezeichnungen zuordnen, übernehmen.</li>
    <li>Kostenbescheide und Auszahlungslauf in f.orga.</li>
  </ol>
  <a class="knopf primaer voll" href="uebernahme.html">Neue Übernahme</a>
</section>
</div>''')


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


mseite('uebernahme.html', schritte(1) + '''
<section class="karte">
  <div class="ablage">''' + sym('import') + '''<strong>MPTRA-Dateien hierher ziehen</strong><span class="meta">oder</span>
    <div class="knopfreihe" style="justify-content:center"><button type="button" class="knopf sekundaer">Dateien wählen</button></div>
    <span class="meta">Transferdateien von MP-Feuer, je Abteilung eine. Höchstens 40 Dateien, je 200 MB.</span></div>
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Erkannte Archive (7)</h2><span class="meta">Zuordnung je Archivnummer gemerkt</span></div>
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
<div class="aktionsleiste"><a class="knopf" href="start.html">Abbrechen</a><a class="knopf primaer" href="probelauf.html">Weiter zu den Datensätzen</a></div>
''')


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


mseite('probelauf.html', schritte(2) + '''
<div class="meldung ok"><span class="ic">✓</span><span><strong>Probelauf fertig</strong> (26.10.2026 19:04, 41 s). Nichts wurde geändert. 9 Bezeichnungen sind offen, 4 Zeilen haben Fehler.</span></div>
<section class="karte">
  <div class="karte-kopf"><h2>Datensätze</h2><span class="meta">Reihenfolge: erst Personen, dann was auf sie verweist</span></div>
  ''' + tabelle(['Datensatz', '>Zeilen', 'Optionen', 'Probelauf'], [
      satz('1', 'Personen', '236', [('Vorhandene Personen aktualisieren', False)], zaehl(3, 0, 233, 0)),
      satz('2', 'Lehrgänge, Dienstgrade, Ehrungen', '1 904', [], zaehl(12, 0, 1890, 0, 5)),
      satz('3', 'G26-Untersuchungen', '402', [], zaehl(4, 0, 398, 0)),
      satz('4', 'Belastungsübungen', '611', [], zaehl(9, 0, 602, 0)),
      satz('5', 'Dienste', '2 118', [], zaehl(31, 2, 2085, 0, 1), an=False),
      satz('6', 'Einsatzpersonal', '4 806', [('Unbekannte Stichworte anlegen', True)], zaehl(118, 46, 4638, 4, 3)),
  ], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Auswahl und Optionen werden mit der Übernahme gemerkt. „Vorhandene Personen aktualisieren“ ist aus, damit f.orga für Personen führend bleibt.</p>
</section>
<div class="aktionsleiste"><span class="status">Datensätze mit mehr als 2 000 Zeilen laufen in Teilen</span><a class="knopf" href="uebernahme.html">Zurück</a><button type="button" class="knopf">Erneut prüfen</button><a class="knopf primaer" href="zuordnung.html">Weiter zur Zuordnung (9)</a></div>
''')


# ---------- Schritt 3: Nicht zugeordnete Bezeichnungen ----------
def offen(wert, art, anzahl, gewaehlt, optionen, anlegen=True):
    opt = '<option value="">– ignorieren –</option>' + ''.join(f'<option{" selected" if o == gewaehlt else ""}>{o}</option>' for o in optionen)
    neu = '<button type="button" class="knopf text klein" data-dialog="d-neu">Neuen Eintrag anlegen</button>' if anlegen else ''
    return ('' if gewaehlt else 'warnung', [
        f'<strong translate="no">{wert}</strong>', art, f'<span translate="no">{anzahl}</span>',
        f'<select aria-label="Eintrag für {wert}">{opt}</select>{neu}',
    ])


FUNKTIONEN = ['Gruppenführer', 'Maschinist', 'Truppführer', 'Truppmann', 'Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn', 'Keine Funktion – Verdienstausfall', 'Keine Funktion (ignorieren)']
mseite('zuordnung.html', schritte(3) + '''
<section class="karte">
  <div class="karte-kopf"><h2>Nicht zugeordnete Bezeichnungen</h2>
    <div class="chips" role="group" aria-label="Art filtern"><button type="button" class="chip aktiv">Alle (9)</button><button type="button" class="chip">Lehrgänge (4)</button><button type="button" class="chip">Ehrungen (1)</button><button type="button" class="chip">Diensttypen (1)</button><button type="button" class="chip">Funktionen (1)</button><button type="button" class="chip">Fahrzeuge (1)</button><button type="button" class="chip">Alarmstichworte (1)</button></div></div>
  <p class="neben">Diese Werte aus MP-Feuer passen zu keinem Eintrag und stehen nicht in den Zuordnungen des Moduls. Wählen Sie einen Eintrag oder legen Sie einen an; leer heißt ignorieren. Die Zuordnung gilt für alle Datensätze dieses Laufs. Mit der Übernahme kommt sie in die <a href="zuordnungen.html">Zuordnungen des Moduls</a>; die Einträge selbst bleiben unverändert.</p>
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
  <p class="meta" style="margin-top:8px">Fahrzeuge werden in der Organisation angelegt, hier nur gewählt.</p>
</section>
<div class="meldung warnung"><span class="ic">!</span><span><strong>Warnung:</strong> Zuordnungen geändert. Bitte erneut prüfen, bevor übernommen wird.</span></div>
<div class="aktionsleiste"><span class="status">6 von 9 zugeordnet</span><a class="knopf" href="probelauf.html">Zurück</a><button type="button" class="knopf sekundaer">Erneut prüfen</button><a class="knopf primaer" href="lauf.html">Übernehmen …</a></div>
''', dialoge=dialog('d-neu', 'Neuen Eintrag anlegen', '''
<p class="neben">Legt einen Lehrgang an und ordnet „Drohnenpilot“ ihm zu.</p>
<div class="feld"><label class="pflicht">Bezeichnung</label><input type="text" value="Drohnenpilot"></div>
<div class="feld"><label class="pflicht">Schlüssel</label><input type="text" value="drohnenpilot" translate="no"></div>
<p class="meta">Braucht das Recht <code translate="no">masterdata.catalogs.manage</code>. Name auf Englisch und weitere Angaben lassen sich danach im Katalog ergänzen.</p>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Anlegen und zuordnen</button>'))


# ---------- Schritt 4: Übernehmen mit Fortschritt ----------
def fortschritt(name, prozent, text, plakette):
    return f'''<li class="fortschritt"><div class="fortschritt-kopf"><strong>{name}</strong>{plakette}</div>{balken(prozent, name)}<span class="meta">{text}</span></li>'''


mseite('lauf.html', schritte(4) + '''
<section class="karte">
  <div class="karte-kopf"><h2>Übernahme läuft im Hintergrund</h2><span class="meta">gestartet 19:06 von Markus Vogt</span></div>
  <ul class="liste">
  ''' + fortschritt('1 Personen', 100, '236 Zeilen in 1 Teil · 4 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('2 Lehrgänge, Dienstgrade, Ehrungen', 100, '1 904 Zeilen in 1 Teil · 9 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('3 G26-Untersuchungen', 100, '402 Zeilen in 1 Teil · 2 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('4 Belastungsübungen', 100, '611 Zeilen in 1 Teil · 3 s', '<span class="plakette ok">fertig</span>')
      + fortschritt('6 Einsatzpersonal', 66, 'Teil 2 von 3 · 3 180 von 4 806 Zeilen · noch etwa 20 s', '<span class="plakette gelb">läuft</span>') + '''
  </ul>
  <p class="meta" style="margin-top:8px">Jeder Teil wird in einer eigenen Transaktion übernommen. Einsätze werden nie auf zwei Teile verteilt. Ein abgebrochener oder unterbrochener Lauf lässt die fertigen Teile stehen; ein neuer Lauf mit denselben Dateien ergänzt den Rest, ohne zu verdoppeln.</p>
</section>
<div class="aktionsleiste"><span class="status">Die Seite darf geschlossen werden; der Lauf geht weiter.</span><button type="button" class="knopf" data-dialog="d-abbrechen">Abbrechen …</button><a class="knopf primaer" href="ergebnis.html">Zum Ergebnis</a></div>
''', dialoge=dialog('d-abbrechen', 'Übernahme abbrechen?', '<p>Der laufende Teil wird noch fertig übernommen, danach hält der Lauf an. Bereits übernommene Teile bleiben bestehen.</p>',
                   '<button class="knopf" value="abbrechen">Weiter übernehmen</button><button class="knopf primaer" value="ok">Nach diesem Teil anhalten</button>', gefahr=True))


# ---------- Schritt 5: Ergebnis ----------
mseite('ergebnis.html', schritte(5) + '''
<div class="meldung ok"><span class="ic">✓</span><span><strong>Übernommen</strong> am 26.10.2026 19:07 in 52 s. 4 Zeilen mit Fehlern wurden übersprungen. 6 neue Zuordnungen gemerkt.</span></div>
<section class="karte">
  <div class="karte-kopf"><h2>Ergebnis je Datensatz</h2><div class="knopfreihe"><a class="knopf klein" href="#">Als CSV herunterladen</a><a class="knopf klein" href="{P}einsatzberichte/einsaetze.html">Einsätze</a></div></div>
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
<div class="aktionsleiste"><a class="knopf" href="verlauf.html">Zum Verlauf</a><a class="knopf primaer" href="start.html">Fertig</a></div>
''')


# ---------- Verlauf ----------
mseite('verlauf.html', tabelle(['Zeitpunkt', 'Benutzer', 'Dateien', 'Ergebnis', ''], [
    ['26.10.2026 19:06', 'Markus Vogt', '6 Archive', '<span class="plakette ok">übernommen</span> <span class="meta">134 neu · 46 geändert · 4 Fehler</span>', '<a class="knopf klein" href="ergebnis.html">Bericht</a>'],
    ['26.10.2026 19:04', 'Markus Vogt', '6 Archive', '<span class="plakette grau">Probelauf</span> <span class="meta">9 offene Bezeichnungen</span>', '<a class="knopf klein" href="probelauf.html">Bericht</a>'],
    ('warnung', ['21.10.2026 20:15', 'Sabine Keller', '7 Archive', '<span class="plakette warn">unterbrochen</span> <span class="meta">Neustart des Servers nach Teil 2 von 3, Einsatzpersonal</span>', '<a class="knopf klein" href="ergebnis.html">Bericht</a>']),
    ['19.10.2026 19:12', 'Markus Vogt', '7 Archive', '<span class="plakette ok">übernommen</span> <span class="meta">1 412 neu · 2 830 geändert · 4 Fehler</span>', '<a class="knopf klein" href="ergebnis.html">Bericht</a>'],
    ['12.10.2026 18:55', 'Markus Vogt', '7 Archive', '<span class="plakette warn">abgebrochen</span> <span class="meta">nach Teil 1 von 3, Einsatzpersonal</span>', '<a class="knopf klein" href="ergebnis.html">Bericht</a>'],
], 'stapel') + '''
<p class="meta" style="margin-top:8px">Läufe und Berichte bleiben gespeichert; die gelesenen Zeilen werden nach der Übernahme, spätestens nach 7 Tagen gelöscht. Jede Übernahme steht im Audit-Log.</p>
''')


# ---------- Zuordnungsliste des Moduls ----------
def zuordnung_zeile(wert, art, ziel, zuletzt, von, zustand=''):
    z = {'': '', 'geloescht': ' <span class="plakette warn">Ziel gelöscht</span>', 'inaktiv': ' <span class="plakette gelb">Ziel inaktiv</span>'}[zustand]
    return ('warnung' if zustand else '', [f'<strong translate="no">{wert}</strong>', art, f'{ziel}{z}', zuletzt, von,
                                           '<button type="button" class="knopf klein" style="white-space:nowrap" data-dialog="d-loeschen">Löschen …</button>'])


ZUORDNUNGEN = tabelle(['Bezeichnung', 'Art', 'Eintrag in f.orga', 'Zuletzt benutzt', 'Angelegt von', ''], [
    zuordnung_zeile('Erste Hilfe', 'Lehrgang', 'Anderer Lehrgang', '26.10.2026', 'Markus Vogt'),
    zuordnung_zeile('TM 1', 'Lehrgang', 'Truppmann Teil 1', '26.10.2026', 'Markus Vogt'),
    zuordnung_zeile('Arbeitszeit Stadt Musterstadt', 'Funktion', 'Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn', '26.10.2026', 'Markus Vogt'),
    zuordnung_zeile('B 2 BMA', 'Alarmstichwort', 'B2 BMA', '26.10.2026', 'Sabine Keller'),
    zuordnung_zeile('Gerätewartung', 'Diensttyp', 'Wartung', '19.10.2026', 'Sabine Keller'),
    zuordnung_zeile('LF 8', 'Fahrzeug', 'LF 8/6 · Florian Musterstadt 1/42 (Musterstadt)', '19.10.2026', 'Markus Vogt', 'geloescht'),
    zuordnung_zeile('Leistungsabzeichen Bronze', 'Ehrung', 'Leistungsabzeichen Stufe I', '12.10.2026', 'Markus Vogt', 'inaktiv'),
], 'stapel')

FILTER = '''<div class="filter knopfreihe" style="margin-bottom:16px;align-items:flex-end">
  <div class="feld" style="margin:0;min-width:220px"><label>Suchen</label><input type="search" placeholder="Bezeichnung oder Eintrag"></div>
  <div class="feld" style="margin:0"><label>Art</label><select><option>Alle Arten</option><option>Lehrgang</option><option>Dienstgrad</option><option>Ehrung</option><option>Funktion</option><option>Fahrzeug</option><option>Alarmstichwort</option><option>Diensttyp</option></select></div>
  <label class="schalter"><input type="checkbox"> Nur Ziel gelöscht oder inaktiv (2)</label>
</div>'''

LOESCHEN = dialog('d-loeschen', 'Zuordnung löschen?', '<p>„LF 8“ → LF 8/6 wird vergessen. Beim nächsten Lauf erscheint „LF 8“ wieder unter „Nicht zugeordnete Bezeichnungen“. Bereits übernommene Daten bleiben unverändert.</p>',
                  ABBRECHEN + '<button class="knopf primaer" value="ok">Löschen</button>', gefahr=True)

mseite('zuordnungen.html', '''
<p class="neben">Zuordnungen, die bei Übernahmen aus MP-Feuer gewählt wurden. Sie gelten nur für dieses Modul; der Tabellen-Import hat eine eigene Liste. Die Einträge in Katalogen, Fahrzeugen, Stichworten und Diensttypen bleiben unverändert.</p>
''' + FILTER + ZUORDNUNGEN + '''
<div class="meldung warnung" style="margin-top:16px"><span class="ic">!</span><span><strong>Warnung:</strong> 2 Zuordnungen zeigen auf ein gelöschtes oder inaktives Ziel. Sie werden beim Import nicht angewandt; die Bezeichnung erscheint wieder als offen.</span></div>
''', dialoge=LOESCHEN)


# ---------- Einstellungen ----------
mseite('einstellungen.html', tabelle(['Archivnummer', 'Einheit im Dateinamen', 'Abteilung', 'Einsatzberichte als', 'Zuletzt'], [
    ['<span translate="no">01</span>', 'Abt. Musterstadt', 'Abt. Musterstadt', 'Abteilungsbericht', '26.10.2026'],
    ['<span translate="no">02</span>', 'Abt. Ahornfeld', 'Abt. Ahornfeld', 'Abteilungsbericht', '26.10.2026'],
    ['<span translate="no">90</span>', 'Gesamtfeuerwehr', 'Gesamtwehr', 'Einsatzleiter vom Dienst (EvD)', '26.10.2026'],
    ('grau', ['<span translate="no">99</span>', 'Sonderdienste', '<span class="plakette grau">übersprungen</span>', '–', '26.10.2026']),
], 'stapel') + '''
<section class="karte" style="margin-top:16px">
  <h2>Datensätze und Optionen</h2>
  <ul class="liste"><li><span><strong>Gewählt</strong><br>Personen, Lehrgänge, G26, Belastungsübungen, Einsatzpersonal</span></li><li><span>Vorhandene Personen aktualisieren</span><span class="rechts">aus</span></li><li><span>Unbekannte Stichworte anlegen</span><span class="rechts">an</span></li></ul>
  <p class="meta" style="margin-top:12px">Gemerkt wird mit jeder Übernahme. Zuordnungen von Bezeichnungen stehen unter <a href="zuordnungen.html">Zuordnungen</a>.</p>
  <div class="formular-fuss"><button type="button" class="knopf" data-dialog="d-vergessen">Gemerkte Auswahl zurücksetzen …</button></div>
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Eingangsordner und Zeitplan</h2><span class="plakette grau">später</span></div>
  <p class="neben">Geplant: Transferdateien aus einem Ordner des Servers übernehmen und wöchentlich einen Probelauf mit der gemerkten Auswahl starten. Übernommen wird nur nach Bestätigung.</p>
</section>
''', dialoge=dialog('d-vergessen', 'Gemerkte Auswahl zurücksetzen?', '<p>Abteilungen, Einheiten, übersprungene Archive und Optionen werden vergessen. Bei der nächsten Übernahme wird wieder über die Namen vorgeschlagen. Die Zuordnungen von Bezeichnungen bleiben.</p>',
                   ABBRECHEN + '<button class="knopf primaer" value="ok">Zurücksetzen</button>', gefahr=True))


# ---------- Export nach MP-Feuer (Platzhalter) ----------
mseite('export.html', '''
<div class="meldung warnung"><span class="ic">!</span><span><strong>In Vorbereitung.</strong> MP-Feuer übernimmt Daten über seinen Tabellen-Import mit Vorlagen (CSV/Excel). Sobald Beispieldateien der Vorlagen vorliegen, bekommt jeder Export einen eigenen Adapter. Bis dahin erzeugt das Modul keine Dateien.</span></div>
''' + tabelle(['Export', 'Daten aus f.orga', 'Braucht das Recht', 'Stand'], [
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
''')


# ---------- Core: Tabellen-Import mit Hinweis auf das Modul und eigener Zuordnungsliste ----------
seite(O + 'tabellen-import.html', 'Import', '''
<div class="meldung info"><span class="ic">i</span><span>MP-Feuer-Transferdateien (<code translate="no">MPTRA_*.zip</code>) übernimmt das <strong>Modul MP-Feuer</strong>.</span><a class="knopf klein aktion" href="start.html">Zum Modul MP-Feuer</a></div>
<div data-reitergruppe>
<div class="reiter">
  <button class="aktiv" data-reiter="r-datei">Tabelle importieren</button>
  <button data-reiter="r-zuordnungen">Gemerkte Zuordnungen</button>
</div>
<div class="reiter-inhalt aktiv" id="r-datei">
<ol class="schritte">
  <li><a class="aktiv" href="#" aria-current="step"><span class="nr">1</span><span class="text">Datei</span></a></li>
  <li><a href="#"><span class="nr">2</span><span class="text">Spalten zuordnen</span></a></li>
  <li><a href="#"><span class="nr">3</span><span class="text">Vorschau &amp; Prüfung</span></a></li>
  <li><a href="#"><span class="nr">4</span><span class="text">Übernehmen</span></a></li>
</ol>
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
  <p class="meta" style="margin-top:8px">Nur Profile, für die Sie das Recht haben. Unbekannte Bezeichnungen lassen sich nach der Prüfung zuordnen; die Zuordnung wird unter „Gemerkte Zuordnungen“ gespeichert.</p>
</section>
</div>
<div class="reiter-inhalt" id="r-zuordnungen">
<p class="neben">Zuordnungen, die im Tabellen-Import gewählt wurden. Der nächste Import erkennt diese Bezeichnungen von selbst. Das Modul MP-Feuer hat eine eigene Liste.</p>
''' + FILTER + tabelle(['Bezeichnung', 'Art', 'Eintrag in f.orga', 'Profil', 'Zuletzt benutzt', ''], [
    ['<strong translate="no">San-Ausbildung</strong>', 'Lehrgang', 'Sanitätsausbildung', 'Lehrgänge, Dienstgrade, Ehrungen', '14.10.2026', '<button type="button" class="knopf klein" style="white-space:nowrap" data-dialog="d-loeschen-core">Löschen …</button>'],
    ['<strong translate="no">Verdienstausfall Firma</strong>', 'Funktion', 'Keine Funktion – Verdienstausfall', 'Einsatzpersonal', '02.10.2026', '<button type="button" class="knopf klein" style="white-space:nowrap" data-dialog="d-loeschen-core">Löschen …</button>'],
    ('warnung', ['<strong translate="no">Sonstiges</strong>', 'Diensttyp', 'Sonstiges <span class="plakette warn">Ziel gelöscht</span>', 'Dienste', '20.09.2026', '<button type="button" class="knopf klein" style="white-space:nowrap" data-dialog="d-loeschen-core">Löschen …</button>']),
], 'stapel') + '''
</div>
</div>
''', nav='stammdaten/import.html', brot=[('Stammdaten', None), ('Import', None)],
    dialoge=dialog('d-loeschen-core', 'Zuordnung löschen?', '<p>Die Zuordnung wird vergessen. Beim nächsten Import erscheint die Bezeichnung wieder unter „Nicht zugeordnete Bezeichnungen“. Bereits übernommene Daten bleiben unverändert.</p>',
                   ABBRECHEN + '<button class="knopf primaer" value="ok">Löschen</button>', gefahr=True))
