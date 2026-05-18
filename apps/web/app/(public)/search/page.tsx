'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search as SearchIcon } from 'lucide-react';
import { fetchJsonFromApi } from '@/lib/api-client';
import { formatListingExcerpt } from '@/lib/reader-summary';
import { articleMatchesLanguage, normalizeUiLanguage } from '@/lib/ui-language';
import { useUiLanguage } from '@/lib/use-ui-language';
import { safeArticleText } from '@/lib/rss-plain-text';

interface Hit {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  language?: string;
  publishedAt?: string;
}

export default function SearchPage() {
  const uiLang = useUiLanguage();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (query: string, lang: string) => {
    if (!query.trim()) { setHits([]); return; }
    setLoading(true);
    try {
      const langQ = normalizeUiLanguage(lang);
      const data = await fetchJsonFromApi<{ hits: Hit[] }>(
        `/search?q=${encodeURIComponent(query)}&lang=${langQ}`,
      );
      const list = (data.hits ?? []).filter((h) => articleMatchesLanguage(h.language, langQ));
      setHits(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(q, uiLang), 300);
    return () => clearTimeout(timer);
  }, [q, uiLang, doSearch]);

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
            <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors">{safeArticleText(hit.title)}</h3>
            {hit.excerpt && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                {formatListingExcerpt(hit.excerpt, hit.title, uiLang) || safeArticleText(hit.excerpt)}
              </p>
            )}
            {hit.publishedAt && (
              <p className="text-xs text-gray-400 mt-1">{new Date(hit.publishedAt).toLocaleDateString()}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
