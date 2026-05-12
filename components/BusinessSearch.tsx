"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * BusinessSearch, browse-only canonical index list.
 *
 * Rebuilt 2026-05-01: search now lives in the hero (`HeroSearch`). This
 * component is the always-visible record of the full Spring 2026 index.
 * It no longer accepts text input or listens for cross-component events;
 * it just shows every business in the index, filterable by neighborhood
 * chip.
 *
 * Why keep it: the hero search is interactive and only opens on intent.
 * This section is the canonical, scrollable list a reader can land on
 * to see the full issue at a glance, the "table of contents" view.
 *
 * Interactions:
 *   - Click a neighborhood chip to filter (multi-select OR; click again
 *     to deselect)
 *   - Defaults to showing the full index
 */

export type SearchableBusiness = {
  slug: string;
  name: string;
  neighborhood: string;
  categoryName: string;
  tier: "icons" | "ones_to_watch" | "neighborhood_staples";
};

type BusinessSearchProps = {
  businesses: SearchableBusiness[];
};

const TIER_PILL_CLASS: Record<SearchableBusiness["tier"], string> = {
  icons: "bg-brand-lime text-brand-black",
  ones_to_watch: "bg-brand-purple text-brand-lavender",
  neighborhood_staples:
    "bg-brand-cream text-brand-black border border-brand-black/25",
};

const TIER_SHORT: Record<SearchableBusiness["tier"], string> = {
  icons: "Icons",
  ones_to_watch: "Watch",
  neighborhood_staples: "Staple",
};

