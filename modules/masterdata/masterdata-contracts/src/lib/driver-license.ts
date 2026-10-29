import { z } from 'zod';
import type { Language, LocalizedText } from '@forga/core-contracts';

/** Classes offered in the UI, in the order of the licence. Other values are accepted as well (e.g. old national classes). */
export const LICENSE_CLASSES = ['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE', 'L', 'T'] as const;

/** Classes issued for a limited time (every five years); a single expiry date of old data belongs to these. */
export const TIME_LIMITED_CLASSES: readonly string[] = ['C1', 'C1E', 'C', 'CE'];

const date = z.iso.date();

export const DriverLicenseCheckMethod = z.enum(['in-person', 'transponder', 'barcode', 'legacy']);
export type DriverLicenseCheckMethod = z.infer<typeof DriverLicenseCheckMethod>;

/** A class of the licence with its own expiry; `null` = not time-limited. */
export const DriverLicenseClass = z.object({
  class: z
    .string()
    .trim()
    .min(1)
    .max(6)
    .transform((value) => value.toUpperCase()),
  expiresOn: date.nullable().default(null),
});
export type DriverLicenseClass = z.infer<typeof DriverLicenseClass>;

const DriverLicenseObject = z.object({
  classes: z.array(DriverLicenseClass).default([]),
  /** Expiry of the document itself (card licences are issued for 15 years); only a hint. */
  documentExpiresOn: date.nullable().default(null),
  /** Date of the latest valid check, kept by the server from the checks (not an input). */
  lastCheckedOn: date.nullable().default(null),
  lastCheckMethod: DriverLicenseCheckMethod.nullable().default(null),
  /** Check date of old data without examiner; becomes a check of the method `legacy` when the next check is recorded. */
  legacyCheckedOn: date.nullable().default(null),
  /** The expiry dates come from a single old date ("Befristung prüfen") until the first check in the new dialog. */
  expiryToVerify: z.boolean().default(false),
});

/**
 * Old values (`classes` as texts, one `expiresOn` for everything) are read in the new form: texts become classes,
 * the old expiry goes to the time-limited classes C1, C1E, C and CE (or, without them, to the document), the old
 * check date stays as `legacyCheckedOn`.
 */
function upgrade(value: unknown): unknown {
  if (!value || typeof value !== 'object') return {};
  const { expiresOn, ...stored } = value as Record<string, unknown>;
  const classes = Array.isArray(stored['classes']) ? (stored['classes'] as unknown[]) : [];
  const old = classes.some((c) => typeof c === 'string') || 'expiresOn' in (value as object);
  if (!old) return value;
  const expiry = typeof expiresOn === 'string' && expiresOn ? expiresOn : null;
  const upgraded = classes
    .filter((c): c is string | object => typeof c === 'string' || (typeof c === 'object' && c !== null))
    .map((c) => (typeof c === 'string' ? { class: c, expiresOn: expiry && TIME_LIMITED_CLASSES.includes(c.trim().toUpperCase()) ? expiry : null } : c));
  const assigned = Boolean(expiry) && upgraded.some((c) => (c as { expiresOn?: unknown }).expiresOn === expiry);
  const checked = typeof stored['lastCheckedOn'] === 'string' && stored['lastCheckedOn'] ? stored['lastCheckedOn'] : null;
  return {
    ...stored,
    classes: upgraded,
    documentExpiresOn: stored['documentExpiresOn'] ?? (expiry && !assigned ? expiry : null),
    lastCheckedOn: checked,
    lastCheckMethod: checked ? 'legacy' : null,
    legacyCheckedOn: stored['legacyCheckedOn'] ?? checked,
    expiryToVerify: stored['expiryToVerify'] ?? assigned,
  };
}

/** The driving licence of a person as stored with the person. */
export const DriverLicense = z.preprocess(upgrade, DriverLicenseObject);
export type DriverLicense = z.infer<typeof DriverLicenseObject>;

export const EMPTY_DRIVER_LICENSE: DriverLicense = {
  classes: [],
  documentExpiresOn: null,
  lastCheckedOn: null,
  lastCheckMethod: null,
  legacyCheckedOn: null,
  expiryToVerify: false,
};

