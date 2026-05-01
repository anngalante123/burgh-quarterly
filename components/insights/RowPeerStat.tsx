import type { MetricStat } from "@/lib/editorial/family-stats";
import { cn } from "@/lib/utils";

/**
 * RowPeerStat, a compact "vs the family median" comparison strip that
 * sits at the top of an expanded AtAGlance row so the reader gets
 * peer context before the deep editorial detail.
 *
 * Renders:
 *   [LABEL]  ·  this value  vs  family median  ·  rank-in-family label
 *
 * Used inside the rank, reviews, creator reach, and IG cadence rows.
 * Keep visual weight low so it doesn't compete with the row's main
 * editorial content (peer plot, review voice, etc.).
 */

type Props = {
  /** Display label for the metric, e.g. "Review depth", "Creator coverage". */
  label: string;
  /** This business's value, pre-formatted as a string. */
  thisValue: string;
  /** Family median, pre-formatted. */
  familyMedian: string;
  /** Family-rank label from MetricStat.label. */
  rankLabel: string;
  /** Optional percent-vs-median for tone control. */
  pctVsMedian?: number | null;
  /** Optional family short name like "Sweets" for the strip headline. */
  familyShort: string;
};

export function RowPeerStat({
  label,
  thisValue,
  familyMedian,
  rankLabel,
  pctVsMedian,
  familyShort,
}: Props) {
  const above =
    pctVsMedian !== undefined && pctVsMedian !== null && pctVsMedian > 0;
  const below =
    pctVsMedian !== undefined && pctVsMedian !== null && pctVsMedian < 0;
  return (
    <div
      className={cn(
        "border border-brand-black/15 bg-white/70 px-4 py-3 md:px-5 md:py-4 mb-6",
        "flex flex-wrap items-baseline gap-x-4 gap-y-2",
      )}
    >
      <span className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-brand-purple">
        {label} · vs {familyShort}
      </span>
      <span className="font-display text-base md:text-lg font-black tabular-nums text-brand-black">
        {thisValue}
      </span>
      <span className="font-body text-xs md:text-sm text-brand-black/55">
        industry typical: {familyMedian}
      </span>
      <span
        className={cn(
          "font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] px-2 py-0.5",
          above
            ? "bg-brand-lime text-brand-black"
            : below
              ? "bg-brand-purple/15 text-brand-purple"
              : "bg-brand-cream text-brand-black/65",
        )}
      >
        {rankLabel}
      </span>
    </div>
  );
}

export default RowPeerStat;

/** Helpers to format common metric values consistently. */
export function fmtPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M plays`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K plays`;
  return `${n.toLocaleString()} plays`;
}

export function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K followers`;
  return `${n.toLocaleString()} followers`;
}

export function fmtReviewCount(n: number): string {
  return `${n.toLocaleString()} reviews`;
}

/** Convert a MetricStat into a value string formatted for the metric type. */
export function fmtStatValue(value: number, kind: string): string {
  if (kind === "rating") return `${value.toFixed(1)}★`;
  if (kind === "fiveStarPct") return `${value}% five-star`;
  if (kind === "igEngagement") return `${(value / 100).toFixed(2)}% engagement`;
  if (kind === "igPosts30d") return `${value} posts/30d`;
  if (kind === "tiktokPlays") return fmtPlays(value);
  if (kind === "tiktokCreators") return `${value} creators`;
  if (kind === "igFollowers") return fmtFollowers(value);
  if (kind === "reviewCount") return fmtReviewCount(value);
  return value.toLocaleString();
}
