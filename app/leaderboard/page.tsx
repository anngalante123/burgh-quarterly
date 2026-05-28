import { Suspense } from "react";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { LeaderboardBrowser } from "@/components/LeaderboardBrowser";

import {
  getGlobalRankings,
  type GlobalRankingRow,
} from "@/lib/data/load-business";
import type { Category } from "@/lib/data/schemas";

/**
 * /leaderboard, the Full Pittsburgh Index.
 *
 * Server component. Pulls every scored business in the active issue,
 * sorts them by composite descending (with rank_category and review
 * volume as tiebreaks at the data layer), and hands the full set to a
 * client browser component that owns filter state in URL params and
 * renders the tier-banded sections with chunked "show more" rendering.
 *
 * Voice rules (EDITORIAL_VOICE.md):
 *   - No raw composite scores, no letter grades, no "best of" framing
 *   - Tier badges only; no numeric scoring shown to readers
 *   - No em dashes anywhere; periods, commas, semicolons, parens only
 *   - Editorial voice on the page intro, quiet record voice on the rows
 */

// Render on demand to skip the build-time DB hit. /leaderboard pulls
// every business across every category, which during build counted
// against Neon's data-transfer quota and crashed the export.
export const dynamic = "force-dynamic";

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
  title: "The Full Pittsburgh Index, Spring 2026 · Signal Pittsburgh",
  description:
    "Every small business Pittsburgh is talking about this quarter, ranked across every category by reputation, presence, and momentum. Filter by neighborhood, category, tier, and review volume.",
};

export default async function LeaderboardPage() {
  const rows: GlobalRankingRow[] = await getGlobalRankings("2026-spring");

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

  const totalRanked = rows.length;

  // Build the category options from the actual ranked set, so the
  // dropdown never shows categories with zero businesses this issue.
  const categoryCounts = new Map<Category, number>();
  for (const r of rows) {
    categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);
  }
  const categoryOptions = Array.from(categoryCounts.entries())
    .map(([value, count]) => ({
      value,
      label: `${CATEGORY_LABEL[value]} (${count})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Slim the rows for the client payload. The hero_photo and composite
  // are intentionally dropped here; the browse view never renders the
  // raw composite, and the rich rows show typography, not photography,
  // so we keep the client bundle lean.
  const browserRows = rows.map((r) => ({
    slug: r.business_slug,
    name: r.name,
    neighborhood: r.neighborhood,
    category: r.category,
    categoryName: CATEGORY_LABEL[r.category],
    tier: r.tier,
    rank_global: r.rank_global,
    rank_category: r.rank_category,
    hero_photo: null,
    review_count: r.review_count,
  }));

  return (
    <>
      <Masthead variant="compact" />

      {/* Kicker strip */}
      <div className="w-full bg-brand-black">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · The Full Index
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
              <span className="text-brand-black">The Full Index</span>
            </nav>

            <p className="mt-8 font-body italic text-brand-black/75 text-lg md:text-xl">
              Every category in one index. {totalRanked.toLocaleString()}{" "}
              ranked this issue.
            </p>

            <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              The Full Pittsburgh{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                Index
              </span>
            </h1>

            <p className="mt-6 font-display text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              {totalRanked.toLocaleString()} ranked this issue · Spring 2026 ·{" "}
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
                review volume. Filter by neighborhood, category, tier, or
                review volume to narrow the view.{" "}
                <Link
                  href="/how-we-rank"
                  className="text-brand-purple hover:underline font-medium"
                >
                  Full methodology →
                </Link>
              </p>
            </div>
          </Reveal>

          {/* ---------- BROWSE / FILTER / RENDER ---------- */}
          <Suspense
            fallback={
              <p className="mt-12 sr-only">Loading.</p>
            }
          >
            <LeaderboardBrowser
              rows={browserRows}
              categories={categoryOptions}
            />
          </Suspense>

          {/* Closing */}
          <Reveal as="section" className="mt-14 md:mt-20">
            <div className="bg-brand-cream border-l-4 border-brand-lime px-6 py-6 md:px-10 md:py-8 max-w-3xl">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                What this index is
              </p>
              <p className="mt-2 font-body text-sm md:text-base text-brand-black/85 leading-relaxed">
                A working record. Every business we&apos;ve scored across
                every category this issue, in order. Movement matters more
                than position. Next quarter we&apos;ll see who climbs and
                who holds.
              </p>
            </div>
          </Reveal>
        </article>
      </main>

      <Colophon />
    </>
  );
}
