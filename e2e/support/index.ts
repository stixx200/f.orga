import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { type APIResponse, type Browser, type BrowserContext, type Download, expect, type FileChooser, type Locator, type Page, test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** Browser contexts opened by `login` and `openTerminal` in the running test; closed after it. */
const contexts = new Set<BrowserContext>();

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.add(context);
  return context.newPage();
}

/** `test` of Playwright that closes the browser contexts of `login` and `openTerminal` after each test. */
export const test = base.extend<{ closeContexts: void }>({
  closeContexts: [
    // Depends on the browser, whose contexts it closes.
    async ({ browser: _browser }, use) => {
      await use();
      await Promise.all([...contexts].map((context) => context.close()));
      contexts.clear();
    },
    { auto: true },
  ],
});

// ----- Users of the demo data -----------------------------------------------------------------------------------------

/** The administrator created by the initial setup of `pnpm run seed`. */
export const ADMIN = { username: process.env['FORGA_ADMIN_USER'] ?? 'admin', password: process.env['FORGA_ADMIN_PASSWORD'] ?? 'sehr-geheim-123' };

/** Password of the users created by `pnpm run seed`, one per standard role. */
export const PASSWORD = process.env['FORGA_SEED_PASSWORD'] ?? 'demo-passwort-2026';

/**
 * Usernames of the demo users: one per standard role, named like the role's template key. Department roles
 * (department commander, group leader, member) apply to Abteilung Musterstadt.
 */
export const USERS = {
  admin: ADMIN.username,
  commander: 'commander',
  departmentCommander: 'department-commander',
  groupLeader: 'group-leader',
  courseCoordinator: 'course-coordinator',
  breathingApparatusOfficer: 'breathing-apparatus-officer',
  equipmentOfficer: 'equipment-officer',
  clothingOfficer: 'clothing-officer',
  dutyOfficer: 'duty-officer',
  administration: 'administration',
  member: 'member',
} as const;

export interface LoginOptions {
  password?: string;
  /** Confirms the session with the second factor when the user has sensitive permissions (default `true`). */
  stepUp?: boolean;
  /** Acknowledges the privacy notice when it is due at the first sign-in (default `true`). */
  acknowledgePrivacyNotice?: boolean;
}

/**
 * Opens a new browser context and logs the user in; returns the page on the start page. The administrator's password
 * is known; all other users have the seed password.
 *
 * Retries briefly on lockout or intermittent wrong-password responses.
 */
export async function login(browser: Browser, username: string, options: LoginOptions | string = {}): Promise<Page> {
  const { password = username === ADMIN.username ? ADMIN.password : PASSWORD, stepUp: confirm = true, acknowledgePrivacyNotice = true } =
    typeof options === 'string' ? { password: options } : options;
  const page = await newPage(browser);
  const greeting = page.getByRole('heading', { level: 1 }).filter({ hasText: /Guten (Morgen|Tag|Abend)/ });
  const notice = page.getByRole('heading', { name: 'Bevor Sie beginnen', level: 1 });
  const locked = page.getByText('Zu viele Fehlversuche', { exact: false });
  const wrong = page.getByText('Benutzername oder Passwort ist falsch.');

  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto('/');
    const userField = page.getByLabel('Benutzername');
    const passField = page.getByLabel('Passwort');
    await userField.fill(username);
    await passField.fill(password);
    await expect(userField).toHaveValue(username);
    await expect(passField).toHaveValue(password);
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(greeting.or(notice).or(locked).or(wrong)).toBeVisible();
    if (await locked.isVisible()) {
      await page.waitForTimeout(65_000);
      continue;
    }
    if (await wrong.isVisible()) {
      await page.waitForTimeout(1_000);
      continue;
    }
    if (acknowledgePrivacyNotice && (await notice.isVisible())) {
      await page.getByRole('checkbox', { name: /Datenschutzhinweis \(Fassung \d+\) zur Kenntnis genommen/ }).check();
      await page.getByRole('button', { name: 'Weiter' }).click();
      await expect(greeting).toBeVisible();
    }
    if (confirm) await stepUp(page, username, password);
    return page;
  }
  throw new Error(`login failed for ${username} after retries`);
}

// ----- Second factor (step-up) ----------------------------------------------------------------------------------------

/** Secrets of the second factor of the demo users; `pnpm run seed` writes the administrator's, `login` the others. */
const ROOT = resolve(__dirname, '../..');
// Relative paths (e.g. `dist/e2e/totp.json` on Agents) are relative to the repository, not to the project running the test.
const TOTP_FILE = resolve(ROOT, process.env['FORGA_TOTP_FILE'] ?? 'tmp/seed-totp.json');
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_MS = 30_000;
const CSRF = { 'x-forga': '1' };

