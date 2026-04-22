"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * BusinessSearch, homepage search component.
 *
 * Filters the full index by name or neighborhood. Entirely client-side
 * since the dataset is small (30 businesses). Data is passed in at build
 * time from the server component that renders the homepage.
 *
 * Interactions:
 *   - Type to filter results by name or neighborhood (case-insensitive)
 *   - Click a neighborhood chip to filter by neighborhood only
 *   - Clear button resets state
 *   - Keyboard: arrow keys to move selection, Enter to navigate
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
  ones_to_watch: "bg-brand-purple text-brand-off-white",
  neighborhood_staples:
    "bg-brand-cream text-brand-black border border-brand-black/25",
};

const TIER_SHORT: Record<SearchableBusiness["tier"], string> = {
  icons: "Icons",
  ones_to_watch: "Watch",
  neighborhood_staples: "Staple",
};

export function BusinessSearch({ businesses }: BusinessSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(
    null,
  );
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

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
    const q = query.trim().toLowerCase();
    return businesses.filter((b) => {
      if (selectedNeighborhood && b.neighborhood !== selectedNeighborhood) {
        return false;
      }
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.neighborhood.toLowerCase().includes(q) ||
        b.categoryName.toLowerCase().includes(q)
      );
    });
  }, [businesses, query, selectedNeighborhood]);

  const hasActiveFilter = query.length > 0 || selectedNeighborhood !== null;

  function resetFilters() {
    setQuery("");
    setSelectedNeighborhood(null);
    setFocusedIdx(-1);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      e.preventDefault();
      const target = filtered[focusedIdx];
      if (target) {
        window.location.href = `/business/${target.slug}`;
      }
    } else if (e.key === "Escape") {
      resetFilters();
    }
  }

  return (
    <section
      aria-label="Find a business"
      className="border border-brand-black/15 bg-white/70 p-5 md:p-7"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
          Find a business
        </h3>
        <span className="font-body text-[0.7rem] md:text-xs text-brand-black/55">
          {filtered.length} of {businesses.length} in the index
        </span>
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusedIdx(-1);
          }}
          onKeyDown={handleKey}
          placeholder="Search by name, neighborhood, or category"
          aria-label="Search businesses"
          className="w-full border-2 border-brand-black bg-white px-4 py-3 pr-12 font-body text-base text-brand-black placeholder:text-brand-black/40 focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetFilters}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 font-display text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-brand-black/60 hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple px-2 py-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Neighborhood chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        <p className="w-full font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-1">
          Filter by neighborhood
        </p>
        {neighborhoods.map(({ name, count }) => {
          const isActive = selectedNeighborhood === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() =>
                setSelectedNeighborhood(isActive ? null : name)
              }
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
      </div>

      {/* Results */}
      <div className="mt-6">
        {filtered.length === 0 ? (
          <p className="font-body text-sm text-brand-black/60 italic py-4">
            Nothing in the index matches that search. Try a neighborhood
            chip, or clear to see everything.
          </p>
        ) : (
          <ul className="border-t border-brand-black/10 max-h-[26rem] overflow-y-auto">
            {filtered.map((b, i) => (
              <li
                key={b.slug}
                className={cn(
                  "border-b border-brand-black/10",
                  focusedIdx === i && "bg-brand-cream/60",
                )}
              >
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
