import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { LocalizedText, RetentionAction, RetentionCaseStatus, RetentionFinalAction } from '@forga/core-contracts';

/**
 * A record whose retention period has passed and that waits for the archive or a confirmation (list „Aussonderung“).
 * The case stays as proof after the record is anonymised or deleted, then only with its neutral name. The names are hidden
 * properties, so the history never holds names of persons.
 */
export const RetentionCaseSchema = defineEntity({
  name: 'RetentionCaseEntity',
  schema: 'core',
  tableName: 'retention_case',
  indexes: [{ properties: ['category', 'recordId'] }, { properties: ['status'] }, { properties: ['offerId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    category: p.string(),
    ruleKey: p.string(),
    /** Record of the module; no foreign key across modules. */
    recordId: p.string(),
    label: p.text().hidden(),
    neutralLabel: p.text().hidden(),
    reason: p.json<LocalizedText>().nullable(),
    /** Day the period started (leaving, alarm, …). */
    eventDate: p.string().length(10),
    dueSince: p.string().length(10),
    attachments: p.integer().default(0),
    status: p.string().$type<RetentionCaseStatus>().default('due'),
    /** Rule when the case was created. */
    action: p.string().$type<RetentionAction>(),
    afterDecision: p.string().$type<RetentionFinalAction>().nullable(),
    specialCase: p.boolean().default(false),
    blockedBy: p.string().nullable(),
    offerId: p.string().nullable(),
    offeredAt: p.datetime().nullable(),
    archive: p.string().nullable(),
    offerNote: p.text().nullable(),
    decidedOn: p.string().length(10).nullable(),
    decisionNote: p.text().nullable(),
    deferredUntil: p.string().length(10).nullable(),
    deferReason: p.text().nullable(),
    executedAt: p.datetime().nullable(),
    executedAction: p.string().$type<RetentionFinalAction>().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class RetentionCaseEntity extends RetentionCaseSchema.class {}
RetentionCaseSchema.setClass(RetentionCaseEntity);
