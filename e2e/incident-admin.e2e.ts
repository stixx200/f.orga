import { expect, test } from '@playwright/test';
import { choose, chooseFirst, login, row } from './support';

/** The commander uses open reports, compensation, duty roster, annual statistics and settings. */
test('commander works with the evaluations and settings of the incident reports', async ({ browser }) => {
  const page = await login(browser, 'commander');
  const nav = (name: string) => page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${name}`) }).click();

  // Open reports grouped by author.
  await nav('Offene Berichte');
  await expect(page.getByRole('heading', { name: 'Offene Berichte', level: 1 })).toBeVisible();
  await expect(page.getByText('Entwurf oder zurückgegeben')).toBeVisible();

  // Payout check for last month and the export link.
  await nav('Entschädigung');
  await expect(page.getByRole('heading', { name: 'Entschädigung', level: 1 })).toBeVisible();
  await expect(page.getByText('Berichte im Zeitraum')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Auszahlung exportieren' })).toHaveAttribute('href', /incidents\/compensation\/export\?from=/);

  // Duty roster: add and delete a duty.
  await nav('EvD-Dienst');
  await page.getByRole('button', { name: '+ Dienst eintragen' }).click();
  const dialog = page.getByRole('dialog');
  await chooseFirst(page, 'Person');
  await dialog.getByLabel(/^von/).fill('2026-12-24T18:00');
  await dialog.getByLabel(/^bis/).fill('2026-12-26T18:00');
  await dialog.getByLabel('Bemerkung').fill('E2E Weihnachten');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Dienst gespeichert.')).toBeVisible();
  const duty = row(page, '24.12.2026');
  await expect(duty).toBeVisible();
  await duty.getByRole('button', { name: 'Löschen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(row(page, '24.12.2026')).toHaveCount(0);

  // Annual statistics: correct a radio count and remove the correction again.
  await nav('Jahresstatistik');
  await expect(page.getByRole('heading', { name: /Jahresstatistik \d{4}/ })).toBeVisible();
  await choose(page, 'Seite der Landesvorlage', /Seite 14/);
  const radios = row(page, 'F121');
  await radios.getByRole('button').first().click();
  await page.getByRole('dialog').getByLabel('Wert').fill('12');
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(radios.getByRole('button', { name: '12 *' })).toBeVisible();
  await radios.getByRole('button').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Korrektur entfernen' }).click();
  await expect(radios.getByRole('button', { name: '12 *' })).toHaveCount(0);

  // Settings: all tabs open, rules can be saved.
  await nav('Einsatzberichte');
  await expect(page.getByRole('heading', { name: 'Einstellungen Einsatzberichte' })).toBeVisible();
  await page.getByRole('tab', { name: 'Stichworte und Statistik' }).click();
  await expect(page.getByRole('cell', { name: 'B-BMA' })).toBeVisible();
  await page.getByRole('tab', { name: 'Prüfregeln' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Gespeichert.').first()).toBeVisible();
});
