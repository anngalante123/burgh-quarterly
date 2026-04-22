/**
 * OwnerFirstVisit — the disarming top-of-business-page block.
 *
 * Copy verbatim from EDITORIAL_VOICE.md § item 7, option B (owner first-visit):
 *   "We built this page about [Business Name] from public data.
 *    Nothing to claim, nothing to buy.
 *    If you want to edit it, you can. If you just want to see where
 *    you rank, that's the whole point."
 *
 * Warm, plain, not a sales pitch. This is the block that converts
 * suspicion into trust. Renders on claimed OR unclaimed pages — the
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
        from public data. Nothing to claim, nothing to buy. If you want to edit
        it, you can. If you just want to see where you rank, that&apos;s the
        whole point.
      </p>
    </section>
  );
}

export default OwnerFirstVisit;
