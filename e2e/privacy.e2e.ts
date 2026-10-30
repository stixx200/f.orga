import type { Page } from '@playwright/test';
import { ADMIN, api, choose, createPerson, departmentId, download, expect, germanDate, isoDate, linkedFile, login, navigate, panel, restore, row, tasksOf, test, type TestPerson, totpCode, updatePerson, USERS } from './support';

type TextBlock = { text: { de: string; en: string }; version: number; reviewedAt: string | null };
type Consent = { key: string; version: number; title: { de: string; en: string }; text: { de: string; en: string }; givenBy: string; effects: string[]; active: boolean };

/** The text blocks the privacy notice consists of; it is shown at the first sign-in once all of them are reviewed. */
const NOTICE_BLOCKS = ['Datenschutzhinweis: Einleitung', 'Datenschutzhinweis: Daten und Zwecke', 'Rechte der Betroffenen', 'Automatisierte Entscheidung', 'Übermittlung in Drittländer'];

test('privacy notice without sign-in, linked from the login page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Datenschutzhinweis' }).click();
  await expect(page).toHaveURL(/\/privacy-notice$/);
  await expect(page.getByRole('heading', { name: 'Datenschutzhinweis', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Als PDF' })).toBeVisible();
});

test('data protection module: requests, register, read log; security and retention in the core settings', async ({ browser }) => {
  const page = await login(browser, ADMIN.username);
  await page.getByRole('navigation').getByRole('link', { name: 'Datenschutz', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy\/?$/);
  await expect(page.getByRole('heading', { name: 'Datenschutz', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Anfragen' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Verzeichnis' }).click();
  await expect(page).toHaveURL(/\/privacy\/register$/);

  // The read log is a tab of the audit log, contributed by the module.
  await page.goto('/admin/audit');
  await page.getByRole('tab', { name: 'Leseprotokoll' }).click();
  await expect(page.getByText(/^Zugriffe auf Gesundheitsdaten und andere besonders geschützte Daten/)).toBeVisible();

  // Security and retention belong to the core.
  await page.goto('/admin/settings?tab=security');
  await expect(page.getByRole('tab', { name: 'Sicherheit' })).toHaveAttribute('aria-selected', 'true');
});

/**
 * The administrator edits the introduction of the privacy notice and marks all text blocks of the notice as reviewed:
 * a new version without the template note. A member signing in afterwards sees „Bevor Sie beginnen“ with the
 * acknowledgement and the offered consents, gives one of them and acknowledges; the public page `/privacy-notice` shows
 * the new version (older ones selectable) and the PDF. The introduction is restored afterwards, which makes the notice a
 * template again (no longer presented at the sign-in).
 */
test('new version of the privacy notice is acknowledged at the next sign-in', async ({ browser, page: visitor }) => {
  const admin = await login(browser, ADMIN.username);
  const stamp = Date.now();
  const marker = `E2E-Fassung ${stamp}`;
  const texts = await api<Record<string, TextBlock>>(admin, 'GET', 'privacy/texts');
  const original = texts['noticeIntro']!.text;
  const before = (await api<{ version: number }>(admin, 'GET', 'privacy/notice')).version;
  // A consent of this test, offered at the first sign-in.
  const consentKey = `e2e-notice-${stamp}`;
  const consentTitle = `E2E Rundbrief ${stamp}`;
  const created = await api<{ consents: Consent[] }>(admin, 'PUT', `privacy/consents/${consentKey}`, {
    title: { de: consentTitle, en: `E2E newsletter ${stamp}` },
    text: { de: 'Ich bin einverstanden, den Rundbrief der Feuerwehr per E-Mail zu erhalten.', en: 'I agree to receive the newsletter by e-mail.' },
    givenBy: 'person',
  });
  const consent = created.consents.find((c) => c.key === consentKey)!;
  await api(admin, 'POST', `privacy/consents/${consentKey}/review`, { version: consent.version });
  let member: Page | undefined;
  try {
    await admin.goto('/privacy/settings?tab=texts');
    await expect(admin.getByText(/Textbausteine sind Vorlagen/)).toBeVisible();
    await admin.getByRole('button', { name: 'Datenschutzhinweis: Einleitung', exact: true }).click();
    const editor = panel(admin, 'Datenschutzhinweis: Einleitung');
    const german = editor.getByRole('textbox', { name: 'Deutsch' });
    await german.fill(`${original.de}\n\n${marker}`);
    await editor.getByRole('button', { name: 'Speichern' }).click();
    await expect(editor.getByText(`Fassung ${texts['noticeIntro']!.version + 1}, geändert am`)).toBeVisible();
    await expect(editor.getByText('Vorlage – mit dem DSB prüfen')).toBeVisible();

    // All blocks of the notice reviewed: the notice is no longer a template.
    for (const block of NOTICE_BLOCKS) {
      await admin.getByRole('button', { name: block, exact: true }).click();
      const blockPanel = panel(admin, block);
      const review = blockPanel.getByRole('button', { name: 'Als geprüft markieren …' });
      await expect(review).toBeVisible();
      // Blocks reviewed in an earlier run against the same instance stay reviewed.
      if (await blockPanel.getByText('Vorlage – mit dem DSB prüfen').isVisible()) {
        await review.click();
        const dialog = admin.getByRole('dialog', { name: 'Als geprüft markieren?' });
        await expect(dialog).toContainText(`„${block}“`);
        await dialog.getByRole('button', { name: 'Als geprüft markieren' }).click();
        await expect(dialog).toBeHidden();
      }
      await expect(blockPanel.getByText(/^geprüft am .* von Administrator$/)).toBeVisible();
    }
    const notice = await api<{ version: number; template: boolean; versions: unknown[] }>(admin, 'GET', 'privacy/notice');
    expect(notice.template).toBe(false);

    // The member sees the new version before working, with the offered consents.
    member = await login(browser, USERS.member, { acknowledgePrivacyNotice: false });
    await expect(member.getByRole('heading', { name: 'Bevor Sie beginnen', level: 1 })).toBeVisible();
    await expect(member.getByRole('link', { name: 'Datenschutzhinweis lesen' })).toBeVisible();
    await expect(member.getByText('Freiwillige Einwilligungen')).toBeVisible();
    const offered = member.getByRole('switch', { name: new RegExp(`^${consentTitle}`) });
    await expect(offered).not.toBeChecked();
    const go = member.getByRole('button', { name: 'Weiter' });
    await expect(go).toBeDisabled();
    await offered.check();
    await member.getByRole('checkbox', { name: `Datenschutzhinweis (Fassung ${notice.version}) zur Kenntnis genommen` }).check();
    await go.click();
    await expect(member.getByRole('heading', { level: 1 }).filter({ hasText: /Guten (Morgen|Tag|Abend)/ })).toBeVisible();

    // Mein Bereich: the consent given at the first sign-in and the acknowledged version.
    await member.getByRole('link', { name: 'Mein Bereich' }).click();
    const privacy = member.getByRole('region', { name: 'Datenschutz' });
    await expect(privacy.getByRole('switch', { name: new RegExp(`^${consentTitle} erteilt \\d{2}\\.\\d{2}\\.\\d{4}`) })).toBeChecked();
    await expect(privacy.getByText(new RegExp(`Fassung ${notice.version} zur Kenntnis genommen am`))).toBeVisible();

    // The public page shows the new version without the template note; older versions stay selectable.
    await visitor.goto('/privacy-notice');
    await expect(visitor.getByText(new RegExp(`^Fassung ${notice.version} vom `))).toBeVisible();
    await expect(visitor.getByText(marker)).toBeVisible();
    await expect(visitor.getByText('Vorlage – noch nicht mit dem Datenschutzbeauftragten geprüft.')).toHaveCount(0);
    const pdf = await linkedFile(visitor.getByRole('link', { name: 'Als PDF' }));
    expect(pdf.type).toContain('application/pdf');
    expect(pdf.content.subarray(0, 5).toString()).toBe('%PDF-');
    await choose(visitor, 'Fassung', new RegExp(`^Fassung ${before} · `));
    await expect(visitor.getByText(new RegExp(`^Fassung ${before} vom `))).toBeVisible();
    await expect(visitor.getByText(marker)).toHaveCount(0);
  } finally {
    if (!admin.isClosed()) {
      // A changed text is a template again: the notice is no longer presented at the sign-in.
      await restore('the introduction of the privacy notice', async () => {
        const current = (await api<Record<string, TextBlock>>(admin, 'GET', 'privacy/texts'))['noticeIntro']!;
        if (current.text.de !== original.de) await api(admin, 'PUT', 'privacy/texts/noticeIntro', { text: original, version: current.version });
      });
      const signedIn = member;
      if (signedIn && !signedIn.isClosed()) await restore('the consent of the member', () => api(signedIn, 'PUT', `privacy/me/consents/${consentKey}`, { given: false }));
      await restore('the consent of the test', async () => {
        const current = (await api<{ consents: Consent[] }>(admin, 'GET', 'privacy/consents')).consents.find((c) => c.key === consentKey)!;
        await api(admin, 'PUT', `privacy/consents/${consentKey}`, { title: current.title, text: current.text, givenBy: current.givenBy, effects: current.effects, active: false, version: current.version });
      });
    }
  }
});

/**
 * A member asks for access in Mein Bereich. The administrator opens the request from the task, extends the deadline
 * with a reason (and records that the person was told), creates the access report (dialog with the areas and their
 * entries), provides it in Mein Bereich, where the member downloads it; reply letter as PDF, then the request is closed.
 */
test('access request from Mein Bereich up to the provided report', async ({ browser }) => {
  const member = await login(browser, USERS.member);
  const admin = await login(browser, ADMIN.username);
  const { user } = await api<{ user: { personId: string } }>(member, 'GET', 'core/session');
  // Only one open access request at a time: one left open by an earlier run would block this one.
  const closeOpen = async () => {
    const open = await api<{ id: string; kind: string; version: number }[]>(admin, 'GET', `privacy/requests?state=open&personId=${user.personId}`);
    for (const r of open.filter((o) => o.kind === 'access')) await api(admin, 'POST', `privacy/requests/${r.id}/close`, { version: r.version, outcome: 'done', closedOn: isoDate(), reason: '' });
  };
  await closeOpen();
  try {
    await member.getByRole('link', { name: 'Mein Bereich' }).click();
    const privacy = member.getByRole('region', { name: 'Datenschutz' });
    await privacy.getByRole('button', { name: 'Auskunft anfordern …' }).click();
    const ask = member.getByRole('dialog', { name: 'Auskunft anfordern' });
    await expect(ask).toContainText('Ihre Identität gilt durch die Anmeldung als geprüft.');
    await ask.getByRole('button', { name: 'Auskunft anfordern' }).click();
    await expect(member.getByText('Ihre Anfrage ist eingegangen.')).toBeVisible();
    const mine = row(privacy, /^Auskunft.*eingegangen/);
    await expect(mine).toBeVisible();
    const due = /Frist (\d{2}\.\d{2}\.\d{4})/.exec((await mine.textContent()) ?? '')![1]!;
    // Only one open access request at a time.
    await expect(privacy.getByRole('button', { name: 'Auskunft anfordern …' })).toBeDisabled();

    // The deadline is a task of everyone managing data protection, without the name of the person (tasks of the same
    // day are grouped).
    const tasks = await tasksOf(admin, 'Datenschutz');
    await expect(tasks.locator('div').filter({ hasText: 'Datenschutzanfrage beantworten: Auskunft' }).filter({ hasText: `bis ${due}` }).last()).toBeVisible();

    // The open requests on the privacy page.
    const person = await api<{ firstName: string; lastName: string }>(admin, 'GET', `masterdata/persons/${user.personId}`);
    await navigate(admin, 'Datenschutz');
    const request = row(admin, `${person.lastName}, ${person.firstName}`).filter({ hasText: `${germanDate()} · Mein Bereich` }).filter({ hasText: 'eingegangen' });
    await expect(request).toContainText(due);
    await request.getByRole('link', { name: 'Auskunft' }).click();
    await expect(admin.getByRole('heading', { level: 1, name: `Auskunft · ${person.lastName}, ${person.firstName}` })).toBeVisible();
    await expect(admin.getByText('geprüft durch die Anmeldung in Mein Bereich')).toBeVisible();

    // Extend the deadline by one month with a reason; tell the person.
    await admin.getByRole('button', { name: 'Frist verlängern …' }).click();
    const extend = admin.getByRole('dialog', { name: 'Frist verlängern' });
    await extend.getByRole('radio', { name: '1 Monat' }).check();
    await extend.getByLabel(/^Begründung/).fill('Viele Anfragen nach der Datenübernahme (E2E)');
    await extend.getByRole('button', { name: 'Verlängern' }).click();
    await expect(admin.getByText(/^verlängert$/).first()).toBeVisible();
    await expect(admin.getByText(/→ Verlängert bis \d{2}\.\d{2}\.\d{4}: Viele Anfragen nach der Datenübernahme \(E2E\)/)).toBeVisible();
    await expect(admin.getByText(`Warnung: Die Person ist bis ${due} über die Verlängerung zu unterrichten`, { exact: false })).toBeVisible();
    await admin.getByRole('button', { name: 'Als unterrichtet vermerken' }).click();
    await expect(admin.getByText(`Über die Verlängerung unterrichtet am ${germanDate()}.`)).toBeVisible();

    // The access report for the request: the areas with their number of entries.
    const reports = panel(admin, 'Auskunft (Art. 15)');
    await expect(reports.getByText('Zu dieser Anfrage wurde noch keine Auskunft erstellt.')).toBeVisible();
    await reports.getByRole('button', { name: 'Auskunft erstellen …' }).click();
    const create = admin.getByRole('dialog', { name: 'Auskunft nach Art. 15 erstellen' });
    await expect(create.getByRole('combobox', { name: 'Zur Anfrage' })).toHaveValue(new RegExp(`^Auskunft vom ${germanDate()} \\(Mein Bereich\\)`));
    await expect(create.getByRole('row', { name: /^Stammdaten \d+$/ })).toBeVisible();
    await expect(create.getByRole('row', { name: /^Atemschutz Gesundheitsdaten \d+$/ })).toBeVisible();
    await expect(create.getByRole('row', { name: /^Änderungen an Ihren Daten \d+$/ })).toBeVisible();
    await create.getByRole('button', { name: 'Auskunft erstellen' }).click();
    await expect(admin.getByText('Die Auskunft wird erstellt. Sie erscheint im Reiter „Datenschutz“.')).toBeVisible();
    const report = row(reports, germanDate());
    await expect(report.getByText('noch nicht übergeben')).toBeVisible({ timeout: 60_000 });

    // Provided in Mein Bereich; the request stays open for the reply.
    await report.getByRole('button', { name: 'Übergabe vermerken …' }).click();
    const handOver = admin.getByRole('dialog', { name: 'Übergabe vermerken' });
    await handOver.getByRole('radio', { name: 'in Mein Bereich bereitgestellt' }).check();
    await expect(handOver.getByText(/Sie bekommt eine E-Mail, dass sie bereitliegt – ohne Inhalt\./)).toBeVisible();
    await handOver.getByRole('checkbox', { name: 'Anfrage damit erledigt' }).uncheck();
    await handOver.getByRole('button', { name: 'Speichern' }).click();
    await expect(admin.getByText('Übergabe gespeichert.')).toBeVisible();
    await expect(report).toContainText(`in Mein Bereich bereitgestellt ${germanDate()}`);

    // The member downloads the report.
    await member.reload();
    // Newest first (reports of earlier runs against the same instance stay 30 days).
    await expect(member.getByText(new RegExp(`^Ihre Auskunft liegt bereit \\(erstellt ${germanDate()}, bis \\d{2}\\.\\d{2}\\.\\d{4}\\)\\.$`)).first()).toBeVisible();
    const pdf = await download(member, () => member.getByRole('link', { name: 'PDF herunterladen' }).first().click());
    expect(pdf.name).toMatch(/^auskunft-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(pdf.content.subarray(0, 5).toString()).toBe('%PDF-');

    // Reply letter with the text block of the kind, then close.
    const reply = panel(admin, 'Antwortschreiben (PDF)');
    await choose(reply, 'Textbaustein', 'Antwort: Auskunft');
    const letter = await linkedFile(reply.getByRole('link', { name: 'Antwortschreiben (PDF)' }));
    expect(letter.content.subarray(0, 5).toString()).toBe('%PDF-');
    await admin.getByRole('button', { name: 'Abschließen …' }).click();
    const close = admin.getByRole('dialog', { name: 'Anfrage abschließen' });
    await close.getByRole('radio', { name: 'erledigt' }).check();
    await close.getByRole('button', { name: 'Abschließen' }).click();
    await expect(admin.getByText(`erledigt am ${germanDate()}`)).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Wieder öffnen' })).toBeVisible();

    // In Mein Bereich the request is done; a new one is possible again.
    await member.reload();
    await expect(row(privacy, /^Auskunft.*(eingegangen|verlängert)/)).toHaveCount(0);
    await expect(privacy.getByRole('button', { name: 'Auskunft anfordern …' })).toBeEnabled();
  } finally {
    // An open request of the member (e.g. after a failure) would block the next run.
    if (!admin.isClosed()) await restore('the access request of the member', closeOpen);
  }
});

/**
 * The department commander records a wrong nickname for a member. The member asks for a rectification below the
 * section „Meine Daten“ of Mein Bereich; the department commander gets the task, corrects the person file and marks
 * the rectification as corrected. The administrator confirms the session with the second factor and removes the wrong
 * value from the history of the person, with a reason. The nickname is restored afterwards.
 */
test('rectification from Mein Bereich, corrected by the department, value removed from the history', async ({ browser }) => {
  const stamp = Date.now();
  const wrong = `Hansi-${stamp}`;
  const right = `Hannes-${stamp}`;
  const member = await login(browser, USERS.member);
  const departmentCommander = await login(browser, USERS.departmentCommander);
  const { user } = await api<{ user: { personId: string } }>(member, 'GET', 'core/session');
  const before = await api<{ nickname: string; firstName: string; lastName: string }>(departmentCommander, 'GET', `masterdata/persons/${user.personId}`);
  // Pages of the data protection name persons „Nachname, Vorname“.
  const personName = `${before.lastName}, ${before.firstName}`;
  // The tasks name only the day of the request: a rectification of the member left open by an earlier run is closed.
  const manager = await login(browser, ADMIN.username);
  const closeOpen = async () => {
    const open = await api<{ id: string; kind: string; version: number }[]>(manager, 'GET', `privacy/requests?state=open&personId=${user.personId}`);
    for (const r of open.filter((o) => o.kind === 'rectification')) await api(manager, 'POST', `privacy/requests/${r.id}/close`, { version: r.version, outcome: 'done', closedOn: isoDate(), reason: '' });
  };
  await closeOpen();
  let requestId: string | undefined;
  try {
    // The wrong value in the person file.
    await departmentCommander.goto(`/masterdata/persons/${user.personId}`);
    await departmentCommander.getByLabel('Rufname').fill(wrong);
    await departmentCommander.getByRole('button', { name: 'Speichern' }).click();
    await expect(departmentCommander.getByText('Alle Änderungen gespeichert')).toBeVisible();

    // The member asks for the rectification below the section of the master data.
    await member.getByRole('link', { name: 'Mein Bereich' }).click();
    await member.getByRole('region', { name: 'Meine Daten' }).getByRole('button', { name: 'Berichtigung beantragen …' }).click();
    const ask = member.getByRole('dialog', { name: 'Berichtigung beantragen' });
    await expect(ask.getByRole('combobox', { name: 'Bereich' })).toHaveValue('Meine Daten');
    await expect(ask.getByText('Bitte keine Kopie des Führerscheins.', { exact: false })).toBeVisible();
    await ask.getByLabel(/^Was ist falsch\?/).fill(`Rufname „${wrong}“`);
    await ask.getByLabel(/^Wie ist es richtig\?/).fill(`Rufname „${right}“`);
    await ask.getByRole('button', { name: 'Antrag senden' }).click();
    await expect(member.getByText('Ihr Antrag auf Berichtigung ist eingegangen.')).toBeVisible();
    await expect(row(member.getByRole('region', { name: 'Datenschutz' }), `Berichtigung: Rufname „${wrong}“ (Stammdaten)`)).toContainText('eingegangen');

    // The task of the department: check, correct, mark as corrected.
    const tasks = await tasksOf(departmentCommander, 'Datenschutz');
    await tasks.getByRole('link', { name: new RegExp(`Berichtigung prüfen: Stammdaten ${germanDate()} · `) }).click();
    await expect(departmentCommander.getByRole('heading', { name: 'Berichtigung prüfen', level: 1 })).toBeVisible();
    requestId = /\/privacy\/rectifications\/([^/?]+)/.exec(departmentCommander.url())![1];
    await expect(departmentCommander.getByText(`Rufname „${wrong}“`)).toBeVisible();
    await expect(departmentCommander.getByText('noch nicht berichtigt')).toBeVisible();
    await departmentCommander.getByRole('link', { name: personName }).click();
    await departmentCommander.getByLabel('Rufname').fill(right);
    await departmentCommander.getByRole('button', { name: 'Speichern' }).click();
    await expect(departmentCommander.getByText('Alle Änderungen gespeichert')).toBeVisible();
    await departmentCommander.goBack();
    await departmentCommander.getByRole('button', { name: 'Als berichtigt vermerken' }).click();
    await expect(departmentCommander.getByText('Die Berichtigung wurde vermerkt.')).toBeVisible();
    await expect(departmentCommander.getByText(/^Erledigt: Die Aufgabe ist abgeschlossen\./)).toBeVisible();
    await expect(departmentCommander.getByText(/^berichtigt am \d{2}\.\d{2}\.\d{4} von /)).toBeVisible();

    // The administrator removes the wrong value from the history; the button needs the second factor.
    const admin = await login(browser, ADMIN.username, { stepUp: false });
    await admin.goto(`/masterdata/persons/${user.personId}?tab=history`);
    const changed = admin.getByText(`Rufname: ${wrong} → ${right}`);
    await expect(changed).toBeVisible();
    await expect(changed.getByRole('button', { name: 'Unkenntlich machen …' })).toHaveCount(0);
    await admin.getByRole('button', { name: 'Sensible Daten anzeigen …' }).click();
    const stepUp = admin.getByRole('dialog', { name: 'Bitte bestätigen Sie mit Ihrem Code' });
    await stepUp.getByLabel(/^Sechsstelliger Code aus der App/).fill(await totpCode(ADMIN.username));
    await stepUp.getByRole('button', { name: 'Bestätigen' }).click();
    await expect(stepUp).toBeHidden();
    await changed.getByRole('button', { name: 'Unkenntlich machen …' }).click();
    const redact = admin.getByRole('dialog', { name: 'Wert in der Historie unkenntlich machen' });
    await redact.getByRole('radio', { name: `Alter Wert: ${wrong}` }).check();
    const unlock = redact.getByRole('button', { name: 'Unkenntlich machen' });
    await redact.getByLabel(/^Grund/).fill('zu kurz');
    await expect(unlock).toBeDisabled();
    await redact.getByLabel(/^Grund/).fill('Rufname nachweislich falsch erfasst (Berichtigung)');
    await unlock.click();
    await expect(admin.getByText('Der Wert wurde entfernt.')).toBeVisible();
    await expect(admin.getByText(`Rufname: berichtigt, Wert entfernt am ${germanDate()} → ${right}`)).toBeVisible();
    await expect(admin.getByText(`Rufname: ${wrong} → ${right}`)).toHaveCount(0);

    // The request keeps the rectification with who corrected it.
    await admin.goto(`/privacy/requests/${requestId}`);
    await expect(admin.getByRole('heading', { level: 1, name: /^Berichtigung · / })).toBeVisible();
    await expect(admin.getByText(/^berichtigt am \d{2}\.\d{2}\.\d{4} von /)).toBeVisible();
  } finally {
    await restore('the nickname of the member', () => updatePerson(departmentCommander, user.personId, { nickname: before.nickname }));
    await restore('the rectification request', closeOpen);
  }
});

/** Closes the open request of the request page as done (the deadline task ends). */
async function closeRequest(page: Page) {
  await page.getByRole('button', { name: 'Abschließen …' }).click();
  await page.getByRole('dialog', { name: 'Anfrage abschließen' }).getByRole('button', { name: 'Abschließen' }).click();
  await expect(page.getByText(`erledigt am ${germanDate()}`)).toBeVisible();
}

/** Finds a person by name in the person list and in the global search of the header (as far as the user sees it). */
async function searchPerson(page: Page, person: TestPerson) {
  await page.goto('/masterdata/persons');
  await choose(page, 'Abteilung', 'Abteilung Musterstadt');
  await page.getByRole('searchbox', { name: 'Suche' }).fill(person.lastName);
  const listed = row(page, `${person.lastName}, ${person.firstName}`);
  await page.getByRole('textbox', { name: 'Personen, Fahrzeuge, Einsätze suchen' }).fill(person.lastName);
  const found = page.getByRole('option', { name: new RegExp(person.lastName) });
  return { listed, found };
}

/**
 * The administrator restricts the processing of a person (Art. 18): the commander no longer finds it in the person list
 * and the search and cannot open its file; the file of the administrator shows the badge, the privacy page lists the
 * person. After lifting the restriction the commander finds the person again. Saving the employer before keeps the
 * person file saved when the restriction reloads it.
 */
test('restriction of processing hides a person until it is lifted', async ({ browser }) => {
  const admin = await login(browser, ADMIN.username);
  const commander = await login(browser, USERS.commander);
  const person = await createPerson(admin, `Einschraenkung${Date.now()}`, {
    phoneMobile: '0151 0000000',
    employer: { name: 'Muster Logistik GmbH', street: 'Industriestraße 4', postalCode: '12345', city: 'Musterstadt', phone: '', contact: '', iban: '', lossOfEarningsAssignedFrom: null },
  });

  let search = await searchPerson(commander, person);
  await expect(search.listed).toBeVisible();
  await expect(search.found).toBeVisible();

  // The person file: save the employer, then restrict in the tab „Datenschutz“.
  await admin.goto(`/masterdata/persons/${person.id}`);
  await admin.getByLabel('Firma').fill('Muster Logistik GmbH & Co. KG');
  await admin.getByRole('button', { name: 'Speichern' }).click();
  await expect(admin.getByText('Alle Änderungen gespeichert')).toBeVisible();
  await admin.getByRole('tab', { name: 'Datenschutz' }).click();
  const info = panel(admin, 'Information und Einschränkung');
  await expect(info).toContainText('nicht eingeschränkt');
  await info.getByRole('button', { name: 'Verarbeitung einschränken …' }).click();
  const restrict = admin.getByRole('dialog', { name: 'Verarbeitung einschränken?' });
  await expect(restrict).toContainText(`${person.name} erscheint danach nicht mehr in Listen, Suche`);
  await choose(restrict, 'Grund', 'Richtigkeit bestritten (Art. 18 Abs. 1 a)');
  await restrict.getByRole('button', { name: 'Einschränken' }).click();
  await expect(admin.getByText('Verarbeitung eingeschränkt.')).toBeVisible();
  await expect(info).toContainText(`eingeschränkt seit ${germanDate()}: Richtigkeit bestritten (Art. 18 Abs. 1 a)`);
  await expect(admin.getByRole('status').filter({ hasText: 'Die Verarbeitung der Daten dieser Person ist eingeschränkt (Art. 18 DSGVO).' })).toBeVisible();
  // The reloaded person file is still saved.
  await admin.getByRole('tab', { name: 'Stammdaten' }).click();
  await expect(admin.getByLabel('Firma')).toHaveValue('Muster Logistik GmbH & Co. KG');
  await expect(admin.getByText('Alle Änderungen gespeichert')).toBeVisible();

  // The commander no longer finds the person.
  search = await searchPerson(commander, person);
  await expect(commander.getByText('Keine Personen gefunden.')).toBeVisible();
  await expect(search.listed).toHaveCount(0);
  await expect(search.found).toHaveCount(0);
  await commander.goto(`/masterdata/persons/${person.id}`);
  await expect(commander.getByText('Nur wer Datenschutz verwaltet, kann die Personalakte öffnen.', { exact: false })).toBeVisible();

  // The privacy page lists the restricted person.
  await admin.goto('/privacy');
  const restricted = row(panel(admin, 'Eingeschränkte Personen'), `${person.lastName}, ${person.firstName}`);
  await expect(restricted).toContainText('Richtigkeit bestritten');
  await restricted.getByRole('link').click();
  await expect(admin).toHaveURL(new RegExp(`/masterdata/persons/${person.id}\\?tab=privacy`));
  await panel(admin, 'Information und Einschränkung').getByRole('button', { name: 'Einschränkung aufheben …' }).click();
  const lift = admin.getByRole('dialog', { name: 'Einschränkung aufheben?' });
  await expect(lift).toContainText('Unterrichten Sie die Person vorher (Art. 18 Abs. 3).');
  await lift.getByRole('button', { name: 'Aufheben' }).click();
  await expect(admin.getByText('Einschränkung aufgehoben.')).toBeVisible();
  await expect(panel(admin, 'Information und Einschränkung')).toContainText('nicht eingeschränkt');

  search = await searchPerson(commander, person);
  await expect(search.listed).toBeVisible();
  await expect(search.found).toBeVisible();
});

/**
 * An objection against the phone list, referring to the activity „Personalverwaltung“ of the register: recorded with
 * restriction until the decision, rejected with a reason (reply letter „Ablehnung“), the restriction lifted.
 */
test('objection referring to a processing activity, restricted until the decision', async ({ browser }) => {
  const admin = await login(browser, ADMIN.username);
  const person = await createPerson(admin, `Widerspruch${Date.now()}`);
  await admin.goto('/privacy');
  await admin.getByRole('button', { name: 'Anfrage erfassen …' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Anfrage erfassen' });
  await choose(dialog, 'Person', `${person.lastName}, ${person.firstName}`);
  await choose(dialog, 'Art', 'Widerspruch');
  await expect(dialog.getByRole('textbox', { name: 'Frist' })).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await choose(dialog, 'Verarbeitungstätigkeit', 'Personalverwaltung');
  await dialog.getByLabel('Bezug genauer').fill('Telefonliste der Abteilung');
  await dialog.getByLabel('Inhalt der Anfrage').fill('Meine Handynummer soll nicht auf der Telefonliste stehen.');
  await dialog.getByRole('checkbox', { name: 'Identität geprüft' }).check();
  await dialog.getByLabel('Wie geprüft').fill('persönlich, Ausweis');
  await dialog.getByRole('checkbox', { name: 'Verarbeitung bis zur Entscheidung einschränken' }).check();
  await dialog.getByRole('button', { name: 'Anfrage anlegen' }).click();
  await expect(admin.getByText('Anfrage angelegt.')).toBeVisible();

  await expect(admin.getByRole('heading', { level: 1, name: `Widerspruch · ${person.lastName}, ${person.firstName}` })).toBeVisible();
  await expect(admin.getByText('Personalverwaltung: Telefonliste der Abteilung')).toBeVisible();
  await expect(admin.getByText('geprüft – persönlich, Ausweis')).toBeVisible();
  const restriction = panel(admin, 'Einschränkung der Verarbeitung');
  await expect(restriction).toContainText(`eingeschränkt seit ${germanDate()}: Widerspruch wird geprüft (Art. 18 Abs. 1 d)`);

  // Rejected with a reason; the reply letter uses the text block of the rejection.
  await admin.getByRole('button', { name: 'Abschließen …' }).click();
  const close = admin.getByRole('dialog', { name: 'Anfrage abschließen' });
  await close.getByRole('radio', { name: 'abgelehnt' }).check();
  const submit = close.getByRole('button', { name: 'Abschließen' });
  await expect(submit).toBeDisabled();
  await close.getByLabel(/^Begründung der Ablehnung/).fill('Die Erreichbarkeit der Einsatzkräfte gehört zur Aufgabe der Feuerwehr.');
  await submit.click();
  await expect(admin.getByText(`abgelehnt am ${germanDate()} – Die Erreichbarkeit der Einsatzkräfte gehört zur Aufgabe der Feuerwehr.`)).toBeVisible();
  const reply = panel(admin, 'Antwortschreiben (PDF)');
  await expect(reply.getByRole('combobox', { name: 'Textbaustein' })).toHaveValue('Antwort: Ablehnung');
  expect((await linkedFile(reply.getByRole('link', { name: 'Antwortschreiben (PDF)' }))).content.subarray(0, 5).toString()).toBe('%PDF-');

  await restriction.getByRole('button', { name: 'Einschränkung aufheben …' }).click();
  await admin.getByRole('dialog', { name: 'Einschränkung aufheben?' }).getByRole('button', { name: 'Aufheben' }).click();
  await expect(restriction).toContainText('nicht eingeschränkt');
});

/**
 * A person who left asks for erasure. The erasure check lists per area what is deleted, anonymised or kept until the end
 * of its period; the execution needs the name of the person as confirmation, the rest stays restricted.
 */
test('erasure request with erasure check and execution', async ({ browser }) => {
  const admin = await login(browser, ADMIN.username);
  const person = await createPerson(admin, `Loeschung${Date.now()}`, { phoneMobile: '0151 9999999', street: 'Am Bach 3', postalCode: '12345', city: 'Musterstadt' });
  await admin.goto(`/masterdata/persons/${person.id}?tab=brigade`);
  await admin.getByRole('button', { name: 'Austritt erfassen …' }).click();
  await choose(admin, 'Grund', 'Auf eigenen Wunsch');
  await admin.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(admin.getByText('ausgeschieden').first()).toBeVisible();

  // The request from the tab „Datenschutz“ of the person file.
  await admin.getByRole('tab', { name: 'Datenschutz' }).click();
  const requests = panel(admin, 'Anfragen der Person');
  await requests.getByRole('button', { name: 'Anfrage erfassen …' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Anfrage erfassen' });
  await choose(dialog, 'Art', 'Löschung');
  await dialog.getByLabel('Inhalt der Anfrage').fill('Bitte löschen Sie meine Daten nach meinem Austritt.');
  await dialog.getByRole('button', { name: 'Anfrage anlegen' }).click();
  await requests.getByRole('link', { name: 'Löschung' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: `Löschung · ${person.lastName}, ${person.firstName}` })).toBeVisible();

  // The erasure check: contact data may go, the core data is kept (no period set), the request anonymised.
  const check = panel(admin, 'Löschprüfung');
  await expect(check.getByRole('row', { name: /^Stammdaten Kontakt, Geburtsdatum.* löschen –$/ })).toBeVisible();
  await expect(check.getByRole('row', { name: /^Grunddaten Name, Personalnummer.* einschränken Grunddaten Ausgeschiedener: / })).toBeVisible();
  await expect(check.getByRole('row', { name: /^Datenschutz 1 Anfrage anonymisieren / })).toBeVisible();
  await expect(check.getByText('Teile bleiben eingeschränkt gespeichert.', { exact: false })).toBeVisible();
  await check.getByRole('button', { name: 'Ausführen …' }).click();
  const execute = admin.getByRole('dialog', { name: 'Löschung ausführen?' });
  await expect(execute).toContainText(`Für ${person.name} werden`);
  const confirm = execute.getByRole('button', { name: 'Löschung ausführen' });
  await execute.getByLabel(/^Zur Bestätigung den Namen eingeben/).fill('Max Mustermann');
  await expect(confirm).toBeDisabled();
  await execute.getByLabel(/^Zur Bestätigung den Namen eingeben/).fill(person.name.toLowerCase());
  await confirm.click();
  await expect(check.getByText(/^Löschung ausgeführt am \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}: \d+ Bereiche gelöscht, \d+ anonymisiert, \d+ eingeschränkt\. Verarbeitung eingeschränkt/)).toBeVisible();
  await expect(check.getByRole('button', { name: 'Ausführen …' })).toHaveCount(0);
  await expect(panel(admin, 'Einschränkung der Verarbeitung')).toContainText('Löschung abgelehnt, Aufbewahrungsfrist läuft');
  // The contact data is gone.
  const stored = await api<{ phoneMobile: string; street: string }>(admin, 'GET', `masterdata/persons/${person.id}`);
  expect(stored.phoneMobile).toBe('');
  expect(stored.street).toBe('');
  // The reply letter follows; the request is closed.
  await closeRequest(admin);
});

/**
 * Data of a person involved in an incident (not in the master data): a request for access finds the incident through
 * the search over the modules and creates the access report; a request for erasure removes name and address there.
 */
test('access and erasure for a person involved in an incident', async ({ browser }) => {
  const commander = await login(browser, USERS.commander);
  const stamp = Date.now();
  const name = `Gerda Beispiel-${stamp}`;
  const incident = await api<{ id: string; reports: { id: string }[] }>(commander, 'POST', 'incidents/incidents', {
    dispatchNumber: `E2E-DS-${stamp}`,
    alarmKeyword: 'TH1',
    alarmMessage: 'Verkehrsunfall, E2E',
    alarmedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    location: { street: 'Feldweg', houseNumber: '7', city: 'Musterstadt', district: '' },
    departmentIds: [await departmentId(commander, 'Abteilung Musterstadt')],
  });
  const report = await api<{ version: number; times: Record<string, unknown> }>(commander, 'GET', `incidents/reports/${incident.reports[0]!.id}`);
  await api(commander, 'PUT', `incidents/reports/${incident.reports[0]!.id}`, {
    version: report.version,
    times: report.times,
    endConfirmed: true,
    involvedParties: [{ role: 'injured-party', name, street: 'Lindenweg 2', postalCode: '12345', city: 'Musterstadt', phone: '0170 1234567', licensePlate: 'MU-E 2026' }],
  });

  const admin = await login(browser, ADMIN.username);
  const record = async (kind: 'Auskunft' | 'Löschung') => {
    await admin.goto('/privacy');
    await admin.getByRole('button', { name: 'Anfrage erfassen …' }).click();
    const dialog = admin.getByRole('dialog', { name: 'Anfrage erfassen' });
    await dialog.getByText('andere Person (nicht in den Stammdaten)').click();
    await dialog.getByLabel(/^Name/).fill(name);
    await dialog.getByLabel('Wo kommt die Person vor?').fill(`Geschädigte, Einsatz E2E-DS-${stamp}`);
    await choose(dialog, 'Art', kind);
    await dialog.getByRole('button', { name: 'Anfrage anlegen' }).click();
    await expect(admin.getByRole('heading', { level: 1, name: `${kind} · ${name} (andere Person)` })).toBeVisible();
    // The search over the modules starts with the name of the request.
    const places = panel(admin, 'Daten der Person in den Modulen');
    await expect(places.getByRole('searchbox', { name: 'Name, Anschrift oder Kennzeichen' })).toHaveValue(name);
    const hit = row(places, `E2E-DS-${stamp}`);
    await expect(hit).toContainText(`${name}, Lindenweg 2`);
    await hit.getByRole('checkbox').check();
    await expect(places.getByText('1 Fundstelle ausgewählt')).toBeVisible();
    return places;
  };

  // Access: the report about the places, without other persons.
  let places = await record('Auskunft');
  await places.getByRole('button', { name: 'Auskunft erstellen' }).click();
  await expect(admin.getByText('Die Auskunft wird erstellt.', { exact: false }).first()).toBeVisible();
  await expect(panel(admin, 'Auskünfte zu dieser Anfrage').getByText('noch nicht übergeben')).toBeVisible({ timeout: 60_000 });
  await closeRequest(admin);

  // Erasure: name, address, phone and licence plate are removed at the place.
  places = await record('Löschung');
  await places.getByRole('button', { name: 'Löschen …' }).click();
  const erase = admin.getByRole('dialog', { name: 'Daten der Person löschen' });
  await erase.getByLabel(/^Grund/).fill(`Löschantrag vom ${germanDate()} (E2E)`);
  await erase.getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(row(erase, `E2E-DS-${stamp}`)).toContainText('anonymisiert');
  await erase.getByRole('button', { name: 'Schließen' }).click();
  await places.getByRole('searchbox', { name: 'Name, Anschrift oder Kennzeichen' }).fill(`${name} `);
  await expect(places.getByText('Keine Fundstellen')).toBeVisible();
  await closeRequest(admin);
});

/**
 * Transparency: the commander opens a person file with its sensitive fields, the read log (tab of the audit log) shows
 * the access; the administrator logs in as the member, who sees it under „Anmeldungen als Sie“ in the profile.
 */
test('read log of a sensitive person file; logins as the member in the profile', async ({ browser }) => {
  const admin = await login(browser, ADMIN.username);
  const commander = await login(browser, USERS.commander);
  const person = await createPerson(admin, `Leseprotokoll${Date.now()}`, { birthDate: '1990-05-17' });
  const { user } = await api<{ user: { displayName: string } }>(commander, 'GET', 'core/session');

  await commander.goto(`/masterdata/persons/${person.id}`);
  await expect(commander.getByLabel('Geburtsdatum')).toHaveValue(/1990|17\.05\.1990/);

  await admin.goto('/admin/audit');
  await admin.getByRole('tab', { name: 'Leseprotokoll' }).click();
  await choose(admin, 'Person', `${person.lastName}, ${person.firstName}`);
  const entry = row(admin, 'Personalakte mit sensiblen Feldern');
  await expect(entry).toContainText(user.displayName);
  await expect(entry).toContainText(`${person.lastName}, ${person.firstName}`);
  await expect(entry).toContainText(germanDate());

  // „Anmelden als“ the member with a reason.
  const reason = `Ansicht in Mein Bereich prüfen (E2E ${Date.now()})`;
  await admin.goto('/admin/users');
  await admin.getByRole('cell', { name: USERS.member, exact: true }).click();
  await admin.getByRole('button', { name: 'Anmelden als …' }).click();
  await admin.getByRole('dialog').getByLabel(/^Grund/).fill(reason);
  await admin.getByRole('dialog').getByRole('button', { name: 'Anmelden als' }).click();
  await expect(admin.getByText(/Sie sind als .* \(Mitglied\) angemeldet \(Impersonation durch Administrator/)).toBeVisible();
  await admin.getByRole('button', { name: 'Zurück zu meinem Konto' }).click();
  await expect(admin.getByText(/Impersonation durch/)).toHaveCount(0);

  const member = await login(browser, USERS.member);
  await member.goto('/profile');
  const logins = row(panel(member, 'Anmeldungen als Sie'), reason);
  await expect(logins).toContainText('Administrator');
  await expect(logins).toContainText(new RegExp(`${germanDate()}, \\d{2}:\\d{2}–\\d{2}:\\d{2}`));
});
