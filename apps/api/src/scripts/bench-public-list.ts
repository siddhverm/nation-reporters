/**
 * Benchmark the public list serializer (what GET /articles?omitBody=true does per row) with a realistic
 * publisher registry (~850 name variants) and 150 long English / Hindi rows.
 *   npx ts-node --transpile-only src/scripts/bench-public-list.ts [rows=150]
 */
import { registerSourceNames } from '../common/source-scrub.util';
import { namesFromSources } from '../common/source-names.service';
import { sanitizeArticleListItem } from '../common/article-public-sanitize.util';
import { REGIONAL_FEED_SOURCES } from '../modules/ingestion/regional-feed-sources';

const CITIES = ['Bhopal', 'Indore', 'Jaipur', 'Lucknow', 'Patna', 'Ranchi', 'Nagpur', 'Pune', 'Surat', 'Kochi', 'Mysuru', 'Guwahati', 'Shimla', 'Dehradun', 'Raipur', 'Agra', 'Varanasi', 'Kanpur', 'Meerut', 'Ajmer', 'Udaipur', 'Jodhpur', 'Bikaner', 'Gwalior', 'Jabalpur', 'Rajkot', 'Vadodara', 'Nashik', 'Aurangabad', 'Madurai', 'Coimbatore', 'Vizag', 'Vijayawada', 'Warangal', 'Mangaluru', 'Hubballi', 'Belagavi', 'Siliguri', 'Cuttack', 'Jammu'];
const NOUNS = ['Samachar', 'Herald', 'Chronicle', 'Patrika', 'Sandesh', 'Khabar', 'Bulletin Network', 'Gazette', 'Observer', 'Darpan', 'Prahari', 'Jagran Live'];

export function benchSources() {
  const rows: { name: string; feedUrl: string }[] = REGIONAL_FEED_SOURCES.map((r) => ({ name: r.name, feedUrl: r.feedUrl }));
  let i = 0;
  for (const c of CITIES) for (const n of NOUNS) {
    if (rows.length >= 330) break;
    rows.push({ name: `${c} ${n}`, feedUrl: `https://www.${c.toLowerCase()}${n.split(' ')[0].toLowerCase()}${i++}.in/rss/feed.xml` });
  }
  return rows;
}

const EN_P = 'The state government on Monday announced a fresh relief package for farmers affected by unseasonal rain, with officials saying payments would begin within two weeks. Opposition leaders called the measure inadequate and demanded a district-wise survey. According to PTI, the cabinet also cleared a proposal to expand crop insurance coverage, and the Times of India reported that several districts had already started assessments. "We will not leave any farmer behind," the chief minister told reporters in the capital. ';
const HI_P = 'राज्य सरकार ने सोमवार को बेमौसम बारिश से प्रभावित किसानों के लिए नए राहत पैकेज की घोषणा की। अधिकारियों ने कहा कि भुगतान दो सप्ताह के भीतर शुरू होगा। विपक्षी नेताओं ने इस कदम को अपर्याप्त बताया और जिलेवार सर्वेक्षण की मांग की। एजेंसी के अनुसार मंत्रिमंडल ने फसल बीमा कवरेज बढ़ाने के प्रस्ताव को भी मंजूरी दी। ';

export function benchRows(n: number, sources: { name: string; feedUrl: string }[]) {
  return Array.from({ length: n }, (_, k) => {
    const hi = k % 2 === 1;
    const src = sources[k % sources.length];
    const p = hi ? HI_P : EN_P;
    return {
      id: `id-${k}`,
      slug: `story-${k}`,
      title: hi ? `किसानों के लिए राहत पैकेज की घोषणा, विपक्ष ने बताया अपर्याप्त ${k}` : `State announces relief package for rain-hit farmers, opposition unhappy ${k}`,
      excerpt: p.repeat(2).slice(0, 600),
      podcastScript: p.repeat(8), // ~3-4k chars, like the stored narration
      language: hi ? 'hi' : 'en',
      categoryId: 'c1',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      imageOrigin: null,
      provenance: { sourceName: src.name, sourceUrl: src.feedUrl },
    };
  });
}

export function runBench(n = 150, withPodcastScript = true) {
  const sources = benchSources();
  const names = namesFromSources(sources);
  registerSourceNames(names);
  const rows = benchRows(n, sources).map((r) => (withPodcastScript ? r : { ...r, podcastScript: undefined }));
  sanitizeArticleListItem(rows[0]); // warm-up (first compile)
  const t0 = process.hrtime.bigint();
  for (const r of rows) sanitizeArticleListItem(r);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { rows: n, withPodcastScript, registeredNames: names.length, sources: sources.length, totalMs: Math.round(ms), perRowMs: +(ms / n).toFixed(2) };
}

if (require.main === module) {
  const n = Number(process.argv[2] ?? 150) || 150;
  // with podcastScript = the old list select (worst case); without = what GET /articles?omitBody=true selects now
  console.log(JSON.stringify(runBench(n, process.env.BENCH_NO_PODCAST !== '1')));
}
