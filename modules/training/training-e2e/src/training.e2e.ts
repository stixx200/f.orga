import { expect, localDateTime, login, test } from '../../../../e2e/support';

/**
 * The commander plans a session, a member checks in via QR code,
 * the commander completes the attendance and closes the session.
 */
test('session with QR check-in, attendance and closing', async ({ browser }) => {
  const title = `E2E-Übung ${Date.now()}`;
  const commander = await login(browser, 'commander');
  await commander.goto('/training/sessions');
  await expect(commander.getByRole('heading', { name: 'Dienste', level: 1 })).toBeVisible();

  // Plan a session that is running right now.
  await commander.getByRole('button', { name: '+ Dienst planen' }).click();
  const dialog = commander.getByRole('dialog');
  await dialog.getByLabel(/^Titel/).fill(title);
  await dialog.getByLabel(/^Beginn/).fill(localDateTime(-10));
  await dialog.getByLabel(/^Ende/).fill(localDateTime(110));
  await dialog.getByRole('combobox', { name: 'Abteilungen' }).click({ force: true });
  await commander.getByRole('option', { name: 'Abteilung Musterstadt', exact: true }).click();
  await dialog.getByLabel(/^Thema/).fill('Löschangriff mit Wasserentnahme');
  await dialog.getByRole('button', { name: 'Planen', exact: true }).click();
  await expect(commander.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(commander.getByText('Geplant', { exact: true })).toBeVisible();

  // The equipment module adds a tab for the equipment used.
  await commander.getByRole('tab', { name: 'Geräte' }).click();
  await expect(commander.getByText('Keine Geräte eingetragen.')).toBeVisible();

  // A member scans the QR code.
  await commander.getByRole('tab', { name: 'Anwesenheit' }).click();
  const code = (await commander.getByTestId('check-in-code').textContent())!.trim();
  const member = await login(browser, 'group-leader');
  await member.goto(`/training/check-in?code=${code}`);
  await member.getByRole('button', { name: 'Ich bin da' }).click();
  await expect(member.getByText(`Ihre Anwesenheit bei „${title}“ ist erfasst.`)).toBeVisible();

  // The commander sees the check-in, completes the list and closes the session.
  await commander.reload();
  await commander.getByRole('tab', { name: 'Anwesenheit' }).click();
  await expect(commander.getByText(/^1 von \d+ anwesend$/)).toBeVisible();
  await expect(commander.getByText('per QR, nicht bestätigt')).toBeVisible();
  const rows = commander.getByRole('row').filter({ has: commander.getByRole('radiogroup') });
  for (const index of [1, 2]) await rows.nth(index).getByText('Anwesend', { exact: true }).click();
  await commander.getByRole('button', { name: 'Übrige unentschuldigt' }).click();
  await commander.getByRole('button', { name: 'Anwesenheit speichern' }).click();
  await expect(commander.getByText('Anwesenheit gespeichert')).toBeVisible();
  await expect(commander.getByText('Durchgeführt', { exact: true })).toBeVisible();
  await expect(commander.getByText(/^3 von \d+ anwesend$/)).toBeVisible();

  await commander.getByRole('button', { name: 'Abschließen' }).click();
  await commander.getByRole('dialog').getByRole('button', { name: 'Abschließen' }).click();
  await expect(commander.getByText('Abgeschlossen', { exact: true })).toBeVisible();
  await expect(commander.getByRole('button', { name: 'Wieder öffnen' })).toBeVisible();

  // The month and the week calendar show the session on today's date and open it.
  await commander.goto('/training/sessions');
  await commander.getByText('Monat', { exact: true }).click();
  await commander.getByRole('button', { name: new RegExp(title) }).click();
  await expect(commander.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await commander.goto('/training/sessions');
  await commander.getByText('Woche', { exact: true }).click();
  await expect(commander.getByText(/^KW \d+ · /)).toBeVisible();
  await commander.getByRole('button', { name: new RegExp(title) }).click();
  await expect(commander.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await commander.goto('/training/sessions');
  await commander.getByText('Liste', { exact: true }).click();

  // The session counts for the participation.
  await commander.goto('/training/participation');
  await expect(commander.getByRole('heading', { name: 'Dienstbeteiligung', level: 1 })).toBeVisible();
  await expect(commander.getByRole('row').nth(1)).toBeVisible();
});
