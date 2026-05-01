import type { Highlight } from "./family-stats";

/**
 * Verdict copy, the one-line editorial implication that turns a stat
 * into a story. Without this, "engagement rate, 47.9%" is just a
 * number. With it, the owner / reader knows what it means.
 *
 * Strengths and gaps each have a different read of the same metric.
 * The copy is generic-by-metric (not per-business), which is fine for
 * v1 — it's still substantive because it names a behavior, not a
 * statistic.
 */

/**
 * Multiplier phrase for a positive pctVsMedian, e.g. "5.6×",
 * "more than 2×", "a hair above". Returns null when the value
 * is too close to typical to brag about quantitatively.
 */
function aheadMultiplier(pctVsMedian: number | null): string | null {
  if (pctVsMedian === null || pctVsMedian < 15) return null;
  const mult = pctVsMedian / 100 + 1;
  if (mult >= 10) return `${Math.round(mult)}×`;
  if (mult >= 2) {
    const rounded = mult.toFixed(1).replace(/\.0$/, "");
    return `${rounded}×`;
  }
  // Small leads (1.15× to 2×): express as "X% above" instead so it
  // doesn't read as the awkward "1.3× the industry typical".
  return `${Math.round(pctVsMedian)}% above`;
}

/**
 * Multiplier phrase for a negative pctVsMedian on the gap side,
 * worded around "X× behind" or "Xth the". Returns null when too
 * close to typical to make a quantitative claim.
 */
function behindMultiplier(pctVsMedian: number | null): string | null {
  if (pctVsMedian === null || pctVsMedian > -25) return null;
  const ratio = 1 + pctVsMedian / 100; // value = ratio × typical, ratio < 1
  if (ratio <= 0.1) return "less than a tenth of";
  if (ratio <= 0.2) return "a fraction of";
  if (ratio <= 0.34) return "about a third of";
  if (ratio <= 0.55) return "roughly half of";
  if (ratio <= 0.75) return "well behind";
  return null;
}

/**
 * STRENGTH_COPY produces a quantified one-line strength sentence
 * per metric, using the actual pctVsMedian + value to inject a
 * concrete multiplier ("5.6× the industry typical") when the
 * gap is meaningful. Falls back to a softer line when the lead
 * is small enough that bragging numerically would feel forced.
 */
const STRENGTH_COPY: Record<string, (h: Highlight) => string> = {
  igEngagement: (h) => {
    const m = aheadMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `Followers comment, save, and share at ${m} the industry rate. The room is awake.`;
    }
    return "Followers aren't scrolling past — they comment, save, and share at a higher rate than peers.";
  },
  igFollowers: (h) => {
    const m = aheadMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `The Instagram audience is real and built. Reach is ${m} the industry typical.`;
    }
    return "The Instagram audience is real and built. Reach lands wider than industry peers.";
  },
  igPosts30d: (h) => {
    const m = aheadMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `Cadence is heavy — ${m} the typical posting rate for the industry. The feed shows up week after week.`;
    }
    return "Cadence is consistent. The feed shows up in followers' grids week after week.";
  },
  reviewCount: (h) => {
    const m = aheadMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `Review traffic is heavy — ${m} the volume of typical Pittsburgh peers. Google Maps discovery is working.`;
    }
    return "Review traffic is heavy. Discovery via Google Maps search is doing its job.";
  },
  rating: () =>
    "The product holds up. Customers leave with a clean rating, quarter after quarter.",
  fiveStarPct: () =>
    "Reviews skew strongly five-star. The signal is clean — not gamed, not padded.",
  tiktokPlays: (h) => {
    const m = aheadMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `TikTok creators built ${m} the typical play count for the industry. Earned reach, no account required.`;
    }
    return "TikTok creators built reach here without you running an account.";
  },
  tiktokCreators: (h) => {
    const m = aheadMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `${m} the number of creators filming here vs the typical Pittsburgh peer. That's earned attention.`;
    }
    return "Pittsburgh creators are filming here unprompted — that's earned attention.";
  },
};

