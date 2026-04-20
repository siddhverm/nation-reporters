'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  categoryId: string | null;
}

const CATEGORIES = [
  { name: 'India', slug: 'india' },
  { name: 'World', slug: 'world' },
  { name: 'Politics', slug: 'politics' },
  { name: 'Business', slug: 'business' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Entertainment', slug: 'entertainment' },
  { name: 'Technology', slug: 'tech' },
];

export default function HomePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${base}/articles?status=PUBLISHED&limit=20`)
      .then((r) => r.json())
      .then((res: { data?: Article[] }) => {
        setArticles(res.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const [breaking, ...rest] = articles;

  return (
    <main className="max-w-7xl mx-auto px-4 py-4">

      {/* Top nav bar */}
      <nav className="flex gap-4 overflow-x-auto pb-3 mb-4 border-b text-sm font-medium">
        <Link href="/" className="text-brand whitespace-nowrap">Home</Link>
        {CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/category/${c.slug}`} className="text-gray-600 hover:text-brand whitespace-nowrap transition-colors">
            {c.name}
          </Link>
        ))}
        <Link href="/podcasts" className="text-gray-600 hover:text-brand whitespace-nowrap transition-colors">Podcasts</Link>
        <Link href="/live" className="text-gray-600 hover:text-brand whitespace-nowrap transition-colors">Live TV</Link>
      </nav>

      {/* Breaking news ticker */}
      <div className="bg-brand text-white px-4 py-2 rounded-lg mb-5 flex items-center gap-3 overflow-hidden">
        <span className="font-bold text-xs uppercase tracking-widest shrink-0 bg-white text-brand px-2 py-0.5 rounded">
          Breaking
        </span>
        <span className="text-sm truncate">
          {loading ? 'Loading latest news...' : (breaking?.title ?? 'Stay tuned for the latest breaking news from India and the world')}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-48" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">No articles yet.</p>
          <p className="text-sm mt-2">The AI pipeline will populate this automatically once deployed.</p>
        </div>
      ) : (
        <>
          {/* Hero section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
            {/* Main hero */}
            {breaking && (
              <div className="lg:col-span-2">
                <Link href={`/article/${breaking.slug}`} className="group block bg-gradient-to-br from-gray-900 to-gray-700 rounded-2xl overflow-hidden h-72 relative">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-light bg-brand px-2 py-0.5 rounded mb-2 inline-block">
                      Top Story
                    </span>
                    <h1 className="text-xl font-bold text-white group-hover:text-yellow-300 transition-colors leading-tight font-serif">
                      {breaking.title}
                    </h1>
                    {breaking.excerpt && (
                      <p className="text-gray-300 mt-1 text-sm line-clamp-2">{breaking.excerpt}</p>
                    )}
                    {breaking.publishedAt && (
                      <p className="text-gray-400 text-xs mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(breaking.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </Link>
              </div>
            )}

            {/* Side stories */}
            <div className="space-y-3">
              {rest.slice(0, 4).map((a) => (
                <Link key={a.id} href={`/article/${a.slug}`} className="group flex gap-3 border-b pb-3 last:border-0">
                  <div className="h-16 w-16 rounded-lg bg-gray-200 shrink-0 flex items-center justify-center text-gray-400 text-xs font-bold">
                    NR
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800 group-hover:text-brand transition-colors line-clamp-2 leading-snug">
                      {a.title}
                    </h3>
                    {a.publishedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(a.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Latest News grid */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-brand rounded inline-block" />
              Latest News
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {rest.slice(4).map((a) => (
                <Link key={a.id} href={`/article/${a.slug}`} className="group block border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                  <div className="h-36 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                    <span className="text-gray-400 font-bold text-sm">NR</span>
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-gray-800 group-hover:text-brand transition-colors line-clamp-3 leading-snug">
                      {a.title}
                    </h3>
                    {a.excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.excerpt}</p>}
                    {a.publishedAt && (
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(a.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
