import { ADMIN, api, expect, login, restore, test } from '../../../../e2e/support';

/**
 * Verwaltung → Module: the administrator switches the module Beförderungen off (gone from the menu, data kept) and on
 * again, and opens a settings page from the card of a module. The start page lists what still has to be set up.
 */
test('administrator switches a module off and on; setup list on the start page', async ({ browser }) => {
  const page = await login(browser, ADMIN.username);
  const menu = page.getByRole('navigation', { name: 'Menü' });

  // Setup list: open items with a link each, e.g. the settings of modules nobody has saved yet.
  const setup = page.locator('div').filter({ has: page.getByText('Bevor alle mit f.orga arbeiten, fehlt noch:') }).last();
  await expect(setup).toBeVisible();
  await expect(page.getByText(/^\d+ von \d+ erledigt$/)).toBeVisible();
  await expect(setup.getByText(/^Einstellungen prüfen: /).first()).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Einrichtung' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Bevor alle mit f.orga arbeiten, fehlt noch:')).toBeHidden();
  await toggle.click();
  await expect(page.getByText('Bevor alle mit f.orga arbeiten, fehlt noch:')).toBeVisible();
  await setup.getByRole('link', { name: 'Einrichten' }).first().click();
  await expect(page).not.toHaveURL(/\/$/);

  try {
    await page.goto('/admin/modules');
    const card = page.locator('div').filter({ has: page.getByText('Beförderungsregeln, jährliche Beförderungsliste mit Beschluss und Durchführung.') }).filter({ has: page.getByRole('button', { name: 'Deaktivieren' }) }).last();
    await expect(card.getByText('aktiv', { exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Beförderungslisten' })).toBeVisible();
    await card.getByRole('button', { name: 'Deaktivieren' }).click();
    const confirm = page.getByRole('dialog', { name: 'Beförderungen deaktivieren?' });
    await expect(confirm).toContainText('Die Daten bleiben erhalten');
    await confirm.getByRole('button', { name: 'Deaktivieren' }).click();

    // The shell starts over without the module.
    const inactive = page.locator('div').filter({ has: page.getByText('Beförderungsregeln, jährliche Beförderungsliste mit Beschluss und Durchführung.') }).filter({ has: page.getByRole('button', { name: 'Aktivieren' }) }).last();
    await expect(inactive.getByText('nicht aktiv', { exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Beförderungslisten' })).toHaveCount(0);
    expect((await page.request.get('/api/promotions/lists')).ok()).toBe(false);

    await inactive.getByRole('button', { name: 'Aktivieren' }).click();
    await expect(menu.getByRole('link', { name: 'Beförderungslisten' })).toBeVisible();
    await expect(page.locator('div').filter({ has: page.getByText('Beförderungsregeln, jährliche Beförderungsliste mit Beschluss und Durchführung.') }).filter({ has: page.getByRole('button', { name: 'Deaktivieren' }) }).last()).toBeVisible();
  } finally {
    if (!page.isClosed()) await restore('the module promotions', () => api(page, 'PUT', 'core/modules/promotions', { active: true }));
  }

  // Settings pages of a module open from its card.
  const transfer = page.locator('div').filter({ has: page.getByText(/^Datenübernahme aus MP-Feuer-Transferdateien/) }).filter({ has: page.getByRole('button', { name: 'Deaktivieren' }) }).last();
  await transfer.getByRole('link', { name: 'MP-Feuer' }).click();
  await expect(page).toHaveURL(/\/mp-feuer\/settings$/);
});
