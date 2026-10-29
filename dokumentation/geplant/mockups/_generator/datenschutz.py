"""Mockups zum Datenschutz (Konzept: dokumentation/geplant/datenschutz.md): Auskunft nach Art. 15 als PDF, Betroffenenanfragen,
Einwilligungen, Verzeichnis der Verarbeitungstätigkeiten, Einstellungen, Datenschutzhinweis, erste Anmeldung, Zwei-Faktor, Mein Bereich."""
from rahmen import sym, tabelle, dialog, seite, mockup_hinweis, SPRACHE, FUSS

ABBRECHEN = '<button class="knopf" value="abbrechen">Abbrechen</button>'
D = 'datenschutz/'
BROT = [('Verwaltung', None), ('Datenschutz', None)]
REITER = [('anfragen.html', 'Anfragen'), ('verzeichnis.html', 'Verzeichnis'), ('einstellungen.html', 'Einstellungen')]
VORLAGE = '<span class="plakette gelb">Vorlage – mit dem DSB prüfen</span>'


def vseite(pfad, inhalt, *, dialoge='', aktionen='', aktiv=None):
    """Seite unter „Verwaltung → Datenschutz“ mit Reitern zwischen Anfragen, Verzeichnis und Einstellungen."""
    aktiv = aktiv or pfad
    reiter = '<nav class="reiter" aria-label="Seiten Datenschutz">' + ''.join(
        f'<a href="{z}"' + (' class="aktiv" aria-current="page"' if z == aktiv else '') + f'>{t}</a>' for z, t in REITER) + '</nav>'
    seite(D + pfad, 'Datenschutz', reiter + inhalt, nav='shell/einstellungen.html', brot=BROT, dialoge=dialoge, aktionen=aktionen)


