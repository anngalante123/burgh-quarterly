/**
 * pick-pullquote — given an array of review texts, pick the one that
 * reads best as a featured blockquote.
 *
 * Heuristic: a good pullquote is:
 *   - 40–180 characters long (short enough to feel like a quote, long
 *     enough to carry voice)
 *   - starts with a capital letter (not a mid-review snippet)
 *   - preferably contains a subjective / evaluative marker
 *     (love, best, delicious, great, amazing, worst, favorite, must)
 *
 * We rank every review text, return the top candidate or null if none
 * qualify. The returned quote is lightly cleaned (collapsed whitespace,
 * stripped leading/trailing quotes), never the raw string.
 */

const EVALUATIVE = [
  "love",
  "loved",
  "best",
  "favorite",
  "favourite",
  "delicious",
  "great",
  "amazing",
  "incredible",
  "worst",
  "must",
  "perfect",
  "spoiled",
  "fantastic",
  "stunning",
];

function cleanQuote(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function score(text: string): number {
  const cleaned = cleanQuote(text);
  const len = cleaned.length;
  if (len < 30 || len > 240) return 0;
  let s = 0;
  // Length sweet spot around 120 chars
  s += 100 - Math.abs(120 - len);
  // Starts with a capital
  if (/^[A-Z]/.test(cleaned)) s += 15;
  // Contains an evaluative marker
  const lower = cleaned.toLowerCase();
  if (EVALUATIVE.some((w) => lower.includes(w))) s += 30;
  // Ends in a period (complete thought)
  if (/[.!]$/.test(cleaned)) s += 10;
  // Short enough to be a single sentence
  if (!cleaned.includes(".") || cleaned.split(".").filter(Boolean).length <= 2) {
    s += 10;
  }
  return s;
}

export function pickPullquote(reviews: string[]): string | null {
  if (reviews.length === 0) return null;
  const ranked = reviews
    .map((r) => ({ raw: r, cleaned: cleanQuote(r), score: score(r) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.cleaned ?? null;
}
