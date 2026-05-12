"use client";

import { useState, type ReactNode } from "react";
import { dispatchUnlock, useUnlocked } from "@/lib/hooks/use-unlocked";

/**
 * Gated, the medium gate on business-page deep dives.
 *
 * What's gated: the expanded content inside an AtAGlance row (peer
 * plot, review voice, TikTok creators, IG sparkline). The collapsed
 * row (label + value + delta) is public. Clicking to expand reveals
 * either the content (if unlocked) or this gate.
 *
 * What's free per LEAD_CAPTURE.md: page title, breadcrumb, diagnosis
 * pull-quote, AtAGlance row headlines, the Playbook moves, subscribe
 * footer. The gate sits between "headline data" and "deep editorial."
 *
 * Unlock model: one email unlocks every gated section on every business
 * page for the lifetime of the cookie. Either the SubscribeFooter or
 * this inline form can trigger it.
 */

type Props = {
  /** Used in the gate copy, "See {label} for {businessName}." */
  label: string;
  businessName: string;
  /** Source identifier for the lead record. */
  source: string;
  /** The deep-dive content shown when unlocked. */
  children: ReactNode;
};

export function Gated({ label, businessName, source, children }: Props) {
  const unlocked = useUnlocked();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "err">("idle");

  if (unlocked) {
    return <>{children}</>;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, follow: businessName, source }),
      });
      if (!res.ok) {
        setState("err");
        return;
      }
      // The cookie was set by the API response. Tell the rest of the
      // page to unlock without a reload.
      dispatchUnlock();
    } catch {
      setState("err");
    }
  }

  return (
    <div className="relative isolate">
      {/* Blurred preview of the underlying content. Absolute so it
          doesn't dictate the height of the row, the gate card does.
          On mobile the gate card is taller than 260px so this prevents
          the absolute child from overflowing visually into adjacent
          rows. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 select-none pointer-events-none [filter:blur(10px)] opacity-40 overflow-hidden"
      >
        {children}
      </div>

      {/* Email gate, in normal flow so its size dictates the row height */}
      <div className="relative flex items-center justify-center px-2 py-6 md:py-10">
        <div className="w-full max-w-md bg-brand-black text-brand-lavender p-5 md:p-6 shadow-[6px_6px_0_0_var(--color-brand-purple)]">
          <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-lime mb-2">
            Subscribers only
          </p>
          <h3 className="font-display font-black uppercase tracking-[-0.01em] text-brand-lavender text-lg md:text-xl leading-[1.1] [text-wrap:balance]">
            See the full {label.toLowerCase()} read for {businessName}.
          </h3>
          <p className="mt-2 font-body text-xs md:text-sm text-brand-lavender/70 leading-snug">
            One email unlocks every business in this issue, plus you get
            Issue 02 the day it drops.
          </p>
          <form
            onSubmit={onSubmit}
            className="mt-4 flex flex-col sm:flex-row gap-2"
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              disabled={state === "loading"}
              className="flex-1 min-w-0 px-3 py-2.5 bg-brand-lavender text-brand-black font-body text-sm placeholder:text-brand-black/60 focus:outline-2 focus:outline-brand-lime"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="bg-brand-lime text-brand-black font-display text-[0.65rem] font-semibold uppercase tracking-[0.18em] px-4 py-2.5 hover:bg-white transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {state === "loading" ? "..." : "Unlock"}
            </button>
          </form>
          {state === "err" ? (
            <p className="mt-2 font-body text-xs text-brand-cream">
              Something went wrong. Try again.
            </p>
          ) : (
            <p className="mt-2 font-body text-[0.65rem] text-brand-lavender/45 leading-snug">
              Quarterly. No filler. Unsubscribe in one click.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Gated;
