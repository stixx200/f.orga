import { stripImageMetadata } from './image-metadata.js';

/** A JPEG segment: marker and payload with length. */
const segment = (marker: number, payload: Buffer) => {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
};

/** EXIF payload (little endian) with orientation and a GPS pointer tag, plus a text that must disappear. */
function exif(orientation: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt16LE(0x8825, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(0, 30);
  return Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, Buffer.from('GPS 48.7758 9.1829 Kamera XY', 'latin1')]);
}

/** A PNG chunk (length, type, data, CRC left empty). */
const pngChunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
};

/** A RIFF chunk of WebP, padded to an even size. */
const webpChunk = (type: string, data: Buffer) => {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  return Buffer.concat([Buffer.from(type, 'latin1'), size, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};

const SCAN = Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);

function jpeg(orientation: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01', 'latin1')),
    segment(0xe1, exif(orientation)),
    segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Ort</x:xmpmeta>', 'latin1')),
    segment(0xed, Buffer.from('Photoshop 3.0\0IPTC', 'latin1')),
    segment(0xfe, Buffer.from('Kommentar', 'latin1')),
    segment(0xdb, Buffer.alloc(5, 1)),
    SCAN,
  ]);
}

describe('stripImageMetadata', () => {
  it('removes EXIF, XMP, IPTC and comments from a JPEG and keeps only the orientation', () => {
    const stripped = stripImageMetadata(jpeg(6), 'image/jpeg');
    const text = stripped.toString('latin1');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('xmpmeta');
    expect(text).not.toContain('IPTC');
    expect(text).not.toContain('Kommentar');
    expect(text).toContain('JFIF');
    // Image data and quantisation table unchanged, orientation kept in a minimal EXIF segment.
    expect(stripped.subarray(stripped.length - SCAN.length).equals(SCAN)).toBe(true);
    expect(stripped.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    const app1 = stripped.indexOf(Buffer.from([0xff, 0xe1]));
    expect(app1).toBeGreaterThan(0);
    expect(stripped.subarray(app1 + 4, app1 + 10).toString('latin1')).toBe('Exif\0\0');
    expect(stripped.readUInt16BE(app1 + 4 + 6 + 8 + 2 + 8)).toBe(6);
  });

  it('drops the EXIF segment completely for upright photos', () => {
    const stripped = stripImageMetadata(jpeg(1), 'image/jpeg');
    expect(stripped.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
  });

  it('removes text and EXIF chunks from PNG', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', Buffer.alloc(13)),
      pngChunk('tEXt', Buffer.from('Author\0Max Mustermann', 'latin1')),
      pngChunk('eXIf', Buffer.from('MM GPS', 'latin1')),
      pngChunk('IDAT', Buffer.alloc(3, 7)),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
    const stripped = stripImageMetadata(png, 'image/png').toString('latin1');
    expect(stripped).not.toContain('Mustermann');
    expect(stripped).not.toContain('eXIf');
    expect(stripped).toContain('IDAT');
    expect(stripped).toContain('IEND');
  });

  it('removes EXIF and XMP chunks from WebP and clears their flags', () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x0c;
    const body = Buffer.concat([webpChunk('VP8X', vp8x), webpChunk('VP8 ', Buffer.alloc(6, 3)), webpChunk('EXIF', Buffer.from('GPS position', 'latin1')), webpChunk('XMP ', Buffer.from('<xmp/>', 'latin1'))]);
    const header = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1')]);
    header.writeUInt32LE(body.length + 4, 4);
    const stripped = stripImageMetadata(Buffer.concat([header, body]), 'image/webp');
    expect(stripped.toString('latin1')).not.toContain('GPS');
    expect(stripped.toString('latin1')).not.toContain('xmp');
    expect(stripped.readUInt32LE(4)).toBe(stripped.length - 8);
    expect(stripped[20] & 0x0c).toBe(0);
  });

  it('leaves PDF and damaged files as they are', () => {
    const pdf = Buffer.from('%PDF-1.4 Author', 'latin1');
    expect(stripImageMetadata(pdf, 'application/pdf')).toBe(pdf);
    const broken = Buffer.from([0xff, 0xd8, 0x00, 0x01]);
    expect(stripImageMetadata(broken, 'image/jpeg').equals(broken)).toBe(true);
  });
});
