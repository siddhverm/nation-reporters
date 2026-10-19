/**
 * Page-boilerplate stripping + body-quality checks for scraped article text.
 * Scraped pages leak menus ("Home India World Sign In"), "Trending Stories" / "Videos" lists, "Join conversation",
 * comment prompts, "Download the app", "End of Article", "Follow Us On Social Media" … Everything after an END marker
 * is dropped (it is never story text). `assessStoryBody` decides whether the result is publishable: bodies that are
 * mostly boilerplate, too short, or end mid-sentence must be held as DRAFT, never published.
 */

/** Phrases that end the story: this phrase and everything after it is removed. */
const END_MARKERS: RegExp[] = [
  /\bend\s+of\s+(?:the\s+)?(?:article|story)\b/i,
  /\bfollow\s+us\s+on\s+(?:social\s+media|facebook|twitter|instagram|x\b|youtube|whatsapp|telegram)/i,
  /\bjoin\s+(?:the\s+)?conversation\b/i,
  /\bjoin\s+our\s+(?:whatsapp|telegram|community)\b/i,
  /\b(?:more\s+)?trending\s+(?:stories|news|videos|now|topics)\b/i,
  /\b(?:top|latest|more|related|recommended|popular|must[-\s]read)\s+(?:stories|news|articles|videos|reads)\b(?=\s*[:\n]|\s+[A-Z])/,
  /\byou\s+(?:may|might)\s+also\s+(?:like|want\s+to\s+read)\b/i,
  /\balso\s+read\s*[:|]/i,
  /\brecommended\s+for\s+you\b/i,
  /\brelated\s+(?:topics|articles|stories|news|videos)\b/i,
  /\b(?:leave|post|add|write)\s+(?:a|your)\s+(?:comment|reply|thoughts)\b/i,
  /(?:\bcomments?[ \t]*\(\s*\d+\s*\)|(?<![:\d])\b\d+[ \t]+comments?\b)/i,
  /\bshare\s+your\s+(?:views|thoughts|opinion)\b/i,
  /\bwhat\s+do\s+you\s+think\??\s*(?:share|comment)/i,
  /\ball\s+rights\s+reserved\b/i,
  /©\s*(?:19|20)\d{2}/,
  /\bcopyright\s+(?:©|\(c\))?\s*(?:19|20)\d{2}\b/i,
  /\bsubscribe\s+to\s+(?:our|the)\s+newsletter\b/i,
  /\bsign\s+up\s+for\s+(?:our|the)\s+(?:newsletter|alerts)\b/i,
  /\bdownload\s+(?:the\s+)?(?:[A-Za-z0-9.]+\s+){0,3}app\b/i,
  /\bget\s+(?:the\s+)?latest\s+news\s+(?:and|&)\s+updates\b/i,
  /\bprivacy\s+policy\b[\s\S]{0,40}\bterms\b/i,
];

/** Whole-line junk (line removed, scanning continues). */
const JUNK_LINE: RegExp[] = [
  /^\s*(?:advertisement|advertisements?|ad|sponsored|promoted|story\s+continues\s+below\s+advertisement|skip\s+to\s+(?:main\s+)?content)\s*$/i,
  /^\s*(?:menu|search|sign\s*in|log\s*in|login|sign\s*up|register|subscribe|e-?paper|epaper|share|tweet|print|email|copy\s+link|follow|bookmark|save|listen|play|pause|mute|fullscreen|close|next|previous|more|open\s+app|get\s+app|install\s+app)\s*$/i,
  /^\s*(?:home|india|world|business|sports?|entertainment|tech(?:nology)?|lifestyle|opinion|videos?|photos?|news|city|cities|elections?|trending|live\s+tv|live|web\s+stories|podcasts?|astrology|education|health|science|auto|cricket|bollywood|states?|politics|markets?|economy|travel|food|fashion|gadgets|photogallery|shorts|reels|games?|more)\s*$/i,
  /^\s*(?:watch|video|photos?|gallery)\s*[:|-]\s+.{0,140}$/i,
  /^\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/,
  /^\s*(?:updated|published|last\s+updated|first\s+published|posted)\s*(?:on|at|:)?\s+.{0,60}$/i,
  /^\s*(?:by|edited\s+by|written\s+by|reported\s+by|photo|image|source|credit|via)\s*[:/|-]?\s+.{0,80}$/i,
  /^\s*(?:tags?|topics?|filed\s+under|keywords?)\s*[:|-].*$/i,
  /^\s*(?:read\s+(?:more|next|also|full\s+story)|click\s+here|tap\s+here|continue\s+reading|view\s+all|see\s+all|load\s+more|show\s+more)\b.{0,80}$/i,
  /^\s*(?:follow|like|join|subscribe|download|install|get|watch\s+live|stream)\b.{0,70}\b(?:app|channel|page|whatsapp|telegram|instagram|facebook|twitter|youtube|social\s+media|newsletter|alerts?|updates?)\b.{0,50}$/i,
  /^\s*(?:accept\s+(?:all\s+)?cookies?|we\s+use\s+cookies|cookie\s+(?:policy|settings)|manage\s+preferences)\b.{0,120}$/i,
  /^\s*(?:comments?|add\s+comment|post\s+comment|view\s+comments?|be\s+the\s+first\s+to\s+comment)\s*(?:\(\d+\))?\s*$/i,
  /^\s*[•·|›»>\-–—*]+\s*$/,
];

