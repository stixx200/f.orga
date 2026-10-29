import { expect, test } from '@playwright/test';
import { login } from './support';

/**
 * A member opens "My area": own file, contact details, next sessions with an excuse (withdrawn again),
 * respiratory protection status and the defect report form.
 */
test('my area of a member', async ({ browser }) => {
  const page = await login(browser, 'member');
  await page.getByRole('link', { name: 'Mein Bereich' }).click();
  await expect(page.getByRole('heading', { name: 'Mein Bereich', level: 1 })).toBeVisible();
  await expect(page.getByText(/Meine Personalakte:/)).toBeVisible();
  await expect(page.getByText('Mein Atemschutz').or(page.getByText('Atemschutztauglichkeit'))).toBeVisible();

  // Contact details: save the mobile number unchanged plus a marker and back again.
  const mobile = page.getByLabel('Mobil');
  const before = await mobile.inputValue();
  await mobile.fill('0170 0000000');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Ihre Angaben sind gespeichert.')).toBeVisible();
  await mobile.fill(before);
  await page.getByRole('button', { name: 'Speichern' }).click();

  // Excuse for the next session and withdraw it again.
  const upcoming = page.getByRole('region', { name: 'Meine Dienste' });
  const excuse = upcoming.getByRole('button', { name: 'Entschuldigen' }).first();
  if (await excuse.count()) {
    await excuse.click();
    await page.getByRole('dialog').getByRole('radio', { name: 'beruflich' }).check();
    await page.getByRole('dialog').getByLabel('Bemerkung').fill('E2E: Spätdienst');
    await page.getByRole('dialog').getByRole('button', { name: 'Entschuldigen' }).click();
    await expect(upcoming.getByText('E2E: Spätdienst')).toBeVisible();
    await upcoming.getByRole('button', { name: 'Zurücknehmen' }).first().click();
    await expect(upcoming.getByText('E2E: Spätdienst')).toHaveCount(0);
  }

  // Defect report: the item search finds equipment of the own department.
  const defects = page.getByRole('region', { name: 'Mängel melden' });
  await defects.getByRole('combobox', { name: 'Gerät' }).fill('scba');
  await expect(page.getByRole('option').first()).toBeVisible();
});
