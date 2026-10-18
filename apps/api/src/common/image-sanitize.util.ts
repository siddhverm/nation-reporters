/**
 * Validation + metadata stripping for mirrored source images (JPEG / PNG / WebP only, no external libs).
 *  - format is decided by magic bytes, never by the Content-Type header or file extension
 *  - width/height are read from the file headers (min size, max pixels, sane aspect ratio)
 *  - EXIF / XMP / IPTC / comments / text chunks (GPS, camera, author, software, ...) are removed from the bytes
 *  - JPEGs whose EXIF orientation is not "normal" are rejected, because removing EXIF would show them rotated
 *    (the story then simply uses the generated picture)
 */
export type ImageKind = 'jpeg' | 'png' | 'webp';
export const KIND_MIME: Record<ImageKind, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const KIND_EXT: Record<ImageKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export type ImageInfo = { kind: ImageKind; width: number; height: number; orientation: number; animated: boolean };

export function sniffImageKind(b: Buffer): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function exifOrientation(seg: Buffer): number {
  // seg = APP1 payload starting with "Exif\0\0"
  if (seg.length < 14 || seg.toString('latin1', 0, 4) !== 'Exif') return 1;
  const t = seg.subarray(6);
  const le = t.toString('latin1', 0, 2) === 'II';
  const u16 = (o: number) => (o + 2 <= t.length ? (le ? t.readUInt16LE(o) : t.readUInt16BE(o)) : 0);
  const u32 = (o: number) => (o + 4 <= t.length ? (le ? t.readUInt32LE(o) : t.readUInt32BE(o)) : 0);
  if (u16(2) !== 42) return 1;
  const ifd = u32(4);
  const n = u16(ifd);
  for (let i = 0; i < n && i < 200; i++) {
    const e = ifd + 2 + i * 12;
    if (u16(e) === 0x0112) return u16(e + 8) || 1;
  }
  return 1;
}

function inspectJpeg(b: Buffer): ImageInfo | null {
  let o = 2; let width = 0; let height = 0; let orientation = 1;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) { o++; continue; }
    const m = b[o + 1];
    if (m === 0xff) { o++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
    if (m === 0xd9) break;
    const len = b.readUInt16BE(o + 2);
    if (len < 2) return null;
    if (m === 0xe1) orientation = Math.max(orientation === 1 ? 1 : orientation, exifOrientation(b.subarray(o + 4, o + 2 + len)));
    if (SOF.has(m)) { height = b.readUInt16BE(o + 5); width = b.readUInt16BE(o + 7); break; }
    if (m === 0xda) break;
    o += 2 + len;
  }
  return width && height ? { kind: 'jpeg', width, height, orientation, animated: false } : null;
}

function inspectPng(b: Buffer): ImageInfo | null {
  if (b.length < 33 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  let animated = false;
  for (let o = 8; o + 12 <= b.length;) {
    const len = b.readUInt32BE(o); const type = b.toString('latin1', o + 4, o + 8);
    if (type === 'acTL') animated = true;
    if (type === 'IDAT' || type === 'IEND') break;
    o += 12 + len;
  }
  return { kind: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20), orientation: 1, animated };
}

function inspectWebp(b: Buffer): ImageInfo | null {
  let width = 0; let height = 0; let animated = false;
  for (let o = 12; o + 8 <= b.length;) {
    const id = b.toString('latin1', o, o + 4); const size = b.readUInt32LE(o + 4); const d = o + 8;
    if (id === 'VP8X' && d + 10 <= b.length) {
      animated = (b[d] & 0x02) !== 0;
      width = 1 + (b[d + 4] | (b[d + 5] << 8) | (b[d + 6] << 16));
      height = 1 + (b[d + 7] | (b[d + 8] << 8) | (b[d + 9] << 16));
    } else if (id === 'VP8 ' && !width && d + 10 <= b.length) {
      width = b.readUInt16LE(d + 6) & 0x3fff; height = b.readUInt16LE(d + 8) & 0x3fff;
    } else if (id === 'VP8L' && !width && d + 5 <= b.length && b[d] === 0x2f) {
      const bits = b.readUInt32LE(d + 1);
      width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1;
    }
    if (id === 'ANIM' || id === 'ANMF') animated = true;
    o = d + size + (size & 1);
  }
  return width && height ? { kind: 'webp', width, height, orientation: 1, animated } : null;
}

export function inspectImage(b: Buffer): ImageInfo | null {
  try {
    const kind = sniffImageKind(b);
    if (kind === 'jpeg') return inspectJpeg(b);
    if (kind === 'png') return inspectPng(b);
    if (kind === 'webp') return inspectWebp(b);
  } catch { /* malformed */ }
  return null;
}

/* ───────────────────────────── metadata stripping ───────────────────────────── */

