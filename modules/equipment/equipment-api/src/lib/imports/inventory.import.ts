import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { berlinDate, type ImportContext, type ImportProfile, type ImportRow, normalizeHeading, parseDate } from '@forga/core-api';
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
  field('inspectionType', 'Prüfart', 'Inspection type', ['Prüfart', 'Prüfung', 'Prüfungsart']),
  field('lastInspection', 'Letzte Prüfung', 'Last inspection', ['letzte Prüfung', 'geprüft am', 'Prüfdatum']),
  field('nextInspection', 'Nächste Prüfung', 'Next inspection', ['nächste Prüfung', 'fällig am', 'nächste Fälligkeit']),
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
        de: 'Eine Zeile je Gerät und Prüfart. Vorhandene Inventarnummern werden aktualisiert. Eine „letzte Prüfung“ gilt für die Prüfart der Zeile (Schlüssel oder Name), ohne Prüfart für die erste regelmäßige Prüfart des Gerätetyps. Mehrere Zeilen derselben Inventarnummer übernehmen die letzten Prüfungen mehrerer Prüfarten.',
        en: 'One row per item and inspection type. Existing inventory numbers are updated. A "last inspection" applies to the inspection type of the row (key or name), without one to the first periodic inspection type of the equipment type. Several rows of the same inventory number take over the last inspections of several inspection types.',
      },
      permission: WRITE,
      fields: FIELDS,
      run: (rows, context) => this.run(rows, context),
    };
  }

  /**
   * Only the columns of the file are taken over: an existing item keeps the fields whose columns the file lacks (type,
   * category, vehicle, serial number …). A type or category that is given but unknown is an error. A "last inspection"
   * that cannot be assigned to an inspection type is not taken over; the row says so (`equipment.import.inspectionDiscarded`).
   */
  private async run(rows: ImportRow[], { user, dryRun }: ImportContext): Promise<ImportResult> {
    const em = this.em.fork();
    const departments = await this.organization.departments();
    const vehicles = await this.organization.vehicles();
    const categories = await em.find(CategoryEntity, {});
    const types = await em.find(EquipmentTypeEntity, {});
    const results: ImportRowResult[] = [];
    // Codes claimed by earlier rows of the same file; items created by earlier rows (not flushed yet).
    const claimed = new Map<string, string>();
    const created = new Map<string, EquipmentItemEntity>();
    const seen = new Set<string>();
    for (const { row, values } of rows) {
      const label = `${values['inventoryNumber'] ?? ''} ${values['name'] ?? ''}`.trim();
      const error = (code: string, params?: Record<string, string>) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      // A column of the file (mapped), even if the cell is empty; `given` = with a value.
      const has = (key: string) => key in values;
      const given = (key: string) => (values[key] ?? '').trim() !== '';
      const department = match(departments, values['department']?.replace(/^(abteilung|abt\.?)\s*/i, ''), (d) => [d.name, d.shortName]) ?? match(departments, values['department'], (d) => [d.name, d.shortName]);
      if (!department) { error('masterdata.import.unknownDepartment', { name: values['department'] ?? '' }); continue; }
      if (!user.can(WRITE, department.id)) { error('auth.forbidden'); continue; }
      const inventoryNumber = values['inventoryNumber']!;
      const fresh = created.get(inventoryNumber);
      const stored = fresh ?? (await em.findOne(EquipmentItemEntity, { inventoryNumber }));
      if (stored && !user.can(WRITE, stored.departmentId)) { error('auth.forbidden'); continue; }

      const named = given('type') ? match(types, values['type'], (t) => [t.key, t.name.de, t.name.en]) : undefined;
      if (given('type') && !named) { error('equipment.unknownType', { key: values['type']! }); continue; }
      const type = named ?? (stored?.typeKey ? types.find((t) => t.key === stored.typeKey) : undefined);
      const namedCategory = given('category') ? match(categories, values['category'], (c) => [c.key, c.name.de, c.name.en]) : undefined;
      if (given('category') && !named && !namedCategory) { error('equipment.unknownCategory', { key: values['category']! }); continue; }
      const category = (named && categories.find((c) => c.key === named.categoryKey)) ?? namedCategory ?? (stored ? categories.find((c) => c.key === stored.categoryKey) : undefined) ?? (type && categories.find((c) => c.key === type.categoryKey));
      if (!category) { error('equipment.unknownCategory', { key: values['category'] ?? '' }); continue; }
      const vehicle = given('vehicle') ? match(vehicles, values['vehicle'], (v) => [v.radioCallSign, v.designation]) : undefined;
      if (given('vehicle') && !vehicle) { error('equipment.import.unknownVehicle', { name: values['vehicle']! }); continue; }

      const lastInspection = given('lastInspection') ? parseDate(values['lastInspection']!) : null;
      const nextInspection = given('nextInspection') ? parseDate(values['nextInspection']!) : null;
      if ((given('lastInspection') && !lastInspection) || (given('nextInspection') && !nextInspection)) { error('imports.invalidDate'); continue; }
      const inspections = type?.inspections ?? [];
      const inspectionType = given('inspectionType')
        ? match(inspections, values['inspectionType'], (t) => [t.key, t.name.de, t.name.en])
        : inspections.find((t) => t.trigger === 'periodic' && t.intervalMonths);
      if (given('inspectionType') && !inspectionType) { error('equipment.unknownInspection', { key: values['inspectionType']! }); continue; }
      if (lastInspection && lastInspection > berlinDate()) { error('equipment.inspectionInFuture', { date: lastInspection }); continue; }
      if (lastInspection && lastInspection < '1900-01-01') { error('equipment.dateTooEarly', { date: lastInspection }); continue; }
      if (lastInspection && nextInspection && nextInspection <= lastInspection) { error('equipment.nextDueNotAfterDate', { date: lastInspection, nextDueOn: nextInspection }); continue; }
      const messages: ImportRowResult['messages'] = lastInspection && !inspectionType ? [{ code: 'equipment.import.inspectionDiscarded', params: { date: lastInspection } }] : [];

      // Fields of an existing item only where the file has the column; a new item gets defaults for the others.
      const fields = {
        name: values['name']!,
        departmentId: department.id,
        categoryKey: category.key,
        ...(named || !stored ? { typeKey: type?.key ?? null } : {}),
        ...(has('serialNumber') || !stored ? { serialNumber: values['serialNumber'] ?? '' } : {}),
        ...(has('manufacturer') || !stored ? { manufacturer: values['manufacturer'] ?? '' } : {}),
        ...(has('vehicle') || !stored ? { vehicleId: vehicle?.id ?? null } : {}),
        ...(vehicle ? { stationId: null } : {}),
        ...(has('loadingPlace') || !stored ? { loadingPlace: values['loadingPlace'] ?? '' } : {}),
        ...(has('quantity') || !stored ? { quantity: Number(values['quantity'] || 1) || 1 } : {}),
      };
      // Codes are only set when the file has them, so an import without these columns keeps the stored ones.
      const codes = {
        ...(given('barcode') ? { barcode: values['barcode']!.trim() } : {}),
        ...(given('rfid') ? { rfid: normalizeRfid(values['rfid']!) } : {}),
      };
      const taken = await this.codeTaken(em, codes, inventoryNumber, claimed);
      if (taken) { error('codes.taken', { value: taken }); continue; }
      const action = stored || seen.has(inventoryNumber) ? 'update' : 'create';
      seen.add(inventoryNumber);
      if (!dryRun) {
        let item = stored;
        if (item) Object.assign(item, fields, codes);
        else {
          item = em.create(EquipmentItemEntity, { ...fields, ...codes, inventoryNumber, status: 'ready', triggered: {}, forVehicleId: null });
          created.set(inventoryNumber, item);
        }
        // The same inspection is not taken over twice (stored items only; new ones have none yet).
        const known = lastInspection && inspectionType && !fresh && created.get(inventoryNumber) !== item ? await em.count(InspectionEntity, { item, inspectionKey: inspectionType.key, date: lastInspection }) : 0;
        if (lastInspection && inspectionType && !known) {
          em.create(InspectionEntity, { item, inspectionKey: inspectionType.key, date: lastInspection, result: 'passed', recordedBy: `Import (${user.displayName})`, inspectorCompany: '', checklist: [], measurements: '', notes: '', qualificationWarning: false, nextDueOn: nextInspection });
        }
      }
      results.push({ row, action, label, messages });
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
