import { expect, test } from '@playwright/test';
import { choose, chooseFirst, login } from './support';

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
  await expect(officer.getByRole('heading', { name: 'Prüfungen', level: 1 })).toBeVisible();
  // Bulk inspection: choose an inspection type and select an item by its label (typed here, the camera scans in the field).
  await chooseFirst(officer, 'Prüfart');
  const first = (await officer.getByRole('row').nth(1).getByText(/ · /).first().textContent())!;
  await officer.getByRole('button', { name: 'Per Scan auswählen' }).click();
  await officer.getByRole('dialog').getByLabel('Code oder Inventarnummer').fill(first.split(' · ')[0]);
  await officer.getByRole('dialog').getByRole('button', { name: 'Übernehmen' }).click();
  await expect(officer.getByRole('dialog').getByText(/ausgewählt \(1 insgesamt\)/)).toBeVisible();
  await officer.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
  await expect(officer.getByText('1 Gerät ausgewählt')).toBeVisible();
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
