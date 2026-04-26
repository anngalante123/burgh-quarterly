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
    title: "The 10 Pittsburgh Businesses Defining Social This Quarter",
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
    title: "The Pittsburgh Businesses Actually Showing Up On Their Own Feed",
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
];
