import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';

const date = z.iso.date();
const text = z.string().trim().default('');
const money = z.number().multipleOf(0.01);

/** Legal ground of the charge (§ 34 FwG BW); a catalog, so new grounds need no code change. */
export const Offense = z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), name: LocalizedText, legalBasis: z.string() });
export type Offense = z.infer<typeof Offense>;

const o = (key: string, de: string, en: string, legalBasis: string): Offense => ({ key, name: { de, en }, legalBasis });

export const BW_OFFENSES: Offense[] = [
  o('intent', 'Vorsätzliche oder grob fahrlässige Verursachung', 'Caused intentionally or by gross negligence', '§ 34 Abs. 1 Satz 2 Nr. 1 FwG'),
  o('vehicle', 'Betrieb eines Fahrzeugs (Halter)', 'Operation of a vehicle (keeper)', '§ 34 Abs. 1 Satz 2 Nr. 2 FwG'),
  o('special-agents', 'Sonderlösch- und Sondereinsatzmittel bei Gewerbebrand', 'Special extinguishing agents at an industrial fire', '§ 34 Abs. 1 Satz 2 Nr. 3 FwG'),
  o('hazardous', 'Gefahrstoffe zu gewerblichen oder militärischen Zwecken', 'Hazardous substances for commercial or military purposes', '§ 34 Abs. 1 Satz 2 Nr. 4 FwG'),
  o('false-alarm', 'Vorsätzlicher oder grob fahrlässiger Falschalarm', 'Intentional or grossly negligent false alarm', '§ 34 Abs. 1 Satz 2 Nr. 5 FwG'),
  o('fire-alarm-system', 'Fehlalarm einer Brandmeldeanlage', 'False alarm of a fire alarm system', '§ 34 Abs. 1 Satz 2 Nr. 6 FwG'),
  o('ecall', 'eCall-Fehlalarm', 'eCall false alarm', '§ 34 Abs. 1 Satz 2 Nr. 7 FwG'),
  o('voluntary', 'Brandsicherheitswache oder sonstige Hilfeleistung', 'Fire watch or other assistance', '§ 34 Abs. 2 i. V. m. § 2 Abs. 2 FwG'),
];

/** Hourly rate of a vehicle cost category (key of the vehicle type catalog, e.g. `lf-20`) valid from a date. */
export const VehicleRate = z.object({ category: z.string().min(1), validFrom: date, amount: money.min(0) });
export type VehicleRate = z.infer<typeof VehicleRate>;

/** `career`: career staff in general; the groups apply when set, else the general rate. */
export const PersonnelKind = z.enum(['volunteer', 'fire-watch', 'career', 'career-intermediate', 'career-elevated', 'career-higher']);
export type PersonnelKind = z.infer<typeof PersonnelKind>;
export const PersonnelRate = z.object({ kind: PersonnelKind, validFrom: date, amount: money.min(0) });
export type PersonnelRate = z.infer<typeof PersonnelRate>;

export const Material = z.object({ key: z.string().min(1), name: z.string().min(1), unit: z.string().default('Stück'), price: money.min(0) });
export type Material = z.infer<typeof Material>;

/** Flat fee of the statute (e.g. per false alarm), with the paragraph it is based on. */
export const FlatRate = z.object({ key: z.string().min(1), name: z.string().min(1), amount: money.min(0), basis: z.string().default('') });
export type FlatRate = z.infer<typeof FlatRate>;

/** Rounding of the time: started half hour; Musterstadt: up to 30 min half an hour, beyond started hours; started hour. */
export const CostRounding = z.enum(['started-half-hour', 'half-then-hour', 'started-hour']);
export type CostRounding = z.infer<typeof CostRounding>;

const v = (category: string, amount: number): VehicleRate => ({ category, validFrom: '2024-03-19', amount });
const v16 = (category: string, amount: number): VehicleRate => ({ category, validFrom: '2016-04-26', amount });

/** VOKeFw of 18.03.2016 (GBl. S. 253, valid from 26.04.2016), for incidents before 19.03.2024. */
export const VOKEFW_2016_VEHICLE_RATES: VehicleRate[] = [
  v16('elw-1', 34), v16('mtw', 20), v16('kdow', 16), v16('tsf', 43), v16('tsf-w', 63), v16('mlf', 83), v16('lf-10', 120), v16('lf-20', 170), v16('lf-20-16', 184),
  v16('lf-kats', 133), v16('tlf-3000', 120), v16('rw', 187), v16('dlak-23-12', 264), v16('gw-l1', 25), v16('gw-l2', 54), v16('wlf', 70),
];

