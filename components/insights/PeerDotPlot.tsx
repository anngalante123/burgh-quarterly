import { Reveal } from "@/components/motion/Reveal";
import { PeerScoreboard } from "@/components/insights/PeerScoreboard";
import { TierProportionBar } from "@/components/insights/TierProportionBar";

/**
 * PeerDotPlot, the "Where you sit" section header.
 *
 * History: this used to render a per-business dot strip plus its own
 * ranked list and hover popovers. The dot strip overlapped its own labels
 * once N exceeded ~15 and gave readers no spatial sense of the family's
 * tier shape; the inline ranked list duplicated what the new editorial
 * scoreboard does with sub-category-scoped peers. As of 2026-05-09 the
 * component is a thin wrapper around two purpose-built children:
 *
 *   TierProportionBar  proportional 3-zone bar showing the family tier
 *                      shape, with one YOU marker.
 *   PeerScoreboard     editorial sentence + tight named-row scoreboard.
 *
 * The component name is preserved because callers already wire it up by
 * that name; we kept the prop shape too.
 */

type Tier = "icons" | "ones_to_watch" | "neighborhood_staples";

type PeerDot = {
  slug: string;
  name: string;
  rank: number;
  tier?: Tier;
  distinguishingSignal?: string;
};

type PeerDotPlotProps = {
  currentSlug: string;
  /** Family display label, e.g. "Pittsburgh Italian Restaurants". */
  category: string;
  peers: PeerDot[];
};

export function PeerDotPlot({
  currentSlug,
  category,
  peers,
}: PeerDotPlotProps) {
  const categoryShort = category.replace(/^Pittsburgh\s+/, "");

  return (
    <Reveal as="section" className="block">
      <div aria-label={`Where you sit in ${categoryShort}`}>
        <div className="border-b border-brand-black/15 pb-3 mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
            Where you sit in {categoryShort}
          </h2>
          <span className="font-body text-[0.65rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/50">
            {peers.length} in this industry
          </span>
        </div>

        <TierProportionBar
          currentSlug={currentSlug}
          peers={peers.map((p) => ({
            slug: p.slug,
            name: p.name,
            rank: p.rank,
            tier: p.tier,
          }))}
        />

        <PeerScoreboard
          currentSlug={currentSlug}
          familyShort={categoryShort}
          peers={peers.map((p) => ({
            slug: p.slug,
            name: p.name,
            rank: p.rank,
            tier: p.tier,
          }))}
        />
      </div>
    </Reveal>
  );
}
