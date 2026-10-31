import { api, expect, isoDate, login, openKiosk, test, USERS } from '../../../../e2e/support';

type Department = { id: string; name: string };
type Person = { id: string; firstName: string; lastName: string };

async function createPerson(page: Parameters<typeof api>[0], lastName: string, email: string): Promise<Person> {
  const departments = await api<Department[]>(page, 'GET', 'masterdata/departments');
  const departmentId = departments.find((d) => d.name === 'Abteilung Musterstadt')!.id;
  return api<Person>(page, 'POST', 'masterdata/persons', {
    firstName: 'E2E',
    lastName,
    email,
    status: 'active',
    memberships: [{ departmentId, from: isoDate(-400), primary: true }],
  });
}

/** Dismisses the home-screen hint when the kiosk shows it on the first visit. */
async function dismissInstallHint(kiosk: Awaited<ReturnType<typeof openKiosk>>): Promise<void> {
  const later = kiosk.getByRole('button', { name: 'Nicht jetzt' });
  if (await later.isVisible()) await later.click();
}

/**
 * The commander creates a personal access, mails the link and opens the kiosk: tiles, menu and the respiratory
 * tile only for a wearer. A person without that qualification has neither the tab nor the tile.
 */
test('personal access: mail, kiosk tiles and hidden respiratory protection', async ({ browser }) => {
  const stamp = Date.now();
  const commander = await login(browser, USERS.commander);
  const wearer = await createPerson(commander, `Träger${stamp}`, `traeger-${stamp}@example.org`);
  const other = await createPerson(commander, `OhneAS${stamp}`, `ohne-${stamp}@example.org`);
  await api(commander, 'POST', `masterdata/persons/${wearer.id}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: isoDate(-200) });

  // Wearer: tab, mail the link, open the kiosk.
  await Promise.all([
    commander.waitForResponse((r) => r.url().includes(`respiratory-protection/persons/${wearer.id}`) && r.ok()),
    commander.goto(`/masterdata/persons/${wearer.id}`),
  ]);
  await expect(commander.getByRole('heading', { name: `E2E Träger${stamp}` })).toBeVisible();
  await expect(commander.getByRole('tab', { name: 'Atemschutz' })).toBeVisible();
  await commander.getByRole('tab', { name: 'Persönlicher Zugang' }).click();
  await commander.getByRole('button', { name: 'Link per E-Mail senden' }).click();
  await expect(commander.getByText('Der Link wurde per E-Mail gesendet.')).toBeVisible();
  await commander.getByRole('button', { name: 'Link anzeigen' }).click();
  const linkField = commander.locator('input[readonly]');
  await expect(linkField).toHaveValue(/\/personal#k=fpa_/);
  const url = await linkField.inputValue();

  const kiosk = await openKiosk(browser, url);
  await expect(kiosk.getByRole('heading', { name: `E2E Träger${stamp}` })).toBeVisible();
  await dismissInstallHint(kiosk);
  await expect(kiosk.getByRole('button', { name: /Atemschutz/ })).toHaveCount(2);
  await expect(kiosk.getByRole('button', { name: /Dienste/ })).toHaveCount(2);
  await expect(kiosk.getByRole('button', { name: /Einsätze/ })).toHaveCount(2);
  await expect(kiosk.getByRole('button', { name: /Schutzausrüstung/ })).toBeVisible();
  await expect(kiosk.getByRole('button', { name: /Lehrgänge/ })).toBeVisible();
  await expect(kiosk.getByRole('button', { name: /Qualifikationen/ })).toBeVisible();
  await expect(kiosk.getByRole('button', { name: /Stammdaten/ })).toBeVisible();

  await kiosk.getByRole('button', { name: /^Atemschutz/ }).first().click();
  await expect(kiosk.getByRole('heading', { name: 'Atemschutz', level: 1 })).toBeVisible();
  await expect(kiosk).toHaveURL(/[?&]v=respiratory/);
  await kiosk.getByRole('button', { name: 'Zurück' }).click();
  await expect(kiosk.getByRole('heading', { name: `E2E Träger${stamp}`, level: 1 })).toBeVisible();

  await kiosk.getByRole('navigation').getByRole('button', { name: 'Dienste' }).click();
  await expect(kiosk.getByRole('heading', { name: 'Dienste', level: 1 })).toBeVisible();
  await kiosk.getByRole('navigation').getByRole('button', { name: 'Profil' }).click();
  await expect(kiosk.getByRole('heading', { name: 'Stammdaten', level: 1 })).toBeVisible();
  await expect(kiosk.getByText(`traeger-${stamp}@example.org`)).toBeVisible();
  await kiosk.getByRole('button', { name: 'Abmelden' }).click();
  await expect(kiosk.getByRole('heading', { name: 'Mein Bereich' })).toBeVisible();

  // Without the qualification the person file and the kiosk hide respiratory protection.
  await Promise.all([
    commander.waitForResponse((r) => r.url().includes(`respiratory-protection/persons/${other.id}`) && r.ok()),
    commander.goto(`/masterdata/persons/${other.id}`),
  ]);
  await expect(commander.getByRole('heading', { name: `E2E OhneAS${stamp}` })).toBeVisible();
  await expect(commander.getByRole('tab', { name: 'Persönlicher Zugang' })).toBeVisible();
  await expect(commander.getByRole('tab', { name: 'Atemschutz' })).toHaveCount(0);

  const guest = await api<{ url: string }>(commander, 'POST', `personal/persons/${other.id}/link`);
  const otherKiosk = await openKiosk(browser, guest.url);
  await expect(otherKiosk.getByRole('heading', { name: `E2E OhneAS${stamp}` })).toBeVisible();
  await dismissInstallHint(otherKiosk);
  await expect(otherKiosk.getByRole('button', { name: /Atemschutz/ })).toHaveCount(0);
  await expect(otherKiosk.getByRole('navigation').getByRole('button', { name: 'Atemschutz' })).toHaveCount(0);
  await expect(otherKiosk.getByRole('button', { name: /Stammdaten/ })).toBeVisible();
});
