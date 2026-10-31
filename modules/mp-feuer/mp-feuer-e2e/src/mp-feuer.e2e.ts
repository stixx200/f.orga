import { mpCrew, mpIncident, mpPerson, transferZip } from '../../../../e2e/support/fixtures/mp-feuer';
import { api, chooseFiles, choose, download, expect, germanDate, isoDate, login, navigate, row, test, USERS } from '../../../../e2e/support';

/**
 * The commander takes over a transfer file of MP-Feuer: upload, assign the archive to a department, take over incidents
 * only from a date on, dry run, assign an unknown alarm keyword, take over, report and history. Allowed on the
 * development stage of the e2e instance (locked on the test system).
 */
test('commander takes over an MP-Feuer transfer file', async ({ browser }) => {
  const page = await login(browser, USERS.commander);
  const stamp = Date.now();
  const keyword = `E2E-Stichwort ${stamp}`;
  const [old, recent] = [isoDate(-800), isoDate(-300)];
  const dispatch = [`E2E-MP-${stamp}-ALT`, `E2E-MP-${stamp}-NEU`];
  const archive = transferZip({
    PER_STAMM: [mpPerson(`P-${stamp}-1`, '9001', 'Ada', `Übernahme${stamp}`), mpPerson(`P-${stamp}-2`, '9002', 'Ben', `Übernahme${stamp}`)],
    EIN_STAMM: [mpIncident(`E-${stamp}-1`, dispatch[0], old, keyword), mpIncident(`E-${stamp}-2`, dispatch[1], recent, keyword)],
    EIN_PERS: [mpCrew(`C-${stamp}-1`, `E-${stamp}-1`, `P-${stamp}-1`, old), mpCrew(`C-${stamp}-2`, `E-${stamp}-2`, `P-${stamp}-1`, recent), mpCrew(`C-${stamp}-3`, `E-${stamp}-2`, `P-${stamp}-2`, recent)],
  });
  const fileName = `MPTRA_42_${isoDate()}-120000_Abt._Weidenhain.zip`;

  await navigate(page, 'MP-Feuer');
  await page.getByRole('tab', { name: 'Neue Übernahme' }).click();
  await chooseFiles(page, 'MPTRA-Dateien', { name: fileName, mimeType: 'application/zip', buffer: archive });
  await page.getByRole('button', { name: 'Dateien lesen' }).click();

  // Step 1: the archive with its content; the department is suggested by the name (or remembered from earlier runs).
  await expect(page.getByText('Erkannte Archive (1)')).toBeVisible();
  const archiveRow = row(page, fileName);
  await expect(archiveRow.getByText('2 Personen · 2 Einsätze')).toBeVisible();
  await choose(page, 'Abteilung in f.orga', 'Abteilung Weidenhain');
  await expect(archiveRow.getByRole('combobox', { name: 'Abteilung in f.orga' })).toHaveValue('Abteilung Weidenhain');
  await page.getByRole('button', { name: 'Weiter zu den Datensätzen' }).click();

  // Step 2: incidents only from a date on, then the dry run.
  const incidents = row(page, /Einsatzpersonal/);
  await incidents.getByRole('textbox', { name: 'Erst ab' }).click();
  await incidents.getByRole('textbox', { name: 'Erst ab' }).fill(germanDate(-500));
  await page.keyboard.press('Enter');
  await expect(incidents.getByRole('textbox', { name: 'Erst ab' })).toHaveValue(germanDate(-500));
  await page.getByRole('button', { name: 'Probelauf', exact: true }).click();
  await expect(page.getByText(/Probelauf fertig .* Nichts wurde geändert\. 1 Bezeichnungen sind offen/)).toBeVisible({ timeout: 60_000 });

  // Step 3: the unknown alarm keyword gets an entry.
  await page.getByRole('button', { name: 'Weiter zur Zuordnung (1)' }).click();
  await expect(page.getByText(keyword, { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: `Eintrag für ${keyword}` }).click();
  await page.getByRole('option').first().click();
  await expect(page.getByText('1 von 1 zugeordnet')).toBeVisible();
  await page.getByRole('button', { name: 'Erneut prüfen' }).click();
  await expect(page.getByText('Auswahl oder Zuordnungen geändert', { exact: false })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Übernehmen …' })).toBeEnabled({ timeout: 60_000 });

  // Step 4: take over in the background; step 5: the result.
  await page.getByRole('button', { name: 'Übernehmen …' }).click();
  await page.getByRole('dialog', { name: 'Übernahme starten?' }).getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByText(/^Übernommen am .*1 neue Zuordnungen gemerkt\./)).toBeVisible({ timeout: 60_000 });
  await expect(row(page, /^Personen/).getByRole('cell').nth(1)).toHaveText('2');
  await expect(row(page, /^Einsatzpersonal/).getByRole('cell').nth(1)).not.toHaveText('0');
  const csv = await download(page, () => page.getByRole('link', { name: 'Als CSV herunterladen' }).click());
  expect(csv.name).toMatch(/\.csv$/);

  // Only the incident from the chosen date on was taken over.
  const found = await api<{ dispatchNumber: string }[]>(page, 'GET', `incidents/incidents?from=${isoDate(-900)}&to=${isoDate(-200)}`);
  expect(found.map((i) => i.dispatchNumber).filter((n) => n.startsWith(`E2E-MP-${stamp}`))).toEqual([dispatch[1]]);

  // History: the run with its counts; the report opens again.
  await page.getByRole('button', { name: 'Zum Verlauf' }).click();
  // The newest run is on top.
  const run = page.getByRole('row').nth(1);
  await expect(run.getByRole('cell').nth(3)).toHaveText(/^übernommen\d+ neu · \d+ geändert · 0 Fehler$/);
  await expect(run.getByRole('cell').nth(1)).toHaveText(/\(Kommandant\)/);
  await run.getByRole('button', { name: 'Bericht' }).click();
  await expect(page.getByText('Ergebnis je Datensatz')).toBeVisible();
});