function hotp(secret: string, step: number): string {
  let bits = '';
  for (const char of secret.replace(/[\s=]/g, '').toUpperCase()) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
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
 * Keeps the secret of a second factor set up through the interface (e.g. read from the enrolment dialog), so
 * `totpCode` and `stepUp` work for this user as well.
 */
export function rememberTotpSecret(username: string, secret: string): void {
  mkdirSync(dirname(TOTP_FILE), { recursive: true });
  writeFileSync(TOTP_FILE, JSON.stringify({ ...secrets(), [username]: secret.replace(/\s/g, '') }, null, 2));
}

/**
 * Last time step used per user, shared across Playwright processes (each `nx e2e <project>` is its own process).
 * The server accepts each code only once, and the next one up to a step early.
 */
const USED_FILE = process.env['FORGA_TOTP_USED_FILE'] ? resolve(ROOT, process.env['FORGA_TOTP_USED_FILE']) : join(dirname(TOTP_FILE), 'totp-used.json');

function usedSteps(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(USED_FILE, 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
}

function rememberUsedStep(username: string, step: number): void {
  const used = usedSteps();
  used[username] = Math.max(used[username] ?? -1, step);
  mkdirSync(dirname(USED_FILE), { recursive: true });
  const tmp = `${USED_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(used));
  renameSync(tmp, USED_FILE);
}

/**
 * The next unused TOTP code of a demo user whose factor is set up (e.g. to type it into the step-up dialog).
 * Waits for the next time step only when the current and the next one are used already.
 */
export async function totpCode(username: string): Promise<string> {
  const secret = secrets()[username];
  if (!secret) throw new Error(`Second factor of ${username} unknown: missing in ${TOTP_FILE}.`);
  const current = Math.floor(Date.now() / PERIOD_MS);
  const step = Math.max(current, (usedSteps()[username] ?? -1) + 1);
  // The server accepts one step ahead: wait until the step is at most one ahead of the clock.
  if (step > current + 1) await new Promise((r) => setTimeout(r, (step - 1) * PERIOD_MS - Date.now() + 100));
  rememberUsedStep(username, step);
  return hotp(secret, step);
}

/**
 * Confirms the session of the page with the second factor (step-up) through the API when the user has sensitive
 * permissions, setting the factor up on first use (secret kept in `FORGA_TOTP_FILE`).
 */
export async function stepUp(page: Page, username: string, password = username === ADMIN.username ? ADMIN.password : PASSWORD): Promise<void> {
  const session = (await (await page.request.get('/api/core/session')).json()) as { stepUpPermissions: string[]; mfa: { enrolled: boolean } };
  if (!session.stepUpPermissions.length) return;
  if (!session.mfa.enrolled) {
    const { secret } = (await (await page.request.post('/api/core/mfa/enrolment', { headers: CSRF, data: { password } })).json()) as { secret: string };
    rememberTotpSecret(username, secret);
    await expectOk(page.request.post('/api/core/mfa/enrolment/confirm', { headers: CSRF, data: { code: await totpCode(username) } }));
    return;
  }
  // Codes used in another e2e project (or by the seed) are refused; keep advancing until one is free.
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await page.request.post('/api/core/step-up', { headers: CSRF, data: { code: await totpCode(username) } });
    if (response.ok()) return;
    const body = await response.text();
    if (!body.includes('auth.invalidCode') || attempt === 7) {
      throw new Error(`Step-up of ${username} failed: ${response.status()} ${body}`);
    }
  }
}

// ----- API ------------------------------------------------------------------------------------------------------------

async function expectOk(response: Promise<APIResponse>): Promise<APIResponse> {
  const result = await response;
  if (!result.ok()) throw new Error(`${result.url()}: ${result.status()} ${await result.text()}`);
  return result;
}

/**
 * The server closes idle keep-alive connections after 5 s; a request sent on such a connection at the same moment fails
 * with `ECONNRESET` before the server read it. Such a request is sent once more.
 */
const CONNECTION_CLOSED = /ECONNRESET|socket hang up/;

/** Calls the API with the session of the page (e.g. to prepare data); fails on an error status. */
export async function api<T = unknown>(page: Page, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, data?: unknown): Promise<T> {
  const send = () => page.request.fetch(`/api/${path}`, { method, headers: CSRF, data });
  const response = await expectOk(send().catch((error: unknown) => (error instanceof Error && CONNECTION_CLOSED.test(error.message) ? send() : Promise.reject(error))));
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Restores what a test changed (settings, a switched-off module …) in its `finally` block. A failing restore is reported
 * as a warning of the test and never hides the error that made the test fail.
 */
export async function restore(what: string, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const description = `Restoring ${what} failed: ${error instanceof Error ? error.message : String(error)}`;
    test.info().annotations.push({ type: 'warning', description });
    console.warn(description);
  }
}

/**
 * Waits until a background job is done, e.g. a data transfer run or a generated document: polls `path` until `done`
 * returns true for the answer (default timeout 60 s).
 */
export async function waitForApi<T>(page: Page, path: string, done: (value: T) => boolean, timeout = 60_000): Promise<T> {
  let last: T | undefined;
  await expect
    .poll(async () => {
      last = await api<T>(page, 'GET', path);
      return done(last);
    }, { timeout, intervals: [250, 500, 1000, 2000] })
    .toBe(true);
  return last as T;
}

// ----- Navigation, downloads ------------------------------------------------------------------------------------------

/** Opens an entry of the main menu by its label (exact, or a pattern like `/^Zur Prüfung/` for entries with a count). */
export async function navigate(page: Page, label: string | RegExp): Promise<void> {
  await page.getByRole('navigation', { name: 'Menü' }).getByRole('link', { name: label, exact: typeof label === 'string' }).click();
}

/** Starts a download with `action` (e.g. clicking a link) and returns the file name and the content. */
export async function download(page: Page, action: () => Promise<unknown>): Promise<{ name: string; content: Buffer; download: Download }> {
  const [file] = await Promise.all([page.waitForEvent('download'), action()]);
  const path = await file.path();
  return { name: file.suggestedFilename(), content: readFileSync(path), download: file };
}

/** Chooses files in a file field (e.g. a Mantine `FileInput`) by its label, through the file chooser of the browser. */
export async function chooseFiles(page: Page, label: string | RegExp, files: Parameters<FileChooser['setFiles']>[0]): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByLabel(fieldLabel(label)).first().click()]);
  await chooser.setFiles(files);
}

// ----- Info terminal --------------------------------------------------------------------------------------------------

/**
 * Sets up an info terminal at a station (default: the station of Abteilung Musterstadt) with the session of `admin`
 * (a page of a user with `info-terminal.manage`) and opens its link in a new browser context, like a tablet in the
 * station. Returns the kiosk page.
 */
export async function openTerminal(browser: Browser, admin: Page, options: { station?: string; name?: string } = {}): Promise<Page> {
  const stations = await api<{ id: string; name: string }[]>(admin, 'GET', 'masterdata/stations');
  const station = stations.find((s) => s.name === (options.station ?? 'Feuerwehrhaus Musterstadt'));
  if (!station) throw new Error(`Station ${options.station} not found.`);
  const { url } = await api<{ url: string }>(admin, 'POST', 'info-terminal/terminals', { stationId: station.id, name: options.name ?? `E2E-Terminal ${Date.now()}` });
  return openKiosk(browser, url);
}

/** Opens the link of an info terminal (`…/terminal#k=…`) in a new browser context, like the tablet in the station. */
export async function openKiosk(browser: Browser, url: string): Promise<Page> {
  const kiosk = await newPage(browser);
  const link = new URL(url);
  await kiosk.goto(`${link.pathname}${link.hash}`);
  return kiosk;
}

// ----- Forms ----------------------------------------------------------------------------------------------------------

/** A field label as exact match; required fields carry an asterisk in their accessible name. */
const fieldLabel = (label: string | RegExp) => (typeof label === 'string' ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\*)?$`) : label);

/** The select with this label (not e.g. a tab panel labelled like it). */
const selectField = (scope: Page | Locator, label: string | RegExp) =>
  scope.getByRole('combobox', { name: fieldLabel(label) }).or(scope.getByRole('textbox', { name: fieldLabel(label) })).first();

/** The page of a scope; the options of a select open in a layer of the page. */
const pageOf = (scope: Page | Locator): Page => ('mainFrame' in scope ? scope : scope.page());

/**
 * Chooses an option of a Mantine select by its label and the text of the option. `scope` is the page or a part of it
 * (e.g. a form), when the label occurs more than once.
 */
export async function choose(scope: Page | Locator, label: string | RegExp, option: string | RegExp): Promise<void> {
  await selectField(scope, label).click();
  await pageOf(scope).getByRole('option', { name: option }).first().click();
}

/** Picks the first offered option of a select. */
export async function chooseFirst(scope: Page | Locator, label: string | RegExp): Promise<void> {
  await selectField(scope, label).click();
  await pageOf(scope).getByRole('option').first().click();
}

/** Opens a section of the report editor by its title. */
export async function section(page: Page, title: string): Promise<void> {
  await page.getByRole('list', { name: 'Abschnitte des Berichts' }).getByRole('button', { name: new RegExp(title) }).click();
}

/** A panel (card with a title) by its title, e.g. a card on the incident page; `hasText` narrows panels of the same title. */
export const panel = (page: Page, title: string | RegExp, hasText?: string | RegExp) =>
  page.getByRole('heading', { name: title, exact: typeof title === 'string' }).locator('xpath=../..').filter(hasText ? { hasText } : {});

/** The table row that contains the text, e.g. a dispatch number. */
export const row = (scope: Page | Locator, text: string | RegExp) => scope.getByRole('row').filter({ hasText: text });

// ----- Dates ----------------------------------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** A date relative to today as `YYYY-MM-DD` (local time), e.g. `isoDate(30)` in 30 days. */
export const isoDate = (days = 0) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A date relative to today as shown in the interface, `DD.MM.YYYY`. */
export const germanDate = (days = 0) => isoDate(days).split('-').toReversed().join('.');

/** A moment relative to now for `datetime-local` fields, `YYYY-MM-DDTHH:mm` (local time). */
export const localDateTime = (minutes = 0) => {
  const d = new Date(Date.now() + minutes * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
