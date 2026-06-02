/**
 * Creator Readiness Score, 5-factor weighted rubric.
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
 *   The weights in scoreSubscores below are tuned against that target ,
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
  // New verticals (Phase 4 taxonomy expansion). Bands estimated from peer
  // categories pending real-population calibration.
  grocery: 200,
  bar: 400,
  brewery: 400,
  distillery: 200,
  tattoo: 150,
  ice_cream: 300,
  juice: 150,
  // Phase scaling expansion. Bands estimated from adjacent verticals
  // pending real-population calibration once the 4,000-business sweep
  // lands. RISK: these are educated guesses; revisit after Phase 5.
  live_music: 250,
  plant_shop: 100,
  bookstore: 150,
  record_store: 100,
  florist: 100,
  gallery_museum: 200,
  spa: 150,
};

const CATEGORY_PHOTO_MEDIAN: Record<Business["category"], number> = {
  bakery: 200,
  cafe: 150,
  restaurant: 400,
  salon: 80,
  boutique: 100,
  fitness: 80,
  experience: 200,
  grocery: 100,
  bar: 300,
  brewery: 300,
  distillery: 150,
  tattoo: 200,
  ice_cream: 150,
  juice: 100,
  // Phase scaling expansion. RISK: estimates pending real calibration.
  live_music: 250,
  plant_shop: 80,
  bookstore: 80,
  record_store: 60,
  florist: 80,
  gallery_museum: 200,
  spa: 100,
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

  // Photo richness, imageCategories.length is a proxy for how many
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

  // Narrative hooks, any review-phrase traction signals creators have
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

  // Freshness, most recent review recency.
  const fresh = biz.review_freshness_days;
  let freshScore: number;
  if (fresh === undefined) freshScore = 50;
  else if (fresh <= 7) freshScore = 95;
  else if (fresh <= 30) freshScore = 85;
  else if (fresh <= 60) freshScore = 72;
  else if (fresh <= 120) freshScore = 55;
  else if (fresh <= 365) freshScore = 35;
  else freshScore = 15;

  // Sentiment intensity, affection words per review text sampled.
  const affectionHits = countAffection(art.reviewTexts);
  const perReview = art.reviewTexts.length > 0
    ? affectionHits / art.reviewTexts.length
    : 0;
  // 0 per review → 30; 0.5 → ~65; 1.0 → ~80; 2.0+ → 95
  const sentimentScore = clamp(30 + perReview * 35);

  // UGC indicator, any "From the business" attribute means the owner has
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
  // Presence checks, each signal worth ~25 points.
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
 * Momentum, Instagram-derived. Scored when an IG snapshot is available;
 * otherwise falls back to the 60-point stub.
 *
 * Formula (per the ops plan):
 *   momentum =
 *     40 * normalize(posts_30d, category_median_posts_30d)
 *   + 30 * normalize(reels_30d, 4)         // 4+ reels/month is strong
 *   + 20 * normalize(engagement_rate, 0.03) // 3% engagement is solid
 *   + 10 * presence_signal                  // verified +10; has handle +5
 *
 * Each `normalize` call caps at 1.0 (so a single subscore can't exceed its
 * max-weight contribution). Final output clamped to 0–100.
 *
 * Category-median posts_30d is loosely tied to the CATEGORY_REVIEW_MEDIAN
 * curve: SMB food/beverage with healthy IG habits posts 6–12/month; the
 * median we target is 8.
 */
export const MOMENTUM_SOURCE_STUB = "stub_pending_instagram_data";
export const MOMENTUM_SOURCE_IG = "instagram_scrape";
export const MOMENTUM_SOURCE_NO_HANDLE = "no_instagram_handle";

const CATEGORY_POSTS_30D_MEDIAN: Record<Business["category"], number> = {
  bakery: 8,
  cafe: 8,
  restaurant: 10,
  salon: 6,
  boutique: 6,
  fitness: 8,
  experience: 6,
  grocery: 4,
  bar: 8,
  brewery: 10,
  distillery: 6,
  tattoo: 8,
  ice_cream: 6,
  juice: 6,
  // Phase scaling expansion. RISK: estimates pending real calibration.
  live_music: 12,
  plant_shop: 6,
  bookstore: 6,
  record_store: 4,
  florist: 6,
  gallery_museum: 8,
  spa: 6,
};

