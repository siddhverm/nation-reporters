'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Share2, Facebook, Twitter, ChevronRight, ArrowLeft } from 'lucide-react';
import { getArticleImage, getBodyImageCredit, getPreferredArticleImage } from '@/lib/news-image';
import {
  htmlToPlainText,
  rssPlainLine,
  isFeedBodyPlaceholder,
  safeArticleText,
  stripSyndicationLinkbacks,
  stripWireHeadlinePrefix,
} from '@/lib/rss-plain-text';
import { fetchJsonFromApi } from '@/lib/api-client';
import { formatListingExcerpt, resolveArticleReaderSummary, stripPublisherFeedBoilerplate as stripFeedBoilerplate } from '@/lib/reader-summary';
import {
  articleMatchesLanguageOrScript,
  normalizeUiLanguage,
  withUiLanguagePath,
} from '@/lib/ui-language';
import { useUiLanguage } from '@/lib/use-ui-language';

interface Article {
  id: string;
  title: string;
  slug: string;
  body: Record<string, unknown> & {
    content?: { type?: string; content?: { text?: string; type?: string }[] }[];
    aiVideo?: { summary?: string };
  };
  bodyShort?: string | null;
  bodyMedium?: string | null;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  language: string;
  hashtags: string[];
  categoryId: string | null;
  provenance?: { sourceName: string; sourceUrl: string; attributionNote?: string } | null;
  mediaAssets?: { id: string; type: string; url: string }[];
}

const FALLBACK_ARTICLES: Record<string, { title: string; excerpt: string; paragraphs: string[] }> = {
  'home-fallback-1': {
    title: 'India and World updates will appear here as feeds sync',
    excerpt: 'Local preview mode is active while upstream API is unavailable.',
    paragraphs: [
      'This is a preview article shown because live API data is currently unavailable from your local environment.',
      'Once connectivity to the upstream API is restored, this page will automatically show the full published story content.',
    ],
  },
  'home-fallback-2': {
    title: 'Politics desk: policy and election stories in one stream',
    excerpt: 'Category cards stay populated to support UI review and testing.',
    paragraphs: [
      'This fallback article confirms your category and article routes are working correctly.',
      'Your real politics stories will appear here when API responses are healthy.',
    ],
  },
  'home-fallback-3': {
    title: 'Business pulse: markets, currency and startups',
    excerpt: 'Fallback content is automatically replaced when live API responds.',
    paragraphs: [
      'This is sample business copy used for preview continuity.',
      'No permanent data is stored from fallback mode.',
    ],
  },
  'home-fallback-4': {
    title: 'Technology watch: AI, cybersecurity and digital policy',
    excerpt: 'Multilingual sections remain visible during connectivity issues.',
    paragraphs: [
      'Your page shell and rendering flow are healthy.',
      'Upstream news data connectivity still needs to be restored for live content.',
    ],
  },
};

function buildGenericFallback(slug: string) {
  const clean = slug
    .replace(/-fallback-\d+$/i, '')
    .replace(/-/g, ' ')
    .trim();
  const title = clean.length > 0
    ? clean.replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Preview Article';
  return {
    title: `${title} Update`,
    excerpt: 'This is preview content shown while live article API is unavailable.',
    paragraphs: [
      'You are seeing this preview article because upstream article fetch is currently unavailable from local environment.',
      'Navigation and page rendering are working correctly; live article content will appear automatically once API connectivity is restored.',
    ],
  };
}

/** Flatten TipTap / ProseMirror node tree to plain text (handles bold, links, hardBreak, etc.). */
function collectTextDeep(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (n.type === 'hardBreak') return '\n';
  if (typeof n.text === 'string') return htmlToPlainText(n.text, true);
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(collectTextDeep).join('');
  }
  return '';
}

