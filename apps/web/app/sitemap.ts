import { MetadataRoute } from 'next';

const BASE = 'https://nationreporters.com';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    { url: `${BASE}/india`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE}/world`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE}/politics`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE}/business`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE}/sports`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.8 },
  ];
}
