/**
 * UnfairAdvantage, one dimension where the business outperforms the Talk of the Town tier.
 *
 * Per SCORING_RUBRIC.md § Hard rules and EDITORIAL_VOICE.md § Patterns:
 *   "Every business page surfaces one 'unfair advantage', the dimension
 *    where the business outperforms the Talk of the Town tier median. Even a #83
 *    business has one of these."
 *
 * From EDITORIAL_VOICE: "Nobody is only weak. Every business gets one."
 *
 * Copy style is factual-neutral (quiet record zone), not cheerleading.
 */

type UnfairAdvantageProps = {
  label: string; // short tag, e.g. "Five-star reviews"
  evidence: string; // the data sentence, e.g. "1,138 of 1,294 reviews, 88%, the highest concentration…"
};

export function UnfairAdvantage({ label, evidence }: UnfairAdvantageProps) {
  return (
    <aside
      aria-label="Unfair advantage"
      className="border-l-4 border-brand-purple bg-brand-cream/60 px-5 py-5 md:px-6 md:py-6 overflow-hidden"
    >
      <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-purple break-words">
        Unfair advantage
      </p>
      <p className="mt-2 font-display text-lg sm:text-xl md:text-2xl font-black tracking-[-0.01em] text-brand-black leading-tight break-words hyphens-auto">
        <span className="bg-brand-lime px-1.5 box-decoration-clone">
          {label}
        </span>
      </p>
      <p className="mt-3 font-body text-sm md:text-base leading-relaxed text-brand-black/80 break-words">
        {evidence}
      </p>
    </aside>
  );
}

export default UnfairAdvantage;
