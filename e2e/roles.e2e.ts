import { expect, test } from '@playwright/test';
import { login } from './support';

const ADMIN = { username: process.env['FORGA_ADMIN_USER'] ?? 'admin', password: process.env['FORGA_ADMIN_PASSWORD'] ?? 'sehr-geheim-123' };

/** Permissions apply in the assigned department or in all departments; standard roles can be reset to their template. */
test('administrator sets where the permissions of a role apply', async ({ browser }) => {
  const page = await login(browser, ADMIN.username, ADMIN.password);
  await page.goto('/admin/roles');
  await page.getByText('Abteilungskommandant', { exact: true }).click();
  await page.getByRole('button', { name: 'Vorlage übernehmen' }).click();
  await expect(page.getByText('Rechte der Standardrolle übernommen.')).toBeVisible();

  const read = page.getByRole('radiogroup', { name: 'masterdata.persons.read' });
  const write = page.getByRole('radiogroup', { name: 'masterdata.persons.write' });
  await expect(read.getByRole('radio', { name: 'in allen Abteilungen' })).toBeChecked();
  await expect(write.getByRole('radio', { name: 'im zugewiesenen Bereich' })).toBeChecked();

  // Change and save, then reset again.
  await write.getByText('in allen Abteilungen').click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Rolle gespeichert.')).toBeVisible();
  await page.reload();
  await page.getByText('Abteilungskommandant', { exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: 'masterdata.persons.write' }).getByRole('radio', { name: 'in allen Abteilungen' })).toBeChecked();
  await page.getByRole('button', { name: 'Vorlage übernehmen' }).click();
  await expect(page.getByRole('radiogroup', { name: 'masterdata.persons.write' }).getByRole('radio', { name: 'im zugewiesenen Bereich' })).toBeChecked();
});
