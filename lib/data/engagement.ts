/**
 * Engagement-rate sanitization.
 *
 * Raw Apify profile scrapes produce avg_engagement_rate values with no
 * sanity bounds: the 2026-06-11 audit found 17.39 (1,739%) on a
 * 653-follower account and 100%+ rates on accounts with 1-20 followers.
 * The denominator (followers) is too small to mean anything, or the
 * scrape mis-sampled. Either way the number is not publishable and not
 * rankable.
 *
 * Policy:
 *   - Below MIN_ENGAGEMENT_FOLLOWERS the rate is statistical noise;
 *     treat as unmeasured (0).
 *   - Above MAX_CREDIBLE_ENGAGEMENT_RATE the value is a data error, not
 *     a hot account; treat as unmeasured (0) rather than capping, so a
 *     scrape artifact can never top a ranking.
 *
 * 0 is the existing "no measured engagement" sentinel across consumers
 * (category-baseline excludes non-positive rates; the UI renders the
 * empty state), so sanitized values degrade without type changes.
 */

/** Accounts below this follower count have no meaningful rate denominator. */
export const MIN_ENGAGEMENT_FOLLOWERS = 100;

/**
 * Fractional rate above which the value is treated as a scrape artifact.
 * Legitimate small-account engagement tops out well under this; the junk
 * tail observed in the audit starts at 113%.
 */
export const MAX_CREDIBLE_ENGAGEMENT_RATE = 0.3;

/**
 * Bound a fractional engagement rate against its follower denominator.
 * Returns the rate unchanged when credible, 0 when unmeasurable.
 */
export function sanitizeEngagementRate(
  rate: number | null | undefined,
  followers: number | null | undefined,
): number {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return 0;
  }
  if ((followers ?? 0) < MIN_ENGAGEMENT_FOLLOWERS) return 0;
  if (rate > MAX_CREDIBLE_ENGAGEMENT_RATE) return 0;
  return rate;
}
