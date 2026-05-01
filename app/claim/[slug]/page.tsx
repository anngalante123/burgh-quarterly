import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { ClaimForm } from "@/components/ClaimForm";
import {
  loadAllBusinesses,
  loadBusinessBySlug,
} from "@/lib/data/load-business";

/**
 * /claim/[slug], the Gate-3 ownership claim flow.
 *
 * v1: human-reviewed. The form posts to /api/claim, which captures the
 * lead and emails Anna for manual verification. Magic-link
 * auto-verification is a v2 upgrade per LEAD_CAPTURE.md.
 *
 * Voice:
 *   - "Claim it, not unlock it"
 *   - No marketing-speak; this is the trust-building zone
 *   - Relay name does NOT appear on this page (it's a quiet path)
 */

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): { slug: string }[] {
  return loadAllBusinesses().map((b) => ({ slug: b.business.slug }));
}

export default async function ClaimPage({ params }: PageProps) {
  const { slug } = await params;
  const artifact = loadBusinessBySlug(slug);
  if (!artifact) notFound();

  const { business } = artifact;

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
              <Link
                href={`/business/${business.slug}`}
                className="hover:text-brand-purple"
              >
                {business.name}
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">Claim</span>
            </nav>

            <h1 className="mt-8 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] text-[clamp(2rem,5.5vw,3.75rem)] leading-[0.95]">
              Claim{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                {business.name}
              </span>
            </h1>

            <p className="mt-6 font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              Owners and managers can claim their record. Once verified
              you&apos;ll see the private Opportunities view, with the
              specific moves that close the gap to the next tier, and you
              can opt into movement alerts when your rank changes.
            </p>
          </Reveal>

          <Reveal as="section" className="mt-10 md:mt-12">
            <ClaimForm
              slug={business.slug}
              businessName={business.name}
            />
          </Reveal>

          <Reveal as="section" className="mt-12 border-t border-brand-black/15 pt-8">
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              What gets verified
            </p>
            <ul className="mt-3 space-y-2 font-body text-sm text-brand-black/75 leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[6px] w-[6px] rounded-full bg-brand-purple shrink-0 translate-y-[7px]"
                />
                <span>
                  We match what you submit to public info on your Google
                  listing, your site, or your Instagram. One quick check.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[6px] w-[6px] rounded-full bg-brand-purple shrink-0 translate-y-[7px]"
                />
                <span>
                  We&apos;ll email confirmation within 2 business days.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[6px] w-[6px] rounded-full bg-brand-purple shrink-0 translate-y-[7px]"
                />
                <span>
                  No fee. Claiming a record is free, always.
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
