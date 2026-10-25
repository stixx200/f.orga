import { z } from 'zod';
import { ItemCode, LocalizedText, RfidCode } from '@forga/core-contracts';

const date = z.iso.date();
const text = z.string().trim().max(500).default('');

/**
 * `consumable`: handed out without being assigned (caps, gloves); only the issue is recorded.
 * `inventory`: single pieces with an inventory number, assigned to a person (jacket, trousers, boots).
 */
export const ArticleKind = z.enum(['consumable', 'inventory']);
export type ArticleKind = z.infer<typeof ArticleKind>;

/** An article of personal protective equipment (PSA) in the catalog of the clothing store. */
export const ArticleInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  kind: ArticleKind,
  sizes: z.array(z.string().trim().min(1)).default([]),
  /** Textile whose washing and impregnation is recorded (mainly jacket and trousers). */
  textile: z.boolean().default(false),
  /** Impregnation (always with washing) every this many months; `null` = not required. */
  impregnationMonths: z.number().int().min(1).max(120).nullable().default(null),
  /** Inspection every this many months; `null` = none. */
  inspectionMonths: z.number().int().min(1).max(120).nullable().default(null),
  /** Inactive articles are no longer issued. */
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  /** Minimum stock per size (`''` for articles without sizes); below it the stock list shows a reorder hint. */
  minimumStock: z.record(z.string(), z.number().int().min(0).max(10_000)).default({}),
});
export type ArticleInput = z.input<typeof ArticleInput>;

export const Article = ArticleInput.extend({
  id: z.uuid(),
  sizes: z.array(z.string()),
  textile: z.boolean(),
  impregnationMonths: z.number().nullable(),
  inspectionMonths: z.number().nullable(),
  active: z.boolean(),
  sortOrder: z.number(),
  minimumStock: z.record(z.string(), z.number()),
  version: z.number(),
});
export type Article = z.infer<typeof Article>;

export const ItemStatus = z.enum(['stock', 'issued', 'retired']);
export type ItemStatus = z.infer<typeof ItemStatus>;

/**
 * Why a piece may not be issued: `inspection` = the last inspection failed (to repair, until an inspection is passed),
 * `laundry` = taken back for washing (e.g. contaminated after a fire), until a washing is recorded.
 */
export const ItemBlock = z.enum(['inspection', 'laundry']);
export type ItemBlock = z.infer<typeof ItemBlock>;

/** A piece of an inventory article. */
export const ItemInput = z.object({
  articleKey: z.string().min(1),
  inventoryNumber: z.string().trim().min(1).max(50),
  size: text,
  serialNumber: text,
  /** Barcode sewn in or on the label. */
  barcode: ItemCode,
  /** RFID chip (e.g. washable textile tag). */
  rfid: RfidCode,
  manufacturer: text,
  purchasedOn: date.nullable().default(null),
  /** Department whose clothing store keeps the piece. */
  departmentId: z.uuid(),
  notes: text,
  version: z.number().int().optional(),
});
export type ItemInput = z.input<typeof ItemInput>;

export const Item = z.object({
  id: z.uuid(),
  articleKey: z.string(),
  inventoryNumber: z.string(),
  size: z.string(),
  serialNumber: z.string(),
  barcode: z.string().nullable(),
  rfid: z.string().nullable(),
  manufacturer: z.string(),
  purchasedOn: z.string().nullable(),
  departmentId: z.uuid(),
  notes: z.string(),
  status: ItemStatus,
  /** Person holding the piece while `issued`. */
  holderId: z.uuid().nullable(),
  issuedOn: z.string().nullable(),
  lastWashedOn: z.string().nullable(),
  lastImpregnatedOn: z.string().nullable(),
  /** Next impregnation per article interval; `null` = not required. */
  impregnationDueOn: z.string().nullable(),
  lastInspectedOn: z.string().nullable(),
  /** Result of the last inspection; `null` = none yet. */
  lastInspectionPassed: z.boolean().nullable(),
  /** Counts from the last passed inspection: a failed one does not restart the interval. */
  inspectionDueOn: z.string().nullable(),
  /** Empty = may be issued (when in stock). */
  blockedBy: z.array(ItemBlock),
  version: z.number(),
});
export type Item = z.infer<typeof Item>;

/** Wrong entries are cancelled with a reason instead of deleted; they stay visible, crossed out. */
export const CancelInput = z.object({ reason: z.string().trim().min(3).max(500) });
export type CancelInput = z.input<typeof CancelInput>;

const recorded = {
  recordedBy: z.string(),
  /** User who recorded the entry; they (or someone with `clothing.manage`) may cancel it. */
  recordedById: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string(),
};

/** Impregnating always includes washing. */
export const CareKind = z.enum(['wash', 'impregnation']);
export type CareKind = z.infer<typeof CareKind>;

/** Washing or impregnation of one or several textile pieces, with the date and the place (e.g. the laundry). */
export const CareInput = z.object({
  itemIds: z.array(z.uuid()).min(1),
  kind: CareKind,
  date,
  place: text,
  notes: text,
});
export type CareInput = z.input<typeof CareInput>;

