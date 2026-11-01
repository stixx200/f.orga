import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { z } from 'zod';
import type { ListColumn } from '@forga/core-contracts';
import { type AuthenticatedUser, berlinDate, type ListDefinition, SettingsService, wordsWhere } from '@forga/core-api';
import { EquipmentSettings, type Item } from '@forga/equipment-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { CategoryEntity, InspectionEntity } from '../equipment.entities.js';
import { defectText, ItemsService, WRITE, RESULT_NAMES as RESULT } from '../items/items.service.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({ key, label: { de, en }, ...(width ? { width } : {}), ...(align ? { align } : {}) });
const department = { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' as const };
const Filter = z.object({ departmentId: z.uuid().optional(), categoryKey: z.string().optional(), until: z.iso.date().optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), vehicleId: z.uuid().optional() });
type Filter = z.infer<typeof Filter>;
const STATUS = { ready: { de: 'einsatzbereit', en: 'ready' }, 'in-inspection': { de: 'in Prüfung', en: 'in inspection' }, defective: { de: 'defekt', en: 'defective' }, 'in-repair': { de: 'in Reparatur', en: 'in repair' }, retired: { de: 'ausgesondert', en: 'retired' } } as const;
const ReportParams = z.object({ inspectionId: z.uuid().optional(), date: z.iso.date().optional(), departmentId: z.uuid().optional() });
const BLOCKED = { de: 'gesperrt (Prüfung überfällig)', en: 'blocked (inspection overdue)' } as const;

