import { i18n } from './i18n';
import { reportMaintenance } from './maintenance';
import { isStepUpPath, requestStepUp } from './step-up';

/** An API error with the machine-readable `code` from the server, e.g. `auth.invalidCredentials`. */
export class ApiError extends Error {
  readonly code: string;

  constructor(
    readonly status: number,
    readonly body: { code?: string; [key: string]: unknown } | undefined,
  ) {
    super(`Request failed (${status})`);
    this.code = body?.code ?? 'generic';
  }

  /** Failing fields of a `validation.failed` error, e.g. `memberships.0.from`. */
  get fields(): string[] {
    const issues = Array.isArray(this.body?.['issues']) ? (this.body['issues'] as { path?: unknown }[]) : [];
    return [...new Set(issues.map((issue) => String(issue.path ?? '')).filter(Boolean))];
  }

  /** The error in the current UI language; validation errors name the failing fields. */
  translated(): string {
    if (this.code === 'validation.failed' && this.fields.length) {
      return i18n.t('errors.validation.failedFields', { ns: 'common', fields: this.fields.map(fieldLabel).join(', ') });
    }
    const details = Object.fromEntries(
      Object.entries(this.body ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]),
    );
    return translateCode(this.code, details);
  }
}

/**
 * Readable name of a field path: `fields.<name>` of the shell or a module namespace if translated
 * (for list entries `memberships.0.from` → "from (2)"), otherwise the path itself.
 */
function fieldLabel(path: string): string {
  const parts = path.split('.');
  const name = parts.filter((p) => !/^\d+$/.test(p)).at(-1) ?? path;
  const index = parts.find((p) => /^\d+$/.test(p));
  const namespaces = ['shell', ...Object.keys(i18n.store.data[i18n.language] ?? {})];
  const label = i18n.t(`fields.${name}`, { ns: namespaces, defaultValue: name });
  return index === undefined ? label : `${label} (${Number(index) + 1})`;
}

/**
 * Text for a server code such as `auth.forbidden` or `masterdata.import.unknownDepartment`.
 * Codes starting with a module ID are looked up under `errors` in that module's namespace, all others in `common`.
 */
export function translateCode(code: string, params: Record<string, unknown> = {}): string {
  const module = code.split('.')[0];
  const namespaces = module && i18n.hasResourceBundle(i18n.language, module) ? [module, 'common'] : ['common'];
  return i18n.t(`errors.${code}`, { ns: namespaces, defaultValue: i18n.t('errors.generic', { ns: 'common' }), ...params });
}

/** The error of a failed request; `503 maintenance` (a backup is being restored) also switches the shell to its maintenance page. */
function failure(response: Response, body: unknown): ApiError {
  const error = new ApiError(response.status, body as ApiError['body']);
  if (response.status === 503 && error.code === 'maintenance') reportMaintenance();
  return error;
}

/**
 * Runs a request; on `403 auth.stepUpRequired` asks for the second factor (dialog of the shell) and repeats it once
 * after the confirmation. Cancelling keeps the error, so the page shows what it can without the sensitive parts.
 */
async function withStepUp(path: string, method: string, run: () => Promise<Response>): Promise<{ response: Response; body: unknown }> {
  const attempt = async () => {
    const response = await run();
    const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    return { response, body };
  };
  const first = await attempt();
  const code = (first.body as { code?: unknown } | undefined)?.code;
  if (first.response.status !== 403 || code !== 'auth.stepUpRequired' || (isStepUpPath(path) && method !== 'GET')) return first;
  const enrolled = (first.body as { enrolled?: unknown }).enrolled !== false;
  return (await requestStepUp({ enrolled })) ? attempt() : first;
}

/**
 * Calls the f.orga API with the session cookie. Paths without the `/api` prefix.
 * The `x-forga` header marks requests from the UI (CSRF protection).
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { response, body } = await withStepUp(path, init.method ?? 'GET', () =>
    fetch(`/api/${path.replace(/^\//, '')}`, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-forga': '1', ...init.headers },
    }),
  );
  if (!response.ok) throw failure(response, body);
  return body as T;
}

/**
 * Makes sure the session is confirmed with the second factor, e.g. before opening a download link with sensitive data
 * (SEPA file, data access). Resolves `false` if the user cancels.
 */
export async function ensureStepUp(): Promise<boolean> {
  try {
    await api<void>('core/step-up');
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens a download or PDF with sensitive data after making sure the session is confirmed (a plain link would show the
 * server's error instead of the dialog). `newTab` for PDFs shown in the browser.
 */
export async function openAfterStepUp(url: string, newTab = false): Promise<void> {
  if (!(await ensureStepUp())) return;
  if (newTab) window.open(url, '_blank', 'noopener');
  else window.location.assign(url);
}

export const send = <T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** Uploads a file as `multipart/form-data` (field `file`). */
export async function upload<T>(path: string, file: File, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const { response, body } = await withStepUp(path, method, () => fetch(`/api/${path.replace(/^\//, '')}`, { method, credentials: 'include', headers: { 'x-forga': '1' }, body: form }));
  if (!response.ok) throw failure(response, body);
  return body as T;
}

/** Uploads several files as `multipart/form-data` (field `files`). */
export async function uploadFiles<T>(path: string, files: readonly File[]): Promise<T> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const { response, body } = await withStepUp(path, 'POST', () => fetch(`/api/${path.replace(/^\//, '')}`, { method: 'POST', credentials: 'include', headers: { 'x-forga': '1' }, body: form }));
  if (!response.ok) throw failure(response, body);
  return body as T;
}

type QueryValues = Record<string, string | number | boolean | null | undefined>;

/** API path with query parameters for `api()`; empty values are left out. */
export function withQuery(path: string, query: QueryValues = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `${path.replace(/^\//, '')}${search ? `?${search}` : ''}`;
}

/** Full URL of an API path, e.g. for download links. */
export const apiUrl = (path: string, query: QueryValues = {}): string => `/api/${withQuery(path, query)}`;
