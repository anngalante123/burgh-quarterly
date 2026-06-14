"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TIER_LABELS } from "@/lib/tiers";

/**
 * PeerScoreboard, the editorial replacement for the 219-row "Where you sit"
 * list. Replaces the full-family wall with three position-aware layouts:
 *
 *   middle:  top 3 of family · tier divider · rival · you · one below
 *   top:     top 3 (you in there) · tier divider · first of next tier down
 *   bottom:  family #1 · tier dividers showing structure · one above you · you
 *
 * Editorial sentence above the scoreboard names a specific rival when one
 * exists. Templates here are intentionally simple; a richer Claude-generated
 * narrative can replace them on a future re-analyze pass.
 *
 * "Show all" expander reveals the full ranked list for readers who want it.
 */

type Tier = "icons" | "ones_to_watch" | "neighborhood_staples";

export type ScoreboardPeer = {
  slug: string;
  name: string;
  rank: number;
  tier?: Tier;
};

type Props = {
  currentSlug: string;
  /** Display label like "Bars" or "Sweets". */
  familyShort: string;
  /** All peers in the family, in rank order (composite descending). */
  peers: ScoreboardPeer[];
};

// 2026-06-12 rename: canonical labels, used in both divider sentences
// and the inline tier pills.
const TIER_SHORT: Record<Tier, string> = TIER_LABELS;

const TIER_PILL_CLASS: Record<Tier, string> = {
  icons: "bg-brand-lime text-brand-black",
  ones_to_watch: "bg-brand-purple text-brand-lavender",
  neighborhood_staples:
    "bg-brand-cream text-brand-black border border-brand-black/25",
};

type Position = "top" | "middle" | "bottom";

function classifyPosition(rank: number, total: number): Position {
  if (rank <= 3) return "top";
  if (rank >= total - 3 + 1) return "bottom";
  return "middle";
}

/** Find the index where `tier` first changes to a different value. */
function findTierBoundary(
  peers: ScoreboardPeer[],
  fromIdx: number,
  direction: 1 | -1,
): number {
  const startTier = peers[fromIdx]?.tier;
  let i = fromIdx + direction;
  while (i >= 0 && i < peers.length) {
    if (peers[i].tier !== startTier) return i;
    i += direction;
  }
  return -1;
}

/**
 * Build the editorial sentence based on position. Templates are tight and
 * fall back gracefully when a clean rival cannot be named.
 */
function buildSentence(
  position: Position,
  selfName: string,
  selfRank: number,
  selfTier: Tier | undefined,
  total: number,
  rival: ScoreboardPeer | null,
  familyShort: string,
  spotsToNextTier: number | null,
  nextTierLabel: string | null,
): string {
  if (position === "top") {
    if (rival) {
      return `${selfName} leads Pittsburgh ${familyShort}. The closest challenger is ${rival.name}, ${rival.rank - selfRank === 1 ? "one spot" : `${rival.rank - selfRank} spots`} behind.`;
    }
    return `${selfName} leads Pittsburgh ${familyShort} this issue.`;
  }
  if (position === "bottom") {
    if (rival) {
      return `${selfName} trails the industry. The closest peer with room to borrow from is ${rival.name}, ${selfRank - rival.rank === 1 ? "one spot" : `${selfRank - rival.rank} spots`} up.`;
    }
    return `${selfName} sits at the bottom of Pittsburgh ${familyShort} this issue.`;
  }
  // middle
  if (rival) {
    const gap =
      rival.rank === selfRank - 1
        ? "One spot ahead"
        : `${selfRank - rival.rank} spots ahead`;
    const rivalName = endPunct(rival.name);
    const rivalInDifferentTier = rival.tier && rival.tier !== selfTier;
    const rivalTierLabel = rival.tier ? TIER_SHORT[rival.tier] : null;
    const headline =
      rivalInDifferentTier && rivalTierLabel
        ? `${gap}, ${rivalName} sits in the ${rivalTierLabel} tier.`
        : `${gap} is ${rivalName}.`;
    if (spotsToNextTier !== null && nextTierLabel && !rivalInDifferentTier) {
      const tierLine =
        spotsToNextTier === 1
          ? `${nextTierLabel} starts one spot above.`
          : `${nextTierLabel} starts ${spotsToNextTier} spots up.`;
      return `${headline} ${tierLine}`;
    }
    return headline;
  }
  return `${selfName} sits #${selfRank} of ${total} in Pittsburgh ${familyShort}.`;
}

/**
 * Strip a trailing period if the business name already ends with one
 * (e.g. "Lawrenceville Distilling Co.") so we don't end up with
 * a double period in mid-sentence usage.
 */
function endPunct(name: string): string {
  return name.replace(/\.$/, "");
}

type ScoreboardRow =
  | { kind: "peer"; peer: ScoreboardPeer; isCurrent: boolean; isRival: boolean }
  | { kind: "divider"; label: string };

