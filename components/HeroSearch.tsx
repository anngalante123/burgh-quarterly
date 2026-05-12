"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { SearchableBusiness } from "@/components/BusinessSearch";

/**
 * HeroSearch, self-contained search with inline results dropdown.
 *
 * Lives in the homepage hero. A Pittsburgh business owner who arrived to
 * "look themselves up" sees this as the second thing on the page (under
 * the H1), no scroll required. They type or click a neighborhood chip
 * and results appear directly under the input as an absolutely-positioned
 * overlay panel. No scrolling, no bait-and-switch jump to a different
 * input below the fold.
 *
 * Behavior:
 *   - Type to filter by name / neighborhood / category
 *   - Click a neighborhood chip to filter (multi-select OR; click again
 *     to deselect)
 *   - Dropdown opens whenever query.length > 0 OR a chip is selected
 *   - Arrow keys move focus through results, Enter navigates, Esc closes
 *     and clears the query
 *   - Outside click closes the dropdown but preserves the query
 *   - 0-result empty state forks into "Get reviewed for Issue 02" + the
 *     Underrated List, matching the previous BusinessSearch fork
 *
 * Notes:
 *   - No form wrapper, no submit button. The input alone is the search
 *     affordance. Live filtering replaces submit.
 *   - No cross-component event bridge. The lower BusinessSearch is now
 *     browse-only and shares no state with this component.
 */

