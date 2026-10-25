import { expect, test } from '@playwright/test';
import { login } from './support';

const ADMIN = { username: process.env['FORGA_ADMIN_USER'] ?? 'admin', password: process.env['FORGA_ADMIN_PASSWORD'] ?? 'sehr-geheim-123' };

test('forgotten password and reset page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Passwort vergessen?' }).click();
  await page.getByRole('dialog').getByLabel('Benutzername oder E-Mail').fill('gibt-es-nicht');
  await page.getByRole('dialog').getByRole('button', { name: 'Link senden' }).click();
  await expect(page.getByText(/Wenn es das Konto gibt/)).toBeVisible();

  await page.goto('/reset-password?token=ungueltig-ungueltig');
  await page.getByLabel(/^Neues Passwort$|^Neues Passwort \*/).fill('ganz-neues-passwort');
  await page.getByLabel(/wiederholen/).fill('ganz-neues-passwort');
  await page.getByRole('button', { name: 'Passwort setzen' }).click();
  await expect(page.getByText('Der Link ist ungültig, abgelaufen oder wurde schon benutzt.')).toBeVisible();
});

test('global search, data protection and export', async ({ browser }) => {
  const page = await login(browser, ADMIN.username, ADMIN.password);
  await page.getByRole('textbox', { name: 'Personen, Fahrzeuge, Einsätze suchen' }).fill('HLF');
  await page.getByRole('option', { name: /HLF 20/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Fahrzeuge', level: 1 })).toBeVisible();

  await page.goto('/admin/settings');
  await page.getByRole('tab', { name: 'Datenschutz' }).click();
  await page.getByRole('button', { name: 'Prüfen, was jetzt betroffen wäre' }).click();
  await expect(page.getByText(/Personen zu anonymisieren/)).toBeVisible();

  await page.getByRole('tab', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Stammdaten exportieren' }).click();
  expect((await download).suggestedFilename()).toMatch(/^forga-masterdata-.*\.json$/);

  await page.getByRole('tab', { name: 'Feuerwehr' }).click();
  await expect(page.getByText('Wappen', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Einwohnerzahl')).toBeVisible();

  // Sign-in with the municipal account is configured here; off by default, so the login page has no button.
  await page.getByRole('tab', { name: 'Anmeldung' }).click();
  await expect(page.getByLabel('Aussteller (Issuer)')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Anmeldung mit dem Konto der Gemeinde anbieten' })).not.toBeChecked();

  // Plugins: without a plugin directory (development) the panel says how to switch them on.
  await page.goto('/admin/modules');
  await expect(page.getByText(/Plugins sind aus/)).toBeVisible();
});
