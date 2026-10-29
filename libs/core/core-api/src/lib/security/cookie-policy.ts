import { Inject, Injectable } from '@nestjs/common';
import type { BrigadeSettings } from '@forga/core-contracts';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { SettingsService } from '../settings/settings.js';

/**
 * When cookies get `Secure`: with `FORGA_SECURE_COOKIES=true`, on a request that came over HTTPS (behind a TLS proxy
 * with `FORGA_TRUST_PROXY`), or automatically as soon as the address of f.orga (`brigade.publicUrl`, otherwise
 * `FORGA_PUBLIC_URL`) is an `https://` address.
 */
@Injectable()
export class CookiePolicy {
  constructor(
    private readonly settings: SettingsService,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  /** The address of f.orga, from the settings or `FORGA_PUBLIC_URL`. */
  async publicUrl(): Promise<string> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    return brigade?.publicUrl || process.env['FORGA_PUBLIC_URL'] || '';
  }

  async publicUrlHttps(): Promise<boolean> {
    return (await this.publicUrl()).toLowerCase().startsWith('https://');
  }

  async secure(request?: { secure?: boolean }): Promise<boolean> {
    return this.options.secureCookies || Boolean(request?.secure) || (await this.publicUrlHttps());
  }
}
