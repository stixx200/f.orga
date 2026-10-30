import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';

/**
 * One personal access link per person. The key is stored as SHA-256; the key itself is encrypted with
 * `FORGA_SECRET_KEY` so it can be shown again. Both are hidden and never appear in the history.
 */
export const AccessLinkSchema = defineEntity({
  name: 'AccessLinkEntity',
  schema: 'personal',
  tableName: 'access_link',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** Person in the masterdata module; no foreign key across modules. */
    personId: p.string().unique(),
    keyHash: p.string().unique().hidden(),
    keyPrefix: p.string(),
    /** The access key encrypted with the server key (AES-256-GCM); removed when revoked. */
    keyEncrypted: p.text().nullable().hidden().lazy(),
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
export class AccessLinkEntity extends AccessLinkSchema.class {}
AccessLinkSchema.setClass(AccessLinkEntity);
