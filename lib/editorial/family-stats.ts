import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";
import { familyForBusinessCategory } from "@/lib/data/category-family";
import { pickPeerScope } from "@/lib/data/sub-category-peers";

/**
 * Per-family peer comparisons for the raw metrics we surface on a
 * business's scorecard. For each metric we compute:
 *   - the business's value
 *   - the family median (NOT the mean, robust to outliers)
 *   - the family top (#1 in family on this metric)
 *   - the business's rank within its family on this metric
 *   - a comparison label: "top of Sweets", "above Sweets median",
 *     "below Sweets median", "bottom of Sweets"
 *
 * Used by the AtAGlance card to add per-row peer context, and by the
 * Strengths-and-Gaps summary block at the top of each business page.
 */

export type MetricStat = {
  /** This business's value. */
  value: number;
  /** Family median. */
  median: number;
  /** Highest value in the family. */
  top: number;
  /** This business's rank within the family (1 = highest). */
  rank: number;
  /** Total number of businesses in the family. */
  familySize: number;
  /** Short editorial label, e.g. "Top of Sweets" / "#3 of 6 in Sweets" / "Bottom of Sweets". The word "median" is intentionally avoided; per 2026-04-30 review it reads as jargon. */
  label: string;
  /** Optional, percent gap to median when above (positive) or below (negative). Null when median is 0. */
  pctVsMedian: number | null;
};

export type FamilyMetricStats = {
  reviewCount: MetricStat;
  rating: MetricStat;
  fiveStarPct: MetricStat;
  igPosts30d: MetricStat;
  igFollowers: MetricStat;
  igEngagement: MetricStat;
  tiktokCreators: MetricStat;
  tiktokPlays: MetricStat;
  /** Family display label, e.g. "Pittsburgh Sweets". */
  familyLabel: string;
  /** Family short label, e.g. "Sweets". */
  familyShort: string;
};

function median(values: number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[m - 1] + sorted[m]) / 2) : sorted[m];
}

function rankInArray(value: number, all: number[]): number {
  // 1-indexed rank, ties broken by position
  const sorted = all.slice().sort((a, b) => b - a);
  const idx = sorted.findIndex((v) => v <= value);
  return idx === -1 ? sorted.length : idx + 1;
}

function buildLabel(rank: number, familySize: number, familyShort: string): string {
  if (rank === 1) return `Top of ${familyShort}`;
  if (rank === familySize) return `Bottom of ${familyShort}`;
  // Avoid the word "median", it's jargon and reads ambiguously.
  // Use concrete rank-of-N positioning instead.
  return `#${rank} of ${familySize} in ${familyShort}`;
}

function pctVsMedian(value: number, m: number): number | null {
  if (m <= 0) return null;
  return Math.round(((value - m) / m) * 100);
}

function buildStat(
  value: number,
  familyValues: number[],
  familyShort: string,
): MetricStat {
  const m = median(familyValues);
  const top = familyValues.length > 0 ? Math.max(...familyValues) : 0;
  const rank = rankInArray(value, familyValues);
  return {
    value,
    median: m,
    top,
    rank,
    familySize: familyValues.length,
    label: buildLabel(rank, familyValues.length, familyShort),
    pctVsMedian: pctVsMedian(value, m),
  };
}

type RichBiz = {
  artifact: BusinessArtifact;
  social: SocialRecord;
};

/**
 * Compute peer comparisons for a single business against its family.
 * Pass the full set of rich businesses (artifact + social joined) so
 * the function can reach into TikTok and IG metrics directly.
 */
