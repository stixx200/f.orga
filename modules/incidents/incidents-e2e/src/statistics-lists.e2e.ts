import { choose, download, expect, isoDate, login, navigate, row, test, USERS } from '../../../../e2e/support';

/** Opens a list of the list page by its name and shows the preview. */
async function preview(page: Parameters<typeof navigate>[0], name: string): Promise<void> {
  await navigate(page, 'Listen');
  await page.getByText(name, { exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

/** The treasury opens the annual statistics with values and checks and downloads the state form (Excel). */
test('annual statistics: values, checks and export', async ({ browser }) => {
  const page = await login(browser, USERS.administration);
  await navigate(page, 'Jahresstatistik');
  const year = isoDate(0).slice(0, 4);
  await expect(page.getByRole('heading', { name: `Jahresstatistik ${year}`, level: 1 })).toBeVisible();
  await expect(page.getByText(/^(vorläufig|abgeschlossen)$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plausibilitätsprüfung' })).toBeVisible();

  // Members (F13) of the volunteer brigade are counted from the persons at the reference date.
  const members = row(page, /^F13/).first();
  await expect(members).toBeVisible();
  await expect(members.getByRole('button').first()).toHaveText(/^[1-9]\d*/);

  // Last year's statistics, then the export of the state form.
  await choose(page, 'Jahr', String(Number(year) - 1));
  await expect(page.getByRole('heading', { name: `Jahresstatistik ${Number(year) - 1}`, level: 1 })).toBeVisible();
  const file = await download(page, () => page.getByRole('link', { name: 'Landesvorlage (Excel)' }).click());
  expect(file.name).toMatch(/\.xlsx$/);
  expect(file.content.subarray(0, 2).toString()).toBe('PK');
});

/** The course coordinator runs the courses of the year and the qualification matrix, previewed and exported. */
test('courses of the year and qualification matrix', async ({ browser }) => {
  const page = await login(browser, USERS.courseCoordinator);

  // The demo data have a course run about two months ago with results.
  await preview(page, 'Lehrgänge im Jahr');
  const year = isoDate(-65).slice(0, 4);
  await page.getByLabel('Jahr').fill(year);
  await page.getByRole('button', { name: 'Vorschau' }).click();
  await expect(page.getByText(/^\d+ Zeilen?$/)).toBeVisible();
  await expect(page.getByRole('cell', { name: /^(bestanden|nicht bestanden)$/ }).first()).toBeVisible();
  const excel = await download(page, () => page.getByRole('link', { name: 'Excel', exact: true }).click());
  expect(excel.name).toMatch(/\.xlsx$/);
  expect(excel.content.subarray(0, 2).toString()).toBe('PK');

  await preview(page, 'Qualifikationsübersicht');
  await choose(page, 'Abteilung', 'Abteilung Musterstadt');
  await page.getByRole('button', { name: 'Vorschau' }).click();
  await expect(page.getByRole('columnheader', { name: 'Gruppenführer' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'x', exact: true }).first()).toBeVisible();
  const pdf = await download(page, () => page.getByRole('link', { name: 'PDF', exact: true }).click());
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.content.subarray(0, 4).toString()).toBe('%PDF');
});
