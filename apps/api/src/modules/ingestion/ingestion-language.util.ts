import { normalizeLanguageCode } from '../ai/language-resolution.util';
import { detectFeedSourceLanguage } from './source-language.util';

/** Source row shape used during RSS ingestion. */
export type IngestionSourceLanguageInput = {
  name: string;
  language?: string | null;
};

/**
 * Canonical language for a feed: explicit DB code wins; otherwise infer from source name.
 * Never treat missing/`en` placeholder as “force English” when the name says Marathi/Bengali/etc.
 */
export function resolveSourceFeedLanguage(source: IngestionSourceLanguageInput): string {
  const fromDb = (source.language ?? '').trim().toLowerCase();
  const inferred = normalizeLanguageCode(detectFeedSourceLanguage(source.name));
  if (!fromDb) return inferred;
  const norm = normalizeLanguageCode(fromDb);
  // Rows that were defaulted to `en` before migration but name is clearly regional.
  if (norm === 'en' && inferred !== 'en') return inferred;
  return norm;
}
