import {
  loadAllBusinesses,
  type BusinessArtifact,
} from "./load-business";
import type { Category } from "./schemas";

/**
 * Underrated List, selection logic.
 *
 * v1: "bakeries" only. The URL slug "bakeries" maps to a *broader* editorial
 * definition than the strict Zod enum `category: "bakery"`, it also sweeps
 * pastry shops, dessert shops, and dessert restaurants. The data pipeline
 * sometimes files pastry/dessert spots under `category: "boutique"` because
 * the enum is narrow; an editorial "bakeries" list should include them.
 *
 * Selection rule (per the spec in the v1 contract):
 *   1. Filter to the category's broader match set.
 *   2. Exclude `tier === "icons"`, the Underrated List is about climbers,
 *      not established winners.
 *   3. Sort by `composite` ASC so the most-underrated (lowest composite)
 *      appears first, editorially this is "the one the city is most behind on."
 *   4. Take up to 5. If fewer than 5 non-Icons exist in the broader match,
 *      we return whatever we have (down to 3 minimum).
 *   5. If fewer than 3 qualify, return null so the page 404s.
 *
 * No scores or grades are exposed by this module, it returns raw artifacts
 * and the page renders rank + tier labels only.
 */

export type UnderratedCategorySlug =
  | "bakeries"
  | "coffee-shops"
  | "bars-breweries"
  | "restaurants";

export const UNDERRATED_CATEGORIES: Readonly<
  Record<UnderratedCategorySlug, {
    /** Category label for breadcrumbs, headlines, "Pittsburgh X". */
    label: string;
    /** Singular form used in one-off sentences ("five bakeries..."). */
    singularLower: string;
    pluralLower: string;
    /** Strict schema categories that belong in this editorial bucket. */
    schemaCategories: readonly Category[];
    /**
     * Google-maps `categoryName` strings that also count. The data pipeline
     * sometimes files these under a different schema category (e.g. a
     * pastry shop tagged `boutique`), so we widen by categoryName too.
     */
    categoryNameMatches: readonly string[];
    /**
     * Schema categories to exclude even when categoryName matches. Lets
     * us prevent overlap, e.g. coffee-shops shouldn't pull a business
     * already tagged `category: "bakery"` (those belong to bakeries).
     */
    excludeSchemaCategories?: readonly Category[];
    /**
     * Hero paragraph shown above the list. Bakery-specific for v1; per-
     * bucket so each list reads in the right voice (a coffee shop isn't
     * "pulling a tray out of the oven"). Plain string with one
     * substitution token: {{count}} resolves to the spelled-out count.
     */
    heroLine: string;
  }>
> = {
  bakeries: {
    label: "Bakeries",
    singularLower: "bakery",
    pluralLower: "bakeries",
    schemaCategories: ["bakery"],
    categoryNameMatches: [
      "Bakery",
      "Pastry shop",
      "Dessert shop",
      "Dessert restaurant",
      "Ice cream shop",
    ],
    heroLine:
      "Somewhere on Butler Street or Murray Avenue, a bakery is pulling a tray out of the oven at 6am for a line that doesn't quite exist yet. Strong reviews on the listing. A quiet feed. These are the {{count}} where the city hasn't filled in the second side of the conversation.",
  },
  "coffee-shops": {
    label: "Coffee Shops & Cafes",
    singularLower: "coffee shop",
    pluralLower: "coffee shops and cafes",
    schemaCategories: [],
    categoryNameMatches: [
      "Cafe",
      "Coffee shop",
      "Tea house",
      "Brunch restaurant",
      "Juice shop",
    ],
    excludeSchemaCategories: ["bakery"],
    heroLine:
      "A cafe in Bloomfield or Morningside pulls its first shot of espresso at 6:30am for a room of regulars. The regulars review. The wider city doesn't post. These are the {{count}} where one side of the conversation is steady and the other side hasn't started.",
  },
  "bars-breweries": {
    label: "Bars & Breweries",
    singularLower: "bar",
    pluralLower: "bars and breweries",
    schemaCategories: [],
    categoryNameMatches: ["Bar", "Brewery"],
    heroLine:
      "A Lawrenceville taproom or an East Liberty cocktail room pours the first round of the night to a half-full bar. The drinkers leave reviews. The reels don't follow. These are the {{count}} where the city is one side behind on the conversation.",
  },
  restaurants: {
    label: "Restaurants",
    singularLower: "restaurant",
    pluralLower: "restaurants",
    schemaCategories: [],
    categoryNameMatches: [
      "Restaurant",
      "Indian restaurant",
      "Japanese restaurant",
      "Thai restaurant",
      "Noodle shop",
      "Sushi restaurant",
    ],
    heroLine:
      "A kitchen in East Liberty or Lawrenceville plates a dish at 7:15pm for a four-top who picked the place on a friend's word, not a feed. The reviews keep landing. The grids keep missing it. These are the {{count}} where one side of the conversation is locked in and the other side hasn't caught up.",
  },
};