/** VOKeFw of 11.03.2024 (valid from 19.03.2024) and the 2016 rates before; local rates (e.g. for an LF 8/6) are added in the settings. */
export const VOKEFW_VEHICLE_RATES: VehicleRate[] = [
  ...VOKEFW_2016_VEHICLE_RATES,
  v('elw-1', 98), v('mtw', 34), v('kdow', 39), v('tsf', 57), v('tsf-w', 99), v('mlf', 128), v('lf-10', 172), v('lf-20', 205), v('lf-20-16', 236),
  v('lf-kats', 192), v('tlf-3000', 172), v('rw', 239), v('dlak-23-12', 290), v('gw-l1', 81), v('gw-l2', 172), v('wlf', 128),
];

/** Columns of the handover to the treasury (Sollstellung), in the order chosen. */
export const HandoverColumn = z.enum(['number', 'cashReference', 'debtors', 'address', 'amount', 'dueOn', 'issuedOn', 'budgetAccount', 'incident']);
export type HandoverColumn = z.infer<typeof HandoverColumn>;
export const HandoverFormat = z.object({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
  columns: z.array(HandoverColumn).min(1).default(['number', 'cashReference', 'debtors', 'address', 'amount', 'dueOn', 'budgetAccount', 'incident']),
});
export type HandoverFormat = z.infer<typeof HandoverFormat>;

export const CostRecoverySettings = z.object({
  offenses: z.array(Offense).default(BW_OFFENSES),
  vehicleRates: z.array(VehicleRate).default(VOKEFW_VEHICLE_RATES),
  /** Hourly rates per person from the local statute; empty until entered. */
  personnelRates: z.array(PersonnelRate).default([]),
  materials: z.array(Material).default([]),
  /** Flat fees of the statute; empty until entered from the statute. */
  flatRates: z.array(FlatRate).default([]),
  rounding: CostRounding.default('half-then-hour'),
  /** Rounding of vehicle times; `null` = like personnel. */
  vehicleRounding: CostRounding.nullable().default(null),
  /** Standby at the station is charged like personnel on the scene. */
  chargeStandby: z.boolean().default(false),
  /** Authority issuing the notice, e.g. "Stadt Musterstadt – Bürgermeisteramt". */
  authority: text,
  authorityAddress: text,
  /** Local statute cited in the notice, e.g. "Feuerwehr-Kostenersatzsatzung vom …". */
  statute: text,
  /** Legal basis when the offense names none. */
  defaultLegalBasis: z.string().default('§ 34 FwG'),
  /** State regulation on the rates, cited after the legal basis; empty = not cited. */
  regulation: z.string().default('Verordnung des Innenministeriums über den Kostenersatz für Einsätze der Feuerwehr (VOKeFw)'),
  /** Note for several debtors; empty = none. */
  jointLiability: z.string().default('Die Kostenschuldner haften als Gesamtschuldner (§ 34 Abs. 3 FwG).'),
  bankAccount: text,
  budgetAccount: text,
  dueDays: z.number().int().min(1).max(180).default(30),
  /** Format of the handover to the treasury. */
  handover: HandoverFormat.default({ format: 'xlsx', columns: ['number', 'cashReference', 'debtors', 'address', 'amount', 'dueOn', 'budgetAccount', 'incident'] }),
  signer: text,
  reasoning: z.string().default('Die Feuerwehr wurde am {date} zu einem Einsatz in {location} gerufen. Der Einsatz ist nach {basis} kostenersatzpflichtig. Gründe, auf den Kostenersatz ganz oder teilweise zu verzichten (unbillige Härte, öffentliches Interesse), sind nicht ersichtlich.'),
  remedy: z.string().default('Gegen diesen Bescheid kann innerhalb eines Monats nach Bekanntgabe Widerspruch erhoben werden. Der Widerspruch ist schriftlich oder zur Niederschrift bei der oben genannten Behörde einzulegen.'),
});
export type CostRecoverySettings = z.infer<typeof CostRecoverySettings>;

export const COST_RECOVERY_SETTINGS = { 'cost-recovery.general': CostRecoverySettings } as const;

