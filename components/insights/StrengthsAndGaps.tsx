import { Reveal } from "@/components/motion/Reveal";
import type { Highlight } from "@/lib/editorial/family-stats";
import {
  comparisonPhrase,
  fmtVerdict,
  gapCopy,
  strengthCopy,
} from "@/lib/editorial/verdict-copy";

/**
 * StrengthsAndGaps, the "what's working / what's lagging" card on
 * each business scorecard. Sits above the AtAGlance accordion as a
 * fast read of where this business beats its family peers and where
 * it trails them.
 *
 * Strengths: top 25% of family on the metric (or rank 1 in small
 * families). Gaps: bottom 25%. Items each name the metric, the
 * business's value, and the family-rank label ("Top of Sweets").
 */

type Props = {
  strengths: Highlight[];
  gaps: Highlight[];
  familyShort: string;
};

export function StrengthsAndGaps({ strengths, gaps, familyShort }: Props) {
  if (strengths.length === 0 && gaps.length === 0) return null;
  return (
    <Reveal as="section" className="block">
      {/* Section header treats Strengths/Gaps as the editorial verdict,
          not as connective tissue. Per visual-storytelling-coach review,
          elevates this card from footnote to peer-of-the-AtAGlance card. */}
      <div className="border-b-2 border-brand-black pb-3 mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-brand-black">
          The Verdict, vs Pittsburgh {familyShort}
        </h2>
        <span className="font-body text-[0.7rem] uppercase tracking-[0.14em] text-brand-black/50">
          What is and isn&apos;t working
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {strengths.length > 0 && (
          <div className="bg-brand-lime/15 border-t-4 border-brand-black border-l border-r border-b border-brand-black/10 px-5 py-5 md:px-6 md:py-5">
            <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-brand-black mb-4">
              Doing well
            </p>
            <ul className="space-y-3.5">
              {strengths.map((h, i) => (
                <li
                  key={h.metricKey}
                  className="verdict-row flex items-baseline gap-3"
                  style={{ ["--row-delay" as string]: `${i * 80}ms` }}
                >
                  <span
                    aria-hidden="true"
                    className="font-display text-base leading-none text-brand-black"
                  >
                    ▲
                  </span>
                  <span className="flex-1">
                    <span className="flex items-baseline justify-between gap-3 mb-0.5">
                      <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
                        {h.label}
                      </span>
                      <span className="font-display text-base md:text-lg font-black tabular-nums text-brand-black leading-none">
                        {fmtVerdict(h.stat.value, h.metricKey as string)}
                      </span>
                    </span>
                    <span className="block font-body text-[0.68rem] uppercase tracking-[0.1em] text-brand-black/45 mb-1">
                      {comparisonPhrase(h.stat.label, h.stat.pctVsMedian)}
                    </span>
                    <span className="block font-body text-sm text-brand-black/75 leading-snug">
                      {strengthCopy(h)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-brand-purple/8 border-t-4 border-brand-purple border-l border-r border-b border-brand-purple/25 px-5 py-5 md:px-6 md:py-5">
            <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-brand-purple mb-4">
              Room to run
            </p>
            {gaps.length === 0 && (
              <p className="font-body text-sm md:text-base text-brand-black/80 leading-snug">
                Outperforming Pittsburgh {familyShort} on every metric we
                track. No gaps flagged this issue.
              </p>
            )}
            {gaps.length > 0 && (
            <>
            <ul className="space-y-3.5">
              {gaps.map((h, i) => (
                <li
                  key={h.metricKey}
                  className="verdict-row flex items-baseline gap-3"
                  style={{ ["--row-delay" as string]: `${i * 80}ms` }}
                >
                  <span
                    aria-hidden="true"
                    className="font-display text-base leading-none text-brand-purple"
                  >
                    ▼
                  </span>
                  <span className="flex-1">
                    <span className="flex items-baseline justify-between gap-3 mb-0.5">
                      <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
                        {h.label}
                      </span>
                      <span className="font-display text-base md:text-lg font-black tabular-nums text-brand-black leading-none">
                        {fmtVerdict(h.stat.value, h.metricKey as string)}
                      </span>
                    </span>
                    <span className="block font-body text-[0.68rem] uppercase tracking-[0.1em] text-brand-black/45 mb-1">
                      {h.stat.value === 0
                        ? `${h.stat.label} · zero this quarter`
                        : comparisonPhrase(h.stat.label, h.stat.pctVsMedian)}
                    </span>
                    <span className="block font-body text-sm text-brand-black/75 leading-snug">
                      {gapCopy(h)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            </>
            )}
          </div>
      </div>
    </Reveal>
  );
}

export default StrengthsAndGaps;
