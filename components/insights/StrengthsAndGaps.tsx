import { Reveal } from "@/components/motion/Reveal";
import type { Highlight } from "@/lib/editorial/family-stats";

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

function fmt(value: number, key: string): string {
  if (key === "rating") return `${value.toFixed(1)}★`;
  if (key === "fiveStarPct") return `${value}% five-star`;
  if (key === "igEngagement") return `${(value / 100).toFixed(2)}% engagement`;
  if (key === "igPosts30d") return `${value} posts / 30d`;
  if (key === "tiktokPlays") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M plays`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K plays`;
    return `${value} plays`;
  }
  if (key === "tiktokCreators") return `${value} creators`;
  if (key === "igFollowers") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M followers`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K followers`;
    return `${value} followers`;
  }
  if (key === "reviewCount") return `${value.toLocaleString()} reviews`;
  return value.toLocaleString();
}

export function StrengthsAndGaps({ strengths, gaps, familyShort }: Props) {
  if (strengths.length === 0 && gaps.length === 0) return null;
  return (
    <Reveal as="section" className="block">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        {strengths.length > 0 && (
          <div className="bg-brand-lime/30 border border-brand-black/15 px-5 py-4 md:px-6 md:py-5">
            <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-brand-black/70 mb-3">
              Doing well · vs {familyShort}
            </p>
            <ul className="space-y-2.5">
              {strengths.map((h) => (
                <li key={h.metricKey} className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="font-display text-lg leading-none text-brand-black"
                  >
                    ▲
                  </span>
                  <span className="flex-1">
                    <span className="block font-display text-sm md:text-base font-black uppercase tracking-[-0.005em] text-brand-black leading-tight">
                      {h.label}, {fmt(h.stat.value, h.metricKey as string)}
                    </span>
                    <span className="font-body text-xs text-brand-black/65">
                      {h.stat.label}
                      {h.stat.pctVsMedian !== null && h.stat.pctVsMedian > 0
                        ? ` · ${h.stat.pctVsMedian}% above median`
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gaps.length > 0 && (
          <div className="bg-brand-purple/15 border border-brand-purple/40 px-5 py-4 md:px-6 md:py-5">
            <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-brand-purple mb-3">
              Room to run · vs {familyShort}
            </p>
            <ul className="space-y-2.5">
              {gaps.map((h) => (
                <li key={h.metricKey} className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="font-display text-lg leading-none text-brand-purple"
                  >
                    ▼
                  </span>
                  <span className="flex-1">
                    <span className="block font-display text-sm md:text-base font-black uppercase tracking-[-0.005em] text-brand-black leading-tight">
                      {h.label}, {fmt(h.stat.value, h.metricKey as string)}
                    </span>
                    <span className="font-body text-xs text-brand-black/65">
                      {h.stat.label}
                      {h.stat.pctVsMedian !== null && h.stat.pctVsMedian < 0
                        ? ` · ${Math.abs(h.stat.pctVsMedian)}% below median`
                        : h.stat.value === 0
                          ? " · zero this quarter"
                          : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Reveal>
  );
}

export default StrengthsAndGaps;
