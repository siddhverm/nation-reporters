import { sanitizeHashtags, sanitizePublisherStoryText, scrubSourceLabels, stripSourceFromSlug } from './reader-summary.util';
import { buildImageAlt, storyImagePath } from './story-image.util';
import { type ImageOrigin, originFromValue } from './image-mode';
import { filterSourceHashtags, scrubSourceMentions, sourceNameVariants } from './source-scrub.util';
import { stripPageBoilerplate } from './page-boilerplate.util';

type ProvenanceLike = {
  sourceName?: string | null;
  sourceUrl?: string | null;
} | null | undefined;

type PublicArticleLike = {
  title?: string | null;
  excerpt?: string | null;
  bodyShort?: string | null;
  bodyMedium?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  body?: unknown;
  slug?: string | null;
  language?: string | null;
  mediaAssets?: unknown;
  imageOrigin?: string | null;
  hashtags?: string[] | null;
  podcastScript?: string | null;
  seoSlug?: string | null;
  provenance?: ProvenanceLike;
  [key: string]: unknown;
};

/** True when text is (or is dominated by) publisher desk/newsletter/ad chrome. */
function looksLikePublisherChrome(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/Entertainment\s+Desk|DeskNew\s*Delhi|,UPDATED|\bUPDATED\b/i.test(t) && t.length < 280) {
    return true;
  }
  if (/\breporter\s+at\s+[A-Z]/i.test(t) && t.length < 160) return true;
  if (/^Sign\s+up\s+for\s+(?:our\s+)?/i.test(t) && t.length < 160) return true;
  if (/^\s*(Advertisement|Advertisem|Publicité|Werbung|Publicidad|विज्ञापन)\s*$/i.test(t)) return true;
  if (/डेस्क\s*,/.test(t) && t.length < 160) return true;
  if (
    /^(?:India\s+Today|NDTV|Hindustan\s+Times|Times\s+of\s+India|TOI|News18|Business\s+Standard|Brisbane\s+Times|BBC\s+News|BBC\s+Sport)\b/i.test(
      t,
    ) &&
    t.length < 100
  ) {
    return true;
  }
  if (/^Image\s+source\s*,/i.test(t) && t.length < 120) return true;
  if (/\{\s*(?:margin|padding|box-sizing)\s*:/i.test(t)) return true;
  if (/\*,\s*:after|:before\s*\{|-webkit-box-sizing/i.test(t)) return true;
  if (/\bNews\s*[-–—]\s*Business\s+Standard\b/i.test(t)) return true;
  if (/<meta\b/i.test(t) || /\bfunction\s+get_cookie_/i.test(t)) return true;
  return false;
}

type CleanOpts = { headline?: string; sourceName?: string | null; sourceUrl?: string | null };

/** Publisher names for this item + every registered source; used by scrubSourceMentions at read time. */
const namesFor = (opts: CleanOpts) => sourceNameVariants(opts.sourceName, opts.sourceUrl);

function cleanField(
  text: string | null | undefined,
  opts: CleanOpts,
  longText = false,
): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  const names = namesFor(opts);
  // Long free text also loses scraped page boilerplate (menus, "Trending Stories", "Join conversation", …).
  // Names first (so "told Reuters" → "told reporters" before the generic outlet remover would leave "told"), then again.
  const pre = scrubSourceMentions(longText ? stripPageBoilerplate(raw) : raw, names);
  // Final scrub removes what is left once the outlet is gone ("… 2028. Source:", "… via", outlet hashtags),
  // then publisher references inside sentences are neutralised ("the TOI report" → "the report").
  const cleaned = scrubSourceMentions(scrubSourceLabels(sanitizePublisherStoryText(pre, opts), opts), names).trim();
  if (cleaned) return cleaned;
  // Sanitizer emptied the field. Never put chrome back; only keep short real headlines.
  if (looksLikePublisherChrome(raw)) return '';
  return raw.length <= 120 ? scrubSourceMentions(scrubSourceLabels(raw, opts), names) : '';
}

