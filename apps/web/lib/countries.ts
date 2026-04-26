export interface Country {
  code: string;    // ISO 3166-1 alpha-2
  name: string;
  slug: string;    // matches DB region slug
  flag: string;    // emoji flag
  lang: string;    // primary language code
  langName: string;
  region: 'south-asia' | 'north-america' | 'europe' | 'middle-east' | 'east-asia' | 'southeast-asia' | 'oceania' | 'africa' | 'south-america';
}

export const COUNTRIES: Country[] = [
  // South Asia
  { code: 'IN', name: 'India',        slug: 'india',        flag: '🇮🇳', lang: 'hi', langName: 'Hindi/English',    region: 'south-asia' },
  { code: 'PK', name: 'Pakistan',     slug: 'pakistan',     flag: '🇵🇰', lang: 'ur', langName: 'Urdu/English',     region: 'south-asia' },
  { code: 'BD', name: 'Bangladesh',   slug: 'bangladesh',   flag: '🇧🇩', lang: 'bn', langName: 'Bengali',          region: 'south-asia' },
  { code: 'LK', name: 'Sri Lanka',    slug: 'srilanka',     flag: '🇱🇰', lang: 'si', langName: 'Sinhala/English',  region: 'south-asia' },
  { code: 'NP', name: 'Nepal',        slug: 'nepal',        flag: '🇳🇵', lang: 'ne', langName: 'Nepali',           region: 'south-asia' },
  // North America
  { code: 'US', name: 'USA',          slug: 'us',           flag: '🇺🇸', lang: 'en', langName: 'English',          region: 'north-america' },
  { code: 'CA', name: 'Canada',       slug: 'canada',       flag: '🇨🇦', lang: 'en', langName: 'English/French',   region: 'north-america' },
  { code: 'MX', name: 'Mexico',       slug: 'mexico',       flag: '🇲🇽', lang: 'es', langName: 'Spanish',          region: 'north-america' },
  // Europe
  { code: 'GB', name: 'UK',           slug: 'uk',           flag: '🇬🇧', lang: 'en', langName: 'English',          region: 'europe' },
  { code: 'DE', name: 'Germany',      slug: 'germany',      flag: '🇩🇪', lang: 'de', langName: 'German',           region: 'europe' },
  { code: 'FR', name: 'France',       slug: 'france',       flag: '🇫🇷', lang: 'fr', langName: 'French',           region: 'europe' },
  { code: 'ES', name: 'Spain',        slug: 'spain',        flag: '🇪🇸', lang: 'es', langName: 'Spanish',          region: 'europe' },
  { code: 'IT', name: 'Italy',        slug: 'italy',        flag: '🇮🇹', lang: 'it', langName: 'Italian',          region: 'europe' },
  { code: 'NL', name: 'Netherlands',  slug: 'netherlands',  flag: '🇳🇱', lang: 'nl', langName: 'Dutch',            region: 'europe' },
  { code: 'RU', name: 'Russia',       slug: 'russia',       flag: '🇷🇺', lang: 'ru', langName: 'Russian',          region: 'europe' },
  // Middle East
  { code: 'AE', name: 'UAE',          slug: 'uae',          flag: '🇦🇪', lang: 'ar', langName: 'Arabic/English',   region: 'middle-east' },
  { code: 'SA', name: 'Saudi Arabia', slug: 'saudi-arabia', flag: '🇸🇦', lang: 'ar', langName: 'Arabic',           region: 'middle-east' },
  { code: 'QA', name: 'Qatar',        slug: 'qatar',        flag: '🇶🇦', lang: 'ar', langName: 'Arabic/English',   region: 'middle-east' },
  { code: 'TR', name: 'Turkey',       slug: 'turkey',       flag: '🇹🇷', lang: 'tr', langName: 'Turkish',          region: 'middle-east' },
  { code: 'EG', name: 'Egypt',        slug: 'egypt',        flag: '🇪🇬', lang: 'ar', langName: 'Arabic',           region: 'middle-east' },
  // East Asia
  { code: 'CN', name: 'China',        slug: 'china',        flag: '🇨🇳', lang: 'zh', langName: 'Chinese',          region: 'east-asia' },
  { code: 'JP', name: 'Japan',        slug: 'japan',        flag: '🇯🇵', lang: 'ja', langName: 'Japanese',         region: 'east-asia' },
  { code: 'KR', name: 'South Korea',  slug: 'south-korea',  flag: '🇰🇷', lang: 'ko', langName: 'Korean',           region: 'east-asia' },
  // Southeast Asia
  { code: 'SG', name: 'Singapore',    slug: 'singapore',    flag: '🇸🇬', lang: 'en', langName: 'English',          region: 'southeast-asia' },
  { code: 'MY', name: 'Malaysia',     slug: 'malaysia',     flag: '🇲🇾', lang: 'ms', langName: 'Malay/English',    region: 'southeast-asia' },
  { code: 'ID', name: 'Indonesia',    slug: 'indonesia',    flag: '🇮🇩', lang: 'id', langName: 'Indonesian',       region: 'southeast-asia' },
  // Oceania
  { code: 'AU', name: 'Australia',    slug: 'australia',    flag: '🇦🇺', lang: 'en', langName: 'English',          region: 'oceania' },
  { code: 'NZ', name: 'New Zealand',  slug: 'newzealand',   flag: '🇳🇿', lang: 'en', langName: 'English',          region: 'oceania' },
  // Africa
  { code: 'ZA', name: 'South Africa', slug: 'south-africa', flag: '🇿🇦', lang: 'en', langName: 'English',          region: 'africa' },
  { code: 'NG', name: 'Nigeria',      slug: 'nigeria',      flag: '🇳🇬', lang: 'en', langName: 'English',          region: 'africa' },
  { code: 'KE', name: 'Kenya',        slug: 'kenya',        flag: '🇰🇪', lang: 'en', langName: 'English/Swahili',  region: 'africa' },
  // South America
  { code: 'BR', name: 'Brazil',       slug: 'brazil',       flag: '🇧🇷', lang: 'pt', langName: 'Portuguese',       region: 'south-america' },
  { code: 'AR', name: 'Argentina',    slug: 'argentina',    flag: '🇦🇷', lang: 'es', langName: 'Spanish',          region: 'south-america' },
  { code: 'CO', name: 'Colombia',     slug: 'colombia',     flag: '🇨🇴', lang: 'es', langName: 'Spanish',          region: 'south-america' },
];

