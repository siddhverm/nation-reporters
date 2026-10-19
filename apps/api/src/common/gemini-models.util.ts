/**
 * Gemini model selection with automatic fallback. Google retires models (e.g. gemini-2.0-flash → 404 "no longer
 * available"); a retired/unknown model must switch to the next candidate, never take the whole pipeline down.
 */

export const DEFAULT_TEXT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_TEXT_FALLBACKS = 'gemini-flash-latest,gemini-2.5-flash-lite';
export const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const DEFAULT_IMAGE_FALLBACKS = 'gemini-3.1-flash-image';

/** "a, b ,a" → ['a','b'] (trimmed, de-duplicated, "models/" prefix dropped, empty entries ignored). */
export function parseModelList(...lists: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of String(list ?? '').split(/[,\s]+/)) {
      const m = raw.trim().replace(/^models\//i, '');
      if (m && !out.includes(m)) out.push(m);
    }
  }
  return out;
}

export type AiErrorKind = 'model_not_found' | 'quota' | 'other';

/** Retired / unknown model: HTTP 404, "no longer available", "is not found for API version …". */
export function isModelNotFoundMessage(msg: string): boolean {
  return /\b404\b|no longer available|models\/[\w.\-]+ is not found|model\b.{0,60}\bnot found|not found for api version|not supported for generatecontent/i.test(msg);
}

export function classifyAiError(err: unknown): AiErrorKind {
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  if (err instanceof GeminiModelUnavailableError) return 'model_not_found';
  if (isModelNotFoundMessage(msg)) return 'model_not_found';
  if (/\b429\b|quota|too many requests|rate.?limit|resource.?exhausted/i.test(msg)) return 'quota';
  return 'other';
}

export class GeminiModelUnavailableError extends Error {
  constructor(public readonly tried: string[], public readonly envVar = 'GEMINI_MODEL') {
    super(`No available Gemini model (tried ${tried.join(', ') || 'none'}). Set ${envVar} in .env to a model your key can use (see ListModels), then restart.`);
    this.name = 'GeminiModelUnavailableError';
  }
}

/** One-line, word-safe shortening for log/report text (never cuts mid-word; adds an ellipsis). */
export function shortReason(text: string, max = 220): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:(\-–]+$/, '')}…`;
}

/**
 * Walks an ordered candidate list. `current` is the model to use now (cached once it works); `markUnavailable`
 * advances to the next candidate. Logs once per model that is chosen.
 */
export class ModelSelector {
  private index = 0;
  private readonly dead = new Set<string>();
  private announced: string | null = null;
  constructor(readonly candidates: string[], private readonly label: string, private readonly log: (m: string) => void, private readonly envVar = 'GEMINI_MODEL') {}

  get current(): string | null {
    for (let i = this.index; i < this.candidates.length; i++) if (!this.dead.has(this.candidates[i])) { this.index = i; return this.candidates[i]; }
    return null;
  }
  /** Mark the model as working: log which one is used (only when it changes). */
  confirm(model: string) {
    if (this.announced !== model) { this.announced = model; this.log(`${this.label}: using model ${model}`); }
  }
  markUnavailable(model: string) {
    if (this.dead.has(model)) return;
    this.dead.add(model);
    const next = this.current;
    this.log(`${this.label}: model ${model} is not available${next ? ` — switching to ${next}` : ''}`);
  }
  get exhausted(): GeminiModelUnavailableError { return new GeminiModelUnavailableError(this.candidates, this.envVar); }

  /** Run fn(model) with fallback on model-not-found; other errors propagate unchanged. */
  async run<T>(fn: (model: string) => Promise<T>): Promise<{ result: T; model: string }> {
    for (let m = this.current; m; m = this.current) {
      try {
        const result = await fn(m);
        this.confirm(m);
        return { result, model: m };
      } catch (err) {
        if (classifyAiError(err) !== 'model_not_found') throw err;
        this.markUnavailable(m);
      }
    }
    throw this.exhausted;
  }
}
