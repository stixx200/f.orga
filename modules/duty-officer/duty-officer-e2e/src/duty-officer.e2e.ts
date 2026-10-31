import type { Page } from '@playwright/test';
import { api, choose, expect, germanDate, isoDate, login, panel, restore, row, test, USERS } from '../../../../e2e/support';

type Kind = { key: string; name: string; unit: string };

/** Adds a duty kind with a rate of 10 € per day in the settings form (saved by the caller). */
async function addKind(page: Page, kind: Kind): Promise<void> {
  await page.getByRole('button', { name: '+ EvD-Dienst' }).click();
  const added = page.getByRole('row').last();
  await added.getByRole('textbox', { name: 'Schlüssel' }).fill(kind.key);
  await added.getByRole('textbox', { name: 'Bezeichnung (deutsch)' }).fill(kind.name);
  await choose(added, 'Gezählt werden', kind.unit);
  await added.getByRole('textbox', { name: 'Satz je Tag' }).fill('10');
}

/** Adds a duty in the roster: person, kind, from and to (`YYYY-MM-DDTHH:mm`). */
async function addDuty(page: Page, person: string, kind: string, from: string, to: string): Promise<void> {
  await page.getByRole('button', { name: '+ Dienst eintragen' }).click();
  const dialog = page.getByRole('dialog');
  await choose(dialog, 'Person', person);
  await choose(dialog, 'Art', kind);
  await dialog.getByLabel(/^von/).fill(from);
  await dialog.getByLabel(/^bis/).fill(to);
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Dienst gespeichert.').first()).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

/** Local time of a calendar file, `YYYYMMDDTHHmm00`. */
const icsTime = (date: string, time: string) => `${date.replaceAll('-', '')}T${time}00`;

/** Shows the roster of the year of the date (the roster lists one year). */
async function rosterYear(page: Page, days: number): Promise<void> {
  await choose(page, 'Jahr', isoDate(days).slice(0, 4));
}

/**
 * The commander sets up three duty kinds with the three counting modes, enters a duty of each kind and sees the days
 * and amounts; the treasury finds the compensation items; all is removed again.
 */
test('duty kinds with counting modes, roster and compensation of the duties', async ({ browser }) => {
  // A long journey with several users: more time than the default.
  test.slow();
  const stamp = Date.now();
  const kinds = {
    full: { key: `e2e-full-${stamp}`, name: `E2E volle Tage ${stamp}`, unit: 'volle Tage (24 Stunden)' },
    started: { key: `e2e-started-${stamp}`, name: `E2E angefangene Tage ${stamp}`, unit: 'angefangene Tage' },
    midnight: { key: `e2e-midnight-${stamp}`, name: `E2E Mitternacht ${stamp}`, unit: 'Tage mit Dienst um 00:00 Uhr' },
  };
  const commander = await login(browser, USERS.commander);
  const officer = await login(browser, USERS.dutyOfficer);
  const { user } = await api<{ user: { personId: string } }>(officer, 'GET', 'core/session');
  const person = await api<{ firstName: string; lastName: string }>(commander, 'GET', `masterdata/persons/${user.personId}`);
  const name = `${person.firstName} ${person.lastName}`;

  await commander.goto('/duty-officer/settings');
  await expect(commander.getByRole('heading', { name: 'Einsatzleiter vom Dienst', level: 1 })).toBeVisible();
  await expect(commander.getByRole('switch', { name: 'EvD-Bericht für jeden Einsatz anlegen' })).toBeChecked();
  for (const kind of Object.values(kinds)) await addKind(commander, kind);
  await commander.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(commander.getByText('Einstellungen gespeichert.').first()).toBeVisible();

  // 26 hours: one full day, two started days; four hours over midnight: one day at 00:00.
  await commander.goto('/duty-officer/roster');
  await expect(commander.getByRole('heading', { name: 'EvD-Dienst', level: 1 })).toBeVisible();
  await addDuty(commander, name, kinds.full.name, `${isoDate(60)}T18:00`, `${isoDate(61)}T20:00`);
  await addDuty(commander, name, kinds.started.name, `${isoDate(62)}T18:00`, `${isoDate(63)}T20:00`);
  await addDuty(commander, name, kinds.midnight.name, `${isoDate(66)}T22:00`, `${isoDate(67)}T02:00`);
  for (const [kind, days, from, amount] of [
    [kinds.full, 1, 60, '10,00 €'],
    [kinds.started, 2, 62, '20,00 €'],
    [kinds.midnight, 1, 66, '10,00 €'],
  ] as const) {
    await rosterYear(commander, from);
    const duty = row(commander, kind.name);
    await expect(duty).toContainText(germanDate(from));
    await expect(duty.getByRole('cell').nth(4)).toHaveText(String(days));
    await expect(duty).toContainText(amount);
    await expect(duty).toContainText('Eintrag');
  }

  // The treasury gets one item per duty, named after the kind with the days.
  const treasury = await login(browser, USERS.administration);
  await treasury.goto('/compensation/items');
  await expect(row(treasury, `${kinds.full.name} (1 Tag)`)).toContainText('10,00');
  await expect(row(treasury, `${kinds.started.name} (2 Tage)`)).toContainText('20,00');
  await expect(row(treasury, `${kinds.midnight.name} (1 Tag)`)).toContainText('10,00');

  // Deleting the duties removes the items; then the kinds are removed again.
  for (const [kind, from] of [[kinds.full, 60], [kinds.started, 62], [kinds.midnight, 66]] as const) {
    await rosterYear(commander, from);
    await row(commander, kind.name).getByRole('button', { name: 'Löschen' }).click();
    await commander.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
    await expect(row(commander, kind.name)).toHaveCount(0);
  }
  await treasury.reload();
  await expect(treasury.getByRole('heading', { name: 'Posten', level: 1 })).toBeVisible();
  await expect(row(treasury, kinds.started.name)).toHaveCount(0);

  await commander.goto('/duty-officer/settings');
  for (const kind of Object.values(kinds)) {
    await commander.getByRole('row').filter({ has: commander.locator(`input[value="${kind.key}"]`) }).getByRole('button', { name: 'Löschen' }).click();
  }
  await commander.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(commander.getByText('Einstellungen gespeichert.').first()).toBeVisible();
});

/** The commander imports a duty from a calendar file (.ics); it shows up with source "Kalender". */
test('duty roster from a calendar file', async ({ browser }) => {
  const commander = await login(browser, USERS.commander);
  const officer = await login(browser, USERS.dutyOfficer);
  const { user } = await api<{ user: { personId: string } }>(officer, 'GET', 'core/session');
  const person = await api<{ firstName: string; lastName: string }>(commander, 'GET', `masterdata/persons/${user.personId}`);
  const uid = `e2e-evd-${Date.now()}`;
  // A minute of its own tells this duty from those of earlier runs.
  const minute = String(Date.now() % 60).padStart(2, '0');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//f.orga//e2e//DE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART;TZID=Europe/Berlin:${icsTime(isoDate(80), `18${minute}`)}`,
    `DTEND;TZID=Europe/Berlin:${icsTime(isoDate(81), `18${minute}`)}`,
    `SUMMARY:EvD ${person.firstName} ${person.lastName}`,
    'DESCRIPTION:E2E-Kalender',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  await commander.goto('/duty-officer/roster');
  await commander.getByRole('link', { name: 'Kalender importieren' }).click();
  await commander.locator('input[type=file]').setInputFiles({ name: 'evd.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) });
  await commander.getByRole('button', { name: 'Weiter' }).click();
  await expect(commander.getByText('evd.ics · 1 Zeilen')).toBeVisible();
  await commander.getByRole('radio', { name: 'EvD-Dienst (iCal)' }).check();
  await commander.getByRole('button', { name: 'Weiter' }).click();
  await commander.getByRole('button', { name: 'Prüfen' }).click();
  await commander.getByRole('button', { name: '1 Datensätze importieren' }).click();
  await expect(commander.getByText('Import abgeschlossen.').first()).toBeVisible();

  await commander.goto('/duty-officer/roster');
  await rosterYear(commander, 80);
  const duty = row(commander, `${germanDate(80)}, 18:${minute}`).filter({ hasText: 'Kalender' });
  await expect(duty).toContainText(`${person.firstName} ${person.lastName}`);
  await expect(duty.getByRole('cell').nth(4)).toHaveText('1');
  await duty.getByRole('button', { name: 'Löschen' }).click();
  await commander.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(commander.getByText('Dienst gelöscht.')).toBeVisible();
});

/**
 * A new incident gets an EvD report written by the duty officer on duty. The duty officer opens it from the incident;
 * the commander records "no duty officer at this incident" and creates the report again.
 */
test('EvD report of a new incident', async ({ browser }) => {
  const commander = await login(browser, USERS.commander);
  const officer = await login(browser, USERS.dutyOfficer);
  const { user } = await api<{ user: { personId: string } }>(officer, 'GET', 'core/session');
  const person = await api<{ firstName: string; lastName: string }>(commander, 'GET', `masterdata/persons/${user.personId}`);
  const name = `${person.firstName} ${person.lastName}`;

  // On duty right now, then an alarm.
  const now = Date.now();
  const duty = await api<{ id: string }>(commander, 'POST', 'duty-officer/roster', {
    personId: user.personId,
    kind: 'duty-officer',
    from: new Date(now - 2 * 3_600_000).toISOString(),
    to: new Date(now + 2 * 3_600_000).toISOString(),
    notes: 'E2E',
  });
  const departments = await api<{ id: string; name: string }[]>(commander, 'GET', 'masterdata/departments');
  const musterstadt = departments.find((d) => d.name === 'Abteilung Musterstadt')!;
  const dispatchNumber = `E2E-EVD-${now}`;
  const incident = await api<{ id: string }>(commander, 'POST', 'incidents/incidents', {
    dispatchNumber,
    alarmKeyword: 'B2',
    alarmMessage: 'Kellerbrand',
    alarmedAt: new Date(now - 30 * 60_000).toISOString(),
    location: { street: 'Hauptstraße', houseNumber: '1', city: 'Musterstadt' },
    departmentIds: [musterstadt.id],
  });

  try {
    // The duty officer sees the card on the incident page and opens the EvD report.
    await officer.goto(`/incidents/incidents/${incident.id}`);
    const card = panel(officer, 'Einsatzleiter vom Dienst', 'Im Dienst laut Dienstplan');
    await expect(card).toContainText(/EvD-Bericht: EvD-\d{4}-\d+/);
    await expect(card).toContainText(new RegExp(`Im Dienst laut Dienstplan: .*${name}`));
    await expect(card.getByText('Entwurf')).toBeVisible();
    await card.getByRole('link', { name: 'Bericht öffnen' }).click();
    await expect(officer).toHaveURL(/\/incidents\/reports\//);
    await expect(officer.getByText(/EvD-\d{4}-\d+/).first()).toBeVisible();

    // No duty officer at this incident: the draft is deleted, the reason stays.
    await commander.goto(`/incidents/incidents/${incident.id}`);
    await commander.getByRole('button', { name: 'Kein EvD bei diesem Einsatz' }).click();
    await commander.getByRole('dialog').getByLabel(/^Grund/).fill('EvD war selbst auf Lehrgang');
    await commander.getByRole('dialog').getByRole('button', { name: 'Kein EvD bei diesem Einsatz' }).click();
    await expect(commander.getByText('Vermerkt: kein EvD bei diesem Einsatz.')).toBeVisible();
    await expect(commander.getByText(/Kein EvD bei diesem Einsatz: EvD war selbst auf Lehrgang/)).toBeVisible();

    // Created again on request.
    await commander.getByRole('button', { name: 'EvD-Bericht anlegen' }).click();
    await expect(commander.getByText('EvD-Bericht angelegt.')).toBeVisible();
    const restored = panel(commander, 'Einsatzleiter vom Dienst', 'Im Dienst laut Dienstplan');
    await expect(restored).toContainText(/EvD-Bericht: EvD-\d{4}-\d+/);
    await expect(restored.getByRole('link', { name: 'Bericht öffnen' })).toBeVisible();
  } finally {
    await restore('the roster', () => api(commander, 'DELETE', `duty-officer/roster/${duty.id}`));
  }
});