function stripJpeg(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 2)];
  let o = 2;
  while (o + 2 <= b.length) {
    if (b[o] !== 0xff) { out.push(b.subarray(o)); break; }
    const m = b[o + 1];
    if (m === 0xff) { o++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { out.push(b.subarray(o, o + 2)); o += 2; continue; }
    if (m === 0xd9) { out.push(b.subarray(o, o + 2)); break; }
    const len = b.readUInt16BE(o + 2);
    const seg = b.subarray(o, o + 2 + len);
    if (m === 0xda) { out.push(b.subarray(o)); break; } // scan data to EOF, copied verbatim
    const isApp = m >= 0xe0 && m <= 0xef;
    const keep =
      !isApp && m !== 0xfe // drop COM
        ? true
        : m === 0xe0 // JFIF
          ? true
          : m === 0xe2 && seg.toString('latin1', 4, 15) === 'ICC_PROFILE' // colour profile
            ? true
            : m === 0xee && seg.toString('latin1', 4, 9) === 'Adobe'; // colour transform flag
    if (keep) out.push(seg);
    o += 2 + len;
  }
  return Buffer.concat(out);
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const PNG_KEEP_ANCILLARY = new Set(['tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs', 'acTL', 'fcTL', 'fdAT']);

function stripPng(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 8)];
  for (let o = 8; o + 12 <= b.length;) {
    const len = b.readUInt32BE(o); const type = b.toString('latin1', o + 4, o + 8);
    const end = o + 12 + len;
    const ancillary = (type.charCodeAt(0) & 0x20) !== 0;
    if (!PNG_DROP.has(type) && (!ancillary || PNG_KEEP_ANCILLARY.has(type))) out.push(b.subarray(o, end));
    if (type === 'IEND') break;
    o = end;
  }
  return Buffer.concat(out);
}

function stripWebp(b: Buffer): Buffer {
  const chunks: Buffer[] = [];
  for (let o = 12; o + 8 <= b.length;) {
    const id = b.toString('latin1', o, o + 4); const size = b.readUInt32LE(o + 4);
    const end = Math.min(b.length, o + 8 + size + (size & 1));
    if (id !== 'EXIF' && id !== 'XMP ') {
      const c = Buffer.from(b.subarray(o, end));
      if (id === 'VP8X') c[8] = c[8] & ~(0x08 | 0x04); // clear EXIF + XMP flags
      chunks.push(c);
    }
    o = end;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(4 + body.length, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

export function stripImageMetadata(b: Buffer, kind: ImageKind): Buffer {
  return kind === 'jpeg' ? stripJpeg(b) : kind === 'png' ? stripPng(b) : stripWebp(b);
}

/* ───────────────────────────── validation ───────────────────────────── */

export type SourceImageLimits = {
  maxBytes: number; minBytes: number; minWidth: number; minHeight: number; maxPixels: number; minAspect: number; maxAspect: number;
};

export const DEFAULT_SOURCE_IMAGE_LIMITS: SourceImageLimits = {
  maxBytes: 5_000_000, minBytes: 8_000, minWidth: 600, minHeight: 315, maxPixels: 50_000_000, minAspect: 0.5, maxAspect: 3.2,
};

export function sourceImageLimitsFromEnv(get: (k: string) => string | undefined): SourceImageLimits {
  const n = (k: string, d: number) => { const v = Number(get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
  const d = DEFAULT_SOURCE_IMAGE_LIMITS;
  return {
    maxBytes: n('SOURCE_IMAGE_MAX_BYTES', d.maxBytes), minBytes: d.minBytes,
    minWidth: n('SOURCE_IMAGE_MIN_WIDTH', d.minWidth), minHeight: n('SOURCE_IMAGE_MIN_HEIGHT', d.minHeight),
    maxPixels: n('SOURCE_IMAGE_MAX_PIXELS', d.maxPixels), minAspect: d.minAspect, maxAspect: d.maxAspect,
  };
}

export type PreparedImage =
  | { ok: true; buffer: Buffer; kind: ImageKind; mimeType: string; width: number; height: number }
  | { ok: false; reason: 'too_large' | 'too_small_bytes' | 'not_an_image' | 'unsupported_or_animated' | 'too_small' | 'too_many_pixels' | 'bad_aspect' | 'needs_rotation' };

export function prepareSourceImage(raw: Buffer, limits: SourceImageLimits = DEFAULT_SOURCE_IMAGE_LIMITS): PreparedImage {
  if (raw.length > limits.maxBytes) return { ok: false, reason: 'too_large' };
  if (raw.length < limits.minBytes) return { ok: false, reason: 'too_small_bytes' };
  const info = inspectImage(raw);
  if (!info) return { ok: false, reason: sniffImageKind(raw) ? 'unsupported_or_animated' : 'not_an_image' };
  if (info.animated) return { ok: false, reason: 'unsupported_or_animated' };
  if (info.width < limits.minWidth || info.height < limits.minHeight) return { ok: false, reason: 'too_small' };
  if (info.width * info.height > limits.maxPixels) return { ok: false, reason: 'too_many_pixels' };
  const ratio = info.width / info.height;
  if (ratio < limits.minAspect || ratio > limits.maxAspect) return { ok: false, reason: 'bad_aspect' };
  if (info.orientation !== 1) return { ok: false, reason: 'needs_rotation' };
  const buffer = stripImageMetadata(raw, info.kind);
  // re-check the stripped file still parses with identical dimensions
  const after = inspectImage(buffer);
  if (!after || after.width !== info.width || after.height !== info.height) return { ok: false, reason: 'not_an_image' };
  return { ok: true, buffer, kind: info.kind, mimeType: KIND_MIME[info.kind], width: info.width, height: info.height };
}
