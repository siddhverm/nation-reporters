/**
 * Story images: AI-generation prompt building, provider call, alt text.
 * IMAGE_MODE=generated_only: no publisher image is ever fetched; each story gets an original generated picture,
 * or the web app's deterministic fallback artwork. IMAGE_MODE=source_first (default): the source image is first
 * mirrored into our own storage (see StoryImageService / source-image pipeline) and this generator is the fallback.
 * Either way the public URL is always our own /story-image/<slug>.
 */
import { languageDisplayName } from '../modules/ai/prompts/lang-names';

export type StoryImageInput = {
  title: string;
  summary?: string | null;
  category?: string | null;
  language?: string | null;
};

export type GeneratedImage = { buffer: Buffer; mimeType: string };

export type ImageGenResult =
  | { ok: true; image: GeneratedImage }
  | { ok: false; reason: 'disabled' | 'no_api_key' | 'model_not_found' | 'http_error' | 'blocked' | 'no_image' | 'timeout' | 'error'; detail?: string };

const CATEGORY_STYLE: Record<string, string> = {
  india: 'a wide editorial scene of everyday life and civic landmarks in India',
  world: 'a wide editorial scene representing international affairs, with symbolic objects such as a globe or maps',
  politics: 'a symbolic scene of governance: an empty parliament chamber, ballot boxes, or government buildings',
  business: 'a symbolic scene of the economy: city skyline, abstract charts, containers, or market floor without text',
  sports: 'a dynamic sports scene shown from behind or from afar, with anonymous athletes in plain kit',
  entertainment: 'a stylised scene of cinema or stage: spotlights, curtains, film reels, anonymous silhouettes',
  tech: 'a clean scene of technology: circuit patterns, servers, devices, abstract data visuals',
};

const MAX_TITLE = 160;
const MAX_SUMMARY = 420;

/** Collapse whitespace/control characters and cap length so story text cannot smuggle instructions or bloat the prompt. */
export function promptText(text: string | null | undefined, max: number): string {
  return (text ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Prompt for an original editorial illustration. Hard rules keep it safe to publish:
 * no text, no logos/brands, no real-person likeness, no depiction of graphic violence.
 */
export function buildStoryImagePrompt(input: StoryImageInput): string {
  const title = promptText(input.title, MAX_TITLE);
  const summary = promptText(input.summary, MAX_SUMMARY);
  const category = (input.category ?? 'world').toLowerCase();
  const scene = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.world;
  const lang = languageDisplayName(input.language ?? 'en');
  return [
    'Create one original, photorealistic-style editorial news illustration (16:9, landscape) for a news website.',
    `Story headline (${lang}): ${title}`,
    summary ? `Story context: ${summary}` : '',
    `Visual direction: ${scene}.`,
    'Show the setting, objects and mood of the story, not a portrait of anyone.',
    'STRICT RULES:',
    '- Do NOT include any text, letters, numbers, captions, headlines, logos, brand marks, flags with writing, watermarks or UI elements.',
    '- Do NOT depict real, identifiable people (politicians, celebrities, athletes, victims) or imitate anyone\'s face or likeness; use anonymous people seen from behind, at a distance, or as silhouettes.',
    '- Do NOT show graphic violence, gore, nudity, or children in distress.',
    '- Do NOT imitate any news outlet, photographer or existing photograph.',
    'Neutral, dignified, newsworthy tone. Natural colours.',
  ].filter(Boolean).join('\n');
}

/** Descriptive alt text in the story language: the (already sanitized) headline is the most accurate description. */
export function buildImageAlt(title: string, language?: string | null, origin: 'source' | 'generated' = 'generated'): string {
  const t = promptText(title, 140);
  const lang = (language ?? 'en').toLowerCase().split(/[-_]/)[0];
  // Source pictures: alt text is simply the headline. Generated ones get a short "Illustration for:" label in English.
  const label = lang === 'en' && origin === 'generated' ? 'Illustration for: ' : '';
  return `${label}${t}`.trim();
}

export type GeminiImageOptions = {
  apiKey?: string | null;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

/** Pull the first inline image out of a Gemini generateContent response. */
export function extractGeminiImage(json: any): GeneratedImage | { blocked: string } | null {
  const feedback = json?.promptFeedback?.blockReason;
  if (feedback) return { blocked: String(feedback) };
  const cand = json?.candidates?.[0];
  if (!cand) return null;
  if (cand.finishReason && /SAFETY|PROHIBITED|BLOCK|IMAGE_OTHER|RECITATION/i.test(String(cand.finishReason)) && !cand.content?.parts?.length) {
    return { blocked: String(cand.finishReason) };
  }
  for (const part of cand.content?.parts ?? []) {
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    const mime = inline?.mimeType ?? inline?.mime_type ?? 'image/png';
    if (typeof data === 'string' && data.length > 100 && /^image\/(png|jpe?g|webp)$/i.test(mime)) {
      return { buffer: Buffer.from(data, 'base64'), mimeType: mime.toLowerCase().replace('image/jpg', 'image/jpeg') };
    }
  }
  return null;
}

/** Call the Gemini image model over REST (key in a header, never in the URL/logs). Never throws. */
export async function generateImageWithGemini(prompt: string, opts: GeminiImageOptions): Promise<ImageGenResult> {
  if (!opts.apiKey) return { ok: false, reason: 'no_api_key' };
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 40_000),
      },
    );
    if (!res.ok) {
      // 404 = retired / unknown model ("models/x is no longer available") → the caller switches to the next model
      if (res.status === 404) return { ok: false, reason: 'model_not_found', detail: `HTTP 404 (${opts.model})` };
      return { ok: false, reason: 'http_error', detail: `HTTP ${res.status}` };
    }
    const extracted = extractGeminiImage(await res.json());
    if (!extracted) return { ok: false, reason: 'no_image' };
    if ('blocked' in extracted) return { ok: false, reason: 'blocked', detail: extracted.blocked };
    if (extracted.buffer.length < 1000 || extracted.buffer.length > 8_000_000) {
      return { ok: false, reason: 'no_image', detail: `unexpected size ${extracted.buffer.length}` };
    }
    return { ok: true, image: extracted };
  } catch (e) {
    const err = e as Error;
    return { ok: false, reason: err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : 'error', detail: err.message?.slice(0, 120) };
  }
}

/** Public, same-origin, source-free URL for a story image. */
export function storyImagePath(slug: string): string {
  return `/story-image/${encodeURIComponent(slug)}`;
}

export function imageExtension(mimeType: string): string {
  return mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
}
