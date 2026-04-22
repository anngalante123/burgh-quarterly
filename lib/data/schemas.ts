import { z } from "zod";

/**
 * Data model for Signal Pittsburgh.
 * Mirrors .claude/memory/DATA_MODEL.md — keep them in sync.
 *
 * Schemas validate on read AND write. If a file fails Zod, the build fails
 * loudly: data integrity > convenience.
 */

/* ----------------------------- Primitives ------------------------------- */

export const CategorySchema = z.enum([
  "restaurant",
  "cafe",
  "salon",
  "boutique",
  "fitness",
  "bakery",
  "experience",
]);
export type Category = z.infer<typeof CategorySchema>;

export const TierSchema = z.enum([
  "icons",
  "ones_to_watch",
  "neighborhood_staples",
]);
export type Tier = z.infer<typeof TierSchema>;

export const SeasonSchema = z.enum(["spring", "summer", "fall", "winter"]);
export type Season = z.infer<typeof SeasonSchema>;

const IsoDateTimeString = z.string().datetime({ offset: true }).or(
  z.string().datetime(),
);

/* ------------------------------ Business -------------------------------- */

export const BusinessPhotoSchema = z.object({
  url: z.string().url(),
  source: z.string(),
});
export type BusinessPhoto = z.infer<typeof BusinessPhotoSchema>;

export const BusinessSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
  name: z.string().min(1),
  category: CategorySchema,
  neighborhood: z.string().min(1),
  address: z.string().min(1),
  website: z.string().url().optional(),
  instagram: z.string().optional(), // handle without @
  tiktok: z.string().optional(),
  google_rating: z.number().min(0).max(5).optional(),
  google_review_count: z.number().int().nonnegative().optional(),
  review_freshness_days: z.number().int().nonnegative().optional(),
  posts_last_30: z.number().int().nonnegative().optional(),
  reels_last_30: z.number().int().nonnegative().optional(),
  has_booking_link: z.boolean().optional(),
  has_ugc_visible: z.boolean().optional(),
  photos: z.array(BusinessPhotoSchema).default([]),
  hero_photo: z.string().url().optional(),
  review_keywords: z.array(z.string()).default([]),
  created_at: IsoDateTimeString,
  updated_at: IsoDateTimeString,
  claimed: z.boolean().default(false),
  owner_email: z.string().email().optional(),
});
export type Business = z.infer<typeof BusinessSchema>;

/* ------------------------------- Score ---------------------------------- */

export const ScoreBreakdownSchema = z.object({
  content_canvas: z.number().min(0).max(100),
  community_spark: z.number().min(0).max(100),
  conversion_path: z.number().min(0).max(100),
  momentum: z.number().min(0).max(100),
  collab_fit: z.number().min(0).max(100),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const UnfairAdvantageSchema = z.object({
  label: z.string().min(1),
  evidence: z.string().min(1),
});
export type UnfairAdvantage = z.infer<typeof UnfairAdvantageSchema>;

export const ScoreMovementSchema = z.object({
  category: z.number().int().nullable(),
  neighborhood: z.number().int().nullable(),
  overall: z.number().int().nullable(),
});
export type ScoreMovement = z.infer<typeof ScoreMovementSchema>;

export const ScoreSchema = z.object({
  business_slug: z.string().min(1),
  issue_slug: z.string().min(1),
  subscores: ScoreBreakdownSchema,
  composite: z.number().int().min(0).max(100),
  tier: TierSchema,
  rank_category: z.number().int().positive(),
  rank_neighborhood: z.number().int().positive(),
  rank_overall: z.number().int().positive(),
  movement: ScoreMovementSchema,
  unfair_advantage: UnfairAdvantageSchema,
  scored_at: IsoDateTimeString,
});
export type Score = z.infer<typeof ScoreSchema>;

/* ------------------------------- Issue ---------------------------------- */

export const IssueStatsSchema = z.object({
  businesses_ranked: z.number().int().nonnegative(),
  new_entries: z.number().int().nonnegative(),
  movers_into_icons: z.number().int().nonnegative(),
  biggest_climber_slug: z.string().min(1),
});
export type IssueStats = z.infer<typeof IssueStatsSchema>;

// Forward-declared below as union with Feature / UnderratedList defined later.
// Because Zod object schemas don't support true forward refs cleanly, we define
// Feature and UnderratedList first, then Issue references them.

/* ------------------------- UnderratedList ------------------------------- */

export const UnderratedEntrySchema = z.object({
  business_slug: z.string().min(1),
  rank_on_list: z.number().int().min(1).max(10),
  why: z.string().min(1),
  evidence: z.string().min(1),
});
export type UnderratedEntry = z.infer<typeof UnderratedEntrySchema>;

export const UnderratedListSchema = z.object({
  issue_slug: z.string().min(1),
  category: CategorySchema,
  title: z.string().min(1),
  intro: z.string().min(1),
  entries: z.array(UnderratedEntrySchema).min(1),
});
export type UnderratedList = z.infer<typeof UnderratedListSchema>;

/* ------------------------------ Feature --------------------------------- */

export const FeatureCreditsSchema = z.object({
  creator_handles: z.array(z.string()).default([]),
  photographer: z.string().optional(),
});
export type FeatureCredits = z.infer<typeof FeatureCreditsSchema>;

export const FeatureMovementSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
});
export type FeatureMovement = z.infer<typeof FeatureMovementSchema>;

