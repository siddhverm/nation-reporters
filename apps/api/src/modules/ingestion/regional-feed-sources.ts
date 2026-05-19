/** Reliable regional RSS feeds (BBC + major publishers). Used when DB has no regional inventory. */
export type RegionalFeedSource = {
  name: string;
  feedUrl: string;
  isTrusted: boolean;
  language: 'bn' | 'ta' | 'pa' | 'ur' | 'gu';
};

export const REGIONAL_FEED_SOURCES: RegionalFeedSource[] = [
  { name: 'BBC Bangla', feedUrl: 'https://feeds.bbci.co.uk/bengali/rss.xml', isTrusted: true, language: 'bn' },
  { name: 'BBC Tamil', feedUrl: 'https://feeds.bbci.co.uk/tamil/rss.xml', isTrusted: true, language: 'ta' },
  { name: 'BBC Punjabi', feedUrl: 'https://feeds.bbci.co.uk/punjabi/rss.xml', isTrusted: true, language: 'pa' },
  { name: 'BBC Urdu', feedUrl: 'https://feeds.bbci.co.uk/urdu/rss.xml', isTrusted: true, language: 'ur' },
  { name: 'Deutsche Welle Urdu', feedUrl: 'https://rss.dw.com/rdf/rss-ur-all', isTrusted: true, language: 'ur' },
  { name: 'Anandabazar Patrika', feedUrl: 'https://www.anandabazar.com/rss/latest-news.xml', isTrusted: true, language: 'bn' },
  { name: 'Ei Samay', feedUrl: 'https://eisamay.com/rssfeedstopstories.cms', isTrusted: true, language: 'bn' },
  { name: 'Dinamalar', feedUrl: 'https://www.dinamalar.com/rss/feed.aspx', isTrusted: true, language: 'ta' },
  { name: 'Jagbani', feedUrl: 'https://www.jagbani.com/rss/latest-news', isTrusted: true, language: 'pa' },
  { name: 'News18 Urdu', feedUrl: 'https://urdu.news18.com/rss/latest.xml', isTrusted: true, language: 'ur' },
];

export const REGIONAL_TARGET_LANGS = ['bn', 'ta', 'pa', 'ur'] as const;
