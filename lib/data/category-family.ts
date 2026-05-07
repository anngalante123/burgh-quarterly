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
 * Two helpers live here:
 *   1. familyForCategory(categoryName)         keyed off raw Google text.
 *      Kept for back-compat in legacy peer plots and underrated list
 *      builders. Falls back to "Pittsburgh Businesses" when unmapped.
 *   2. familyForBusinessCategory(category)     keyed off the internal Zod
 *      Category enum. PREFERRED for the analyze pipeline. Every enum value
 *      has an explicit family, so there is no "Pittsburgh Businesses"
 *      fallback bucket. Tattoo studios get "Pittsburgh Tattoo Studios",
 *      not "Pittsburgh Businesses next to Nan Xiang Soup Dumplings".
 *
 * Add new Google category names as they appear in the dataset. Default
 * fallback returns { family: "other", label: "Pittsburgh Businesses" }.
 */
import type { Category } from "@/lib/data/schemas";

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

/**
 * Internal-Category-keyed family map. Every Zod Category enum value gets an
 * explicit family. This is the preferred lookup for the analyze pipeline,
 * which has the typed `category` field on hand and should NEVER drop into
 * a generic "Pittsburgh Businesses" bucket. Adding a new Category to the
 * enum without adding it here will fail typecheck (Record<Category, ...>).
 */
const BUSINESS_CATEGORY_TO_FAMILY: Record<Category, CategoryFamily> = {
  restaurant: {
    key: "restaurants",
    label: "Pittsburgh Restaurants",
    singular: "restaurant",
  },
  cafe: { key: "cafes", label: "Pittsburgh Cafes", singular: "cafe" },
  juice: { key: "cafes", label: "Pittsburgh Cafes", singular: "juice bar" },
  bakery: {
    key: "sweets",
    label: "Pittsburgh Sweets",
    singular: "bakery",
  },
  ice_cream: {
    key: "sweets",
    label: "Pittsburgh Sweets",
    singular: "ice cream shop",
  },
  bar: { key: "bars", label: "Pittsburgh Bars", singular: "bar" },
  brewery: { key: "bars", label: "Pittsburgh Bars", singular: "brewery" },
  distillery: {
    key: "bars",
    label: "Pittsburgh Bars",
    singular: "distillery",
  },
  tattoo: {
    key: "tattoo",
    label: "Pittsburgh Tattoo Studios",
    singular: "tattoo studio",
  },
  spa: { key: "spa", label: "Pittsburgh Spas", singular: "spa" },
  salon: { key: "salons", label: "Pittsburgh Salons", singular: "salon" },
  fitness: {
    key: "fitness",
    label: "Pittsburgh Fitness Studios",
    singular: "fitness studio",
  },
  boutique: {
    key: "boutiques",
    label: "Pittsburgh Boutiques",
    singular: "boutique",
  },
  grocery: {
    key: "groceries",
    label: "Pittsburgh Specialty Groceries",
    singular: "specialty grocer",
  },
  experience: {
    key: "experiences",
    label: "Pittsburgh Experiences",
    singular: "experience",
  },
  live_music: {
    key: "live_music",
    label: "Pittsburgh Music Venues",
    singular: "music venue",
  },
  plant_shop: {
    key: "plant_shops",
    label: "Pittsburgh Plant Shops",
    singular: "plant shop",
  },
  bookstore: {
    key: "bookstores",
    label: "Pittsburgh Bookstores",
    singular: "bookstore",
  },
  record_store: {
    key: "record_stores",
    label: "Pittsburgh Record Stores",
    singular: "record store",
  },
  florist: {
    key: "florists",
    label: "Pittsburgh Florists",
    singular: "florist",
  },
  gallery_museum: {
    key: "galleries_museums",
    label: "Pittsburgh Galleries and Museums",
    singular: "gallery",
  },
};

/**
 * Given an internal Category enum value (or null/unknown), return its
 * editorial family. PREFERRED over familyForCategory(string) for the
 * analyze pipeline, which has the typed enum on hand. Unknown / null
 * inputs fall back to the generic "Pittsburgh Businesses" bucket; in
 * practice the analyze path always has a real Category value, so this
 * fallback should never fire.
 */
export function familyForBusinessCategory(
  category: Category | string | null | undefined,
): CategoryFamily {
  if (!category) return FALLBACK;
  const fam = (BUSINESS_CATEGORY_TO_FAMILY as Record<string, CategoryFamily>)[
    category
  ];
  return fam ?? FALLBACK;
}
