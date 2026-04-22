"use client";

import { useState } from "react";

/**
 * SubscribeInline — inline subscribe form (gate 2).
 *
 * Copy verbatim from EDITORIAL_VOICE.md § Subscribe copy / LEAD_CAPTURE.md § Gate 2:
 *   "Get each quarterly issue the day it drops.
 *    4 emails a year. No filler."
 *
 * POSTs to `/api/subscribe` (stubbed — Resend wiring comes in a later
 * task). Per project brief: for now the route just console.logs + 200s.
 * This component is intentionally minimalist: email only, one button.
 *
 * Per LEAD_CAPTURE.md § Anti-patterns, this is never a modal-block-the-page
 * pattern. It's inline, low-friction, honest about what you're getting.
 */

type SubscribeState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function SubscribeInline() {
  const [state, setState] = useState<SubscribeState>({ kind: "idle" });
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        throw new Error(`Unexpected status ${res.status}`);
      }
      setState({ kind: "success" });
      setEmail("");
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went sideways. Try again?",
      });
    }
  }

  return (
    <section
      aria-label="Subscribe"
      className="border border-brand-black/15 bg-brand-cream px-6 py-8 md:px-10 md:py-10"
    >
      <h2 className="font-display text-2xl md:text-3xl font-black uppercase tracking-[-0.01em] text-brand-black leading-tight">
        Get each quarterly issue the day it drops.
      </h2>
      <p className="mt-2 font-body text-sm md:text-base text-brand-black/70">
        4 emails a year. No filler.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 flex flex-col sm:flex-row gap-3 max-w-xl"
        noValidate
      >
        <label htmlFor="subscribe-email" className="sr-only">
          Email address
        </label>
        <input
          id="subscribe-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@somewhere.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state.kind === "submitting"}
          className="flex-1 px-4 py-3 bg-white border border-brand-black/20 font-body text-sm md:text-base text-brand-black placeholder:text-brand-black/40 focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20"
        />
        <button
          type="submit"
          disabled={state.kind === "submitting"}
          className="px-6 py-3 bg-brand-black text-brand-off-white font-display font-semibold uppercase tracking-[0.08em] text-sm hover:bg-brand-purple transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple disabled:opacity-60"
        >
          {state.kind === "submitting" ? "Subscribing…" : "Subscribe"}
        </button>
      </form>

      <div className="mt-4 min-h-5" aria-live="polite">
        {state.kind === "success" && (
          <p className="font-body text-sm text-brand-black/80">
            You&apos;re on the list. See you at the next drop.
          </p>
        )}
        {state.kind === "error" && (
          <p className="font-body text-sm text-brand-black/80">
            {state.message}
          </p>
        )}
      </div>
    </section>
  );
}

export default SubscribeInline;
