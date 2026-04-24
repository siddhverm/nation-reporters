import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const detectSourceLanguage = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('hindi') || n.includes('हिंदी')) return 'hi';
    if (n.includes('marathi') || n.includes('maharashtra times') || n.includes('lokmat') || n.includes('sakal')) return 'mr';
    if (n.includes('bengali') || n.includes('bangla') || n.includes('ananda') || n.includes('ananda') || n.includes('eisamay')) return 'bn';
    if (n.includes('tamil') || n.includes('dinamalar') || n.includes('dinamani') || n.includes('vikatan')) return 'ta';
    if (n.includes('telugu') || n.includes('eenadu') || n.includes('sakshi')) return 'te';
    if (n.includes('kannada') || n.includes('vijaya karnataka') || n.includes('prajavani')) return 'kn';
    if (n.includes('gujarati') || n.includes('divya bhaskar') || n.includes('gujarat samachar') || n.includes('sandesh')) return 'gu';
    if (n.includes('punjabi') || n.includes('jagbani')) return 'pa';
    if (n.includes('urdu') || n.includes('jang')) return 'ur';
    if (n.includes('arabic') || n.includes('al arabiya') || n.includes('al jazeera arabic') || n.includes('ahram')) return 'ar';
    if (n.includes('french') || n.includes('le monde') || n.includes('le figaro') || n.includes('radio-canada')) return 'fr';
    if (n.includes('german') || n.includes('spiegel') || n.includes('die zeit') || n.includes('deutsche welle german')) return 'de';
    if (n.includes('spanish') || n.includes('el país') || n.includes('el pais') || n.includes('el mundo') || n.includes('bbc mundo')) return 'es';
    if (n.includes('portuguese') || n.includes('g1 globo') || n.includes('folha') || n.includes('bbc brasil')) return 'pt';
    if (n.includes('russian') || n.includes('tass') || n.includes('ria novosti')) return 'ru';
    if (n.includes('chinese') || n.includes('xinhua')) return 'zh';
    if (n.includes('japanese') || n.includes('asahi')) return 'ja';
    if (n.includes('korean') || n.includes('yonhap')) return 'ko';
    if (n.includes('indonesian') || n.includes('kompas')) return 'id';
    if (n.includes('turkish')) return 'tr';
    return 'en';
  };

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
    const language = detectSourceLanguage(src.name);
    await prisma.ingestedSource.upsert({
      where: { feedUrl: src.feedUrl },
      update: { isActive: true, language },
      create: {
        name: src.name,
        feedUrl: src.feedUrl,
        type: 'rss',
        language,
        isActive: true,
        isTrusted: src.isTrusted,
        rightsMetadata: { note: 'AI-rewritten summaries only. Original content credited to source.' },
      },
    });
  }

  // Sample published articles — 5-6 per category for a rich homepage
  const admin = await prisma.user.findUnique({ where: { email: 'admin@nationreporters.com' } });
  if (admin) {
    const catId = async (s: string) => (await prisma.category.findUnique({ where: { slug: s } }))?.id;
    const [cIndia, cWorld, cPolitics, cBusiness, cSports, cEntertain, cTech, cHealth] = await Promise.all([
      catId('india'), catId('world'), catId('politics'), catId('business'),
      catId('sports'), catId('entertainment'), catId('tech'), catId('health'),
    ]);

    const sampleArticles = [
      // ── INDIA ────────────────────────────────────────────────────────────────
      { slug: 's-india-1', categoryId: cIndia,
        title: 'PM Modi Inaugurates India\'s Longest River Bridge Connecting Assam and Arunachal Pradesh',
        excerpt: 'The 19.3 km Dhola-Sadia Bridge sets a new record, cutting travel time from 6 hours to under 1 hour.',
        body: 'Prime Minister Narendra Modi inaugurated the 19.3-km Dhola-Sadia Bridge over the Brahmaputra River, the longest river bridge in India. The bridge cuts the travel time between Assam and Arunachal Pradesh from 6 hours to under an hour, boosting military access to the border region.' },
      { slug: 's-india-2', categoryId: cIndia,
        title: 'Nifty Hits Record 25,000 as India Markets Rally on Strong FII Inflows',
        excerpt: 'Indian equity markets touched historic highs with FII investment crossing ₹10,000 crore in a single session.',
        body: 'India\'s benchmark Nifty 50 index crossed the historic 25,000 mark for the first time, driven by record foreign institutional investor inflows. The Sensex also climbed 800 points to close above 82,000, with banking, IT and auto sectors leading gains.' },
      { slug: 's-india-3', categoryId: cIndia,
        title: 'India Launches Chandrayaan-4 Mission to Bring Lunar Samples Back to Earth',
        excerpt: 'ISRO\'s ambitious Chandrayaan-4 aims to collect and return 3 kg of lunar soil, a first for India.',
        body: 'The Indian Space Research Organisation launched Chandrayaan-4, India\'s most ambitious lunar mission, aiming to collect soil samples from the Moon\'s south pole and return them to Earth. The mission carries a sample return vehicle and a lander module.' },
      { slug: 's-india-4', categoryId: cIndia,
        title: 'Heavy Rains Lash Mumbai, Red Alert Issued for Konkan Coast',
        excerpt: 'The IMD has issued a red alert for coastal Maharashtra as monsoon intensifies, local trains disrupted.',
        body: 'Mumbai and the Konkan coast were battered by extremely heavy rainfall as the southwest monsoon strengthened. The India Meteorological Department issued red alerts for several districts, with water logging reported across low-lying areas and local train services disrupted.' },
      { slug: 's-india-5', categoryId: cIndia,
        title: 'Viksit Bharat 2047: Centre Launches ₹11 Lakh Crore Infrastructure Master Plan',
        excerpt: 'The government unveiled a massive infrastructure blueprint covering highways, railways and urban development.',
        body: 'The Union government unveiled the Viksit Bharat Infrastructure Master Plan worth ₹11 lakh crore, covering national highways, railways modernisation, port expansion and 50 new smart cities. The plan targets completion by 2047, India\'s centenary of independence.' },

      // ── WORLD ────────────────────────────────────────────────────────────────
      { slug: 's-world-1', categoryId: cWorld,
        title: 'Gaza Ceasefire Talks Resume in Cairo as International Pressure Mounts',
        excerpt: 'Mediators from Qatar, Egypt and the US push for a 6-week ceasefire and hostage exchange deal.',
        body: 'Negotiations for a Gaza ceasefire resumed in Cairo with delegations from Israel, Hamas and mediating countries. Qatar, Egypt and the US are pushing for a six-week pause in hostilities coupled with a phased hostage-prisoner exchange. The talks come amid growing international pressure.' },
      { slug: 's-world-2', categoryId: cWorld,
        title: 'Russia-Ukraine War: Kyiv Strikes Russian Fuel Depot 600 km Inside Enemy Territory',
        excerpt: 'Ukraine used long-range drones to hit a major fuel supply hub, marking its deepest strike into Russia.',
        body: 'Ukrainian forces struck a Russian fuel depot in Saratov Oblast, over 600 km inside Russian territory, using domestically-produced long-range drones. The attack disrupted fuel supplies to forward Russian military units and caused fires that burned for several hours.' },
      { slug: 's-world-3', categoryId: cWorld,
        title: 'US-China Trade War Escalates as Washington Imposes 145% Tariffs on Electronics',
        excerpt: 'New American tariffs target Chinese smartphones, laptops and semiconductors, threatening global supply chains.',
        body: 'The United States imposed sweeping new tariffs of up to 145% on Chinese electronics including smartphones, laptops and semiconductor equipment, escalating the trade war between the world\'s two largest economies. China vowed retaliatory measures and filed a complaint with the WTO.' },
      { slug: 's-world-4', categoryId: cWorld,
        title: 'Iran Nuclear Deal Talks Collapse in Geneva, IAEA Reports Uranium Enrichment at 84%',
        excerpt: 'Negotiations between Iran and world powers broke down as Tehran\'s uranium enrichment nears weapons-grade level.',
        body: 'Nuclear negotiations between Iran and world powers collapsed in Geneva after Tehran refused to cap uranium enrichment. The IAEA reported that Iran has enriched uranium to 84% purity, just below the 90% threshold needed for weapons-grade material.' },
      { slug: 's-world-5', categoryId: cWorld,
        title: 'NATO Summit in Brussels: Alliance Agrees to Boost Defence Spending to 3% of GDP',
        excerpt: 'NATO leaders agreed on a historic increase in defence spending targets as Russia threat drives urgency.',
        body: 'NATO leaders agreed at their Brussels summit to raise the collective defence spending target from 2% to 3% of GDP, the largest peacetime military build-up in alliance history. All 32 member nations endorsed the target, to be reached by 2030.' },

      // ── POLITICS ─────────────────────────────────────────────────────────────
      { slug: 's-pol-1', categoryId: cPolitics,
        title: 'Bihar Assembly Elections 2025: NDA Sweeps to Power, Wins 165 of 243 Seats',
        excerpt: 'The BJP-led alliance secured a dominant majority in the Bihar polls, defeating the INDIA bloc.',
        body: 'The National Democratic Alliance won a commanding victory in the Bihar Assembly elections, winning 165 seats out of 243. The BJP alone won 96 seats while JD(U) contributed 55. The INDIA bloc managed only 72 seats, a significant defeat for the opposition.' },
      { slug: 's-pol-2', categoryId: cPolitics,
        title: 'Parliament Passes Uniform Civil Code Bill; Opposition Calls for Review by Select Committee',
        excerpt: 'The contentious UCC bill was passed in the Lok Sabha with 316 votes, becoming law after presidential assent.',
        body: 'The Lok Sabha passed the Uniform Civil Code Bill with 316 votes in favour and 102 against. The legislation creates a common set of civil laws for marriage, divorce, inheritance and adoption across all religious communities. Opposition parties demanded the bill be sent to a joint parliamentary committee.' },
      { slug: 's-pol-3', categoryId: cPolitics,
        title: 'US President Trump Signs Executive Order Imposing 26% Tariffs on Indian Exports',
        excerpt: 'The White House announced reciprocal tariffs on 60 countries, with India among the highest-affected nations.',
        body: 'US President Donald Trump signed an executive order imposing 26% reciprocal tariffs on Indian goods, as part of a broad trade policy targeting countries with high tariff barriers. India\'s exports to the US, worth $77 billion annually, face significant disruption.' },
      { slug: 's-pol-4', categoryId: cPolitics,
        title: 'UK General Election: Labour Party Wins Landslide Victory Under Keir Starmer',
        excerpt: 'Labour won 412 seats in a historic landslide, ending 14 years of Conservative rule in Britain.',
        body: 'Labour Party leader Keir Starmer became the UK\'s new Prime Minister after his party won a historic landslide in the general election, securing 412 seats and ending 14 years of Conservative rule. The Conservatives suffered their worst defeat since 1832.' },
      { slug: 's-pol-5', categoryId: cPolitics,
        title: 'Supreme Court Orders SIT Probe into Electoral Bonds Scheme Data',
        excerpt: 'The apex court directed the formation of a Special Investigation Team to examine electoral bond transactions.',
        body: 'The Supreme Court ordered the formation of a Special Investigation Team to probe the electoral bonds data submitted by the State Bank of India. The court found prima facie evidence of a correlation between bond purchases and government contracts awarded to the purchasing companies.' },

      // ── BUSINESS ─────────────────────────────────────────────────────────────
      { slug: 's-biz-1', categoryId: cBusiness,
        title: 'India GDP Growth Hits 8.4% in Q3, Fastest Among G20 Economies',
        excerpt: 'India outpaced all major economies, driven by manufacturing and consumption booms.',
        body: 'India\'s GDP grew at 8.4% in the third quarter, cementing its position as the world\'s fastest-growing major economy. Manufacturing sector output surged 11.6% while private consumption rose 6.8%. The RBI revised its annual growth forecast upward to 7.6%.' },
      { slug: 's-biz-2', categoryId: cBusiness,
        title: 'Adani Group Secures ₹82,000 Crore Deal to Build Sri Lanka\'s Largest Green Energy Port',
        excerpt: 'The conglomerate will develop a combined wind, solar and port facility at Colombo\'s Trincomalee harbour.',
        body: 'The Adani Group signed a ₹82,000 crore agreement with the Sri Lanka government to develop a large-scale green energy hub and container terminal at Trincomalee. The project includes 1 GW of offshore wind capacity and a deep-water port capable of handling ultra-large vessels.' },
      { slug: 's-biz-3', categoryId: cBusiness,
        title: 'RBI Cuts Repo Rate by 25 Basis Points to 6.25%, First Cut in 5 Years',
        excerpt: 'The Monetary Policy Committee signalled a dovish pivot as inflation eased below the 4% target.',
        body: 'The Reserve Bank of India\'s Monetary Policy Committee unanimously voted to cut the repo rate by 25 basis points to 6.25%, marking the first rate cut in nearly five years. Governor Shaktikanta Das cited declining inflation and slowing global growth as key factors.' },
      { slug: 's-biz-4', categoryId: cBusiness,
        title: 'Tesla Enters India: First Showrooms Open in Mumbai and Delhi with Model Y at ₹59.99 Lakh',
        excerpt: 'Elon Musk\'s electric vehicle company finally enters the Indian market after years of tariff negotiations.',
        body: 'Tesla opened its first two showrooms in India in Mumbai\'s Bandra-Kurla Complex and Delhi\'s Connaught Place, with the Model Y priced starting at ₹59.99 lakh. The company also announced plans to set up a local manufacturing plant in Pune.' },
      { slug: 's-biz-5', categoryId: cBusiness,
        title: 'Sensex Crashes 1,500 Points on Global Sell-Off; Rupee Falls to 84.50 Against Dollar',
        excerpt: 'Indian markets fell sharply as fears of a US recession and rising oil prices triggered foreign fund outflows.',
        body: 'The BSE Sensex crashed 1,500 points and the Nifty fell 450 points in intraday trade as global markets sold off on recession fears. The Indian rupee hit a record low of 84.50 against the US dollar as FIIs pulled out ₹8,500 crore.' },

      // ── SPORTS ───────────────────────────────────────────────────────────────
      { slug: 's-spt-1', categoryId: cSports,
        title: 'India vs Australia: Rohit Sharma\'s 127* Seals Historic Test Series Win',
        excerpt: 'Captain Rohit Sharma\'s unbeaten 127 guided India to a 3-1 series win on Australian soil.',
        body: 'In a masterclass innings, Rohit Sharma scored 127 not out to lead India to a 6-wicket victory and secure the Test series 3-1. The win marks India\'s second consecutive series win in Australia, cementing their position as the world\'s top-ranked Test side.' },
      { slug: 's-spt-2', categoryId: cSports,
        title: 'IPL 2025: Mumbai Indians Beat Chennai Super Kings in Thrilling Final by 4 Wickets',
        excerpt: 'MI chased 187 off the last ball to lift their sixth IPL title in front of a packed Wankhede Stadium.',
        body: 'Mumbai Indians won a pulsating IPL 2025 final against Chennai Super Kings at Wankhede, chasing 187 off the last ball. Hardik Pandya smashed 32 off the final 2 overs to complete MI\'s sixth title. Rohit Sharma and Suryakumar Yadav built the platform with 78-run stand.' },
      { slug: 's-spt-3', categoryId: cSports,
        title: 'Real Madrid Wins Champions League Final 3-2 Against Manchester City in Epic Comeback',
        excerpt: 'Vinicius Junior\'s hat-trick completed a stunning revival after Madrid trailed 2-0 at half-time.',
        body: 'Real Madrid produced one of the greatest Champions League final comebacks, winning 3-2 against Manchester City in Wembley after trailing 2-0 at half-time. Vinicius Junior scored a hat-trick, with his winner coming in the 93rd minute. Erling Haaland scored twice for City.' },
      { slug: 's-spt-4', categoryId: cSports,
        title: 'Wimbledon 2025: Carlos Alcaraz Retains Title, Defeating Novak Djokovic in Five Sets',
        excerpt: 'Alcaraz overcame Djokovic 6-4, 3-6, 6-3, 4-6, 7-5 in an epic final lasting 4 hours 40 minutes.',
        body: 'Carlos Alcaraz retained his Wimbledon title with a five-set victory over Novak Djokovic, 6-4 3-6 6-3 4-6 7-5, in a match lasting 4 hours and 40 minutes. The 21-year-old Spaniard showed remarkable resilience after dropping two sets to the 37-year-old Serbian legend.' },
      { slug: 's-spt-5', categoryId: cSports,
        title: 'India Wins Olympic Gold in Hockey After 45 Years at Paris Olympics',
        excerpt: 'The Indian men\'s hockey team defeated Belgium 3-2 in the final to end a four-decade gold medal drought.',
        body: 'India\'s men\'s hockey team won the Olympic gold medal for the first time in 45 years, defeating Belgium 3-2 in the final at Paris. Harmanpreet Singh scored twice and captain PR Sreejesh made several crucial saves. India\'s last Olympic hockey gold was at the 1980 Moscow Games.' },

      // ── ENTERTAINMENT ────────────────────────────────────────────────────────
      { slug: 's-ent-1', categoryId: cEntertain,
        title: 'Pathaan 2 Shatters Opening Day Record, Collects ₹120 Crore Worldwide',
        excerpt: 'Shah Rukh Khan\'s action blockbuster sets a new Bollywood record on its opening day.',
        body: 'Shah Rukh Khan\'s Pathaan 2 collected ₹120 crore globally on its opening day, surpassing the previous record set by its predecessor. The film, directed by Siddharth Anand, features Deepika Padukone and John Abraham and is packed with high-octane action sequences filmed in Switzerland and Dubai.' },
      { slug: 's-ent-2', categoryId: cEntertain,
        title: 'Oscar 2025: All Quiet on the Western Front Wins Best Film; RRR\'s Naatu Naatu Bags Best Song',
        excerpt: 'Indian cinema made history as SS Rajamouli\'s RRR took home the Academy Award for Best Original Song.',
        body: 'The 97th Academy Awards saw German anti-war epic All Quiet on the Western Front win Best Picture. In a landmark moment for Indian cinema, the foot-tapping RRR number Naatu Naatu won Best Original Song, with composers MM Keeravani and lyricist Chandrabose accepting the award.' },
      { slug: 's-ent-3', categoryId: cEntertain,
        title: 'Netflix India Original Series \'Sacred Games 3\' Breaks Global Streaming Record',
        excerpt: 'The crime thriller became the most-watched non-English series on Netflix with 82 million views in 28 days.',
        body: 'Sacred Games 3, Netflix\'s flagship Indian original series, broke the streaming platform\'s record for non-English content, drawing 82 million views within 28 days of release. The show, set in Mumbai\'s criminal underworld, stars Saif Ali Khan and Nawazuddin Siddiqui.' },
      { slug: 's-ent-4', categoryId: cEntertain,
        title: 'AR Rahman\'s World Tour Sells Out 35 Cities in 48 Hours, Breaks Ticket Sale Records',
        excerpt: 'The Oscar-winning composer\'s comeback tour became the fastest-selling music event in Asian history.',
        body: 'Oscar-winning composer AR Rahman\'s world tour sold out 35 cities across 15 countries within 48 hours of tickets going on sale, breaking all previous records for an Asian musical artist. The tour, titled \'Infinite Love\', will kick off in Mumbai and travel across India, the US, UK, UAE and Australia.' },
      { slug: 's-ent-5', categoryId: cEntertain,
        title: 'Kartik Aaryan\'s \'Bhool Bhulaiyaa 4\' Crosses ₹300 Crore in 10 Days',
        excerpt: 'The horror-comedy franchise continues its box office dominance, joining the elite ₹300-crore club.',
        body: 'Bhool Bhulaiyaa 4, starring Kartik Aaryan and Vidya Balan, crossed the ₹300 crore mark at the domestic box office in just 10 days, becoming the fastest Bollywood film to achieve the milestone in 2025. The film is now India\'s highest-grossing horror film ever.' },

      // ── TECHNOLOGY ───────────────────────────────────────────────────────────
      { slug: 's-tech-1', categoryId: cTech,
        title: 'OpenAI Launches GPT-5: Can Reason, Code and Run Experiments Autonomously',
        excerpt: 'The latest AI model can manage multi-step scientific research and software development without human input.',
        body: 'OpenAI released GPT-5, its most advanced language model, capable of autonomous multi-step reasoning, scientific experiment design and full software project development. The model achieved a 91% score on PhD-level benchmarks and passed the US medical licensing exam with 95% accuracy.' },
      { slug: 's-tech-2', categoryId: cTech,
        title: 'Apple Unveils iPhone 17 Pro with Under-Display Face ID and Foldable Design',
        excerpt: 'Apple\'s most radical iPhone redesign in years features a foldable screen, all-titanium body and satellite SOS.',
        body: 'Apple launched the iPhone 17 Pro at its annual September event, featuring a foldable OLED display, under-display Face ID and an all-titanium body. The device also debuts Apple\'s A19 Pro chip, delivering 40% faster AI processing and support for on-device large language models.' },
      { slug: 's-tech-3', categoryId: cTech,
        title: 'ISRO-SpaceX Partnership: Starlink Satellites to Provide Broadband to Remote India by 2026',
        excerpt: 'The landmark deal will bring high-speed internet to 650,000 villages without connectivity.',
        body: 'ISRO and SpaceX signed a historic agreement to deploy Starlink satellite internet services across India\'s remote regions, targeting 650,000 villages currently without broadband. The service will offer speeds of 200 Mbps and is expected to launch commercially in early 2026.' },
      { slug: 's-tech-4', categoryId: cTech,
        title: 'Reliance Jio Launches India\'s First 6G Network Pilot in Mumbai and Bengaluru',
        excerpt: 'Jio\'s 6G trial delivers 1 Terabit-per-second speeds, 1,000 times faster than current 5G infrastructure.',
        body: 'Reliance Jio commenced India\'s first 6G network pilot in Mumbai and Bengaluru, achieving peak download speeds of 1 Terabit per second in laboratory conditions. The company targets commercial deployment by 2028, ahead of the global average timeline.' },
      { slug: 's-tech-5', categoryId: cTech,
        title: 'Google DeepMind\'s AI Discovers New Antibiotic That Kills Drug-Resistant Superbugs',
        excerpt: 'The AI-designed molecule destroyed bacteria resistant to all known antibiotics in lab and animal tests.',
        body: 'Google DeepMind\'s AI system discovered a new antibiotic molecule effective against a broad range of drug-resistant bacteria, including those classified as untreatable. The molecule was designed by AI in 72 hours, a process that would take human researchers 10-15 years.' },

      // ── HEALTH ───────────────────────────────────────────────────────────────
      { slug: 's-health-1', categoryId: cHealth,
        title: 'AIIMS Delhi Performs India\'s First Fully Robotic Heart Bypass Surgery',
        excerpt: 'A 62-year-old patient is recovering well after the landmark procedure using a robotic surgical system.',
        body: 'Doctors at AIIMS New Delhi successfully performed India\'s first robotic coronary artery bypass graft surgery using the da Vinci Surgical System. The 62-year-old patient was discharged in 3 days compared to the normal 7-day recovery, with significantly less blood loss.' },
      { slug: 's-health-2', categoryId: cHealth,
        title: 'WHO Declares Mpox Global Health Emergency as Cases Surge in 120 Countries',
        excerpt: 'The World Health Organization declared mpox a Public Health Emergency of International Concern for the second time.',
        body: 'The World Health Organization declared a global health emergency over mpox as the virus spread to 120 countries and a new strain showed signs of greater transmissibility. The Clade Ib variant, first detected in Central Africa, has a higher fatality rate of up to 10%.' },
      { slug: 's-health-3', categoryId: cHealth,
        title: 'India Achieves Tuberculosis Elimination Target 10 Years Ahead of Schedule',
        excerpt: 'India\'s TB incidence fell below 10 per 100,000 population, qualifying for WHO\'s elimination certification.',
        body: 'India has achieved the WHO tuberculosis elimination target a decade ahead of the 2035 global deadline, with TB incidence falling to 9.8 per 100,000 people. The success is attributed to the National TB Elimination Programme\'s universal drug sensitivity testing and doorstep drug delivery.' },
    ];

    const publishedDates = Array.from({ length: sampleArticles.length }, (_, i) => {
      const d = new Date();
      d.setHours(d.getHours() - i * 3);
      return d;
    });

    for (let i = 0; i < sampleArticles.length; i++) {
      const art = sampleArticles[i];
      const existing = await prisma.article.findUnique({ where: { slug: art.slug } });
      if (!existing) {
        await prisma.article.create({
          data: {
            title: art.title,
            slug: art.slug,
            excerpt: art.excerpt,
            body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: art.body }] }] },
            categoryId: art.categoryId,
            authorId: admin.id,
            status: 'PUBLISHED',
            publishedAt: publishedDates[i],
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
