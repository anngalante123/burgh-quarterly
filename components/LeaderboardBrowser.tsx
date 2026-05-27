"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * LeaderboardBrowser, the client-side filter and render layer for
 * /leaderboard. Receives every ranked business in the active issue from
 * the server component, owns filter state in URL search params, and
 * renders a tier-banded list with chunked "load more" rendering so the
 * full 2,500+ row payload never paints all at once.
 *
 * Filter dimensions:
 *   - tier: icons / ones_to_watch / neighborhood_staples (multi)
 *   - category: business category enum (single select)
 *   - neighborhood: multi-select
 *   - reviews: review-volume bucket (single: lt50, 50-250, 250-1k, 1k+)
 *   - q: free-text business-name search
 *
 * URL params keep filters shareable and back-button friendly. We use
 * `router.replace` with `scroll: false` to avoid jump-to-top on every
 * keystroke.
 */

export type BrowseRow = {
  slug: string;
  name: string;
  neighborhood: string;
  category: string;
  categoryName: string;
  tier: "icons" | "ones_to_watch" | "neighborhood_staples";
  rank_global: number;
  rank_category: number;
  hero_photo: string | null;
  review_count: number;
};

type Tier = BrowseRow["tier"];

type ReviewBucket = "lt50" | "50-250" | "250-1k" | "1k+";

const TIER_ORDER: Tier[] = ["icons", "ones_to_watch", "neighborhood_staples"];

const TIER_LABEL: Record<Tier, string> = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
};

const TIER_PILL: Record<Tier, string> = {
  icons:
    "bg-brand-lime text-brand-black border border-brand-black/10 rounded-sm",
  ones_to_watch:
    "bg-brand-purple text-brand-lavender border border-brand-purple rounded-full",
  neighborhood_staples:
    "bg-brand-cream text-brand-black border border-brand-black/15 rounded-full",
};

const TIER_SHORT: Record<Tier, string> = {
  icons: "Icons",
  ones_to_watch: "Watch",
  neighborhood_staples: "Staple",
};

const REVIEW_BUCKETS: { value: ReviewBucket; label: string }[] = [
  { value: "lt50", label: "Under 50" },
  { value: "50-250", label: "50 to 250" },
  { value: "250-1k", label: "250 to 1k" },
  { value: "1k+", label: "1k or more" },
];

const PAGE_SIZE = 200;
const RICH_RANK_THRESHOLD = 50;

function reviewBucketMatch(count: number, bucket: ReviewBucket): boolean {
  switch (bucket) {
    case "lt50":
      return count < 50;
    case "50-250":
      return count >= 50 && count < 250;
    case "250-1k":
      return count >= 250 && count < 1000;
    case "1k+":
      return count >= 1000;
  }
}

type CategoryOption = { value: string; label: string };
type NeighborhoodOption = { name: string; count: number };

type Props = {
  rows: BrowseRow[];
  categories: CategoryOption[];
};

