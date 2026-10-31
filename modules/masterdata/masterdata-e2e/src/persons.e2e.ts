import { choose, expect, login, test } from '../../../../e2e/support';

/**
 * The commander admits a new member: create with probation, fill in the person file,
 * record a passed course, admit finally, promote, add a second department, record leaving.
 */
test('commander maintains a person file', async ({ browser }) => {
  const lastName = `E2E${Date.now()}`;
  const page = await login(browser, 'commander');
  await page.goto('/masterdata/persons');
  await expect(page.getByRole('heading', { name: 'Personen', level: 1 })).toBeVisible();

  // Create.
  await page.getByRole('link', { name: '+ Person anlegen' }).click();
  await page.getByLabel(/^Vorname/).fill('Erika');
  await page.getByLabel(/^Nachname/).fill(lastName);
  await choose(page, 'Stammabteilung', 'Abteilung Musterstadt');
  await page.getByRole('button', { name: 'Person anlegen' }).last().click();
  await expect(page.getByRole('heading', { name: `Erika ${lastName}` })).toBeVisible();
  await expect(page.getByText('Probezeit').first()).toBeVisible();

  // Master data with explicit save.
  await page.getByLabel('Mobil').fill('0151 1234567');
  await page.getByLabel('Ort', { exact: true }).first().fill('Musterstadt');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Alle Änderungen gespeichert')).toBeVisible();

  // A passed course grants its qualification.
  await page.getByRole('tab', { name: 'Lehrgänge' }).click();
  await page.getByRole('button', { name: '+ Teilnahme eintragen' }).click();
  await choose(page, 'Lehrgang', /Truppmann Teil 1|Grundausbildung/);
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('bestanden').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Qualifikationen' }).click();
  await expect(page.getByRole('cell', { name: 'Lehrgang' }).first()).toBeVisible();

  // Final admission, promotion, second department.
  await page.getByRole('tab', { name: 'Feuerwehr' }).click();
  await page.getByRole('button', { name: 'Endgültig aufnehmen …' }).click();
  // Before the end of the probation the admission needs a reason.
  await page.getByRole('dialog').getByLabel(/^Begründung für die vorzeitige Aufnahme/).fill('E2E: Beschluss des Feuerwehrausschusses');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('aktiv').first()).toBeVisible();
  await page.getByRole('button', { name: '+ Dienstgrad' }).click();
  await choose(page, 'Dienstgrad', 'Feuerwehrmann/-frau');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('cell', { name: 'Feuerwehrmann/-frau' })).toBeVisible();
  await page.getByRole('button', { name: '+ Abteilung' }).click();
  await choose(page, 'Abteilung', 'Abteilung Ahornfeld');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('cell', { name: 'Abteilung Ahornfeld' })).toBeVisible();

  // An office with period (the catalog template brings the offices).
  await page.request.post('/api/masterdata/catalog/templates/bw', { headers: { 'x-forga': '1' }, data: {} });
  await page.getByRole('tab', { name: 'Ämter' }).click();
  await page.getByRole('button', { name: '+ Amt' }).click();
  await choose(page, 'Amt', 'Jugendfeuerwehrwart');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('cell', { name: 'Jugendfeuerwehrwart' })).toBeVisible();
  await expect(page.getByText('aktuell', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Feuerwehr' }).click();

  // Leaving ends the memberships; the person moves to "Ausgeschieden".
  await page.getByRole('button', { name: 'Austritt erfassen …' }).click();
  await choose(page, 'Grund', 'Auf eigenen Wunsch');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('ausgeschieden').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Historie' }).click();
  await expect(page.getByText('Geändert').first()).toBeVisible();
});
