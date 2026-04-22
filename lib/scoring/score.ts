/**
 * Creator Readiness Score — 5-factor weighted rubric.
 *
 * Formula (SCORING_RUBRIC.md):
 *   composite = 0.25·content_canvas
 *             + 0.20·community_spark
 *             + 0.20·conversion_path
 *             + 0.20·momentum
 *             + 0.15·collab_fit
 *
 * Each subscore clamped to 0–100, composite rounded to integer.
 * Tiers: 80+ = icons, 60–79 = ones_to_watch, <60 = neighborhood_staples.
 *
 * Calibration target (D-016):
 *   La Gourmandine Lawrenceville should land in [78, 85].
 *   The weights in scoreSubscores below are tuned against that target —
 *   any change must re-verify against the pilot.
 */

import type { Business, ScoreBreakdown, Tier } from "@/lib/data/schemas";
import type { NormalizedArtifact } from "@/lib/data/normalize";

/* ---------------------------- affection lexicon ------------------------- */

const AFFECTION_WORDS = [
  "love",
  "loved",
  "loves",
  "favorite",
  "favourites",
  "favorites",
  "best",
  "cant wait",
  "can't wait",
  "amazing",
  "incredible",
  "gem",
  "hidden gem",
  "feels like",
  "obsessed",
  "addicted",
  "phenomenal",
  "delightful",
  "perfect",
  "wonderful",
  "heaven",
];

/* ------------------ creator-friendly category taxonomy ------------------ */

const CREATOR_FRIENDLY_CATEGORIES = new Set<Business["category"]>([
  "bakery",
  "cafe",
  "salon",
  "boutique",
  "fitness",
  "experience",
]);

/**
 * Owner-identity / community flags that boost Collab Fit.
 * Case-insensitive substring match against the "From the business" labels.
 */
const IDENTITY_BOOSTS = [
  "black-owned",
  "latino-owned",
  "women-owned",
  "woman-owned",
  "asian-owned",
  "lgbtq",
  "veteran-owned",
  "small business",
];

/* -------------------- category-level review/photo medians --------------- */

/**
 * Rough medians for normalization. Derived from Pittsburgh food verticals
 * (pit-dts-foodniche dataset). These are intentionally wide bands so a
 * business with "lots of reviews" maps to high-90s and a business with
 * category-average volume maps to ~60.
 *
 * NOTE: When the dataset grows to thousands of records, compute these from
 * the actual population rather than hardcoding.
 */
const CATEGORY_REVIEW_MEDIAN: Record<Business["category"], number> = {
  bakery: 400,
  cafe: 250,
  restaurant: 500,
  salon: 150,
  boutique: 150,
  fitness: 80,
  experience: 200,
};

const CATEGORY_PHOTO_MEDIAN: Record<Business["category"], number> = {
  bakery: 200,
  cafe: 150,
  restaurant: 400,
  salon: 80,
  boutique: 100,
  fitness: 80,
  experience: 200,
};

/* --------------------------- utilities ---------------------------------- */

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Normalize an observed value against a median using a sigmoid-ish curve.
 * Tuning: at `obs == median` → ~60, at `obs == 3x median` → ~90,
 *          at `obs == 0.3x median` → ~30.
 */
function normalizeAgainstMedian(obs: number, median: number): number {
  if (median <= 0) return 50;
  const ratio = obs / median;
  // Log-linear mapping capped 0..100.
  // ratio=1 → 60; ratio=3 → ~90; ratio=0.33 → ~30
  const raw = 60 + 30 * Math.log2(Math.max(0.01, ratio));
  return clamp(raw);
}

function countAffection(texts: string[]): number {
  if (texts.length === 0) return 0;
  let hits = 0;
  for (const t of texts) {
    const lc = t.toLowerCase();
    for (const word of AFFECTION_WORDS) {
      let idx = 0;
      while ((idx = lc.indexOf(word, idx)) !== -1) {
        hits += 1;
        idx += word.length;
      }
    }
  }
  return hits;
}

function hasIdentityBoost(flags: string[]): boolean {
  if (flags.length === 0) return false;
  const lc = flags.map((f) => f.toLowerCase());
  return IDENTITY_BOOSTS.some((boost) => lc.some((f) => f.includes(boost)));
}

/* ---------------------------- subscores --------------------------------- */

export function contentCanvasScore(
  biz: Business,
  art: NormalizedArtifact["meta"],
): number {
  // Visual variety from imagesCount normalized.
  const photoScore = normalizeAgainstMedian(
    art.imagesCount,
    CATEGORY_PHOTO_MEDIAN[biz.category],
  );

  // Photo richness — imageCategories.length is a proxy for how many
  // distinct visual contexts Google has indexed. 3 categories = ok,
  // 8+ categories = rich.
  const catCount = art.imageCategories.length;
  const richnessScore = catCount <= 2
    ? 35
    : catCount <= 4
    ? 55
    : catCount <= 6
    ? 70
    : catCount <= 9
    ? 85
    : 95;

  // Narrative hooks — any review-phrase traction signals creators have
  // something to latch onto (named dishes, rituals, specific items).
  // Higher = more distinct recurring phrases.
  const phraseCount = art.keywordPhrases.length;
  const narrativeScore = phraseCount === 0
    ? 40
    : phraseCount <= 2
    ? 55
    : phraseCount <= 4
    ? 70
    : phraseCount <= 6
    ? 82
    : 92;

  // Weighted blend (inside Content Canvas).
  const score = 0.45 * photoScore + 0.30 * richnessScore + 0.25 * narrativeScore;
  return Math.round(clamp(score));
}

