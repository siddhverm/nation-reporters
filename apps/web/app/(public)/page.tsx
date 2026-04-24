'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, ChevronRight, Flame, Globe } from 'lucide-react';
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

interface Category { id: string; name: string; slug: string; }

function withFallbackArticles(list: Article[], min = 12): Article[] {
  return list.slice(0, min);
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 2) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const CAT_META: Record<string, { label: string; color: string; border: string }> = {
  india:         { label: 'India',         color: 'bg-orange-600', border: 'border-orange-500' },
  world:         { label: 'World',         color: 'bg-blue-600',   border: 'border-blue-500' },
  politics:      { label: 'Politics',      color: 'bg-purple-600', border: 'border-purple-500' },
  business:      { label: 'Business',      color: 'bg-green-600',  border: 'border-green-500' },
  sports:        { label: 'Sports',        color: 'bg-yellow-500', border: 'border-yellow-400' },
  entertainment: { label: 'Entertainment', color: 'bg-pink-600',   border: 'border-pink-500' },
  tech:          { label: 'Technology',    color: 'bg-cyan-600',   border: 'border-cyan-500' },
};
const SECTIONS = ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'tech'];
const MIN_SECTION = 20;

function fillSectionFromLivePool(primary: Article[], all: Article[], min = MIN_SECTION): Article[] {
  if (primary.length >= min) return primary.slice(0, min);
  const seen = new Set(primary.map((a) => a.id));
  const extras = all.filter((a) => !seen.has(a.id));
  return [...primary, ...extras].slice(0, min);
}

function fillSectionWithFallback(_slug: string, list: Article[], min = MIN_SECTION): Article[] {
  return list.slice(0, min);
}

