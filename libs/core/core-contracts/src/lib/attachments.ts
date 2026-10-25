/** A file attached to a record of a module, e.g. a photo of a defect or the protocol of a test bench. */
export interface Attachment {
  id: string;
  /** Kind of record, e.g. `equipment.defect`. */
  ownerType: string;
  ownerId: string;
  fileName: string;
  contentType: string;
  size: number;
  createdBy: string;
  createdAt: string;
}

/** Accepted file types: photos and PDF. */
export const ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export const ATTACHMENT_MAX_SIZE = 10 * 1024 * 1024;
