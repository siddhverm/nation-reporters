'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Clock, ChevronRight, Globe } from 'lucide-react';
import { COUNTRY_BY_SLUG, REGION_LABELS, COUNTRIES } from '@/lib/countries';
import { getArticleImage, getPreferredArticleImage } from '@/lib/news-image';

interface Article {
  id: string; title: string; slug: string;
  excerpt: string | null; publishedAt: string | null;
  language?: string;
  body?: Record<string, unknown>;
  mediaAssets?: { type?: string; url?: string | null }[];
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function CountryPage() {
  const { code } = useParams<{ code: string }>();
  const country = COUNTRY_BY_SLUG.get(code);
  const [localArticles, setLocalArticles] = useState<Article[]>([]);
  const [globalArticles, setGlobalArticles] = useState<Article[]>([]);
  const [localLanguage, setLocalLanguage] = useState('en');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

    const mergeUnique = (items: Article[]) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.id || item.slug;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const controller = new AbortController();

    const load = async (preferredLang: string) => {
      setLoading(true);
      const resolvedLang = typeof window !== 'undefined'
        ? ((preferredLang || localStorage.getItem('nr-lang')) ?? country?.lang ?? 'en')
        : ((preferredLang || country?.lang) ?? 'en');
      setLocalLanguage(resolvedLang);

      try {
        const countryFeedRes = await fetch(
          `${base}/articles/country-feed?localLang=${encodeURIComponent(resolvedLang)}&globalLang=en&localLimit=20&globalLimit=20`,
          { signal: controller.signal },
        );
        const countryFeed = await countryFeedRes.json() as { local?: Article[]; global?: Article[] };
        const dedupedLocal = mergeUnique(countryFeed.local ?? []);
        const dedupedGlobal = mergeUnique(countryFeed.global ?? []);

        if (dedupedLocal.length > 0 || dedupedGlobal.length > 0) {
          setLocalArticles(dedupedLocal);
          setGlobalArticles(dedupedGlobal);
          setLoading(false);
          return;
        }

        // Fallback: latest published articles
        const r = await fetch(`${base}/articles?status=PUBLISHED&limit=30`, { signal: controller.signal });
        const d = await r.json() as { data?: Article[] };
        const fallbackRaw = d.data ?? [];
        const fallback = fallbackRaw.filter(
          (a) => (a.language ?? 'en').toLowerCase() === resolvedLang.toLowerCase(),
        );
        setLocalArticles(fallback);
        setGlobalArticles([]);
      } catch { /* empty */ }
      setLoading(false);
    };
    const selected = typeof window !== 'undefined'
      ? (localStorage.getItem('nr-lang') ?? country?.lang ?? 'en')
      : (country?.lang ?? 'en');
    void load(selected);

    const onLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang?: string }>;
      void load(customEvent.detail?.lang ?? 'en');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('nr-lang-change', onLangChange);
    }
    return () => {
      controller.abort();
      if (typeof window !== 'undefined') {
        window.removeEventListener('nr-lang-change', onLangChange);
      }
    };
  }, [code, country?.lang]);

  const localFeed = localArticles;
  const globalFeed = globalArticles;
  const [hero, ...rest] = localFeed.length > 0 ? localFeed : globalFeed;
  const sameRegion = COUNTRIES.filter((c) => c.region === country?.region && c.slug !== code).slice(0, 8);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Country header */}
      <div className="bg-navy text-white py-4 px-4">
        <div className="max-w-7xl mx-auto">
          <nav className="text-sm text-blue-300 flex items-center gap-1 mb-2">
            <Link href="/" className="hover:text-white">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/world" className="hover:text-white">World</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white">{country?.name ?? code}</span>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{country?.flag ?? '🌍'}</span>
            <div>
              <h1 className="text-2xl font-black">{country?.name ?? code}</h1>
              <p className="text-blue-300 text-sm">
                {country ? `${REGION_LABELS[country.region]} · Local: ${localLanguage.toUpperCase()} + Global: EN` : 'World News'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 animate-pulse bg-gray-200 rounded-xl h-72" />
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-20" />)}</div>
          </div>
        )}

        {!loading && localFeed.length === 0 && globalFeed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Globe className="h-14 w-14 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-semibold">No articles for {country?.name ?? code} yet.</p>
            <p className="text-sm mt-1">The AI pipeline ingests news 3× daily — check back soon.</p>
          </div>
        )}

        {!loading && (localFeed.length > 0 || globalFeed.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {hero && (
                <Link href={`/article/${hero.slug}`}
                  className="group block rounded-xl overflow-hidden relative h-72">
                  <Image src={getArticleImage(hero.slug, code, 'hero', getPreferredArticleImage(hero))} alt={hero.title}
                    fill className="object-cover" unoptimized />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <span className="inline-block bg-brand text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2">
                      {country?.flag} {country?.name}
                    </span>
                    <span className="inline-block bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2 ml-2">
                      {(hero.language ?? 'en').toUpperCase()}
                    </span>
                    <h2 className="text-white font-serif font-bold text-xl leading-snug group-hover:text-signal line-clamp-3">
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
              <div className="space-y-3">
                {rest.map((a) => (
                  <Link key={a.id} href={`/article/${a.slug}`}
                    className="group flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all">
                    <div className="h-20 w-20 rounded-lg overflow-hidden shrink-0 relative">
                      <Image src={getArticleImage(a.slug, code, 'thumb', getPreferredArticleImage(a))} alt={a.title} fill className="object-cover" unoptimized />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 group-hover:text-brand leading-snug line-clamp-2">{a.title}</h3>
                      <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">
                        {(a.language ?? 'en')}
                      </p>
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

              {localFeed.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-black text-navy uppercase tracking-widest border-b-2 border-brand pb-2 mb-3">
                    Local Language News ({localLanguage.toUpperCase()})
                  </h3>
                  <div className="space-y-3">
                    {localFeed.slice(0, 12).map((a) => (
                      <Link key={`local-${a.id}`} href={`/article/${a.slug}`}
                        className="group flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all">
                        <div className="h-20 w-20 rounded-lg overflow-hidden shrink-0 relative">
                          <Image src={getArticleImage(a.slug, code, 'thumb', getPreferredArticleImage(a))} alt={a.title} fill className="object-cover" unoptimized />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 group-hover:text-brand leading-snug line-clamp-2">{a.title}</h3>
                          {a.excerpt && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.excerpt}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {globalFeed.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-black text-navy uppercase tracking-widest border-b-2 border-blue-500 pb-2 mb-3">
                    Global News (EN)
                  </h3>
                  <div className="space-y-3">
                    {globalFeed.slice(0, 12).map((a) => (
                      <Link key={`global-${a.id}`} href={`/article/${a.slug}`}
                        className="group flex gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-blue-300 hover:shadow-sm transition-all">
                        <div className="h-20 w-20 rounded-lg overflow-hidden shrink-0 relative">
                          <Image src={getArticleImage(a.slug, code, 'thumb', getPreferredArticleImage(a))} alt={a.title} fill className="object-cover" unoptimized />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 leading-snug line-clamp-2">{a.title}</h3>
                          {a.excerpt && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.excerpt}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar: same region countries */}
            <div className="space-y-4">
              {sameRegion.length > 0 && (
                <>
                  <h3 className="text-sm font-black text-navy uppercase tracking-widest border-b-2 border-brand pb-2">
                    {country ? REGION_LABELS[country.region] : 'More Countries'}
                  </h3>
                  {sameRegion.map((c) => (
                    <Link key={c.code} href={`/country/${c.slug}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all">
                      <span className="text-2xl">{c.flag}</span>
                      <div>
                        <p className="text-sm font-semibold text-navy">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.langName}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />
                    </Link>
                  ))}
                </>
              )}
              <h3 className="text-sm font-black text-navy uppercase tracking-widest border-b-2 border-brand pb-2 mt-4">All Regions</h3>
              {Object.entries(REGION_LABELS).map(([r, label]) => (
                <Link key={r} href={`/world`} className="flex items-center gap-2 text-sm text-navy hover:text-brand font-medium py-1">
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