/** List templates of the equipment module. */
@Injectable()
export class EquipmentLists {
  constructor(
    private readonly em: EntityManager,
    private readonly items: ItemsService,
    private readonly settings: SettingsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.due(), this.inventory(), this.loading(), this.history(), this.report(), this.defects(), this.retired(), this.stock()] as ListDefinition<never>[];
  }

  private async places(): Promise<(i: Item) => string> {
    const vehicles = new Map((await this.organization.vehicles({ includeRetired: true })).map((v) => [v.id, v.radioCallSign || v.designation]));
    const stations = new Map((await this.organization.stations()).map((s) => [s.id, s.name]));
    return (i) => {
      const assigned = i.vehicleId ? `${vehicles.get(i.vehicleId) ?? ''}${i.loadingPlace ? ` · ${i.loadingPlace}` : ''}` : i.stationId ? (stations.get(i.stationId) ?? '') : i.loadingPlace;
      return [i.location, assigned].filter(Boolean).join(' · ');
    };
  }

  private async categoryNames(language: 'de' | 'en'): Promise<Map<string, string>> {
    return new Map((await this.em.fork().find(CategoryEntity, {})).map((c) => [c.key, c.name[language]]));
  }

  private due(): ListDefinition<Filter> {
    return {
      id: 'equipment.due',
      name: { de: 'Fällige Prüfungen', en: 'Inspections due' },
      permission: WRITE,
      parameters: [{ key: 'until', label: { de: 'Fällig bis', en: 'Due until' }, type: 'date' }, department],
      schema: Filter,
      orientation: 'landscape',
      signatureColumn: true,
      columns: [col('due', 'Fällig', 'Due'), col('inspection', 'Prüfung', 'Inspection', 2), col('number', 'Inventar-Nr.', 'Inventory no.'), col('name', 'Gerät', 'Item', 2), col('place', 'Standort', 'Location', 1.5), col('last', 'Zuletzt', 'Last')],
      rows: async (user, params, language) => {
        const { dueSoonDays } = EquipmentSettings.parse((await this.settings.get('equipment.settings')) ?? {});
        const until = params.until ?? berlinDate(new Date(Date.now() + dueSoonDays * 86_400_000));
        const place = await this.places();
        const items = await this.items.list(user, { departmentId: params.departmentId });
        return {
          subtitle: `≤ ${until}`,
          rows: items
            .flatMap((i) => i.dues.filter((d) => d.dueOn && d.dueOn <= until).map((d) => ({ due: d.dueOn, inspection: d.name[language], number: i.inventoryNumber, name: i.name, place: place(i), last: d.lastDate })))
            .toSorted((a, b) => String(a.due).localeCompare(String(b.due))),
        };
      },
    };
  }

  private inventory(): ListDefinition<Filter> {
    return {
      id: 'equipment.inventory',
      name: { de: 'Inventarliste', en: 'Inventory' },
      permission: WRITE,
      parameters: [department],
      schema: Filter,
      orientation: 'landscape',
      columns: [col('number', 'Inventar-Nr.', 'Inventory no.'), col('name', 'Gerät', 'Item', 2), col('category', 'Kategorie', 'Category'), col('serial', 'Seriennr.', 'Serial no.'), col('place', 'Standort', 'Location', 1.5), col('quantity', 'Menge', 'Qty', 0.6, 'right'), col('status', 'Status', 'Status'), col('next', 'Nächste Prüfung', 'Next inspection')],
      rows: async (user, params, language) => {
        const place = await this.places();
        const categories = await this.categoryNames(language);
        const items = await this.items.list(user, { departmentId: params.departmentId });
        return { rows: items.map((i) => ({ number: i.inventoryNumber, name: i.name, category: categories.get(i.categoryKey) ?? i.categoryKey, serial: i.serialNumber, place: place(i), quantity: i.quantity, status: (i.blocked ? BLOCKED : STATUS[i.status])[language], next: i.nextDue })) };
      },
    };
  }

  private loading(): ListDefinition<Filter> {
    return {
      id: 'equipment.loading',
      name: { de: 'Beladeliste', en: 'Loading list' },
      description: { de: 'Beladung je Fahrzeug nach Beladeplatz', en: 'Equipment per vehicle by loading place' },
      permission: WRITE,
      parameters: [department],
      schema: Filter,
      signatureColumn: true,
      columns: [col('vehicle', 'Fahrzeug', 'Vehicle'), col('place', 'Beladeplatz', 'Loading place'), col('name', 'Gerät', 'Item', 2), col('number', 'Inventar-Nr.', 'Inventory no.'), col('quantity', 'Menge', 'Qty', 0.6, 'right')],
      rows: async (user, params) => {
        const vehicles = new Map((await this.organization.vehicles()).map((v) => [v.id, v.radioCallSign || v.designation]));
        const items = (await this.items.list(user, { departmentId: params.departmentId })).filter((i) => i.vehicleId);
        return {
          rows: items
            .map((i) => ({ vehicle: vehicles.get(i.vehicleId!) ?? '', place: i.loadingPlace, name: i.name, number: i.inventoryNumber, quantity: i.quantity }))
            .toSorted((a, b) => a.vehicle.localeCompare(b.vehicle) || a.place.localeCompare(b.place) || a.name.localeCompare(b.name)),
        };
      },
    };
  }

  private history(): ListDefinition<Filter> {
    return {
      id: 'equipment.inspections',
      name: { de: 'Prüfhistorie', en: 'Inspection history' },
      permission: WRITE,
      personalData: 'names',
      parameters: [{ key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' }, { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' }, department],
      schema: Filter,
      orientation: 'landscape',
      columns: [col('date', 'Datum', 'Date'), col('number', 'Inventar-Nr.', 'Inventory no.'), col('name', 'Gerät', 'Item', 2), col('inspection', 'Prüfung', 'Inspection', 1.5), col('result', 'Ergebnis', 'Result'), col('by', 'Prüfer', 'Inspector', 1.2), col('next', 'Nächste', 'Next')],
      rows: async (user: AuthenticatedUser, params, language) => {
        const visible = this.items.visible(user);
        if (!visible) return { rows: [] };
        const year = berlinDate().slice(0, 4);
        const from = params.from ?? `${year}-01-01`;
        const to = params.to ?? `${year}-12-31`;
        const rows = await this.em.fork().find(
          InspectionEntity,
          { date: { $gte: from, $lte: to }, cancelled: false, item: { ...(visible as object), ...(params.departmentId ? { departmentId: params.departmentId } : {}) } },
          { populate: ['item'], orderBy: { date: 'asc' } },
        );
        const items = await this.items.toDtos([...new Map(rows.map((r) => [r.item.id, r.item])).values()]);
        const name = (itemId: string, key: string) => items.find((i) => i.id === itemId)?.inspections.find((t) => t.key === key)?.name[language] ?? key;
        return {
          subtitle: `${from} – ${to}`,
          // Inspectors who are members (others are named by company or user name only).
          personIds: rows.flatMap((r) => (r.inspectorPersonId ? [r.inspectorPersonId] : [])),
          rows: rows.map((r) => ({ date: r.date, number: r.item.inventoryNumber, name: r.item.name, inspection: name(r.item.id, r.inspectionKey), result: RESULT[r.result][language], by: r.inspectorCompany || r.recordedBy, next: r.nextDueOn ?? null })),
        };
      },
    };
  }

  /** Inspection report (Prüfprotokoll) of one inspection or of all inspections of a day, with checklist, measurements and signature. */
  private report(): ListDefinition<z.infer<typeof ReportParams>> {
    return {
      id: 'equipment.inspection-report',
      name: { de: 'Prüfprotokoll', en: 'Inspection report' },
      description: { de: 'Eine Prüfung oder alle Prüfungen eines Tages mit Checkliste, Messwerten und Unterschrift', en: 'One inspection or all inspections of a day with checklist, measurements and signature' },
      permission: WRITE,
      personalData: 'names',
      parameters: [{ key: 'date', label: { de: 'Tag', en: 'Day' }, type: 'date' }, department, {
          key: 'inspectionId',
          label: { de: 'Einzelne Prüfung', en: 'Single inspection' },
          type: 'choice',
          // The latest inspections of the visible items, found by inventory number or name.
          choices: async (user, query) => {
            const visible = this.items.visible(user);
            if (!visible) return [];
            const words = wordsWhere(query, ['inventoryNumber', 'name']);
            const found = await this.em.fork().find(
              InspectionEntity,
              { $and: [{ cancelled: false }, { item: { $and: [visible, ...(words ? [words] : [])] } as object }] },
              { populate: ['item'], orderBy: { date: 'desc' }, limit: 50 },
            );
            return found.map((i) => ({ value: i.id, label: `${i.item.inventoryNumber} ${i.item.name}`, description: `${i.date} · ${i.inspectionKey}` }));
          },
        },
      ],
      schema: ReportParams,
      orientation: 'landscape',
      signatureColumn: true,
      columns: [
        col('item', 'Gerät', 'Item', 2),
        col('inspection', 'Prüfung', 'Inspection', 1.3),
        col('result', 'Ergebnis', 'Result'),
        col('checklist', 'Checkliste', 'Checklist', 3),
        col('measurements', 'Messwerte / Bemerkung', 'Measurements / notes', 2),
        col('by', 'Prüfer', 'Inspector', 1.3),
        col('next', 'Nächste', 'Next'),
      ],
      rows: async (user: AuthenticatedUser, params, language) => {
        const visible = this.items.visible(user);
        if (!visible) return { rows: [] };
        const date = params.date ?? berlinDate();
        const where = params.inspectionId ? { id: params.inspectionId } : { date, cancelled: false, ...(params.departmentId ? { item: { departmentId: params.departmentId } } : {}) };
        const rows = await this.em.fork().find(InspectionEntity, { $and: [where, { item: visible as object }] }, { populate: ['item'], orderBy: { date: 'asc', item: { inventoryNumber: 'asc' } } });
        const items = await this.items.toDtos([...new Map(rows.map((r) => [r.item.id, r.item])).values()]);
        const name = (itemId: string, key: string) => items.find((i) => i.id === itemId)?.inspections.find((t) => t.key === key)?.name[language] ?? key;
        const inspectors = new Map((await this.directory.summaries(rows.flatMap((r) => (r.inspectorPersonId ? [r.inspectorPersonId] : [])))).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]));
        const ok = language === 'de' ? 'i. O.' : 'OK';
        const notOk = language === 'de' ? 'n. i. O.' : 'not OK';
        const point = (c: { point: string; state: string; value: string }) => `${c.point}: ${c.state === 'ok' ? ok : c.state === 'not-ok' ? notOk : c.value}`;
        return {
          subtitle: params.inspectionId ? (rows[0]?.date ?? '') : date,
          personIds: [...inspectors.keys()],
          rows: rows.map((r) => ({
            item: `${r.item.inventoryNumber} ${r.item.name}`,
            inspection: name(r.item.id, r.inspectionKey),
            result: RESULT[r.result][language],
            checklist: r.checklist.map(point).join('; '),
            measurements: [r.measurements, r.notes].filter(Boolean).join(' · '),
            by: r.inspectorCompany || (r.inspectorPersonId ? (inspectors.get(r.inspectorPersonId) ?? '') : '') || r.recordedBy,
            next: r.nextDueOn ?? null,
          })),
        };
      },
    };
  }

  private defects(): ListDefinition<Filter> {
    return {
      id: 'equipment.defects',
      name: { de: 'Offene Mängel', en: 'Open defects' },
      permission: WRITE,
      personalData: 'names',
      parameters: [department],
      schema: Filter,
      columns: [col('date', 'Gemeldet', 'Reported'), col('number', 'Inventar-Nr.', 'Inventory no.'), col('name', 'Gerät', 'Item', 1.5), col('description', 'Mangel', 'Defect', 2.5), col('by', 'Von', 'By')],
      rows: async (user, params, language) => {
        const defects = (await this.items.defects(user, { open: true })).filter((d) => !params.departmentId || d.departmentId === params.departmentId);
        return { rows: defects.map((d) => ({ date: d.reportedAt.slice(0, 10), number: d.inventoryNumber, name: d.itemName, description: defectText(d, language), by: d.reportedBy })) };
      },
    };
  }

  private retired(): ListDefinition<Filter> {
    return {
      id: 'equipment.retired',
      name: { de: 'Ausgesonderte Geräte', en: 'Retired equipment' },
      permission: WRITE,
      parameters: [{ key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' }, { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' }, department],
      schema: Filter,
      columns: [col('date', 'Datum', 'Date'), col('number', 'Inventar-Nr.', 'Inventory no.'), col('name', 'Gerät', 'Item', 2), col('reason', 'Grund', 'Reason', 2), col('disposition', 'Verbleib', 'Disposition', 1.5)],
      rows: async (user, params) => {
        const from = params.from ?? '1900-01-01';
        const to = params.to ?? '2999-12-31';
        const items = (await this.items.list(user, { departmentId: params.departmentId, status: 'retired' })).filter((i) => i.retirement && i.retirement.date >= from && i.retirement.date <= to);
        return { rows: items.map((i) => ({ date: i.retirement!.date, number: i.inventoryNumber, name: i.name, reason: i.retirement!.reason, disposition: i.retirement!.disposition })) };
      },
    };
  }

  private stock(): ListDefinition<Filter> {
    return {
      id: 'equipment.stock',
      name: { de: 'Bestand (Schläuche, Verbrauchsmaterial)', en: 'Stock (hoses, consumables)' },
      permission: WRITE,
      parameters: [department],
      schema: Filter,
      columns: [col('category', 'Kategorie', 'Category'), col('name', 'Art', 'Kind', 2), col('place', 'Standort', 'Location', 1.5), col('quantity', 'Menge', 'Qty', 0.7, 'right')],
      rows: async (user, params, language) => {
        const stock = new Map((await this.em.fork().find(CategoryEntity, { tracking: 'stock' })).map((c) => [c.key, c.name[language]]));
        const place = await this.places();
        const items = (await this.items.list(user, { departmentId: params.departmentId })).filter((i) => stock.has(i.categoryKey));
        return { rows: items.map((i) => ({ category: stock.get(i.categoryKey) ?? '', name: i.name, place: place(i), quantity: i.quantity })).toSorted((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) };
      },
    };
  }
}

