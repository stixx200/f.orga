import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { z } from 'zod';
import type { Language, ListColumn, LocalizedText } from '@forga/core-contracts';
import type { AuthenticatedUser, ListDefinition } from '@forga/core-api';
import { type DriverLicenseCheckMethod, type DriverLicenseClass, DriverLicenseState } from '@forga/masterdata-contracts';
import { Department, DriverLicenseCheck } from '../masterdata.entities.js';
import { activeMemberships, PersonsService, primaryDepartment } from '../persons/persons.service.js';
import { today } from '../shared/access.js';
import { CHECK, DriverLicensesService } from './driver-licenses.service.js';

const col = (key: string, de: string, en: string, width?: number): ListColumn => ({ key, label: { de, en }, ...(width ? { width } : {}) });

export const METHOD_LABELS: Record<DriverLicenseCheckMethod, LocalizedText> = {
  'in-person': { de: 'Original vorgelegt', en: 'Original presented' },
  transponder: { de: 'Selbstkontrolle Transponder', en: 'Self-check transponder' },
  barcode: { de: 'Selbstkontrolle Barcode', en: 'Self-check barcode' },
  legacy: { de: 'aus Altdaten', en: 'from old data' },
};

const STATE_LABELS: Record<DriverLicenseState, LocalizedText> = {
  'classes-missing': { de: 'Klassen fehlen', en: 'Classes missing' },
  overdue: { de: 'überfällig', en: 'overdue' },
  requested: { de: 'Vorlage angefordert', en: 'Presentation requested' },
  'first-check-missing': { de: 'Ersterfassung fehlt', en: 'First check missing' },
  due: { de: 'fällig', en: 'due' },
  checked: { de: 'kontrolliert', en: 'checked' },
};

const YES_NO: Record<'yes' | 'no', LocalizedText> = { yes: { de: 'ja', en: 'yes' }, no: { de: 'nein', en: 'no' } };

/** "B, BE, C bis 16.04.2031" in the language of the list. */
function classesText(classes: readonly DriverLicenseClass[], language: Language): string {
  const until = language === 'de' ? 'bis' : 'until';
  const format = (date: string) => (language === 'de' ? date.split('-').toReversed().join('.') : date);
  return classes.map((c) => (c.expiresOn ? `${c.class} ${until} ${format(c.expiresOn)}` : c.class)).join(', ');
}

const departmentParameter = { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' as const };
const date = z.iso.date();

/** List templates of the driving licence checks: the state of the target group and the proof for the municipality. */
@Injectable()
export class DriverLicenseLists {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly licenses: DriverLicensesService,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.state(), this.proof()] as ListDefinition<never>[];
  }

  private async departments(): Promise<Map<string, string>> {
    return new Map((await this.em.fork().find(Department, {})).map((d) => [d.id, d.name]));
  }

  private state(): ListDefinition<{ departmentId?: string; state?: DriverLicenseState }> {
    return {
      id: 'masterdata.driver-licenses',
      name: { de: 'Führerscheinkontrollen: Stand', en: 'Driving licence checks: state' },
      description: { de: 'Personen der Zielgruppe mit Klassen, Befristung, letzter Kontrolle und Stand.', en: 'Persons of the target group with classes, expiry, latest check and state.' },
      permission: CHECK,
      parameters: [
        departmentParameter,
        { key: 'state', label: { de: 'Stand', en: 'State' }, type: 'select', options: DriverLicenseState.options.map((value) => ({ value, label: STATE_LABELS[value] })) },
      ],
      schema: z.object({ departmentId: z.uuid().optional(), state: DriverLicenseState.optional() }),
      columns: [
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department', 1.5),
        col('classes', 'Klassen', 'Classes', 2.5),
        col('lastCheck', 'Letzte Kontrolle', 'Latest check'),
        col('method', 'Art', 'Method', 1.5),
        col('examiner', 'Prüfer', 'Examiner', 1.5),
        col('token', 'Transponder', 'Transponder', 0.8),
        col('state', 'Stand', 'State', 1.2),
      ],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const [overview, departments] = await Promise.all([this.licenses.overview(user), this.departments()]);
        return {
          rows: overview.rows
            .filter((r) => (!params.departmentId || r.departmentIds.includes(params.departmentId)) && (!params.state || r.state === params.state))
            .map((r) => ({
              name: `${r.lastName}, ${r.firstName}`,
              department: departments.get(r.primaryDepartmentId ?? '') ?? '',
              classes: classesText(r.classes, language),
              lastCheck: r.lastCheck?.checkedOn ?? null,
              method: r.lastCheck ? METHOD_LABELS[r.lastCheck.method][language] : '',
              examiner: r.lastCheck?.checkedBy ?? '',
              token: YES_NO[r.token ? 'yes' : 'no'][language],
              state: STATE_LABELS[r.state][language],
            })),
        };
      },
    };
  }

  /** All valid checks in the period, for the keeper of the vehicles (municipality). No reasons, no sticker IDs. */
  private proof(): ListDefinition<{ from?: string; to?: string; departmentId?: string }> {
    return {
      id: 'masterdata.driver-license-checks',
      name: { de: 'Führerscheinkontrollen: Nachweis für die Gemeinde', en: 'Driving licence checks: proof for the municipality' },
      description: {
        de: 'Alle Kontrollen im Zeitraum mit Klassen und Befristung, Art, Prüfer und „Original vorgelegt“. Selbstkontrollen erscheinen als solche.',
        en: 'All checks in the period with classes and expiry, method, examiner and "original presented". Self-checks appear as such.',
      },
      permission: CHECK,
      parameters: [
        { key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' },
        { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' },
        departmentParameter,
      ],
      schema: z.object({ from: date.optional(), to: date.optional(), departmentId: z.uuid().optional() }),
      columns: [
        col('checkedOn', 'Datum', 'Date'),
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department', 1.5),
        col('classes', 'Klassen und Befristung', 'Classes and expiry', 3),
        col('method', 'Art', 'Method', 1.6),
        col('examiner', 'Prüfer', 'Examiner', 1.5),
        col('original', 'Original vorgelegt', 'Original presented', 0.9),
      ],
      orientation: 'landscape',
      rows: async (user: AuthenticatedUser, params, language) => {
        const to = params.to ?? today();
        const from = params.from ?? `${to.slice(0, 4)}-01-01`;
        const visible = await this.persons.findVisible(user, CHECK, {});
        const persons = params.departmentId ? visible.filter((p) => activeMemberships(p).some((m) => m.department.id === params.departmentId)) : visible;
        const byId = new Map(persons.map((p) => [p.id, p]));
        const departments = await this.departments();
        const checks = byId.size
          ? await this.em.fork().find(
              DriverLicenseCheck,
              { person: { $in: [...byId.keys()] }, cancelledAt: null, checkedOn: { $gte: from, $lte: to } },
              { populate: ['checkedBy'], orderBy: { checkedOn: 'asc', recordedAt: 'asc' } },
            )
          : [];
        return {
          subtitle: `${from} – ${to}`,
          rows: checks.map((c) => {
            const person = byId.get(c.person.id)!;
            return {
              checkedOn: c.checkedOn,
              name: `${person.lastName}, ${person.firstName}`,
              department: departments.get(primaryDepartment(person) ?? '') ?? '',
              classes: classesText(c.classes, language),
              method: METHOD_LABELS[c.method][language],
              examiner: c.checkedBy ? `${c.checkedBy.firstName} ${c.checkedBy.lastName}` : c.device,
              original: YES_NO[c.originalPresented ? 'yes' : 'no'][language],
            };
          }),
        };
      },
    };
  }
}
