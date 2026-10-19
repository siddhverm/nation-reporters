/** Deterministic generated fallback artwork spec (no text, no source imagery), seeded by the story slug. */
export type ArtShape = { x: number; y: number; size: number; ratio: number; round: boolean; color: string; opacity: number; rotate: number };
export type ArtSpec = { bg: [string, string]; shapes: ArtShape[] };

/** FNV-1a 32-bit. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hex colour (satori, used by next/og, does not parse hsl() inside gradients). */
const hsl = (h: number, s: number, l: number): string => {
  const hh = (((Math.round(h) % 360) + 360) % 360) / 360;
  const ss = s / 100;
  const ll = Math.round(l) / 100;
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const ch = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return `#${ch(hh + 1 / 3)}${ch(hh)}${ch(hh - 1 / 3)}`;
};

export function fallbackArtSpec(slug: string): ArtSpec {
  const r = rng(hashSeed(slug));
  const hue = r() * 360;
  const bg: [string, string] = [hsl(hue, 55, 14), hsl(hue + 40, 60, 28)];
  const shapes: ArtShape[] = [];
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    shapes.push({
      x: Math.round(r() * 1100 - 100),
      y: Math.round(r() * 530 - 100),
      size: Math.round(120 + r() * 380),
      ratio: r() > 0.5 ? 1 : 0.4 + r() * 0.5,
      round: r() > 0.4,
      color: hsl(hue + r() * 90 - 20, 65, 45 + r() * 25),
      opacity: Number((0.12 + r() * 0.3).toFixed(2)),
      rotate: Math.round(r() * 90 - 45),
    });
  }
  return { bg, shapes };
}
