/**
 * Source-image discovery on a publisher page + "get the bigger version" URL rewriting.
 * Pure (cheerio only); URLs are used server-side to mirror the picture, never stored or exposed.
 */
import * as cheerio from 'cheerio';
import { isWeakStoryImageUrl } from './mirror-external-image.util';

const abs = (raw: string | null | undefined, base: string): string | null => {
  let u = String(raw ?? '').trim().replace(/&amp;/g, '&');
  if (!u || u.startsWith('data:') || u.startsWith('blob:')) return null;
  if (u.startsWith('//')) u = `https:${u}`;
  try {
    const out = new URL(u, base).href;
    return /^https?:\/\//i.test(out) ? out : null;
  } catch {
    return null;
  }
};

/** Largest entry of a srcset ("a.jpg 320w, b.jpg 1024w" → b.jpg). */
export function largestFromSrcset(srcset: string | null | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; score: number } | null = null;
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, desc] = part.trim().split(/\s+/);
    if (!url) continue;
    const m = /^(\d+(?:\.\d+)?)([wx])$/i.exec(desc ?? '');
    const score = m ? Number(m[1]) * (m[2].toLowerCase() === 'x' ? 1000 : 1) : 1;
    if (!best || score > best.score) best = { url, score };
  }
  return best?.url ?? null;
}

/** Collect image URLs from JSON-LD (string | string[] | ImageObject{url,contentUrl} | nested @graph). */
function jsonLdImages(node: unknown, out: string[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { for (const n of node) jsonLdImages(n, out, depth + 1); return; }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  const take = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(take);
    else if (v && typeof v === 'object') {
      const io = v as Record<string, unknown>;
      if (typeof io.url === 'string') out.push(io.url);
      else if (typeof io.contentUrl === 'string') out.push(io.contentUrl);
      else if (Array.isArray(io.url)) io.url.forEach(take);
    }
  };
  const type = String(Array.isArray(o['@type']) ? (o['@type'] as unknown[]).join(',') : o['@type'] ?? '');
  // Images of the article itself first; skip publisher/author logos.
  if (!/Organization|Person|WebSite|BreadcrumbList/i.test(type)) {
    take(o.image);
    if (/ImageObject/i.test(type)) take(o);
    take(o.thumbnailUrl);
  }
  if (o['@graph']) jsonLdImages(o['@graph'], out, depth + 1);
  if (o.mainEntity) jsonLdImages(o.mainEntity, out, depth + 1);
}

