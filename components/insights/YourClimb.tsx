import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

/**
 * YourClimb, hero strip showing 3 momentum charts side-by-side. For
 * Issue 01 we don't have multi-issue rank history, so we render this
 * as a "DEBUT" frame with current-quarter stats and the deltas we DO
 * have (review-count growth from Dec to Apr, current TikTok reach).
 *
 * Once Issue 02 ships, the same component will render rank trajectory
 * and pickup deltas for real.
 */

export type ClimbStat = {
  label: string;
  value: string;
  /** Sub-line under the value, e.g. "+58 in 90d", "First issue". */
  sub: string;
  /** Trend direction, controls the arrow + line color. */
  direction?: "up" | "down" | "flat" | "debut";
};

type Props = {
  /** "DEBUT" on Issue 01, "3 quarters" once we have history. */
  framing: string;
  stats: ClimbStat[];
};

const ARROW: Record<NonNullable<ClimbStat["direction"]>, string> = {
  up: "▲",
  down: "▼",
  flat: "·",
  debut: "★",
};

export function YourClimb({ framing, stats }: Props) {
  return (
    <Reveal as="section" className="block">
      <div className="bg-brand-purple text-brand-off-white px-5 py-6 md:px-8 md:py-8 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_1fr] gap-5 md:gap-8 items-center">
          <div>
            <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-off-white/65">
              {framing}
            </p>
            <p className="mt-1 font-display font-black uppercase tracking-[-0.02em] text-brand-off-white text-3xl md:text-4xl leading-[0.95]">
              Your{" "}
              <span className="bg-brand-lime text-brand-black px-2 box-decoration-clone">
                climb.
              </span>
            </p>
          </div>
          {stats.map((s, i) => {
            const dir = s.direction ?? "flat";
            const arrowColor =
              dir === "up"
                ? "text-brand-lime"
                : dir === "down"
                  ? "text-brand-cream"
                  : "text-brand-off-white/55";
            return (
              <div
                key={i}
                className="border-l-0 md:border-l border-brand-off-white/20 md:pl-6 pt-3 md:pt-0 first-of-type:border-0 first-of-type:pl-0 first-of-type:pt-0"
              >
                <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-off-white/65">
                  {s.label}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl md:text-3xl font-black tabular-nums leading-none text-brand-off-white">
                    {s.value}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "font-display text-xs tabular-nums",
                      arrowColor,
                    )}
                  >
                    {ARROW[dir]}
                  </span>
                </div>
                <p className="mt-1.5 font-body text-[0.72rem] text-brand-off-white/65">
                  {s.sub}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Reveal>
  );
}

export default YourClimb;
