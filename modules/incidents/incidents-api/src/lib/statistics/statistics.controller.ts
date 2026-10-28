import { Body, ConflictException, Controller, Get, HttpCode, Inject, Optional, Param, ParseIntPipe, Post, Put, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { Audit, type AuthenticatedUser, berlinDayStart, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { type AnnualStatistics, CloseStatistics, type StatisticsCheck, StatisticsCorrections, type StatisticsValue } from '@forga/incidents-contracts';
import { TRAINING_CASUALTIES, type TrainingCasualties } from '@forga/training-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { AlarmKeywordEntity, IncidentEntity, ReportEntity, StatisticsYearEntity } from '../incidents.entities.js';
import { checkAnnualStatistics, computeAnnualStatistics } from './annual-statistics.js';
import { STATE_TEMPLATE_BASE64 } from './state-template.js';

const PERMISSION = 'incidents.statistics';

const valueKey = (v: StatisticsValue) => `${v.question}:${v.column}:${v.value}`;

/** Annual statistics for the state portal: preview with plausibility checks, corrections, export into the template. */
@Controller('incidents/statistics')
@RequirePermissions(PERMISSION)
export class StatisticsController {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(TRAINING_CASUALTIES) private readonly training?: TrainingCasualties,
  ) {}

  @Get(':year')
  preview(@Param('year', ParseIntPipe) year: number): Promise<AnnualStatistics> {
    return this.build(year);
  }

  @Put(':year/corrections')
  async correct(
    @Param('year', ParseIntPipe) year: number,
    @Body(new ZodPipe(StatisticsCorrections)) input: StatisticsCorrections,
  ): Promise<AnnualStatistics> {
    const em = this.em.fork();
    const stored = await this.year(em, year);
    if (stored.closedAt) throw new ConflictException({ code: 'incidents.statisticsClosed' });
    const corrections = { ...stored.corrections };
    for (const [key, value] of Object.entries(input.corrections)) {
      if (value === null) delete corrections[key];
      else corrections[key] = value;
    }
    stored.corrections = corrections;
    await em.flush();
    return this.build(year);
  }

  /**
   * Closing stores the values and checks as they are now: the closed year keeps showing (and exporting) them, even
   * if reports change later (`changedSinceClose`). With open checks closing needs `force`.
   */
  @Post(':year/close')
  @HttpCode(200)
  async close(
    @Param('year', ParseIntPipe) year: number,
    @Body(new ZodPipe(CloseStatistics)) input: ReturnType<typeof CloseStatistics.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AnnualStatistics> {
    const em = this.em.fork();
    const stored = await this.year(em, year);
    if (stored.closedAt) throw new ConflictException({ code: 'incidents.statisticsClosed' });
    const { values, checks } = await this.compute(year, stored.corrections);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length && !input.force) throw new ConflictException({ code: 'incidents.statisticsChecksOpen', count: failed.length });
    stored.closedAt = new Date();
    stored.closedBy = user.displayName;
    stored.frozenValues = values;
    stored.frozenChecks = checks;
    await em.flush();
    await this.audit.log('incidents.statistics-closed', { year, openChecks: failed.map((c) => c.code) });
    return this.build(year);
  }

  @Post(':year/reopen')
  @HttpCode(200)
  async reopen(@Param('year', ParseIntPipe) year: number): Promise<AnnualStatistics> {
    const em = this.em.fork();
    const stored = await this.year(em, year);
    stored.closedAt = null;
    stored.closedBy = null;
    stored.frozenValues = null;
    stored.frozenChecks = null;
    await em.flush();
    await this.audit.log('incidents.statistics-reopened', { year });
    return this.build(year);
  }

  /** The import template of the state portal with the values in the FF, youth, veterans and music columns. */
  @Get(':year/export')
  async export(@Param('year', ParseIntPipe) year: number, @Res() res: Response): Promise<void> {
    const statistics = await this.build(year);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(STATE_TEMPLATE_BASE64, 'base64') as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const rows = new Map<string, number>();
    sheet.eachRow((row, index) => {
      const id = row.getCell(1).value;
      if (typeof id === 'string' && /^F\d+$/.test(id)) rows.set(id, index);
    });
    for (const value of statistics.values) {
      const row = rows.get(value.question);
      if (row) sheet.getCell(`${value.column}${row}`).value = value.value;
    }
    await this.audit.log('incidents.statistics-exported', { year });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Jahresstatistik_${year}.xlsx"`);
    res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
  }

  private async year(em: EntityManager, year: number): Promise<StatisticsYearEntity> {
    return (await em.findOne(StatisticsYearEntity, year)) ?? em.create(StatisticsYearEntity, { year, corrections: {} });
  }

  /** The closed year shows the values frozen at closing; otherwise the values computed now. */
  private async build(year: number): Promise<AnnualStatistics> {
    const stored = await this.em.fork().findOne(StatisticsYearEntity, year);
    const current = await this.compute(year, stored?.corrections ?? {});
    const frozen = stored?.closedAt && stored.frozenValues ? { values: stored.frozenValues, checks: stored.frozenChecks ?? [] } : null;
    const changedSinceClose = frozen !== null && current.values.map(valueKey).join('|') !== frozen.values.map(valueKey).join('|');
    return {
      year,
      referenceDate: `${year}-12-31`,
      closedAt: stored?.closedAt?.toISOString() ?? null,
      closedBy: stored?.closedBy ?? null,
      changedSinceClose,
      ...(frozen ?? current),
    };
  }

  private async compute(year: number, corrections: Record<string, number>): Promise<{ values: StatisticsValue[]; checks: StatisticsCheck[] }> {
    const em = this.em.fork();
    const referenceDate = `${year}-12-31`;
    const start = berlinDayStart(`${year}-01-01`);
    const end = berlinDayStart(`${year + 1}-01-01`);
    const [departments, stations, vehicles, members, keywords] = await Promise.all([
      this.organization.departments(),
      this.organization.stations(),
      this.organization.vehicles({ includeRetired: true }),
      this.directory.membersOn(referenceDate),
      em.find(AlarmKeywordEntity, { mainType: { $ne: null } }),
    ]);
    const reports = await em.find(ReportEntity, { alarmedAt: { $gte: start, $lt: end } }, { populate: ['personnel', 'incident'] });
    const typeOf = new Map(departments.map((d) => [d.id, d.type]));
    // Only keywords counted in the statistics (with a main type) count, not e.g. statistics left on a fire watch.
    const counted = new Set(keywords.map((k) => k.key));
    // Each incident counts once, with its statistics, if it has a primary report (as every incident with reports has).
    const incidents = (await em.find(IncidentEntity, { alarmedAt: { $gte: start, $lt: end } }, { populate: ['reports'] })).filter(
      (i) => counted.has(i.alarmKeyword) && i.reports.getItems().some((r) => r.primary),
    );

    const computed = computeAnnualStatistics({
      referenceDate,
      departments,
      stationCount: stations.length,
      permanentlyStaffedStations: stations.filter((s) => s.permanentlyStaffed).length,
      members,
      vehicles,
      incidents: incidents.flatMap((i) => (i.statistics ? [i.statistics] : [])),
      ownCasualties: reports.flatMap((r) =>
        r.personnel
          .getItems()
          .filter((p) => p.personId && (p.injured || p.killed))
          // Persons in the report of a brigade-wide unit (e.g. the duty officer) count as operational.
          .map((p) => ({ departmentType: (r.departmentId && typeOf.get(r.departmentId)) || 'operational', injured: p.injured, killed: p.killed })),
      ),
      trainingCasualties: (await this.training?.injured(year))?.map((c) => ({ departmentType: typeOf.get(c.departmentIds[0] ?? '') ?? 'operational' })) ?? [],
    });

    const byKey = new Map(computed.map((v) => [`${v.question}:${v.column}`, v]));
    const values: StatisticsValue[] = [];
    for (const key of new Set([...byKey.keys(), ...Object.keys(corrections)])) {
      const [question, column] = key.split(':') as [string, StatisticsValue['column']];
      const value = byKey.get(key);
      const corrected = corrections[key] ?? null;
      values.push({
        question,
        column,
        source: value?.source ?? 'manual',
        computed: value?.value ?? 0,
        corrected,
        value: corrected ?? value?.value ?? 0,
      });
    }
    values.sort((a, b) => Number(a.question.slice(1)) - Number(b.question.slice(1)) || a.column.localeCompare(b.column));
    const lookup = new Map(values.map((v) => [`${v.question}:${v.column}`, v.value]));

    const primary = reports.filter((r) => r.primary);
    // Only keywords counted in the statistics need statistics (not e.g. fire watch).
    const withoutStatistics = incidents.filter((i) => !i.statistics);
    const checks = [
      ...checkAnnualStatistics((key) => lookup.get(key) ?? 0),
      {
        code: 'statistics.incidentsWithoutStatistics',
        ok: withoutStatistics.length === 0,
        params: { count: withoutStatistics.length },
      },
      {
        code: 'statistics.unreleasedPrimaryReports',
        ok: primary.every((r) => r.status.startsWith('released')),
        params: { count: primary.filter((r) => !r.status.startsWith('released')).length },
      },
    ];
    return { values, checks };
  }
}
