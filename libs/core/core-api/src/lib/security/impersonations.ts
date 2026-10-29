import { Controller, Get, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type BrigadeSettings, type MyImpersonation, SecuritySettings } from '@forga/core-contracts';
import { AuditEntry } from '../audit/audit.js';
import { MailService } from '../tasks/mail.service.js';
import { SettingsService } from '../settings/settings.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser } from './decorators.js';
import { User } from './security.entities.js';

/** An impersonation lasts at most an hour (`IMPERSONATION_MS` of the auth service). */
const MAX_MS = 60 * 60_000;

/**
 * Transparency of "Anmelden als" (L15): the user sees in the profile and "My area" when an administrator logged in as
 * them, with the reason, and gets an e-mail at the start (setting `security.notifyImpersonation`, default on).
 */
@Injectable()
export class Impersonations {
  private readonly logger = new Logger('Impersonations');

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  /** E-mail to the user; failures (no SMTP, no address) never stop the impersonation. */
  async notify(targetId: string, administrator: string, reason: string): Promise<void> {
    if (!SecuritySettings.parse((await this.settings.get('security')) ?? {}).notifyImpersonation) return;
    const target = await this.em.fork().findOne(User, targetId);
    if (!target?.email) return;
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const url = brigade?.publicUrl || process.env.FORGA_PUBLIC_URL;
    const de = target.language !== 'en';
    try {
      await this.mail.send({
        to: target.email,
        subject: de ? 'f.orga: Ein Administrator hat sich als Sie angemeldet' : 'f.orga: An administrator logged in as you',
        text: de
          ? `Hallo ${target.displayName},\n\n${administrator} hat sich soeben in f.orga als Sie angemeldet („Anmelden als“), um Ihre Sicht zu prüfen.\nGrund: ${reason}\n\nAlle Anmeldungen als Sie sehen Sie in f.orga unter „Mein Profil“${url ? `: ${url.replace(/\/$/, '')}/profile` : '.'}\nWenn Ihnen das unbekannt vorkommt, wenden Sie sich an den Kommandanten oder den Datenschutzbeauftragten.`
          : `Hello ${target.displayName},\n\n${administrator} has just logged in to f.orga as you (“log in as”) to check your view.\nReason: ${reason}\n\nYou see all logins as you in f.orga under “My profile”${url ? `: ${url.replace(/\/$/, '')}/profile` : '.'}\nIf this seems unfamiliar, contact the commander or the data protection officer.`,
      });
    } catch (error) {
      this.logger.warn(`Notifying about an impersonation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Impersonations of the user's account from the audit log (as long as it is kept), newest first. */
  async of(userId: string): Promise<MyImpersonation[]> {
    const em = this.em.fork();
    const entries = await em.find(
      AuditEntry,
      { action: { $in: ['auth.impersonation-started', 'auth.impersonation-ended'] }, details: { targetId: userId } },
      { orderBy: { timestamp: 'asc' } },
    );
    const adminIds = [...new Set(entries.map((e) => e.userId).filter((id): id is string => Boolean(id)))];
    const names = new Map((adminIds.length ? await em.find(User, { id: { $in: adminIds } }, { fields: ['id', 'displayName'] }) : []).map((u) => [u.id, u.displayName]));
    const result: MyImpersonation[] = [];
    entries.forEach((entry, index) => {
      if (entry.action !== 'auth.impersonation-started') return;
      const start = entry.timestamp.getTime();
      const end = entries.slice(index + 1).find((e) => e.userId === entry.userId && e.action === 'auth.impersonation-ended' && e.timestamp.getTime() - start <= MAX_MS);
      const expired = Date.now() - start > MAX_MS;
      result.push({
        startedAt: entry.timestamp.toISOString(),
        endedAt: end ? end.timestamp.toISOString() : expired ? new Date(start + MAX_MS).toISOString() : null,
        administrator: (entry.userId && names.get(entry.userId)) || String(entry.details['actorName'] ?? '–'),
        reason: String(entry.details['reason'] ?? ''),
      });
    });
    return result.toReversed();
  }
}

@Controller('core/me')
export class ImpersonationsController {
  constructor(private readonly impersonations: Impersonations) {}

  /** "Anmeldungen als Sie"; during an impersonation the administrator sees the list of the user. */
  @Get('impersonations')
  list(@CurrentUser() user: AuthenticatedUser): Promise<MyImpersonation[]> {
    return this.impersonations.of(user.id);
  }
}
