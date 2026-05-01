import type { SocialTrend } from "@/lib/editorial/compute-trend";
import { cn } from "@/lib/utils";

/**
 * SocialTrendPill, a single visible pill answering "how is this business
 * doing on social right now?" Sits in the AtAGlance card header.
 *
 * Per UI/UX rule (color-not-only): each bucket carries both a unique
 * color AND a unique symbol/label so the signal survives in colorblind
 * vision and grayscale prints.
 */

const BUCKET_STYLE: Record<
  SocialTrend["bucket"],
  { bg: string; text: string; symbol: string }
> = {
  on_a_tear: {
    bg: "bg-brand-lime",
    text: "text-brand-black",
    symbol: "▲",
  },
  citys_talking: {
    bg: "bg-brand-purple",
    text: "text-brand-off-white",
    symbol: "◆",
  },
  quiet_quarter: {
    bg: "bg-brand-cream border border-brand-black/25",
    text: "text-brand-black",
    symbol: "·",
  },
  losing_ground: {
    bg: "bg-brand-black",
    text: "text-brand-off-white",
    symbol: "▼",
  },
};

type Props = {
  trend: SocialTrend;
};

export function SocialTrendPill({ trend }: Props) {
  const s = BUCKET_STYLE[trend.bucket];
  // Only "active" buckets breathe — drawing the eye to a positive signal.
  // Quiet/losing buckets stay static so the page doesn't pulse on a downer.
  const breathe =
    trend.bucket === "on_a_tear" || trend.bucket === "citys_talking";
  return (
    <div className="flex flex-col gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-2 self-start px-3 py-1.5 font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em]",
          s.bg,
          s.text,
          breathe && "trend-breathe",
        )}
      >
        <span aria-hidden="true" className="text-base leading-none">
          {s.symbol}
        </span>
        <span>This quarter, {trend.label.toLowerCase()}</span>
      </span>
      <p className="font-body text-xs text-brand-black/65 leading-snug max-w-md">
        {trend.reason}
      </p>
    </div>
  );
}

export default SocialTrendPill;
