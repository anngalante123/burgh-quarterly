import Link from "next/link";

/**
 * ClaimAffordance, a quiet, one-line link to the claim flow.
 *
 * Copy verbatim from LEAD_CAPTURE.md § Gate 3:
 *   "Is this your business? Claim it →"
 *
 * Not aggressive. Not a banner. A link. Per D-008 + D-009, the claim
 * flow is the path to the Opportunities view + Relay sidebar CTA, but
 * the link itself stays whisper-quiet on unclaimed pages.
 *
 * Motion: the arrow slides 4px right on hover of the entire link via
 * Tailwind's `group` + `group-hover:` utilities. A 150ms ease-out.
 * `prefers-reduced-motion` users get no translate (CSS variant).
 *
 * This component stays server-renderable, the arrow motion is pure CSS.
 */

type ClaimAffordanceProps = {
  slug: string;
};

export function ClaimAffordance({ slug }: ClaimAffordanceProps) {
  return (
    <p className="font-body text-sm text-brand-black/70">
      Is this your business?{" "}
      <Link
        href={`/claim/${slug}`}
        className="group inline-flex items-center gap-1 text-brand-purple underline decoration-brand-purple/40 underline-offset-4 hover:decoration-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
      >
        <span>Claim it</span>
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        >
          →
        </span>
      </Link>
    </p>
  );
}

export default ClaimAffordance;