export const REGION_LABELS: Record<string, string> = {
  'south-asia':     '🌏 South Asia',
  'north-america':  '🌎 North America',
  'europe':         '🌍 Europe',
  'middle-east':    '🕌 Middle East',
  'east-asia':      '🌏 East Asia',
  'southeast-asia': '🌏 SE Asia',
  'oceania':        '🌊 Oceania',
  'africa':         '🌍 Africa',
  'south-america':  '🌎 South America',
};

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export const COUNTRY_BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]));

export const SUPPORTED_APP_LANGUAGES = [
  'en', 'hi', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'pa', 'ur',
  'ar', 'fr', 'de', 'es', 'pt', 'ru', 'zh', 'ja', 'ko', 'id', 'tr', 'it',
] as const;

const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_APP_LANGUAGES);

const COUNTRY_EXTRA_LANGS: Record<string, string[]> = {
  IN: ['hi', 'mr', 'bn', 'te', 'ta', 'gu', 'kn', 'pa', 'ur'],
  CA: ['fr'],
  PK: ['ur'],
  BD: ['bn'],
  AE: ['ar'],
  SA: ['ar'],
  QA: ['ar'],
  EG: ['ar'],
  MX: ['es'],
  ES: ['es'],
  AR: ['es'],
  CO: ['es'],
  BR: ['pt'],
  FR: ['fr'],
  DE: ['de'],
  RU: ['ru'],
  CN: ['zh'],
  JP: ['ja'],
  KR: ['ko'],
  ID: ['id'],
  TR: ['tr'],
  IT: ['it'],
};

export function getCountryLanguageCodes(country: Country | null): string[] {
  if (!country) return ['en'];
  const out = new Set<string>(['en']);
  if (SUPPORTED_LANGUAGE_SET.has(country.lang)) out.add(country.lang);
  for (const code of COUNTRY_EXTRA_LANGS[country.code] ?? []) {
    if (SUPPORTED_LANGUAGE_SET.has(code)) out.add(code);
  }
  return [...out];
}

export function resolveCountryDefaultLanguage(country: Country | null, availability?: Record<string, boolean>): string {
  if (!country) return 'en';
  const preferred = SUPPORTED_LANGUAGE_SET.has(country.lang) ? country.lang : 'en';
  if (!availability) return preferred;
  if (availability[preferred]) return preferred;
  if (availability.en) return 'en';
  return preferred;
}

// Detect country from browser language
export function detectCountryFromBrowser(): string {
  if (typeof window === 'undefined') return 'IN';
  const stored = localStorage.getItem('nr-country');
  if (stored) return stored;
  const lang = navigator.language || 'en';
  const langMap: Record<string, string> = {
    'hi': 'IN', 'mr': 'IN', 'bn': 'BD', 'te': 'IN', 'ta': 'IN',
    'gu': 'IN', 'kn': 'IN', 'pa': 'IN', 'ur': 'PK',
    'de': 'DE', 'fr': 'FR', 'es': 'ES', 'it': 'IT',
    'pt': 'BR', 'ar': 'AE', 'zh': 'CN', 'ja': 'JP', 'ko': 'KR',
    'ru': 'RU', 'nl': 'NL', 'ms': 'MY', 'id': 'ID',
    'en-US': 'US', 'en-GB': 'GB', 'en-AU': 'AU', 'en-CA': 'CA',
  };
  return langMap[lang] ?? langMap[lang.split('-')[0]] ?? 'IN';
}
