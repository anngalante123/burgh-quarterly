import Link from "next/link";
import { TIER_LABELS, TIER_STYLE, type TierKey } from "@/lib/tiers";
import type { Office } from "@/lib/data";

export function TierBadge({ tier }: { tier: TierKey }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${TIER_STYLE[tier].badge}`}
    >
      {TIER_LABELS[tier]}
    </span>
  );
}

export function IndexTable({ offices }: { offices: Office[] }) {
  return (
    <ol className="divide-y divide-brand-black/10 border-y border-brand-black/10">
      {offices.map((office) => (
        <li key={office.slug}>
          <Link
            href={`/office/${office.slug}`}
            className="group flex items-center gap-4 py-4 transition-colors hover:bg-brand-newsprint-warm/60 sm:gap-5"
          >
            <span className="tabular w-8 shrink-0 text-right text-sm text-brand-slate sm:w-10 sm:text-base">
              {office.rank}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold group-hover:underline">
                {office.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-brand-slate">
                {office.city ? `${office.city}, ` : ""}
                {office.state} · {office.orgType}
              </span>
            </span>

            {office.rankTier && (
              <span className="shrink-0">
                <TierBadge tier={office.rankTier} />
              </span>
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * Offices we could not measure on enough of the index to rank honestly.
 * They are published, not hidden — omitting them would silently overstate
 * coverage.
 */
export function UnmeasuredList({ offices }: { offices: Office[] }) {
  if (!offices.length) return null;
  return (
    <div className="mt-10 rounded-lg border border-brand-terracotta/40 bg-brand-terracotta/[0.06] p-5">
      <h3 className="text-sm font-semibold">
        Not yet measured · {offices.length}
      </h3>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-brand-slate">
        These offices publish sites that turn away automated requests, so most
        of the index could not be read. They are listed rather than ranked. An
        unread signal is not a weak one, and we will not imply otherwise.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {offices.map((o) => (
          <li key={o.slug}>
            <Link
              href={`/office/${o.slug}`}
              className="text-brand-black/70 underline decoration-brand-black/20 underline-offset-2 hover:text-brand-black"
            >
              {o.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
