/**
 * IMAGE_MODE: where story pictures come from.
 *  - source_first (default): mirror the source item's image into OUR storage (validated, metadata-stripped) and show it
 *    with a small copyright note; fall back to an AI-generated picture when there is none / it fails validation.
 *  - generated_only (safe mode): never fetch a source image; every story gets an AI-generated picture.
 */
export type ImageMode = 'source_first' | 'generated_only';
export const IMAGE_MODES: readonly ImageMode[] = ['source_first', 'generated_only'];
export type ImageOrigin = 'source' | 'generated';

export function parseImageMode(raw: string | null | undefined): ImageMode {
  const v = (raw ?? '').trim().toLowerCase().replace(/-/g, '_');
  return (IMAGE_MODES as readonly string[]).includes(v) ? (v as ImageMode) : 'source_first';
}

/** MediaAsset.scanStatus values for story pictures we store ourselves. */
export const SCAN_GENERATED = 'generated';
export const SCAN_SOURCE_MIRRORED = 'source_mirrored';

export function originFromValue(v: unknown): ImageOrigin {
  return v === 'source' ? 'source' : 'generated';
}
