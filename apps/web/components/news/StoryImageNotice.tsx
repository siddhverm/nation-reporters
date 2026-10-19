'use client';

import { getNotices } from '@/lib/ui-notices';
import { isRtlLanguage } from '@/lib/ui-language';
import { useUiLanguage } from '@/lib/use-ui-language';
import type { ImageOrigin } from '@/lib/news-image';

type Variant = 'below' | 'overlay' | 'badge';

/**
 * Notice for a story picture; which text appears depends on where the picture comes from:
 *  - origin 'source'    -> ONLY the small copyright note ("* We do not own the copyright of this image. ...")
 *  - origin 'generated' -> ONLY the "Illustration (AI-generated)" label
 * Variants:
 *  - below:   visible lines under the hero image (article page)
 *  - overlay: compact chip inside a large card image (position: absolute, parent must be relative)
 *  - badge:   tiny mark on thumbnails ("AI*" for generated, "*" for source); full text in title/aria-label
 * `lang` defaults to the reader's UI language.
 */
export default function StoryImageNotice({ lang, origin = 'generated', variant = 'below', className = '' }: {
  lang?: string; origin?: ImageOrigin; variant?: Variant; className?: string;
}) {
  const uiLang = useUiLanguage();
  const code = lang || uiLang;
  const n = getNotices(code);
  const dir = isRtlLanguage(code) ? 'rtl' : 'ltr';
  const isSource = origin === 'source';
  const text = isSource ? n.imageCopyright : n.illustration;

  if (variant === 'badge') {
    return (
      <span
        data-testid="story-image-badge"
        data-origin={origin}
        title={text}
        aria-label={text}
        className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[8px] font-bold leading-3 text-white"
      >
        {isSource ? '*' : 'AI*'}
      </span>
    );
  }

  if (variant === 'overlay') {
    return (
      <div
        data-testid="story-image-notice"
        data-origin={origin}
        lang={code}
        dir={dir}
        className={`pointer-events-none absolute inset-x-2 top-2 max-w-[22rem] rounded bg-black/55 px-1.5 py-1 text-white ${className}`}
      >
        {isSource
          ? <p data-testid="image-copyright-note" className="text-[8px] leading-tight text-white/90">{text}</p>
          : <p data-testid="ai-illustration-label" className="text-[10px] font-semibold leading-tight">{text}</p>}
      </div>
    );
  }

  return (
    <div data-testid="story-image-notice" data-origin={origin} lang={code} dir={dir} className={`mt-1.5 ${className}`}>
      {isSource
        ? <p data-testid="image-copyright-note" className="text-[10px] leading-snug text-gray-400">{text}</p>
        : <p data-testid="ai-illustration-label" className="text-xs font-medium text-gray-600">{text}</p>}
    </div>
  );
}
