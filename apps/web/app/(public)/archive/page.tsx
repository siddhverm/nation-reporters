'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Clock, ChevronRight, ChevronLeft, Archive, Search } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  categoryId: string | null;
}

interface PaginatedResponse {
  data: Article[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 20;

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function groupByDate(articles: Article[]): Record<string, Article[]> {
  return articles.reduce<Record<string, Article[]>>((acc, a) => {
    const key = a.publishedAt
      ? new Date(a.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Unknown date';
    (acc[key] = acc[key] ?? []).push(a);
    return acc;
  }, {});
}

export default function ArchivePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const params = new URLSearchParams({
      status: 'PUBLISHED',
      limit: String(PAGE_SIZE),
      page: String(p),
    });
    if (q) params.set('search', q);

    try {
      const res = await fetch(`${base}/articles?${params}`);
      const data: PaginatedResponse = await res.json();
      setArticles(Array.isArray(data) ? data : (data.data ?? []));
      setTotal(typeof data === 'object' && 'total' in data ? data.total : (data as unknown as Article[]).length);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, query); }, [page, query]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setQuery(search);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const grouped = groupByDate(articles);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header band */}
      <div className="bg-navy text-white py-4 px-4">
        <div className="max-w-4xl mx-auto">
          <nav className="text-sm text-white/70 flex items-center gap-1 mb-1">
            <Link href="/" className="hover:text-white">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white font-bold">Archive</span>
          </nav>
          <div className="flex items-center gap-3">
            <Archive className="h-6 w-6 text-signal" />
            <div>
              <h1 className="text-2xl font-black">News Archive</h1>
              <p className="text-white/60 text-sm">Complete record of all published stories</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search archived stories…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand bg-white"
            />
          </div>
          <button type="submit"
            className="bg-brand text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-dark transition-colors">
            Search
          </button>
          {query && (
            <button type="button" onClick={() => { setSearch(''); setQuery(''); setPage(1); }}
              className="border border-gray-200 text-gray-500 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-100 transition-colors">
              Clear
            </button>
          )}
        </form>

        {/* Stats bar */}
        <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
          <span>{total > 0 ? `${total} article${total !== 1 ? 's' : ''} in archive` : ''}</span>
          {totalPages > 1 && (
            <span>Page {page} of {totalPages}</span>
          )}
        </div>

        {/* Articles grouped by date */}
        {loading ? (
          <div className="space-y-6">
            {[0,1,2].map((i) => (
              <div key={i}>
                <div className="animate-pulse bg-gray-200 h-4 w-32 rounded mb-3" />
                <div className="space-y-3">
                  {[0,1,2].map((j) => <div key={j} className="animate-pulse bg-gray-200 h-16 rounded-xl" />)}
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Archive className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">{query ? `No results for "${query}"` : 'No archived articles yet.'}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([date, group]) => (
              <div key={date}>
                <h2 className="text-sm font-black text-navy uppercase tracking-wider border-b-2 border-brand/30 pb-2 mb-3 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-brand" /> {date}
                </h2>
                <div className="space-y-2">
                  {group.map((a) => (
                    <Link key={a.id} href={`/article/${a.slug}`}
                      className="group flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-brand/30 hover:shadow-sm transition-all">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800 group-hover:text-brand leading-snug">
                          {a.title}
                        </h3>
                        {a.excerpt && (
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{a.excerpt}</p>
                        )}
                      </div>
                      {a.publishedAt && (
                        <span className="text-xs text-gray-400 shrink-0 mt-0.5 whitespace-nowrap">
                          {timeAgo(a.publishedAt)}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-brand shrink-0 mt-0.5 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1.5 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>

            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${p === page ? 'bg-brand text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                    {p}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1.5 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
