"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

/**
 * PeerDotPlot — dual-view leaderboard.
 *
 * Design direction (2026-04-22, /product-delight + /ui-ux pass):
 *   Previous single-line dot plot was too abstract — a reader couldn't tell
 *   which dot was which business without hovering one at a time. New design:
 *
 *     1. Compact tier-colored dot row at the top (spatial at-a-glance)
 *     2. Ranked list below (name-level scannability)
 *     3. Cross-highlighting: hover a list row → corresponding dot grows;
 *        hover a dot → corresponding list row highlights
 *
 * Dots are colored by tier so the reader gets a visual census without
 * clicking. Current business's dot pulses once on mount (delight hook —
 * "you are here" made into a micro-celebration).
 *
 * Brand kit check (2026-04-22, BrandKit.pen):
 *   Icons                 → lime   #C6F432
 *   Ones to Watch         → purple #AB35EE
 *   Neighborhood Staples  → terracotta #D97757 (second accent)
 *   Current business      → lime + ring-2 ring-brand-black + size-up + pulse
 *
 * Interactions:
 *   - Desktop: hover a dot → editorial popover with connector line
 *   - Mobile: tap a dot → popover appears (tap outside dismisses)
 *   - Hover a list row → corresponding dot enlarges and glows
 *   - Click a list row → opens the peer's business page
 *   - Esc key dismisses any open popover
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
  category: string; // "Pittsburgh Sweets" (family label)
  peers: PeerDot[];
};

const TIER_SHORT: Record<Tier, string> = {
  icons: "Icons",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Staple",
};

const TIER_PILL_CLASS: Record<Tier, string> = {
  icons: "bg-brand-lime text-brand-black",
  ones_to_watch: "bg-brand-purple text-brand-off-white",
  neighborhood_staples: "bg-brand-cream text-brand-black",
};

/**
 * Tier → dot fill. Current business uses this color too, but with a
 * ring-2 ring-brand-black around it so it reads as the anchor.
 */
const TIER_DOT_CLASS: Record<Tier, string> = {
  icons: "bg-brand-lime",
  ones_to_watch: "bg-brand-purple",
  // Staples uses a cream fill with a black ring so it's on-brand (brand
  // palette is purple/lime/black/lavender/cream — no terracotta) and still
  // visually distinct from the other two tiers on the plot.
  neighborhood_staples: "bg-brand-cream ring-1 ring-brand-black/60",
};

