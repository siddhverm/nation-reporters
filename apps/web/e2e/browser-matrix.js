// Browser matrix against `next start` + e2e/fake-api.ts. See e2e/README.md. Needs: npm i --no-save puppeteer-core
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const WEB = process.env.WEB ?? 'http://localhost:3010', API = process.env.API ?? 'http://localhost:4010/api/v1';
const OUT = process.env.OUT ?? path.resolve(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../test-fixtures/news-fixtures.json'), 'utf8'));
const GENERATED = new Set(['en', 'hi', 'ar', 'zh', 'ta', 'ru']);
const SHOT_LANGS = new Set(['en', 'hi', 'ar', 'ur', 'zh', 'ja', 'ta', 'kn', 'ru', 'fr']);
const LEAK = new RegExp(`${fx.outlet}|${fx.domain}|dailyplanet|rohan\\s*mehta|kiran\\s*rao|youtube\\.com/(?:watch|embed)|/api/image`, 'i');
const LANGS = Object.keys(fx.languages);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => (await fetch(API + p)).json();

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'] });
  const results = {};
  for (const lang of LANGS) {
    const f = fx.languages[lang];
    const r = (results[lang] = {});
    const list = (await get(`/articles?language=${lang}&omitBody=true&limit=5&status=PUBLISHED`)).data;
    const slug = list[0].slug;
    const rtl = f.dir === 'rtl';
    const page = await browser.newPage();
    const reqs = [];
    page.on('request', (q) => reqs.push(q.url()));
    const imgResp = {};
    page.on('response', (res) => { if (res.url().includes('/story-image/')) imgResp[res.url()] = { status: res.status(), type: res.headers()['content-type'], kind: res.headers()['x-story-image'] }; });
    await page.setViewport({ width: 1280, height: 800 });
    // ---- raw SSR HTML (what crawlers/OG scrapers see)
    const ssr = await (await fetch(`${WEB}/article/${encodeURIComponent(slug)}`)).text();
    const meta = (n) => (ssr.match(new RegExp(`<meta (?:property|name)="${n}" content="([^"]*)"`)) || [])[1];
    const ld = JSON.parse((ssr.match(/<script type="application\/ld\+json">([^<]*)</) || [])[1] || '{}');
    r.meta = !!meta('og:title') && !!meta('og:description') && !!meta('twitter:card') && meta('og:locale') && ssr.includes('rel="canonical"');
    r.ogImage = meta('og:image') === `https://nationreporters.com/story-image/${slug}` && meta('twitter:image') === meta('og:image');
    r.jsonld = ld.inLanguage === lang && ld.image?.[0]?.endsWith(`/story-image/${slug}`) && ld.author?.name === 'Nation Reporters';
    r.ssrNoLeak = !LEAK.test(ssr);
    // OG image actually fetchable + is an image
    const og = await fetch(`${WEB}/story-image/${encodeURIComponent(slug)}`);
    const buf = Buffer.from(await og.arrayBuffer());
    r.ogFetch = og.status === 200 && /^image\/png/.test(og.headers.get('content-type')) && buf.length > 1000 && buf.slice(1, 4).toString() === 'PNG';
    r.imageKind = og.headers.get('x-story-image');
    r.imageKindExpected = r.imageKind === (GENERATED.has(lang) ? 'generated' : 'fallback');
    // ---- rendered article page
    await page.goto(`${WEB}/article/${encodeURIComponent(slug)}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('h1', { timeout: 15000 });
    const dom = await page.evaluate(() => {
      const art = document.querySelector('article');
      const img = art?.querySelector('img');
      const h1 = document.querySelector('h1');
      const cs = getComputedStyle(art);
      return {
        lang: art?.getAttribute('lang'), dir: art?.getAttribute('dir'), direction: cs.direction,
        h1: h1?.textContent, imgSrc: img?.getAttribute('src'), imgAlt: img?.getAttribute('alt'), imgLoaded: !!img && img.complete && img.naturalWidth > 0,
        text: document.body.innerText, html: document.documentElement.outerHTML, title: document.title,
        credit: /📷/.test(document.body.innerText),
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      };
    });
    r.lang = dom.lang === lang;
    r.dir = dom.dir === (rtl ? 'rtl' : 'ltr') && dom.direction === (rtl ? 'rtl' : 'ltr');
    r.heroImage = dom.imgSrc === `/story-image/${encodeURIComponent(slug)}` && dom.imgLoaded;
    r.alt = !!dom.imgAlt && dom.imgAlt.includes(dom.h1.slice(0, 12));
    r.translatedText = dom.text.includes(f.paragraphs[0].slice(0, 12)) || dom.text.includes(f.title.slice(0, 8));
    r.docTitle = dom.title.includes(dom.h1.slice(0, 8));
    r.noLeakDom = !LEAK.test(dom.text) && !LEAK.test(dom.html) && !dom.credit;
    const okHost = (u) => /^(http:\/\/localhost:(3010|4010|3001|3005)\/|https:\/\/fonts\.(googleapis|gstatic)\.com\/|data:|blob:)/.test(u);
    r.noLeakNet = !reqs.some((u) => LEAK.test(u) || !okHost(u));
    r.noHScroll = dom.scrollW <= dom.clientW + 1;
    // ---- home page in this UI language (cards use generated images)
    const home = await browser.newPage();
    const hreq = [];
    home.on('request', (q) => hreq.push(q.url()));
    await home.setViewport({ width: 1280, height: 800 });
    await home.goto(`${WEB}/?lang=${lang}`, { waitUntil: 'networkidle0' });
    await sleep(500);
    const hd = await home.evaluate((slug) => {
      const a = [...document.querySelectorAll('a')].find((x) => decodeURIComponent(x.getAttribute('href') || '').includes(slug));
      const img = a?.querySelector('img') || document.querySelector(`img[src*="${slug}"]`);
      return { card: !!a, img: img?.getAttribute('src') || null, loaded: !!img && img.complete && img.naturalWidth > 0, text: document.body.innerText, html: document.documentElement.outerHTML, imgs: [...document.querySelectorAll('img')].map((i) => i.getAttribute('src')) };
    }, slug);
    r.homeCard = hd.card && !!hd.img && hd.img.startsWith('/story-image/') && hd.loaded;
    r.homeNoLeak = !LEAK.test(hd.text) && !LEAK.test(hd.html) && !hreq.some((u) => LEAK.test(u) || !okHost(u));
    r.homeNoSourceImg = hd.imgs.every((s) => !s || s.startsWith('/') || s.startsWith(WEB));
    // ---- screenshots
    if (SHOT_LANGS.has(lang)) {
      for (const [w, h] of [[390, 844], [1280, 800]]) {
        await page.setViewport({ width: w, height: h, isMobile: w < 500, deviceScaleFactor: 1 });
        await page.goto(`${WEB}/article/${encodeURIComponent(slug)}`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('h1');
        await sleep(300);
        await page.screenshot({ path: `${OUT}/nr_${lang}_article_${w}x${h}.png` });
        await home.setViewport({ width: w, height: h, isMobile: w < 500, deviceScaleFactor: 1 });
        await home.goto(`${WEB}/?lang=${lang}`, { waitUntil: 'networkidle0' });
        await sleep(500);
        await home.screenshot({ path: `${OUT}/nr_${lang}_home_${w}x${h}.png` });
      }
    }
    r.noHScrollMobile = await (async () => { await page.setViewport({ width: 390, height: 844, isMobile: true }); await page.goto(`${WEB}/article/${encodeURIComponent(slug)}`, { waitUntil: 'networkidle0' }); await page.waitForSelector('h1'); return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1); })();
    await home.close(); await page.close();
  }
  // ---- site-level checks
  const sm = await (await fetch(`${WEB}/sitemap.xml`)).text();
  results._site = {
    sitemapArticles: LANGS.every((l) => true) && (sm.match(/\/article\//g) || []).length >= 23,
    sitemapNoDraft: !sm.includes('secret-draft-story'),
    sitemapNoLeak: !LEAK.test(sm),
    draft404: (await fetch(`${API}/articles/secret-draft-story`)).status === 404,
    draftListEmpty: (await get('/articles?status=DRAFT&limit=5')).data.every((x) => x.status === 'PUBLISHED'),
    versionsStaffOnly: (await fetch(`${API}/articles/${(await get('/articles?limit=1&omitBody=true')).data[0].id}/versions`)).status === 401 || (await fetch(`${API}/articles/${(await get('/articles?limit=1&omitBody=true')).data[0].id}/versions`)).status === 403,
    anonNoInternals: !/riskAssessment|authorId|ingestedArticleId|versions/.test(JSON.stringify(await get('/articles?limit=3'))),
    staffSeesDraft: (await (await fetch(`${API}/articles/secret-draft-story`, { headers: { authorization: 'Bearer staff' } })).json()).status === 'DRAFT',
    apiImageProxyGone: (await fetch(`${WEB}/api/image?url=http://localhost:4010/api/v1/articles`)).status === 404,
    storyImageBadSlug: (await fetch(`${WEB}/story-image/${encodeURIComponent('a b/../x')}`)).status === 404,
  };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  await browser.close();
  const keys = Object.keys(results.en);
  let bad = 0;
  for (const [l, r] of Object.entries(results)) { if (l === '_site') continue; for (const k of keys) if (r[k] === false) { bad++; console.log('FAIL', l, k); } }
  console.log('site', JSON.stringify(results._site));
  console.log('failures', bad);
})().catch((e) => { console.error(e); process.exit(1); });
