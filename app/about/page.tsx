import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { HowWeRank } from "@/components/HowWeRank";
import { Reveal } from "@/components/motion/Reveal";
import Link from "next/link";

/**
 * /about, methodology + mission + publisher transparency.
 *
 * Sections, in order:
 *   1. Hero, what the index is, in one sentence
 *   2. How we rank, the full 5-signal methodology (HowWeRank component)
 *   3. Who publishes, explicit Relay-as-publisher framing so readers
 *      can tell this isn't a back-channel ad. Decenters Relay by
 *      emphasizing editorial independence + open methodology.
 *   4. The voice, our editorial stance (optional, short)
 */

export const metadata = {
  title: "About, Signal Pittsburgh",
  description:
    "How we rank Pittsburgh's small businesses every quarter, reviews, sentiment, photos, Instagram, momentum. Published by Relay.",
};

export default function AboutPage() {
  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1 text-brand-black">
        {/* ── HERO ─────────────────────────────────────────────── */}
        <article className="mx-auto max-w-7xl px-6 pt-10 pb-6 md:pt-16">
          <Reveal as="header">
            <nav
              aria-label="Breadcrumb"
              className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55"
            >
              <Link href="/" className="hover:text-brand-purple">
                Signal Pittsburgh
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">About</span>
            </nav>

            <h1 className="mt-8 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              About{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                the index
              </span>
            </h1>

            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              Signal Pittsburgh is a living index of the city&apos;s small
              businesses, published every quarter. We don&apos;t rank taste.
              We rank the conversation: reviews, sentiment, photos,
              Instagram, and how all of it is moving this quarter.
            </p>
          </Reveal>
        </article>

        {/* ── METHODOLOGY ──────────────────────────────────────── */}
        <HowWeRank />

        {/* ── PUBLISHER / WHO WE ARE ───────────────────────────── */}
        <section className="border-t-2 border-brand-black">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                Who publishes this
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                Transparency
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(16rem,1fr)_2fr] gap-10 md:gap-14">
              <div>
                <p className="font-display font-black uppercase tracking-[-0.015em] text-brand-black text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.02]">
                  Published by{" "}
                  <span className="bg-brand-purple text-brand-off-white px-2 box-decoration-clone">
                    Relay
                  </span>
                  .
                </p>
                <p className="mt-5 font-body text-sm md:text-base text-brand-black/70 leading-relaxed">
                  Pittsburgh, PA. Founded 2025.
                </p>
                <a
                  href="https://run-relay.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brand-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
                >
                  run-relay.com
                  <span aria-hidden="true">↗</span>
                </a>
              </div>

              <div className="space-y-5 font-body text-base md:text-lg text-brand-black/85 leading-relaxed max-w-3xl">
                <p>
                  Relay is a Pittsburgh-based creator network. We match
                  local small businesses with vetted local micro-influencers.
                  We built Signal Pittsburgh to understand what makes a
                  business creator-ready in our city, and to track how the
                  conversation around them moves quarter over quarter.
                </p>
                <p>
                  The index is open, the methodology is public, and every
                  business page is free to read and share. Relay is one
                  service among many that can help a business move a
                  signal. We think a healthier small-business scene is
                  good for Pittsburgh regardless.
                </p>
                <p className="text-brand-black/75">
                  If you run a business that appears here, you can claim
                  the page to see the deeper view. If you&apos;re a reader,
                  follow the lists and watch the ranks change. If you&apos;re
                  a journalist or researcher, our methodology is above and
                  the data is open.
                </p>
              </div>
            </div>

            {/* Editorial guarantees, quick-hit transparency */}
            <ul className="mt-12 md:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
              <li className="border border-brand-black/15 bg-white/60 p-5">
                <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                  No pay-for-placement
                </p>
                <p className="mt-2 font-body text-sm text-brand-black/80 leading-snug">
                  Businesses cannot pay for a higher rank, a kinder entry,
                  or to be removed from an Underrated list.
                </p>
              </li>
              <li className="border border-brand-black/15 bg-white/60 p-5">
                <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                  Open methodology
                </p>
                <p className="mt-2 font-body text-sm text-brand-black/80 leading-snug">
                  Every subscore is derived from public signals. We publish
                  how we weight them above and update the scoring quarterly.
                </p>
              </li>
              <li className="border border-brand-black/15 bg-white/60 p-5">
                <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                  Editorial independence
                </p>
                <p className="mt-2 font-body text-sm text-brand-black/80 leading-snug">
                  Relay staff do not write or review individual business
                  pages. The editorial lists are curated by the editors on
                  the masthead.
                </p>
              </li>
            </ul>
          </Reveal>
        </section>
      </main>

      <Colophon />
    </>
  );
}
