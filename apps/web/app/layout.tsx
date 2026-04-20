import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Nation Reporters — Breaking News India & World', template: '%s | Nation Reporters' },
  description: 'India\'s AI-powered multilingual digital news network. Breaking news, analysis and in-depth reporting.',
  metadataBase: new URL('https://nationreporters.com'),
  openGraph: {
    siteName: 'Nation Reporters',
    type: 'website',
    images: [{ url: '/logo.png', width: 400, height: 400, alt: 'Nation Reporters' }],
  },
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
