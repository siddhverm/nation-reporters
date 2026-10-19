import { AiService, RewriteRejectedError } from './ai.service';

const menuDump = ['Home', 'India', 'World', 'Business', 'Sports', 'Sign In', 'Trending Stories', 'Join conversation', 'Video one', 'Video two', 'Video three', 'Video four'].join('\n');
const realBody = 'Actor Tiger Shroff was taken to a hospital on Friday after he felt pain in his leg during a stunt. Doctors said he is stable and will be discharged in two days. The film team has paused shooting for a week while he recovers at home with his family.';

function make(body: string, geminiOut: any = null) {
  const updates: any[] = [];
  const prisma: any = {
    ingestedArticle: {
      findUniqueOrThrow: jest.fn(async () => ({ id: 'i1', sourceTitle: 'Tiger Shroff hospitalised', body, sourceUrl: 'https://timesofindia.indiatimes.com/x', source: { name: 'Times of India' } })),
      update: jest.fn(async (a: any) => { updates.push(a.data); }),
    },
  };
  const gemini: any = { generateJson: jest.fn(async () => ({ data: geminiOut, tokensUsed: 5 })) };
  const config: any = { get: (k: string) => (k === 'FETCH_SOURCE_ARTICLE' ? 'false' : undefined) };
  const svc = new AiService(gemini, prisma, config, {} as any, {} as any);
  return { svc, gemini, updates };
}

const draft = (long: string) => ({
  title: 'Tiger Shroff is in hospital', summary: 'Tiger Shroff went to hospital on Friday with leg pain. Doctors say he is stable and will go home in two days.',
  keyPoints: ['He went to hospital on Friday.', 'Doctors say he is stable.', 'He will go home in two days.', 'Shooting is paused for a week.', 'He felt pain during a stunt.'],
  short: 'Tiger Shroff is stable in hospital.', medium: 'Tiger Shroff is stable in hospital after leg pain during a stunt.', long, podcastScript: 'Tiger Shroff is stable.', language: 'en',
});

describe('processIngestedArticle guards (held as RAW → safe DRAFT path, never published)', () => {
  it('source text that is only page boilerplate never reaches the model', async () => {
    const { svc, gemini, updates } = make(menuDump);
    await expect(svc.processIngestedArticle('i1', { language: 'en' })).rejects.toBeInstanceOf(RewriteRejectedError);
    expect(gemini.generateJson).not.toHaveBeenCalled();
    expect(updates.pop()).toEqual({ status: 'RAW' });
  });
  it('a rewrite that ends mid-sentence is rejected', async () => {
    const { svc, updates } = make(realBody, draft('The star visited a clinic on Friday because his leg hurt after an action scene.\n\nPhysicians described his condition as steady, and he should return home soon. Production on the movie has halted for seven days while he rests with relatives and the'));
    await expect(svc.processIngestedArticle('i1', { language: 'en' })).rejects.toThrow(/not publishable.*truncated/);
    expect(updates.pop()).toEqual({ status: 'RAW' });
  });
});
