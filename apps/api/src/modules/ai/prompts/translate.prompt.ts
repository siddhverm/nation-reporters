import { languageDisplayName } from './lang-names';

export function translatePrompt(text: string, fromLang: string, toLang: string) {
  return `
Translate the following news article from ${languageDisplayName(fromLang)} to ${languageDisplayName(toLang)}.
Preserve the journalistic tone and factual accuracy.
Adapt idioms and cultural references appropriately for the target audience.
Do not add or remove factual information.
Do not add the original publisher's name, author bylines, image credits or source links.

Text to translate:
${text}
`.trim();
}