export const Care = z.object({ id: z.uuid(), itemId: z.uuid(), kind: CareKind, date: z.string(), place: z.string(), notes: z.string(), ...recorded });
export type Care = z.infer<typeof Care>;

export const InspectionInput = z.object({ date, passed: z.boolean(), inspector: text, notes: text });
export type InspectionInput = z.input<typeof InspectionInput>;

/** Inspections of several pieces on one day, one result per piece (e.g. the yearly inspection of all jackets). */
export const InspectionsInput = z.object({
  date,
  inspector: text,
  results: z.array(z.object({ itemId: z.uuid(), passed: z.boolean(), notes: text })).min(1).max(1000),
});
export type InspectionsInput = z.input<typeof InspectionsInput>;

export const Inspection = z.object({ id: z.uuid(), itemId: z.uuid(), date: z.string(), passed: z.boolean(), inspector: z.string(), notes: z.string(), ...recorded });
export type Inspection = z.infer<typeof Inspection>;

/** Handing out consumables (not assigned; only recorded in the person's history). */
export const ConsumableIssueInput = z.object({
  personId: z.uuid(),
  articleKey: z.string().min(1),
  size: text,
  quantity: z.number().int().min(1).max(100).default(1),
  date,
  notes: text,
});
export type ConsumableIssueInput = z.input<typeof ConsumableIssueInput>;

/**
 * Assigning an inventory piece to a person. A piece whose inspection is overdue is only issued with
 * `acceptOverdueInspection`.
 */
export const ItemIssueInput = z.object({ personId: z.uuid(), date, notes: text, acceptOverdueInspection: z.boolean().default(false) });
export type ItemIssueInput = z.input<typeof ItemIssueInput>;

/** Several pieces to one person in one step (complete outfitting); all or none are issued. */
export const IssueManyInput = ItemIssueInput.extend({ itemIds: z.array(z.uuid()).min(1).max(100) });
export type IssueManyInput = z.input<typeof IssueManyInput>;

/**
 * Taking a piece back; `retire` takes it out of use (worn out, damaged), `laundry` keeps it from being issued until a
 * washing is recorded (e.g. contaminated after a fire).
 */
export const ItemReturnInput = z.object({ date, notes: text, retire: z.boolean().default(false), laundry: z.boolean().default(false) });
export type ItemReturnInput = z.input<typeof ItemReturnInput>;

/** Several pieces back in one step (e.g. everything a person holds), each into stock, to the laundry or retired. */
export const ReturnManyInput = z.object({
  date,
  notes: text,
  items: z.array(z.object({ itemId: z.uuid(), retire: z.boolean().default(false), laundry: z.boolean().default(false) })).min(1).max(100),
});
export type ReturnManyInput = z.input<typeof ReturnManyInput>;

export const IssueKind = z.enum(['issue', 'return']);
export type IssueKind = z.infer<typeof IssueKind>;

/** An entry of a person's clothing history. */
export const IssueRecord = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  kind: IssueKind,
  articleKey: z.string(),
  itemId: z.uuid().nullable(),
  inventoryNumber: z.string().nullable(),
  size: z.string(),
  quantity: z.number(),
  date: z.string(),
  notes: z.string(),
  /** Return: taken out of use, or to the laundry. */
  retire: z.boolean(),
  laundry: z.boolean(),
  ...recorded,
});
export type IssueRecord = z.infer<typeof IssueRecord>;

/** Clothing sizes of a person by article key (e.g. `jacket: '52'`); preselects the stock when issuing. */
export const SizeProfile = z.record(z.string(), z.string().trim().max(20));
export type SizeProfile = z.infer<typeof SizeProfile>;

export const SizeProfileInput = z.object({ sizes: SizeProfile });
export type SizeProfileInput = z.input<typeof SizeProfileInput>;

/** Person file tab: pieces held now, the history of issues and returns, and the sizes. */
export const PersonClothing = z.object({ items: z.array(Item), history: z.array(IssueRecord), sizes: SizeProfile });
export type PersonClothing = z.infer<typeof PersonClothing>;

/** Consumables received into the store (or a correction after counting, with a negative quantity). */
export const ConsumableReceiptInput = z.object({
  articleKey: z.string().min(1),
  size: text,
  quantity: z.number().int().min(-10_000).max(10_000).refine((q) => q !== 0),
  date,
  notes: text,
});
export type ConsumableReceiptInput = z.input<typeof ConsumableReceiptInput>;

/**
 * Stock of one article in one size. Inventory articles: pieces of the visible departments in stock (`available` may
 * be issued, `blocked` are to repair or to wash) and issued. Consumables: received minus handed out (`available`).
 */
export const StockRow = z.object({
  articleKey: z.string(),
  kind: ArticleKind,
  size: z.string(),
  available: z.number(),
  blocked: z.number(),
  issued: z.number(),
  minimum: z.number().nullable(),
  /** Below the minimum stock. */
  reorder: z.boolean(),
});
export type StockRow = z.infer<typeof StockRow>;

