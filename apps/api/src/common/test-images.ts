/** Synthetic image builders for tests (no binary fixtures). */
import * as zlib from 'zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function pngChunk(t: string, d: Buffer) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }
export function makePng(w: number, h: number, extra: Buffer[] = []): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h, 7);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), ...extra, pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
/** Minimal JPEG: SOI, optional APP segments, SOF0 (w x h), SOS + fake scan data, EOI. */
export function makeJpeg(w: number, h: number, apps: Buffer[] = [], pad = 0): Buffer {
  const seg = (m: number, d: Buffer) => { const l = Buffer.alloc(2); l.writeUInt16BE(d.length + 2); return Buffer.concat([Buffer.from([0xff, m]), l, d]); };
  const sof = Buffer.alloc(15); sof[0] = 8; sof.writeUInt16BE(h, 1); sof.writeUInt16BE(w, 3); sof[5] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')), ...apps, seg(0xc0, sof), seg(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0])), Buffer.alloc(pad, 0x55), Buffer.from([0xff, 0xd9])]);
}
export const exifApp1 = (orientation = 1, extra = 'GPS:12.97N,77.59E CameraMake=Secret') => {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4);
  tiff.write('II', 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(orientation, 18);
  const d = Buffer.concat([Buffer.from('Exif\0\0'), tiff, Buffer.from(extra)]);
  const l = Buffer.alloc(2); l.writeUInt16BE(d.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xe1]), l, d]);
};
export const xmpApp1 = () => { const d = Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Author=Jane Photographer</x:xmpmeta>'); const l = Buffer.alloc(2); l.writeUInt16BE(d.length + 2); return Buffer.concat([Buffer.from([0xff, 0xe1]), l, d]); };
export const com = () => { const d = Buffer.from('comment: copyright Daily Planet'); const l = Buffer.alloc(2); l.writeUInt16BE(d.length + 2); return Buffer.concat([Buffer.from([0xff, 0xfe]), l, d]); };
export function makeWebp(w: number, h: number, withExif = true): Buffer {
  const vp8x = Buffer.alloc(10); vp8x[0] = withExif ? 0x08 : 0; vp8x.writeUIntLE(w - 1, 4, 3); vp8x.writeUIntLE(h - 1, 7, 3);
  const ck = (id: string, d: Buffer) => { const hd = Buffer.alloc(8); hd.write(id, 0, 'latin1'); hd.writeUInt32LE(d.length, 4); return Buffer.concat([hd, d, d.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const vp8l = Buffer.alloc(10); vp8l[0] = 0x2f; vp8l.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 1);
  const body = Buffer.concat([Buffer.from('WEBP'), ck('VP8X', vp8x), ck('VP8L', vp8l), ...(withExif ? [ck('EXIF', Buffer.from('Exif GPS secret'))] : [])]);
  const head = Buffer.alloc(8); head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

