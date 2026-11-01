import { ADMIN, expect, login, test } from '../../../../e2e/support';

/** Vehicles, course planning and catalogs open, show data and can be edited. */
test('administrator uses vehicles, course planning and catalogs', async ({ browser }) => {
  const page = await login(browser, ADMIN.username);

  await page.goto('/masterdata/vehicles');
  await expect(page.getByRole('heading', { name: 'Fahrzeuge', level: 1 })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'HLF 20' }).first()).toBeVisible();

  await page.goto('/masterdata/courses');
  await expect(page.getByRole('heading', { name: 'Lehrgangsplanung', level: 1 })).toBeVisible();
  await page.getByRole('cell', { name: 'Truppführer', exact: true }).click();
  await expect(page.getByText(/Weitere Kandidaten \(\d+\)/)).toBeVisible();
  // Only the candidates panel: the nominations above have selection boxes as well.
  const panel = page.locator('div:has(> div > h2)').filter({ has: page.getByRole('heading', { name: /Weitere Kandidaten/ }) });
  const candidates = panel.getByRole('checkbox');
  if (await candidates.count()) {
    await candidates.first().check();
    await page.getByRole('button', { name: '1 Person vormerken' }).click();
    await expect(page.getByText('Vorgemerkt.').first()).toBeVisible();
  }

  const key = `e2e-${Date.now()}`;
  await page.goto('/masterdata/catalogs');
  await expect(page.getByRole('heading', { name: 'Kataloge', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'Ehrungen' }).click();
  await page.getByRole('button', { name: '+ Eintrag' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Schlüssel/).fill(key);
  await dialog.getByLabel(/^Bezeichnung \(deutsch\)/).fill('E2E-Ehrennadel');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('row').filter({ hasText: key }).click();
  await page.getByRole('dialog').getByLabel('aktiv').uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('row').filter({ hasText: key }).getByText('inaktiv')).toBeVisible();
});