/** Walk TipTap/ProseMirror text nodes and strip publisher chrome in place. */
function sanitizeTipTapBody(
  body: unknown,
  opts: { headline?: string; sourceName?: string | null; sourceUrl?: string | null },
): unknown {
  if (!body || typeof body !== 'object') return body;

  const plainOf = (n: unknown): string => {
    if (!n || typeof n !== 'object') return '';
    const o = n as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    return Array.isArray(o.content) ? (o.content as unknown[]).map(plainOf).join('') : '';
  };

  const walk = (node: Record<string, unknown>): Record<string, unknown> | null => {
    // A paragraph/heading whose whole text is publisher chrome (byline, credit, "Source: X", "Read more: URL",
    // outlet name…) is removed instead of being left in the document.
    if ((node.type === 'paragraph' || node.type === 'heading') && Array.isArray(node.content)) {
      const joined = plainOf(node).trim();
      if (joined && !sanitizePublisherStoryText(joined, opts).trim()) return null;
    }
    const next: Record<string, unknown> = { ...node };
    if (typeof next.text === 'string' && next.text.trim()) {
      const cleaned = scrubSourceMentions(sanitizePublisherStoryText(scrubSourceMentions(next.text, namesFor(opts)), opts), namesFor(opts)).trim();
      if (cleaned) next.text = cleaned;
      else if (/Desk|UPDATED|डेस्क|Advertis|Sign up for|reporter at|Image\s+source\s*,|BBC\s+(?:Sport|News|Radio)|margin\s*:|Business\s+Standard|\*,\s*:after/i.test(next.text)) {
        next.text = '';
      }
    }
    if (next.aiVideo && typeof next.aiVideo === 'object') {
      const av = { ...(next.aiVideo as Record<string, unknown>) };
      if (typeof av.summary === 'string' && av.summary.trim()) {
        av.summary = scrubSourceMentions(sanitizePublisherStoryText(av.summary, opts), namesFor(opts)).trim();
      }
      if (typeof av.narration === 'string' && av.narration.trim()) {
        av.narration = scrubSourceMentions(sanitizePublisherStoryText(av.narration, opts), namesFor(opts)).trim();
      }
      if (typeof av.title === 'string' && av.title.trim()) {
        const cleanedTitle = scrubSourceMentions(sanitizePublisherStoryText(av.title, opts), namesFor(opts)).trim();
        if (cleanedTitle) av.title = cleanedTitle;
      }
      next.aiVideo = av;
    }
    if (Array.isArray(next.content)) {
      next.content = (next.content as Record<string, unknown>[])
        .map((child) => walk(child))
        .filter((child): child is Record<string, unknown> => child !== null)
        .filter((child) => {
          if (typeof child.text === 'string' && !child.text.trim() && !child.content) return false;
          return true;
        });
    }
    return next;
  };

  const walked = walk(body as Record<string, unknown>) ?? body;
  return dropBoilerplateParagraphs(walked);
}

/**
 * Scraped-page leftovers inside the stored document (menus, "Trending Stories", comment prompts, text after an
 * "End of Article" marker): rebuild the paragraphs from the cleaned text when anything was removed.
 */
function dropBoilerplateParagraphs(doc: unknown): unknown {
  if (!doc || typeof doc !== 'object') return doc;
  const d = doc as Record<string, unknown>;
  if (d.type !== 'doc' || !Array.isArray(d.content)) return doc;
  const paras = d.content as Array<Record<string, unknown>>;
  if (!paras.every((p) => p?.type === 'paragraph' && Array.isArray(p.content) && (p.content as Array<Record<string, unknown>>).every((c) => c?.type === 'text'))) return doc;
  const texts = paras.map((p) => (p.content as Array<Record<string, unknown>>).map((c) => String(c.text ?? '')).join('')).filter((t) => t.trim());
  if (!texts.length) return doc;
  const joined = texts.join('\n\n');
  const cleaned = stripPageBoilerplate(joined);
  if (cleaned === joined.trim()) return doc;
  const content = cleaned
    .split(/\n\s*\n|\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }));
  return { ...d, content };
}

/** body.keyPoints (bullet summary): clean every bullet like any other public text; drop empties. */
function withCleanKeyPoints(
  body: unknown,
  opts: { headline?: string; sourceName?: string | null; sourceUrl?: string | null },
): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const kp = (body as Record<string, unknown>).keyPoints;
  if (!Array.isArray(kp)) return body;
  const cleaned = kp
    .filter((x): x is string => typeof x === 'string')
    .map((x) => cleanField(x, { ...opts, headline: undefined }))
    .filter((x) => x.length >= 8);
  return { ...(body as Record<string, unknown>), keyPoints: cleaned };
}

type MediaLike = { id?: string; type?: string; url?: string | null; s3Key?: string | null; scanStatus?: string | null };

/**
 * Public view of media: publisher images/videos (s3Key "external/…", external URLs) and storage keys are never
 * exposed. Every story exposes exactly one image: the same-origin /story-image/<slug> URL plus its origin
 * ('source' = mirrored in our storage, 'generated' = AI / fallback artwork) — never a source URL or domain.
 */
