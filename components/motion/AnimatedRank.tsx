"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * AnimatedRank — number that counts up from 0 to `value` on mount.
 *
 * Contract:
 *   - Triggers ONCE per page load (useRef guard), not on every re-render.
 *   - Duration ~1000ms, ease-out quart so the final digits settle quickly.
 *   - Prefix like "#" is rendered outside the animated number so screen
 *     readers and the visual layout both render it stable.
 *   - Reduced-motion users see the final value immediately.
 *
 * Intentionally a dependency-free counter (framer-motion's motion-values
 * are heavier than we need for a single number in the quiet zone).
 */

type AnimatedRankProps = {
  value: number;
  /** Milliseconds. Defaults to ~1s. */
  duration?: number;
  /** Optional prefix rendered to the left of the number (e.g. "#"). */
  prefix?: string;
  className?: string;
};

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function AnimatedRank({
  value,
  duration = 1000,
  prefix,
  className,
}: AnimatedRankProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState<number>(reduced ? value : 0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Reduced-motion: skip animation entirely. `display` is already
    // initialized to `value` in that branch via useState's initial arg,
    // so no setState is needed here.
    if (reduced) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOutQuart(progress);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return (
    <span className={className} aria-label={prefix ? `${prefix}${value}` : String(value)}>
      {prefix ? <span aria-hidden="true">{prefix}</span> : null}
      <span aria-hidden="true">{display}</span>
    </span>
  );
}

export default AnimatedRank;
