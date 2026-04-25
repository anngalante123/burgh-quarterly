import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { SocialTrendPill } from "@/components/insights/SocialTrendPill";
import type { SocialTrend } from "@/lib/editorial/compute-trend";

/**
 * BusinessAtAGlance, the interactive data card that replaces the prior
 * tab structure on business pages. Each row collapses to a label + value;
 * clicking expands the row to reveal the full editorial detail for that
 * signal (peer plot, review voice, TikTok creators, IG sparkline).
 *
 * Uses native <details>/<summary> so it works without JS, is keyboard-
 * accessible by default, and degrades gracefully. The `focus` row opens
 * by default so the reader's first interaction lands on the leverage
 * point (the weakest subscore).
 *
 * The header carries a SocialTrendPill, the answer to "how is this
 * business doing on social this quarter" without needing a click.
 */

export type AtAGlanceRow = {
  key: string;
  label: string;
  value: string;
  /** Sub-line under the value (delta, qualifier). */
  delta?: string;
  /** Whether this row should be open by default. Pick the weakest signal. */
  focus?: boolean;
  /** The editorial content shown when the row is expanded. */
  expanded: ReactNode;
};

type Props = {
  businessName: string;
  rows: AtAGlanceRow[];
  trend: SocialTrend;
};

export function BusinessAtAGlance({ businessName, rows, trend }: Props) {
  return (
    <Reveal as="section" className="block">
      <div className="bg-white/70 border border-brand-black/15">
        <div className="px-5 md:px-7 py-5 md:py-6 border-b border-brand-black/15">
          <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
            The numbers · Spring 2026
          </p>
          <h2 className="mt-1.5 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-2xl md:text-3xl leading-[1] [text-wrap:balance]">
            {businessName}{" "}
            <span className="text-brand-black/40">at a glance.</span>
          </h2>
          <div className="mt-4">
            <SocialTrendPill trend={trend} />
          </div>
          <p className="mt-4 font-body text-xs text-brand-black/55">
            Tap any row to expand.
          </p>
        </div>
        <ul>
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={i > 0 ? "border-t border-brand-black/10" : ""}
            >
              <details className="group" open={!!row.focus}>
                <summary
                  className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 md:px-7 py-4 md:py-5 hover:bg-brand-cream/40 transition-colors focus-visible:outline-2 focus-visible:outline-brand-purple group-open:bg-brand-cream/30"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
                      {row.label}
                    </span>
                    <span className="font-display text-xl md:text-2xl font-black tabular-nums leading-[1.05] text-brand-black [word-break:break-word]">
                      {row.value}
                    </span>
                    {row.delta ? (
                      <span className="font-body text-xs text-brand-black/60">
                        {row.delta}
                      </span>
                    ) : null}
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border border-brand-black/20 font-display text-base text-brand-black/55 group-open:rotate-180 group-open:bg-brand-black group-open:text-brand-off-white group-open:border-brand-black transition-all"
                  >
                    ⌄
                  </span>
                </summary>
                <div className="px-5 md:px-7 pb-7 md:pb-8 pt-3 md:pt-4 border-t border-brand-black/5 bg-brand-cream/30">
                  {row.expanded}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );
}

export default BusinessAtAGlance;