export function publicMediaAssets(
  assets: unknown[],
  image?: { url: string; alt: string; origin?: ImageOrigin },
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let imageDone = false;
  for (const raw of assets as MediaLike[]) {
    if (raw?.type === 'IMAGE') {
      if (image && !imageDone) {
        out.push({ id: raw.id, type: 'IMAGE', url: image.url, alt: image.alt, origin: image.origin ?? 'generated', scanStatus: image.origin === 'source' ? 'source_mirrored' : 'generated' });
        imageDone = true;
      }
      continue;
    }
    if (raw?.type === 'VIDEO') {
      if (String(raw.s3Key ?? '').startsWith('external/') || raw.scanStatus === 'external') continue;
      out.push({ id: raw.id, type: 'VIDEO', url: raw.url });
      continue;
    }
    out.push({ id: raw?.id, type: raw?.type, url: raw?.url });
  }
  return out;
}

/** Replace any publisher image URL/credit stored in the TipTap doc with our own image reference + origin. */
function withStoryImageBody(body: unknown, image: { url: string; alt: string; origin: ImageOrigin }): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { imageCredit: _credit, imageSource: _source, sourceImageRemoved: _removed, ...rest } = body as Record<string, unknown>;
  return { ...rest, imageUrl: image.url, imageAlt: image.alt, imageGenerated: image.origin === 'generated', imageOrigin: image.origin };
}

/** Internal editorial/workflow fields that anonymous readers must never receive. */
const INTERNAL_FIELDS = [
  'ingestedArticleId', 'riskScore', 'riskFlags', 'riskAssessment', 'authorId', 'editorId',
  'versions', 'provenance',
] as const;

export function stripInternalFields<T extends Record<string, unknown>>(article: T): Omit<T, (typeof INTERNAL_FIELDS)[number]> {
  const copy: Record<string, unknown> = { ...article };
  for (const k of INTERNAL_FIELDS) delete copy[k];
  return copy as Omit<T, (typeof INTERNAL_FIELDS)[number]>;
}

/**
 * Sanitize publisher chrome on public article payloads.
 * Uses provenance for outlet-aware stripping, then strips provenance from the response.
 */
export function sanitizeArticleForPublicResponse<T extends PublicArticleLike>(article: T): Omit<T, 'provenance'> {
  const provenance = article.provenance;
  const sourceName = provenance?.sourceName ?? null;
  const sourceUrl = provenance?.sourceUrl ?? null;
  const rawTitle = (article.title ?? '').trim();
  const cleanedTitle = cleanField(rawTitle, { sourceName, sourceUrl });
  // Never restore chrome-only titles; keep raw only when it looks like a real headline.
  const title =
    cleanedTitle ||
    (looksLikePublisherChrome(rawTitle) ? '' : rawTitle);
  const opts = { headline: title, sourceName, sourceUrl };

  const { provenance: _drop, socialCaptions, ...rest } = article as T & {
    socialCaptions?: { caption?: string | null }[];
  };
  const captions = Array.isArray(socialCaptions)
    ? socialCaptions.map((c) => ({
        ...c,
        caption: c?.caption != null ? cleanField(c.caption, opts) || '' : c.caption,
      }))
    : socialCaptions;
  const slug = typeof article.slug === 'string' ? article.slug : '';
  const language = typeof article.language === 'string' ? article.language : 'en';
  const origin = originFromValue(article.imageOrigin);
  const image = slug ? { url: storyImagePath(slug), alt: buildImageAlt(title, language, origin), origin } : undefined;
  const mediaAssets = article.mediaAssets;
  const cleanBody = withCleanKeyPoints(
    article.body !== undefined ? sanitizeTipTapBody(article.body, opts) : article.body,
    opts,
  );
  return {
    ...rest,
    ...(image ? { image } : {}),
    ...(Array.isArray(mediaAssets) ? { mediaAssets: publicMediaAssets(mediaAssets, image) } : {}),
    ...(captions !== undefined ? { socialCaptions: captions } : {}),
    title,
    excerpt: article.excerpt != null ? cleanField(article.excerpt, opts, true) || null : article.excerpt,
    bodyShort: article.bodyShort != null ? cleanField(article.bodyShort, opts, true) || null : article.bodyShort,
    bodyMedium:
      article.bodyMedium != null ? cleanField(article.bodyMedium, opts, true) || null : article.bodyMedium,
    ...(typeof article.podcastScript === 'string' ? { podcastScript: cleanField(article.podcastScript, opts, true) || null } : {}),
    seoTitle: article.seoTitle != null ? cleanField(article.seoTitle, opts) || null : article.seoTitle,
    seoDescription:
      article.seoDescription != null
        ? cleanField(article.seoDescription, opts) || null
        : article.seoDescription,
    ...(Array.isArray(article.hashtags) ? { hashtags: filterSourceHashtags(sanitizeHashtags(article.hashtags, opts), namesFor(opts)) } : {}),
    ...(typeof article.seoSlug === 'string' ? { seoSlug: stripSourceFromSlug(article.seoSlug, opts) || slug } : {}),
    body: image ? withStoryImageBody(cleanBody, image) : cleanBody,
    ...(image ? { imageOrigin: image.origin } : {}),
  } as Omit<T, 'provenance'>;
}

