import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { BreathingDevice, EvidenceKind, EvidenceSource, ExaminationGroup, ExaminationResult, FitnessColor } from '@forga/respiratory-protection-contracts';

export const EvidenceSchema = defineEntity({
  name: 'EvidenceEntity',
  schema: 'respiratory_protection',
  tableName: 'evidence',
  indexes: [{ properties: ['source', 'sourceId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    personId: p.string().index(),
    kind: p.string().$type<EvidenceKind>(),
    date: p.string().length(10),
    validUntil: p.string().length(10).nullable(),
    result: p.string().$type<ExaminationResult>().nullable(),
    examiner: p.string().default(''),
    restrictions: p.string().default(''),
    examinationGroup: p.string().$type<ExaminationGroup>().nullable(),
    device: p.string().$type<BreathingDevice>().nullable(),
    facility: p.string().default(''),
    kilojoules: p.integer().nullable(),
    passed: p.boolean().nullable(),
    minutes: p.integer().nullable(),
    note: p.text().default(''),
    source: p.string().$type<EvidenceSource>().default('manual'),
    sourceId: p.string().nullable(),
    withdrawn: p.boolean().default(false),
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class EvidenceEntity extends EvidenceSchema.class {}
EvidenceSchema.setClass(EvidenceEntity);

/** Last known traffic light per person, to report changes (`respiratory-protection.status.changed`). */
export const StatusSchema = defineEntity({
  name: 'StatusEntity',
  schema: 'respiratory_protection',
  tableName: 'status',
  properties: {
    personId: p.string().primary(),
    color: p.string().$type<FitnessColor>(),
    changedAt: p.datetime(),
    /** Changed to red, the e-mail is not sent yet; set in the same transaction as the color, so no change is lost. */
    notifyPending: p.boolean().default(false),
  },
});
export class StatusEntity extends StatusSchema.class {}
StatusSchema.setClass(StatusEntity);
