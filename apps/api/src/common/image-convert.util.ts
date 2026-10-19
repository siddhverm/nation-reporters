/**
 * Optional image conversion with `sharp` (if installed). Used to rescue source pictures we cannot validate as-is:
 * animated GIF/WebP (first frame), AVIF/HEIC/TIFF/static GIF, EXIF-rotated JPEGs → plain JPEG.
 * When sharp is not installed every call returns null and the caller simply tries the next candidate.
 */
export type ImageConverter = (input: Buffer) => Promise<Buffer | null>;

let cached: ImageConverter | null | undefined;

/** Load sharp lazily; null when the module is not available in this build. */
export function loadSharpConverter(): ImageConverter | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as (input: Buffer, opts?: Record<string, unknown>) => {
      rotate(): ReturnType<typeof sharp>;
      resize(o: Record<string, unknown>): ReturnType<typeof sharp>;
      jpeg(o: Record<string, unknown>): { toBuffer(): Promise<Buffer> };
    };
    cached = async (input: Buffer) => {
      try {
        // pages: 1 + animated:false → first frame only; rotate() applies EXIF orientation; metadata is not copied
        return await sharp(input, { animated: false, pages: 1, limitInputPixels: 50_000_000 })
          .rotate()
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85, mozjpeg: true })
          .toBuffer();
      } catch {
        return null;
      }
    };
  } catch {
    cached = null;
  }
  return cached;
}

/** Container formats we can only use after conversion. */
export function sniffConvertibleKind(b: Buffer): 'gif' | 'avif' | 'heic' | 'tiff' | 'bmp' | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a') return 'gif';
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = b.subarray(8, 12).toString('latin1');
    if (/^avi[fs]$/.test(brand)) return 'avif';
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'heic';
  }
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return 'tiff';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
  return null;
}
