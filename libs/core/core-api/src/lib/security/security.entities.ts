import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { Language, LocalizedText } from '@forga/core-contracts';

export const UserSchema = defineEntity({
  name: 'User',
  schema: 'core',
  tableName: 'user',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    username: p.string().unique(),
    displayName: p.string(),
    email: p.string().nullable(),
    passwordHash: p.string().nullable().hidden().lazy(),
    /** Person in the masterdata module; no foreign key across modules. At most one user per person. */
    personId: p.string().nullable().unique(),
    language: p.string().$type<Language>().default('de'),
    receiveDigest: p.boolean().default(true),
    /** Tasks the user hides in the bell and on the start page: modules (`training`) or kinds (`training:excuse-open`). */
    hiddenTasks: p.json<string[]>().defaultRaw("'[]'::jsonb").onCreate(() => []),
    active: p.boolean().default(true),
    /** Technical users never log in; they carry API tokens. */
    technical: p.boolean().default(false),
    lastLogin: p.datetime().nullable(),
    /** `issuer|subject` of the linked OIDC account. */
    oidcSubject: p.string().nullable().unique(),
    /** Version of the privacy notice the user acknowledged ("Zur Kenntnis genommen", no consent) and when. */
    privacyNoticeVersion: p.integer().nullable(),
    privacyNoticeAcknowledgedAt: p.datetime().nullable(),
    roles: () => p.oneToMany(RoleAssignment).mappedBy('user').orphanRemoval(),
    version: p.integer().version(),
  },
});
export class User extends UserSchema.class {}
UserSchema.setClass(User);

export const RoleSchema = defineEntity({
  name: 'Role',
  schema: 'core',
  tableName: 'role',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** In both languages; unique in each language (checked by the server, ignoring case). */
    name: p.json<LocalizedText>(),
    /** Key of the role template the role was created from; templates are only created once. */
    templateKey: p.string().nullable().unique(),
    description: p.json<{ de: string; en: string }>().defaultRaw(`'{"de":"","en":""}'::jsonb`).onCreate(() => ({ de: '', en: '' })),
    /** Permission IDs or patterns (`*`, `masterdata.*`). */
    permissions: p.json<string[]>(),
    /** Apply in all departments even for an assignment to one department. */
    permissionsAllDepartments: p.json<string[]>().defaultRaw("'[]'::jsonb").onCreate(() => []),
    version: p.integer().version(),
  },
});
export class Role extends RoleSchema.class {}
RoleSchema.setClass(Role);

export const RoleAssignmentSchema = defineEntity({
  name: 'RoleAssignment',
  schema: 'core',
  tableName: 'role_assignment',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    user: () => p.manyToOne(User).deleteRule('cascade'),
    role: () => p.manyToOne(Role).deleteRule('cascade'),
    /** `null` = whole brigade. Department in the masterdata module; no foreign key across modules. */
    departmentId: p.string().nullable(),
  },
});
export class RoleAssignment extends RoleAssignmentSchema.class {}
RoleAssignmentSchema.setClass(RoleAssignment);

export const SessionSchema = defineEntity({
  name: 'Session',
  schema: 'core',
  tableName: 'session',
  properties: {
    /** SHA-256 of the cookie value. */
    id: p.string().primary(),
    user: () => p.manyToOne(User).deleteRule('cascade'),
    createdAt: p.datetime(),
    expiresAt: p.datetime().index(),
    /** Impersonation: the administrator acting as `user`, and why. */
    impersonator: () => p.manyToOne(User).nullable().deleteRule('cascade'),
    impersonationReason: p.text().nullable(),
    /** Confirmed with the second factor until then (step-up); fixed, not extended by activity. */
    elevatedUntil: p.datetime().nullable(),
  },
});
export class Session extends SessionSchema.class {}
SessionSchema.setClass(Session);

export const ApiTokenSchema = defineEntity({
  name: 'ApiToken',
  schema: 'core',
  tableName: 'api_token',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    name: p.string(),
    user: () => p.manyToOne(User).deleteRule('cascade'),
    scopes: p.json<string[]>(),
    /** First characters of the token, to recognise it in lists. */
    prefix: p.string(),
    hash: p.string().unique().hidden(),
    createdAt: p.datetime(),
    expiresAt: p.datetime().nullable(),
    lastUsedAt: p.datetime().nullable(),
    revokedAt: p.datetime().nullable(),
  },
});
export class ApiToken extends ApiTokenSchema.class {}
ApiTokenSchema.setClass(ApiToken);

/**
 * Second factor of a user (TOTP). Never in the history, exports or API responses: the secret is encrypted with
 * `FORGA_SECRET_KEY`, recovery codes are stored as hashes only. Also holds the counter of wrong codes (rate limit).
 */
export const UserMfaSchema = defineEntity({
  name: 'UserMfa',
  schema: 'core',
  tableName: 'user_mfa',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    user: () => p.manyToOne(User).unique().deleteRule('cascade'),
    /** TOTP secret, encrypted (`encryptSecret`). */
    secret: p.text().hidden(),
    /** `null` while being set up (not confirmed with a code yet). */
    confirmedAt: p.datetime().nullable(),
    /** Time step of the last accepted code: a code counts only once. */
    lastStep: p.integer().nullable(),
    /** SHA-256 of the unused recovery codes. */
    recoveryCodes: p.json<string[]>().hidden().defaultRaw("'[]'::jsonb").onCreate(() => []),
    /** Wrong codes since `failureWindowStart`; after too many, locked until `lockedUntil`. */
    failures: p.integer().default(0),
    failureWindowStart: p.datetime().nullable(),
    lockedUntil: p.datetime().nullable(),
  },
});
export class UserMfa extends UserMfaSchema.class {}
UserMfaSchema.setClass(UserMfa);
