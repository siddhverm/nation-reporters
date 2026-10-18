import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { serverApiJson } from '@/lib/server-api';
import { articleJsonLd, articleSeo, ogLocale, type PublicArticle } from '@/lib/seo';
import { getImageAlt, imageOriginOf } from '@/lib/news-image';

export const dynamic = 'force-dynamic';

function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function loadArticle(rawSlug: string): Promise<PublicArticle | null> {
  const slug = decodeSlug(rawSlug);
  return serverApiJson<PublicArticle>(`/articles/${encodeURIComponent(slug)}`, 300);
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const article = await loadArticle(params.slug);
  if (!article) return { title: 'Nation Reporters', robots: { index: false } };
  const seo = articleSeo(article);
  const alt = getImageAlt(article.title, seo.lang, imageOriginOf(article));
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.url },
    openGraph: {
      type: 'article',
      siteName: 'Nation Reporters',
      title: seo.title,
      description: seo.description,
      url: seo.url,
      locale: ogLocale(seo.lang),
      publishedTime: article.publishedAt ?? undefined,
      images: [{ url: seo.image, alt }],
    },
    twitter: { card: 'summary_large_image', title: seo.title, description: seo.description, images: [seo.image] },
    // No publisher name, byline or "source" metadata of any kind.
    authors: [{ name: 'Nation Reporters' }],
    other: { 'content-language': seo.lang },
  };
}

export default async function ArticleLayout({ children, params }: { children: ReactNode; params: { slug: string } }) {
  const article = await loadArticle(params.slug);
  return (
    <>
      {article && (
        <script
          type="application/ld+json"
          // JSON.stringify output is safe in a script tag except for "</script"; escape "<".
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(article)).replace(/</g, '\\u003c') }}
        />
      )}
      {children}
    </>
  );
}
