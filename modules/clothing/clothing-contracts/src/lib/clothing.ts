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
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type ArticleInput = z.input<typeof ArticleInput>;

export const Article = ArticleInput.extend({ id: z.uuid(), sizes: z.array(z.string()), textile: z.boolean(), impregnationMonths: z.number().nullable(), inspectionMonths: z.number().nullable(), active: z.boolean(), sortOrder: z.number(), version: z.number() });
export type Article = z.infer<typeof Article>;

export const ItemStatus = z.enum(['stock', 'issued', 'retired']);
export type ItemStatus = z.infer<typeof ItemStatus>;

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
  inspectionDueOn: z.string().nullable(),
  version: z.number(),
});
export type Item = z.infer<typeof Item>;

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

export const Care = z.object({ id: z.uuid(), itemId: z.uuid(), kind: CareKind, date: z.string(), place: z.string(), notes: z.string(), recordedBy: z.string() });
export type Care = z.infer<typeof Care>;

export const InspectionInput = z.object({ date, passed: z.boolean(), inspector: text, notes: text });
export type InspectionInput = z.input<typeof InspectionInput>;

export const Inspection = z.object({ id: z.uuid(), itemId: z.uuid(), date: z.string(), passed: z.boolean(), inspector: z.string(), notes: z.string(), recordedBy: z.string() });
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

/** Assigning an inventory piece to a person. */
export const ItemIssueInput = z.object({ personId: z.uuid(), date, notes: text });
export type ItemIssueInput = z.input<typeof ItemIssueInput>;

/** Taking a piece back; `retire` takes it out of use (worn out, damaged). */
export const ItemReturnInput = z.object({ date, notes: text, retire: z.boolean().default(false) });
export type ItemReturnInput = z.input<typeof ItemReturnInput>;

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
  recordedBy: z.string(),
});
export type IssueRecord = z.infer<typeof IssueRecord>;

/** Person file tab: pieces held now and the history of issues and returns. */
export const PersonClothing = z.object({ items: z.array(Item), history: z.array(IssueRecord) });
export type PersonClothing = z.infer<typeof PersonClothing>;

export const ItemDetail = Item.extend({ care: z.array(Care), inspections: z.array(Inspection), history: z.array(IssueRecord) });
export type ItemDetail = z.infer<typeof ItemDetail>;

/** Adds months to a `YYYY-MM-DD` date, clamped to the end of the month. */
export function addMonths(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/**
 * Next impregnation and inspection of a piece. Without an earlier one the interval counts from the purchase,
 * else from the day the piece was recorded; impregnating also counts as washing.
 */
export function dueDates(
  article: Pick<Article, 'impregnationMonths' | 'inspectionMonths'>,
  item: { purchasedOn: string | null; createdOn: string; lastImpregnatedOn: string | null; lastInspectedOn: string | null },
): { impregnationDueOn: string | null; inspectionDueOn: string | null } {
  const start = item.purchasedOn ?? item.createdOn;
  return {
    impregnationDueOn: article.impregnationMonths ? addMonths(item.lastImpregnatedOn ?? start, article.impregnationMonths) : null,
    inspectionDueOn: article.inspectionMonths ? addMonths(item.lastInspectedOn ?? start, article.inspectionMonths) : null,
  };
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
