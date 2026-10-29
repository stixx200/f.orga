import { api, choose, expect, isoDate, login, openKiosk, openTerminal, test, USERS } from './support';

type Person = { id: string; firstName: string; lastName: string };
type Report = { id: string; version: number; times: Record<string, string | null>; personnel: { personId: string | null }[] };

const minutes = (offset: number) => new Date(Date.now() + offset * 60_000).toISOString();

/** The person linked to the user of a page. */
async function personOf(page: Parameters<typeof api>[0], reader: Parameters<typeof api>[0]): Promise<Person> {
  const { user } = await api<{ user: { personId: string } }>(page, 'GET', 'core/session');
  return { ...(await api<Person>(reader, 'GET', `masterdata/persons/${user.personId}`)), id: user.personId };
}

/**
 * The department commander sets up an info terminal and opens its link like a tablet in the station. Members book
 * themselves into the report of a running incident (on a vehicle and on standby) and into a running session; a
 * session later today is not open yet, and an incident whose window closes meanwhile refuses the booking.
 */
test('info terminal: incident report, standby, session and closed window', async ({ browser }) => {
  const stamp = Date.now();
  const manager = await login(browser, USERS.departmentCommander);
  const commander = await login(browser, USERS.commander);
  const departments = await api<{ id: string; name: string }[]>(commander, 'GET', 'masterdata/departments');
  const musterstadt = departments.find((d) => d.name === 'Abteilung Musterstadt')!;
  const stations = await api<{ id: string; name: string }[]>(commander, 'GET', 'masterdata/stations');
  const station = stations.find((s) => s.name === 'Feuerwehrhaus Musterstadt')!;

  // An incident alarmed three hours ago (window open until six hours after the alarm), a running and a later session.
  const keyword = 'B2';
  // A street of its own finds the tile of this incident.
  const street = `E2E-Straße ${stamp % 1_000_000}`;
  const tile = new RegExp(`${keyword}.*${street}`);
  const incident = await api<{ id: string; reports: { id: string; departmentId: string | null }[] }>(commander, 'POST', 'incidents/incidents', {
    dispatchNumber: `E2E-IT-${stamp}`,
    alarmKeyword: keyword,
    alarmMessage: 'Zimmerbrand',
    alarmedAt: minutes(-180),
    location: { street, houseNumber: '7', city: 'Musterstadt' },
    departmentIds: [musterstadt.id],
  });
  const reportId = incident.reports.find((r) => r.departmentId === musterstadt.id)!.id;
  // Three active members of Musterstadt who are not in another report of the incident (e.g. the EvD on duty).
  const elsewhere = new Set<string | null>();
  for (const other of incident.reports.filter((r) => r.id !== reportId)) {
    for (const p of (await api<Report>(commander, 'GET', `incidents/reports/${other.id}`)).personnel) elsewhere.add(p.personId);
  }
  const candidates = (await api<(Person & { status: string; restricted?: boolean })[]>(commander, 'GET', `masterdata/persons?departmentId=${musterstadt.id}&status=active`))
    .filter((p) => !p.restricted && !elsewhere.has(p.id))
    .toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de'));
  const [member, leader, officer] = [candidates[0], candidates[1], candidates[2]];
  const running = `E2E Übung Terminal ${stamp}`;
  const later = `E2E Später ${stamp}`;
  for (const [title, from, to] of [[running, -10, 110], [later, 60, 180]] as const) {
    await api(commander, 'POST', 'training/sessions', { type: 'exercise', title, startsAt: minutes(from), endsAt: minutes(to), departmentIds: [musterstadt.id], stationId: station.id });
  }

  // Set up the terminal; the link is shown once with a QR code.
  await manager.goto('/info-terminal/terminals');
  await expect(manager.getByRole('heading', { name: 'Infoterminals', level: 1 })).toBeVisible();
  await choose(manager, 'Wache', /^Feuerwehrhaus Musterstadt/);
  await manager.getByLabel(/^Gerät/).fill(`Tablet Fahrzeughalle ${stamp}`);
  await manager.getByRole('button', { name: 'Infoterminal anlegen' }).click();
  const linkDialog = manager.getByRole('dialog');
  await expect(linkDialog.getByText('Infoterminal angelegt.')).toBeVisible();
  const url = (await linkDialog.getByText(/\/terminal#k=fit_/).textContent())!.trim();
  await linkDialog.getByRole('button', { name: 'Fertig' }).click();
  await expect(manager.getByRole('row').filter({ hasText: `Tablet Fahrzeughalle ${stamp}` })).toContainText('noch nie');

  const kiosk = await openKiosk(browser, url);
  await expect(kiosk.getByRole('heading', { name: 'Wofür möchten Sie sich eintragen?' })).toBeVisible();
  await expect(kiosk.getByRole('button', { name: new RegExp(running) })).toBeVisible();
  // The later session is shown greyed out until shortly before it begins.
  await expect(kiosk.getByText(later).locator('..')).toContainText(/Eintragen ab \d{2}:\d{2}/);
  await expect(kiosk.getByRole('button', { name: new RegExp(later) })).toHaveCount(0);

  // A member books on a vehicle; vehicles show designation and radio call sign.
  await kiosk.getByRole('button', { name: tile }).click();
  await expect(kiosk.getByRole('heading', { name: `${keyword}: Wer sind Sie?` })).toBeVisible();
  await kiosk.getByRole('button', { name: new RegExp(`^${member.firstName} ${member.lastName}`) }).first().click();
  await expect(kiosk.getByRole('heading', { name: `${member.firstName} ${member.lastName} eintragen` })).toBeVisible();
  await kiosk.getByRole('radio', { name: /^HLF 20 · Florian Musterstadt 1\/46/ }).check();
  await kiosk.getByRole('checkbox', { name: 'Unter Atemschutz' }).check();
  await kiosk.getByRole('button', { name: 'Eintragen', exact: true }).click();
  const done = kiosk.getByRole('dialog', { name: 'Eingetragen' });
  await expect(done).toContainText(`${member.firstName} ${member.lastName}`);
  await expect(done).toContainText('HLF 20 · Florian Musterstadt 1/46');
  await done.getByRole('button', { name: 'Eingetragene ansehen' }).click();
  await expect(kiosk.getByRole('heading', { name: `${keyword}: Eingetragen (1)` })).toBeVisible();
  await kiosk.getByRole('button', { name: '‹ Zur Namensliste' }).click();

  // Standby on the station with one choice.
  await kiosk.getByRole('button', { name: new RegExp(`^${leader.firstName} ${leader.lastName}`) }).first().click();
  await kiosk.getByRole('radio', { name: /^Bereitschaft/ }).check();
  await expect(kiosk.getByText('Bereitschaft gilt für die Zeiten des Berichts')).toBeVisible();
  await kiosk.getByRole('button', { name: 'Eintragen', exact: true }).click();
  await expect(kiosk.getByRole('dialog', { name: 'Eingetragen' })).toContainText('Bereitschaft');
  await kiosk.getByRole('dialog', { name: 'Eingetragen' }).getByRole('button', { name: 'Fertig' }).click();

  // The author finds both in the personnel of the report.
  const report = await api<Report>(commander, 'GET', `incidents/reports/${reportId}`);
  expect(report.personnel.map((p) => p.personId)).toEqual(expect.arrayContaining([member.id, leader.id]));

  // Session: present with a role.
  await kiosk.getByRole('button', { name: new RegExp(running) }).click();
  await kiosk.getByRole('button', { name: new RegExp(`^${member.firstName} ${member.lastName}`) }).first().click();
  await kiosk.getByLabel('Funktion (optional)').fill('Gruppensprecher');
  await kiosk.getByRole('button', { name: 'Anwesend eintragen' }).click();
  await expect(kiosk.getByRole('dialog')).toContainText(`${member.firstName} ${member.lastName} ist als anwesend eingetragen.`);
  await kiosk.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click();
  await expect(kiosk.getByRole('button', { name: new RegExp(running) })).toContainText('1 eingetragen');

  // The author confirms an early end meanwhile: the window has closed, the terminal refuses the booking.
  await kiosk.getByRole('button', { name: tile }).click();
  await kiosk.getByRole('button', { name: new RegExp(`^${officer.firstName} ${officer.lastName}`) }).first().click();
  await kiosk.getByRole('radio', { name: /^Bereitschaft/ }).check();
  const current = await api<Report>(commander, 'GET', `incidents/reports/${reportId}`);
  await api(commander, 'PUT', `incidents/reports/${reportId}`, { version: current.version, endConfirmed: true, times: { ...current.times, alarmedAt: minutes(-180), returnedAt: minutes(-150) } });
  await kiosk.getByRole('button', { name: 'Eintragen', exact: true }).click();
  await expect(kiosk.getByRole('alert')).toContainText('Das Eintragen ist geschlossen.');
  await kiosk.getByRole('button', { name: 'Zurück zur Übersicht' }).click();
  await expect(kiosk.getByRole('button', { name: tile })).toHaveCount(0);
});

/**
 * Self-check of the driving licence at the terminal: the commander switches on periodic checks with self-checks,
 * registers a sticker at a check in the original; the member scans it at the terminal and confirms the
 * self-declaration. An unknown sticker is refused. The settings are restored afterwards.
 */
test('info terminal: driving licence self-check', async ({ browser }) => {
  const commander = await login(browser, USERS.commander);
  const leader = await personOf(await login(browser, USERS.groupLeader), commander);
  const { user } = await api<{ user: { personId: string } }>(commander, 'GET', 'core/session');
  const before = await api<Record<string, unknown> | null>(commander, 'GET', 'core/settings/masterdata.driverLicense');
  const code = `E2E${Date.now()}`;
  try {
    await commander.goto('/masterdata/driver-licenses/settings');
    await expect(commander.getByRole('heading', { name: 'Führerscheinkontrolle', level: 1 })).toBeVisible();
    await commander.getByRole('radio', { name: 'Zusätzlich regelmäßig' }).check();
    await expect(commander.getByText(/Die regelmäßige Kontrolle ist eine Empfehlung der DGUV Regel 105-049/)).toBeVisible();
    await commander.getByRole('switch', { name: 'Selbstkontrolle erlauben' }).check();
    await commander.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(commander.getByText('Regeln gespeichert').first()).toBeVisible();

    // Check in the original with a barcode sticker.
    await api(commander, 'POST', `masterdata/persons/${leader.id}/driver-license/checks`, {
      checkedOn: isoDate(0),
      checkedById: user.personId,
      originalPresented: true,
      classes: [{ class: 'B', expiresOn: null }, { class: 'C', expiresOn: isoDate(1000) }],
      documentExpiresOn: null,
      note: 'E2E',
      token: { kind: 'barcode', code },
    });

    const kiosk = await openTerminal(browser, commander);
    await kiosk.getByRole('button', { name: /Führerschein kontrollieren/ }).first().click();
    await expect(kiosk.getByRole('heading', { name: 'Führerschein an das Lesegerät halten' })).toBeVisible();
    // A hand scanner in keyboard mode types the code and Enter.
    await kiosk.keyboard.type(code);
    await kiosk.keyboard.press('Enter');
    await expect(kiosk.getByRole('heading', { name: `${leader.firstName} ${leader.lastName}` })).toBeVisible();
    await expect(kiosk.getByText('Klassen:').locator('..')).toContainText('B, C');
    await kiosk.getByRole('checkbox', { name: /Mein Führerschein ist gültig/ }).check();
    await kiosk.getByRole('button', { name: 'Bestätigen' }).click();
    const done = kiosk.getByRole('dialog', { name: 'Führerschein kontrolliert' });
    await expect(done).toContainText(/Selbstkontrolle am/);
    await done.getByRole('button', { name: 'Fertig' }).click();

    // An unknown sticker.
    await kiosk.getByRole('button', { name: /Führerschein kontrollieren/ }).first().click();
    await kiosk.keyboard.type('UNBEKANNT-0000');
    await kiosk.keyboard.press('Enter');
    await expect(kiosk.getByRole('dialog', { name: 'Nicht registriert' })).toBeVisible();

    // The file shows the self-check as such.
    await commander.goto(`/masterdata/persons/${leader.id}/driver-license`);
    await expect(commander.getByRole('row').filter({ hasText: 'Selbstkontrolle Barcode' }).first()).toContainText(/Selbsterklärung bestätigt/);
  } finally {
    await api(commander, 'PUT', 'core/settings/masterdata.driverLicense', before ?? {});
  }
});
