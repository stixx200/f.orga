import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  await confirmStepUp(page, username, password);
  return page;
}

/** Secrets of the second factor of the demo users (`npm run seed` writes the administrator's). */
const TOTP_FILE = 'tmp/seed-totp.json';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function totpCode(secret: string, at = Date.now()): string {
  let bits = '';
  for (const char of secret.replace(/[\s=]/g, '').toUpperCase()) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

function secrets(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(TOTP_FILE, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Users with sensitive permissions confirm their session with the second factor (step-up), as the tests are about
 * other features: through the API of the page's session, setting up the factor on first use (secret kept in
 * `tmp/seed-totp.json`).
 */
async function confirmStepUp(page: Page, username: string, password: string): Promise<void> {
  const headers = { 'x-forga': '1' };
  const session = (await (await page.request.get('/api/core/session')).json()) as { stepUpPermissions: string[]; mfa: { enrolled: boolean } };
  if (!session.stepUpPermissions.length) return;
  let secret = secrets()[username];
  if (!session.mfa.enrolled) {
    secret = ((await (await page.request.post('/api/core/mfa/enrolment', { headers, data: { password } })).json()) as { secret: string }).secret;
    mkdirSync('tmp', { recursive: true });
    writeFileSync(TOTP_FILE, JSON.stringify({ ...secrets(), [username]: secret }, null, 2));
    expect((await page.request.post('/api/core/mfa/enrolment/confirm', { headers, data: { code: totpCode(secret) } })).ok()).toBe(true);
    return;
  }
  if (!secret) throw new Error(`Second factor of ${username} unknown: missing in ${TOTP_FILE}.`);
  for (let attempt = 0; ; attempt++) {
    const response = await page.request.post('/api/core/step-up', { headers, data: { code: totpCode(secret) } });
    if (response.ok()) return;
    // A code counts only once: wait for the next one.
    if (attempt > 0) throw new Error(`Step-up of ${username} failed: ${response.status()}`);
    await page.waitForTimeout(31_000);
  }
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
