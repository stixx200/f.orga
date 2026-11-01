import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import ExcelJS from 'exceljs';
import { ADMIN, api, choose, chooseFiles, expect, isoDate, login, test, USERS } from '../../../e2e/support';

/** The import page: steps are "Datei", "Inhalt", "Spalten", "Vorschau". */
const IMPORT_URL = '/import';

test('equipment officer imports the inventory from CSV with a mapped column and updates it from Excel', async ({ browser }) => {
  const page = await login(browser, USERS.equipmentOfficer);
  const stamp = Date.now();
  const numbers = [`E2E-${stamp}-1`, `E2E-${stamp}-2`];

  // "Firma" is no known heading of the manufacturer: it is mapped by hand.
  const csv = ['Inventar-Nr.;Bezeichnung;Kategorie;Abteilung;Firma', `${numbers[0]};Steckleiter E2E;Leitern;Musterstadt;Leiterbau GmbH`, `${numbers[1]};Stromerzeuger E2E;Elektro;Musterstadt;Strom AG`].join('\n');
  await page.goto(IMPORT_URL);
  await chooseFiles(page, 'Datei', { name: 'inventar.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('inventar.csv · 2 Zeilen')).toBeVisible();
  // The best fitting content is suggested.
  await expect(page.getByRole('radio', { name: 'Inventar' })).toBeChecked();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Spalten zuordnen · Inventar')).toBeVisible();
  await choose(page, 'Hersteller', 'Firma');
  await expect(page.getByRole('row', { name: /Hersteller/ }).getByText('Leiterbau GmbH · Strom AG')).toBeVisible();
  await page.getByRole('button', { name: 'Prüfen' }).click();

  await expect(page.getByText(/Die Prüfung hat nichts verändert/)).toBeVisible();
  await page.getByRole('button', { name: '2 Datensätze importieren' }).click();
  await expect(page.getByRole('button', { name: 'Weitere Datei importieren' })).toBeVisible();

  const items = await api<{ inventoryNumber: string; name: string; manufacturer: string }[]>(page, 'GET', `equipment/items?q=E2E-${stamp}`);
  expect(items.map((i) => [i.inventoryNumber, i.manufacturer]).toSorted()).toEqual([
    [numbers[0], 'Leiterbau GmbH'],
    [numbers[1], 'Strom AG'],
  ]);

  // The same items from Excel: both are updated.
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventar');
  sheet.addRow(['Inventarnummer', 'Bezeichnung', 'Kategorie', 'Abteilung']);
  sheet.addRow([numbers[0], 'Steckleiter E2E, 4 Teile', 'Leitern', 'Abteilung Musterstadt']);
  sheet.addRow([numbers[1], 'Stromerzeuger E2E 8 kVA', 'Elektro', 'Abteilung Musterstadt']);
  await page.getByRole('button', { name: 'Weitere Datei importieren' }).click();
  await chooseFiles(page, 'Datei', { name: 'inventar.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('inventar.xlsx · 2 Zeilen')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await page.getByRole('button', { name: '2 Datensätze importieren' }).click();
  await expect(page.getByRole('button', { name: 'Weitere Datei importieren' })).toBeVisible();
  await expect(page.getByRole('cell', { name: `${numbers[0]} Steckleiter E2E, 4 Teile` })).toBeVisible();

  // Retire the items again (items are not deleted).
  const updated = await api<{ id: string; name: string }[]>(page, 'GET', `equipment/items?q=E2E-${stamp}`);
  expect(updated.map((i) => i.name).toSorted()).toEqual(['Steckleiter E2E, 4 Teile', 'Stromerzeuger E2E 8 kVA']);
  for (const item of updated) await api(page, 'POST', `equipment/items/${item.id}/retire`, { date: isoDate(), reason: 'E2E-Test' });
});

/** An iCal calendar with one duty officer service of the person, far in the future (no overlap with the demo data). */
function calendar(uid: string, name: string, days: number): string {
  const day = isoDate(days).replaceAll('-', '');
  const next = isoDate(days + 7).replaceAll('-', '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//f.orga//e2e//DE', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTART;TZID=Europe/Berlin:${day}T180000`, `DTEND;TZID=Europe/Berlin:${next}T180000`, `SUMMARY:EvD ${name}`, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

test('administration imports the duty officer roster from an iCal file and from a calendar address', async ({ browser }) => {
  // A member with a unique name for the title of the event.
  const admin = await login(browser, ADMIN.username);
  const persons = await api<{ firstName: string; lastName: string; status?: string }[]>(admin, 'GET', 'masterdata/persons');
  const names = persons.map((p) => `${p.firstName} ${p.lastName}`);
  const name = names.find((n) => names.filter((m) => m === n).length === 1 && persons.some((p) => `${p.firstName} ${p.lastName}` === n && (!p.status || p.status === 'active')))!;
  const stamp = Date.now();
  const days = 500 + (stamp % 200);

  const page = await login(browser, USERS.administration);
  await page.goto(IMPORT_URL);
  await chooseFiles(page, 'Datei', { name: 'evd.ics', mimeType: 'text/calendar', buffer: Buffer.from(calendar(`e2e-file-${stamp}`, name, days)) });
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByRole('radio', { name: 'EvD-Dienst (iCal)' })).toBeChecked();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByRole('cell', { name: `EvD ${name}` })).toBeVisible();
  await page.getByRole('button', { name: '1 Datensätze importieren' }).click();
  await expect(page.getByRole('button', { name: 'Weitere Datei importieren' })).toBeVisible();

  // The same kind of calendar from an address served by the test (allowed with FORGA_IMPORT_URL_ALLOW_PRIVATE).
  const server = createServer((request, response) => {
    if (request.url !== '/evd.ics') return void response.writeHead(404).end();
    response.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8' }).end(calendar(`e2e-url-${stamp}`, name, days + 14));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/evd.ics`;
    await page.getByRole('button', { name: 'Weitere Datei importieren' }).click();
    await page.getByLabel('Kalenderadresse').fill(address);
    await page.getByRole('checkbox', { name: /Adresse für den nächsten Import merken/ }).uncheck();
    await page.getByRole('button', { name: 'Laden', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'EvD-Dienst (iCal)' })).toBeChecked();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await page.getByRole('button', { name: '1 Datensätze importieren' }).click();
    await expect(page.getByRole('button', { name: 'Weitere Datei importieren' })).toBeVisible();
  } finally {
    server.close();
  }

  // Both services are in the roster; remove them again.
  const roster = await api<{ id: string; externalUid: string | null }[]>(page, 'GET', `duty-officer/roster?from=${isoDate(days - 1)}&to=${isoDate(days + 30)}`);
  const imported = roster.filter((d) => d.externalUid?.endsWith(`-${stamp}`));
  expect(imported.map((d) => d.externalUid).toSorted()).toEqual([`e2e-file-${stamp}`, `e2e-url-${stamp}`]);
  for (const duty of imported) await api(page, 'DELETE', `duty-officer/roster/${duty.id}`);
});
