import { Reveal } from "@/components/motion/Reveal";

/**
 * QuarterNarrative, a one-paragraph editorial summary at the top of the
 * business page. Pulled from deterministic logic in
 * lib/editorial/quarter-narrative.ts.
 *
 * Reads like a journalist wrote it, but it's fully derived from the
 * record + social data + the family leader.
 */

type QuarterNarrativeProps = {
  body: string;
  issue: string;
};

export function QuarterNarrative({ body, issue }: QuarterNarrativeProps) {
  return (
    <Reveal as="section" className="block">
      <div className="border-t border-b border-brand-black/15 py-5 md:py-6">
        <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple mb-3">
          The story of {issue}
        </p>
        <p className="font-body text-lg md:text-xl text-brand-black leading-snug md:leading-relaxed max-w-3xl">
          {body}
        </p>
      </div>
    </Reveal>
  );
}
