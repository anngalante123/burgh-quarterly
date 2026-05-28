import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { SubscribeInline } from "@/components/SubscribeInline";

import {
  UNDERRATED_CATEGORIES,
  isUnderratedCategorySlug,
  selectUnderratedForCategory,
  type UnderratedCategorySlug,
} from "@/lib/data/underrated";
import {
  getAllBusinessSlugs,
  type BusinessArtifact,
} from "@/lib/data/load-business";
import type { Tier } from "@/lib/data/schemas";
import { estimateReadingMinutes } from "@/lib/editorial/reading-time";
import { CategorySwitcher } from "@/components/editorial/CategorySwitcher";
import { ListTOC, toEntryAnchor } from "@/components/editorial/ListTOC";
import { CompanionLink } from "@/components/editorial/CompanionLink";

/**
 * The Underrated List, loud editorial, one category per quarterly issue.
 *
 * v1 ships `/underrated/bakeries` only. Add more by extending
 * UNDERRATED_CATEGORIES + adding a slug to generateStaticParams here + writing
 * a renderEntryCopy() clause for that category.
 *
 * Voice rules (see .claude/memory/EDITORIAL_VOICE.md, ALL OF IT applies):
 *  - LOUD: specific, opinionated, covers (doesn't surveil).
 *  - Never "we noticed"; never yinzer-isms; never creator-economy jargon.
 *  - Never name Relay in body copy (the Colophon handles it).
 *  - Never show a raw composite score or a letter grade.
 *  - Frame every entry as underrated = the city hasn't caught up yet, not weak.
 */

type PageProps = {
  params: Promise<{ category: string }>;
};

export function generateStaticParams(): { category: string }[] {
  // Render on demand to fit Neon's data-transfer quota. ISR caches
  // each page for 24h after first visit. dynamicParams defaults to
  // true so any UNDERRATED_CATEGORIES slug resolves; unknown slugs
  // 404 via notFound() in the page body.
  return [];
}

const TIER_LABEL: Record<Tier, string> = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
};

const NUMERAL = ["01", "02", "03", "04", "05"] as const;

/* ---------- per-entry editorial copy (handwritten, not generated) ---------- */

type EntryCopy = {
  hook: string;
  stat: string;
};

/**
 * Editorial hooks + one-stat lines, written from the data on file.
 * Keep each hook under ~40 words, specific to street / neighborhood / product,
 * no jargon, no "we noticed," no yinzer dialect. The stat is two clauses ,
 * one contrasts the other, pulled from real numbers in the record.
 *
 * Adding a new business? Drop another entry here keyed by slug. If a slug
 * is missing we fall back to a data-driven synthesized line so the page
 * never crashes on fresh data, but hand-written copy always reads better.
 */
