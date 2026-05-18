'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Clock, ChevronRight } from 'lucide-react';
import { getArticleImage, getPreferredArticleImage } from '@/lib/news-image';
import { fetchJsonFromApi } from '@/lib/api-client';
import { fetchCategoryArticlesForUiLanguage } from '@/lib/fetch-articles-for-lang';
import { safeArticleText } from '@/lib/rss-plain-text';
import { withUiLanguagePath } from '@/lib/ui-language';
import { useUiLanguage } from '@/lib/use-ui-language';

interface Article {
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

interface Category {
  id: string;
  name: string;
  slug: string;
}

function ensureCategoryVolume(_slug: string, list: Article[], min = 20): Article[] {
  return list.slice(0, min);
}

const SLUG_LABELS: Record<string, string> = {
  india: 'India', world: 'World', politics: 'Politics',
  business: 'Business', sports: 'Sports', entertainment: 'Entertainment',
  tech: 'Technology',
};

const SLUG_COLORS: Record<string, string> = {
  india: 'bg-orange-600', world: 'bg-blue-600', politics: 'bg-purple-600',
  business: 'bg-green-600', sports: 'bg-yellow-600', entertainment: 'bg-pink-600',
  tech: 'bg-cyan-600',
};

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataNotice, setDataNotice] = useState<string | null>(null);
  const uiLang = useUiLanguage();
  const label = SLUG_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
  const accent = SLUG_COLORS[slug] ?? 'bg-brand';

  const loadArticles = useCallback(async () => {
    const lang = uiLang;
    if (typeof window !== 'undefined') {
      localStorage.setItem('nr-lang', lang);
    }
    setLoading(true);
    const cacheKey = `nr-category-cache-${slug}-${lang}`;

    try {
      const cats = await fetchJsonFromApi<Category[]>('/categories');
      const cat = Array.isArray(cats)
        ? cats.find((c) => c.slug === slug || c.name.toLowerCase() === slug.toLowerCase())
        : undefined;
      const worldCat = Array.isArray(cats) ? cats.find((c) => c.slug === 'world') : undefined;

      const { articles: fetched, notice } = await fetchCategoryArticlesForUiLanguage(lang, {
        categoryId: cat?.id,
        sectionLabel: label,
        excludeCategoryId: slug === 'india' ? worldCat?.id : undefined,
      });

      const list = fetched as Article[];
      if (list.length > 0 && typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify(list.slice(0, 120)));
      }
      setDataNotice(notice);
      setArticles(ensureCategoryVolume(slug, list));
    } catch {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as Article[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setDataNotice('Live feed temporarily unavailable; showing last successful update.');
              setArticles(ensureCategoryVolume(slug, parsed));
              setLoading(false);
              return;
            }
          } catch { /* ignore */ }
        }
      }
      setDataNotice(`Could not load ${label}. Check that the API is running.`);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [slug, label, uiLang]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  const [hero, ...rest] = articles;

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className={`${accent} text-white py-4 px-4`}>
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <nav className="text-sm text-white/70 flex items-center gap-1">
            <Link href="/" className="hover:text-white">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white font-bold">{label}</span>
          </nav>
        </div>
        <div className="max-w-7xl mx-auto mt-1">
          <h1 className="text-2xl font-black tracking-tight">{label}</h1>
          <p className="text-white/70 text-sm">
            Latest news from {label}
            {uiLang !== 'en' ? ` · ${uiLang.toUpperCase()}` : ''}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {dataNotice && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {dataNotice}
          </div>
        )}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 animate-pulse bg-gray-200 rounded-xl h-72" />
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-24" />)}</div>
          </div>
        )}
        {!loading && articles.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-semibold">No articles in {label} yet.</p>
            <p className="text-sm mt-1">Check back soon.</p>
          </div>
        )}
        {!loading && articles.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {hero && (
                <Link href={`/article/${hero.slug}`}
                  className="group block rounded-xl overflow-hidden relative h-72">
                  <Image src={getArticleImage(hero.slug, slug, 'hero', getPreferredArticleImage(hero))} alt={safeArticleText(hero.title, 'Article')}
                    fill className="object-cover" unoptimized />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <span className={`inline-block ${accent} text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2`}>
                      {label}
                    </span>
                    <h2 className="text-white font-serif font-bold text-xl leading-snug group-hover:text-signal transition-colors line-clamp-3">
                      {safeArticleText(hero.title)}
                    </h2>
                    {hero.excerpt && (
                      <p className="text-blue-200 text-sm mt-1 line-clamp-2">{safeArticleText(hero.excerpt)}</p>
                    )}
                    {hero.publishedAt && (
                      <p className="text-blue-300/70 text-xs mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />{timeAgo(hero.publishedAt)}
                      </p>
                    )}
                  </div>
                </Link>
              )}
              <div className="space-y-3">
                {rest.map((a) => (
                  <Link key={a.id} href={`/article/${a.slug}`}
                    className="group flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all">
                    <div className="h-20 w-20 rounded-lg overflow-hidden shrink-0 relative">
                      <Image src={getArticleImage(a.slug, slug, 'thumb', getPreferredArticleImage(a))} alt={safeArticleText(a.title, 'Article')}
                        fill className="object-cover" unoptimized />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 group-hover:text-brand leading-snug line-clamp-2">{safeArticleText(a.title)}</h3>
                      {a.publishedAt && (
                        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                          <Clock className="h-3 w-3" />{timeAgo(a.publishedAt)}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-black text-navy uppercase tracking-widest border-b-2 border-brand pb-2">Other Sections</h3>
              {Object.entries(SLUG_LABELS).filter(([s]) => s !== slug).map(([s, l]) => (
                <Link key={s} href={withUiLanguagePath(`/category/${s}`, uiLang)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white ${SLUG_COLORS[s]} hover:opacity-90 transition-opacity`}>
                  <ChevronRight className="h-3.5 w-3.5" />{l}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
