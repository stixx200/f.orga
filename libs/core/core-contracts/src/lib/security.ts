import { z } from 'zod';
import { Language, LocalizedText } from './i18n.js';
import type { Permission, RoleTemplate } from './module.js';

/** Permissions of the core itself. Modules declare their own in their manifest. */
export const CORE_PERMISSIONS = [
  { id: 'core.users.manage', name: { de: 'Benutzer verwalten', en: 'Manage users' }, scope: 'brigade' },
  { id: 'core.users.impersonate', name: { de: 'Als anderer Benutzer anmelden', en: 'Log in as another user' }, scope: 'brigade' },
  { id: 'core.roles.manage', name: { de: 'Rollen verwalten', en: 'Manage roles' }, scope: 'brigade' },
  { id: 'core.modules.manage', name: { de: 'Module verwalten', en: 'Manage modules' }, scope: 'brigade' },
  { id: 'core.settings.manage', name: { de: 'Einstellungen verwalten', en: 'Manage settings' }, scope: 'brigade' },
  { id: 'core.tokens.manage', name: { de: 'API-Tokens verwalten', en: 'Manage API tokens' }, scope: 'brigade' },
  { id: 'core.audit.read', name: { de: 'Audit-Log lesen', en: 'Read audit log' }, scope: 'brigade' },
  { id: 'core.data.export', name: { de: 'Vollexport und Auskunft (DSGVO)', en: 'Full export and data access requests' }, scope: 'brigade' },
] as const satisfies readonly Permission[];

/**
 * Standard roles of a fire brigade. Modules add their permissions to these keys;
 * a role is assigned brigade-wide or per department.
 */
export const CORE_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'administrator',
    name: { de: 'Administrator', en: 'Administrator' },
    description: { de: 'Alle Rechte', en: 'All permissions' },
    permissions: ['*'],
  },
  {
    key: 'commander',
    name: { de: 'Kommandant', en: 'Commander' },
    description: { de: 'Fachlich alles, Berichte freigeben', en: 'All business functions, release reports' },
    permissions: ['core.audit.read'],
  },
  {
    key: 'department-commander',
    name: { de: 'Abteilungskommandant', en: 'Department commander' },
    description: { de: 'Personen und Berichte der Abteilung', en: 'Persons and reports of the department' },
  },
  {
    key: 'group-leader',
    name: { de: 'Gruppenführer', en: 'Group leader' },
    description: { de: 'Einsatzberichte schreiben', en: 'Write incident reports' },
  },
  {
    key: 'course-coordinator',
    name: { de: 'Lehrgangsbeauftragter', en: 'Course coordinator' },
    description: {
      de: 'Lehrgangsvormerkungen und -anmeldungen planen, Teilnahmen eintragen',
      en: 'Plan course nominations and registrations, record attendances',
    },
  },
  {
    key: 'breathing-apparatus-officer',
    name: { de: 'Atemschutzgerätewart', en: 'Breathing apparatus officer' },
  },
  { key: 'equipment-officer', name: { de: 'Gerätewart', en: 'Equipment officer' } },
  {
    key: 'member',
    name: { de: 'Mitglied', en: 'Member' },
    description: { de: 'Eigene Daten, Nachweise, Entschuldigungen, Mängelmeldung', en: 'Own data, records, excuses, defect reports' },
  },
  {
    key: 'administration',
    name: { de: 'Verwaltung / Kasse', en: 'Administration / treasury' },
    description: { de: 'Entschädigungen, Listen, Statistik', en: 'Compensation, lists, statistics' },
  },
];

export const Password = z.string().min(10).max(200);

export const Login = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});
export type Login = z.infer<typeof Login>;

/** First start: creates the brigade settings and the first administrator. */
export const Setup = z.object({
  /** From `FORGA_SETUP_TOKEN` or the server log; proves access to the server. */
  setupToken: z.string().trim().min(1),
  brigadeName: z.string().trim().min(1),
  username: z.string().trim().min(3),
  displayName: z.string().trim().min(1),
  /** E-mail address of the administrator, e.g. for resetting the password. */
  email: z.email().nullable().default(null),
  password: Password,
  language: Language.default('de'),
});
export type Setup = z.input<typeof Setup>;

