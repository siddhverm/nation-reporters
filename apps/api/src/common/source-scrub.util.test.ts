import {
  filterSourceHashtags, containsSourceMention, registerSourceNames, scrubSourceMentions, scrubSourceMentionsDeep, sourceNameVariants,
} from './source-scrub.util';

const s = (t: string | null, extra: string[] = []) => scrubSourceMentions(t, extra);

describe('scrubSourceMentions — attribution phrases stay grammatical', () => {
  const cases: Array<[string, string]> = [
    // the two production examples
    ['Fans are worried, with the TOI report suggesting a bullet may have been lodged in his leg.', 'Fans are worried, with the report suggesting a bullet may have been lodged in his leg.'],
    ['A hospital note accessed by TOI stated that he was stable.', 'A hospital note accessed by reporters stated that he was stable.'],
    // according to / as per
    ['According to TOI, the actor was discharged on Friday.', 'According to a report, the actor was discharged on Friday.'],
    ['The deal is worth $2 billion, according to Reuters.', 'The deal is worth $2 billion, according to a report.'],
    ['as per PTI, the minister will visit on Monday', 'as per reports, the minister will visit on Monday'],
    ['According to a Times of India report, rain is expected.', 'According to a report, rain is expected.'],
    ['According to NDTV\'s report the bridge collapsed.', 'According to a report the bridge collapsed.'],
    // noun phrases
    ['A TOI report said the vote was close.', 'A report said the vote was close.'],
    ['An NDTV report claims prices fell.', 'A report claims prices fell.'],
    ['The Hindustan Times story named three suspects.', 'The story named three suspects.'],
    ["India Today's investigation found gaps.", 'The investigation found gaps.'],
    ['In an interview with NDTV, she denied it.', 'In an interview, she denied it.'],
    // subject verbs
    ['TOI reported that a bullet was found.', 'Reports said that a bullet was found.'],
    ['The deal was closed, Reuters reported.', 'The deal was closed, reports said.'],
    ['PTI said the talks failed.', 'Reports said the talks failed.'],
    ['NDTV has reported that the flight was delayed.', 'Reports said that the flight was delayed.'],
    ['Hindustan Times quoted him as saying he would resign.', 'Reports quoted him as saying he would resign.'],
    ['Reuters says exports rose 4%.', 'Reports say exports rose 4%.'],
    // told / spoke to
    ['He told TOI that he was fine.', 'He told reporters that he was fine.'],
    ['Speaking to NDTV, the coach said the team was ready.', 'Speaking to reporters, the coach said the team was ready.'],
    ["She told TOI's reporter she was unhurt.", 'She told a reporter she was unhurt.'],
    ['A TOI correspondent saw the crowd.', 'A correspondent saw the crowd.'],
    ['Sources told the BBC the plan was dropped.', 'Sources told reporters the plan was dropped.'],
    // passive
    ['The footage was first reported by Hindustan Times.', 'The footage was first reported by the media.'],
    ['The letter was seen by Reuters.', 'The letter was seen by reporters.'],
    ['The memo, obtained by CNN, lists five names.', 'The memo, obtained by reporters, lists five names.'],
  ];
  it.each(cases)('%s', (input, expected) => {
    expect(s(input)).toBe(expected);
  });
});

describe('scrubSourceMentions — headlines and staff credits', () => {
  it('drops a trailing "<outlet> reports" from headlines', () => {
    expect(s('Tiger Shroff hospitalised after stunt, TOI reports')).toBe('Tiger Shroff hospitalised after stunt');
    expect(s('Metro line cleared - NDTV report')).toBe('Metro line cleared');
  });
  it('drops "reporter at <outlet>" credits', () => {
    expect(s('Rohan Mehta, senior reporter at TOI, covers crime.')).not.toMatch(/TOI/);
    expect(s('Kiran Rao\nCorrespondent with Reuters')).toBe('Kiran Rao');
  });
  it('a real article paragraph keeps its meaning', () => {
    const p = 'Tiger Shroff was rushed to hospital on Friday. A hospital note accessed by TOI stated that he had pain in his leg, with the TOI report suggesting a bullet may have been lodged. Doctors told TOI that he is stable, PTI added.';
    expect(s(p)).toBe('Tiger Shroff was rushed to hospital on Friday. A hospital note accessed by reporters stated that he had pain in his leg, with the report suggesting a bullet may have been lodged. Doctors told reporters that he is stable, reports added.');
  });
});

