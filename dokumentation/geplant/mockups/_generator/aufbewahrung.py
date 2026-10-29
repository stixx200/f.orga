"""Mockups Aufbewahrungsplan: Einstellungen → Datenschutz → Aufbewahrung und Liste „Aussonderung“.

Konzept: dokumentation/geplant/aufbewahrung.md
"""
from rahmen import seite, tabelle, dialog

ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'


def aktion(wahl):
    opts = ['nichts', 'anbieten, dann anonymisieren', 'anbieten, dann löschen', 'anonymisieren', 'löschen']
    return '<select aria-label="Aktion nach Ablauf" style="width:100%">' + ''.join(f'<option{" selected" if o == wahl else ""}>{o}</option>' for o in opts) + '</select>'


def frist(jahre):
    return f'<input type="number" aria-label="Frist in Jahren" value="{jahre}" style="max-width:90px">'


def sonder(an):
    return f'<label class="schalter"><input type="checkbox"{" checked" if an else ""}> prüfen</label>'


def r(kat, ab, jahre, akt, sf, betr, kl=''):
    zellen = [kat + f'<span class="unter-text">Frist ab {ab}</span>', frist(jahre), aktion(akt), sonder(sf), betr]
    return (kl, zellen) if kl else zellen


seite('shell/aufbewahrung.html', 'Einstellungen', '''
<div class="reiter"><a href="einstellungen.html">Feuerwehr</a><a href="einstellungen.html">E-Mail</a><a href="einstellungen.html">Erinnerungen</a><a class="aktiv" href="#" aria-current="page">Datenschutz</a><a href="einstellungen.html">Import / Export</a></div>
<div class="meldung info"><span class="ic">i</span><span>Standard: Es wird nichts automatisch gelöscht, bis Sie hier Fristen und Aktionen wählen. Nach dem Landesarchivgesetz Baden-Württemberg sind Unterlagen vor dem Löschen dem zuständigen Archiv (Gemeinde- oder Kreisarchiv) anzubieten; welche archivwürdig sind, entscheidet das Archiv. Fristen mit dem Hauptamt abstimmen.</span></div>
<section class="karte">
  <div class="karte-kopf"><h2>Aufbewahrungsfristen</h2><button type="button" class="knopf sekundaer klein" data-dialog="d-vorlage">Vorlage „Kommunaler Aktenplan (Beispiel)“ …</button></div>
  <div class="meldung warnung"><span class="ic">!</span><span><strong>Vorlage eingesetzt, noch nicht gespeichert.</strong> Werte aus dem kommunalen Aktenplan (Beispiel), nicht rechtlich geprüft. Spannen wie „5–30 Jahre“ sind mit „Sonderfall prüfen“ markiert.</span></div>
  ''' + tabelle(['Kategorie', 'Jahre', 'Nach Ablauf (anbieten: dem Archiv)', 'Sonderfall', 'Jetzt betroffen'], [
      r('<strong>Grunddaten Ausgeschiedener</strong><span class="unter-text">Personalstammrolle: Name, Mitgliedschaften, Dienstgrade</span>', 'Austritt', '15', 'anbieten, dann anonymisieren', False,
        '<span class="plakette gelb">wirksam 30 Jahre</span>', 'warnung'),
      r('<strong>Personalakte Ausgeschiedener</strong><span class="unter-text">Feuerwehrangehörige: Kontakt, Qualifikationen, Lehrgänge, Ehrungen, Atemschutz, Führerscheinkontrollen</span>', 'Austritt', '30', 'anbieten, dann anonymisieren', True, '3 Personen'),
      r('<strong>Einsätze mit Besonderheiten</strong><span class="unter-text">Wachbuch: Verletzte oder Tote, Kostenersatz, Kat-Einsatz</span>', 'Alarm', '30', 'anbieten, dann anonymisieren', True, '0'),
      r('<strong>Übrige Einsätze</strong><span class="unter-text">Wachbuch</span>', 'Alarm', '3', 'anbieten, dann anonymisieren', True, '412 Einsätze'),
      r('<strong>Dienste „Sitzung / Ausschuss“</strong><span class="unter-text">Niederschriften über Ausschusssitzungen, mit Anhängen</span>', 'Beginn', '30', 'anbieten, dann löschen', False, '0'),
      r('<strong>Dienste „Dienstbesprechung“</strong><span class="unter-text">Dienstbesprechungen, Niederschriften (5–30 Jahre)</span>', 'Beginn', '5', 'anbieten, dann löschen', True, '18 Dienste'),
      r('<strong>Übrige Dienste</strong><span class="unter-text">Übungs- und Sonderdienste</span>', 'Beginn', '', 'nichts', False, '–'),
      r('<strong>Ausgesonderte Fahrzeuge und Geräte</strong><span class="unter-text">Freiwillige Feuerwehr (Zuordnung klären)</span>', 'Aussonderung', '30', 'anbieten, dann löschen', True, '0'),
      r('<strong>Kostenbescheide</strong><span class="unter-text">haushaltsrechtliche Fristen, mit der Kämmerei abstimmen</span>', 'Bestandskraft', '', 'nichts', False, '–'),
      r('<strong>Auszahlungsläufe der Entschädigung</strong><span class="unter-text">haushaltsrechtliche Fristen, mit der Kämmerei abstimmen</span>', 'Auszahlung', '', 'nichts', False, '–'),
      r('<strong>Audit-Log</strong><span class="unter-text">Datenerfassungsprotokolle (2–10 Jahre)</span>', 'Eintrag', '2', 'löschen', False, '1.204 Einträge'),
      r('<strong>Historie und Versionen</strong><span class="unter-text">Datenerfassungsprotokolle (2–10 Jahre)</span>', 'Eintrag', '10', 'löschen', True, '0'),
  ], 'stapel') + '''
  <p class="meta" style="margin-top:10px">Anhänge folgen ihrem Datensatz (z. B. Protokolle an Diensten). Die Grunddaten bleiben mindestens so lange wie die Personalakte, deshalb wirken hier 30 Jahre. Einsätze werden anonymisiert statt gelöscht, damit Jahresstatistik und Einsatzzahlen erhalten bleiben.</p>
  <div class="formular-fuss"><a class="knopf" href="aussonderung.html">Probelauf: was wäre heute fällig?</a><a class="knopf primaer" href="#">Speichern</a></div>
</section>''', nav='shell/einstellungen.html', brot=[('Verwaltung', None), ('Einstellungen', 'shell/einstellungen.html'), ('Datenschutz', None)],
    dialoge=dialog('d-vorlage', 'Vorlage „Kommunaler Aktenplan (Beispiel)“ einsetzen?', '''
<p>Setzt diese Werte in das Formular. Gespeichert wird erst mit „Speichern“.</p>
''' + tabelle(['Aktenplan', 'Frist', 'Kategorie in f.orga'], [
        ['Personalstammrolle (Feuerwehr)', '15 Jahre', 'Grunddaten Ausgeschiedener'],
        ['Feuerwehrangehörige', '30 Jahre oder Sonderfall', 'Personalakte Ausgeschiedener'],
        ['Wachbücher der Feuerwehr', '3/30 Jahre oder Sonderfall', 'Einsätze (übrige / mit Besonderheiten)'],
        ['Freiwillige Feuerwehr', '30 Jahre oder Sonderfall', 'ausgesonderte Fahrzeuge und Geräte'],
        ['Datenerfassungsprotokolle', '2–10 Jahre', 'Audit-Log, Historie'],
        ['Dienstbesprechungen, Niederschriften', '5–30 Jahre', 'Dienste „Dienstbesprechung“'],
        ['Niederschriften über Ausschusssitzungen', '30 Jahre', 'Dienste „Sitzung / Ausschuss“'],
    ], 'stapel') + '''
<p class="meta">Beispielwerte, nicht rechtlich geprüft. Kategorien ohne Wert im Beispiel bleiben bei „nichts“.</p>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Vorlage einsetzen</button>'))


# ---------- Aussonderung ----------
def f(kat, name, faellig, status, kl=''):
    zellen = ['<input type="checkbox" aria-label="auswählen">', kat, name, faellig, status]
    return (kl, zellen) if kl else zellen


seite('shell/aussonderung.html', 'Aussonderung', '''
<div class="chips">
  <a class="chip aktiv" href="#" aria-current="true">Fällig (21)</a><a class="chip" href="#">Angeboten (412)</a><a class="chip" href="#">Entschieden (6)</a><a class="chip" href="#">Zurückgestellt (1)</a><a class="chip" href="#">Erledigt</a>
</div>
<div class="filter">
  <div class="feld"><label>Kategorie</label><select><option>Alle Kategorien</option><option>Personalakte Ausgeschiedener</option><option>Übrige Einsätze</option><option>Dienste „Dienstbesprechung“</option></select></div>
  <div class="feld"><label>Fällig bis</label><input type="date" value="2026-10-28"></div>
</div>
''' + tabelle(['', 'Kategorie', 'Datensatz', 'Fällig seit', 'Stand'], [
    f('Personalakte Ausgeschiedener', 'Hartmann, Klaus · ausgeschieden 14.02.1996', '14.02.2026', '<span class="plakette gelb">fällig · Sonderfall prüfen</span>'),
    f('Personalakte Ausgeschiedener', 'Seitz, Werner · ausgeschieden 30.06.1996', '30.06.2026', '<span class="plakette gelb">fällig · Sonderfall prüfen</span>'),
    f('Dienste „Dienstbesprechung“', 'Kommandantenbesprechung 12.01.2021 (1 Anhang)', '12.01.2026', '<span class="plakette gelb">fällig</span>'),
    f('Dienste „Dienstbesprechung“', 'Kommandantenbesprechung 09.03.2021 (2 Anhänge)', '09.03.2026', '<span class="plakette gelb">fällig</span>'),
    f('Übrige Einsätze', 'Einsatz 2023-100412 · TH1 Ölspur · 03.01.2023', '03.01.2026', '<span class="plakette" style="white-space:normal">angeboten 15.10.2026 · Kreisarchiv</span>'),
    f('Übrige Einsätze', 'Einsatz 2023-100977 · BMA · 18.02.2023', '18.02.2026', '<span class="plakette warn" style="white-space:normal">blockiert: Kostenbescheid offen</span>', 'warnung'),
], 'stapel') + '''
<div class="aktionsleiste"><span class="status">2 ausgewählt</span><button type="button" class="knopf" data-dialog="d-zurueck">Zurückstellen …</button><button type="button" class="knopf" data-dialog="d-entscheidung">Entscheidung erfassen …</button><button type="button" class="knopf primaer" data-dialog="d-anbieten">Dem Archiv anbieten …</button></div>''',
    nav='shell/aussonderung.html', brot=[('Verwaltung', None), ('Aussonderung', None)],
    aktionen='<a class="knopf" href="aufbewahrung.html">Aufbewahrungsfristen</a>',
    dialoge=dialog('d-anbieten', 'Dem Archiv anbieten', '''
<p>2 Datensätze aus „Personalakte Ausgeschiedener“ werden als ZIP exportiert: je Datensatz ein PDF, dazu CSV, JSON, alle Anhänge und ein Anbietungsverzeichnis (PDF).</p>
<div class="feld"><label class="pflicht">Archiv</label><input type="text" value="Kreisarchiv"></div>
<div class="feld"><label>Bemerkung</label><input type="text" placeholder="z. B. per Datenträger übergeben"></div>
<p class="meta">Status danach „angeboten“. Die Daten bleiben unverändert, bis die Entscheidung des Archivs erfasst ist.</p>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Exportieren und als angeboten markieren</button>')
    + dialog('d-entscheidung', 'Entscheidung des Archivs erfassen', '''
<div class="wahl"><label><input type="radio" name="ent" checked><span>übernommen<small>Das Archiv hat die Unterlagen übernommen.</small></span></label><label><input type="radio" name="ent"><span>kassiert<small>Das Archiv verzichtet; die Unterlagen dürfen vernichtet werden.</small></span></label></div>
<div class="felder zwei" style="margin-top:12px"><div class="feld"><label class="pflicht">Datum</label><input type="date" value="2026-10-28"></div><div class="feld"><label>Bemerkung</label><input type="text"></div></div>
<div class="meldung warnung"><span class="ic">!</span><span>Danach führt „Ausführen“ die eingestellte Aktion aus: 2 Personen werden anonymisiert. Das lässt sich nicht rückgängig machen.</span></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Speichern</button>')
    + dialog('d-zurueck', 'Zurückstellen', '''
<p>Sonderfall: Die Datensätze bleiben bis zum gewählten Datum unverändert und erscheinen dann wieder.</p>
<div class="felder zwei"><div class="feld"><label class="pflicht">bis</label><input type="date" value="2031-12-31"></div><div class="feld"><label class="pflicht">Grund</label><input type="text" placeholder="z. B. laufendes Verfahren"></div></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Zurückstellen</button>'))
