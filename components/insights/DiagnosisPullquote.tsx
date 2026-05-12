import { Reveal } from "@/components/motion/Reveal";

/**
 * DiagnosisPullquote, the hero diagnosis. One display-scale sentence, with
 * a single phrase highlighted (lime block) so the reader's eye locks
 * onto the focus metric in the first three seconds.
 *
 * Replaces the prior stack of {QuarterNarrative + BusinessTldr + ScoreHero}
 * three blocks for the hero zone with one editorial pull-quote.
 *
 * Data comes from the Claude analysis (`diagnosis_pullquote.line` and
 * `diagnosis_pullquote.highlight`). The component splits `line` around
 * the first occurrence of `highlight` and wraps that phrase in a lime
 * pill. If `highlight` doesn't appear in `line` (defensive case), the
 * line renders without highlighting.
 */

type Props = {
  line: string;
  highlight: string;
};

function splitWithHighlight(line: string, highlight: string): {
  before: string;
  match: string;
  after: string;
} | null {
  if (!highlight) return null;
  // Case-insensitive match, but preserve the original casing of the phrase
  // we render (we'll re-uppercase the whole pull-quote anyway).
  const idx = line.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return null;
  return {
    before: line.slice(0, idx),
    match: line.slice(idx, idx + highlight.length),
    after: line.slice(idx + highlight.length),
  };
}

export function DiagnosisPullquote({ line, highlight }: Props) {
  const split = splitWithHighlight(line, highlight);

  return (
    <Reveal as="section" className="block">
      <div className="bg-brand-black text-brand-lavender px-6 py-7 md:px-9 md:py-9">
        <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-lime mb-3">
          The diagnosis · Spring 2026
        </p>
        <h2 className="font-display font-black uppercase text-brand-lavender tracking-[-0.015em] leading-[1] text-[clamp(1.25rem,3.2vw,2.25rem)] [text-wrap:balance]">
          {split ? (
            <>
              {split.before}
              <span className="scan-sweep bg-brand-lime text-brand-black px-1.5 box-decoration-clone">
                {split.match}
              </span>
              {split.after}
            </>
          ) : (
            line
          )}
        </h2>
      </div>
    </Reveal>
  );
}

export default DiagnosisPullquote;
