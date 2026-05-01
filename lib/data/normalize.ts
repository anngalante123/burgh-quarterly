import { z } from "zod";
import {
  BusinessSchema,
  type Business,
  type Category,
} from "./schemas";
import { extractKeywordPhrases, type KeywordPhrase } from "./keywords";

/**
 * Loose schema for the raw Apify Google Maps record shape.
 *
 * Apify's `compass/crawler-google-places` actor returns ~55 fields per record.
 * We validate the SUBSET we depend on; everything else is allowed through as
 * unknown (passthrough) so future fields don't trip us up.
 */
export const ApifyGoogleMapsRecordSchema = z
  .object({
    // Core identity
    placeId: z.string().optional(),
    title: z.string().optional(),
    categoryName: z.string().optional(),
    categories: z.array(z.string()).optional(),

    // Location
    neighborhood: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    street: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    location: z
      .object({
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .nullable()
      .optional(),

    // Web presence
    website: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),

    // Reviews
    totalScore: z.number().optional(),
    reviewsCount: z.number().optional(),
    reviewsDistribution: z
      .object({
        oneStar: z.number().optional(),
        twoStar: z.number().optional(),
        threeStar: z.number().optional(),
        fourStar: z.number().optional(),
        fiveStar: z.number().optional(),
      })
      .partial()
      .optional(),

    // Photos
    imagesCount: z.number().optional(),
    imageUrl: z.string().optional(),
    imageUrls: z.array(z.string()).optional(),
    imageCategories: z.array(z.string()).optional(),

    // Status flags
    temporarilyClosed: z.boolean().optional(),
    permanentlyClosed: z.boolean().optional(),
    claimThisBusiness: z.boolean().optional(),

    // Hours, Apify returns an ARRAY of per-day entries OR a numeric count
    // depending on the task. Accept both shapes defensively.
    openingHours: z.unknown().optional(),

    // Reviews (when rescrape includes text)
    reviews: z.array(z.unknown()).optional(),

    // Meta (ownership, attributes)
    additionalInfo: z.unknown().optional(),
  })
  .passthrough();

export type ApifyGoogleMapsRecord = z.infer<
  typeof ApifyGoogleMapsRecordSchema
>;

/* ---------------------------- helpers ----------------------------------- */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/['’`]/g, "") // drop curly/straight apostrophes entirely
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/**
 * Map Apify's free-text categoryName → our tight Category enum.
 * Returns null if nothing matches; caller decides whether to skip.
 */
export function mapCategory(
  categoryName: string | undefined,
  categories: string[] | undefined,
): Category | null {
  const haystack = [categoryName ?? "", ...(categories ?? [])]
    .join(" ")
    .toLowerCase();

  if (!haystack.trim()) return null;

  // Order matters: each return is final. Specific categories win over
  // generic fallbacks. Bakery comes first because Apify often returns
  // "bakery; cafe" for shops we want labeled bakery. The boutique branch
  // is the LAST retail fallback and intentionally avoids bare "shop" or
  // "store" matches (they leak specialty groceries and bottle shops in).
  if (/bakery|patisserie|pâtisserie/.test(haystack)) return "bakery";
  if (/tattoo/.test(haystack)) return "tattoo";
  if (/ice cream|frozen yogurt|froyo|gelato/.test(haystack)) return "ice_cream";
  if (/juice (bar|shop)|smoothie|acai/.test(haystack)) return "juice";

  // Specialty grocery: butchers, cheese shops, bottle shops, ethnic markets,
  // delis, fishmongers, farm/farmers/public markets, gourmet groceries.
  if (/butcher( shop)?|cheese (shop|monger)/.test(haystack)) return "grocery";
  if (/(beer|wine|liquor|bottle) (store|shop|warehouse)/.test(haystack)) {
    return "grocery";
  }
  if (
    /(gourmet|ethnic|asian|italian|polish|german|caribbean|halal|kosher|mexican|hispanic|european) (grocery|food market|market|deli)/
      .test(haystack)
  ) {
    return "grocery";
  }
  if (/(natural|health|organic) (food|grocery|market)/.test(haystack)) {
    return "grocery";
  }
  if (/specialty (food|grocery)/.test(haystack)) return "grocery";
  if (
    /delicatessen|(^|\W)deli(\W|$)|gourmet grocery|specialty food store|spice (store|shop)|olive oil|fish(monger|market)|greengrocer|farm market|farmers market|public market/
      .test(haystack)
  ) {
    return "grocery";
  }
  // Generic grocery / food market catch-all. Queue-driven sweeps already
  // exclude chains (Whole Foods, Trader Joe, etc.) at the place_id list
  // level, so a bare "Grocery store" from Apify is safe to label specialty.
  if (/grocery store|food market/.test(haystack)) return "grocery";

  if (/brewery|brewpub|microbrewery|taproom/.test(haystack)) return "brewery";
  if (/distillery/.test(haystack)) return "distillery";

  // Bar split out from restaurant: only match bar-specific phrases so we
  // don't sweep in every restaurant that happens to have a bar attached.
  if (/(^|\W)bar(\W|$)|wine bar|cocktail bar|sports bar|dive bar|tiki bar/.test(haystack)) {
    return "bar";
  }

  if (/salon|barber|beauty|spa|nail/.test(haystack)) return "salon";
  if (/gym|fitness|yoga|pilates|studio/.test(haystack)) return "fitness";
  if (/cafe|coffee|tea room|espresso/.test(haystack)) return "cafe";
  // Bar removed from restaurant regex since bar is now its own category.
  if (/restaurant|pub|grill|bistro|diner|eatery|pizzeria/.test(haystack)) {
    return "restaurant";
  }
  if (
    /museum|gallery|theater|theatre|arena|bowling|arcade|escape room|tour/
      .test(haystack)
  ) {
    return "experience";
  }

  // Boutique is the final retail fallback. Intentionally narrow: indie
  // clothing, vintage, thrift, gifts, antiques, home goods. No bare "shop"
  // or "store" match (those leaked specialty groceries into boutique).
  if (
    /boutique|gift shop|clothing|apparel|vintage|thrift|consignment|home goods|furniture|antique/
      .test(haystack)
  ) {
    return "boutique";
  }

  return null;
}

/* ---------------------------- normalize --------------------------------- */

const slugCollisions = new Map<string, string>(); // slug -> placeId

/**
 * Reset the module-level dedupe state. Call between ingestion runs if you
 * want a clean slate.
 */
export function resetDedupeState(): void {
  slugCollisions.clear();
}

export interface NormalizeOptions {
  /**
   * If provided, this function is called for any slug collision. Return a
   * string to override the slug, or null/undefined to accept the fallback
   * (placeId-based slug).
   */
  onSlugCollision?: (base: string, placeId: string) => string | null | void;
}

/**
 * Extended artifact: the Business record plus ancillary data the scoring /
 * insight layers need but can't live on the schema (raw review text, phrase
 * quotes, attribute flags). Stored alongside the business.json as
 * `_meta` for the business page to consume.
 */
export interface NormalizedArtifact {
  business: Business;
  meta: {
    placeId: string;
    phone: string | null;
    hasWebsite: boolean;
    hasPhone: boolean;
    hasOpeningHours: boolean;
    claimThisBusiness: boolean | null;
    imageCategories: string[];
    fromTheBusinessFlags: string[];
    reviewTexts: string[];
    keywordPhrases: KeywordPhrase[];
    rawReviewsCount: number;
    reviewsDistribution: {
      oneStar: number;
      twoStar: number;
      threeStar: number;
      fourStar: number;
      fiveStar: number;
    } | null;
    imagesCount: number;
    categoryName: string;
  };
}

/**
 * Normalize one Apify Google Maps record into our `Business` schema.
 *
 * Returns `null` if:
 * - The record is `permanentlyClosed: true`
 * - Core fields (title, address, placeId) are missing
 * - The category cannot be mapped to our enum
 *
 * Dedupe strategy:
 * - Slug derives from title (kebab-case).
 * - If another record already used that slug and has a DIFFERENT placeId,
 *   fall back to `<slug>-<placeId-short-hash>` so both records survive.
 */
export function normalizeApifyRecord(
  raw: unknown,
  opts: NormalizeOptions = {},
): Business | null {
  const parsed = ApifyGoogleMapsRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  const rec = parsed.data;

  // Hard skips
  if (rec.permanentlyClosed === true) return null;
  if (!rec.title || !rec.address || !rec.placeId) return null;

  const category = mapCategory(rec.categoryName, rec.categories);
  if (!category) return null;

  // Slug + collision handling
  const base = slugify(rec.title);
  if (!base) return null;
  let slug = base;
  const existingPlaceId = slugCollisions.get(base);
  if (existingPlaceId && existingPlaceId !== rec.placeId) {
    const override = opts.onSlugCollision?.(base, rec.placeId);
    if (typeof override === "string" && override.length > 0) {
      slug = override;
    } else {
      // Fallback: append a short, stable slice of the placeId.
      const suffix = rec.placeId.replace(/[^a-zA-Z0-9]/g, "").slice(-6)
        .toLowerCase();
      slug = `${base}-${suffix}`;
    }
  }
  slugCollisions.set(slug, rec.placeId);

  const photos: Business["photos"] = [];
  if (rec.imageUrl && /^https?:\/\//.test(rec.imageUrl)) {
    photos.push({ url: rec.imageUrl, source: "google-maps" });
  }
  for (const url of rec.imageUrls ?? []) {
    if (typeof url === "string" && /^https?:\/\//.test(url)) {
      if (photos.some((p) => p.url === url)) continue;
      photos.push({ url, source: "google-maps" });
    }
  }

  // Review text mining, only if rescrape surfaced actual text.
  const rawReviews = Array.isArray(rec.reviews) ? rec.reviews : [];
  const reviewTexts: string[] = [];
  const reviewDates: Date[] = [];
  for (const r of rawReviews) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text : null;
    if (text && text.trim().length > 0) reviewTexts.push(text);
    const pad = obj.publishedAtDate;
    if (typeof pad === "string") {
      const d = new Date(pad);
      if (!Number.isNaN(d.getTime())) reviewDates.push(d);
    }
  }

  const phrases = extractKeywordPhrases(reviewTexts);

  // Days since most recent review.
  let reviewFreshnessDays: number | undefined;
  if (reviewDates.length > 0) {
    const mostRecent = reviewDates.reduce((a, b) =>
      a.getTime() > b.getTime() ? a : b
    );
    const diff = Date.now() - mostRecent.getTime();
    reviewFreshnessDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  const now = new Date().toISOString();

  const candidate: Business = {
    slug,
    name: rec.title,
    category,
    neighborhood: rec.neighborhood || "Pittsburgh",
    address: rec.address,
    website: rec.website && /^https?:\/\//.test(rec.website)
      ? rec.website
      : undefined,
    google_rating: typeof rec.totalScore === "number"
      ? rec.totalScore
      : undefined,
    google_review_count: typeof rec.reviewsCount === "number"
      ? rec.reviewsCount
      : undefined,
    review_freshness_days: reviewFreshnessDays,
    photos,
    hero_photo: photos[0]?.url,
    review_keywords: phrases.map((p) => p.text),
    created_at: now,
    updated_at: now,
    claimed: false,
  };

  // Final strict validation, if our normalization produced something that
  // doesn't match Business, treat it as a bug and skip loudly.
  const out = BusinessSchema.safeParse(candidate);
  if (!out.success) {
    console.warn(
      `[normalize] dropped ${rec.placeId}: ${out.error.message.slice(0, 140)}`,
    );
    return null;
  }
  return out.data;
}

/**
 * Pulls the "From the business" attribute flags out of Apify's nested
 * additionalInfo structure. Each entry looks like
 *   { "Identifies as Asian-owned": true }
 * and we flatten to labels for entries whose value is truthy.
 */
function extractFromTheBusinessFlags(additionalInfo: unknown): string[] {
  if (!additionalInfo || typeof additionalInfo !== "object") return [];
  const obj = additionalInfo as Record<string, unknown>;
  const section = obj["From the business"];
  if (!Array.isArray(section)) return [];
  const out: string[] = [];
  for (const row of section) {
    if (!row || typeof row !== "object") continue;
    for (const [label, val] of Object.entries(row as Record<string, unknown>)) {
      if (val === true) out.push(label);
    }
  }
  return out;
}

/**
 * Normalize and also return the ancillary scoring/insight metadata.
 * Returns null under the same conditions as `normalizeApifyRecord`.
 */
export function normalizeApifyRecordWithMeta(
  raw: unknown,
  opts: NormalizeOptions = {},
): NormalizedArtifact | null {
  const business = normalizeApifyRecord(raw, opts);
  if (!business) return null;

  const parsed = ApifyGoogleMapsRecordSchema.safeParse(raw);
  if (!parsed.success) return null;
  const rec = parsed.data;

  const rawReviews = Array.isArray(rec.reviews) ? rec.reviews : [];
  const reviewTexts: string[] = [];
  for (const r of rawReviews) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text : null;
    if (text && text.trim().length > 0) reviewTexts.push(text);
  }

  // openingHours may be an array of { day, hours } objects, a number, or
  // missing. We only need to know presence.
  const hasOpeningHours = Array.isArray(rec.openingHours)
    ? rec.openingHours.length > 0
    : typeof rec.openingHours === "number"
    ? rec.openingHours > 0
    : false;

  const phone = typeof rec.phone === "string" && rec.phone.trim().length > 0
    ? rec.phone
    : null;

  const reviewsDistribution = rec.reviewsDistribution
    ? {
      oneStar: rec.reviewsDistribution.oneStar ?? 0,
      twoStar: rec.reviewsDistribution.twoStar ?? 0,
      threeStar: rec.reviewsDistribution.threeStar ?? 0,
      fourStar: rec.reviewsDistribution.fourStar ?? 0,
      fiveStar: rec.reviewsDistribution.fiveStar ?? 0,
    }
    : null;

  return {
    business,
    meta: {
      placeId: rec.placeId!,
      phone,
      hasWebsite: !!business.website,
      hasPhone: phone !== null,
      hasOpeningHours,
      claimThisBusiness: typeof rec.claimThisBusiness === "boolean"
        ? rec.claimThisBusiness
        : null,
      imageCategories: Array.isArray(rec.imageCategories)
        ? rec.imageCategories.filter((c): c is string => typeof c === "string")
        : [],
      fromTheBusinessFlags: extractFromTheBusinessFlags(rec.additionalInfo),
      reviewTexts,
      keywordPhrases: extractKeywordPhrases(reviewTexts),
      rawReviewsCount: rawReviews.length,
      reviewsDistribution,
      imagesCount: typeof rec.imagesCount === "number" ? rec.imagesCount : 0,
      categoryName: rec.categoryName ?? "",
    },
  };
}