const ENTRY_COPY: Record<string, EntryCopy> = {
  "la-gourmandine-lawrenceville": {
    hook:
      "Still the quietest heavyweight on Butler Street. A full French case, croissants, quiches, a rotating tart, shows up behind the glass by 7am and the line doesn't move at the speed it should for a bakery with thirteen hundred reviews.",
    stat: "1,138 five-star reviews. 779 photos across 13 Google categories, and no one has filmed there in a month.",
  },
  "la-gourmandine-hazelwood": {
    hook:
      "The Hazelwood outpost on Second Ave has a different gravity than the Butler Street original, fewer tourists, same pastry, people who actually live on the block. Someone left a five-star review three days ago. Nobody has posted about it.",
    stat: "462 five-star reviews out of 525. Reviewed this week. Zero creator coverage in the last 30 days.",
  },
  "the-butterwood-bake-consortium": {
    hook:
      "Women-owned, Butler Street, and the review that keeps coming back is the one about gluten-free and nut-free options that don't taste like compromise. The last review landed today. The last reel about it landed sometime last year.",
    stat: "736 reviews, 984 photos on file. A fresh review today. Creator coverage: missing.",
  },
  // --- coffee shops & cafes ---
  meetcha: {
    hook:
      "Forbes Avenue, Squirrel Hill South. The matcha latte is the move and the room knows it, quiet on weekday mornings, packed by 11. The reviews skew young and earnest. The grids haven't found it.",
    stat:
      "124 five-star reviews. 115 photos on the listing. Zero creator moments in the last 30 days.",
  },
  "ka-fair-coffee-and-cakery": {
    hook:
      "Morningside isn't a coffee neighborhood by reputation, which is exactly why Ka-Fair sits with a steady regular base and almost no out-of-neighborhood awareness. The cake case rotates weekly. The chairs are full by 9.",
    stat:
      "146 photos on file, dominated by the case. Creator coverage of the cakes: zero this quarter.",
  },
  "24-carrot-juice": {
    hook:
      "Bloomfield's juice room, the kind of place that picks up steady weekday foot traffic from the hospital workers and almost no weekend reach beyond it. The menu hasn't changed enough to confuse the regulars. The feed has barely moved.",
    stat:
      "177 photos on file. Steady five-star drip from regulars. The TikTok layer hasn't started.",
  },

  // --- bars & breweries ---
  "commerce-bar": {
    hook:
      "East Liberty's quiet cocktail room. 88 five-star reviews from people who finished the drink and meant it. The room is small enough to feel like a tip, large enough to bring a date.",
    stat:
      "88 five-star reviews against 138 photos. A photogenic room. Zero reels in the last 30 days.",
  },
  "golden-age-beer-company": {
    hook:
      "Lawrenceville-adjacent brewer running a tight, narrow lineup, no distillery cosplay, no merch wall. The kind of taproom that fills with regulars after work and nobody films. 298 photos on file. Almost none of them theirs.",
    stat:
      "298 photos on the listing, most uploaded by drinkers. The brewery's own coverage layer: missing.",
  },
  "hop-farm-brewing-company": {
    hook:
      "Lawrenceville's quiet brewer, single location, door open in summer. The beer is regulars-good. The Instagram traffic is regulars-only. The kind of operation a creator-week could move two ranks.",
    stat:
      "239 five-star reviews. 364 photos. A taproom Pittsburgh hasn't filmed yet.",
  },

  // --- restaurants ---
  "oishii-donburi": {
    hook:
      "Lawrenceville donburi shop, rice bowls, pickles, beer, no dinner reservations. The lunch line is the tell. The food photographs better than the room, and the room is fine.",
    stat:
      "324 five-star reviews. 342 photos. Reviews still landing this week. The feed: dormant.",
  },
  lorelei: {
    hook:
      "East Liberty's German-Austrian holdover, sausages and pretzels, a patio that does steady summer work. Reviews call out the same bratwurst, the same beer list, the same one waiter. The kind of consistency that doesn't trend.",
    stat:
      "284 five-star reviews. 291 photos. Steady, unflashy, undercovered.",
  },
  "reva-modern-indian-cuisine": {
    hook:
      "East Liberty's modern Indian, spice level honest, the lamb chops the regulars order without looking. Reviews mention the same three dishes three times in a row. Nothing reads as a city-wide find yet.",
    stat:
      "443 photos on file. Reviews repeating the same favorites. Signal: locked in. Coverage: hasn't cracked.",
  },

  // --- fallbacks for future bakeries when the dataset grows ---
  pages: {
    hook:
      "The East Carson Street line is a meme at this point, and Pages still doesn't feel covered, more people film themselves waiting than film what's in the case.",
    stat: "3,145 reviews. 2,746 of them five-star. The line is longer than the coverage.",
  },
  waffallonia: {
    hook:
      "Murray Avenue's single-product bakery, Liège waffles, a squeeze of chocolate, a scoop on top, and a 4.6 rating that's held for years without a single creator moment.",
    stat: "605 reviews, 462 of them five-star. Reviewed this week. Posts about it: close to none.",
  },
  "kyo-matcha": {
    hook:
      "Forbes Avenue, matcha-forward, and the kind of display case that's been built for video. The reviews split between the soft-serve and the cakes; the algorithm hasn't split either way yet.",
    stat: "269 five-star reviews. 405 photos on the listing. Creator takes: still waiting.",
  },
};

function renderEntryCopy(artifact: BusinessArtifact): EntryCopy {
  const handwritten = ENTRY_COPY[artifact.business.slug];
  if (handwritten) return handwritten;

  // Graceful fallback: synthesize a line from the data so a new slug
  // doesn't crash the page. The hook leans on neighborhood + reviews;
  // the stat pairs five-star count with photo count. Reads flat but
  // doesn't embarrass us.
  const fiveStar = artifact.meta.reviewsDistribution?.fiveStar ?? 0;
  const imagesCount = artifact.meta.imagesCount;
  const neighborhood = artifact.business.neighborhood;
  const hook =
    `Sitting in ${neighborhood} with ${fiveStar.toLocaleString()} five-star reviews ` +
    `and no creator moment yet. The customers have been showing up for a while. ` +
    `The coverage hasn't.`;
  const stat =
    `${fiveStar.toLocaleString()} five-star reviews. ${imagesCount.toLocaleString()} photos on the listing.`;
  return { hook, stat };
}

/* ---------- page ---------- */

