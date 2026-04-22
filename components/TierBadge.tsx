"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/data/schemas";

/**
 * TierBadge, renders the tier label in a distinct treatment per tier.
 *
 * Per D-004 and EDITORIAL_VOICE: every tier flatters. Icons gets the
 * lime highlight block (the loudest treatment because it's also our
 * on-brand accent), Ones to Watch wears the brand purple pill,
 * Neighborhood Staples wears a warm cream pill.
 *
 * No tier is visually inferior, all three should feel worth having.
 * Sizes: "sm" for inline chips, "md" for the primary ScoreCard tier badge.
 *
 * Motion (added in modernization pass):
 *   - On hover: subtle scale (1 → 1.04) + glow shadow that matches the
 *     badge's accent color. Reduced-motion users get a static badge.
 *   - Whole-badge tap response (scale 0.97) so mobile users also feel it.
 */

const TIER_COPY: Record<Tier, string> = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
};

const TIER_STYLES: Record<Tier, string> = {
  // Icons: lime highlight block, black ink. The same lime that accents the masthead.
  icons:
    "bg-brand-lime text-brand-black border border-brand-black/10",
  // Ones to Watch: brand purple pill, off-white ink. Warm, optimistic, "coming up."
  ones_to_watch:
    "bg-brand-purple text-brand-off-white border border-brand-purple",
  // Neighborhood Staples: warm cream with black ink + purple hairline.
  // A compliment, rooted, beloved. Not a consolation prize.
  neighborhood_staples:
    "bg-brand-cream text-brand-black border border-brand-black/15",
};

const TIER_GLOW: Record<Tier, string> = {
  // Lime glow on icons, matches the badge background.
  icons: "0 0 0 4px rgba(198, 244, 50, 0.35)",
  // Purple glow on ones-to-watch.
  ones_to_watch: "0 0 0 4px rgba(171, 53, 238, 0.3)",
  // Soft neutral glow on staples, we don't want to imply a colored accent.
  neighborhood_staples: "0 0 0 4px rgba(15, 15, 15, 0.08)",
};

type TierBadgeProps = {
  tier: Tier;
  size?: "sm" | "md";
  className?: string;
};

export function TierBadge({ tier, size = "md", className }: TierBadgeProps) {
  const reduced = useReducedMotion();
  const isIcons = tier === "icons";
  const shapeBySize =
    size === "md"
      ? "px-3 py-1.5 text-sm"
      : "px-2 py-0.5 text-[0.7rem]";
  // Icons gets a slightly squarer "highlight block" feel (small radius);
  // the other two get a pill.
  const radius = isIcons ? "rounded-sm" : "rounded-full";

  const classes = cn(
    "inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap",
    radius,
    shapeBySize,
    TIER_STYLES[tier],
    className,
  );

  if (reduced) {
    return (
      <span className={classes} data-tier={tier}>
        {TIER_COPY[tier]}
      </span>
    );
  }

  return (
    <motion.span
      className={classes}
      data-tier={tier}
      initial={{ boxShadow: "0 0 0 0px rgba(0,0,0,0)" }}
      whileHover={{
        scale: 1.04,
        boxShadow: TIER_GLOW[tier],
      }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
    >
      {TIER_COPY[tier]}
    </motion.span>
  );
}

export default TierBadge;
