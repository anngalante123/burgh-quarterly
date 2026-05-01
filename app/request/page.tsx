import Link from "next/link";
import type { Metadata } from "next";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { RequestProfileForm } from "@/components/RequestProfileForm";

/**
 * /request — the path an unranked Pittsburgh business owner takes to
 * ask to be reviewed for the next issue.
 *
 * Editorially distinct from:
 *   - /claim/[slug]: verifies ownership of a business already in the
 *     index. Different intent, different form, different copy.
 *   - run-relay.com/apply (external, GetFeaturedCTA on home page):
 *     Relay's creator-match offer. Different audience.
 *
 * This page exists because the highest-intent moment in the funnel is
 * the empty state of BusinessSearch — an owner searches for their
 * business, doesn't find it, and that energy was previously a
 * dead-end. Now it has a place to land.
 *
 * Voice rules (per .claude/memory/EDITORIAL_VOICE.md):
 *   - Never promise inclusion. Frame as "we review every request by
 *     hand."
 *   - No marketing-speak. No "amplify," "leverage," "unlock,"
 *     "authentic engagement," "social signal."
 *   - Relay name appears only in the colophon, not in body copy.
 */

export const metadata: Metadata = {
  title: "Request your profile — Signal Pittsburgh",
  description:
    "Issue 01 is closed. Issue 02 ships this summer. Pittsburgh business owners can request a profile review here.",
};

export default function RequestPage() {
  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1 text-brand-black">
        <article className="mx-auto max-w-3xl px-6 pt-10 pb-14 md:pt-16 md:pb-20">
          <Reveal as="header">
            <nav
              aria-label="Breadcrumb"
              className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55"
            >
              <Link href="/" className="hover:text-brand-purple">
                Signal Pittsburgh
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">Request</span>
            </nav>

            <h1 className="mt-8 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] text-[clamp(2rem,5.5vw,3.75rem)] leading-[0.95]">
              Request your{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                profile
              </span>
            </h1>

            <p className="mt-6 font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              Issue 01 is closed. Thirty Pittsburgh businesses are live in
              the index this quarter. Issue 02 ships this summer, and we
              review every request by hand before deciding what makes it.
            </p>

            <p className="mt-4 font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              Tell us who you are, where you are, and where to find you
              online. If your business fits the next issue, you&apos;ll
              hear from us before it drops.
            </p>
          </Reveal>

          <Reveal as="section" className="mt-10 md:mt-12">
            <RequestProfileForm />
          </Reveal>

          <Reveal
            as="section"
            className="mt-12 border-t border-brand-black/15 pt-8"
          >
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              How requests get reviewed
            </p>
            <ul className="mt-3 space-y-2 font-body text-sm text-brand-black/75 leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[6px] w-[6px] rounded-full bg-brand-purple shrink-0 translate-y-[7px]"
                />
                <span>
                  We read every submission. No automated triage, no
                  ranking by who replied first.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[6px] w-[6px] rounded-full bg-brand-purple shrink-0 translate-y-[7px]"
                />
                <span>
                  Submitting a request doesn&apos;t guarantee a profile.
                  The next issue still ranks 30 businesses, and we choose
                  based on the same five signals every record uses.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[6px] w-[6px] rounded-full bg-brand-purple shrink-0 translate-y-[7px]"
                />
                <span>
                  No fee. Requesting a profile is free, always.
                </span>
              </li>
            </ul>
          </Reveal>
        </article>
      </main>

      <Colophon />
    </>
  );
}
