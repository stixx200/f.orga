import { BadRequestException, Body, Controller, HttpCode, Injectable, Post, ServiceUnavailableException } from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { type BrigadeSettings, PasswordResetConfirm, PasswordResetRequest } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { SettingsService } from '../settings/settings.js';
import { MailService } from '../tasks/mail.service.js';
import { ZodPipe } from '../zod.pipe.js';
import { Public } from './decorators.js';
import { generateSecret, hashPassword, hashSecret } from './password.js';
import { Session, User } from './security.entities.js';

const VALID_MS = 60 * 60_000;

/** A one-time link to set a new password; only the SHA-256 of the token is stored. */
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

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly em: EntityManager,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
  ) {}

  /**
   * Sends a link valid for one hour to the e-mail address of the user (found by username or e-mail).
   * Says nothing about whether the user exists. The link is built only from the configured public address
   * (brigade settings or `FORGA_PUBLIC_URL`), never from request headers, so a forged `Origin` cannot redirect it.
   */
  async request(login: string): Promise<void> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const base = (brigade?.publicUrl || process.env.FORGA_PUBLIC_URL || '').replace(/\/$/, '');
    if (!/^https?:\/\//.test(base)) throw new ServiceUnavailableException({ code: 'auth.resetNotConfigured' });
    const em = this.em.fork();
    const user = await em.findOne(User, { $or: [{ username: login }, { email: login }], active: true, technical: false });
    if (!user?.email) {
      await this.audit.log('auth.password-reset-unknown', { login }, null);
      return;
    }
    const token = generateSecret();
    const now = new Date();
    em.create(PasswordReset, { user, hash: hashSecret(token), createdAt: now, expiresAt: new Date(now.getTime() + VALID_MS), usedAt: null });
    await em.flush();
    const link = `${base}/reset-password?token=${token}`;
    const german = user.language === 'de';
    await this.mail.send({
      to: user.email,
      subject: german ? 'f.orga: Passwort zurücksetzen' : 'f.orga: reset password',
      text: (german
        ? [`Hallo ${user.displayName},`, '', 'mit diesem Link setzen Sie ein neues Passwort (eine Stunde gültig):', link, '', 'Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.']
        : [`Hello ${user.displayName},`, '', 'use this link to set a new password (valid for one hour):', link, '', 'If you did not ask for it, ignore this e-mail.']
      ).join('\n'),
    });
    await this.audit.log('auth.password-reset-requested', {}, user.id);
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
  async request(@Body(new ZodPipe(PasswordResetRequest)) input: PasswordResetRequest) {
    await this.resets.request(input.login);
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
