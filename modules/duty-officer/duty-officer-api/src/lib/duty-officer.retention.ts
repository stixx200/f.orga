import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type DescribeContext, HistoryEntry, type PersonDataRegistry, type PersonDataSection, type RetentionRegistry } from '@forga/core-api';
import { dutyCompensation } from '@forga/duty-officer-contracts';
import { DutyAssignmentEntity, ExpectedReportEntity, IncidentExemptionEntity } from './duty-officer.entities.js';
import { DutyOfficerConfig } from './roster/roster.js';

/**
 * The duty officer side of the retention plan: the EvD reports are reports of their incident and follow it in the
 * incidents module; this module keeps per incident whether a report is expected or exempted (with a reason), and notes on
 * the duties of persons.
 */
@Injectable()
export class DutyOfficerRetention {
  constructor(
    private readonly em: EntityManager,
    private readonly config: DutyOfficerConfig,
  ) {}

  /**
   * Access report: the person's duties from the duty roster with notes and the compensation per duty. EvD reports are
   * incident reports and appear in the section of the incidents module.
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const duties = await this.em.fork().find(DutyAssignmentEntity, { personId }, { orderBy: { from: 'desc' } });
    if (!duties.length) return [];
    const { dutyKinds } = await this.config.get();
    const kindName = new Map(dutyKinds.map((k) => [k.key, ctx.text(k.name)]));
    const years = new Map<string, { duties: number; days: number; amount: number }>();
    const rows = duties.map((d) => {
      const compensation = dutyCompensation({ from: d.from.toISOString(), to: d.to.toISOString(), kind: d.kind }, dutyKinds);
      const year = ctx.date(d.from).slice(-4);
      const sum = years.get(year) ?? { duties: 0, days: 0, amount: 0 };
      sum.duties += 1;
      sum.days += compensation.days;
      sum.amount += compensation.amount;
      years.set(year, sum);
      return [
        kindName.get(d.kind) ?? ctx.t('Sonderdienst', 'special duty'),
        ctx.dateTime(d.from),
        ctx.dateTime(d.to),
        ctx.number(compensation.days),
        compensation.rate === null ? '–' : ctx.money(compensation.amount),
        ctx.value(d.notes),
      ];
    });
    return [
      {
        key: 'duty-officer',
        title: ctx.t('Einsatzleiter vom Dienst', 'Duty officer'),
        activity: 'duty-officer.roster',
        categories: [ctx.t('Dienstplan (Sonderdienste)', 'Duty roster (special duties)')],
        blocks: [
          {
            kind: 'table',
            title: ctx.t('Dienste im Dienstplan', 'Duties in the roster'),
            columns: [ctx.t('Dienst', 'Duty'), ctx.t('Von', 'From'), ctx.t('Bis', 'To'), ctx.t('Tage', 'Days'), ctx.t('Entschädigung', 'Compensation'), ctx.t('Notiz', 'Note')],
            rows,
            summary: [...years].map(([year, sum]) =>
              ctx.t(`${year}: ${sum.duties} Dienste, ${ctx.number(sum.days)} Tage, ${ctx.money(sum.amount)}`, `${year}: ${sum.duties} duties, ${ctx.number(sum.days)} days, ${ctx.money(sum.amount)}`),
            ),
          },
        ],
        records: [{ entity: 'duty_officer.duty_assignment', ids: duties.map((d) => d.id), label: ctx.t('Dienst', 'Duty') }],
      },
    ];
  }

  register(retention: RetentionRegistry, personData: PersonDataRegistry): void {
    retention.registerDependent('incidents.incidents', 'duty-officer', {
      execute: async (records, action) => {
        const ids = records.map((r) => r.id);
        if (!ids.length) return;
        const em = this.em.fork();
        const exemptions = await em.find(IncidentExemptionEntity, { incidentId: { $in: ids } }, { fields: ['id'] });
        if (action === 'delete') {
          await em.nativeDelete(ExpectedReportEntity, { incidentId: { $in: ids } });
          await em.nativeDelete(IncidentExemptionEntity, { incidentId: { $in: ids } });
        } else {
          // The reason may name persons ("EvD war erkrankt").
          await em.nativeUpdate(IncidentExemptionEntity, { incidentId: { $in: ids } }, { reason: '', by: '' });
        }
        if (exemptions.length) await em.nativeDelete(HistoryEntry, { entity: 'duty_officer.incident_exemption', entityId: { $in: exemptions.map((e) => e.id) } });
      },
    });
    // Anonymised persons: notes on their duties are emptied, and so is the history holding them.
    personData.register('duty-officer', {
      anonymize: async (personIds) => {
        const em = this.em.fork();
        const duties = await em.find(DutyAssignmentEntity, { personId: { $in: [...personIds] } }, { fields: ['id'] });
        if (!duties.length) return;
        await em.nativeUpdate(DutyAssignmentEntity, { personId: { $in: [...personIds] } }, { notes: '' });
        await em.nativeDelete(HistoryEntry, { entity: 'duty_officer.duty_assignment', entityId: { $in: duties.map((d) => d.id) } });
      },
    });
  }
}
