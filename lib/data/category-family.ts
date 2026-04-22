/**
 * category-family, group businesses by a wider editorial "family" than
 * Google's literal `categoryName` provides.
 *
 * Why this exists: Google's category labels are noisy at the small-business
 * scale. "Bakery" and "Pastry shop" and "Dessert shop" are functionally the
 * same family from the reader's perspective. Same for "Cafe" vs "Coffee
 * shop" vs "Tea house." Without a family grouping, peer plots either:
 *   - Show 1 dot (too narrow match) OR
 *   - Mix breweries with ice cream (too broad Zod enum match)
 *
 * Anna flagged 2026-04-22: "some of these aren't bakeries", because the
 * Zod category bucket was conflating dessert shops with bakeries.
 *
 * This helper returns a family key + display label per Google categoryName.
 * Use it for: peer dot plots, underrated lists, category breakdowns.
 *
 * Add new Google category names as they appear in the dataset. Default
 * fallback returns { family: "other", label: "Pittsburgh Businesses" }.
 */

export type CategoryFamily = {
  /** Stable machine key, URL-safe */
  key: string;
  /** Display label as it appears in headers, e.g. "Pittsburgh Sweets" */
  label: string;
  /** Singular form for single-business references */
  singular: string;
};

const CATEGORY_TO_FAMILY: Record<string, CategoryFamily> = {
  // Sweets, bakeries, pastry, dessert, ice cream
  Bakery: { key: "sweets", label: "Pittsburgh Sweets", singular: "sweet shop" },
  "Pastry shop": {
    key: "sweets",
    label: "Pittsburgh Sweets",
    singular: "pastry shop",
  },
  "Dessert shop": {
    key: "sweets",
    label: "Pittsburgh Sweets",
    singular: "dessert shop",
  },
  "Dessert restaurant": {
    key: "sweets",
    label: "Pittsburgh Sweets",
    singular: "dessert spot",
  },
  "Ice cream shop": {
    key: "sweets",
    label: "Pittsburgh Sweets",
    singular: "ice cream shop",
  },

  // Cafes, coffee, tea, juice
  Cafe: { key: "cafes", label: "Pittsburgh Cafes", singular: "cafe" },
  "Coffee shop": {
    key: "cafes",
    label: "Pittsburgh Cafes",
    singular: "coffee shop",
  },
  "Tea house": {
    key: "cafes",
    label: "Pittsburgh Cafes",
    singular: "tea house",
  },
  "Juice shop": {
    key: "cafes",
    label: "Pittsburgh Cafes",
    singular: "juice shop",
  },

  // Asian eats
  "Noodle shop": {
    key: "asian_eats",
    label: "Pittsburgh Asian Kitchens",
    singular: "noodle shop",
  },
  "Japanese restaurant": {
    key: "asian_eats",
    label: "Pittsburgh Asian Kitchens",
    singular: "Japanese kitchen",
  },
  "Sushi restaurant": {
    key: "asian_eats",
    label: "Pittsburgh Asian Kitchens",
    singular: "sushi spot",
  },
  "Thai restaurant": {
    key: "asian_eats",
    label: "Pittsburgh Asian Kitchens",
    singular: "Thai kitchen",
  },
  "Indian restaurant": {
    key: "asian_eats",
    label: "Pittsburgh Asian Kitchens",
    singular: "Indian kitchen",
  },

  // Restaurants (non-asian, non-brunch)
  Restaurant: {
    key: "restaurants",
    label: "Pittsburgh Restaurants",
    singular: "restaurant",
  },
  "Brunch restaurant": {
    key: "restaurants",
    label: "Pittsburgh Restaurants",
    singular: "brunch spot",
  },

  // Bars + breweries
  Bar: { key: "bars", label: "Pittsburgh Bars", singular: "bar" },
  Brewery: { key: "bars", label: "Pittsburgh Bars", singular: "brewery" },
};

const FALLBACK: CategoryFamily = {
  key: "other",
  label: "Pittsburgh Businesses",
  singular: "business",
};

/**
 * Given a Google `_meta.categoryName`, return its editorial family.
 * Falls back to a generic family if the categoryName isn't mapped.
 */
export function familyForCategory(categoryName: string | null | undefined): CategoryFamily {
  if (!categoryName) return FALLBACK;
  return CATEGORY_TO_FAMILY[categoryName] ?? FALLBACK;
}
