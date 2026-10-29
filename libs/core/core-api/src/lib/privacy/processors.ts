import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type BrigadeSettings, OidcSettings, type RegisterRecipientView, SmtpSettings } from '@forga/core-contracts';
import { SettingsService } from '../settings/settings.js';

/** A source of technical recipients and processors (Art. 28) from the configuration, e.g. the backup target. */
export interface ProcessorSource {
  /** Module of the source; sources of inactive modules are left out. */
  module: string;
  processors(): Promise<RegisterRecipientView[]>;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * Technical recipients and processors of the register (L25): the core names the server of f.orga (hosting), the e-mail
 * server and the sign-in service; modules add theirs (e.g. the backup target of the module `backup`).
 */
@Injectable()
export class ProcessorRegistry implements OnModuleInit {
  private readonly sources: ProcessorSource[] = [];

  constructor(private readonly settings: SettingsService) {}

  onModuleInit(): void {
    this.register({ module: 'core', processors: () => this.core() });
  }

  register(source: ProcessorSource): void {
    this.sources.push(source);
  }

  async collect(inactive: ReadonlySet<string>): Promise<RegisterRecipientView[]> {
    const lists = await Promise.all(this.sources.filter((s) => !inactive.has(s.module)).map((s) => s.processors()));
    return lists.flat();
  }

  private async core(): Promise<RegisterRecipientView[]> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const smtp = SmtpSettings.parse((await this.settings.get('smtp')) ?? {});
    const oidc = OidcSettings.parse((await this.settings.get('oidc')) ?? {});
    const result: RegisterRecipientView[] = [];
    const address = brigade?.publicUrl || process.env['FORGA_PUBLIC_URL'] || '';
    result.push({
      id: 'processor:hosting',
      name: address
        ? { de: `Server von f.orga unter ${hostOf(address)} (Hosting, Betrieb und Fernwartung)`, en: `Server of f.orga at ${hostOf(address)} (hosting, operation and remote maintenance)` }
        : { de: 'Server von f.orga (Hosting, Betrieb und Fernwartung)', en: 'Server of f.orga (hosting, operation and remote maintenance)' },
      note: '',
      source: 'processor',
    });
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
}
