import { isRtlLanguage, normalizeUiLanguage } from '@/lib/ui-language';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nationreporters.com').replace(/\/$/, '');

/** og:locale per supported UI language. */
const OG_LOCALE: Record<string, string> = {
  en: 'en_IN', hi: 'hi_IN', mr: 'mr_IN', bn: 'bn_IN', te: 'te_IN', ta: 'ta_IN', gu: 'gu_IN', kn: 'kn_IN',
  pa: 'pa_IN', ur: 'ur_PK', ml: 'ml_IN', ar: 'ar_AR', fr: 'fr_FR', de: 'de_DE', es: 'es_ES', pt: 'pt_PT',
  ru: 'ru_RU', zh: 'zh_CN', ja: 'ja_JP', ko: 'ko_KR', id: 'id_ID', tr: 'tr_TR', it: 'it_IT',
};

export type PublicArticle = {
  title?: string | null;
  slug: string;
  language?: string | null;
  excerpt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  hashtags?: string[] | null;
  image?: { url: string; alt: string; origin?: string } | null;
  imageOrigin?: string | null;
};

export function ogLocale(lang: string | null | undefined): string {
  return OG_LOCALE[normalizeUiLanguage(lang)] ?? 'en_IN';
}

export function articleUrl(slug: string): string {
  return `${SITE_URL}/article/${encodeURIComponent(slug)}`;
}

export function articleImageUrl(slug: string): string {
  return `${SITE_URL}/story-image/${encodeURIComponent(slug)}`;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** SEO strings straight from the (already source-sanitized) public API payload. */
export function articleSeo(a: PublicArticle) {
  const title = clip((a.seoTitle || a.title || 'Nation Reporters').trim(), 110);
  const description = clip((a.seoDescription || a.excerpt || a.title || '').replace(/\s+/g, ' ').trim(), 200);
  const lang = normalizeUiLanguage(a.language);
  return { title, description, lang, rtl: isRtlLanguage(lang), url: articleUrl(a.slug), image: articleImageUrl(a.slug) };
}

/** schema.org NewsArticle: Nation Reporters is the only author/publisher; image is the generated story image. */
export function articleJsonLd(a: PublicArticle) {
  const s = articleSeo(a);
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: clip((a.title || s.title).trim(), 110),
    description: s.description,
    inLanguage: s.lang,
    mainEntityOfPage: s.url,
    image: [s.image],
    datePublished: a.publishedAt ?? undefined,
    dateModified: a.updatedAt ?? a.publishedAt ?? undefined,
    author: { '@type': 'Organization', name: 'Nation Reporters', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Nation Reporters', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
  };
}
