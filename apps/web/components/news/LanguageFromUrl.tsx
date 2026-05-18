'use client';

import { useEffect } from 'react';
import { SUPPORTED_APP_LANGUAGES } from '@/lib/countries';
import { getStoredUiLanguage, normalizeUiLanguage } from '@/lib/ui-language';

const ALLOWED = new Set<string>(SUPPORTED_APP_LANGUAGES);

/**
 * Honors `?lang=bn` / `?language=pa` on any public URL — mirrors into `nr-lang` so fetches match.
 * Removes the param after apply (replaceState) to avoid stale bookmarks fighting the picker.
 */
export function LanguageFromUrl() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('lang') ?? params.get('language');
    if (!raw) return;
    const code = raw.toLowerCase().split(/[-_]/)[0];
    if (!ALLOWED.has(code)) return;
    const prev = normalizeUiLanguage(getStoredUiLanguage());
    localStorage.setItem('nr-lang', code);
    params.delete('lang');
    params.delete('language');
    const q = params.toString();
    const path = `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new CustomEvent('nr-lang-change', { detail: { lang: code } }));
    if (prev !== code) {
      window.location.reload();
    }
  }, []);
  return null;
}
