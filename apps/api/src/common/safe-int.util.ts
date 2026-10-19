/**
 * Parse an integer query/config value safely.
 *
 * Why this exists: with the global `ValidationPipe({ transform: true })`, a handler parameter typed
 * `@Query('limit') limit?: number` is converted with `+value` — so an absent param becomes `NaN`
 * (not `undefined`). `NaN ?? 20` stays `NaN`, `Math.min/max` keep `NaN`, and Prisma rejects
 * `take: NaN` ("Argument `take` is missing"). Always route numeric inputs through here.
 *
 * Accepts numbers, numeric strings ("20", " 20 ", "20.9" → 20), and returns `fallback` for
 * undefined / null / '' / NaN / Infinity / non-numeric strings / arrays. The result is clamped to [min, max].
 */
export function safeInt(
  value: unknown,
  fallback: number,
  min: number = Number.MIN_SAFE_INTEGER,
  max: number = Number.MAX_SAFE_INTEGER,
): number {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const def = clamp(Math.trunc(fallback));
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string') {
    const s = value.trim();
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return def;
    n = Number(s);
  } else {
    return def;
  }
  if (!Number.isFinite(n)) return def;
  return clamp(Math.trunc(n));
}