function buildRows(
  ranked: ScoreboardPeer[],
  selfIdx: number,
  position: Position,
): ScoreboardRow[] {
  const self = ranked[selfIdx];
  const rows: ScoreboardRow[] = [];
  if (!self) return rows;

  if (position === "top") {
    // Top 3 + tier-down boundary + first below-tier peer.
    const topBlock = ranked.slice(0, 3);
    for (const p of topBlock) {
      rows.push({
        kind: "peer",
        peer: p,
        isCurrent: p.slug === self.slug,
        isRival: false,
      });
    }
    const boundary = findTierBoundary(ranked, 2, 1);
    if (boundary !== -1) {
      const nextTier = ranked[boundary].tier;
      rows.push({
        kind: "divider",
        label: nextTier ? `${TIER_SHORT[nextTier]} below` : "next tier",
      });
      rows.push({
        kind: "peer",
        peer: ranked[boundary],
        isCurrent: false,
        isRival: false,
      });
    }
    return rows;
  }

  if (position === "bottom") {
    // Family #1 + tier-down dividers + closest higher-ranked + self.
    rows.push({
      kind: "peer",
      peer: ranked[0],
      isCurrent: ranked[0].slug === self.slug,
      isRival: false,
    });
    // Tier-down boundaries from #1 toward self.
    let cursor = 0;
    while (cursor < selfIdx) {
      const next = findTierBoundary(ranked, cursor, 1);
      if (next === -1 || next > selfIdx) break;
      const nextTier = ranked[next].tier;
      rows.push({
        kind: "divider",
        label: nextTier ? `${TIER_SHORT[nextTier]} starts` : "tier",
      });
      cursor = next;
    }
    // Closest higher-ranked peer = rival. rivalIdx > 0 already excludes
    // the family-#1 (ranked[0]) which was rendered above.
    const rivalIdx = selfIdx - 1;
    if (rivalIdx > 0) {
      rows.push({
        kind: "peer",
        peer: ranked[rivalIdx],
        isCurrent: false,
        isRival: true,
      });
    }
    rows.push({
      kind: "peer",
      peer: self,
      isCurrent: true,
      isRival: false,
    });
    return rows;
  }

  // middle
  const topBlock = ranked.slice(0, 3);
  for (const p of topBlock) {
    rows.push({
      kind: "peer",
      peer: p,
      isCurrent: false,
      isRival: false,
    });
  }
  // Tier-up boundary from self going up.
  const tierUpIdx = findTierBoundary(ranked, selfIdx, -1);
  if (tierUpIdx !== -1 && tierUpIdx > 2) {
    const nextTier = ranked[tierUpIdx].tier;
    rows.push({
      kind: "divider",
      label: nextTier
        ? `${selfIdx - tierUpIdx} spots to reach ${TIER_SHORT[nextTier]}`
        : "tier line",
    });
  }
  // Rival = peer immediately above self (within same tier preferable).
  const rivalIdx = selfIdx - 1;
  if (rivalIdx > 2) {
    rows.push({
      kind: "peer",
      peer: ranked[rivalIdx],
      isCurrent: false,
      isRival: true,
    });
  }
  // Self.
  rows.push({ kind: "peer", peer: self, isCurrent: true, isRival: false });
  // One below for anchor.
  if (selfIdx + 1 < ranked.length) {
    rows.push({
      kind: "peer",
      peer: ranked[selfIdx + 1],
      isCurrent: false,
      isRival: false,
    });
  }
  return rows;
}

