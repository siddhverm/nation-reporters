import { Metadata } from 'next';
import Link from 'next/link';
import { Mic } from 'lucide-react';

export const metadata: Metadata = { title: 'Podcasts' };
export const revalidate = 300;

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  podcastScript: string | null;
  publishedAt: string | null;
}

async function getPodcasts(): Promise<Article[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/articles?status=PUBLISHED&limit=20`,
      { next: { revalidate: 300 } },
    );
    const data = await res.json() as { data: Article[] };
    return data.data?.filter((a) => a.podcastScript) ?? [];
  } catch {
    return [];
  }
}

export default async function PodcastsPage() {
  const podcasts = await getPodcasts();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Mic className="h-8 w-8 text-brand" />
        <h1 className="text-3xl font-bold text-gray-900">Podcasts</h1>
      </div>

      {podcasts.length === 0 ? (
        <p className="text-gray-400 text-center py-16">No podcasts yet. Check back soon.</p>
      ) : (
        <div className="space-y-4">
          {podcasts.map((pod) => (
            <Link key={pod.id} href={`/article/${pod.slug}`} className="group flex items-center gap-4 border rounded-xl p-4 hover:bg-gray-50 transition-colors">
              <div className="h-14 w-14 rounded-lg bg-brand flex items-center justify-center shrink-0">
                <Mic className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors line-clamp-2">
                  {pod.title}
                </h3>
                {pod.excerpt && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{pod.excerpt}</p>}
                {pod.publishedAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(pod.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