/** Reads a stored value of any age; broken values count as no licence. */
export function readDriverLicense(value: unknown): DriverLicense {
  const result = DriverLicense.safeParse(value ?? {});
  return result.success ? result.data : { ...EMPTY_DRIVER_LICENSE };
}

/** `C, CE` from a list of classes. */
export const classNames = (classes: readonly Pick<DriverLicenseClass, 'class'>[]) => classes.map((c) => c.class).join(', ');

/**
 * When licences are checked. `on-occasion` (default): once with the original, at the expiry of each time-limited
 * class and on request. `periodic`: in addition at a fixed interval (recommendation of DGUV Regel 105-049).
 */
export const DriverLicenseMode = z.enum(['on-occasion', 'periodic']);
export type DriverLicenseMode = z.infer<typeof DriverLicenseMode>;

export const DriverLicenseSettings = z.object({
  mode: DriverLicenseMode.default('on-occasion'),
  /** Only `periodic`: months between two checks. */
  intervalMonths: z.number().int().min(3).max(24).default(6),
  /** Persons with one of these classes are monitored. */
  monitoredClasses: z.array(z.string().trim().min(1).transform((c) => c.toUpperCase())).default(['C1', 'C1E', 'C', 'CE']),
  /** Persons with one of these qualifications (catalog keys) are monitored, also without a class. */
  driverQualifications: z.array(z.string().min(1)).default(['machinist']),
  /** Days before a deadline from which it shows up as a task. */
  leadDays: z.number().int().min(0).max(120).default(30),
  /** Only `periodic`: persons confirm their licence themselves with a registered sticker at the info terminal. */
  selfCheck: z.boolean().default(false),
  /** With self-checks: the original is shown at least every so many months. */
  inPersonEveryMonths: z.number().int().min(6).max(36).default(12),
});
export type DriverLicenseSettings = z.infer<typeof DriverLicenseSettings>;

/** Self-checks are possible: periodic mode with self-checks switched on. */
export const selfCheckEnabled = (settings: Pick<DriverLicenseSettings, 'mode' | 'selfCheck'>) => settings.mode === 'periodic' && settings.selfCheck;

/** The self-declaration a person confirms at a self-check, stored in the language of the screen. */
export const SELF_DECLARATION: LocalizedText = {
  de: 'Mein Führerschein ist gültig. Gegen mich besteht kein Fahrverbot und keine Entziehung der Fahrerlaubnis.',
  en: 'My driving licence is valid. I am not banned from driving and my licence has not been withdrawn.',
};

/** Recording a check with the original. The classes are those on the original; they replace the classes of the person. */
export const DriverLicenseCheckInput = z.object({
  checkedOn: date,
  /** Examining person; required. */
  checkedById: z.uuid(),
  /** A copy or a photo does not count. */
  originalPresented: z.literal(true, { message: 'Original required' }),
  classes: z
    .array(DriverLicenseClass)
    .refine((classes) => new Set(classes.map((c) => c.class)).size === classes.length, { message: 'Duplicate class' }),
  documentExpiresOn: date.nullable().default(null),
  note: z.string().trim().max(500).default(''),
  /** Registers a sticker on the original in the same step. */
  token: z.object({ kind: z.enum(['nfc', 'barcode']), code: z.string().trim().min(4).max(200) }).nullable().default(null),
});
export type DriverLicenseCheckInput = z.input<typeof DriverLicenseCheckInput>;

export const CancelInput = z.object({ reason: z.string().trim().min(1).max(500) });
export type CancelInput = z.input<typeof CancelInput>;

/** Request to present the licence again for a concrete reason (e.g. hint of a driving ban). */
export const DriverLicenseRequestInput = z.object({ reason: z.string().trim().min(1).max(500), dueOn: date });
export type DriverLicenseRequestInput = z.input<typeof DriverLicenseRequestInput>;

export const DriverLicenseTokenKind = z.enum(['nfc', 'barcode']);
export type DriverLicenseTokenKind = z.infer<typeof DriverLicenseTokenKind>;

