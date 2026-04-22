import {
  loadAllBusinesses,
  type BusinessArtifact,
} from "./load-business";
import type { Category } from "./schemas";

/**
 * Underrated List — selection logic.
 *
 * v1: "bakeries" only. The URL slug "bakeries" maps to a *broader* editorial
 * definition than the strict Zod enum `category: "bakery"` — it also sweeps
 * pastry shops, dessert shops, and dessert restaurants. The data pipeline
 * sometimes files pastry/dessert spots under `category: "boutique"` because
 * the enum is narrow; an editorial "bakeries" list should include them.
 *
 * Selection rule (per the spec in the v1 contract):
 *   1. Filter to the category's broader match set.
 *   2. Exclude `tier === "icons"` — the Underrated List is about climbers,
 *      not established winners.
 *   3. Sort by `composite` ASC so the most-underrated (lowest composite)
 *      appears first — editorially this is "the one the city is most behind on."
 *   4. Take up to 5. If fewer than 5 non-Icons exist in the broader match,
 *      we return whatever we have (down to 3 minimum).
 *   5. If fewer than 3 qualify, return null so the page 404s.
 *
 * No scores or grades are exposed by this module — it returns raw artifacts
 * and the page renders rank + tier labels only.
 */

export type UnderratedCategorySlug = "bakeries";

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
export function selectUnderratedForCategory(
  slug: string,
): {
  spec: (typeof UNDERRATED_CATEGORIES)[UnderratedCategorySlug];
  entries: BusinessArtifact[];
} | null {
  if (!isUnderratedCategorySlug(slug)) return null;
  const spec = UNDERRATED_CATEGORIES[slug];

  const all = loadAllBusinesses();
  const inCategory = all.filter((b) => matchesCategory(b, spec));

  const nonIcons = inCategory.filter((b) => b.score.tier !== "icons");

  // Sort by composite ASC — most underrated first (lowest composite).
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
