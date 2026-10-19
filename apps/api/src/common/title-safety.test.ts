import { stripPublisherFeedBoilerplate } from './reader-summary.util';
import { classifyDynamicName, containsSourceMention, registerSourceNames, scrubSourceMentions, scrubSourceMentionsInTitle, shrankTooMuch, sourceNameVariants } from './source-scrub.util';
import { sanitizeArticleForPublicResponse, sanitizeArticleListItem } from './article-public-sanitize.util';
import { AiService } from '../modules/ai/ai.service';
import { titleTooShort } from '../modules/ai/rewrite-quality.util';

const FAIRFAX = 'Fairfax gets 15 years to reduce stake in IDBI to 26%';

// Names the production sources table can plausibly hold (842 rows): outlets that are also common words or companies.
const REGISTRY = [
  'Fairfax', 'Fairfax Media', 'fairfax.com.au', 'Mint', 'livemint.com', 'The Hindu', 'thehindu.com', 'Express', 'The Indian Express', 'Times', 'Fortune', 'fortune.com',
  'Wire', 'The Wire', 'thewire.in', 'Scroll', 'Scroll.in', 'Print', 'ThePrint', 'Mirror', 'Daily Mirror', 'Sun', 'The Sun', 'Star', 'Telegraph', 'The Telegraph',
  'Reuters', 'IDBI', 'Stake', 'Financial', 'Square', 'Bloomberg', 'smh', 'SMH',
];

describe('ROOT CAUSE: empty title on "fairfax-gets-15-years-…"', () => {
  it('the body boilerplate stripper (duplicate-headline remover) empties a title that matches the source headline', () => {
    // This is what the pipeline/rewrite script did to the rewritten title (headline = source title).
    expect(stripPublisherFeedBoilerplate(FAIRFAX, FAIRFAX, {})).toBe('');
    expect(stripPublisherFeedBoilerplate('Fairfax gets 15 years to cut IDBI stake to 26%', FAIRFAX, {})).toBe('');
  });
  it('the name scrub never empties it either (even with a source called "Fairfax")', () => {
    registerSourceNames(REGISTRY);
    try {
      expect(scrubSourceMentionsInTitle(FAIRFAX)).toBe(FAIRFAX);
      expect(scrubSourceMentions(FAIRFAX)).toBe(FAIRFAX);
    } finally { registerSourceNames([]); }
  });
});

describe('ambiguous names are only scrubbed in attribution context', () => {
  beforeAll(() => registerSourceNames(REGISTRY));
  afterAll(() => registerSourceNames([]));
  const keep = [
    FAIRFAX,
    'Fairfax Financial Holdings agrees to buy IDBI Bank',
    'Mint prices rise as gold hits record',
    'The government mint will issue a new coin',
    'Hindu pilgrims gather for the festival',
    'Express trains to run on time from Monday',
    'Crowds fill Times Square for New Year',
    'Indian firms join the Fortune 500 list',
    'Police fix a live wire on the street',
    'Scroll down to read the full rules',
    'Print the form and sign it',
    'The car mirror broke in the crash',
    'The Sun rises early in June',
    'A new star is born in the film world',
    'The telegraph office closes after 160 years',
    'Reuters shares fall after weak results',
    'Bloomberg wins the mayoral race',
    'IDBI stake sale gets approval',
  ];
  it.each(keep)('keeps: %s', (t) => {
    expect(scrubSourceMentions(t)).toBe(t);
    expect(scrubSourceMentionsInTitle(t)).toBe(t);
    expect(containsSourceMention(t)).toBe(false);
  });
  it('still scrubs attribution phrases for the same names', () => {
    expect(scrubSourceMentions('According to Fairfax Media, the deal is done.')).toBe('According to a report, the deal is done.');
    expect(scrubSourceMentions('The minister told Reuters the plan is ready.')).toBe('The minister told reporters the plan is ready.');
    expect(scrubSourceMentions('Prices rose, The Hindu reported.')).not.toMatch(/Hindu/);
    expect(scrubSourceMentions('A Fairfax Media report said sales doubled.')).toBe('A report said sales doubled.');
    expect(containsSourceMention('according to Reuters, prices fell')).toBe(true);
    expect(containsSourceMention('Reuters shares fall')).toBe(false);
  });
  it('unique outlet tokens are still removed as bare words (case-sensitive acronyms)', () => {
    expect(scrubSourceMentions('TOI has the story on the bullet.')).not.toMatch(/TOI/);
    expect(scrubSourceMentions('The PTI desk confirmed it.')).not.toMatch(/PTI/);
    expect(scrubSourceMentions('Hindustan Times ran it first.')).not.toMatch(/Hindustan Times/);
    expect(scrubSourceMentions("Je t'aime, toi.")).toBe("Je t'aime, toi.");
    expect(scrubSourceMentions('Ani and Raj went home.')).toBe('Ani and Raj went home.');
    expect(containsSourceMention('Read more on ndtv.com')).toBe(true);
  });
  it('the two original production examples are still cleaned', () => {
    expect(scrubSourceMentions('Fans are worried, with the TOI report suggesting a bullet may have been lodged.')).toBe('Fans are worried, with the report suggesting a bullet may have been lodged.');
    expect(scrubSourceMentions('A hospital note accessed by TOI stated he is stable.')).toBe('A hospital note accessed by reporters stated he is stable.');
  });
});

