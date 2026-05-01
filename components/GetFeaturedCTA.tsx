import { Reveal } from "@/components/motion/Reveal";

/**
 * GetFeaturedCTA, the third sanctioned Relay surface (per the
 * editorial brief, alongside the masthead colophon and the future
 * sidebar CTA on claimed pages).
 *
 * Placement: between the Playbook and the SubscribeFooter on every
 * business scorecard. Reads as the natural "move 4, the cheapest one"
 * after the editorial 3-move Playbook.
 *
 * Copy is intentionally direct, per Anna's call. The page already
 * earned the trust through the editorial layer above; the button is
 * the natural action that follows the diagnosis.
 */

type Props = {
  /** Specific business name for per-scorecard placement; omit on the
   *  homepage to render the generic version. */
  businessName?: string;
  /** Slug passed to Relay so they can pre-fill the apply form. */
  businessSlug?: string;
  /** Override the destination URL if Relay has a specific apply endpoint. */
  applyUrl?: string;
  /** Smaller variant for above-the-fold homepage placement. */
  variant?: "default" | "compact";
};

export function GetFeaturedCTA({
  businessName,
  businessSlug,
  applyUrl,
  variant = "default",
}: Props) {
  const href =
    applyUrl ??
    (businessSlug
      ? `https://run-relay.com/apply?business=${encodeURIComponent(businessSlug)}`
      : `https://run-relay.com/apply`);
  const compact = variant === "compact";
  const kicker = businessName ? "The cheap next move" : "For Pittsburgh business owners";
  const headline = businessName
    ? `Get ${businessName} featured by a Pittsburgh creator.`
    : "Get your business featured by a Pittsburgh creator.";
  const body = businessName
    ? "Pittsburgh creators register on Relay specifically to feature local small businesses. There's no fee for verified owners. Apply once and Relay handles the introductions."
    : "Pittsburgh creators register on Relay specifically to feature local small businesses. There's no fee for verified owners. Apply once, Relay handles the introductions.";
  return (
    <Reveal as="section" className="block">
      <div
        className={
          compact
            ? "border-2 border-brand-purple bg-brand-purple/5 px-5 py-5 md:px-7 md:py-6"
            : "border-2 border-brand-purple bg-brand-purple/5 px-6 py-7 md:px-9 md:py-9"
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 md:gap-8 items-center">
          <div>
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple mb-2">
              {kicker}
            </p>
            <h3
              className={
                compact
                  ? "font-display font-black uppercase tracking-[-0.01em] text-brand-black text-lg md:text-xl leading-[1.1] [text-wrap:balance]"
                  : "font-display font-black uppercase tracking-[-0.01em] text-brand-black text-xl md:text-2xl leading-[1.1] [text-wrap:balance]"
              }
            >
              {headline}{" "}
              <span className="bg-brand-lime px-1.5 box-decoration-clone">
                Free.
              </span>
            </h3>
            <p className={
              compact
                ? "mt-2 font-body text-sm text-brand-black/70 max-w-2xl leading-snug"
                : "mt-3 font-body text-sm md:text-base text-brand-black/70 max-w-2xl leading-relaxed"
            }>
              {body}
            </p>
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-brand-purple text-brand-off-white font-display text-xs md:text-sm font-semibold uppercase tracking-[0.18em] px-6 py-4 md:px-8 md:py-5 hover:bg-brand-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime whitespace-nowrap shrink-0"
          >
            Get matched, free
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </Reveal>
  );
}

export default GetFeaturedCTA;
