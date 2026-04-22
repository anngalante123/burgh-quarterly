"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";

/**
 * SignalStrip — the "This Quarter in Signal" data-viz band on the homepage.
 *
 * Sits between the hero and the "Read" teasers, giving the homepage
 * publication weight: a tier-distribution donut, three stat cards, and a
 * category bar. Pure SVG (no chart libraries).
 *
 * Editorial rules (EDITORIAL_VOICE.md):
 *   - No raw numeric composite scores
 *   - No letter grades
 *   - No Relay mention in body copy
 *   - "Spring 2026" is acceptable when referencing the issue
 *
 * Motion: the whole block wraps in <Reveal> for the fade/translate entrance.
 * The donut arcs draw in via framer-motion stroke-dashoffset; reduced-motion
 * users see the final state with no animation.
 */

export type SignalStripProps = {
  totalScored: number;
  tierCounts: { icons: number; watch: number; staples: number };
  biggestClimber: {
    name: string;
    slug: string;
    categoryLabel: string;
    movement: string | number;
  } | null;
  topNeighborhood: { name: string; count: number };
  categoryBreakdown: Array<{ category: string; count: number }>;
};

const COLORS = {
  icons: "#C6F432", // lime
  watch: "#AB35EE", // purple
  staples: "#D97757", // terracotta
} as const;

const TIER_LABELS = {
  icons: "Icons of the Burgh",
  watch: "Ones to Watch",
  staples: "Neighborhood Staples",
} as const;

/* ------------------------------- Donut ---------------------------------- */

type DonutArc = {
  key: keyof typeof COLORS;
  value: number;
  color: string;
};

/**
 * Pure-SVG donut. Three arcs proportional to tierCounts. No chart lib.
 *
 * Math: we draw each arc as a circular stroke on a shared circle
 * (r=50, viewBox 0 0 120 120). Circumference = 2*pi*r ~= 314.159.
 * Each arc's stroke-dasharray = [arcLength, circumference - arcLength];
 * stroke-dashoffset rotates the start position.
 */
