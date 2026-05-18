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

function matchesLang(article: FeedArticle, lang: string): boolean {
  return articleMatchesLanguageOrScript(article.language, article.title, lang);
}

function sortRegionalFirst(list: FeedArticle[], lang: string): FeedArticle[] {
  const target = normalizeUiLanguage(lang);
  return [...list].sort((a, b) => {
    const aExact = normalizeUiLanguage(a.language) === target ? 0 : 1;
    const bExact = normalizeUiLanguage(b.language) === target ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bt - at;
  });
}

/**
 * Load published articles for the UI language.
 * Regional stories first; English fills gaps when inventory is thin.
 */
export async function fetchArticlesForUiLanguage(
  langInput: string,
  _options: { strictLanguageOnly?: boolean } = {},
): Promise<{ articles: FeedArticle[]; notice: string | null }> {
  const lang = normalizeUiLanguage(langInput);

  try {
    const primary = sortRegionalFirst(
      parseList(
        await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
          `/articles?status=PUBLISHED&limit=150&language=${lang}&omitBody=true`,
        ),
      ).filter((a) => matchesLang(a, lang)),
      lang,
    );

    if (primary.length >= 12) {
      return { articles: primary, notice: null };
    }

    if (primary.length > 0 && lang !== 'en') {
      const en = parseList(
        await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
          '/articles?status=PUBLISHED&limit=150&language=en&omitBody=true',
        ),
      ).filter((a) => matchesLang(a, 'en'));
      return {
        articles: mergeUnique(primary, en).slice(0, 150),
        notice: `Showing ${primary.length} in ${lang.toUpperCase()} plus English until more ${lang.toUpperCase()} feeds are ingested.`,
      };
    }

    if (primary.length === 0 && lang !== 'en') {
      const enOnly = parseList(
        await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
          '/articles?status=PUBLISHED&limit=150&language=en&omitBody=true',
        ),
      ).filter((a) => matchesLang(a, 'en'));
      if (enOnly.length > 0) {
        return {
          articles: enOnly,
          notice: `No ${lang.toUpperCase()} stories found yet. Showing English until regional feeds catch up.`,
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
        '/articles?status=PUBLISHED&limit=200&omitBody=true',
      ),
    );
    const matched = sortRegionalFirst(pool.filter((a) => matchesLang(a, lang)), lang);
    if (matched.length > 0) {
      return { articles: matched.slice(0, 150), notice: null };
    }
  } catch {
    /* ignore */
  }

  return {
    articles: [],
    notice:
      lang === 'en'
        ? 'No published stories available. Run ingestion from Admin → Sources.'
        : `No ${lang.toUpperCase()} stories found. Run ingestion or try another language.`,
  };
}

async function fetchLanguagePool(lang: string, categoryId?: string): Promise<FeedArticle[]> {
  const catQ = categoryId ? `&categoryId=${categoryId}` : '';
  return sortRegionalFirst(
    parseList(
      await fetchJsonFromApi<{ data?: FeedArticle[] } | FeedArticle[]>(
        `/articles?status=PUBLISHED&limit=150&language=${lang}&omitBody=true${catQ}`,
      ),
    ).filter((a) => matchesLang(a, lang)),
    lang,
  );
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
  const min = 12;

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
