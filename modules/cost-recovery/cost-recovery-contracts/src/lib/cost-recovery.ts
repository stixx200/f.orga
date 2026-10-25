import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';

const date = z.iso.date();
const text = z.string().trim().default('');
const money = z.number().multipleOf(0.01);

/** Legal ground of the charge from the state's fire brigade law; a catalog, so new grounds need no code change. */
export const Offense = z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), name: LocalizedText, legalBasis: z.string() });
export type Offense = z.infer<typeof Offense>;

const o = (key: string, de: string, en: string, legalBasis: string): Offense => ({ key, name: { de, en }, legalBasis });

/** Legal grounds of § 34 FwG Baden-Württemberg; part of the Baden-Württemberg template, never applied on its own. */
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

const REMINDER_TEXT =
  'Mit dem Kostenbescheid {number} vom {issuedOn} wurden Kosten von {total} festgesetzt, fällig am {dueOn}. Bis heute ist ein Betrag von {open} offen. Bitte überweisen Sie den offenen Betrag bis zum {newDueOn}. Sollten Sie inzwischen gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.';

/** Payment reminder letter; placeholders `{number}`, `{issuedOn}`, `{total}`, `{open}`, `{dueOn}`, `{newDueOn}`. */
export const ReminderSettings = z.object({
  title: z.string().trim().min(1).default('Zahlungserinnerung'),
  text: z.string().default(REMINDER_TEXT),
  /** Payment term set by the reminder. */
  days: z.number().int().min(1).max(90).default(14),
});
export type ReminderSettings = z.infer<typeof ReminderSettings>;

/**
 * Settings section `cost-recovery.general`. Everything state-specific (legal grounds, vehicle rates, legal basis,
 * regulation, legal remedy) starts empty and is taken over explicitly, e.g. from the Baden-Württemberg template.
 */
export const CostRecoverySettings = z.object({
  offenses: z.array(Offense).default([]),
  vehicleRates: z.array(VehicleRate).default([]),
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
  /** Guests (personnel without person file): `none` = not charged, noted on the notice; `volunteer` = at the volunteer rate. */
  guests: z.enum(['none', 'volunteer']).default('none'),
  /** Authority issuing the notice, e.g. "Stadt Musterstadt – Bürgermeisteramt". */
  authority: text,
  authorityAddress: text,
  /** Local statute cited in the notice, e.g. "Feuerwehr-Kostenersatzsatzung vom …". */
  statute: text,
  /** Legal basis when the offense names none; needed before notices can be created. */
  defaultLegalBasis: text,
  /** State regulation or statute on the rates, cited after the legal basis; needed before notices can be created. */
  regulation: text,
  /** Note for several debtors; empty = none. */
  jointLiability: text,
  bankAccount: text,
  budgetAccount: text,
  dueDays: z.number().int().min(1).max(180).default(30),
  /** Notices are only issued with the cash reference of the treasury. */
  cashReferenceRequired: z.boolean().default(false),
  /** Four-eyes principle: whoever submitted a notice for review cannot issue it. */
  fourEyes: z.boolean().default(false),
  /** Format of the handover to the treasury. */
  handover: HandoverFormat.default({ format: 'xlsx', columns: ['number', 'cashReference', 'debtors', 'address', 'amount', 'dueOn', 'budgetAccount', 'incident'] }),
  /** Function below the name of the issuing person, e.g. "Im Auftrag – Ordnungsamt". */
  signer: text,
  reasoning: z.string().default('Die Feuerwehr wurde am {date} zu einem Einsatz in {location} gerufen. Der Einsatz ist nach {basis} kostenersatzpflichtig.'),
  /** Information on legal remedies; needed before notices can be created. */
  remedy: text,
  reminder: ReminderSettings.default({ title: 'Zahlungserinnerung', text: REMINDER_TEXT, days: 14 }),
});
export type CostRecoverySettings = z.infer<typeof CostRecoverySettings>;

export const COST_RECOVERY_SETTINGS = { 'cost-recovery.general': CostRecoverySettings } as const;

/**
 * Template Baden-Württemberg (§ 34 FwG, VOKeFw 2016 and 2024, objection as legal remedy). Only applied when the
 * administration takes it over in the settings; the values have to be checked against the local statute.
 */
