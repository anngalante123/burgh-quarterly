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
    // The flagship "best on social" ranking: the full index, top down.
    // Where "Talk of the Town" ranks by creator pickup alone, this list
    // ranks by the composite signal (reviews, sentiment, photos, IG
    // cadence, creator fit) so it reads as the definitive overall list.
    slug: "best-businesses-on-social",
    title: "The Best Pittsburgh Businesses on Social",
    subtitle: "The full index, top down. Spring 2026.",
    angle:
      "the Pittsburgh small businesses showing up strongest across every social signal this quarter, ranked by the full index. Reviews stacking, photos documenting, feeds moving, creators filming. The definitive overall list, regardless of category.",
    query: {
      filter: { family: "all" },
      ranking: "composite",
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

  // ──────── Word of Mouth, per editorial brief ────────
  // Renamed from "The Underrated List" 2026-06-14 (approved by Anna).
  // The frame moved off "underrated" (a quality verdict) and onto the
  // social-media gap: these businesses win on word of mouth, the reviews
  // are loud, the feed is quiet. Slugs + the "underrated" ranking key
  // stay for URL and code stability; display copy only. Celebrated,
  // never shamed. Recurring quarterly feature, one per family + a flagship.

  {
    slug: "underrated-spring-2026",
    title: "Word of Mouth: Pittsburgh's Quiet Favorites",
    subtitle:
      "The businesses the city won't stop recommending, even though their feeds stay quiet. Across every family.",
    angle:
      "businesses carried by word of mouth, high customer ratings and real review depth, that haven't translated any of it to social yet. The reviews are loud, the feed is quiet. The point of this list is celebration, not critique. Pittsburgh's neighborhood spots, the ones people text a friend about instead of tagging.",
    query: {
      filter: { family: "all" },
      ranking: "underrated",
      limit: 10,
    },
  },
  {
    slug: "underrated-sweets",
    title: "Word of Mouth: Pittsburgh's Sweets",
    subtitle: "The bakeries and dessert spots regulars rave about in person, long before the feed catches up.",
    angle:
      "the dessert shops Pittsburgh customers line up for and review in detail, but that creators and the feed haven't found yet. Strong word of mouth, thin Instagram momentum. The places worth a Sunday morning detour.",
    query: {
      filter: { family: "sweets" },
      ranking: "underrated",
      limit: 5,
    },
  },
  {
    slug: "underrated-cafes",
    title: "Word of Mouth: Pittsburgh's Cafes",
    subtitle: "Coffee, tea, juice. The regulars already know. The feed hasn't caught on.",
    angle:
      "the cafes Pittsburgh regulars rave about in reviews while the broader internet stays quiet. Loud word of mouth, near-invisible on social. Quietly excellent, quietly under-followed.",
    query: {
      filter: { family: "cafes" },
      ranking: "underrated",
      limit: 5,
    },
  },
  {
    slug: "underrated-bars",
    title: "Word of Mouth: Pittsburgh's Bars",
    subtitle: "Bars and breweries the regulars treat as their own, with reviews to match and feeds that haven't caught up.",
    angle:
      "the Pittsburgh bars and breweries with reviews that read like word of mouth, while the social presence stays a step behind. Quiet feed, loud room.",
    query: {
      filter: { family: "bars" },
      ranking: "underrated",
      limit: 5,
    },
  },
  {
    slug: "underrated-restaurants",
    title: "Word of Mouth: Pittsburgh's Restaurants",
    subtitle: "Brunch spots and neighborhood kitchens with the reviews to prove it and feeds that stay quiet.",
    angle:
      "Pittsburgh restaurants whose reviews speak for themselves while their social channels stay quieter than the dining room. Carried by word of mouth. The neighborhood standbys we'd send a visiting friend to.",
    query: {
      filter: { family: "restaurants" },
      ranking: "underrated",
      limit: 5,
    },
  },
];