export function isUnderratedCategorySlug(
  slug: string,
): slug is UnderratedCategorySlug {
  return Object.prototype.hasOwnProperty.call(UNDERRATED_CATEGORIES, slug);
}

function matchesCategory(
  artifact: BusinessArtifact,
  spec: (typeof UNDERRATED_CATEGORIES)[UnderratedCategorySlug],
): boolean {
  if (
    spec.excludeSchemaCategories?.includes(artifact.business.category)
  ) {
    return false;
  }
  if (spec.schemaCategories.includes(artifact.business.category)) return true;
  const categoryName = artifact.meta.categoryName ?? "";
  return spec.categoryNameMatches.some(
    (needle) => needle.toLowerCase() === categoryName.toLowerCase(),
  );
}

const MIN_ENTRIES = 3;
const TARGET_ENTRIES = 5;

/**
 * Select the Underrated List entries for a given category slug.
 *
 * Returns null when:
 *   - the slug is not a known category, OR
 *   - fewer than MIN_ENTRIES (3) non-Icons qualify.
 *
 * The caller should `notFound()` on null.
 */
export async function selectUnderratedForCategory(
  slug: string,
): Promise<
  | {
      spec: (typeof UNDERRATED_CATEGORIES)[UnderratedCategorySlug];
      entries: BusinessArtifact[];
    }
  | null
> {
  if (!isUnderratedCategorySlug(slug)) return null;
  const spec = UNDERRATED_CATEGORIES[slug];

  const all = await loadAllBusinesses();
  const inCategory = all.filter((b) => matchesCategory(b, spec));

  // Eligibility floor: an Underrated entry shows a one-line stat to the
  // reader (handwritten or fallback-synthesized from imagesCount and
  // fiveStar). When either is zero the card reads as broken ("0 photos
  // on the listing" / "0 five-star reviews"), which is the production
  // issue this filter exists to prevent. Require both to be populated.
  const eligibility = (b: BusinessArtifact): boolean => {
    if (b.score.tier === "icons") return false;
    if ((b.meta.imagesCount ?? 0) <= 0) return false;
    if (!b.meta.reviewsDistribution) return false;
    if ((b.meta.reviewsDistribution.fiveStar ?? 0) <= 0) return false;
    return true;
  };
  const nonIcons = inCategory.filter(eligibility);

  // Sort by composite ASC, most underrated first (lowest composite).
  // Deterministic tiebreaker on slug to keep static builds stable.
  nonIcons.sort((a, b) => {
    if (a.score.composite !== b.score.composite) {
      return a.score.composite - b.score.composite;
    }
    return a.business.slug.localeCompare(b.business.slug);
  });

  const entries = nonIcons.slice(0, TARGET_ENTRIES);

  if (entries.length < MIN_ENTRIES) return null;
  return { spec, entries };
}
