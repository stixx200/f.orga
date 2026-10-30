import { ADMIN, api, choose, download, expect, germanDate, isoDate, login, navigate, panel, restore, row, tasksOf, test, USERS } from './support';

type Activity = { key: string; record: { version: number; legalBasis: string; recipients: unknown[]; thirdCountry: string; remarks: string } };

/**
 * Register of processing activities (Art. 30): the administrator enters the legal basis of an activity, marks it as
 * reviewed and exports the register as PDF and Excel and the information for an impact assessment. The legal basis is
 * restored afterwards.
 */
test('register of processing activities: legal basis, review and exports', async ({ browser }) => {
  const admin = await login(browser, ADMIN.username);
  const key = 'masterdata.driver-licenses';
  const stored = (await api<{ activities: Activity[] }>(admin, 'GET', 'privacy/register')).activities.find((a) => a.key === key)!;
  const legalBasis = `§ 2 Feuerwehrgesetz, Dienstanweisung Fahrzeugführer (E2E ${Date.now()})`;
  try {
    await admin.goto('/privacy/register');
    await expect(admin.getByText(/^Entwurf aus den aktiven Modulen\./)).toBeVisible();
    await admin.getByRole('button', { name: 'Führerscheinkontrolle', exact: true }).click();
    const card = panel(admin, 'Führerscheinkontrolle');
    await card.getByLabel('Rechtsgrundlage (von der Gemeinde)').fill(legalBasis);
    await card.getByRole('button', { name: 'Speichern' }).click();
    await expect(admin.getByText('Gespeichert.')).toBeVisible();
    await expect(card.getByText(/^Zuletzt geändert \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} von Administrator$/)).toBeVisible();
    await expect(admin.getByRole('row', { name: /^Führerscheinkontrolle .* Entwurf$/ })).toBeVisible();
    await card.getByRole('button', { name: 'Als geprüft markieren …' }).click();
    const confirm = admin.getByRole('dialog', { name: 'Tätigkeit als geprüft markieren?' });
    await expect(confirm).toContainText('„Führerscheinkontrolle“');
    await confirm.getByRole('button', { name: 'Als geprüft markieren' }).click();
    await expect(admin.getByRole('row', { name: new RegExp(`^Führerscheinkontrolle .* ${germanDate()} · Administrator$`) })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Als geprüft markieren …' })).toBeDisabled();
    await expect(card.getByLabel('Rechtsgrundlage (von der Gemeinde)')).toHaveValue(legalBasis);

    // Exports: PDF, Excel and the information for a data protection impact assessment.
    const pdf = await download(admin, () => admin.getByRole('button', { name: 'PDF herunterladen' }).click());
    expect(pdf.name).toMatch(/\.pdf$/);
    expect(pdf.content.subarray(0, 5).toString()).toBe('%PDF-');
    const excel = await download(admin, () => admin.getByRole('button', { name: 'Excel' }).click());
    expect(excel.name).toMatch(/\.xlsx$/);
    expect(excel.content.subarray(0, 2).toString()).toBe('PK');
    await expect(admin.getByText(/Tätigkeiten mit Gesundheitsdaten: Prüfen Sie mit dem Datenschutzbeauftragten/)).toBeVisible();
    const dpia = await download(admin, () => admin.getByRole('button', { name: 'Angaben für die Folgenabschätzung (PDF)' }).click());
    expect(dpia.content.subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    if (!admin.isClosed()) {
      await restore('the legal basis of the driving licence checks', async () => {
        const current = (await api<{ activities: Activity[] }>(admin, 'GET', 'privacy/register')).activities.find((a) => a.key === key)!;
        const { legalBasis: before, recipients, thirdCountry, remarks } = stored.record;
        if (current.record.legalBasis !== before) await api(admin, 'PUT', `privacy/register/activities/${key}`, { legalBasis: before, recipients, thirdCountry, remarks, version: current.record.version });
      });
    }
  }
});

/**
 * A data breach: the administrator records it (72 hours to notify, a task for everyone managing data protection),
 * determines the affected persons from an exported list in the audit log, downloads the contact list for the
 * notification, records the notification of the authority and closes the breach.
 */
test('data breach: record, 72-hour task, affected persons from a list export, contact list, close', async ({ browser }) => {
  const admin = await login(browser, ADMIN.username);
  const title = `E2E Ausdruck der Telefonliste verloren ${Date.now()}`;

  // An exported list that later goes missing.
  await navigate(admin, 'Listen');
  await admin.getByText('Telefonliste', { exact: true }).click();
  await choose(admin, 'Zweck', 'Führungskräfte (Alarmierung, Erreichbarkeit)');
  await choose(admin, 'Abteilung', 'Abteilung Musterstadt');
  await admin.getByRole('button', { name: 'Vorschau' }).click();
  const lines = Number(/^(\d+) Zeilen?$/.exec((await admin.getByText(/^\d+ Zeilen?$/).textContent()) ?? '')![1]);
  await download(admin, () => admin.getByRole('link', { name: 'PDF' }).click());

  // Record the breach.
  await admin.goto('/privacy/breaches');
  await admin.getByRole('button', { name: 'Datenpanne erfassen …' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Datenpanne erfassen' });
  await dialog.getByLabel(/^Kurzbeschreibung/).fill(title);
  await dialog.getByLabel('Was ist passiert?').fill('Ein Ausdruck der Telefonliste der Führungskräfte ist nach der Dienstbesprechung nicht mehr auffindbar.');
  await choose(dialog, 'Betroffene Verarbeitungstätigkeiten', 'Personalverwaltung');
  await admin.keyboard.press('Escape');
  await dialog.getByLabel('Betroffene Daten').fill('Name, Mobilnummer');
  await choose(dialog, 'Risiko für die Personen', 'Risiko (Meldung an die Aufsichtsbehörde)');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(admin.getByText(/^Datenpanne erfasst\./)).toBeVisible();
  await expect(admin.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  const deadline = admin.getByText(/Meldung an die Aufsichtsbehörde bis \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} \(noch 7[12] Stunden\)\./);
  await expect(deadline).toBeVisible();
  const notifyBy = /bis (\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2})/.exec((await deadline.textContent()) ?? '')![1]!;
  const breachUrl = admin.url();

  // The 72 hours are a task, without details of the breach.
  const tasks = await tasksOf(admin, 'Datenschutz');
  await expect(tasks.getByText(`Datenpanne der Aufsichtsbehörde melden (bis ${notifyBy})`)).toBeVisible();
  await admin.goto(breachUrl);

  // Affected persons from the list export of the administrator.
  const affected = panel(admin, 'Betroffene Personen');
  await expect(affected.getByText('Noch keine Personen ermittelt.')).toBeVisible();
  await affected.getByRole('button', { name: 'Betroffene ermitteln …' }).click();
  const determine = admin.getByRole('dialog', { name: 'Betroffene Personen ermitteln' });
  await determine.getByLabel('Von', { exact: true }).fill(isoDate());
  await choose(determine, 'Benutzerkonto', 'Administrator');
  await determine.getByRole('button', { name: 'Suchen' }).click();
  const source = row(determine, 'Liste exportiert: Telefonliste (pdf)').first();
  await expect(source).toContainText(String(lines));
  await source.getByRole('button', { name: 'Auswählen' }).click();
  await expect(determine.getByText(`${lines} Personen gefunden`, { exact: false })).toBeVisible();
  await expect(determine.getByText('Die Personen stehen im Audit-Eintrag (Stand des Exports).')).toBeVisible();
  await determine.getByRole('button', { name: 'In die Datenpanne übernehmen' }).click();
  await expect(admin.getByText('Betroffene übernommen.')).toBeVisible();
  await expect(affected.getByText(`${lines} Personen`, { exact: true })).toBeVisible();
  await expect(affected.getByText(/^Ermittelt aus: Liste exportiert: Telefonliste \(pdf\)/)).toBeVisible();
  const contacts = await download(admin, () => affected.getByRole('button', { name: 'Kontaktliste für die Benachrichtigung (Excel)' }).click());
  expect(contacts.name).toMatch(/\.xlsx$/);
  expect(contacts.content.subarray(0, 2).toString()).toBe('PK');

  // Notified to the authority within the 72 hours, then closed.
  const authority = panel(admin, 'Meldung an die Aufsichtsbehörde (Art. 33)');
  await authority.getByLabel('Gemeldet am').fill(isoDate());
  await authority.getByLabel('Aktenzeichen').fill('LfDI-E2E-2026-001');
  await admin.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(admin.getByText('Gespeichert.')).toBeVisible();
  await expect(admin.getByText(`gemeldet ${germanDate()}`).first()).toBeVisible();
  await expect(deadline).toHaveCount(0);
  await admin.getByRole('button', { name: 'Abschließen …' }).click();
  const close = admin.getByRole('dialog', { name: 'Datenpanne abschließen?' });
  await close.getByRole('button', { name: 'Abschließen' }).click();
  await expect(admin.getByText(`Abgeschlossen am ${germanDate()}.`)).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Wieder öffnen' })).toBeVisible();

  await admin.goto('/privacy/breaches');
  await admin.getByText('abgeschlossen', { exact: true }).click();
  await expect(row(admin, title)).toContainText(`${lines} Personen`);
});

/**
 * Emergency stop of a data breach: „Alle Sitzungen beenden und alle Tokens widerrufen“ ends every other session; the
 * member signed in before has to sign in again, the administrator keeps working. The test ends only sessions and
 * tokens of the moment, later tests sign in anew.
 */
test('data breach: ending all other sessions signs out another user', async ({ browser }) => {
  const member = await login(browser, USERS.member);
  await member.getByRole('link', { name: 'Mein Bereich' }).click();
  await expect(member.getByRole('heading', { name: 'Mein Bereich', level: 1 })).toBeVisible();
  const admin = await login(browser, ADMIN.username);
  const breach = await api<{ id: string; version: number }>(admin, 'POST', 'privacy/breaches', {
    title: `E2E Zugangsdaten eines Kontos abgeflossen ${Date.now()}`,
    discoveredAt: new Date().toISOString(),
    description: 'Ein Benutzer hat sein Passwort auf einer gefälschten Anmeldeseite eingegeben.',
    activityKeys: ['core.accounts'],
    risk: 'risk',
  });
  try {
    await admin.goto(`/privacy/breaches/${breach.id}`);
    const lockdown = panel(admin, 'Notfall: alle Sitzungen beenden');
    await lockdown.getByRole('button', { name: 'Alle Sitzungen beenden und alle Tokens widerrufen …' }).click();
    const confirm = admin.getByRole('dialog', { name: 'Alle Sitzungen beenden und alle Tokens widerrufen?' });
    const submit = confirm.getByRole('button', { name: 'Jetzt beenden und widerrufen' });
    await expect(submit).toBeDisabled();
    await confirm.getByLabel(/^Grund \(mindestens 10 Zeichen\)/).fill('Zugangsdaten abgeflossen, alle Sitzungen beenden (E2E)');
    await submit.click();
    await expect(admin.getByText(/^[1-9]\d* Sitzungen beendet, \d+ API-Tokens widerrufen, \d+ Infoterminals gesperrt\.$/)).toBeVisible();

    // The member is signed out, the administrator keeps the own session.
    await member.reload();
    await expect(member.getByLabel('Benutzername')).toBeVisible();
    await admin.reload();
    await expect(admin.getByRole('heading', { name: /^E2E Zugangsdaten eines Kontos abgeflossen/, level: 1 })).toBeVisible();
  } finally {
    if (!admin.isClosed()) {
      await restore('the data breach of the test', async () => {
        const current = await api<Record<string, unknown>>(admin, 'GET', `privacy/breaches/${breach.id}`);
        const updated = await api<{ version: number }>(admin, 'PUT', `privacy/breaches/${breach.id}`, { ...current, authorityNotRequired: true, authorityNote: 'Testfall der E2E-Tests' });
        await api(admin, 'POST', `privacy/breaches/${breach.id}/close`, { version: updated.version, closedOn: isoDate() });
      });
    }
  }
});
