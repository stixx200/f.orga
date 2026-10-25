import { type Browser, expect, type Page } from '@playwright/test';

/** Password of the users created by `npm run seed`, one per standard role. */
export const PASSWORD = process.env['FORGA_SEED_PASSWORD'] ?? 'demo-passwort-2026';

/** Opens a new browser context and logs the user in; returns the page on the start page. */
export async function login(browser: Browser, username: string, password = PASSWORD): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Benutzername').fill(username);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Guten (Morgen|Tag|Abend)/);
  return page;
}

/** A field label as exact match; required fields carry an asterisk in their accessible name. */
const fieldLabel = (label: string | RegExp) => (typeof label === 'string' ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\*)?$`) : label);

/** Chooses an option of a Mantine select by its label and the text of the option. */
/** The select with this label (not e.g. a tab panel labelled like it). */
const selectField = (page: Page, label: string | RegExp) =>
  page.getByRole('combobox', { name: fieldLabel(label) }).or(page.getByRole('textbox', { name: fieldLabel(label) })).first();

export async function choose(page: Page, label: string | RegExp, option: string | RegExp): Promise<void> {
  await selectField(page, label).click();
  await page.getByRole('option', { name: option }).first().click();
}

/** Picks the first offered option of a select. */
export async function chooseFirst(page: Page, label: string | RegExp): Promise<void> {
  await selectField(page, label).click();
  await page.getByRole('option').first().click();
}

/** Opens a section of the report editor by its title. */
export async function section(page: Page, title: string): Promise<void> {
  await page.getByRole('list', { name: 'Abschnitte des Berichts' }).getByRole('button', { name: new RegExp(title) }).click();
}

/** The table row that contains the text, e.g. a dispatch number. */
export const row = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
