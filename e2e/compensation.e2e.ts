import { expect, login, test } from './support';

/**
 * The administration (treasury) checks a payout run, records a manual item and looks at the
 * function allowances; the draft is deleted again so the demo data stays as it is.
 */
test('payout run, manual item and function allowances', async ({ browser }) => {
  const label = `E2E Fahrtkosten ${Date.now()}`;
  const page = await login(browser, 'administration');
  await page.goto('/compensation/runs');
  await expect(page.getByRole('heading', { name: 'Auszahlungsläufe', level: 1 })).toBeVisible();
  await expect(page.getByText('Ausgezahlt').first()).toBeVisible();

  // Manual item.
  await page.goto('/compensation/items');
  await page.getByRole('button', { name: '+ Posten von Hand' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Name' }).click();
  await page.getByRole('option').first().click();
  await dialog.getByLabel(/^Bezeichnung/).fill(label);
  await dialog.getByLabel(/^Betrag/).fill('12,50');
  await dialog.getByLabel(/^Begründung/).fill('Beleg liegt vor');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Posten gespeichert')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: label });
  await expect(row).toBeVisible();

  // A draft run for the previous month with persons, items and notes (a draft left by an aborted run is removed first).
  await page.goto('/compensation/runs');
  await expect(page.getByText('Ausgezahlt').first()).toBeVisible();
  if (await page.getByRole('button', { name: 'Offenen Entwurf öffnen' }).isVisible()) {
    await page.getByRole('button', { name: 'Offenen Entwurf öffnen' }).click();
    await page.getByRole('button', { name: 'Entwurf löschen' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  }
  await page.getByRole('button', { name: '+ Neuer Lauf' }).click();
  await page.getByRole('button', { name: 'Lauf anlegen' }).click();
  await expect(page.getByRole('heading', { name: /Auszahlungslauf \d{4}-\d{2}/, level: 1 })).toBeVisible();
  await expect(page.getByText('Entwurf', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Excel' })).toBeVisible();
  await page.getByRole('tab', { name: 'Posten' }).click();
  await expect(page.getByRole('columnheader', { name: 'Bezeichnung' })).toBeVisible();
  await page.getByRole('tab', { name: /Hinweise/ }).click();
  await page.getByRole('button', { name: 'Entwurf löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('heading', { name: 'Auszahlungsläufe', level: 1 })).toBeVisible();

  // Remove the manual item again.
  await page.goto('/compensation/items');
  await page.getByRole('row').filter({ hasText: label }).getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Posten gelöscht')).toBeVisible();

  // Function allowances and annual totals.
  await page.goto('/compensation/functions');
  await expect(page.getByRole('heading', { name: 'Funktionspauschalen', level: 1 })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Kommandant', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pauschalen erzeugen' }).click();
  await expect(page.getByText(/Posten erzeugt bzw. aktualisiert/)).toBeVisible();
});

/** The hourly incident rates are set in the compensation settings; the incident reports settings point there. */
test('incident rates in the compensation settings', async ({ browser }) => {
  const page = await login(browser, 'commander');
  await page.goto('/incidents/settings');
  await expect(page.getByText('werden in den Einstellungen der Entschädigungen gepflegt')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stundensätze' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Zu den Einstellungen' })).toHaveAttribute('href', '/compensation/settings');

  // The administration (treasury) keeps the statute.
  const treasury = await login(browser, 'administration');
  await treasury.goto('/compensation/settings');
  await expect(treasury.getByText('Stundensätze für Einsätze')).toBeVisible();
  await expect(treasury.locator('input[value="Bereitschaft im Gerätehaus"]')).toBeVisible();

  // Preview of an incident with the settings as edited.
  await treasury.getByLabel('Einsätze von').fill('01.01.2020');
  await treasury.getByLabel('Einsätze von').press('Tab');
  await treasury.getByRole('combobox', { name: 'Einsatz', exact: true }).click();
  await treasury.getByRole('option').first().click();
  await treasury.getByRole('button', { name: 'Berechnen' }).click();
  await expect(treasury.getByRole('columnheader', { name: 'Auszahlung' }).first()).toBeVisible();
});
