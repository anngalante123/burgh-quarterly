"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Reveal — scroll-triggered fade + translate-up wrapper.
 *
 * Motion spec:
 *   - initial: opacity 0, y +16px
 *   - animate (in view): opacity 1, y 0
 *   - duration ~0.6s, ease: soft cubic
 *   - triggers ONCE when 15% of the block is in the viewport
 *
 * Reduced-motion users see the block appear instantly (no translate, no fade).
 *
 * Used as the default scroll-reveal primitive across editorial layouts.
 */

type RevealProps = {
  children: ReactNode;
  /** Stagger — delay in seconds before the reveal starts. Useful for sibling lists. */
  delay?: number;
  /** Override default vertical translate distance (px). */
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article" | "header";
};

export function Reveal({
  children,
  delay = 0,
  y = 16,
  className,
  as = "div",
}: RevealProps) {
  const reduced = useReducedMotion();
  const MotionTag = motion[as];

  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -10% 0px" }}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </MotionTag>
  );
}

export default Reveal;
