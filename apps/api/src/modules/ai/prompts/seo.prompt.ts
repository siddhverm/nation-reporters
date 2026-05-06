import { languageDisplayName } from './lang-names';

export function seoPrompt(title: string, body: string, targetLang = 'en') {
  const langName = languageDisplayName(targetLang);
  return `
Generate SEO metadata for this news article.

Title: ${title}
Body (first 500 chars): ${body.slice(0, 500)}

Generate seoTitle and seoDescription in ${langName} only (not English), unless target language is English.
Keep slug in English lowercase hyphen-case.
Generate hashtags in ${langName} (same as the article body language).

Respond with JSON:
{
  "seoTitle": "SEO-optimized title under 60 chars",
  "seoDescription": "Meta description 120-155 chars, contains primary keyword",
  "slug": "url-friendly-slug-in-ENGLISH-lowercase-hyphens-no-stopwords-max-60-chars",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();
}
