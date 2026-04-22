import { PreviewBadge } from "./PreviewBadge";
import { cn } from "@/lib/utils";

/**
 * SignalOfQuarter, "what changed this quarter."
 *
 * One bold editorial-tone statement + one supporting number/evidence
 * line + a directional glyph. Meant to be the first "insight" the eye
 * lands on after the ScoreCard, the answer to "why does this business
 * look different this quarter?"
 *
 * Direction drives a small visual cue (not a full traffic-light). We
 * keep this quiet on the business page per D-006, it's a datapoint,
 * not a headline.
 */

type Direction = "up" | "flat" | "down";

type SignalOfQuarterProps = {
  signal?: string;
  evidence?: string;
  direction?: Direction;
};

const DIRECTION_STYLES: Record<Direction, { badge: string; glyph: string; label: string }> = {
  up: {
    badge: "bg-brand-lime text-brand-black",
    glyph: "↑",
    label: "Up",
  },
  flat: {
    badge: "bg-brand-cream text-brand-black/75",
    glyph: "→",
    label: "Steady",
  },
  down: {
    badge: "bg-brand-black text-brand-off-white",
    glyph: "↓",
    label: "Down",
  },
};

export function SignalOfQuarter({
  signal = "Review velocity picked up",
  evidence = "23 new reviews in the last 30 days, 2.1x your normal pace.",
  direction = "up",
}: SignalOfQuarterProps) {
  const style = DIRECTION_STYLES[direction];
  return (
    <section
      aria-label="Signal of the quarter"
      className="border border-brand-black/15 bg-white/60 p-5 md:p-6 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
            Signal of the quarter
          </h3>
          <PreviewBadge />
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-display text-[0.65rem] font-semibold uppercase tracking-[0.14em]",
            style.badge,
          )}
        >
          <span aria-hidden="true">{style.glyph}</span>
          <span>{style.label}</span>
        </span>
      </div>

      <p className="mt-4 font-display text-xl sm:text-2xl md:text-3xl font-black tracking-[-0.01em] text-brand-black leading-[1.05] break-words">
        {signal}.
      </p>
      <p className="mt-3 font-body text-sm md:text-base text-brand-black/75 leading-relaxed max-w-prose">
        {evidence}
      </p>
    </section>
  );
}

export default SignalOfQuarter;
