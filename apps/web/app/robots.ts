import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/cms/', '/api/', '/reporter/', '/editor/', '/admin/'] }],
    sitemap: 'https://nationreporters.com/sitemap.xml',
  };
}
