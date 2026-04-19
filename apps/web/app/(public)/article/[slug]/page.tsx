import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { api } from '../../../../lib/api';

interface Article {
  id: string;
  title: string;
  slug: string;
  body: { content?: { content?: { text?: string }[] }[] };
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  language: string;
  hashtags: string[];
  provenance?: { sourceName: string; sourceUrl: string; attributionNote?: string };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const article = await api.get<Article>(`/articles/${params.slug}`).catch(() => null);
    if (!article) return {};
    return {
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt ?? undefined,
      openGraph: {
        title: article.seoTitle ?? article.title,
        description: article.seoDescription ?? article.excerpt ?? undefined,
        type: 'article',
        publishedTime: article.publishedAt ?? undefined,
      },
    };
  } catch {
    return {};
  }
}

export const revalidate = 300;

function extractText(body: Article['body']): string {
  return body.content
    ?.flatMap((block) => block.content?.map((n) => n.text).filter(Boolean) ?? [])
    .join(' ') ?? '';
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await api.get<Article>(`/articles/${params.slug}`).catch(() => null);
  if (!article) notFound();

  const bodyText = extractText(article.body);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* Schema.org NewsArticle */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: article.title,
            description: article.excerpt,
            datePublished: article.publishedAt,
            publisher: { '@type': 'Organization', name: 'Nation Reporters', url: 'https://nationreporters.com' },
          }),
        }}
      />

      <h1 className="text-3xl font-bold font-serif text-gray-900 leading-tight mb-4">
        {article.title}
      </h1>

      {article.publishedAt && (
        <p className="text-sm text-gray-500 mb-6">
          {new Date(article.publishedAt).toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>
      )}

      <div className="prose prose-lg max-w-none text-gray-800 leading-relaxed">
        {bodyText.split('\n').filter(Boolean).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {article.hashtags?.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {article.hashtags.map((tag) => (
            <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {article.provenance && (
        <p className="mt-8 text-xs text-gray-400 border-t pt-4">
          Source: {article.provenance.sourceName}
          {article.provenance.attributionNote && ` — ${article.provenance.attributionNote}`}
        </p>
      )}
    </main>
  );
}