export const DriverLicenseTokenInput = z.object({ kind: DriverLicenseTokenKind, code: z.string().trim().min(4).max(200) });
export type DriverLicenseTokenInput = z.input<typeof DriverLicenseTokenInput>;

export const DriverLicenseCheck = z.object({
  id: z.uuid(),
  checkedOn: z.string(),
  method: DriverLicenseCheckMethod,
  /** Examining person (name); `null` at self-checks and for old data. */
  checkedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  originalPresented: z.boolean(),
  /** Classes found at the check; empty at self-checks. */
  classes: z.array(DriverLicenseClass),
  selfDeclaration: z.string(),
  /** Info terminal of a self-check ("Infoterminal Wache · Tablet"). */
  device: z.string(),
  requestId: z.string().nullable(),
  /** The first check with the original. */
  first: z.boolean(),
  note: z.string(),
  recordedAt: z.string(),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
});
export type DriverLicenseCheck = z.infer<typeof DriverLicenseCheck>;

export const DriverLicenseRequest = z.object({
  id: z.uuid(),
  /** Empty without `masterdata.licenses.check`: the reason may reveal personal circumstances. */
  reason: z.string(),
  dueOn: z.string(),
  requestedAt: z.string(),
  requestedBy: z.string(),
  completedByCheckId: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  withdrawReason: z.string().nullable(),
});
export type DriverLicenseRequest = z.infer<typeof DriverLicenseRequest>;