describe('dynamic (sources table) name classification', () => {
  it.each([
    ['Wire', null], ['Scroll', null], ['Mint', null], ['Star', null], ['Fortune', null], ['Telegraph', null], ['smh', null], ['Top Stories', null],
    ['Fairfax', 'strong'], ['Daily Planet Gazette', 'strong'], ['Fairfax Media', 'strong'], ['thewire.in', 'strong'], ['SMH', 'weak'],
  ])('%s → %s', (n, tier) => expect(classifyDynamicName(n as string)).toBe(tier));
  it('sourceNameVariants extras follow the same rules (theage → ignored bare)', () => {
    const extra = sourceNameVariants('The Age', 'https://www.theage.com.au');
    expect(scrubSourceMentions('The age of AI is here', extra)).toBe('The age of AI is here');
  });
});

describe('titles never collapse', () => {
  it('shrankTooMuch / scrubSourceMentionsInTitle keep the wording when only bare names would be removed', () => {
    expect(shrankTooMuch('', 'abc def')).toBe(true);
    expect(shrankTooMuch('Fairfax gets 15 years', FAIRFAX)).toBe(true);
    expect(scrubSourceMentionsInTitle('Mumbai rains – PTI')).toBe('Mumbai rains');
    expect(scrubSourceMentionsInTitle('PTI')).not.toBe(''); // never empty
    expect(scrubSourceMentionsInTitle('Tiger Shroff hospitalised after stunt, TOI reports')).toBe('Tiger Shroff hospitalised after stunt');
    expect(scrubSourceMentionsInTitle('Flood hits Assam (PTI)')).toBe('Flood hits Assam');
  });
  it('public serializer keeps a title equal to the seoTitle / first body line and never returns an empty title', () => {
    registerSourceNames(REGISTRY);
    try {
      const out = sanitizeArticleForPublicResponse({ id: '1', slug: 'f', language: 'en', title: FAIRFAX, seoTitle: FAIRFAX, excerpt: 'Fairfax Financial Holdings will buy IDBI Bank. The deal is worth billions.', provenance: { sourceName: 'Fairfax', sourceUrl: 'https://fairfax.com.au/x' }, body: { type: 'doc', content: [] } } as never) as any;
      expect(out.title).toBe(FAIRFAX);
      expect(out.seoTitle).toBe(FAIRFAX);
      expect(out.excerpt).toMatch(/^Fairfax Financial Holdings will buy IDBI Bank/);
      const list = sanitizeArticleListItem({ title: FAIRFAX, excerpt: 'x y z', slug: 'f', seoTitle: FAIRFAX } as never) as any;
      expect(list.title).toBe(FAIRFAX);
      expect(list.seoTitle).toBe(FAIRFAX);
    } finally { registerSourceNames([]); }
  });
  it('a story already stored with an empty title gets a derived one (seoTitle → excerpt first sentence)', () => {
    const a = sanitizeArticleForPublicResponse({ id: '2', slug: 'g', language: 'en', title: '', seoTitle: null, excerpt: 'Fairfax Financial Holdings will buy IDBI Bank. It has 15 years to cut its stake.', body: { type: 'doc', content: [] } } as never) as any;
    expect(a.title).toBe('Fairfax Financial Holdings will buy IDBI Bank');
    const b = sanitizeArticleForPublicResponse({ id: '3', slug: 'h', language: 'en', title: '', seoTitle: 'IDBI stake deal approved', excerpt: 'x', body: { type: 'doc', content: [] } } as never) as any;
    expect(b.title).toBe('IDBI stake deal approved');
  });
  it('titleTooShort', () => {
    expect(titleTooShort('')).toBe(true);
    expect(titleTooShort('Fairfax')).toBe(true);
    expect(titleTooShort(FAIRFAX)).toBe(false);
    expect(titleTooShort('日本の新しい首相')).toBe(false);
  });
});

