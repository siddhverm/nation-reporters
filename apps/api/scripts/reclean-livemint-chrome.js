#!/usr/bin/env node
/**
 * One-off: re-clean excerpt/bodyShort/bodyMedium/aiVideo.summary for articles
 * polluted with LiveMint-style chrome ("Written By", "View Market Dashboard", etc).
 * Usage (in api container): node dist/scripts/reclean-livemint-chrome.js [--apply]
 */
const { PrismaClient } = require('@prisma/client');

// Inline minimal sanitizer so this can run without rebuilding Nest dist modules.
function stripChrome(text, headline) {
  if (!text || typeof text !== 'string') return '';
  let t = text;
  // Glued chrome has no trailing word boundary (DashboardJamie, BhattacharyaPublished)
  t = t.replace(/View\s+Market\s+Dashboard/gi, '\n');
  t = t.replace(/Written\s+By\s+[A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+){0,4}/g, '\n');
  t = t.replace(
    /Published\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*IST/gi,
    '\n',
  );
  t = t.replace(
    /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4},?\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*IST/gi,
    '\n',
  );
  t = t.replace(/AI\s+Quick\s+Read/gi, '\n');
  t = t.replace(/Wait\s+for\s+it[….…]*/gi, '\n');
  t = t.replace(/Log\s+in\s+to\s+our\s+website[^.!?\n]{0,160}[.!?]?/gi, '\n');
  t = t.replace(/Yes,\s*Continue/gi, '\n');
  t = t.replace(/Oops!\s*Looks\s+like\s+you\s+have\s+exceeded[^.!?\n]{0,160}[.!?]?/gi, '\n');
  t = t.replace(/Remove\s+some\s+to\s+bookmark\s+this\s+image\.?/gi, '\n');
  t = t.replace(/It'll\s+just\s+take\s+a\s+moment\.?/gi, '\n');
  if (headline && headline.length > 16) {
    const esc = headline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(${esc})\\s*\\1+`, 'gu'), headline);
    if (t.trimStart().startsWith(headline)) {
      t = t.trimStart().slice(headline.length).replace(/^[\s:–—-]+/, '');
    }
  }
  // Keep story sentences; drop leftover chrome crumbs
  const parts = t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l.length < 28) return false;
      if (/^Written\s+By/i.test(l)) return false;
      if (/^Published\s*\d/i.test(l)) return false;
      if (/^AI\s+Quick/i.test(l)) return false;
      if (/Log\s+in\s+to\s+our\s+website/i.test(l)) return false;
      if (/exceeded\s+the\s+limit/i.test(l)) return false;
      if (/^View\s+Market/i.test(l)) return false;
      if (/^Wait\s+for\s+it/i.test(l)) return false;
      return true;
    });
  let out = parts.join(' ').replace(/\s+/g, ' ').trim();
  // Prefer ~3 sentences / ~500 chars for reader summary
  if (out.length > 700) {
    const sents = out.split(/(?<=[.!?])\s+/).filter(Boolean);
    let acc = '';
    for (const s of sents) {
      const next = acc ? `${acc} ${s}` : s;
      if (next.length > 700 && acc.length >= 280) break;
      acc = next;
      if (acc.split(/(?<=[.!?])\s+/).length >= 3 && acc.length >= 280) break;
    }
    out = acc || out.slice(0, 700);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  console.log(`reclean-livemint-chrome ${apply ? 'APPLY' : 'DRY'}`);

  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, slug, title, excerpt, "bodyShort", "bodyMedium"
    FROM articles
    WHERE status = 'PUBLISHED'
      AND (
        excerpt ILIKE '%Written By%'
        OR excerpt ILIKE '%View Market Dashboard%'
        OR excerpt ILIKE '%AI Quick Read%'
        OR "bodyShort" ILIKE '%Written By%'
        OR "bodyShort" ILIKE '%View Market Dashboard%'
      )
    ORDER BY "publishedAt" DESC NULLS LAST
    LIMIT 500
  `);

  let updated = 0;
  let skipped = 0;
  for (const a of rows) {
    const title = a.title || '';
    const excerpt = stripChrome(a.excerpt || '', title);
    const bodyShort = stripChrome(a.bodyShort || '', title);
    const bodyMedium = stripChrome(a.bodyMedium || '', title);
    if (!excerpt && !bodyShort) {
      skipped++;
      continue;
    }
    const same =
      (excerpt || '') === (a.excerpt || '') &&
      (bodyShort || '') === (a.bodyShort || '') &&
      (bodyMedium || '') === (a.bodyMedium || '');
    if (same) {
      skipped++;
      continue;
    }
    console.log(`- ${a.slug}`);
    console.log(`  before: ${(a.excerpt || '').slice(0, 120)}`);
    console.log(`  after:  ${(excerpt || bodyShort || '').slice(0, 120)}`);
    if (apply) {
      await prisma.article.update({
        where: { id: a.id },
        data: {
          ...(excerpt ? { excerpt } : {}),
          ...(bodyShort ? { bodyShort } : {}),
          ...(bodyMedium ? { bodyMedium } : {}),
        },
      });
    }
    updated++;
  }
  console.log(`Done. ${apply ? 'Updated' : 'Would update'} ${updated} (skipped ${skipped}, matched ${rows.length})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
