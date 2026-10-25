import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type ImportContext, type ImportProfile, type ImportRow, normalizeHeading, parseDate } from '@forga/core-api';
import { type ImportResult, type ImportRowResult, normalizeRfid } from '@forga/core-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { CategoryEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionEntity } from '../equipment.entities.js';
import { WRITE } from '../items/items.service.js';

function match<T>(list: T[], value: string | undefined, names: (x: T) => string[]): T | undefined {
  const wanted = normalizeHeading(value ?? '');
  return wanted ? list.find((x) => names(x).some((n) => normalizeHeading(n) === wanted)) : undefined;
}

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

const FIELDS = [
  field('inventoryNumber', 'Inventarnummer', 'Inventory number', ['Inventar-Nr.', 'Inventarnummer', 'Gerätenummer', 'Nummer'], true),
  field('name', 'Bezeichnung', 'Name', ['Bezeichnung', 'Gerät', 'Name'], true),
  field('category', 'Kategorie', 'Category', ['Kategorie', 'Gruppe', 'Geräteart']),
  field('type', 'Gerätetyp', 'Equipment type', ['Gerätetyp', 'Typ']),
  field('serialNumber', 'Seriennummer', 'Serial number', ['Seriennummer', 'Serien-Nr.', 'S/N']),
  field('barcode', 'Barcode', 'Barcode', ['Barcode', 'Strichcode', 'EAN', 'QR-Code']),
  field('rfid', 'RFID-Chip', 'RFID chip', ['RFID', 'RFID-Chip', 'Transponder', 'Chip-ID', 'UID']),
  field('manufacturer', 'Hersteller', 'Manufacturer', ['Hersteller']),
  field('department', 'Abteilung', 'Department', ['Abteilung', 'Abt.'], true),
  field('vehicle', 'Fahrzeug', 'Vehicle', ['Fahrzeug', 'Funkrufname']),
  field('loadingPlace', 'Beladeplatz', 'Loading place', ['Beladeplatz', 'Lagerort', 'G-Raum']),
  field('quantity', 'Menge', 'Quantity', ['Menge', 'Anzahl', 'Bestand']),
  field('lastInspection', 'Letzte Prüfung', 'Last inspection', ['letzte Prüfung', 'geprüft am', 'Prüfdatum']),
];

/** Inventory with the last inspection, e.g. from the MP-Feuer equipment export. */
@Injectable()
export class InventoryImport {
  constructor(
    private readonly em: EntityManager,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'equipment.inventory',
      name: { de: 'Inventar', en: 'Inventory' },
      description: {
        de: 'Eine Zeile je Gerät. Vorhandene Inventarnummern werden aktualisiert. Eine „letzte Prüfung“ gilt für die erste regelmäßige Prüfart des Gerätetyps.',
        en: 'One row per item. Existing inventory numbers are updated. A "last inspection" applies to the first periodic inspection type of the equipment type.',
      },
      permission: WRITE,
      fields: FIELDS,
      run: (rows, context) => this.run(rows, context),
    };
  }

  private async run(rows: ImportRow[], { user, dryRun }: ImportContext): Promise<ImportResult> {
    const em = this.em.fork();
    const departments = await this.organization.departments();
    const vehicles = await this.organization.vehicles();
    const categories = await em.find(CategoryEntity, {});
    const types = await em.find(EquipmentTypeEntity, {});
    const results: ImportRowResult[] = [];
    // Codes claimed by earlier rows of the same file.
    const claimed = new Map<string, string>();
    for (const { row, values } of rows) {
      const label = `${values['inventoryNumber'] ?? ''} ${values['name'] ?? ''}`.trim();
      const error = (code: string, params?: Record<string, string>) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const department = match(departments, values['department']?.replace(/^(abteilung|abt\.?)\s*/i, ''), (d) => [d.name, d.shortName]) ?? match(departments, values['department'], (d) => [d.name, d.shortName]);
      if (!department) { error('masterdata.import.unknownDepartment', { name: values['department'] ?? '' }); continue; }
      if (!user.can(WRITE, department.id)) { error('auth.forbidden'); continue; }
      const type = match(types, values['type'], (t) => [t.key, t.name.de, t.name.en]);
      const category = (type && categories.find((c) => c.key === type.categoryKey)) ?? match(categories, values['category'], (c) => [c.key, c.name.de, c.name.en]);
      if (!category) { error('equipment.unknownCategory', { key: values['category'] ?? '' }); continue; }
      const vehicle = match(vehicles, values['vehicle'], (v) => [v.radioCallSign, v.designation]);
      const lastInspection = values['lastInspection'] ? parseDate(values['lastInspection']) : null;
      const fields = {
        name: values['name']!,
        typeKey: type?.key ?? null,
        categoryKey: category.key,
        serialNumber: values['serialNumber'] ?? '',
        manufacturer: values['manufacturer'] ?? '',
        departmentId: department.id,
        vehicleId: vehicle?.id ?? null,
        loadingPlace: values['loadingPlace'] ?? '',
        quantity: Number(values['quantity'] ?? 1) || 1,
      };
      // Codes are only set when the file has them, so an import without these columns keeps the stored ones.
      const codes = {
        ...(values['barcode'] ? { barcode: values['barcode'].trim() } : {}),
        ...(values['rfid'] ? { rfid: normalizeRfid(values['rfid']) } : {}),
      };
      let item = await em.findOne(EquipmentItemEntity, { inventoryNumber: values['inventoryNumber']! });
      const taken = await this.codeTaken(em, codes, values['inventoryNumber']!, claimed);
      if (taken) { error('codes.taken', { value: taken }); continue; }
      const action = item ? 'update' : 'create';
      if (!dryRun) {
        if (item) Object.assign(item, fields, codes);
        else item = em.create(EquipmentItemEntity, { ...fields, ...codes, inventoryNumber: values['inventoryNumber']!, status: 'ready', triggered: {}, forVehicleId: null });
        const periodic = type?.inspections.find((t) => t.trigger === 'periodic' && t.intervalMonths);
        if (lastInspection && periodic && !(await em.count(InspectionEntity, { item, inspectionKey: periodic.key, date: lastInspection }))) {
          em.create(InspectionEntity, { item, inspectionKey: periodic.key, date: lastInspection, result: 'passed', recordedBy: `Import (${user.displayName})`, inspectorCompany: '', checklist: [], measurements: '', notes: '', qualificationWarning: false, nextDueOn: null });
        }
      }
      results.push({ row, action, label, messages: [] });
    }
    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }

  /** The code if another item (stored or earlier in the file) already carries it. */
  private async codeTaken(em: EntityManager, codes: { barcode?: string; rfid?: string }, inventoryNumber: string, claimed: Map<string, string>): Promise<string | null> {
    for (const [kind, value] of Object.entries(codes)) {
      const key = `${kind}:${value}`;
      const owner = claimed.get(key) ?? (await em.findOne(EquipmentItemEntity, { [kind]: value }))?.inventoryNumber;
      if (owner && owner !== inventoryNumber) return value;
      claimed.set(key, inventoryNumber);
    }
    return null;
  }
}
