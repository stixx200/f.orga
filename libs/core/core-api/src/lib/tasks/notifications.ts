import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { BrigadeSettings, Language } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { User } from '../security/security.entities.js';
import { SettingsService } from '../settings/settings.js';
import { MailService } from './mail.service.js';

export interface Notification {
  /** Notification permission, e.g. `equipment.defects.notify`. */
  permission: string;
  /** Department concerned; `null` reaches only brigade-wide assignments. */
  departmentId: string | null;
  /** Subject and text in the language of the recipient. */
  compose: (language: Language, displayName: string) => { subject: string; text: string };
  /** Page in f.orga (e.g. `/equipment/items/<id>`), appended as a link when the public address is configured. */
  path?: string;
  /** Recorded in the audit log together with the recipients. */
  action: string;
  details?: Record<string, unknown>;
}

/** Does the role pattern name the permission itself or its module (`equipment.*`)? The global `*` does not count. */
function names(pattern: string, permission: string): boolean {
  if (pattern === permission) return true;
  return pattern.endsWith('.*') && pattern !== '*' && permission.startsWith(pattern.slice(0, -1));
}

/**
 * Immediate e-mails about events, e.g. a new defect. Recipients are active users with an e-mail address whose
 * roles name the notification permission for the department (or brigade-wide). Administrators with `*` only
 * receive them if one of their roles names the permission, so an administrator account is not flooded.
 * A failure is logged and never reaches the caller.
 */
@Injectable()
export class Notifications {
  private readonly logger = new Logger(Notifications.name);

  constructor(
    private readonly em: EntityManager,
    private readonly mail: MailService,
    private readonly audit: Audit,
    private readonly settings: SettingsService,
  ) {}

  async recipients(permission: string, departmentId: string | null): Promise<User[]> {
    const users = await this.em.fork().find(User, { active: true, technical: false, email: { $ne: null } }, { populate: ['roles.role'] });
    return users.filter((user) =>
      user.roles.getItems().some((a) => {
        if (a.role.permissionsAllDepartments.some((p) => names(p, permission))) return true;
        if (!a.role.permissions.some((p) => names(p, permission))) return false;
        return !a.departmentId || a.departmentId === departmentId;
      }),
    );
  }

  /** Address of a page in f.orga for e-mails; `null` without a configured public address. */
  async link(path: string): Promise<string | null> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const base = (brigade?.publicUrl || process.env.FORGA_PUBLIC_URL || '').replace(/\/$/, '');
    return /^https?:\/\//.test(base) ? `${base}${path}` : null;
  }

  /** Sends the notification; returns the number of e-mails sent. */
  async notify(notification: Notification): Promise<number> {
    try {
      const recipients = await this.recipients(notification.permission, notification.departmentId);
      if (!recipients.length) return 0;
      const link = notification.path ? await this.link(notification.path) : null;
      const sent: string[] = [];
      for (const user of recipients) {
        const { subject, text } = notification.compose(user.language, user.displayName);
        try {
          await this.mail.send({ to: user.email!, subject, text: link ? `${text}\n\n${link}` : text });
          sent.push(user.username);
        } catch (error) {
          this.logger.warn(`Notification "${notification.action}" to ${user.username} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (sent.length) await this.audit.log(notification.action, { ...notification.details, recipients: sent });
      return sent.length;
    } catch (error) {
      this.logger.error(`Notification "${notification.action}" failed`, error instanceof Error ? error.stack : String(error));
      return 0;
    }
  }
}