function ArticleCard({ a }: { a: Article }) {
  return (
    <Link href={`/article/${a.slug}`}
      className="group flex gap-3 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all p-3">
      <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 relative">
        <Image src={getArticleImage(a.slug, undefined, 'thumb', getPreferredArticleImage(a))}
          alt={a.title} fill className="object-cover" unoptimized />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-xs text-gray-800 group-hover:text-brand leading-snug line-clamp-2">{a.title}</h3>
        {a.publishedAt && (
          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />{timeAgo(a.publishedAt)}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataNotice, setDataNotice] = useState<string | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const lang = typeof window !== 'undefined' ? (localStorage.getItem('nr-lang') ?? 'en') : 'en';
    const cacheKey = `nr-home-cache-${lang}`;

    const fetchArticles = async (): Promise<Article[]> => {
      try {
        const r = await fetch(`${base}/articles?status=PUBLISHED&limit=200&language=${lang}`);
        if (!r.ok) throw new Error(`Primary fetch failed: ${r.status}`);
        const d = await r.json();
        const raw: Article[] = Array.isArray(d) ? d : (d.data ?? []);
        const list = lang === 'en'
          ? raw
          : raw.filter((a) => (a.language ?? 'en').toLowerCase() === lang.toLowerCase());
        if (list.length >= 20) {
          setDataNotice(null);
          return withFallbackArticles(list);
        }
      } catch { /* fall through */ }

      // Fallback: use latest pool; prefer selected language, then top up with English.
      try {
        const r = await fetch(`${base}/articles?status=PUBLISHED&limit=200`);
        if (!r.ok) throw new Error(`Fallback fetch failed: ${r.status}`);
        const d = await r.json();
        const raw: Article[] = Array.isArray(d) ? d : (d.data ?? []);
        const preferred = lang === 'en'
          ? raw
          : raw.filter((a) => (a.language ?? 'en').toLowerCase() === lang.toLowerCase());
        if (preferred.length >= 20 || lang === 'en') {
          setDataNotice(null);
          return withFallbackArticles(preferred);
        }
        const seen = new Set(preferred.map((a) => a.id));
        const english = raw.filter((a) => (a.language ?? 'en').toLowerCase() === 'en' && !seen.has(a.id));
        const mixed = [...preferred, ...english];
        if (mixed.length > 0) {
          setDataNotice(`Limited ${lang.toUpperCase()} inventory; topping up with English.`);
          return withFallbackArticles(mixed);
        }
      } catch { /* continue to cache */ }

      // Outage fallback: serve last successful real payload from local cache.
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as Article[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setDataNotice('Live feed temporarily unavailable; showing last successful update.');
              return withFallbackArticles(parsed);
            }
          } catch { /* ignore cache parse errors */ }
        }
      }
      return [];
    };

    Promise.all([
      fetchArticles(),
      fetch(`${base}/categories`).then((r) => r.json()).catch(() => []),
    ]).then(([arts, cats]) => {
      const list = Array.isArray(arts) ? arts : [];
      setArticles(list);
      setCategories(Array.isArray(cats) ? cats : []);
      if (typeof window !== 'undefined' && list.length > 0) {
        localStorage.setItem(cacheKey, JSON.stringify(list.slice(0, 120)));
      }
      setLoading(false);
    });
  }, []);

  // Build per-category buckets — only show articles that actually belong to each category
  const catIdToSlug = new Map(categories.map((c) => [c.id, c.slug]));

  const sections = new Map<string, Article[]>();
  for (const slug of SECTIONS) {
    const mapped = articles.filter((a) => catIdToSlug.get(a.categoryId ?? '') === slug);
    const liveFilled = fillSectionFromLivePool(mapped, articles, MIN_SECTION);
    sections.set(slug, fillSectionWithFallback(slug, liveFilled, MIN_SECTION));
  }

  const breaking = articles.slice(0, 8);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breaking ticker */}
      {!loading && breaking.length > 0 && (
        <div className="bg-navy text-white py-2 px-4 overflow-hidden">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <span className="bg-signal text-white text-[10px] font-black uppercase px-2 py-0.5 rounded shrink-0 flex items-center gap-1">
              <Flame className="h-3 w-3" /> Breaking
            </span>
            <div className="overflow-hidden flex-1">
              <div className="flex gap-8 animate-[ticker_30s_linear_infinite] whitespace-nowrap">
                {[...breaking, ...breaking].map((a, i) => (
                  <Link key={`${a.id}-${i}`} href={`/article/${a.slug}`}
                    className="text-sm text-blue-100 hover:text-white transition-colors shrink-0">
                    {a.title}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {dataNotice && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {dataNotice}
          </div>
        )}

        {/* Category pills */}
        <div className="flex gap-2 flex-wrap mb-6">
          {SECTIONS.map((s) => (
            <Link key={s} href={`/category/${s}`}
              className={`${CAT_META[s].color} text-white text-xs font-bold px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity`}>
              {CAT_META[s].label}
            </Link>
          ))}
          <Link href="/archive" className="bg-gray-600 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity">
            Archive
          </Link>
        </div>

        {/* Main hero */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <div className="animate-pulse bg-gray-200 rounded-xl h-80 lg:col-span-2" />
            <div className="space-y-3">{[0,1,2].map((i) => <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-24" />)}</div>
          </div>
        ) : articles.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <Link href={`/article/${articles[0].slug}`}
              className="lg:col-span-2 group block rounded-xl overflow-hidden relative h-80">
              <Image src={getArticleImage(articles[0].slug, undefined, 'hero', getPreferredArticleImage(articles[0]))}
                alt={articles[0].title} fill className="object-cover" unoptimized priority />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <span className="bg-signal text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded mb-2 inline-block">Top Story</span>
                <h2 className="text-white font-serif font-bold text-2xl leading-snug group-hover:text-signal transition-colors line-clamp-3">
                  {articles[0].title}
                </h2>
                {articles[0].excerpt && <p className="text-blue-200 text-sm mt-1 line-clamp-2">{articles[0].excerpt}</p>}
                {articles[0].publishedAt && (
                  <p className="text-blue-300/70 text-xs mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />{timeAgo(articles[0].publishedAt)}
                  </p>
                )}
              </div>
            </Link>
            <div className="flex flex-col gap-3">
              {articles.slice(1, 4).map((a) => (
                <Link key={a.id} href={`/article/${a.slug}`}
                  className="group flex gap-3 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all p-3">
                  <div className="h-16 w-16 rounded-lg overflow-hidden shrink-0 relative">
                    <Image src={getArticleImage(a.slug, undefined, 'thumb', getPreferredArticleImage(a))}
                      alt={a.title} fill className="object-cover" unoptimized />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm text-gray-800 group-hover:text-brand leading-snug line-clamp-3">{a.title}</h3>
                    {a.publishedAt && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />{timeAgo(a.publishedAt)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400 mb-8">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">News pipeline initialising…</p>
            <p className="text-sm mt-1">RSS feeds update 3× daily. Check back soon.</p>
          </div>
        )}

        {/* Latest news grid */}
        {!loading && articles.length > 4 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-black text-navy uppercase tracking-widest border-l-4 border-brand pl-3">Latest News</h2>
              <Link href="/archive" className="text-xs text-brand font-semibold flex items-center gap-1 hover:text-brand-dark">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {articles.slice(4, 24).map((a) => (
                <Link key={a.id} href={`/article/${a.slug}`}
                  className="group bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-md transition-all overflow-hidden">
                  <div className="relative h-36 overflow-hidden">
                    <Image src={getArticleImage(a.slug, undefined, 'card', getPreferredArticleImage(a))}
                      alt={a.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized />
                  </div>
                  <div className="p-3">
                    <h3 className="font-bold text-xs text-gray-800 group-hover:text-brand leading-snug line-clamp-2">{a.title}</h3>
                    {a.publishedAt && (
                      <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />{timeAgo(a.publishedAt)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Per-category sections */}
        {!loading && SECTIONS.map((slug) => {
          const meta = CAT_META[slug];
          const list = sections.get(slug) ?? [];
          if (list.length === 0) return null;

          const [hero, ...rest] = list;
          const hasGrid = rest.length > 0;

          return (
            <section key={slug} className="mb-10">
              <div className={`flex items-center justify-between border-b-2 ${meta.border} pb-2 mb-4`}>
                <div className="flex items-center gap-2">
                  <span className={`${meta.color} text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded`}>
                    {meta.label}
                  </span>
                  <h2 className="text-base font-black text-navy uppercase tracking-widest">{meta.label} News</h2>
                </div>
                <Link href={`/category/${slug}`}
                  className="text-xs text-brand font-semibold flex items-center gap-1 hover:text-brand-dark">
                  More <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {hasGrid ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <Link href={`/article/${hero.slug}`}
                    className="group block rounded-xl overflow-hidden relative h-56 lg:row-span-2">
                    <Image src={getArticleImage(hero.slug, undefined, 'hero', getPreferredArticleImage(hero))}
                      alt={hero.title} fill className="object-cover" unoptimized />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <span className={`inline-block ${meta.color} text-white text-[10px] font-black uppercase px-2 py-0.5 rounded mb-1`}>Top</span>
                      <h3 className="text-white font-serif font-bold text-sm leading-snug group-hover:text-signal transition-colors line-clamp-3">
                        {hero.title}
                      </h3>
                      {hero.publishedAt && (
                        <p className="text-blue-300/70 text-[10px] mt-1 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />{timeAgo(hero.publishedAt)}
                        </p>
                      )}
                    </div>
                  </Link>
                  <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {rest.slice(0, 19).map((a) => <ArticleCard key={a.id} a={a} />)}
                  </div>
                </div>
              ) : (
                /* Single article — compact card */
                <Link href={`/article/${hero.slug}`}
                  className="group flex gap-4 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all p-4">
                  <div className="h-20 w-20 rounded-lg overflow-hidden shrink-0 relative">
                    <Image src={getArticleImage(hero.slug, undefined, 'thumb', getPreferredArticleImage(hero))}
                      alt={hero.title} fill className="object-cover" unoptimized />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-gray-800 group-hover:text-brand leading-snug line-clamp-2">{hero.title}</h3>
                    {hero.excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{hero.excerpt}</p>}
                    {hero.publishedAt && (
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />{timeAgo(hero.publishedAt)}
                      </p>
                    )}
                  </div>
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
