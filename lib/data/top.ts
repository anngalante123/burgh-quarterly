import {
  loadAllBusinesses,
  type BusinessArtifact,
} from "./load-business";
import type { Category } from "./schemas";
import {
  UNDERRATED_CATEGORIES,
  isUnderratedCategorySlug,
  type UnderratedCategorySlug,
} from "./underrated";

/**
 * Top Performers List — selection logic. The celebratory counterpart to
 * the Underrated List. Uses the SAME category bucket definitions
 * (`UNDERRATED_CATEGORIES`) so the two lists stay consistent about what
 * "bakeries" means editorially.
 *
 * Selection rule:
 *   1. Filter to the category's broader match set.
 *   2. Prefer Icons-tier businesses. If fewer than 3 Icons exist, fall
 *      back to the top-ranked regardless of tier so the page still ships.
 *   3. Sort by `composite` DESC (highest first).
 *   4. Take up to 5.
 *   5. If fewer than 3 businesses match the category at all, return null
 *      so the page 404s.
 *
 * No scores or grades are exposed.
 */

export type TopCategorySlug = UnderratedCategorySlug;

export const TOP_CATEGORIES = UNDERRATED_CATEGORIES;

export function isTopCategorySlug(slug: string): slug is TopCategorySlug {
  return isUnderratedCategorySlug(slug);
}

function matchesCategory(
  artifact: BusinessArtifact,
  spec: (typeof UNDERRATED_CATEGORIES)[TopCategorySlug],
): boolean {
  if (
    (spec.schemaCategories as readonly Category[]).includes(
      artifact.business.category,
    )
  ) {
    return true;
  }
  const categoryName = artifact.meta.categoryName ?? "";
  return spec.categoryNameMatches.some(
    (needle) => needle.toLowerCase() === categoryName.toLowerCase(),
  );
}

const MIN_ENTRIES = 3;
const TARGET_ENTRIES = 5;

export function selectTopForCategory(slug: string): {
  spec: (typeof UNDERRATED_CATEGORIES)[TopCategorySlug];
  entries: BusinessArtifact[];
} | null {
  if (!isTopCategorySlug(slug)) return null;
  const spec = TOP_CATEGORIES[slug];
  const all = loadAllBusinesses();
  const inCategory = all.filter((a) => matchesCategory(a, spec));
  if (inCategory.length < MIN_ENTRIES) return null;

  // Prefer Icons-tier. Fall back to top-ranked overall if Icons < MIN.
  const icons = inCategory.filter((a) => a.score.tier === "icons");
  const pool = icons.length >= MIN_ENTRIES ? icons : inCategory;

  const sorted = pool
    .slice()
    .sort((a, b) => b.score.composite - a.score.composite);
  const entries = sorted.slice(0, TARGET_ENTRIES);
  return { spec, entries };
}
