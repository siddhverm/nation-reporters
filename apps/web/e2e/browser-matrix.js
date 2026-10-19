// Browser matrix against `next start` + e2e/fake-api.ts. See e2e/README.md. Needs: npm i --no-save puppeteer-core
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const WEB = process.env.WEB ?? 'http://localhost:3010', API = process.env.API ?? 'http://localhost:4010/api/v1';
const OUT = process.env.OUT ?? path.resolve(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../test-fixtures/news-fixtures.json'), 'utf8'));
// must match api/e2e/fake-api.ts: mirrored SOURCE image / AI-GENERATED image / neither (fallback artwork)
const SOURCE = new Set(['en', 'ar', 'ja', 'kn', 'fr', 'it', 'tr', 'mr']);
const GENERATED = new Set(['hi', 'zh', 'ta', 'ru', 'te', 'de']);
const kindOf = (l) => (SOURCE.has(l) ? 'source' : GENERATED.has(l) ? 'generated' : 'fallback');
const SHOT_LANGS = new Set(['en', 'hi', 'ar', 'ur', 'zh', 'ja', 'ta', 'kn', 'ru', 'fr']);
const LEAK = new RegExp(`${fx.outlet}|${fx.domain}|dailyplanet|rohan\\s*mehta|kiran\\s*rao|youtube\\.com/(?:watch|embed)|/api/image`, 'i');
const LANGS = Object.keys(fx.languages);
// load the web notices dictionary (TS) without a build step
const ts = require(require.resolve('typescript', { paths: [path.resolve(__dirname, '../../..')] }));
const NOTICES = (() => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../lib/ui-notices.ts'), 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2019' } }).outputText)(m, m.exports); return m.exports; })();
const EXPECT_EN_NOTE = '* We do not own the copyright of this image. Image belongs to its original owner; removed on request.';
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
    r.imageKindExpected = r.imageKind === kindOf(lang);
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
        notice: document.querySelector('article [data-testid="story-image-notice"]')?.innerText || '',
        noticeOrigin: document.querySelector('article [data-testid="story-image-notice"]')?.getAttribute('data-origin'),
        noticeLang: document.querySelector('article [data-testid="story-image-notice"]')?.getAttribute('lang'),
        noticeNote: document.querySelector('article [data-testid="image-copyright-note"]')?.innerText || '',
        noticeFont: parseFloat(getComputedStyle(document.querySelector('article [data-testid="image-copyright-note"]') || document.body).fontSize),
        keyPoints: [...document.querySelectorAll('article [data-testid="key-points"] li')].map((x) => x.innerText),
        keyPointsLabel: document.querySelector('article [data-testid="key-points"] p')?.textContent || '',
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      };
    });
    r.lang = dom.lang === lang;
    r.dir = dom.dir === (rtl ? 'rtl' : 'ltr') && dom.direction === (rtl ? 'rtl' : 'ltr');
    // public API contract: our URL + origin only
    const apiArt = await get(`/articles/${encodeURIComponent(slug)}`);
    const apiList = (await get(`/articles?language=${lang}&omitBody=true&limit=5&status=PUBLISHED`)).data[0];
    const wantOrigin = SOURCE.has(lang) ? 'source' : 'generated';
    const apiOk = [apiArt, apiList].every((x) => x.image?.url === `/story-image/${slug}` && x.image?.origin === wantOrigin && x.imageOrigin === wantOrigin)
      && apiArt.body?.imageOrigin === wantOrigin && !LEAK.test(JSON.stringify([apiArt, apiList])) && !/source-mirror|s3Key|external\//i.test(JSON.stringify([apiArt, apiList]));
    r.heroImage = dom.imgSrc === `/story-image/${encodeURIComponent(slug)}` && dom.imgLoaded;
    r.alt = !!dom.imgAlt && dom.imgAlt.includes(dom.h1.slice(0, 12));
    r.translatedText = dom.text.includes(f.paragraphs[0].slice(0, 12)) || dom.text.includes(f.title.slice(0, 8));
    r.docTitle = dom.title.includes(dom.h1.slice(0, 8));
    r.noLeakDom = !LEAK.test(dom.text) && !LEAK.test(dom.html) && !dom.credit;
    const okHost = (u) => /^(http:\/\/localhost:(3010|4010|3001|3005)\/|https:\/\/fonts\.(googleapis|gstatic)\.com\/|data:|blob:)/.test(u);
    r.noLeakNet = !reqs.some((u) => LEAK.test(u) || !okHost(u));
    const N = NOTICES.NOTICES[lang];
    const expOrigin = SOURCE.has(lang) ? 'source' : 'generated'; // fallback artwork counts as generated art
    const hasAiLabel = dom.notice.includes(N.illustration);
    const hasNote = dom.noticeNote.length > 0 || dom.notice.includes(N.imageCopyright);
    r.noticeOrigin = dom.noticeOrigin === expOrigin;
    // SOURCE: only the copyright note. GENERATED/FALLBACK: only the AI label.
    r.illustrationLine = expOrigin === 'source' ? !hasAiLabel : hasAiLabel && dom.noticeLang === lang;
    r.copyrightNote = expOrigin === 'source'
      ? dom.noticeNote === N.imageCopyright && dom.noticeFont <= 11 && dom.noticeLang === lang && (lang !== 'en' || dom.noticeNote === EXPECT_EN_NOTE)
      : !hasNote;
    r.altOrigin = expOrigin === 'source' ? dom.imgAlt === dom.h1 : dom.imgAlt.includes(dom.h1.slice(0, 12));
    r.apiOrigin = apiOk;
    r.keyPoints = dom.keyPoints.length === 2 && dom.keyPointsLabel.trim() === N.keyPoints;
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
    // home: compact notice follows the origin too (source -> note only, generated -> AI label only)
    r.homeBadge = hd.html.includes('data-testid="story-image-badge"') && hd.html.includes('data-testid="story-image-notice"')
      && (SOURCE.has(lang)
        ? hd.html.includes('data-origin="source"') && hd.text.includes(N.imageCopyright) && !hd.text.includes(N.illustration)
        : hd.html.includes('data-origin="generated"') && hd.text.includes(N.illustration) && !hd.text.includes(N.imageCopyright));
    r.homeNoSourceImg = hd.imgs.every((s) => !s || s.startsWith('/') || s.startsWith(WEB));
    // ---- /copyright page in this UI language + footer link
    const cp = await browser.newPage();
    await cp.setViewport({ width: 1280, height: 800 });
    await cp.goto(`${WEB}/copyright?lang=${lang}`, { waitUntil: 'networkidle0' });
    await cp.waitForSelector('[data-testid="copyright-page"]');
    const cd = await cp.evaluate(() => {
      const root = document.querySelector('[data-testid="copyright-page"]');
      const foot = [...document.querySelectorAll('footer a')].find((a) => a.getAttribute('href') === '/copyright');
      return { lang: root.getAttribute('lang'), dir: root.getAttribute('dir'), h1: root.querySelector('h1').innerText, statement: root.querySelector('[data-testid="copyright-statement"]').innerText, email: root.querySelector('[data-testid="copyright-email"]').getAttribute('href'), text: root.innerText, html: document.documentElement.outerHTML, footer: foot?.innerText || null };
    });
    r.copyrightPage = cd.lang === lang && cd.dir === (rtl ? 'rtl' : 'ltr') && cd.h1 === N.cpTitle && cd.statement === N.imageCopyright && cd.text.includes(N.cpAi) && cd.text.includes(N.cpHow) && cd.email === `mailto:${process.env.EXPECT_COPYRIGHT_EMAIL ?? 'copyright@example.com'}` && !LEAK.test(cd.html);
    r.footerLink = cd.footer === N.copyrightLink;
    await cp.close();
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
  // ---- takedown: staff-only endpoint swaps a mirrored source image to a generated one (run last: mutates the 'tr' row)
  {
    const tr = (await get('/articles?language=tr&omitBody=true&limit=1&status=PUBLISHED')).data[0];
    const url = `${API}/articles/${encodeURIComponent(tr.slug)}/image/replace-with-generated`;
    const before = (await get(`/articles/${encodeURIComponent(tr.slug)}`)).image.origin;
    const kindBefore = (await fetch(`${WEB}/story-image/${encodeURIComponent(tr.slug)}`)).headers.get('x-story-image');
    const anon = await fetch(url, { method: 'POST' });
    const stillSource = (await get(`/articles/${encodeURIComponent(tr.slug)}`)).image.origin === 'source';
    const staff = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer staff' } });
    const out = await staff.json();
    const afterArt = await get(`/articles/${encodeURIComponent(tr.slug)}`);
    const kindAfter = (await fetch(`${WEB}/story-image/${encodeURIComponent(tr.slug)}`)).headers.get('x-story-image');
    const tp = await browser.newPage();
    await tp.setViewport({ width: 1280, height: 800 });
    await tp.goto(`${WEB}/article/${encodeURIComponent(tr.slug)}`, { waitUntil: 'networkidle0' });
    await tp.waitForSelector('h1');
    const dn = await tp.evaluate(() => ({ origin: document.querySelector('article [data-testid="story-image-notice"]')?.getAttribute('data-origin'), text: document.querySelector('article [data-testid="story-image-notice"]')?.innerText, note: !!document.querySelector('article [data-testid="image-copyright-note"]') }));
    await tp.close();
    results._site.takedown = {
      before: before === 'source' && kindBefore === 'source',
      anonymousRefused: [401, 403].includes(anon.status) && stillSource,
      staffOk: staff.status === 200 && out.imageOrigin === 'generated' && out.removedSourceAssets >= 1 && !JSON.stringify(out).match(/source-mirror|s3Key|dailyplanet/i),
      after: afterArt.image.origin === 'generated' && afterArt.body.imageOrigin === 'generated' && !/source-mirror|external\//i.test(JSON.stringify(afterArt)) && kindAfter === 'generated',
      pageShowsAiLabelNotCopyright: dn.origin === 'generated' && dn.text === NOTICES.NOTICES.tr.illustration && !dn.note,
    };
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  await browser.close();
  const keys = Object.keys(results.en);
  let bad = 0;
  for (const [l, r] of Object.entries(results)) { if (l === '_site') continue; for (const k of keys) if (r[k] === false) { bad++; console.log('FAIL', l, k); } }
  console.log('site', JSON.stringify(results._site));
  for (const [k, v] of Object.entries(results._site.takedown ?? {})) if (v === false) { bad++; console.log('FAIL takedown', k); }
  for (const [k, v] of Object.entries(results._site)) if (v === false) { bad++; console.log('FAIL site', k); }
  console.log('failures', bad);
})().catch((e) => { console.error(e); process.exit(1); });
