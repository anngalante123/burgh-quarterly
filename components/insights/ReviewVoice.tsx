"use client";

import { useState } from "react";
import { PreviewBadge } from "./PreviewBadge";
import { cn } from "@/lib/utils";

/**
 * ReviewVoice — recurring phrases mined from review text.
 *
 * Visual: a ranked list of phrases with counts and an expandable
 * example quote each. (A tag-cloud was considered and rejected — cloud
 * layouts obscure hierarchy and read as "infographic," which clashes
 * with the quiet-record voice.)
 *
 * Data:
 *   - Real extraction uses `lib/insights/extract-phrases.ts` — a
 *     bigram+trigram miner with stop-word + connector filtering.
 *   - Defaults baked in below are the phrases visible in the 6 available
 *     La Gourmandine reviews (stars=4-5) that pass the "concept" filter.
 *     Counts reflect the small sample — the trend card explains the
 *     tracking cadence. When the rescrape lands with maxReviews=10-20
 *     per business, callers will pass real `phrases` arrays computed by
 *     the pipeline.
 *
 * Interaction: click a row to expand its example quote. One open at a
 * time keeps the component compact.
 */

export type ReviewPhrase = {
  text: string;
  count: number;
  exampleQuote: string;
};

type ReviewVoiceProps = {
  phrases?: ReviewPhrase[];
  /** Optional heading override (defaults to "Review voice"). */
  heading?: string;
};

// Curated from the 6 La Gourmandine reviews with text in
// content/raw/apify/la-gourmandine-raw.json. These are the phrases and
// concept-fragments that actually recur across reviewers, lightly
// cleaned (e.g. "isbthe" → "the place to go"). When the full rescrape
// lands, the scoring pipeline will pass computed phrases as props and
// these defaults are no longer used.
const DEFAULT_PHRASES: ReviewPhrase[] = [
  {
    text: "french pastries",
    count: 3,
    exampleQuote:
      "If you like French-style pastries, this is the place to go.",
  },
  {
    text: "best dessert",
    count: 2,
    exampleQuote:
      "The seasonal La Ruche from La Gourmandine might be the best dessert I have ever had.",
  },
  {
    text: "breakfast and lunch",
    count: 2,
    exampleQuote:
      "Great take-out breakfast, lunch, dessert spot in Pittsburgh area.",
  },
  {
    text: "cream puff",
    count: 1,
    exampleQuote:
      "I also got a cream puff for later and it was delicious.",
  },
  {
    text: "cinnamon roll",
    count: 1,
    exampleQuote:
      "I got a cinnamon roll and my daughter and her s.o. got nut and chocolate croissants that were all fantastic.",
  },
  {
    text: "a little bit of Paris",
    count: 1,
    exampleQuote:
      "I'm spoiled because I've been to Paris. But a little bit of Paris in Pittsburgh.",
  },
  {
    text: "busy on weekends",
    count: 1,
    exampleQuote:
      "You can call ahead if you know what you want. It is busy on weekends.",
  },
];

export function ReviewVoice({
  phrases = DEFAULT_PHRASES,
  heading = "Review voice",
}: ReviewVoiceProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const max = phrases.reduce((m, p) => Math.max(m, p.count), 1);

  return (
    <section
      aria-label={heading}
      className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-4 gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
            {heading}
          </h3>
          <PreviewBadge />
        </div>
        <p className="font-body text-xs text-brand-black/55">
          {phrases.length} recurring
        </p>
      </div>

      <ol className="space-y-1.5">
        {phrases.map((p, i) => {
          const isOpen = openIdx === i;
          const widthPct = Math.max(12, Math.round((p.count / max) * 100));
          return (
            <li key={p.text}>
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                aria-expanded={isOpen}
                className={cn(
                  "relative w-full text-left px-3 py-2 font-body text-sm md:text-base text-brand-black/85 hover:bg-brand-cream/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple transition-colors",
                  isOpen && "bg-brand-cream/80",
                )}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 bg-brand-lime/40"
                  style={{ width: `${widthPct}%` }}
                />
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    &ldquo;{p.text}&rdquo;
                  </span>
                  <span className="font-display text-xs tabular-nums text-brand-black/60">
                    {p.count}×
                  </span>
                </span>
              </button>
              {isOpen && (
                <blockquote className="mt-1 border-l-2 border-brand-purple pl-3 pr-3 py-2 font-body text-sm italic text-brand-black/75 leading-relaxed">
                  &ldquo;{p.exampleQuote}&rdquo;
                </blockquote>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default ReviewVoice;
