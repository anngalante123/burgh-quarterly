import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { SubscribeInline } from "@/components/SubscribeInline";

import {
  TOP_CATEGORIES,
  isTopCategorySlug,
  selectTopForCategory,
  type TopCategorySlug,
} from "@/lib/data/top";
import type { BusinessArtifact } from "@/lib/data/load-business";
import type { Tier } from "@/lib/data/schemas";
import { estimateReadingMinutes } from "@/lib/editorial/reading-time";
import { CategorySwitcher } from "@/components/editorial/CategorySwitcher";
import { ListTOC, toEntryAnchor } from "@/components/editorial/ListTOC";
import { CompanionLink } from "@/components/editorial/CompanionLink";

/**
 * Top Performers — the celebratory counterpart to the Underrated List.
 *
 * Voice (EDITORIAL_VOICE.md):
 *   - LOUD editorial, celebratory — not braggy, not listicle
 *   - Specific: neighborhoods, product types, what the city actually loves
 *   - No raw composite scores, no grades, no Relay mention in body copy
 *   - No "best-of" framing ("best bakery") — use "Icons," "top of the index"
 *
 * v1 ships /top/bakeries (sweets family). Add categories by extending
 * TOP_CATEGORIES (shared with Underrated) and writing ENTRY_COPY clauses.
 */

type PageProps = {
  params: Promise<{ category: string }>;
};

export function generateStaticParams(): { category: string }[] {
  return (Object.keys(TOP_CATEGORIES) as TopCategorySlug[]).map((category) => ({
    category,
  }));
}

const TIER_LABEL: Record<Tier, string> = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
};

const NUMERAL = ["01", "02", "03", "04", "05"] as const;

/* ---------- per-entry editorial copy ---------- */

type EntryCopy = {
  hook: string;
  stat: string;
};

const ENTRY_COPY: Record<string, EntryCopy> = {
  pages: {
    hook:
      "Arlington's dessert shop pulled a 4.8 rating out of three thousand reviews and keeps it pinned there. A line nobody questions. A case nobody walks past. The full stack is firing.",
    stat:
      "3,145 reviews. 2,746 of them five-star. 1,454 photos on the listing.",
  },
  "millies-homemade-ice-cream": {
    hook:
      "Shadyside's loud one. The flavor rotation is its own feed. The line bends around Ellsworth by six on a Friday. Reviewers don't stop at one scoop, and they don't stop writing about it either.",
    stat: "1,150 reviews. 874 of them five-star. 482 photos on the listing.",
  },
  "jenis-splendid-ice-creams": {
    hook:
      "Larimer, and the case reads like a mood board. Fewer reviews than the Shadyside shops — but the ones that are there are in love. The photography on the listing is better than most bakeries' Instagrams.",
    stat: "251 reviews. 191 of them five-star. 450 photos on the listing.",
  },
  "kyo-matcha": {
    hook:
      "Squirrel Hill South, matcha-forward, and built for a camera. The cakes are the headline; the soft-serve is the repeat. The reviewers who show up for the drink come back for the dessert case.",
    stat: "314 reviews. 269 of them five-star. 405 photos on the listing.",
  },
  waffallonia: {
    hook:
      "Murray Avenue's single-product shop. Liège waffles with chocolate and ice cream — and nothing else on the menu. Nine years of a 4.6 rating on one thing. The city knows what it is.",
    stat: "605 reviews. 462 of them five-star. 291 photos on the listing.",
  },
};

