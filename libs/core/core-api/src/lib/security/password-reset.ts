import { BadRequestException, Body, Controller, HttpCode, HttpException, HttpStatus, Injectable, Logger, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { Request } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { type BrigadeSettings, ConfirmEmail, PasswordResetConfirm, PasswordResetRequest } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { SettingsService } from '../settings/settings.js';
import { MailService } from '../tasks/mail.service.js';
import { ZodPipe } from '../zod.pipe.js';
import { Public } from './decorators.js';
import { assertEmailFree, usersWithEmail } from './emails.js';
import { generateSecret, hashPassword, hashSecret } from './password.js';
import { assertPasswordAllowed } from './password-policy.js';
import { RateLimits } from './rate-limits.js';
import { Session, User } from './security.entities.js';

const RESET_VALID_MS = 60 * 60_000;
const INVITATION_VALID_DAYS = 7;
const EMAIL_VALID_MS = 24 * 60 * 60_000;
const WINDOW_MS = 15 * 60_000;
/** Requests per address within the window; generous, since behind a proxy many users may share one address. */
const PER_ADDRESS = { limit: 20, windowMs: WINDOW_MS };
/** Links sent per account within the window. */
const PER_ACCOUNT = { limit: 3, windowMs: WINDOW_MS };

/** What a one-time link does: set a password (reset, invitation) or confirm a new e-mail address. */
export type LinkPurpose = 'reset' | 'invitation' | 'email';

/** A one-time link sent by e-mail; only the SHA-256 of the token is stored. */
export const PasswordResetSchema = defineEntity({
  name: 'PasswordReset',
  schema: 'core',
  tableName: 'password_reset',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    user: () => p.manyToOne(User).deleteRule('cascade'),
    purpose: p.string().$type<LinkPurpose>().default('reset'),
    /** For `email`: the new address that becomes effective with the link. */
    email: p.string().nullable(),
    hash: p.string().unique(),
    createdAt: p.datetime(),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
  },
});
export class PasswordReset extends PasswordResetSchema.class {}
PasswordResetSchema.setClass(PasswordReset);

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');
  /** The processing of the last request; tests wait for it. */
  pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly em: EntityManager,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    private readonly rateLimits: RateLimits,
  ) {}

  /**
   * Base of links in e-mails. Built only from the configured public address (brigade settings or `FORGA_PUBLIC_URL`),
   * never from request headers, so a forged `Origin` cannot redirect a link.
   */
  async baseUrl(): Promise<string> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const base = (brigade?.publicUrl || process.env.FORGA_PUBLIC_URL || '').replace(/\/$/, '');
    if (!/^https?:\/\//.test(base)) throw new ServiceUnavailableException({ code: 'auth.resetNotConfigured' });
    return base;
  }

  /**
   * Throws before anything is created if no link could be sent: `auth.resetNotConfigured` without the public address,
   * `mail.notConfigured` without SMTP server and sender.
   */
  async assertConfigured(): Promise<string> {
    const base = await this.baseUrl();
    await this.mail.assertConfigured();
    return base;
  }

  /**
   * Sends a link valid for one hour to the e-mail address of the user, found by username or e-mail address.
   * The answer is the same whether the account exists, the address is ambiguous or sending fails: the work happens
   * after the response. An e-mail address shared by several accounts resets none of them (no random account).
   */
  async request(login: string, address: string): Promise<void> {
    if (!(await this.rateLimits.hit('password-reset.address', address, PER_ADDRESS))) throw new HttpException({ code: 'auth.resetRateLimited' }, HttpStatus.TOO_MANY_REQUESTS);
    const base = await this.baseUrl();
    this.pending = this.send(login, base).catch((error: unknown) => {
      this.logger.warn(`Password reset e-mail failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async send(login: string, base: string): Promise<void> {
    const em = this.em.fork();
    const byName = await em.findOne(User, { username: login, active: true, technical: false });
    const candidates = byName ? [byName] : await usersWithEmail(em, login);
    if (candidates.length !== 1 || !candidates[0].email) {
      await this.audit.log(candidates.length > 1 ? 'auth.password-reset-ambiguous' : 'auth.password-reset-unknown', { login, accounts: candidates.length }, null);
      return;
    }
    const user = candidates[0];
    if (!(await this.rateLimits.hit('password-reset.account', user.id, PER_ACCOUNT))) {
      await this.audit.log('auth.password-reset-limited', {}, user.id);
      return;
    }
    const link = await this.createLink(em, user, base, RESET_VALID_MS, 'reset');
    const german = user.language === 'de';
    await this.mail.send({
      to: user.email!,
      subject: german ? 'f.orga: Passwort zurücksetzen' : 'f.orga: reset password',
      text: (german
        ? [`Hallo ${user.displayName},`, '', 'mit diesem Link setzen Sie ein neues Passwort (eine Stunde gültig):', link, '', 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.']
        : [`Hello ${user.displayName},`, '', 'use this link to set a new password (valid for one hour):', link, '', 'If you did not ask for it, ignore this e-mail.']
      ).join('\n'),
    });
    await this.audit.log('auth.password-reset-requested', {}, user.id);
  }

  /**
   * Invitation of a new user: a link to set the own password, valid for a week; earlier links of the user end.
   * Mail errors reach the caller. With the `em` of a transaction, the link is created inside it, so a failed e-mail
   * rolls back the user as well.
   */
  async invite(user: User, em: EntityManager = this.em.fork()): Promise<void> {
    if (!user.email) throw new BadRequestException({ code: 'mail.noRecipient' });
    const base = await this.baseUrl();
    await this.invalidateLinks(em, user.id);
    const link = await this.createLink(em, em.getReference(User, user.id), base, INVITATION_VALID_DAYS * 24 * 60 * 60_000, 'invitation');
    const german = user.language === 'de';
    await this.mail.send({
      to: user.email,
      subject: german ? 'f.orga: Einladung' : 'f.orga: invitation',
      text: (german
        ? [`Hallo ${user.displayName},`, '', `für Sie wurde ein Zugang zu f.orga angelegt. Ihr Benutzername: ${user.username}`, `Mit diesem Link legen Sie Ihr Passwort fest (${INVITATION_VALID_DAYS} Tage gültig):`, link]
        : [`Hello ${user.displayName},`, '', `an f.orga account has been created for you. Your username: ${user.username}`, `Use this link to set your password (valid for ${INVITATION_VALID_DAYS} days):`, link]
      ).join('\n'),
    });
  }

  /**
   * Sends a link to confirm a new e-mail address of the user to that address; the address takes effect only with the
   * link (so nobody can redirect password resets to an address he does not own). Earlier links end.
   */
  async requestEmailChange(user: User, email: string): Promise<void> {
    const base = await this.assertConfigured();
    await this.em.fork().transactional(async (em) => {
      await assertEmailFree(em, email, user.id, 'auth.emailTaken');
      await em.nativeUpdate(PasswordReset, { user: user.id, purpose: 'email', usedAt: null }, { usedAt: new Date() });
      const link = await this.createLink(em, em.getReference(User, user.id), base, EMAIL_VALID_MS, 'email', email, 'confirm-email');
      const german = user.language === 'de';
      await this.mail.send({
        to: email,
        subject: german ? 'f.orga: E-Mail-Adresse bestätigen' : 'f.orga: confirm e-mail address',
        text: (german
          ? [`Hallo ${user.displayName},`, '', 'mit diesem Link bestätigen Sie Ihre neue E-Mail-Adresse für f.orga (24 Stunden gültig):', link, '', 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.']
          : [`Hello ${user.displayName},`, '', 'use this link to confirm your new e-mail address for f.orga (valid for 24 hours):', link, '', 'If you did not ask for it, ignore this e-mail.']
        ).join('\n'),
      });
    });
    await this.audit.log('auth.email-change-requested', {}, user.id);
  }

  /** The new address that waits for confirmation, if any. */
  async pendingEmail(userId: string): Promise<string | null> {
    const link = await this.em.fork().findOne(PasswordReset, { user: userId, purpose: 'email', usedAt: null, expiresAt: { $gt: new Date() } }, { orderBy: { createdAt: 'desc' } });
    return link?.email ?? null;
  }

  /** Makes the confirmed address the user's address; all other open links of the user end. */
  async confirmEmail(token: string): Promise<void> {
    const changed = await this.em.fork().transactional(async (em) => {
      const link = await em.findOne(PasswordReset, { hash: hashSecret(token), purpose: 'email' }, { populate: ['user'] });
      if (!link?.email || link.usedAt || link.expiresAt < new Date() || !link.user.active) throw new BadRequestException({ code: 'auth.emailLinkInvalid' });
      await assertEmailFree(em, link.email, link.user.id, 'auth.emailTaken');
      const user = link.user;
      const previous = user.email ?? null;
      user.email = link.email;
      link.usedAt = new Date();
      await em.flush();
      await this.invalidateLinks(em, user.id);
      return { user, previous };
    });
    await this.audit.log('auth.email-changed', {}, changed.user.id);
    // The old address learns of the change, in case somebody else made it.
    if (changed.previous) {
      const german = changed.user.language === 'de';
      await this.mail
        .send({
          to: changed.previous,
          subject: german ? 'f.orga: E-Mail-Adresse geändert' : 'f.orga: e-mail address changed',
          text: (german
            ? [`Hallo ${changed.user.displayName},`, '', `die E-Mail-Adresse Ihres f.orga-Zugangs wurde in ${changed.user.email} geändert.`, 'Wenn Sie das nicht waren, wenden Sie sich bitte an die Verwaltung Ihrer Feuerwehr.']
            : [`Hello ${changed.user.displayName},`, '', `the e-mail address of your f.orga account was changed to ${changed.user.email}.`, 'If this was not you, please contact the administration of your fire brigade.']
          ).join('\n'),
        })
        .catch(() => undefined);
    }
  }

  /** Ends all open links of the user, e.g. after a change of e-mail address or password, or a new invitation. */
  async invalidateLinks(em: EntityManager, userId: string): Promise<void> {
    await em.nativeUpdate(PasswordReset, { user: userId, usedAt: null }, { usedAt: new Date() });
  }

  private async createLink(em: EntityManager, user: User, base: string, validMs: number, purpose: LinkPurpose, email: string | null = null, page = 'reset-password'): Promise<string> {
    const token = generateSecret();
    const now = new Date();
    em.create(PasswordReset, { user, purpose, email, hash: hashSecret(token), createdAt: now, expiresAt: new Date(now.getTime() + validMs), usedAt: null });
    await em.flush();
    return `${base}/${page}?token=${token}`;
  }

  /** Sets the new password and ends all sessions and other open links of the user. */
  async confirm(token: string, password: string): Promise<void> {
    const em = this.em.fork();
    const reset = await em.findOne(PasswordReset, { hash: hashSecret(token), purpose: { $in: ['reset', 'invitation'] } }, { populate: ['user'] });
    if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) {
      throw new BadRequestException({ code: 'auth.resetInvalid' });
    }
    const user = await em.findOneOrFail(User, reset.user.id, { populate: ['passwordHash'] });
    assertPasswordAllowed(password, [user.username, user.displayName, user.email]);
    user.passwordHash = await hashPassword(password);
    reset.usedAt = new Date();
    await em.nativeDelete(Session, { user });
    await em.flush();
    await this.invalidateLinks(em, user.id);
    await this.audit.log('auth.password-reset', {}, user.id);
  }
}

@Controller('core/password-reset')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async request(@Body(new ZodPipe(PasswordResetRequest)) input: PasswordResetRequest, @Req() req: Request) {
    await this.resets.request(input.login, req.ip ?? '');
    return { ok: true };
  }

  @Public()
  @Post('confirm')
  @HttpCode(200)
  async confirm(@Body(new ZodPipe(PasswordResetConfirm)) input: PasswordResetConfirm) {
    await this.resets.confirm(input.token, input.password);
    return { ok: true };
  }
}

/** The link sent to a new e-mail address; works without being logged in (e.g. opened on the phone). */
@Controller('core/email-confirmation')
export class EmailConfirmationController {
  constructor(private readonly resets: PasswordResetService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async confirm(@Body(new ZodPipe(ConfirmEmail)) input: ConfirmEmail) {
    await this.resets.confirmEmail(input.token);
    return { ok: true };
  }
}
