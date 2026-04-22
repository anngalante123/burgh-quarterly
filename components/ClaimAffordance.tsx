import Link from "next/link";

/**
 * ClaimAffordance — a quiet, one-line link to the claim flow.
 *
 * Copy verbatim from LEAD_CAPTURE.md § Gate 3:
 *   "Is this your business? Claim it →"
 *
 * Not aggressive. Not a banner. A link. Per D-008 + D-009, the claim
 * flow is the path to the Opportunities view + Relay sidebar CTA — but
 * the link itself stays whisper-quiet on unclaimed pages.
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
        className="text-brand-purple underline decoration-brand-purple/40 underline-offset-4 hover:decoration-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
      >
        Claim it →
      </Link>
    </p>
  );
}

export default ClaimAffordance;
