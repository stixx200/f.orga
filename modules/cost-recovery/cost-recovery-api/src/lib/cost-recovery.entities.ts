import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { Debtor, NoticeStatus, Payment, Position, Reminder } from '@forga/cost-recovery-contracts';

export const NoticeSchema = defineEntity({
  name: 'NoticeEntity',
  schema: 'cost_recovery',
  tableName: 'notice',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** File number, e.g. `KE-2026-007`. */
    number: p.string().unique(),
    incidentId: p.string().index(),
    dispatchNumber: p.string(),
    alarmKeyword: p.string(),
    alarmedAt: p.datetime(),
    location: p.string().default(''),
    offenseKey: p.string(),
    debtors: p.json<Debtor[]>().defaultRaw("'[]'::jsonb"),
    positions: p.json<Position[]>().defaultRaw("'[]'::jsonb"),
    reasoning: p.text().default(''),
    remedy: p.text().default(''),
    cashReference: p.string().default(''),
    status: p.string().$type<NoticeStatus>().default('draft'),
    /** Submitted for review by (four-eyes principle: the user ID). */
    submittedAt: p.datetime().nullable(),
    submittedBy: p.string().nullable(),
    submittedById: p.string().nullable(),
    issuedAt: p.datetime().nullable(),
    issuedBy: p.string().nullable(),
    dueOn: p.string().length(10).nullable(),
    /** Handed over to the treasury (Sollstellung); kept when the notice is paid, cancelled or amended later. */
    handedOverAt: p.datetime().nullable(),
    /** A cancellation after the handover has been reported to the treasury with an export. */
    changeReportedAt: p.datetime().nullable(),
    /** The PDF as issued; never changed afterwards. */
    pdf: p.blob().nullable().lazy(),
    objection: p.json<{ date: string; result: 'pending' | 'upheld' | 'rejected'; note: string }>().nullable(),
    cancellation: p.json<{ date: string; reason: string }>().nullable(),
    /** Day of the payment that settled the notice. */
    paidOn: p.string().length(10).nullable(),
    payments: p.json<Payment[]>().defaultRaw("'[]'::jsonb"),
    reminders: p.json<Reminder[]>().defaultRaw("'[]'::jsonb"),
    /** Guests of the reports not charged (setting `guests`), shown as a hint on the notice. */
    guestsNotCharged: p.integer().default(0),
    /** Amendment notice: the notice it changes (`amendsNumber` for documents). */
    amendsId: p.string().nullable(),
    amendsNumber: p.string().nullable(),
    /** Set on the original once the amendment is issued. */
    amendedById: p.string().nullable(),
    amendedByNumber: p.string().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class NoticeEntity extends NoticeSchema.class {}
NoticeSchema.setClass(NoticeEntity);

/** Frequent debtors, e.g. operators of fire alarm systems or insurances. */
export const AddressBookSchema = defineEntity({
  name: 'AddressBookEntity',
  schema: 'cost_recovery',
  tableName: 'address_book',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    name: p.string(),
    street: p.string().default(''),
    postalCode: p.string().default(''),
    city: p.string().default(''),
    role: p.string().default(''),
    notes: p.text().default(''),
    version: p.integer().version(),
  },
});
export class AddressBookEntity extends AddressBookSchema.class {}
AddressBookSchema.setClass(AddressBookEntity);

/** Legal ground chosen in the incident report (card of the cost recovery module); preferred over the suggestion. */
export const IncidentOffenseSchema = defineEntity({
  name: 'IncidentOffenseEntity',
  schema: 'cost_recovery',
  tableName: 'incident_offense',
  properties: {
    /** Incident of the incidents module; no foreign key across modules. */
    incidentId: p.string().primary(),
    offenseKey: p.string(),
    setBy: p.string(),
    setAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date()),
  },
});
export class IncidentOffenseEntity extends IncidentOffenseSchema.class {}
IncidentOffenseSchema.setClass(IncidentOffenseEntity);
