import Link from "next/link";
import { Suspense } from "react";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { FeaturedCard } from "@/components/best-on-social/FeaturedCard";
import {
  ListsBrowser,
  type ListCardData,
} from "@/components/best-on-social/ListsBrowser";
import {
  isPostArticle,
  loadAllListArticles,
  type ListArticle,
} from "@/lib/data/load-list";
import { loadBusinessesBySlugs } from "@/lib/data/load-business";

/**
 * /best-on-social, the series index. Loads every article in
 * content/lists/articles/, resolves hero photos for each list's
 * #1-ranked business, and hands the assembled card payload to
 * ListsBrowser (client) for filter UI + grid render.
 *
 * Three flagship lists are featured at the top (Icons, Underrated,
 * Loudest Feeds). The remaining lists render in the filtered grid
 * below. The empty "most-creative-posts" list (returns in Issue 02)
 * renders as a subtle placeholder card at the bottom.
 */

export const metadata = {
  title: "Best on Social, Signal Pittsburgh",
  description:
    "Pittsburgh's small businesses ranked by reviews, social, and creator coverage. Quarterly lists.",
};

const FEATURED_SLUGS = [
  "icons-of-spring-2026",
  "underrated-spring-2026",
  "loudest-feeds",
] as const;

/** Slug → category mapping used by the Category filter. Mirrors the
 *  curation note in the spec. Lists with multi-category rosters get
 *  "Mixed"; single-category lists get their family label. */
const CATEGORY_BY_SLUG: Record<string, ListCardData["category"]> = {
  "icons-of-spring-2026": "Mixed",
  "underrated-spring-2026": "Mixed",
  "loudest-feeds": "Mixed",
  "active-posters": "Mixed",
  "best-creator-posts-about": "Mixed",
  "most-creative-posts": "Mixed",
  "bars-on-social": "Bars",
  "cafes-creator-favorites": "Cafes",
  "asian-kitchens-top": "Asian kitchens",
  "sweets-top-10": "Sweets",
  "underrated-restaurants": "Restaurants",
  "underrated-bars": "Bars",
  "underrated-cafes": "Cafes",
  "underrated-sweets": "Sweets",
  "underrated-asian-kitchens": "Asian kitchens",
};

function typeBucketForSlug(slug: string): ListCardData["typeBucket"] {
  if (slug === "icons-of-spring-2026" || slug.startsWith("icons-")) {
    return "icons";
  }
  if (slug.startsWith("underrated-")) {
    return "underrated";
  }
  return "best-on-social";
}

function unitForArticle(article: ListArticle): string {
  const isPosts = isPostArticle(article);
  const count = article.items.length;
  if (isPosts) return count === 1 ? "post" : "posts";
  return count === 1 ? "business" : "businesses";
}

function dekForArticle(article: ListArticle): string {
  // Prefer subtitle (already an 8th-grade-friendly tagline). Fall back to
  // first sentence of intro if needed.
  if (article.subtitle && article.subtitle.length > 0) {
    return article.subtitle;
  }
  const firstSentence = article.intro.split(/[.!?]\s/)[0] ?? "";
  return firstSentence.length > 140
    ? firstSentence.slice(0, 137) + "..."
    : firstSentence;
}