export const BW_TEMPLATE = {
  offenses: BW_OFFENSES,
  vehicleRates: VOKEFW_VEHICLE_RATES,
  defaultLegalBasis: '§ 34 FwG',
  regulation: 'Verordnung des Innenministeriums über den Kostenersatz für Einsätze der Feuerwehr (VOKeFw)',
  jointLiability: 'Die Kostenschuldner haften als Gesamtschuldner (§ 34 Abs. 3 FwG).',
  reasoning:
    'Die Feuerwehr wurde am {date} zu einem Einsatz in {location} gerufen. Der Einsatz ist nach {basis} kostenersatzpflichtig. Gründe, auf den Kostenersatz ganz oder teilweise zu verzichten (unbillige Härte, öffentliches Interesse), sind nicht ersichtlich.',
  remedy:
    'Gegen diesen Bescheid kann innerhalb eines Monats nach Bekanntgabe Widerspruch erhoben werden. Der Widerspruch ist schriftlich oder zur Niederschrift bei der oben genannten Behörde einzulegen.',
} satisfies Partial<CostRecoverySettings>;

/** Parts of the settings needed before notices can be created: legal grounds, legal basis, regulation, legal remedy. */
export const CONFIGURATION_PARTS = ['offenses', 'defaultLegalBasis', 'regulation', 'remedy'] as const;
export type ConfigurationPart = (typeof CONFIGURATION_PARTS)[number];
export function missingConfiguration(config: Pick<CostRecoverySettings, ConfigurationPart>): ConfigurationPart[] {
  return CONFIGURATION_PARTS.filter((part) => (part === 'offenses' ? !config.offenses.length : !config[part].trim()));
}

export const Debtor = z.object({ name: z.string().trim().min(1), street: text, postalCode: text, city: text, role: text });
export type Debtor = z.infer<typeof Debtor>;
/** A debtor while the notice is a draft: the name may still be missing; submitting checks it. */
export const DraftDebtor = Debtor.extend({ name: text });

export const PositionKind = z.enum(['personnel', 'vehicle', 'material', 'third-party', 'other-brigade', 'flat-rate', 'other']);
export type PositionKind = z.infer<typeof PositionKind>;

export const Position = z.object({
  kind: PositionKind,
  label: z.string().trim().min(1),
  /** Hours (personnel, vehicles) or units. */
  quantity: z.number().min(0),
  unit: z.string().default('h'),
  rate: money.min(0),
  /** Never negative; a reduction is a lower amount with a reason. */
  amount: money.min(0),
  /** As calculated; `null` for positions added by hand. */
  computedAmount: money.nullable().default(null),
  /** Needed when `amount` differs from `computedAmount` (positions added by hand: from quantity × rate). */
  reason: text,
  /** Vehicle cost category used (can be switched, e.g. to MTW). */
  category: z.string().nullable().default(null),
  vehicleId: z.string().nullable().default(null),
  /** Personnel: number of persons, and their hours each when all have the same (else `null`), for "2 × 1,5 h". */
  persons: z.number().int().min(0).nullable().default(null),
  hoursEach: z.number().min(0).nullable().default(null),
});
export type Position = z.infer<typeof Position>;

/**
 * `amended`: replaced by an issued amendment notice (Änderungsbescheid); `cancelled`: an issued notice lifted
 * (Aufhebung); `discarded`: a draft or a notice in review that was never issued (verworfen).
 */
export const NoticeStatus = z.enum(['draft', 'review', 'issued', 'handed-over', 'paid', 'objection', 'cancelled', 'amended', 'discarded']);
export type NoticeStatus = z.infer<typeof NoticeStatus>;

/** Issued and not settled: payments, reminders, objection and amendment apply. */
export const OPEN_STATUSES: NoticeStatus[] = ['issued', 'handed-over', 'objection'];
/** No longer in effect; a new notice for the incident is possible. */
export const ENDED_STATUSES: NoticeStatus[] = ['cancelled', 'amended', 'discarded'];

/** Drafts can be saved without debtor; submitting for review checks the debtors. */
export const NoticeInput = z.object({
  version: z.number().int().optional(),
  offenseKey: z.string().min(1),
  debtors: z.array(DraftDebtor),
  positions: z.array(Position),
  reasoning: z.string(),
  remedy: z.string(),
  cashReference: text,
});
export type NoticeInput = z.input<typeof NoticeInput>;

/** A payment received (also partial); a reversal keeps it, with reason. */
export const Payment = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number(),
  note: z.string(),
  recordedBy: z.string(),
  reversal: z.object({ date: z.string(), reason: z.string(), by: z.string() }).nullable(),
});
export type Payment = z.infer<typeof Payment>;

/** A payment reminder sent (letter as PDF), with its new payment term. */
export const Reminder = z.object({ date: z.string(), dueOn: z.string(), by: z.string() });
export type Reminder = z.infer<typeof Reminder>;

