import type { Metadata } from 'next';
import CopyrightContent from './CopyrightContent';
import { resolveCopyrightEmail } from '@/lib/copyright-email';

// Read COPYRIGHT_EMAIL at request time so it can be set in the runtime env without a rebuild.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Copyright & complaints',
  description: 'How to report a copyright concern or request removal of text or an image.',
};

export default function CopyrightPage() {
  return <CopyrightContent email={resolveCopyrightEmail()} />;
}
