import { Body, ConflictException, Controller, Get, HttpCode, Inject, Optional, Param, ParseIntPipe, Post, Put, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { Audit, type AuthenticatedUser, berlinDayStart, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { type AnnualStatistics, StatisticsCorrections, type StatisticsValue } from '@forga/incidents-contracts';
import { TRAINING_CASUALTIES, type TrainingCasualties } from '@forga/training-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ReportEntity, StatisticsYearEntity } from '../incidents.entities.js';
import { checkAnnualStatistics, computeAnnualStatistics } from './annual-statistics.js';
import { STATE_TEMPLATE_BASE64 } from './state-template.js';

const PERMISSION = 'incidents.statistics';

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

  /** Closing freezes the corrections; the values stay computed from the data. */
  @Post(':year/close')
  @HttpCode(200)
  async close(@Param('year', ParseIntPipe) year: number, @CurrentUser() user: AuthenticatedUser): Promise<AnnualStatistics> {
    const em = this.em.fork();
    const stored = await this.year(em, year);
    stored.closedAt = new Date();
    stored.closedBy = user.displayName;
    await em.flush();
    await this.audit.log('incidents.statistics-closed', { year });
    return this.build(year);
  }

  @Post(':year/reopen')
  @HttpCode(200)
  async reopen(@Param('year', ParseIntPipe) year: number): Promise<AnnualStatistics> {
    const em = this.em.fork();
    const stored = await this.year(em, year);
    stored.closedAt = null;
    stored.closedBy = null;
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

  private async build(year: number): Promise<AnnualStatistics> {
    const em = this.em.fork();
    const referenceDate = `${year}-12-31`;
    const start = berlinDayStart(`${year}-01-01`);
    const end = berlinDayStart(`${year + 1}-01-01`);
    const [departments, stations, vehicles, members, stored] = await Promise.all([
      this.organization.departments(),
      this.organization.stations(),
      this.organization.vehicles({ includeRetired: true }),
      this.directory.membersOn(referenceDate),
      em.findOne(StatisticsYearEntity, year),
    ]);
    const reports = await em.find(ReportEntity, { alarmedAt: { $gte: start, $lt: end } }, { populate: ['personnel'] });
    const typeOf = new Map(departments.map((d) => [d.id, d.type]));

    const computed = computeAnnualStatistics({
      referenceDate,
      departments,
      stationCount: stations.length,
      permanentlyStaffedStations: stations.filter((s) => s.permanentlyStaffed).length,
      members,
      vehicles,
      primaryReports: reports.filter((r) => r.primary && r.statistics).map((r) => r.statistics!),
      ownCasualties: reports.flatMap((r) =>
        r.personnel
          .getItems()
          .filter((p) => p.personId && (p.injured || p.killed))
          .map((p) => ({ departmentType: typeOf.get(r.departmentId) ?? 'operational', injured: p.injured, killed: p.killed })),
      ),
      trainingCasualties: (await this.training?.injured(year))?.map((c) => ({ departmentType: typeOf.get(c.departmentIds[0] ?? '') ?? 'operational' })) ?? [],
    });

    const corrections = stored?.corrections ?? {};
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
    const checks = [
      ...checkAnnualStatistics((key) => lookup.get(key) ?? 0),
      {
        code: 'statistics.primaryReportsWithoutStatistics',
        ok: primary.every((r) => r.statistics),
        params: { count: primary.filter((r) => !r.statistics).length },
      },
      {
        code: 'statistics.unreleasedPrimaryReports',
        ok: primary.every((r) => r.status.startsWith('released')),
        params: { count: primary.filter((r) => !r.status.startsWith('released')).length },
      },
    ];
    return {
      year,
      referenceDate,
      closedAt: stored?.closedAt?.toISOString() ?? null,
      closedBy: stored?.closedBy ?? null,
      values,
      checks,
    };
  }
}
