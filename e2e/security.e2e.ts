import { ADMIN, api, choose, expect, login, rememberTotpSecret, restore, row, test, totpCode, USERS } from './support';

/**
 * A new breathing apparatus officer: the administrator creates the user (password rules), the user sets up the second
 * factor in the dialog that opens with the health data (QR code and secret, code computed by the test), sees
 * „Bestätigt bis“, ends the confirmation and confirms again with a code. The administrator sees the factor, resets it
 * (the sessions of the user end) and locks the user, who can no longer sign in.
 */
test('new user sets up the second factor; administrator resets it and locks the user', async ({ browser }) => {
  const admin = await login(browser, ADMIN.username);
  const username = `e2e-asgw-${Date.now()}`;
  const password = 'Leiter-Schlauch-Abend-2026';

  await admin.goto('/admin/users');
  await admin.getByRole('button', { name: '+ Benutzer anlegen' }).click();
  const form = admin.locator('form').filter({ has: admin.getByRole('button', { name: '+ Rolle zuweisen' }) });
  await form.getByLabel(/^Benutzername/).fill(username);
  await form.getByLabel(/^Anzeigename/).fill('E2E Atemschutz');
  await choose(form, 'Rolle', 'Atemschutzgerätewart');
  await choose(form, 'Bereich', 'Abteilung Musterstadt');
  await admin.getByRole('button', { name: '+ Rolle zuweisen' }).click();
  await expect(admin.getByText('Atemschutzgerätewart · Abteilung Musterstadt').or(admin.getByText(/Atemschutzgerätewart.*Musterstadt/)).first()).toBeVisible();

  // Password rules: common passwords and the own username are refused.
  const passwordField = form.getByLabel(/^Passwort/);
  await passwordField.fill('1234567890');
  await admin.getByRole('button', { name: 'Speichern' }).click();
  await expect(admin.getByText('Dieses Passwort ist zu häufig oder zu einfach.', { exact: false })).toBeVisible();
  await passwordField.fill(username);
  await admin.getByRole('button', { name: 'Speichern' }).click();
  await expect(admin.getByText('Das Passwort darf nicht aus Benutzername, Name oder E-Mail-Adresse bestehen.')).toBeVisible();
  await passwordField.fill(password);
  await admin.getByRole('button', { name: 'Speichern' }).click();
  await expect(admin.getByText('Benutzer gespeichert.')).toBeVisible();

  // The health data ask for the second factor; without one the dialog sets it up.
  const user = await login(browser, username, { password, stepUp: false });
  await user.goto('/respiratory-protection/overview');
  await user.getByRole('row').nth(1).click();
  await expect(user).toHaveURL(/\/masterdata\/persons\//);
  await user.getByRole('tab', { name: 'Atemschutz' }).click();
  const show = user.getByRole('button', { name: 'Untersuchungen anzeigen …' });
  await show.click();
  const setup = user.getByRole('dialog', { name: 'Zwei-Faktor-Anmeldung einrichten' });
  await expect(setup).toBeVisible();
  await setup.getByLabel(/^Aktuelles Passwort/).fill(password);
  await setup.getByRole('button', { name: 'QR-Code anzeigen' }).click();
  await expect(setup.getByRole('img', { name: 'QR-Code für die Authenticator-App' })).toBeVisible();
  const secret = (await setup.getByText('Ohne Kamera:').locator('code').textContent()) ?? '';
  expect(secret).toMatch(/^[A-Z2-7 ]{16,}$/);
  rememberTotpSecret(username, secret);
  await setup.getByLabel(/^Sechsstelliger Code aus der App/).fill(await totpCode(username));
  await setup.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(setup.getByText(/Jeder Code gilt einmal/)).toBeVisible();
  await setup.getByRole('button', { name: 'Fertig' }).click();
  await expect(setup).toBeHidden();
  const confirmed = user.getByText(/^Bestätigt bis \d{2}:\d{2}$/);
  await expect(confirmed).toBeVisible();

  // End the confirmation; the health data ask for a code again.
  await user.getByRole('button', { name: 'Beenden' }).click();
  await expect(confirmed).toBeHidden();
  await show.click();
  const stepUp = user.getByRole('dialog', { name: 'Bitte bestätigen Sie mit Ihrem Code' });
  await expect(stepUp).toBeVisible();
  await stepUp.getByLabel(/^Sechsstelliger Code aus der App/).fill(await totpCode(username));
  await stepUp.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(stepUp).toBeHidden();
  await expect(confirmed).toBeVisible();
  await expect(show).toBeHidden();

  // The role shows which permissions need the second factor.
  await admin.goto('/admin/roles');
  await admin.getByText('Atemschutzgerätewart', { exact: true }).click();
  await expect(row(admin, 'Eignungsuntersuchungen (Gesundheitsdaten)').getByText('zweiter Faktor')).toBeVisible();

  // The administrator resets the factor: the sessions of the user end.
  await admin.goto('/admin/users');
  await admin.getByRole('searchbox', { name: 'Suche' }).fill(username);
  await expect(row(admin, username)).toContainText('eingerichtet');
  await admin.getByRole('cell', { name: username, exact: true }).click();
  await admin.getByRole('button', { name: 'Zweiten Faktor zurücksetzen …' }).click();
  const reset = admin.getByRole('dialog', { name: 'Zweiten Faktor von E2E Atemschutz zurücksetzen?' });
  await reset.getByLabel(/^Grund/).fill('Telefon verloren (E2E)');
  await reset.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(admin.getByText('Zweiter Faktor zurückgesetzt.')).toBeVisible();
  await user.reload();
  await expect(user.getByRole('button', { name: 'Anmelden' })).toBeVisible();

  // Locked: the user can no longer sign in.
  await admin.getByRole('button', { name: 'Sperren …' }).click();
  await admin.getByRole('dialog', { name: 'E2E Atemschutz sperren?' }).getByRole('button', { name: 'Benutzer sperren' }).click();
  await expect(admin.getByRole('button', { name: 'Entsperren' })).toBeVisible();
  await user.getByLabel('Benutzername').fill(username);
  await user.getByLabel('Passwort').fill(password);
  await user.getByRole('button', { name: 'Anmelden' }).click();
  await expect(user.getByText('Benutzername oder Passwort ist falsch.')).toBeVisible();
});

/** The administrator issues an API token with recipient, purpose, expiry and scope, uses it, and revokes it. */
test('administrator creates and revokes an API token', async ({ browser, baseURL }) => {
  const admin = await login(browser, ADMIN.username);
  const name = `E2E-Alarmfax ${Date.now()}`;
  await admin.goto('/admin/tokens');
  await admin.getByLabel(/^Bezeichnung/).fill(name);
  await admin.getByLabel(/^Empfänger\/System/).fill('Alarmfax-Parser (Muster Leitstelle)');
  await admin.getByLabel(/^Zweck/).fill('Einsätze aus dem Alarmfax anlegen');
  await admin.getByRole('checkbox', { name: /^incidents\.reports\.read / }).check();
  await admin.getByRole('button', { name: 'Token erzeugen' }).click();
  await expect(admin.getByText('Token erzeugt.')).toBeVisible();
  const token = (await admin.locator('pre').first().textContent())?.trim() ?? '';
  expect(token.length).toBeGreaterThan(20);

  const tokenRow = row(admin, name);
  await expect(tokenRow).toContainText('Alarmfax-Parser (Muster Leitstelle)');
  await expect(tokenRow).toContainText('Einsätze aus dem Alarmfax anlegen');
  await expect(tokenRow).toContainText('von jeder Adresse');

  // The token works for its scope only, never for the administration (requests without the session of the page).
  const call = (path: string) => fetch(new URL(`/api/${path}`, baseURL), { headers: { authorization: `Bearer ${token}` } });
  expect((await call('incidents/incidents')).status).toBe(200);
  expect((await call('core/users')).status).toBe(403);

  await tokenRow.getByRole('button', { name: 'Widerrufen' }).click();
  await admin.getByRole('dialog', { name: 'Token widerrufen?' }).getByRole('button', { name: 'Widerrufen' }).click();
  await expect(tokenRow).toContainText('widerrufen');
  expect((await call('incidents/incidents')).status).toBe(401);
});

/**
 * The commander is signed in on two devices and signs the other one out in the profile; the administrator changes the
 * idle logout of accounts with administration rights, which the profile then names.
 */
test('signed-in devices and idle logout', async ({ browser }) => {
  // Sessions of the commander from other tests are ended first, so the list shows exactly the two of this test.
  const first = await login(browser, USERS.commander);
  await api(first, 'POST', 'core/me/sessions/end-others');
  const second = await login(browser, USERS.commander);
  await second.goto('/profile');
  await expect(second.getByText('Angemeldete Geräte')).toBeVisible();
  await expect(second.getByText('Dieses Gerät')).toBeVisible();
  const other = second.getByRole('row').filter({ has: second.getByRole('button', { name: 'Abmelden' }) });
  await expect(other).toHaveCount(1);
  await other.getByRole('button', { name: 'Abmelden' }).click();
  await expect(second.getByText('Das Gerät wurde abgemeldet.')).toBeVisible();
  await expect(other).toHaveCount(0);
  await first.reload();
  await expect(first.getByRole('button', { name: 'Anmelden' })).toBeVisible();

  // Idle logout of accounts with administration rights.
  const admin = await login(browser, ADMIN.username);
  const stored = await api<Record<string, unknown> | null>(admin, 'GET', 'core/settings/security');
  try {
    await admin.goto('/admin/settings?tab=security');
    const idle = admin.getByLabel(/^Abmeldung bei Konten mit Verwaltungsrechten/);
    await idle.fill('45');
    await admin.getByRole('button', { name: 'Speichern' }).first().click();
    await expect(admin.getByText(/gespeichert/).first()).toBeVisible();
    await admin.goto('/profile');
    await expect(admin.getByText('Ohne Bedienung werden Sie nach 45 Minuten abgemeldet.')).toBeVisible();
  } finally {
    if (!admin.isClosed()) await restore('the security settings', () => api(admin, 'PUT', 'core/settings/security', stored ?? {}));
  }
});
