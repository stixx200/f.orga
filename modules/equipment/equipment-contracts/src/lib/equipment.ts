import { z } from 'zod';
import { ItemCode, LocalizedText, RfidCode } from '@forga/core-contracts';

const date = z.iso.date();
const text = z.string().trim().default('');
const key = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

/** Who may inspect (DGUV 305-002): user, competent person, PPE expert, electrician, manufacturer/expert. */
export const Inspector = z.enum(['user', 'competent-person', 'fall-protection-expert', 'electrician', 'expert']);
export type Inspector = z.infer<typeof Inspector>;

/** When an inspection is due: periodically, or after use, an incident or washing. */
export const InspectionTrigger = z.enum(['periodic', 'after-use', 'after-incident', 'after-washing']);
export type InspectionTrigger = z.infer<typeof InspectionTrigger>;

export const InspectionType = z.object({
  key,
  name: LocalizedText,
  /** `null` = no fixed interval (only after use, washing or by the manufacturer). */
  intervalMonths: z.number().int().min(1).max(240).nullable().default(null),
  trigger: InspectionTrigger.default('periodic'),
  inspector: Inspector.default('competent-person'),
  checklist: z.array(z.string().trim().min(1)).default([]),
});
export type InspectionType = z.infer<typeof InspectionType>;

/** Single items with number and history, or stock (e.g. 40 × B hose) per location. */
export const Tracking = z.enum(['item', 'stock']);
export type Tracking = z.infer<typeof Tracking>;

export const CategoryInput = z.object({
  key,
  name: LocalizedText,
  parentKey: key.nullable().default(null),
  tracking: Tracking.default('item'),
  /**
   * Breathing apparatus: the breathing apparatus officer inspects and maintains these items
   * (`equipment.breathing.*`), receives their deadlines and defect e-mails.
   */
  breathingApparatus: z.boolean().default(false),
  /** Items count as blocked (not ready) while an inspection is overdue, e.g. breathing apparatus and pressure vessels. */
  lockWhenOverdue: z.boolean().default(false),
});
export type CategoryInput = z.input<typeof CategoryInput>;
export const Category = CategoryInput.extend({ id: z.uuid(), version: z.number() });
export type Category = z.infer<typeof Category>;

export const EquipmentTypeInput = z.object({
  key,
  name: LocalizedText,
  categoryKey: key,
  manufacturer: text,
  model: text,
  inspections: z.array(InspectionType).default([]),
  /** Property names such as length or pressure; values per item. */
  properties: z.array(z.string().trim().min(1)).default([]),
});
export type EquipmentTypeInput = z.input<typeof EquipmentTypeInput>;
export const EquipmentType = EquipmentTypeInput.extend({ id: z.uuid(), version: z.number() });
export type EquipmentType = z.infer<typeof EquipmentType>;

export const ItemStatus = z.enum(['ready', 'in-inspection', 'defective', 'in-repair', 'retired']);
export type ItemStatus = z.infer<typeof ItemStatus>;

/** Inspection done before the item was recorded in f.orga (when creating the item). */
export const InitialInspection = z.object({ inspectionKey: z.string().min(1), date, nextDueOn: date.nullable().default(null) });
export type InitialInspection = z.input<typeof InitialInspection>;

