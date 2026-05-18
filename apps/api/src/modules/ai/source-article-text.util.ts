import * as cheerio from 'cheerio';
import { acceptLanguageHeaderForLocale } from './language-resolution.util';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function extractReadableTextFromHtml(html: string, maxLen: number): string {
  try {
    const $ = cheerio.load(html);
    // Remove non-content elements; template elements may carry embedded JSON data
    $('script, style, noscript, svg, iframe, nav, footer, header, form, template').remove();
    const selectors = [
      '[itemprop="articleBody"]',
      '[itemprop="articlebody"]',
      'article',
      '[role="main"]',
      'main',
      '[data-component="text-block"]',
      '.article-body',
      '.article__body',
      '.article__content',
      '.story-body',
      '.story__body',
      '.story-content',
      '.story_details',
      '.ins_storybody',
      '.articleBody',
      '.entry-content',
      '.post-content',
      '#article-body',
      '.content-body',
      '.field--name-body',
      '.field-body',
      '.Normal',
      '.article-content',
      '.news-content',
      'section.article-content',
    ];
    let root = $('body');
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length && el.text().trim().length > 200) {
        root = el as typeof root;
        break;
      }
    }
    let text = root.text().replace(/\s+/g, ' ').trim();
    if (text.length < 200) {
      text = cheerio.load(html)
        .root()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
    }
    return stripInlineJson(text).slice(0, maxLen);
  } catch {
    return stripHtmlToPlain(html, maxLen);
  }
}

/**
 * Remove JSON object literals that leak into extracted page text.
 * Common sources: Next.js SSR data blobs, embedded API responses, LD+JSON rendered as text.
 * Three passes to peel nested objects from the inside out.
 */
function stripInlineJson(text: string): string {
  let t = text;
  for (let i = 0; i < 3; i++) {
    // Match {...} where the interior has no nested braces but contains a JSON-style "key": pattern
    t = t.replace(/\{[^<>{}]*"[A-Za-z_]\w*"\s*:[^<>{}]*\}/g, ' ');
  }
  return t.replace(/\s{2,}/g, ' ').trim();
}

function stripHtmlToPlain(html: string, maxLen: number): string {
  const text = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, maxLen);
}

/** True when RSS/plain body is only the headline (or nearly so) — always try source HTML fetch. */
export function rssBodyLooksLikeTitleOnly(rssPlain: string, titlePlain: string): boolean {
  const r = (rssPlain ?? '').replace(/\s+/g, ' ').trim();
  const t = (titlePlain ?? '').replace(/\s+/g, ' ').trim();
  if (!r || !t) return false;
  if (r.length > Math.max(480, t.length + 120)) return false;
  const rl = r.toLowerCase();
  const tl = t.toLowerCase();
  if (rl === tl) return true;
  if (tl.startsWith(rl) || rl.startsWith(tl)) return true;
  const rWords = new Set(rl.split(/\s+/).filter((w) => w.length > 2));
  const tWords = tl.split(/\s+/).filter((w) => w.length > 2);
  if (tWords.length === 0) return false;
  let overlap = 0;
  for (const w of tWords) if (rWords.has(w)) overlap++;
  return overlap / tWords.length >= 0.9 && r.length <= t.length + 60;
}

/** Minimum plain-text length from a source page to treat as a usable article body. */
export const MIN_SOURCE_ARTICLE_PLAIN_CHARS = 180;

export function isAllowedArticleFetchUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return false;
    if (host === '127.0.0.1' || host === '0.0.0.0') return false;
    if (host.startsWith('192.168.') || host.startsWith('10.')) return false;
    if (host.startsWith('172.')) {
      const parts = host.split('.');
      const second = parseInt(parts[1] ?? '0', 10);
      if (second >= 16 && second <= 31) return false;
    }
    if (host.endsWith('.internal') || host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

export async function fetchArticleTitleAndText(
  url: string,
  opts: { timeoutMs: number; maxBytes: number },
  fetchOpts?: { acceptLanguage?: string },
): Promise<{ title: string; text: string } | null> {
  if (!isAllowedArticleFetchUrl(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': fetchOpts?.acceptLanguage ?? acceptLanguageHeaderForLocale('en'),
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > opts.maxBytes ? buf.slice(0, opts.maxBytes) : buf;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    const $ = cheerio.load(html);
    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('meta[name="twitter:title"]').attr('content')?.trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      '';
    const text = extractReadableTextFromHtml(html, 120_000);
    return { title, text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchArticlePlainText(
  url: string,
  opts: { timeoutMs: number; maxBytes: number },
  fetchOpts?: { acceptLanguage?: string },
): Promise<string | null> {
  if (!isAllowedArticleFetchUrl(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': fetchOpts?.acceptLanguage ?? acceptLanguageHeaderForLocale('en'),
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > opts.maxBytes ? buf.slice(0, opts.maxBytes) : buf;
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    return extractReadableTextFromHtml(html, 120_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
