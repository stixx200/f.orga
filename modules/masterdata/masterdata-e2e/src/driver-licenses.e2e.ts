import { api, download, expect, germanDate, login, navigate, panel, row, test, USERS } from '../../../../e2e/support';

/**
 * The department commander checks the driving licence of a member in the original (classes B and C, C with expiry),
 * asks for it to be presented again, finds the task and the proof list for the municipality (PDF and Excel); the
 * member sees the own licence in "My area". The request is withdrawn again.
 */
test('driving licence check, request, task, proof list and my area', async ({ browser }) => {
  const checker = await login(browser, USERS.departmentCommander);
  const member = await login(browser, USERS.member);
  const { user } = await api<{ user: { personId: string } }>(member, 'GET', 'core/session');
  const person = await api<{ firstName: string; lastName: string }>(checker, 'GET', `masterdata/persons/${user.personId}`);
  const label = `${person.lastName}, ${person.firstName}`;
  const expiry = germanDate(5 * 365);

  // The overview of the target group.
  await navigate(checker, 'Führerscheinkontrollen');
  await expect(checker.getByRole('heading', { name: 'Führerscheinkontrollen', level: 1 })).toBeVisible();
  await expect(checker.getByText(/^Alle \(\d+\)$/)).toBeVisible();
  await expect(checker.getByText(/Zielgruppe: aktive Mitglieder/)).toBeVisible();

  // Check in the original: B without, C with expiry.
  await checker.goto(`/masterdata/persons/${user.personId}/driver-license`);
  await expect(checker.getByRole('heading', { name: `${person.firstName} ${person.lastName}`, level: 1 })).toBeVisible();
  await checker.getByRole('button', { name: 'Kontrolle erfassen …' }).click();
  const dialog = checker.getByRole('dialog');
  await expect(dialog.getByText('Keine Kopie und kein Foto des Führerscheins speichern.', { exact: false })).toBeVisible();
  for (const name of ['B', 'C']) await dialog.getByRole('checkbox', { name, exact: true }).check();
  for (const name of ['BE', 'C1', 'C1E', 'CE', 'T']) await dialog.getByRole('checkbox', { name, exact: true }).uncheck();
  await dialog.getByRole('textbox', { name: 'gültig bis B', exact: true }).clear();
  const until = dialog.getByRole('textbox', { name: 'gültig bis C', exact: true });
  await until.fill(expiry);
  await until.press('Tab');
  await dialog.getByLabel('Bemerkung').fill('C neu eingetragen');
  await dialog.getByRole('button', { name: 'Kontrolle speichern' }).click();
  await expect(checker.getByText('Kontrolle gespeichert.')).toBeVisible();
  const license = panel(checker, 'Führerschein');
  await expect(row(license, /^C/).filter({ hasText: expiry })).toContainText('gültig');
  await expect(row(license, /^B/).filter({ hasText: 'unbefristet' })).toBeVisible();
  await expect(license).toContainText(`${germanDate(0)} · Original vorgelegt`);

  // Asked to present it again (e.g. a hint at a driving ban): a task for the checkers.
  await checker.getByRole('button', { name: 'Erneute Vorlage anfordern …' }).click();
  const request = checker.getByRole('dialog');
  await request.getByLabel(/^Grund/).fill('Hinweis auf Fahrverbot (E2E)');
  const dueOn = request.getByLabel(/^Vorlage bis/);
  await dueOn.fill(germanDate(9));
  await dueOn.press('Tab');
  await request.getByRole('button', { name: 'Anfordern' }).click();
  await expect(checker.getByText('Erneute Vorlage angefordert.')).toBeVisible();
  await expect(panel(checker, 'Erneute Vorlage')).toContainText(germanDate(9));
  await expect(checker.getByText('Vorlage angefordert').first()).toBeVisible();

  await checker.goto('/');
  await expect(checker.getByText('Führerschein erneut vorlegen').first()).toBeVisible();
  await expect(checker.getByRole('link', { name: new RegExp(label) }).first()).toBeVisible();

  // The list of the target group shows the request.
  await navigate(checker, 'Führerscheinkontrollen');
  await checker.getByText(/^Vorlage angefordert \(\d+\)$/).click();
  await expect(row(checker, label)).toContainText(`Vorlage angefordert bis ${germanDate(9)}`);

  // Proof for the municipality: preview, PDF and Excel.
  await checker.getByRole('link', { name: 'Nachweis für die Gemeinde (PDF)' }).click();
  await checker.getByRole('link', { name: 'Führerscheinkontrollen: Nachweis für die Gemeinde' }).or(checker.getByText('Führerscheinkontrollen: Nachweis für die Gemeinde', { exact: true })).first().click();
  await checker.getByRole('button', { name: 'Vorschau' }).click();
  // Today's check of the member (earlier runs of the test on the same day add more).
  const proof = row(checker, label).filter({ hasText: germanDate(0) }).filter({ hasText: `C bis ${expiry}` }).first();
  await expect(proof).toContainText('Original vorgelegt');
  const pdf = await download(checker, () => checker.getByRole('link', { name: 'PDF', exact: true }).click());
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.content.subarray(0, 4).toString()).toBe('%PDF');
  const excel = await download(checker, () => checker.getByRole('link', { name: 'Excel', exact: true }).click());
  expect(excel.name).toMatch(/\.xlsx$/);
  expect(excel.content.subarray(0, 2).toString()).toBe('PK');

  // The member sees the own licence and the request in "My area".
  await member.getByRole('link', { name: 'Mein Bereich' }).click();
  const mine = panel(member, 'Mein Führerschein');
  await expect(mine).toContainText('B, C');
  await expect(mine).toContainText(expiry);
  await expect(mine).toContainText('Vorlage angefordert');

  // The request is withdrawn again.
  await checker.goto(`/masterdata/persons/${user.personId}/driver-license`);
  await checker.getByRole('button', { name: 'Zurücknehmen …' }).click();
  await checker.getByRole('dialog').getByRole('textbox').fill('Hinweis hat sich nicht bestätigt');
  await checker.getByRole('dialog').getByRole('button', { name: 'Zurücknehmen' }).click();
  await expect(panel(checker, 'Erneute Vorlage')).toContainText('Keine offene Anforderung.');
});
