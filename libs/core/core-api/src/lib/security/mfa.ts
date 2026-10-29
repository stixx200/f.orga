import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';
import {
  type BrigadeSettings,
  type MfaEnrolment,
  MfaEnrolmentConfirm,
  MfaEnrolmentStart,
  MfaReset,
  type RecoveryCodes,
  STEP_UP_MINUTES,
  StepUpInput,
  type StepUpResult,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { SettingsService } from '../settings/settings.js';
import { MailService } from '../tasks/mail.service.js';
import { ZodPipe } from '../zod.pipe.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser, RequirePermissions } from './decorators.js';
import { verifyPassword } from './password.js';
import { Session, User, UserMfa } from './security.entities.js';
import { decryptSecret, encryptSecret, serverKey } from './server-key.js';
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp } from './totp.js';

export const STEP_UP_MS = STEP_UP_MINUTES * 60_000;
/** Wrong codes allowed per user within `FAILURE_WINDOW_MS`; then locked for `LOCK_MS`. */
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

/**
 * The second factor (TOTP with recovery codes) and the step-up of sessions: permissions with `stepUp` take effect only
 * for 30 minutes after confirming with a code. The counters of wrong codes live in the database (`core.user_mfa`).
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  /** Status of the factor of a user (`null` = none set up). */
  async status(userId: string): Promise<{ enrolled: boolean; recoveryCodesLeft: number }> {
    const mfa = await this.em.fork().findOne(UserMfa, { user: userId });
    const enrolled = Boolean(mfa?.confirmedAt);
    return { enrolled, recoveryCodesLeft: enrolled ? (mfa?.recoveryCodes?.length ?? 0) : 0 };
  }

  /** IDs of the users with a confirmed factor. */
  async enrolledUserIds(): Promise<Set<string>> {
    const rows = await this.em.fork().find(UserMfa, { confirmedAt: { $ne: null } }, { fields: ['user'] });
    return new Set(rows.map((r) => r.user.id));
  }

  private key(): Buffer {
    const key = serverKey();
    if (!key) throw new ServiceUnavailableException({ code: 'auth.mfaNoSecretKey' });
    return key;
  }

  private assertOwnSession(user: AuthenticatedUser): void {
    if (user.via !== 'session' || !user.sessionId) throw new ForbiddenException({ code: 'auth.sessionRequired' });
    if (user.impersonator) throw new ForbiddenException({ code: 'auth.impersonationNotAllowed' });
  }

  /**
   * Starts setting up the factor: checks the password (accounts without password sign in with OIDC only and skip it)
   * and stores a new secret, unconfirmed until the first code. A confirmed factor is not replaced here; after losing
   * the phone an administrator resets it.
   */
  async startEnrolment(current: AuthenticatedUser, password: string | undefined): Promise<MfaEnrolment> {
    this.assertOwnSession(current);
    const key = this.key();
    const em = this.em.fork();
    const user = await em.findOneOrFail(User, current.id, { populate: ['passwordHash'] });
    if (user.passwordHash && (!password || !(await verifyPassword(password, user.passwordHash)))) {
      throw new UnauthorizedException({ code: 'auth.passwordRequired' });
    }
    const existing = await em.findOne(UserMfa, { user });
    if (existing?.confirmedAt) throw new ConflictException({ code: 'auth.mfaEnrolled' });
    const secret = generateTotpSecret();
    if (existing) {
      existing.secret = encryptSecret(secret, key);
      existing.lastStep = null;
    } else {
      em.create(UserMfa, { user, secret: encryptSecret(secret, key) });
    }
    await em.flush();
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const issuer = brigade?.name ? `f.orga ${brigade.name}` : 'f.orga';
    return { secret, uri: otpauthUri(issuer, user.username, secret) };
  }

  /** Confirms the new factor with a code: creates the recovery codes; the setup counts as step-up. */
  async confirmEnrolment(current: AuthenticatedUser, code: string): Promise<RecoveryCodes> {
    this.assertOwnSession(current);
    const key = this.key();
    const result = await this.em.fork().transactional(async (em): Promise<{ failed: { locked: boolean } } | { recoveryCodes: string[] }> => {
      const mfa = await em.findOne(UserMfa, { user: current.id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!mfa) throw new BadRequestException({ code: 'auth.mfaNotStarted' });
      if (mfa.confirmedAt) throw new ConflictException({ code: 'auth.mfaEnrolled' });
      this.assertNotLocked(mfa);
      const secret = decryptSecret(mfa.secret, key);
      const step = secret ? verifyTotp(secret, code, Date.now(), mfa.lastStep ?? null) : null;
      if (step === null) return { failed: this.countFailure(mfa) };
      const recoveryCodes = generateRecoveryCodes();
      mfa.confirmedAt = new Date();
      mfa.lastStep = step;
      mfa.recoveryCodes = recoveryCodes.map(hashRecoveryCode);
      this.resetFailures(mfa);
      return { recoveryCodes };
    });
    if ('failed' in result) return this.refuse(result.failed, 'enrolment');
    const elevatedUntil = await this.elevate(current.sessionId!);
    await this.audit.log('auth.mfa-enrolled');
    return { recoveryCodes: result.recoveryCodes, elevatedUntil: elevatedUntil.toISOString() };
  }

  /**
   * Step-up: confirms the session for 30 minutes with a code or a recovery code. During an impersonation the
   * administrator confirms with his own factor; the confirmation applies only to the impersonation session.
   */
  async stepUp(current: AuthenticatedUser, input: StepUpInput): Promise<StepUpResult> {
    if (current.via !== 'session' || !current.sessionId) throw new ForbiddenException({ code: 'auth.sessionRequired' });
    const ownerId = current.impersonator?.id ?? current.id;
    const key = this.key();
    const result = await this.em.fork().transactional(async (em): Promise<{ failed: { locked: boolean } } | { factor: 'totp' | 'recovery-code'; left: number | null }> => {
      const mfa = await em.findOne(UserMfa, { user: ownerId, confirmedAt: { $ne: null } }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!mfa) throw new BadRequestException({ code: 'auth.mfaNotEnrolled' });
      this.assertNotLocked(mfa);
      if ('recoveryCode' in input) {
        const hash = hashRecoveryCode(input.recoveryCode);
        const codes = mfa.recoveryCodes ?? [];
        if (!codes.includes(hash)) return { failed: this.countFailure(mfa) };
        mfa.recoveryCodes = codes.filter((c) => c !== hash);
        this.resetFailures(mfa);
        return { factor: 'recovery-code' as const, left: mfa.recoveryCodes.length };
      }
      const secret = decryptSecret(mfa.secret, key);
      const step = secret ? verifyTotp(secret, input.code, Date.now(), mfa.lastStep ?? null) : null;
      if (step === null) return { failed: this.countFailure(mfa) };
      mfa.lastStep = step;
      this.resetFailures(mfa);
      return { factor: 'totp' as const, left: null };
    });
    if ('failed' in result) return this.refuse(result.failed, 'step-up');
    const elevatedUntil = await this.elevate(current.sessionId);
    await this.audit.log('auth.step-up', { factor: result.factor, ...(result.left !== null ? { recoveryCodesLeft: result.left } : {}) });
    return { elevatedUntil: elevatedUntil.toISOString() };
  }

  /** Ends the confirmation of the session early. */
  async endStepUp(current: AuthenticatedUser): Promise<void> {
    if (current.sessionId) await this.em.fork().nativeUpdate(Session, { id: current.sessionId }, { elevatedUntil: null });
  }

  /** New recovery codes (the old ones end); needs a confirmed session. */
  async renewRecoveryCodes(current: AuthenticatedUser): Promise<RecoveryCodes> {
    this.assertOwnSession(current);
    if (!current.elevatedUntil) throw current.stepUpRequired();
    const em = this.em.fork();
    const mfa = await em.findOne(UserMfa, { user: current.id, confirmedAt: { $ne: null } });
    if (!mfa) throw new BadRequestException({ code: 'auth.mfaNotEnrolled' });
    const recoveryCodes = generateRecoveryCodes();
    mfa.recoveryCodes = recoveryCodes.map(hashRecoveryCode);
    await em.flush();
    await this.audit.log('auth.recovery-codes-renewed');
    return { recoveryCodes, elevatedUntil: current.elevatedUntil.toISOString() };
  }

  /**
   * An administrator removes the factor of another user (lost phone): factor and recovery codes are deleted, all
   * sessions of the user end and he gets an e-mail. Only for users without wider permissions than the administrator.
   */
  async reset(actor: AuthenticatedUser, userId: string, reason: string): Promise<void> {
    if (actor.id === userId || actor.impersonator?.id === userId) throw new ForbiddenException({ code: 'users.mfaResetSelf' });
    const em = this.em.fork();
    const user = await em.findOne(User, { id: userId, technical: false }, { populate: ['roles.role'] });
    if (!user) throw new NotFoundException();
    await this.auth.assertMayManage(actor, user);
    const removed = await em.nativeDelete(UserMfa, { user });
    if (!removed) throw new BadRequestException({ code: 'auth.mfaNotEnrolled' });
    await em.nativeDelete(Session, { user });
    await this.audit.log('auth.mfa-reset', { userId, reason });
    if (user.email) {
      const german = user.language === 'de';
      await this.mail
        .send({
          to: user.email,
          subject: german ? 'f.orga: Zweiter Faktor zurückgesetzt' : 'f.orga: second factor reset',
          text: (german
            ? [`Hallo ${user.displayName},`, '', 'eine Administratorin oder ein Administrator hat den zweiten Faktor Ihres f.orga-Zugangs zurückgesetzt. Sie wurden überall abgemeldet.', 'Beim nächsten Öffnen sensibler Daten richten Sie den Faktor neu ein.', '', 'Wenn Sie das nicht veranlasst haben, wenden Sie sich bitte an die Verwaltung Ihrer Feuerwehr.']
            : [`Hello ${user.displayName},`, '', 'an administrator has reset the second factor of your f.orga account. You were logged out everywhere.', 'Set up the factor again the next time you open sensitive data.', '', 'If you did not ask for this, please contact the administration of your fire brigade.']
          ).join('\n'),
        })
        .catch(() => undefined);
    }
  }

  private async elevate(sessionId: string): Promise<Date> {
    const until = new Date(Date.now() + STEP_UP_MS);
    await this.em.fork().nativeUpdate(Session, { id: sessionId }, { elevatedUntil: until });
    return until;
  }

  private assertNotLocked(mfa: UserMfa): void {
    if (mfa.lockedUntil && mfa.lockedUntil > new Date()) {
      throw new HttpException({ code: 'auth.stepUpLocked', until: mfa.lockedUntil.toISOString() }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Counts a wrong code; returns whether the user is now locked. */
  private countFailure(mfa: UserMfa): { locked: boolean } {
    const now = new Date();
    if (!mfa.failureWindowStart || now.getTime() - mfa.failureWindowStart.getTime() > FAILURE_WINDOW_MS) {
      mfa.failureWindowStart = now;
      mfa.failures = 0;
    }
    mfa.failures = (mfa.failures ?? 0) + 1;
    const locked = mfa.failures >= MAX_FAILURES;
    if (locked) {
      mfa.lockedUntil = new Date(now.getTime() + LOCK_MS);
      mfa.failures = 0;
      mfa.failureWindowStart = null;
    }
    return { locked };
  }

  private resetFailures(mfa: UserMfa): void {
    mfa.failures = 0;
    mfa.failureWindowStart = null;
    mfa.lockedUntil = null;
  }

  private async refuse(failure: { locked: boolean }, during: 'step-up' | 'enrolment'): Promise<never> {
    await this.audit.log('auth.step-up-failed', { during, ...(failure.locked ? { locked: true } : {}) });
    if (failure.locked) throw new HttpException({ code: 'auth.stepUpLocked' }, HttpStatus.TOO_MANY_REQUESTS);
    throw new BadRequestException({ code: 'auth.invalidCode' });
  }
}

@Controller('core')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  /** `204` while the session is confirmed, otherwise `403 auth.stepUpRequired` (the UI asks for the code then). */
  @Get('step-up')
  @HttpCode(204)
  check(@CurrentUser() user: AuthenticatedUser): void {
    if (!user.elevatedUntil) throw user.stepUpRequired();
  }

  @Post('step-up')
  @HttpCode(200)
  stepUp(@Body(new ZodPipe(StepUpInput)) input: StepUpInput, @CurrentUser() user: AuthenticatedUser): Promise<StepUpResult> {
    return this.mfa.stepUp(user, input);
  }

  @Post('step-up/end')
  @HttpCode(204)
  endStepUp(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.mfa.endStepUp(user);
  }

  @Post('mfa/enrolment')
  @HttpCode(200)
  startEnrolment(@Body(new ZodPipe(MfaEnrolmentStart)) input: MfaEnrolmentStart, @CurrentUser() user: AuthenticatedUser): Promise<MfaEnrolment> {
    return this.mfa.startEnrolment(user, input.password);
  }

  @Post('mfa/enrolment/confirm')
  @HttpCode(200)
  confirmEnrolment(@Body(new ZodPipe(MfaEnrolmentConfirm)) input: MfaEnrolmentConfirm, @CurrentUser() user: AuthenticatedUser): Promise<RecoveryCodes> {
    return this.mfa.confirmEnrolment(user, input.code);
  }

  @Post('mfa/recovery-codes')
  @HttpCode(200)
  renewRecoveryCodes(@CurrentUser() user: AuthenticatedUser): Promise<RecoveryCodes> {
    return this.mfa.renewRecoveryCodes(user);
  }

  /** Resets the second factor of another user; the reason is kept in the audit log. */
  @Delete('users/:id/mfa')
  @HttpCode(204)
  @RequirePermissions('core.users.manage')
  reset(@Param('id') id: string, @Body(new ZodPipe(MfaReset)) input: MfaReset, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.mfa.reset(user, id, input.reason);
  }
}
