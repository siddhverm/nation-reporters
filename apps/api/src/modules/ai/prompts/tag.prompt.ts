/**
 * Categories must match ingestion + site navigation slugs exactly (otherwise articles are skipped).
 */
export function tagPrompt(title: string, body: string) {
  return `
Analyze this news article and extract structured metadata.

Title: ${title}
Body: ${body}

Respond with JSON:
{
  "category": REQUIRED — exactly one of: "india", "world", "politics", "business", "sports", "entertainment", "tech". Pick the single best fit (use "world" for international stories, "india" for India-focused domestic news).
  "region": ISO country code or state/city name,
  "tags": array of 5-10 relevant topic tags (lowercase ASCII a-z and hyphens only, no spaces),
  "entities": { "people": [], "organizations": [], "locations": [] },
  "isBreaking": boolean
}
`.trim();
}
