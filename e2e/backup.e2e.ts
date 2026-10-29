import { ADMIN, api, download, expect, login, test } from './support';

const PASSPHRASE = 'e2e-passphrase-feuerwehr-2026';

interface Entry {
  id: string;
  status: string;
  trigger: string;
  startedAt: string;
}

/**
 * The administrator sets the target and the passphrase, backs up now, verifies the backup with a restore test, goes
 * through the restore wizard up to the confirmation (without restoring: that ends with a restart of the server),
 * downloads and deletes the backup. The e2e runner sets `FORGA_BACKUP_ROOT` to `dist/e2e/backups`.
 */
test('administrator backs up, verifies and prepares a restore', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await login(browser, ADMIN.username);
  const folder = `e2e-${Date.now()}`;

  await page.goto('/backup/settings');
  await page.getByRole('textbox', { name: /^Ordner unter/ }).fill(folder);
  await page.getByRole('button', { name: 'Ziel prüfen' }).click();
  await expect(page.getByText(/^Ziel beschreibbar · .* frei/)).toBeVisible();
  const encrypt = page.getByRole('switch', { name: 'Sicherungen verschlüsseln (AES-256-GCM)' });
  if (!(await encrypt.isChecked())) await encrypt.click();
  await page.getByLabel('Neue Passphrase').fill(PASSPHRASE);
  await page.getByLabel('Passphrase wiederholen').fill(PASSPHRASE);
  await page.getByRole('checkbox', { name: 'Ich habe die Passphrase sicher aufbewahrt' }).check();
  await page.getByRole('switch', { name: 'Nach jeder Sicherung prüfen' }).uncheck();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Einstellungen gespeichert.')).toBeVisible();
  await expect(page.getByText(/^Gespeichert, Kennwert /)).toBeVisible();

  // Back up now; the backup runs in the background.
  await page.getByRole('tab', { name: 'Sicherungen' }).click();
  const before = new Set((await api<Entry[]>(page, 'GET', 'backup/backups')).map((e) => e.id));
  await page.getByRole('button', { name: 'Jetzt sichern' }).click();
  const now = page.getByRole('dialog', { name: 'Jetzt sichern' });
  await expect(now.getByText(new RegExp(`nach .*${folder}, verschlüsselt mit der gespeicherten Passphrase`))).toBeVisible();
  await now.getByRole('button', { name: 'Sicherung starten' }).click();
  await expect(page.getByText('Sicherung gestartet.')).toBeVisible();
  let entry: Entry | undefined;
  await expect
    .poll(async () => {
      entry = (await api<Entry[]>(page, 'GET', 'backup/backups')).find((e) => !before.has(e.id) && e.trigger === 'manual');
      return entry?.status;
    }, { timeout: 120_000, intervals: [500, 1000, 2000] })
    .toBe('ok');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Jetzt sichern · ' }).filter({ hasText: 'erfolgreich' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('nicht geprüft');

  // Verify with a restore test into a temporary database.
  await row.getByRole('button', { name: 'Prüfen' }).click();
  const verify = page.getByRole('dialog', { name: 'Sicherung prüfen' });
  await verify.getByRole('checkbox', { name: /Zusätzlich Wiederherstellung testen/ }).check();
  await verify.getByRole('button', { name: 'Prüfen' }).click();
  await expect(verify.getByText('Entschlüsselt, Prüfsummen stimmen')).toBeVisible({ timeout: 180_000 });
  await expect(verify.getByText(/^Datenbank lesbar: \d+ Objekte in \d+ Schemas$/)).toBeVisible();
  await expect(verify.getByText('Version passt, alle Module vorhanden')).toBeVisible();
  await expect(verify.getByText(/^Wiederhergestellt: \d+ Personen, \d+ Einsätze/)).toBeVisible();
  await verify.getByRole('button', { name: 'Schließen' }).click();
  await expect(row).toContainText('Wiederherstellung getestet');

  // Restore wizard: the passphrase again, the check, then the confirmation with the name of the brigade.
  await row.getByRole('link', { name: 'Wiederherstellen …' }).click();
  await expect(page.getByText('Schritt 1 von 4: Sicherung wählen')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel('Passphrase der Sicherung').fill('falsche-passphrase-123');
  await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeDisabled();
  await page.getByLabel('Passphrase der Sicherung').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
  await expect(page.getByText('Entschlüsselt, Prüfsummen stimmen')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText(/^Passphrase richtig, Prüfsummen stimmen, Version passt/)).toBeVisible();
  await expect(page.getByText(/^Alle Änderungen seit dem .* gehen verloren\.$/)).toBeVisible();
  await expect(page.getByRole('row', { name: /^Personen \d/ })).toBeVisible();
  const start = page.getByRole('button', { name: 'Jetzt wiederherstellen' });
  const name = page.getByRole('textbox', { name: /Namen der Feuerwehr eingeben/ });
  await name.fill((await name.getAttribute('placeholder')) ?? '');
  await expect(start).toBeDisabled();
  await page.getByRole('checkbox', { name: /Benutzer informiert/ }).check();
  await expect(start).toBeEnabled();
  // Not restored: that ends with the restart of the server.
  await page.getByRole('link', { name: 'Abbrechen' }).click();

  // Download and delete the backup.
  await page.getByRole('row').filter({ hasText: 'Wiederherstellung getestet' }).first().getByRole('button', { name: 'Weitere Aktionen' }).click();
  const details = page.getByRole('dialog', { name: /^Sicherung vom / });
  const file = await download(page, () => details.getByRole('link', { name: 'Herunterladen' }).click());
  expect(file.name).toMatch(/\.forgabackup$/);
  await details.getByRole('button', { name: 'Löschen …' }).click();
  await page.getByRole('dialog', { name: 'Sicherung löschen?' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Sicherung gelöscht.')).toBeVisible();
  expect((await api<Entry[]>(page, 'GET', 'backup/backups')).find((e) => e.id === entry!.id)?.status ?? 'deleted').toBe('deleted');
});
