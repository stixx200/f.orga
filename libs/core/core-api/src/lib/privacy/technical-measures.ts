import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  ACCESS_REPORT_DAYS,
  type LocalizedText,
  OidcSettings,
  SecuritySettings,
  type SecurityStatus,
  SmtpSettings,
  type TechnicalMeasure,
} from '@forga/core-contracts';
import { MfaService } from '../security/mfa.js';
import { AuthService } from '../security/auth.service.js';
import { PermissionRegistry } from '../security/permission-registry.js';
import { Role, User } from '../security/security.entities.js';
import { serverKey } from '../security/server-key.js';
import { SettingsService } from '../settings/settings.js';
import { RetentionTexts } from './retention-texts.js';

/** What a provider may use to describe the current state: HTTPS and stage as the request of the page sees them. */
export type MeasureContext = SecurityStatus;

/**
 * A source of technical measures for the register of processing activities (Art. 30(1) g, Art. 32), e.g. the backup
 * module („Sicherung verschlüsselt: ja“) or the read log. Providers of inactive modules are left out.
 */
export interface TechnicalMeasureProvider {
  module: string;
  measures(context: MeasureContext): Promise<TechnicalMeasure[]>;
}

/** Collects the technical measures of core and modules; modules register in `onModuleInit`. */
@Injectable()
export class TechnicalMeasureRegistry {
  private readonly providers: TechnicalMeasureProvider[] = [];

  register(provider: TechnicalMeasureProvider): void {
    this.providers.push(provider);
  }

  /** Measures of the core and the active modules, in the order of registration. */
  async collect(context: MeasureContext, inactive: ReadonlySet<string>): Promise<TechnicalMeasure[]> {
    const result: TechnicalMeasure[] = [];
    for (const provider of this.providers) if (!inactive.has(provider.module)) result.push(...(await provider.measures(context)));
    return result;
  }
}

const yesNo = (value: boolean): LocalizedText => (value ? { de: 'ja', en: 'yes' } : { de: 'nein', en: 'no' });
const STAGES: Record<SecurityStatus['stage'], LocalizedText> = {
  production: { de: 'Echtsystem', en: 'Production system' },
  test: { de: 'Testsystem (nur Demodaten)', en: 'Test system (demo data only)' },
  development: { de: 'Entwicklung', en: 'Development' },
};

/** Measures of the core: permissions, second factor, HTTPS, passwords, protocols, encryption, e-mails, sign-in. */
@Injectable()
export class CoreMeasures implements OnModuleInit {
  constructor(
    private readonly registry: TechnicalMeasureRegistry,
    private readonly em: EntityManager,
    private readonly permissions: PermissionRegistry,
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly settings: SettingsService,
    private readonly retention: RetentionTexts,
  ) {}

  onModuleInit(): void {
    this.registry.register({ module: 'core', measures: (context) => this.measures(context) });
  }