/** TipTap doc: walk blocks (paragraph, heading, list items, blockquote) and collect readable lines. */
function extractParagraphs(body: Article['body'] | string | null | undefined): string[] {
  let doc: Record<string, unknown> | null = body as Record<string, unknown>;
  if (typeof body === 'string') {
    try {
      doc = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return [];
    }
  }
  if (!doc?.content || !Array.isArray(doc.content)) return [];
  const out: string[] = [];
  const pushBlock = (node: { type?: string; content?: unknown[] }) => {
    const text = collectTextDeep(node).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  };
  const visit = (nodes: { type?: string; content?: unknown[] }[]) => {
    for (const node of nodes) {
      if (!node) continue;
      const t = node.type;
      if (t === 'paragraph' || t === 'heading') {
        pushBlock(node);
      } else if (t === 'listItem') {
        pushBlock(node);
      } else if (t === 'blockquote' || t === 'bulletList' || t === 'orderedList') {
        if (Array.isArray(node.content)) {
          visit(node.content as { type?: string; content?: unknown[] }[]);
        }
      } else if (t === 'text') {
        const tx = (node as { text?: string }).text?.trim();
        if (tx) out.push(tx);
      } else if (Array.isArray(node.content)) {
        visit(node.content as { type?: string; content?: unknown[] }[]);
      }
    }
  };
  visit(doc.content as { type?: string; content?: unknown[] }[]);
  return out
    .map((s) => stripFeedBoilerplate(rssPlainLine(s) || s))
    .filter(Boolean);
}

/** When block types are non-standard, still recover readable paragraphs from the whole doc. */
function extractPlainParagraphsFromBody(body: Article['body'] | string | null | undefined): string[] {
  let doc: Record<string, unknown> | null = body as Record<string, unknown>;
  if (typeof body === 'string') {
    try {
      doc = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return [];
    }
  }
  if (!doc?.content || !Array.isArray(doc.content)) return [];
  const rawBlob = collectTextDeep({ content: doc.content });
  const blob = htmlToPlainText(rawBlob, false)
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (blob.length < 50 || isFeedBodyPlaceholder(blob)) return [];
  const chunks = splitTextToParagraphs(stripFeedBoilerplate(blob)).filter((c) => !isFeedBodyPlaceholder(c));
  const single = stripFeedBoilerplate(blob);
  return chunks.length > 0 ? chunks : isFeedBodyPlaceholder(single) ? [] : [single];
}

/** Full story text from TipTap (paragraphs joined). Used when per-paragraph filters wrongly empty the body. */
function extractFullPlainBodyDoc(body: Article['body'] | string | null | undefined): string {
  const paras = extractParagraphs(body);
  if (paras.length > 0) return paras.join('\n\n');
  let doc: Record<string, unknown> | null = body as Record<string, unknown>;
  if (typeof body === 'string') {
    try {
      doc = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return '';
    }
  }
  if (!doc?.content || !Array.isArray(doc.content)) return '';
  const blob = stripFeedBoilerplate(
    htmlToPlainText(collectTextDeep({ content: doc.content }), false).replace(/\s+/g, ' ').trim(),
  );
  return blob;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Last line of defence: show entire TipTap plain text when it clearly adds material beyond the Summary
 * (filters can drop every paragraph even though the doc holds the full AI long-form).
 */
function fullPlainBodyLastResort(article: Article, displaySummary: string, titleText: string): string | null {
  const full = extractFullPlainBodyDoc(article.body);
  if (!full || full.length < 45 || isFeedBodyPlaceholder(full)) return null;
  if (titleText && isTitleEcho(full, titleText)) return null;
  const sum = displaySummary.trim();
  if (!sum) return full.length >= 60 ? full : null;
  if (normalizeText(full) === normalizeText(sum)) return null;
  const moreWords = wordCount(full) > wordCount(sum) + 6;
  const moreChars = full.length > sum.length + 35;
  if (!moreWords && !moreChars && isNearDuplicate(full, sum)) return null;
  const peeled = stripDuplicateSummaryPrefix(full, sum);
  const candidate = peeled.length >= 45 ? peeled : full;
  if (normalizeText(candidate) === normalizeText(sum)) return null;
  return candidate;
}

/** SEO meta text sometimes holds extra readable context when the doc body is thin. */
function seoBodyFallback(article: Article, excerptText: string): string | null {
  const s = (article.seoDescription ?? '').trim();
  if (s.length < 70) return null;
  if (isNearDuplicate(s, excerptText) && s.length < excerptText.length + 50) return null;
  return s;
}

function splitTextToParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|(?<=[.!?।।])\s+(?=[A-Z0-9])/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paragraphs) {
    const key = p
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const minLen = Math.min(na.length, nb.length);
  if (minLen < 30) return false;
  const overlap = na.split(' ').filter((w) => nb.includes(w)).length;
  const ratio = overlap / Math.max(na.split(' ').length, 1);
  return ratio >= 0.85;
}