const SENTENCE_END = /[.!?।。！？؟…"”’')\]»](?:\s*[”"’')\]»])*\s*$/u;
const NAV_WORD = /^(?:home|india|world|business|sports?|entertainment|tech(?:nology)?|lifestyle|opinion|videos?|photos?|news|city|elections?|trending|live|politics|markets?|economy|cricket|bollywood|education|health|science|auto|travel|sign|log|in|up|menu|search|more|subscribe|epaper|e-paper)$/i;

function isShortNavLine(line: string): boolean {
  const t = line.trim();
  return t.length > 0 && t.length <= 26 && !SENTENCE_END.test(t) && t.split(/\s+/).length <= 3;
}

export type BoilerplateResult = { text: string; removedChars: number; originalChars: number; cutAtMarker: boolean };

/** Strip page chrome from scraped text. Keeps paragraph breaks (blank line between paragraphs). */
export function stripPageBoilerplateDetailed(input: string | null | undefined): BoilerplateResult {
  const original = (input ?? '').replace(/\r\n?/g, '\n');
  const originalChars = original.replace(/\s+/g, '').length;
  let text = original;
  let cutAtMarker = false;

  // 1. cut at the earliest END marker, but never at position < 40 chars of real content before it
  //    (a marker that opens the text belongs to a header/menu: its line is removed in step 2 instead)
  let cut = -1;
  for (const m of END_MARKERS) {
    const hit = m.exec(text);
    if (hit && hit.index >= 40 && (cut === -1 || hit.index < cut)) {
      const before = text.slice(0, hit.index).replace(/\s+/g, '');
      if (before.length >= 40) cut = hit.index;
    }
  }
  if (cut >= 0) { text = text.slice(0, cut); cutAtMarker = true; }

  // 2. line filters; menus = runs of >=4 short unpunctuated lines
  const lines = text.split('\n');
  const keep: boolean[] = lines.map(() => true);
  lines.forEach((ln, i) => {
    if (JUNK_LINE.some((r) => r.test(ln))) keep[i] = false;
    // headers of removed marker phrases at the very start of the text
    if (END_MARKERS.some((r) => r.test(ln)) && ln.trim().length < 90) keep[i] = false;
    // "Home | India | World | …" / "Home > India > …" breadcrumbs and pipe menus
    if ((ln.match(/\s[|›»>/]\s/g) ?? []).length >= 2 && ln.length < 220) {
      const parts = ln.split(/\s[|›»>/]\s/).map((p) => p.trim());
      if (parts.every((p) => p.length <= 28)) keep[i] = false;
    }
    // many nav words glued on one line ("Home India World Business Sports Sign In")
    const words = ln.trim().split(/\s+/);
    if (words.length >= 5 && words.length <= 40 && words.filter((w) => NAV_WORD.test(w)).length / words.length >= 0.6 && !SENTENCE_END.test(ln.trim())) keep[i] = false;
  });
  for (let i = 0; i < lines.length; ) {
    if (!lines[i].trim() || !isShortNavLine(lines[i])) { i++; continue; }
    let j = i; let n = 0;
    while (j < lines.length && (isShortNavLine(lines[j]) || !lines[j].trim())) { if (lines[j].trim()) n++; j++; }
    if (n >= 4) for (let k = i; k < j; k++) keep[k] = false;
    i = Math.max(j, i + 1);
  }

  // 3. inline junk glued into a paragraph
  const cleaned = lines
    .filter((_, i) => keep[i])
    .map((ln) =>
      ln
        .replace(/\b(?:advertisement|story\s+continues\s+below\s+advertisement)\b/gi, ' ')
        .replace(/\b(?:sign\s+in|log\s+in)\s*\/\s*(?:sign\s+up|register)\b/gi, ' ')
        .replace(/\b(?:updated|published)\s*:?\s*(?:on\s+)?(?:[A-Z][a-z]{2,8}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})(?:,?\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:IST|UTC|GMT|BST|EST)?)?/gi, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    );
  text = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n[ \t]*\n/g, '\n\n').trim();
  const outChars = text.replace(/\s+/g, '').length;
  return { text, removedChars: Math.max(0, originalChars - outChars), originalChars, cutAtMarker };
}

export function stripPageBoilerplate(input: string | null | undefined): string {
  return stripPageBoilerplateDetailed(input).text;
}

/** True when text stops mid-sentence (no terminal punctuation), e.g. a truncated scrape. */
export function looksTruncated(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  const last = t.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
  if (!last) return false;
  if (/(?:\.\.\.|…)\s*$/.test(last)) return true; // ellipsis = cut-off teaser
  if (SENTENCE_END.test(last)) return false;
  // headings / short labels are not sentences; a long final line with no terminator is truncated
  return last.length > 60 || /[,;:\-–—]\s*$/.test(last) || /\b(?:and|or|the|a|an|of|to|in|on|at|with|for|by|from|that|which|as)\s*$/i.test(last);
}

export type BodyQuality = { ok: boolean; reasons: Array<'empty' | 'too_short' | 'mostly_boilerplate' | 'truncated'>; cleaned: string; boilerplateShare: number };

export function assessStoryBody(
  text: string | null | undefined,
  opts: { minChars?: number; maxBoilerplateShare?: number; requireSentenceEnd?: boolean } = {},
): BodyQuality {
  const r = stripPageBoilerplateDetailed(text);
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(r.text);
  const minChars = opts.minChars ?? (cjk ? 40 : 120);
  const share = r.originalChars > 0 ? r.removedChars / r.originalChars : 0;
  const reasons: BodyQuality['reasons'] = [];
  if (!r.text.trim()) reasons.push('empty');
  else if (r.text.replace(/\s+/g, ' ').length < minChars) reasons.push('too_short');
  if (share > (opts.maxBoilerplateShare ?? 0.5) && r.originalChars > 200) reasons.push('mostly_boilerplate');
  if ((opts.requireSentenceEnd ?? true) && r.text && looksTruncated(r.text)) reasons.push('truncated');
  return { ok: reasons.length === 0, reasons, cleaned: r.text, boilerplateShare: share };
}
