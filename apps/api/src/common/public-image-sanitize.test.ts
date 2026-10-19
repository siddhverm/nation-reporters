import {
  publicMediaAssets, sanitizeArticleForPublicResponse, sanitizeArticleListItem, stripInternalFields,
} from './article-public-sanitize.util';

const article = {
  title: 'Floods hit city',
  slug: 'floods-hit-city',
  language: 'en',
  excerpt: 'Heavy rain flooded roads.',
  body: { type: 'doc', imageUrl: 'https://cdn.dailyplanet-gazette.example/p.jpg', imageCredit: 'Photo: Daily Planet Gazette', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Heavy rain flooded roads across the city.' }] }] },
  mediaAssets: [
    { id: 'm1', type: 'IMAGE', url: 'https://cdn.dailyplanet-gazette.example/p.jpg', s3Key: 'external/1/source-image', scanStatus: 'external' },
    { id: 'm2', type: 'IMAGE', url: '/story-image/floods-hit-city', s3Key: 'generated/images/1.png', scanStatus: 'generated' },
    { id: 'm3', type: 'VIDEO', url: 'https://www.youtube.com/watch?v=abc', s3Key: 'external/1/source-video' },
    { id: 'm4', type: 'VIDEO', url: 'http://minio/own.mp4', s3Key: 'videos/own.mp4' },
  ],
  provenance: { sourceName: 'Daily Planet Gazette', sourceUrl: 'https://dailyplanet-gazette.example/a' },
  riskAssessment: { score: 3 }, authorId: 'u1', ingestedArticleId: 'i1', versions: [{ title: 'Daily Planet Gazette: raw' }],
};

describe('public image/media sanitization', () => {
  const out = sanitizeArticleForPublicResponse(article as never) as any;
  it('never exposes the publisher image URL/domain, credit, storage keys or source video', () => {
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/dailyplanet|youtube|external\/|source-image|source-video|Photo:/i);
    expect(out.body.imageUrl).toBe('/story-image/floods-hit-city');
    expect(out.body.imageCredit).toBeUndefined();
    expect(out.body.imageGenerated).toBe(true);
  });
  it('exposes exactly one image asset (generated URL) and keeps own video', () => {
    expect(out.mediaAssets.filter((m: any) => m.type === 'IMAGE')).toHaveLength(1);
    expect(out.mediaAssets.find((m: any) => m.type === 'IMAGE').url).toBe('/story-image/floods-hit-city');
    expect(out.mediaAssets.filter((m: any) => m.type === 'VIDEO').map((m: any) => m.id)).toEqual(['m4']);
    expect(out.mediaAssets.every((m: any) => m.s3Key === undefined)).toBe(true);
  });
  it('every article gets an image reference even when it has no stored asset', () => {
    const bare = sanitizeArticleForPublicResponse({ ...article, mediaAssets: [], body: undefined } as never) as any;
    expect(bare.image).toEqual({ url: '/story-image/floods-hit-city', alt: 'Illustration for: Floods hit city', origin: 'generated' });
  });
  it('list items drop raw media rows and carry the image reference', () => {
    const item = sanitizeArticleListItem({ title: 'Daily Planet Gazette: Floods hit city', excerpt: 'Heavy rain flooded roads.', slug: article.slug, language: 'en', provenance: article.provenance, mediaAssets: article.mediaAssets } as never) as any;
    expect(item.mediaAssets.map((m: any) => m.id)).toEqual(['m4']); // own video only, no image rows / external video
    expect(item.provenance).toBeUndefined();
    expect(JSON.stringify(item)).not.toMatch(/dailyplanet|youtube|external\/|Daily Planet/i);
    expect(item.image.url).toBe('/story-image/floods-hit-city');
  });
  it('stripInternalFields removes editorial internals for anonymous readers', () => {
    const pub = stripInternalFields(out) as any;
    for (const k of ['riskAssessment', 'authorId', 'ingestedArticleId', 'versions', 'provenance']) expect(pub[k]).toBeUndefined();
  });
  it('publicMediaAssets without an image reference drops all IMAGE rows', () => {
    expect(publicMediaAssets(article.mediaAssets).some((m) => m.type === 'IMAGE')).toBe(false);
  });
});

describe('key points (bullet summary) are cleaned like any public text', () => {
  it('removes outlet names/labels from bullets and drops empties', () => {
    const out = sanitizeArticleForPublicResponse({
      title: 'Metro line', slug: 'metro-line', language: 'en',
      body: { type: 'doc', content: [], keyPoints: ['The line opens in 2028 — via Daily Planet Gazette', 'Daily Planet Gazette', 'It costs 12,500 crore rupees.'] },
      provenance: { sourceName: 'Daily Planet Gazette', sourceUrl: 'https://dailyplanet-gazette.example/a' },
    } as never) as any;
    expect(out.body.keyPoints).toEqual(['The line opens in 2028', 'It costs 12,500 crore rupees.']);
  });
});
