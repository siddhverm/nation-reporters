/** Tiny argv helpers shared by the one-off maintenance scripts (dry-run by default, --apply to write). */
export type CliArgs = { apply: boolean; flags: Set<string>; values: Record<string, string>; positional: string[] };

export function parseCliArgs(argv: readonly string[]): CliArgs {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { values[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--') && /^(limit|since|before|slug|delay-ms|batch-size|status|language|order)$/.test(key)) { values[key] = next; i++; } else flags.add(key);
  }
  return { apply: flags.has('apply'), flags, values, positional };
}

export function intArg(v: string | undefined, def: number, min = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : def;
}

export function dateArg(v: string | undefined, name: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`--${name}: not a valid date: ${v}`);
  return d;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