const MIN_SUMMARY_CHARS = 28;
/** Prefer a fuller Summary box when the API excerpt is only a one-line hook. */
const MIN_SUBSTANTIVE_SUMMARY_CHARS = 220;

/** Headlines in body copy often repeat tokens from the title; only treat as title-echo when reasonably short. */
function isTitleEcho(paragraph: string, titleText: string): boolean {
  const p = paragraph.trim();
  const t = titleText.trim();
  if (!p || !t) return false;
  const np = normalizeText(p);
  const nt = normalizeText(t);
  if (!np || !nt) return false;
  if (np === nt || np.startsWith(nt) || nt.startsWith(np)) return true;
  if (p.length >= t.length * 2.2 && p.length >= 100) return false;
  return isNearDuplicate(p, t);
}

function trimSummaryDisplay(text: string, maxLen = 1100): string {
  const t = stripFeedBoilerplate(text).trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const last = Math.max(
    cut.lastIndexOf('.'),
    cut.lastIndexOf('!'),
    cut.lastIndexOf('?'),
    cut.lastIndexOf('।'),
  );
  if (last > 100) return cut.slice(0, last + 1).trim();
  return `${cut.trim()}…`;
}

function isTeaserStyleLead(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const low = t.toLowerCase();
  if (
    /जानिए|पढ़िए|देखिए|आइए जानते हैं|विस्तार से/.test(t) ||
    /read more|read on|details inside|let'?s know|stay tuned/.test(low)
  ) {
    return true;
  }
  // Very short single-line hooks are usually incomplete in syndicated feeds.
  const sentenceCount = t.split(/(?<=[.!?।])\s+/).filter(Boolean).length;
  if (t.length < 190 && sentenceCount <= 1) return true;
  return false;
}

/**
 * Only the opening of the summary is used to detect duplicate body *paragraphs*.
 * Comparing every paragraph to a long summary falsely marks real story sentences as duplicates.
 */
function ledeSnippetForDedupe(teaser: string, maxLen = 300): string {
  const t = stripFeedBoilerplate(teaser).trim();
  if (!t || t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const end = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('।'),
  );
  if (end >= 50) return t.slice(0, end + 1).trim();
  return cut.trim();
}

function pickDisplaySummary(
  article: Article,
  titleText: string,
  bodyParagraphs: string[],
  uiLang: string,
): string {
  const raw = resolveArticleReaderSummary(article, titleText, bodyParagraphs, {
    minChars: MIN_SUBSTANTIVE_SUMMARY_CHARS,
    lang: uiLang,
  });
  return raw ? trimSummaryDisplay(raw, 1200) : '';
}

/**
 * True only when a short opening line repeats the teaser — not when a long body paragraph
 * merely shares common words (the old isNearDuplicate ratio falsely matched long copy to short teasers).
 */
