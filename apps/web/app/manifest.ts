import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nation Reporters',
    short_name: 'NationReporters',
    description: 'AI-powered multilingual breaking news from India and the world.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#dc2626',
    icons: [
      { src: '/logo.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