const numAttr = (v: string | undefined): number | null => {
  const n = Number(String(v ?? '').replace(/px$/i, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Ordered, de-duplicated candidate list: og:image(:secure_url/:url) → twitter:image → link[rel=image_src] →
 * JSON-LD image → large <img> inside the article body. Relative URLs are resolved; logos/icons/SVG/data: dropped.
 */
export function extractImageCandidatesFromHtml(html: string, pageUrl: string, max = 8): string[] {
  const $ = cheerio.load(html);
  const raw: Array<string | undefined> = [
    $('meta[property="og:image:secure_url"]').attr('content'),
    $('meta[property="og:image"]').attr('content'),
    $('meta[property="og:image:url"]').attr('content'),
    $('meta[name="og:image"]').attr('content'),
    $('meta[name="twitter:image"]').attr('content'),
    $('meta[property="twitter:image"]').attr('content'),
    $('meta[name="twitter:image:src"]').attr('content'),
    $('link[rel="image_src"]').attr('href'),
    $('meta[itemprop="image"]').attr('content'),
  ];
  const ld: string[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const txt = $(el).contents().text().trim();
    if (!txt) return;
    try { jsonLdImages(JSON.parse(txt), ld); } catch { /* invalid JSON-LD */ }
  });
  raw.push(...ld);
  // first large <img> inside the article
  const scope = $('article, [itemprop="articleBody"], .article-body, .story-body, .story, main').first();
  const imgs = (scope.length ? scope : $('body')).find('img').toArray().slice(0, 40);
  for (const el of imgs) {
    const img = $(el);
    const w = numAttr(img.attr('width'));
    const h = numAttr(img.attr('height'));
    if ((w != null && w < 400) || (h != null && h < 200)) continue;
    const src = largestFromSrcset(img.attr('srcset') || img.attr('data-srcset'))
      || img.attr('data-src') || img.attr('data-original') || img.attr('data-lazy-src') || img.attr('src');
    raw.push(src);
  }
  const out: string[] = [];
  for (const r of raw) {
    const u = abs(r, pageUrl);
    if (!u || /\.svg(\?|#|$)/i.test(u) || out.includes(u)) continue;
    if (isWeakStoryImageUrl(u)) {
      // a tiny resized thumbnail ("?w=100") of the real photo: use its larger version instead
      const bigger = largerImageUrlVariants(u).find((v) => !isWeakStoryImageUrl(v));
      if (bigger && !out.includes(bigger)) out.push(bigger);
      continue;
    }
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

const SIZE_PARAMS = /^(?:w|h|width|height|wid|hei|resize|fit|crop|size|sz|dpr|maxwidth|maxheight|max-w|max-h|imwidth|im)$/i;

/**
 * Bigger versions of a resized CDN URL, best first ("?w=100", "&width=150", "-150x150.jpg", "/resize/100x100/",
 * TOI-style "width-100,height-75"). Returns [] when nothing looks resized.
 */
export function largerImageUrlVariants(url: string): string[] {
  const out: string[] = [];
  const push = (u: string) => { if (u && u !== url && !out.includes(u)) out.push(u); };
  let parsed: URL;
  try { parsed = new URL(url); } catch { return out; }

  // 1. query params: drop size params entirely, and also try them set large
  const sizeKeys = [...parsed.searchParams.keys()].filter((k) => SIZE_PARAMS.test(k));
  if (sizeKeys.length) {
    const big = new URL(parsed.href);
    for (const k of sizeKeys) {
      if (/^(w|width|wid|imwidth|maxwidth|max-w)$/i.test(k)) big.searchParams.set(k, '1200');
      else if (/^(h|height|hei|maxheight|max-h)$/i.test(k)) big.searchParams.delete(k);
      else if (/^resize$/i.test(k)) big.searchParams.delete(k);
    }
    const stripped = new URL(parsed.href);
    for (const k of sizeKeys) stripped.searchParams.delete(k);
    push(stripped.href);
    push(big.href);
  }
  // 2. path patterns
  const p = parsed.pathname;
  const withPath = (np: string) => { const u = new URL(parsed.href); u.pathname = np; return u.href; };
  // WordPress / generic "-150x150.jpg" suffix
  if (/-\d{2,4}x\d{2,4}(\.[a-z]{3,4})$/i.test(p)) push(withPath(p.replace(/-\d{2,4}x\d{2,4}(\.[a-z]{3,4})$/i, '$1')));
  // "/resize/100x100/", "/thumb/150x/", "/w_100,h_100/" (Cloudinary), "/fit-in/100x100/"
  if (/\/(?:resize|thumb|thumbs|fit-in|crop)\/\d{1,4}x\d{0,4}\//i.test(p)) push(withPath(p.replace(/\/(?:resize|thumb|thumbs|fit-in|crop)\/\d{1,4}x\d{0,4}\//i, '/')));
  if (/\/[wh]_\d+(?:,[a-z]_[^/]+)*\//i.test(p)) push(withPath(p.replace(/\/[wh]_\d+(?:,[a-z]_[^/]+)*\//i, '/w_1200/')));
  // TOI / Times CDN: "/photo/msid-1,imgsize-1,width-100,height-75,resizemode-4/1.jpg"
  const toi = /width-(\d+)(?:,height-(\d+))?/i.exec(p);
  if (toi && Number(toi[1]) < 1200) {
    const w = Number(toi[1]);
    const h = toi[2] ? Number(toi[2]) : null;
    const nh = h ? Math.round((h / w) * 1200) : null;
    push(withPath(p.replace(/width-\d+(?:,height-\d+)?/i, `width-1200${nh ? `,height-${nh}` : ''}`)));
  }
  return out;
}
