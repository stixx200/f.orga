import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { Language } from '@forga/core-contracts';

/**
 * An info terminal: a device at a station on which members book themselves into incident reports and sessions.
 * It authenticates with its device key (SHA-256 stored for checking, the key itself encrypted with
 * `FORGA_SECRET_KEY` to show the link again); both are hidden and never appear in the history.
 */
export const TerminalSchema = defineEntity({
  name: 'TerminalEntity',
  schema: 'info_terminal',
  tableName: 'terminal',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** Station in the masterdata module; no foreign key across modules. */
    stationId: p.string().index(),
    name: p.string(),
    /** Departments of the terminal; the department of the station first. */
    departmentIds: p.array().$type<string[]>(),
    allowNewIncident: p.boolean().default(true),
    allowTraining: p.boolean().default(true),
    language: p.string().$type<Language>().default('de'),
    keyHash: p.string().unique().hidden(),
    keyPrefix: p.string(),
    /** The device key encrypted with the server key (AES-256-GCM); removed when revoked. */
    keyEncrypted: p.text().nullable().hidden().lazy(),
    /** Technical user of the terminal in the core: the history shows which device booked. */
    userId: p.string(),
    createdAt: p.datetime(),
    /** Display name of the user who created it. */
    createdBy: p.string(),
    revokedAt: p.datetime().nullable(),
    revokedBy: p.string().nullable(),
    /** Updated at most once a minute, without history. */
    lastSeenAt: p.datetime().nullable(),
    version: p.integer().version(),
  },
});
export class TerminalEntity extends TerminalSchema.class {}
TerminalSchema.setClass(TerminalEntity);