/**
 * Lightweight list/card sanitize (title + excerpt) plus the generated image reference.
 * Known outlets apply without provenance. Raw media rows (publisher URLs, storage keys) are removed.
 */
export function sanitizeArticleListItem<
  T extends {
    title?: string | null; excerpt?: string | null; slug?: string | null; language?: string | null;
    provenance?: ProvenanceLike; mediaAssets?: unknown; imageOrigin?: string | null;
  },
>(item: T): Omit<T, 'provenance'> & { image?: { url: string; alt: string; origin: ImageOrigin }; imageOrigin?: ImageOrigin } {
  const opts = { sourceName: item.provenance?.sourceName, sourceUrl: item.provenance?.sourceUrl };
  const title = cleanField(item.title, opts) || '';
  // Prefer empty over chrome when title was outlet desk junk.
  const safeTitle = title || (looksLikePublisherChrome(item.title ?? '') ? '' : (item.title ?? ''));
  const excerpt =
    item.excerpt != null
      ? cleanField(item.excerpt, { ...opts, headline: safeTitle }, true) || null
      : item.excerpt;
  const { mediaAssets, provenance: _prov, ...rest } = item;
  // Any other reader-visible text a list row may carry is cleaned the same way.
  const restRec = rest as Record<string, unknown>;
  for (const k of ['bodyShort', 'bodyMedium', 'podcastScript'] as const) {
    if (typeof restRec[k] === 'string') restRec[k] = cleanField(restRec[k] as string, { ...opts, headline: safeTitle }, true) || null;
  }
  for (const k of ['seoTitle', 'seoDescription'] as const) {
    if (typeof restRec[k] === 'string') restRec[k] = cleanField(restRec[k] as string, { ...opts, headline: safeTitle }) || null;
  }
  if (Array.isArray(restRec.socialCaptions)) {
    restRec.socialCaptions = (restRec.socialCaptions as Array<{ caption?: string | null }>).map((c) => ({ ...c, caption: c?.caption != null ? cleanField(c.caption, opts) || '' : c?.caption }));
  }
  const origin = originFromValue(item.imageOrigin);
  // Defence in depth: list payloads normally carry no body, but if one is present never let a source image URL/credit through.
  const maybeBody0 = (rest as { body?: unknown }).body;
  if (maybeBody0 && typeof maybeBody0 === 'object') {
    (rest as { body?: unknown }).body = withCleanKeyPoints(sanitizeTipTapBody(maybeBody0, { ...opts, headline: safeTitle }), { ...opts, headline: safeTitle });
  }
  const maybeBody = (rest as { body?: unknown }).body;
  if (maybeBody && typeof maybeBody === 'object' && !Array.isArray(maybeBody) && item.slug) {
    (rest as { body?: unknown }).body = withStoryImageBody(maybeBody, { url: storyImagePath(item.slug), alt: buildImageAlt(safeTitle, item.language, origin), origin });
  }
  const image = item.slug
    ? { url: storyImagePath(item.slug), alt: buildImageAlt(safeTitle, item.language, origin), origin }
    : undefined;
  return {
    ...rest,
    title: safeTitle,
    excerpt,
    ...(Array.isArray(mediaAssets) ? { mediaAssets: publicMediaAssets(mediaAssets) } : {}),
    ...(image ? { image, imageOrigin: origin } : {}),
  } as unknown as Omit<T, 'provenance'> & { image?: { url: string; alt: string; origin: ImageOrigin }; imageOrigin?: ImageOrigin };
}

/**
 * Clean one free-text field (headline, caption, SEO text, social excerpt) for any public channel
 * (social posts, feeds). Uses the feed's own outlet name/domain when known.
 */
export function sanitizeTextForPublic(
  text: string | null | undefined,
  opts: { headline?: string; sourceName?: string | null; sourceUrl?: string | null } = {},
): string {
  return cleanField(text, opts);
}