describe('scrubSourceMentions — credits, datelines, promos', () => {
  it('drops parenthetical agency credits', () => {
    expect(s('The minister resigned (PTI).')).toBe('The minister resigned.');
    expect(s('Talks resumed on Monday (Reuters) and ended quickly.')).toBe('Talks resumed on Monday and ended quickly.');
    expect(s('Shares fell 2% [PTI] on Tuesday.')).toBe('Shares fell 2% on Tuesday.');
    expect(s('The pact was signed (PTI/IANS).')).toBe('The pact was signed.');
    expect(s('Rain hit the city (TOI.com).')).toBe('Rain hit the city.');
  });
  it('turns datelines into plain datelines', () => {
    expect(s('MUMBAI (PTI) - The market opened higher.')).toBe('MUMBAI: The market opened higher.');
    expect(s('NEW DELHI (Reuters) – India cut rates.')).toBe('NEW DELHI: India cut rates.');
  });
  it('drops trailing bylines and credits', () => {
    expect(s('The match was washed out. – TNN')).toBe('The match was washed out.');
    expect(s('The match was washed out. | PTI')).toBe('The match was washed out.');
    expect(s('The match was washed out.\n- TNN\nNext paragraph.')).toBe('The match was washed out.\nNext paragraph.');
    expect(s('Prices rose sharply, PTI')).toBe('Prices rose sharply');
  });
  it('drops whole credit / promo lines', () => {
    const body = ['The crash happened at 6 pm.', 'Edited by Rohan Mehta / TNN / Oct 18, 2026, 10:30 IST', 'Download the TOI app for more', 'TOI community guidelines', 'TNN', '(PTI)', 'Photo: Reuters', 'Source: PTI', 'Police are investigating.'].join('\n');
    expect(s(body)).toBe('The crash happened at 6 pm.\nPolice are investigating.');
  });
  it('removes only the promo sentence from a long paragraph', () => {
    const para = 'The minister said the new rules would apply from April, covering all states and territories without exception, and added that districts would get time to adjust. Download the TOI app to get breaking news alerts. Officials will publish the full list next week.';
    const out = s(para);
    expect(out).toContain('The minister said');
    expect(out).toContain('Officials will publish');
    expect(out).not.toMatch(/TOI|Download/);
  });
  it('removes via / source / credit tags', () => {
    expect(s('The clip went viral (via NDTV).')).toBe('The clip went viral.');
    expect(s('A statement was issued. Source: PTI')).not.toMatch(/PTI/);
  });
});

