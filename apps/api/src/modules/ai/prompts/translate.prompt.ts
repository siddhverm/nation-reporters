import { languageDisplayName } from './lang-names';

export type TranslatePromptOptions = {
  /** Keep the plain-language style when translating simplified news. */
  keepSimple?: boolean;
};

/** Translate between any two supported languages (not only en/hi); output is the translation only. */
export function translatePrompt(text: string, fromLang: string, toLang: string, opts: TranslatePromptOptions = {}) {
  const from = languageDisplayName(fromLang);
  const to = languageDisplayName(toLang);
  return `
Translate the following news text from ${from} (${fromLang.toLowerCase()}) to ${to} (${toLang.toLowerCase()}).
Write the whole output in ${to}, using its natural script and punctuation; do not leave sentences in ${from} or English.
Preserve the journalistic, neutral tone and full factual accuracy. Keep every number, date, amount, place and name exactly (transliterate names into ${to} where that is normal usage).
Adapt idioms and cultural references so they read naturally to ${to} readers.${opts.keepSimple ? ' Keep the sentences short and the vocabulary simple.' : ''}
Do not add or remove factual information. Do not add the original publisher's name, author bylines, image credits or source links; if the text contains them, leave them out.
Return ONLY the translated text, no notes, no labels, no quotation marks around it.

Text to translate:
${text}
`.trim();
}
