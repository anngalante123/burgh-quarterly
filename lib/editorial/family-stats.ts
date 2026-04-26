import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";
import { familyForCategory } from "@/lib/data/category-family";

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
  /** Short editorial label, e.g. "Top of Sweets" / "Above Sweets median" / "Below Sweets median" / "Bottom of Sweets". */
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
  if (rank <= Math.ceil(familySize / 2)) return `Above ${familyShort} median`;
  return `Below ${familyShort} median`;
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
  const fam = familyForCategory(current.artifact.meta.categoryName);
  const familyShort = fam.label.replace(/^Pittsburgh\s+/, "");

  const family = all.filter(
    (b) => familyForCategory(b.artifact.meta.categoryName).key === fam.key,
  );

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
  const fiveStarPcts = family.map((b) => {
    const total = b.artifact.business.google_review_count ?? 0;
    const five = b.artifact.meta.reviewsDistribution?.fiveStar ?? 0;
    return total > 0 ? Math.round((five / total) * 100) : 0;
  });
  const currentTotal = current.artifact.business.google_review_count ?? 0;
  const currentFive = current.artifact.meta.reviewsDistribution?.fiveStar ?? 0;
  const fiveStarPct = buildStat(
    currentTotal > 0 ? Math.round((currentFive / currentTotal) * 100) : 0,
    fiveStarPcts,
    familyShort,
  );

  // ----- IG posts in last 30 days
  const igPosts = family.map((b) => b.social.ig?.posts_30d ?? 0);
  const igPosts30d = buildStat(
    current.social.ig?.posts_30d ?? 0,
    igPosts,
    familyShort,
  );

  // ----- IG followers
  const igFollowersAll = family.map((b) => b.social.ig?.followers ?? 0);
  const igFollowers = buildStat(
    current.social.ig?.followers ?? 0,
    igFollowersAll,
    familyShort,
  );

  // ----- IG engagement rate (basis points to avoid float ranking weirdness)
  const igEngagementAll = family.map((b) =>
    Math.round((b.social.ig?.avg_engagement_rate ?? 0) * 10000),
  );
  const igEngagement = buildStat(
    Math.round((current.social.ig?.avg_engagement_rate ?? 0) * 10000),
    igEngagementAll,
    familyShort,
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
    familyLabel: fam.label,
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
  reviewCount: "Review depth",
  rating: "Star rating",
  fiveStarPct: "Five-star ratio",
  igPosts30d: "Instagram cadence",
  igFollowers: "Instagram followers",
  igEngagement: "Engagement rate",
  tiktokCreators: "Creators filming",
  tiktokPlays: "TikTok plays",
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
