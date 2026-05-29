import { fetchJsonFromApi } from '@/lib/api-client';
import {
  articleMatchesLanguageOrScript,
  normalizeUiLanguage,
} from '@/lib/ui-language';

export interface FeedArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  categoryId: string | null;
  language?: string;
  body?: Record<string, unknown>;
  mediaAssets?: { type?: string; url?: string | null }[];
}

function usableSlug(slug: string | null | undefined, id: string): string {
  const s = (slug ?? '').trim();
  if (s.length >= 2 && /[a-z0-9]/i.test(s)) return s;
  return `article-${id.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'story'}`;
}

function parseList(d: { data?: FeedArticle[] } | FeedArticle[]): FeedArticle[] {
  const raw = Array.isArray(d) ? d : (d.data ?? []);
  return raw
    .filter((a) => Boolean(a?.id))
    .map((a) => ({ ...a, slug: usableSlug(a.slug, a.id) })) as FeedArticle[];
}

function mergeUnique(primary: FeedArticle[], extra: FeedArticle[]): FeedArticle[] {
  const seen = new Set(primary.map((a) => a.id));
  const out = [...primary];
  for (const a of extra) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/** Same API path Hindi / Marathi / English use — trust server language + script matching. */
async function fetchPublishedByLanguage(lang: string): Promise<FeedArticle[]> {
  return parseList(
    await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
      `/articles?status=PUBLISHED&limit=150&language=${lang}&omitBody=true`,
    ),
  );
}

/**
 * Load published articles for the UI language (same flow as Hindi/Marathi/English).
 */
export async function fetchArticlesForUiLanguage(
  langInput: string,
  _options: { strictLanguageOnly?: boolean } = {},
): Promise<{ articles: FeedArticle[]; notice: string | null }> {
  const lang = normalizeUiLanguage(langInput);

  try {
    const primary = await fetchPublishedByLanguage(lang);
    if (primary.length > 0) {
      return { articles: primary, notice: null };
    }

    if (lang !== 'en') {
      // Try script-matching from full pool before giving up
      const pool = parseList(
        await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
          '/articles?status=PUBLISHED&limit=200&omitBody=true',
        ),
      );
      const scriptMatched = pool.filter((a) =>
        articleMatchesLanguageOrScript(a.language, a.title, lang),
      );
      if (scriptMatched.length > 0) {
        return { articles: scriptMatched.slice(0, 150), notice: null };
      }
      return {
        articles: [],
        notice: `No ${lang.toUpperCase()} stories yet. Regional ingestion is running — check back soon.`,
      };
    }

    return {
      articles: [],
      notice: 'No published stories available. Run ingestion from Admin → Sources.',
    };
  } catch {
    return {
      articles: [],
      notice: 'Live feed temporarily unavailable. Check that the API is running.',
    };
  }
}

export async function fetchCategoryArticlesForUiLanguage(
  langInput: string,
  options: {
    categoryId?: string;
    sectionLabel?: string;
    excludeCategoryId?: string;
    strictLanguageOnly?: boolean;
  } = {},
): Promise<{ articles: FeedArticle[]; notice: string | null }> {
  const lang = normalizeUiLanguage(langInput);
  const label = options.sectionLabel ?? 'this section';
  const catQ = options.categoryId ? `&categoryId=${options.categoryId}` : '';

  const applyExclusions = (list: FeedArticle[]) => {
    if (!options.excludeCategoryId) return list;
    return list.filter((a) => a.categoryId !== options.excludeCategoryId);
  };

  const fetchForLang = async (code: string) =>
    applyExclusions(
      parseList(
        await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
          `/articles?status=PUBLISHED&limit=150&language=${code}&omitBody=true${catQ}`,
        ),
      ),
    );

  try {
    let primary = await fetchForLang(lang);

    if (primary.length >= 12) {
      return { articles: primary.slice(0, 150), notice: null };
    }

    // For non-English: show whatever articles exist without mixing in English.
    // Mixing English into a Hindi/regional feed confuses the language selection.
    if (lang !== 'en') {
      if (primary.length > 0) {
        return {
          articles: primary.slice(0, 150),
          notice: `Showing ${primary.length} ${lang.toUpperCase()} stor${primary.length === 1 ? 'y' : 'ies'} in ${label}. More regional content coming soon.`,
        };
      }
      return {
        articles: [],
        notice: `No ${lang.toUpperCase()} stories in ${label} yet. Check back soon or switch to English for full coverage.`,
      };
    }

    if (primary.length > 0) {
      return { articles: primary, notice: null };
    }
  } catch {
    /* fall through */
  }

  return {
    articles: [],
    notice: `No stories in ${lang.toUpperCase()} for ${label}.`,
  };
}

/** Clear stale per-language caches when the reader switches language. */
export function clearLanguageFeedCaches(lang?: string): void {
  if (typeof window === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('nr-home-cache-') || k.startsWith('nr-category-cache-')) {
      if (!lang || k.endsWith(`-${lang}`)) keys.push(k);
    }
  }
  for (const k of keys) localStorage.removeItem(k);
}
