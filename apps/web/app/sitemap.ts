import { MetadataRoute } from 'next';
import { serverApiJson } from '@/lib/server-api';
import { SITE_URL, articleUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const SECTIONS = ['india', 'world', 'politics', 'business', 'sports', 'entertainment', 'tech'];

type Row = { slug: string; publishedAt?: string | null; language?: string | null };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE_URL}/copyright`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    ...SECTIONS.map((s) => ({
      url: s === 'world' ? `${SITE_URL}/world` : `${SITE_URL}/category/${s}`,
      lastModified: now,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    })),
  ];
  const res = await serverApiJson<{ data?: Row[] }>('/articles?status=PUBLISHED&omitBody=true&limit=150', 600);
  const rows = Array.isArray(res?.data) ? res!.data! : [];
  const articles: MetadataRoute.Sitemap = rows
    .filter((r) => r?.slug)
    .map((r) => ({
      url: articleUrl(r.slug),
      lastModified: r.publishedAt ? new Date(r.publishedAt) : now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
  return [...base, ...articles];
}