export const ChangePassword = z.object({ current: z.string().min(1), new: Password });
export type ChangePassword = z.infer<typeof ChangePassword>;

/** Hidden tasks: a module (`training`) or a kind of task of a module (`training:excuse-open`). */
export const HiddenTasks = z.array(z.string().trim().min(1).max(200)).max(200);
export type HiddenTasks = z.infer<typeof HiddenTasks>;

export const UpdateProfile = z.object({
  language: Language,
  /** Weekly e-mail with the user's deadlines. */
  receiveDigest: z.boolean().default(true),
  /**
   * Own e-mail address; left out = unchanged, `null` = remove. A new address only takes effect once confirmed with the
   * link sent to it.
   */
  email: z.email().nullable().optional(),
  /** Needed to change or remove the e-mail address. */
  currentPassword: z.string().optional(),
  /** Tasks hidden in the bell and on the start page; left out = unchanged. */
  hiddenTasks: HiddenTasks.optional(),
});
export type UpdateProfile = z.input<typeof UpdateProfile>;

/** Confirms a new e-mail address with the token from the link sent to it. */
export const ConfirmEmail = z.object({ token: z.string().min(10) });
export type ConfirmEmail = z.infer<typeof ConfirmEmail>;

/** Where a granted permission applies: the whole brigade or the listed department IDs. */
export const Grant = z.union([z.literal('brigade'), z.array(z.string())]);
export type Grant = z.infer<typeof Grant>;

export const Session = z.object({
  user: z.object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
    personId: z.string().nullable(),
    language: Language,
    email: z.string().nullable(),
    /** New address waiting for confirmation by the link sent to it. */
    pendingEmail: z.string().nullable(),
    receiveDigest: z.boolean(),
    hiddenTasks: HiddenTasks,
  }),
  permissions: z.record(z.string(), Grant),
  /** Set while an administrator acts as this user (impersonation). */
  impersonator: z.object({ id: z.string(), displayName: z.string(), endsAt: z.string() }).nullable(),
});
export type Session = z.infer<typeof Session>;

/** Starting an impersonation needs a reason; it is kept in the audit log. */
export const Impersonate = z.object({ reason: z.string().trim().min(3) });
export type Impersonate = z.infer<typeof Impersonate>;

export const RoleAssignmentInput = z.object({
  roleId: z.uuid(),
  /** `null` = whole brigade. */
  departmentId: z.string().nullable().default(null),
});
export type RoleAssignmentInput = z.input<typeof RoleAssignmentInput>;

export const UserInput = z.object({
  username: z.string().trim().min(3),
  displayName: z.string().trim().min(1),
  email: z.email().nullable().default(null),
  personId: z.string().nullable().default(null),
  language: Language.default('de'),
  receiveDigest: z.boolean().default(true),
  active: z.boolean().default(true),
  roles: z.array(RoleAssignmentInput).default([]),
  /** Only when creating a user or resetting the password. */
  password: Password.optional(),
});
export type UserInput = z.input<typeof UserInput>;

export const User = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  personId: z.string().nullable(),
  language: Language,
  receiveDigest: z.boolean(),
  active: z.boolean(),
  technical: z.boolean(),
  lastLogin: z.string().nullable(),
  /** Linked to an account of the OIDC provider. */
  oidcLinked: z.boolean(),
  /** `false` for invited users who have not set their password yet. */
  passwordSet: z.boolean(),
  roles: z.array(z.object({ roleId: z.string(), departmentId: z.string().nullable() })),
  version: z.number(),
});
export type User = z.infer<typeof User>;

/**
 * Creates a user for a person of the master data: name and e-mail address come from the person,
 * the person sets the password with the link of the invitation e-mail.
 */
