/**
 * Forgiving text matcher for the business index search.
 *
 * The old matcher did a single contiguous `includes()` on the raw lowercased
 * name, which broke on punctuation and word order. A business stored as
 * "gi-jin" would not surface for the query "gi jin" (space) or "gijin"
 * (run together), because neither is a literal substring of "gi-jin".
 *
 * This normalizes both sides so the obvious human queries all hit:
 *   - "gi jin"  → matches "gi-jin"   (each typed word is found)
 *   - "gijin"   → matches "gi-jin"   (punctuation-stripped form is found)
 *   - "jin gi"  → matches "gi-jin"   (word order does not matter)
 *   - "gi-jin"  → still matches      (exact form unchanged)
 *   - "cofee"   → matches "coffee"   (one-typo tolerance, see below)
 *
 * Typo tolerance is deliberately conservative to avoid false positives across
 * thousands of businesses: it only kicks in as a last resort (after exact and
 * run-together matching fail), only for query words of 4+ characters, and only
 * within a small edit distance scaled to word length. Short fragments
 * ("co", "bar") are never fuzz-matched.
 */

/** Lowercase + replace any run of non-alphanumerics with a single space. */
function toSpaced(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Lowercase + strip everything that is not a letter or digit. */
function toCollapsed(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Edit distance allowed for a fuzzy word match, scaled to word length. */
function fuzzThreshold(len: number): number {
  if (len < 4) return 0; // too short to fuzz safely
  if (len < 8) return 1;
  return 2;
}

/**
 * Levenshtein distance with an early-exit ceiling: returns true as soon as we
 * can prove distance <= max, and bails out (returns false) once the best
 * possible distance exceeds max. Avoids the full O(n*m) cost on clear misses.
 */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return false; // no cell in this row can recover
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] <= max;
}

/** True if `token` fuzz-matches any whole word in the spaced haystack. */
function fuzzyHitsWord(token: string, words: string[]): boolean {
  const max = fuzzThreshold(token.length);
  if (max === 0) return false;
  return words.some((w) => withinEditDistance(token, w, max));
}

/**
 * Returns true if `query` matches the combined `fields` (e.g. name,
 * neighborhood, category). Empty/whitespace queries match everything so the
 * caller can treat "no query" as "no filter".
 */
export function matchesQuery(fields: string[], query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;

  // 1) Every typed word appears somewhere in the spaced haystack. Handles
  //    spaces, hyphens, and word order ("gi jin" / "jin gi" → "gi-jin").
  const haystackSpaced = toSpaced(fields.join(" "));
  const tokens = toSpaced(raw).split(" ").filter(Boolean);
  if (tokens.length > 0 && tokens.every((t) => haystackSpaced.includes(t))) {
    return true;
  }

  // 2) Run-together form ("gijin" → "gi-jin"). Guard the all-punctuation case:
  //    its collapsed form is "" and includes("") would match everything.
  const collapsedQuery = toCollapsed(raw);
  if (!collapsedQuery) return false;
  if (toCollapsed(fields.join(" ")).includes(collapsedQuery)) return true;

  // 3) Last resort: typo tolerance. Every token must match — either as an
  //    exact substring (handles short tokens like "co") or, for 4+ char
  //    tokens, within a small edit distance of some haystack word. Requiring
  //    ALL tokens keeps "cofee shadyside" from matching on the typo alone.
  const words = haystackSpaced.split(" ").filter(Boolean);
  return tokens.every(
    (t) => haystackSpaced.includes(t) || fuzzyHitsWord(t, words),
  );
}