# ---------- Personalakte, Reiter „Datenschutz“ ----------
seite(D + 'person.html', 'Tobias Rief', '''
<section class="karte">
  <div class="akte-kopf">
    <div class="bild" aria-hidden="true">TR</div>
    <div style="flex:1;min-width:220px">
      <div class="neben">Löschmeister · Abt. Musterstadt (Stamm) · Führungsgruppe · Pers.-Nr. 1043</div>
      <div class="plaketten" style="margin-top:6px"><span class="plakette ok">aktiv</span><span class="plakette">Gruppenführer</span><span class="plakette gelb">Auskunft angefragt · fällig 27.11.2026</span></div>
    </div>
    <button type="button" class="knopf primaer" data-dialog="d-auskunft">Auskunft erstellen …</button>
  </div>
</section>
<div class="reiter" role="tablist" aria-label="Bereiche der Personenakte">
  <a href="{P}stammdaten/person.html">Stammdaten</a><a href="{P}stammdaten/person.html">Feuerwehr</a><a href="{P}stammdaten/person.html">Lehrgänge</a><a href="{P}stammdaten/person.html">Einsätze</a><a href="{P}stammdaten/person.html">Historie</a><a class="aktiv" aria-current="page" href="person.html">Datenschutz</a>
</div>
<div class="stapel-abstand">
<section class="karte">
  <div class="karte-kopf"><h2>Anfragen der Person</h2><button type="button" class="knopf klein" data-dialog="d-anfrage">Anfrage erfassen …</button></div>
''' + tabelle(['Art', 'Eingegangen', 'Frist', 'Stand'], [
    ('warnung', ['<a href="anfrage.html">Auskunft</a>', '27.10.2026 · Mein Bereich', '27.11.2026', '<span class="plakette gelb">in Bearbeitung</span>']),
    ['Berichtigung', '03.09.2026 · E-Mail', '03.10.2026', '<span class="plakette ok">erledigt 05.09.2026</span>'],
], 'stapel') + '''
  <p class="meta" style="margin-top:8px">Die Frist ist ein Monat ab Eingang (Art. 12 Abs. 3). Sie steht als Aufgabe bei allen, die Datenschutz verwalten.</p>
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Einwilligungen</h2><button type="button" class="knopf klein" data-dialog="d-einwilligung">Einwilligung erfassen …</button></div>
''' + tabelle(['Einwilligung', 'Stand', ''], [
    ['<strong>Fotos in der Öffentlichkeitsarbeit</strong><br><span class="meta">Fassung 2 · schriftlich 12.01.2026, erfasst von Markus Vogt</span>', '<span class="plakette ok">erteilt</span>', '<button type="button" class="knopf klein" data-dialog="d-widerruf">Widerruf erfassen …</button>'],
    ['<strong>Handynummer in der Telefonliste der Abteilung</strong><br><span class="meta">Fassung 1 · Mein Bereich 14.03.2026</span>', '<span class="plakette ok">erteilt</span>', '<button type="button" class="knopf klein" data-dialog="d-widerruf">Widerruf erfassen …</button>'],
    ['<strong>Geburtstag im Aushang</strong><br><span class="meta">widerrufen 02.05.2026 · Mein Bereich</span>', '<span class="plakette grau">widerrufen</span>', ''],
], 'stapel') + '''
</section>
<section class="karte">
  <h2>Information und Einschränkung</h2>
  <dl class="daten">
    <dt>Datenschutzhinweis</dt><dd>Fassung 3 zur Kenntnis genommen am 14.03.2026 (erste Anmeldung)</dd>
    <dt>Information nach Art. 14</dt><dd>nach der Datenübernahme aus MP-Feuer erteilt am 20.10.2026 (Schreiben)</dd>
    <dt>Verarbeitung</dt><dd>nicht eingeschränkt</dd>
  </dl>
  <div class="formular-fuss"><button type="button" class="knopf" data-dialog="d-einschraenkung">Verarbeitung einschränken …</button></div>
</section>
<section class="karte">
  <h2>Erstellte Auskünfte</h2>
''' + tabelle(['Erstellt', 'Sprache', 'Übergabe', ''], [
    ['28.10.2026 10:12 · Markus Vogt', 'Deutsch', '<span class="plakette gelb">noch nicht übergeben</span>', '<a class="knopf klein" href="auskunft-vorschau.html">Ansehen</a>'],
    ['11.02.2025 18:40 · Markus Vogt', 'Deutsch', 'persönlich 12.02.2025', '<span class="meta">gelöscht nach 30 Tagen</span>'],
], 'stapel') + '''
</section>
</div>''', nav='stammdaten/personen.html', brot=[('Stammdaten', None), ('Personen', 'stammdaten/personen.html'), ('Tobias Rief', None)],
    dialoge=dialog('d-auskunft', 'Auskunft nach Art. 15 erstellen', '''
<div class="feld"><label>Zur Anfrage</label><select><option>Auskunft vom 27.10.2026 (Mein Bereich) · fällig 27.11.2026</option><option>ohne Anfrage</option></select></div>
<div class="felder zwei">
  <div class="feld"><label>Sprache</label><select><option>Deutsch</option><option>Englisch</option></select></div>
  <div class="feld"><label>Übergabe</label><select><option>Bereitstellen in Mein Bereich</option><option>Herunterladen (persönlich oder per Post)</option></select></div>
</div>
<p class="neben">Die Auskunft enthält immer alle Bereiche:</p>
''' + tabelle(['Bereich', '>Einträge'], [
    ['Stammdaten', '42'], ['Benutzerkonto und Protokolle', '118'], ['Einsätze', '87'], ['Dienste', '64'],
    ['Atemschutz <span class="plakette warn">Gesundheitsdaten</span>', '23'], ['Entschädigung', '151'], ['Kleiderkammer', '9'], ['Geräte', '2'],
]) + '''
<label class="schalter" style="margin-top:12px"><input type="checkbox"> Maschinenlesbare Fassung (JSON) als Anhang beifügen</label>
<div class="meldung info" style="margin-top:12px"><span class="ic">i</span><span>Andere Personen erscheinen nicht mit Namen (Art. 15 Abs. 4). Kein Versand per E-Mail: Die Auskunft enthält Gesundheitsdaten.</span></div>
<label class="schalter"><input type="checkbox" checked> Identität der Person geprüft (angemeldet in Mein Bereich)</label>''',
        ABBRECHEN + '<a class="knopf primaer" href="auskunft-vorschau.html">Auskunft erstellen</a>')
    + dialog('d-anfrage', 'Anfrage erfassen', '''
<div class="felder zwei">
  <div class="feld"><label class="pflicht">Art</label><select><option>Auskunft</option><option>Berichtigung</option><option>Löschung</option><option>Einschränkung</option><option>Widerspruch</option><option>Widerruf einer Einwilligung</option></select></div>
  <div class="feld"><label class="pflicht">Eingegangen am</label><input type="date" value="2026-10-27"></div>
  <div class="feld"><label>Weg</label><select><option>schriftlich</option><option>E-Mail</option><option>persönlich</option><option>Mein Bereich</option></select></div>
  <div class="feld"><label>Frist</label><input type="date" value="2026-11-27" disabled><div class="hilfe">Ein Monat ab Eingang, verlängerbar mit Begründung.</div></div>
</div>
<div class="feld"><label>Inhalt der Anfrage</label><textarea rows="3"></textarea></div>
<label class="schalter"><input type="checkbox"> Identität geprüft</label>''', ABBRECHEN + '<button class="knopf primaer" value="ok">Anfrage anlegen</button>')
    + dialog('d-einwilligung', 'Einwilligung erfassen', '''
<div class="feld"><label class="pflicht">Einwilligung</label><select><option>Geburtstag im Aushang (Fassung 1)</option><option>Fotos in der Öffentlichkeitsarbeit (Fassung 2)</option></select></div>
<div class="felder zwei">
  <div class="feld"><label class="pflicht">Erteilt am</label><input type="date" value="2026-10-28"></div>
  <div class="feld"><label>Weg</label><select><option>schriftlich</option><option>durch Erziehungsberechtigte</option><option>persönlich</option></select></div>
</div>
<div class="feld"><label>Nachweis (Scan der Unterschrift)</label><input type="file"></div>
<p class="meta">Der Text der gewählten Fassung wird mit der Einwilligung gespeichert.</p>''', ABBRECHEN + '<button class="knopf primaer" value="ok">Speichern</button>')
    + dialog('d-widerruf', 'Widerruf erfassen?', '''
<p><strong>Fotos in der Öffentlichkeitsarbeit</strong> gilt ab dem Widerruf nicht mehr. Was bis dahin rechtmäßig veröffentlicht wurde, bleibt davon unberührt (Art. 7 Abs. 3).</p>
<div class="felder zwei"><div class="feld"><label class="pflicht">Widerrufen am</label><input type="date" value="2026-10-28"></div>
<div class="feld"><label>Weg</label><select><option>schriftlich</option><option>E-Mail</option><option>persönlich</option></select></div></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Widerruf speichern</button>')
    + dialog('d-einschraenkung', 'Verarbeitung einschränken?', '''
<p>Tobias Rief erscheint danach nicht mehr in Listen, Suche, Infoterminal, Personalauswahl, Fristen und E-Mails. Lesen können nur noch Benutzer mit „Datenschutz verwalten“.</p>
<div class="felder zwei"><div class="feld"><label class="pflicht">Grund</label><select><option>Richtigkeit bestritten (Art. 18 Abs. 1 a)</option><option>Löschung abgelehnt, Aufbewahrungsfrist läuft</option><option>Widerspruch wird geprüft</option></select></div>
<div class="feld"><label>Bis</label><input type="date"></div></div>''', ABBRECHEN + '<button class="knopf primaer" value="ok">Einschränken</button>', gefahr=True))

# ---------- Vorschau der Auskunft (PDF) ----------
PDF_STIL = '''<style>
.pdf-leiste{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:16px}
.pdf-seite{background:#fff;max-width:794px;margin:0 auto 24px;padding:40px 48px;box-shadow:0 2px 1px -1px rgba(0,0,0,.2),0 1px 1px 0 rgba(0,0,0,.14),0 1px 3px 0 rgba(0,0,0,.12);font-size:.86rem;line-height:1.45}
.pdf-kopf{display:flex;gap:12px;align-items:center;border-bottom:2px solid #8C1D18;padding-bottom:8px;margin-bottom:16px}
.pdf-kopf img{width:44px;height:44px}.pdf-kopf .fw{color:#8C1D18;font-weight:bold}.pdf-kopf .ti{font-size:.8rem;color:#555}
.pdf-seite h2{color:#8C1D18;font-size:1.05rem;margin:18px 0 6px}.pdf-seite h3{font-size:.92rem;margin:12px 0 4px}
.pdf-fuss{border-top:1px solid #8C1D18;margin-top:24px;padding-top:6px;font-size:.72rem;color:#555;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.pdf-seite table{width:100%;border-collapse:collapse;font-size:.8rem}.pdf-seite th{background:#8C1D18;color:#fff;text-transform:uppercase;text-align:left;padding:4px 6px;font-size:.72rem}
.pdf-seite td{padding:4px 6px;border-bottom:1px solid #E0D2D0;vertical-align:top}.pdf-seite tr:nth-child(even) td{background:#FBF7F6}
.pdf-seite dl{display:grid;grid-template-columns:minmax(120px,38%) 1fr;gap:2px 12px;margin:0}.pdf-seite dt{color:#555}.pdf-seite dd{margin:0}
.pdf-anschrift{margin:8px 0 20px}.pdf-gesundheit{border-left:3px solid #8C1D18;padding-left:10px}
@media (max-width:860px){.pdf-seite{padding:16px}.pdf-seite dl{grid-template-columns:1fr}.pdf-seite dt{margin-top:6px}}
</style>'''


def pdfkopf(titel):
    return f'<div class="pdf-kopf"><img src="{{P}}assets/logo.svg" alt="Wappen"><div><div class="fw">Freiwillige Feuerwehr Musterstadt</div><div class="ti">{titel}</div></div></div>'


def pdffuss(nr):
    return f'<div class="pdf-fuss"><span>Freiwillige Feuerwehr Musterstadt · Feuerwehrstraße 1 · 12345 Musterstadt</span><span>Seite {nr} von 9 · erstellt 28.10.2026 10:12</span></div>'


def pdftab(kopf, zeilen):
    th = ''.join(f'<th scope="col">{k}</th>' for k in kopf)
    tr = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in z) + '</tr>' for z in zeilen)
    return f'<div class="tabelle-huelle" style="border:0;box-shadow:none"><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


KOPFZEILE = 'Auskunft nach Art. 15 DSGVO · Tobias Rief · Stand 28.10.2026'
seite(D + 'auskunft-vorschau.html', 'Auskunft Tobias Rief', PDF_STIL + '''
<div class="pdf-leiste"><span class="plakette gelb">noch nicht übergeben</span><span class="meta">Beispielseiten (1, 2, 4, 6 und 9 von 9). Das PDF liegt verschlüsselt bis 27.11.2026 bereit.</span></div>
<article class="pdf-seite" aria-label="Seite 1">
''' + pdfkopf(KOPFZEILE) + '''
<div class="pdf-anschrift">Herrn<br>Tobias Rief<br>Lindenweg 4<br>12345 Musterstadt</div>
<p style="text-align:right">Musterstadt, 28.10.2026</p>
<p><strong>Auskunft über Ihre personenbezogenen Daten (Art. 15 DSGVO)</strong><br>Ihre Anfrage vom 27.10.2026</p>
<p>Sehr geehrter Herr Rief,</p>
<p>[Textbaustein „Einleitung“ – Vorlage, mit dem Datenschutzbeauftragten der Gemeinde abzustimmen.]</p>
<h2>Angaben nach Art. 15 Abs. 1 DSGVO</h2>
<dl>
  <dt>Verantwortlicher</dt><dd>Stadt Musterstadt, Marktplatz 1, 12345 Musterstadt, für die Freiwillige Feuerwehr Musterstadt</dd>
  <dt>Datenschutzbeauftragter</dt><dd>Datenschutzbeauftragter der Stadt Musterstadt, datenschutz@musterstadt.example</dd>
  <dt>Zwecke (a)</dt><dd>Personalverwaltung der Feuerwehr; Einsatzdokumentation; Dienstbetrieb; Atemschutzüberwachung; Entschädigung; Ausrüstung. Je Bereich auf den folgenden Seiten.</dd>
  <dt>Kategorien (b)</dt><dd>Stammdaten, Kontaktdaten, Mitgliedschaft und Laufbahn, Einsatz- und Dienstzeiten, Bankverbindung, Gesundheitsdaten (Eignungsuntersuchung Atemschutz), Benutzerkonto und Protokolle</dd>
  <dt>Empfänger (c)</dt><dd>Stadtkasse/Kämmerei (Entschädigung); Kreisbrandmeister und Statistikportal (Jahresstatistik, nur Zahlen ohne Namen); Integrierte Leitstelle (Schnittstelle „Alarmfax-Parser Leitstelle“, nur Einsatzdaten)</dd>
  <dt>Speicherdauer (d)</dt><dd>je Bereich nach dem Aufbewahrungsplan; Angaben auf den folgenden Seiten</dd>
  <dt>Ihre Rechte (e)</dt><dd>Recht auf Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Widerspruch (Art. 21)</dd>
  <dt>Beschwerderecht (f)</dt><dd>Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg [Anschrift aus den Einstellungen]</dd>
  <dt>Herkunft (g)</dt><dd>eigene Erfassung; Datenübernahme aus MP-Feuer am 19.10.2026; Ihre Angaben in Mein Bereich; Eintragungen am Infoterminal</dd>
  <dt>Automatisierte Entscheidung (h)</dt><dd>[Textbaustein – Vorlage]</dd>
</dl>
''' + pdffuss(1) + '''
</article>
<article class="pdf-seite" aria-label="Seite 2">
''' + pdfkopf(KOPFZEILE) + '''
<h2>1 Stammdaten</h2>
<p class="meta">Zweck: Personalverwaltung der Feuerwehr · Speicherdauer: Personalakte 30 Jahre nach Austritt · Herkunft: Datenübernahme aus MP-Feuer 19.10.2026, Mein Bereich</p>
<dl>
  <dt>Name</dt><dd>Tobias Rief</dd><dt>Geburtsdatum</dt><dd>14.06.1988</dd><dt>Anschrift</dt><dd>Lindenweg 4, 12345 Musterstadt</dd>
  <dt>Mobil</dt><dd>0170 1234567</dd><dt>E-Mail</dt><dd>t.rief@example.org</dd><dt>Arbeitgeber</dt><dd>Musterbau GmbH, Musterstadt</dd>
  <dt>Bankverbindung</dt><dd>IBAN endet auf 4711</dd><dt>Eintritt</dt><dd>01.04.2006</dd><dt>Status</dt><dd>aktiv</dd>
  <dt>Bemerkung</dt><dd>Probezeit verkürzt wegen Übernahme aus der Jugendfeuerwehr</dd>
</dl>
<h3>Mitgliedschaften</h3>
''' + pdftab(['Abteilung', 'Von', 'Bis', 'Art'], [['Abt. Musterstadt', '01.04.2006', '–', 'Stammabteilung'], ['Führungsgruppe', '01.01.2019', '–', 'zusätzlich']]) + '''
<h3>Qualifikationen</h3>
''' + pdftab(['Qualifikation', 'Erworben', 'Gültig bis'], [['Truppführer', '12.05.2010', '–'], ['Gruppenführer', '20.03.2016', '–'], ['Atemschutzgeräteträger', '08.11.2008', '–'], ['Maschinist', '14.10.2012', '–']]) + pdffuss(2) + '''
</article>
<article class="pdf-seite" aria-label="Seite 4">
''' + pdfkopf(KOPFZEILE) + '''
<h2>3 Einsätze</h2>
<p class="meta">Zweck: Einsatzdokumentation und Entschädigung · Speicherdauer: 3 Jahre, Einsätze mit Besonderheiten 30 Jahre · Andere Einsatzkräfte sind nicht genannt (Art. 15 Abs. 4).</p>
''' + pdftab(['Datum', 'Stichwort', 'Ort', 'Funktion', 'Fahrzeug', 'Zeit', 'Atemschutz'], [
    ['21.10.2026', 'B2 Brand Wohnung', 'Musterstadt', 'Gruppenführer', 'LF 20', '13:05–15:40', 'nein'],
    ['20.10.2026', 'TH1 Ölspur', 'Musterstadt', 'Maschinist', 'TLF 3000', '07:41–08:30', 'nein'],
    ['02.10.2026', 'B3 Brand Scheune', 'Ahornfeld', 'Angriffstrupp', 'LF 20', '22:14–02:30', 'ja, 28 min'],
]) + '''
<p class="meta">87 Einsätze seit 2019 · 2026: 31 Einsätze, 64,5 Stunden</p>
''' + pdffuss(4) + '''
</article>
<article class="pdf-seite" aria-label="Seite 6">
''' + pdfkopf(KOPFZEILE) + '''
<div class="pdf-gesundheit">
<h2>5 Atemschutz <span class="plakette warn">Gesundheitsdaten</span></h2>
<p class="meta">Zweck: Überwachung der Atemschutztauglichkeit nach FwDV 7 · Empfänger: keine · Herkunft: Bescheinigung der Untersuchungsstelle, Dienste, Einsätze</p>
''' + pdftab(['Datum', 'Nachweis', 'Ergebnis', 'Gültig bis'], [
    ['22.11.2023', 'Eignungsuntersuchung', 'keine Bedenken', '22.11.2026'],
    ['14.03.2026', 'Belastungsübung', 'bestanden, 92 kJ', '14.03.2027'],
    ['09.01.2026', 'Unterweisung', '–', '09.01.2027'],
]) + '''
</div>
''' + pdffuss(6) + '''
</article>
<article class="pdf-seite" aria-label="Seite 9">
''' + pdfkopf(KOPFZEILE) + '''
<h2>9 Benutzerkonto und Protokolle</h2>
<dl><dt>Benutzername</dt><dd>t.rief</dd><dt>Rollen</dt><dd>Gruppenführer (Abt. Musterstadt), Mitglied</dd><dt>Zwei-Faktor</dt><dd>eingerichtet 14.03.2026</dd></dl>
<h3>Änderungen an Ihren Daten (Auszug)</h3>
''' + pdftab(['Datum', 'Bereich', 'Änderung', 'Durch'], [
    ['14.03.2026', 'Kontakt', 'Mobilnummer geändert', 'Sie selbst (Mein Bereich)'],
    ['19.10.2026', 'Stammdaten', 'angelegt', 'Datenübernahme aus MP-Feuer'],
    ['22.10.2026', 'Atemschutz', 'Einsatz unter Atemschutz eingetragen', 'Kommandant'],
]) + '''
<h3>Zugriffe auf besonders geschützte Daten</h3>
''' + pdftab(['Datum', 'Bereich', 'Durch'], [['22.10.2026', 'Eignungsuntersuchung', 'Atemschutzgerätewart'], ['28.10.2026', 'Auskunft erstellt', 'Kommandant']]) + '''
<p class="meta">Anhang: maschinenlesbare Fassung nicht beigefügt.</p>
''' + pdffuss(9) + '''
</article>''', nav='stammdaten/personen.html', brot=[('Stammdaten', None), ('Tobias Rief', 'datenschutz/person.html'), ('Auskunft', None)],
    aktionen='<a class="knopf" href="person.html">Zurück</a><button type="button" class="knopf" data-dialog="d-uebergabe">Übergabe vermerken …</button><a class="knopf primaer" href="#">PDF herunterladen</a>',
    dialoge=dialog('d-uebergabe', 'Übergabe vermerken', '''
<div class="felder zwei"><div class="feld"><label class="pflicht">Übergeben am</label><input type="date" value="2026-10-28"></div>
<div class="feld"><label>Weg</label><select><option>in Mein Bereich bereitgestellt</option><option>persönlich</option><option>per Post</option></select></div></div>
<label class="schalter"><input type="checkbox" checked> Anfrage damit erledigt</label>''', ABBRECHEN + '<button class="knopf primaer" value="ok">Speichern</button>'))

# ---------- Anfragen ----------
vseite('anfragen.html', '''
<div class="raster vier" style="margin-bottom:16px">
  <a class="kachel warn" href="#"><div class="wert">1</div><div class="titel">Frist in 7 Tagen</div><div class="unter">Löschung Sandra Maier</div></a>
  <a class="kachel" href="#"><div class="wert">3</div><div class="titel">Offene Anfragen</div><div class="unter">älteste vom 06.10.2026</div></a>
  <a class="kachel" href="#"><div class="wert">2</div><div class="titel">Eingeschränkte Personen</div><div class="unter">bis Fristende</div></a>
  <a class="kachel" href="#"><div class="wert">14</div><div class="titel">Information nach Art. 14 offen</div><div class="unter">seit der Datenübernahme</div></a>
</div>
<div class="filter"><div class="chips"><span class="chip aktiv">offen (3)</span><span class="chip">erledigt</span><span class="chip">alle</span></div>
<button type="button" class="knopf" data-dialog="d-dritte">Auskunft zu einer anderen Person …</button></div>
''' + tabelle(['Art', 'Person', 'Eingegangen', 'Frist', 'Stand', 'Bearbeitet von'], [
    ('warnung', ['<a href="anfrage.html">Löschung</a>', 'Sandra Maier (ausgeschieden 2019)', '06.10.2026 · schriftlich', '<span class="plakette warn">06.11.2026</span>', 'Löschprüfung', 'Markus Vogt']),
    ['<a href="person.html">Auskunft</a>', 'Tobias Rief', '27.10.2026 · Mein Bereich', '27.11.2026', 'Auskunft erstellt', 'Markus Vogt'],
    ['Auskunft', 'Beteiligter Einsatz 2026-104950 (Kennzeichen MS-AB 123)', '20.10.2026 · E-Mail', '20.11.2026', 'eingegangen', '–'],
], 'stapel') + '''
<p class="meta" style="margin-top:8px">Fristen erscheinen als Aufgabe bei allen mit „Datenschutz verwalten“ und in der wöchentlichen E-Mail, ohne Namen.</p>
<section class="karte" style="margin-top:16px">
  <div class="karte-kopf"><h2>Datenpanne</h2><a class="knopf" href="#">Datenpanne erfassen …</a></div>
  <p class="neben">Meldung an die Aufsichtsbehörde binnen 72 Stunden (Art. 33). f.orga hilft mit Protokollen, der Liste betroffener Personen und dem Abmelden aller Sitzungen.</p>
</section>''', dialoge=dialog('d-dritte', 'Auskunft zu einer anderen Person', '''
<p class="neben">Für Personen, die nicht in den Stammdaten stehen: Beteiligte von Einsätzen und Kostenschuldner.</p>
<div class="feld"><label>Name, Anschrift oder Kennzeichen</label><input type="search" value="MS-AB 123"></div>
''' + tabelle(['Fundstelle', 'Rolle', 'Datum'], [['Einsatz 2026-104950 · TH1 Verkehrsunfall', 'Verursacher', '12.03.2026'], ['Kostenbescheid KE-2026-014', 'Kostenschuldner', '02.05.2026']]),
    ABBRECHEN + '<button class="knopf primaer" value="ok">Auskunft erstellen</button>'))

vseite('anfrage.html', '''
<section class="karte">
  <div class="karte-kopf"><h2>Löschung · Sandra Maier</h2><span class="plakette warn">Frist 06.11.2026</span></div>
  <dl class="daten">
    <dt>Eingegangen</dt><dd>06.10.2026, schriftlich, Identität geprüft (Unterschrift, Anschrift)</dd>
    <dt>Person</dt><dd>ausgeschieden 31.12.2019 · Abt. Ahornfeld</dd>
    <dt>Inhalt</dt><dd>„Bitte löschen Sie alle meine Daten.“</dd>
  </dl>
</section>
<section class="karte">
  <h2>Löschprüfung</h2>
  <p class="neben">Jedes Modul meldet, was es löschen darf und was nach dem Aufbewahrungsplan noch aufzubewahren ist (Art. 17 Abs. 3).</p>
''' + tabelle(['Bereich', 'Daten', 'Ergebnis', 'Grund'], [
    ['Stammdaten', 'Kontakt, Geburtsdatum, Bankverbindung, Bemerkungen', '<span class="plakette ok">löschen</span>', '–'],
    ['Stammdaten', 'Name, Mitgliedschaften, Dienstgrade', '<span class="plakette gelb">einschränken bis 31.12.2034</span>', 'Personalstammrolle 15 Jahre'],
    ['Einsätze', '23 Einsätze als Einsatzkraft', '<span class="plakette gelb">anonymisieren</span>', 'Statistik bleibt, Name „N. N.“'],
    ['Atemschutz', '4 Nachweise, 1 Eignungsuntersuchung', '<span class="plakette ok">löschen</span>', '–'],
    ['Entschädigung', '38 Posten in 6 Auszahlungsläufen', '<span class="plakette gelb">einschränken bis 31.12.2029</span>', 'Kassenunterlage, Frist der Kämmerei'],
    ['Benutzerkonto', 'gesperrt seit 2020', '<span class="plakette ok">löschen</span>', '–'],
], 'stapel') + '''
  <div class="meldung warnung" style="margin-top:12px"><span class="ic">!</span><span><strong>Warnung:</strong> Teile bleiben eingeschränkt gespeichert. Das Antwortschreiben nennt die Gründe und die Fristen.</span></div>
  <h3 style="margin-top:16px">Empfänger informieren (Art. 19)</h3>
  <div class="schalter-liste"><label class="schalter"><input type="checkbox"> Stadtkasse (Bankverbindung)</label></div>
  <div class="formular-fuss"><a class="knopf" href="#">Antwortschreiben (PDF)</a><button type="button" class="knopf primaer" data-dialog="d-loeschen">Ausführen …</button></div>
</section>''', aktiv='anfragen.html', dialoge=dialog('d-loeschen', 'Löschung ausführen?', '''
<p>Für <strong>Sandra Maier</strong> werden 3 Bereiche gelöscht, 1 anonymisiert und 2 bis zum Ende ihrer Frist eingeschränkt. Das lässt sich nicht rückgängig machen. In Sicherungen bleiben die Daten bis zu deren Ablauf (30 Tage).</p>
<div class="feld"><label class="pflicht">Zur Bestätigung den Namen eingeben</label><input type="text" placeholder="Sandra Maier"></div>''',
    ABBRECHEN + '<button class="knopf primaer" value="ok">Löschung ausführen</button>', gefahr=True))

# ---------- Verzeichnis ----------
vseite('verzeichnis.html', '''
<div class="meldung info"><span class="ic">i</span><span>Entwurf aus den aktiven Modulen. Zwecke, Kategorien, Fristen und technische Empfänger kommen aus f.orga; Rechtsgrundlage und weitere Empfänger ergänzt die Gemeinde. Das Verzeichnis führt der Verantwortliche (Art. 30).</span></div>
''' + tabelle(['Tätigkeit', 'Modul', 'Betroffene', 'Besondere Kategorien', 'Frist', 'Geprüft'], [
    ['<a href="#t-einsatz">Einsatzdokumentation</a>', 'Einsatzberichte', 'Mitglieder, Beteiligte', 'Verletzungen', '3 / 30 Jahre', '<span class="plakette gelb">Entwurf</span>'],
    ['Personalverwaltung der Feuerwehr', 'Stammdaten', 'Mitglieder, Jugendliche', '–', '30 Jahre nach Austritt', '<span class="plakette ok">15.09.2026 · DSB</span>'],
    ['Atemschutzüberwachung', 'Atemschutz', 'Geräteträger', '<span class="plakette warn">Gesundheit</span>', 'nicht festgelegt', '<span class="plakette gelb">Entwurf</span>'],
    ['Entschädigung', 'Entschädigungen', 'Mitglieder, Arbeitgeber', '–', 'mit der Kämmerei abstimmen', '<span class="plakette gelb">Entwurf</span>'],
    ['Dienstbetrieb', 'Dienste', 'Mitglieder', '–', 'nicht festgelegt', '<span class="plakette gelb">Entwurf</span>'],
    ['Benutzerkonten und Protokolle', 'Kern', 'Benutzer', '–', 'Audit-Log 2 Jahre', '<span class="plakette gelb">Entwurf</span>'],
], 'stapel') + '''
<section class="karte" id="t-einsatz" style="margin-top:16px">
  <div class="karte-kopf"><h2>Einsatzdokumentation</h2><span class="plakette gelb">Entwurf</span></div>
  <dl class="daten">
    <dt>Zweck</dt><dd>Dokumentation der Einsätze, Jahresstatistik, Entschädigung, Kostenersatz</dd>
    <dt>Betroffene</dt><dd>Einsatzkräfte; Beteiligte (Geschädigte, Verursacher, Zeugen, Anrufer)</dd>
    <dt>Daten</dt><dd>Einsatzzeiten, Funktion, Fahrzeug, Atemschutz; Name, Anschrift, Telefon, Kennzeichen von Beteiligten; Fotos</dd>
    <dt>Besondere Kategorien</dt><dd>Verletzungen von Einsatzkräften und Beteiligten (Art. 9)</dd>
    <dt>Empfänger</dt><dd>Statistikportal (nur Zahlen); Integrierte Leitstelle (API-Token „Alarmfax-Parser Leitstelle“); Kämmerei</dd>
    <dt>Drittland</dt><dd>keine</dd>
    <dt>Löschfrist</dt><dd>3 Jahre, Einsätze mit Besonderheiten 30 Jahre, danach dem Archiv anbieten (Aufbewahrungsplan)</dd>
    <dt>Technische Maßnahmen</dt><dd>Rechte je Abteilung; Verletzte nur mit eigenem Recht; Historie und Audit-Log; HTTPS: <span class="plakette warn">nein</span>; Zwei-Faktor für privilegierte Konten: ja; Sicherung verschlüsselt: ja</dd>
  </dl>
  <div class="felder zwei" style="margin-top:12px">
    <div class="feld"><label>Rechtsgrundlage (von der Gemeinde)</label><textarea rows="2" placeholder="mit dem DSB festlegen"></textarea></div>
    <div class="feld"><label>Weitere Empfänger</label><textarea rows="2" placeholder="z. B. Versicherung, Polizei auf Anfrage"></textarea></div>
  </div>
  <div class="formular-fuss"><a class="knopf" href="#">Als geprüft markieren</a><a class="knopf primaer" href="#">Speichern</a></div>
</section>''', aktionen='<a class="knopf" href="#">Excel</a><a class="knopf primaer" href="#">PDF herunterladen</a>')

# ---------- Einstellungen ----------
vseite('einstellungen.html', '''
<div data-reitergruppe>
<div class="reiter">
  <button class="aktiv" data-reiter="e-kontakte">Kontakte</button><button data-reiter="e-texte">Texte</button><button data-reiter="e-einw">Einwilligungen</button><button data-reiter="e-sicher">Sicherheit</button>
</div>
<div class="reiter-inhalt aktiv" id="e-kontakte">
<div class="raster zwei">
  <section class="karte"><h2>Verantwortlicher</h2>
    <div class="feld"><label>Name</label><input type="text" value="Stadt Musterstadt"></div>
    <div class="feld"><label>Anschrift</label><textarea rows="2">Marktplatz 1, 12345 Musterstadt</textarea></div>
    <div class="feld"><label>Vertreten durch</label><input type="text" value="Bürgermeisterin"></div>
  </section>
  <section class="karte"><h2>Datenschutzbeauftragter</h2>
    <div class="feld"><label>Name oder Stelle</label><input type="text" value="Datenschutzbeauftragter der Stadt Musterstadt"></div>
    <div class="feld"><label>E-Mail</label><input type="email" value="datenschutz@musterstadt.example"></div>
    <div class="feld"><label>Telefon</label><input type="tel"></div>
  </section>
  <section class="karte"><h2>Aufsichtsbehörde</h2>
    <div class="feld"><label>Name</label><input type="text" value="Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg"></div>
    <div class="feld"><label>Anschrift und Website</label><textarea rows="2" placeholder="von der Website der Behörde übernehmen"></textarea></div>
  </section>
</div>
<div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
</div>
<div class="reiter-inhalt" id="e-texte">
<div class="meldung warnung"><span class="ic">!</span><span><strong>Warnung:</strong> 3 Textbausteine sind Vorlagen. Bitte mit dem Datenschutzbeauftragten der Gemeinde prüfen und dann als geprüft markieren.</span></div>
''' + tabelle(['Textbaustein', 'Verwendet in', 'Fassung', 'Stand'], [
    ['<a href="#t-auskunft">Einleitung der Auskunft</a>', 'Auskunft (PDF)', '1', VORLAGE],
    ['Datenschutzhinweis', '<a href="hinweis.html">Datenschutzhinweis</a>, erste Anmeldung', '3', '<span class="plakette ok">geprüft 15.09.2026</span>'],
    ['Automatisierte Entscheidung', 'Auskunft, Datenschutzhinweis', '1', VORLAGE],
    ['Antwort auf Löschantrag', 'Anfragen', '1', VORLAGE],
], 'stapel') + '''
<section class="karte" id="t-auskunft" style="margin-top:16px">
  <div class="karte-kopf"><h2>Einleitung der Auskunft</h2>''' + VORLAGE + '''</div>
  <div class="felder zwei">
    <div class="feld"><label>Deutsch</label><textarea rows="5">[Vorlage] Sie haben Auskunft über die zu Ihrer Person gespeicherten Daten verlangt. Auf den folgenden Seiten finden Sie alle Daten, die die Feuerwehr in f.orga zu Ihnen speichert, und die Angaben nach Art. 15 Abs. 1 DSGVO.</textarea></div>
    <div class="feld"><label>Englisch</label><textarea rows="5">[Template] You requested access to the personal data stored about you. The following pages list all data the fire brigade stores about you in f.orga and the information under Art. 15(1) GDPR.</textarea></div>
  </div>
  <p class="meta">Platzhalter: {name}, {anfrage_datum}, {feuerwehr}. Keine Rechtstexte erfinden; nur Titel der DSGVO-Artikel zitieren.</p>
  <div class="formular-fuss"><a class="knopf" href="#">Als geprüft markieren …</a><a class="knopf primaer" href="#">Speichern</a></div>
</section>
</div>
<div class="reiter-inhalt" id="e-einw">
''' + tabelle(['Einwilligung', 'Wirkung in f.orga', 'Erteilt durch', 'Fassung', 'Erteilt', 'Stand'], [
    ['<strong>Fotos in der Öffentlichkeitsarbeit</strong>', 'keine (nur Nachweis)', 'Person, bei Minderjährigen Erziehungsberechtigte', '2', '61 von 118', '<span class="plakette ok">geprüft</span>'],
    ['<strong>Handynummer in der Telefonliste der Abteilung</strong>', 'Telefonliste zeigt die Nummer', 'Person', '1', '74 von 118', '<span class="plakette ok">geprüft</span>'],
    ['<strong>Geburtstag im Aushang</strong>', 'Liste „Geburtstage“, Zweck Aushang', 'Person', '1', '40 von 118', VORLAGE],
], 'stapel') + '''
<div class="formular-fuss"><a class="knopf" href="#">Vorlagen einfügen</a><a class="knopf primaer" href="#">Einwilligung anlegen</a></div>
<p class="meta">Eine geänderte Fassung gilt nur für neue Einwilligungen; bestehende behalten ihre Fassung, bis die Person neu einwilligt.</p>
</div>
<div class="reiter-inhalt" id="e-sicher">
<div class="raster zwei">
  <section class="karte"><h2>Anmeldung</h2>
    <div class="feld"><label>Zwei-Faktor-Anmeldung</label><select><option>aus</option><option selected>Pflicht für privilegierte Konten und Gesundheitsdaten</option><option>Pflicht für alle</option></select></div>
    <div class="feld"><label>Abmelden bei Inaktivität (privilegierte Konten)</label><select><option>30 Minuten</option><option selected>60 Minuten</option><option>4 Stunden</option></select></div>
    <div class="feld"><label>Abmelden bei Inaktivität (andere)</label><select><option selected>8 Stunden</option><option>14 Tage</option></select></div>
  </section>
  <section class="karte"><h2>E-Mails</h2>
    <label class="schalter"><input type="checkbox" checked> Fristen mit Gesundheitsbezug ohne Namen</label>
    <label class="schalter"><input type="checkbox"> Alle Fristen ohne Namen</label>
    <label class="schalter"><input type="checkbox" checked> Benutzer bei „Anmelden als“ benachrichtigen</label>
  </section>
  <section class="karte"><h2>Stand</h2>
    <dl class="daten">
      <dt>HTTPS</dt><dd><span class="plakette warn">nein – Aufruf über http://</span></dd>
      <dt>Sicherung</dt><dd><span class="plakette ok">verschlüsselt, zuletzt heute 02:30</span></dd>
      <dt>Zwei-Faktor</dt><dd>4 von 5 privilegierten Konten eingerichtet</dd>
      <dt>System</dt><dd>Echtsystem</dd>
    </dl>
  </section>
</div>
<div class="formular-fuss"><a class="knopf primaer" href="#">Speichern</a></div>
</div>
</div>''')

# ---------- Mein Bereich ----------
seite(D + 'mein-bereich.html', 'Mein Bereich', '''
<p class="neben" style="margin-top:-8px">Tobias Rief · Abt. Musterstadt</p>
<div class="raster zwei">
<section class="karte">
  <div class="karte-kopf"><h2>Meine Einwilligungen</h2></div>
  <p class="neben">Freiwillig. Ein Widerruf gilt ab sofort.</p>
  <div class="schalter-liste">
    <label class="schalter"><input type="checkbox" checked> <span><strong>Handynummer in der Telefonliste der Abteilung</strong><br><span class="meta">erteilt 14.03.2026 · <a href="#">Text lesen</a></span></span></label>
    <label class="schalter"><input type="checkbox" checked> <span><strong>Fotos in der Öffentlichkeitsarbeit</strong><br><span class="meta">erteilt 12.01.2026 · <a href="#">Text lesen</a></span></span></label>
    <label class="schalter"><input type="checkbox"> <span><strong>Geburtstag im Aushang</strong><br><span class="meta">widerrufen 02.05.2026</span></span></label>
  </div>
</section>
<section class="karte">
  <div class="karte-kopf"><h2>Meine Daten</h2></div>
  <p class="neben">Sie können jederzeit Auskunft über alle Daten verlangen, die die Feuerwehr in f.orga zu Ihnen speichert.</p>
  <div class="meldung ok"><span class="ic">✓</span><span><strong>Ihre Auskunft liegt bereit</strong> (erstellt 28.10.2026, bis 27.11.2026).</span><a class="knopf klein aktion" href="auskunft-vorschau.html">PDF herunterladen</a></div>
  <div class="formular-fuss"><button type="button" class="knopf" data-dialog="d-auskunft-anfordern">Auskunft anfordern …</button><button type="button" class="knopf" data-dialog="d-berichtigung">Berichtigung beantragen …</button></div>
</section>
<section class="karte">
  <h2>Meine Anfragen</h2>
''' + tabelle(['Art', 'Eingegangen', 'Stand'], [['Auskunft', '27.10.2026', '<span class="plakette ok">bereit</span>'], ['Berichtigung: Lehrgang Maschinist fehlt', '03.09.2026', '<span class="plakette ok">erledigt</span>']], 'stapel') + '''
</section>
<section class="karte">
  <h2>Anmeldungen als Sie</h2>
  <p class="neben">Administratoren können zur Hilfe Ihre Sicht prüfen („Anmelden als“). Das sehen Sie hier.</p>
''' + tabelle(['Datum', 'Administrator', 'Grund'], [['12.10.2026 19:04–19:11', 'Markus Vogt', 'Fehlende Dienste in Mein Bereich prüfen']], 'stapel') + '''
  <p class="meta" style="margin-top:8px"><a href="hinweis.html">Datenschutzhinweis</a> · Ansprechpartner: Markus Vogt, Kommandant · Datenschutzbeauftragter der Stadt Musterstadt</p>
</section>
</div>''', brot=[('Übersicht', None), ('Mein Bereich', None)],
    dialoge=dialog('d-auskunft-anfordern', 'Auskunft anfordern', '''
<p>Die Feuerwehr stellt Ihnen die Auskunft innerhalb eines Monats hier zum Herunterladen bereit. Sie bekommen eine E-Mail, sobald sie bereitliegt.</p>
<div class="feld"><label>Sprache</label><select><option>Deutsch</option><option>Englisch</option></select></div>''', ABBRECHEN + '<button class="knopf primaer" value="ok">Auskunft anfordern</button>')
    + dialog('d-berichtigung', 'Berichtigung beantragen', '''
<div class="feld"><label class="pflicht">Bereich</label><select><option>Lehrgänge und Qualifikationen</option><option>Einsätze</option><option>Dienste</option><option>Atemschutz</option><option>Entschädigung</option><option>Sonstiges</option></select></div>
<div class="feld"><label class="pflicht">Was ist falsch, wie ist es richtig?</label><textarea rows="3"></textarea></div>
<div class="feld"><label>Nachweis (optional)</label><input type="file"><div class="hilfe">Zum Beispiel eine Lehrgangsbescheinigung. Bitte keine Kopie des Führerscheins.</div></div>''',
        ABBRECHEN + '<button class="knopf primaer" value="ok">Antrag senden</button>'))

# ---------- Zwei-Faktor ----------
seite(D + 'zwei-faktor.html', 'Zwei-Faktor-Anmeldung einrichten', '''
<div class="meldung warnung"><span class="ic">!</span><span><strong>Warnung:</strong> Ihr Konto hat Zugriff auf Gesundheitsdaten. Ein zweiter Faktor ist Pflicht; ohne ihn geht es nach der Anmeldung nur hier weiter.</span></div>
<div class="raster drei">
<section class="karte"><h2>1 App verbinden</h2>
  <p class="neben">Mit einer Authenticator-App (z. B. der App Ihres Passwortmanagers) diesen Code scannen.</p>
  <div class="qr" aria-label="QR-Code" style="width:160px;height:160px;margin:8px 0">''' + sym('qr') + '''</div>
  <p class="meta">Ohne Kamera: <code translate="no">JBSW Y3DP EHPK 3PXP</code></p>
</section>
<section class="karte"><h2>2 Code bestätigen</h2>
  <div class="feld"><label class="pflicht">Sechsstelliger Code aus der App</label><input type="text" inputmode="numeric" autocomplete="one-time-code" value="482 913"></div>
  <a class="knopf primaer" href="#wiederherstellung">Bestätigen</a>
</section>
<section class="karte" id="wiederherstellung"><h2>3 Wiederherstellungscodes</h2>
  <p class="neben">Jeder Code gilt einmal, falls das Telefon verloren geht. Sicher aufbewahren; sie werden nur jetzt angezeigt.</p>
  <pre translate="no" style="font-size:.9rem;white-space:pre-wrap">7KQ2-MX9V  B4TR-1NW8  PL3S-D6YH
0CJ5-FG2A  QW8E-R5TZ  9UIO-P3AS
DF6G-H1JK  L4ZX-C7VB  NM2Q-W8ER
T5ZU-I0OP</pre>
  <div class="formular-fuss"><a class="knopf" href="#">Herunterladen</a><a class="knopf primaer" href="{P}shell/start.html">Fertig</a></div>
</section>
</div>''', nav='shell/start.html', brot=[('Profil', None), ('Zwei-Faktor', None)])

# ---------- Datenschutzhinweis (öffentlich) ----------
seite(D + 'hinweis.html', 'Datenschutzhinweis', f'''
<div class="anmelde-seite">
{mockup_hinweis('../')}
<div class="anmelde-oben">{SPRACHE}</div>
<main class="inhalt" style="max-width:820px;margin:0 auto">
<div class="seitenkopf"><div><h1>Datenschutzhinweis</h1></div></div>
<p class="meta">Fassung 3 vom 15.09.2026 · <a href="#">Als PDF</a> · <a href="../shell/anmeldung.html">Zur Anmeldung</a></p>
<section class="karte">
  <h2>Verantwortlicher und Datenschutzbeauftragter</h2>
  <p>Stadt Musterstadt, Marktplatz 1, 12345 Musterstadt, für die Freiwillige Feuerwehr Musterstadt. Datenschutzbeauftragter: datenschutz@musterstadt.example</p>
</section>
<section class="karte">
  <h2>Welche Daten wir wofür verarbeiten</h2>
''' + tabelle(['Tätigkeit', 'Daten', 'Rechtsgrundlage', 'Speicherdauer'], [
    ['Personalverwaltung der Feuerwehr', 'Stammdaten, Kontakt, Laufbahn', '[von der Gemeinde]', '30 Jahre nach Austritt'],
    ['Einsatzdokumentation', 'Einsatzzeiten, Funktion, Beteiligte', '[von der Gemeinde]', '3 / 30 Jahre'],
    ['Atemschutzüberwachung', 'Eignungsuntersuchung (Gesundheitsdaten)', '[von der Gemeinde]', '[von der Gemeinde]'],
    ['Benutzerkonten und Protokolle', 'Anmeldungen, Änderungen', '[von der Gemeinde]', '2 Jahre'],
], 'stapel') + f'''
  <p class="meta" style="margin-top:8px">Aus dem Verzeichnis der Verarbeitungstätigkeiten; Rechtsgrundlagen trägt die Gemeinde ein.</p>
</section>
<section class="karte">
  <h2>Ihre Rechte</h2>
  <p>Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Widerspruch (Art. 21), Widerruf einer Einwilligung (Art. 7 Abs. 3). Mitglieder mit Benutzerkonto stellen Anfragen in Mein Bereich, alle anderen beim Kommandanten.</p>
  <p>Beschwerde: Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg.</p>
</section>
</main>
{FUSS}
</div>''', ohne_rahmen=True)

# ---------- Erste Anmeldung ----------
seite(D + 'erste-anmeldung.html', 'Willkommen', f'''
<div class="anmelde-seite">
{mockup_hinweis('../')}
<div class="anmelde-oben">{SPRACHE}</div>
<main class="anmelde-mitte">
  <form class="anmelde-box" action="../shell/start.html" style="max-width:560px">
    <h1 style="margin-top:0">Bevor Sie beginnen</h1>
    <p>f.orga speichert Daten der Mitglieder der Freiwilligen Feuerwehr Musterstadt, darunter Ihre eigenen. Wofür, wie lange und welche Rechte Sie haben, steht im <a href="hinweis.html">Datenschutzhinweis</a>.</p>
    <ul>
      <li>Nutzen Sie die Daten nur für Ihre Aufgabe in der Feuerwehr.</li>
      <li>Geben Sie Listen und Ausdrucke nicht weiter und vernichten Sie sie nach Gebrauch.</li>
      <li>Tragen Sie in Bemerkungen keine Gesundheitsangaben ein.</li>
    </ul>
    <label class="schalter"><input type="checkbox"> Datenschutzhinweis (Fassung 3) zur Kenntnis genommen</label>
    <hr class="trenner">
    <h2>Freiwillige Einwilligungen</h2>
    <p class="meta">Sie können jede Einwilligung in Mein Bereich jederzeit widerrufen. Ohne Einwilligung entstehen Ihnen keine Nachteile.</p>
    <div class="schalter-liste">
      <label class="schalter"><input type="checkbox"> Handynummer in der Telefonliste der Abteilung</label>
      <label class="schalter"><input type="checkbox"> Fotos in der Öffentlichkeitsarbeit</label>
      <label class="schalter"><input type="checkbox"> Geburtstag im Aushang</label>
    </div>
    <a class="knopf primaer gross voll" style="margin-top:16px" href="../shell/start.html">Weiter</a>
  </form>
</main>
{FUSS}
</div>''', ohne_rahmen=True)
