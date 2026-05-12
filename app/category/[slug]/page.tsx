import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";

import {
  getBusinessesForCategory,
  getGlobalRankMap,
  type BusinessSummary,
} from "@/lib/data/load-business";
import { CategorySchema, type Category, type Tier } from "@/lib/data/schemas";

/**
 * Generic category leaderboard. Mirrors `/top/[category]` visual language but
 * is fully data-driven: every CategorySchema enum value gets a page, sorted by
 * composite descending, grouped by tier when there are 3+ entries.
 *
 * Voice (EDITORIAL_VOICE.md):
 *   - No raw composite scores, no letter grades, no Relay mention in body
 *   - No "best of" framing; tier badges only
 *   - No em dashes anywhere
 *
 * URL convention: hyphens, not underscores. `/category/ice-cream` maps to the
 * `ice_cream` enum value via slug.replace(/-/g, "_") at the boundary.
 */

type PageProps = {
  params: Promise<{ slug: string }>;
};

/* ---------- per-category labels ---------- */

type CategoryLabel = {
  singular: string;
  plural: string;
  title: string;
};

const CATEGORY_LABEL: Record<Category, CategoryLabel> = {
  restaurant: {
    singular: "restaurant",
    plural: "restaurants",
    title: "Restaurants",
  },
  cafe: { singular: "cafe", plural: "cafes", title: "Cafes" },
  salon: { singular: "salon", plural: "salons", title: "Salons" },
  boutique: { singular: "boutique", plural: "boutiques", title: "Boutiques" },
  fitness: { singular: "fitness studio", plural: "fitness studios", title: "Fitness" },
  bakery: { singular: "bakery", plural: "bakeries", title: "Bakeries" },
  experience: {
    singular: "experience",
    plural: "experiences",
    title: "Experiences",
  },
  grocery: {
    singular: "specialty grocer",
    plural: "specialty grocers",
    title: "Specialty Grocery",
  },
  bar: { singular: "bar", plural: "bars", title: "Bars" },
  brewery: { singular: "brewery", plural: "breweries", title: "Breweries" },
  distillery: {
    singular: "distillery",
    plural: "distilleries",
    title: "Distilleries",
  },
  tattoo: {
    singular: "tattoo studio",
    plural: "tattoo studios",
    title: "Tattoo Studios",
  },
  ice_cream: {
    singular: "ice cream shop",
    plural: "ice cream shops",
    title: "Ice Cream",
  },
  juice: { singular: "juice bar", plural: "juice bars", title: "Juice Bars" },
  live_music: {
    singular: "live music venue",
    plural: "live music venues",
    title: "Live Music Venues",
  },
  plant_shop: {
    singular: "plant shop",
    plural: "plant shops",
    title: "Plant Shops",
  },
  bookstore: {
    singular: "bookstore",
    plural: "bookstores",
    title: "Bookstores",
  },
  record_store: {
    singular: "record store",
    plural: "record stores",
    title: "Record Stores",
  },
  florist: { singular: "florist", plural: "florists", title: "Florists" },
  gallery_museum: {
    singular: "gallery or museum",
    plural: "galleries and museums",
    title: "Galleries and Museums",
  },
  spa: { singular: "spa", plural: "spas", title: "Spas" },
};

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
    "bg-brand-purple text-brand-lavender border border-brand-purple rounded-full",
  neighborhood_staples:
    "bg-brand-cream text-brand-black border border-brand-black/15 rounded-full",
};

/* ---------- slug helpers ---------- */

function slugToCategory(slug: string): Category | null {
  const candidate = slug.replace(/-/g, "_");
  const parsed = CategorySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function categoryToSlug(category: Category): string {
  return category.replace(/_/g, "-");
}

/* ---------- static params ---------- */

export function generateStaticParams(): { slug: string }[] {
  // Render on demand. Pre-rendering all 14 category leaderboards at
  // build time exhausted Neon's data-transfer quota (each page loads
  // every business in its category). ISR caches each page for 24h
  // after first visit.
  return [];
}

/* ---------- metadata ---------- */

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const category = slugToCategory(slug);
  if (!category) return { title: "Not found" };
  const label = CATEGORY_LABEL[category];
  return {
    title: `${label.title}, Spring 2026 · Signal Pittsburgh`,
    description: `Every ${label.singular} in Pittsburgh ranked this issue, by reputation, presence, and momentum.`,
  };
}

/* ---------- page ---------- */

