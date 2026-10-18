import {
  DEFAULT_SOURCE_IMAGE_LIMITS, inspectImage, prepareSourceImage, sniffImageKind, stripImageMetadata, type SourceImageLimits,
} from './image-sanitize.util';
import { com, exifApp1, makeJpeg, makePng, makeWebp, pngChunk, xmpApp1 } from './test-images';

const lim = (o: Partial<SourceImageLimits> = {}): SourceImageLimits => ({ ...DEFAULT_SOURCE_IMAGE_LIMITS, minBytes: 100, ...o });

describe('image inspection', () => {
  it('detects format by magic bytes and reads dimensions', () => {
    expect(inspectImage(makeJpeg(1200, 630))).toMatchObject({ kind: 'jpeg', width: 1200, height: 630 });
    expect(inspectImage(makePng(800, 450))).toMatchObject({ kind: 'png', width: 800, height: 450 });
    expect(inspectImage(makeWebp(1000, 560))).toMatchObject({ kind: 'webp', width: 1000, height: 560 });
    expect(sniffImageKind(Buffer.from('<html>not an image</html>'))).toBeNull();
    expect(sniffImageKind(Buffer.from('GIF89a......'))).toBeNull();
  });
  it('reads EXIF orientation', () => {
    expect(inspectImage(makeJpeg(1200, 630, [exifApp1(6)]))?.orientation).toBe(6);
    expect(inspectImage(makeJpeg(1200, 630, [exifApp1(1)]))?.orientation).toBe(1);
  });
});

describe('metadata stripping', () => {
  it('removes EXIF/GPS, XMP and comments from JPEG but keeps image data + JFIF', () => {
    const src = makeJpeg(1200, 630, [exifApp1(1), xmpApp1(), com()], 500);
    expect(src.toString('latin1')).toMatch(/GPS:12|Jane Photographer|Daily Planet/);
    const out = stripImageMetadata(src, 'jpeg');
    const s = out.toString('latin1');
    expect(s).not.toMatch(/GPS|Exif|CameraMake|Jane|Photographer|Daily Planet|xmpmeta/);
    expect(s).toContain('JFIF');
    expect(inspectImage(out)).toMatchObject({ width: 1200, height: 630 });
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(out.length).toBeLessThan(src.length);
  });
  it('removes text/EXIF/time chunks from PNG', () => {
    const src = makePng(800, 450, [pngChunk('tEXt', Buffer.from('Author\0Jane Photographer')), pngChunk('eXIf', Buffer.from('GPSdata')), pngChunk('tIME', Buffer.alloc(7)), pngChunk('gAMA', Buffer.alloc(4))]);
    const out = stripImageMetadata(src, 'png');
    expect(out.toString('latin1')).not.toMatch(/Jane|GPSdata|tEXt|eXIf|tIME/);
    expect(out.toString('latin1')).toContain('gAMA');
    expect(inspectImage(out)).toMatchObject({ width: 800, height: 450 });
  });
  it('removes EXIF/XMP chunks from WebP and clears the VP8X flags', () => {
    const src = makeWebp(1000, 560, true);
    const out = stripImageMetadata(src, 'webp');
    expect(out.toString('latin1')).not.toMatch(/Exif GPS|EXIF/);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    const vp8x = out.indexOf('VP8X');
    expect(out[vp8x + 8] & 0x0c).toBe(0);
    expect(inspectImage(out)).toMatchObject({ width: 1000, height: 560 });
  });
});

describe('prepareSourceImage validation', () => {
  it('accepts a good image and returns stripped bytes', () => {
    const r = prepareSourceImage(makeJpeg(1280, 720, [exifApp1(1)], 400), lim());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.mimeType).toBe('image/jpeg'); expect(r.width).toBe(1280); expect(r.buffer.toString('latin1')).not.toContain('GPS'); }
  });
  it.each([
    ['not an image', Buffer.from('<html>' + 'x'.repeat(400) + '</html>'), 'not_an_image'],
    ['too small (px)', makeJpeg(300, 200, [], 400), 'too_small'],
    ['logo-ish strip aspect', makeJpeg(2000, 400, [], 400), 'bad_aspect'],
    ['tall banner', makeJpeg(600, 1800, [], 400), 'bad_aspect'],
    ['rotated phone photo', makeJpeg(1280, 720, [exifApp1(6)], 400), 'needs_rotation'],
    ['too many pixels', makeJpeg(12000, 8000, [], 400), 'too_many_pixels'],
  ])('rejects %s', (_n, buf, reason) => {
    const r = prepareSourceImage(buf as Buffer, lim());
    expect(r).toEqual({ ok: false, reason });
  });
  it('rejects oversize and tiny files', () => {
    expect(prepareSourceImage(makeJpeg(1280, 720, [], 2000), lim({ maxBytes: 1000 }))).toEqual({ ok: false, reason: 'too_large' });
    expect(prepareSourceImage(makeJpeg(1280, 720), { ...DEFAULT_SOURCE_IMAGE_LIMITS })).toEqual({ ok: false, reason: 'too_small_bytes' });
  });
  it('rejects animated WebP/GIF', () => {
    const anim = makeWebp(1000, 560, false); anim[anim.indexOf('VP8X') + 8] |= 0x02;
    expect(prepareSourceImage(anim, lim({ minBytes: 10 }))).toEqual({ ok: false, reason: 'unsupported_or_animated' });
    expect(prepareSourceImage(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(500)]), lim())).toEqual({ ok: false, reason: 'not_an_image' });
  });
});
