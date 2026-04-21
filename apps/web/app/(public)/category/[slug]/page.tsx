'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Clock, ChevronRight } from 'lucide-react';
import { getArticleImage } from '@/lib/news-image';

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  categoryId: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
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
  const label = SLUG_LABELS[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
  const accent = SLUG_COLORS[slug] ?? 'bg-brand';

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const lang = typeof window !== 'undefined' ? (localStorage.getItem('nr-lang') ?? 'en') : 'en';
    const isIndia = slug === 'india';

    // India section always shows all domestic news in any language (no lang filter)
    // Other categories respect language preference but fallback to English
    fetch(`${base}/categories`)
      .then((r) => r.json())
      .then(async (cats: Category[]) => {
        const cat = cats.find((c) => c.slug === slug || c.name.toLowerCase() === slug.toLowerCase());
        const worldCat = cats.find((c) => c.slug === 'world');

        const buildUrl = (withLang: boolean) => {
          let url = `${base}/articles?status=PUBLISHED&limit=50`;
          if (!isIndia && cat) url += `&categoryId=${cat.id}`;
          if (withLang && !isIndia && lang !== 'en') url += `&language=${lang}`;
          return url;
        };

        const res = await fetch(buildUrl(true));
        const data: { data?: Article[] } = await res.json();
        let articles = data.data ?? [];

        // Fallback to English if no articles in selected language
        if (articles.length === 0 && lang !== 'en' && !isIndia) {
          const fb = await fetch(buildUrl(false));
          const fbData: { data?: Article[] } = await fb.json();
          articles = fbData.data ?? [];
        }

        // India section: exclude World-categorised articles
        if (isIndia && worldCat) {
          articles = articles.filter((a) => a.categoryId !== worldCat.id);
        }

        setArticles(articles);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
                  <Image src={getArticleImage(hero.slug, slug, 'hero')} alt={hero.title}
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
                      <Image src={getArticleImage(a.slug, slug, 'thumb')} alt={a.title}
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