export const Notice = z.object({
  id: z.uuid(),
  number: z.string(),
  incidentId: z.uuid(),
  dispatchNumber: z.string(),
  alarmKeyword: z.string(),
  alarmedAt: z.string(),
  location: z.string(),
  offenseKey: z.string(),
  debtors: z.array(DraftDebtor),
  positions: z.array(Position),
  total: z.number(),
  reasoning: z.string(),
  remedy: z.string(),
  cashReference: z.string(),
  status: NoticeStatus,
  /** Who submitted the notice for review (four-eyes principle). */
  submittedAt: z.string().nullable(),
  submittedBy: z.string().nullable(),
  submittedById: z.string().nullable(),
  issuedAt: z.string().nullable(),
  issuedBy: z.string().nullable(),
  dueOn: z.string().nullable(),
  handedOverAt: z.string().nullable(),
  hasPdf: z.boolean(),
  objection: z.object({ date: z.string(), result: z.enum(['pending', 'upheld', 'rejected']), note: z.string() }).nullable(),
  cancellation: z.object({ date: z.string(), reason: z.string() }).nullable(),
  /** Day on which the notice was paid in full. */
  paidOn: z.string().nullable(),
  payments: z.array(Payment),
  /** Sum of the payments not reversed. */
  paid: z.number(),
  /** Total minus paid; negative = overpaid. */
  balance: z.number(),
  /** Open, past due and not paid in full. */
  overdue: z.boolean(),
  reminders: z.array(Reminder),
  /** Guests of the reports not charged (setting `guests`). */
  guestsNotCharged: z.number(),
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
/** Discarding a draft or a notice in review; the reason is optional. */
export const DiscardInput = z.object({ reason: text });
export type DiscardInput = z.input<typeof DiscardInput>;
export const PaymentInput = z.object({ date, amount: money.positive(), note: text });
export type PaymentInput = z.input<typeof PaymentInput>;
export const PaymentReversalInput = z.object({ reason: z.string().trim().min(3) });
export type PaymentReversalInput = z.input<typeof PaymentReversalInput>;

/** Filter of the notice list, also used by the treasury export. */
export const NoticeFilter = z.object({
  status: z.string().optional(),
  year: z.coerce.number().int().optional(),
  /** Words of file number, debtor, dispatch number, cash reference or location. */
  q: z.string().optional(),
  overdue: z.enum(['true', 'false']).optional(),
  /** Comma-separated IDs (export of selected notices). */
  ids: z.string().optional(),
});
export type NoticeFilter = z.infer<typeof NoticeFilter>;

export const AddressBookInput = Debtor.extend({ notes: text });
export type AddressBookInput = z.input<typeof AddressBookInput>;
export const AddressBookEntry = AddressBookInput.extend({ id: z.uuid(), version: z.number() });
export type AddressBookEntry = z.infer<typeof AddressBookEntry>;

/** The incident of a notice for reading while editing it (`GET /cost-recovery/notices/:id/incident`), names resolved. */
export const NoticeIncident = z.object({
  incidentId: z.uuid(),
  dispatchNumber: z.string(),
  alarmKeyword: z.string(),
  alarmMessage: z.string(),
  alarmedAt: z.string(),
  location: z.string(),
  chargeableReason: z.string(),
  notes: z.string(),
  /** The incident is still marked chargeable, and all its reports are released for billing. */
  chargeable: z.boolean(),
  released: z.boolean(),
  reports: z.array(
    z.object({
      reportId: z.uuid(),
      department: z.string(),
      number: z.string(),
      status: z.string(),
      alarmedAt: z.string(),
      departedAt: z.string().nullable(),
      returnedAt: z.string(),
      incidentCommander: z.string(),
      situation: z.string(),
      actions: z.string(),
      cause: z.string(),
      vehicles: z.array(z.object({ vehicleId: z.string(), name: z.string(), departedAt: z.string().nullable(), returnedAt: z.string().nullable(), crew: z.number() })),
      personnel: z.array(z.object({ name: z.string(), vehicle: z.string(), from: z.string(), to: z.string(), standby: z.boolean() })),
      parties: z.array(z.object({ role: z.string(), name: z.string(), street: z.string(), postalCode: z.string(), city: z.string() })),
    }),
  ),
});
export type NoticeIncident = z.infer<typeof NoticeIncident>;

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
  /** All reports released for billing. */
  released: z.boolean(),
  suggestedOffense: z.string().nullable(),
  noticeId: z.uuid().nullable(),
  noticeStatus: NoticeStatus.nullable(),
});
export type Candidate = z.infer<typeof Candidate>;

/** A notice of an incident for the incident page (`GET /cost-recovery/incidents/:incidentId/notices`). */
export const IncidentNotice = z.object({ id: z.uuid(), number: z.string(), status: NoticeStatus, total: z.number(), issuedAt: z.string().nullable() });
export type IncidentNotice = z.infer<typeof IncidentNotice>;

export const COST_RECOVERY_EVENTS = { noticeIssued: 'cost-recovery.notice.issued' } as const;
export interface NoticeIssuedEvent {
  noticeId: string;
  incidentId: string;
  total: number;
}