export const DriverLicenseToken = z.object({
  id: z.uuid(),
  kind: DriverLicenseTokenKind,
  /** Last 4 characters of the ID, to recognise the sticker. */
  suffix: z.string(),
  registeredAt: z.string(),
  registeredBy: z.string(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
  revokeReason: z.string().nullable(),
});
export type DriverLicenseToken = z.infer<typeof DriverLicenseToken>;

/** Kinds of the deadlines of the licence checks. */
export const DriverLicenseDueKind = z.enum([
  'driver-license-first-check',
  'driver-license-class-expires',
  'driver-license-request',
  'driver-license-check-due',
  'driver-license-in-person-due',
]);
export type DriverLicenseDueKind = z.infer<typeof DriverLicenseDueKind>;

export const DriverLicenseDue = z.object({
  kind: DriverLicenseDueKind,
  dueOn: z.string(),
  /** Classes expiring (`driver-license-class-expires`). */
  classes: z.array(z.string()),
  /** Needs the original: everything but the periodic check (which a self-check may settle). */
  inPerson: z.boolean(),
});
export type DriverLicenseDue = z.infer<typeof DriverLicenseDue>;

/**
 * State of a person of the target group: `classes-missing` (driver qualification without classes), `overdue`,
 * `requested` (presentation requested), `first-check-missing`, `due` (within the lead time), `checked`.
 */
export const DriverLicenseState = z.enum(['classes-missing', 'overdue', 'requested', 'first-check-missing', 'due', 'checked']);
export type DriverLicenseState = z.infer<typeof DriverLicenseState>;

export const DriverLicenseLastCheck = z.object({ checkedOn: z.string(), method: DriverLicenseCheckMethod, checkedBy: z.string().nullable() });
export type DriverLicenseLastCheck = z.infer<typeof DriverLicenseLastCheck>;

/** The licence of a person with checks, requests and stickers (`GET /masterdata/persons/:id/driver-license`). */
export const DriverLicenseFile = z.object({
  person: z.object({ id: z.uuid(), firstName: z.string(), lastName: z.string(), status: z.string(), departmentIds: z.array(z.string()) }),
  license: DriverLicenseObject,
  mode: DriverLicenseMode,
  selfCheck: z.boolean(),
  /** The person belongs to the target group. */
  monitored: z.boolean(),
  state: DriverLicenseState.nullable(),
  /** Open deadlines, earliest first. */
  dues: z.array(DriverLicenseDue),
  firstCheck: DriverLicenseLastCheck.nullable(),
  lastCheck: DriverLicenseLastCheck.nullable(),
  checks: z.array(DriverLicenseCheck),
  requests: z.array(DriverLicenseRequest),
  /** Only with `masterdata.licenses.check`. */
  tokens: z.array(DriverLicenseToken),
  /** The user may record checks, requests and stickers. */
  canCheck: z.boolean(),
});
export type DriverLicenseFile = z.infer<typeof DriverLicenseFile>;

/** A row of the page "Führerscheinkontrollen" (persons of the target group). */
export const DriverLicenseOverviewRow = z.object({
  personId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  primaryDepartmentId: z.string().nullable(),
  departmentIds: z.array(z.string()),
  classes: z.array(DriverLicenseClass),
  /** Earliest expiry of a monitored class. */
  nextExpiry: z.object({ dueOn: z.string(), classes: z.array(z.string()) }).nullable(),
  lastCheck: DriverLicenseLastCheck.nullable(),
  token: z.boolean(),
  state: DriverLicenseState,
  /** Earliest open deadline. */
  dueOn: z.string().nullable(),
  requestDueOn: z.string().nullable(),
  expiryToVerify: z.boolean(),
  documentExpired: z.boolean(),
});
export type DriverLicenseOverviewRow = z.infer<typeof DriverLicenseOverviewRow>;

export const DriverLicenseOverview = z.object({
  mode: DriverLicenseMode,
  leadDays: z.number(),
  monitoredClasses: z.array(z.string()),
  driverQualifications: z.array(z.string()),
  rows: z.array(DriverLicenseOverviewRow),
});
export type DriverLicenseOverview = z.infer<typeof DriverLicenseOverview>;

/** "Mein Bereich": the own licence, without requests and stickers. */
export const MyDriverLicense = z.object({
  license: DriverLicenseObject,
  mode: DriverLicenseMode,
  monitored: z.boolean(),
  state: DriverLicenseState.nullable(),
  lastCheck: DriverLicenseLastCheck.nullable(),
  /** Earliest open deadline. */
  next: DriverLicenseDue.nullable(),
});
export type MyDriverLicense = z.infer<typeof MyDriverLicense>;

/**
 * Self-check of a licence with a registered sticker at an info terminal (module `info-terminal`). The masterdata
 * module provides it: `@Inject(MASTERDATA_LICENSE_SELF_CHECK) selfCheck: MasterdataLicenseSelfCheck`. The terminal
 * only learns name and classes of the person whose sticker was scanned, never the list of stickers.
 */
export const MASTERDATA_LICENSE_SELF_CHECK = 'masterdata.LicenseSelfCheck';

/** `allowed`: the person may confirm; `in-person`: the original is due (no details); `off`: self-checks are switched off. */
export const LicenseSelfCheckState = z.enum(['allowed', 'in-person', 'off']);
export type LicenseSelfCheckState = z.infer<typeof LicenseSelfCheckState>;

export const LicenseSelfCheckView = z.object({
  firstName: z.string(),
  lastName: z.string(),
  classes: z.array(DriverLicenseClass),
  lastCheck: z.object({ checkedOn: z.string(), method: DriverLicenseCheckMethod }).nullable(),
  state: LicenseSelfCheckState,
  /** Latest date to show the original (periodic mode with self-checks). */
  inPersonDueOn: z.string().nullable(),
  /** Earliest open deadline, e.g. the expiry of a class in the on-occasion mode. */
  next: DriverLicenseDue.nullable(),
});
export type LicenseSelfCheckView = z.infer<typeof LicenseSelfCheckView>;

export const LicenseSelfCheckResult = z.object({ checkedAt: z.string(), nextDueOn: z.string().nullable() });
export type LicenseSelfCheckResult = z.infer<typeof LicenseSelfCheckResult>;

export interface MasterdataLicenseSelfCheck {
  /** Self-checks are switched on (periodic mode). */
  enabled(): Promise<boolean>;
  /** The person of a registered, not revoked sticker; `null` for unknown and revoked codes alike. */
  lookup(code: string): Promise<LicenseSelfCheckView | null>;
  /**
   * Records the self-check after the person confirmed the self-declaration. `404 masterdata.licenseNotRegistered`
   * for unknown codes, `409 masterdata.inPersonRequired` when the original is due, `403 masterdata.selfCheckOff`.
   */
  confirm(code: string, origin: { terminalId: string; device: string; language: Language }): Promise<LicenseSelfCheckResult>;
}
