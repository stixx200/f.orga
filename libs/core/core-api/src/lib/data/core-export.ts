import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { SECRET_SETTING_FIELDS } from '@forga/core-contracts';
import { AuditEntry } from '../audit/audit.js';
import { ApiToken, Role, Session, User } from '../security/security.entities.js';
import { Setting } from '../settings/settings.js';

const auditDto = (e: AuditEntry) => ({
  timestamp: e.timestamp.toISOString(),
  userId: e.userId ?? null,
  impersonatorId: e.impersonatorId ?? null,
  action: e.action,
  details: e.details,
});

/**
 * The core's part of the full export and of the data access request: users, roles and settings,
 * never password hashes, session or token secrets and write-only settings.
 */
@Injectable()
export class CoreExport {
  constructor(private readonly em: EntityManager) {}

  async all(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const users = await em.find(User, {}, { populate: ['roles.role'], orderBy: { username: 'asc' } });
    const roles = await em.find(Role, {}, { orderBy: { name: 'asc' } });
    const settings = await em.find(Setting, {}, { orderBy: { section: 'asc' } });
    const tokens = await em.find(ApiToken, {}, { orderBy: { createdAt: 'asc' } });
    return {
      users: users.map((u) => this.user(u)),
      roles: roles.map((r) => ({ id: r.id, name: r.name, templateKey: r.templateKey ?? null, description: r.description, permissions: r.permissions, permissionsAllDepartments: r.permissionsAllDepartments })),
      settings: Object.fromEntries(settings.map((s) => [s.section, this.withoutSecrets(s.section, s.value)])),
      apiTokens: tokens.map((t) => ({ id: t.id, name: t.name, scopes: t.scopes, prefix: t.prefix, createdAt: t.createdAt.toISOString(), expiresAt: t.expiresAt?.toISOString() ?? null, revokedAt: t.revokedAt?.toISOString() ?? null })),
    };
  }

  /** User accounts linked to the person with roles, sessions (logins) and the audit entries about them. */
  async person(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const users = await em.find(User, { personId }, { populate: ['roles.role'] });
    if (!users.length) return { users: [] };
    const ids = users.map((u) => u.id);
    const sessions = await em.find(Session, { user: { $in: ids } }, { populate: ['impersonator'], orderBy: { createdAt: 'asc' } });
    const audit = await em.find(
      AuditEntry,
      { $or: [{ userId: { $in: ids } }, { impersonatorId: { $in: ids } }, ...ids.map((id) => ({ details: { userId: id } }))] },
      { orderBy: { timestamp: 'asc' } },
    );
    return {
      users: users.map((u) => ({
        ...this.user(u),
        sessions: sessions
          .filter((s) => s.user.id === u.id)
          .map((s) => ({ createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(), impersonatedBy: s.impersonator?.displayName ?? null, impersonationReason: s.impersonationReason ?? null })),
      })),
      audit: audit.map(auditDto),
    };
  }

  private user(u: User) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email ?? null,
      personId: u.personId ?? null,
      language: u.language,
      receiveDigest: u.receiveDigest,
      active: u.active,
      technical: u.technical,
      lastLogin: u.lastLogin?.toISOString() ?? null,
      oidcLinked: Boolean(u.oidcSubject),
      roles: u.roles.getItems().map((a) => ({ roleId: a.role.id, role: a.role.name, departmentId: a.departmentId ?? null })),
    };
  }

  private withoutSecrets(section: string, value: Record<string, unknown>): Record<string, unknown> {
    const visible = { ...value };
    for (const field of SECRET_SETTING_FIELDS[section] ?? []) delete visible[field];
    return visible;
  }
}
