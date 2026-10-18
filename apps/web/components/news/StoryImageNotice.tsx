'use client';

import { getNotices } from '@/lib/ui-notices';
import { isRtlLanguage } from '@/lib/ui-language';
import { useUiLanguage } from '@/lib/use-ui-language';

type Variant = 'below' | 'overlay' | 'badge';

/**
 * Disclosure for AI-generated story images + small-font copyright asterisk note.
 *  - below:   visible lines under the hero image (article page)
 *  - overlay: compact chip inside a large card image (position: absolute, parent must be relative)
 *  - badge:   tiny "AI" mark on thumbnails; full text in title/aria-label
 * `lang` defaults to the reader's UI language.
 */
export default function StoryImageNotice({ lang, variant = 'below', className = '' }: {
  lang?: string; variant?: Variant; className?: string;
}) {
  const uiLang = useUiLanguage();
  const code = lang || uiLang;
  const n = getNotices(code);
  const dir = isRtlLanguage(code) ? 'rtl' : 'ltr';

  if (variant === 'badge') {
    return (
      <span
        data-testid="story-image-badge"
        title={`${n.illustration}\n${n.imageCopyright}`}
        aria-label={n.illustration}
        className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] font-bold leading-3 text-white"
      >
        AI*
      </span>
    );
  }

  if (variant === 'overlay') {
    return (
      <div
        data-testid="story-image-notice"
        lang={code}
        dir={dir}
        className={`pointer-events-none absolute inset-x-2 top-2 max-w-[22rem] rounded bg-black/55 px-1.5 py-1 text-white ${className}`}
      >
        <p className="text-[10px] font-semibold leading-tight">{n.illustration}</p>
        <p className="text-[8px] leading-tight text-white/80">{n.imageCopyright}</p>
      </div>
    );
  }

  return (
    <div data-testid="story-image-notice" lang={code} dir={dir} className={`mt-1.5 ${className}`}>
      <p className="text-xs font-medium text-gray-600">{n.illustration}</p>
      <p data-testid="image-copyright-note" className="text-[10px] leading-snug text-gray-400">{n.imageCopyright}</p>
    </div>
  );
}
