import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type AccessReport, PRIVACY_PERMISSION, ThirdPartyAccessReportCreate, ThirdPartyErasureInput, type ThirdPartyErasureResult } from '@forga/privacy-contracts';
import type { ThirdPartyHit } from '@forga/core-contracts';
import { Audit, type AuthenticatedUser, CurrentUser, RequirePermissions, ThirdPartyRegistry, ZodPipe } from '@forga/core-api';
import { AccessReportService } from './access-report/access-report.service.js';
import { PrivacyRequestEntity } from './privacy.entities.js';

/**
 * „Auskunft zu einer anderen Person“ on the page of requests (L14): search over the third-party data of all modules,
 * access report and erasure at the chosen places. Only `privacy.manage` (with step-up).
 */
@Controller('privacy/third-parties')
@RequirePermissions(PRIVACY_PERMISSION)
export class ThirdPartiesController {
  constructor(
    private readonly registry: ThirdPartyRegistry,
    private readonly reports: AccessReportService,
    private readonly audit: Audit,
    private readonly em: EntityManager,
  ) {}

  @Get()
  search(@Query('q') query: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<ThirdPartyHit[]> {
    return this.registry.search(query ?? '', user.language);
  }

  @Post('access-reports')
  @HttpCode(202)
  createReport(@Body(new ZodPipe(ThirdPartyAccessReportCreate)) input: ReturnType<typeof ThirdPartyAccessReportCreate.parse>, @CurrentUser() user: AuthenticatedUser): Promise<AccessReport> {
    this.registry.bySource(input.refs);
    return this.reports.createForThirdParty(input, user);
  }

  /**
   * Erasure at the chosen places: each source anonymises or deletes what it may and says what it keeps (e.g. cost notices
   * as accounting records until their retention period ends). Audit `privacy.third-party-erased` with counts, no names.
   */
  @Post('erasure')
  @HttpCode(200)
  async erase(@Body(new ZodPipe(ThirdPartyErasureInput)) input: ReturnType<typeof ThirdPartyErasureInput.parse>): Promise<ThirdPartyErasureResult> {
    const groups = this.registry.bySource(input.refs);
    if (input.requestId) {
      const request = await this.em.fork().findOne(PrivacyRequestEntity, input.requestId);
      if (!request || !request.thirdParty || request.kind !== 'erasure') throw new BadRequestException({ code: 'privacy.requestMismatch' });
    }
    const results: ThirdPartyErasureResult['results'] = [];
    for (const [source, ids] of groups) {
      const outcomes = await source.erase(ids);
      for (const id of ids) results.push({ source: source.key, id, ...(outcomes.get(id) ?? { outcome: 'kept' as const, code: 'privacy.thirdPartyNotFound' }) });
    }
    const counts = { anonymized: 0, deleted: 0, kept: 0 };
    for (const r of results) counts[r.outcome]++;
    await this.audit.log('privacy.third-party-erased', { counts, sources: [...groups.keys()].map((s) => s.key), reason: input.reason, ...(input.requestId ? { requestId: input.requestId } : {}) });
    return { results };
  }
}
