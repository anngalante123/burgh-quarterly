import { AnimatedValue } from "@/components/motion/AnimatedValue";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

/**
 * AtAGlance, compact 5-row stat card for the hero zone. Each row shows
 * a metric, a value, and a tight delta or qualifier. ONE row gets the
 * `← FOCUS HERE` purple highlight, the metric the reader should pay
 * attention to first (the lowest-leverage signal in most cases).
 *
 * Pattern pulled from a reference Anna shared 2026-04-25, the goal is to
 * collapse the prior 4-block stack (TLDR + ScoreHero + Subscores +
 * Trend) into one scannable card a reader can read in 5 seconds.
 */

export type GlanceRow = {
  /** "Google rating", "Review volume", etc. */
  label: string;
  /** Big bold value. Pre-formatted (e.g. "4.7★", "314", "47.9%"). */
  value: string;
  /** Tight delta or qualifier. e.g. "+0.1 vs Q4", "Ahead of family", "9 below peers". */
  delta?: string;
  /** When true, this row gets the FOCUS HERE highlight. */
  focus?: boolean;
};

type Props = {
  rows: GlanceRow[];
};

export function AtAGlance({ rows }: Props) {
  return (
    <Reveal as="section" className="block">
      <div className="border border-brand-black/20 bg-white/70 p-5 md:p-7 rounded-lg">
        <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-4">
          At a glance
        </p>
        <dl className="divide-y divide-brand-black/10">
          {rows.map((row) => (
            <div
              key={row.label}
              className={cn(
                "grid grid-cols-[1fr_auto] items-baseline gap-3 py-3 md:py-4 first:pt-0 last:pb-0 -mx-2 px-2",
                row.focus && "bg-brand-purple text-brand-lavender rounded-md",
              )}
            >
              <dt
                className={cn(
                  "font-body text-sm md:text-base",
                  row.focus
                    ? "text-brand-lavender"
                    : "text-brand-black/85",
                )}
              >
                {row.label}
                {row.focus && (
                  <span className="ml-2 font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-brand-lime">
                    ← Focus here
                  </span>
                )}
              </dt>
              <dd className="flex items-baseline gap-2 text-right whitespace-nowrap">
                <AnimatedValue
                  value={row.value}
                  className={cn(
                    "font-display text-xl md:text-2xl font-black tabular-nums leading-none",
                    row.focus ? "text-brand-lavender" : "text-brand-black",
                  )}
                />
                {row.delta && (
                  <span
                    className={cn(
                      "font-body text-[0.7rem] md:text-xs tabular-nums",
                      row.focus
                        ? "text-brand-lime"
                        : "text-brand-black/55",
                    )}
                  >
                    {row.delta}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Reveal>
  );
}

export default AtAGlance;
