import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Nation Reporters', template: '%s | Nation Reporters' },
  description: 'India\'s multilingual digital news network',
  metadataBase: new URL('https://nationreporters.com'),
  openGraph: { siteName: 'Nation Reporters', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
