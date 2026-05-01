"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedNumber, counts from 0 to the target value once the element
 * scrolls into view. Used in AtAGlance rows to make the data feel
 * alive and "computed" rather than static.
 *
 * Easing: ease-out cubic — fast at first, decelerating into the final
 * number. Matches the "data being processed" feel.
 *
 * Respects prefers-reduced-motion: skips the animation and renders
 * the final value immediately.
 */

type Props = {
  /** Final value to count up to. */
  value: number;
  /** Animation duration in ms. Default 1500. */
  duration?: number;
  /** Optional formatter, defaults to localeString with commas. */
  format?: (n: number) => string;
  /** Optional suffix (e.g., "★"). Rendered after the number, no space. */
  suffix?: string;
  /** Tailwind class override for the span. */
  className?: string;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({
  value,
  duration = 1500,
  format,
  suffix,
  className,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
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
              const elapsed = now - start;
              const t = Math.min(1, elapsed / duration);
              const eased = easeOutCubic(t);
              setDisplay(Math.round(value * eased));
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  const fmt = format ?? ((n: number) => n.toLocaleString());
  return (
    <span ref={ref} className={className}>
      {fmt(display)}
      {suffix ?? ""}
    </span>
  );
}

export default AnimatedNumber;
