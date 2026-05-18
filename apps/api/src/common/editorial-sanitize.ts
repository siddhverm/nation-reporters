/**
 * Removes syndication boilerplate (read-more lines, bare source URLs) from bodies and titles.
 * Keep in sync with stripSyndicationLinkbacks in apps/web/lib/rss-plain-text.ts.
 */

function isSyndicationLinkbackBlock(block: string): boolean {
  const t = block.trim();
  if (!t) return true;
  if (/^read\s+more:?\s*https?:\/\//i.test(t)) return true;
  if (/^read\s+on:?\s*https?:\/\//i.test(t)) return true;
  if (/^full\s+(story|article|report):?\s*https?:\/\//i.test(t)) return true;
  if (/^source:?\s*https?:\/\//i.test(t)) return true;
  if (/^click\s+here:?\s*https?:\/\//i.test(t)) return true;
  if (/^(यहाँ\s+पढ़ें|पूरा\s+लेख\s+पढ़ें|और\s+पढ़ें):?\s*https?:\/\//i.test(t)) return true;
  if (/^https?:\/\/\S+$/i.test(t) && t.length < 600) return true;
  if (/^full details are available on the original publisher page\.?$/i.test(t)) return true;
  if (/^read full report at source\.?$/i.test(t)) return true;
  if (/^source:\s*.+syndicated summary/i.test(t)) return true;
  return false;
}

/** Drop read-more / URL-only blocks; strip inline “Read more:” tails per paragraph. */
export function stripSyndicationLinkbacks(text: string): string {
  if (!text?.trim()) return (text ?? '').trim();
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => !isSyndicationLinkbackBlock(b))
    .map((b) =>
      b
        .replace(/\s+read\s+more:?\s+https?:\/\/\S+/gi, '')
        .replace(/\s+read\s+on:?\s+https?:\/\/\S+/gi, '')
        .replace(/\s+continue\s+reading:?\s+https?:\/\/\S+/gi, '')
        .replace(/\s+continue reading\.?\.?\.*\s*$/i, '')
        .replace(/\s+read more\.?\.?\.*\s*$/i, '')
        .replace(/\s+full details are available on the original publisher page\.?\s*$/i, '')
        .replace(/\s+read full report at source\.?\s*$/i, '')
        .replace(/\s+\.\.\.\s*$/i, '')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/** Headline prefixes copied from wires — Nation Reporters uses its own voice. */
export function stripWireHeadlinePrefix(title: string): string {
  return title.replace(/^(just\s+in|breaking\s+news|breaking|update)\s*:\s*/i, '').trim();
}
