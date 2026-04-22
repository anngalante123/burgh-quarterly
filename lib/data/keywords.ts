/**
 * Review keyword miner.
 *
 * Extracts the top recurring 2–3 word phrases from a business's review text.
 * Used to:
 *   1. Populate Business.review_keywords (simple string array per schema).
 *   2. Produce an enriched list of { text, count, exampleQuote } for the
 *      Review Voice insight block on the business page.
 *
 * Heuristic, deliberately simple:
 *   - lowercase + strip punctuation
 *   - 2- and 3-word n-grams
 *   - drop stopword-only phrases and phrases whose head/tail is a stopword
 *   - drop phrases that appear in only 1 review
 *   - return top N phrases with counts + one example sentence per phrase
 *
 * This is NOT nlp, no lemmatization, no embeddings. Matches the POC scope
 * and keeps the pipeline deterministic.
 */

const STOPWORDS = new Set<string>([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "for",
  "with",
  "my",
  "your",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "itll",
  "has",
  "have",
  "had",
  "were",
  "was",
  "been",
  "being",
  "will",
  "would",
  "could",
  "should",
  "shall",
  "may",
  "might",
  "must",
  "can",
  "cant",
  "dont",
  "didnt",
  "doesnt",
  "isnt",
  "wasnt",
  "werent",
  "hasnt",
  "hadnt",
  "havent",
  "im",
  "ive",
  "youre",
  "youve",
  "theyre",
  "weve",
  "theyve",
  "shes",
  "hes",
  "ill",
  "well",
  "theyll",
  "thats",
  "whats",
  "heres",
  "theres",
  "not",
  "no",
  "yes",
  "so",
  "as",
  "at",
  "by",
  "in",
  "on",
  "to",
  "from",
  "into",
  "out",
  "up",
  "down",
  "off",
  "over",
  "under",
  "again",
  "very",
  "just",
  "too",
  "also",
  "only",
  "really",
  "quite",
  "some",
  "any",
  "all",
  "every",
  "each",
  "more",
  "most",
  "other",
  "another",
  "such",
  "same",
  "than",
  "then",
  "when",
  "where",
  "why",
  "how",
  "what",
  "who",
  "whom",
  "which",
  "is",
  "are",
  "am",
  "be",
  "do",
  "does",
  "did",
  "get",
  "got",
  "go",
  "goes",
  "went",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "them",
  "him",
  "her",
  "us",
  "me",
  "about",
  "after",
  "before",
  "here",
  "there",
  "if",
  "because",
  "while",
  "during",
  "between",
  "through",
  "though",
  "although",
  "even",
  "ever",
  "never",
  "always",
  "still",
  "back",
  "much",
  "many",
  "one",
  "two",
  "three",
  "four",
  "five",
]);

export interface KeywordPhrase {
  text: string;
  count: number;
  exampleQuote: string;
}

interface SplitReview {
  rawText: string;
  tokens: string[];
  sentences: string[];
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation or newlines; drop empties.
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "") // strip apostrophes
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isStopwordEdge(phrase: string[]): boolean {
  if (phrase.length === 0) return true;
  if (STOPWORDS.has(phrase[0])) return true;
  if (STOPWORDS.has(phrase[phrase.length - 1])) return true;
  return false;
}

/**
 * Extract top N review phrases.
 *
 * @param reviewTexts Array of individual review bodies.
 * @param topN Number of phrases to return (default 8).
 */
export function extractKeywordPhrases(
  reviewTexts: string[],
  topN = 8,
): KeywordPhrase[] {
  if (!reviewTexts || reviewTexts.length === 0) return [];

  const split: SplitReview[] = reviewTexts
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((rawText) => ({
      rawText,
      tokens: tokenize(rawText),
      sentences: splitSentences(rawText),
    }));

  if (split.length === 0) return [];

  // Per-phrase aggregate: total count + set of review indices it appears in +
  // first example sentence we encountered.
  const phraseData = new Map<
    string,
    { count: number; reviewIdx: Set<number>; example: string }
  >();

  for (let rIdx = 0; rIdx < split.length; rIdx++) {
    const { tokens, sentences } = split[rIdx];

    // Pre-lowercase sentence lookups once.
    const lcSentences = sentences.map((s) => ({
      raw: s,
      lc: s.toLowerCase().replace(/[’']/g, ""),
    }));

    const seenInThisReview = new Set<string>();

    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const gram = tokens.slice(i, i + n);
        if (isStopwordEdge(gram)) continue;
        // Skip phrases where ALL tokens are stopwords (shouldn't happen due
        // to edge check, but belt-and-suspenders).
        if (gram.every((t) => STOPWORDS.has(t))) continue;
        // Skip super-short tokens like single letters.
        if (gram.some((t) => t.length < 2)) continue;

        const key = gram.join(" ");
        let entry = phraseData.get(key);
        if (!entry) {
          entry = { count: 0, reviewIdx: new Set(), example: "" };
          phraseData.set(key, entry);
        }
        entry.count += 1;
        entry.reviewIdx.add(rIdx);
        if (!seenInThisReview.has(key)) {
          seenInThisReview.add(key);
          if (!entry.example) {
            // Find first sentence in THIS review containing the phrase.
            const hit = lcSentences.find((s) => s.lc.includes(key));
            if (hit) entry.example = hit.raw;
          }
        }
      }
    }
  }

  // Filter: must appear in >=2 distinct reviews.
  const eligible: KeywordPhrase[] = [];
  for (const [text, data] of phraseData) {
    if (data.reviewIdx.size < 2) continue;
    if (!data.example) continue;
    eligible.push({ text, count: data.count, exampleQuote: data.example });
  }

  // Sub-phrase dedupe: if "la ruche" and "the la ruche" both qualify with
  // similar counts, prefer the shorter version. We do this by dropping any
  // 3-gram that is a superset of a 2-gram already in the result AND whose
  // count is within 40% of the 2-gram's count.
  eligible.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));

  const kept: KeywordPhrase[] = [];
  for (const phrase of eligible) {
    const words = phrase.text.split(" ");
    let subsumed = false;
    if (words.length === 3) {
      for (const alreadyKept of kept) {
        const kw = alreadyKept.text.split(" ");
        if (kw.length !== 2) continue;
        const sub1 = `${words[0]} ${words[1]}`;
        const sub2 = `${words[1]} ${words[2]}`;
        if (
          (sub1 === alreadyKept.text || sub2 === alreadyKept.text) &&
          phrase.count <= alreadyKept.count * 1.4
        ) {
          subsumed = true;
          break;
        }
      }
    }
    if (!subsumed) kept.push(phrase);
    if (kept.length >= topN) break;
  }

  return kept;
}
