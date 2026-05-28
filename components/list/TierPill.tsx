import type { Tier } from "@/lib/data/schemas";

/**
 * TierPill, server-rendered tier chip for editorial list items.
 *
 * Mirrors the brand-token treatment in `TierBadge` but stays
 * static (no Framer Motion) so it can render inside a Server
 * Component without a client boundary.
 *
 * No numbers, no letter grades, no scores anywhere on the pill.
 */

const TIER_COPY: Record<Tier, string> = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
};

const TIER_STYLES: Record<Tier, string> = {
  icons: "bg-brand-lime text-brand-black rounded-sm",
  ones_to_watch: "bg-brand-purple text-brand-lavender rounded-full",
  neighborhood_staples: "bg-brand-cream text-brand-black rounded-full",
};

type TierPillProps = {
  tier: Tier;
  className?: string;
};

export function TierPill({ tier, className }: TierPillProps) {
  return (
    <span
      data-tier={tier}
      className={[
        "inline-flex items-center px-2.5 py-1 font-display text-[0.65rem] font-semibold uppercase tracking-[0.14em] whitespace-nowrap",
        TIER_STYLES[tier],
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {TIER_COPY[tier]}
    </span>
  );
}

export default TierPill;
