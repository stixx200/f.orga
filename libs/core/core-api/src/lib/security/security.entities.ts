import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { Language } from '@forga/core-contracts';

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
    active: p.boolean().default(true),
    /** Technical users never log in; they carry API tokens. */
    technical: p.boolean().default(false),
    lastLogin: p.datetime().nullable(),
    /** `issuer|subject` of the linked OIDC account. */
    oidcSubject: p.string().nullable().unique(),
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
    name: p.string().unique(),
    /** Key of the role template the role was created from; templates are only created once. */
    templateKey: p.string().nullable().unique(),
    description: p.string().default(''),
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
