import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";

import {
  getGlobalRankings,
  type GlobalRankingRow,
} from "@/lib/data/load-business";
import type { Category, Tier } from "@/lib/data/schemas";

/**
 * /leaderboard, the property-wide Pittsburgh Firecast 100.
 *
 * Server component. Pulls the top 100 businesses across every category for
 * the active issue, sorted by composite descending (with rank_category and
 * review volume as tiebreaks at the data layer). Renders three tier-banded
 * sections, each row deep-linked to /business/[slug].
 *
 * Voice rules (EDITORIAL_VOICE.md):
 *   - No raw composite scores, no letter grades, no "best of" framing
 *   - Tier badges only; no numeric scoring shown to readers
 *   - No em dashes anywhere; periods, commas, semicolons, parens only
 *   - Editorial voice on the page intro, quiet record voice on the rows
 */

const TOP_N = 100;

const TIER_LABEL: Record<Tier, string> = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
};

const TIER_ORDER: Tier[] = ["icons", "ones_to_watch", "neighborhood_staples"];

const TIER_PILL: Record<Tier, string> = {
  icons:
    "bg-brand-lime text-brand-black border border-brand-black/10 rounded-sm",
  ones_to_watch:
    "bg-brand-purple text-brand-off-white border border-brand-purple rounded-full",
  neighborhood_staples:
    "bg-brand-cream text-brand-black border border-brand-black/15 rounded-full",
};

const CATEGORY_LABEL: Record<Category, string> = {
  restaurant: "Restaurants",
  cafe: "Cafes",
  salon: "Salons",
  boutique: "Boutiques",
  fitness: "Fitness",
  bakery: "Bakeries",
  experience: "Experiences",
  grocery: "Specialty Grocery",
  bar: "Bars",
  brewery: "Breweries",
  distillery: "Distilleries",
  tattoo: "Tattoo Studios",
  ice_cream: "Ice Cream",
  juice: "Juice Bars",
  live_music: "Live Music",
  plant_shop: "Plant Shops",
  bookstore: "Bookstores",
  record_store: "Record Stores",
  florist: "Florists",
  gallery_museum: "Galleries and Museums",
  spa: "Spas",
};

export const metadata = {
  title: "The Pittsburgh Firecast 100, Spring 2026 · Signal Pittsburgh",
  description:
    "The 100 small businesses Pittsburgh is talking about this quarter, ranked across every category by reputation, presence, and momentum.",
};

