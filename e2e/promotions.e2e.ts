import { expect, test } from '@playwright/test';
import { chooseFirst, login } from './support';

/**
 * The commander looks at the preview, creates a promotion list, promotes one proposal with a comment, decides the list
 * and gets the certificates; then reopens and deletes it, so the ranks of the demo data stay unchanged.
 */
test('promotion list from the rules', async ({ browser }) => {
  const page = await login(browser, 'commander');
  await page.goto('/promotions/lists');
  await expect(page.getByRole('heading', { name: 'Beförderungslisten', level: 1 })).toBeVisible();

  await page.getByRole('tab', { name: 'Vorschau' }).click();
  await page.getByText('Alle', { exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'Musterstadt' }).first().click();
  await expect(page.getByRole('dialog').getByText('alle Bedingungen')).toBeVisible();
  await page.keyboard.press('Escape');

  const title = `E2E ${Date.now()}`;
  await page.getByRole('button', { name: 'Neue Liste' }).click();
  await page.getByRole('dialog').getByLabel('Bezeichnung').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();

  // The demo data may only have "soon" entries on today's date: promote the first one with a comment.
  await page.getByRole('button', { name: 'Entscheiden' }).first().click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Entscheidung' }).click();
  await page.getByRole('option', { name: 'befördern', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Kommentar').fill('E2E: vorgezogen');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('E2E: vorgezogen')).toBeVisible();

  await page.getByRole('button', { name: 'Beschließen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Beschließen' }).click();
  await expect(page.getByText(/Beschlossen am/)).toBeVisible();
  const certificates = page.getByRole('link', { name: 'Urkunden' });
  await expect(certificates).toBeVisible();
  const pdf = await page.request.get((await certificates.getAttribute('href')) ?? '');
  expect(pdf.headers()['content-type']).toBe('application/pdf');

  await page.getByRole('button', { name: 'Wieder öffnen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Wieder öffnen' }).click();
  await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Liste löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Liste löschen' }).click();
  await expect(page.getByRole('heading', { name: 'Beförderungslisten', level: 1 })).toBeVisible();

  // The rules are configuration: the VwV 2022 template is shown in words.
  await page.goto('/promotions/rules');
  await page.getByRole('row').filter({ hasText: 'Truppführer' }).first().click();
  // The graphical editor shows the tree; JSON shows it in words; the rule can be tried on a person.
  const rules = page.getByRole('dialog');
  await expect(rules.getByRole('button', { name: '+ Bedingung' }).first()).toBeVisible();
  await rules.getByText('JSON', { exact: true }).click();
  await expect(rules.getByText('eine der Möglichkeiten').first()).toBeVisible();
  await chooseFirst(page, 'Person');
  await rules.getByRole('button', { name: 'Prüfen' }).click();
  await expect(rules.getByText(/^(erfüllt|fehlt|erfüllt ab)/).first()).toBeVisible();
});
