import { api, choose, expect, germanDate, login, row, test, USERS } from './support';

/**
 * The clothing officer sets up an article, records a piece, issues it to a member, takes it back to the laundry,
 * records the washing, inspects it (failed, then passed) and retires it; the member sees the piece in "My area".
 * Consumables: a receipt raises the counter on the stock page.
 */
test('clothing store: article, piece, issue, laundry, inspection, my area', async ({ browser }) => {
  // A long journey with several users: more time than the default.
  test.slow();
  const stamp = Date.now();
  const articleName = `E2E Warnjacke ${stamp}`;
  const number = `E2E-${stamp}`;
  const officer = await login(browser, USERS.clothingOfficer);
  const member = await login(browser, USERS.member);
  const { user } = await api<{ user: { personId: string } }>(member, 'GET', 'core/session');
  const person = await api<{ firstName: string; lastName: string }>(officer, 'GET', `masterdata/persons/${user.personId}`);

  // A new inventoried textile article with sizes and a yearly inspection.
  await officer.goto('/clothing/articles');
  await expect(officer.getByRole('heading', { name: 'Artikel der Kleiderkammer', level: 1 })).toBeVisible();
  await expect(officer.getByRole('cell', { name: 'Einsatzjacke', exact: true })).toBeVisible();
  await officer.getByRole('button', { name: '+ Artikel' }).click();
  let dialog = officer.getByRole('dialog');
  await dialog.getByLabel(/^Name \(deutsch\)/).fill(articleName);
  await dialog.getByLabel(/^Schlüssel/).fill(`e2e-jacket-${stamp}`);
  const sizes = dialog.getByLabel('Größen');
  for (const size of ['M', 'L']) {
    await sizes.fill(size);
    await sizes.press('Enter');
  }
  await dialog.getByRole('checkbox', { name: /Textil mit Wäsche-Nachweis/ }).check();
  await dialog.getByLabel('Prüfung alle … Monate').fill('12');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByText('Artikel gespeichert.')).toBeVisible();
  await expect(row(officer, articleName)).toContainText('M, L');

  // Record a piece of it in the store of Abteilung Musterstadt.
  await officer.goto('/clothing/items');
  await officer.getByRole('button', { name: '+ Stück erfassen' }).click();
  dialog = officer.getByRole('dialog');
  await choose(officer, 'Artikel', articleName, dialog);
  await dialog.getByLabel(/^Inventar-Nr\./).fill(number);
  await choose(officer, 'Größe', 'L', dialog);
  await choose(officer, 'Kleiderkammer der Abteilung', 'Abteilung Musterstadt', dialog);
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByRole('heading', { name: `${number} · ${articleName}`, level: 1 })).toBeVisible();
  const itemUrl = officer.url();
  await expect(officer.getByText('im Lager').first()).toBeVisible();

  // Issue desk: the piece goes to the member in one step.
  await officer.goto(`/clothing/issue?person=${user.personId}`);
  await expect(officer.getByRole('heading', { name: 'Ausgabe', level: 1 })).toBeVisible();
  await officer.getByRole('textbox', { name: 'Suche' }).fill(number);
  await officer.getByRole('checkbox', { name: number }).check();
  await officer.getByRole('button', { name: '1 Stück ausgeben' }).click();
  await expect(officer.getByText('1 Stück ausgegeben.')).toBeVisible();
  await expect(row(officer, number).first()).toContainText(articleName);

  // The member sees the piece in "My area".
  await member.getByRole('link', { name: 'Mein Bereich' }).click();
  await expect(member.getByRole('heading', { name: 'Mein Bereich', level: 1 })).toBeVisible();
  // Held pieces and the history of issues and returns.
  await expect(member.getByRole('cell', { name: number, exact: true })).toHaveCount(2);
  await expect(row(member, number).filter({ hasText: 'ausgegeben' })).toBeVisible();

  // Taken back to the laundry after a fire: blocked until a washing is recorded.
  await officer.goto(itemUrl);
  await expect(officer.getByText(`${person.firstName} ${person.lastName}`).or(officer.getByText(`${person.lastName}, ${person.firstName}`)).first()).toBeVisible();
  await officer.getByRole('button', { name: 'Zurücknehmen' }).click();
  dialog = officer.getByRole('dialog');
  await dialog.getByText('zur Wäsche', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByText(/Zur Wäsche zurückgenommen\. Das Stück wird erst nach einer erfassten Wäsche/)).toBeVisible();
  await expect(officer.getByRole('button', { name: 'Ausgeben' })).toHaveCount(0);

  // The laundry page records the washing of the piece; the block is gone.
  await officer.goto('/clothing/care');
  await expect(officer.getByRole('heading', { name: 'Wäsche', level: 1 })).toBeVisible();
  await officer.getByRole('textbox', { name: 'Suche' }).fill(number);
  await officer.getByRole('checkbox', { name: number }).check();
  await officer.getByLabel('Wo').fill('Feuerwehrhaus');
  await officer.getByRole('button', { name: 'Erfassen', exact: true }).click();
  await expect(officer.getByText('Wäsche für 1 Stück erfasst.')).toBeVisible();
  await officer.goto(itemUrl);
  await expect(officer.getByRole('button', { name: 'Ausgeben' })).toBeVisible();
  await expect(officer.getByRole('cell', { name: 'Feuerwehrhaus' })).toBeVisible();

  // Inspection of several pieces: this one fails and is blocked for repair.
  await officer.goto('/clothing/inspections');
  await expect(officer.getByRole('heading', { name: 'Prüfung', level: 1 })).toBeVisible();
  await officer.getByRole('textbox', { name: 'Suche' }).fill(number);
  await officer.getByRole('checkbox', { name: number }).check();
  await row(officer, number).getByText('nicht bestanden').click();
  await row(officer, number).getByRole('textbox', { name: 'Bemerkungen' }).fill('Reflexstreifen lose');
  await officer.getByRole('button', { name: 'Prüfungen erfassen' }).click();
  await expect(officer.getByText('Prüfung für 1 Stück erfasst.')).toBeVisible();
  await officer.goto(itemUrl);
  await expect(officer.getByText(/Die letzte Prüfung ist nicht bestanden/)).toBeVisible();
  await expect(officer.getByRole('cell', { name: 'Reflexstreifen lose' })).toBeVisible();

  // After the repair it passes and can be issued again.
  await officer.getByRole('button', { name: 'Prüfung erfassen' }).click();
  dialog = officer.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: 'bestanden' }).check();
  await dialog.getByLabel('Prüfer').fill('Kleiderwart');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByText(/Die letzte Prüfung ist nicht bestanden/)).toHaveCount(0);
  await expect(officer.getByRole('button', { name: 'Ausgeben' })).toBeVisible();
  await expect(officer.getByText(`${germanDate(0)} · bestanden`)).toBeVisible();

  // Out of use: retired pieces stay with their history.
  await officer.getByRole('button', { name: 'Aussondern' }).click();
  await officer.getByRole('dialog').getByRole('button', { name: 'Aussondern' }).click();
  await expect(officer.getByText('ausgesondert').first()).toBeVisible();

  // The article is no longer issued.
  await officer.goto('/clothing/articles');
  await row(officer, articleName).click();
  await officer.getByRole('dialog').getByRole('switch', { name: /aktiv/ }).uncheck();
  await officer.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByText('Artikel gespeichert.')).toBeVisible();
});

