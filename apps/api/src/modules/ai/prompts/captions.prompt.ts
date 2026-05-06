import { languageDisplayName } from './lang-names';

export function captionsPrompt(title: string, summary: string, targetLang = 'en') {
  const langName = languageDisplayName(targetLang);
  return `
Create social media captions for this news story.

Headline: ${title}
Summary: ${summary}

Write all captions entirely in ${langName}. Do not switch to English unless the target language is English.

Respond with JSON:
{
  "twitter": "under 260 chars with 2-3 hashtags",
  "facebook": "2-3 sentences, conversational, link at end",
  "instagram": "engaging caption with 5-8 hashtags, emoji allowed",
  "linkedin": "professional tone, 3-4 sentences, insight-focused",
  "whatsapp": "1-2 sentences, plain text, no hashtags",
  "telegram": "brief headline + 1 sentence summary"
}
`.trim();
}
