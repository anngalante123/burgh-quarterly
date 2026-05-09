"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

/**
 * SubscoreBars, interactive annotated infographic.
 *
 * Design direction (2026-04-22, /frontend-design pass):
 *   Editorial annotated-chart feel. Not a dashboard. Bars are click-to-
 *   expand: each row opens a "marginalia" panel showing what the bar
 *   actually measures for THIS business, concrete data points pulled
 *   from the record. Only one panel open at a time (accordion).
 *
 * HARD RULES (EDITORIAL_VOICE.md § Gap, not grade):
 *   - No numeric 0-100 scores shown on the bar OR in the expansion
 *   - Width + color + qualitative label encode everything
 *   - Peer-median tick is a vertical line; the fill is relative to median
 *
 * Color logic:
 *   - score >= median + 5 → lime (above peers)
 *   - score <= median - 5 → terracotta (below peers)
 *   - otherwise           → black (near peers)
 *
 * Motion:
 *   - Fill animates width 0 → target on scroll-in, staggered
 *   - Peer-median tick fades in after the fill lands
 *   - Click expand: smooth height transition + content fade-in
 *
 * Copy sync: label + caption must stay byte-identical with the
 * same-indexed entry in `components/HowWeRank.tsx`.
 */

export type SubscoreKey =
  | "content_canvas"
  | "community_spark"
  | "conversion_path"
  | "momentum"
  | "collab_fit";

type Subscores = Record<SubscoreKey, number>;

/**
 * One row in the "What we found" list. `text` is the human-facing bullet.
 * `found` indicates whether this marker was satisfied:
 *   true   marker present (renders with a lime check)
 *   false  marker missing (renders with a purple cross)
 *   undefined  descriptive bullet, no pass/fail (renders with a neutral dot)
 */
export type SubscoreBullet =
  | string
  | { text: string; found?: boolean };

export type SubscoreDetail = {
  /** Longer explainer, one sentence, starts with "We read X as..." or similar */
  explainer?: string;
  /** 2-4 concrete data points from this business's record */
  bullets: SubscoreBullet[];
  /** Optional editorial pullquote, short phrase in italic */
  pullquote?: string;
};

type SubscoreBarsProps = {
  subscores: Subscores;
  peerMedians: Subscores;
  peerFamilyLabel?: string;
  details?: Partial<Record<SubscoreKey, SubscoreDetail>>;
};

const LABELS: Record<SubscoreKey, string> = {
  content_canvas: "Visual catalog",
  community_spark: "Review sentiment",
  conversion_path: "Conversion path",
  momentum: "Instagram momentum",
  collab_fit: "Creator fit",
};

const CAPTIONS: Record<SubscoreKey, string> = {
  content_canvas: "Photos creators can pull from",
  community_spark: "Themes, tone, and what reviewers keep saying",
  conversion_path: "How easy to find, visit, and post about",
  momentum: "Posts, reels, and cadence in the last 30 days",
  collab_fit: "Owner presence, hours, claim status",
};

const ORDER: SubscoreKey[] = [
  "content_canvas",
  "community_spark",
  "conversion_path",
  "momentum",
  "collab_fit",
];

type Qualitative = {
  tone: "above" | "near" | "below";
  fillClass: string;
  positionLabel: string;
  positionLabelClass: string;
};

