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

const STRENGTH_COPY: Record<string, string> = {
  igEngagement:
    "Followers aren't scrolling past — they comment, save, and share. The room is awake.",
  igFollowers:
    "The Instagram audience is real and built. Reach lands wider than industry peers.",
  igPosts30d:
    "Cadence is consistent. The feed shows up in followers' grids week after week.",
  reviewCount:
    "Review traffic is heavy. Discovery via Google Maps search is doing its job.",
  rating:
    "The product holds up. Customers leave with a clean rating, quarter after quarter.",
  fiveStarPct:
    "Reviews skew strongly five-star. The signal is clean — not gamed, not padded.",
  tiktokPlays:
    "TikTok creators built reach here without you running an account.",
  tiktokCreators:
    "Pittsburgh creators are filming here unprompted — that's earned attention.",
};

const GAP_COPY: Record<string, string> = {
  igEngagement:
    "Posts go out, but the room doesn't talk back. Comments per post sit below peers.",
  igFollowers:
    "The audience is small for the category. Family peers carry multiples of the reach.",
  igPosts30d:
    "The feed is quiet. Posting cadence trails the industry — followers may forget you exist.",
  reviewCount:
    "Review volume is light. Search-driven discovery loses to peers carrying 2–4× the count.",
  rating:
    "The rating sits below industry. A few low-star reviews are pulling the average down.",
  fiveStarPct:
    "Five-star ratio lags the industry — too many three- and four-stars relative to peers.",
  tiktokPlays:
    "No TikTok footprint to speak of yet. Peers are pulling views you're not.",
  tiktokCreators:
    "No creators are filming here. The kind of organic on-camera moment peers get.",
};

export function strengthCopy(h: Highlight): string {
  return STRENGTH_COPY[h.metricKey as string] ?? "";
}

export function gapCopy(h: Highlight): string {
  return GAP_COPY[h.metricKey as string] ?? "";
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
