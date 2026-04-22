import { PreviewBadge } from "./PreviewBadge";

/**
 * SocialTrend — 4-quarter trend chart of a business's public signals.
 *
 * Hand-rolled SVG (no `recharts`, no `@visx/visx`) — we only need one small
 * chart with two paths (reviews + rating), and the editorial restraint of
 * a single-line-weight chart is more on-brand than a charting library's
 * default flourishes.
 *
 * Single-data-point state: when `history.length === 1`, we render a
 * tracking-started card with the copy:
 *   "Tracking from today. Full trend arrives in the next issue."
 *
 * Visual treatment:
 *   - Review count on the left Y axis, plotted in brand-purple
 *   - Rating on the right Y axis, plotted in brand-black dotted
 *   - Labels are quarter short-codes (e.g. "Sp26")
 *   - Dots on each data point. Final-point dot gets the lime accent ring.
 */

export type TrendPoint = {
  quarter: string; // e.g. "2025-Sp", "2025-Su", "2025-Fa", "2025-Wi", "2026-Sp"
  reviewCount: number;
  rating: number; // 0-5
  followers?: number;
  postCadence?: number;
};

type SocialTrendProps = {
  history?: TrendPoint[];
};

const DEFAULT_HISTORY: TrendPoint[] = [
  { quarter: "Sp25", reviewCount: 1058, rating: 4.8 },
  { quarter: "Su25", reviewCount: 1139, rating: 4.8 },
  { quarter: "Fa25", reviewCount: 1212, rating: 4.8 },
  { quarter: "Sp26", reviewCount: 1294, rating: 4.8 },
];

// Chart dimensions (viewBox — actual render is responsive).
const CHART_W = 560;
const CHART_H = 180;
const PADDING = { top: 18, right: 40, bottom: 28, left: 40 };

export function SocialTrend({
  history = DEFAULT_HISTORY,
}: SocialTrendProps) {
  const singlePoint = history.length === 1;

  if (singlePoint) {
    const point = history[0];
    return (
      <section
        aria-label="Social trend"
        className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
      >
        <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-5 gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
              Trend
            </h3>
            <PreviewBadge />
          </div>
          <p className="font-body text-xs text-brand-black/55">
            {point.quarter}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand-black/55">
              Reviews
            </p>
            <p className="mt-1 font-display text-3xl font-black tabular-nums text-brand-black">
              {point.reviewCount.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand-black/55">
              Rating
            </p>
            <p className="mt-1 font-display text-3xl font-black tabular-nums text-brand-black">
              {point.rating.toFixed(1)}
            </p>
          </div>
        </div>
        <p className="mt-5 max-w-md font-body text-sm text-brand-black/70 leading-relaxed">
          Tracking from today. Full trend arrives in the next issue.
        </p>
      </section>
    );
  }

  // Build chart geometry.
  const innerW = CHART_W - PADDING.left - PADDING.right;
  const innerH = CHART_H - PADDING.top - PADDING.bottom;

  const reviews = history.map((p) => p.reviewCount);
  const ratings = history.map((p) => p.rating);
  const minR = Math.min(...reviews);
  const maxR = Math.max(...reviews);
  const minS = Math.min(...ratings, 4.0); // pin scale so flat lines aren't collapsed
  const maxS = Math.max(...ratings, 5.0);
  const rSpan = maxR - minR || 1;
  const sSpan = maxS - minS || 1;

  const x = (i: number) =>
    PADDING.left + (history.length === 1 ? innerW / 2 : (i / (history.length - 1)) * innerW);
  const yReviews = (v: number) =>
    PADDING.top + innerH - ((v - minR) / rSpan) * innerH;
  const yRating = (v: number) =>
    PADDING.top + innerH - ((v - minS) / sSpan) * innerH;

  const reviewPath = history
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yReviews(p.reviewCount).toFixed(1)}`)
    .join(" ");
  const ratingPath = history
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yRating(p.rating).toFixed(1)}`)
    .join(" ");

  const latest = history[history.length - 1];

  return (
    <section
      aria-label="Social trend"
      className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-5 gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
            Trend
          </h3>
          <PreviewBadge />
        </div>
        <p className="font-body text-xs text-brand-black/55">
          {history.length} quarters
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-3 h-[2px] bg-brand-purple"
          />
          <span className="font-body text-[0.7rem] uppercase tracking-[0.14em] text-brand-black/65">
            Reviews
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block w-3 h-[2px]"
            style={{
              background:
                "repeating-linear-gradient(90deg, #0F0F0F 0 3px, transparent 3px 6px)",
            }}
          />
          <span className="font-body text-[0.7rem] uppercase tracking-[0.14em] text-brand-black/65">
            Rating
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`Trend chart — review count and rating over ${history.length} quarters`}
        className="w-full h-auto"
      >
        {/* Horizontal baseline */}
        <line
          x1={PADDING.left}
          x2={CHART_W - PADDING.right}
          y1={PADDING.top + innerH}
          y2={PADDING.top + innerH}
          stroke="#0F0F0F"
          strokeOpacity={0.15}
          strokeWidth={1}
        />

        {/* Review path (brand purple, solid) */}
        <path
          d={reviewPath}
          fill="none"
          stroke="#AB35EE"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Rating path (brand black, dotted) */}
        <path
          d={ratingPath}
          fill="none"
          stroke="#0F0F0F"
          strokeWidth={1.5}
          strokeDasharray="3 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots + x-axis labels */}
        {history.map((p, i) => {
          const isLast = i === history.length - 1;
          const cx = x(i);
          return (
            <g key={p.quarter}>
              {isLast && (
                <circle
                  cx={cx}
                  cy={yReviews(p.reviewCount)}
                  r={8}
                  fill="#C6F432"
                  fillOpacity={0.9}
                />
              )}
              <circle
                cx={cx}
                cy={yReviews(p.reviewCount)}
                r={3.5}
                fill="#AB35EE"
              />
              <circle
                cx={cx}
                cy={yRating(p.rating)}
                r={2.5}
                fill="#0F0F0F"
              />
              <text
                x={cx}
                y={CHART_H - 8}
                textAnchor="middle"
                className="fill-brand-black/55 font-body"
                fontSize={10}
              >
                {p.quarter}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="mt-2 font-body text-xs text-brand-black/60">
        Latest: {latest.reviewCount.toLocaleString()} reviews · {latest.rating.toFixed(1)} stars.
      </p>
    </section>
  );
}

export default SocialTrend;
