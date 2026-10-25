import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Deadline, Language, ReminderSettings } from '@forga/core-contracts';
import { Audit, AuditEntry } from '../audit/audit.js';
import { AuthService } from '../security/auth.service.js';
import { User } from '../security/security.entities.js';
import { SettingsService } from '../settings/settings.js';
import { DeadlineRegistry } from './deadline-registry.js';
import { MailService } from './mail.service.js';

const SENT_ACTION = 'reminders.digest-sent';
const MAIL_ACTION = 'reminders.digest-mail';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const TEXT = {
  de: {
    subject: (n: number) => `f.orga: ${n} Frist(en)`,
    intro: 'folgende Fristen betreffen Sie:',
    stage: { overdue: 'überfällig', due: 'fällig', upcoming: 'bald fällig' },
    footer: 'Diese E-Mail kommt wöchentlich. Abbestellen im Benutzerprofil.',
    greeting: 'Hallo',
  },
  en: {
    subject: (n: number) => `f.orga: ${n} deadline(s)`,
    intro: 'the following deadlines concern you:',
    stage: { overdue: 'overdue', due: 'due', upcoming: 'upcoming' },
    footer: 'This e-mail is sent weekly. Unsubscribe in your user profile.',
    greeting: 'Hello',
  },
} as const;

function formatDate(date: string, language: Language): string {
  const [y, m, d] = date.split('-');
  return language === 'de' ? `${d}.${m}.${y}` : date;
}

/** Local date and time in Europe/Berlin. */
function berlinNow(now: Date): { date: string; weekday: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts['weekday']) + 1;
  return { date: `${parts['year']}-${parts['month']}-${parts['day']}`, weekday, hour: Number(parts['hour']) };
}

/** Sends the weekly digest of deadlines to every user with an e-mail address who has not opted out. */
@Injectable()
export class DigestService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DigestService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly em: EntityManager,
    private readonly auth: AuthService,
    private readonly deadlines: DeadlineRegistry,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.FORGA_DIGEST_SCHEDULER === 'off') return;
    // Never let a failure (e.g. the database being unavailable) escape the timer and end the process.
    this.timer = setInterval(() => {
      this.sendIfScheduled(new Date()).catch((error: unknown) => this.logger.error('Digest check failed', error instanceof Error ? error.stack : String(error)));
    }, CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Sends the digest once per week, on the configured weekday from the configured hour. */
  async sendIfScheduled(now: Date): Promise<number | null> {
    const settings = await this.settings.get<ReminderSettings>('reminders');
    if (!settings?.enabled) return null;
    const local = berlinNow(now);
    if (local.weekday !== settings.weekday || local.hour < settings.hour) return null;
    const last = await this.em.fork().findOne(AuditEntry, { action: SENT_ACTION }, { orderBy: { timestamp: 'desc' } });
    if (last?.details['asOf'] === local.date) return null;
    try {
      return await this.send(local.date);
    } catch (error) {
      this.logger.error('Sending the digest failed', error instanceof Error ? error.stack : String(error));
      return null;
    }
  }

  /**
   * Sends the digest now; returns the number of e-mails sent. Every e-mail is recorded, so a retry after a
   * failure (e.g. the mail server rejecting one address) does not send it twice; the digest counts as sent
   * only when no e-mail failed.
   */
  async send(asOf: string, options: { resend?: boolean } = {}): Promise<number> {
    const em = this.em.fork();
    const users = await em.find(User, { active: true, technical: false, receiveDigest: true, email: { $ne: null } });
    const already = new Set(
      (await em.find(AuditEntry, { action: MAIL_ACTION, timestamp: { $gte: new Date(Date.now() - 7 * 86_400_000) } }))
        .filter((e) => e.details['asOf'] === asOf)
        .map((e) => String(e.details['userId'])),
    );
    let sent = 0;
    let failed = 0;
    for (const user of users) {
      if (already.has(user.id) && !options.resend) continue;
      const authenticated = await this.auth.load(em, user, 'session');
      const deadlines = await this.deadlines.forUser(authenticated, asOf);
      if (!deadlines.length || !user.email) continue;
      try {
        await this.mail.send({ to: user.email, ...this.compose(user.displayName, user.language, deadlines) });
        await this.audit.log(MAIL_ACTION, { asOf, userId: user.id }, null);
        sent++;
      } catch (error) {
        failed++;
        this.logger.error(`Digest to user ${user.id} failed`, error instanceof Error ? error.stack : String(error));
      }
    }
    if (!failed) await this.audit.log(SENT_ACTION, { asOf, sent }, null);
    return sent;
  }

  private compose(name: string, language: Language, deadlines: Deadline[]): { subject: string; text: string } {
    const t = TEXT[language];
    const line = (d: Deadline, indent = '') => `${indent}- ${formatDate(d.dueOn, language)} (${t.stage[d.stage]}): ${d.title[language]} – ${d.subject.label}`;
    // Deadlines with a group (e.g. items by category and vehicle) follow under their heading.
    const groups = new Map<string, Deadline[]>();
    for (const d of deadlines.filter((x) => x.group)) groups.set(d.group![language], [...(groups.get(d.group![language]) ?? []), d]);
    const grouped = [...groups].toSorted(([a], [b]) => a.localeCompare(b, language)).flatMap(([heading, list]) => ['', `${heading}:`, ...list.map((d) => line(d, '  '))]);
    return {
      subject: t.subject(deadlines.length),
      text: [`${t.greeting} ${name},`, '', t.intro, '', ...deadlines.filter((d) => !d.group).map((d) => line(d)), ...grouped, '', t.footer].join('\n'),
    };
  }
}
