import { BadRequestException, Body, Controller, HttpCode, HttpException, HttpStatus, Injectable, Logger, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import type { Request } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { type BrigadeSettings, PasswordResetConfirm, PasswordResetRequest } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { SettingsService } from '../settings/settings.js';
import { MailService } from '../tasks/mail.service.js';
import { ZodPipe } from '../zod.pipe.js';
import { Public } from './decorators.js';
import { generateSecret, hashPassword, hashSecret } from './password.js';
import { Session, User } from './security.entities.js';

const RESET_VALID_MS = 60 * 60_000;
const INVITATION_VALID_DAYS = 7;
const WINDOW_MS = 15 * 60_000;
/** Requests per address within the window; generous, since behind a proxy many users may share one address. */
const MAX_PER_ADDRESS = 20;
/** Links sent per account within the window. */
const MAX_PER_ACCOUNT = 3;
const MAX_TRACKED = 10_000;

/** A one-time link to set a new password (reset or invitation); only the SHA-256 of the token is stored. */
export const PasswordResetSchema = defineEntity({
  name: 'PasswordReset',
  schema: 'core',
  tableName: 'password_reset',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    user: () => p.manyToOne(User).deleteRule('cascade'),
    hash: p.string().unique(),
    createdAt: p.datetime(),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
  },
});
export class PasswordReset extends PasswordResetSchema.class {}
PasswordResetSchema.setClass(PasswordReset);

/** Counts events per key within a sliding window, bounded in size. */
class RateLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly max: number) {}

  /** Records an attempt; `false` if the key has used up its attempts. */
  take(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    if (!this.hits.has(key) && this.hits.size >= MAX_TRACKED) this.hits.delete(this.hits.keys().next().value!);
    this.hits.set(key, [...recent, now]);
    return true;
  }
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');
  private readonly perAddress = new RateLimit(MAX_PER_ADDRESS);
  private readonly perAccount = new RateLimit(MAX_PER_ACCOUNT);
  /** The processing of the last request; tests wait for it. */
  pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly em: EntityManager,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
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

  /** Throws `auth.resetNotConfigured` before anything is created, if no link could be sent. */
  assertConfigured(): Promise<string> {
    return this.baseUrl();
  }

  /**
   * Sends a link valid for one hour to the e-mail address of the user, found by username or e-mail address.
   * The answer is the same whether the account exists, the address is ambiguous or sending fails: the work happens
   * after the response. An e-mail address shared by several accounts resets none of them (no random account).
   */
  async request(login: string, address: string): Promise<void> {
    if (!this.perAddress.take(address)) throw new HttpException({ code: 'auth.resetRateLimited' }, HttpStatus.TOO_MANY_REQUESTS);
    const base = await this.baseUrl();
    this.pending = this.send(login, base).catch((error: unknown) => {
      this.logger.warn(`Password reset e-mail failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async send(login: string, base: string): Promise<void> {
    const em = this.em.fork();
    const byName = await em.findOne(User, { username: login, active: true, technical: false });
    const candidates = byName ? [byName] : (await em.find(User, { active: true, technical: false, email: { $ne: null } })).filter((u) => u.email?.toLowerCase() === login.toLowerCase());
    if (candidates.length !== 1 || !candidates[0].email) {
      await this.audit.log(candidates.length > 1 ? 'auth.password-reset-ambiguous' : 'auth.password-reset-unknown', { login, accounts: candidates.length }, null);
      return;
    }
    const user = candidates[0];
    if (!this.perAccount.take(user.id)) {
      await this.audit.log('auth.password-reset-limited', {}, user.id);
      return;
    }
    const link = await this.createLink(em, user, base, RESET_VALID_MS);
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

  /** Invitation of a new user: a link to set the own password, valid for a week. Mail errors reach the caller. */
  async invite(user: User): Promise<void> {
    if (!user.email) throw new BadRequestException({ code: 'mail.noRecipient' });
    const base = await this.baseUrl();
    const em = this.em.fork();
    const link = await this.createLink(em, em.getReference(User, user.id), base, INVITATION_VALID_DAYS * 24 * 60 * 60_000);
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

  private async createLink(em: EntityManager, user: User, base: string, validMs: number): Promise<string> {
    const token = generateSecret();
    const now = new Date();
    em.create(PasswordReset, { user, hash: hashSecret(token), createdAt: now, expiresAt: new Date(now.getTime() + validMs), usedAt: null });
    await em.flush();
    return `${base}/reset-password?token=${token}`;
  }

  /** Sets the new password and ends all sessions of the user. */
  async confirm(token: string, password: string): Promise<void> {
    const em = this.em.fork();
    const reset = await em.findOne(PasswordReset, { hash: hashSecret(token) }, { populate: ['user'] });
    if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) {
      throw new BadRequestException({ code: 'auth.resetInvalid' });
    }
    const user = await em.findOneOrFail(User, reset.user.id, { populate: ['passwordHash'] });
    user.passwordHash = await hashPassword(password);
    reset.usedAt = new Date();
    await em.nativeDelete(Session, { user });
    await em.flush();
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
