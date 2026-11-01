import { ADMIN, choose, expect, login, test } from '../../../../e2e/support';

/** The administrator adds, edits and removes a department with station and vehicle. */
test('administrator maintains the organization', async ({ browser }) => {
  const name = `E2E-Einheit-${Date.now()}`;
  const page = await login(browser, ADMIN.username);
  await page.goto('/masterdata/organization');
  await expect(page.getByRole('heading', { name: 'Organisation', level: 1 })).toBeVisible();

  // Add a command unit.
  await page.getByRole('button', { name: '+ Abteilung anlegen' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill(name);
  await dialog.getByLabel(/^Kurzname/).fill('E2E');
  await choose(page, 'Typ', 'Führungseinheit');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  // Edit it.
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Kurzname/).fill('E2E geändert');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('E2E geändert')).toBeVisible();

  // Station and vehicle.
  await page.getByRole('button', { name: '+ Wache' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill('E2E-Wache');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('cell', { name: 'E2E-Wache' })).toBeVisible();
  await page.getByRole('button', { name: '+ Fahrzeug' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Bezeichnung/).fill('E2E-KdoW');
  await choose(page, 'Fahrzeugtyp', 'KdoW');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('cell', { name: 'E2E-KdoW' })).toBeVisible();

  // The department cannot be removed while it has a station.
  await page.getByRole('button', { name: 'Löschen …' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Der Abteilung sind noch Wachen zugeordnet.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();

  // Remove vehicle, station and department.
  await page.getByRole('cell', { name: 'E2E-KdoW' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen …' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('cell', { name: 'E2E-KdoW' })).toHaveCount(0);
  await page.getByRole('cell', { name: 'E2E-Wache' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen …' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('cell', { name: 'E2E-Wache' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Löschen …' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
