import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { SubscribeInline } from "@/components/SubscribeInline";
import { Reveal } from "@/components/motion/Reveal";
import { loadAllBusinesses } from "@/lib/data/load-business";
import { computeTierCounts } from "@/lib/data/stats";
import {
  BusinessSearch,
  type SearchableBusiness,
} from "@/components/BusinessSearch";
import { loadAllListArticles } from "@/lib/data/load-list";

/**
 * Homepage, editorial table of contents for the quarterly issue.
 *
 * Rebuilt 2026-04-22 per /ui-ux-pro-max audit (primary-action + content-priority
 * violations in the prior layout). Changes:
 *   - Killed the full Signal Strip block (tier donut + stat cards + category
 *     bar). Replaced with a single compact "This Quarter" stat line
 *     integrated into the hero.
 *   - Moved the full How We Rank methodology to /about. Homepage keeps a
 *     one-line teaser with a link so readers can get to content faster.
 *   - Collapsed Read + Featured + Underrated into ONE "This Issue" section
 *     with three equal-weight editorial entries: The Icons, The Underrated
 *     List, and a Featured business page. Each links to real content.
 *   - Removed placeholder teasers that linked to dead routes.
 *
 * Structure (4 sections instead of 8):
 *   1. Masthead + Hero + compact this-quarter stat line
 *   2. This Issue, 3 editorial entries
 *   3. How we rank, one-line teaser linking to /about
 *   4. Subscribe + Colophon
 */

