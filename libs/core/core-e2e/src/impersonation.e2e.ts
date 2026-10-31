import { ADMIN, expect, login, test } from '../../../../e2e/support';

/** The administrator logs in as the group leader, sees the banner and returns to the own account. */
test('administrator impersonates the group leader', async ({ browser }) => {
  const page = await login(browser, ADMIN.username);
  await page.goto('/admin/users');
  await page.getByRole('cell', { name: 'group-leader', exact: true }).click();
  await page.getByRole('button', { name: 'Anmelden als …' }).click();
  await page.getByRole('dialog').getByLabel(/^Grund/).fill('Prüfen, was der Gruppenführer sieht');
  await page.getByRole('dialog').getByRole('button', { name: 'Anmelden als' }).click();

  await expect(page.getByText(/Sie sind als .* \(Gruppenführer\) angemeldet \(Impersonation durch Administrator/)).toBeVisible();
  // The group leader has no administration in the menu.
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Benutzer' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Zurück zu meinem Konto' }).click();
  await expect(page.getByRole('heading', { name: 'Benutzer', level: 1 })).toBeVisible();
  await expect(page.getByText(/Impersonation durch/)).toHaveCount(0);

  await page.goto('/admin/audit');
  await expect(page.getByRole('cell', { name: 'Anmelden als anderer Benutzer beendet', exact: true }).first()).toBeVisible();
});
