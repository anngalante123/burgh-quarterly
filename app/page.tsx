import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { TierBadge } from "@/components/TierBadge";
import { SubscribeInline } from "@/components/SubscribeInline";
import { Reveal } from "@/components/motion/Reveal";
import { SignalStrip } from "@/components/SignalStrip";
import { HowWeRank } from "@/components/HowWeRank";
import { loadAllBusinesses } from "@/lib/data/load-business";
import {
  computeCategoryBreakdown,
  computeTierCounts,
  computeTopNeighborhood,
} from "@/lib/data/stats";

/**
 * Homepage — the loud editorial zone (EDITORIAL_VOICE.md § loud-quiet asymmetry).
 *
 * Framing: web-native publication (Infatuation / Eater / Grub Street), not a
 * printed issue's table of contents. "The Burgh Quarterly" is the publication
 * name; the cadence is quarterly; the format is a living website. We keep
 * "Updated Spring 2026" as a quiet metadata line, not a hero-prominent label.
 *
 * Modernization pass (2026-04-21):
 *   - Bolder hero with a display-scale coverline and a lime "dateline"
 *     accent strip so the homepage loudness is immediately legible.
 *   - Asymmetric teaser grid: first teaser spans 2 columns on desktop so
 *     the reading eye lands somewhere specific instead of a flat 3-up.
 *   - Scroll-revealed sections via the Reveal primitive (fade + translate
 *     up, ~0.6s, respects prefers-reduced-motion).
 *   - Teaser card hover: card lifts 4px and the border shifts to lime.
 *   - Featured block: keeps its editorial weight, adds a number-stat rail.
 *
 * Structure:
 *   1. Masthead (with tagline — homepage only)
 *   2. Hero coverline + dateline strip + "Updated Spring 2026" metadata
 *   3. Three editorial teasers under "Read" (asymmetric 2+1 grid)
 *   4. Featured block with a lime stat rail
 *   5. SubscribeInline (with confetti on success)
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
  dek?: string;
  href: string;
};

// Placeholder teasers — headlines only, no body. Copy per brief's examples.
// Links route to the one real page (La Gourmandine) for now; will scaffold
// /issue/2026-spring/... routes in a later task.
const TEASERS: Teaser[] = [
  {
    kicker: "The climb",
    headline: "Who climbed fastest this spring",
    dek:
      "Six businesses moved into Icons this quarter. One did it in a single month.",
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
  const all = loadAllBusinesses();
  const tierCounts = computeTierCounts(all);
  const topNeighborhood = computeTopNeighborhood(all);
  const categoryBreakdown = computeCategoryBreakdown(all, 5);

  return (
    <>
      <Masthead variant="home" />

      <main className="flex-1">
        {/* Hero coverline — web-native, no issue-number framing */}
        <section className="mx-auto max-w-7xl px-6 pt-10 pb-10 md:pt-16 md:pb-14">
          <Reveal delay={0.05}>
            <h2 className="font-display font-black uppercase tracking-[-0.02em] text-brand-black max-w-4xl [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,5.5rem)] leading-[0.9]">
              Ranked, reviewed,
              <br className="hidden sm:block" /> and{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                covered
              </span>
              .
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              How Pittsburgh&apos;s small businesses show up — in{" "}
              <span className="font-semibold text-brand-black">reviews</span>,
              on{" "}
              <span className="font-semibold text-brand-black">Instagram</span>
              , in the neighborhood conversation. Ranked every quarter on{" "}
              <span className="font-semibold text-brand-black">
                reputation, presence, and momentum.
              </span>{" "}
              We don&apos;t rank taste.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <p className="mt-5 font-body text-xs tracking-wide text-brand-black/45">
              Updated Spring 2026
            </p>
          </Reveal>
        </section>

        {/* Signal strip — tier donut + stat cards + category bar */}
        <SignalStrip
          totalScored={all.length}
          tierCounts={tierCounts}
          biggestClimber={null}
          topNeighborhood={topNeighborhood}
          categoryBreakdown={categoryBreakdown}
        />

        {/* How we rank — methodology stance so readers know we rank
            social signal, not taste. */}
        <HowWeRank />

        {/* Editorial teasers — asymmetric 2+1 on desktop */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-8">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
              Read
            </h3>
            <span className="font-body text-xs text-brand-black/50">
              {TEASERS.length} features
            </span>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {TEASERS.map((t, i) => {
              // First teaser spans 2 columns on md+ for asymmetric weight.
              const feature = i === 0;
              return (
                <li
                  key={t.headline}
                  className={feature ? "md:col-span-2" : "md:col-span-1"}
                >
                  <Link
                    href={t.href}
                    className="group block h-full border border-brand-black/15 bg-white/70 p-5 md:p-6 transition-all duration-200 hover:-translate-y-1 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
                      {t.kicker}
                    </p>
                    <h4
                      className={
                        feature
                          ? "mt-3 font-display text-2xl md:text-4xl font-black uppercase tracking-[-0.015em] leading-[1.02] text-brand-black"
                          : "mt-3 font-display text-xl md:text-2xl font-black tracking-[-0.01em] leading-tight text-brand-black"
                      }
                    >
                      {t.headline}
                    </h4>
                    {t.dek && feature && (
                      <p className="mt-3 font-body text-sm md:text-base text-brand-black/70 leading-relaxed max-w-md">
                        {t.dek}
                      </p>
                    )}
                    <p className="mt-5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-brand-black/60 inline-flex items-center gap-1">
                      <span>Read</span>
                      <span
                        aria-hidden="true"
                        className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                      >
                        →
                      </span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>

        {/* Featured — La Gourmandine (with stat rail) */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-8">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
              Featured
            </h3>
          </div>
          <Link
            href="/business/la-gourmandine-lawrenceville"
            className="group block border border-brand-black bg-white/70 p-6 md:p-10 transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0">
                <p className="font-body text-xs uppercase tracking-[0.18em] text-brand-black/60">
                  Lawrenceville · Bakery
                </p>
                <h4 className="mt-2 font-display font-black uppercase tracking-[-0.015em] text-brand-black [word-break:break-word] text-[clamp(1.75rem,5.5vw,4rem)] leading-[0.95] group-hover:underline decoration-brand-lime decoration-[6px] underline-offset-[8px]">
                  La Gourmandine
                </h4>
              </div>
              <TierBadge tier="ones_to_watch" />
            </div>
            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              1,138 five-star reviews out of 1,294 — the highest concentration
              of five-star reviews among Lawrenceville bakeries this issue.
            </p>

            {/* Stat rail — three numbers that pay off the claim above */}
            <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-brand-black/15 pt-6">
              <div>
                <dt className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-brand-black/55">
                  Reviews
                </dt>
                <dd className="mt-1 font-display text-2xl md:text-3xl font-black tabular-nums text-brand-black">
                  1,294
                </dd>
              </div>
              <div>
                <dt className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-brand-black/55">
                  Five-star
                </dt>
                <dd className="mt-1 font-display text-2xl md:text-3xl font-black tabular-nums text-brand-black">
                  88%
                </dd>
              </div>
              <div>
                <dt className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-brand-black/55">
                  Photos
                </dt>
                <dd className="mt-1 font-display text-2xl md:text-3xl font-black tabular-nums text-brand-black">
                  779
                </dd>
              </div>
            </dl>

            <p className="mt-7 font-display text-sm font-semibold uppercase tracking-[0.14em] text-brand-purple inline-flex items-center gap-1.5">
              <span>Read the page</span>
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              >
                →
              </span>
            </p>
          </Link>
        </Reveal>

        {/* Underrated — editorial entry point into the conversion list */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-8">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
              Underrated
            </h3>
          </div>
          <Link
            href="/underrated/bakeries"
            className="group block border border-brand-black/15 bg-white/60 p-6 md:p-8 transition-all duration-200 hover:-translate-y-1 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-purple)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
              The list
            </p>
            <h4 className="mt-3 font-display text-2xl md:text-4xl font-black uppercase leading-[1.02] tracking-[-0.015em] text-brand-black">
              Pittsburgh&apos;s most underrated bakeries
            </h4>
            <p className="mt-3 font-body text-sm md:text-base text-brand-black/70 leading-relaxed max-w-xl">
              Five places the city hasn&apos;t caught up to yet.
            </p>
            <p className="mt-5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-brand-black/60 inline-flex items-center gap-1">
              <span>Read the list</span>
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              >
                →
              </span>
            </p>
          </Link>
        </Reveal>

        {/* Subscribe */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-20">
          <SubscribeInline />
        </Reveal>
      </main>

      <Colophon />
    </>
  );
}
