import { z } from 'zod';

/**
 * A device a person carries to identify himself at the info terminal: an NFC sticker (transponder) or a barcode.
 * Its ID is stored only as an HMAC; the UI sees the last four characters.
 */
export const PersonDeviceTokenKind = z.enum(['nfc', 'barcode']);
export type PersonDeviceTokenKind = z.infer<typeof PersonDeviceTokenKind>;

/** Registers the device of the person (replaces the active one). */
export const PersonDeviceTokenInput = z.object({ kind: PersonDeviceTokenKind, code: z.string().trim().min(4).max(200) });
export type PersonDeviceTokenInput = z.input<typeof PersonDeviceTokenInput>;

export const PersonDeviceToken = z.object({
  id: z.uuid(),
  kind: PersonDeviceTokenKind,
  /** Last 4 characters of the ID, to recognise the device. */
  suffix: z.string(),
  registeredAt: z.string(),
  registeredBy: z.string(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
  revokeReason: z.string().nullable(),
});
export type PersonDeviceToken = z.infer<typeof PersonDeviceToken>;
