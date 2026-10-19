import { sanitizeArticleForPublicResponse, sanitizeArticleListItem, sanitizeTextForPublic } from './article-public-sanitize.util';
import { registerSourceNames } from './source-scrub.util';

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const BAD = /\b(TOI|TNN|PTI|Times of India|Reuters|Daily Planet)\b/i;

function tigerStory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1', slug: 'tiger-shroff-hospital-1', language: 'en', title: 'Tiger Shroff hospitalised after stunt, TOI reports',
    excerpt: 'According to TOI, the actor is stable.',
    bodyShort: 'The TOI report suggesting a bullet may have been lodged worried fans.',
    bodyMedium: 'A hospital note accessed by TOI stated that he was stable. (PTI)',
    seoTitle: 'Tiger Shroff update | Times of India', seoDescription: 'Reuters said he is fine.',
    podcastScript: 'Today: TOI reported that the actor is stable.',
    hashtags: ['#TigerShroff'],
    provenance: { sourceName: 'Times of India - Entertainment', sourceUrl: 'https://timesofindia.indiatimes.com/x' },
    body: {
      type: 'doc',
      content: [
        para('Fans are worried, with the TOI report suggesting a bullet may have been lodged in his leg.'),
        para('A hospital note accessed by TOI stated that he was stable.'),
        para('Edited by Rohan Mehta / TNN / Oct 18, 2026'),
        para('Download the TOI app for more'),
      ],
      keyPoints: ['TOI reported that he is stable and will leave in two days.'],
      aiVideo: { title: 'Tiger update', summary: 'According to TOI, he is fine.', narration: 'Reuters reported the actor is fine.', status: 'ready' },
    },
    socialCaptions: [{ platform: 'TWITTER', caption: 'He is fine, TOI said.' }],
    ...overrides,
  };
}

describe('read-time scrub of publisher mentions (all existing stories are cleaned on the way out)', () => {
  it('cleans title, excerpt, bodyShort/Medium, SEO, podcastScript, TipTap text, key points, aiVideo, captions', () => {
    const out = sanitizeArticleForPublicResponse(tigerStory() as never) as Record<string, any>;
    const everything = JSON.stringify(out);
    expect(everything).not.toMatch(BAD);
    expect(out.bodyShort).toBe('The report suggesting a bullet may have been lodged worried fans.');
    expect(out.bodyMedium).toBe('A hospital note accessed by reporters stated that he was stable.');
    expect(out.body.content[0].content[0].text).toBe('Fans are worried, with the report suggesting a bullet may have been lodged in his leg.');
    expect(out.body.content[1].content[0].text).toBe('A hospital note accessed by reporters stated that he was stable.');
    expect(out.body.content.map((p: any) => p.content?.[0]?.text).join('|')).not.toMatch(/Edited by|Download/);
    expect(out.image.alt).not.toMatch(BAD);
  });

  it('cleans publisher names that only the sources table knows (registry) without provenance', () => {
    registerSourceNames(['Daily Planet Gazette']);
    try {
      const out = sanitizeArticleForPublicResponse({ id: 'a2', slug: 's', language: 'en', title: 'Flood hits town', excerpt: 'According to the Daily Planet Gazette, a flood hit the town.', body: { type: 'doc', content: [para('The Daily Planet Gazette reported that roads were closed.')] } } as never) as Record<string, any>;
      expect(JSON.stringify(out)).not.toMatch(/Daily Planet/);
      expect(out.excerpt).toBe('According to a report, a flood hit the town.');
      expect(out.body.content[0].content[0].text).toBe('Reports said that roads were closed.');
    } finally { registerSourceNames([]); }
  });

  it('list items (cards / feed API) are cleaned too', () => {
    const out = sanitizeArticleListItem(tigerStory({ body: undefined }) as never) as Record<string, any>;
    expect(JSON.stringify(out)).not.toMatch(BAD);
    expect(out.excerpt).toBe('According to a report, the actor is stable.');
  });

  it('drops raw scraped page text left in stored bodies (menus, trending, join conversation, after End of Article)', () => {
    const story = 'Actor Tiger Shroff was taken to a hospital on Friday after he felt pain in his leg during a stunt. Doctors said he is stable and will be discharged in two days.';
    const raw = tigerStory({
      body: { type: 'doc', content: [para('Home'), para('India'), para('World'), para('Sign In'), para(story), para('End of Article'), para('Trending Stories'), para('Join conversation'), para('Video: stunt gone wrong')] },
      bodyMedium: `${story} Trending Stories Join conversation Download the app`,
    });
    const out = sanitizeArticleForPublicResponse(raw as never) as Record<string, any>;
    const texts = out.body.content.map((p: any) => p.content[0].text).join('\n');
    expect(texts).toBe(story);
    expect(out.bodyMedium).toBe(story);
  });

  it('sanitizeTextForPublic (social posts / push text) scrubs mentions', () => {
    expect(sanitizeTextForPublic('Tiger Shroff is stable, says TOI report')).not.toMatch(/TOI/);
    expect(sanitizeTextForPublic('He told Reuters he is fine.')).toBe('He told reporters he is fine.');
  });
});