function isRedundantOpeningVsTeaser(paragraph: string, teaser: string): boolean {
  const p = paragraph.trim();
  const t = teaser.trim();
  if (!p || !t) return false;
  const pl = p.length;
  const el = t.length;
  /** Teaser (summary lede) is much longer than this paragraph — likely a real story sentence, not a copy of the whole summary. */
  if (el > pl + 80) return false;
  const np = normalizeText(p);
  const nt = normalizeText(t);
  if (np === nt) return true;
  /** Same facts, one block slightly longer (whitespace / trailing clause). */
  if ((np.startsWith(nt) || nt.startsWith(np)) && Math.abs(p.length - t.length) <= 35) return true;
  if (pl > el + 120) return false;
  if (pl > Math.max(el * 1.45, el + 40)) return false;
  return isNearDuplicate(p, t);
}

/** Drop title echoes; drop teaser echoes only for short redundant openers, not full article blocks. */
function filterBodyParagraphs(
  paragraphs: string[],
  teaserText: string,
  titleText: string,
): string[] {
  return paragraphs.filter((p) => {
    if (titleText && isTitleEcho(p, titleText)) return false;
    if (!teaserText) return true;
    if (!isRedundantOpeningVsTeaser(p, teaserText)) return true;
    return false;
  });
}

/** If leading blocks repeat the teaser/title, drop them so only distinct story copy remains. */
function stripLeadingTeaserEcho(paragraphs: string[], teaser: string, titleText: string): string[] {
  if (paragraphs.length === 0) return paragraphs;
  const [first, ...rest] = paragraphs;
  const drop =
    (!!titleText && isTitleEcho(first, titleText)) ||
    (!!teaser && isRedundantOpeningVsTeaser(first, teaser));
  if (!drop) return paragraphs;
  if (rest.length === 0) return [];
  return stripLeadingTeaserEcho(rest, teaser, titleText);
}

function filterTitleOnly(paragraphs: string[], titleText: string): string[] {
  return paragraphs.filter((p) => !titleText || !isTitleEcho(p, titleText));
}

function tieredStoryParagraphs(article: Article, titleText: string, teaserDedupe: string): string[] {
  const tiers = [article.bodyMedium, article.bodyShort].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  for (const raw of tiers) {
    const cleaned = stripFeedBoilerplate(raw).trim();
    if (!cleaned || isFeedBodyPlaceholder(cleaned)) continue;
    const parts = dedupeParagraphs(
      splitTextToParagraphs(cleaned).map(stripFeedBoilerplate).filter(Boolean),
    ).filter((p) => !isFeedBodyPlaceholder(p));
    const filtered = filterBodyParagraphs(filterTitleOnly(parts, titleText), teaserDedupe, titleText);
    if (filtered.length > 0) return filtered;
  }
  return [];
}

/** When TipTap body is empty but API has long-form fields, show them minus teaser echo. */
function rawLongFormParagraphs(article: Article, titleText: string, teaserDedupe: string): string[] {
  const m = article.bodyMedium?.trim();
  const s = article.bodyShort?.trim();
  const raw = m && s ? (m.length >= s.length ? m : s) : m ?? s ?? '';
  if (!raw || raw.length < 40) return [];
  const cleaned = stripFeedBoilerplate(raw).trim();
  if (isFeedBodyPlaceholder(cleaned)) return [];
  const parts = splitTextToParagraphs(cleaned).filter((p) => !isFeedBodyPlaceholder(p));
  const blocks = parts.length > 0 ? parts : [cleaned];
  const withoutTitle = blocks.filter((p) => !titleText || !isTitleEcho(p, titleText));
  const base = withoutTitle.length > 0 ? withoutTitle : blocks;
  return filterBodyParagraphs(base, teaserDedupe, titleText);
}

/**
 * When paragraph filtering removes everything, still show API long fields if they clearly extend
 * beyond the summary (common when excerpt === lede but medium holds the full rewrite).
 */
