import { AiService, RewriteRejectedError } from './ai.service';
import { assessRewrite, normalizeKeyPoints } from './rewrite-quality.util';

const SOURCE_TITLE = 'Government unveils new metro line for the capital';
const SOURCE_BODY =
  'The government on Sunday unveiled a new metro line that will connect the airport to the city centre by 2028. ' +
  'Officials said the project will cost 12,500 crore rupees and create 40,000 jobs over six years. ' +
  'The line will have 24 stations and is expected to carry 800,000 passengers every day once it is complete.';

const good = {
  title: 'New metro line to link airport and city centre',
  summary: 'A new metro line will join the airport to the middle of the city by 2028. It costs 12,500 crore rupees and should create 40,000 jobs. Planners expect 800,000 riders a day.',
  keyPoints: ['The metro line connects the airport with the city centre.', 'It should be ready in 2028.', 'The cost is 12,500 crore rupees.', 'About 40,000 jobs will be created over six years.', 'There will be 24 stations.', 'Around 800,000 people a day are expected to ride it.'],
  short: 'A new metro line will link the airport and the city centre by 2028.',
  medium: 'The capital is getting a new metro line. It will take people from the airport to the middle of the city. Work should finish in 2028 and cost 12,500 crore rupees.',
  long: 'The capital is getting a new metro line that joins the airport with the city centre.\n\nIt should open in 2028. The bill is 12,500 crore rupees, and building it will create 40,000 jobs over six years.\n\nThe line has 24 stations. Planners think 800,000 people will use it each day.',
  podcastScript: 'Today: a new metro line for the capital.',
  language: 'en',
};
const copied = { ...good, summary: SOURCE_BODY.split('. ').slice(0, 2).join('. ') + '.', long: SOURCE_BODY, medium: SOURCE_BODY, short: SOURCE_BODY };
const lostNumbers = { ...good, summary: 'A new metro line will join the airport to the city.', keyPoints: ['A metro line is planned.'], medium: 'A new metro line is planned for the capital city.', long: 'A new metro line is planned for the capital.\n\nIt will connect the airport and the middle of the city.' };

function make(responses: any[], env: Record<string, string> = {}) {
  const prompts: string[] = [];
  const gemini: any = {
    generateJson: jest.fn(async (prompt: string) => {
      prompts.push(prompt);
      const r = responses.shift();
      if (r instanceof Error) throw r;
      return { data: r, tokensUsed: 10 };
    }),
  };
  const config: any = { get: (k: string) => env[k] };
  const svc = new AiService(gemini, {} as any, config, {} as any, {} as any);
  return { svc, gemini, prompts };
}

describe('assessRewrite', () => {
  it('accepts an original, fact-complete draft', () => {
    const a = assessRewrite(good, SOURCE_TITLE, SOURCE_BODY);
    expect(a.ok).toBe(true);
    expect(a.numbers.ratio).toBe(1);
  });
  it('rejects copied text, empty drafts and dropped numbers', () => {
    expect(assessRewrite(copied, SOURCE_TITLE, SOURCE_BODY).problems).toContain('too_similar');
    expect(assessRewrite({ title: '', long: '' }, SOURCE_TITLE, SOURCE_BODY).problems).toContain('empty');
    const l = assessRewrite(lostNumbers, SOURCE_TITLE, SOURCE_BODY);
    expect(l.problems).toEqual(['missing_facts']);
    expect(l.numbers.missing.length).toBeGreaterThan(0);
  });
  it('normalises key points (markers, numbering, duplicates, too short)', () => {
    expect(normalizeKeyPoints(['- First point here.', '1. Second point here.', 'First point here.', 'x'])).toEqual(['First point here.', 'Second point here.']);
    expect(normalizeKeyPoints('• One long point\n• Another long point')).toEqual(['One long point', 'Another long point']);
    expect(normalizeKeyPoints(undefined)).toEqual([]);
  });
});

describe('AiService.rewriteWithQualityGate (mocked Gemini)', () => {
  it('returns first draft when it is original; one model call', async () => {
    const { svc, gemini } = make([good]);
    const r = await svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en');
    expect(r.attempts).toBe(1);
    expect(r.needsReview).toBe(false);
    expect(r.data.keyPoints).toHaveLength(6);
    expect(gemini.generateJson).toHaveBeenCalledTimes(1);
  });
  it('regenerates with a stricter prompt when the draft copies the source', async () => {
    const { svc, prompts } = make([copied, good]);
    const r = await svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'hi');
    expect(r.attempts).toBe(2);
    expect(prompts[0]).not.toMatch(/PREVIOUS ATTEMPT REJECTED/);
    expect(prompts[1]).toMatch(/PREVIOUS ATTEMPT REJECTED: it reused phrases/);
    expect(prompts[1]).toContain('Hindi');
  });
  it('throws RewriteRejectedError if the model keeps copying — source text is never accepted', async () => {
    const { svc, gemini } = make([copied, copied, copied]);
    await expect(svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en')).rejects.toBeInstanceOf(RewriteRejectedError);
    expect(gemini.generateJson).toHaveBeenCalledTimes(2); // REWRITE_MAX_ATTEMPTS default
  });
  it('honours REWRITE_MAX_ATTEMPTS and thresholds from env', async () => {
    const { svc, gemini } = make([copied, copied, copied], { REWRITE_MAX_ATTEMPTS: '3' });
    await expect(svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en')).rejects.toBeInstanceOf(RewriteRejectedError);
    expect(gemini.generateJson).toHaveBeenCalledTimes(3);
    const lenient = make([copied], { REWRITE_MAX_OVERLAP: '1', REWRITE_MAX_COPIED_RUN_WORDS: '9999' });
    const r = await lenient.svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en');
    expect(r.attempts).toBe(1);
  });
  it('empty model output is rejected', async () => {
    const { svc } = make([{}, {}]);
    await expect(svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en')).rejects.toBeInstanceOf(RewriteRejectedError);
  });
  it('dropped numbers: retries with the missing numbers, then flags for human review (original wording is kept)', async () => {
    const { svc, prompts } = make([lostNumbers, lostNumbers]);
    const r = await svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en');
    expect(prompts[1]).toMatch(/dropped facts/);
    expect(prompts[1]).toContain('12500');
    expect(r.needsReview).toBe(true);
  });
  it('passes the configured reading level and a source-bounded length cap to the prompt', async () => {
    const { svc, prompts } = make([good], { READING_LEVEL: 'plain' });
    await svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en');
    expect(prompts[0]).toMatch(/Reading level: PLAIN/);
    expect(prompts[0]).toMatch(/full-coverage version, at most (\d+) words/);
    const cap = Number(prompts[0].match(/full-coverage version, at most (\d+) words/)![1]);
    expect(cap).toBeLessThanOrEqual(700);
    expect(cap).toBeGreaterThanOrEqual(150);
  });
  it('API errors (e.g. quota) propagate so the caller can use the safe fallback', async () => {
    const { svc } = make([new Error('429 Quota exceeded')]);
    await expect(svc.rewriteWithQualityGate(SOURCE_TITLE, SOURCE_BODY, 'en')).rejects.toThrow(/429/);
  });
});