type HeroSearchProps = {
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

export function HeroSearch({ businesses }: HeroSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    [],
  );
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  // `isClosed` is the user's explicit "I dismissed the dropdown" intent
  // (Esc key, outside click, Close button). It only matters while there
  // IS an active filter; once filters clear, the dropdown is closed
  // regardless. This pattern keeps the dropdown derived from state
  // instead of synced via effect.
  const [isClosed, setIsClosed] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  // Show the top STABLE_COUNT neighborhoods always-on, plus ROTATING_COUNT
  // slots that cycle through the long tail. Only ONE slot advances per
  // tick so only one chip flashes at a time, the other two stay settled.
  // That gives the eye a single moving signal instead of three competing
  // ones. A given slot rotates every ROTATE_MS * ROTATING_COUNT ms.
  const STABLE_COUNT = 10;
  const ROTATING_COUNT = 3;
  const ROTATE_MS = 1800;
  const stableNeighborhoods = neighborhoods.slice(0, STABLE_COUNT);
  const tailNeighborhoods = neighborhoods.slice(STABLE_COUNT);

  // slotCounters[k] = how many times slot k has advanced. The displayed
  // neighborhood for slot k is tail[(slotCounters[k] * ROTATING_COUNT + k) % tail.length],
  // so the three slots iterate through interleaved subsets and never
  // collide on the same name.
  const [slotCounters, setSlotCounters] = useState<number[]>(() =>
    Array.from({ length: ROTATING_COUNT }, () => 0),
  );
  useEffect(() => {
    if (tailNeighborhoods.length <= ROTATING_COUNT) return;
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
  }, [tailNeighborhoods.length]);

  const rotatingNeighborhoods = useMemo(() => {
    if (tailNeighborhoods.length === 0) return [];
    return Array.from({ length: Math.min(ROTATING_COUNT, tailNeighborhoods.length) }).map(
      (_, k) => {
        const idx = (slotCounters[k] * ROTATING_COUNT + k) % tailNeighborhoods.length;
        return tailNeighborhoods[idx];
      },
    );
  }, [tailNeighborhoods, slotCounters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return businesses.filter((b) => {
      if (
        selectedNeighborhoods.length > 0 &&
        !selectedNeighborhoods.includes(b.neighborhood)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.neighborhood.toLowerCase().includes(q) ||
        b.categoryName.toLowerCase().includes(q)
      );
    });
  }, [businesses, query, selectedNeighborhoods]);

  const hasActiveFilter =
    query.length > 0 || selectedNeighborhoods.length > 0;

  // Dropdown is open iff there is an active filter AND the user hasn't
  // explicitly dismissed it. Derived, no effect needed.
  const isOpen = hasActiveFilter && !isClosed;

  // Outside-click handler. Closes the dropdown but preserves query and
  // chip state. Typing in the input or clicking a chip is in-bounds.
  useEffect(() => {
    if (!isOpen) return;
    function onDocClick(e: MouseEvent) {
      const node = wrapperRef.current;
      if (!node) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        setIsClosed(true);
        setFocusedIdx(-1);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [isOpen]);

  function toggleNeighborhood(name: string) {
    setSelectedNeighborhoods((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
    setFocusedIdx(-1);
    setIsClosed(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hasActiveFilter) setIsClosed(false);
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
      e.preventDefault();
      setQuery("");
      setSelectedNeighborhoods([]);
      setFocusedIdx(-1);
      setIsClosed(true);
    }
  }

  return (
    <div ref={wrapperRef} className="mt-8 max-w-2xl relative">
      <p className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-2">
        Look up your business
      </p>

      {/* Search input. Standalone, no form, no submit button. Live
          filtering means submit is meaningless. */}
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusedIdx(-1);
            setIsClosed(false);
          }}
          onKeyDown={handleKey}
          onFocus={() => {
            if (hasActiveFilter) setIsClosed(false);
          }}
          placeholder="Search the Spring 2026 index by name, neighborhood, or category"
          aria-label="Search the index"
          aria-expanded={isOpen}
          aria-controls="hero-search-results"
          role="combobox"
          autoComplete="off"
          className="w-full border-2 border-brand-black bg-white px-4 py-3 pr-12 font-body text-base text-brand-black placeholder:text-brand-black/60 focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedNeighborhoods([]);
              setFocusedIdx(-1);
              setIsClosed(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 font-display text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-brand-black/60 hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple px-2 py-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Neighborhood chips: a stable top-N plus a few rotating slots that
          flash through the long tail. The rotating chips remount on each
          tick (key includes rotatingIdx) so the fade-in keyframe re-fires.
          Reduced-motion users see the same swap without the fade. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {stableNeighborhoods.map(({ name, count }) => {
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
                  isActive ? "text-brand-black/60" : "text-brand-black/60",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
        {rotatingNeighborhoods.map((n, k) => {
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
                  isActive ? "text-brand-black/60" : "text-brand-black/60",
                )}
              >
                {n.count}
              </span>
            </button>
          );
        })}
        {tailNeighborhoods.length > ROTATING_COUNT && (
          <span
            className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 text-brand-black/60"
            aria-hidden="true"
          >
            +{neighborhoods.length - STABLE_COUNT} more
          </span>
        )}
      </div>

      {/* Results dropdown, absolutely positioned overlay so other hero
          content (the stat line below) is not pushed down. */}
      {isOpen && (
        <div
          id="hero-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-30 border-2 border-brand-black bg-white shadow-[4px_4px_0_0_var(--color-brand-purple)]"
        >
          <div className="flex items-baseline justify-between gap-3 flex-wrap px-4 md:px-5 py-3 border-b border-brand-black/10 bg-brand-cream/40">
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/65">
              {filtered.length === 0
                ? "No matches"
                : `${filtered.length} of ${businesses.length}`}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsClosed(true);
                setFocusedIdx(-1);
              }}
              className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55 hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
              aria-label="Close results"
            >
              Close
            </button>
          </div>

          {filtered.length === 0 ? (
            // Empty state, the highest-intent moment in the funnel.
            // Fork into Issue 02 request + Underrated List. Editorial
            // framing only; no "leverage / unlock / amplify" per voice
            // rules.
            <div className="p-5 md:p-6 bg-brand-cream/60">
              <p className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-lg md:text-xl leading-[1.1]">
                Not in the Spring 2026 index, yet.
              </p>
              <p className="mt-3 font-body text-sm md:text-base text-brand-black/75 leading-relaxed max-w-xl">
                The Spring 2026 index covers {businesses.length} businesses.
                The next issue ships this summer. Tell us about yours, or
                browse the list of underrated picks already in print.
              </p>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/request"
                  className="inline-flex items-center justify-center gap-1 border-2 border-brand-black bg-brand-purple px-5 py-3 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brand-lavender hover:bg-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple transition-colors"
                >
                  Get reviewed for Issue 02
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/underrated"
                  className="inline-flex items-center justify-center gap-1 border-2 border-brand-black bg-transparent px-5 py-3 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brand-black hover:bg-brand-lime focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple transition-colors"
                >
                  See the Underrated List
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          ) : (
            <ul className="max-h-[60vh] sm:max-h-[24rem] overflow-y-auto">
              {filtered.map((b, i) => (
                <li
                  key={b.slug}
                  role="option"
                  aria-selected={focusedIdx === i}
                  className={cn(
                    "border-b border-brand-black/10 last:border-b-0",
                    focusedIdx === i && "bg-brand-cream/60",
                  )}
                >
                  <Link
                    href={`/business/${b.slug}`}
                    onMouseEnter={() => setFocusedIdx(i)}
                    className="group flex items-start gap-3 py-3 px-4 md:px-5 hover:bg-brand-cream/60 focus:outline-none focus-visible:bg-brand-cream/80"
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
                      className="shrink-0 font-display text-[0.7rem] text-brand-black/60 group-hover:text-brand-purple group-hover:translate-x-1 transition-transform mt-1"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