function stripDuplicateSummaryPrefix(full: string, summary: string): string {
  if (!summary || full.length < summary.length + 80) return full;
  const head = full.slice(0, Math.min(full.length, summary.length + 120));
  if (!isNearDuplicate(head, summary)) return full;
  const tail = full.slice(summary.length).trim().replace(/^[\s.•\-–:;]+/, '');
  return tail.length >= 50 ? tail : full;
}

function mediumShortLastResort(article: Article, displaySummary: string, titleText: string): string | null {
  const m = article.bodyMedium?.trim();
  const s = article.bodyShort?.trim();
  let raw = '';
  if (m && s) {
    raw = m.length >= s.length ? `${m}\n\n${s}` : `${s}\n\n${m}`;
  } else {
    raw = (m ?? s ?? '').trim();
  }
  raw = stripFeedBoilerplate(raw);
  if (!raw || raw.length < 60 || isFeedBodyPlaceholder(raw)) return null;
  if (titleText && isTitleEcho(raw, titleText)) return null;
  const sum = displaySummary.trim();
  if (sum && (raw.length > sum.length + 40 || wordCount(raw) > wordCount(sum) + 5)) {
    const peeled = stripDuplicateSummaryPrefix(raw, sum);
    if (normalizeText(peeled) !== normalizeText(sum) && peeled.length >= 45) return peeled;
    if (raw.length > sum.length + 40) return raw;
  }
  if (sum && raw.length <= sum.length + 50 && isNearDuplicate(raw, sum)) return null;
  return stripDuplicateSummaryPrefix(raw, sum);
}

function pickFallbackBodyParagraph(article: Article, titleText: string, displaySummary: string): string {
  const chunks = [article.bodyMedium, article.bodyShort, article.excerpt]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((s) => stripFeedBoilerplate(s.trim()));
  for (const chunk of chunks) {
    if (isFeedBodyPlaceholder(chunk)) continue;
    if (isTeaserStyleLead(chunk)) continue;
    if (titleText && isTitleEcho(chunk, titleText)) continue;
    if (
      displaySummary &&
      isNearDuplicate(chunk, displaySummary) &&
      chunk.length < displaySummary.length + 55
    ) {
      continue;
    }
    return chunk;
  }
  return '';
}

