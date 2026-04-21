'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Clock, ChevronRight, Globe } from 'lucide-react';
import { COUNTRY_BY_SLUG, REGION_LABELS, COUNTRIES } from '@/lib/countries';
import { getArticleImage } from '@/lib/news-image';

interface Article {
  id: string; title: string; slug: string;
  excerpt: string | null; publishedAt: string | null;
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
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const langParam = country?.lang && country.lang !== 'en' ? `&language=${country.lang}` : '';
    fetch(`${base}/articles?status=PUBLISHED&limit=30${langParam}`)
      .then((r) => r.json())
      .then((res: { data?: Article[] }) => {
        const arr = res.data ?? [];
        setArticles(arr.length > 0 ? arr : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code, country?.lang]);

  const [hero, ...rest] = articles;
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
                {country ? `${REGION_LABELS[country.region]} · ${country.langName}` : 'World News'}
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

        {!loading && articles.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Globe className="h-14 w-14 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-semibold">No articles for {country?.name ?? code} yet.</p>
            <p className="text-sm mt-1">The AI pipeline ingests news 3× daily — check back soon.</p>
          </div>
        )}

        {!loading && articles.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {hero && (
                <Link href={`/article/${hero.slug}`}
                  className="group block rounded-xl overflow-hidden relative h-72">
                  <Image src={getArticleImage(hero.slug, code, 'hero')} alt={hero.title}
                    fill className="object-cover" unoptimized />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <span className="inline-block bg-brand text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2">
                      {country?.flag} {country?.name}
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
                      <Image src={getArticleImage(a.slug, code, 'thumb')} alt={a.title} fill className="object-cover" unoptimized />
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
