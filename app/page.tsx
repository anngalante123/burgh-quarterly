import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { TierBadge } from "@/components/TierBadge";
import { SubscribeInline } from "@/components/SubscribeInline";

/**
 * Homepage — the loud editorial zone (EDITORIAL_VOICE.md § loud-quiet asymmetry).
 *
 * Structure (per brief):
 *   1. Masthead (with tagline — homepage only)
 *   2. Coverline: "Issue 01 · Spring 2026"
 *   3. Three short editorial teasers (placeholders — headlines only for now)
 *   4. Featured this issue (La Gourmandine)
 *   5. SubscribeInline
 *   6. Colophon
 *
 * Editorial voice notes:
 *   - Teaser headlines avoid every forbidden phrase (EDITORIAL_VOICE.md § traps).
 *   - Specificity > dialect: "Lawrenceville", not "Lahrnceville" or yinzer-isms.
 *   - No raw scores. No Relay mentions in editorial body. Relay lives in the
 *     Colophon only (and in the sidebar on claimed business pages elsewhere).
 */

type Teaser = {
  kicker: string;
  headline: string;
  href: string;
};

// Placeholder teasers — headlines only, no body. Copy per brief's examples.
// Links route to the one real page (La Gourmandine) for now; will scaffold
// /issue/2026-spring/... routes in a later task.
const TEASERS: Teaser[] = [
  {
    kicker: "The climb",
    headline: "Who climbed fastest this spring",
    href: "/business/la-gourmandine-lawrenceville",
  },
  {
    kicker: "Underrated list",
    headline: "Pittsburgh's most underrated bakeries",
    href: "/business/la-gourmandine-lawrenceville",
  },
  {
    kicker: "Neighborhood",
    headline: "The Lawrenceville index",
    href: "/business/la-gourmandine-lawrenceville",
  },
];

export default function Home() {
  return (
    <>
      <Masthead variant="home" />

      <main className="flex-1 bg-brand-off-white">
        {/* Coverline */}
        <section className="mx-auto max-w-5xl px-6 pt-10 pb-6 md:pt-14 md:pb-8">
          <p className="font-display text-[0.7rem] md:text-xs uppercase tracking-[0.22em] text-brand-black/60">
            Issue 01 · Spring 2026
          </p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl font-black uppercase leading-[0.95] tracking-[-0.015em] text-brand-black max-w-3xl">
            Ranked, reviewed, and{" "}
            <span className="bg-brand-lime px-2 box-decoration-clone">
              covered
            </span>
            .
          </h2>
          <p className="mt-5 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
            Every quarter, a fresh index of Pittsburgh&apos;s small businesses —
            who climbed, who held, who the city hasn&apos;t caught up to yet.
          </p>
        </section>

        {/* Three editorial teasers */}
        <section
          aria-label="In this issue"
          className="mx-auto max-w-5xl px-6 pb-12 md:pb-16"
        >
          <div className="flex items-baseline justify-between border-b border-brand-black/15 pb-3 mb-6">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
              In this issue
            </h3>
            <span className="font-body text-xs text-brand-black/50">
              3 features
            </span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {TEASERS.map((t) => (
              <li key={t.headline}>
                <Link
                  href={t.href}
                  className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
                >
                  <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
                    {t.kicker}
                  </p>
                  <h4 className="mt-2 font-display text-xl md:text-2xl font-black tracking-[-0.01em] leading-tight text-brand-black group-hover:underline decoration-brand-purple decoration-2 underline-offset-4">
                    {t.headline}
                  </h4>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Featured this issue — La Gourmandine */}
        <section
          aria-label="Featured this issue"
          className="mx-auto max-w-5xl px-6 pb-12 md:pb-20"
        >
          <div className="flex items-baseline justify-between border-b border-brand-black/15 pb-3 mb-6">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
              Featured this issue
            </h3>
          </div>
          <Link
            href="/business/la-gourmandine-lawrenceville"
            className="block group border border-brand-black/15 bg-white/60 p-6 md:p-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="font-body text-xs uppercase tracking-[0.18em] text-brand-black/60">
                  Lawrenceville · Bakery
                </p>
                <h4 className="mt-2 font-display text-3xl md:text-5xl font-black uppercase leading-[0.95] tracking-[-0.01em] text-brand-black group-hover:underline decoration-brand-lime decoration-4 underline-offset-[6px]">
                  La Gourmandine
                </h4>
              </div>
              <TierBadge tier="icons" />
            </div>
            <p className="mt-5 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              1,138 five-star reviews out of 1,294 — the highest concentration
              of five-star reviews among Lawrenceville bakeries this issue.
            </p>
            <p className="mt-6 font-display text-sm font-semibold uppercase tracking-[0.14em] text-brand-purple">
              Read the page →
            </p>
          </Link>
        </section>

        {/* Subscribe */}
        <section className="mx-auto max-w-5xl px-6 pb-20">
          <SubscribeInline />
        </section>
      </main>

      <Colophon />
    </>
  );
}
