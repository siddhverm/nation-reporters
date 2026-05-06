/** BCP-47-ish codes used by Nation Reporters — keep prompts + UI aligned. */
export const LANG_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  gu: 'Gujarati',
  pa: 'Punjabi',
  ur: 'Urdu',
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  id: 'Indonesian',
  ms: 'Malay',
  sw: 'Swahili',
  tr: 'Turkish',
};

export function languageDisplayName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] ?? 'English';
}