/**
 * Editorial climber story. Relay is NEVER named inside `body_mdx` or `credits`.
 * Creators are named by @handle. See .claude/memory/EDITORIAL_VOICE.md.
 */
export const FeatureSchema = z.object({
  issue_slug: z.string().min(1),
  business_slug: z.string().min(1),
  headline: z.string().min(1),
  dek: z.string().min(1),
  body_mdx: z.string().min(1),
  credits: FeatureCreditsSchema,
  movement: FeatureMovementSchema,
  published_at: IsoDateTimeString,
});
export type Feature = z.infer<typeof FeatureSchema>;

/* --------------------------- Issue (uses above) ------------------------- */

export const IssueSchema = z.object({
  slug: z.string().min(1), // e.g. "2026-spring"
  title: z.string().min(1),
  season: SeasonSchema,
  year: z.number().int().min(2025).max(2100),
  published_at: IsoDateTimeString,
  cover_blurb: z.string().min(1),
  features: z.array(FeatureSchema).default([]),
  underrated_lists: z.array(UnderratedListSchema).default([]),
  stats: IssueStatsSchema,
});
export type Issue = z.infer<typeof IssueSchema>;

/* ---------------------------- Issue (alias) ----------------------------- */

// alias helps external consumers
export const IssueTypeRef = IssueSchema;

/* ------------------------------- Issue ---------------------------------- */

/* ----------------------------- LeadCapture ------------------------------ */

export const LeadCaptureSourceSchema = z.enum([
  "subscribe",
  "claim",
  "alerts",
]);
export type LeadCaptureSource = z.infer<typeof LeadCaptureSourceSchema>;

export const LeadCaptureClaimStatusSchema = z.enum([
  "pending",
  "verified",
  "rejected",
]);
export type LeadCaptureClaimStatus = z.infer<
  typeof LeadCaptureClaimStatusSchema
>;

export const LeadCaptureSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  source: LeadCaptureSourceSchema,
  business_slug: z.string().min(1).optional(),
  owner_name: z.string().min(1).optional(),
  verification_answer: z.string().optional(),
  claim_status: LeadCaptureClaimStatusSchema.optional(),
  opted_in_alerts: z.boolean().default(false),
  created_at: IsoDateTimeString,
  consent_ip: z.string().optional(),
  consent_ua: z.string().optional(),
});
export type LeadCapture = z.infer<typeof LeadCaptureSchema>;

/* ------------------------- Issue (public export) ------------------------ */

/**
 * Convenience: a tagged union of all top-level content records, if you need
 * to route by shape when reading JSON from disk.
 */
export type AnyRecord =
  | Business
  | Score
  | Issue
  | UnderratedList
  | Feature
  | LeadCapture;
