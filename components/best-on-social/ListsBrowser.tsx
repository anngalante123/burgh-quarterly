"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { ListCard } from "./ListCard";
import { cn } from "@/lib/utils";

/**
 * ListsBrowser, the client-side filter and grid layer for the lists
 * index at /best-on-social. Receives a flat list of card props from the
 * server component (data already loaded and hero photos already
 * resolved) and owns filter state in URL search params so a reader can
 * share or bookmark a filtered view.
 *
 * Filter dimensions:
 *   - type: icons / underrated / best-on-social (single select). The
 *     "underrated" value renders as "Word of Mouth" (display rename
 *     2026-06-14); the value stays "underrated" for URL stability.
 *   - category: Restaurants / Cafes / Bars / Sweets / Mixed
 *     (single select)
 *   - format: business / posts (single select)
 *
 * Filters are mutually composable. The empty-coming-next-issue card is
 * rendered separately by the parent at the bottom of the page and is
 * not part of this browser's filtered set.
 */

export type ListCardData = {
  slug: string;
  title: string;
  dek: string;
  itemCount: number;
  unit: string;
  category: string;
  /** Top-level type bucket for the Type filter chip row. */
  typeBucket: "icons" | "underrated" | "best-on-social";
  /** Format bucket for the Format filter chip row. */
  formatBucket: "business" | "posts";
  heroPhoto: string | null;
  heroAlt: string;
};

type TypeFilter = "all" | "icons" | "underrated" | "best-on-social";
type CategoryFilter =
  | "all"
  | "Restaurants"
  | "Cafes"
  | "Bars"
  | "Sweets"
  | "Mixed";
type FormatFilter = "all" | "business" | "posts";

const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "icons", label: "Talk of the Town" },
  { value: "underrated", label: "Word of Mouth" },
  { value: "best-on-social", label: "Best on social" },
];

const CATEGORY_CHIPS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Restaurants", label: "Restaurants" },
  { value: "Cafes", label: "Cafes" },
  { value: "Bars", label: "Bars" },
  { value: "Sweets", label: "Sweets" },
  { value: "Mixed", label: "Mixed" },
];

const FORMAT_CHIPS: { value: FormatFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "business", label: "Business lists" },
  { value: "posts", label: "Creator posts" },
];

type Props = {
  cards: ListCardData[];
};

export function ListsBrowser({ cards }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const typeFilter = (searchParams.get("type") ?? "all") as TypeFilter;
  const categoryFilter = (searchParams.get("category") ?? "all") as CategoryFilter;
  const formatFilter = (searchParams.get("format") ?? "all") as FormatFilter;

  const hasAnyFilter =
    typeFilter !== "all" ||
    categoryFilter !== "all" ||
    formatFilter !== "all";

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const resetFilters = useCallback(() => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [pathname, router]);

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (typeFilter !== "all" && c.typeBucket !== typeFilter) return false;
      if (categoryFilter !== "all" && c.category !== categoryFilter) {
        return false;
      }
      if (formatFilter !== "all" && c.formatBucket !== formatFilter) {
        return false;
      }
      return true;
    });
  }, [cards, typeFilter, categoryFilter, formatFilter]);

  return (
    <div className="mt-12 md:mt-16">
      {/* Sticky filter bar */}
      <div className="sticky top-0 z-30 -mx-6 px-6 bg-brand-lavender/95 backdrop-blur border-y border-brand-black/10 py-4 md:py-5">
        <div className="space-y-3">
          <ChipRow
            label="Type"
            chips={TYPE_CHIPS}
            value={typeFilter}
            onChange={(v) => updateParams({ type: v })}
          />
          <ChipRow
            label="Category"
            chips={CATEGORY_CHIPS}
            value={categoryFilter}
            onChange={(v) => updateParams({ category: v })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <ChipRow
              label="Format"
              chips={FORMAT_CHIPS}
              value={formatFilter}
              onChange={(v) => updateParams({ format: v })}
              inline
            />
            {hasAnyFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto font-display text-[0.62rem] md:text-xs font-semibold uppercase tracking-[0.18em] px-3 py-1 text-brand-purple hover:text-brand-black underline decoration-brand-purple underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
                aria-label="Reset all filters"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
        <p
          aria-live="polite"
          className="mt-3 font-display text-[0.6rem] md:text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brand-black/60"
        >
          {hasAnyFilter
            ? `Showing ${filtered.length} of ${cards.length} lists`
            : `${cards.length} lists`}
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="mt-10 border-l-4 border-brand-purple bg-white/70 px-6 py-8 md:px-10 md:py-10 max-w-2xl">
          <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-xl md:text-2xl">
            No lists match that combination this issue.
          </h2>
          <p className="mt-3 font-body text-sm md:text-base text-brand-black/75 leading-relaxed">
            Try fewer filters, or reset and browse the full set.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-5 font-display text-xs font-semibold uppercase tracking-[0.18em] px-4 py-2 bg-brand-black text-brand-lime hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <section
          aria-label="Filtered lists"
          className="mt-8 md:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
        >
          {filtered.map((c) => (
            <ListCard
              key={c.slug}
              slug={c.slug}
              title={c.title}
              dek={c.dek}
              itemCount={c.itemCount}
              unit={c.unit}
              category={c.category}
              heroPhoto={c.heroPhoto}
              heroAlt={c.heroAlt}
            />
          ))}
        </section>
      )}
    </div>
  );
}

/* ---------- chip row ---------- */

type ChipRowProps<T extends string> = {
  label: string;
  chips: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  inline?: boolean;
};

function ChipRow<T extends string>({
  label,
  chips,
  value,
  onChange,
  inline,
}: ChipRowProps<T>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        inline ? "flex-1 min-w-0" : null,
      )}
      role="group"
      aria-label={`${label} filter`}
    >
      <span className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mr-1">
        {label}
      </span>
      {chips.map((chip) => {
        const active = chip.value === value;
        return (
          <button
            key={chip.value}
            type="button"
            onClick={() => onChange(chip.value)}
            aria-pressed={active}
            className={cn(
              "font-display text-[0.62rem] font-semibold uppercase tracking-[0.14em] px-2.5 py-1 transition-all border",
              active
                ? "bg-brand-black text-brand-lime border-brand-black"
                : "border-brand-black/20 text-brand-black/70 hover:bg-brand-cream hover:border-brand-black",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
