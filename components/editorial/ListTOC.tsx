import { cn } from "@/lib/utils";

/**
 * ListTOC, "In this list" table of contents. A horizontal strip of
 * numbered entries as anchor-jump links. Sits between the standfirst
 * and the first entry, gives readers a skimmable roadmap of the piece.
 *
 * Anchors are stable: the entry sections render with `id={toAnchor(i)}`.
 */

export type TOCItem = {
  /** Display name of the entry (business name). */
  name: string;
};

type ListTOCProps = {
  items: TOCItem[];
  /** Section heading, usually "In this list". */
  heading?: string;
};

export function toEntryAnchor(index: number): string {
  return `entry-${String(index + 1).padStart(2, "0")}`;
}

export function ListTOC({ items, heading = "In this list" }: ListTOCProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={heading}
      className="border-y border-brand-black/15 py-5 md:py-6"
    >
      <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-3">
        {heading}
      </p>
      <ol className="flex flex-col md:flex-row md:flex-wrap gap-x-6 gap-y-2 md:gap-y-3">
        {items.map((item, i) => (
          <li key={i}>
            <a
              href={`#${toEntryAnchor(i)}`}
              className={cn(
                "group inline-flex items-baseline gap-2 font-body text-sm md:text-base",
                "text-brand-black/85 hover:text-brand-purple",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
              )}
            >
              <span className="font-display text-[0.65rem] font-semibold tabular-nums tracking-[0.14em] text-brand-purple">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="group-hover:underline decoration-brand-lime decoration-2 underline-offset-4">
                {item.name}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
