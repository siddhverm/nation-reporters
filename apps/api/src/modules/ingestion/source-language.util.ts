/**
 * Infer BCP-47-ish language code for an RSS source from its display name.
 * Used by ingestion cron and prisma seed so `ingested_sources.language` matches feed content.
 */
export function detectFeedSourceLanguage(sourceName: string): string {
  const name = sourceName.toLowerCase();
  if (name.includes('hindi') || name.includes('हिंदी') || name.includes('jagran') || name.includes('amar ujala') || name.includes('abp live hindi') || name.includes('navbharat times') || name.includes('dainik bhaskar') || name.includes('bbc hindi')) return 'hi';
  if (
    name.includes('marathi')
    || name.includes('maratha')
    || name.includes('bbc marathi')
    || name.includes('maharashtra times')
    || name.includes('lokmat')
    || name.includes('sakal')
    || name.includes('tv9 marathi')
  ) return 'mr';
  if (
    name.includes('bengali')
    || name.includes('bangla')
    || name.includes('ananda')
    || name.includes('eisamay')
    || name.includes('ei samay')
    || name.includes('abp ananda')
    || name.includes('prothom alo')
    || name.includes('sangbad pratidin')
    || name.includes('kolkata24x7')
    || name.includes('all newspaper bangla')
    || name.includes('bbc bangla')
  ) return 'bn';
  if (name.includes('tamil') || name.includes('bbc tamil') || name.includes('dinamalar') || name.includes('dinamani') || name.includes('vikatan') || name.includes('one india tamil')) return 'ta';
  if (name.includes('telugu') || name.includes('eenadu') || name.includes('sakshi') || name.includes('tv9 telugu')) return 'te';
  if (name.includes('kannada') || name.includes('prajavani') || name.includes('vijaya karnataka') || name.includes('tv9 kannada')) return 'kn';
  if (name.includes('malayalam') || name.includes('manorama') || name.includes('mathrubhumi')) return 'ml';
  if (
    name.includes('punjabi')
    || name.includes('bbc punjabi')
    || name.includes('jagbani')
    || name.includes('punjab kesari punjabi')
    || name.includes('ajit')
    || name.includes('punjabi tribune')
    || name.includes('news18 punjab')
    || name.includes('punjabi jagran')
  ) return 'pa';
  if (
    name.includes('gujarati')
    || name.includes('bbc gujarati')
    || name.includes('divya bhaskar')
    || name.includes('gujarat samachar')
    || name.includes('sandesh')
    || name.includes('news18 gujarati')
  ) return 'gu';
  if (name.includes('arabic') || name.includes('عربي') || name.includes('al jazeera arabic') || name.includes('al arabiya') || name.includes('ahram')) return 'ar';
  if (
    name.includes('urdu')
    || name.includes('jang')
    || name.includes('geo urdu')
    || name.includes('bbc urdu')
    || name.includes('dw urdu')
    || name.includes('deutsche welle urdu')
    || name.includes('voice of america urdu')
    || name.includes('akhbar urdu')
    || name.includes('urdu news')
    || name.includes('news18 urdu')
    || name.includes('wire urdu')
  ) return 'ur';
  if (name.includes('french') || name.includes('le monde') || name.includes('le figaro') || name.includes('radio-canada') || name.includes('ledevoir') || name.includes('rfi')) return 'fr';
  if (name.includes('german') || name.includes('spiegel') || name.includes('zeit') || name.includes('deutsche welle german') || name.includes('süddeutsche')) return 'de';
  if (name.includes('spanish') || name.includes('el país') || name.includes('el pais') || name.includes('el mundo') || name.includes('rtve') || name.includes('bbc mundo') || name.includes('infobae')) return 'es';
  if (name.includes('portuguese') || name.includes('g1 globo') || name.includes('folha') || name.includes('bbc brasil')) return 'pt';
  if (name.includes('russian') || name.includes('tass') || name.includes('ria novosti') || name.includes('rt russian')) return 'ru';
  if (name.includes('japanese') || name.includes('nhk') || name.includes('asahi')) return 'ja';
  if (name.includes('korean') || name.includes('yonhap') || name.includes('korea herald') || name.includes('joongang')) return 'ko';
  if (name.includes('chinese') || name.includes('xinhua') || name.includes('cgtn')) return 'zh';
  if (name.includes('indonesian') || name.includes('kompas') || name.includes('detik')) return 'id';
  if (name.includes('malay') || name.includes('bernama bm') || name.includes('astro awani')) return 'ms';
  if (name.includes('turkish') || name.includes('türkiye') || name.includes('hurriyet') || name.includes('hürriyet') || name.includes('anadolu agency')) return 'tr';
  if (name.includes('italian') || name.includes('ansa') || name.includes('repubblica') || name.includes('corriere')) return 'it';
  return 'en';
}