export function PeerScoreboard({
  currentSlug,
  familyShort,
  peers,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const ranked = [...peers].sort((a, b) => a.rank - b.rank);
  const selfIdx = ranked.findIndex((p) => p.slug === currentSlug);
  if (selfIdx === -1) return null;
  const self = ranked[selfIdx];
  const total = ranked.length;
  const position = classifyPosition(self.rank, total);

  // Rival = closest higher-ranked for top/middle, closest higher-ranked also
  // for bottom (the "borrow from" reference). For top with rank 1, use #2.
  const rival: ScoreboardPeer | null =
    position === "top" && self.rank === 1
      ? ranked[1] ?? null
      : selfIdx > 0
        ? ranked[selfIdx - 1]
        : null;

  // Spots-to-next-tier-up info, used in the middle sentence.
  const tierUpIdx = findTierBoundary(ranked, selfIdx, -1);
  const spotsToNextTier =
    tierUpIdx !== -1 && tierUpIdx >= 0 ? selfIdx - tierUpIdx : null;
  const nextTierLabel =
    tierUpIdx !== -1 && ranked[tierUpIdx]?.tier
      ? TIER_SHORT[ranked[tierUpIdx].tier!]
      : null;

  const sentence = buildSentence(
    position,
    self.name,
    self.rank,
    self.tier,
    total,
    rival,
    familyShort,
    spotsToNextTier,
    nextTierLabel,
  );

  const rows = buildRows(ranked, selfIdx, position);

  return (
    <div className="mt-2">
      <p className="font-body text-sm md:text-base text-brand-black/85 leading-snug mb-5 max-w-2xl">
        {sentence}
      </p>

      <ol className="border-t border-brand-black/10">
        {rows.map((row, i) => {
          if (row.kind === "divider") {
            return (
              <li
                key={`div-${i}`}
                aria-hidden="true"
                className="flex items-center gap-3 py-2 text-brand-black/60"
              >
                <span className="flex-1 border-t border-dashed border-brand-black/20" />
                <span className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em]">
                  {row.label}
                </span>
                <span className="flex-1 border-t border-dashed border-brand-black/20" />
              </li>
            );
          }
          const peer = row.peer;
          const inner = (
            <div
              className={cn(
                "grid grid-cols-[2.75rem_1fr_auto] md:grid-cols-[3rem_1fr_auto] items-center gap-3 py-3 transition-all",
                row.isCurrent && "relative pl-3 -ml-3",
                row.isRival && "bg-brand-purple/5",
              )}
            >
              {row.isCurrent && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-2 bottom-2 w-1 bg-brand-lime"
                />
              )}
              <span
                className={cn(
                  "font-display font-black tabular-nums tracking-[-0.01em]",
                  row.isCurrent
                    ? "text-brand-black text-xl md:text-2xl"
                    : "text-brand-black/60 text-base md:text-lg",
                )}
              >
                #{peer.rank}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={cn(
                      "font-display tracking-[-0.01em] truncate",
                      row.isCurrent
                        ? "font-black text-base md:text-lg text-brand-black"
                        : "font-semibold text-sm md:text-base text-brand-black",
                    )}
                  >
                    {peer.name}
                    {row.isCurrent && (
                      <span className="ml-2 font-body text-[0.65rem] uppercase tracking-[0.14em] text-brand-black/55">
                        you
                      </span>
                    )}
                  </span>
                  {peer.tier && (
                    <span
                      className={cn(
                        "font-display text-[0.55rem] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 shrink-0",
                        TIER_PILL_CLASS[peer.tier],
                      )}
                    >
                      {TIER_SHORT[peer.tier]}
                    </span>
                  )}
                  {row.isRival && (
                    <span
                      className="font-display text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-brand-purple"
                      aria-label="closest higher-ranked peer"
                    >
                      ← rival
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
          return (
            <li
              key={`${peer.slug}-${i}`}
              className="border-b border-brand-black/10 last:border-b-0"
              aria-current={row.isCurrent ? "true" : undefined}
            >
              {row.isCurrent ? (
                inner
              ) : (
                <Link
                  href={`/business/${peer.slug}`}
                  className="block focus:outline-none focus-visible:bg-brand-cream/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple"
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        onClick={() => setShowAll((s) => !s)}
        className="mt-3 font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-purple hover:text-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
      >
        {showAll ? "Show fewer" : `See all ${total} in Pittsburgh ${familyShort} →`}
      </button>

      {showAll && (
        <ol className="mt-4 border-t border-brand-black/10">
          {ranked.map((peer) => {
            const isCurrent = peer.slug === currentSlug;
            const inner = (
              <div
                className={cn(
                  "grid grid-cols-[2.75rem_1fr_auto] md:grid-cols-[3rem_1fr_auto] items-center gap-3 py-2.5",
                  isCurrent && "relative pl-3 -ml-3",
                )}
              >
                {isCurrent && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-brand-lime"
                  />
                )}
                <span
                  className={cn(
                    "font-display font-black tabular-nums tracking-[-0.01em]",
                    isCurrent
                      ? "text-brand-black text-base md:text-lg"
                      : "text-brand-black/60 text-sm md:text-base",
                  )}
                >
                  #{peer.rank}
                </span>
                <span
                  className={cn(
                    "font-display tracking-[-0.01em] truncate",
                    isCurrent
                      ? "font-black text-sm md:text-base text-brand-black"
                      : "font-semibold text-sm text-brand-black",
                  )}
                >
                  {peer.name}
                  {isCurrent && (
                    <span className="ml-2 font-body text-[0.6rem] uppercase tracking-[0.14em] text-brand-black/55">
                      you
                    </span>
                  )}
                </span>
                {peer.tier && (
                  <span
                    className={cn(
                      "font-display text-[0.55rem] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 shrink-0",
                      TIER_PILL_CLASS[peer.tier],
                    )}
                  >
                    {TIER_SHORT[peer.tier]}
                  </span>
                )}
              </div>
            );
            return (
              <li
                key={peer.slug}
                className="border-b border-brand-black/10 last:border-b-0"
                aria-current={isCurrent ? "true" : undefined}
              >
                {isCurrent ? (
                  inner
                ) : (
                  <Link
                    href={`/business/${peer.slug}`}
                    className="block hover:bg-brand-cream/40 focus:outline-none focus-visible:bg-brand-cream/60"
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
