import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user
  await prisma.user.upsert({
    where: { email: 'admin@nationreporters.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@nationreporters.com',
      passwordHash: await bcrypt.hash('Admin@123456', 12),
      role: 'ADMIN',
    },
  });

  // Categories
  const categories = [
    { name: 'India', slug: 'india' },
    { name: 'World', slug: 'world' },
    { name: 'Politics', slug: 'politics' },
    { name: 'Business', slug: 'business' },
    { name: 'Sports', slug: 'sports' },
    { name: 'Entertainment', slug: 'entertainment' },
    { name: 'Technology', slug: 'tech' },
    { name: 'Health', slug: 'health' },
    { name: 'Science', slug: 'science' },
    { name: 'Environment', slug: 'environment' },
  ];
  for (const cat of categories) {
    await prisma.category.upsert({ where: { slug: cat.slug }, update: {}, create: cat });
  }

  // Global Regions — 40+ countries
  const regions = [
    // South Asia
    { name: 'India', slug: 'india', country: 'IN' },
    { name: 'Pakistan', slug: 'pakistan', country: 'PK' },
    { name: 'Bangladesh', slug: 'bangladesh', country: 'BD' },
    { name: 'Sri Lanka', slug: 'srilanka', country: 'LK' },
    { name: 'Nepal', slug: 'nepal', country: 'NP' },
    // North America
    { name: 'United States', slug: 'us', country: 'US' },
    { name: 'Canada', slug: 'canada', country: 'CA' },
    { name: 'Mexico', slug: 'mexico', country: 'MX' },
    // Europe
    { name: 'United Kingdom', slug: 'uk', country: 'GB' },
    { name: 'Germany', slug: 'germany', country: 'DE' },
    { name: 'France', slug: 'france', country: 'FR' },
    { name: 'Spain', slug: 'spain', country: 'ES' },
    { name: 'Italy', slug: 'italy', country: 'IT' },
    { name: 'Netherlands', slug: 'netherlands', country: 'NL' },
    { name: 'Russia', slug: 'russia', country: 'RU' },
    // Middle East
    { name: 'UAE', slug: 'uae', country: 'AE' },
    { name: 'Saudi Arabia', slug: 'saudi-arabia', country: 'SA' },
    { name: 'Qatar', slug: 'qatar', country: 'QA' },
    { name: 'Israel', slug: 'israel', country: 'IL' },
    { name: 'Turkey', slug: 'turkey', country: 'TR' },
    // East Asia
    { name: 'China', slug: 'china', country: 'CN' },
    { name: 'Japan', slug: 'japan', country: 'JP' },
    { name: 'South Korea', slug: 'south-korea', country: 'KR' },
    // Southeast Asia
    { name: 'Singapore', slug: 'singapore', country: 'SG' },
    { name: 'Malaysia', slug: 'malaysia', country: 'MY' },
    { name: 'Indonesia', slug: 'indonesia', country: 'ID' },
    // Oceania
    { name: 'Australia', slug: 'australia', country: 'AU' },
    { name: 'New Zealand', slug: 'newzealand', country: 'NZ' },
    // Africa
    { name: 'South Africa', slug: 'south-africa', country: 'ZA' },
    { name: 'Nigeria', slug: 'nigeria', country: 'NG' },
    { name: 'Kenya', slug: 'kenya', country: 'KE' },
    { name: 'Egypt', slug: 'egypt', country: 'EG' },
    // South America
    { name: 'Brazil', slug: 'brazil', country: 'BR' },
    { name: 'Argentina', slug: 'argentina', country: 'AR' },
    { name: 'Colombia', slug: 'colombia', country: 'CO' },
    // Global
    { name: 'World', slug: 'world', country: 'GLOBAL' },
  ];
  for (const region of regions) {
    await prisma.region.upsert({ where: { slug: region.slug }, update: {}, create: region });
  }

  // Default risk rules
  await prisma.riskRule.upsert({
    where: { id: 'default-low-risk' },
    update: {},
    create: {
      id: 'default-low-risk',
      name: 'Auto-approve low-risk tech/sports/entertainment',
      maxScore: 0.3,
      minConfidence: 0.8,
      requireTrustedSource: true,
      autoApprove: true,
    },
  });

  // Feature flags
  const flags = [
    { key: 'FEATURE_AUTO_APPROVE', enabled: false },
    { key: 'FEATURE_TTS', enabled: false },
    { key: 'FEATURE_LIVE_TV', enabled: false },
  ];
  for (const flag of flags) {
    await prisma.featureFlag.upsert({ where: { key: flag.key }, update: {}, create: flag });
  }

  // RSS Feed Sources — English
  const englishSources = [
    { name: 'NDTV Top Stories', feedUrl: 'https://feeds.feedburner.com/ndtvnews-top-stories', isTrusted: true },
    { name: 'NDTV India News', feedUrl: 'https://feeds.feedburner.com/ndtvnews-india-news', isTrusted: true },
    { name: 'NDTV Sports', feedUrl: 'https://feeds.feedburner.com/ndtvnews-sports', isTrusted: false },
    { name: 'Times of India - Top Stories', feedUrl: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', isTrusted: true },
    { name: 'Times of India - India', feedUrl: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms', isTrusted: true },
    { name: 'Times of India - Business', feedUrl: 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms', isTrusted: false },
    { name: 'Times of India - Sports', feedUrl: 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms', isTrusted: false },
    { name: 'The Hindu - National', feedUrl: 'https://www.thehindu.com/news/national/feeder/default.rss', isTrusted: true },
    { name: 'The Hindu - Business', feedUrl: 'https://www.thehindu.com/business/feeder/default.rss', isTrusted: false },
    { name: 'Hindustan Times - India', feedUrl: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml', isTrusted: true },
    { name: 'India Today - India', feedUrl: 'https://www.indiatoday.in/rss/home', isTrusted: true },
    { name: 'BBC World News', feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml', isTrusted: false },
  ];

  // RSS Feed Sources — Hindi
  const hindiSources = [
    { name: 'NDTV Hindi', feedUrl: 'https://feeds.feedburner.com/ndtvkhabar-home', isTrusted: true },
    { name: 'Amar Ujala', feedUrl: 'https://www.amarujala.com/rss/breaking-news.xml', isTrusted: true },
    { name: 'Dainik Jagran', feedUrl: 'https://www.jagran.com/rss/news.xml', isTrusted: true },
    { name: 'NavBharat Times', feedUrl: 'https://navbharattimes.indiatimes.com/rssfeedstopstories.cms', isTrusted: true },
    { name: 'Patrika Hindi', feedUrl: 'https://api.patrika.com/rss/india-news', isTrusted: false },
    { name: 'Zee News Hindi', feedUrl: 'https://zeenews.india.com/hindi/india/feed', isTrusted: true },
    { name: 'ABP Live Hindi', feedUrl: 'https://www.abplive.com/feed', isTrusted: true },
  ];

  // RSS Feed Sources — Marathi (Maharashtra)
  const marathiSources = [
    { name: 'Maharashtra Times', feedUrl: 'https://maharashtratimes.com/rssfeedstopstories.cms', isTrusted: true },
    { name: 'Lokmat', feedUrl: 'https://www.lokmat.com/rss/top-news.xml', isTrusted: true },
    { name: 'Sakal', feedUrl: 'https://www.sakal.com/rss/marathi-news.xml', isTrusted: true },
    { name: 'TV9 Marathi', feedUrl: 'https://tv9marathi.com/feed', isTrusted: true },
  ];

  // RSS Feed Sources — Bengali (West Bengal)
  const bengaliSources = [
    { name: 'Anandabazar Patrika', feedUrl: 'https://www.anandabazar.com/rss/latest-news.xml', isTrusted: true },
    { name: 'Ei Samay', feedUrl: 'https://eisamay.com/rssfeedstopstories.cms', isTrusted: true },
    { name: 'ABP Ananda', feedUrl: 'https://www.abpananda.com/rss/latest.xml', isTrusted: true },
  ];

  // RSS Feed Sources — Tamil (Tamil Nadu)
  const tamilSources = [
    { name: 'Dinamalar', feedUrl: 'https://www.dinamalar.com/rss/feed.aspx', isTrusted: true },
    { name: 'Dinamani', feedUrl: 'https://www.dinamani.com/rss/latest-news/', isTrusted: true },
    { name: 'Vikatan', feedUrl: 'https://www.vikatan.com/rss', isTrusted: true },
  ];

  // RSS Feed Sources — Telugu (Andhra + Telangana)
  const teluguSources = [
    { name: 'Eenadu', feedUrl: 'https://www.eenadu.net/rss/rss.xml', isTrusted: true },
    { name: 'Sakshi', feedUrl: 'https://www.sakshi.com/rss/latest.xml', isTrusted: true },
    { name: 'TV9 Telugu', feedUrl: 'https://tv9telugu.com/feed', isTrusted: true },
  ];

  // RSS Feed Sources — Kannada (Karnataka)
  const kannadaSources = [
    { name: 'Vijaya Karnataka', feedUrl: 'https://vijaykarnataka.com/rssfeedstopstories.cms', isTrusted: true },
    { name: 'Prajavani', feedUrl: 'https://www.prajavani.net/feed/', isTrusted: true },
    { name: 'TV9 Kannada', feedUrl: 'https://tv9kannada.com/feed', isTrusted: true },
  ];

  // RSS Feed Sources — Gujarati (Gujarat)
  const gujaratiSources = [
    { name: 'Divya Bhaskar', feedUrl: 'https://www.divyabhaskar.co.in/rss/top-news.xml', isTrusted: true },
    { name: 'Gujarat Samachar', feedUrl: 'https://www.gujaratsamachar.com/rss/top-news.xml', isTrusted: true },
    { name: 'Sandesh', feedUrl: 'https://sandesh.com/feed/', isTrusted: true },
  ];

  // RSS Feed Sources — Punjabi (Punjab)
  const punjabiSources = [
    { name: 'Jagbani', feedUrl: 'https://www.jagbani.com/rss/latest-news', isTrusted: true },
    { name: 'Punjab Kesari', feedUrl: 'https://www.punjabkesari.in/rss/latest-news', isTrusted: true },
  ];

  // ── GLOBAL RSS SOURCES BY COUNTRY & LANGUAGE ──────────────────────────────

  // USA — English
  const usaSources = [
    { name: 'AP News', feedUrl: 'https://rsshub.app/apnews/topics/apf-topnews', isTrusted: true },
    { name: 'Reuters World', feedUrl: 'https://feeds.reuters.com/reuters/worldNews', isTrusted: true },
    { name: 'NPR News', feedUrl: 'https://feeds.npr.org/1001/rss.xml', isTrusted: true },
    { name: 'ABC News', feedUrl: 'https://feeds.abcnews.com/abcnews/topstories', isTrusted: true },
    { name: 'CNN', feedUrl: 'http://rss.cnn.com/rss/edition.rss', isTrusted: true },
    { name: 'The New York Times', feedUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', isTrusted: true },
    { name: 'Washington Post', feedUrl: 'https://feeds.washingtonpost.com/rss/national', isTrusted: true },
  ];

  // UK — English
  const ukSources = [
    { name: 'BBC News UK', feedUrl: 'https://feeds.bbci.co.uk/news/uk/rss.xml', isTrusted: true },
    { name: 'The Guardian UK', feedUrl: 'https://www.theguardian.com/uk/rss', isTrusted: true },
    { name: 'Sky News', feedUrl: 'https://feeds.skynews.com/feeds/rss/home.xml', isTrusted: true },
    { name: 'The Independent', feedUrl: 'https://www.independent.co.uk/news/uk/rss', isTrusted: true },
  ];

  // Australia — English
  const australiaSources = [
    { name: 'ABC Australia', feedUrl: 'https://www.abc.net.au/news/feed/51120/rss.xml', isTrusted: true },
    { name: 'Sydney Morning Herald', feedUrl: 'https://www.smh.com.au/rss/feed.xml', isTrusted: true },
    { name: 'The Australian', feedUrl: 'https://www.theaustralian.com.au/feed/', isTrusted: true },
  ];

  // Canada — English + French
  const canadaSources = [
    { name: 'CBC News Canada', feedUrl: 'https://www.cbc.ca/cmlink/rss-topstories', isTrusted: true },
    { name: 'Globe and Mail', feedUrl: 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/', isTrusted: true },
    { name: 'Radio-Canada (French)', feedUrl: 'https://ici.radio-canada.ca/rss/4159', isTrusted: true },
    { name: 'Le Devoir (French)', feedUrl: 'https://www.ledevoir.com/rss/manchettes.xml', isTrusted: true },
  ];

  // Germany — German
  const germanySources = [
    { name: 'Spiegel Online', feedUrl: 'https://www.spiegel.de/schlagzeilen/index.rss', isTrusted: true },
    { name: 'Die Zeit', feedUrl: 'https://newsfeed.zeit.de/index', isTrusted: true },
    { name: 'Süddeutsche Zeitung', feedUrl: 'https://rss.sueddeutsche.de/rss/Topthemen', isTrusted: true },
    { name: 'Deutsche Welle German', feedUrl: 'https://rss.dw.com/rdf/rss-de-all', isTrusted: true },
  ];

  // France — French
  const franceSources = [
    { name: 'Le Monde', feedUrl: 'https://www.lemonde.fr/rss/une.xml', isTrusted: true },
    { name: 'Le Figaro', feedUrl: 'https://www.lefigaro.fr/rss/figaro_actualites.xml', isTrusted: true },
    { name: 'France 24 French', feedUrl: 'https://www.france24.com/fr/rss', isTrusted: true },
    { name: 'RFI French', feedUrl: 'https://www.rfi.fr/fr/rss', isTrusted: false },
  ];

  // Spain — Spanish
  const spainSources = [
    { name: 'El País', feedUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', isTrusted: true },
    { name: 'El Mundo', feedUrl: 'https://www.elmundo.es/rss/portada.xml', isTrusted: true },
    { name: 'RTVE España', feedUrl: 'https://www.rtve.es/noticias/ultimas-noticias/feed/', isTrusted: true },
  ];

  // Mexico / Latin America — Spanish
  const latinAmericaSources = [
    { name: 'El Universal Mexico', feedUrl: 'https://www.eluniversal.com.mx/rss.xml', isTrusted: true },
    { name: 'Infobae', feedUrl: 'https://www.infobae.com/feeds/rss/', isTrusted: true },
    { name: 'BBC Mundo (Spanish)', feedUrl: 'https://feeds.bbci.co.uk/mundo/rss.xml', isTrusted: true },
  ];

  // Brazil — Portuguese
  const brazilSources = [
    { name: 'G1 Globo', feedUrl: 'https://g1.globo.com/rss/g1/', isTrusted: true },
    { name: 'Folha de São Paulo', feedUrl: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml', isTrusted: true },
    { name: 'BBC Brasil (Portuguese)', feedUrl: 'https://feeds.bbci.co.uk/portuguese/rss.xml', isTrusted: true },
  ];

  // UAE / Middle East — Arabic + English
  const middleEastSources = [
    { name: 'Al Jazeera English', feedUrl: 'https://www.aljazeera.com/xml/rss/all.xml', isTrusted: true },
    { name: 'Al Jazeera Arabic', feedUrl: 'https://www.aljazeera.net/rss', isTrusted: true },
    { name: 'Gulf News (English)', feedUrl: 'https://gulfnews.com/rss', isTrusted: true },
    { name: 'Khaleej Times (English)', feedUrl: 'https://www.khaleejtimes.com/feed', isTrusted: true },
    { name: 'Al Arabiya (Arabic)', feedUrl: 'https://www.alarabiya.net/ar/rss.xml', isTrusted: true },
    { name: 'Al Ahram Egypt (Arabic)', feedUrl: 'https://gate.ahram.org.eg/rss', isTrusted: true },
    { name: 'Saudi Gazette', feedUrl: 'https://saudigazette.com.sa/rss', isTrusted: true },
  ];

  // Russia — Russian
  const russiaSources = [
    { name: 'RT Russian', feedUrl: 'https://russian.rt.com/rss', isTrusted: false },
    { name: 'TASS', feedUrl: 'https://tass.ru/rss/v2.xml', isTrusted: true },
    { name: 'RIA Novosti', feedUrl: 'https://ria.ru/export/rss2/archive/index.xml', isTrusted: true },
  ];

  // China — Chinese
  const chinaSources = [
    { name: 'Xinhua News (Chinese)', feedUrl: 'http://www.xinhuanet.com/rss/zhengzhi.xml', isTrusted: false },
    { name: 'Xinhua News (English)', feedUrl: 'http://www.xinhuanet.com/english/rss/worldrss.xml', isTrusted: false },
    { name: 'CGTN English', feedUrl: 'https://www.cgtn.com/subscribe/rss/section/world.xml', isTrusted: false },
    { name: 'South China Morning Post', feedUrl: 'https://www.scmp.com/rss/91/feed', isTrusted: true },
  ];

  // Japan — Japanese
  const japanSources = [
    { name: 'NHK World English', feedUrl: 'https://www3.nhk.or.jp/nhkworld/en/news/feeds/xml/', isTrusted: true },
    { name: 'The Japan Times', feedUrl: 'https://www.japantimes.co.jp/feed/', isTrusted: true },
    { name: 'Asahi Shimbun (Japanese)', feedUrl: 'https://rss.asahi.com/rss/asahi/newsheadlines.rdf', isTrusted: true },
  ];

  // South Korea — Korean
  const koreaSources = [
    { name: 'Korea JoongAng Daily', feedUrl: 'https://koreajoongangdaily.joins.com/rss', isTrusted: true },
    { name: 'The Korea Herald', feedUrl: 'https://www.koreaherald.com/common/rss_xml.php?ct=001', isTrusted: true },
    { name: 'Yonhap News (Korean)', feedUrl: 'https://www.yna.co.kr/rss/news.xml', isTrusted: true },
  ];

  // Singapore / Malaysia — English + Malay
  const seAsiaSources = [
    { name: 'CNA Singapore', feedUrl: 'https://www.channelnewsasia.com/rssfeeds/8395744', isTrusted: true },
    { name: 'The Straits Times', feedUrl: 'https://www.straitstimes.com/news/singapore/rss.xml', isTrusted: true },
    { name: 'Bernama Malaysia', feedUrl: 'https://www.bernama.com/en/rss/general.xml', isTrusted: true },
    { name: 'Kompas Indonesia (Indonesian)', feedUrl: 'https://rss.kompas.com/index.xml', isTrusted: true },
  ];

  // Africa — English + French
  const africaSources = [
    { name: 'AllAfrica', feedUrl: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', isTrusted: true },
    { name: 'Daily Nation Kenya', feedUrl: 'https://nation.africa/kenya/feed', isTrusted: true },
    { name: 'The Punch Nigeria', feedUrl: 'https://punchng.com/feed/', isTrusted: true },
    { name: 'News24 South Africa', feedUrl: 'https://feeds.news24.com/articles/news24/TopStories/rss', isTrusted: true },
    { name: 'RFI Africa (French)', feedUrl: 'https://www.rfi.fr/afrique/rss', isTrusted: false },
  ];

  // Pakistan — Urdu + English
  const pakistanSources = [
    { name: 'Dawn Pakistan', feedUrl: 'https://www.dawn.com/feed', isTrusted: true },
    { name: 'Geo News Pakistan', feedUrl: 'https://www.geo.tv/rss/1', isTrusted: true },
    { name: 'Jang Urdu', feedUrl: 'https://jang.com.pk/rss/1', isTrusted: true },
    { name: 'ARY News', feedUrl: 'https://arynews.tv/feed/', isTrusted: false },
  ];

  // Bangladesh — Bengali
  const bangladeshSources = [
    { name: 'Prothom Alo (Bangla)', feedUrl: 'https://www.prothomalo.com/feed/', isTrusted: true },
    { name: 'The Daily Star Bangladesh', feedUrl: 'https://www.thedailystar.net/front-page/rss.xml', isTrusted: true },
  ];

  // International English
  const internationalSources = [
    { name: 'Deutsche Welle English', feedUrl: 'https://rss.dw.com/rdf/rss-en-all', isTrusted: true },
    { name: 'France 24 English', feedUrl: 'https://www.france24.com/en/rss', isTrusted: true },
    { name: 'RT International', feedUrl: 'https://www.rt.com/rss/', isTrusted: false },
    { name: 'Al Jazeera English', feedUrl: 'https://www.aljazeera.com/xml/rss/all.xml', isTrusted: true },
  ];

  // Sports-specific feeds
  const sportsSources = [
    { name: 'ESPN Cricket', feedUrl: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', isTrusted: true },
    { name: 'BBC Sport Cricket', feedUrl: 'https://feeds.bbci.co.uk/sport/cricket/rss.xml', isTrusted: true },
    { name: 'BBC Sport Football', feedUrl: 'https://feeds.bbci.co.uk/sport/football/rss.xml', isTrusted: true },
    { name: 'Sky Sports Football', feedUrl: 'https://www.skysports.com/rss/12040', isTrusted: true },
    { name: 'Goal.com Football', feedUrl: 'https://www.goal.com/feeds/en/news', isTrusted: true },
    { name: 'ESPN Sports Top', feedUrl: 'https://www.espn.com/espn/rss/news', isTrusted: true },
    { name: 'BBC Sport Rugby', feedUrl: 'https://feeds.bbci.co.uk/sport/rugby-union/rss.xml', isTrusted: true },
    { name: 'BBC Sport Tennis', feedUrl: 'https://feeds.bbci.co.uk/sport/tennis/rss.xml', isTrusted: true },
    { name: 'NDTV Sports Latest', feedUrl: 'https://feeds.feedburner.com/NdtvSports-latest', isTrusted: true },
    { name: 'The Hindu Sport', feedUrl: 'https://www.thehindu.com/sport/feeder/default.rss', isTrusted: true },
    { name: 'Sportstar Cricket', feedUrl: 'https://sportstar.thehindu.com/cricket/feeder/default.rss', isTrusted: true },
    { name: 'Indian Express Sports', feedUrl: 'https://indianexpress.com/section/sports/feed/', isTrusted: true },
  ];

  // War / Conflict / World affairs feeds
  const worldConflictSources = [
    { name: 'Reuters World News', feedUrl: 'https://feeds.reuters.com/reuters/worldNews', isTrusted: true },
    { name: 'BBC World News Global', feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml', isTrusted: true },
    { name: 'Guardian World', feedUrl: 'https://www.theguardian.com/world/rss', isTrusted: true },
    { name: 'AP World News', feedUrl: 'https://rsshub.app/apnews/topics/apf-intlnews', isTrusted: true },
    { name: 'France 24 World', feedUrl: 'https://www.france24.com/en/rss', isTrusted: true },
    { name: 'DW World', feedUrl: 'https://rss.dw.com/rdf/rss-en-world', isTrusted: true },
    { name: 'Middle East Eye', feedUrl: 'https://www.middleeasteye.net/rss', isTrusted: false },
    { name: 'The Wire World', feedUrl: 'https://thewire.in/category/world/feed', isTrusted: true },
  ];

  // Business / Finance feeds
  const businessFeeds = [
    { name: 'Reuters Business', feedUrl: 'https://feeds.reuters.com/reuters/businessNews', isTrusted: true },
    { name: 'Bloomberg Markets', feedUrl: 'https://feeds.bloomberg.com/markets/news.rss', isTrusted: true },
    { name: 'Moneycontrol', feedUrl: 'https://www.moneycontrol.com/rss/latestnews.xml', isTrusted: true },
    { name: 'Economic Times', feedUrl: 'https://economictimes.indiatimes.com/rssfeedstopstories.cms', isTrusted: true },
    { name: 'Business Standard', feedUrl: 'https://www.business-standard.com/rss/latest.rss', isTrusted: true },
    { name: 'Livemint', feedUrl: 'https://www.livemint.com/rss/news', isTrusted: true },
    { name: 'Financial Express', feedUrl: 'https://www.financialexpress.com/feed/', isTrusted: true },
  ];

  // Tech feeds
  const techFeeds = [
    { name: 'TechCrunch', feedUrl: 'https://techcrunch.com/feed/', isTrusted: true },
    { name: 'The Verge', feedUrl: 'https://www.theverge.com/rss/index.xml', isTrusted: true },
    { name: 'Ars Technica', feedUrl: 'https://feeds.arstechnica.com/arstechnica/index', isTrusted: true },
    { name: 'Wired', feedUrl: 'https://www.wired.com/feed/rss', isTrusted: true },
    { name: 'Gadgets 360', feedUrl: 'https://feeds.feedburner.com/gadgets360-latest', isTrusted: true },
  ];

  const allSources = [
    ...englishSources, ...hindiSources,
    ...marathiSources, ...bengaliSources, ...tamilSources,
    ...teluguSources, ...kannadaSources, ...gujaratiSources, ...punjabiSources,
    ...usaSources, ...ukSources, ...australiaSources, ...canadaSources,
    ...germanySources, ...franceSources, ...spainSources,
    ...latinAmericaSources, ...brazilSources,
    ...middleEastSources, ...russiaSources,
    ...chinaSources, ...japanSources, ...koreaSources,
    ...seAsiaSources, ...africaSources,
    ...pakistanSources, ...bangladeshSources,
    ...internationalSources,
    ...sportsSources,
    ...worldConflictSources,
    ...businessFeeds,
    ...techFeeds,
  ];

  for (const src of allSources) {
    await prisma.ingestedSource.upsert({
      where: { feedUrl: src.feedUrl },
      update: { isActive: true },
      create: {
        name: src.name,
        feedUrl: src.feedUrl,
        type: 'rss',
        isActive: true,
        isTrusted: src.isTrusted,
        rightsMetadata: { note: 'AI-rewritten summaries only. Original content credited to source.' },
      },
    });
  }

  // Sample published articles for homepage preview
  const admin = await prisma.user.findUnique({ where: { email: 'admin@nationreporters.com' } });
  if (admin) {
    const sampleArticles = [
      {
        title: 'India GDP Growth Hits 8.4% in Q3, Fastest Among Major Economies',
        slug: 'india-gdp-growth-8-4-q3',
        excerpt: 'India\'s economy expanded at its fastest pace in six quarters, driven by strong manufacturing output and robust domestic consumption.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'India\'s GDP grew at 8.4% in the third quarter, surpassing all major economies. The growth was driven by strong manufacturing output, rising domestic consumption, and record infrastructure investment by the government.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'business' } }))?.id,
      },
      {
        title: 'ISRO Successfully Tests Gaganyaan Life Support Systems Ahead of 2025 Launch',
        slug: 'isro-gaganyaan-life-support-test',
        excerpt: 'The Indian Space Research Organisation has completed critical life support system tests for the Gaganyaan human spaceflight mission.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ISRO successfully completed a series of tests for the Gaganyaan crew module\'s life support systems. The mission, India\'s first human spaceflight, is on track for its 2025 launch window.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'science' } }))?.id,
      },
      {
        title: 'India vs Australia: Rohit Sharma Leads Team to Series Victory with Stunning Century',
        slug: 'india-australia-rohit-sharma-century',
        excerpt: 'Captain Rohit Sharma\'s unbeaten 127 guided India to a historic series win against Australia on Australian soil.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'In a masterclass innings, Rohit Sharma scored 127 not out to lead India to a 6-wicket victory and secure the series 3-1. The win marks India\'s second consecutive series win in Australia.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'sports' } }))?.id,
      },
      {
        title: 'Supreme Court Upholds Digital Personal Data Protection Act',
        slug: 'supreme-court-data-protection-act',
        excerpt: 'In a landmark ruling, the Supreme Court has upheld the constitutionality of the Digital Personal Data Protection Act 2023.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Supreme Court of India dismissed all petitions challenging the Digital Personal Data Protection Act, calling it a balanced framework for data governance.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'politics' } }))?.id,
      },
      {
        title: 'Reliance Jio Launches True 5G in 50 More Cities, Coverage Reaches 600 Districts',
        slug: 'jio-5g-expansion-50-cities',
        excerpt: 'Reliance Jio expanded its True 5G network to 50 additional cities, strengthening its lead in India\'s telecom landscape.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reliance Jio announced the launch of True 5G services across 50 new cities, bringing its network coverage to over 600 districts. The company claims 5G download speeds averaging 500 Mbps.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'tech' } }))?.id,
      },
      {
        title: 'G20 Summit: PM Modi Calls for Global AI Governance Framework',
        slug: 'g20-pm-modi-ai-governance',
        excerpt: 'Prime Minister Narendra Modi urged G20 leaders to develop a unified global framework for regulating artificial intelligence.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'At the G20 Summit, PM Modi called for an international AI governance framework built on principles of inclusivity, transparency, and safety.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'world' } }))?.id,
      },
      {
        title: 'AIIMS Delhi Performs India\'s First Robotic Heart Bypass Surgery',
        slug: 'aiims-robotic-heart-bypass-surgery',
        excerpt: 'AIIMS New Delhi achieved a milestone by performing India\'s first fully robotic coronary artery bypass graft surgery.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Doctors at AIIMS New Delhi successfully performed India\'s first robotic CABG surgery on a 62-year-old patient. The procedure took 4 hours and the patient is recovering well.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'health' } }))?.id,
      },
      {
        title: 'Bollywood Box Office: Pathaan 2 Shatters Opening Day Records with ₹120 Crore',
        slug: 'pathaan-2-opening-day-record',
        excerpt: 'Shah Rukh Khan\'s Pathaan 2 smashed the all-time opening day record at the domestic box office.',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pathaan 2, starring Shah Rukh Khan and Deepika Padukone, collected ₹120 crore on its opening day, breaking the previous record of ₹105 crore set by its predecessor.' }] }] },
        categoryId: (await prisma.category.findUnique({ where: { slug: 'entertainment' } }))?.id,
      },
    ];

    for (const art of sampleArticles) {
      const existing = await prisma.article.findUnique({ where: { slug: art.slug } });
      if (!existing) {
        await prisma.article.create({
          data: {
            ...art,
            body: art.body,
            authorId: admin.id,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            language: 'en',
            seoTitle: art.title,
            seoDescription: art.excerpt,
            seoSlug: art.slug,
          },
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
