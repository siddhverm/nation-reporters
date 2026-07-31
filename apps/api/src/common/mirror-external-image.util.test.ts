import {
  isWeakStoryImageUrl,
  normalizeImageUrl,
  pickStrongestImageUrl,
} from './mirror-external-image.util';

test('normalizeImageUrl resolves protocol-relative and relative paths', () => {
  expect(normalizeImageUrl('//cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
  expect(normalizeImageUrl('/photos/a.jpg', 'https://news.example.com/story/1')).toBe(
    'https://news.example.com/photos/a.jpg',
  );
  expect(normalizeImageUrl('https://cdn.example.com/story.jpg')).toBe('https://cdn.example.com/story.jpg');
});

test('isWeakStoryImageUrl rejects logos icons and tiny assets', () => {
  expect(isWeakStoryImageUrl('https://cdn.example.com/logo.png')).toBe(true);
  expect(isWeakStoryImageUrl('https://cdn.example.com/favicon.ico')).toBe(true);
  expect(isWeakStoryImageUrl('https://cdn.example.com/icon-32x32.png')).toBe(true);
  expect(isWeakStoryImageUrl('https://cdn.example.com/brand.svg')).toBe(true);
  expect(isWeakStoryImageUrl('https://cdn.example.com/photos/alpha-movie-premiere.jpg')).toBe(false);
});

test('pickStrongestImageUrl prefers story photo over logo', () => {
  const picked = pickStrongestImageUrl(
    [
      'https://cdn.example.com/logo.png',
      'https://cdn.example.com/photos/story-hero.jpg',
    ],
    'https://news.example.com/a',
  );
  expect(picked).toBe('https://cdn.example.com/photos/story-hero.jpg');
});