export const ItemInput = z
  .object({
    /** Version the client loaded (optimistic locking). */
    version: z.number().int().optional(),
    inventoryNumber: z.string().trim().min(1),
    name: z.string().trim().min(1),
    typeKey: key.nullable().default(null),
    categoryKey: key,
    serialNumber: text,
    /** Barcode on the item (also a QR code that is not a label of f.orga). */
    barcode: ItemCode,
    rfid: RfidCode,
    manufacturer: text,
    yearBuilt: z.number().int().min(1900).max(2100).nullable().default(null),
    purchasedOn: date.nullable().default(null),
    price: z.number().min(0).nullable().default(null),
    properties: z.record(z.string(), z.string()).default({}),
    departmentId: z.uuid(),
    /** On a vehicle (with loading place) or at a station / store. */
    vehicleId: z.uuid().nullable().default(null),
    stationId: z.uuid().nullable().default(null),
    loadingPlace: text,
    /** Named place from `equipment.settings.locations` (stations and vehicles are separate fields). */
    location: text,
    /** Stock: quantity instead of a single item. */
    quantity: z.number().int().min(0).default(1),
    expiresOn: date.nullable().default(null),
    /** `null` = inspections of the type. */
    inspections: z.array(InspectionType).nullable().default(null),
    /** Own interval in months per inspection type, e.g. a vehicle below 3.5 t with a longer roadworthiness test interval. */
    intervalOverrides: z.record(z.string(), z.number().int().min(1).max(240)).default({}),
    /** Only when creating: last inspection per inspection type. */
    initialInspections: z.array(InitialInspection).default([]),
    notes: text,
  })
  .refine((i) => !(i.vehicleId && i.stationId), { message: 'Vehicle or station', path: ['stationId'] });
export type ItemInput = z.input<typeof ItemInput>;

/** Due date of one inspection type of an item. */
export const Due = z.object({
  key: z.string(),
  name: LocalizedText,
  lastDate: z.string().nullable(),
  dueOn: z.string().nullable(),
  /** Overdue or due today. */
  overdue: z.boolean(),
  /** Never inspected and no date to measure from (vehicles taken over from the master data): "not recorded yet". */
  notRecorded: z.boolean(),
});
export type Due = z.infer<typeof Due>;

export const Item = z.object({
  id: z.uuid(),
  inventoryNumber: z.string(),
  name: z.string(),
  typeKey: z.string().nullable(),
  categoryKey: z.string(),
  serialNumber: z.string(),
  barcode: z.string().nullable(),
  rfid: z.string().nullable(),
  manufacturer: z.string(),
  yearBuilt: z.number().nullable(),
  purchasedOn: z.string().nullable(),
  price: z.number().nullable(),
  properties: z.record(z.string(), z.string()),
  departmentId: z.uuid(),
  vehicleId: z.uuid().nullable(),
  stationId: z.uuid().nullable(),
  loadingPlace: z.string(),
  location: z.string(),
  quantity: z.number(),
  expiresOn: z.string().nullable(),
  /** Effective inspection types (own or of the type, with the interval overrides of the item). */
  inspections: z.array(InspectionType),
  ownInspections: z.boolean(),
  intervalOverrides: z.record(z.string(), z.number()),
  status: ItemStatus,
  /** An inspection is overdue and the category locks such items: not ready, whatever the status. */
  blocked: z.boolean(),
  /** When a label was last printed; `null` = no label yet. */
  labelPrintedAt: z.string().nullable(),
  retirement: z.object({ date: z.string(), reason: z.string(), disposition: z.string() }).nullable(),
  /** Master data vehicle this item stands for (vehicle inspections). */
  forVehicleId: z.uuid().nullable(),
  dues: z.array(Due),
  nextDue: z.string().nullable(),
  openDefects: z.number(),
  notes: z.string(),
  version: z.number(),
});
export type Item = z.infer<typeof Item>;

/** What members who may only report defects see of an item (no price, serial number or inspections). */
export const ItemSummary = z.object({
  id: z.uuid(),
  inventoryNumber: z.string(),
  name: z.string(),
  departmentId: z.uuid(),
  status: ItemStatus,
  /** An inspection is overdue and the category locks such items: not ready. */
  blocked: z.boolean(),
  reportOnly: z.literal(true),
});
export type ItemSummary = z.infer<typeof ItemSummary>;

export const InspectionResult = z.enum(['passed', 'passed-with-defects', 'failed']);
export type InspectionResult = z.infer<typeof InspectionResult>;

