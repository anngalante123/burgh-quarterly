import type { Tier } from "@/lib/data/schemas";
import { TierBadge } from "./TierBadge";
import { AnimatedRank } from "./motion/AnimatedRank";
import { cn } from "@/lib/utils";

/**
 * ScoreCard, the public-facing rank display for a business page.
 *
 * HARD RULE (SCORING_RUBRIC.md + EDITORIAL_VOICE.md § Gap, not grade):
 *   - Never show the raw composite score number on public pages.
 *   - Public view shows tier label + rank + movement only.
 *   - "Distance to next tier" framing is PRIVATE, only appears on claimed
 *     pages (when `claimed=true`).
 *
 * Movement strings are intentionally short:
 *   "+3" (climbed), "-1" (dropped), "=" (held), "Debut" (first issue).
 *
 * Motion (modernization pass):
 *   - Category rank number counts up from 0 to final value over ~1s on mount.
 *     Triggers ONCE per page load. Reduced-motion users see the final value.
 *   - Neighborhood rank is not animated (kept quiet, secondary datapoint).
 */

type Movement = number | "Debut" | null;

type ScoreCardProps = {
  tier: Tier;
  categoryLabel: string; // e.g. "Pittsburgh Bakeries"
  neighborhoodLabel: string; // e.g. "Lawrenceville"
  rankCategory: number;
  rankNeighborhood: number;
  movement: Movement;
  /**
   * Private/claimed-only view. When true, we may surface gap-to-next-tier copy.
   * We still never show the raw composite score.
   */
  claimed?: boolean;
  /**
   * Only used when `claimed` is true, the distance-to-next-tier phrase,
   * e.g. "6 points from In the Conversation". Null when already top-tier.
   */
  gapToNextTier?: string | null;
};

function formatMovement(m: Movement): {
  label: string;
  symbol: string;
  tone: "up" | "down" | "flat" | "debut";
} {
  if (m === "Debut") return { label: "Debut", symbol: "★", tone: "debut" };
  if (m === null) return { label: ",", symbol: ",", tone: "flat" };
  if (m > 0) return { label: `+${m}`, symbol: "↑", tone: "up" };
  if (m < 0) return { label: `${m}`, symbol: "↓", tone: "down" };
  return { label: "=", symbol: "=", tone: "flat" };
}

export function ScoreCard({
  tier,
  categoryLabel,
  neighborhoodLabel,
  rankCategory,
  rankNeighborhood,
  movement,
  claimed = false,
  gapToNextTier = null,
}: ScoreCardProps) {
  const mv = formatMovement(movement);
  const toneClass = {
    up: "text-brand-black bg-brand-lime",
    down: "text-brand-lavender bg-brand-black",
    flat: "text-brand-black/70 bg-brand-cream",
    debut: "text-brand-lavender bg-brand-purple",
  }[mv.tone];

  return (
    <section
      aria-label="Rank and tier"
      className="border border-brand-black/15 bg-white/60 p-6 md:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-4">
          <TierBadge tier={tier} />
          <div className="space-y-1">
            <p className="font-display text-3xl md:text-4xl font-black tracking-[-0.01em] text-brand-black">
              <AnimatedRank value={rankCategory} prefix="#" />{" "}
              <span className="font-body font-medium text-base md:text-lg text-brand-black/70 normal-case">
                in {categoryLabel}
              </span>
            </p>
            <p className="font-body text-sm text-brand-black/70">
              #{rankNeighborhood} in {neighborhoodLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span className="font-body text-[0.7rem] uppercase tracking-[0.14em] text-brand-black/50">
            Movement
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-display font-black uppercase tracking-[0.06em] text-sm",
              toneClass,
            )}
          >
            <span aria-hidden="true">{mv.symbol}</span>
            <span>{mv.label}</span>
          </span>
        </div>
      </div>

      {claimed && gapToNextTier && (
        <p className="mt-6 pt-6 border-t border-brand-black/10 font-body text-sm text-brand-black/75">
          <span className="font-display font-semibold uppercase tracking-[0.12em] text-[0.7rem] text-brand-purple">
            Private view ·{" "}
          </span>
          {gapToNextTier}
        </p>
      )}
    </section>
  );
}

export default ScoreCard;
