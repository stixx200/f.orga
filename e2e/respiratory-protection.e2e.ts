import { expect, test } from '@playwright/test';
import { login } from './support';

/**
 * The breathing apparatus officer checks the traffic light, records a briefing for a person who is not fit
 * and enters a stress exercise for several wearers at once.
 */
test('fitness overview, evidence in the person file and quick entry', async ({ browser }) => {
  const page = await login(browser, 'breathing-apparatus-officer');
  await page.goto('/respiratory-protection/overview');
  await expect(page.getByRole('heading', { name: 'Atemschutztauglichkeit', level: 1 })).toBeVisible();

  // Filter by the red tile and open the first person.
  await page.getByRole('button', { name: /Nicht einsetzen/ }).click();
  const first = page.getByRole('row').nth(1);
  await expect(first.getByText('Nicht einsetzen')).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/masterdata\/persons\//);
  await page.getByRole('tab', { name: 'Atemschutz' }).click();
  await expect(page.getByText('Eignungsuntersuchung').first()).toBeVisible();

  // Record a briefing.
  await page.getByRole('button', { name: '+ Nachweis eintragen' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Art' }).click();
  await page.getByRole('option', { name: 'Unterweisung', exact: true }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Nachweis gespeichert')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Unterweisung', exact: true }).first()).toBeVisible();

  // Quick entry after the training track.
  await page.goto('/respiratory-protection/quick-entry');
  await expect(page.getByRole('heading', { name: 'Schnellerfassung', level: 1 })).toBeVisible();
  const rows = page.getByRole('row').filter({ has: page.getByRole('checkbox') });
  for (const index of [0, 1]) {
    await rows.nth(index).getByRole('checkbox').first().check();
    await rows.nth(index).getByRole('textbox', { name: 'Arbeit (kJ)' }).fill('92');
  }
  await expect(page.getByText('2 Personen ausgewählt')).toBeVisible();
  await page.getByRole('button', { name: 'Nachweise speichern' }).click();
  await expect(page.getByText('2 Nachweise gespeichert')).toBeVisible();
});
