import { api, choose, chooseFiles, expect, login, navigate, test, USERS } from './support';

/**
 * The equipment officer inspects a breathing apparatus, a group leader reports a defect via the item page
 * (QR code), and the officer handles the defect.
 */
test('inspection, defect report and handling', async ({ browser }) => {
  const officer = await login(browser, 'equipment-officer');
  await officer.goto('/equipment/items');
  await expect(officer.getByRole('heading', { name: 'Geräte', level: 1 })).toBeVisible();
  await officer.getByRole('main').getByLabel('Suche').fill('scba-1');
  // An item of Abteilung Musterstadt, where the group leader of the demo data belongs.
  await choose(officer, 'Abteilung', 'Abteilung Musterstadt');
  const row = officer.getByRole('row').filter({ hasText: 'Pressluftatmer 1' }).first();
  await row.click();
  await expect(officer.getByRole('heading', { name: 'Pressluftatmer 1', level: 1 })).toBeVisible();
  const itemUrl = officer.url();

  // Record an inspection with checklist.
  await officer.getByRole('tab', { name: 'Prüfungen' }).click();
  await officer.getByRole('row').filter({ hasText: 'Sicht- und Funktionsprüfung' }).getByRole('button', { name: 'Prüfen' }).click();
  const dialog = officer.getByRole('dialog');
  await expect(dialog.getByText('Warnsignal')).toBeVisible();
  await chooseFiles(officer, 'Prüfprotokoll', { name: 'Pruefstand.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%E2E\n') });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByText('Prüfung gespeichert')).toBeVisible();
  await expect(officer.getByRole('cell', { name: 'Bestanden' }).first()).toBeVisible();

  // Attach the protocol of the test bench to the inspection.
  await officer.getByRole('row').filter({ hasText: 'Bestanden' }).first().getByRole('button', { name: 'Anhänge' }).click();
  const files = officer.getByRole('dialog');
  await files.locator('input[type=file]').setInputFiles({ name: 'Pruefstand.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%E2E\n') });
  await expect(files.getByRole('link', { name: 'Pruefstand.pdf' })).toBeVisible();
  await files.getByRole('button', { name: 'Schließen' }).click();

  // A group leader scans the QR code and reports a defect.
  const leader = await login(browser, 'group-leader');
  await leader.goto(itemUrl);
  await leader.getByRole('button', { name: 'Mangel melden' }).click();
  const description = `Lungenautomat bläst ab ${Date.now()}`;
  await leader.getByRole('dialog').getByLabel('Beschreibung').fill(description);
  await leader.getByRole('dialog').getByRole('button', { name: 'Melden' }).click();
  await expect(leader.getByText('Mangel gemeldet')).toBeVisible();

  // The officer handles it.
  await officer.goto('/equipment/defects');
  const defect = officer.getByRole('row').filter({ hasText: description });
  await defect.getByRole('button', { name: 'Bearbeiten' }).click();
  await officer.getByRole('dialog').getByLabel('Status').click();
  await officer.getByRole('option', { name: 'Behoben' }).click();
  await officer.getByRole('dialog').getByLabel('Erledigung').fill('Lungenautomat getauscht');
  await officer.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByText('Mangel aktualisiert')).toBeVisible();
  await expect(officer.getByRole('row').filter({ hasText: description })).toHaveCount(0);

  // Due inspections and QR labels.
  await officer.goto('/equipment/inspections');
  await expect(officer.getByRole('heading', { name: 'Fällige Prüfungen', level: 1 })).toBeVisible();
  // Bulk inspection: choose the kind of equipment and select an item by its label (typed here, the camera scans in the field).
  await officer.goto('/equipment/bulk');
  await expect(officer.getByRole('heading', { name: 'Sammelprüfungen', level: 1 })).toBeVisible();
  await choose(officer, 'Geräteart', /^Atemschutz$/);
  const first = (await officer.getByRole('row').nth(1).getByText(/ · /).first().textContent())!;
  const scanField = officer.getByRole('textbox', { name: 'Scannen' });
  await scanField.fill(first.split(' · ')[0]);
  await scanField.press('Enter');
  await expect(officer.getByText('1 Gerät ausgewählt')).toHaveCount(2);
  await officer.goto('/equipment/labels');
  await expect(officer.getByRole('button', { name: 'Drucken' })).toBeVisible();

  // Categories form a tree: a new subcategory appears indented below its parent.
  const key = `e2e-sub-${Date.now()}`;
  await officer.goto('/equipment/settings');
  await officer.getByRole('tab', { name: 'Kategorien' }).click();
  await officer.getByRole('button', { name: '+ Unterkategorie' }).first().click();
  const categoryDialog = officer.getByRole('dialog');
  await categoryDialog.getByLabel(/^Schlüssel/).fill(key);
  await categoryDialog.getByLabel(/^Bezeichnung \(deutsch\)/).fill('E2E Unterkategorie');
  await categoryDialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByRole('row').filter({ hasText: key })).toContainText('└ E2E Unterkategorie');
});

