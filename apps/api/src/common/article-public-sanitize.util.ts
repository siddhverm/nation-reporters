import { sanitizePublisherStoryText } from './reader-summary.util';

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

function cleanField(
  text: string | null | undefined,
  opts: { headline?: string; sourceName?: string | null; sourceUrl?: string | null },
): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  const cleaned = sanitizePublisherStoryText(raw, opts).trim();
  if (cleaned) return cleaned;
  // Sanitizer emptied the field. Never put chrome back; only keep short real headlines.
  if (looksLikePublisherChrome(raw)) return '';
  return raw.length <= 120 ? raw : '';
}

/** Walk TipTap/ProseMirror text nodes and strip publisher chrome in place. */
function sanitizeTipTapBody(
  body: unknown,
  opts: { headline?: string; sourceName?: string | null; sourceUrl?: string | null },
): unknown {
  if (!body || typeof body !== 'object') return body;

  const walk = (node: Record<string, unknown>): Record<string, unknown> => {
    const next: Record<string, unknown> = { ...node };
    if (typeof next.text === 'string' && next.text.trim()) {
      const cleaned = sanitizePublisherStoryText(next.text, opts).trim();
      if (cleaned) next.text = cleaned;
      else if (/Desk|UPDATED|डेस्क|Advertis|Sign up for|reporter at|Image\s+source\s*,|BBC\s+(?:Sport|News|Radio)|margin\s*:|Business\s+Standard|\*,\s*:after/i.test(next.text)) {
        next.text = '';
      }
    }
    if (next.aiVideo && typeof next.aiVideo === 'object') {
      const av = { ...(next.aiVideo as Record<string, unknown>) };
      if (typeof av.summary === 'string' && av.summary.trim()) {
        av.summary = sanitizePublisherStoryText(av.summary, opts).trim();
      }
      if (typeof av.title === 'string' && av.title.trim()) {
        const cleanedTitle = sanitizePublisherStoryText(av.title, opts).trim();
        if (cleanedTitle) av.title = cleanedTitle;
      }
      next.aiVideo = av;
    }
    if (Array.isArray(next.content)) {
      next.content = (next.content as Record<string, unknown>[])
        .map((child) => walk(child))
        .filter((child) => {
          if (typeof child.text === 'string' && !child.text.trim() && !child.content) return false;
          return true;
        });
    }
    return next;
  };

  return walk(body as Record<string, unknown>);
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
  return {
    ...rest,
    ...(captions !== undefined ? { socialCaptions: captions } : {}),
    title,
    excerpt: article.excerpt != null ? cleanField(article.excerpt, opts) || null : article.excerpt,
    bodyShort: article.bodyShort != null ? cleanField(article.bodyShort, opts) || null : article.bodyShort,
    bodyMedium:
      article.bodyMedium != null ? cleanField(article.bodyMedium, opts) || null : article.bodyMedium,
    seoTitle: article.seoTitle != null ? cleanField(article.seoTitle, opts) || null : article.seoTitle,
    seoDescription:
      article.seoDescription != null
        ? cleanField(article.seoDescription, opts) || null
        : article.seoDescription,
    body: article.body !== undefined ? sanitizeTipTapBody(article.body, opts) : article.body,
  } as Omit<T, 'provenance'>;
}

/** Lightweight list/card sanitize (title + excerpt). Known outlets apply without provenance. */
export function sanitizeArticleListItem<T extends { title?: string | null; excerpt?: string | null }>(
  item: T,
): T {
  const title = cleanField(item.title, {}) || '';
  // Prefer empty over chrome when title was outlet desk junk.
  const safeTitle = title || (looksLikePublisherChrome(item.title ?? '') ? '' : (item.title ?? ''));
  const excerpt =
    item.excerpt != null
      ? cleanField(item.excerpt, { headline: safeTitle }) || null
      : item.excerpt;
  return { ...item, title: safeTitle, excerpt };
}