export const InspectionInput = z.object({
  inspectionKey: z.string().min(1),
  date,
  inspectorPersonId: z.uuid().nullable().default(null),
  inspectorCompany: text,
  result: InspectionResult,
  checklist: z.array(z.object({ point: z.string(), state: z.enum(['ok', 'not-ok', 'value']), value: text })).default([]),
  measurements: text,
  /** `null` = date + interval. */
  nextDueOn: date.nullable().default(null),
  notes: text,
});
export type InspectionInput = z.input<typeof InspectionInput>;

/** New place of the selected items. A vehicle and a station exclude each other. */
export const BulkPlaceInput = z.object({
  stationId: z.string().nullable().default(null),
  vehicleId: z.string().nullable().default(null),
  location: text,
  loadingPlace: text,
});
export type BulkPlaceInput = z.input<typeof BulkPlaceInput>;

/**
 * Bulk booking of one kind of equipment. Inspection, marking an inspection due and a new place are each optional;
 * at least one is required. An inspection and marking due exclude each other.
 */
export const BulkInspectionInput = z.object({
  itemIds: z.array(z.uuid()).min(1),
  categoryKey: z.string().min(1),
  inspection: InspectionInput.omit({ checklist: true, nextDueOn: true }).optional(),
  /** Mark this inspection due now instead of recording it (not for a periodic inspection). */
  triggerKey: z.string().min(1).optional(),
  place: BulkPlaceInput.optional(),
});
export type BulkInspectionInput = z.input<typeof BulkInspectionInput>;

/** Kinds this user booked most recently on the bulk page, newest first, at most five. */
export const RecentBulkCategories = z.object({ categoryKeys: z.array(z.string()) });
export type RecentBulkCategories = z.infer<typeof RecentBulkCategories>;

/** What a bulk booking did. `ids` are the recorded inspections, so a protocol can be attached to each. */
export const BulkInspectionResult = z.object({
  recorded: z.number().int(),
  ids: z.array(z.uuid()),
  triggered: z.number().int(),
  moved: z.number().int(),
});
export type BulkInspectionResult = z.infer<typeof BulkInspectionResult>;

export const Inspection = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  inspectionKey: z.string(),
  date: z.string(),
  inspectorPersonId: z.uuid().nullable(),
  inspectorCompany: z.string(),
  result: InspectionResult,
  checklist: z.array(z.object({ point: z.string(), state: z.string(), value: z.string() })),
  measurements: z.string(),
  nextDueOn: z.string().nullable(),
  notes: z.string(),
  recordedBy: z.string(),
  /** Inspector lacks the qualification for the inspection type. */
  qualificationWarning: z.boolean(),
  /** Cancelled inspections stay in the history but do not count. */
  cancelled: z.boolean(),
  /** Reason of the last correction or of the cancellation. */
  changeReason: z.string(),
});
export type Inspection = z.infer<typeof Inspection>;

/** Correction of a recorded inspection; the reason is kept with the inspection and in its history. */
export const InspectionCorrection = InspectionInput.omit({ inspectionKey: true }).extend({ reason: z.string().trim().min(3) });
export type InspectionCorrection = z.input<typeof InspectionCorrection>;

export const InspectionCancellation = z.object({ reason: z.string().trim().min(3) });
export type InspectionCancellation = z.input<typeof InspectionCancellation>;

/** `withdrawn`: the inspection that recorded the defect was cancelled or corrected to "passed". */
export const DefectStatus = z.enum(['reported', 'in-progress', 'fixed', 'retired', 'withdrawn']);
export type DefectStatus = z.infer<typeof DefectStatus>;

export const DefectInput = z.object({ description: z.string().trim().min(3) });
export type DefectInput = z.input<typeof DefectInput>;

export const DefectUpdate = z.object({ status: DefectStatus.exclude(['withdrawn']), resolution: text });
export type DefectUpdate = z.input<typeof DefectUpdate>;

/** Defects that still count (open). */
export const OPEN_DEFECT: readonly DefectStatus[] = ['reported', 'in-progress'];

