import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";
import { familyForBusinessCategory } from "@/lib/data/category-family";

/**
 * Per-family engagement baseline, used to translate a raw IG engagement
 * rate into one of three qualitative bands for display:
 *
 *   "Above the family typical"
 *   "Typical for the family"
 *   "Quiet for the family"
 *
 * Why qualitative: per the editorial voice rules, the business pages
 * (the quiet record zone) never surface raw engagement numbers. The
 * reader gets context without becoming a numbers-watcher. The word
 * "median" is also banned in UI strings, hence "family typical" copy.
 *
 * How the baseline is built:
 *   - For each business in the cohort that has an IG snapshot, group
 *     by its editorial family (Sweets, Cafes, etc).
 *   - Within each family, compute the median of `avg_engagement_rate`.
 *     Median is robust to outliers (one viral creator, one dormant
 *     account); a trimmed mean would also work but offers no real
 *     advantage at the small family sizes we deal with (3-30 peers).
 *   - Apply 1.25x / 0.75x bands around that median to produce the
 *     three-bucket label.
 *
 * Small-family guardrail: if a family has fewer than MIN_FAMILY_SIZE
 * IG-measured businesses, the baseline isn't statistically meaningful,
 * so we collapse to "Typical for the family" rather than risk
 * mislabeling. A single dominant outlier in a family of 2 would
 * otherwise make everyone else look "Quiet" by definition.
 */

export type EngagementBand =
  | "above"
  | "typical"
  | "quiet";

export type EngagementBandLabel =
  | "Above the family typical"
  | "Typical for the family"
  | "Quiet for the family";

const LABEL_FOR_BAND: Record<EngagementBand, EngagementBandLabel> = {
  above: "Above the family typical",
  typical: "Typical for the family",
  quiet: "Quiet for the family",
};

const ABOVE_MULTIPLIER = 1.25;
const QUIET_MULTIPLIER = 0.75;
const MIN_FAMILY_SIZE = 3;

type RichBiz = {
  artifact: BusinessArtifact;
  social: SocialRecord;
};

function median(values: number[]): number {
  const sorted = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[m - 1] + sorted[m]) / 2
    : sorted[m];
}

export type FamilyBaseline = {
  familyKey: string;
  familyLabel: string;
  /** Median engagement rate across IG-measured peers in the family. Internal only, never surfaced. */
  baseline: number;
  /** Count of IG-measured businesses contributing to the baseline. */
  sampleSize: number;
};

/**
 * Build the per-family engagement baseline map from a rich-business
 * cohort. Pass the full cohort (the same one used elsewhere on the
 * page) so we get a stable city-wide baseline rather than a per-page
 * recomputation.
 */
export function computeFamilyEngagementBaselines(
  all: RichBiz[],
): Map<string, FamilyBaseline> {
  const grouped = new Map<
    string,
    { label: string; rates: number[] }
  >();

  for (const b of all) {
    const ig = b.social.ig;
    if (!ig) continue;
    const rate = ig.avg_engagement_rate;
    if (!Number.isFinite(rate) || rate <= 0) continue;

    const fam = familyForBusinessCategory(b.artifact.business.category);
    const bucket = grouped.get(fam.key) ?? { label: fam.label, rates: [] };
    bucket.rates.push(rate);
    grouped.set(fam.key, bucket);
  }

  const out = new Map<string, FamilyBaseline>();
  for (const [key, { label, rates }] of grouped.entries()) {
    out.set(key, {
      familyKey: key,
      familyLabel: label,
      baseline: median(rates),
      sampleSize: rates.length,
    });
  }
  return out;
}

/**
 * Return the qualitative engagement band for a single business.
 *
 * Returns null when:
 *   - the business has no IG data (caller should skip the bullet)
 *   - the avg_engagement_rate is missing or non-positive
 *
 * Collapses to "typical" (with an internal flag) when:
 *   - the family has fewer than MIN_FAMILY_SIZE IG-measured peers, so
 *     the baseline isn't meaningful. We still return a label so the
 *     caller can render something, but the caller can inspect
 *     `lowConfidence` to decide whether to omit it.
 */
export type EngagementBandResult = {
  band: EngagementBand;
  label: EngagementBandLabel;
  /** True when the family sample was below MIN_FAMILY_SIZE; caller may want to suppress. */
  lowConfidence: boolean;
};

export function engagementBandForBusiness(
  current: RichBiz,
  baselines: Map<string, FamilyBaseline>,
): EngagementBandResult | null {
  const ig = current.social.ig;
  if (!ig) return null;
  const rate = ig.avg_engagement_rate;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const fam = familyForBusinessCategory(current.artifact.business.category);
  const baseline = baselines.get(fam.key);

  // No baseline for this family at all (e.g. nobody in the family has
  // IG data). Treat as typical with low confidence so the caller can
  // surface or suppress as it sees fit.
  if (!baseline || baseline.baseline <= 0) {
    return { band: "typical", label: LABEL_FOR_BAND.typical, lowConfidence: true };
  }

  // Statistical-significance guardrail. Below 3 peers we don't trust
  // the baseline, fall back to "typical".
  if (baseline.sampleSize < MIN_FAMILY_SIZE) {
    return { band: "typical", label: LABEL_FOR_BAND.typical, lowConfidence: true };
  }

  if (rate >= baseline.baseline * ABOVE_MULTIPLIER) {
    return { band: "above", label: LABEL_FOR_BAND.above, lowConfidence: false };
  }
  if (rate <= baseline.baseline * QUIET_MULTIPLIER) {
    return { band: "quiet", label: LABEL_FOR_BAND.quiet, lowConfidence: false };
  }
  return { band: "typical", label: LABEL_FOR_BAND.typical, lowConfidence: false };
}

/**
 * Compact label suitable for the SocialState stat tile, where the
 * "Engagement" cell is constrained to a single short string. Uses
 * single-word descriptors rather than the full "for the family" copy.
 */
export type EngagementShortLabel = "Above" | "Typical" | "Quiet";

const SHORT_FOR_BAND: Record<EngagementBand, EngagementShortLabel> = {
  above: "Above",
  typical: "Typical",
  quiet: "Quiet",
};

export function shortEngagementLabel(
  result: EngagementBandResult | null,
): EngagementShortLabel | null {
  if (!result) return null;
  return SHORT_FOR_BAND[result.band];
}
