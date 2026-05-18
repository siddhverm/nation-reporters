import { fetchJsonFromApi } from '@/lib/api-client';
import {
  articleMatchesLanguage,
  hasExplicitLanguageChoice,
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

function parseList(d: { data?: FeedArticle[] } | FeedArticle[]): FeedArticle[] {
  const raw = Array.isArray(d) ? d : (d.data ?? []);
  return raw.filter((a): a is FeedArticle => Boolean(a?.id && a?.slug));
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

/**
 * Load published articles for the UI language with sensible fallbacks so the homepage
 * never looks empty when only English inventory exists for a regional picker.
 */
export async function fetchArticlesForUiLanguage(
  langInput: string,
  options: { strictLanguageOnly?: boolean } = {},
): Promise<{ articles: FeedArticle[]; notice: string | null }> {
  const lang = normalizeUiLanguage(langInput);
  const strict =
    options.strictLanguageOnly ??
    (typeof window !== 'undefined' && hasExplicitLanguageChoice() && lang !== 'en');

  try {
    const primary = parseList(
      await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
        `/articles?status=PUBLISHED&limit=150&language=${lang}&omitBody=true`,
      ),
    ).filter((a) => articleMatchesLanguage(a.language, lang));

    if (primary.length >= 12) {
      return { articles: primary, notice: null };
    }

    if (strict && primary.length > 0) {
      return { articles: primary, notice: null };
    }

    if (primary.length > 0 && lang !== 'en') {
      const en = parseList(
        await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
          '/articles?status=PUBLISHED&limit=150&language=en&omitBody=true',
        ),
      ).filter((a) => articleMatchesLanguage(a.language, 'en'));
      return {
        articles: mergeUnique(primary, en).slice(0, 150),
        notice: `Showing ${primary.length} in ${lang.toUpperCase()} plus English stories until more ${lang.toUpperCase()} feeds are ingested.`,
      };
    }

    if (primary.length === 0 && lang !== 'en') {
      const enOnly = parseList(
        await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
          '/articles?status=PUBLISHED&limit=150&language=en&omitBody=true',
        ),
      ).filter((a) => articleMatchesLanguage(a.language, 'en'));
      if (enOnly.length > 0) {
        return {
          articles: enOnly,
          notice: `No stories in ${lang.toUpperCase()} yet. Showing English until ingestion fills this language.`,
        };
      }
    }

    if (primary.length > 0) {
      return { articles: primary, notice: null };
    }
  } catch {
    /* try unfiltered pool */
  }

  try {
    const pool = parseList(
      await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
        '/articles?status=PUBLISHED&limit=150&omitBody=true',
      ),
    );
    const matched = pool.filter((a) => articleMatchesLanguage(a.language, lang));
    if (matched.length > 0) {
      return { articles: matched, notice: null };
    }
  } catch {
    /* ignore */
  }

  return {
    articles: [],
    notice:
      lang === 'en'
        ? 'No published stories available. Run ingestion from Admin → Sources.'
        : `No published stories in ${lang.toUpperCase()}. Run ingestion or switch language.`,
  };
}

async function fetchLanguagePool(
  lang: string,
  categoryId?: string,
): Promise<FeedArticle[]> {
  const catQ = categoryId ? `&categoryId=${categoryId}` : '';
  return parseList(
    await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
      `/articles?status=PUBLISHED&limit=150&language=${lang}&omitBody=true${catQ}`,
    ),
  ).filter((a) => articleMatchesLanguage(a.language, lang));
}

/**
 * Category/section pages: keep the selected UI language; top up from same-language
 * national pool, then mix English — never jump to English-only while regional stories exist.
 */
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
  const min = 12;
  const strict =
    options.strictLanguageOnly ??
    (typeof window !== 'undefined' && hasExplicitLanguageChoice() && lang !== 'en');

  const applyExclusions = (list: FeedArticle[]) => {
    if (!options.excludeCategoryId) return list;
    return list.filter((a) => a.categoryId !== options.excludeCategoryId);
  };

  try {
    let primary = applyExclusions(await fetchLanguagePool(lang, options.categoryId));

    if (primary.length < min && options.categoryId) {
      const broad = applyExclusions(await fetchLanguagePool(lang));
      primary = mergeUnique(primary, broad);
      if (primary.length >= min) {
        return {
          articles: primary.slice(0, 150),
          notice: `Showing ${lang.toUpperCase()} stories from across sections while ${label} fills up.`,
        };
      }
    }

    if (primary.length >= min) {
      return { articles: primary.slice(0, 150), notice: null };
    }

    if (strict && primary.length > 0) {
      return {
        articles: primary.slice(0, 150),
        notice: `Showing ${primary.length} ${lang.toUpperCase()} stories in ${label}.`,
      };
    }

    if (primary.length > 0 && lang !== 'en') {
      const enInSection = applyExclusions(await fetchLanguagePool('en', options.categoryId));
      return {
        articles: mergeUnique(primary, enInSection).slice(0, 150),
        notice: `Showing ${primary.length} in ${lang.toUpperCase()} plus English in ${label}.`,
      };
    }

    if (primary.length === 0 && lang !== 'en') {
      const enInSection = applyExclusions(await fetchLanguagePool('en', options.categoryId));
      const enBroad = applyExclusions(await fetchLanguagePool('en'));
      const enMerged = mergeUnique(enInSection, enBroad);
      if (enMerged.length > 0) {
        return {
          articles: enMerged.slice(0, 150),
          notice: `No ${lang.toUpperCase()} stories in ${label} yet. Showing English until more are ingested.`,
        };
      }
    }

    if (primary.length > 0) {
      return { articles: primary, notice: null };
    }
  } catch {
    /* fall through */
  }

  return {
    articles: [],
    notice: `No stories in ${lang.toUpperCase()} for ${label}. Try another section or language.`,
  };
}
