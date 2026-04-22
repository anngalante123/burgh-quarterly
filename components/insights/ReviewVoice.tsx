"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PreviewBadge } from "./PreviewBadge";
import { cn } from "@/lib/utils";
import type { ReviewAnalysis } from "@/lib/data/load-review-analysis";

/**
 * ReviewVoice — customer-voice distillation.
 *
 * Two modes, preferred in this order:
 *   1. AI analysis mode — when `analysis` is passed, render Claude-mined
 *      themes + sentiment polarity + the "notable quote" + a one-line
 *      summary of what reviewers love vs nitpick. Generated offline via
 *      `scripts/analyze-reviews.ts` and cached at
 *      content/review-analysis/{slug}.json.
 *   2. Phrase mode (fallback) — regex-mined bigram/trigram phrases with
 *      counts and click-to-expand example quotes.
 *
 * Both modes share the same ranked-bar visualization and motion primitives.
 */

export type ReviewPhrase = {
  text: string;
  count: number;
  exampleQuote: string;
};

type ReviewVoiceProps = {
  /** Preferred: full Claude analysis. When present, phrases is ignored. */
  analysis?: ReviewAnalysis | null;
  phrases?: ReviewPhrase[];
  /** Optional heading override (defaults to "Review voice"). */
  heading?: string;
};

const SENTIMENT_CLASS: Record<
  "positive" | "neutral" | "negative",
  { bar: string; dot: string; label: string }
> = {
  positive: {
    bar: "bg-brand-lime/70",
    dot: "bg-brand-lime",
    label: "Positive",
  },
  neutral: {
    bar: "bg-brand-black/15",
    dot: "bg-brand-black/60",
    label: "Neutral",
  },
  negative: {
    bar: "bg-brand-purple/40",
    dot: "bg-brand-purple",
    label: "Nitpick",
  },
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
  analysis,
  phrases = DEFAULT_PHRASES,
  heading = "Review voice",
}: ReviewVoiceProps) {
  if (analysis) {
    return <AiReviewVoice analysis={analysis} heading={heading} />;
  }
  return <PhraseReviewVoice phrases={phrases} heading={heading} />;
}

/* ----------------------------- AI version ----------------------------- */

function AiReviewVoice({
  analysis,
  heading,
}: {
  analysis: ReviewAnalysis;
  heading: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const reduced = useReducedMotion();
  const themes = analysis.themes.slice(0, 6);
  const max = themes.reduce((m, t) => Math.max(m, t.frequency), 1);

  return (
    <section
      aria-label={heading}
      className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-4 gap-3 flex-wrap">
        <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
          {heading}
        </h3>
        <p className="font-body text-xs text-brand-black/55">
          {themes.length} themes · {analysis.review_count} reviews
        </p>
      </div>

      {/* Notable quote — pulled from the reviews */}
      <blockquote className="border-l-4 border-brand-lime pl-4 pr-2 py-2 mb-5 font-body italic text-base md:text-lg text-brand-black leading-snug">
        &ldquo;{analysis.notable_quote}&rdquo;
      </blockquote>

      {/* Themes with sentiment polarity */}
      <ol className="space-y-1.5 mb-5">
        {themes.map((theme, i) => {
          const isOpen = openIdx === i;
          const widthPct = Math.max(
            12,
            Math.round((theme.frequency / max) * 100),
          );
          const s = SENTIMENT_CLASS[theme.sentiment];
          return (
            <li key={`${theme.phrase}-${i}`}>
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                aria-expanded={isOpen}
                className={cn(
                  "relative w-full text-left px-3 py-2 font-body text-sm md:text-base text-brand-black/85 hover:bg-brand-cream/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple transition-colors",
                  isOpen && "bg-brand-cream/80",
                )}
              >
                {reduced ? (
                  <span
                    aria-hidden="true"
                    className={cn("absolute left-0 top-0 bottom-0", s.bar)}
                    style={{ width: `${widthPct}%` }}
                  />
                ) : (
                  <motion.span
                    aria-hidden="true"
                    className={cn("absolute left-0 top-0 bottom-0", s.bar)}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${widthPct}%` }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{
                      duration: 0.7,
                      delay: 0.1 + i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                )}
                <span className="relative flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn("inline-block h-1.5 w-1.5 rounded-full", s.dot)}
                      title={s.label}
                    />
                    <span className="font-medium">&ldquo;{theme.phrase}&rdquo;</span>
                  </span>
                  <span className="font-display text-xs tabular-nums text-brand-black/60">
                    {theme.frequency}×
                  </span>
                </span>
              </button>
              {isOpen && theme.exampleQuote && (
                <blockquote className="mt-1 border-l-2 border-brand-purple pl-3 pr-3 py-2 font-body text-sm italic text-brand-black/75 leading-relaxed">
                  &ldquo;{theme.exampleQuote}&rdquo;
                </blockquote>
              )}
            </li>
          );
        })}
      </ol>

      {/* Sentiment summary */}
      <p className="font-body text-sm md:text-base text-brand-black/75 leading-snug border-t border-brand-black/10 pt-4">
        {analysis.sentiment_summary}
      </p>
    </section>
  );
}

/* ----------------------------- Phrase version (fallback) -------------- */

function PhraseReviewVoice({
  phrases,
  heading,
}: {
  phrases: ReviewPhrase[];
  heading: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const reduced = useReducedMotion();

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
                {reduced ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 bg-brand-lime/40"
                    style={{ width: `${widthPct}%` }}
                  />
                ) : (
                  <motion.span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 bg-brand-lime/40"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${widthPct}%` }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{
                      duration: 0.7,
                      delay: 0.1 + i * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                )}
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className="font-medium">&ldquo;{p.text}&rdquo;</span>
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