export function BusinessSearch({ businesses }: BusinessSearchProps) {
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    [],
  );

  const neighborhoods = useMemo(() => {
    const counts = new Map<string, number>();
    businesses.forEach((b) => {
      if (b.neighborhood) {
        counts.set(b.neighborhood, (counts.get(b.neighborhood) ?? 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
      .map(([name, count]) => ({ name, count }));
  }, [businesses]);

  const filtered = useMemo(() => {
    if (selectedNeighborhoods.length === 0) return businesses;
    return businesses.filter((b) =>
      selectedNeighborhoods.includes(b.neighborhood),
    );
  }, [businesses, selectedNeighborhoods]);

  // Compact-by-default chip list. Show top STABLE_COUNT + ROTATING_COUNT
  // rotating slots; user can expand to the full wall via "Show all". A
  // selected chip from the long tail stays visible (we promote it into
  // the rendered set) so filter state is never invisible to the reader.
  const STABLE_COUNT = 10;
  const ROTATING_COUNT = 3;
  const ROTATE_MS = 1800;
  const [showAll, setShowAll] = useState(false);
  const stableNeighborhoods = neighborhoods.slice(0, STABLE_COUNT);
  const tailNeighborhoods = neighborhoods.slice(STABLE_COUNT);
  const [slotCounters, setSlotCounters] = useState<number[]>(() =>
    Array.from({ length: ROTATING_COUNT }, () => 0),
  );
  useEffect(() => {
    if (showAll || tailNeighborhoods.length <= ROTATING_COUNT) return;
    let tick = 0;
    const t = window.setInterval(() => {
      const slot = tick % ROTATING_COUNT;
      tick += 1;
      setSlotCounters((prev) => {
        const next = [...prev];
        next[slot] = next[slot] + 1;
        return next;
      });
    }, ROTATE_MS);
    return () => window.clearInterval(t);
  }, [showAll, tailNeighborhoods.length]);
  const rotatingNeighborhoods = useMemo(() => {
    if (tailNeighborhoods.length === 0) return [];
    return Array.from({
      length: Math.min(ROTATING_COUNT, tailNeighborhoods.length),
    }).map((_, k) => {
      const idx =
        (slotCounters[k] * ROTATING_COUNT + k) % tailNeighborhoods.length;
      return tailNeighborhoods[idx];
    });
  }, [tailNeighborhoods, slotCounters]);
  // Pinned chips: any selected tail neighborhood that is not in the stable
  // or currently-rotating set, so an active filter never disappears.
  const visibleNamesSet = new Set([
    ...stableNeighborhoods.map((n) => n.name),
    ...rotatingNeighborhoods.map((n) => n.name),
  ]);
  const pinnedSelectedTail = neighborhoods.filter(
    (n) =>
      selectedNeighborhoods.includes(n.name) && !visibleNamesSet.has(n.name),
  );

  const hasActiveFilter = selectedNeighborhoods.length > 0;

  function toggleNeighborhood(name: string) {
    setSelectedNeighborhoods((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  function resetFilters() {
    setSelectedNeighborhoods([]);
  }

  const counterText = hasActiveFilter
    ? `Showing ${filtered.length} of ${businesses.length}`
    : `${businesses.length} businesses in the Spring 2026 index`;

  return (
    <section
      aria-label="Browse the full index"
      className="border border-brand-black/15 bg-white/70 p-5 md:p-7"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
          Browse the full index
        </h3>
        <span className="font-body text-[0.7rem] md:text-xs text-brand-black/55">
          {counterText}
        </span>
      </div>

      {/* Neighborhood chips. Compact by default: stable top 10 + 3
          rotating slots that flash through the long tail, plus a "Show
          all" expander. */}
      <div className="flex flex-wrap gap-2">
        <p className="w-full font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-1">
          Filter by neighborhood
        </p>
        {(showAll ? neighborhoods : stableNeighborhoods).map(({ name, count }) => {
          const isActive = selectedNeighborhoods.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleNeighborhood(name)}
              aria-pressed={isActive}
              className={cn(
                "font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 transition-all",
                isActive
                  ? "bg-brand-lime text-brand-black"
                  : "border border-brand-black/20 text-brand-black/70 hover:bg-brand-cream hover:text-brand-black hover:border-brand-black",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
              )}
            >
              {name}{" "}
              <span
                className={cn(
                  "tabular-nums",
                  isActive ? "text-brand-black/60" : "text-brand-black/40",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
        {!showAll &&
          rotatingNeighborhoods.map((n, k) => {
            if (!n) return null;
            const isActive = selectedNeighborhoods.includes(n.name);
            return (
              <button
                key={`rot-${k}-${slotCounters[k]}`}
                type="button"
                onClick={() => toggleNeighborhood(n.name)}
                aria-pressed={isActive}
                aria-live="polite"
                className={cn(
                  "font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 transition-all",
                  "motion-safe:animate-[chip-flash_700ms_ease-out]",
                  isActive
                    ? "bg-brand-lime text-brand-black"
                    : "border border-brand-purple/40 text-brand-black/70 hover:bg-brand-cream hover:text-brand-black hover:border-brand-black",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
                )}
              >
                {n.name}{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    isActive ? "text-brand-black/60" : "text-brand-black/40",
                  )}
                >
                  {n.count}
                </span>
              </button>
            );
          })}
        {!showAll &&
          pinnedSelectedTail.map(({ name, count }) => (
            <button
              key={`pin-${name}`}
              type="button"
              onClick={() => toggleNeighborhood(name)}
              aria-pressed={true}
              className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 transition-all bg-brand-lime text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
            >
              {name}{" "}
              <span className="tabular-nums text-brand-black/60">{count}</span>
            </button>
          ))}
        {!showAll && tailNeighborhoods.length > ROTATING_COUNT && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 text-brand-purple hover:text-brand-black hover:bg-brand-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            Show all {neighborhoods.length} →
          </button>
        )}
        {showAll && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 text-brand-purple hover:text-brand-black hover:bg-brand-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            Show fewer
          </button>
        )}
        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 underline decoration-brand-purple underline-offset-2 text-brand-black/65 hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Always-visible canonical list */}
      <div className="mt-6">
        {filtered.length === 0 ? (
          <p className="font-body text-sm text-brand-black/60 italic py-4">
            No matches in the selected neighborhoods.{" "}
            <button
              type="button"
              onClick={resetFilters}
              className="underline decoration-brand-purple underline-offset-2 hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
            >
              View the full index
            </button>
            .
          </p>
        ) : (
          <ul className="border-t border-brand-black/10 max-h-[26rem] overflow-y-auto">
            {filtered.map((b) => (
              <li key={b.slug} className="border-b border-brand-black/10">
                <Link
                  href={`/business/${b.slug}`}
                  className="group flex items-start gap-3 py-3 px-1 hover:bg-brand-cream/60 focus:outline-none focus-visible:bg-brand-cream/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-display font-black tracking-[-0.01em] text-base md:text-lg text-brand-black group-hover:text-brand-purple">
                        {b.name}
                      </span>
                      <span
                        className={cn(
                          "font-display text-[0.55rem] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5",
                          TIER_PILL_CLASS[b.tier],
                        )}
                      >
                        {TIER_SHORT[b.tier]}
                      </span>
                    </div>
                    <p className="mt-0.5 font-body text-xs md:text-sm text-brand-black/60">
                      {b.categoryName} · {b.neighborhood}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 font-display text-[0.7rem] text-brand-black/40 group-hover:text-brand-purple group-hover:translate-x-1 transition-transform mt-1"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
