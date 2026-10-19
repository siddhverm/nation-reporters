import { renderToStaticMarkup } from 'react-dom/server';
import StoryImageNotice from './StoryImageNotice';
import { NOTICES } from '@/lib/ui-notices';
import * as fs from 'fs';
import * as path from 'path';

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../test-fixtures/news-fixtures.json'), 'utf8'));
const LANGS: string[] = Object.keys(fixtures.languages);
const html = (p: Parameters<typeof StoryImageNotice>[0]) => renderToStaticMarkup(<StoryImageNotice {...p} />);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

describe.each(LANGS)('StoryImageNotice [%s]', (lang) => {
  const n = NOTICES[lang];
  it('SOURCE image: shows ONLY the copyright note, never the AI-illustration label', () => {
    for (const variant of ['below', 'overlay'] as const) {
      const out = html({ lang, origin: 'source', variant });
      expect(out).toContain(esc(n.imageCopyright));
      expect(out).toContain('data-testid="image-copyright-note"');
      expect(out).not.toContain(esc(n.illustration));
      expect(out).not.toContain('ai-illustration-label');
    }
    const badge = html({ lang, origin: 'source', variant: 'badge' });
    expect(badge).not.toContain('AI*');
  });
  it('GENERATED image: shows ONLY the AI label, never the copyright note', () => {
    for (const variant of ['below', 'overlay'] as const) {
      const out = html({ lang, origin: 'generated', variant });
      expect(out).toContain(esc(n.illustration));
      expect(out).toContain('data-testid="ai-illustration-label"');
      expect(out).not.toContain(esc(n.imageCopyright));
      expect(out).not.toContain('image-copyright-note');
    }
    expect(html({ lang, origin: 'generated', variant: 'badge' })).toContain('>AI*<');
  });
  it('sets lang/dir on the notice', () => {
    const out = html({ lang, origin: 'source' });
    expect(out).toContain(`lang="${lang}"`);
    expect(out).toContain(`dir="${lang === 'ar' || lang === 'ur' ? 'rtl' : 'ltr'}"`);
  });
});

it('defaults to the generated label when origin is not given', () => {
  expect(html({ lang: 'en' })).toContain('Illustration (AI-generated)');
});
