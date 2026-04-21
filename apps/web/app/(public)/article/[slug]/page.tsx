'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Share2, Facebook, Twitter, ChevronRight, ArrowLeft } from 'lucide-react';
import { getArticleImage, getBodyImageUrl, getBodyImageCredit } from '@/lib/news-image';

interface Article {
  id: string;
  title: string;
  slug: string;
  body: Record<string, unknown> & { content?: { type?: string; content?: { text?: string; type?: string }[] }[] };
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  language: string;
  hashtags: string[];
  categoryId: string | null;
  provenance?: { sourceName: string; sourceUrl: string; attributionNote?: string } | null;
}

function extractParagraphs(body: Article['body']): string[] {
  if (!body?.content) return [];
  return body.content
    .filter((b) => b.type === 'paragraph')
    .map((b) => b.content?.map((n) => n.text ?? '').join('') ?? '')
    .filter(Boolean);
}

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading]  = useState(true);
  const [error, setError]      = useState(false);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${base}/articles/${slug}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: Article) => { setArticle(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [slug]);

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-4">
      {[...Array(6)].map((_, i) => <div key={i} className="animate-pulse bg-gray-200 rounded h-4" style={{ width: `${70 + (i % 3) * 10}%` }} />)}
    </div>
  );

  if (error || !article) return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <p className="text-2xl font-bold text-navy mb-2">Article not found</p>
      <p className="text-gray-500 mb-6">This article may have been removed or the link is incorrect.</p>
      <Link href="/" className="bg-brand text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-brand-dark transition-colors">
        Back to Home
      </Link>
    </div>
  );

  const paragraphs = extractParagraphs(article.body);
  const shareUrl   = typeof window !== 'undefined' ? window.location.href : '';
  const rssImageUrl = getBodyImageUrl(article.body);
  const imageCredit = getBodyImageCredit(article.body);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Article header band */}
      <div className="bg-navy text-white py-3 px-4">
        <div className="max-w-3xl mx-auto flex items-center gap-2 text-sm text-blue-200">
          <Link href="/" className="hover:text-white flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Home</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-white">{article.title}</span>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Schema.org */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'NewsArticle',
          headline: article.title, description: article.excerpt,
          datePublished: article.publishedAt,
          publisher: { '@type': 'Organization', name: 'Nation Reporters', url: 'https://nationreporters.com' },
        }) }} />

        {/* Article card */}
        <article className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Hero image */}
          <div className="relative overflow-hidden">
            <div className="h-64 md:h-80 relative">
              <Image src={getArticleImage(article.slug, undefined, 'hero', rssImageUrl)} alt={article.title}
                fill className="object-cover" unoptimized priority />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-4">
                <span className="bg-brand text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                  Nation Reporters
                </span>
              </div>
            </div>
            {imageCredit && (
              <p className="text-[10px] text-gray-400 px-3 py-1 bg-gray-50 text-right italic">
                📷 {imageCredit}
              </p>
            )}
          </div>

          <div className="p-6">
            <h1 className="text-2xl md:text-3xl font-bold font-serif text-navy leading-snug mb-3">
              {article.title}
            </h1>

            {article.excerpt && (
              <p className="text-gray-600 text-base leading-relaxed border-l-4 border-brand pl-4 mb-4 italic">
                {article.excerpt}
              </p>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="h-4 w-4" />
                {article.publishedAt
                  ? new Date(article.publishedAt).toLocaleDateString('en-IN', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : 'Nation Reporters'}
              </div>
              {/* Share buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Share2 className="h-3 w-3" /> Share:</span>
                <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="bg-[#1877F2] text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 hover:opacity-90">
                  <Facebook className="h-3 w-3" /> FB
                </a>
                <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(article.title)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="bg-[#1DA1F2] text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 hover:opacity-90">
                  <Twitter className="h-3 w-3" /> X
                </a>
              </div>
            </div>

            {/* Article body */}
            <div className="prose prose-base max-w-none text-gray-800 leading-relaxed space-y-4">
              {paragraphs.length > 0
                ? paragraphs.map((p, i) => <p key={i}>{p}</p>)
                : <p className="text-gray-500 italic">Article content is being processed…</p>}
            </div>

            {/* Hashtags */}
            {article.hashtags?.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {article.hashtags.map((tag) => (
                  <span key={tag} className="bg-navy/10 text-navy text-xs px-2.5 py-1 rounded-full font-medium">#{tag}</span>
                ))}
              </div>
            )}

            {/* Source attribution */}
            {article.provenance && (
              <div className="mt-8 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 border border-gray-100">
                <span className="font-semibold text-gray-700">Source:</span>{' '}
                <a href={article.provenance.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-brand hover:underline">{article.provenance.sourceName}</a>
                {article.provenance.attributionNote && ` — ${article.provenance.attributionNote}`}
              </div>
            )}
          </div>
        </article>

        {/* Back to home */}
        <div className="mt-6 flex gap-3">
          <Link href="/" className="flex items-center gap-2 text-sm text-navy font-semibold hover:text-brand transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
