/** Reliable regional RSS feeds (BBC + major publishers). Used when DB has no regional inventory. */
export type RegionalFeedSource = {
  name: string;
  feedUrl: string;
  isTrusted: boolean;
  language: 'hi' | 'mr' | 'bn' | 'ta' | 'pa' | 'ur' | 'te' | 'gu' | 'ml' | 'fr' | 'de' | 'es' | 'pt' | 'ar' | 'zh' | 'ja' | 'ko' | 'ru' | 'id' | 'tr';
};

export const REGIONAL_FEED_SOURCES: RegionalFeedSource[] = [
  // Hindi (hi)
  { name: 'BBC Hindi', feedUrl: 'https://feeds.bbci.co.uk/hindi/rss.xml', isTrusted: true, language: 'hi' },
  { name: 'Deutsche Welle Hindi', feedUrl: 'https://rss.dw.com/rdf/rss-hi-all', isTrusted: true, language: 'hi' },
  { name: 'Navbharat Times', feedUrl: 'https://navbharattimes.indiatimes.com/rssfeedsdefault.cms', isTrusted: true, language: 'hi' },
  { name: 'ABP Live Hindi', feedUrl: 'https://www.abplive.com/rss/news', isTrusted: true, language: 'hi' },
  { name: 'NDTV Hindi', feedUrl: 'https://feeds.feedburner.com/ndtvkhabar-home', isTrusted: true, language: 'hi' },

  // Marathi (mr)
  { name: 'BBC Marathi', feedUrl: 'https://feeds.bbci.co.uk/marathi/rss.xml', isTrusted: true, language: 'mr' },
  { name: 'Lokmat', feedUrl: 'https://www.lokmat.com/rss/top-stories.xml', isTrusted: true, language: 'mr' },
  { name: 'Maharashtra Times', feedUrl: 'https://maharashtratimes.com/rssfeedsdefault.cms', isTrusted: true, language: 'mr' },
  { name: 'TV9 Marathi', feedUrl: 'https://tv9marathi.com/feed', isTrusted: true, language: 'mr' },
  { name: 'Sakal', feedUrl: 'https://www.sakal.com/rss/latest-news.xml', isTrusted: true, language: 'mr' },

  // Bengali (bn)
  { name: 'BBC Bangla', feedUrl: 'https://feeds.bbci.co.uk/bengali/rss.xml', isTrusted: true, language: 'bn' },
  { name: 'Anandabazar Patrika', feedUrl: 'https://www.anandabazar.com/rss/latest-news.xml', isTrusted: true, language: 'bn' },
  { name: 'Ei Samay', feedUrl: 'https://eisamay.com/rssfeedstopstories.cms', isTrusted: true, language: 'bn' },
  { name: 'Prothom Alo', feedUrl: 'https://www.prothomalo.com/feed', isTrusted: true, language: 'bn' },
  { name: 'Sangbad Pratidin', feedUrl: 'https://www.sangbadpratidin.in/feed/', isTrusted: true, language: 'bn' },

  // Tamil (ta)
  { name: 'BBC Tamil', feedUrl: 'https://feeds.bbci.co.uk/tamil/rss.xml', isTrusted: true, language: 'ta' },
  { name: 'Dinamalar', feedUrl: 'https://www.dinamalar.com/rss/feed.aspx', isTrusted: true, language: 'ta' },
  { name: 'Deutsche Welle Tamil', feedUrl: 'https://rss.dw.com/rdf/rss-ta-all', isTrusted: true, language: 'ta' },
  { name: 'Vikatan', feedUrl: 'https://www.vikatan.com/rss', isTrusted: true, language: 'ta' },

  // Punjabi (pa)
  { name: 'BBC Punjabi', feedUrl: 'https://feeds.bbci.co.uk/punjabi/rss.xml', isTrusted: true, language: 'pa' },
  { name: 'Jagbani', feedUrl: 'https://www.jagbani.com/rss/latest-news', isTrusted: true, language: 'pa' },
  { name: 'Deutsche Welle Punjabi', feedUrl: 'https://rss.dw.com/rdf/rss-pa-all', isTrusted: true, language: 'pa' },
  { name: 'Punjab Kesari', feedUrl: 'https://www.punjabkesari.in/rss/latest-news', isTrusted: true, language: 'pa' },

  // Urdu (ur)
  { name: 'BBC Urdu', feedUrl: 'https://feeds.bbci.co.uk/urdu/rss.xml', isTrusted: true, language: 'ur' },
  { name: 'Deutsche Welle Urdu', feedUrl: 'https://rss.dw.com/rdf/rss-ur-all', isTrusted: true, language: 'ur' },
  { name: 'News18 Urdu', feedUrl: 'https://urdu.news18.com/rss/latest.xml', isTrusted: true, language: 'ur' },
  { name: 'Jang', feedUrl: 'https://jang.com.pk/rss/1/7', isTrusted: true, language: 'ur' },
  { name: 'Geo Urdu', feedUrl: 'https://urdu.geo.tv/rss', isTrusted: true, language: 'ur' },

  // Telugu (te)
  { name: 'News18 Telugu', feedUrl: 'https://telugu.news18.com/rss/news.xml', isTrusted: true, language: 'te' },
  { name: 'Sakshi', feedUrl: 'https://www.sakshi.com/rss/feed', isTrusted: true, language: 'te' },
  { name: 'Eenadu', feedUrl: 'https://www.eenadu.net/rss', isTrusted: true, language: 'te' },

  // Gujarati (gu)
  { name: 'Divya Bhaskar', feedUrl: 'https://www.divyabhaskar.co.in/rss-feed/1061.xml', isTrusted: true, language: 'gu' },
  { name: 'Gujarat Samachar', feedUrl: 'https://www.gujaratsamachar.com/rss/top-stories', isTrusted: true, language: 'gu' },
  { name: 'Sandesh', feedUrl: 'https://sandesh.com/feed/', isTrusted: true, language: 'gu' },

  // Malayalam (ml)
  { name: 'BBC Malayalam', feedUrl: 'https://feeds.bbci.co.uk/malayalam/rss.xml', isTrusted: true, language: 'ml' },
  { name: 'Mathrubhumi', feedUrl: 'https://www.mathrubhumi.com/rss/news.xml', isTrusted: true, language: 'ml' },
  { name: 'Manorama Online', feedUrl: 'https://www.manoramaonline.com/rss/home.xml', isTrusted: true, language: 'ml' },
  { name: 'Asianet News Malayalam', feedUrl: 'https://asianetnews.com/feed/', isTrusted: true, language: 'ml' },

  // French (fr)
  { name: 'BBC French', feedUrl: 'https://feeds.bbci.co.uk/french/rss.xml', isTrusted: true, language: 'fr' },
  { name: 'Le Monde', feedUrl: 'https://www.lemonde.fr/rss/une.xml', isTrusted: true, language: 'fr' },
  { name: 'RFI French', feedUrl: 'https://www.rfi.fr/fr/rss', isTrusted: true, language: 'fr' },
  { name: 'Le Figaro', feedUrl: 'https://www.lefigaro.fr/rss/figaro_flash-actu.xml', isTrusted: true, language: 'fr' },

  // German (de)
  { name: 'Deutsche Welle German', feedUrl: 'https://rss.dw.com/rdf/rss-de-all', isTrusted: true, language: 'de' },
  { name: 'Spiegel', feedUrl: 'https://www.spiegel.de/schlagzeilen/index.rss', isTrusted: true, language: 'de' },
  { name: 'Zeit Online', feedUrl: 'https://newsfeed.zeit.de/index', isTrusted: true, language: 'de' },

  // Spanish (es)
  { name: 'BBC Mundo', feedUrl: 'https://feeds.bbci.co.uk/mundo/rss.xml', isTrusted: true, language: 'es' },
  { name: 'Deutsche Welle Spanish', feedUrl: 'https://rss.dw.com/rdf/rss-es-all', isTrusted: true, language: 'es' },
  { name: 'El País', feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', isTrusted: true, language: 'es' },

  // Portuguese (pt)
  { name: 'BBC Brasil', feedUrl: 'https://feeds.bbci.co.uk/portuguese/rss.xml', isTrusted: true, language: 'pt' },
  { name: 'Deutsche Welle Portuguese', feedUrl: 'https://rss.dw.com/rdf/rss-pt-all', isTrusted: true, language: 'pt' },
  { name: 'RFI Portuguese', feedUrl: 'https://www.rfi.fr/pt/rss', isTrusted: true, language: 'pt' },

  // Arabic (ar)
  { name: 'BBC Arabic', feedUrl: 'https://feeds.bbci.co.uk/arabic/rss.xml', isTrusted: true, language: 'ar' },
  { name: 'Deutsche Welle Arabic', feedUrl: 'https://rss.dw.com/rdf/rss-ar-all', isTrusted: true, language: 'ar' },
  { name: 'Al Jazeera Arabic', feedUrl: 'https://www.aljazeera.net/xml/rss/all.xml', isTrusted: true, language: 'ar' },

  // Chinese (zh)
  { name: 'BBC Chinese', feedUrl: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', isTrusted: true, language: 'zh' },
  { name: 'Deutsche Welle Chinese', feedUrl: 'https://rss.dw.com/rdf/rss-zh-all', isTrusted: true, language: 'zh' },

  // Japanese (ja)
  { name: 'NHK World Japanese', feedUrl: 'https://www3.nhk.or.jp/rss/news/cat0.xml', isTrusted: true, language: 'ja' },
  { name: 'BBC Japanese', feedUrl: 'https://feeds.bbci.co.uk/japanese/rss.xml', isTrusted: true, language: 'ja' },

  // Korean (ko)
  { name: 'BBC Korean', feedUrl: 'https://feeds.bbci.co.uk/korean/rss.xml', isTrusted: true, language: 'ko' },
  { name: 'Deutsche Welle Korean', feedUrl: 'https://rss.dw.com/rdf/rss-ko-all', isTrusted: true, language: 'ko' },

  // Russian (ru)
  { name: 'BBC Russian', feedUrl: 'https://feeds.bbci.co.uk/russian/rss.xml', isTrusted: true, language: 'ru' },
  { name: 'Deutsche Welle Russian', feedUrl: 'https://rss.dw.com/rdf/rss-ru-all', isTrusted: true, language: 'ru' },

  // Indonesian (id)
  { name: 'BBC Indonesian', feedUrl: 'https://feeds.bbci.co.uk/indonesia/rss.xml', isTrusted: true, language: 'id' },
  { name: 'Deutsche Welle Indonesian', feedUrl: 'https://rss.dw.com/rdf/rss-id-all', isTrusted: true, language: 'id' },
  { name: 'Kompas Indonesian', feedUrl: 'https://rss.kompas.com/index.xml', isTrusted: true, language: 'id' },

  // Turkish (tr)
  { name: 'BBC Turkish', feedUrl: 'https://feeds.bbci.co.uk/turkish/rss.xml', isTrusted: true, language: 'tr' },
  { name: 'Deutsche Welle Turkish', feedUrl: 'https://rss.dw.com/rdf/rss-tr-all', isTrusted: true, language: 'tr' },
];

export const REGIONAL_TARGET_LANGS = [
  // Indian languages
  'hi', 'mr', 'bn', 'ta', 'pa', 'ur', 'te', 'gu', 'ml',
  // International languages
  'fr', 'de', 'es', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru', 'id', 'tr',
] as const;