type RelatedArticle = Pick<Article, 'id' | 'title' | 'slug' | 'excerpt' | 'publishedAt' | 'language'>;

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const uiLang = useUiLanguage();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState(false);
  const [moreInLang, setMoreInLang] = useState<RelatedArticle[]>([]);

  useEffect(() => {
    const onLangChange = (e: Event) => {
      const newLang = normalizeUiLanguage(
        (e as CustomEvent<{ lang?: string }>).detail?.lang ?? uiLang,
      );
      if (article && !articleMatchesLanguageOrScript(article.language, article.title, newLang)) {
        router.push(withUiLanguagePath('/', newLang));
      }
    };
    window.addEventListener('nr-lang-change', onLangChange);
    return () => window.removeEventListener('nr-lang-change', onLangChange);
  }, [article, router, uiLang]);

  useEffect(() => {
    if (!article?.id) {
      setMoreInLang([]);
      return;
    }
    let cancelled = false;
    const catQ = article.categoryId ? `&categoryId=${article.categoryId}` : '';
    void fetchJsonFromApi<{ data?: RelatedArticle[] } | RelatedArticle[]>(
      `/articles?status=PUBLISHED&limit=8&language=${uiLang}&omitBody=true${catQ}`,
    )
      .then((d) => {
        if (cancelled) return;
        const raw = Array.isArray(d) ? d : (d.data ?? []);
        setMoreInLang(
          raw.filter(
            (a) => a.id !== article.id && articleMatchesLanguageOrScript(a.language, a.title, uiLang),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setMoreInLang([]);
      });
    return () => {
      cancelled = true;
    };
  }, [article?.id, article?.categoryId, uiLang]);

  useEffect(() => {
    const bases = [
      process.env.NEXT_PUBLIC_API_URL,
      '/api/proxy',
      '/api/v1',
      'http://localhost:3001/api/v1',
      'http://localhost:3005/api/v1',
    ].filter((v): v is string => !!v);

    const fetchArticle = async () => {
      for (const base of bases) {
        try {
          const r = await fetch(`${base.replace(/\/$/, '')}/articles/${slug}`);
          if (!r.ok) continue;
          const data: Article = await r.json();
          if (data?.id) return data;
        } catch {
          // try next endpoint candidate
        }
      }
      throw new Error('Article fetch failed on all endpoints');
    };

    fetchArticle()
      .then((data: Article) => { setArticle(data); setLoading(false); })
      .catch(() => {
        const fallback = FALLBACK_ARTICLES[slug]
          ?? (slug.includes('fallback') ? buildGenericFallback(slug) : undefined);
        if (!fallback) {
          setError(true);
          setLoading(false);
          return;
        }
        setArticle({
          id: `fallback-${slug}`,
          title: fallback.title,
          slug,
          body: {
            type: 'doc',
            content: fallback.paragraphs.map((text) => ({
              type: 'paragraph',
              content: [{ type: 'text', text }],
            })),
          },
          excerpt: fallback.excerpt,
          seoTitle: fallback.title,
          seoDescription: fallback.excerpt,
          publishedAt: new Date().toISOString(),
          language: 'en',
          hashtags: ['preview', 'fallback'],
          categoryId: null,
          provenance: null,
          mediaAssets: [],
        });
        setLoading(false);
      });
  }, [slug]);

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
      {[...Array(6)].map((_, i) => <div key={i} className="animate-pulse bg-gray-200 rounded h-4" style={{ width: `${70 + (i % 3) * 10}%` }} />)}
    </div>
  );

  if (error || !article) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-2xl font-bold text-navy mb-2">Article not found</p>
      <p className="text-gray-500 mb-6">This article may have been removed or the link is incorrect.</p>
      <Link href="/" className="bg-brand text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-brand-dark transition-colors">
        Back to Home
      </Link>
    </div>
  );

  const structuredParas = extractParagraphs(article.body)
    .map((p) => stripSyndicationLinkbacks(stripFeedBoilerplate(p)))
    .filter((p) => p.length > 0 && !isFeedBodyPlaceholder(p));
  const bodyStructured =
    structuredParas.length > 0
      ? structuredParas
      : extractPlainParagraphsFromBody(article.body)
          .map((p) => stripSyndicationLinkbacks(stripFeedBoilerplate(p)))
          .filter((p) => p.length > 0 && !isFeedBodyPlaceholder(p));
  // Do not merge excerpt into body text — it duplicates the teaser and breaks dedupe/filter.
  const fallbackText = stripSyndicationLinkbacks(
    [article.bodyMedium, article.bodyShort]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join('\n\n'),
  );
  const fallbackParagraphs = fallbackText ? splitTextToParagraphs(fallbackText) : [];
  const combinedForDedupe = [...bodyStructured, ...fallbackParagraphs];
  const deduped = dedupeParagraphs(
    combinedForDedupe.map(stripFeedBoilerplate).filter(Boolean),
  ).filter((p) => !isFeedBodyPlaceholder(p));
  const excerptRaw = stripSyndicationLinkbacks(
    stripFeedBoilerplate(rssPlainLine(article.excerpt ?? '') || (article.excerpt ?? '').trim()),
  );
  const excerptText = isFeedBodyPlaceholder(excerptRaw) ? '' : excerptRaw;
  const titleText = stripWireHeadlinePrefix(
    stripSyndicationLinkbacks(rssPlainLine(article.title) || (article.title ?? '').trim()),
  );
  const summarySourceParas = [...bodyStructured, ...fallbackParagraphs]
    .map((p) => stripSyndicationLinkbacks(stripFeedBoilerplate(p)))
    .filter((p) => p.length > 0 && !isFeedBodyPlaceholder(p));
  const displaySummary = pickDisplaySummary(article, titleText, summarySourceParas, uiLang);
  const teaserFull = (displaySummary || excerptText).trim();
  const teaserForDedupe = teaserFull ? ledeSnippetForDedupe(teaserFull) : '';

  const filteredParagraphs = filterBodyParagraphs(deduped, teaserForDedupe, titleText);

  let paragraphs =
    filteredParagraphs.length > 0
      ? filteredParagraphs
      : stripLeadingTeaserEcho(deduped, teaserForDedupe, titleText);
  if (paragraphs.length === 0) {
    const tiered = tieredStoryParagraphs(article, titleText, teaserForDedupe);
    if (tiered.length > 0) paragraphs = tiered;
  }
  if (paragraphs.length === 0) {
    const raw = rawLongFormParagraphs(article, titleText, teaserForDedupe);
    if (raw.length > 0) paragraphs = raw;
  }

  paragraphs = filterBodyParagraphs(paragraphs, teaserForDedupe, titleText);

  const lastResortMedium = mediumShortLastResort(article, displaySummary, titleText);
  const lastResortFullDoc = fullPlainBodyLastResort(article, displaySummary, titleText);

  const fallbackBodyText =
    pickFallbackBodyParagraph(article, titleText, displaySummary) ||
    (excerptText && (!displaySummary || !isNearDuplicate(excerptText, displaySummary)) ? excerptText : '') ||
    '';

  const fallbackIsDuplicateOfSummary =
    !!displaySummary &&
    !!fallbackBodyText &&
    isNearDuplicate(fallbackBodyText, displaySummary) &&
    fallbackBodyText.trim().length < displaySummary.length + 80;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const showSummaryBlock = displaySummary.length >= MIN_SUMMARY_CHARS;
  const teaserForSeo = (displaySummary || excerptText).trim();
  const seoExtra = teaserForSeo ? seoBodyFallback(article, teaserForSeo) : null;

  const sourceImageUrl = getPreferredArticleImage(article) ?? null;
  const imageCredit = getBodyImageCredit(article.body);
  const videoAsset = article.mediaAssets?.find((m) => m.type === 'VIDEO');
  const proseText = (text: string) => safeArticleText(text);
  const renderProseBlocks = (text: string, keyPrefix: string) => {
    const parts = splitTextToParagraphs(proseText(text)).filter(Boolean);
    return parts.length > 0
      ? parts.map((p, i) => <p key={`${keyPrefix}-${i}`}>{p}</p>)
      : <p>{proseText(text)}</p>;
  };

  let bodyContent: ReactNode = null;
  if (paragraphs.length > 0) {
    bodyContent = paragraphs.map((p, i) => <p key={i}>{proseText(p)}</p>);
  } else if (lastResortMedium) {
    bodyContent = renderProseBlocks(lastResortMedium, 'lr-med');
  } else if (lastResortFullDoc) {
    bodyContent = renderProseBlocks(lastResortFullDoc, 'lr-doc');
  } else if (fallbackBodyText && !fallbackIsDuplicateOfSummary) {
    bodyContent = <p>{proseText(fallbackBodyText)}</p>;
  } else if (seoExtra) {
    bodyContent = <p className="text-gray-800 leading-relaxed not-italic">{proseText(seoExtra)}</p>;
  } else if (displaySummary || excerptText) {
    // Summary-only: teaser is in the summary block.
    bodyContent = null;
  } else {
    bodyContent = null;
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Article header band */}
      <div className="bg-navy text-white py-3 px-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-blue-200">
          <Link href="/" className="hover:text-white flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Home</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-white">{titleText}</span>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Schema.org */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'NewsArticle',
          headline: titleText,
          description: showSummaryBlock ? displaySummary : (article.bodyShort ?? article.seoDescription ?? titleText),
          datePublished: article.publishedAt,
          publisher: { '@type': 'Organization', name: 'Nation Reporters', url: 'https://nationreporters.com' },
        }) }} />

        {/* Article card */}
        <article className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Hero image */}
          <div className="relative overflow-hidden">
            <div className="h-64 md:h-80 relative">
              <Image
                src={getArticleImage(article.slug, undefined, 'hero', sourceImageUrl)}
                alt={titleText} fill className="object-cover" unoptimized priority />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-4">
                <span className="bg-brand text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                  Nation Reporters
                </span>
              </div>
            </div>
            {sourceImageUrl && imageCredit && (
              <p className="text-[10px] text-gray-400 px-3 py-1 bg-gray-50 text-right italic">
                📷 {imageCredit}
              </p>
            )}
          </div>

          <div className="p-6">

            <h1 className="text-2xl md:text-3xl font-bold font-serif text-navy leading-snug mb-3">
              {titleText}
            </h1>

            {showSummaryBlock && (
              <div className="mb-4 border-l-4 border-brand pl-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand mb-1">Summary</p>
                <p className="text-gray-600 text-base leading-relaxed italic">{proseText(displaySummary)}</p>
              </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                {article.publishedAt
                  ? new Date(article.publishedAt).toLocaleDateString('en-IN', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : 'Nation Reporters'}
              </div>
              {/* Share buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Share2 className="h-3 w-3" /> Share:</span>
                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="bg-[#1877F2] text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 hover:opacity-90">
                  <Facebook className="h-3 w-3" /> FB
                </a>
                <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(titleText)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="bg-[#1DA1F2] text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 hover:opacity-90">
                  <Twitter className="h-3 w-3" /> X
                </a>
              </div>
            </div>

            {/* Article body: omit when this item is summary-only (no wire story body in API). */}
            {(videoAsset || bodyContent) && (
              <div className="prose prose-base max-w-none text-gray-800 leading-relaxed space-y-4">
                {videoAsset && (
                  <div className="not-prose mb-4">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden">
                      <video controls preload="metadata" className="w-full h-full object-cover" src={videoAsset.url} />
                    </div>
                  </div>
                )}
                {bodyContent}
              </div>
            )}

            {/* Hashtags */}
            {article.hashtags?.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {article.hashtags.map((tag) => (
                  <span key={tag} className="bg-navy/10 text-navy text-xs px-2.5 py-1 rounded-full font-medium">#{tag}</span>
                ))}
              </div>
            )}

            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-900 border border-blue-200">
              Image notice: {sourceImageUrl
                ? 'Article image is shown when available for this story.'
                : 'A representative image is used when no story image is available.'}
            </div>

            <div className="mt-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-900 border border-amber-200">
              Legal notice: This article may include AI-assisted summarization/translation from third-party reports.
              Nation Reporters does not claim ownership of third-party source reporting, logos, or images.
              For copyright/takedown requests, contact legal@nationreporters.com.
            </div>
          </div>
        </article>

        {moreInLang.length > 0 && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-black text-navy uppercase tracking-widest border-b-2 border-brand pb-2 mb-4">
              More in {uiLang.toUpperCase()}
            </h2>
            <ul className="space-y-3">
              {moreInLang.map((a) => (
                <li key={a.id}>
                  <Link
                    href={withUiLanguagePath(`/article/${a.slug}`, uiLang)}
                    className="block group"
                  >
                    <p className="font-semibold text-gray-800 group-hover:text-brand line-clamp-2">
                      {safeArticleText(a.title)}
                    </p>
                    {a.excerpt && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {formatListingExcerpt(a.excerpt, a.title, uiLang)}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Back to home */}
        <div className="mt-6 flex gap-3">
          <Link
            href={withUiLanguagePath('/', uiLang)}
            className="flex items-center gap-2 text-sm text-navy font-semibold hover:text-brand transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