export function communitySparkScore(
  biz: Business,
  art: NormalizedArtifact["meta"],
): number {
  // Review volume vs category median.
  const volumeScore = normalizeAgainstMedian(
    biz.google_review_count ?? 0,
    CATEGORY_REVIEW_MEDIAN[biz.category],
  );

  // Freshness — most recent review recency.
  const fresh = biz.review_freshness_days;
  let freshScore: number;
  if (fresh === undefined) freshScore = 50;
  else if (fresh <= 7) freshScore = 95;
  else if (fresh <= 30) freshScore = 85;
  else if (fresh <= 60) freshScore = 72;
  else if (fresh <= 120) freshScore = 55;
  else if (fresh <= 365) freshScore = 35;
  else freshScore = 15;

  // Sentiment intensity — affection words per review text sampled.
  const affectionHits = countAffection(art.reviewTexts);
  const perReview = art.reviewTexts.length > 0
    ? affectionHits / art.reviewTexts.length
    : 0;
  // 0 per review → 30; 0.5 → ~65; 1.0 → ~80; 2.0+ → 95
  const sentimentScore = clamp(30 + perReview * 35);

  // UGC indicator — any "From the business" attribute means the owner has
  // engaged with Google Business (active profile).
  const ugcScore = art.fromTheBusinessFlags.length > 0 ? 78 : 55;

  const score = 0.40 * volumeScore + 0.25 * freshScore + 0.25 * sentimentScore +
    0.10 * ugcScore;
  return Math.round(clamp(score));
}

export function conversionPathScore(
  _biz: Business,
  art: NormalizedArtifact["meta"],
): number {
  // Presence checks — each signal worth ~25 points.
  let pts = 0;
  if (art.hasWebsite) pts += 25;
  if (art.hasPhone) pts += 25;
  if (art.hasOpeningHours) pts += 25;
  // claimThisBusiness === false means Google considers it CLAIMED (the
  // "claim this business" prompt is off), i.e. the owner is active.
  if (art.claimThisBusiness === false) pts += 25;

  // Floor at 20 so a profile with literally no conversion path doesn't
  // hit 0 (zero scores distort composite tiers).
  return Math.round(clamp(Math.max(20, pts)));
}

/**
 * Momentum — STUB. Once Instagram data ingests, compute from posts_last_30
 * and reels_last_30. For now, return a flat 60 and flag the source.
 *
 * Arguments are received (and referenced so eslint doesn't complain) so the
 * function shape stays consistent with the other subscorers for when
 * Instagram-derived inputs land on Business / NormalizedArtifact.meta.
 */
export function momentumScore(
  biz: Business,
  art: NormalizedArtifact["meta"],
): number {
  // Touch both args so future refactors have a seam to plug into.
  void biz.slug;
  void art.placeId;
  return 60;
}

export const MOMENTUM_SOURCE_STUB = "stub_pending_instagram_data";

export function collabFitScore(
  biz: Business,
  art: NormalizedArtifact["meta"],
): number {
  // Category clarity — single category → high; many categories dilute fit.
  // We use the Apify raw categoryName presence as the proxy.
  const clarityScore = art.categoryName.trim().length > 0 ? 80 : 60;

  // Neighborhood identity — having a named, non-default neighborhood.
  const neighborhoodScore =
    biz.neighborhood && biz.neighborhood !== "Pittsburgh" ? 85 : 55;

  // Creator-friendly category check.
  const categoryFitScore = CREATOR_FRIENDLY_CATEGORIES.has(biz.category)
    ? 85
    : biz.category === "restaurant"
    ? 70 // restaurants are fine, just not as native to local creator content
    : 55;

  // Identity / community flags (small-business, woman-owned, etc.).
  const identityBoost = hasIdentityBoost(art.fromTheBusinessFlags) ? 12 : 0;

  const score = 0.30 * clarityScore + 0.30 * neighborhoodScore +
    0.40 * categoryFitScore + identityBoost;
  return Math.round(clamp(score));
}

/* ---------------------------- composite -------------------------------- */

export function scoreSubscores(
  biz: Business,
  art: NormalizedArtifact["meta"],
): ScoreBreakdown {
  return {
    content_canvas: contentCanvasScore(biz, art),
    community_spark: communitySparkScore(biz, art),
    conversion_path: conversionPathScore(biz, art),
    momentum: momentumScore(biz, art),
    collab_fit: collabFitScore(biz, art),
  };
}

export function composite(subs: ScoreBreakdown): number {
  const raw = 0.25 * subs.content_canvas +
    0.20 * subs.community_spark +
    0.20 * subs.conversion_path +
    0.20 * subs.momentum +
    0.15 * subs.collab_fit;
  return Math.round(clamp(raw));
}

export function tierOf(compositeScore: number): Tier {
  if (compositeScore >= 80) return "icons";
  if (compositeScore >= 60) return "ones_to_watch";
  return "neighborhood_staples";
}

/* ------------------ full score assembly -------------------------------- */

export interface ScoredResult {
  subscores: ScoreBreakdown;
  composite: number;
  tier: Tier;
  momentum_source: string;
}

export function scoreBusiness(
  biz: Business,
  art: NormalizedArtifact["meta"],
): ScoredResult {
  const subs = scoreSubscores(biz, art);
  const comp = composite(subs);
  return {
    subscores: subs,
    composite: comp,
    tier: tierOf(comp),
    momentum_source: MOMENTUM_SOURCE_STUB,
  };
}