export interface IgSnapshot {
  handle?: string;
  followers?: number;
  posts_total?: number;
  posts_30d?: number;
  reels_30d?: number;
  avg_engagement_rate?: number; // fractional
  verified?: boolean;
  private?: boolean;
  error?: string;
}

function normalizeCapped(obs: number, target: number): number {
  // 0 → 0, target → 1, capped at 1.
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, obs / target));
}

export function momentumScore(
  biz: Business,
  art: NormalizedArtifact["meta"],
  ig?: IgSnapshot | null,
): number {
  void art.placeId;
  if (!ig || ig.error || ig.private) {
    // No measured IG signal. Return 0 so the subscore reflects reality;
    // composite() rebalances and drops the momentum weight entirely when
    // called with { skipMomentum: true } for these cases. (Previously this
    // returned a 60-point stub, which silently inflated every non-IG biz.)
    return 0;
  }

  const postsTarget = CATEGORY_POSTS_30D_MEDIAN[biz.category];
  const postsPart = 40 * normalizeCapped(ig.posts_30d ?? 0, postsTarget);
  const reelsPart = 30 * normalizeCapped(ig.reels_30d ?? 0, 4);

  // Engagement rate, clip the absurd tail from new/bursty accounts so a
  // single viral reel doesn't inflate the score. Cap incoming rate at 10%.
  const rawRate = ig.avg_engagement_rate ?? 0;
  const cleanRate = Math.min(rawRate, 0.10);
  const engagementPart = 20 * normalizeCapped(cleanRate, 0.03);

  // Presence signal: verified = 10; has handle = 5 (scalar multiplier = 1.0
  // or 0.5 against the 10 weight).
  let presenceMult = 0.5; // has handle
  if (ig.verified) presenceMult = 1.0;
  const presencePart = 10 * presenceMult;

  const score = postsPart + reelsPart + engagementPart + presencePart;
  return Math.round(clamp(score));
}

export function collabFitScore(
  biz: Business,
  art: NormalizedArtifact["meta"],
): number {
  // Category clarity, single category → high; many categories dilute fit.
  // We use the Apify raw categoryName presence as the proxy.
  const clarityScore = art.categoryName.trim().length > 0 ? 80 : 60;

  // Neighborhood identity, having a named, non-default neighborhood.
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
  ig?: IgSnapshot | null,
): ScoreBreakdown {
  return {
    content_canvas: contentCanvasScore(biz, art),
    community_spark: communitySparkScore(biz, art),
    conversion_path: conversionPathScore(biz, art),
    momentum: momentumScore(biz, art, ig),
    collab_fit: collabFitScore(biz, art),
  };
}

export function composite(
  subs: ScoreBreakdown,
  opts?: { skipMomentum?: boolean },
): number {
  // Coalesce missing subscores to 0. A subscore can come back null/NaN when
  // the data needed to compute it is genuinely absent (e.g. a fresh Apify
  // scrape with no keyword_phrases yet). Treat that as "no signal observed"
  // rather than letting NaN propagate into the integer composite column,
  // which Postgres rejects.
  const safe = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) ? n : 0;
  if (opts?.skipMomentum) {
    // No measured IG signal. Recompute over the four remaining signals
    // with weights rebalanced so they sum to 1. Original weights w/o
    // momentum totalled 0.80; each is scaled by 1/0.80 = 1.25.
    const raw = 0.3125 * safe(subs.content_canvas) +
      0.25 * safe(subs.community_spark) +
      0.25 * safe(subs.conversion_path) +
      0.1875 * safe(subs.collab_fit);
    return Math.round(clamp(raw));
  }
  const raw = 0.25 * safe(subs.content_canvas) +
    0.20 * safe(subs.community_spark) +
    0.20 * safe(subs.conversion_path) +
    0.20 * safe(subs.momentum) +
    0.15 * safe(subs.collab_fit);
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
  ig?: IgSnapshot | null,
): ScoredResult {
  const noIg = !ig || Boolean(ig.error) || Boolean(ig.private);
  const subs = scoreSubscores(biz, art, ig);
  const comp = composite(subs, { skipMomentum: noIg });
  let momentum_source: string;
  if (!ig) momentum_source = MOMENTUM_SOURCE_NO_HANDLE;
  else if (ig.error || ig.private) momentum_source = MOMENTUM_SOURCE_NO_HANDLE;
  else momentum_source = MOMENTUM_SOURCE_IG;
  return {
    subscores: subs,
    composite: comp,
    tier: tierOf(comp),
    momentum_source,
  };
}
