import type { QuerySpec } from "@/lib/query/business-query";

/**
 * List registry, the source of truth for every "best on social" article
 * Signal Pittsburgh can generate. Edit this file to add a new article;
 * `npm run generate:lists` regenerates JSON for every entry.
 *
 * Each spec produces one article in content/lists/articles/<slug>.json.
 * Articles carry: editorial intro (Claude-generated), ranked items,
 * descriptors (reused from per-business diagnoses), featured TikTok
 * if available, and stat lines.
 *
 * Adding a list: pick a slug, a title, an editorial angle, and a
 * QuerySpec (filter + ranking + limit). Re-run the generator.
 */

export type ListSpec = {
  /** URL-safe slug, becomes the article filename and route. */
  slug: string;
  /** Article title (display). */
  title: string;
  /** Optional subtitle (display). */
  subtitle?: string;
  /**
   * Editorial angle, passed to Claude for the intro. One sentence
   * answering "what's this list really about?"
   */
  angle: string;
  /**
   * The query that selects + ranks businesses for this list.
   * See lib/query/business-query.ts for available filters and rankings.
   */
  query: QuerySpec;
};

export const LISTS: ListSpec[] = [
  {
    slug: "icons-of-spring-2026",
    // 2026-06-12: published article retitled "Talk of the Town: Spring
    // 2026" (tier display rename). Slug stays for URL stability. Keep
    // this title in sync so a future regeneration does not revert it.
    title: "Talk of the Town: Spring 2026",
    subtitle: "Spring 2026, across every family",
    angle:
      "the businesses winning the conversation this quarter, regardless of category. We're surfacing who creators are filming, who customers are reviewing, and who is actually showing up on their own feeds.",
    query: {
      filter: { family: "all" },
      ranking: "creator_pickup",
      limit: 10,
    },
  },
  {
    slug: "sweets-top-10",
    title: "The 10 Pittsburgh Sweets on Social",
    subtitle: "Bakeries, pastry shops, ice cream, dessert",
    angle:
      "which Pittsburgh dessert businesses are showing up online this spring, ranked by creator pickup. Who creators are filming and what those videos reveal.",
    query: {
      filter: { family: "sweets" },
      ranking: "creator_pickup",
      limit: 10,
    },
  },
  {
    slug: "cafes-creator-favorites",
    title: "The Pittsburgh Cafes Creators Won't Stop Filming",
    subtitle: "Coffee, tea, juice, ranked by creator pickup",
    angle:
      "Pittsburgh's coffee, tea, and juice scene through the lens of TikTok creator coverage. The cafes the city keeps posting about, even when the cafes themselves aren't.",
    query: {
      filter: { family: "cafes", hasTiktokCoverage: true },
      ranking: "creator_pickup",
      limit: 8,
    },
  },
  {
    slug: "bars-on-social",
    title: "The Pittsburgh Bars Most Worth Following",
    subtitle: "By the numbers, this quarter",
    angle:
      "which Pittsburgh bars and breweries are leading the social conversation. Who's getting filmed, who's posting, who's getting talked about.",
    query: {
      filter: { family: "bars" },
      ranking: "composite",
      limit: 5,
    },
  },
  {
    slug: "asian-kitchens-top",
    title: "The Pittsburgh Asian Kitchens Creators Keep Returning To",
    subtitle: "Sushi, noodles, Thai, Indian, Japanese",
    angle:
      "the Asian kitchens generating the most creator coverage this quarter. The dishes the city is filming and the restaurants behind them.",
    query: {
      filter: { family: "asian_eats" },
      ranking: "creator_pickup",
      limit: 8,
    },
  },
  {
    slug: "active-posters",
    title: "Still Posting: Pittsburgh's Most Active Instagram Feeds",
    subtitle:
      "The minority that are posting, ranked by Instagram momentum",
    angle:
      "most Pittsburgh small businesses on this index are dormant on Instagram. These are the ones that aren't, ranked by 30-day cadence and engagement.",
    query: {
      filter: { igActiveOnly: true },
      ranking: "instagram_momentum",
      limit: 10,
    },
  },

  // ──────── The Underrated List, per editorial brief ────────
  // Customers rate them well, the Instagram presence hasn't caught up yet.
  // Celebrated, never shamed. Recurring quarterly feature, one per
  // family + a flagship.

  {
    slug: "underrated-spring-2026",
    title: "Pittsburgh's Most Underrated Small Businesses",
    subtitle:
      "The places customers love but the algorithm hasn't found yet, across every family.",
    angle:
      "businesses with high customer ratings and real review depth that haven't broken through on social yet. The point of this list is celebration, not critique. Pittsburgh's neighborhood spots, the ones worth telling a friend about.",
    query: {
      filter: { family: "all" },
      ranking: "underrated",
      limit: 10,
    },
  },
  {
    slug: "underrated-sweets",
    title: "Pittsburgh's Most Underrated Sweets",
    subtitle: "Bakeries, dessert spots, and ice cream shops the city should be talking about.",
    angle:
      "the dessert shops Pittsburgh customers love but creators haven't fully caught onto. High ratings, real review depth, thin Instagram momentum. The places worth a Sunday morning detour.",
    query: {
      filter: { family: "sweets" },
      ranking: "underrated",
      limit: 5,
    },
  },
  {
    slug: "underrated-cafes",
    title: "Pittsburgh's Most Underrated Cafes",
    subtitle: "Coffee, tea, juice. Loved locally, not yet viral.",
    angle:
      "the cafes that Pittsburgh regulars rave about in reviews but the broader internet hasn't caught up to. Quietly excellent, quietly under-followed.",
    query: {
      filter: { family: "cafes" },
      ranking: "underrated",
      limit: 5,
    },
  },
  {
    slug: "underrated-bars",
    title: "Pittsburgh's Most Underrated Bars",
    subtitle: "Bars and breweries the regulars treat as their own.",
    angle:
      "the Pittsburgh bars and breweries with the kind of reviews that read like word-of-mouth, but the social presence hasn't caught up. Underrated does not mean undeserving.",
    query: {
      filter: { family: "bars" },
      ranking: "underrated",
      limit: 5,
    },
  },
  {
    slug: "underrated-asian-kitchens",
    title: "Pittsburgh's Most Underrated Asian Kitchens",
    subtitle: "Sushi, Thai, Indian, Japanese, noodles. Loved in person, not yet celebrated online.",
    angle:
      "the Asian kitchens earning real love in reviews but flying under the social radar. The spots regulars defend.",
    query: {
      filter: { family: "asian_eats" },
      ranking: "underrated",
      limit: 5,
    },
  },
  {
    slug: "underrated-restaurants",
    title: "Pittsburgh's Most Underrated Restaurants",
    subtitle: "Brunch spots, neighborhood restaurants. High ratings, low spotlight.",
    angle:
      "Pittsburgh restaurants whose reviews speak for themselves but whose social channels are quieter than they should be. The neighborhood standbys we'd send a visiting friend to.",
    query: {
      filter: { family: "restaurants" },
      ranking: "underrated",
      limit: 5,
    },
  },
];
