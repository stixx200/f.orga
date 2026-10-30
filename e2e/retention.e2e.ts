import { ADMIN, api, expect, germanDate, login, restore, row, test, USERS } from './support';

/**
 * The commander marks an old incident „30 Jahre aufbewahren (Sonderfall)“; the administrator sets the period of the
 * incidents with special features with „Sonderfall prüfen“, applies the rules, finds the incident in Verwaltung →
 * Aussonderung with this reason and has it anonymised. The demo data has no incidents older than 30 years, so the rule
 * touches only the incident of the test; the rules are restored afterwards.
 */
test('administrator anonymises an old incident kept as special case', async ({ browser }) => {
  const commander = await login(browser, USERS.commander);
  const dispatchNumber = `E2E-RET-${Date.now()}`;
  const departments = await api<{ id: string; name: string }[]>(commander, 'GET', 'masterdata/departments');
  const alarmedAt = new Date(Date.now() - 32 * 365 * 86_400_000).toISOString();
  const incident = await api<{ id: string }>(commander, 'POST', 'incidents/incidents', {
    dispatchNumber,
    alarmKeyword: 'B2',
    alarmMessage: 'Brand Scheune, E2E',
    alarmedAt,
    location: { street: 'Feldweg', houseNumber: '3', city: 'Musterstadt', district: '' },
    departmentIds: [departments.find((d) => d.name === 'Abteilung Musterstadt')!.id],
  });

  // The special case at the incident.
  await commander.goto(`/incidents/incidents/${incident.id}`);
  await commander.getByRole('checkbox', { name: '30 Jahre aufbewahren (Sonderfall)' }).click();
  await expect(commander.getByText('Aufbewahrung gespeichert.')).toBeVisible();
  await expect(commander.getByRole('checkbox', { name: '30 Jahre aufbewahren (Sonderfall)' })).toBeChecked();

  const page = await login(browser, ADMIN.username);
  const stored = await api<{ retention?: Record<string, unknown> } | null>(page, 'GET', 'core/settings/retention');
  try {
    // Rule: incidents with special features 30 years, anonymise, special case to be checked.
    await page.goto('/admin/settings?tab=retention');
    const special = row(page, 'Einsätze mit Besonderheiten');
    await special.getByRole('textbox', { name: 'Jahre' }).fill('30');
    await special.getByRole('combobox', { name: /^Nach Ablauf/ }).click();
    await page.getByRole('option', { name: 'anonymisieren', exact: true }).click();
    await special.getByRole('checkbox', { name: 'prüfen' }).check();
    // Affected now: the incident of this test (and those of earlier runs against the same instance).
    await expect(special.getByRole('cell').last()).toHaveText(/^[1-9]\d*$/);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText(/gespeichert/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Jetzt anwenden' }).click();
    await page.getByRole('dialog', { name: 'Aufbewahrungsfristen jetzt anwenden?' }).getByRole('button', { name: 'Jetzt anwenden' }).click();
    await expect(page.getByText(/Datensätze bearbeitet, \d+ neue Fälle in der Liste „Aussonderung“\./)).toBeVisible();

    // The case waits for the confirmation in the list „Aussonderung“.
    await page.getByRole('link', { name: 'Zur Aussonderung' }).click();
    await expect(page.getByRole('heading', { name: 'Aussonderung', level: 1 })).toBeVisible();
    const due = row(page, dispatchNumber);
    await expect(due).toContainText('Einsätze mit Besonderheiten');
    await expect(due).toContainText('30 Jahre aufbewahren (Sonderfall)');
    await expect(due).toContainText('fällig · Sonderfall prüfen');
    await due.getByRole('checkbox', { name: dispatchNumber }).check();
    await page.getByRole('button', { name: 'Ausführen …' }).click();
    const confirm = page.getByRole('dialog', { name: 'Ausführen?' });
    await expect(confirm).toContainText('1 Datensätze werden anonymisiert und 0 gelöscht');
    await confirm.getByRole('button', { name: '1 Datensatz bearbeiten' }).click();
    await expect(page.getByText('1 Datensatz bearbeitet.')).toBeVisible();

    await page.getByText('Erledigt', { exact: true }).click();
    await expect(row(page, dispatchNumber)).toContainText(`anonymisiert ${germanDate()}`);

    // The incident keeps its number and says it was anonymised.
    await commander.reload();
    await expect(commander.getByText(/^Nach Ablauf der Aufbewahrungsfrist am .* anonymisiert/)).toBeVisible();
  } finally {
    if (!page.isClosed()) await restore('the retention periods', () => api(page, 'PUT', 'core/settings/retention', { retention: stored?.retention ?? {} }));
  }
});
