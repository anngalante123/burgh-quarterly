import type { BusinessArtifact } from "./load-business";
import type { Category, Tier } from "./schemas";

/**
 * Aggregate statistics across all scored businesses, powers the homepage
 * "This Quarter in Signal" strip.
 *
 * All counts derive from BusinessArtifact[]. No numeric composite scores
 * are surfaced (EDITORIAL_VOICE.md § gap-not-grade). Tier counts, neighborhood
 * counts, and category counts are safe to display.
 */

export type TierCounts = {
  icons: number;
  watch: number;
  staples: number;
};

export type NeighborhoodCount = {
  name: string;
  count: number;
};

export type CategoryCount = {
  category: string;
  count: number;
};

const CATEGORY_LABELS: Record<Category, string> = {
  restaurant: "Restaurants",
  cafe: "Cafes",
  salon: "Salons",
  boutique: "Boutiques",
  fitness: "Fitness",
  bakery: "Bakeries",
  experience: "Experiences",
  grocery: "Specialty Grocery",
  bar: "Bars",
  brewery: "Breweries",
  distillery: "Distilleries",
  tattoo: "Tattoo Studios",
  ice_cream: "Ice Cream",
  juice: "Juice Bars",
};

export function labelForCategory(category: string): string {
  if (category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as Category];
  }
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function computeTierCounts(
  artifacts: BusinessArtifact[],
): TierCounts {
  const counts: TierCounts = { icons: 0, watch: 0, staples: 0 };
  for (const a of artifacts) {
    const tier: Tier = a.score.tier;
    if (tier === "icons") counts.icons += 1;
    else if (tier === "ones_to_watch") counts.watch += 1;
    else if (tier === "neighborhood_staples") counts.staples += 1;
  }
  return counts;
}

export function computeTopNeighborhood(
  artifacts: BusinessArtifact[],
): NeighborhoodCount {
  const tally = new Map<string, number>();
  for (const a of artifacts) {
    const n = a.business.neighborhood?.trim();
    if (!n) continue;
    tally.set(n, (tally.get(n) ?? 0) + 1);
  }
  let top: NeighborhoodCount = { name: "", count: 0 };
  for (const [name, count] of tally.entries()) {
    if (count > top.count) top = { name, count };
  }
  return top;
}

export function computeCategoryBreakdown(
  artifacts: BusinessArtifact[],
  limit = 5,
): CategoryCount[] {
  const tally = new Map<string, number>();
  for (const a of artifacts) {
    const c = a.business.category;
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  return Array.from(tally.entries())
    .map(([category, count]) => ({
      category: labelForCategory(category),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
