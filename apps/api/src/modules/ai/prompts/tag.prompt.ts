export function tagPrompt(title: string, body: string) {
  return `
Analyze this news article and extract structured metadata.

Title: ${title}
Body: ${body}

Respond with JSON:
{
  "category": one of ["india", "world", "politics", "business", "sports", "entertainment", "tech", "health", "science", "crime", "environment"],
  "region": ISO country code or state/city name,
  "tags": array of 5-10 relevant topic tags (lowercase, no spaces),
  "entities": { "people": [], "organizations": [], "locations": [] },
  "isBreaking": boolean
}
`.trim();
}
