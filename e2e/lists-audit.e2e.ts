import { ADMIN, api, choose, download, expect, login, navigate, test, USERS } from './support';

/**
 * The commander prints the phone list of the leaders of Abteilung Musterstadt with its purpose (preview, PDF and
 * Excel); the administrator finds both exports in the audit log by action and user, in readable text.
 */
test('commander exports a list with purpose, the audit log shows it readably', async ({ browser }) => {
  const page = await login(browser, USERS.commander);
  await navigate(page, 'Listen');
  await page.getByText('Telefonliste', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Telefonliste' })).toBeVisible();
  await choose(page, 'Zweck', 'Führungskräfte (Alarmierung, Erreichbarkeit)');
  await choose(page, 'Abteilung', 'Abteilung Musterstadt');
  await page.getByRole('button', { name: 'Vorschau' }).click();
  await expect(page.getByText('Zweck: Führungskräfte (Alarmierung, Erreichbarkeit)')).toBeVisible();
  await expect(page.getByText(/^\d+ Zeilen$/)).toBeVisible();
  await expect(page.getByText('Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten')).toBeVisible();

  const pdf = await download(page, () => page.getByRole('link', { name: 'PDF' }).click());
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.content.subarray(0, 5).toString()).toBe('%PDF-');
  const excel = await download(page, () => page.getByRole('link', { name: 'Excel' }).click());
  expect(excel.name).toMatch(/\.xlsx$/);
  // An XLSX file is a ZIP archive.
  expect(excel.content.subarray(0, 2).toString()).toBe('PK');
  const { user } = await api<{ user: { displayName: string } }>(page, 'GET', 'core/session');

  const admin = await login(browser, ADMIN.username);
  await navigate(admin, 'Audit-Log');
  await choose(admin, 'Aktion', 'Liste exportiert');
  await choose(admin, 'Benutzer', user.displayName);
  const rows = admin.getByRole('row').filter({ hasText: 'Liste exportiert' });
  await expect(rows.filter({ hasText: 'Format: xlsx' }).first()).toBeVisible();
  const entry = rows.filter({ hasText: 'Format: pdf' }).first();
  await expect(entry).toContainText(user.displayName);
  await expect(entry).toContainText(/Zeilen: \d+/);
  await expect(entry).toContainText(/Personen: \d+ Person/);
  // Every row of the filtered log is an export of this user.
  await expect(admin.getByRole('row').filter({ hasNotText: 'Liste exportiert' })).toHaveCount(1);

  // The free-text search narrows further; an unknown word finds nothing.
  await admin.getByRole('searchbox', { name: 'Suche' }).fill(`kein-treffer-${Date.now()}`);
  await expect(rows).toHaveCount(0);
});

/** The equipment officer looks a code up on „Code suchen“; the global search finds a person and opens the file. */
test('code lookup and global search', async ({ browser }) => {
  const page = await login(browser, USERS.equipmentOfficer);
  const items = await api<{ id: string; name: string; inventoryNumber: string; barcode: string | null }[]>(page, 'GET', 'equipment/items');
  const item = items.find((i) => i.barcode)!;

  await page.goto('/scan');
  await expect(page.getByRole('heading', { name: 'Code suchen', level: 1 })).toBeVisible();
  const code = page.getByRole('textbox', { name: 'Barcode, RFID oder Inventarnummer' });
  const unknown = `E2E-UNBEKANNT-${Date.now()}`;
  await code.fill(unknown);
  await code.press('Enter');
  await expect(page.getByText(`Zum Code „${unknown}“ wurde nichts gefunden.`, { exact: false })).toBeVisible();

  // A single hit opens the item.
  await code.fill(item.barcode!);
  await code.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/equipment/items/${item.id}`));
  await expect(page.getByText(item.inventoryNumber).first()).toBeVisible();

  // Global search in the header: a person by name.
  const commander = await login(browser, USERS.commander);
  const persons = await api<{ id: string; firstName: string; lastName: string }[]>(commander, 'GET', 'masterdata/persons');
  const person = persons.find((p) => persons.filter((o) => o.lastName === p.lastName && o.firstName === p.firstName).length === 1)!;
  await commander.getByRole('textbox', { name: 'Personen, Fahrzeuge, Einsätze suchen' }).fill(`${person.firstName} ${person.lastName}`);
  await commander.getByRole('option', { name: new RegExp(`${person.lastName}, ${person.firstName}|${person.firstName} ${person.lastName}`) }).first().click();
  await expect(commander).toHaveURL(new RegExp(`/masterdata/persons/${person.id}`));
});
