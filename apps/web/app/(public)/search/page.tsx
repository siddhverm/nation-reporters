'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search as SearchIcon } from 'lucide-react';

interface Hit {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  language?: string;
  publishedAt?: string;
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setHits([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search?q=${encodeURIComponent(query)}`);
      const data = await res.json() as { hits: Hit[] };
      setHits(data.hits ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(q), 300);
    return () => clearTimeout(timer);
  }, [q, doSearch]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Search</h1>
      <div className="relative mb-6">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search stories..."
          className="w-full pl-10 pr-4 py-3 border rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand text-lg"
        />
      </div>

      {loading && <p className="text-gray-400 text-center py-8">Searching...</p>}

      {!loading && q && hits.length === 0 && (
        <p className="text-gray-400 text-center py-8">No results for &ldquo;{q}&rdquo;</p>
      )}

      <div className="space-y-4">
        {hits.map((hit) => (
          <Link key={hit.id} href={`/article/${hit.slug}`} className="group block border-b pb-4">
            <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors">{hit.title}</h3>
            {hit.excerpt && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{hit.excerpt}</p>}
            {hit.publishedAt && (
              <p className="text-xs text-gray-400 mt-1">{new Date(hit.publishedAt).toLocaleDateString()}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
