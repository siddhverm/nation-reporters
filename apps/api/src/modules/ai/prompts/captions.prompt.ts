const LANG_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', bn: 'Bengali',
  ta: 'Tamil', te: 'Telugu', kn: 'Kannada', gu: 'Gujarati', pa: 'Punjabi',
  ur: 'Urdu', ar: 'Arabic', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  id: 'Indonesian', ms: 'Malay', sw: 'Swahili',
};

export function captionsPrompt(title: string, summary: string, targetLang = 'en') {
  const langName = LANG_NAMES[targetLang] ?? 'English';
  return `
Create social media captions for this news story.

Headline: ${title}
Summary: ${summary}

Write all captions in ${langName}.

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
