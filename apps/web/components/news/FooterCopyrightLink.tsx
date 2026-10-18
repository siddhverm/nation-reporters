'use client';

import Link from 'next/link';
import { getNotices } from '@/lib/ui-notices';
import { useUiLanguage } from '@/lib/use-ui-language';

export default function FooterCopyrightLink() {
  const lang = useUiLanguage();
  return (
    <Link href="/copyright" lang={lang} className="hover:text-slate-300 transition-colors">
      {getNotices(lang).copyrightLink}
    </Link>
  );
}