export default async function CategoryLeaderboardPage({ params }: PageProps) {
  const { slug } = await params;
  const category = slugToCategory(slug);
  if (!category) notFound();

  const [businesses, globalRankBySlug] = await Promise.all([
    getBusinessesForCategory(category),
    getGlobalRankMap(),
  ]);
  if (businesses.length === 0) notFound();

  const label = CATEGORY_LABEL[category];
  const count = businesses.length;
  const sparse = count < 3;

  return (
    <>
      <Masthead variant="compact" />

      {/* Kicker strip */}
      <div className="w-full bg-brand-black">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · Category
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
              <span className="text-brand-black">{label.title}</span>
            </nav>

            <p className="mt-8 font-body italic text-brand-black/75 text-lg md:text-xl">
              The full {label.singular} index, ranked this issue.
            </p>

            <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              {label.title}
            </h1>

            <p className="mt-6 font-display text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              {count} ranked this issue · Spring 2026 ·{" "}
              <span className="text-brand-lime bg-brand-black px-1.5 py-0.5">
                PGH
              </span>
            </p>
          </Reveal>

          {/* Standfirst */}
          <Reveal delay={0.1}>
            <p className="mt-10 max-w-3xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              Every {label.singular}{" "}we&apos;ve scored this quarter, sorted
              by the index. Reviews, sentiment, photos, Instagram cadence, and
              creator fit, all rolled into a single rank. The top of the list
              is firing on every signal. The rest are climbing.
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
                creator fit.{" "}
                <Link
                  href="/about"
                  className="text-brand-purple hover:underline font-medium"
                >
                  Full methodology →
                </Link>
              </p>
            </div>
          </Reveal>

          {/* ---------- LIST ---------- */}
          <div className="mt-14 md:mt-20">
            {sparse ? (
              <SparseList
                businesses={businesses}
                globalRankBySlug={globalRankBySlug}
              />
            ) : (
              <TierGroupedList
                businesses={businesses}
                globalRankBySlug={globalRankBySlug}
              />
            )}
          </div>

          {/* Closing */}
          <Reveal as="section" className="mt-14 md:mt-20">
            <div className="bg-brand-cream border-l-4 border-brand-lime px-6 py-6 md:px-10 md:py-8 max-w-3xl">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                What this list is
              </p>
              <p className="mt-2 font-body text-sm md:text-base text-brand-black/85 leading-relaxed">
                A working record. The {label.plural}{" "}we&apos;ve scored
                this issue, in order. Movement matters more than position. Next
                quarter we&apos;ll see who climbs and who holds.
              </p>
            </div>
          </Reveal>
        </article>
      </main>

      <Colophon />
    </>
  );
}

/* ---------- list variants ---------- */

function SparseList({
  businesses,
  globalRankBySlug,
}: {
  businesses: BusinessSummary[];
  globalRankBySlug: Map<string, number>;
}) {
  return (
    <ol className="space-y-6">
      {businesses.map((b, i) => (
        <Reveal as="li" key={b.slug} delay={i * 0.06}>
          <BusinessRow
            business={b}
            rank={i + 1}
            globalRank={globalRankBySlug.get(b.slug) ?? null}
          />
        </Reveal>
      ))}
    </ol>
  );
}

function TierGroupedList({
  businesses,
  globalRankBySlug,
}: {
  businesses: BusinessSummary[];
  globalRankBySlug: Map<string, number>;
}) {
  // Group by tier while preserving the composite-descending order inside each
  // group (the input is already sorted that way).
  const groups: Record<Tier, { business: BusinessSummary; rank: number }[]> = {
    icons: [],
    ones_to_watch: [],
    neighborhood_staples: [],
  };
  businesses.forEach((b, i) => {
    groups[b.tier].push({ business: b, rank: i + 1 });
  });

  return (
    <div className="space-y-14 md:space-y-20">
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
                {items.length} {items.length === 1 ? "entry" : "entries"}
              </span>
            </header>
            <ol className="mt-6 space-y-6">
              {items.map(({ business, rank }, i) => (
                <Reveal as="li" key={business.slug} delay={i * 0.04}>
                  <BusinessRow
                    business={business}
                    rank={rank}
                    globalRank={globalRankBySlug.get(business.slug) ?? null}
                  />
                </Reveal>
              ))}
            </ol>
          </Reveal>
        );
      })}
    </div>
  );
}

/* ---------- row ---------- */

function BusinessRow({
  business,
  rank,
  globalRank,
}: {
  business: BusinessSummary;
  rank: number;
  globalRank: number | null;
}) {
  const rankNumeral = rank < 10 ? `0${rank}` : String(rank);
  return (
    <Link
      href={`/business/${business.slug}`}
      className="group block rounded-md border border-brand-black/10 bg-white/70 px-5 py-5 md:px-7 md:py-6 transition-colors hover:bg-brand-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
    >
      <div className="grid grid-cols-[3.5rem_1fr_auto] md:grid-cols-[5rem_6rem_1fr_auto] items-center gap-4 md:gap-6">
        {/* Rank numeral */}
        <div className="font-display font-black tabular-nums text-3xl md:text-5xl leading-none tracking-[-0.02em] text-brand-black/20 group-hover:text-brand-purple/60 transition-colors">
          {rankNumeral}
        </div>

        {/* Hero thumb (desktop only) */}
        <div className="hidden md:block relative h-20 w-24 overflow-hidden rounded-sm bg-brand-black/5">
          {business.hero_photo ? (
            <Image
              src={business.hero_photo}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>

        {/* Name + neighborhood + (mobile-only tier badge stacked below) */}
        <div className="min-w-0">
          <h3 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-lg md:text-2xl leading-tight [word-break:break-word]">
            {business.name}
          </h3>
          <p className="mt-1 font-body text-sm md:text-base text-brand-black/65">
            {business.neighborhood}
          </p>
          {globalRank !== null ? (
            <p className="mt-0.5 font-display text-[0.6rem] md:text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
              #{globalRank} in Pittsburgh
            </p>
          ) : null}
          {/* Mobile-only tier badge stacked under name+neighborhood */}
          <span
            className={`md:hidden mt-2 inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.65rem] ${TIER_PILL[business.tier]}`}
          >
            {TIER_LABEL[business.tier]}
          </span>
        </div>

        {/* Right cluster: tier badge (desktop) + arrow */}
        <div className="flex items-center justify-end gap-3">
          <span
            className={`hidden md:inline-flex items-center font-display font-semibold uppercase tracking-[0.08em] whitespace-nowrap px-2 py-0.5 text-[0.7rem] ${TIER_PILL[business.tier]}`}
          >
            {TIER_LABEL[business.tier]}
          </span>
          <span
            aria-hidden="true"
            className="font-display text-brand-black/60 group-hover:text-brand-purple transition-colors text-lg"
          >
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
