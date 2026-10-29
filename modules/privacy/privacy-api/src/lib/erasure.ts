import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { ErasureArea } from '@forga/core-contracts';
import { type ErasureCheck, ErasureConfirmation, type ErasureExecution, OPEN_REQUEST_STATUSES, PRIVACY_PERMISSION } from '@forga/privacy-contracts';
import { addYears, Audit, berlinDate, type ErasureContext, OrganizationDirectory, PersonDataRegistry, RequirePermissions, RetentionService, ZodPipe } from '@forga/core-api';
import { PrivacyRequestEntity } from './privacy.entities.js';
import { PrivacyRequests } from './privacy-requests.js';
import { PersonPrivacyService } from './person-privacy.js';

const years = (n: number) => ({ de: `${n} ${n === 1 ? 'Jahr' : 'Jahre'}`, en: `${n} ${n === 1 ? 'year' : 'years'}` });
const comparable = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

/**
 * Latest end of the kept areas: the restriction lasts until all of them may be erased; `null` if one of them has no
 * end yet (or nothing is kept).
 */
export function restrictionEnd(areas: readonly ErasureArea[]): string | null {
  const kept = areas.filter((a) => a.outcome === 'keep');
  if (!kept.length || kept.some((a) => !a.keepUntil)) return null;
  return kept.map((a) => a.keepUntil!).toSorted().at(-1)!;
}

/**
 * Erasure of a request on erasure (L7, Art. 17): every module reports per data area whether it may delete, only
 * anonymise or has to keep the data until the end of the retention period (`PersonDataRegistry.erasure`); executing it
 * deletes and anonymises what is allowed and restricts the processing of the rest (Art. 18) until the end of the
 * longest period.
 */
@Injectable()
export class ErasureService {
  constructor(
    private readonly em: EntityManager,
    private readonly requests: PrivacyRequests,
    private readonly registry: PersonDataRegistry,
    private readonly retention: RetentionService,
    private readonly organization: OrganizationDirectory,
    private readonly audit: Audit,
    private readonly personPrivacy: PersonPrivacyService,
  ) {}

  /** Periods of the retention plan as the modules ask for them. */
  async context(): Promise<ErasureContext> {
    const periods = await this.retention.periods();
    const today = berlinDate();
    return {
      today,
      retain: (category, since) => {
        const period = periods.get(category);
        if (!period) return null;
        const { name, event } = period.definition;
        if (since === null) return { until: null, reason: { de: `${name.de}: Frist beginnt mit ${event.de}`, en: `${name.en}: period starts with ${event.en}` } };
        if (period.years === null) return { until: null, reason: { de: `${name.de}: keine Frist festgelegt`, en: `${name.en}: no period set` } };
        const until = addYears(since.slice(0, 10), period.years);
        if (until <= today) return null;
        const length = years(period.years);
        return { until, reason: { de: `${name.de}: ${length.de} nach ${event.de}`, en: `${name.en}: ${length.en} after ${event.en}` } };
      },
    };
  }

  private async load(em: EntityManager, requestId: string): Promise<{ request: PrivacyRequestEntity; personId: string; name: string }> {
    const request = await this.requests.load(em, requestId);
    if (request.kind !== 'erasure') throw new BadRequestException({ code: 'privacy.notErasure' });
    // A third party is no person of the master data: its data is erased at the chosen places (third-party erasure, L14).
    if (!request.personId) throw new BadRequestException({ code: 'privacy.erasureThirdParty' });
    const person = (await this.organization.persons([request.personId]))?.[0];
    if (!person) throw new BadRequestException({ code: 'privacy.personUnknown' });
    return { request, personId: request.personId, name: `${person.firstName} ${person.lastName}` };
  }

  async check(requestId: string): Promise<ErasureCheck> {
    const { request, personId, name } = await this.load(this.em.fork(), requestId);
    const areas = await this.registry.erasure(personId, await this.context());
    return { personName: name, areas, restrictUntil: restrictionEnd(areas), executed: request.erasure ?? null };
  }

  /**
   * Deletes and anonymises what the check allows and restricts the processing of the person until the end of the
   * longest retention period of the rest. Once per request, only while it is open; the name of the person confirms it.
   */
  async execute(requestId: string, input: ErasureConfirmation): Promise<ErasureCheck> {
    const em = this.em.fork();
    const { request, personId, name } = await this.load(em, requestId);
    if (!OPEN_REQUEST_STATUSES.includes(request.status)) throw new ConflictException({ code: 'privacy.requestClosed' });
    if (request.erasure) throw new ConflictException({ code: 'privacy.erasureExecuted' });
    if (comparable(input.confirmName) !== comparable(name)) throw new BadRequestException({ code: 'privacy.erasureConfirmation' });
    const ctx = await this.context();
    const areas = await this.registry.erasure(personId, ctx);
    await this.registry.erase(personId, ctx);
    const kept = areas.filter((a) => a.outcome === 'keep');
    const restrictedUntil = restrictionEnd(areas);
    if (kept.length && (await this.personPrivacy.restrict(personId, { reason: 'retention', until: restrictedUntil, requestId }))) {
      await this.audit.log('privacy.restricted', { personId, reason: 'retention', requestId });
    }
    const execution: ErasureExecution = {
      executedAt: new Date().toISOString(),
      deleted: areas.filter((a) => a.outcome === 'delete').length,
      anonymized: areas.filter((a) => a.outcome === 'anonymize').length,
      kept: kept.length,
      restrictedUntil,
    };
    // The modules changed the request meanwhile (texts of the person emptied): stored without the loaded version.
    await this.em.fork().nativeUpdate(PrivacyRequestEntity, { id: requestId }, { erasure: execution });
    // Counts only: what was erased must not reappear in the audit log.
    await this.audit.log('privacy.erasure-executed', {
      requestId,
      personId: request.personId,
      deleted: execution.deleted,
      anonymized: execution.anonymized,
      kept: execution.kept,
      records: Object.fromEntries(areas.map((a) => [a.key, a.count])),
    });
    return { personName: name, areas, restrictUntil: restrictedUntil, executed: execution };
  }
}

/** The erasure check on the page of a request on erasure, and its execution. */
@Controller('privacy/requests')
export class ErasureController {
  constructor(private readonly erasure: ErasureService) {}

  @Get(':id/erasure')
  @RequirePermissions(PRIVACY_PERMISSION)
  check(@Param('id', ParseUUIDPipe) id: string): Promise<ErasureCheck> {
    return this.erasure.check(id);
  }

  @Post(':id/erasure')
  @RequirePermissions(PRIVACY_PERMISSION)
  execute(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ErasureConfirmation)) input: ErasureConfirmation): Promise<ErasureCheck> {
    return this.erasure.execute(id, input);
  }
}
