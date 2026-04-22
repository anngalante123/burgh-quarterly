import type { Tier } from "@/lib/data/schemas";
import { AnimatedRank } from "@/components/motion/AnimatedRank";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

/**
 * ScoreHero, the big visual anchor at the top of a business page.
 *
 * Replaces the old ScoreCard as the page's primary rank display. Ports the
 * "giant tier phrase + rank + movement chip" aesthetic from the Pittsburgh
 * Social Scorecard HTML reference into Signal Pittsburgh's editorial system.
 *
 * HARD RULES (DESIGN_DIRECTION.md + EDITORIAL_VOICE.md § Gap, not grade):
 *   - Never display the raw composite score number.
 *   - Never display a letter grade.
 *   - Only the TIER PHRASE is shown at display scale, no number on the anchor.
 *   - Gap-to-next-tier framing only appears in the "Private view" strip
 *     (claimed pages only).
 */

const TIER_COPY: Record<Tier, string> = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
};

// Per-tier stance, telegraphs what the tier means without falling back to
// "taste" framing. The methodology block on the homepage tells readers we
// rank the conversation (reviews, sentiment, photos, Instagram, momentum);
// these sentences assume that and don't re-explain.
const TIER_STANCE: Record<Tier, string> = {
  icons: "Top of the index this quarter, reviews, photos, and momentum all moving.",
  ones_to_watch:
    "Strong presence. Climbing the index.",
  neighborhood_staples:
    "Rooted in the neighborhood, the index hasn't caught up yet.",
};

type Movement = number | "Debut" | null;

type ScoreHeroProps = {
  tier: Tier;
  categoryLabel: string; // e.g. "Pittsburgh Bakeries"
  neighborhoodLabel: string; // e.g. "Lawrenceville"
  rankCategory: number;
  rankNeighborhood: number;
  movement: Movement;
  claimed?: boolean;
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

// Tier accent, every tier gets a distinct on-brand color that tints the
// stamp stripe + the rank prefix. Keeps the card bg consistent black while
// letting the tier read at a glance.
const TIER_ACCENT: Record<Tier, string> = {
  icons: "text-brand-lime",
  ones_to_watch: "text-brand-purple",
  neighborhood_staples: "text-brand-cream",
};

export function ScoreHero({
  tier,
  categoryLabel,
  neighborhoodLabel,
  rankCategory,
  rankNeighborhood,
  movement,
  claimed = false,
  gapToNextTier = null,
}: ScoreHeroProps) {
  const mv = formatMovement(movement);
  const toneClass = {
    // Climb, lime on black card reads loud.
    up: "text-brand-black bg-brand-lime",
    // Drop, muted cream pill with black text, quiet (we don't punish).
    down: "text-brand-black bg-brand-cream",
    // Neutral holding / no data.
    flat: "text-brand-off-white/70 bg-brand-off-white/10 border border-brand-off-white/20",
    // Debut, purple pill for first-issue businesses.
    debut: "text-brand-off-white bg-brand-purple",
  }[mv.tone];

  const accent = TIER_ACCENT[tier];

  return (
    <Reveal as="section" className="block">
      <div
        aria-label="Rank and tier"
        className="relative overflow-hidden bg-brand-black text-brand-off-white px-6 py-8 md:px-10 md:py-12"
      >
        {/* Diagonal tier accent stripe, tier-colored, bleeds off the right */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute -right-16 top-0 bottom-0 w-24 opacity-10 rotate-[8deg] bg-current",
            accent,
          )}
        />

        {/* Stamp row */}
        <div className="relative flex items-center justify-between gap-4 mb-6 md:mb-8">
          <span
            className={cn(
              "font-display text-[0.65rem] md:text-xs font-semibold uppercase tracking-[0.22em] bg-brand-off-white/8 border border-brand-off-white/15 px-2.5 py-1",
              accent,
            )}
          >
            PGH · Signal Index
          </span>
          <div className="flex flex-col items-end gap-1">
            <span className="font-body text-[0.6rem] uppercase tracking-[0.22em] text-brand-off-white/55">
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

        {/* The anchor: the tier phrase at display scale. Fluid clamp so it
            scales continuously from narrow mobile (32px floor) to wide
            desktop (72px ceiling), no breakpoint jumps. */}
        <h2 className="relative font-display font-black uppercase tracking-[-0.025em] text-brand-off-white [text-wrap:balance] [word-break:break-word] text-[clamp(2rem,6vw,4.5rem)] leading-[0.92]">
          {TIER_COPY[tier]}
        </h2>

        {/* Tier stance */}
        <p className="relative mt-3 md:mt-4 font-body text-sm md:text-base text-brand-off-white/70 max-w-xl leading-relaxed">
          {TIER_STANCE[tier]}
        </p>

        {/* Rank row */}
        <div className="relative mt-6 md:mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <p className="font-display text-xl md:text-2xl font-black tracking-[-0.01em] text-brand-off-white">
            <span className={accent}>
              <AnimatedRank value={rankCategory} prefix="#" />
            </span>{" "}
            <span className="font-body font-medium text-sm md:text-base text-brand-off-white/70 normal-case">
              in {categoryLabel}
            </span>
          </p>
          <p className="font-body text-sm text-brand-off-white/55">
            <span className={accent}>#{rankNeighborhood}</span> in{" "}
            {neighborhoodLabel}
          </p>
        </div>

        {/* Private view strip, only when claimed AND gap copy provided */}
        {claimed && gapToNextTier && (
          <p className="relative mt-8 pt-6 border-t border-brand-off-white/20 font-body text-sm text-brand-off-white/85">
            <span className="font-display font-semibold uppercase tracking-[0.12em] text-[0.7rem] text-brand-lime">
              Private view ·{" "}
            </span>
            {gapToNextTier}
          </p>
        )}
      </div>
    </Reveal>
  );
}

export default ScoreHero;
