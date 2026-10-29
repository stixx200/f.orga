import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AuditEntry } from '../audit/audit.js';
import { HistoryEntry } from '../history/history.entity.js';
import { AccessLogEntity } from '../privacy/access-log.js';
import { ConsentEntity } from '../privacy/consents.js';
import { PrivacyRequestEntity } from '../privacy/privacy.entities.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { PasswordReset } from '../security/password-reset.js';
import { ApiToken, Role, Session, User } from '../security/security.entities.js';
import { Setting, SettingsService } from '../settings/settings.js';

const auditDto = (e: AuditEntry) => ({
  timestamp: e.timestamp.toISOString(),
  userId: e.userId ?? null,
  impersonatorId: e.impersonatorId ?? null,
  action: e.action,
  details: e.details,
});

/** Display name of the accounts of anonymised persons; reads the same in every language. */
const ANONYMIZED_NAME = 'N. N.';

/**
 * The core's part of the full export, of the data access request and of the anonymisation: users, roles and settings,
 * never password hashes, session or token secrets and write-only settings.
 */
@Injectable()
export class CoreExport {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Settings sections reserved for their managers (SMTP account, OIDC client, …) and managers' fields (e.g. the secret
   * of a calendar feed) are only exported for users who manage them.
   */
  async all(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const users = await em.find(User, {}, { populate: ['roles.role'], orderBy: { username: 'asc' } });
    const roles = await em.find(Role, {});
    const settings = await em.find(Setting, {}, { orderBy: { section: 'asc' } });
    const tokens = await em.find(ApiToken, {}, { orderBy: { createdAt: 'asc' } });
    return {
      users: users.map((u) => this.user(u)),
      roles: roles
        .toSorted((a, b) => a.name.de.localeCompare(b.name.de))
        .map((r) => ({ id: r.id, name: r.name, templateKey: r.templateKey ?? null, description: r.description, permissions: r.permissions, permissionsAllDepartments: r.permissionsAllDepartments })),
      settings: Object.fromEntries(settings.filter((s) => this.settings.mayRead(user, s.section)).map((s) => [s.section, this.settings.redact(s.section, s.value, user)])),
      apiTokens: tokens.map((t) => ({ id: t.id, name: t.name, scopes: t.scopes, prefix: t.prefix, createdAt: t.createdAt.toISOString(), expiresAt: t.expiresAt?.toISOString() ?? null, revokedAt: t.revokedAt?.toISOString() ?? null })),
    };
  }

  /** User accounts linked to the person with roles, sessions (logins) and the audit entries about them. */
  async person(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const users = await em.find(User, { personId }, { populate: ['roles.role'] });
    // Data protection requests of the person belong to the data stored about it.
    const privacyRequests = (await em.find(PrivacyRequestEntity, { personId }, { orderBy: { receivedOn: 'asc' } })).map((r) => ({
      kind: r.kind,
      receivedOn: r.receivedOn,
      channel: r.channel,
      content: r.content,
      dueOn: r.dueOn,
      extendedUntil: r.extendedUntil ?? null,
      status: r.status,
      closedOn: r.closedOn ?? null,
      rejectionReason: r.rejectionReason,
      rectification: r.rectification ? { area: r.rectification.area, wrong: r.rectification.wrong, correct: r.rectification.correct, correctedAt: r.rectification.correctedAt } : null,
    }));
    // Consents with the version consented to (L9) and accesses to especially protected data (L15).
    const consents = (await em.find(ConsentEntity, { personId }, { orderBy: { givenOn: 'asc' } })).map((c) => ({
      key: c.key,
      version: c.definitionVersion,
      title: c.title,
      text: c.text,
      givenOn: c.givenOn,
      givenVia: c.givenVia,
      withdrawnOn: c.withdrawnOn ?? null,
      withdrawnVia: c.withdrawnVia ?? null,
      supersededOn: c.supersededOn ?? null,
    }));
    const accessLog = (await em.find(AccessLogEntity, { personId }, { orderBy: { day: 'asc' } })).map((a) => ({ userId: a.userId, area: a.area, day: a.day, count: a.count }));
    if (!users.length) return { users: [], privacyRequests, consents, accessLog };
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
      privacyRequests,
      consents,
      accessLog,
    };
  }

  /**
   * Accounts of anonymised persons are locked and lose name, e-mail address, password, sessions, tokens, open links and
   * their own history; the account itself stays, so other histories refer to "N. N." instead of a missing user.
   */
  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    // Data protection requests stay as proof (kind, dates, outcome), without the texts about the person.
    const requests = await em.find(PrivacyRequestEntity, { personId: { $in: [...personIds] } }, { fields: ['id'] });
    if (requests.length) {
      const requestIds = requests.map((r) => r.id);
      await em.nativeUpdate(PrivacyRequestEntity, { id: { $in: requestIds } }, { content: '', identityNote: '', notes: '', activity: '', rectification: null });
      await em.nativeDelete(HistoryEntry, { entity: 'core.privacy_request', entityId: { $in: requestIds } });
    }
    const users = await em.find(User, { personId: { $in: [...personIds] } }, { populate: ['passwordHash'] });
    if (!users.length) return;
    for (const user of users) {
      // The username must stay unique; the ID does not reveal anything about the person.
      em.assign(user, { username: `anonymized-${user.id}`, displayName: ANONYMIZED_NAME, email: null, passwordHash: null, oidcSubject: null, active: false, hiddenTasks: [] });
    }
    await em.flush();
    const ids = users.map((u) => u.id);
    await em.nativeDelete(Session, { user: { $in: ids } });
    await em.nativeDelete(PasswordReset, { user: { $in: ids } });
    await em.nativeUpdate(ApiToken, { user: { $in: ids }, revokedAt: null }, { revokedAt: new Date() });
    // The history of the accounts holds the former names and addresses.
    await em.nativeDelete(HistoryEntry, { $or: [{ entity: 'core.user', entityId: { $in: ids } }, { parentEntity: 'core.user', parentId: { $in: ids } }] });
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
      privacyNoticeVersion: u.privacyNoticeVersion ?? null,
      privacyNoticeAcknowledgedAt: u.privacyNoticeAcknowledgedAt?.toISOString() ?? null,
      roles: u.roles.getItems().map((a) => ({ roleId: a.role.id, role: a.role.name, departmentId: a.departmentId ?? null })),
    };
  }
}