export default async function UnderratedCategoryPage({ params }: PageProps) {
  const { category } = await params;

  if (!isUnderratedCategorySlug(category)) notFound();

  const result = await selectUnderratedForCategory(category);
  if (!result) notFound();

  const { spec, entries } = result;
  const indexCount = (await getAllBusinessSlugs()).length;

  const headline = `Pittsburgh's Most Underrated ${spec.label}, Spring 2026`;
  const count = entries.length;
  const countWord = numberWord(count);
  const dekCount = `${capitalize(countWord)} ${
    count === 1 ? spec.singularLower : spec.pluralLower
  } the city hasn't caught up to yet.`;
  const readMinutes = estimateReadingMinutes(count);
  const tocItems = entries.map((e) => ({ name: e.business.name }));

  return (
    <>
      <Masthead variant="compact" />

      {/* Kicker strip, section header band */}
      <div className="w-full bg-brand-black">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · The Underrated List
          </p>
        </div>
      </div>

      <main className="flex-1 text-brand-black">
        {/* ---------- HERO ---------- */}
        <article className="mx-auto max-w-7xl px-6 pt-10 pb-14 md:pt-16 md:pb-20">
          <Reveal as="header">
            <nav
              aria-label="Breadcrumb"
              className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55"
            >
              <Link href="/" className="hover:text-brand-purple">
                Signal Pittsburgh
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <Link href="/underrated" className="hover:text-brand-purple">
                The Underrated List
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">{spec.label}</span>
            </nav>

            <p className="mt-8 font-body italic text-brand-black/75 text-lg md:text-xl">
              {dekCount}
            </p>

            <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              {headline}
            </h1>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <span className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/60">
                By the editors · Spring 2026 · {readMinutes} min read
              </span>
              <span className="inline-flex items-center bg-brand-lime px-2.5 py-1 font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black">
                PGH · Signal Index
              </span>
            </div>

            <p className="mt-10 max-w-3xl font-body text-brand-black/85 text-lg md:text-xl leading-relaxed">
              {spec.heroLine.replace(
                "{{count}}",
                count === 1 ? "one" : countWord,
              )}{" "}
              Not our top-ranked, the ones whose rank we expect to move
              most, and soonest. If you haven&apos;t been, go this weekend.
            </p>

            {/* Category switcher, tabs for every Underrated list live */}
            <div className="mt-10">
              <CategorySwitcher basePath="/underrated" current={category} />
            </div>

            {/* How we picked these, inline methodology note */}
            <div className="mt-10 border-l-4 border-brand-purple bg-white/60 px-5 py-4 max-w-3xl">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                How we picked these
              </p>
              <p className="mt-2 font-body text-sm md:text-base text-brand-black/80 leading-relaxed">
                We filtered the {spec.pluralLower} to every business outside
                the Icons tier this issue, then sorted by composite score
                ascending so the lowest-ranked land first. Composite comes
                from five signals: reviews, sentiment, photos, Instagram
                cadence, and creator fit.{" "}
                <Link
                  href="/how-we-rank"
                  className="text-brand-purple hover:underline font-medium"
                >
                  Full methodology →
                </Link>
              </p>
            </div>

            {/* Table of contents, jump to any entry */}
            <div className="mt-10">
              <ListTOC items={tocItems} />
            </div>
          </Reveal>
        </article>

        {/* ---------- THE LIST ---------- */}
        <section
          aria-label={`The list of underrated ${spec.pluralLower}`}
          className="border-t border-brand-black/15"
        >
          <ol className="mx-auto max-w-7xl px-6">
            {entries.map((entry, idx) => (
              <EntryBlock
                key={entry.business.slug}
                index={idx}
                artifact={entry}
                categoryLabel={spec.label}
              />
            ))}
          </ol>
        </section>

        {/* ---------- CLOSING NOTE ---------- */}
        <section className="border-t border-brand-black/15 bg-brand-cream">
          <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <Reveal>
              <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                Why these are on the list
              </p>
              <div className="mt-4 max-w-3xl border-l-4 border-brand-lime pl-6">
                <p className="font-body text-xl md:text-2xl leading-snug text-brand-black">
                  Each of these is ranked lower than their customers would
                  tell you. The reviews are strong. The photos are stacked.
                  What&apos;s missing is coverage, the creator layer that
                  moves a rank. The next quarterly will tell us which of
                  them climbed. Our bet: most of them.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------- COMPANION LINK ---------- */}
        <section className="border-t border-brand-black/15">
          <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <CompanionLink
              href={`/top/${category}`}
              kicker="The Icons"
              headline={`Pittsburgh's Top ${spec.label}, Spring 2026`}
              dek={`The ${spec.pluralLower} firing on every signal this quarter, the counterweight to this list.`}
              accent="lime"
            />
          </div>
        </section>

        {/* ---------- SUBSCRIBE ---------- */}
        <section className="border-t border-brand-black/15">
          <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              Next issue drops summer
            </p>
            <h2 className="mt-2 font-display font-black uppercase tracking-[-0.01em] text-brand-black [word-break:break-word] text-[clamp(1.5rem,4vw,2.5rem)] leading-[1.05]">
              Don&apos;t miss a climber.
            </h2>
            <div className="mt-8">
              <SubscribeInline />
            </div>
          </div>
        </section>

        {/* ---------- REQUEST CTA ---------- */}
        <section className="border-t border-brand-black/15">
          <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <Reveal>
              <div className="border-2 border-brand-black bg-white p-8 md:p-12">
                <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black [text-wrap:balance] text-[clamp(1.75rem,5vw,3rem)] leading-[0.95]">
                  Not on{" "}
                  <span className="bg-brand-lime px-2 box-decoration-clone">
                    this list
                  </span>
                  ?
                </h2>
                <p className="mt-5 max-w-2xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
                  The Spring 2026 index covers {indexCount} Pittsburgh
                  businesses. The next issue ships this summer. We review
                  every request for inclusion by hand.
                </p>
                <Link
                  href="/request"
                  className="mt-7 inline-flex items-center gap-2 bg-brand-black px-6 py-3 font-display text-xs md:text-sm font-semibold uppercase tracking-[0.18em] text-brand-lavender transition-colors hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
                >
                  Get reviewed for Issue 02
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}

