"use client";

import { useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { dispatchUnlock } from "@/lib/hooks/use-unlocked";

/**
 * SubscribeFooter, the single CTA that closes every business page.
 *
 * Editorial framing: "see if [Business] climbs in Issue 02". Magazine-
 * subscribe model, not a sales funnel, captures emails for the next
 * issue and creates a return loop without pitching Relay. This is the
 * only CTA on the page; the prior {ClaimAffordance, RelayWhisper,
 * sidebar} stack was removed in the 2026-04-25 simplification pass.
 *
 * Posts JSON to /api/subscribe (currently stubbed; Resend wiring is a
 * follow-up). On success we swap the form for a quiet thank-you state.
 */

type Props = { businessName: string };

export function SubscribeFooter({ businessName }: Props) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading" || state === "ok") return;
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          follow: businessName,
          source: "subscribe_footer",
        }),
      });
      if (res.ok) {
        // Tell every Gated region on the page that we just unlocked,
        // so a footer subscriber doesn't see the gate when they go
        // back up to expand a row.
        dispatchUnlock();
      }
      setState(res.ok ? "ok" : "err");
    } catch {
      setState("err");
    }
  }

  return (
    <Reveal as="section" className="block">
      <div className="bg-brand-black text-brand-lavender px-6 py-10 md:px-10 md:py-14">
        <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-lime mb-3">
          Issue 02 · Summer 2026
        </p>
        <h2 className="font-display font-black uppercase tracking-[-0.02em] text-brand-lavender text-2xl md:text-4xl leading-[0.98] [text-wrap:balance]">
          See if {businessName}{" "}
          <span className="bg-brand-lime text-brand-black px-2 box-decoration-clone">
            climbs
          </span>{" "}
          next issue.
        </h2>

        {state === "ok" ? (
          <p className="mt-6 font-body text-sm md:text-base text-brand-lime">
            You&apos;re in. We&apos;ll email you when {businessName}&apos;s
            Issue 02 numbers land.
          </p>
        ) : (
          <>
            <form
              onSubmit={onSubmit}
              className="mt-6 md:mt-8 flex flex-col sm:flex-row gap-3 max-w-md"
            >
              <input
                type="email"
                name="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="flex-1 px-4 py-3 bg-brand-lavender text-brand-black font-body text-sm placeholder:text-brand-black/60 focus:outline-2 focus:outline-brand-lime"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="bg-brand-lime text-brand-black font-display text-xs font-semibold uppercase tracking-[0.18em] px-5 py-3 hover:bg-white transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {state === "loading" ? "..." : "Subscribe"}
              </button>
            </form>
            <p className="mt-3 font-body text-xs text-brand-lavender/55">
              Quarterly. One email per issue. We&apos;ll tell you if{" "}
              {businessName} moves.
            </p>
            {state === "err" ? (
              <p className="mt-2 font-body text-xs text-brand-cream">
                Something went wrong. Try again.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Reveal>
  );
}

export default SubscribeFooter;
