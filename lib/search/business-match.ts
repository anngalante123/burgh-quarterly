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
 *
 * Intentionally NOT fuzzy: it does not do typo tolerance (e.g. "cofee" →
 * "coffee"). That is a separate, higher-risk change (false positives across
 * 2.5k businesses) and can be layered on later if wanted.
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

/**
 * Returns true if `query` matches the combined `fields` (e.g. name,
 * neighborhood, category). Empty/whitespace queries match everything so the
 * caller can treat "no query" as "no filter".
 */
export function matchesQuery(fields: string[], query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;

  // Every typed word must appear somewhere in the spaced haystack. This
  // handles spaces, hyphens, and word order ("gi jin" / "jin gi" → "gi-jin").
  const haystackSpaced = toSpaced(fields.join(" "));
  const tokens = toSpaced(raw).split(" ").filter(Boolean);
  const allTokensHit =
    tokens.length > 0 && tokens.every((t) => haystackSpaced.includes(t));
  if (allTokensHit) return true;

  // Fallback: the run-together form ("gijin") found in the collapsed haystack.
  // Guard the all-punctuation case — its collapsed form is "" and
  // includes("") is always true, which would match every business.
  const collapsedQuery = toCollapsed(raw);
  if (!collapsedQuery) return false;
  return toCollapsed(fields.join(" ")).includes(collapsedQuery);
}
