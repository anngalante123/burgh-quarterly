"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";

/**
 * HowWeRank, methodology explainer.
 *
 * The reader's first-screen question on the homepage and business pages is
 * "what are you ranking?" Before this block, the visual language suggested
 * "best of Pittsburgh", a quality ranking. Reality: we rank the whole
 * conversation around a business, what's said in reviews (sentiment,
 * themes, freshness), what's shot for Instagram, how it's all moving.
 *
 * Demand-gen-operator pass (2026-04-22) established:
 *   - 3-second test via the anti-claim "We don't rank taste"
 *   - Expanded to "the conversation" so sentiment, photos, and momentum
 *     all fit under one stance (not social-only)
 *   - 5 signals rendered as a row of chips with one-line captions
 *
 * Motion (2026-04-22):
 *   - Each signal chip fades + slides up on scroll-into-view, staggered
 *     so the reader's eye walks down the list rather than jumping in
 *   - Respects `useReducedMotion`, static when the OS flag is on
 *
 * Placement:
 *   - Homepage: between SignalStrip and "Read" section
 */

type Signal = {
  label: string;
  caption: string;
};

// Canonical signal labels + captions. These MUST match the copy in
// `SubscoreBars.tsx` and `.claude/memory/EDITORIAL_VOICE.md`. If a label or
// caption changes here, update both other locations in the same commit.
const SIGNALS: Signal[] = [
  { label: "Visual catalog", caption: "Photos creators can pull from" },
  {
    label: "Review sentiment",
    caption: "Themes, tone, and what reviewers keep saying",
  },
  {
    label: "Conversion path",
    caption: "How easy to find, visit, and post about",
  },
  {
    label: "Instagram momentum",
    caption: "Posts, reels, and cadence in the last 30 days",
  },
  {
    label: "Creator fit",
    caption: "Owner presence, hours, claim status",
  },
];

export function HowWeRank() {
  const reduced = useReducedMotion();

  return (
    <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
      <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-8">
        <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
          How we rank
        </h3>
        <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
          Five signals, recomputed quarterly
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(14rem,1fr)_2fr] gap-8 md:gap-10 items-start">
        <div>
          <p className="font-display font-black uppercase tracking-[-0.015em] text-brand-black [text-wrap:balance] text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.02]">
            We don&apos;t rank{" "}
            <span className="line-through decoration-brand-purple decoration-4">
              taste
            </span>
            .<br />
            We rank the{" "}
            <span className="bg-brand-lime px-2 box-decoration-clone">
              conversation
            </span>
            .
          </p>
          <p className="mt-5 font-body text-sm md:text-base text-brand-black/70 leading-relaxed max-w-md">
            Reviews, sentiment, photos, Instagram, and how all of it is
            moving this quarter. Everything the city says and shows about a
            business, in one index.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {SIGNALS.map((s, i) => {
            const body = (
              <>
                <span
                  aria-hidden="true"
                  className="font-display text-[0.7rem] font-semibold tabular-nums text-brand-purple tracking-[0.14em] mt-[2px]"
                >
                  0{i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-brand-black">
                    {s.label}
                  </p>
                  <p className="mt-0.5 font-body text-xs md:text-sm text-brand-black/65 leading-snug">
                    {s.caption}
                  </p>
                </div>
              </>
            );
            if (reduced) {
              return (
                <li
                  key={s.label}
                  className="flex items-start gap-3 border-t border-brand-black/15 pt-3"
                >
                  {body}
                </li>
              );
            }
            return (
              <motion.li
                key={s.label}
                className="flex items-start gap-3 border-t border-brand-black/15 pt-3"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{
                  duration: 0.5,
                  delay: i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {body}
              </motion.li>
            );
          })}
        </ul>
      </div>

      <p className="mt-8 font-body text-xs md:text-sm text-brand-black/60 max-w-3xl leading-relaxed">
        A bakery can have a line out the door and still land low on the index
        if reviewers aren&apos;t writing about the bread, if the photos on
        Google are ten years old, if the Instagram has gone quiet. A salon
        can climb faster than the cafe next door because the sentiment in
        their reviews is sharper and their captions stick. We measure what
        the city says and sees, not whether the croissant is good.
      </p>
    </Reveal>
  );
}

export default HowWeRank;
