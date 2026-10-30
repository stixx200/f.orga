import { ADMIN, api, choose, createPerson, expect, login, restore, row, test, USERS } from './support';

const DESCRIPTION = /^Datenschutz: Betroffenenanfragen mit Frist/;

/**
 * Verwaltung → Module: the administrator switches the module Datenschutz off. Its menu entry and the public privacy
 * notice are gone, and a person whose processing is restricted shows up again for the commander. Switched on again, the
 * stored restriction applies again. Module and restriction are restored afterwards.
 */
test('data protection module switched off and on again', async ({ browser, page: visitor }) => {
  const admin = await login(browser, ADMIN.username);
  const commander = await login(browser, USERS.commander);
  const person = await createPerson(admin, `Modul${Date.now()}`);
  await api(admin, 'PUT', `privacy/persons/${person.id}/restriction`, { reason: 'legal-claims', until: null, requestId: null });
  const persons = async (visible: boolean) => {
    await commander.goto('/masterdata/persons');
    await choose(commander, 'Abteilung', 'Abteilung Musterstadt');
    await commander.getByRole('searchbox', { name: 'Suche' }).fill(person.lastName);
    await expect(row(commander, `${person.lastName}, ${person.firstName}`)).toHaveCount(visible ? 1 : 0);
    if (!visible) await expect(commander.getByText('Keine Personen gefunden.')).toBeVisible();
  };
  await persons(false);

  const menu = admin.getByRole('navigation', { name: 'Menü' });
  const card = (state: 'Deaktivieren' | 'Aktivieren') => admin.locator('div').filter({ has: admin.getByText(DESCRIPTION) }).filter({ has: admin.getByRole('button', { name: state }) }).last();
  try {
    await admin.goto('/admin/modules');
    await expect(card('Deaktivieren').getByText('aktiv', { exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Datenschutz', exact: true })).toBeVisible();
    await card('Deaktivieren').getByRole('button', { name: 'Deaktivieren' }).click();
    const confirm = admin.getByRole('dialog', { name: 'Datenschutz deaktivieren?' });
    await confirm.getByRole('button', { name: 'Deaktivieren' }).click();
    await expect(card('Aktivieren').getByText('nicht aktiv', { exact: true })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Datenschutz', exact: true })).toHaveCount(0);

    // The public notice is switched off, the login page no longer links it.
    await visitor.goto('/privacy-notice');
    await expect(visitor.getByText('Diese Seite ist abgeschaltet: Das Modul ist nicht aktiv.')).toBeVisible();
    await visitor.goto('/');
    await expect(visitor.getByLabel('Benutzername')).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Datenschutzhinweis' })).toHaveCount(0);

    // Without the module nobody is restricted.
    await persons(true);
    await commander.goto(`/masterdata/persons/${person.id}`);
    await expect(commander.getByRole('heading', { name: person.name, level: 1 })).toBeVisible();
    await expect(commander.getByRole('tab', { name: 'Datenschutz' })).toHaveCount(0);

    // Switched on again: the stored restriction applies again.
    await card('Aktivieren').getByRole('button', { name: 'Aktivieren' }).click();
    await expect(menu.getByRole('link', { name: 'Datenschutz', exact: true })).toBeVisible();
    await persons(false);
    await visitor.goto('/privacy-notice');
    await expect(visitor.getByRole('heading', { name: 'Datenschutzhinweis', level: 1 })).toBeVisible();
  } finally {
    if (!admin.isClosed()) {
      await restore('the module privacy', () => api(admin, 'PUT', 'core/modules/privacy', { active: true }));
      await restore('the restriction of the test person', () => api(admin, 'DELETE', `privacy/persons/${person.id}/restriction`));
    }
  }
});