/** Consumables are counted for the whole brigade: a receipt raises the counter. */
test('clothing store: receipt of consumables on the stock page', async ({ browser }) => {
  const officer = await login(browser, USERS.clothingOfficer);
  await officer.goto('/clothing/stock');
  await expect(officer.getByRole('heading', { name: 'Bestand nach Größe', level: 1 })).toBeVisible();
  await expect(officer.getByRole('cell', { name: 'Einsatzjacke' }).first()).toBeVisible();
  const caps = row(officer, /^Mütze/).first();
  await expect(caps).toBeVisible();
  const size = (await caps.getByRole('cell').nth(2).textContent())!.trim();
  const before = Number((await caps.getByRole('cell').nth(3).textContent())!.trim());

  await officer.getByRole('button', { name: 'Zugang erfassen' }).click();
  const dialog = officer.getByRole('dialog');
  await choose(officer, 'Artikel', 'Mütze', dialog);
  if (size) {
    const field = dialog.getByRole('textbox', { name: /^Größe/ });
    if (await dialog.getByRole('combobox', { name: /^Größe/ }).count()) await choose(officer, 'Größe', size, dialog);
    else await field.fill(size);
  }
  await dialog.getByLabel(/^Anzahl/).fill('5');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(officer.getByText('Zugang erfasst.')).toBeVisible();
  await expect(row(officer, /^Mütze/).filter({ hasText: size }).first().getByRole('cell').nth(3)).toHaveText(String(before + 5));
});
