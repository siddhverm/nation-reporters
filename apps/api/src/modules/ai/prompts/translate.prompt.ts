export function translatePrompt(text: string, fromLang: string, toLang: string) {
  const langNames: Record<string, string> = { en: 'English', hi: 'Hindi' };
  return `
Translate the following news article from ${langNames[fromLang] ?? fromLang} to ${langNames[toLang] ?? toLang}.
Preserve the journalistic tone and factual accuracy.
Adapt idioms and cultural references appropriately for the target audience.
Do not add or remove factual information.

Text to translate:
${text}
`.trim();
}
