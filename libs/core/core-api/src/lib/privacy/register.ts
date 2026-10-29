import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { EntityManager } from '@mikro-orm/core';
import {
  type ActivityOption,
  ActivityRecord,
  ActivityRecordInput,
  type BrigadeSettings,
  CORE_ACTIVITIES,
  GeneralRecipientsInput,
  type Language,
  LEGACY_RECIPIENTS_SECTION,
  type LocalizedText,
  OidcSettings,
  PRIVACY_PERMISSION,
  PrivacyActivities,
  PrivacyContacts,
  ProcessingActivity,
  type ProcessingRegister,
  type RecipientOption,
  type RegisterActivity,
  RegisterRecipient,
  type RegisterRecipientView,
  SmtpSettings,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { ModuleStateService } from '../module/modules.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CookiePolicy } from '../security/cookie-policy.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { ApiToken } from '../security/security.entities.js';
import { brigadeLogoDataUrl } from '../settings/assets.js';
import { Setting, SettingsService } from '../settings/settings.js';
import { forgaStage } from '../stage.js';
import { ZodPipe } from '../zod.pipe.js';
import { renderRegisterPdf, renderRegisterXlsx } from './register-export.js';
import { RetentionTexts } from './retention-texts.js';
import { type MeasureContext, TechnicalMeasureRegistry } from './technical-measures.js';

const SECTION = 'privacy.activities';
const CORE_MODULE = { id: 'core', name: { de: 'Kern', en: 'Core' } };

interface KnownActivity {
  activity: ProcessingActivity;
  module: { id: string; name: LocalizedText };
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * The register of processing activities (Art. 30 GDPR, L8): composed of the activities of the core and the active
 * modules (manifest), the municipality's part per activity (setting `privacy.activities`), recipients from API tokens
 * and the configuration, retention periods from `privacy.retention` and the technical measures.
 */
@Injectable()
export class PrivacyRegister implements OnApplicationBootstrap {
  private readonly logger = new Logger(PrivacyRegister.name);

  constructor(
    private readonly em: EntityManager,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
    private readonly modules: ModuleStateService,
    private readonly settings: SettingsService,
    private readonly retention: RetentionTexts,
    private readonly measures: TechnicalMeasureRegistry,
    private readonly audit: Audit,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.migrateLegacyRecipients();
  }

  /**
   * The former list `privacy.recipients` (Art. 19) becomes the general recipients of the register, with the same IDs, so
   * recipients already ticked in requests stay ticked. The old section is removed afterwards.
   */
  async migrateLegacyRecipients(): Promise<number> {
    const em = this.em.fork();
    const legacy = await em.findOne(Setting, { section: LEGACY_RECIPIENTS_SECTION });
    if (!legacy) return 0;
    const entries = Array.isArray(legacy.value['recipients']) ? (legacy.value['recipients'] as unknown[]) : [];
    const valid = entries.flatMap((entry) => {
      const parsed = RegisterRecipient.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
    const stored = await this.stored();
    const added = valid.filter((r) => !stored.general.some((g) => g.id === r.id));
    if (added.length) await this.settings.set(SECTION, { ...stored, general: [...stored.general, ...added].slice(0, 50) });
    em.remove(legacy);
    await em.flush();
    await this.audit.log('privacy.recipients-migrated', { count: added.length }, null);
    this.logger.log(`Moved ${added.length} recipients of "${LEGACY_RECIPIENTS_SECTION}" to the register of processing activities.`);
    return added.length;
  }

  async stored(): Promise<PrivacyActivities> {
    return PrivacyActivities.parse((await this.settings.get(SECTION)) ?? {});
  }

  /** All activities of core and installed modules (also inactive ones), by key: names of references stay readable. */
  private all(): Map<string, KnownActivity> {
    const result = new Map<string, KnownActivity>();
    for (const activity of CORE_ACTIVITIES) result.set(activity.key, { activity, module: CORE_MODULE });
    for (const module of this.options.modules) {
      for (const activity of module.manifest.privacy?.activities ?? []) {
        result.set(activity.key, { activity: ProcessingActivity.parse(activity), module: { id: module.manifest.id, name: module.manifest.name } });
      }
    }
    return result;
  }

  /** Activities of the core and the active modules, in load order (core last, as in the access report). */
  async active(): Promise<KnownActivity[]> {
    const inactive = await this.modules.inactiveIds();
    const all = [...this.all().values()];
    return [...all.filter((a) => a.module.id !== 'core' && !inactive.has(a.module.id)), ...all.filter((a) => a.module.id === 'core')];
  }

  /** Name of an activity by key; `null` if no installed module knows it. */
  activityName(key: string | null | undefined): LocalizedText | null {
    return key ? (this.all().get(key)?.activity.name ?? null) : null;
  }

  /** Is the key an activity of the core or an active module? */
  async isActive(key: string): Promise<boolean> {
    return (await this.active()).some((a) => a.activity.key === key);
  }

  async activityOptions(): Promise<ActivityOption[]> {
    return (await this.active()).map(({ activity }) => ({ key: activity.key, name: activity.name, health: activity.health }));
  }

  /** Active API tokens: recipients of the activities of the modules their permissions belong to. */
  private async tokenRecipients(): Promise<{ module: string; recipient: RegisterRecipientView }[]> {
    const now = new Date();
    const tokens = await this.em.fork().find(ApiToken, { revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { orderBy: { name: 'asc' } });
    return tokens.flatMap((token) =>
      [...new Set(token.scopes.map((scope) => scope.slice(0, scope.indexOf('.') > 0 ? scope.indexOf('.') : scope.length)))].map((module) => ({
        module,
        recipient: { id: `token:${token.id}`, name: { de: `Schnittstelle „${token.name}“`, en: `Interface "${token.name}"` }, note: '', source: 'token' as const },
      })),
    );
  }

  /** SMTP server and OIDC provider from the settings: technical recipients and processors. */
  private async processors(): Promise<RegisterRecipientView[]> {
    const smtp = SmtpSettings.parse((await this.settings.get('smtp')) ?? {});
    const oidc = OidcSettings.parse((await this.settings.get('oidc')) ?? {});
    const result: RegisterRecipientView[] = [];
    if (smtp.host) {
      result.push({
        id: 'processor:smtp',
        name: { de: `E-Mail-Server ${smtp.host} (Versand von Benachrichtigungen)`, en: `E-mail server ${smtp.host} (sending notifications)` },
        note: '',
        source: 'processor',
      });
    }
    if (oidc.enabled && oidc.issuer) {
      result.push({
        id: 'processor:oidc',
        name: { de: `Anmeldedienst ${hostOf(oidc.issuer)} (Konto der Gemeinde)`, en: `Sign-in service ${hostOf(oidc.issuer)} (municipal account)` },
        note: '',
        source: 'processor',
      });
    }
    return result;
  }

  private async activitiesWithRecipients(): Promise<{ known: KnownActivity; recipients: RegisterRecipientView[]; record: ActivityRecord }[]> {
    const [active, stored, tokens, processors] = await Promise.all([this.active(), this.stored(), this.tokenRecipients(), this.processors()]);
    return active.map((known) => {
      const { activity, module } = known;
      const record = stored.activities[activity.key] ?? ActivityRecord.parse({});
      const recipients: RegisterRecipientView[] = [
        ...activity.recipients.map((name, index) => ({ id: `module:${activity.key}:${index}`, name, note: '', source: 'module' as const })),
        ...tokens.filter((t) => t.module === module.id).map((t) => t.recipient),
        ...record.recipients.map((r) => ({ id: r.id, name: { de: r.name, en: r.name }, note: r.note, source: 'municipality' as const })),
        // Notifications by e-mail and the municipal sign-in concern the user accounts.
        ...(activity.key === 'core.accounts' ? processors : []),
      ];
      return { known, recipients, record };
    });
  }

  /** The whole register as page and exports show it. */
  async register(context: MeasureContext): Promise<ProcessingRegister> {
    const [withRecipients, stored, processors, retention, contacts] = await Promise.all([
      this.activitiesWithRecipients(),
      this.stored(),
      this.processors(),
      this.retention.localized(),
      this.settings.get(PRIVACY_CONTACTS).then((value) => PrivacyContacts.parse(value ?? {})),
    ]);
    const activities: RegisterActivity[] = withRecipients.map(({ known: { activity, module }, recipients, record }) => ({
      key: activity.key,
      module,
      name: activity.name,
      purpose: activity.purpose,
      subjects: activity.subjects,
      categories: activity.categories,
      health: activity.health,
      healthNote: activity.healthNote ?? null,
      legalBasisHint: activity.legalBasisHint ?? null,
      thirdParties: activity.thirdParties ?? false,
      recipients,
      retention: retention(activity.retention),
      record,
    }));
    return {
      controller: contacts.controller,
      dpo: contacts.dpo,
      activities,
      general: stored.general,
      processors,
      measures: await this.measures.collect(context, await this.modules.inactiveIds()),
      generatedAt: new Date().toISOString(),
    };
  }

  /** Recipients to inform under Art. 19, each once, with the activities they belong to. */
  async recipientOptions(): Promise<RecipientOption[]> {
    const [withRecipients, stored] = await Promise.all([this.activitiesWithRecipients(), this.stored()]);
    const options = new Map<string, RecipientOption>();
    for (const recipient of stored.general) options.set(recipient.id, { id: recipient.id, name: { de: recipient.name, en: recipient.name }, source: 'general', activities: [] });
    for (const { known, recipients } of withRecipients) {
      for (const recipient of recipients.filter((r) => r.source !== 'processor')) {
        const option = options.get(recipient.id) ?? { id: recipient.id, name: recipient.name, source: recipient.source, activities: [] };
        option.activities.push(known.activity.name);
        options.set(recipient.id, option);
      }
    }
    return [...options.values()];
  }

  /** Changes the municipality's part of an activity; a change makes it a draft again. */
  async change(key: string, input: ReturnType<typeof ActivityRecordInput.parse>, user: AuthenticatedUser): Promise<void> {
    if (!(await this.isActive(key))) throw new NotFoundException({ code: 'privacy.activityUnknown' });
    const stored = await this.stored();
    const current = stored.activities[key] ?? ActivityRecord.parse({});
    if (input.version !== current.version) throw new ConflictException({ code: 'conflict.stale', current: current.version, expected: input.version });
    const { version: _version, ...values } = input;
    const unchanged = (Object.keys(values) as (keyof typeof values)[]).every((field) => JSON.stringify(values[field]) === JSON.stringify(current[field]));
    if (unchanged) return;
    stored.activities[key] = { ...values, version: current.version + 1, changedAt: new Date().toISOString(), changedBy: user.displayName, reviewedAt: null, reviewedBy: null };
    await this.settings.set(SECTION, stored);
    await this.audit.log('privacy.activity-changed', { activity: key, version: current.version + 1 });
  }

  /** „Als geprüft markieren“: the municipality reviewed the activity with the data protection officer. */
  async review(key: string, version: unknown, user: AuthenticatedUser): Promise<void> {
    if (!(await this.isActive(key))) throw new NotFoundException({ code: 'privacy.activityUnknown' });
    const stored = await this.stored();
    const current = stored.activities[key] ?? ActivityRecord.parse({});
    if (version !== current.version) throw new ConflictException({ code: 'conflict.stale', current: current.version, expected: version });
    stored.activities[key] = { ...current, reviewedAt: new Date().toISOString(), reviewedBy: user.displayName };
    await this.settings.set(SECTION, stored);
    await this.audit.log('privacy.activity-reviewed', { activity: key, version: current.version });
  }

  async changeGeneral(recipients: RegisterRecipient[]): Promise<void> {
    const stored = await this.stored();
    await this.settings.set(SECTION, { ...stored, general: recipients });
    await this.audit.log('privacy.recipients-changed', { recipients: recipients.map((r) => r.name) });
  }
}

const PRIVACY_CONTACTS = 'privacy.contacts';

/** „Verwaltung → Datenschutz → Verzeichnis“: the register, the municipality's part and the exports as PDF and Excel. */
@Controller('core/privacy/register')
@RequirePermissions(PRIVACY_PERMISSION)
export class PrivacyRegisterController {
  constructor(
    private readonly register: PrivacyRegister,
    private readonly cookies: CookiePolicy,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    private readonly em: EntityManager,
  ) {}

  private async context(req: Request): Promise<MeasureContext> {
    return { stage: forgaStage(), https: req.secure, publicUrlHttps: await this.cookies.publicUrlHttps(), secureCookies: await this.cookies.secure(req) };
  }

  @Get()
  async get(@Req() req: Request): Promise<ProcessingRegister> {
    return this.register.register(await this.context(req));
  }

  /** Activities to refer to, e.g. by an objection or a data breach. */
  @Get('activities')
  activities(): Promise<ActivityOption[]> {
    return this.register.activityOptions();
  }

  /** Recipients to inform about a rectification, erasure or restriction (Art. 19). */
  @Get('recipients')
  recipients(): Promise<RecipientOption[]> {
    return this.register.recipientOptions();
  }

  @Put('activities/:key')
  async change(@Param('key') key: string, @Body(new ZodPipe(ActivityRecordInput)) input: ReturnType<typeof ActivityRecordInput.parse>, @CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<ProcessingRegister> {
    await this.register.change(key, input, user);
    return this.get(req);
  }

  @Post('activities/:key/review')
  @HttpCode(200)
  async review(@Param('key') key: string, @Body() body: { version?: unknown }, @CurrentUser() user: AuthenticatedUser, @Req() req: Request): Promise<ProcessingRegister> {
    await this.register.review(key, body?.version, user);
    return this.get(req);
  }

  @Put('recipients')
  async general(@Body(new ZodPipe(GeneralRecipientsInput)) input: ReturnType<typeof GeneralRecipientsInput.parse>, @Req() req: Request): Promise<ProcessingRegister> {
    await this.register.changeGeneral(input.recipients);
    return this.get(req);
  }

  /** The register as PDF (`format=pdf`) or Excel (`format=xlsx`) in the chosen language. */
  @Get('export/:format')
  async export(@Param('format') format: string, @Query('language') language: string | undefined, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (format !== 'pdf' && format !== 'xlsx') throw new NotFoundException();
    const lang: Language = language === 'en' ? 'en' : 'de';
    const register = await this.register.register(await this.context(req));
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const now = new Date();
    const file =
      format === 'pdf'
        ? await renderRegisterPdf({ register, language: lang, brigade, logo: await brigadeLogoDataUrl(this.em), now })
        : await renderRegisterXlsx({ register, language: lang, brigade, now });
    await this.audit.log('privacy.register-exported', { format, language: lang });
    const name = `${lang === 'de' ? 'verarbeitungsverzeichnis' : 'register-of-processing'}-${now.toISOString().slice(0, 10)}.${format}`;
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file);
  }
}