export default async function BestOnSocialIndex() {
  const articles = loadAllListArticles();

  // Collect the #1 business slug from every non-empty article so we can
  // batch-load hero photos in one DB round trip.
  const topBusinessSlugs = Array.from(
    new Set(
      articles
        .filter((a) => a.items.length > 0)
        .map((a) => a.items[0].business_slug)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    ),
  );
  const businessesBySlug = await loadBusinessesBySlugs(topBusinessSlugs);

  function heroPhotoForArticle(a: ListArticle): {
    url: string | null;
    alt: string;
  } {
    if (a.items.length === 0) return { url: null, alt: "" };
    const top = a.items[0];
    const slug = top.business_slug;
    const biz = businessesBySlug.get(slug);
    const photo =
      biz?.business.hero_photo ?? biz?.business.photos[0]?.url ?? null;
    const displayName = "name" in top ? top.name : top.business_name;
    const neighborhood = top.neighborhood;
    return {
      url: photo,
      alt: photo ? `${displayName} in ${neighborhood}` : "",
    };
  }

  // Empty article (returns next issue), handled separately at the bottom.
  const emptyArticles = articles.filter((a) => a.items.length === 0);
  const liveArticles = articles.filter((a) => a.items.length > 0);

  // Pull out the three featured articles. Preserve the FEATURED_SLUGS
  // order, drop any that happen to be missing from disk.
  const featuredArticles = FEATURED_SLUGS.map((s) =>
    liveArticles.find((a) => a.slug === s),
  ).filter((a): a is ListArticle => a !== undefined);

  const featuredSlugSet = new Set(featuredArticles.map((a) => a.slug));
  const restArticles = liveArticles.filter((a) => !featuredSlugSet.has(a.slug));

  const restCards: ListCardData[] = restArticles.map((a) => {
    const hero = heroPhotoForArticle(a);
    return {
      slug: a.slug,
      title: a.title,
      dek: dekForArticle(a),
      itemCount: a.items.length,
      unit: unitForArticle(a),
      category: CATEGORY_BY_SLUG[a.slug] ?? "Mixed",
      typeBucket: typeBucketForSlug(a.slug),
      formatBucket: isPostArticle(a) ? "posts" : "business",
      heroPhoto: hero.url,
      heroAlt: hero.alt,
    };
  });

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1">
        <article className="mx-auto max-w-6xl px-6 py-10 md:py-14">
          <nav
            aria-label="Breadcrumb"
            className="font-body text-xs md:text-sm text-brand-black/60"
          >
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-brand-purple">
                  Pittsburgh
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <span>Best on Social</span>
              </li>
            </ol>
          </nav>

          <header className="mt-6 md:mt-8">
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
              The Series · Spring 2026
            </p>
            <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-[clamp(2rem,6vw,5rem)] leading-[0.95] [text-wrap:balance]">
              Best on{" "}
              <span className="bg-brand-lime text-brand-black px-2 box-decoration-clone">
                social
              </span>
              .
            </h1>
            <p className="mt-5 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              The Pittsburgh small businesses creators kept filming, customers
              kept reviewing, and the city kept talking about this quarter.
              New lists every issue.
            </p>
            <p className="mt-4 font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
              {articles.length} lists · Spring 2026
            </p>
          </header>

          {/* Featured grid */}
          {featuredArticles.length > 0 && (
            <section
              aria-label="Featured lists"
              className="mt-10 md:mt-14 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8"
            >
              {featuredArticles.map((a, i) => {
                const hero = heroPhotoForArticle(a);
                const tierPill =
                  i === 0
                    ? "bg-brand-lime text-brand-black"
                    : i === 1
                      ? "bg-brand-purple text-brand-lavender"
                      : "bg-brand-black text-brand-lime";
                return (
                  <Reveal key={a.slug}>
                    <FeaturedCard
                      slug={a.slug}
                      title={a.title}
                      dek={dekForArticle(a)}
                      itemCount={a.items.length}
                      unit={unitForArticle(a)}
                      tierPill={tierPill}
                      heroPhoto={hero.url}
                      heroAlt={hero.alt}
                    />
                  </Reveal>
                );
              })}
            </section>
          )}

          {/* Filter bar + filtered grid (client component) */}
          <Suspense fallback={<div className="mt-12 sr-only">Loading.</div>}>
            <ListsBrowser cards={restCards} />
          </Suspense>

          {/* Empty / "coming next issue" placeholder */}
          {emptyArticles.length > 0 && (
            <section
              aria-label="Coming next issue"
              className="mt-14 md:mt-20 pt-8 border-t border-brand-black/15"
            >
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
                Coming Issue 02 · Summer 2026
              </p>
              <ul className="mt-4 space-y-3 max-w-2xl">
                {emptyArticles.map((a) => (
                  <li
                    key={a.slug}
                    className="border border-dashed border-brand-black/20 bg-white/30 px-5 py-4"
                  >
                    <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black/70 text-base md:text-lg italic">
                      {a.title}
                    </h2>
                    {a.subtitle ? (
                      <p className="mt-1 font-body text-xs md:text-sm text-brand-black/55 italic">
                        {a.subtitle}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </main>

      <Colophon />
    </>
  );
}
