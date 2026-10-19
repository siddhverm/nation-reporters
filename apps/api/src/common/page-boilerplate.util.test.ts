import { assessStoryBody, looksTruncated, stripPageBoilerplate } from './page-boilerplate.util';

const STORY = 'Actor Tiger Shroff was taken to a hospital on Friday after he felt pain in his leg during a stunt. Doctors said he is stable and will be discharged in two days. The film team has paused shooting for a week.';

describe('stripPageBoilerplate', () => {
  it('cuts everything after an end marker', () => {
    const raw = `${STORY}\n\nEnd of Article\n\nFollow Us On Social Media\nTrending Stories\nVideo 1\nVideo 2`;
    expect(stripPageBoilerplate(raw)).toBe(STORY);
  });
  it('cuts at inline glued markers (single-line scrape)', () => {
    const raw = `${STORY} Trending Stories Join conversation Add your comment Download the News app`;
    expect(stripPageBoilerplate(raw)).toBe(STORY);
  });
  it('removes leading menus and nav runs', () => {
    const raw = ['Home', 'India', 'World', 'Business', 'Sports', 'Sign In', 'Tiger Shroff hospitalised', STORY].join('\n');
    const out = stripPageBoilerplate(raw);
    expect(out).toContain(STORY);
    expect(out).not.toMatch(/Sign In|^Home$/m);
  });
  it('removes glued nav words and breadcrumbs', () => {
    expect(stripPageBoilerplate(`Home India World Business Sports Entertainment Sign In\n${STORY}`)).toBe(STORY);
    expect(stripPageBoilerplate(`Home > India > Entertainment > Bollywood\n${STORY}`)).toBe(STORY);
    expect(stripPageBoilerplate(`Home | India | World | Sports\n${STORY}`)).toBe(STORY);
  });
  it('drops ads, share rows, video list lines, comment prompts and app promos', () => {
    const raw = ['Advertisement', STORY, 'Share', 'Watch: Tiger Shroff leaves hospital', '02:15', 'Comments (0)', 'Download the TOI app'].join('\n');
    expect(stripPageBoilerplate(raw)).toBe(STORY);
  });
  it('does not cut real prose that merely contains similar words', () => {
    const prose = 'The minister said more stories about trending prices would follow, and asked people to join the rally on Sunday to talk about the budget in detail with officials.';
    expect(stripPageBoilerplate(prose)).toBe(prose);
  });
  it('leaves clean text untouched', () => {
    expect(stripPageBoilerplate(STORY)).toBe(STORY);
    expect(stripPageBoilerplate('')).toBe('');
    expect(stripPageBoilerplate(null)).toBe('');
  });
});

describe('looksTruncated', () => {
  it('detects mid-sentence endings', () => {
    expect(looksTruncated('Doctors said he is stable and will be discharged in two days. The team has paused shooting for a week, and the')).toBe(true);
    expect(looksTruncated('Police said the suspect was arrested in Pune on Monday after a long chase through the old city streets that lasted')).toBe(true);
    expect(looksTruncated('Read the full report here...')).toBe(true);
  });
  it('accepts complete text in many scripts', () => {
    for (const t of ['It rained all day.', 'क्या यह सच है?', '市は火曜日に発表した。', 'قال الوزير إنه سيستقيل.', '"We will win," he said.', 'Prices rose (see table).']) expect(looksTruncated(t)).toBe(false);
  });
});

describe('assessStoryBody', () => {
  it('accepts a clean complete story', () => {
    expect(assessStoryBody(STORY).ok).toBe(true);
  });
  it('rejects mostly-boilerplate pages', () => {
    const junk = ['Home', 'India', 'World', 'Business', 'Sports', 'Entertainment', 'Videos', 'Sign In', 'Trending Stories', 'Join conversation', 'Tiger Shroff leaves hospital', 'Watch: Stunt gone wrong', 'Watch: Film delay', 'Watch: Fans pray'].join('\n').repeat(6);
    const r = assessStoryBody(junk);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x === 'empty' || x === 'too_short' || x === 'mostly_boilerplate')).toBe(true);
  });
  it('rejects text that ends mid-sentence', () => {
    const r = assessStoryBody(`${STORY} The producers said that the`);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('truncated');
  });
  it('rejects too short bodies', () => {
    expect(assessStoryBody('He is fine.').reasons).toContain('too_short');
  });
  it('rejects a body that is a menu dump with a tiny story fragment', () => {
    const raw = `Home India World Business Sports Sign In\nTrending Stories\n${'Video title one\n'.repeat(10)}Join conversation`;
    expect(assessStoryBody(raw).ok).toBe(false);
  });
});
