export function seoPrompt(title: string, body: string) {
  return `
Generate SEO metadata for this news article.

Title: ${title}
Body (first 500 chars): ${body.slice(0, 500)}

Respond with JSON:
{
  "seoTitle": "SEO-optimized title under 60 chars",
  "seoDescription": "Meta description 120-155 chars, contains primary keyword",
  "slug": "url-friendly-slug-lowercase-hyphens-no-stopwords",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}
`.trim();
}