describe('rewrite pipeline keeps a title that stays close to the source headline', () => {
  const body = 'Fairfax Financial Holdings has been given 15 years to reduce its stake in IDBI Bank to 26 per cent after it buys the lender. The Reserve Bank of India approved the deal on Monday. Fairfax will pay about 60,000 crore rupees for a 61 per cent stake.';
  const draft = (title: string) => ({
    title,
    summary: 'Fairfax Financial Holdings is buying IDBI Bank. It must bring its stake down to 26% within 15 years. The RBI said yes on Monday.',
    keyPoints: ['Fairfax is buying a 61 per cent stake in IDBI Bank.', 'It must cut its stake to 26% in 15 years.', 'The deal is worth about 60,000 crore rupees.'],
    short: 'Fairfax is buying IDBI Bank and must cut its stake to 26% in 15 years.',
    medium: 'Fairfax Financial Holdings is buying IDBI Bank. The RBI gave it 15 years to bring its stake down to 26%. It will pay about 60,000 crore rupees.',
    long: 'A Canadian group is set to own most of IDBI Bank.\n\nThe central bank said yes on Monday. Over the next 15 years the buyer has to bring its share down until it holds only 26 per cent.\n\nThe price is close to 60,000 crore rupees, which buys it 61 per cent of the bank.',
    podcastScript: 'Fairfax is buying IDBI Bank.',
    language: 'en',
  });
  function make(responses: any[]) {
    const gemini: any = { lastModelUsed: 'gemini-2.5-flash', generateJson: jest.fn(async () => ({ data: responses.length > 1 ? responses.shift() : responses[0], tokensUsed: 1 })) };
    return { svc: new AiService(gemini, {} as any, { get: () => undefined } as any, {} as any, {} as any), gemini };
  }
  it('rewriteStoredStory: model kept the source headline → title is kept (was "" before the fix)', async () => {
    registerSourceNames(REGISTRY);
    try {
      const close = 'Fairfax gets 15 years to bring IDBI stake down to 26%';
      // before the fix the pipeline's body stripper emptied exactly this kind of title:
      expect(stripPublisherFeedBoilerplate(close, FAIRFAX, {})).toBe('');
      const { svc } = make([draft(close)]);
      const r = await svc.rewriteStoredStory({ title: FAIRFAX, body, language: 'en', publisher: { sourceName: 'Economic Times', sourceUrl: 'https://economictimes.indiatimes.com/x' } });
      expect(r.ok).toBe(true);
      if (r.ok) { expect(r.fields.title).toBe(close); expect(r.fields.seoTitle).toBe(close); expect(r.fields.summary.length).toBeGreaterThan(20); }
    } finally { registerSourceNames([]); }
  });
  it('empty model title → retried; still empty → rejected (draft), never saved empty', async () => {
    const ok = make([draft(''), draft('Fairfax to cut IDBI stake to 26% in 15 years')]);
    const r1 = await ok.svc.rewriteStoredStory({ title: FAIRFAX, body, language: 'en' });
    expect(r1.ok && r1.fields.title).toBe('Fairfax to cut IDBI stake to 26% in 15 years');
    expect(ok.gemini.generateJson).toHaveBeenCalledTimes(2);
    const bad = make([draft('')]);
    const r2 = await bad.svc.rewriteStoredStory({ title: FAIRFAX, body, language: 'en' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.retryable).toBe(false);
  });
});