/* ---------- list entry ---------- */

function EntryBlock({
  index,
  artifact,
  categoryLabel,
}: {
  index: number;
  artifact: BusinessArtifact;
  categoryLabel: string;
}) {
  const numeral = NUMERAL[index] ?? String(index + 1).padStart(2, "0");
  const isEven = index % 2 === 1; // 0-indexed: odd indices reverse

  const copy = renderEntryCopy(artifact);
  const { business, score } = artifact;

  return (
    <li
      id={toEntryAnchor(index)}
      className={[
        "grid grid-cols-1 md:grid-cols-12 gap-y-6 md:gap-x-10",
        "border-b border-brand-black/15",
        "py-14 md:py-20 scroll-mt-24",
      ].join(" ")}
    >
      {/* numeral, order swap on desktop via md:col-start */}
      <Reveal
        as="div"
        className={[
          "md:col-span-4",
          isEven ? "md:order-2 md:col-start-9" : "md:col-start-1",
          "flex md:block",
          "items-start",
        ].join(" ")}
      >
        <span
          className="font-display font-black tabular-nums tracking-[-0.02em] leading-[0.82] text-7xl md:text-8xl lg:text-9xl text-brand-black/15 select-none"
          aria-hidden="true"
        >
          {numeral}
        </span>
        <span className="sr-only">Entry {index + 1}.</span>
      </Reveal>

      {/* body */}
      <Reveal
        as="div"
        delay={0.05}
        className={[
          "md:col-span-8",
          isEven ? "md:order-1 md:col-start-1 md:row-start-1" : "md:col-start-5",
          "flex flex-col gap-5",
        ].join(" ")}
      >
        <h2 className="font-display font-black uppercase leading-[0.95] tracking-[-0.01em] text-3xl md:text-4xl lg:text-5xl text-brand-black">
          {business.name}, {business.neighborhood}
        </h2>

        <p className="font-body text-lg md:text-xl leading-relaxed text-brand-black/85">
          {copy.hook}
        </p>

        {/* one signal stat, visually distinct, lime highlight */}
        <p className="self-start border-l-4 border-brand-lime bg-brand-cream px-4 py-3 font-body text-base md:text-lg text-brand-black">
          {copy.stat}
        </p>

        {/* tier line, quiet */}
        <p className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
          Currently: {TIER_LABEL[score.tier]} · #{score.rank_category} in
          {" "}Pittsburgh {categoryLabel}
        </p>

        <div>
          <Link
            href={`/business/${business.slug}`}
            className="inline-flex items-center gap-2 font-display text-sm md:text-base font-semibold uppercase tracking-[0.14em] text-brand-black underline decoration-brand-lime decoration-4 underline-offset-4 hover:text-brand-purple hover:decoration-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            Read the record <span aria-hidden="true">→</span>
          </Link>
        </div>
      </Reveal>
    </li>
  );
}

/* ---------- tiny utilities ---------- */

function numberWord(n: number): string {
  switch (n) {
    case 1:
      return "one";
    case 2:
      return "two";
    case 3:
      return "three";
    case 4:
      return "four";
    case 5:
      return "five";
    default:
      return String(n);
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