export const UserInvitation = z.object({
  personId: z.string().min(1),
  /** Default: the local part of the person's e-mail address. */
  username: z.string().trim().min(3).optional(),
  language: Language.default('de'),
  roles: z.array(RoleAssignmentInput).default([]),
});
export type UserInvitation = z.infer<typeof UserInvitation>;

/** Invites several persons with the same roles ("create users from persons"). */
export const BulkUserInvitation = z.object({
  personIds: z.array(z.string().min(1)).min(1).max(500),
  language: Language.default('de'),
  roles: z.array(RoleAssignmentInput).default([]),
});
export type BulkUserInvitation = z.infer<typeof BulkUserInvitation>;

export const BulkUserInvitationResult = z.object({
  /** IDs of the created users. */
  invited: z.array(z.string()),
  skipped: z.array(
    z.object({
      personId: z.string(),
      reason: z.enum(['unknownPerson', 'hasUser', 'noEmail', 'emailTaken', 'usernameTaken', 'forbidden', 'mailFailed']),
      /** For `mailFailed`: the `mail.*` error code. */
      code: z.string().optional(),
    }),
  ),
});
export type BulkUserInvitationResult = z.infer<typeof BulkUserInvitationResult>;

const bothLanguages = (value: unknown) => (typeof value === 'string' ? { de: value, en: value } : value);

/** Name of a role in both languages; a single text (older clients, scripts) is used for both. */
export const RoleName = z.preprocess(bothLanguages, z.object({ de: z.string().trim().min(1).max(100), en: z.string().trim().min(1).max(100) }));

/** Description of a role in both languages, may be empty; a single text is used for both. */
export const RoleDescription = z.preprocess(bothLanguages, z.object({ de: z.string().trim().max(500), en: z.string().trim().max(500) }));
export type RoleDescription = z.infer<typeof RoleDescription>;

export const RoleInput = z.object({
  name: RoleName,
  description: RoleDescription.default({ de: '', en: '' }),
  /**
   * Permission IDs or patterns (`*` = everything, `masterdata.*` = everything of a module)
   * that apply in the area of the assignment: the whole brigade or the assigned department.
   */
  permissions: z.array(z.string()).default([]),
  /** Permissions that apply in all departments, also when the role is assigned to one department only. */
  permissionsAllDepartments: z.array(z.string()).default([]),
});
export type RoleInput = z.input<typeof RoleInput>;

export const Role = z.object({
  id: z.string(),
  /** Key of the role template the role was created from, if any. */
  templateKey: z.string().nullable(),
  name: LocalizedText,
  description: z.object({ de: z.string(), en: z.string() }),
  permissions: z.array(z.string()),
  permissionsAllDepartments: z.array(z.string()),
  version: z.number(),
});
export type Role = z.infer<typeof Role>;

export const ApiTokenInput = z.object({
  name: z.string().trim().min(1),
  /** Permission IDs the token may use, always brigade-wide. */
  scopes: z.array(z.string()).min(1),
  expiresOn: z.iso.date().nullable().default(null),
});
export type ApiTokenInput = z.input<typeof ApiTokenInput>;

export const ApiToken = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  prefix: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ApiToken = z.infer<typeof ApiToken>;

/** Response when creating a token: the plain token is shown exactly once. */
export const CreatedApiToken = ApiToken.extend({ token: z.string() });
export type CreatedApiToken = z.infer<typeof CreatedApiToken>;

export const ModuleActivation = z.object({ active: z.boolean() });
export type ModuleActivation = z.infer<typeof ModuleActivation>;

export const ModuleStatus = z.object({
  id: z.string(),
  name: LocalizedText,
  version: z.string(),
  active: z.boolean(),
  requires: z.array(z.string()),
  optional: z.array(z.string()),
});
export type ModuleStatus = z.infer<typeof ModuleStatus>;

/** Request a password reset link; the answer is the same whether the user exists or not. */
export const PasswordResetRequest = z.object({ login: z.string().trim().min(1) });
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

export const PasswordResetConfirm = z.object({ token: z.string().min(10), password: Password });
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirm>;
