"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * TierProportionBar replaces the per-business dot strip on the "Where
 * you sit" section.
 *
 * One horizontal bar split into three colored zones sized proportionally
 * to the tier counts (Icons / Ones to Watch / Neighborhood Staples).
 * A single small YOU arrow + label sits above the bar at the user's
 * rank position. Counts under each zone read out the tier's size.
 *
 * Why this shape: the previous N-dot strip overlapped its own labels
 * once N exceeded ~15 and gave the reader no spatial sense of the
 * family's tier shape. The proportional bar communicates two facts at
 * once  family shape (zone widths) and your position (single arrow)
 * without naming any individual peers. The compact scoreboard below
 * supplies the named-peer view.
 *
 * Brand-compliant tier colors:
 *   icons               -> brand-lime (#C6F432)
 *   ones_to_watch       -> brand-purple (#AB35EE)
 *   neighborhood_staples -> brand-cream (#F5F8E8) with thin black ring
 */

type Tier = "icons" | "ones_to_watch" | "neighborhood_staples";

type ScoreboardPeer = {
  slug: string;
  name: string;
  rank: number;
  tier?: Tier;
};

type Props = {
  currentSlug: string;
  /** All peers in the same scope (sub-category or family fallback), in any order. */
  peers: ScoreboardPeer[];
};

const TIER_LABEL: Record<Tier, string> = {
  icons: "Icons",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Staples",
};

const TIER_BG: Record<Tier, string> = {
  icons: "bg-brand-lime",
  ones_to_watch: "bg-brand-purple",
  neighborhood_staples: "bg-brand-cream ring-1 ring-inset ring-brand-black/30",
};

const TIER_TEXT: Record<Tier, string> = {
  icons: "text-brand-black",
  ones_to_watch: "text-brand-lavender",
  neighborhood_staples: "text-brand-black",
};

export function TierProportionBar({ currentSlug, peers }: Props) {
  const [activeZone, setActiveZone] = useState<Tier | null>(null);
  const [pinnedZone, setPinnedZone] = useState<Tier | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close pinned popover on outside click or Esc.
  useEffect(() => {
    if (!pinnedZone) return;
    function onDocClick(e: MouseEvent) {
      const node = containerRef.current;
      if (!node) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        setPinnedZone(null);
        setActiveZone(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPinnedZone(null);
        setActiveZone(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinnedZone]);

  function openZone(tier: Tier) {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setActiveZone(tier);
  }

  function scheduleZoneClose() {
    if (pinnedZone) return;
    if (closeTimerRef.current !== null)
      window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setActiveZone(null);
      closeTimerRef.current = null;
    }, 120);
  }

  const total = peers.length;
  if (total === 0) return null;

  const counts: Record<Tier, number> = {
    icons: 0,
    ones_to_watch: 0,
    neighborhood_staples: 0,
  };
  const peersByTier: Record<Tier, ScoreboardPeer[]> = {
    icons: [],
    ones_to_watch: [],
    neighborhood_staples: [],
  };
  for (const p of peers) {
    if (p.tier) {
      counts[p.tier] += 1;
      peersByTier[p.tier].push(p);
    }
  }
  // Sort each tier by rank ascending so "top 3" is rank 1, 2, 3.
  (Object.keys(peersByTier) as Tier[]).forEach((t) =>
    peersByTier[t].sort((a, b) => a.rank - b.rank),
  );

  const self = peers.find((p) => p.slug === currentSlug);
  // Position the YOU arrow at the center of the cell containing rank N.
  // ((rank - 0.5) / total) maps rank=1 to a small positive offset and
  // rank=total to a position just inside the right edge.
  const arrowPct = self
    ? Math.max(0, Math.min(100, ((self.rank - 0.5) / total) * 100))
    : null;

  // Zone widths as percentages. Tiny tiers get a minimum so they remain
  // visible; we shrink Staples (always the largest) to absorb the slack.
  const MIN_ZONE = 6;
  const orderedTiers: Tier[] = ["icons", "ones_to_watch", "neighborhood_staples"];
  const rawPct: Record<Tier, number> = {
    icons: total > 0 ? (counts.icons / total) * 100 : 0,
    ones_to_watch: total > 0 ? (counts.ones_to_watch / total) * 100 : 0,
    neighborhood_staples:
      total > 0 ? (counts.neighborhood_staples / total) * 100 : 0,
  };
  const finalPct: Record<Tier, number> = { ...rawPct };
  let owe = 0;
  for (const t of orderedTiers) {
    if (counts[t] > 0 && finalPct[t] < MIN_ZONE) {
      owe += MIN_ZONE - finalPct[t];
      finalPct[t] = MIN_ZONE;
    }
  }
  if (owe > 0) {
    // Take from the largest zone first so the visual stays honest.
    const largest = orderedTiers.reduce((a, b) =>
      finalPct[a] >= finalPct[b] ? a : b,
    );
    finalPct[largest] = Math.max(MIN_ZONE, finalPct[largest] - owe);
  }

  return (
    <div ref={containerRef} className="relative pt-12 pb-4">
      {/* YOU marker, edge-aware so it never clips the viewport. */}
      {self && arrowPct !== null && (
        <div
          aria-hidden="true"
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `${arrowPct}%` }}
        >
          <div
            className={cn(
              "flex flex-col items-center",
              arrowPct < 8
                ? "items-start ml-[-0.25rem]"
                : arrowPct > 92
                  ? "items-end mr-[-0.25rem]"
                  : "items-center",
            )}
          >
            <span className="inline-block bg-brand-black text-brand-lime font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em] px-2 py-0.5 whitespace-nowrap">
              You · #{self.rank} of {total}
            </span>
            <span
              aria-hidden="true"
              className="block w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-brand-black"
            />
          </div>
        </div>
      )}

      {/* The bar itself. Bare colored zones, hoverable + clickable to
          open a popover listing the top 3 peers in that tier. */}
      <div className="relative flex h-9 w-full overflow-hidden rounded-sm border border-brand-black/15 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
        {(() => {
          let cursor = 0;
          return orderedTiers.map((t, i) => {
            if (counts[t] === 0) return null;
            const left = cursor;
            cursor += finalPct[t];
            const isActive = activeZone === t || pinnedZone === t;
            return (
              <button
                key={t}
                type="button"
                aria-label={`${TIER_LABEL[t]}: ${counts[t]} peers. Click to view.`}
                aria-expanded={isActive}
                onMouseEnter={() => openZone(t)}
                onMouseLeave={scheduleZoneClose}
                onFocus={() => openZone(t)}
                onBlur={scheduleZoneClose}
                onClick={() => {
                  setPinnedZone(pinnedZone === t ? null : t);
                  setActiveZone(t);
                }}
                className={cn(
                  TIER_BG[t],
                  "relative h-full cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple ring-inset",
                  i > 0 && "border-l border-brand-black/15",
                  isActive
                    ? "brightness-105 shadow-[inset_0_0_0_2px_rgba(15,15,15,0.65)]"
                    : "hover:brightness-105 hover:shadow-[inset_0_0_0_2px_rgba(15,15,15,0.45)]",
                )}
                style={{ width: `${finalPct[t]}%` }}
              />
            );
          });
        })()}

        {/* Popover for the active zone. Anchored to the zone's center
            with edge-aware shifts so it never clips. */}
        {(activeZone || pinnedZone) &&
          (() => {
            const tier = (pinnedZone ?? activeZone)!;
            // Compute zone center as % of bar width.
            let cursor = 0;
            for (const t of orderedTiers) {
              if (t === tier) break;
              if (counts[t] > 0) cursor += finalPct[t];
            }
            const center = cursor + finalPct[tier] / 2;
            const isLeft = center < 22;
            const isRight = center > 78;
            const top3 = peersByTier[tier].slice(0, 3);
            return (
              <div
                role="dialog"
                aria-label={`${TIER_LABEL[tier]} top peers`}
                className={cn(
                  "absolute z-30 top-[calc(100%+0.5rem)]",
                  isLeft
                    ? "left-0"
                    : isRight
                      ? "right-0"
                      : "-translate-x-1/2",
                )}
                style={
                  isLeft || isRight ? undefined : { left: `${center}%` }
                }
                onMouseEnter={() => openZone(tier)}
                onMouseLeave={scheduleZoneClose}
              >
                <div className="min-w-[14rem] max-w-[18rem] border-2 border-brand-black bg-white shadow-[3px_3px_0_0_var(--color-brand-purple)]">
                  <div className="flex items-baseline justify-between gap-2 border-b border-brand-black/15 bg-brand-cream/40 px-3 py-2">
                    <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black">
                      {TIER_LABEL[tier]}
                    </span>
                    <span className="font-display text-[0.62rem] tabular-nums text-brand-black/60">
                      {counts[tier]} in this tier
                    </span>
                  </div>
                  {top3.length > 0 ? (
                    <ol className="px-3 py-2">
                      {top3.map((p) => (
                        <li
                          key={p.slug}
                          className="grid grid-cols-[1.5rem_1fr] items-baseline gap-2 py-1"
                        >
                          <span className="font-display text-xs font-black tabular-nums text-brand-black/55">
                            #{p.rank}
                          </span>
                          <Link
                            href={`/business/${p.slug}`}
                            className={cn(
                              "font-display text-sm font-semibold text-brand-black truncate hover:text-brand-purple",
                              p.slug === currentSlug && "text-brand-purple",
                            )}
                          >
                            {p.name}
                            {p.slug === currentSlug && (
                              <span className="ml-1 font-body text-[0.6rem] font-normal uppercase tracking-[0.14em] text-brand-black/55">
                                you
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="px-3 py-3 font-body text-xs text-brand-black/55">
                      No peers in this tier yet.
                    </p>
                  )}
                  {counts[tier] > 3 && (
                    <p className="border-t border-brand-black/10 px-3 py-2 font-display text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-brand-purple">
                      see all {counts[tier]} below
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
      </div>

      {/* Legend row beneath the bar. Each item is also a button so the
          zone popover can be opened by keyboard or by tapping the
          label text instead of a colored zone (better for narrow
          zones, better for accessibility). */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 font-body text-[0.65rem] md:text-xs text-brand-black/65">
        {orderedTiers.map((t) => {
          if (counts[t] === 0) return null;
          const isActive = activeZone === t || pinnedZone === t;
          return (
            <li key={t}>
              <button
                type="button"
                aria-label={`${TIER_LABEL[t]}: ${counts[t]} peers. Click to view.`}
                aria-expanded={isActive}
                onMouseEnter={() => openZone(t)}
                onMouseLeave={scheduleZoneClose}
                onFocus={() => openZone(t)}
                onBlur={scheduleZoneClose}
                onClick={() => {
                  setPinnedZone(pinnedZone === t ? null : t);
                  setActiveZone(t);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 -mx-1 cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
                  isActive
                    ? "bg-brand-cream/60"
                    : "hover:bg-brand-cream/40",
                )}
              >
                <span
                  className={cn(
                    "inline-block w-2.5 h-2.5 rounded-full",
                    TIER_BG[t],
                  )}
                  aria-hidden="true"
                />
                <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-brand-black">
                  {TIER_LABEL[t]}
                </span>
                <span className="tabular-nums text-brand-black/60">
                  {counts[t]}
                </span>
              </button>
            </li>
          );
        })}
        <li className="ml-1 font-body text-[0.62rem] uppercase tracking-[0.14em] text-brand-black/40">
          {pinnedZone ? "esc to close" : "tap a tier"}
        </li>
      </ul>

      <p className="mt-3 font-body text-[0.7rem] md:text-xs text-brand-black/55 leading-relaxed">
        {self ? (
          <>
            You sit #{self.rank} of {total} in this scope. Tier widths
            reflect actual peer counts in this group.
          </>
        ) : (
          <>Tier widths reflect actual peer counts in this group.</>
        )}
      </p>
    </div>
  );
}
