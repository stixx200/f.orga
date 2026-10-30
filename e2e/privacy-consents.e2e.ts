import type { Page } from '@playwright/test';
import { ADMIN, api, choose, chooseFiles, createPerson, expect, germanDate, isoDate, login, navigate, panel, restore, row, test, type TestPerson, USERS } from './support';

type Consent = { key: string; version: number; title: { de: string; en: string }; text: { de: string; en: string }; givenBy: string; effects: string[]; active: boolean };

/** Opens a list in „Listen“ with purpose and department and shows the preview. */
async function preview(page: Page, list: string, purpose: string, dates?: { from: string; to: string }) {
  await page.goto('/');
  await navigate(page, 'Listen');
  await page.getByText(list, { exact: true }).click();
  await expect(page.getByRole('heading', { name: list })).toBeVisible();
  await choose(page, 'Zweck', purpose);
  await choose(page, 'Abteilung', 'Abteilung Musterstadt');
  if (dates) {
    await page.getByLabel('Von', { exact: true }).fill(dates.from);
    await page.getByLabel('Bis', { exact: true }).fill(dates.to);
  }
  await page.getByRole('button', { name: 'Vorschau' }).click();
  await expect(page.getByText(/^\d+ Zeilen?$/)).toBeVisible();
}

const listed = (page: Page, person: TestPerson) => row(page, `${person.lastName}, ${person.firstName}`);

/**
 * Consents (Art. 7 DSGVO): the administrator keeps the catalog (templates, a new consent reviewed, a change without new
 * version stays saved). The department commander records two consents of a person with a scanned proof: the phone list
 * of the department shows the mobile number instead of „über Gruppenführer“, the birthday list for posting includes the
 * person. A member gives and withdraws a consent in Mein Bereich; a request „Widerruf einer Einwilligung“ is done by
 * recording the withdrawal.
 */
