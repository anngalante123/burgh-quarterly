"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * AnimatedRank — number that counts up to `value` once the component has
 * mounted on the client.
 *
 * Contract:
 *   - SSR + initial client render shows the FINAL value (no more "#0" flash
 *     before hydration). This was a real bug — Anna spotted "#0 in
 *     Pittsburgh Bakeries" in prod 2026-04-22.
 *   - On mount (client only), the counter rewinds to 0 and animates up to
 *     `value` via requestAnimationFrame. Because the SSR HTML already
 *     shows the final value, we gate the animation behind a one-tick
 *     `didMount` flag: the render right after hydration keeps the final
 *     value, and the frame after that kicks off the count-up.
 *   - Reduced-motion users never see the count-up — the number sits still.
 *   - Triggers ONCE per mount (useRef guard).
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
  // Initialize to `value` so SSR + pre-hydration client render show the
  // final number — never "#0".
  const [display, setDisplay] = useState<number>(value);
  const startedRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (reduced) return;

    // Defer the count-up to the NEXT frame so the hydrated DOM matches the
    // SSR HTML for one paint, then rewind to 0 and animate up.
    const rafKick = requestAnimationFrame(() => {
      setDisplay(0);
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeOutQuart(progress);
        setDisplay(Math.round(eased * value));
        if (progress < 1) {
          rafIdRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(value);
        }
      };
      rafIdRef.current = requestAnimationFrame(tick);
    });
    rafIdRef.current = rafKick;
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [value, duration, reduced]);

  return (
    <span className={className} aria-label={prefix ? `${prefix}${value}` : String(value)}>
      {prefix ? <span aria-hidden="true">{prefix}</span> : null}
      <span aria-hidden="true">{display}</span>
    </span>
  );
}

export default AnimatedRank;