/**
 * The due-inspections page is a list only; bulk inspections scan from the field above the table, filter by location
 * and attach a protocol. Scanning on the item list opens the item.
 */
test('due inspections, bulk inspection with scan and protocol, scan on the item list', async ({ browser }) => {
  const officer = await login(browser, USERS.equipmentOfficer);
  const stamp = Date.now();
  const departments = await api<{ id: string; name: string }[]>(officer, 'GET', 'masterdata/departments');
  const departmentId = departments.find((d) => d.name === 'Abteilung Musterstadt')!.id;
  const number = `E2E-S-${stamp}`;
  await api(officer, 'POST', 'equipment/items', {
    inventoryNumber: number,
    name: 'E2E-Druckschlauch',
    typeKey: 'pressure-hose-b',
    categoryKey: 'hoses',
    departmentId,
    barcode: number,
  });

  await navigate(officer, 'Fällige Prüfungen');
  await expect(officer.getByRole('heading', { name: 'Fällige Prüfungen', level: 1 })).toBeVisible();
  await expect(officer.getByRole('main').getByRole('link', { name: 'Sammelprüfungen' })).toBeVisible();

  await officer.goto('/equipment/items');
  await officer.getByRole('button', { name: 'Scannen' }).click();
  const scan = officer.getByRole('dialog');
  await scan.getByLabel('Code oder Inventarnummer').fill(number);
  await scan.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(officer.getByRole('heading', { name: 'E2E-Druckschlauch', level: 1 })).toBeVisible();

  await navigate(officer, 'Sammelprüfungen');
  await expect(officer.getByRole('heading', { name: 'Sammelprüfungen', level: 1 })).toBeVisible();
  await choose(officer, 'Geräteart', /^Schläuche/);
  await expect(officer.getByRole('row').filter({ hasText: number })).toBeVisible();
  await choose(officer, 'Standort', 'Ohne Standort');
  await expect(officer.getByRole('row').filter({ hasText: number })).toBeVisible();
  const scanField = officer.getByRole('textbox', { name: 'Scannen' });
  await scanField.fill(number);
  await scanField.press('Enter');
  await expect(officer.getByText('1 Gerät ausgewählt')).toHaveCount(2);
  await choose(officer, 'Prüfart', /Druckprüfung nach Wäsche/);
  await chooseFiles(officer, 'Prüfprotokoll', { name: 'Sammelprotokoll.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%E2E-bulk\n') });
  await officer.getByRole('button', { name: 'Prüfungen buchen' }).click();
  await expect(officer.getByText('Prüfungen gespeichert')).toBeVisible();
  await officer.goto(`/equipment/items`);
  await officer.getByRole('main').getByLabel('Suche').fill(number);
  await officer.getByRole('row').filter({ hasText: number }).click();
  await officer.getByRole('tab', { name: 'Prüfungen' }).click();
  await officer.getByRole('row').filter({ hasText: 'Druckprüfung nach Wäsche' }).first().getByRole('button', { name: 'Anhänge' }).click();
  await expect(officer.getByRole('dialog').getByRole('link', { name: 'Sammelprotokoll.pdf' })).toBeVisible();
});