export default function Home() {
  const all = loadAllBusinesses();
  const tc = computeTierCounts(all);

  // Slim searchable payload, passed to the client-side BusinessSearch.
  const searchable: SearchableBusiness[] = all.map((a) => ({
    slug: a.business.slug,
    name: a.business.name,
    neighborhood: a.business.neighborhood,
    categoryName: a.meta.categoryName ?? a.business.category,
    tier: a.score.tier,
  }));

  // Best on Social series, three featured articles + the rest.
  const allArticles = loadAllListArticles();
  const FEATURED_SLUGS = [
    "best-creator-posts-about",
    "best-by-posts",
    "underrated-spring-2026",
  ];
  const featuredArticles = FEATURED_SLUGS
    .map((s) => allArticles.find((a) => a.slug === s))
    .filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <>
      <Masthead variant="home" />

      <main className="flex-1">
        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 pt-10 pb-14 md:pt-16 md:pb-20">
          <Reveal delay={0.05}>
            <h2 className="font-display font-black uppercase tracking-[-0.02em] text-brand-black max-w-5xl [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,5.5rem)] leading-[0.9]">
              The city is{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                filming
              </span>
              .
              <br className="hidden sm:block" />
              The businesses aren&apos;t.
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              <span className="font-semibold text-brand-black">
                Twenty-nine creators
              </span>{" "}
              made TikToks about Pittsburgh small businesses this quarter,
              every single one mentioning the city or a neighborhood.{" "}
              <span className="font-semibold text-brand-black">
                None came from the businesses themselves.
              </span>{" "}
              Signal Pittsburgh ranks 30 small businesses by what creators
              are filming, what customers are reviewing, and who&apos;s
              actually showing up on their own feed.{" "}
              <span className="font-semibold text-brand-black">
                We don&apos;t rank taste. We rank the conversation.
              </span>
            </p>
          </Reveal>

          {/* Compact this-quarter stat line, one row, no donut, no bar chart */}
          <Reveal delay={0.2}>
            <dl className="mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-brand-black/15 py-4">
              <div className="flex items-baseline gap-2">
                <dt className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                  Spring 2026
                </dt>
              </div>
              <StatPair
                label="Scored"
                value={all.length.toString()}
              />
              <StatPair
                label="Icons"
                value={tc.icons.toString()}
                accent="bg-brand-lime"
              />
              <StatPair
                label="Ones to Watch"
                value={tc.watch.toString()}
                accent="bg-brand-purple"
              />
              <StatPair
                label="Staples"
                value={tc.staples.toString()}
                accent="bg-brand-cream ring-1 ring-brand-black/40"
              />
            </dl>
          </Reveal>
        </section>

        {/* ── BEST ON SOCIAL SERIES ─────────────────────────────
            Replaces the prior "This issue" section that pointed to
            stub /top and /underrated routes. Surfaces three featured
            list articles from the new lists registry, with a link to
            the full series index. */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-8 flex-wrap gap-3">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
              The Series · Spring 2026
            </h3>
            <Link
              href="/best-on-social"
              className="font-display text-[0.7rem] md:text-xs font-semibold uppercase tracking-[0.18em] text-brand-purple hover:text-brand-black"
            >
              See every list →
            </Link>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {featuredArticles.map((a, i) => (
              <li key={a.slug}>
                <Link
                  href={`/best-on-social/${a.slug}`}
                  className={
                    i === 0
                      ? "group block h-full border border-brand-black bg-brand-black text-brand-off-white p-6 md:p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      : "group block h-full border border-brand-black/15 bg-white/70 p-6 md:p-7 transition-all duration-200 hover:-translate-y-1 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  }
                >
                  <p
                    className={
                      i === 0
                        ? "font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-lime"
                        : "font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple"
                    }
                  >
                    {i === 0 ? "Issue 01 · Featured" : `${a.items.length} businesses · Spring 2026`}
                  </p>
                  <h4
                    className={
                      i === 0
                        ? "mt-3 font-display font-black uppercase tracking-[-0.015em] text-[clamp(1.25rem,2.6vw,1.75rem)] leading-[1.05] text-brand-off-white [text-wrap:balance]"
                        : "mt-3 font-display font-black uppercase tracking-[-0.015em] text-brand-black text-[clamp(1.25rem,2.6vw,1.75rem)] leading-[1.05] [text-wrap:balance]"
                    }
                  >
                    {a.title}
                  </h4>
                  <p
                    className={
                      i === 0
                        ? "mt-3 font-body text-sm text-brand-off-white/70 leading-snug"
                        : "mt-3 font-body text-sm text-brand-black/70 leading-snug"
                    }
                  >
                    {a.subtitle}
                  </p>
                  <p
                    className={
                      i === 0
                        ? "mt-5 inline-flex items-center gap-1 font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-lime"
                        : "mt-5 inline-flex items-center gap-1 font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-black"
                    }
                  >
                    Read the list
                    <span
                      aria-hidden="true"
                      className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    >
                      →
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* ── FEATURED RECORD ────────────────────────────────────
            One business page surfaced as the editorial pick of the
            issue, deep below the series so readers who want to
            understand the layer of detail behind the lists can drop
            into a single record. */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="flex items-baseline justify-between border-b border-brand-black/30 pb-3 mb-6 flex-wrap gap-3">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
              The Record · Featured
            </h3>
            <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/50">
              Issue 01 deep dive
            </span>
          </div>
          <Link
            href="/business/la-gourmandine-lawrenceville"
            className="group block border border-brand-black/15 bg-white/70 p-6 md:p-8 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-purple)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
              Bakery · Lawrenceville · #8 in Sweets
            </p>
            <h4 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-[clamp(1.5rem,4vw,2.5rem)] leading-[1] [text-wrap:balance]">
              La Gourmandine,
              <br />
              Lawrenceville
            </h4>
            <p className="mt-4 max-w-2xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              1,294 five-star reviews. 779 photos on Google.{" "}
              <span className="font-semibold text-brand-black">
                Nine creators filmed it on TikTok in the last 90 days.
              </span>{" "}
              The bakery itself hasn&apos;t posted in 40 days. The full
              scorecard, ranked.
            </p>
            <p className="mt-5 inline-flex items-center gap-1 font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
              Read the record
              <span
                aria-hidden="true"
                className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1"
              >
                →
              </span>
            </p>
          </Link>
        </Reveal>

        {/* ── SEARCH / BROWSE ─────────────────────────────────────
            Readers who didn't find the business they came for in the
            three lists above can search the full index by name,
            neighborhood, or category. */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <BusinessSearch businesses={searchable} />
        </Reveal>

        {/* ── HOW WE RANK, one-line teaser linking to /about ────── */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="border-y-2 border-brand-black py-7 md:py-9 flex flex-wrap items-baseline justify-between gap-4">
            <p className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-[clamp(1.25rem,3vw,2rem)] leading-[1.05]">
              We don&apos;t rank{" "}
              <span className="line-through decoration-brand-purple decoration-4">
                taste
              </span>
              . We rank the{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                conversation
              </span>
              .
            </p>
            <Link
              href="/about"
              className="inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brand-black/70 hover:text-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
            >
              How we rank
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>

        {/* ── SUBSCRIBE ──────────────────────────────────────────── */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-20">
          <SubscribeInline />
        </Reveal>
      </main>

      <Colophon />
    </>
  );
}

/* ----- tiny inline subcomponents ------------------------------------ */

function StatPair({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {accent ? (
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${accent}`}
        />
      ) : null}
      <dt className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-brand-black/55">
        {label}
      </dt>
      <dd className="font-display text-base md:text-lg font-black tabular-nums text-brand-black">
        {value}
      </dd>
    </div>
  );
}

function CardCta({
  label,
  accent,
}: {
  label: string;
  accent: string;
}) {
  return (
    <p
      className={`mt-5 font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${accent} inline-flex items-center gap-1`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      >
        →
      </span>
    </p>
  );
}
