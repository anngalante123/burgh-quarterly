/**
 * Social trend, derived from current-issue signals.
 *
 * Issue 01 has no period-over-period rank history, so trend is computed
 * from the data we DO have:
 *   - 90-day review count delta (Dec to Apr)
 *   - Instagram cadence (posts_30d)
 *   - TikTok creator pickup (unique_creators, total_plays)
 *
 * Once Issue 02 ships and we have real rank trajectory, this can be
 * replaced with rank delta. The 4 buckets stay the same.
 */

export type SocialTrend = {
  bucket: "on_a_tear" | "citys_talking" | "quiet_quarter" | "losing_ground";
  label: string;
  reason: string;
};

type Inputs = {
  igPosts30d: number | null;
  igLastPostDaysAgo: number | null;
  tiktokUniqueCreators: number;
  tiktokTotalPlays: number;
  reviewDelta90d: number | null;
};

export function computeSocialTrend(inputs: Inputs): SocialTrend {
  const igActive = (inputs.igPosts30d ?? 0) >= 4;
  const igDormant =
    (inputs.igPosts30d ?? 0) === 0 ||
    (inputs.igLastPostDaysAgo !== null && inputs.igLastPostDaysAgo > 30);
  const tiktokHot = inputs.tiktokUniqueCreators >= 10;
  const tiktokQuiet = inputs.tiktokUniqueCreators <= 3;
  const reviewsGrowing = (inputs.reviewDelta90d ?? 0) >= 20;
  const reviewsFlat = (inputs.reviewDelta90d ?? 0) < 5;

  // 1. ON A TEAR, business is doing the work and the city is responding.
  if (igActive && reviewsGrowing) {
    return {
      bucket: "on_a_tear",
      label: "On a tear",
      reason: "Posting consistently and the reviews are following.",
    };
  }

  // 2. CITY'S TALKING, the most common pattern on this index, creators are
  // filming, the business is silent.
  if (tiktokHot && igDormant) {
    return {
      bucket: "citys_talking",
      label: "City's talking",
      reason: `${inputs.tiktokUniqueCreators} creators filming on TikTok, the business hasn't posted back.`,
    };
  }

  // 3. LOSING GROUND, nothing is working.
  if (igDormant && tiktokQuiet && reviewsFlat) {
    return {
      bucket: "losing_ground",
      label: "Losing ground",
      reason: "Social is dormant, creators aren't picking it up, reviews are flat.",
    };
  }

  // 4. QUIET QUARTER, the default middle, some signals up, some flat.
  return {
    bucket: "quiet_quarter",
    label: "Quiet quarter",
    reason: igActive
      ? "Posting cadence is holding, but the conversation isn't growing."
      : reviewsGrowing
        ? "Reviews are growing, social hasn't caught up."
        : "Mixed signals. Watch the next issue.",
  };
}
