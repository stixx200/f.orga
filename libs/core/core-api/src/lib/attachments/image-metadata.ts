/**
 * Removes metadata from photos before they are stored (L27): EXIF with position, camera and time, XMP, IPTC and
 * comments. Only the orientation stays (otherwise photos taken upright would show turned), and what the image needs to
 * be displayed (JFIF, colour profile, Adobe marker). Files that cannot be parsed are returned unchanged; the type check
 * happens before.
 */
export function stripImageMetadata(data: Buffer, contentType: string): Buffer {
  try {
    if (contentType === 'image/jpeg') return stripJpeg(data);
    if (contentType === 'image/png') return stripPng(data);
    if (contentType === 'image/webp') return stripWebp(data);
  } catch {
    // A damaged file is stored as it is; it was checked to be of the declared type.
  }
  return data;
}

const ORIENTATION_TAG = 0x0112;

/** The EXIF orientation (1–8) of an APP1 segment payload, or `null`. */
function exifOrientation(payload: Buffer): number | null {
  if (payload.subarray(0, 6).toString('latin1') !== 'Exif\0\0') return null;
  const tiff = payload.subarray(6);
  const little = tiff.subarray(0, 2).toString('latin1') === 'II';
  const u16 = (offset: number) => (little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset));
  const u32 = (offset: number) => (little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset));
  const ifd = u32(4);
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) === ORIENTATION_TAG) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** An APP1 segment with only the orientation (big endian TIFF, one IFD entry). */
function orientationSegment(orientation: number): Buffer {
  const payload = Buffer.alloc(6 + 8 + 2 + 12 + 4);
  payload.write('Exif\0\0', 0, 'latin1');
  payload.write('MM', 6, 'latin1');
  payload.writeUInt16BE(42, 8);
  payload.writeUInt32BE(8, 10);
  payload.writeUInt16BE(1, 14);
  payload.writeUInt16BE(ORIENTATION_TAG, 16);
  payload.writeUInt16BE(3, 18);
  payload.writeUInt32BE(1, 20);
  payload.writeUInt16BE(orientation, 24);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** Markers kept before the image data: APP0 (JFIF), APP2 (ICC profile), APP14 (Adobe colour transform). */
const KEPT_APP = new Set([0xe0, 0xe2, 0xee]);

function stripJpeg(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 2)];
  let orientation: number | null = null;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return data;
    const marker = data[offset + 1];
    // Fill bytes between segments.
    if (marker === 0xff) {
      offset++;
      continue;
    }
    // Start of scan: the compressed image follows up to the end, unchanged.
    if (marker === 0xda) {
      if (orientation && orientation !== 1) parts.splice(1, 0, orientationSegment(orientation));
      parts.push(data.subarray(offset));
      return Buffer.concat(parts);
    }
    const length = data.readUInt16BE(offset + 2);
    const segment = data.subarray(offset, offset + 2 + length);
    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (marker === 0xe1) orientation ??= exifOrientation(segment.subarray(4));
    if (!(isApp && !KEPT_APP.has(marker)) && marker !== 0xfe) parts.push(segment);
    offset += 2 + length;
  }
  return data;
}

/** Text and EXIF chunks of PNG (author, software, comments, time, position). */
const PNG_DROPPED = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

function stripPng(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('latin1');
    const end = offset + 12 + length;
    if (end > data.length) return data;
    if (!PNG_DROPPED.has(type)) parts.push(data.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

function stripWebp(data: Buffer): Buffer {
  const parts: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= data.length) {
    const type = data.subarray(offset, offset + 4).toString('latin1');
    const size = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > data.length) return data;
    const chunk = Buffer.from(data.subarray(offset, Math.min(end, data.length)));
    // Extended format: the flags say whether EXIF (0x08) and XMP (0x04) chunks follow.
    if (type === 'VP8X') chunk[8] &= ~0x0c;
    if (type !== 'EXIF' && type !== 'XMP ') parts.push(chunk);
    offset = end;
  }
  const body = Buffer.concat(parts);
  const header = Buffer.from(data.subarray(0, 12));
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}