export const Debtor = z.object({ name: z.string().trim().min(1), street: text, postalCode: text, city: text, role: text });
export type Debtor = z.infer<typeof Debtor>;

export const PositionKind = z.enum(['personnel', 'vehicle', 'material', 'third-party', 'other-brigade', 'flat-rate', 'other']);
export type PositionKind = z.infer<typeof PositionKind>;

export const Position = z.object({
  kind: PositionKind,
  label: z.string().trim().min(1),
  /** Hours (personnel, vehicles) or units. */
  quantity: z.number().min(0),
  unit: z.string().default('h'),
  rate: money.min(0),
  amount: money,
  /** As calculated; `null` for positions added by hand. */
  computedAmount: money.nullable().default(null),
  /** Needed when `amount` differs from `computedAmount`. */
  reason: text,
  /** Vehicle cost category used (can be switched, e.g. to MTW). */
  category: z.string().nullable().default(null),
  vehicleId: z.string().nullable().default(null),
});
export type Position = z.infer<typeof Position>;

/** `amended`: replaced by an issued amendment notice (Änderungsbescheid). */
export const NoticeStatus = z.enum(['draft', 'review', 'issued', 'handed-over', 'paid', 'objection', 'cancelled', 'amended']);
export type NoticeStatus = z.infer<typeof NoticeStatus>;

export const NoticeInput = z.object({
  version: z.number().int().optional(),
  offenseKey: z.string().min(1),
  debtors: z.array(Debtor).min(1),
  positions: z.array(Position),
  reasoning: z.string(),
  remedy: z.string(),
  cashReference: text,
});
export type NoticeInput = z.input<typeof NoticeInput>;

export const Notice = z.object({
  id: z.uuid(),
  number: z.string(),
  incidentId: z.uuid(),
  dispatchNumber: z.string(),
  alarmKeyword: z.string(),
  alarmedAt: z.string(),
  location: z.string(),
  offenseKey: z.string(),
  debtors: z.array(Debtor),
  positions: z.array(Position),
  total: z.number(),
  reasoning: z.string(),
  remedy: z.string(),
  cashReference: z.string(),
  status: NoticeStatus,
  issuedAt: z.string().nullable(),
  issuedBy: z.string().nullable(),
  dueOn: z.string().nullable(),
  hasPdf: z.boolean(),
  objection: z.object({ date: z.string(), result: z.enum(['pending', 'upheld', 'rejected']), note: z.string() }).nullable(),
  cancellation: z.object({ date: z.string(), reason: z.string() }).nullable(),
  paidOn: z.string().nullable(),
  /** The notice this amendment changes, and the amendment that replaced this notice. */
  amends: z.object({ id: z.uuid(), number: z.string() }).nullable(),
  amendedBy: z.object({ id: z.uuid(), number: z.string() }).nullable(),
  version: z.number(),
});
export type Notice = z.infer<typeof Notice>;

export const ObjectionInput = z.object({ date, result: z.enum(['pending', 'upheld', 'rejected']), note: text });
export type ObjectionInput = z.input<typeof ObjectionInput>;
export const CancellationInput = z.object({ reason: z.string().trim().min(3) });
export type CancellationInput = z.input<typeof CancellationInput>;
export const PaymentInput = z.object({ paidOn: date });
export type PaymentInput = z.input<typeof PaymentInput>;

export const AddressBookInput = Debtor.extend({ notes: text });
export type AddressBookInput = z.input<typeof AddressBookInput>;
export const AddressBookEntry = AddressBookInput.extend({ id: z.uuid(), version: z.number() });
export type AddressBookEntry = z.infer<typeof AddressBookEntry>;

/** A chargeable incident with its notice, if any. */
export const Candidate = z.object({
  incidentId: z.uuid(),
  dispatchNumber: z.string(),
  alarmKeyword: z.string(),
  alarmedAt: z.string(),
  location: z.string(),
  object: z.string(),
  /** Reason from the costs of the incident. */
  chargeableReason: z.string(),
  released: z.boolean(),
  suggestedOffense: z.string().nullable(),
  noticeId: z.uuid().nullable(),
  noticeStatus: NoticeStatus.nullable(),
});
export type Candidate = z.infer<typeof Candidate>;

export const COST_RECOVERY_EVENTS = { noticeIssued: 'cost-recovery.notice.issued' } as const;
export interface NoticeIssuedEvent {
  noticeId: string;
  incidentId: string;
  total: number;
}
