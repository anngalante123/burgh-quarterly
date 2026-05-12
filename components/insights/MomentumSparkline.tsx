"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

/**
 * MomentumSparkline, 30-day IG cadence as a stylized sparkline.
 *
 * Without per-day data (v1), we render 30 vertical bars spanning 30 days.
 * If posts30d=0, every bar is minimal height → visually flat, feels heavy.
 * If posts30d>0, distribute "post days" via a deterministic slug hash so
 * the same business always renders the same silhouette.
 *
 * This is the Relay conversion visual, when a shop's IG is dormant the
 * flat line becomes the editorial punchline (without naming Relay).
 *
 * Motion (2026-04-22):
 *   - Bars rise from the baseline on scroll-into-view, staggered left→right
 *     so the 30 days "deal" into the screen like a card spread
 *   - Respects useReducedMotion, static render when the OS flag is on
 */

type MomentumSparklineProps = {
  posts30d: number;
  reels30d: number;
  handle: string | null;
  hasRealData: boolean;
  /**
   * Seed used to deterministically distribute "post" days across the 30-day
   * window. Usually the business slug, guarantees stable rendering.
   */
  seed: string;
};

const DAY_COUNT = 30;

function hashSeed(seed: string): number {
  // Simple djb2 hash, deterministic, no dependencies.
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildPattern(posts: number, seed: string): boolean[] {
  const out = new Array<boolean>(DAY_COUNT).fill(false);
  if (posts <= 0) return out;
  const cap = Math.min(posts, DAY_COUNT);
  // Fill `cap` distinct indices using a deterministic stride from the seed.
  const h = hashSeed(seed);
  const stride = 1 + (h % (DAY_COUNT - 1)); // 1..29
  let idx = h % DAY_COUNT;
  let placed = 0;
  let guard = 0;
  while (placed < cap && guard < DAY_COUNT * 4) {
    if (!out[idx]) {
      out[idx] = true;
      placed++;
    }
    idx = (idx + stride) % DAY_COUNT;
    guard++;
  }
  return out;
}

function callout(
  posts30d: number,
  reels30d: number,
  hasRealData: boolean,
): string {
  if (!hasRealData) return "Instagram cadence not yet indexed.";
  if (posts30d === 0) {
    return "Zero posts in the last 30 days, a gap creators can fill.";
  }
  if (posts30d <= 3) {
    return `Light Instagram cadence, ${posts30d} posts in 30 days.`;
  }
  if (posts30d <= 10) {
    return `Steady cadence, ${posts30d} posts, ${reels30d} reels.`;
  }
  return `Active cadence, ${posts30d} posts, ${reels30d} reels.`;
}

export function MomentumSparkline({
  posts30d,
  reels30d,
  handle,
  hasRealData,
  seed,
}: MomentumSparklineProps) {
  const reduced = useReducedMotion();
  const pattern = buildPattern(posts30d, seed);
  const isZero = hasRealData && posts30d === 0;
  const calloutText = callout(posts30d, reels30d, hasRealData);
  const calloutClass = isZero ? "text-brand-purple" : "text-brand-black/70";

  return (
    <Reveal as="section" className="block">
      <div aria-label="30-day Instagram cadence">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black border-b border-brand-black/15 pb-3 mb-5">
          30-day Instagram cadence
        </h2>

        {/* Sparkline, bars deal in left→right on scroll */}
        <div
          className="flex items-end gap-[3px] h-10"
          aria-hidden="true"
          role="presentation"
        >
          {pattern.map((isPost, i) => {
            const barClass = isZero
              ? "flex-1 rounded-sm bg-brand-purple/40"
              : cn(
                  "flex-1 rounded-sm",
                  isPost ? "bg-brand-black" : "bg-brand-black/10",
                );
            const heightClass = isZero
              ? "h-1"
              : isPost
                ? "h-8"
                : "h-1";

            if (reduced) {
              return (
                <div
                  key={i}
                  className={cn(barClass, heightClass)}
                />
              );
            }
            return (
              <motion.div
                key={i}
                className={cn(barClass, heightClass, "origin-bottom")}
                initial={{ scaleY: 0.15, opacity: 0 }}
                whileInView={{ scaleY: 1, opacity: 1 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{
                  duration: 0.35,
                  delay: 0.1 + i * 0.02,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            );
          })}
        </div>

        {/* Axis */}
        <div className="mt-2 flex items-center justify-between font-body text-[0.65rem] tracking-[0.18em] uppercase text-brand-black/60">
          <span>30 days ago</span>
          <span>Today</span>
        </div>

        {/* Editorial callout */}
        <p
          className={cn(
            "mt-4 font-body text-sm leading-relaxed",
            calloutClass,
          )}
        >
          {calloutText}
        </p>

        {handle && hasRealData && (
          <p className="mt-1 font-body text-[0.7rem] text-brand-black/60">
            From <span className="text-brand-purple">@</span>
            <span className="text-brand-black/70">{handle.replace(/^@/, "")}</span>{" "}
            · last 30 days.
          </p>
        )}
      </div>
    </Reveal>
  );
}

export default MomentumSparkline;