function TierDonut({
  tierCounts,
  totalScored,
}: {
  tierCounts: SignalStripProps["tierCounts"];
  totalScored: number;
}) {
  const reduced = useReducedMotion();
  const r = 50;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * r;

  const safeTotal = totalScored > 0 ? totalScored : 1;

  const arcs: DonutArc[] = [
    { key: "icons", value: tierCounts.icons, color: COLORS.icons },
    { key: "watch", value: tierCounts.watch, color: COLORS.watch },
    { key: "staples", value: tierCounts.staples, color: COLORS.staples },
  ];

  // Running offset around the circle — start at the 12 o'clock position
  // (SVG circles start at 3 o'clock by default; rotate -90deg on the group).
  let cumulative = 0;
  const segments = arcs.map((arc) => {
    const fraction = arc.value / safeTotal;
    const arcLength = fraction * circumference;
    // strokeDashoffset on each arc positions it where the previous arc ended.
    const offset = -cumulative;
    cumulative += arcLength;
    return {
      ...arc,
      arcLength,
      offset,
    };
  });

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[140px] w-[140px]">
        <svg
          viewBox="0 0 120 120"
          className="h-full w-full -rotate-90"
          aria-hidden="true"
        >
          {/* Background ring — hairline for empty space */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(15,15,15,0.08)"
            strokeWidth={16}
          />
          {segments.map((seg) => {
            const dasharray = `${seg.arcLength} ${circumference - seg.arcLength}`;
            if (reduced) {
              return (
                <circle
                  key={seg.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={16}
                  strokeDasharray={dasharray}
                  strokeDashoffset={seg.offset}
                  strokeLinecap="butt"
                />
              );
            }
            return (
              <motion.circle
                key={seg.key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={16}
                strokeDasharray={dasharray}
                strokeDashoffset={seg.offset}
                strokeLinecap="butt"
                initial={{ opacity: 0, pathLength: 0 }}
                whileInView={{ opacity: 1, pathLength: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  duration: 0.9,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            );
          })}
        </svg>
        {/* Center label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-black leading-none text-brand-black tabular-nums">
            {totalScored}
          </span>
          <span className="mt-1 font-body text-[0.6rem] uppercase tracking-[0.18em] text-brand-black/55">
            scored
          </span>
        </div>
      </div>

      {/* Legend */}
      <ul className="mt-4 space-y-1.5">
        {(Object.keys(COLORS) as Array<keyof typeof COLORS>).map((key) => {
          const count =
            key === "icons"
              ? tierCounts.icons
              : key === "watch"
                ? tierCounts.watch
                : tierCounts.staples;
          return (
            <li
              key={key}
              className="flex items-center gap-2 font-body text-xs text-brand-black/80"
            >
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COLORS[key] }}
              />
              <span className="font-medium">{TIER_LABELS[key]}</span>
              <span className="ml-auto tabular-nums text-brand-black/60">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ----------------------------- Stat Card -------------------------------- */

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="border border-brand-black/15 bg-white/60 p-4">
      <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
        {label}
      </p>
      <p className="mt-2 font-display font-black leading-tight text-brand-black tabular-nums text-[clamp(1.125rem,2.2vw,1.875rem)] [word-break:normal]">
        {value}
      </p>
      <p className="mt-1 font-body text-[0.7rem] text-brand-black/60 leading-snug">
        {sub}
      </p>
    </div>
  );
}

/* ----------------------------- Category Bar ----------------------------- */

function CategoryBar({
  breakdown,
}: {
  breakdown: SignalStripProps["categoryBreakdown"];
}) {
  const reduced = useReducedMotion();
  const max = breakdown.reduce((m, b) => Math.max(m, b.count), 0) || 1;

  return (
    <div>
      <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
        Categories scored
      </p>
      <ul className="mt-3 space-y-2">
        {breakdown.map((row) => {
          const pct = (row.count / max) * 100;
          return (
            <li
              key={row.category}
              className="grid grid-cols-[7rem_1fr_2ch] items-center gap-3 md:grid-cols-[9rem_1fr_2ch]"
            >
              <span className="font-body text-xs md:text-sm text-brand-black truncate">
                {row.category}
              </span>
              <span
                aria-hidden="true"
                className="relative block h-1.5 bg-brand-black/10 overflow-hidden"
              >
                {reduced ? (
                  <span
                    className="absolute inset-y-0 left-0 bg-brand-black"
                    style={{ width: `${pct}%` }}
                  />
                ) : (
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-brand-black"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{
                      duration: 0.8,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                )}
              </span>
              <span className="font-body text-xs tabular-nums text-brand-black/70 text-right">
                {row.count}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------- Strip ---------------------------------- */

export function SignalStrip({
  totalScored,
  tierCounts,
  topNeighborhood,
  categoryBreakdown,
}: SignalStripProps) {
  const topCategory = categoryBreakdown[0];
  const iconsRate =
    totalScored > 0
      ? Math.round((tierCounts.icons / totalScored) * 100)
      : 0;

  return (
    <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
      <div className="border-y-2 border-brand-black">
        {/* Section header — inside the rules, matches other section-header tracking */}
        <div className="flex items-baseline justify-between pt-6 md:pt-7">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
            This Quarter in Signal
          </h3>
          <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
            {totalScored} businesses scored
          </span>
        </div>

        {/* Grid: donut on left, stats + bars on right */}
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 md:gap-10 py-8 md:py-10">
          <div className="flex justify-center md:justify-start">
            <TierDonut
              tierCounts={tierCounts}
              totalScored={totalScored}
            />
          </div>

          <div className="flex flex-col gap-6 md:gap-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              <StatCard
                label="Top Neighborhood"
                value={topNeighborhood.name || "—"}
                sub={
                  topNeighborhood.count
                    ? `${topNeighborhood.count} businesses`
                    : ""
                }
              />
              <StatCard
                label="Top Category"
                value={topCategory?.category ?? "—"}
                sub={
                  topCategory
                    ? `${topCategory.count} scored`
                    : ""
                }
              />
              <StatCard
                label="Icons Rate"
                value={`${iconsRate}%`}
                sub="of scored"
              />
            </div>

            <CategoryBar breakdown={categoryBreakdown} />
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export default SignalStrip;
