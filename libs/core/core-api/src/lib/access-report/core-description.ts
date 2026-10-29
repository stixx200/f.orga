import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AuditEntry } from '../audit/audit.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { AccessLog } from '../privacy/access-log.js';
import { ConsentService } from '../privacy/consents.js';
import { OrganizationDirectory } from '../security/organization-directory.js';
import { ApiToken, Session, User, UserMfa } from '../security/security.entities.js';
import { AUDIT_LABELS } from './audit-labels.js';
import type { DescribeContext, PersonDataBlock, PersonDataSection } from './person-description.js';

/** The core's part of the access report: the user account of the person with roles, logins and its audit entries. */
@Injectable()
export class CoreDescription {
  constructor(
    private readonly em: EntityManager,
    private readonly organization: OrganizationDirectory,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
    private readonly consents: ConsentService,
    private readonly accessLog: AccessLog,
  ) {}

  /** Consents (L9), accesses to especially protected data (L15) and the user account with its protocol. */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const consents = await this.consents.describe(personId, ctx);
    const accesses = await this.describeAccesses(personId, ctx);
    const account = await this.describeAccount(personId, ctx);
    return [...(consents ? [consents] : []), ...(accesses ? [accesses] : []), ...(account ? [account] : [])];
  }

  /**
   * "Zugriffe auf besonders geschützte Daten": from the read log, per function (never the name of the reader), area and
   * day; own accesses are not logged.
   */
  private async describeAccesses(personId: string, ctx: DescribeContext): Promise<PersonDataSection | null> {
    const rows = await this.accessLog.forPerson(personId);
    if (!rows.length) return null;
    return {
      key: 'core.access-log',
      title: ctx.t('Zugriffe auf besonders geschützte Daten', 'Access to especially protected data'),
      activity: 'core.accounts',
      categories: [ctx.t('Leseprotokoll', 'Read log')],
      blocks: [
        {
          kind: 'table',
          title: ctx.t('Wer hat wann auf Gesundheitsdaten und andere besonders geschützte Daten zugegriffen', 'Who accessed health data and other especially protected data when'),
          columns: [ctx.t('Tag', 'Day'), ctx.t('Funktion', 'Function'), ctx.t('Bereich', 'Area'), ctx.t('Zugriffe', 'Accesses')],
          rows: await Promise.all(rows.map(async (r) => [ctx.date(r.day), await ctx.actor(r.userId), ctx.text(this.accessLog.areaLabel(r.area)), String(r.count)])),
        },
      ],
    };
  }

  private async describeAccount(personId: string, ctx: DescribeContext): Promise<PersonDataSection | null> {
    const em = this.em.fork();
    const users = await em.find(User, { personId }, { populate: ['roles.role'] });
    if (!users.length) return null;
    const ids = users.map((u) => u.id);
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name ?? '']));
    const mfa = await em.find(UserMfa, { user: { $in: ids }, confirmedAt: { $ne: null } });
    const sessions = await em.find(Session, { user: { $in: ids } }, { orderBy: { createdAt: 'desc' } });
    const tokens = await em.find(ApiToken, { user: { $in: ids } }, { orderBy: { createdAt: 'asc' } });
    const audit = await em.find(
      AuditEntry,
      // Logins as the person by an administrator (L15) count as entries of the account.
      { $or: [{ userId: { $in: ids } }, { impersonatorId: { $in: ids } }, ...ids.map((id) => ({ details: { userId: id } })), ...ids.map((id) => ({ details: { targetId: id } }))] },
      { orderBy: { timestamp: 'desc' } },
    );
    const blocks: PersonDataBlock[] = [];
    for (const user of users) {
      const confirmed = mfa.find((m) => m.user.id === user.id)?.confirmedAt;
      const roles = user.roles
        .getItems()
        .map((a) => `${ctx.text(a.role.name)}${a.departmentId ? ` (${departments.get(a.departmentId) || ctx.t('eine Abteilung', 'one department')})` : ''}`)
        .toSorted((a, b) => a.localeCompare(b));
      blocks.push({
        kind: 'fields',
        title: ctx.t('Benutzerkonto', 'User account'),
        rows: [
          { label: ctx.t('Benutzername', 'Username'), value: user.username },
          { label: ctx.t('Angezeigter Name', 'Display name'), value: user.displayName },
          { label: ctx.t('E-Mail-Adresse', 'E-mail address'), value: ctx.value(user.email) },
          { label: ctx.t('Sprache', 'Language'), value: user.language === 'de' ? ctx.t('Deutsch', 'German') : ctx.t('Englisch', 'English') },
          { label: ctx.t('Wöchentliche E-Mail mit Fristen', 'Weekly e-mail with deadlines'), value: ctx.yesNo(user.receiveDigest) },
          { label: ctx.t('Konto aktiv', 'Account active'), value: ctx.yesNo(user.active) },
          { label: ctx.t('Letzte Anmeldung', 'Last login'), value: ctx.dateTime(user.lastLogin) },
          { label: ctx.t('Mit Konto der Gemeinde verknüpft', 'Linked to the municipal account'), value: ctx.yesNo(Boolean(user.oidcSubject)) },
          { label: ctx.t('Zweiter Faktor', 'Second factor'), value: confirmed ? ctx.t(`eingerichtet am ${ctx.date(confirmed)}`, `set up on ${ctx.date(confirmed)}`) : ctx.t('nicht eingerichtet', 'not set up') },
          { label: ctx.t('Rollen', 'Roles'), value: roles.join(', ') || '–' },
        ],
      });
      const own = sessions.filter((s) => s.user.id === user.id);
      if (own.length) {
        blocks.push({
          kind: 'table',
          title: ctx.t('Aktuelle Sitzungen', 'Current sessions'),
          columns: [ctx.t('Beginn', 'Start'), ctx.t('Gültig bis', 'Valid until'), ctx.t('Art', 'Kind')],
          rows: await Promise.all(
            own.map(async (s) => [
              ctx.dateTime(s.createdAt),
              ctx.dateTime(s.expiresAt),
              s.impersonator
                ? ctx.t(`Anmeldung als Sie durch ${await ctx.actor(s.impersonator.id)}`, `Logged in as you by ${await ctx.actor(s.impersonator.id)}`) +
                  (s.impersonationReason ? ctx.t(`, Grund: ${s.impersonationReason}`, `, reason: ${s.impersonationReason}`) : '')
                : ctx.t('Anmeldung', 'Login'),
            ]),
          ),
        });
      }
      const ownTokens = tokens.filter((t) => t.user.id === user.id);
      if (ownTokens.length) {
        blocks.push({
          kind: 'table',
          title: ctx.t('API-Tokens', 'API tokens'),
          columns: [ctx.t('Bezeichnung', 'Name'), ctx.t('Erzeugt', 'Created'), ctx.t('Gültig bis', 'Valid until'), ctx.t('Widerrufen', 'Revoked')],
          rows: ownTokens.map((t) => [t.name, ctx.date(t.createdAt), ctx.date(t.expiresAt), ctx.date(t.revokedAt)]),
        });
      }
    }
    if (audit.length) {
      const modules = new Map(this.options.modules.map((m) => [m.manifest.id, ctx.text(m.manifest.name)]));
      blocks.push({
        kind: 'table',
        title: ctx.t('Protokoll des Kontos (Audit-Log)', 'Protocol of the account (audit log)'),
        columns: [ctx.t('Zeitpunkt', 'Time'), ctx.t('Vorgang', 'Action'), ctx.t('Durch', 'By')],
        rows: await Promise.all(
          audit.map(async (entry) => {
            const label = AUDIT_LABELS[entry.action];
            const module = modules.get(entry.action.slice(0, entry.action.indexOf('.')));
            const action = label ? ctx.text(label) : module ? ctx.t(`Vorgang: ${module}`, `Action: ${module}`) : ctx.t('Vorgang in der Verwaltung', 'Administrative action');
            const by = entry.impersonatorId && !ids.includes(entry.impersonatorId)
              ? ctx.t(`${await ctx.actor(entry.impersonatorId)} (angemeldet als Sie)`, `${await ctx.actor(entry.impersonatorId)} (logged in as you)`)
              : await ctx.actor(entry.userId);
            return [ctx.dateTime(entry.timestamp), action, by];
          }),
        ),
      });
    }
    return {
      key: 'core.account',
      title: ctx.t('Benutzerkonto', 'User account'),
      activity: 'core.accounts',
      categories: [ctx.t('Benutzerkonto', 'User account'), ctx.t('Anmeldungen', 'Logins'), ctx.t('Protokolle', 'Protocols')],
      blocks,
      records: [{ entity: 'core.user', ids, label: ctx.t('Benutzerkonto', 'User account') }],
      labels: { 'core.role_assignment': ctx.t('Rollenzuweisung', 'Role assignment') },
    };
  }
}
