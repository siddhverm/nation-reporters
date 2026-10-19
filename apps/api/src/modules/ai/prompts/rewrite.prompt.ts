import { languageDisplayName } from './lang-names';
import { READING_LEVEL_GUIDANCE, type ReadingLevel } from '../../../common/reading-level';

export type RewritePromptOptions = {
  readingLevel?: ReadingLevel;
  /** Upper bound for the full-coverage body, in words (CJK: roughly characters / 2). */
  maxLongWords?: number;
  /** Second attempt after a draft was too close to the source / dropped facts. */
  retryReason?: 'too_similar' | 'missing_facts' | 'names_source' | null;
  /** Numbers from the source that the previous draft dropped (shown to the model on retry). */
  missingNumbers?: string[];
};

/** JSON keys the model must return. Exported so tests and the parser stay in sync with the prompt. */
export const REWRITE_JSON_KEYS = ['title', 'summary', 'keyPoints', 'short', 'medium', 'long', 'podcastScript', 'language'] as const;

/**
 * Simplify-and-summarise prompt: original wording, plain language, full coverage of the news
 * (what / who / when / where / why it matters / what next) without copying the source and without naming it.
 */
export function rewritePrompt(title: string, body: string, targetLang: string, opts: RewritePromptOptions = {}) {
  const langName = languageDisplayName(targetLang);
  const code = targetLang.toLowerCase();
  const level = READING_LEVEL_GUIDANCE[opts.readingLevel ?? 'simple'];
  const maxLong = Math.max(200, Math.round(opts.maxLongWords ?? 700));
  const retry =
    opts.retryReason === 'too_similar'
      ? `\nPREVIOUS ATTEMPT REJECTED: it reused phrases from the source. Rebuild every sentence from the facts with a different structure and different words; do not reuse any run of more than 4 consecutive words from the source (names, numbers, dates and quotes' meaning excepted).\n`
      : opts.retryReason === 'names_source'
        ? `\nPREVIOUS ATTEMPT REJECTED: it named the publisher / news outlet / agency. Never write any outlet, website, agency or reporter name (for example TOI, Times of India, PTI, ANI, Reuters, NDTV, BBC, HT). Write "reports said", "officials said", "a report", "police said" instead.\n`
        : opts.retryReason === 'missing_facts'
        ? `\nPREVIOUS ATTEMPT REJECTED: it dropped facts. Every number, name, date, place and amount in the source must appear in your output${opts.missingNumbers?.length ? ` (missing: ${opts.missingNumbers.slice(0, 12).join(', ')})` : ''}.\n`
        : '';
  return `
You are an editor at Nation Reporters, a digital news network. Your job is to SIMPLIFY the news below and write a clear summary that still covers the FULL story, so a reader who only reads your version understands everything important.

${level}
Neutral, factual tone. No opinion, no sensational words, no advice.

COPYRIGHT AND ORIGINALITY (strict):
- Write in your own words and your own sentence structure. Never copy sentences or long phrases from the source; never lightly reword sentence by sentence either. Understand the facts, then explain them fresh.
- Do not reproduce quotes at length. Report what someone said in one short paraphrase; a quote of at most 8 words is allowed.
- NEVER name or hint at the original publisher, news outlet, website, TV channel, news agency, reporter, photographer or editor. This includes abbreviations and brands such as TOI, TNN, Times of India, PTI, ANI, IANS, NDTV, Hindustan Times, HT, The Hindu, Indian Express, India Today, News18, Zee News, Reuters, AP, AFP, BBC, CNN, Mint, Economic Times, Moneycontrol. Never write "according to <outlet>", "a <outlet> report", "<outlet> reported", "told <outlet>", "accessed by <outlet>", "via", "source:", "reported by", "(PTI)", bylines, image credits, "Edited by", newsletter promos, "Download the app", community guidelines, ads, "Read more", or URLs. Instead write "reports said", "officials said", "police said", "a report said", "according to reports" or simply state the fact. Present the story as Nation Reporters' own explanation.
- Ignore page chrome in the source (menus, "Trending Stories", "Join conversation", comments, video lists, "Follow us"); it is not part of the story. Always finish every sentence; never stop mid-sentence.
- Do not start the headline with wire prefixes such as "BREAKING:", "JUST IN:" or "UPDATE:".

FACTS (strict):
- Keep EVERY number, amount, percentage, date, time, place and person/organisation name from the source. Do not round, drop or change them. Never invent facts, causes, quotes or numbers that are not in the source.
- Cover: WHAT happened, WHO is involved, WHEN, WHERE, WHY it matters, and WHAT happens next (only if the source says; otherwise say it is not yet known).
${retry}
LANGUAGE:
- Target output language: ${langName} (code: ${code}). Write EVERY text field entirely in ${langName}, even if the source is in another language; translate any foreign phrases. Do not use English unless the target is English. Use ${langName}'s natural script and punctuation.

Source article:
Title: ${title}
Body: ${body}

Return ONE JSON object with exactly these keys:
- "title": simple, clear headline in ${langName}, under 70 characters, states the main fact. Not a copy of the source headline.
- "summary": the "In brief" paragraph: exactly 2 or 3 sentences (about 250-450 characters) that give the whole story in miniature (what, who, when, where, why it matters). New wording, not the headline repeated. Complete sentences, no ellipsis.
- "keyPoints": array of 5 to 8 short bullet strings (each one sentence, under 160 characters) that together cover what, who, when, where, why it matters and what next, including all key numbers, names and dates. No bullet markers inside the strings.
- "short": about 100 words, a self-contained mini version in short sentences.
- "medium": about 250 words with context, in short paragraphs separated by a blank line.
- "long": the full-coverage version, at most ${maxLong} words. SHORT paragraphs (2-3 sentences each) separated by a blank line. Cover every important fact, development and implication in the source; leave nothing important out.
- "podcastScript": conversational narration in ${langName}, 120-180 words: intro, the key facts, outro.
- "language": "${code}"
`.trim();
}
