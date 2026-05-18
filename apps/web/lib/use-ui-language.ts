'use client';

import { useCallback, useEffect, useState } from 'react';
import { getStoredUiLanguage, normalizeUiLanguage } from '@/lib/ui-language';

/** Resolve language from ?lang= / ?language= then localStorage. */
export function resolveUiLanguageFromWindow(): string {
  if (typeof window === 'undefined') return 'en';
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('lang') ?? params.get('language');
  if (fromUrl) return normalizeUiLanguage(fromUrl);
  return getStoredUiLanguage();
}

/**
 * Keeps React state in sync with the navbar picker (`nr-lang` + `nr-lang-change`).
 */
export function useUiLanguage(): string {
  const [lang, setLang] = useState('en');

  const sync = useCallback(() => {
    setLang(resolveUiLanguageFromWindow());
  }, []);

  useEffect(() => {
    sync();
    const onLangChange = (e: Event) => {
      const detail = (e as CustomEvent<{ lang?: string }>).detail?.lang;
      if (detail) {
        setLang(normalizeUiLanguage(detail));
        return;
      }
      sync();
    };
    window.addEventListener('nr-lang-change', onLangChange);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('nr-lang-change', onLangChange);
      window.removeEventListener('popstate', sync);
    };
  }, [sync]);

  return lang;
}
