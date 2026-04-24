import { Metadata } from 'next';
import Link from 'next/link';
import { PlayCircle } from 'lucide-react';

export const metadata: Metadata = { title: 'Videos' };
export const revalidate = 300;

interface MediaAsset {
  id: string;
  type: string;
  url: string;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  language: string;
  mediaAssets?: MediaAsset[];
}

const FALLBACK_VIDEOS: Article[] = [
  {
    id: 'vid-f-1',
    title: 'AI Video Preview: India infrastructure roundup',
    slug: 'video-fallback-1',
    excerpt: 'Preview card shown while upstream video feed is temporarily unavailable.',
    publishedAt: new Date().toISOString(),
    language: 'en',
    mediaAssets: [],
  },
  {
    id: 'vid-f-2',
    title: 'AI Video Preview: World policy and markets update',
    slug: 'video-fallback-2',
    excerpt: 'Live video stories appear automatically once ingestion sync recovers.',
    publishedAt: new Date().toISOString(),
    language: 'en',
    mediaAssets: [],
  },
  {
    id: 'vid-f-3',
    title: 'AI Video Preview: Sports and entertainment highlights',
    slug: 'video-fallback-3',
    excerpt: 'This placeholder keeps the video section populated during outages.',
    publishedAt: new Date().toISOString(),
    language: 'en',
    mediaAssets: [],
  },
];

async function getVideos(): Promise<Article[]> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const res = await fetch(
      `${base}/articles?status=PUBLISHED&hasVideo=true&limit=30`,
      { next: { revalidate: 300 } },
    );
    const data = await res.json() as { data?: Article[] };
    const list = data.data ?? [];
    return list.length > 0 ? list : FALLBACK_VIDEOS;
  } catch {
    return FALLBACK_VIDEOS;
  }
}

export default async function VideosPage() {
  const videos = await getVideos();
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <PlayCircle className="h-8 w-8 text-brand" />
        <h1 className="text-3xl font-bold text-gray-900">Video News</h1>
      </div>

      {videos.length === 0 ? (
        <p className="text-gray-400 text-center py-16">Loading video feed…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {videos.map((video) => {
            const url = video.mediaAssets?.find((m) => m.type === 'VIDEO')?.url;
            const isPreview = video.slug.includes('fallback');
            return (
              <div key={video.id} className="border rounded-xl p-4 bg-white">
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-3">
                  {url ? (
                    <video controls preload="metadata" className="w-full h-full object-cover" src={url} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                      Preview mode: live video source unavailable
                    </div>
                  )}
                </div>
                {isPreview ? (
                  <p className="font-semibold text-gray-700 line-clamp-2">
                    {video.title}
                  </p>
                ) : (
                  <Link href={`/article/${video.slug}`} className="font-semibold text-gray-900 hover:text-brand line-clamp-2">
                    {video.title}
                  </Link>
                )}
                {video.excerpt && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{video.excerpt}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  {video.publishedAt
                    ? new Date(video.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Published'}
                  {' · '}
                  {video.language.toUpperCase()}
                  {isPreview ? ' · PREVIEW' : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