export const Defect = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  itemName: z.string(),
  inventoryNumber: z.string(),
  categoryKey: z.string(),
  departmentId: z.uuid(),
  /** Text of the reporter; for a finding of an inspection its notes (may be empty). */
  description: z.string(),
  /** Defect recorded by an inspection (failed or with defects); shown as "<inspection type>: <notes or result>". */
  finding: z.object({ inspectionId: z.uuid(), name: LocalizedText, result: InspectionResult }).nullable(),
  status: DefectStatus,
  resolution: z.string(),
  reportedBy: z.string(),
  reportedAt: z.string(),
  resolvedAt: z.string().nullable(),
});
export type Defect = z.infer<typeof Defect>;

/** Item a member may report a defect for ("My area"), with vehicle or station and loading place. */
export const ReportableItem = z.object({ id: z.uuid(), inventoryNumber: z.string(), name: z.string(), place: z.string() });
export type ReportableItem = z.infer<typeof ReportableItem>;

/** Labels printed for these items (filter "without label"). */
export const LabelsPrintedInput = z.object({ itemIds: z.array(z.uuid()).min(1) });
export type LabelsPrintedInput = z.input<typeof LabelsPrintedInput>;

/** Options of the DGUV template: hoses as single items (own inspection record per hose) or as stock. */
export const TemplateOptions = z.object({ hoseTracking: Tracking.default('item') });
export type TemplateOptions = z.input<typeof TemplateOptions>;

/** Lead times and bookable places of the module (setting `equipment.settings`). */
export const EquipmentSettings = z.object({
  /** Days before the due date an inspection appears among the deadlines. */
  inspectionLeadDays: z.number().int().min(0).max(365).default(30),
  /** Days before the expiry date an item appears among the deadlines. */
  expiryLeadDays: z.number().int().min(0).max(365).default(60),
  /** Days within which a due date counts as "due soon" (yellow). */
  dueSoonDays: z.number().int().min(0).max(365).default(30),
  /**
   * Named places that may be booked as `Item.location` (e.g. "Gesamtlager", "Gesamtlager – verschmutzt").
   * Free text is not accepted; stations and vehicles stay separate fields.
   */
  locations: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
});
export type EquipmentSettings = z.infer<typeof EquipmentSettings>;

export const EQUIPMENT_SETTINGS = { 'equipment.settings': EquipmentSettings } as const;

export const RetireInput = z.object({ date, reason: z.string().trim().min(1), disposition: text });
export type RetireInput = z.input<typeof RetireInput>;

/** Equipment used in an incident report: items with "inspect after the incident", consumables with quantity. */
export const ReportUsageInput = z.array(z.object({ itemId: z.uuid(), quantity: z.number().int().min(1).default(1), inspectAfter: z.boolean().default(false) }));
export type ReportUsageInput = z.input<typeof ReportUsageInput>;
export const ReportUsage = z.object({ itemId: z.uuid(), name: z.string(), inventoryNumber: z.string(), quantity: z.number(), inspectAfter: z.boolean(), stock: z.boolean() });
export type ReportUsage = z.infer<typeof ReportUsage>;

/** An incident report the item was used in (equipment file, tab "Incidents"). */
export interface ItemIncident {
  reportId: string;
  reportNumber: string;
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
  location: string;
  quantity: number;
  inspectAfter: boolean;
}

export const EQUIPMENT_EVENTS = { statusChanged: 'equipment.item.status-changed', defectReported: 'equipment.defect.reported' } as const;

export interface ItemStatusChangedEvent {
  itemId: string;
  previous: ItemStatus;
  status: ItemStatus;
}

export interface DefectReportedEvent {
  defectId: string;
  itemId: string;
  departmentId: string;
  description: string;
}

/**
 * Consumables used in incident reports (e.g. for cost recovery).
 * Inject optionally: `@Optional() @Inject(EQUIPMENT_USAGE) usage?: EquipmentUsageLookup`.
 */
export const EQUIPMENT_USAGE = 'equipment.Usage';

export interface EquipmentUsageLookup {
  forReport(reportId: string): Promise<ReportUsage[]>;
}
