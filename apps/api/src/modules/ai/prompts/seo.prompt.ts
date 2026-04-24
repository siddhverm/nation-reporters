const LANG_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', bn: 'Bengali',
  ta: 'Tamil', te: 'Telugu', kn: 'Kannada', gu: 'Gujarati', pa: 'Punjabi',
  ur: 'Urdu', ar: 'Arabic', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  id: 'Indonesian', ms: 'Malay', sw: 'Swahili',
};

export function seoPrompt(title: string, body: string, targetLang = 'en') {
  const langName = LANG_NAMES[targetLang] ?? 'English';
  return `
Generate SEO metadata for this news article.

Title: ${title}
Body (first 500 chars): ${body.slice(0, 500)}

Generate seoTitle and seoDescription in ${langName}.
Keep slug in English lowercase hyphen-case.
Generate hashtags in the same language as the article.

Respond with JSON:
{
  "seoTitle": "SEO-optimized title under 60 chars",
  "seoDescription": "Meta description 120-155 chars, contains primary keyword",
  "slug": "url-friendly-slug-in-ENGLISH-lowercase-hyphens-no-stopwords-max-60-chars",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();
}
