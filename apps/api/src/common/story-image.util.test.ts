import {
  buildImageAlt, buildStoryImagePrompt, extractGeminiImage, generateImageWithGemini, promptText, storyImagePath,
} from './story-image.util';

const PNG_B64 = Buffer.alloc(2000, 7).toString('base64');
const okResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
const imageBody = { candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: PNG_B64 } }] } }] };

describe('story image prompt', () => {
  it('forbids text, logos, real-person likeness and outlet imitation', () => {
    const p = buildStoryImagePrompt({ title: 'Floods hit city', category: 'india', language: 'hi' });
    expect(p).toMatch(/Do NOT include any text/);
    expect(p).toMatch(/real, identifiable people/);
    expect(p).toMatch(/Do NOT imitate any news outlet/);
    expect(p).toContain('Hindi');
  });
  it('strips URLs, control chars and caps length (no prompt smuggling from story text)', () => {
    const t = promptText('Hello\u0000\n https://evil.example/x  world', 50);
    expect(t).toBe('Hello world');
    expect(promptText('x'.repeat(1000), 160)).toHaveLength(160);
  });
  it('never mentions the source in the prompt inputs it is given', () => {
    const p = buildStoryImagePrompt({ title: 'Story', summary: 'see https://dailyplanet-gazette.example/a', category: 'unknown-cat' });
    expect(p).not.toContain('dailyplanet');
  });
});

describe('alt text + path', () => {
  it('uses the headline in the story language', () => {
    expect(buildImageAlt('बाढ़ से शहर प्रभावित', 'hi')).toBe('बाढ़ से शहर प्रभावित');
    expect(buildImageAlt('Floods hit city', 'en')).toBe('Illustration for: Floods hit city');
  });
  it('encodes slugs with non-latin characters', () => {
    expect(storyImagePath('बाढ़-abc')).toBe(`/story-image/${encodeURIComponent('बाढ़-abc')}`);
    expect(storyImagePath('a-b')).toBe('/story-image/a-b');
  });
});

describe('extractGeminiImage', () => {
  it('extracts inline image data', () => {
    const r = extractGeminiImage(imageBody) as { buffer: Buffer; mimeType: string };
    expect(r.mimeType).toBe('image/png');
    expect(r.buffer.length).toBe(2000);
  });
  it('detects prompt blocks and missing images', () => {
    expect(extractGeminiImage({ promptFeedback: { blockReason: 'SAFETY' } })).toEqual({ blocked: 'SAFETY' });
    expect(extractGeminiImage({ candidates: [{ content: { parts: [{ text: 'sorry' }] } }] })).toBeNull();
    expect(extractGeminiImage({})).toBeNull();
  });
  it('rejects non-image mime types', () => {
    const r = extractGeminiImage({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'text/html', data: PNG_B64 } }] } }] });
    expect(r).toBeNull();
  });
});

describe('generateImageWithGemini (mocked fetch, no live calls)', () => {
  const base = { apiKey: 'test-key', model: 'm' };
  it('no API key -> no_api_key, never calls fetch', async () => {
    const f = jest.fn();
    expect(await generateImageWithGemini('p', { model: 'm', fetchImpl: f as never })).toEqual({ ok: false, reason: 'no_api_key' });
    expect(f).not.toHaveBeenCalled();
  });
  it('success sends the key in a header, not the URL', async () => {
    const f = jest.fn().mockResolvedValue(okResponse(imageBody));
    const r = await generateImageWithGemini('p', { ...base, fetchImpl: f as never });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).not.toContain('test-key');
    expect(init.headers['x-goog-api-key']).toBe('test-key');
  });
  it.each([
    ['http_error', () => okResponse({}, 429)],
    ['blocked', () => okResponse({ promptFeedback: { blockReason: 'SAFETY' } })],
    ['no_image', () => okResponse({ candidates: [{ content: { parts: [{ text: 'x' }] } }] })],
  ])('%s -> graceful failure', async (reason, make) => {
    const f = jest.fn().mockResolvedValue((make as () => Response)());
    const r = await generateImageWithGemini('p', { ...base, fetchImpl: f as never });
    expect(r).toMatchObject({ ok: false, reason });
  });
  it('timeout and network errors never throw', async () => {
    const t = Object.assign(new Error('t'), { name: 'TimeoutError' });
    expect(await generateImageWithGemini('p', { ...base, fetchImpl: jest.fn().mockRejectedValue(t) as never })).toMatchObject({ reason: 'timeout' });
    expect(await generateImageWithGemini('p', { ...base, fetchImpl: jest.fn().mockRejectedValue(new Error('boom')) as never })).toMatchObject({ reason: 'error' });
  });
  it('rejects implausibly small images', async () => {
    const tiny = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.alloc(200).toString('base64') } }] } }] };
    const r = await generateImageWithGemini('p', { ...base, fetchImpl: jest.fn().mockResolvedValue(okResponse(tiny)) as never });
    expect(r.ok).toBe(false);
  });
});