  private async measures(context: MeasureContext): Promise<TechnicalMeasure[]> {
    const em = this.em.fork();
    const key = Boolean(serverKey());
    const [roles, users, enrolled] = await Promise.all([em.count(Role, {}), em.find(User, { active: true, technical: false }, { populate: ['roles.role'] }), this.mfa.enrolledUserIds()]);
    let needing = 0;
    let missing = 0;
    for (const user of users) {
      const grants = await this.auth.grantsFor(user.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })));
      if (![...grants.keys()].some((p) => this.permissions.stepUp.has(p))) continue;
      needing++;
      if (!enrolled.has(user.id)) missing++;
    }
    const smtp = SmtpSettings.parse((await this.settings.get('smtp')) ?? {});
    const oidc = OidcSettings.parse((await this.settings.get('oidc')) ?? {});
    const security = SecuritySettings.parse((await this.settings.get('security')) ?? {});
    const retention = await this.retention.localized();
    const https = context.https || context.publicUrlHttps;
    const smtpTls = smtp.starttls || smtp.port === 465;
    return [
      {
        key: 'core.permissions',
        title: { de: 'Rechte', en: 'Permissions' },
        value: {
          de: `Rollen mit Rechten je Abteilung (${roles} Rollen, ${users.length} aktive Benutzer); sensible Felder und Gesundheitsdaten nur mit eigenen Rechten`,
          en: `Roles with permissions per department (${roles} roles, ${users.length} active users); sensitive fields and health data only with own permissions`,
        },
        tone: 'info',
      },
      {
        key: 'core.step-up',
        title: { de: 'Zweiter Faktor', en: 'Second factor' },
        value: !key
          ? { de: 'bei sensiblen Daten (Step-up) vorgesehen, aber FORGA_SECRET_KEY fehlt: diese Bereiche sind gesperrt', en: 'intended for sensitive data (step-up), but FORGA_SECRET_KEY is missing: these areas are locked' }
          : {
              de: `bei sensiblen Daten und Verwaltung (Step-up, 30 Minuten); ${needing - missing} von ${needing} Benutzern mit solchen Rechten haben ihn eingerichtet`,
              en: `for sensitive data and administration (step-up, 30 minutes); ${needing - missing} of ${needing} users with such permissions have set it up`,
            },
        tone: key && !missing ? 'ok' : 'warning',
      },
      {
        key: 'core.https',
        title: { de: 'HTTPS', en: 'HTTPS' },
        value: https
          ? { de: `ja; Cookies nur über HTTPS: ${yesNo(context.secureCookies).de}; Sicherheitsheader (CSP, HSTS)`, en: `yes; cookies only over HTTPS: ${yesNo(context.secureCookies).en}; security headers (CSP, HSTS)` }
          : { de: 'nein – Aufruf über http://', en: 'no – opened via http://' },
        tone: https ? 'ok' : 'warning',
      },
      {
        key: 'core.passwords',
        title: { de: 'Anmeldung', en: 'Sign-in' },
        value: {
          de: `Passwörter als scrypt-Hash, mindestens 10 Zeichen, Sperre nach Fehlversuchen; Sitzung als HttpOnly-Cookie${oidc.enabled ? '; Anmeldung mit dem Konto der Gemeinde (OIDC)' : ''}`,
          en: `Passwords as scrypt hash, at least 10 characters, lock after failed attempts; session as HttpOnly cookie${oidc.enabled ? '; sign-in with the municipal account (OIDC)' : ''}`,
        },
        tone: 'info',
      },
      {
        key: 'core.protocols',
        title: { de: 'Protokolle', en: 'Protocols' },
        value: {
          de: `Audit-Log (Anmeldungen, Rechte, Exporte, Importe, Anmelden als) und Historie aller Änderungen; ${retention(['core.audit', 'core.history']).de}`,
          en: `Audit log (logins, permissions, exports, imports, impersonation) and history of all changes; ${retention(['core.audit', 'core.history']).en}`,
        },
        tone: 'info',
      },
      {
        key: 'core.encryption',
        title: { de: 'Verschlüsselung', en: 'Encryption' },
        value: key
          ? { de: `Auskünfte, Geheimnisse des zweiten Faktors und Schlüssel verschlüsselt (AES-256-GCM, FORGA_SECRET_KEY); Auskünfte ${ACCESS_REPORT_DAYS} Tage`, en: `Access reports, second-factor secrets and keys encrypted (AES-256-GCM, FORGA_SECRET_KEY); access reports ${ACCESS_REPORT_DAYS} days` }
          : { de: 'FORGA_SECRET_KEY fehlt: keine verschlüsselte Ablage möglich', en: 'FORGA_SECRET_KEY missing: no encrypted storage possible' },
        tone: key ? 'ok' : 'warning',
      },
      {
        key: 'core.mail',
        title: { de: 'E-Mails', en: 'E-mails' },
        value: {
          de: `${smtp.host ? `Versand über ${smtp.host}, TLS: ${yesNo(smtpTls).de}` : 'kein E-Mail-Server eingerichtet'}; Fristen mit Gesundheitsbezug ohne Namen: ${yesNo(security.mailHealthWithoutNames).de}`,
          en: `${smtp.host ? `sent via ${smtp.host}, TLS: ${yesNo(smtpTls).en}` : 'no e-mail server set up'}; deadlines about health without names: ${yesNo(security.mailHealthWithoutNames).en}`,
        },
        tone: smtp.host && !smtpTls ? 'warning' : 'info',
      },
      { key: 'core.stage', title: { de: 'System', en: 'System' }, value: STAGES[context.stage], tone: 'info' },
    ];
  }
}
