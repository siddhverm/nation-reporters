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

function isPlayableVideoUrl(url: string | undefined): boolean {
  if (!url || !url.trim()) return false;
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return true;
  if (u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.m3u8')) return true;
  return u.startsWith('http');
}

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      if (m) return `https://www.youtube.com/embed/${m[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

async function getVideos(): Promise<Article[]> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  try {
    const res = await fetch(
      `${base}/articles?status=PUBLISHED&hasVideo=true&limit=30`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Article[] };
    const list = data.data ?? [];
    return list.filter((a) => {
      const url = a.mediaAssets?.find((m) => m.type === 'VIDEO')?.url;
      return isPlayableVideoUrl(url);
    });
  } catch {
    return [];
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
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-gray-600">
          <p className="font-semibold text-gray-800 mb-2">No published video stories yet</p>
          <p className="text-sm max-w-md mx-auto">
            Stories with a <strong>VIDEO</strong> media asset appear here automatically after ingestion
            or AI processing attaches a source clip. This page lists only real playable videos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {videos.map((video) => {
            const url = video.mediaAssets?.find((m) => m.type === 'VIDEO')?.url;
            const embed = url ? youtubeEmbedUrl(url) : null;
            return (
              <div key={video.id} className="border rounded-xl p-4 bg-white">
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-3">
                  {embed ? (
                    <iframe
                      title={video.title}
                      className="w-full h-full"
                      src={embed}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video controls preload="metadata" className="w-full h-full object-cover" src={url} />
                  )}
                </div>
                <Link href={`/article/${video.slug}`} className="font-semibold text-gray-900 hover:text-brand line-clamp-2">
                  {video.title}
                </Link>
                {video.excerpt && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{video.excerpt}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  {video.publishedAt
                    ? new Date(video.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : 'Published'}
                  {' · '}
                  {video.language.toUpperCase()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
