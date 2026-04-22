/**
 * extract-phrases, mine recurring 2–3 word phrases from review text.
 *
 * Inputs: an array of { text, stars? } review records.
 * Output: top-N phrases ranked by frequency, with a representative example
 *   quote attached (the first review the phrase appeared in).
 *
 * Algorithm (intentionally simple, this runs at build time, not request):
 *   1. Lowercase + tokenize each review's text (strip punctuation).
 *   2. Generate bigrams AND trigrams.
 *   3. Drop any n-gram whose first/last token is a stop word, and any
 *      trigram whose middle token is a connector (and, to, of, etc.).
 *      Those are phrase fragments, not concepts.
 *   4. Count. Break ties by longer phrase (trigrams preferred over bigrams
 *      when tied).
 *   5. Return top N with their examples.
 *
 * Known limitation: with only 6 reviews (current La Gourmandine state),
 * counts degenerate to 1, every phrase looks equally common. Callers
 * should use the fallback defaults when `result.length < 3` OR the top
 * count is below the `minCount` threshold.
 */

export type RawReview = {
  text: string | null | undefined;
  stars?: number;
};

export type ExtractedPhrase = {
  text: string;
  count: number;
  exampleQuote: string;
};

const STOP = new Set(
  (
    "the a an and or but is are was were be been being have has had do does " +
    "did i you he she it we they them his her our your my me to in of on for " +
    "with at by from as this that these those so if not no yes very really " +
    "just more most many much some any all each every their there here one " +
    "two three four five great good nice had got were if when am pm thru " +
    "than then also too only much about been over under up down out off"
  ).split(/\s+/),
);

const CONNECTORS = new Set(
  "and or but so if to in of at on a an the for with by from as".split(/\s+/),
);

function tokenize(t: string): string[] {
  // Keep letters and apostrophes; drop everything else.
  return t
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

type PhraseStats = { count: number; example: string; length: 2 | 3 };

export function extractPhrases(
  reviews: RawReview[],
  options: { topN?: number; minCount?: number } = {},
): ExtractedPhrase[] {
  const { topN = 8, minCount = 2 } = options;
  const stats = new Map<string, PhraseStats>();

  for (const r of reviews) {
    const raw = r?.text;
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    const words = tokenize(raw);

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const [a, b] = [words[i], words[i + 1]];
      if (STOP.has(a) || STOP.has(b)) continue;
      const p = `${a} ${b}`;
      const s = stats.get(p);
      if (s) s.count += 1;
      else stats.set(p, { count: 1, example: raw.trim(), length: 2 });
    }

    // Trigrams (preferred when they hit)
    for (let i = 0; i < words.length - 2; i++) {
      const [a, b, c] = [words[i], words[i + 1], words[i + 2]];
      if (STOP.has(a) || STOP.has(c)) continue;
      if (CONNECTORS.has(b)) continue;
      const p = `${a} ${b} ${c}`;
      const s = stats.get(p);
      if (s) s.count += 1;
      else stats.set(p, { count: 1, example: raw.trim(), length: 3 });
    }
  }

  const sorted = Array.from(stats.entries())
    .filter(([, s]) => s.count >= minCount)
    .sort(([ap, a], [bp, b]) => {
      if (b.count !== a.count) return b.count - a.count;
      // Ties: prefer trigrams, then alphabetical for determinism.
      if (b.length !== a.length) return b.length - a.length;
      return ap.localeCompare(bp);
    })
    .slice(0, topN);

  return sorted.map(([text, s]) => ({
    text,
    count: s.count,
    exampleQuote: s.example,
  }));
}