export function LeaderboardBrowser({ rows, categories }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Parse current filter state out of the URL once per render. The URL
  // is the single source of truth so back/forward restores cleanly.
  const selectedTiers = useMemo<Tier[]>(() => {
    const raw = searchParams.get("tier");
    if (!raw) return [];
    return raw
      .split(",")
      .filter((t): t is Tier =>
        ["icons", "ones_to_watch", "neighborhood_staples"].includes(t),
      );
  }, [searchParams]);

  const selectedCategory = searchParams.get("category") ?? "";

  const selectedNeighborhoods = useMemo<string[]>(() => {
    const raw = searchParams.get("hood");
    if (!raw) return [];
    return raw.split(",").filter(Boolean);
  }, [searchParams]);

  const selectedReviewBucket = (searchParams.get("reviews") ??
    "") as ReviewBucket | "";

  const query = searchParams.get("q") ?? "";

  const hasAnyFilter =
    selectedTiers.length > 0 ||
    selectedCategory !== "" ||
    selectedNeighborhoods.length > 0 ||
    selectedReviewBucket !== "" ||
    query.trim() !== "";

  // Live local mirror of the text input so typing feels instant while we
  // debounce the URL write underneath.
  const [queryDraft, setQueryDraft] = useState(query);
  useEffect(() => {
    setQueryDraft(query);
  }, [query]);

  // Push filter state into the URL. Uses replace so it doesn't pile up
  // history entries per keystroke, and scroll: false so the page doesn't
  // jump on filter changes.
  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Debounce the text-search URL write so typing 8 chars doesn't trigger
  // 8 router.replace calls in a row.
  useEffect(() => {
    if (queryDraft === query) return;
    const t = window.setTimeout(() => {
      updateParams({ q: queryDraft.trim() || null });
    }, 200);
    return () => window.clearTimeout(t);
  }, [queryDraft, query, updateParams]);

  function toggleTier(tier: Tier) {
    const has = selectedTiers.includes(tier);
    const next = has
      ? selectedTiers.filter((t) => t !== tier)
      : [...selectedTiers, tier];
    updateParams({ tier: next.length ? next.join(",") : null });
  }

  function toggleNeighborhood(name: string) {
    const has = selectedNeighborhoods.includes(name);
    const next = has
      ? selectedNeighborhoods.filter((n) => n !== name)
      : [...selectedNeighborhoods, name];
    updateParams({ hood: next.length ? next.join(",") : null });
  }

  function setCategory(value: string) {
    updateParams({ category: value || null });
  }

  function setReviewBucket(value: ReviewBucket | "") {
    updateParams({ reviews: value || null });
  }

  function resetFilters() {
    setQueryDraft("");
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  // Neighborhood list, sorted by count desc, restricted to the rows that
  // currently pass the non-neighborhood filters (so a reader doesn't see
  // empty neighborhoods in their chip list).
  const neighborhoodOptions = useMemo<NeighborhoodOption[]>(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!r.neighborhood) continue;
      // Count against the full set, not the currently-filtered set, so
      // the visible chip list stays stable across filter combinations.
      counts.set(r.neighborhood, (counts.get(r.neighborhood) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
      .map(([name, count]) => ({ name, count }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (selectedTiers.length > 0 && !selectedTiers.includes(r.tier)) {
        return false;
      }
      if (selectedCategory && r.category !== selectedCategory) {
        return false;
      }
      if (
        selectedNeighborhoods.length > 0 &&
        !selectedNeighborhoods.includes(r.neighborhood)
      ) {
        return false;
      }
      if (
        selectedReviewBucket &&
        !reviewBucketMatch(r.review_count, selectedReviewBucket)
      ) {
        return false;
      }
      if (q && !r.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [
    rows,
    selectedTiers,
    selectedCategory,
    selectedNeighborhoods,
    selectedReviewBucket,
    query,
  ]);

  // Chunked rendering. Show PAGE_SIZE rows by default; reader clicks
  // "Show more" to reveal the next chunk. Resets whenever filters change.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    selectedTiers,
    selectedCategory,
    selectedNeighborhoods,
    selectedReviewBucket,
    query,
  ]);

  const visibleRows = filteredRows.slice(0, visibleCount);
  const hasMore = visibleCount < filteredRows.length;

  // Group the visible slice by tier for the editorial section breaks.
  const grouped = useMemo<Record<Tier, BrowseRow[]>>(() => {
    const out: Record<Tier, BrowseRow[]> = {
      icons: [],
      ones_to_watch: [],
      neighborhood_staples: [],
    };
    for (const r of visibleRows) out[r.tier].push(r);
    return out;
  }, [visibleRows]);

  // Mobile filter drawer toggle
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const filterPanel = (
    <FilterPanel
      categories={categories}
      neighborhoodOptions={neighborhoodOptions}
      selectedTiers={selectedTiers}
      selectedCategory={selectedCategory}
      selectedNeighborhoods={selectedNeighborhoods}
      selectedReviewBucket={selectedReviewBucket}
      queryDraft={queryDraft}
      onToggleTier={toggleTier}
      onSetCategory={setCategory}
      onToggleNeighborhood={toggleNeighborhood}
      onSetReviewBucket={setReviewBucket}
      onQueryChange={setQueryDraft}
      onReset={resetFilters}
      hasAnyFilter={hasAnyFilter}
    />
  );

  return (
    <div className="mt-10 md:mt-14">
      {/* Counter strip + mobile filter button */}
      <div className="flex items-center justify-between gap-3 border-b border-brand-black/15 pb-3">
        <p className="font-display text-[0.62rem] md:text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-brand-black/70">
          {hasAnyFilter
            ? `Showing ${filteredRows.length.toLocaleString()} of ${rows.length.toLocaleString()}`
            : `${rows.length.toLocaleString()} businesses, every neighborhood, every category`}
        </p>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="md:hidden font-display text-[0.65rem] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 bg-brand-black text-brand-lime hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
        >
          Filters {hasAnyFilter ? `(${countActiveFilters(
            selectedTiers,
            selectedCategory,
            selectedNeighborhoods,
            selectedReviewBucket,
            query,
          )})` : ""}
        </button>
      </div>

      {/* Desktop sticky filter bar */}
      <div className="hidden md:block sticky top-0 z-30 -mx-6 px-6 bg-brand-lavender/95 backdrop-blur border-b border-brand-black/10 py-5">
        {filterPanel}
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-brand-black/50"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-brand-lavender border-t-2 border-brand-black p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-xl">
                Filters
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] px-3 py-1.5 border border-brand-black/30 hover:bg-brand-cream"
              >
                Close
              </button>
            </div>
            {filterPanel}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-6 w-full font-display text-sm font-semibold uppercase tracking-[0.18em] px-4 py-3 bg-brand-black text-brand-lime hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
            >
              Show {filteredRows.length.toLocaleString()} results
            </button>
          </div>
        </div>
      )}

      {/* Zero-results state */}
      {filteredRows.length === 0 ? (
        <EmptyState onReset={resetFilters} />
      ) : (
        <>
          <div className="mt-10 md:mt-14 space-y-12 md:space-y-16">
            {TIER_ORDER.map((tier) => {
              const items = grouped[tier];
              if (items.length === 0) return null;
              const totalInTier = filteredRows.filter(
                (r) => r.tier === tier,
              ).length;
              return (
                <section key={tier}>
                  <header className="flex items-baseline justify-between gap-4 border-b border-brand-black/15 pb-3">
                    <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-2xl md:text-3xl">
                      {TIER_LABEL[tier]}
                    </h2>
                    <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                      {items.length === totalInTier
                        ? `${items.length} ${items.length === 1 ? "entry" : "entries"}`
                        : `${items.length} of ${totalInTier}`}
                    </span>
                  </header>
                  <ol className="mt-6 space-y-2 md:space-y-3">
                    {items.map((row) => (
                      <li key={row.slug}>
                        {row.rank_global <= RICH_RANK_THRESHOLD ? (
                          <RichRow row={row} />
                        ) : (
                          <DenseRow row={row} />
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-12 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="font-display text-sm font-semibold uppercase tracking-[0.18em] px-6 py-3 bg-brand-black text-brand-lime hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
              >
                Show more (
                {Math.min(
                  PAGE_SIZE,
                  filteredRows.length - visibleCount,
                ).toLocaleString()}
                {" "}of {(filteredRows.length - visibleCount).toLocaleString()}
                {" "}remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- filter panel (shared by desktop bar and mobile drawer) ----- */

function FilterPanel(props: {
  categories: CategoryOption[];
  neighborhoodOptions: NeighborhoodOption[];
  selectedTiers: Tier[];
  selectedCategory: string;
  selectedNeighborhoods: string[];
  selectedReviewBucket: ReviewBucket | "";
  queryDraft: string;
  onToggleTier: (t: Tier) => void;
  onSetCategory: (v: string) => void;
  onToggleNeighborhood: (n: string) => void;
  onSetReviewBucket: (b: ReviewBucket | "") => void;
  onQueryChange: (v: string) => void;
  onReset: () => void;
  hasAnyFilter: boolean;
}) {
  const {
    categories,
    neighborhoodOptions,
    selectedTiers,
    selectedCategory,
    selectedNeighborhoods,
    selectedReviewBucket,
    queryDraft,
    onToggleTier,
    onSetCategory,
    onToggleNeighborhood,
    onSetReviewBucket,
    onQueryChange,
    onReset,
    hasAnyFilter,
  } = props;

  const [showAllNeighborhoods, setShowAllNeighborhoods] = useState(false);
  const NEIGHBORHOOD_VISIBLE = 12;
  const visibleNeighborhoods = showAllNeighborhoods
    ? neighborhoodOptions
    : neighborhoodOptions.slice(0, NEIGHBORHOOD_VISIBLE);
  // Pin selected-but-hidden neighborhoods so an active chip never vanishes.
  const pinnedHidden = !showAllNeighborhoods
    ? neighborhoodOptions
        .slice(NEIGHBORHOOD_VISIBLE)
        .filter((n) => selectedNeighborhoods.includes(n.name))
    : [];

  return (
    <div className="space-y-4">
      {/* Top row: search + category dropdown + reset */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <label className="flex-1 relative">
          <span className="sr-only">Search by business name</span>
          <input
            type="search"
            value={queryDraft}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by name"
            className="w-full font-body text-sm md:text-base px-4 py-2.5 bg-white border border-brand-black/20 rounded-sm focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
          />
        </label>
        <label className="md:w-64">
          <span className="sr-only">Filter by category</span>
          <select
            value={selectedCategory}
            onChange={(e) => onSetCategory(e.target.value)}
            className="w-full font-body text-sm md:text-base px-3 py-2.5 bg-white border border-brand-black/20 rounded-sm focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={onReset}
            className="font-display text-[0.65rem] md:text-xs font-semibold uppercase tracking-[0.18em] px-3 py-2 text-brand-purple hover:text-brand-black underline decoration-brand-purple underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Tier toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mr-1">
          Tier
        </span>
        {TIER_ORDER.map((tier) => {
          const active = selectedTiers.includes(tier);
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onToggleTier(tier)}
              aria-pressed={active}
              className={cn(
                "font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 transition-all border",
                active
                  ? "bg-brand-black text-brand-lime border-brand-black"
                  : "border-brand-black/20 text-brand-black/70 hover:bg-brand-cream hover:border-brand-black",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
              )}
            >
              {TIER_LABEL[tier]}
            </button>
          );
        })}
      </div>

      {/* Review-volume toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mr-1">
          Reviews
        </span>
        {REVIEW_BUCKETS.map((b) => {
          const active = selectedReviewBucket === b.value;
          return (
            <button
              key={b.value}
              type="button"
              onClick={() => onSetReviewBucket(active ? "" : b.value)}
              aria-pressed={active}
              className={cn(
                "font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 transition-all border",
                active
                  ? "bg-brand-purple text-brand-lavender border-brand-purple"
                  : "border-brand-black/20 text-brand-black/70 hover:bg-brand-cream hover:border-brand-black",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
              )}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      {/* Neighborhood chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full md:w-auto font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 md:mr-1">
          Neighborhood
        </span>
        {visibleNeighborhoods.map(({ name, count }) => {
          const active = selectedNeighborhoods.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onToggleNeighborhood(name)}
              aria-pressed={active}
              className={cn(
                "font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 transition-all",
                active
                  ? "bg-brand-lime text-brand-black"
                  : "border border-brand-black/20 text-brand-black/70 hover:bg-brand-cream hover:border-brand-black",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
              )}
            >
              {name}{" "}
              <span className="tabular-nums text-brand-black/55">{count}</span>
            </button>
          );
        })}
        {pinnedHidden.map(({ name, count }) => (
          <button
            key={`pin-${name}`}
            type="button"
            onClick={() => onToggleNeighborhood(name)}
            aria-pressed={true}
            className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 bg-brand-lime text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            {name} <span className="tabular-nums text-brand-black/55">{count}</span>
          </button>
        ))}
        {neighborhoodOptions.length > NEIGHBORHOOD_VISIBLE && (
          <button
            type="button"
            onClick={() => setShowAllNeighborhoods((v) => !v)}
            className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 text-brand-purple hover:text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            {showAllNeighborhoods
              ? "Show fewer"
              : `Show all ${neighborhoodOptions.length} →`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- row variants ---------- */

function RichRow({ row }: { row: BrowseRow }) {
  const rankNumeral = formatRank(row.rank_global);
  return (
    <Link
      href={`/business/${row.slug}`}
      className="group block rounded-md border border-brand-black/10 bg-white/70 px-4 py-4 md:px-6 md:py-5 transition-colors hover:bg-brand-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      <div className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[5rem_1fr_auto_auto] items-center gap-4 md:gap-6">
        <div className="font-display font-black tabular-nums text-2xl md:text-4xl leading-none tracking-[-0.02em] text-brand-black/20 group-hover:text-brand-purple/60 transition-colors">
          {rankNumeral}
        </div>
        <div className="min-w-0">
          <h3 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-base md:text-xl leading-tight [word-break:break-word]">
            {row.name}
          </h3>
          <p className="mt-1 font-body text-xs md:text-sm text-brand-black/65">
            {row.neighborhood}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.6rem] md:text-[0.65rem] bg-brand-black/5 text-brand-black/75 border border-brand-black/10 rounded-sm">
              {row.categoryName}
            </span>
            <span
              className={cn(
                "md:hidden inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.6rem]",
                TIER_PILL[row.tier],
              )}
            >
              {TIER_LABEL[row.tier]}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "hidden md:inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.7rem]",
            TIER_PILL[row.tier],
          )}
        >
          {TIER_LABEL[row.tier]}
        </span>
        <span
          aria-hidden="true"
          className="font-display text-brand-black/60 group-hover:text-brand-purple transition-colors text-base md:text-lg"
        >
          →
        </span>
      </div>
    </Link>
  );
}

function DenseRow({ row }: { row: BrowseRow }) {
  const rankNumeral = formatRank(row.rank_global);
  return (
    <Link
      href={`/business/${row.slug}`}
      className="group flex items-center gap-3 md:gap-4 px-3 py-2.5 md:px-4 md:py-3 border border-brand-black/10 bg-white/60 hover:bg-brand-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      <span className="font-display font-black tabular-nums text-sm md:text-base text-brand-black/40 group-hover:text-brand-purple/70 w-10 md:w-12 shrink-0">
        {rankNumeral}
      </span>
      <span className="font-display font-black tracking-[-0.01em] text-sm md:text-base text-brand-black group-hover:text-brand-purple truncate flex-1 min-w-0">
        {row.name}
      </span>
      <span className="hidden md:inline font-body text-xs text-brand-black/60 truncate max-w-[12rem]">
        {row.neighborhood}
      </span>
      <span className="hidden md:inline font-body text-xs text-brand-black/60 truncate max-w-[10rem]">
        {row.categoryName}
      </span>
      <span
        className={cn(
          "font-display font-semibold uppercase tracking-[0.1em] text-[0.55rem] md:text-[0.6rem] px-1.5 py-0.5 shrink-0",
          TIER_PILL[row.tier],
        )}
      >
        {TIER_SHORT[row.tier]}
      </span>
      <span
        aria-hidden="true"
        className="font-display text-brand-black/50 group-hover:text-brand-purple transition-colors text-sm shrink-0"
      >
        →
      </span>
    </Link>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-12 border-l-4 border-brand-purple bg-white/70 px-6 py-8 md:px-10 md:py-10 max-w-3xl">
      <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
        Nothing matches yet
      </p>
      <h2 className="mt-3 font-display font-black uppercase tracking-[-0.01em] text-brand-black text-2xl md:text-3xl">
        Nobody&apos;s showing up for that combination this quarter.
      </h2>
      <p className="mt-4 font-body text-sm md:text-base text-brand-black/75 leading-relaxed">
        Try fewer filters, or browse by neighborhood. The index moves every
        issue, so next quarter could land different.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 font-display text-sm font-semibold uppercase tracking-[0.18em] px-5 py-2.5 bg-brand-black text-brand-lime hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
      >
        Reset filters
      </button>
    </div>
  );
}

/* ---------- helpers ---------- */

function formatRank(n: number): string {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return String(n);
}

function countActiveFilters(
  tiers: Tier[],
  category: string,
  neighborhoods: string[],
  reviews: string,
  q: string,
): number {
  let n = 0;
  if (tiers.length) n += 1;
  if (category) n += 1;
  if (neighborhoods.length) n += 1;
  if (reviews) n += 1;
  if (q.trim()) n += 1;
  return n;
}
