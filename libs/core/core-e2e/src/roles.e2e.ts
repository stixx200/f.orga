import { ADMIN, expect, login, test } from '../../../../e2e/support';

/** Permissions apply in the assigned department or in all departments; standard roles can be reset to their template. */
test('administrator sets where the permissions of a role apply', async ({ browser }) => {
  const page = await login(browser, ADMIN.username);
  await page.goto('/admin/roles');
  await page.getByText('Abteilungskommandant', { exact: true }).click();
  await page.getByRole('button', { name: 'Vorlage übernehmen' }).click();
  await expect(page.getByText('Rechte der Standardrolle übernommen.')).toBeVisible();

  // The template: the directory of all departments, the personnel files of the own department.
  const directory = page.getByRole('radiogroup', { name: 'masterdata.persons.directory' });
  const write = page.getByRole('radiogroup', { name: 'masterdata.persons.write' });
  await expect(directory.getByRole('radio', { name: 'in allen Abteilungen' })).toBeChecked();
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
