import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { SubscribeInline } from "@/components/SubscribeInline";
import { Reveal } from "@/components/motion/Reveal";
import {
  getAllBusinessesForSearch,
  getGlobalRankings,
  loadAllBusinesses,
} from "@/lib/data/load-business";
import { computeTierCounts } from "@/lib/data/stats";
import {
  BusinessSearch,
  type SearchableBusiness,
} from "@/components/BusinessSearch";
import { loadAllListArticles } from "@/lib/data/load-list";
import { GetFeaturedCTA } from "@/components/GetFeaturedCTA";
import { RelayCollabGallery } from "@/components/RelayCollabs";
import { HeroSearch } from "@/components/HeroSearch";
import { upgradeGooglePhotoSize } from "@/lib/scrape/google-photo-url";

// Render on demand to skip the build-time DB hit. The homepage pulls
// every business for the hero search index and the global rankings,
// which during build counted against Neon's data-transfer quota.
export const dynamic = "force-dynamic";

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

export default async function Home() {
  // Two reads on purpose. The full artifact load is needed for the Top 5
  // (composite + photo + categoryName), the Featured Record (hero_photo +
  // photos array), and tier counts. The slim search payload skips signals,
  // photos, keywords, and the JSONB ranks unpack so the client search prop
  // stays cheap to compute as the index grows past the current 30 records.
  const [all, searchItems, globalTop10] = await Promise.all([
    loadAllBusinesses(),
    getAllBusinessesForSearch(),
    getGlobalRankings("2026-spring", 10),
  ]);
  const tc = computeTierCounts(all);

  // Slim searchable payload, passed to the client-side BusinessSearch.
  const searchable: SearchableBusiness[] = searchItems.map((b) => ({
    slug: b.slug,
    name: b.name,
    neighborhood: b.neighborhood,
    categoryName: b.categoryName,
    tier: b.tier,
  }));

  // Best on Social series, three featured articles + the rest.
  const allArticles = loadAllListArticles();
  const FEATURED_SLUGS = [
    "best-creator-posts-about",
    "most-creative-posts",
    "highest-engagement-rate-posts",
  ];
  const featuredArticles = FEATURED_SLUGS
    .map((s) => allArticles.find((a) => a.slug === s))
    .filter((a): a is NonNullable<typeof a> => !!a);

  // Pittsburgh Firecast Top 10, the visual anchor right below the hero
  // stats line. Sourced from the property-wide global ranking so ties
  // settle deterministically (rank_category, then review volume) and the
  // homepage rail stays consistent with the full /leaderboard page.
  // Photos and human category labels still come from the full artifact
  // load so we can keep the existing card design.
  const artifactBySlug = new Map(all.map((a) => [a.business.slug, a]));
  const top10 = globalTop10.map((row) => {
    const artifact = artifactBySlug.get(row.business_slug);
    return {
      slug: row.business_slug,
      name: row.name,
      neighborhood: row.neighborhood,
      categoryName: artifact?.meta.categoryName || row.category,
      tier: row.tier,
      photo:
        artifact?.business.hero_photo ??
        artifact?.business.photos[0]?.url ??
        null,
    };
  });

  // Featured record's hero photo, pulled from the live business artifact
  // so it stays in sync with the index. La Gourmandine Lawrenceville
  // for Spring 2026.
  const featuredSlug = "la-gourmandine-lawrenceville";
  const featured = all.find((b) => b.business.slug === featuredSlug);
  const featuredPhoto =
    featured?.business.hero_photo ?? featured?.business.photos[0]?.url ?? null;

  return (
    <>
      <Masthead variant="home" />

      <main className="flex-1">
        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-6 pt-10 pb-14 md:pt-16 md:pb-20">
          <Reveal delay={0.05}>
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple mb-4">
              Spring 2026
            </p>
            <h2 className="font-display font-black uppercase tracking-[-0.02em] text-brand-black max-w-5xl [text-wrap:balance] [word-break:break-word] text-[clamp(2.25rem,7.5vw,5.5rem)] leading-[0.9]">
              Pittsburgh small businesses,
              <br className="hidden sm:block" /> ranked on{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                social
              </span>
              .
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              Every quarter, Signal Pittsburgh scores{" "}
              <span className="font-semibold text-brand-black">
                {all.length} local small businesses
              </span>{" "}
              on creator coverage, customer reviews, and posting cadence.
              We don&apos;t rank taste,{" "}
              <span className="font-semibold text-brand-black">
                we rank the conversation
              </span>.{" "}
              Read the index, see who&apos;s climbing, and watch your
              own block in real time.
            </p>
          </Reveal>

          {/* Self-contained hero search. Visible above the fold so a
              visitor who came to look themselves up can start typing
              immediately. Results render inline as an overlay dropdown
              directly under the input. No scroll, no jump to a second
              input below the fold. The lower BusinessSearch section
              remains as the canonical browse view. */}
          <Reveal delay={0.16}>
            <HeroSearch businesses={searchable} />
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
                value={Math.min(tc.icons, 100).toString()}
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

        {/* ── PITTSBURGH FIRECAST TOP 10 ────────────────────────
            Property-wide rail. Surfaces the actual ranking right under
            the hero so the page's primary asset (the index itself) is
            visible, not just announced in copy. Links into each business
            page; the see-more link drops the reader into the full 100. */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-6 flex-wrap gap-3">
            <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
              Pittsburgh Firecast · Top 10 this quarter
            </h3>
            <Link
              href="/leaderboard"
              className="font-display text-[0.7rem] md:text-xs font-semibold uppercase tracking-[0.18em] text-brand-purple hover:text-brand-black"
            >
              See full leaderboard →
            </Link>
          </div>
          <ol className="border border-brand-black/15 bg-white/60">
            {top10.map((b, i) => {
              const tierAccent =
                b.tier === "icons"
                  ? "bg-brand-lime"
                  : b.tier === "ones_to_watch"
                    ? "bg-brand-purple"
                    : "bg-brand-cream ring-1 ring-brand-black/40";
              const tierLabel =
                b.tier === "icons"
                  ? "Icon"
                  : b.tier === "ones_to_watch"
                    ? "Ones to Watch"
                    : "Staple";
              return (
                <li
                  key={b.slug}
                  className={
                    i > 0 ? "border-t border-brand-black/10" : ""
                  }
                >
                  <Link
                    href={`/business/${b.slug}`}
                    className="group grid grid-cols-[2.5rem_3rem_1fr_auto] md:grid-cols-[3.5rem_4rem_1fr_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-6 py-3 md:py-4 hover:bg-brand-cream/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple transition-colors"
                  >
                    <span className="font-display text-2xl md:text-4xl font-black tabular-nums tracking-[-0.02em] text-brand-purple">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="relative w-12 h-12 md:w-16 md:h-16 overflow-hidden bg-brand-black/10 shrink-0">
                      {b.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={upgradeGooglePhotoSize(b.photo, 200) ?? b.photo}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display font-black uppercase tracking-[-0.01em] text-brand-black text-base md:text-xl leading-[1.1] [text-wrap:balance] group-hover:text-brand-purple transition-colors">
                        {b.name}
                      </span>
                      <span className="mt-1 block font-body text-xs md:text-sm text-brand-black/55">
                        {b.neighborhood} · {b.categoryName}
                      </span>
                    </span>
                    <span className="hidden md:flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${tierAccent}`}
                      />
                      <span className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-brand-black/65">
                        {tierLabel}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="font-display text-base md:text-lg text-brand-black/40 group-hover:text-brand-purple group-hover:translate-x-1 transition-all"
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Reveal>

        {/* ── GET FEATURED CTA, generic homepage variant ───────
            Sits between the Top 5 leaderboard and the Series cards
            so a Pittsburgh business owner arriving via the front door
            sees the offer without needing to click into a scorecard. */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <GetFeaturedCTA variant="compact" />
        </Reveal>

        {/* ── RELAY COLLAB GALLERY ────────────────────────────
            12 photos from real creator collabs, rotates daily. Sits
            right after the CTA so the "Get filmed" copy is
            immediately followed by visual proof of what that means
            in practice. */}
        <div className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <RelayCollabGallery />
        </div>

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
                      ? "group block h-full border border-brand-black bg-brand-black text-brand-lavender p-6 md:p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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
                    {i === 0 ? "Spring 2026 · Featured" : `${a.items.length} businesses · Spring 2026`}
                  </p>
                  <h4
                    className={
                      i === 0
                        ? "mt-3 font-display font-black uppercase tracking-[-0.015em] text-[clamp(1.25rem,2.6vw,1.75rem)] leading-[1.05] text-brand-lavender [text-wrap:balance]"
                        : "mt-3 font-display font-black uppercase tracking-[-0.015em] text-brand-black text-[clamp(1.25rem,2.6vw,1.75rem)] leading-[1.05] [text-wrap:balance]"
                    }
                  >
                    {a.title}
                  </h4>
                  <p
                    className={
                      i === 0
                        ? "mt-3 font-body text-sm text-brand-lavender/70 leading-snug"
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
              Spring 2026 deep dive
            </span>
          </div>
          <Link
            href="/business/la-gourmandine-lawrenceville"
            className="group block border border-brand-black/15 bg-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-purple)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple overflow-hidden"
          >
            {featuredPhoto && (
              <div className="relative w-full aspect-[16/7] md:aspect-[16/6] overflow-hidden bg-brand-black/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={upgradeGooglePhotoSize(featuredPhoto, 1600) ?? featuredPhoto}
                  alt="La Gourmandine, Lawrenceville exterior"
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
                />
              </div>
            )}
            <div className="p-6 md:p-8">
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
            </div>
          </Link>
        </Reveal>

        {/* ── SEARCH / BROWSE ─────────────────────────────────────
            Readers who didn't find the business they came for in the
            three lists above can search the full index by name,
            neighborhood, or category. */}
        <Reveal as="section" id="search" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20 scroll-mt-24">
          <BusinessSearch businesses={searchable} />
        </Reveal>

        {/* ── HOW WE RANK, one-line teaser linking to /about ────── */}
        <Reveal as="section" className="mx-auto max-w-7xl px-6 pb-14 md:pb-20">
          <div className="border-y-2 border-brand-black py-7 md:py-9 flex flex-wrap items-baseline justify-between gap-4">
            <p className="font-display font-black uppercase tracking-[-0.01em] text-brand-black text-[clamp(1.25rem,3vw,2rem)] leading-[1.05]">
              We don&apos;t rank{" "}
              <span className="line-through decoration-brand-purple decoration-4">
                taste
              </span>.{" "}
              We rank the{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                conversation
              </span>.
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
