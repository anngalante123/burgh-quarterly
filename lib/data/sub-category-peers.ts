/**
 * Sub-category peer selection.
 *
 * The wider "Pittsburgh Bars" or "Pittsburgh Boutiques" pool combines too
 * many shapes of business for a meaningful comparison: a vintage boutique
 * lumped with a sporting-goods store, an Italian restaurant with a sushi
 * place. Editorial-truer pools come from Apify's primary `categoryName`
 * field (e.g. "Italian restaurant", "Vintage clothing store").
 *
 * Selection is layered:
 *   1. STRICT  same primary_category_name. If at least 5 peers, use it.
 *   2. RELATED expand to family-related sub-categories via word overlap.
 *      "Italian restaurant" pulls in "Pizza restaurant" because "pizza"
 *      is Italian-adjacent only when it is in the same family. If at
 *      least 5 peers in this expanded set, use it.
 *   3. FAMILY  fall back to the full family bucket (Pittsburgh Bars,
 *      Pittsburgh Boutiques, etc).
 *
 * The function is type-agnostic: callers pass any list of objects with
 * a `primary` (the Apify primary category name string) and an opaque
 * `family` key, plus the comparable function. We keep the selection
 * library-free and avoid an exhaustive curated synonym table; word
 * overlap with stop-words removed catches the bulk of useful related
 * sub-categories without a hand-built mapping that would rot over time.
 */

const STOPWORDS = new Set([
  "store",
  "shop",
  "restaurant",
  "place",
  "and",
  "or",
  "the",
  "of",
  "for",
  "with",
  "&",
  "service",
  "services",
  "good",
  "goods",
]);

/** Tokenize a primary_category_name into significant words. */
export function tokenize(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w) && w.length >= 3);
}

/** True when two primary_category_names share at least one significant word. */
export function relatedNames(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = new Set(tokenize(a));
  if (ta.size === 0) return false;
  for (const w of tokenize(b)) {
    if (ta.has(w)) return true;
  }
  return false;
}

export type PeerScopeKind = "strict" | "related" | "family";

export interface PeerScope<T> {
  peers: T[];
  /** Display label for the matched scope, eg "Italian Restaurants" */
  label: string;
  /** Pluralized short form for sentences, eg "Italian restaurants" */
  shortLabel: string;
  kind: PeerScopeKind;
}

interface PickPeersInput<T> {
  selfPrimary: string | null;
  selfFamilyKey: string;
  selfFamilyLabel: string;
  /** Already-filtered to same family; rank ordering preserved by caller. */
  familyMembers: T[];
  primaryOf: (item: T) => string | null;
  /** Used to compare identity so the self-row is preserved. */
  isSelf?: (item: T) => boolean;
  /** Smallest peer pool we accept before falling back. */
  minSize?: number;
}

/** Pluralize a primary_category_name for display. Handles common shapes. */
export function pluralizePrimary(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  // "Italian restaurant" -> "Italian restaurants"
  // "Women's clothing store" -> "Women's clothing stores"
  // "Bar & grill" -> "Bar & grills" (awkward; rare; live with it)
  // "Coffee shop" -> "Coffee shops"
  const lastSpace = trimmed.lastIndexOf(" ");
  const lastWord = lastSpace >= 0 ? trimmed.slice(lastSpace + 1) : trimmed;
  let plural: string;
  if (/s$/i.test(lastWord)) plural = lastWord;
  else if (/y$/i.test(lastWord)) plural = lastWord.replace(/y$/i, "ies");
  else plural = `${lastWord}s`;
  return lastSpace >= 0
    ? `${trimmed.slice(0, lastSpace + 1)}${plural}`
    : plural;
}

/**
 * Title-case a sub-category for the section header (e.g.
 * "Italian restaurants" -> "Italian Restaurants").
 */
function titleCase(s: string): string {
  return s
    .split(/(\s+|[&])/)
    .map((seg) => {
      if (!/[a-z]/i.test(seg)) return seg;
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .join("");
}

export function pickPeerScope<T>(input: PickPeersInput<T>): PeerScope<T> {
  const minSize = input.minSize ?? 5;
  const family = input.familyMembers;

  // Strict: same primary_category_name (case-insensitive).
  if (input.selfPrimary) {
    const target = input.selfPrimary.toLowerCase().trim();
    const strict = family.filter((m) => {
      const p = input.primaryOf(m);
      return p ? p.toLowerCase().trim() === target : false;
    });
    if (strict.length >= minSize) {
      const plural = pluralizePrimary(input.selfPrimary);
      return {
        peers: strict,
        label: `Pittsburgh ${titleCase(plural)}`,
        shortLabel: titleCase(plural),
        kind: "strict",
      };
    }
  }

  // Related: word-overlap within family.
  if (input.selfPrimary) {
    const related = family.filter((m) => {
      const p = input.primaryOf(m);
      if (!p) return false;
      return relatedNames(p, input.selfPrimary);
    });
    // Always include self if isSelf is provided and self has a primary.
    const includesSelf = input.isSelf
      ? related.some((m) => input.isSelf!(m))
      : true;
    const finalRelated = includesSelf
      ? related
      : (() => {
          const selfMember = family.find((m) =>
            input.isSelf ? input.isSelf(m) : false,
          );
          return selfMember ? [...related, selfMember] : related;
        })();
    if (finalRelated.length >= minSize) {
      const plural = pluralizePrimary(input.selfPrimary);
      return {
        peers: finalRelated,
        label: `Pittsburgh ${titleCase(plural)} & related`,
        shortLabel: titleCase(plural),
        kind: "related",
      };
    }
  }

  // Family fallback.
  return {
    peers: family,
    label: input.selfFamilyLabel,
    shortLabel: input.selfFamilyLabel.replace(/^Pittsburgh\s+/, ""),
    kind: "family",
  };
}
