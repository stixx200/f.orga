import { Injectable } from '@nestjs/common';
import type { ConsentEffect, ConsentLookup } from '@forga/core-contracts';
import { ModuleStateService } from '../module/modules.js';

/**
 * Effects of consents (`CONSENTS`) for the modules. The module `privacy` keeps the consents and answers; while it is
 * inactive (or not installed) there is no consent management: no consent is recorded (`has`), and lists that depend on
 * a consent behave as without consents (`withEffect` returns every person).
 */
@Injectable()
export class Consents implements ConsentLookup {
  private provider: (ConsentLookup & { module: string }) | null = null;

  constructor(private readonly modules: ModuleStateService) {}

  /** Called by the module `privacy`. */
  register(provider: ConsentLookup & { module: string }): void {
    this.provider = provider;
  }

  private async active(): Promise<ConsentLookup | null> {
    const provider = this.provider;
    return provider && !(await this.modules.inactiveIds()).has(provider.module) ? provider : null;
  }

  async has(personId: string, key: string): Promise<boolean> {
    const provider = await this.active();
    return provider ? provider.has(personId, key) : false;
  }

  async withEffect(effect: ConsentEffect, personIds: readonly string[]): Promise<Set<string>> {
    const provider = await this.active();
    return provider ? provider.withEffect(effect, personIds) : new Set(personIds);
  }
}
