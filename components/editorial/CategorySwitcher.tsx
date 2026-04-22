import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  UNDERRATED_CATEGORIES,
  type UnderratedCategorySlug,
} from "@/lib/data/underrated";

/**
 * CategorySwitcher, horizontal pill-tab bar showing available categories
 * for a given list section (Underrated or Top). The active slug gets the
 * lime highlight; the rest are purple-outlined links. If there's only one
 * category live, the bar still renders with a "More coming next issue"
 * hint so readers know the list will grow.
 *
 * Both Underrated and Top use the SAME category registry
 * (UNDERRATED_CATEGORIES), the two lists always stay in sync about what
 * "bakeries" means.
 */

type CategorySwitcherProps = {
  /** The route base, "/underrated" or "/top". */
  basePath: "/underrated" | "/top";
  /** The currently active category slug. */
  current: UnderratedCategorySlug;
};

export function CategorySwitcher({
  basePath,
  current,
}: CategorySwitcherProps) {
  const slugs = Object.keys(
    UNDERRATED_CATEGORIES,
  ) as UnderratedCategorySlug[];

  return (
    <nav
      aria-label="Category switcher"
      className="flex flex-wrap items-center gap-2 md:gap-3"
    >
      <span className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mr-1 md:mr-2">
        Category
      </span>
      <ul className="flex flex-wrap items-center gap-2">
        {slugs.map((slug) => {
          const spec = UNDERRATED_CATEGORIES[slug];
          const isCurrent = slug === current;
          return (
            <li key={slug}>
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="inline-flex items-center bg-brand-lime text-brand-black font-display text-xs font-semibold uppercase tracking-[0.14em] px-3 py-1.5"
                >
                  {spec.label}
                </span>
              ) : (
                <Link
                  href={`${basePath}/${slug}`}
                  className="inline-flex items-center border border-brand-black/20 text-brand-black/70 font-display text-xs font-semibold uppercase tracking-[0.14em] px-3 py-1.5 hover:bg-brand-cream hover:text-brand-black hover:border-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
                >
                  {spec.label}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {slugs.length < 3 && (
        <span className="font-body text-[0.68rem] text-brand-black/50 ml-1">
          More categories next issue →
        </span>
      )}
    </nav>
  );
}