export function computeFamilyMetricStats(
  current: RichBiz,
  all: RichBiz[],
): FamilyMetricStats {
  const fam = familyForBusinessCategory(current.artifact.business.category);
  const familyMembers = all.filter(
    (b) =>
      familyForBusinessCategory(b.artifact.business.category).key === fam.key,
  );
  const scope = pickPeerScope<RichBiz>({
    selfPrimary: current.artifact.meta.categoryName || null,
    selfFamilyKey: fam.key,
    selfFamilyLabel: fam.label,
    familyMembers,
    primaryOf: (b) => b.artifact.meta.categoryName || null,
    isSelf: (b) => b.artifact.business.slug === current.artifact.business.slug,
  });
  const family = scope.peers;
  const familyShort = scope.shortLabel;

  // ----- review count
  const reviewCounts = family.map(
    (b) => b.artifact.business.google_review_count ?? 0,
  );
  const reviewCount = buildStat(
    current.artifact.business.google_review_count ?? 0,
    reviewCounts,
    familyShort,
  );

  // ----- rating (1.0 to 5.0, scale up for readability)
  const ratings = family.map((b) => b.artifact.business.google_rating ?? 0);
  const rating = buildStat(
    current.artifact.business.google_rating ?? 0,
    ratings,
    familyShort,
  );

  // ----- 5-star percent (0-100)
  // When reviewsDistribution is null on the business_signals row, we have
  // no signal. The ratio is unknown, not zero. The renderer (StrengthsAndGaps
  // and RowPeerStat) used to display "0% five-star" in that case, which is
  // mathematically impossible on a 4.3-star business with thousands of
  // reviews. We now return a familySize=0 stat that downstream filters
  // (`familySize > 1` in pickStrengthsAndGaps) drop entirely, matching the
  // pattern already used for unmeasured IG metrics.
  const currentDist = current.artifact.meta.reviewsDistribution;
  const currentDistMeasured = currentDist !== null && currentDist !== undefined;
  let fiveStarPct: MetricStat;
  if (!currentDistMeasured) {
    fiveStarPct = {
      value: 0,
      median: 0,
      top: 0,
      rank: 0,
      familySize: 0,
      label: `Five-star ratio not measured`,
      pctVsMedian: null,
    };
  } else {
    // Only include family members with a measured distribution in the
    // peer set, so the median is not pulled to zero by missing data.
    const fiveStarPcts = family
      .filter((b) => b.artifact.meta.reviewsDistribution !== null && b.artifact.meta.reviewsDistribution !== undefined)
      .map((b) => {
        const total = b.artifact.business.google_review_count ?? 0;
        const five = b.artifact.meta.reviewsDistribution?.fiveStar ?? 0;
        return total > 0 ? Math.round((five / total) * 100) : 0;
      });
    const currentTotal = current.artifact.business.google_review_count ?? 0;
    const currentFive = currentDist?.fiveStar ?? 0;
    fiveStarPct = buildStat(
      currentTotal > 0 ? Math.round((currentFive / currentTotal) * 100) : 0,
      fiveStarPcts,
      familyShort,
    );
  }

  // ----- IG metrics
  // Family members without a measured IG snapshot are excluded from the
  // IG peer set rather than zero-filled. Zero-filling let one calibration
  // business in a family of mostly-unmeasured peers register as "Top of
  // Family on Posting cadence / Audience / Engagement" against a wall of
  // zeros, producing verdict copy like "5.6x the family typical" from
  // five null neighbors. The peer set is now only the businesses we
  // actually observed.
  const igMeasured = family.filter((b) => b.social.ig);
  const currentIgMeasured = Boolean(current.social.ig);
  const buildIgStat = (
    value: number,
    familyValues: number[],
  ): MetricStat => {
    if (!currentIgMeasured) {
      // Setting familySize=0 makes pickStrengthsAndGaps drop the metric
      // entirely (it filters on familySize > 1). The card simply won't
      // show an IG strength or gap line for businesses we haven't scraped.
      return {
        value: 0,
        median: 0,
        top: 0,
        rank: 0,
        familySize: 0,
        label: `Not yet measured in ${familyShort}`,
        pctVsMedian: null,
      };
    }
    return buildStat(value, familyValues, familyShort);
  };

  // ----- IG posts in last 30 days
  const igPosts = igMeasured.map((b) => b.social.ig!.posts_30d ?? 0);
  const igPosts30d = buildIgStat(current.social.ig?.posts_30d ?? 0, igPosts);

  // ----- IG followers
  const igFollowersAll = igMeasured.map((b) => b.social.ig!.followers ?? 0);
  const igFollowers = buildIgStat(
    current.social.ig?.followers ?? 0,
    igFollowersAll,
  );

  // ----- IG engagement rate (basis points to avoid float ranking weirdness)
  const igEngagementAll = igMeasured.map((b) =>
    Math.round((b.social.ig!.avg_engagement_rate ?? 0) * 10000),
  );
  const igEngagement = buildIgStat(
    Math.round((current.social.ig?.avg_engagement_rate ?? 0) * 10000),
    igEngagementAll,
  );

  // ----- TikTok unique creators (90-day, post-strict-filter)
  const tiktokCreatorsAll = family.map(
    (b) => b.social.tiktok_mentions?.unique_creators ?? 0,
  );
  const tiktokCreators = buildStat(
    current.social.tiktok_mentions?.unique_creators ?? 0,
    tiktokCreatorsAll,
    familyShort,
  );

  // ----- TikTok total plays
  const tiktokPlaysAll = family.map(
    (b) => b.social.tiktok_mentions?.total_plays ?? 0,
  );
  const tiktokPlays = buildStat(
    current.social.tiktok_mentions?.total_plays ?? 0,
    tiktokPlaysAll,
    familyShort,
  );

  return {
    reviewCount,
    rating,
    fiveStarPct,
    igPosts30d,
    igFollowers,
    igEngagement,
    tiktokCreators,
    tiktokPlays,
    familyLabel: scope.label,
    familyShort,
  };
}

