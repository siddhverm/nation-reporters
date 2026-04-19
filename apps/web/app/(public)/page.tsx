import { Metadata } from 'next';
import Link from 'next/link';
import { api } from '../../lib/api';

export const metadata: Metadata = {
  title: 'Nation Reporters — Breaking News, India & World',
  description: 'Stay informed with the latest breaking news from India and around the world.',
};

export const revalidate = 60;

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  categoryId: string | null;
}

async function getLatestArticles(): Promise<Article[]> {
  try {
    const res = await api.get<{ data: Article[] }>('/articles?status=PUBLISHED&limit=20');
    return res.data;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const articles = await getLatestArticles();
  const [breaking, ...rest] = articles;

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      {/* Breaking news banner */}
      <div className="bg-brand text-white px-4 py-2 rounded mb-6 flex items-center gap-3">
        <span className="font-bold text-sm uppercase tracking-wider">Breaking</span>
        <span className="text-sm truncate">{breaking?.title ?? 'Stay tuned for breaking news'}</span>
      </div>

      {/* Hero + grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        {breaking && (
          <div className="lg:col-span-2">
            <Link href={`/article/${breaking.slug}`} className="group block">
              <div className="bg-gray-100 rounded-xl h-64 flex items-end p-6 overflow-hidden">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-brand mb-1 block">
                    Top Story
                  </span>
                  <h1 className="text-2xl font-bold font-serif text-gray-900 group-hover:text-brand transition-colors leading-tight">
                    {breaking.title}
                  </h1>
                  {breaking.excerpt && (
                    <p className="text-gray-600 mt-2 line-clamp-2 text-sm">{breaking.excerpt}</p>
                  )}
                </div>
              </div>
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {rest.slice(0, 4).map((a) => (
            <Link key={a.id} href={`/article/${a.slug}`} className="group block border-b pb-3">
              <h3 className="font-semibold text-gray-800 group-hover:text-brand transition-colors line-clamp-2 leading-snug">
                {a.title}
              </h3>
              {a.publishedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(a.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* More stories */}
      <h2 className="text-xl font-bold text-gray-900 mb-4 border-l-4 border-brand pl-3">Latest News</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {rest.slice(4).map((a) => (
          <Link key={a.id} href={`/article/${a.slug}`} className="group block">
            <div className="bg-gray-50 rounded-lg p-4 h-full hover:bg-gray-100 transition-colors">
              <h3 className="font-semibold text-gray-800 group-hover:text-brand transition-colors line-clamp-3 leading-snug">
                {a.title}
              </h3>
              {a.excerpt && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{a.excerpt}</p>}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
