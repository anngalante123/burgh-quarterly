"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * BusinessPageTabs, three-tab interior for the business page.
 *
 *   THE PLAYBOOK   – the 3 moves Claude wrote for this business
 *   HOW YOU COMPARE – subscore bars + family ranked list
 *   WHAT CUSTOMERS SAY – review themes + pull-quote
 *
 * Collapses what was a 16-block scroll into a hero zone above and 3
 * focused tabs below. Each tab renders as a server child passed in via
 * props, this component is a thin client-side state container.
 */

export type TabKey = "playbook" | "compare" | "voice";

type TabDef = {
  key: TabKey;
  label: string;
  sublabel: string;
};

const TABS: TabDef[] = [
  { key: "playbook", label: "The Playbook", sublabel: "3 moves" },
  { key: "compare", label: "How you compare", sublabel: "vs family" },
  { key: "voice", label: "What customers say", sublabel: "themes" },
];

type Props = {
  /** Default tab on first render. */
  initial?: TabKey;
  playbook: ReactNode;
  compare: ReactNode;
  voice: ReactNode;
};

export function BusinessPageTabs({
  initial = "playbook",
  playbook,
  compare,
  voice,
}: Props) {
  const [active, setActive] = useState<TabKey>(initial);

  const panel =
    active === "playbook"
      ? playbook
      : active === "compare"
        ? compare
        : voice;

  return (
    <section aria-label="Business detail tabs" className="block">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Business detail tabs"
        className="flex flex-wrap items-stretch gap-2 md:gap-3 border-b-2 border-brand-black pb-3 mb-8"
      >
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={cn(
                "group inline-flex items-baseline gap-2 px-3 md:px-4 py-2 md:py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple",
                isActive
                  ? "bg-brand-black text-brand-lavender"
                  : "bg-white/40 text-brand-black/70 border border-brand-black/15 hover:border-brand-black hover:text-brand-black",
              )}
            >
              <span
                className={cn(
                  "font-display text-xs md:text-sm font-semibold uppercase tracking-[0.14em]",
                )}
              >
                {t.label}
              </span>
              <span
                className={cn(
                  "font-body text-[0.62rem] md:text-[0.7rem] uppercase tracking-[0.14em]",
                  isActive ? "text-brand-lavender/55" : "text-brand-black/60",
                )}
              >
                {t.sublabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      <div role="tabpanel">{panel}</div>
    </section>
  );
}

export default BusinessPageTabs;
