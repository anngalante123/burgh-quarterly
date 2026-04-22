import Link from "next/link";
import { TierBadge } from "@/components/TierBadge";
import type { Tier } from "@/lib/data/schemas";
import { cn } from "@/lib/utils";
import { PreviewBadge } from "./PreviewBadge";

/**
 * PeerPulse — mini-leaderboard of 4-5 named neighborhood peers.
 *
 * Shows the current business in the context of its neighborhood cohort.
 * The current business row is highlighted (lime accent bar + bolder ink).
 *
 * Voice stays quiet/factual — this block lives inside the business page
 * (quiet record zone per D-006). No editorializing; just rank + name +
 * one-line distinguishing signal per peer.
 */

export type PeerRow = {
  name: string;
  slug: string;
  rank: number;
  tier: Tier;
  distinguishingSignal: string;
};

type PeerPulseProps = {
  businessSlug: string;
  neighborhood: string;
  peers?: PeerRow[];
};

const DEFAULT_PEERS: PeerRow[] = [
  {
    name: "La Gourmandine",
    slug: "la-gourmandine-lawrenceville",
    rank: 1,
    tier: "icons",
    distinguishingSignal: "88% five-star review rate",
  },
  {
    name: "Driftwood Oven",
    slug: "driftwood-oven",
    rank: 2,
    tier: "icons",
    distinguishingSignal: "Sunday focaccia waits out the door",
  },
  {
    name: "Madeleine Bakery",
    slug: "madeleine-bakery",
    rank: 3,
    tier: "ones_to_watch",
    distinguishingSignal: "Fastest review velocity on Butler St.",
  },
  {
    name: "Butterjoint Pastry",
    slug: "butterjoint-pastry",
    rank: 4,
    tier: "ones_to_watch",
    distinguishingSignal: "12 new reels this quarter",
  },
  {
    name: "Allegheny Croissant Co.",
    slug: "allegheny-croissant",
    rank: 5,
    tier: "neighborhood_staples",
    distinguishingSignal: "Most returning-visitor mentions",
  },
];

export function PeerPulse({
  businessSlug,
  neighborhood,
  peers = DEFAULT_PEERS,
}: PeerPulseProps) {
  return (
    <section
      aria-label={`Peer pulse — ${neighborhood}`}
      className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-4 gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
            Peer pulse
          </h3>
          <PreviewBadge />
        </div>
        <p className="font-body text-xs text-brand-black/55">
          {neighborhood} · {peers.length} businesses
        </p>
      </div>

      <ol className="divide-y divide-brand-black/10">
        {peers.map((peer) => {
          const isCurrent = peer.slug === businessSlug;
          return (
            <li
              key={peer.slug}
              className={cn(
                "flex items-start gap-3 py-3 first:pt-0 last:pb-0",
                isCurrent && "relative pl-3 -ml-3",
              )}
            >
              {isCurrent && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-3 bottom-3 w-1 bg-brand-lime"
                />
              )}
              <span
                className={cn(
                  "shrink-0 font-display font-black tabular-nums text-base md:text-lg w-7 text-right",
                  isCurrent ? "text-brand-black" : "text-brand-black/50",
                )}
              >
                {peer.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {isCurrent ? (
                    <span
                      className={cn(
                        "font-display font-black tracking-[-0.01em] text-base md:text-lg text-brand-black",
                      )}
                    >
                      {peer.name}
                    </span>
                  ) : (
                    <Link
                      href={`/business/${peer.slug}`}
                      className="font-display font-semibold tracking-[-0.01em] text-base md:text-lg text-brand-black hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
                    >
                      {peer.name}
                    </Link>
                  )}
                  <TierBadge tier={peer.tier} size="sm" />
                </div>
                <p className="mt-0.5 font-body text-xs md:text-sm text-brand-black/65 leading-snug">
                  {peer.distinguishingSignal}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default PeerPulse;
