/**
 * fireSubscribeConfetti — a classy, editorial-appropriate confetti burst.
 *
 * Visual spec:
 *   - ~80 particles total across 2 bursts (left + right of origin)
 *   - Brand palette only: purple #AB35EE + lime #C6F432 + black #0F0F0F
 *   - 2 second lifetime, gravity tuned so particles settle (not drift off-screen)
 *   - Origin accepts viewport-relative coords (x/y, 0-1) so callers can fire
 *     from a specific element's getBoundingClientRect
 *
 * Respects prefers-reduced-motion — in that case, returns early without firing.
 */

type Origin = { x: number; y: number };

const BRAND_COLORS = ["#AB35EE", "#C6F432", "#0F0F0F"];

export async function fireSubscribeConfetti(origin: Origin): Promise<void> {
  // Dynamic import so canvas-confetti never hits the SSR bundle.
  if (typeof window === "undefined") return;

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const mod = await import("canvas-confetti");
  const confetti = mod.default;

  const baseDefaults = {
    spread: 70,
    ticks: 120,
    gravity: 1.1,
    decay: 0.93,
    startVelocity: 35,
    colors: BRAND_COLORS,
    origin,
    scalar: 0.9,
  };

  // Two staggered bursts — produces a layered, editorial feel vs. one
  // homogenous blast.
  confetti({
    ...baseDefaults,
    particleCount: 50,
    angle: 70,
  });
  window.setTimeout(() => {
    confetti({
      ...baseDefaults,
      particleCount: 30,
      angle: 110,
      scalar: 0.75,
    });
  }, 140);
}

/**
 * fireConfettiFromElement — convenience wrapper that computes the origin
 * from an HTMLElement's bounding rect.
 */
export function fireConfettiFromElement(el: HTMLElement | null): void {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;
  void fireSubscribeConfetti({ x, y });
}
