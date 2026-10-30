import { ADMIN, expect, login, test } from './support';

test('privacy notice without sign-in, linked from the login page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Datenschutzhinweis' }).click();
  await expect(page).toHaveURL(/\/privacy-notice$/);
  await expect(page.getByRole('heading', { name: 'Datenschutzhinweis', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Als PDF' })).toBeVisible();
});

test('data protection module: requests, register, read log; security and retention in the core settings', async ({ browser }) => {
  const page = await login(browser, ADMIN.username);
  await page.getByRole('navigation').getByRole('link', { name: 'Datenschutz', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy\/?$/);
  await expect(page.getByRole('heading', { name: 'Datenschutz', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Anfragen' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Verzeichnis' }).click();
  await expect(page).toHaveURL(/\/privacy\/register$/);

  // The read log is a tab of the audit log, contributed by the module.
  await page.goto('/admin/audit');
  await page.getByRole('tab', { name: 'Leseprotokoll' }).click();
  await expect(page.getByText(/^Zugriffe auf Gesundheitsdaten und andere besonders geschützte Daten/)).toBeVisible();

  // Security and retention belong to the core.
  await page.goto('/admin/settings?tab=security');
  await expect(page.getByRole('tab', { name: 'Sicherheit' })).toHaveAttribute('aria-selected', 'true');
});
