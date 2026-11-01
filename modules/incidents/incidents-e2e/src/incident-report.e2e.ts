import { choose, expect, login, row, section, test } from '../../../../e2e/support';

/**
 * Scenario "write an incident report" with the two roles of the demo data:
 * the group leader of Abteilung Musterstadt writes and submits the report, the commander returns it,
 * the group leader corrects it, the commander releases it in two steps.
 */
test('group leader writes a report, commander reviews and releases it', async ({ browser }) => {
  const dispatchNumber = `E2E-${Date.now()}`;

  // ----- Group leader: create the incident and write the report -----
  const gf = await login(browser, 'group-leader');
  await gf.getByRole('navigation').getByRole('link', { name: 'Einsätze', exact: true }).click();
  await expect(gf.getByRole('heading', { name: 'Einsätze', level: 1 })).toBeVisible();
  await gf.getByRole('button', { name: '+ Einsatz anlegen' }).click();
  const create = gf.getByRole('dialog');
  await choose(gf, 'Stichwort', /^B1 – Brand klein/);
  await create.getByLabel('Leitstellennummer').fill(dispatchNumber);
  await create.getByLabel('Straße').fill('Hauptstraße');
  await create.getByLabel('Hausnummer').fill('12');
  await create.getByLabel('Ort', { exact: true }).fill('Musterstadt');
  await create.getByRole('button', { name: 'Anlegen und Bericht öffnen' }).click();

  await expect(gf).toHaveURL(/\/incidents\/reports\//);
  const reportUrl = gf.url();
  await expect(gf.getByRole('heading', { name: 'Bericht Abteilung Musterstadt' })).toBeVisible();
  await expect(gf.getByText('Hauptbericht').first()).toBeVisible();

  // Personnel: a vehicle with three persons.
  await section(gf, 'Personal & Fahrzeuge');
  await choose(gf, 'Fahrzeug oder Bereitschaft', /^HLF 20/);
  // Several persons at once: the list hides the chosen ones, so the first option is always a new person.
  await gf.getByRole('combobox', { name: 'Personen', exact: true }).click();
  for (let i = 0; i < 3; i++) await gf.getByRole('option').first().click();
  await gf.keyboard.press('Escape');
  await gf.getByRole('button', { name: '3 Personen hinzufügen' }).click();
  await expect(gf.getByText('3 von 9 Plätzen')).toBeVisible();

  // One person under breathing apparatus: the equipment card suggests an apparatus, a mask and a cylinder of the HLF.
  await gf.getByRole('button').filter({ hasText: / h · / }).first().click();
  await gf.getByRole('dialog').getByLabel('unter Atemschutz').check();
  await gf.getByRole('dialog').getByRole('button', { name: 'Übernehmen' }).click();
  await section(gf, 'Beteiligte & Sonstiges');
  await expect(gf.getByText(/^Atemschutz im Bericht – Vorschlag: /)).toBeVisible();
  await gf.getByRole('button', { name: 'Übernehmen' }).click();
  await gf.getByRole('button', { name: 'Geräte speichern' }).click();
  await expect(gf.getByText('Geräte gespeichert')).toBeVisible();

  // Situation and course.
  await section(gf, 'Lage & Verlauf');
  await gf.getByLabel('Lage bei Eintreffen').fill('Brennender Müllcontainer neben Garage');
  await gf.getByLabel('Maßnahmen / Verlauf').fill('Ablöschen mit 1 C-Rohr, Nachkontrolle mit Wärmebildkamera');

  // The end of the incident is a default (alarm + 1 hour) until confirmed.
  await section(gf, 'Zeiten & Ort');
  await gf.getByRole('button', { name: 'Ende bestätigen' }).click();
  await expect(gf.getByRole('button', { name: 'Ende bestätigen' })).toHaveCount(0);

  // Statistics of the incident (on the incident page): accept the suggestion from the keyword, then the fire size.
  await section(gf, 'Prüfen');
  await expect(gf.getByRole('alert').filter({ hasText: 'Die Statistikmerkmale des Einsatzes fehlen.' })).toBeVisible();
  await gf.getByRole('link', { name: 'Zum Einsatz' }).first().click();
  await expect(gf).toHaveURL(/\/incidents\/incidents\//);
  await gf.getByRole('button', { name: 'Vorschlag übernehmen' }).click();
  await gf.getByLabel('Kleinbrand B').check();
  await gf.getByRole('button', { name: 'Statistik speichern' }).click();
  await expect(gf.getByText('Statistik gespeichert.')).toBeVisible();
  await gf.goto(reportUrl);

  // Check and submit.
  // Warnings (e.g. the same persons in an earlier test run at the same time) need a reason; errors must not be open.
  await section(gf, 'Prüfen');
  await expect(gf.getByText(/^Automatisch gespeichert|^Gespeichert/)).toBeVisible();
  await expect(gf.getByText(/^0 Fehler,/)).toBeVisible();
  const reasons = gf.getByLabel(/^Begründung/);
  const warnings = await reasons.count();
  for (let i = 0; i < warnings; i++) await reasons.nth(i).fill('E2E-Test: Personen aus früherem Testlauf');
  await gf.getByRole('button', { name: 'Fertig melden' }).click();
  await gf.getByRole('dialog').getByRole('button', { name: 'Fertig melden' }).click();
  await expect(gf.getByText('Zur Prüfung').first()).toBeVisible();
  await expect(gf.getByText('Der Bericht ist zur Prüfung gemeldet.')).toBeVisible();
  await expect(gf.getByRole('button', { name: 'Fertig melden' })).toHaveCount(0);

  // ----- Commander: return the report with a note -----
  const kdt = await login(browser, 'commander');
  await expect(kdt.getByText('Berichte zur Prüfung')).toBeVisible();
  await kdt.getByRole('navigation').getByRole('link', { name: /^Zur Prüfung/ }).click();
  await row(kdt, dispatchNumber).click();
  await kdt.getByRole('button', { name: 'Zurück an Verfasser …' }).click();
  await kdt.getByLabel('Was soll geändert werden?').fill('Bitte die Ursache eintragen.');
  await kdt.getByRole('button', { name: 'Zurückgeben' }).click();
  await expect(row(kdt, dispatchNumber)).toHaveCount(0);

  // ----- Group leader: correct and submit again -----
  await gf.goto(reportUrl);
  await expect(gf.getByText('Zurückgegeben mit dem Hinweis: „Bitte die Ursache eintragen.“')).toBeVisible();
  await section(gf, 'Lage & Verlauf');
  await gf.getByLabel('Ursache (soweit bekannt)').fill('Zigarettenkippe');
  await gf.getByRole('button', { name: 'Fertig melden' }).click();
  await gf.getByRole('dialog').getByRole('button', { name: 'Fertig melden' }).click();
  await expect(gf.getByText('Der Bericht ist zur Prüfung gemeldet.')).toBeVisible();

  // ----- Commander: release for compensation, then for billing -----
  await kdt.reload();
  await row(kdt, dispatchNumber).click();
  // The commander sees the reasons the author gave for the warnings.
  if (warnings) await expect(kdt.getByText('Begründung: „E2E-Test: Personen aus früherem Testlauf“').first()).toBeVisible();
  await kdt.getByRole('button', { name: 'Freigeben zur Entschädigungsauszahlung' }).click();
  await kdt.getByRole('dialog').getByRole('button', { name: 'Jetzt freigeben' }).click();
  await expect(kdt.getByText('Bericht freigegeben.')).toBeVisible();

  await kdt.getByText('Freigegeben zur Entschädigung', { exact: true }).click();
  await row(kdt, dispatchNumber).click();
  await kdt.getByRole('button', { name: 'Freigeben zur Abrechnung' }).click();
  await kdt.getByRole('dialog').getByRole('button', { name: 'Jetzt freigeben' }).click();
  await expect(row(kdt, dispatchNumber)).toHaveCount(0);

  // ----- Group leader: the report is released and locked -----
  await gf.goto(reportUrl);
  await expect(gf.getByText('Freigabe Abrechnung').first()).toBeVisible();
  await expect(gf.getByText(/Gesperrt von/)).toBeVisible();
  await section(gf, 'Lage & Verlauf');
  await expect(gf.getByLabel('Ursache (soweit bekannt)')).toBeDisabled();
});
