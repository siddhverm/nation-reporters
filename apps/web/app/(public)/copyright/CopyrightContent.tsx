'use client';

import { getNotices } from '@/lib/ui-notices';
import { isRtlLanguage } from '@/lib/ui-language';
import { useUiLanguage } from '@/lib/use-ui-language';

export default function CopyrightContent({ email }: { email: string }) {
  const lang = useUiLanguage();
  const n = getNotices(lang);
  return (
    <div lang={lang} dir={isRtlLanguage(lang) ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto px-4 py-10" data-testid="copyright-page">
      <h1 className="text-3xl font-black text-navy mb-4">{n.cpTitle}</h1>
      <p className="text-gray-700 mb-4 leading-relaxed">{n.cpAi}</p>
      <p data-testid="copyright-statement" className="text-sm text-gray-600 mb-4 leading-relaxed">{n.imageCopyright}</p>
      <p className="text-gray-700 mb-2 leading-relaxed">{n.cpHow}</p>
      <p>
        <a data-testid="copyright-email" href={`mailto:${email}`} className="text-brand font-semibold hover:underline" dir="ltr">{email}</a>
      </p>
    </div>
  );
}
