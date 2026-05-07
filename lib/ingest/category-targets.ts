import type { Category } from "@/lib/data/schemas";

/**
 * Stratified per-category caps for the 510 -> ~4,000 scaling phase.
 *
 * Why this exists: a $500 ingest budget needs to be allocated proportionally
 * to category demand instead of letting one runaway category (e.g.
 * restaurants, of which Pittsburgh has 5,000+) eat the whole budget. The
 * scrape-and-queue step respects these caps when adding to a queue file:
 * if the queue + DB count for a given category would exceed the target,
 * stop adding more.
 *
 * Targets reflect rough category density across Pittsburgh + Washington
 * County and the editorial weight each vertical carries in the index.
 *
 * `null` means "no target locked yet" (e.g. yoga_pilates which currently
 * rolls into fitness; we'll carve it out in a follow-up PR). Callers
 * should treat null as "no cap" rather than "cap of zero".
 */
export const CATEGORY_TARGETS: Record<Category, number | null> = {
  restaurant: 1500,
  cafe: 500,
  bar: 400,
  fitness: 300,
  grocery: 200,
  bakery: 200,
  ice_cream: 100,
  brewery: 100,
  distillery: 50,
  tattoo: 100,
  salon: 200,
  juice: 150,
  gallery_museum: 100,
  live_music: 80,
  boutique: 150,
  plant_shop: 80,
  bookstore: 50,
  record_store: 30,
  florist: 100,
  experience: 50,
  spa: 200,
};

/**
 * Return the cap for a category, or null if none is set. A null cap means
 * "do not enforce a limit for this category in the queue step".
 */
export function targetFor(category: Category): number | null {
  return CATEGORY_TARGETS[category] ?? null;
}

/**
 * Compute remaining headroom given current count + target. Returns
 * `Infinity` for null targets (no cap). Never returns negative numbers;
 * if we are already over, returns 0.
 */
export function remainingForCategory(
  category: Category,
  currentCount: number,
): number {
  const t = targetFor(category);
  if (t === null) return Infinity;
  return Math.max(0, t - currentCount);
}