function qualitative(score: number, median: number): Qualitative {
  if (score >= median + 5) {
    return {
      tone: "above",
      fillClass: "bg-brand-lime",
      positionLabel: "Above peers",
      positionLabelClass: "text-brand-black",
    };
  }
  if (score <= median - 5) {
    return {
      tone: "below",
      fillClass: "bg-brand-purple",
      positionLabel: "Below peers",
      positionLabelClass: "text-brand-purple",
    };
  }
  return {
    tone: "near",
    fillClass: "bg-brand-black",
    positionLabel: "Near peers",
    positionLabelClass: "text-brand-black/60",
  };
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function SubscoreBars({
  subscores,
  peerMedians,
  peerFamilyLabel,
  details,
}: SubscoreBarsProps) {
  const reduced = useReducedMotion();
  const [openKey, setOpenKey] = useState<SubscoreKey | null>(null);

  const peerPhrase = peerFamilyLabel
    ? peerFamilyLabel.replace(/^Pittsburgh\s+/, "").toLowerCase()
    : "category peers";

  return (
    <Reveal as="section" className="block">
      <div aria-label="Subscore index">
        <div className="border-b border-brand-black/15 pb-3 mb-5">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
            Subscore Index
          </h2>
        </div>
        <p className="mb-6 font-body text-sm text-brand-black/65 leading-snug max-w-2xl">
          Five signals that decide where this business lands.{" "}
          <span className="text-brand-black/85 font-medium">Lime</span> beats{" "}
          {peerPhrase}.{" "}
          <span className="text-brand-purple font-medium">Purple</span>{" "}
          trails them.
        </p>

        <ul className="border-t border-brand-black/10">
          {ORDER.map((key, i) => {
            const score = clampPct(subscores[key]);
            const median = clampPct(peerMedians[key]);
            const q = qualitative(score, median);
            const isOpen = openKey === key;
            const detail = details?.[key];
            const hasDetail = !!detail;

            const rowBody = (
              <>
                {/* Row content */}
                <div className="grid grid-cols-[1fr_auto] md:grid-cols-[13rem_1fr_auto] items-center gap-3 md:gap-4 py-4 md:py-5">
                  {/* Label column */}
                  <div className="min-w-0 md:col-start-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        aria-hidden="true"
                        className="font-display text-[0.6rem] font-semibold tabular-nums text-brand-purple tracking-[0.14em]"
                      >
                        0{i + 1}
                      </span>
                      <span className="font-display text-sm md:text-base font-semibold text-brand-black tracking-tight">
                        {LABELS[key]}
                      </span>
                    </div>
                    <p className="mt-0.5 font-body text-[0.7rem] md:text-xs text-brand-black/55 leading-snug">
                      {CAPTIONS[key]}
                    </p>
                  </div>

                  {/* Bar column, hidden on mobile (we show full-width under the
                      label to avoid cramping) */}
                  <div className="hidden md:block md:col-start-2">
                    <Bar
                      score={score}
                      median={median}
                      qualitative={q}
                      index={i}
                      reduced={!!reduced}
                    />
                  </div>

                  {/* Position + chevron */}
                  <div className="flex items-center gap-2 md:col-start-3">
                    {q.tone !== "near" && (
                      <span
                        className={cn(
                          "font-display text-[0.6rem] md:text-[0.62rem] uppercase tracking-[0.14em] whitespace-nowrap",
                          q.positionLabelClass,
                        )}
                      >
                        {q.positionLabel}
                      </span>
                    )}
                    {hasDetail && (
                      <motion.span
                        aria-hidden="true"
                        className="text-brand-black/60"
                        initial={false}
                        animate={{ rotate: isOpen ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        ›
                      </motion.span>
                    )}
                  </div>
                </div>

                {/* Mobile bar, full-width below the label */}
                <div className="md:hidden pb-4">
                  <Bar
                    score={score}
                    median={median}
                    qualitative={q}
                    index={i}
                    reduced={!!reduced}
                  />
                </div>
              </>
            );

            return (
              <li
                key={key}
                className="border-b border-brand-black/10 last:border-b-0"
              >
                {hasDetail ? (
                  <button
                    type="button"
                    onClick={() => setOpenKey(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    className="w-full text-left block hover:bg-white/40 focus:outline-none focus-visible:bg-white/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple transition-colors"
                  >
                    {rowBody}
                  </button>
                ) : (
                  <div>{rowBody}</div>
                )}

                {/* Expansion panel */}
                <AnimatePresence initial={false}>
                  {isOpen && detail && (
                    <motion.div
                      key="panel"
                      initial={reduced ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduced ? { height: "auto", opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                        opacity: { duration: 0.18 },
                      }}
                      className="overflow-hidden"
                    >
                      <div className="relative bg-brand-cream border-t-2 border-brand-lime px-5 py-5 md:px-8 md:py-6 mt-1 mb-1">
                        {/* Editorial kicker */}
                        <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                          What we&apos;re measuring
                        </p>
                        {detail.explainer && (
                          <p className="mt-2 font-body text-sm md:text-base text-brand-black/85 leading-relaxed max-w-2xl">
                            {detail.explainer}
                          </p>
                        )}
                        <p className="mt-4 font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                          What we found
                        </p>
                        {(() => {
                          const items = detail.bullets.map((b) =>
                            typeof b === "string"
                              ? { text: b, found: undefined as boolean | undefined }
                              : b,
                          );
                          const passFail = items.filter(
                            (it) => typeof it.found === "boolean",
                          );
                          const passes = passFail.filter((it) => it.found).length;
                          const showSummary = passFail.length >= 2;
                          return (
                            <>
                              {showSummary && (
                                <p className="mt-2 font-body text-[0.78rem] md:text-sm text-brand-black/65">
                                  <span className="font-semibold text-brand-black">
                                    {passes} of {passFail.length} markers present
                                  </span>
                                  .{" "}
                                  {passes === passFail.length
                                    ? "Every public-readiness marker we look for is in place."
                                    : passes === 0
                                      ? "None of the public-readiness markers are in place yet."
                                      : "The miss is what tilts this signal below peers."}
                                </p>
                              )}
                              <ul className="mt-2 space-y-1.5">
                                {items.map((b, bi) => {
                                  const isPass = b.found === true;
                                  const isMiss = b.found === false;
                                  return (
                                    <li
                                      key={bi}
                                      className={cn(
                                        "flex items-baseline gap-2.5 font-body text-sm",
                                        isMiss
                                          ? "text-brand-black/65"
                                          : "text-brand-black/85",
                                      )}
                                    >
                                      <span
                                        aria-hidden="true"
                                        className={cn(
                                          "inline-flex items-center justify-center shrink-0 translate-y-[-1px] font-display text-[0.7rem] font-bold leading-none",
                                          isPass
                                            ? "h-4 w-4 rounded-full bg-brand-lime text-brand-black"
                                            : isMiss
                                              ? "h-4 w-4 rounded-full bg-brand-purple/15 text-brand-purple ring-1 ring-brand-purple/40"
                                              : "h-[6px] w-[6px] rounded-full bg-brand-lime",
                                        )}
                                      >
                                        {isPass ? "✓" : isMiss ? "✕" : ""}
                                      </span>
                                      <span className="leading-relaxed">
                                        {b.text}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          );
                        })()}
                        {detail.pullquote && (
                          <blockquote className="mt-4 pl-4 border-l-2 border-brand-black/20 font-body italic text-sm text-brand-black/70 leading-relaxed max-w-xl">
                            &ldquo;{detail.pullquote}&rdquo;
                          </blockquote>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 font-body text-[0.7rem] text-brand-black/50 leading-relaxed">
          Tick marks show the typical family score. Bars show relative
          position only, no numeric scores are published.
        </p>
      </div>
    </Reveal>
  );
}

/* ------------------------------ The bar itself ------------------------ */

function Bar({
  score,
  median,
  qualitative: q,
  index,
  reduced,
}: {
  score: number;
  median: number;
  qualitative: Qualitative;
  index: number;
  reduced: boolean;
}) {
  return (
    <div className="relative h-2.5 w-full rounded-full bg-brand-black/8 overflow-visible">
      {/* Fill */}
      {reduced ? (
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            q.fillClass,
          )}
          style={{ width: `${score}%` }}
          aria-hidden="true"
        />
      ) : (
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            q.fillClass,
          )}
          aria-hidden="true"
          initial={{ width: 0 }}
          whileInView={{ width: `${score}%` }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{
            duration: 0.9,
            delay: 0.12 + index * 0.1,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      )}

      {/* Peer median tick */}
      {reduced ? (
        <div
          className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-brand-black/50"
          style={{ left: `calc(${median}% - 1px)` }}
          aria-hidden="true"
          title="Family typical"
        />
      ) : (
        <motion.div
          className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-brand-black/50"
          style={{ left: `calc(${median}% - 1px)` }}
          aria-hidden="true"
          title="Family typical"
          initial={{ opacity: 0, scaleY: 0.4 }}
          whileInView={{ opacity: 1, scaleY: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{
            duration: 0.4,
            delay: 0.7 + index * 0.1,
            ease: "easeOut",
          }}
        />
      )}
    </div>
  );
}

export default SubscoreBars;
