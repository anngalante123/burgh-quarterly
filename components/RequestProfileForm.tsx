"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

/**
 * RequestProfileForm, client form for /request — the path an unranked
 * Pittsburgh business owner takes to ask to be reviewed for the next
 * issue. POSTs to /api/request.
 *
 * Editorially distinct from /claim/[slug] (verifies ownership of an
 * existing index entry) and from run-relay.com/apply (Relay's
 * creator-match offer). This form does not promise inclusion. It
 * captures intent and editorial context so we can manually review
 * for Issue 02.
 *
 * Pattern follows ClaimForm.tsx for the in-place idle/submitting/ok/
 * error states. Uses React Hook Form + Zod for validation per the
 * brief. Includes a hidden honeypot (`website_url`) — bots fill it,
 * humans never see it, server silently drops anything with it set.
 */

const requestSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required")
    .max(140, "Keep it under 140 characters"),
  neighborhood: z
    .string()
    .trim()
    .min(1, "Neighborhood is required")
    .max(80, "Keep it under 80 characters"),
  websiteOrInstagram: z
    .string()
    .trim()
    .min(1, "Add a website or Instagram so we can find you")
    .max(200, "Keep it under 200 characters"),
  contactName: z
    .string()
    .trim()
    .min(1, "Your name is required")
    .max(120, "Keep it under 120 characters"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("That email doesn't look right"),
  notes: z
    .string()
    .trim()
    .max(280, "Keep it to about 280 characters")
    .optional()
    .or(z.literal("")),
  // Honeypot: must stay empty. Real users never see it.
  website_url: z.string().max(0).optional().or(z.literal("")),
});

type RequestFormValues = z.infer<typeof requestSchema>;

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function RequestProfileForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      businessName: "",
      neighborhood: "",
      websiteOrInstagram: "",
      contactName: "",
      email: "",
      notes: "",
      website_url: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (status.kind === "submitting") return;
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
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
      setStatus({ kind: "ok" });
    } catch {
      setStatus({
        kind: "error",
        message: "Network hiccup. Try again in a moment.",
      });
    }
  });

  if (status.kind === "ok") {
    return (
      <div className="border-2 border-brand-black bg-brand-cream p-6 md:p-8">
        <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
          Request received
        </p>
        <h3 className="mt-2 font-display font-black uppercase tracking-[-0.01em] text-brand-black text-2xl md:text-3xl leading-[1.05]">
          You&apos;re on the list for Issue 02 review.
        </h3>
        <p className="mt-4 font-body text-base text-brand-black/80 leading-relaxed">
          We review every request by hand. If you make the next issue,
          you&apos;ll hear from us before it ships. Either way, we&apos;ll
          be in touch.
        </p>
        <p className="mt-6 font-body text-sm">
          <Link
            href="/"
            className="font-display text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-brand-purple hover:text-brand-black underline-offset-4 hover:underline"
          >
            Back to the index
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-5"
      aria-busy={status.kind === "submitting"}
    >
      {/* Honeypot: visually hidden, not focusable, ignored by autofill.
          A real user never sees this. Bots fill every input they find
          and the server silently drops the submission. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          opacity: 0,
        }}
      >
        <label htmlFor="request-website-url">
          Don&apos;t fill this out if you&apos;re human
        </label>
        <input
          id="request-website-url"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website_url")}
        />
      </div>

      <div>
        <label
          htmlFor="request-business-name"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Business name
        </label>
        <input
          id="request-business-name"
          type="text"
          autoComplete="organization"
          {...register("businessName")}
          aria-invalid={errors.businessName ? "true" : undefined}
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
        {errors.businessName && (
          <p
            role="alert"
            className="mt-2 font-body text-xs text-brand-purple"
          >
            {errors.businessName.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="request-neighborhood"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Neighborhood
        </label>
        <input
          id="request-neighborhood"
          type="text"
          autoComplete="address-level3"
          placeholder="Lawrenceville, Bloomfield, Strip District..."
          {...register("neighborhood")}
          aria-invalid={errors.neighborhood ? "true" : undefined}
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
        {errors.neighborhood && (
          <p
            role="alert"
            className="mt-2 font-body text-xs text-brand-purple"
          >
            {errors.neighborhood.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="request-website-or-ig"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Website or Instagram
        </label>
        <input
          id="request-website-or-ig"
          type="text"
          autoComplete="url"
          placeholder="@yourhandle or yourbusiness.com"
          {...register("websiteOrInstagram")}
          aria-invalid={errors.websiteOrInstagram ? "true" : undefined}
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
        {errors.websiteOrInstagram && (
          <p
            role="alert"
            className="mt-2 font-body text-xs text-brand-purple"
          >
            {errors.websiteOrInstagram.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="request-contact-name"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Your name
        </label>
        <input
          id="request-contact-name"
          type="text"
          autoComplete="name"
          {...register("contactName")}
          aria-invalid={errors.contactName ? "true" : undefined}
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
        {errors.contactName && (
          <p
            role="alert"
            className="mt-2 font-body text-xs text-brand-purple"
          >
            {errors.contactName.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="request-email"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Email
        </label>
        <input
          id="request-email"
          type="email"
          autoComplete="email"
          placeholder="you@yourbusiness.com"
          {...register("email")}
          aria-invalid={errors.email ? "true" : undefined}
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30"
        />
        {errors.email && (
          <p
            role="alert"
            className="mt-2 font-body text-xs text-brand-purple"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="request-notes"
          className="block font-display text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-brand-black/70 mb-2"
        >
          Anything we should know?
        </label>
        <textarea
          id="request-notes"
          rows={3}
          maxLength={280}
          placeholder="Optional. Limit ~280 characters."
          {...register("notes")}
          aria-invalid={errors.notes ? "true" : undefined}
          className="w-full bg-white border border-brand-black/30 px-4 py-3 font-body text-base text-brand-black focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/30 leading-snug"
        />
        {errors.notes && (
          <p
            role="alert"
            className="mt-2 font-body text-xs text-brand-purple"
          >
            {errors.notes.message}
          </p>
        )}
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
          className="bg-brand-black text-brand-off-white font-display text-sm font-semibold uppercase tracking-[0.16em] px-6 py-3 hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status.kind === "submitting" ? "Sending..." : "Submit request"}
        </button>
        <p className="font-body text-xs text-brand-black/55">
          We review every request by hand.
        </p>
      </div>
    </form>
  );
}

export default RequestProfileForm;
