"use client";

import { useState } from "react";
import { useTrackEvent } from "@/lib/hooks/use-track-event";
import { EVENTS } from "@/lib/posthog/events";

/**
 * ClaimForm, client form for the Gate-3 claim flow. Submits to
 * /api/claim. v1 is human-reviewed by Anna, not auto-verified. The
 * "verification" field is free-text the claimant uses to prove they
 * own the business (a contact already on the listing, the owner's
 * direct email, etc.) and Anna confirms manually.
 *
 * On success, shows a confirmation state in place of the form. No
 * modals, no toasts.
 */

type Props = {
  slug: string;
  businessName: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function ClaimForm({ slug, businessName }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [verification, setVerification] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const track = useTrackEvent();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind === "submitting") return;
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          email: email.trim(),
          name: name.trim(),
          verification: verification.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({
          kind: "error",
          message:
            typeof data.error === "string"
              ? data.error
              : "Couldn't submit. Try again in a moment.",
        });
        return;
      }
      track(EVENTS.BUSINESS_CLAIM_SUBMITTED, { slug });
      setStatus({ kind: "ok" });
    } catch {
      setStatus({
        kind: "error",
        message: "Network hiccup. Try again in a moment.",
      });
    }
  }

  if (status.kind === "ok") {
    return (
      <div className="border-2 border-brand-black bg-brand-cream p-6 md:p-8">
        <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
          Claim received
        </p>
        <h3 className="mt-2 font-display font-black uppercase tracking-[-0.01em] text-brand-black text-2xl md:text-3xl leading-[1.05]">
          Thanks. We&apos;re on it.
        </h3>
        <p className="mt-4 font-body text-base text-brand-black/80 leading-relaxed">
          We&apos;ll verify your claim by hand and email you within a couple
          business days. Once verified, you&apos;ll get the private
          Opportunities view for {businessName} and the option to opt into
          movement alerts when your rank changes.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
      aria-busy={status.kind === "submitting"}
    >
      <div>
        <label
          htmlFor="claim-name"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Your name
        </label>
        <input
          id="claim-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
      </div>

      <div>
        <label
          htmlFor="claim-email"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Email
        </label>
        <input
          id="claim-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@yourbusiness.com"
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
      </div>

      <div>
        <label
          htmlFor="claim-verification"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Quick proof
        </label>
        <textarea
          id="claim-verification"
          value={verification}
          onChange={(e) => setVerification(e.target.value)}
          required
          rows={3}
          placeholder="A phone number on the listing, the contact email on your site, or your Instagram handle. Anything we can match to public info."
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30 leading-snug"
        />
        <p className="mt-2 font-body text-xs text-brand-black/55">
          We verify by hand. One sentence is fine.
        </p>
      </div>

      {status.kind === "error" && (
        <p
          role="alert"
          className="font-body text-sm text-brand-purple bg-brand-purple/10 border border-brand-purple/30 px-3 py-2"
        >
          {status.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={status.kind === "submitting"}
          className="bg-brand-black text-brand-lavender font-display text-sm font-semibold uppercase tracking-[0.16em] px-6 py-3 hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status.kind === "submitting" ? "Sending..." : "Submit claim"}
        </button>
        <p className="font-body text-xs text-brand-black/55">
          We&apos;ll email you within 2 business days.
        </p>
      </div>
    </form>
  );
}

export default ClaimForm;