describe('scrubSourceMentions — safety (no mangling)', () => {
  it('is case-insensitive for strong names', () => {
    expect(s('ACCORDING TO TOI, it rained')).toBe('According to a report, it rained');
    expect(s('according to Reuters, it rained')).toBe('according to a report, it rained');
    expect(s('according to toi, it rained')).toBe('according to toi, it rained'); // acronyms are case-sensitive
    expect(s('ACCORDING TO REUTERS, it rained')).not.toMatch(/reuters/i);
  });
  it('respects word boundaries', () => {
    const t = 'The automotive sector, the toilet shortage and the stoic coach pointed to antioxidants in anita\'s tea.';
    expect(s(t)).toBe(t);
    expect(s('The word "apple" and Chapter 5 mention happy people at HTML class.')).toContain('apple');
    expect(s('Citizens of Toitoi village met.')).toBe('Citizens of Toitoi village met.');
  });
  it('does not touch Hindu as a religion or weak words in normal use', () => {
    const t = 'The Hindu festival of Diwali is celebrated by every Hindu family. The Express train and the local tribune were late. A mint of coins was found.';
    expect(s(t)).toBe(t);
    expect(s('Andhra Pradesh (AP) government met. Visakhapatnam, AP')).not.toMatch(/ news outlet/);
  });
  it('weak names are neutralised only in attribution context (case-sensitive)', () => {
    expect(s('According to The Hindu, the dam is full.')).toBe('According to a report, the dam is full.');
    expect(s('He told The Hindu that he would retire.')).toBe('He told reporters that he would retire.');
    expect(s('AP reported the strike ended.')).toBe('Reports said the strike ended.');
    expect(s('The Mint report said inflation rose.')).toBe('The report said inflation rose.');
    expect(s('Michael Bloomberg donated funds.')).toBe('Michael Bloomberg donated funds.');
  });
  it('neutralises names inside quotes of other people', () => {
    expect(s('He said: "I read it on Reuters and was shocked."')).not.toMatch(/Reuters/);
  });
  it('fallback keeps the sentence readable', () => {
    expect(s('The crowd gathered outside the TOI office.')).toBe('The crowd gathered outside the news outlet office.');
    expect(s("TOI's bureau in Pune was closed.")).toBe('The news team in Pune was closed.');
    expect(s("The TOI's decision surprised many.")).toBe("The outlet's decision surprised many.");
  });
  it('handles empty / non-attributing text unchanged', () => {
    expect(s('')).toBe('');
    expect(s(null)).toBe('');
    expect(s('Prices rose 3% in March, officials said.')).toBe('Prices rose 3% in March, officials said.');
  });
  it('is idempotent', () => {
    const once = s('According to TOI, a hospital note accessed by TOI stated X (PTI).');
    expect(s(once)).toBe(once);
  });
  it('never leaves a known name behind', () => {
    const tricky = [
      'TOI/PTI reported the story. TOI, citing sources, said more. Reuters and AFP agreed with TNN.',
      'Posted by TOI | NDTV | Hindustan Times',
      'timesofindia.indiatimes.com carried it; see ndtv.com.',
    ];
    for (const t of tricky) expect(containsSourceMention(s(t))).toBe(false);
  });
});

describe('scrubSourceMentions — dynamic names from the sources table', () => {
  afterEach(() => registerSourceNames([]));
  it('uses extraNames (source name + domain brand)', () => {
    const extra = sourceNameVariants('Daily Planet Gazette - Top Stories', 'https://www.dailyplanet-gazette.example/rss');
    expect(extra).toEqual(expect.arrayContaining(['Daily Planet Gazette', 'dailyplanet-gazette.example']));
    expect(s('According to the Daily Planet Gazette, the vote passed.', extra)).toBe('According to a report, the vote passed.');
    expect(s('Gazette reporter Kiran Rao said the Daily Planet Gazette had learnt of it.', extra)).not.toMatch(/Daily Planet/);
  });
  it('registry applies to all later calls; generic names stay weak', () => {
    registerSourceNames(['Bharat Samachar', 'Top Stories', 'Latest News']);
    expect(s('According to Bharat Samachar, schools reopen.')).toBe('According to a report, schools reopen.');
    // a feed called "Top Stories" must not erase ordinary phrases
    expect(s('The top stories of the week were about floods.')).toBe('The top stories of the week were about floods.');
  });
  it('initialism of a multi-word source is context-only', () => {
    const extra = sourceNameVariants('Hindustan Times');
    expect(s('According to HT, the pact was signed.', extra)).toBe('According to a report, the pact was signed.');
    expect(s('The HT is a type of tube.', extra)).toBe('The HT is a type of tube.');
  });
  it('sourceNameVariants derives brand from host', () => {
    expect(sourceNameVariants('', 'https://www.deccanherald.co.uk/x')).toContain('deccanherald');
  });
});

describe('scrubSourceMentionsDeep', () => {
  it('cleans nested strings and leaves structural keys', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'According to TOI, it rained.' }] }], aiVideo: { summary: 'Reuters reported rain.', status: 'ready' } };
    const out = scrubSourceMentionsDeep(doc);
    expect(JSON.stringify(out)).not.toMatch(/TOI|Reuters/);
    expect(out.type).toBe('doc');
    expect(out.aiVideo.status).toBe('ready');
  });
});

describe('filterSourceHashtags', () => {
  it('drops publisher hashtags, keeps topical ones', () => {
    expect(filterSourceHashtags(['#TigerShroff', '#TOI', '#TimesOfIndia', '#NDTV', '#Bollywood', '#HindustanTimes', '#toi'])).toEqual(['#TigerShroff', '#Bollywood']);
    expect(filterSourceHashtags(['#Gazetteer Weekly', '#Metro'], ['Gazetteer Weekly'])).toEqual(['#Metro']);
  });
});