test('consents: catalog, recorded with proof, effect on lists, own consent and withdrawal request', async ({ browser }) => {
  const stamp = Date.now();
  const admin = await login(browser, ADMIN.username);
  // Birthday tomorrow (30 years), so the birthday list from today to the day after tomorrow lists it.
  const birthDate = `${Number(isoDate(1).slice(0, 4)) - 30}${isoDate(1).slice(4)}`;
  const person = await createPerson(admin, `Einwilligung${stamp}`, { phoneMobile: '0151 4242424', birthDate });
  const key = `e2e-consent-${stamp}`;
  const title = `E2E Fotos auf der Website ${stamp}`;
  try {
    // The catalog.
    await admin.goto('/privacy/settings?tab=consents');
    await admin.getByRole('button', { name: 'Vorlagen einfügen' }).click();
    await expect(admin.getByText('Die Vorlagen wurden eingefügt.')).toBeVisible();
    await expect(row(admin, 'Handynummer in der Telefonliste der Abteilung')).toContainText('geprüft');
    await admin.getByRole('button', { name: 'Einwilligung anlegen' }).click();
    const form = panel(admin, 'Neue Einwilligung');
    await form.getByLabel(/^Schlüssel/).fill(key);
    await form.getByLabel(/^Titel \(Deutsch\)/).fill(title);
    await form.getByLabel(/^Titel \(Englisch\)/).fill(`E2E photos on the website ${stamp}`);
    await form.getByLabel(/^Text der Einwilligung \(Deutsch\)/).fill('Ich bin einverstanden, dass Fotos von mir auf der Website der Feuerwehr erscheinen.');
    await form.getByLabel(/^Text der Einwilligung \(Englisch\)/).fill('I agree that photos of me appear on the website of the fire brigade.');
    await form.getByRole('button', { name: 'Speichern' }).click();
    await expect(admin.getByText('Die Einwilligung wurde gespeichert.')).toBeVisible();
    const editor = panel(admin, `Einwilligung „${title}“`);
    await expect(editor.getByText('Vorlage – mit dem DSB prüfen')).toBeVisible();
    await editor.getByRole('button', { name: 'Als geprüft markieren …' }).click();
    await admin.getByRole('dialog', { name: 'Als geprüft markieren?' }).getByRole('button', { name: 'Als geprüft markieren' }).click();
    await expect(editor.getByText('geprüft', { exact: true })).toBeVisible();
    await expect(row(admin, title)).toContainText('0 Personen');
    // „Erteilt durch“ changes no version: saved, the entry stays reviewed and is not marked as changed.
    await choose(editor, 'Erteilt durch', 'Person, bei Minderjährigen Erziehungsberechtigte');
    const save = editor.getByRole('button', { name: 'Speichern' });
    await save.click();
    await expect(admin.getByText('Die Einwilligung wurde gespeichert.').first()).toBeVisible();
    await expect(row(admin, title)).toContainText('Person, bei Minderjährigen Erziehungsberechtigte');
    await expect(save).toBeDisabled();
    await expect(editor.getByText('geprüft', { exact: true })).toBeVisible();

    // Without consent: no mobile number in the phone list of the department, not on the birthday posting.
    const commander = await login(browser, USERS.commander);
    await preview(commander, 'Telefonliste', 'Telefonliste der Abteilung (Handynummer nur mit Einwilligung)');
    await expect(listed(commander, person)).toContainText('über Gruppenführer');
    const dates = { from: germanDate(), to: germanDate(2) };
    await preview(commander, 'Geburtstage', 'Aushang (nur mit Einwilligung)', dates);
    await expect(commander.getByText(/ · Aushang$/)).toBeVisible();
    await expect(listed(commander, person)).toHaveCount(0);

    // The department commander records the consents given in writing, with the scanned proof.
    const departmentCommander = await login(browser, USERS.departmentCommander);
    await departmentCommander.goto(`/masterdata/persons/${person.id}?tab=privacy`);
    const consents = panel(departmentCommander, 'Einwilligungen');
    await expect(consents.getByText('Keine Einwilligungen erfasst.')).toBeVisible();
    await consents.getByRole('button', { name: 'Einwilligung erfassen …' }).click();
    let dialog = departmentCommander.getByRole('dialog', { name: 'Einwilligung erfassen' });
    await choose(dialog, 'Einwilligung', /^Handynummer in der Telefonliste der Abteilung \(Fassung \d+\)$/);
    await choose(dialog, 'Weg', 'schriftlich');
    await chooseFiles(departmentCommander, 'Nachweis (Scan der Unterschrift)', { name: 'einwilligung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%E2E Einwilligung\n') });
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(departmentCommander.getByText('Die Einwilligung wurde erfasst.')).toBeVisible();
    const mobile = row(consents, 'Handynummer in der Telefonliste der Abteilung');
    await expect(mobile).toContainText(new RegExp(`Fassung \\d+ · schriftlich ${germanDate()}, erfasst von .* · 1 Nachweise`));
    await expect(mobile).toContainText('erteilt');
    await consents.getByRole('button', { name: 'Einwilligung erfassen …' }).click();
    dialog = departmentCommander.getByRole('dialog', { name: 'Einwilligung erfassen' });
    await choose(dialog, 'Einwilligung', /^Geburtstag im Aushang/);
    await choose(dialog, 'Weg', 'persönlich');
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(row(consents, 'Geburtstag im Aushang')).toContainText(`persönlich ${germanDate()}`);

    // With consent: the number in the phone list, the person on the posting.
    await preview(commander, 'Telefonliste', 'Telefonliste der Abteilung (Handynummer nur mit Einwilligung)');
    await expect(listed(commander, person)).toContainText('0151 4242424');
    await preview(commander, 'Geburtstage', 'Aushang (nur mit Einwilligung)', dates);
    await expect(listed(commander, person)).toBeVisible();

    // A member gives and withdraws the new consent in Mein Bereich.
    const member = await login(browser, USERS.member);
    await member.getByRole('link', { name: 'Mein Bereich' }).click();
    const own = member.getByRole('region', { name: 'Datenschutz' }).getByRole('switch', { name: new RegExp(`^${title}`) });
    await expect(own).not.toBeChecked();
    // The switch follows the stored state.
    await own.click();
    await expect(member.getByRole('switch', { name: new RegExp(`^${title} erteilt ${germanDate()}`) })).toBeChecked();
    await own.click();
    await expect(member.getByRole('switch', { name: new RegExp(`^${title} widerrufen ${germanDate()}`) })).not.toBeChecked();

    // A request „Widerruf einer Einwilligung“ is done with the withdrawal.
    await admin.goto(`/masterdata/persons/${person.id}?tab=privacy`);
    await panel(admin, 'Anfragen der Person').getByRole('button', { name: 'Anfrage erfassen …' }).click();
    const request = admin.getByRole('dialog', { name: 'Anfrage erfassen' });
    await choose(request, 'Art', 'Widerruf einer Einwilligung');
    await request.getByLabel('Inhalt der Anfrage').fill('Meine Handynummer bitte nicht mehr auf die Telefonliste.');
    await request.getByRole('button', { name: 'Anfrage anlegen' }).click();
    await panel(admin, 'Anfragen der Person').getByRole('link', { name: 'Widerruf einer Einwilligung' }).click();
    const valid = panel(admin, 'Einwilligungen der Person');
    await row(valid, 'Handynummer in der Telefonliste der Abteilung').getByRole('button', { name: 'Widerruf erfassen …' }).click();
    const withdraw = admin.getByRole('dialog', { name: 'Widerruf erfassen?' });
    await expect(withdraw).toContainText('Die Anfrage wird mit dem Widerruf erledigt.');
    await choose(withdraw, 'Weg', 'E-Mail');
    await withdraw.getByRole('button', { name: 'Widerruf speichern' }).click();
    await expect(admin.getByText('Der Widerruf wurde erfasst.')).toBeVisible();
    await expect(admin.getByText(`erledigt am ${germanDate()}`)).toBeVisible();
    await expect(row(valid, 'Handynummer in der Telefonliste der Abteilung')).toHaveCount(0);

    await preview(commander, 'Telefonliste', 'Telefonliste der Abteilung (Handynummer nur mit Einwilligung)');
    await expect(listed(commander, person)).toContainText('über Gruppenführer');
  } finally {
    if (!admin.isClosed()) {
      await restore('the consent of the test', async () => {
        const current = (await api<{ consents: Consent[] }>(admin, 'GET', 'privacy/consents')).consents.find((c) => c.key === key);
        if (current) await api(admin, 'PUT', `privacy/consents/${key}`, { title: current.title, text: current.text, givenBy: current.givenBy, effects: current.effects, active: false, version: current.version });
      });
    }
  }
});
