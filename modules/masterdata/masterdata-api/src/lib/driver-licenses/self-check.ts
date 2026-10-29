import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Language } from '@forga/core-contracts';
import { ProcessingRestrictions } from '@forga/core-api';
import {
  type LicenseSelfCheckResult,
  type LicenseSelfCheckView,
  type MasterdataLicenseSelfCheck,
  readDriverLicense,
  SELF_DECLARATION,
  selfCheckEnabled,
} from '@forga/masterdata-contracts';
import { DriverLicensesService } from './driver-licenses.service.js';

/**
 * Self-check with a registered sticker (contract `MASTERDATA_LICENSE_SELF_CHECK`, used by the info terminal). Only in
 * the periodic mode with self-checks; a self-check is refused while the original is due and never changes the classes.
 */
@Injectable()
export class LicenseSelfCheckService implements MasterdataLicenseSelfCheck {
  constructor(
    private readonly em: EntityManager,
    private readonly licenses: DriverLicensesService,
    private readonly restrictions: ProcessingRestrictions,
  ) {}

  async enabled(): Promise<boolean> {
    return selfCheckEnabled(await this.licenses.settings());
  }

  async lookup(code: string): Promise<LicenseSelfCheckView | null> {
    const em = this.em.fork();
    const token = await this.licenses.activeToken(em, code);
    // A person whose processing is restricted does not exist for the info terminal.
    if (!token || (await this.restrictions.isRestricted(token.person.id))) return null;
    const person = token.person;
    const [settings, records] = await Promise.all([this.licenses.settings(), this.licenses.records(em, [person.id])]);
    const status = this.licenses.status(person, records, settings);
    const last = (records.checks.get(person.id) ?? []).find((c) => !c.cancelledAt);
    return {
      firstName: person.firstName,
      lastName: person.lastName,
      classes: readDriverLicense(person.driverLicense).classes,
      lastCheck: last ? { checkedOn: last.checkedOn, method: last.method } : null,
      state: status.selfCheck,
      inPersonDueOn: status.inPersonDueOn,
      next: status.dues[0] ?? null,
    };
  }

  async confirm(code: string, origin: { terminalId: string; device: string; language: Language }): Promise<LicenseSelfCheckResult> {
    const em = this.em.fork();
    const token = await this.licenses.activeToken(em, code);
    if (!token || (await this.restrictions.isRestricted(token.person.id))) throw new NotFoundException({ code: 'masterdata.licenseNotRegistered' });
    const settings = await this.licenses.settings();
    if (!selfCheckEnabled(settings)) throw new ForbiddenException({ code: 'masterdata.selfCheckOff' });
    const status = this.licenses.status(token.person, await this.licenses.records(em, [token.person.id]), settings);
    if (status.selfCheck !== 'allowed') throw new ConflictException({ code: 'masterdata.inPersonRequired' });
    const check = await this.licenses.recordSelfCheck(em, token, { terminalId: origin.terminalId, device: origin.device, declaration: SELF_DECLARATION[origin.language] });
    const after = this.licenses.status(token.person, await this.licenses.records(em, [token.person.id]), settings);
    return { checkedAt: check.recordedAt.toISOString(), nextDueOn: after.dues[0]?.dueOn ?? null };
  }
}
