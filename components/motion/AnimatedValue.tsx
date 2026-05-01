"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedValue, drop-in replacement for a pre-formatted stat string
 * (e.g. "4.7★", "47.9%", "1,294"). Parses the leading numeric portion,
 * animates it from 0 to target on viewport intersection, and renders
 * any non-numeric suffix verbatim.
 *
 * Examples:
 *   "4.7★"   -> animates 0 -> 4.7, then "★"
 *   "47.9%"  -> animates 0 -> 47.9, then "%"
 *   "1,294"  -> animates 0 -> 1294 with comma formatting, no suffix
 *   "—"      -> rendered as-is, no animation
 *
 * Respects prefers-reduced-motion: jumps to final value immediately.
 *
 * If the leading number can't be parsed, the original string is
 * rendered untouched. This keeps it safe to use anywhere AtAGlance
 * accepts a value.
 */

type Props = {
  /** Pre-formatted display string. */
  value: string;
  /** Animation duration in ms. Default 1400. */
  duration?: number;
  className?: string;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Pull the leading number off the front of a display string. Returns
 * the numeric value, the original digit/dot/comma chars (so we can
 * preserve formatting like "1,294" -> commas), and the trailing
 * suffix.
 */
function parseLeadingNumber(s: string): {
  num: number;
  hadCommas: boolean;
  decimals: number;
  suffix: string;
} | null {
  const m = s.match(/^(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const numStr = m[1];
  const suffix = m[2];
  const cleaned = numStr.replace(/,/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  const decimals = cleaned.includes(".")
    ? cleaned.split(".")[1].length
    : 0;
  return {
    num: n,
    hadCommas: numStr.includes(","),
    decimals,
    suffix,
  };
}

export function AnimatedValue({ value, duration = 1400, className }: Props) {
  const parsed = parseLeadingNumber(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(parsed ? 0 : NaN);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!parsed) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(parsed.num);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            const start = performance.now();
            const tick = () => {
              const now = performance.now();
              const t = Math.min(1, (now - start) / duration);
              const eased = easeOutCubic(t);
              setDisplay(parsed.num * eased);
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [parsed, duration]);

  if (!parsed) {
    return <span className={className}>{value}</span>;
  }

  const formatted = parsed.hadCommas
    ? Math.round(display).toLocaleString()
    : display.toFixed(parsed.decimals);

  return (
    <span ref={ref} className={className}>
      {formatted}
      {parsed.suffix}
    </span>
  );
}

export default AnimatedValue;
