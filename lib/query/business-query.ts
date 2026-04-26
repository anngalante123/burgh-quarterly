/**
 * Business query DSL, the backend for "best on social" lists and any
 * other ranked-list articles we want to generate from this dataset.
 *
 * Pure function layer, no Claude calls. Filters and ranks the existing
 * 30 (or N) businesses by declarative spec. The list-generator script
 * consumes this layer; future homepage widgets can too.
 *
 * Adding a new ranking criterion: add one entry to RANKINGS below.
 * Adding a new filter dimension: add one field to BusinessFilter and
 * one branch in applyFilter().
 */

import {
  loadAllBusinesses,
  type BusinessArtifact,
} from "@/lib/data/load-business";
import {
  loadSocialBySlug,
  type SocialRecord,
} from "@/lib/data/load-social";
import {
  loadReviewAnalysis,
  type ReviewAnalysis,
} from "@/lib/data/load-review-analysis";
import {
  familyForCategory,
} from "@/lib/data/category-family";

/* ----------------------------- types ---------------------------------- */

export type FamilyKey =
  | "sweets"
  | "cafes"
  | "bars"
  | "asian_eats"
  | "restaurants"
  | "other";
export type FamilyOrAll = FamilyKey | "all";

export type BusinessTier =
  | "icons"
  | "ones_to_watch"
  | "neighborhood_staples";

export type RichBusiness = {
  artifact: BusinessArtifact;
  social: SocialRecord;
  analysis: ReviewAnalysis | null;
};

export type BusinessFilter = {
  family?: FamilyOrAll;
  /** Exact Google categoryName, e.g. "Bakery", "Coffee shop". */
  category?: string;
  neighborhood?: string;
  tier?: BusinessTier;
  minReviews?: number;
  minRating?: number;
  /** Only businesses with TikTok video coverage > 0. */
  hasTiktokCoverage?: boolean;
  /** Only businesses with at least 1 IG post in the last 30 days. */
  igActiveOnly?: boolean;
  /** Slugs to exclude. */
  exclude?: string[];
};

export type RankingKey =
  /** Default editorial composite (the rank used on business pages). */
  | "composite"
  /** Creator pickup: unique creators × log(plays). Surfaces the "city is filming" signal. */
  | "creator_pickup"
  /** Instagram momentum: posts_30d × engagement rate. Active posters. */
  | "instagram_momentum"
  /** Review sentiment subscore, the community_spark axis. */
  | "review_sentiment"
  /** Creator-readiness: collab_fit subscore (website, phone, hours, biz IG). */
  | "creator_ready_setup"
  /** Total review volume (raw count). */
  | "review_volume"
  /** Five-star ratio. */
  | "review_quality";

export type RankedBusiness = {
  rank: number;
  business: RichBusiness;
  rankingValue: number;
};

export type QuerySpec = {
  filter?: BusinessFilter;
  ranking: RankingKey;
  limit: number;
};

/* ----------------------------- ranking criteria ----------------------- */

const RANKINGS: Record<RankingKey, (b: RichBusiness) => number> = {
  composite: (b) => b.artifact.score.composite,

  creator_pickup: (b) => {
    const tt = b.social.tiktok_mentions;
    if (!tt || tt.video_count === 0) return 0;
    return tt.unique_creators * Math.log10(tt.total_plays + 1);
  },

  instagram_momentum: (b) => {
    const ig = b.social.ig;
    if (!ig) return 0;
    // Active posters with engagement, posts × (engagement % + 1) so a
    // posting business with 0 engagement still beats a non-posting one.
    return ig.posts_30d * (ig.avg_engagement_rate * 100 + 1);
  },

  review_sentiment: (b) => b.artifact.score.subscores.community_spark,

  creator_ready_setup: (b) => b.artifact.score.subscores.collab_fit,

  review_volume: (b) => b.artifact.business.google_review_count ?? 0,

  review_quality: (b) => {
    const total = b.artifact.business.google_review_count ?? 0;
    const five = b.artifact.meta.reviewsDistribution?.fiveStar ?? 0;
    return total > 0 ? five / total : 0;
  },
};

/* ----------------------------- loader --------------------------------- */

let _cache: RichBusiness[] | null = null;

/**
 * Load every business with its social and analysis records joined.
 * Cached for the lifetime of the process so multiple queries don't
 * re-read disk. Reset by passing { fresh: true }.
 */
export function loadAllRichBusinesses(opts?: { fresh?: boolean }): RichBusiness[] {
  if (_cache && !opts?.fresh) return _cache;
  const arts = loadAllBusinesses();
  _cache = arts.map((artifact) => {
    const social = loadSocialBySlug(artifact.business.slug);
    const analysis = loadReviewAnalysis(artifact.business.slug);
    return { artifact, social, analysis };
  });
  return _cache;
}

/* ----------------------------- filter --------------------------------- */

function applyFilter(b: RichBusiness, f: BusinessFilter): boolean {
  if (f.family && f.family !== "all") {
    const k = familyForCategory(b.artifact.meta.categoryName).key;
    if (k !== f.family) return false;
  }
  if (f.category && b.artifact.meta.categoryName !== f.category) return false;
  if (f.neighborhood && b.artifact.business.neighborhood !== f.neighborhood)
    return false;
  if (f.tier && b.artifact.score.tier !== f.tier) return false;
  if (
    f.minReviews !== undefined &&
    (b.artifact.business.google_review_count ?? 0) < f.minReviews
  )
    return false;
  if (
    f.minRating !== undefined &&
    (b.artifact.business.google_rating ?? 0) < f.minRating
  )
    return false;
  if (
    f.hasTiktokCoverage &&
    !(b.social.tiktok_mentions && b.social.tiktok_mentions.video_count > 0)
  )
    return false;
  if (f.igActiveOnly && !(b.social.ig && b.social.ig.posts_30d > 0))
    return false;
  if (f.exclude?.includes(b.artifact.business.slug)) return false;
  return true;
}

/* ----------------------------- query ---------------------------------- */

/**
 * Run a query against the loaded business set. Returns a ranked,
 * 1-indexed list capped at `limit`. Sort is descending by ranking value.
 */
export function queryBusinesses(spec: QuerySpec): RankedBusiness[] {
  const all = loadAllRichBusinesses();
  const filtered = spec.filter
    ? all.filter((b) => applyFilter(b, spec.filter!))
    : all;
  const rankFn = RANKINGS[spec.ranking];
  const sorted = filtered.slice().sort((a, b) => rankFn(b) - rankFn(a));
  const limited = sorted.slice(0, spec.limit);
  return limited.map((b, i) => ({
    rank: i + 1,
    business: b,
    rankingValue: rankFn(b),
  }));
}

/* ----------------------------- ranking utils -------------------------- */

/** List of all available ranking keys, useful for CLI help and registry validation. */
export const ALL_RANKINGS: RankingKey[] = [
  "composite",
  "creator_pickup",
  "instagram_momentum",
  "review_sentiment",
  "creator_ready_setup",
  "review_volume",
  "review_quality",
];