/**
 * Pick the top "strengths" and "gaps" for a business: metrics where
 * they rank in the top 25% of family (strengths) and bottom 25%
 * (gaps). Used by the Strengths-and-Gaps summary card.
 *
 * For small families (3-5 members) the percentile-based bucketing
 * collapses to "rank 1 = strength, last rank = gap." That's fine
 * editorially. The card explicitly references the family ("Top of
 * Sweets") so the magnitude is unambiguous.
 */
export type Highlight = {
  label: string;
  metricKey: keyof FamilyMetricStats;
  stat: MetricStat;
};

const HIGHLIGHT_LABELS: Record<string, string> = {
  reviewCount: "Review volume",
  rating: "Star rating",
  fiveStarPct: "Five-star ratio",
  igPosts30d: "Posting cadence",
  igFollowers: "Instagram audience",
  igEngagement: "Post engagement",
  tiktokCreators: "Creators filming",
  tiktokPlays: "TikTok reach",
};

export function pickStrengthsAndGaps(
  stats: FamilyMetricStats,
): { strengths: Highlight[]; gaps: Highlight[] } {
  const keys: (keyof FamilyMetricStats)[] = [
    "reviewCount",
    "rating",
    "fiveStarPct",
    "igPosts30d",
    "igFollowers",
    "igEngagement",
    "tiktokCreators",
    "tiktokPlays",
  ];

  const items: Highlight[] = keys
    .map((k) => {
      const s = stats[k] as MetricStat;
      return s
        ? { label: HIGHLIGHT_LABELS[k] ?? k, metricKey: k, stat: s }
        : null;
    })
    .filter((x): x is Highlight => x !== null && x.stat.familySize > 1);

  // Strengths: rank within top quartile (or rank 1 in small families)
  const strengthThreshold = (size: number) => Math.max(1, Math.ceil(size / 4));
  const gapThreshold = (size: number) => Math.max(1, Math.ceil(size / 4));

  const strengths = items
    .filter((i) => i.stat.rank <= strengthThreshold(i.stat.familySize))
    // Skip gap-edge cases where value is literally 0 (no signal at all)
    .filter((i) => i.stat.value > 0)
    .sort((a, b) => a.stat.rank - b.stat.rank)
    .slice(0, 3);

  const gaps = items
    .filter(
      (i) =>
        i.stat.rank >= i.stat.familySize - gapThreshold(i.stat.familySize) + 1,
    )
    .sort((a, b) => b.stat.rank - a.stat.rank)
    .slice(0, 3);

  return { strengths, gaps };
}
