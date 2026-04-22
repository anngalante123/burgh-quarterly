import { z } from "zod";
import {
  BusinessSchema,
  type Business,
  type Category,
} from "./schemas";

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
    neighborhood: z.string().optional(),
    address: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    location: z
      .object({
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .optional(),

    // Web presence
    website: z.string().optional(),
    phone: z.string().optional(),

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

    // Status flags
    temporarilyClosed: z.boolean().optional(),
    permanentlyClosed: z.boolean().optional(),
    claimThisBusiness: z.boolean().optional(),

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

  // Order matters: bakery before cafe before restaurant (bakeries often
  // appear as "bakery; cafe"; we want bakery to win).
  if (/bakery|patisserie|pâtisserie/.test(haystack)) return "bakery";
  if (/salon|barber|beauty|spa|nail/.test(haystack)) return "salon";
  if (/boutique|gift shop|clothing store|shop/.test(haystack))
    return "boutique";
  if (/gym|fitness|yoga|pilates|studio/.test(haystack)) return "fitness";
  if (/cafe|coffee|tea room|espresso/.test(haystack)) return "cafe";
  if (/restaurant|bar|pub|grill|bistro|diner|eatery|pizzeria/.test(haystack))
    return "restaurant";
  if (
    /museum|gallery|theater|theatre|arena|bowling|arcade|escape room|tour/
      .test(haystack)
  )
    return "experience";

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
  if (rec.imageUrl) {
    photos.push({ url: rec.imageUrl, source: "google-maps" });
  }
  for (const url of rec.imageUrls ?? []) {
    if (typeof url === "string" && url.startsWith("http")) {
      photos.push({ url, source: "google-maps" });
    }
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
    photos,
    hero_photo: photos[0]?.url,
    review_keywords: [], // backfilled by the scoring pipeline once review text exists
    created_at: now,
    updated_at: now,
    claimed: false,
  };

  // Final strict validation — if our normalization produced something that
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
