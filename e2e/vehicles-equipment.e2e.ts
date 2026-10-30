import { choose, expect, login, navigate, row, test, USERS } from './support';

/**
 * Vehicles show radio call sign and station; the equipment officer records an item loaded on a vehicle (offered with
 * designation, radio call sign and department), sees its place by the radio call sign and retires it again.
 */
test('vehicles with radio call sign and station, equipment on a vehicle', async ({ browser }) => {
  const page = await login(browser, USERS.equipmentOfficer);
  await navigate(page, 'Fahrzeuge');
  await expect(page.getByRole('heading', { name: 'Fahrzeuge', level: 1 })).toBeVisible();
  await page.getByRole('main').getByLabel('Suche').fill('1/46');
  const hlf = row(page, 'Florian Musterstadt 1/46');
  await expect(hlf).toHaveCount(1);
  await expect(hlf).toContainText('HLF 20');
  await expect(hlf).toContainText('Feuerwehrhaus Musterstadt');
  await expect(hlf).toContainText('MS-FE 146');

  const number = `E2E-G-${Date.now()}`;
  await page.goto('/equipment/items');
  await page.getByRole('button', { name: '+ Gerät' }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog, 'Kategorie', /.+/);
  await dialog.getByLabel(/^Inventar-Nr\./).fill(number);
  await dialog.getByLabel(/^Bezeichnung/).fill('Wärmebildkamera E2E');
  await choose(dialog, 'Abteilung', 'Abteilung Musterstadt');
  await choose(dialog, 'Fahrzeug', 'HLF 20 · Florian Musterstadt 1/46 (Musterstadt)');
  await dialog.getByLabel('Beladeplatz / Lagerort').fill('G1');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Wärmebildkamera E2E', level: 1 })).toBeVisible();
  await expect(page.getByText('Florian Musterstadt 1/46 · G1').first()).toBeVisible();

  // The list of items shows the place as well.
  await page.goto('/equipment/items');
  await page.getByRole('main').getByLabel('Suche').fill(number);
  await expect(row(page, number)).toContainText('Florian Musterstadt 1/46 · G1');
  await row(page, number).click();

  // Retired: kept with its history.
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'Aussondern' }).click();
  await page.getByRole('dialog').getByLabel(/^Grund/).fill('Testgerät');
  await page.getByRole('dialog').getByRole('button', { name: 'Aussondern' }).click();
  await expect(page.getByText('Gerät ausgesondert').first()).toBeVisible();
});