export const ItemDetail = Item.extend({ care: z.array(Care), inspections: z.array(Inspection), history: z.array(IssueRecord) });
export type ItemDetail = z.infer<typeof ItemDetail>;

/** Adds months to a `YYYY-MM-DD` date, clamped to the end of the month. */
export function addMonths(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const addDays = (value: string, count: number) => new Date(Date.parse(value) + count * DAY).toISOString().slice(0, 10);

/** Time a piece was issued: from the issue to the return, `to: null` while it is still issued. */
export interface UsagePeriod {
  from: string;
  to: string | null;
}

/**
 * Next impregnation and inspection of a piece. Washing and impregnation are only needed for pieces in use: the
 * interval counts the time issued since the last impregnation (else since the first issue); time in stock does not
 * count, and a piece in stock has no due date. Inspections count from the last passed one (passed as
 * `lastInspectedOn`), else from the purchase or the day the piece was recorded.
 */
export function dueDates(
  article: Pick<Article, 'impregnationMonths' | 'inspectionMonths'>,
  item: { purchasedOn: string | null; createdOn: string; lastImpregnatedOn: string | null; lastInspectedOn: string | null; usage: UsagePeriod[] },
): { impregnationDueOn: string | null; inspectionDueOn: string | null } {
  const start = item.purchasedOn ?? item.createdOn;
  const current = item.usage.find((p) => p.to === null);
  let impregnationDueOn: string | null = null;
  if (article.impregnationMonths && current) {
    const since = item.lastImpregnatedOn;
    const after = (day: string) => (since && day < since ? since : day);
    // Days already in use since the last impregnation, in earlier periods.
    const used = item.usage
      .filter((p) => p.to !== null && (!since || p.to > since))
      .reduce((sum, p) => sum + Math.max(0, days(after(p.from), p.to!)), 0);
    impregnationDueOn = addDays(addMonths(after(current.from), article.impregnationMonths), -used);
  }
  return {
    impregnationDueOn,
    inspectionDueOn: article.inspectionMonths ? addMonths(item.lastInspectedOn ?? start, article.inspectionMonths) : null,
  };
}

/**
 * Periods in use from the issue and return records of a piece (in any order). `issuedOn` is the current issue of a
 * piece that is issued now: the last period stays open from there even if the records are inconsistent (e.g. an issue
 * dated before the last return), so an issued piece always has a due date.
 */
export function usagePeriods(records: { kind: IssueKind; date: string }[], issuedOn: string | null = null): UsagePeriod[] {
  const periods: UsagePeriod[] = [];
  for (const record of records.toSorted((a, b) => a.date.localeCompare(b.date) || (a.kind === 'return' ? -1 : 1))) {
    const open = periods.at(-1);
    if (record.kind === 'issue' && (!open || open.to !== null)) periods.push({ from: record.date, to: null });
    else if (record.kind === 'return' && open && open.to === null) open.to = record.date;
  }
  const last = periods.at(-1);
  if (issuedOn && (!last || last.to !== null)) periods.push({ from: last?.to && last.to > issuedOn ? last.to : issuedOn, to: null });
  return periods;
}

/** Common articles of a fire brigade's clothing store; added on request, keys stay stable. */
export const ARTICLE_TEMPLATE: ArticleInput[] = [
  { key: 'jacket', name: { de: 'Einsatzjacke', en: 'Turnout jacket' }, kind: 'inventory', textile: true, impregnationMonths: 12, inspectionMonths: 12, sortOrder: 10 },
  { key: 'trousers', name: { de: 'Einsatzhose', en: 'Turnout trousers' }, kind: 'inventory', textile: true, impregnationMonths: 12, inspectionMonths: 12, sortOrder: 20 },
  { key: 'breathing-apparatus-trousers', name: { de: 'Atemschutz-Überhose', en: 'Breathing apparatus overtrousers' }, kind: 'inventory', textile: true, impregnationMonths: 12, inspectionMonths: 12, sortOrder: 30 },
  { key: 'boots', name: { de: 'Feuerwehrstiefel', en: 'Fire boots' }, kind: 'inventory', inspectionMonths: 12, sortOrder: 40 },
  { key: 'helmet', name: { de: 'Feuerwehrhelm', en: 'Fire helmet' }, kind: 'inventory', inspectionMonths: 12, sortOrder: 50 },
  { key: 'hood', name: { de: 'Feuerschutzhaube', en: 'Flash hood' }, kind: 'consumable', sortOrder: 60 },
  { key: 'gloves', name: { de: 'Feuerwehrschutzhandschuhe', en: 'Firefighting gloves' }, kind: 'consumable', sortOrder: 70 },
  { key: 'cap', name: { de: 'Mütze', en: 'Cap' }, kind: 'consumable', sortOrder: 80 },
  { key: 't-shirt', name: { de: 'T-Shirt', en: 'T-shirt' }, kind: 'consumable', sortOrder: 90 },
];