export default async function LeaderboardPage() {
  const rows = await getGlobalRankings("2026-spring", TOP_N);

  if (rows.length === 0) {
    return (
      <>
        <Masthead variant="compact" />
        <main className="flex-1 text-brand-black">
          <article className="mx-auto max-w-7xl px-6 pt-16 pb-20">
            <p className="font-body text-base text-brand-black/65">
              The leaderboard is being scored. Check back shortly.
            </p>
          </article>
        </main>
        <Colophon />
      </>
    );
  }

  const totalShown = rows.length;
  const groups = groupByTier(rows);

  return (
    <>
      <Masthead variant="compact" />

      {/* Kicker strip */}
      <div className="w-full bg-brand-black">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · The Firecast
          </p>
        </div>
      </div>

      <main className="flex-1 text-brand-black">
        <article className="mx-auto max-w-7xl px-6 pt-10 pb-14 md:pt-16 md:pb-20">
          {/* Breadcrumb */}
          <Reveal as="header">
            <nav
              aria-label="Breadcrumb"
              className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55"
            >
              <Link href="/" className="hover:text-brand-purple">
                Signal Pittsburgh
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">The Firecast 100</span>
            </nav>

            <p className="mt-8 font-body italic text-brand-black/75 text-lg md:text-xl">
              Every category in one index. The top {totalShown} this issue.
            </p>

            <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              The Pittsburgh{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                Firecast
              </span>{" "}
              100
            </h1>

            <p className="mt-6 font-display text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              {totalShown} ranked this issue · Spring 2026 ·{" "}
              <span className="text-brand-lime bg-brand-black px-1.5 py-0.5">
                PGH
              </span>
            </p>
          </Reveal>

          {/* Standfirst */}
          <Reveal delay={0.1}>
            <p className="mt-10 max-w-3xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              Pittsburgh, Allegheny, and Washington County in one ranked
              column. Every category, every neighborhood, ordered by the
              index. The top of the list is firing on every signal: reviews
              stacking, photos documenting, Instagram cadence holding. The
              rest are climbing.
            </p>
          </Reveal>

          {/* Methodology note */}
          <Reveal delay={0.16}>
            <div className="mt-10 border-l-4 border-brand-lime bg-white/60 px-5 py-4 max-w-3xl">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black">
                How this list is ordered
              </p>
              <p className="mt-2 font-body text-sm md:text-base text-brand-black/80 leading-relaxed">
                Composite index, descending. The composite combines five
                signals: reviews, sentiment, photos, Instagram cadence, and
                creator fit. Ties settle on category position, then on
                review volume.{" "}
                <Link
                  href="/about"
                  className="text-brand-purple hover:underline font-medium"
                >
                  Full methodology →
                </Link>
              </p>
            </div>
          </Reveal>

          {/* ---------- TIER-BANDED LIST ---------- */}
          <div className="mt-14 md:mt-20 space-y-14 md:space-y-20">
            {TIER_ORDER.map((tier) => {
              const items = groups[tier];
              if (items.length === 0) return null;
              return (
                <Reveal as="section" key={tier}>
                  <header className="flex items-baseline justify-between gap-4 border-b border-brand-black/15 pb-3">
                    <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-2xl md:text-3xl">
                      {TIER_LABEL[tier]}
                    </h2>
                    <span className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                      {items.length}{" "}
                      {items.length === 1 ? "entry" : "entries"}
                    </span>
                  </header>
                  <ol className="mt-6 space-y-3 md:space-y-4">
                    {items.map((row) => (
                      <li key={row.business_slug}>
                        <LeaderboardRow row={row} />
                      </li>
                    ))}
                  </ol>
                </Reveal>
              );
            })}
          </div>

          {/* Closing */}
          <Reveal as="section" className="mt-14 md:mt-20">
            <div className="bg-brand-cream border-l-4 border-brand-lime px-6 py-6 md:px-10 md:py-8 max-w-3xl">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                What the Firecast is
              </p>
              <p className="mt-2 font-body text-sm md:text-base text-brand-black/85 leading-relaxed">
                A working record. The {totalShown} businesses we&apos;ve
                scored highest across every category this issue, in order.
                Movement matters more than position. Next quarter we&apos;ll
                see who climbs and who holds.
              </p>
            </div>
          </Reveal>
        </article>
      </main>

      <Colophon />
    </>
  );
}

/* ---------- helpers ---------- */

function groupByTier(rows: GlobalRankingRow[]): Record<Tier, GlobalRankingRow[]> {
  const out: Record<Tier, GlobalRankingRow[]> = {
    icons: [],
    ones_to_watch: [],
    neighborhood_staples: [],
  };
  for (const r of rows) out[r.tier].push(r);
  return out;
}

/* ---------- row ---------- */

function LeaderboardRow({ row }: { row: GlobalRankingRow }) {
  const rankNumeral =
    row.rank_global < 10 ? `00${row.rank_global}` : row.rank_global < 100 ? `0${row.rank_global}` : String(row.rank_global);
  const categoryLabel = CATEGORY_LABEL[row.category];

  return (
    <Link
      href={`/business/${row.business_slug}`}
      className="group block rounded-md border border-brand-black/10 bg-white/70 px-4 py-4 md:px-6 md:py-5 transition-colors hover:bg-brand-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      <div className="grid grid-cols-[3rem_1fr_auto] md:grid-cols-[5rem_1fr_auto_auto] items-center gap-4 md:gap-6">
        {/* Rank numeral */}
        <div className="font-display font-black tabular-nums text-2xl md:text-4xl leading-none tracking-[-0.02em] text-brand-black/20 group-hover:text-brand-purple/60 transition-colors">
          {rankNumeral}
        </div>

        {/* Name + neighborhood + category badge (mobile stacks tier under) */}
        <div className="min-w-0">
          <h3 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-base md:text-xl leading-tight [word-break:break-word]">
            {row.name}
          </h3>
          <p className="mt-1 font-body text-xs md:text-sm text-brand-black/65">
            {row.neighborhood}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.6rem] md:text-[0.65rem] bg-brand-black/5 text-brand-black/75 border border-brand-black/10 rounded-sm"
            >
              {categoryLabel}
            </span>
            {/* Mobile-only tier badge */}
            <span
              className={`md:hidden inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.6rem] ${TIER_PILL[row.tier]}`}
            >
              {TIER_LABEL[row.tier]}
            </span>
          </div>
        </div>

        {/* Tier badge desktop */}
        <span
          className={`hidden md:inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.7rem] ${TIER_PILL[row.tier]}`}
        >
          {TIER_LABEL[row.tier]}
        </span>

        {/* Arrow */}
        <span
          aria-hidden="true"
          className="font-display text-brand-black/40 group-hover:text-brand-purple transition-colors text-base md:text-lg"
        >
          →
        </span>
      </div>
    </Link>
  );
}
