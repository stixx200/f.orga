import { expect, login, test } from '../../../../e2e/support';

/**
 * The commander creates a cost notice for a chargeable incident, adds material, issues it and cancels it again
 * (so the demo data stays reusable).
 */
test('cost notice from a chargeable incident', async ({ browser }) => {
  const page = await login(browser, 'commander');
  await page.goto('/cost-recovery/candidates');
  await expect(page.getByRole('heading', { name: 'Kostenpflichtige Einsätze', level: 1 })).toBeVisible();
  // A free chargeable incident, otherwise a draft left by an earlier run.
  const create = page.getByRole('button', { name: 'Bescheid erstellen' }).first();
  const draft = page.getByRole('row').filter({ hasText: 'Entwurf' }).getByRole('button', { name: 'Öffnen' }).first();
  await expect(create.or(draft).first()).toBeVisible();
  if (await create.isVisible()) await create.click();
  else await draft.click();
  await expect(page.getByRole('heading', { name: /Kostenbescheid KE-\d{4}-\d{3}/, level: 1 })).toBeVisible();
  await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Bezeichnung' }).first()).toHaveValue(/Personal/);

  // Material from the settings.
  await page.getByRole('combobox', { name: '+ Position (Material, Kosten Dritter, …)' }).click();
  await page.getByRole('option', { name: /Ölbindemittel/ }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Bescheid gespeichert')).toBeVisible();

  await page.getByRole('button', { name: 'Zur Prüfung' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Zur Prüfung' }).click();
  await expect(page.getByText('Zur Prüfung', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Erlassen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Erlassen' }).click();
  await expect(page.getByText(/Das PDF ist unveränderlich abgelegt/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bescheid (PDF)' })).toBeVisible();

  // Waiver: the notice is cancelled with a reason.
  await page.getByRole('button', { name: 'Aufheben …' }).click();
  await page.getByRole('dialog').getByLabel(/Begründung/).fill('E2E: Verzicht wegen unbilliger Härte');
  await page.getByRole('dialog').getByRole('button', { name: 'Aufheben' }).click();
  await expect(page.getByText(/Aufgehoben am/)).toBeVisible();
});