const GAP_COPY: Record<string, (h: Highlight) => string> = {
  igEngagement: (h) => {
    const m = behindMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `Posts go out, but the room doesn't talk back — engagement is ${m} the industry rate.`;
    }
    return "Posts go out, but the room doesn't talk back. Comments per post sit below peers.";
  },
  igFollowers: (h) => {
    const m = behindMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `The audience is small for the category — ${m} the typical Pittsburgh peer's reach.`;
    }
    return "The audience is small for the category. Industry peers carry multiples of the reach.";
  },
  igPosts30d: (h) => {
    const m = behindMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `The feed is quiet — posting cadence is ${m} the industry rate. Followers may forget you exist.`;
    }
    return "The feed is quiet. Posting cadence trails the industry — followers may forget you exist.";
  },
  reviewCount: (h) => {
    const m = behindMultiplier(h.stat.pctVsMedian);
    if (m) {
      return `Review volume is light — ${m} the typical Pittsburgh peer's count. Search-driven discovery is losing.`;
    }
    return "Review volume is light. Search-driven discovery loses to peers carrying more reviews.";
  },
  rating: () =>
    "The rating sits below industry. A few low-star reviews are pulling the average down.",
  fiveStarPct: () =>
    "Five-star ratio lags the industry — too many three- and four-stars relative to peers.",
  tiktokPlays: () =>
    "No TikTok footprint to speak of yet. Peers are pulling views you're not.",
  tiktokCreators: () =>
    "No creators are filming here. The kind of organic on-camera moment peers get.",
};

export function strengthCopy(h: Highlight): string {
  const fn = STRENGTH_COPY[h.metricKey as string];
  return fn ? fn(h) : "";
}

export function gapCopy(h: Highlight): string {
  const fn = GAP_COPY[h.metricKey as string];
  return fn ? fn(h) : "";
}

/**
 * Format a metric value for the verdict card. Drops the redundant
 * trailing word that the label already carries — so "Post engagement"
 * + 47.9% doesn't read as "Engagement rate, 47.87% engagement".
 *
 * Compact, editorial, no over-precision.
 */
export function fmtVerdict(value: number, key: string): string {
  if (key === "rating") return `${value.toFixed(1)}★`;
  if (key === "fiveStarPct") return `${Math.round(value)}%`;
  if (key === "igEngagement") return `${(value / 100).toFixed(1)}%`;
  if (key === "igPosts30d") return `${value} / 30d`;
  if (key === "tiktokPlays") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return `${value}`;
  }
  if (key === "tiktokCreators") return `${value}`;
  if (key === "igFollowers") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return `${value}`;
  }
  if (key === "reviewCount") return value.toLocaleString();
  return value.toLocaleString();
}

/**
 * Comparison phrase: rank label + a magnitude qualifier. The
 * magnitude language uses "industry typical" instead of "median" per
 * 2026-04-30 review (which flagged "median" as jargon, "median of
 * what?"). "Family typical" reads as plain English while still
 * conveying quantitative comparison.
 *
 * Examples:
 *   "Top of Bars · more than 2× the industry typical"
 *   "#3 of 6 in Cafes · ahead of industry typical"
 *   "Bottom of Sweets · roughly half the industry typical"
 */
export function comparisonPhrase(
  rankLabel: string,
  pctVsMedian: number | null,
): string {
  if (pctVsMedian === null || pctVsMedian === 0) return rankLabel;

  const abs = Math.abs(pctVsMedian);
  let magnitude: string;
  if (pctVsMedian > 0) {
    if (abs >= 300) magnitude = `${Math.round(abs / 100 + 1)}× the industry typical`;
    else if (abs >= 100) magnitude = `more than 2× the industry typical`;
    else if (abs >= 50) magnitude = `well ahead of industry typical`;
    else if (abs >= 20) magnitude = `ahead of industry typical`;
    else magnitude = `just ahead of industry typical`;
  } else {
    if (abs >= 75) magnitude = `a fraction of industry typical`;
    else if (abs >= 50) magnitude = `roughly half industry typical`;
    else if (abs >= 25) magnitude = `well behind industry typical`;
    else magnitude = `behind industry typical`;
  }
  return `${rankLabel} · ${magnitude}`;
}