export function PeerDotPlot({
  currentSlug,
  category,
  peers,
}: PeerDotPlotProps) {
  const reduced = useReducedMotion();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  // Open/close helpers with a short close-delay so the cursor can bridge
  // the gap between the dot and the popover without the popover "blurring
  // away" mid-move. Anna flagged this 2026-04-22. 220ms is enough room for
  // most users without feeling sticky.
  const openPopover = (slug: string) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setActiveSlug(slug);
  };
  const scheduleClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setActiveSlug(null);
      closeTimerRef.current = null;
    }, 350);
  };

  useEffect(() => {
    if (!activeSlug) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setActiveSlug(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveSlug(null);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [activeSlug]);

  // Cleanup any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (peers.length === 0) return null;

  const ranks = peers.map((p) => p.rank);
  const firstRank = Math.min(...ranks);
  const lastRank = Math.max(...ranks);
  const span = Math.max(1, lastRank - firstRank);

  function pct(rank: number): number {
    if (span === 0) return 0;
    return ((rank - firstRank) / span) * 100;
  }

  const categoryShort = category.replace(/^Pittsburgh\s+/, "");

  const sortedForStagger = [...peers].sort((a, b) => a.rank - b.rank);
  const staggerIndex = new Map(
    sortedForStagger.map((p, i) => [p.slug, i] as const),
  );

  const currentPeer = peers.find((p) => p.slug === currentSlug);

  return (
    <Reveal as="section" className="block">
      <div aria-label={`Where you sit in ${categoryShort}`}>
        <div className="border-b border-brand-black/15 pb-3 mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
            Where you sit in {categoryShort}
          </h2>
          <span className="font-body text-[0.65rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/50">
            {peers.length} in this family
          </span>
        </div>

        {/* Legend — brand-compliant tier colors up front */}
        <ul className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-body text-[0.65rem] md:text-xs text-brand-black/65">
          <LegendDot className="bg-brand-lime ring-1 ring-brand-black/15" label="Icons of the Burgh" />
          <LegendDot className="bg-brand-purple" label="Ones to Watch" />
          <LegendDot className="bg-brand-cream ring-1 ring-brand-black/60" label="Neighborhood Staple" />
        </ul>

        <div ref={containerRef}>
          {/* ── Dot row ─────────────────────────────────────────────── */}
          <div className="relative pt-16 md:pt-20 pb-8">
            {reduced ? (
              <div
                className="absolute left-0 right-0 top-[calc(theme(spacing.16)+0.75rem)] md:top-[calc(theme(spacing.20)+0.75rem)] h-px bg-brand-black/20"
                aria-hidden="true"
              />
            ) : (
              <motion.div
                className="absolute left-0 right-0 top-[calc(theme(spacing.16)+0.75rem)] md:top-[calc(theme(spacing.20)+0.75rem)] h-px bg-brand-black/20 origin-left"
                aria-hidden="true"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              />
            )}

            <div className="relative h-6">
              {peers.map((peer) => {
                const isCurrent = peer.slug === currentSlug;
                const isHovered = hoveredSlug === peer.slug;
                const isActive = activeSlug === peer.slug;
                const leftPct = pct(peer.rank);
                const idx = staggerIndex.get(peer.slug) ?? 0;

                return (
                  <div
                    key={peer.slug}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${leftPct}%` }}
                  >
                    <Dot
                      peer={peer}
                      isCurrent={isCurrent}
                      isActive={isActive}
                      isHovered={isHovered}
                      idx={idx}
                      reduced={!!reduced}
                      onToggle={() =>
                        isActive
                          ? setActiveSlug(null)
                          : openPopover(peer.slug)
                      }
                      onOpen={() => openPopover(peer.slug)}
                      onClose={scheduleClose}
                      onHoverStart={() => setHoveredSlug(peer.slug)}
                      onHoverEnd={() => setHoveredSlug(null)}
                    />

                    {/* Mini rank label under every dot — persistent */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute left-1/2 -translate-x-1/2 top-[calc(100%+0.25rem)] font-display text-[0.58rem] font-semibold tabular-nums tracking-[0.14em] transition-colors",
                        isCurrent
                          ? "text-brand-black"
                          : "text-brand-black/45 group-hover:text-brand-black",
                      )}
                    >
                      #{peer.rank}
                    </span>

                    {/* Popover */}
                    <AnimatePresence>
                      {isActive && (
                        <PeerPopover
                          peer={peer}
                          category={categoryShort}
                          reduced={!!reduced}
                          isCurrent={isCurrent}
                          onMouseEnter={() => openPopover(peer.slug)}
                          onMouseLeave={scheduleClose}
                        />
                      )}
                    </AnimatePresence>

                    {/* Current business "YOU ARE HERE" badge */}
                    {isCurrent && !isActive && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+0.5rem)] whitespace-nowrap"
                      >
                        <span className="inline-block bg-brand-black text-brand-lime font-display text-[0.58rem] font-semibold uppercase tracking-[0.18em] px-2 py-0.5">
                          You are here
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Axis range labels */}
            <div className="mt-8 flex items-center justify-between font-body text-[0.6rem] tracking-[0.18em] uppercase text-brand-black/45">
              <span>Top of family</span>
              <span>Bottom of family</span>
            </div>
          </div>

          {/* ── Ranked list ─────────────────────────────────────────── */}
          <div className="mt-2">
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55 mb-3">
              The full family
            </p>
            <ol className="border-t border-brand-black/10">
              {[...peers].sort((a, b) => a.rank - b.rank).map((peer, i) => {
                const isCurrent = peer.slug === currentSlug;
                const isHovered = hoveredSlug === peer.slug;
                const isActive = activeSlug === peer.slug;
                const isHighlighted = isHovered || isActive;

                const rowInner = (
                  <div
                    className={cn(
                      "grid grid-cols-[2.5rem_1fr_auto] md:grid-cols-[3rem_1fr_auto] items-center gap-3 py-3 transition-all",
                      isCurrent && "relative pl-3 -ml-3",
                      isHighlighted && !isCurrent && "bg-brand-cream/40",
                    )}
                  >
                    {isCurrent && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-2 bottom-2 w-1 bg-brand-lime"
                      />
                    )}
                    <span
                      className={cn(
                        "font-display font-black tabular-nums tracking-[-0.01em]",
                        isCurrent
                          ? "text-brand-black text-xl md:text-2xl"
                          : "text-brand-black/45 text-base md:text-lg",
                      )}
                    >
                      #{peer.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span
                          className={cn(
                            "font-display tracking-[-0.01em] truncate",
                            isCurrent
                              ? "font-black text-base md:text-lg text-brand-black"
                              : "font-semibold text-sm md:text-base text-brand-black",
                          )}
                        >
                          {peer.name}
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
                      {peer.distinguishingSignal && (
                        <p className="mt-0.5 font-body text-[0.72rem] md:text-xs text-brand-black/60 leading-snug">
                          {peer.distinguishingSignal}
                        </p>
                      )}
                    </div>
                    {/* Mini dot — mirror of the plot, reinforces mapping */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "shrink-0 block rounded-full transition-all",
                        peer.tier ? TIER_DOT_CLASS[peer.tier] : "bg-brand-black/40",
                        isCurrent ? "w-4 h-4 ring-2 ring-brand-black" : "w-2.5 h-2.5",
                        isHighlighted && !isCurrent && "w-3.5 h-3.5",
                      )}
                    />
                  </div>
                );

                return (
                  <li
                    key={peer.slug}
                    className="border-b border-brand-black/10 last:border-b-0"
                    onMouseEnter={() => {
                      setHoveredSlug(peer.slug);
                      openPopover(peer.slug);
                    }}
                    onMouseLeave={() => {
                      setHoveredSlug(null);
                      scheduleClose();
                    }}
                  >
                    {isCurrent ? (
                      rowInner
                    ) : (
                      <Link
                        href={`/business/${peer.slug}`}
                        className="block focus:outline-none focus-visible:bg-brand-cream/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple"
                      >
                        {rowInner}
                      </Link>
                    )}
                    {/* Motion wrapper for stagger reveal */}
                    {!reduced && (
                      <motion.div
                        aria-hidden="true"
                        initial={{ opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{
                          duration: 0.35,
                          delay: 0.25 + i * 0.04,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <p className="mt-6 font-body text-[0.72rem] md:text-xs text-brand-black/55 leading-relaxed">
          Each dot is a business in {categoryShort}. The lime dot with the
          black ring is{" "}
          {currentPeer ? (
            <span className="font-medium text-brand-black">
              {currentPeer.name}
            </span>
          ) : (
            "you"
          )}
          .{" "}
          <span className="hidden md:inline">Hover a row</span>
          <span className="md:hidden">Tap a row</span> to jump to that
          record.
        </p>
      </div>
    </Reveal>
  );
}

/* ------------------------------ Legend dot ---------------------------- */

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn("inline-block h-2 w-2 rounded-full", className)}
      />
      <span>{label}</span>
    </li>
  );
}

/* ------------------------------ Dot ----------------------------------- */

function Dot({
  peer,
  isCurrent,
  isActive,
  isHovered,
  idx,
  reduced,
  onToggle,
  onOpen,
  onClose,
  onHoverStart,
  onHoverEnd,
}: {
  peer: PeerDot;
  isCurrent: boolean;
  isActive: boolean;
  isHovered: boolean;
  idx: number;
  reduced: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onClose: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const sizeClass = isCurrent
    ? "w-5 h-5 md:w-5 md:h-5"
    : isHovered || isActive
      ? "w-4 h-4"
      : "w-3 h-3 md:w-3 md:h-3";
  const colorClass = peer.tier ? TIER_DOT_CLASS[peer.tier] : "bg-brand-black/50";
  const ringClass = isCurrent
    ? "ring-2 ring-brand-black"
    : isActive
      ? "ring-2 ring-brand-black/50"
      : "";

  // Larger invisible hit area so the dot is easy to hover/tap without
  // precision. The visible dot stays small, but the click zone extends
  // ~8px in every direction via an absolutely-positioned ::before overlay.
  const btn = (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => {
        onOpen();
        onHoverStart();
      }}
      onMouseLeave={() => {
        onClose();
        onHoverEnd();
      }}
      onFocus={() => {
        onOpen();
        onHoverStart();
      }}
      onBlur={() => {
        onClose();
        onHoverEnd();
      }}
      aria-label={`${peer.name} — rank ${peer.rank}`}
      aria-expanded={isActive}
      className={cn(
        "relative block rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-purple/40",
        "before:content-[''] before:absolute before:-inset-3 before:rounded-full",
        sizeClass,
        colorClass,
        ringClass,
      )}
    />
  );

  if (reduced) return btn;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      whileInView={
        isCurrent
          ? { scale: [0, 1.35, 1], opacity: 1 }
          : { scale: 1, opacity: 1 }
      }
      viewport={{ once: true, amount: 0.5 }}
      transition={
        isCurrent
          ? {
              duration: 0.9,
              delay: 0.6,
              times: [0, 0.6, 1],
              ease: [0.22, 1, 0.36, 1],
            }
          : {
              type: "spring",
              stiffness: 420,
              damping: 18,
              delay: 0.35 + idx * 0.05,
            }
      }
      className="inline-block"
    >
      {btn}
    </motion.div>
  );
}

/* ------------------------------ Popover ------------------------------- */

function PeerPopover({
  peer,
  category,
  reduced,
  isCurrent,
  onMouseEnter,
  onMouseLeave,
}: {
  peer: PeerDot;
  category: string;
  reduced: boolean;
  isCurrent: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const initial = reduced
    ? { opacity: 1, y: 0, scale: 1 }
    : { opacity: 0, y: 6, scale: 0.96 };
  const exit = reduced
    ? { opacity: 0, y: 0, scale: 1 }
    : { opacity: 0, y: 6, scale: 0.97 };

  return (
    <motion.div
      role="tooltip"
      initial={initial}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={exit}
      transition={
        reduced
          ? { duration: 0 }
          : {
              type: "spring",
              stiffness: 340,
              damping: 22,
              mass: 0.6,
            }
      }
      className="absolute left-1/2 -translate-x-1/2 z-20 w-56 md:w-64 bottom-[calc(100%+1rem)]"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Invisible hover bridge — 1rem tall transparent strip covering the
          gap between the popover and the dot, so the cursor doesn't cross
          "dead space" when moving down to interact with the popover. */}
      <span
        aria-hidden="true"
        className="absolute top-full left-0 right-0 h-4"
      />
      {/* Visible connector line */}
      <span
        aria-hidden="true"
        className="absolute top-full left-1/2 -translate-x-1/2 h-4 w-px bg-brand-black/30"
      />

      <div className="relative bg-brand-black text-brand-off-white border-l-4 border-brand-lime p-3.5 md:p-4 shadow-[6px_6px_0_0_rgba(15,15,15,0.12)]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            #{peer.rank} in {category}
          </span>
          {peer.tier && (
            <span
              className={cn(
                "font-display text-[0.55rem] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5",
                TIER_PILL_CLASS[peer.tier],
              )}
            >
              {TIER_SHORT[peer.tier]}
            </span>
          )}
        </div>
        <p className="mt-1.5 font-display text-base md:text-lg font-black leading-tight tracking-[-0.01em]">
          {peer.name}
        </p>
        {peer.distinguishingSignal && (
          <p className="mt-1.5 font-body text-[0.78rem] text-brand-off-white/70 leading-snug">
            {peer.distinguishingSignal}
          </p>
        )}
        {!isCurrent ? (
          <Link
            href={`/business/${peer.slug}`}
            className="mt-3 inline-flex items-center gap-1 font-display text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-brand-lime hover:underline focus:outline-none focus-visible:underline"
          >
            Read the record
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <p className="mt-3 font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-off-white/45">
            This page
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default PeerDotPlot;