function renderEntryCopy(artifact: BusinessArtifact): EntryCopy {
  const handwritten = ENTRY_COPY[artifact.business.slug];
  if (handwritten) return handwritten;

  // Fallback for future Top Performers added without handwritten copy.
  const fiveStar = artifact.meta.reviewsDistribution?.fiveStar ?? 0;
  const reviews = artifact.business.google_review_count ?? 0;
  const images = artifact.meta.imagesCount;
  const neighborhood = artifact.business.neighborhood;
  const hook =
    `${neighborhood}'s standout. ${fiveStar.toLocaleString()} five-star reviews ` +
    `and a photo catalog that keeps creators interested.`;
  const stat = `${reviews.toLocaleString()} reviews. ${fiveStar.toLocaleString()} of them five-star. ${images.toLocaleString()} photos on the listing.`;
  return { hook, stat };
}

/* ---------- page ---------- */

export default async function TopCategoryPage({ params }: PageProps) {
  const { category } = await params;

  if (!isTopCategorySlug(category)) notFound();

  const result = selectTopForCategory(category);
  if (!result) notFound();

  const { spec, entries } = result;

  const headline = `Pittsburgh's Icons: ${spec.label}, Spring 2026`;
  const count = entries.length;
  const countWord = numberWord(count);
  const dek = `${capitalize(countWord)} ${
    count === 1 ? spec.singularLower : spec.pluralLower
  } firing on every signal — reviews, photos, and momentum.`;
  const readMinutes = estimateReadingMinutes(count);
  const tocItems = entries.map((e) => ({ name: e.business.name }));

  return (
    <>
      <Masthead variant="compact" />

      {/* Kicker strip */}
      <div className="w-full bg-brand-black">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · The Icons
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
              <span>The Burgh Quarterly</span>
              <span className="mx-2 text-brand-black/30">›</span>
              <span>The Icons</span>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">{spec.label}</span>
            </nav>

            <p className="mt-8 font-body italic text-brand-black/75 text-lg md:text-xl">
              {dek}
            </p>

            <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              {headline}
            </h1>

            <p className="mt-6 font-display text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              By the editors · Spring 2026 · {readMinutes} min read ·{" "}
              <span className="text-brand-lime bg-brand-black px-1.5 py-0.5">
                PGH
              </span>
            </p>
          </Reveal>

          {/* Standfirst */}
          <Reveal delay={0.1}>
            <p className="mt-10 max-w-3xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              Every quarter we rank Pittsburgh&apos;s small businesses on the
              conversation — reviews, sentiment, photos, Instagram, how it
              keeps moving. These are the {spec.pluralLower} at the top of
              the index this issue. Reviews stack. Photos document. The line
              is part of the point.
            </p>
          </Reveal>

          {/* Category switcher */}
          <Reveal delay={0.14} className="mt-10">
            <CategorySwitcher basePath="/top" current={category} />
          </Reveal>

          {/* How we picked these — methodology note */}
          <Reveal delay={0.18}>
            <div className="mt-10 border-l-4 border-brand-lime bg-white/60 px-5 py-4 max-w-3xl">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black">
                How we picked these
              </p>
              <p className="mt-2 font-body text-sm md:text-base text-brand-black/80 leading-relaxed">
                We filtered the {spec.pluralLower} to every Icons-tier
                business this issue, sorted by composite score descending —
                the highest-ranked first. Composite comes from five signals:
                reviews, sentiment, photos, Instagram cadence, and creator
                fit.{" "}
                <Link
                  href="/about"
                  className="text-brand-purple hover:underline font-medium"
                >
                  Full methodology →
                </Link>
              </p>
            </div>
          </Reveal>

          {/* Table of contents */}
          <Reveal delay={0.22} className="mt-8">
            <ListTOC items={tocItems} />
          </Reveal>

          {/* ---------- ENTRIES ---------- */}
          <div className="mt-14 md:mt-20 space-y-12 md:space-y-0">
            {entries.map((artifact, i) => {
              const copy = renderEntryCopy(artifact);
              const rankNumeral = NUMERAL[i] ?? `0${i + 1}`;
              const alt = i % 2 === 1;
              const tier = artifact.score.tier;

              return (
                <Reveal
                  key={artifact.business.slug}
                  delay={i * 0.08}
                  as="article"
                  id={toEntryAnchor(i)}
                  className={`relative py-10 md:py-16 scroll-mt-24 ${
                    i < entries.length - 1
                      ? "border-b border-brand-black/15"
                      : ""
                  }`}
                >
                  <div
                    className={`grid gap-6 md:gap-10 ${
                      alt
                        ? "md:grid-cols-[1fr_10rem]"
                        : "md:grid-cols-[10rem_1fr]"
                    }`}
                  >
                    {/* Big numeral — rendered first on odd rows (left),
                        second on even rows (right) so it lands in the
                        narrow grid track either way. */}
                    {!alt && (
                      <div className="font-display font-black tabular-nums text-[clamp(5rem,12vw,10rem)] leading-[0.85] tracking-[-0.03em] text-brand-black/15">
                        {rankNumeral}
                      </div>
                    )}

                    <div>
                      <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-[clamp(1.5rem,4vw,2.5rem)] leading-[1.05] hyphens-manual">
                        {artifact.business.name}
                        <span className="text-brand-black/40 font-medium text-base md:text-lg tracking-normal normal-case ml-2">
                          / {artifact.business.neighborhood}
                        </span>
                      </h2>

                      <p className="mt-4 font-body text-base md:text-lg text-brand-black/85 leading-relaxed max-w-2xl">
                        {copy.hook}
                      </p>

                      {/* Signal stat */}
                      <div className="mt-6 inline-block bg-brand-cream border-l-4 border-brand-lime px-4 py-2.5">
                        <p className="font-body text-sm md:text-base text-brand-black/90">
                          {copy.stat}
                        </p>
                      </div>

                      {/* Tier line */}
                      <p className="mt-4 font-display text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-brand-black/55">
                        {TIER_LABEL[tier]} · #{artifact.score.rank_category} in
                        Pittsburgh{" "}
                        {artifact.meta.categoryName.replace(/\s+/, " ")}s
                      </p>

                      {/* Link */}
                      <Link
                        href={`/business/${artifact.business.slug}`}
                        className="mt-5 inline-flex items-center gap-1 font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
                      >
                        Read the record
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                    {alt && (
                      <div className="font-display font-black tabular-nums text-[clamp(5rem,12vw,10rem)] leading-[0.85] tracking-[-0.03em] text-brand-black/15 md:text-right">
                        {rankNumeral}
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>

          {/* Closing */}
          <Reveal as="section" className="mt-14 md:mt-20">
            <div className="bg-brand-cream border-l-4 border-brand-lime px-6 py-6 md:px-10 md:py-8 max-w-3xl">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                Why these are the Icons
              </p>
              <p className="mt-2 font-body text-sm md:text-base text-brand-black/85 leading-relaxed">
                The index rewards businesses whose signal fires across every
                axis — reviews, sentiment, photos, Instagram cadence, and
                reachability. These {spec.pluralLower} have it on all five.
                Next issue we&apos;ll see who holds and who gets passed.
              </p>
            </div>
          </Reveal>

          {/* Companion link to Underrated — upgraded from a tiny text link
              to a full card that matches the treatment on the Underrated
              page. Gives the reader an obvious next step. */}
          <Reveal as="section" className="mt-14 md:mt-20">
            <CompanionLink
              href={`/underrated/${category}`}
              kicker="The Underrated List"
              headline={`Pittsburgh's Most Underrated ${spec.label}, Spring 2026`}
              dek={`The ${spec.pluralLower} whose rank we expect to move most — the counterweight to this list.`}
              accent="purple"
            />
          </Reveal>
        </article>

        {/* ---------- SUBSCRIBE ---------- */}
        <section className="border-t border-brand-black/15 bg-brand-cream">
          <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <Reveal>
              <SubscribeInline />
            </Reveal>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}

/* ---------- tiny helpers ---------- */

function numberWord(n: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ];
  return words[n] ?? String(n);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
