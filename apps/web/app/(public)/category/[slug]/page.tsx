'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Clock, ChevronRight } from 'lucide-react';
import { getArticleImage, getPreferredArticleImage } from '@/lib/news-image';

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
  const label = SLUG_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
  const accent = SLUG_COLORS[slug] ?? 'bg-brand';

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const lang = typeof window !== 'undefined' ? (localStorage.getItem('nr-lang') ?? 'en') : 'en';
    const cacheKey = `nr-category-cache-${slug}-${lang}`;
    const fillFromLatestLive = async (baseList: Article[], min = 20, targetLang?: string) => {
      if (baseList.length >= min) return baseList.slice(0, min);
      try {
        const latest = await fetch(`${base}/articles?status=PUBLISHED&limit=120`);
        if (!latest.ok) return baseList;
        const latestData: { data?: Article[] } = await latest.json();
        const latestList = (latestData.data ?? []).filter((a) => {
          if (!targetLang) return true;
          return (a.language ?? 'en').toLowerCase() === targetLang.toLowerCase();
        });
        const seen = new Set(baseList.map((a) => a.id));
        const extras = latestList.filter((a) => !seen.has(a.id));
        return [...baseList, ...extras].slice(0, min);
      } catch {
        return baseList;
      }
    };
    const loadLatestFallback = async () => {
      try {
        const latest = await fetch(`${base}/articles?status=PUBLISHED&limit=30`);
        if (!latest.ok) throw new Error(`Latest fetch failed: ${latest.status}`);
        const latestData: { data?: Article[] } = await latest.json();
        const latestList = latestData.data ?? [];
        const liveFilled = await fillFromLatestLive(latestList, 20, lang);
        if (liveFilled.length > 0 && typeof window !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify(liveFilled.slice(0, 120)));
        }
        setArticles(ensureCategoryVolume(slug, liveFilled));
      } catch {
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as Article[];
              if (Array.isArray(parsed) && parsed.length > 0) {
                setDataNotice('Live feed temporarily unavailable; showing last successful update.');
                setArticles(parsed.slice(0, 20));
              } else {
                setArticles([]);
              }
            } catch {
              setArticles([]);
            }
          } else {
            setArticles([]);
          }
        } else {
          setArticles([]);
        }
      } finally {
        setLoading(false);
      }
    };

    // Category pages follow selected UI language (including India).
    fetch(`${base}/categories`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Categories fetch failed: ${r.status}`);
        return r.json();
      })
      .then(async (cats: Category[]) => {
        if (!Array.isArray(cats) || cats.length === 0) {
          await loadLatestFallback();
          return;
        }
        const cat = cats.find((c) => c.slug === slug || c.name.toLowerCase() === slug.toLowerCase());
        const worldCat = cats.find((c) => c.slug === 'world');

        const buildUrl = (withLang: boolean) => {
          let url = `${base}/articles?status=PUBLISHED&limit=120`;
          if (cat) url += `&categoryId=${cat.id}`;
          if (withLang) url += `&language=${lang}`;
          return url;
        };

        const res = await fetch(buildUrl(true));
        if (!res.ok) throw new Error(`Category articles fetch failed: ${res.status}`);
        const data: { data?: Article[] } = await res.json();
        let articles = data.data ?? [];

        if (lang !== 'en') {
          articles = articles.filter((a) => (a.language ?? 'en').toLowerCase() === lang.toLowerCase());
        }

        // India section: exclude World-categorised articles
        if (slug === 'india' && worldCat) {
          articles = articles.filter((a) => a.categoryId !== worldCat.id);
        }

        // If language/category is sparse, fill from latest live pool first
        articles = await fillFromLatestLive(articles, 20, lang);

        // Final fallback for empty sections: show latest published mixed feed
        if (articles.length === 0) {
          const latest = await fetch(`${base}/articles?status=PUBLISHED&limit=30`);
          const latestData: { data?: Article[] } = await latest.json();
          const latestList = latestData.data ?? [];
          const preferred = latestList.filter((a) => (a.language ?? 'en').toLowerCase() === lang.toLowerCase());
          if (preferred.length >= 20) {
            articles = preferred;
          } else {
            articles = preferred;
            if (articles.length > 0 && lang !== 'en') {
              setDataNotice(
                `Showing ${articles.length} stor${articles.length === 1 ? 'y' : 'ies'} in ${lang.toUpperCase()}. ` +
                'We do not mix English into this category view.',
              );
            }
          }
        }

        if (articles.length > 0) {
          setDataNotice((prev) => prev ?? null);
          if (typeof window !== 'undefined') {
            localStorage.setItem(cacheKey, JSON.stringify(articles.slice(0, 120)));
          }
        } else if (lang !== 'en') {
          setDataNotice(
            `No ${lang.toUpperCase()} stories available in ${label} right now. ` +
            'Change language from the top bar or run ingestion to populate this feed.',
          );
        } else {
          setDataNotice(`No English stories available in ${label} right now.`);
        }
        setArticles(ensureCategoryVolume(slug, articles));
        setLoading(false);
      })
      .catch(() => { void loadLatestFallback(); });
  }, [slug]);

  const [hero, ...rest] = articles;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Category header band */}
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
          <p className="text-white/70 text-sm">Latest news from {label}</p>
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
            <p className="text-sm mt-1">Check back soon — the AI pipeline updates 3× daily.</p>
          </div>
        )}

        {!loading && articles.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column */}
            <div className="lg:col-span-2 space-y-5">
              {/* Hero */}
              {hero && (
                <Link href={`/article/${hero.slug}`}
                  className="group block rounded-xl overflow-hidden relative h-72">
                  <Image src={getArticleImage(hero.slug, slug, 'hero', getPreferredArticleImage(hero))} alt={hero.title}
                    fill className="object-cover" unoptimized />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <span className={`inline-block ${accent} text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2`}>
                      {label}
                    </span>
                    <h2 className="text-white font-serif font-bold text-xl leading-snug group-hover:text-signal transition-colors line-clamp-3">
                      {hero.title}
                    </h2>
                    {hero.excerpt && <p className="text-blue-200 text-sm mt-1 line-clamp-2">{hero.excerpt}</p>}
                    {hero.publishedAt && (
                      <p className="text-blue-300/70 text-xs mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />{timeAgo(hero.publishedAt)}
                      </p>
                    )}
                  </div>
                </Link>
              )}
              {/* Article list */}
              <div className="space-y-3">
                {rest.map((a) => (
                  <Link key={a.id} href={`/article/${a.slug}`}
                    className="group flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all news-card">
                    <div className="h-20 w-20 rounded-lg overflow-hidden shrink-0 relative">
                      <Image src={getArticleImage(a.slug, slug, 'thumb', getPreferredArticleImage(a))} alt={a.title}
                        fill className="object-cover" unoptimized />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 group-hover:text-brand leading-snug line-clamp-2">{a.title}</h3>
                      {a.excerpt && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.excerpt}</p>}
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

            {/* Sidebar */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-navy uppercase tracking-widest border-b-2 border-brand pb-2">Other Sections</h3>
              {Object.entries(SLUG_LABELS).filter(([s]) => s !== slug).map(([s, l]) => (
                <Link key={s} href={`/category/${s}`}
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
