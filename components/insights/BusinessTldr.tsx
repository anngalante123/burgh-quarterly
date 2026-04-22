import { Reveal } from "@/components/motion/Reveal";

/**
 * BusinessTldr — executive preview at the top of a business page.
 *
 * Two lines of editorial-voice summary:
 *   THE READ → plain-language diagnosis (strongest + weakest signal + tier+rank)
 *   WHAT IT MEANS → action for the reader / owner
 *
 * Pulled from deterministic logic in lib/editorial/business-tldr.ts — no
 * hand-written copy per business.
 */

type BusinessTldrProps = {
  read: string;
  meaning: string;
};

export function BusinessTldr({ read, meaning }: BusinessTldrProps) {
  return (
    <Reveal
      as="section"
      className="border-l-4 border-brand-lime bg-white/60 px-5 py-5 md:px-7 md:py-6"
    >
      <dl className="grid grid-cols-1 gap-y-4 md:grid-cols-[7rem_1fr] md:gap-x-6">
        <dt className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
          The read
        </dt>
        <dd className="font-body text-base md:text-lg text-brand-black leading-snug">
          {read}
        </dd>
        <dt className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
          What it means
        </dt>
        <dd className="font-body text-sm md:text-base text-brand-black/80 leading-snug">
          {meaning}
        </dd>
      </dl>
    </Reveal>
  );
}
