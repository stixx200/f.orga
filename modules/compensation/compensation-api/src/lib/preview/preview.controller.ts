import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Optional, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { RequirePermissions, ZodPipe } from '@forga/core-api';
import { incidentPayout, type Preview, PreviewInput } from '@forga/compensation-contracts';
import { INCIDENTS_LOOKUP, type IncidentsLookup, type ReportReference } from '@forga/incidents-contracts';

const SETTINGS = 'compensation.settings.manage';

/** "How incident X would be computed" with the settings being edited, before they are saved. */
@Controller('compensation/preview')
export class PreviewController {
  constructor(@Optional() @Inject(INCIDENTS_LOOKUP) private readonly incidents?: IncidentsLookup) {}

  /** Reports of the period to choose an incident from; empty without the incidents module. */
  @Get('reports')
  @RequirePermissions(SETTINGS)
  async reports(@Query('from') from: string, @Query('to') to: string): Promise<ReportReference[]> {
    return this.incidents && from && to ? this.incidents.inPeriod(from, to) : [];
  }

  @Post()
  @HttpCode(200)
  @RequirePermissions(SETTINGS)
  async preview(@Body(new ZodPipe(PreviewInput)) input: z.infer<typeof PreviewInput>): Promise<Preview> {
    const { settings } = input;
    const preview = await this.incidents?.compensationPreview(input.incidentId, { rates: settings.incidentRates, rounding: settings.incidentRounding, minimumHours: settings.incidentMinimumHours });
    if (!preview) throw new NotFoundException();
    return {
      ...preview,
      reports: preview.reports.map((r) => ({
        ...r,
        personnel: r.personnel.map((p) => {
          const payout = p.personId ? incidentPayout(p, settings) : { amount: 0, refreshment: null, hints: [] };
          return { ...p, computed: p.amount, ...payout };
        }),
      })),
    };
  }
}
