/**
 * OwnerFirstVisit, the disarming top-of-business-page block.
 *
 * Copy verbatim from EDITORIAL_VOICE.md § Owner first-visit (rev. 2026-04-21):
 *   "We built this page about {businessName} from public data. Here's
 *    your rank, your strongest signals, and what customers say most.
 *    Claim the page to see the deeper view, what's holding you back
 *    from the top, and what changed this quarter."
 *
 * Warm, plain, not a sales pitch. This is the block that converts
 * suspicion into trust. Renders on claimed OR unclaimed pages, the
 * tone is right either way.
 */

type OwnerFirstVisitProps = {
  businessName: string;
};

export function OwnerFirstVisit({ businessName }: OwnerFirstVisitProps) {
  return (
    <section
      aria-label="A note about this page"
      className="bg-brand-cream border border-brand-black/10 px-6 py-5 md:px-8 md:py-6"
    >
      <p className="font-body text-sm md:text-base text-brand-black/85 leading-relaxed max-w-2xl">
        We built this page about{" "}
        <span className="font-medium text-brand-black">{businessName}</span>{" "}
        from public data. Here&apos;s your rank, your strongest signals, and
        what customers say most. Claim the page to see the deeper view, what&apos;s
        holding you back from the top, and what changed this quarter.
      </p>
    </section>
  );
}

export default OwnerFirstVisit;
