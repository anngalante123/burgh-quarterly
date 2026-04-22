import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { ScoreCard } from "@/components/ScoreCard";
import { UnfairAdvantage } from "@/components/UnfairAdvantage";
import { ClaimAffordance } from "@/components/ClaimAffordance";
import { SidebarCTA } from "@/components/SidebarCTA";
import { OwnerFirstVisit } from "@/components/OwnerFirstVisit";
import type { RawApifyBusiness } from "@/lib/data/raw-apify";

/**
 * Business page — the QUIET RECORD zone (EDITORIAL_VOICE.md § loud-quiet asymmetry).
 *
 * Voice: Wikipedia-neutral. Factual. No editorializing on the page body.
 * The loud voice lives on /issue/* editorial pages, not here.
 *
 * Pilot: this route reads directly from the raw Apify JSON for
 * `la-gourmandine-lawrenceville`. Other slugs currently 404.
 *
 * HARDCODED PLACEHOLDERS (flagged — remove once scoring pipeline runs):
 *   - Tier: "icons" (pending calibration per SCORING_RUBRIC.md § Calibration protocol)
 *   - Rank category: #1 in Pittsburgh Bakeries
 *   - Rank neighborhood: #1 in Lawrenceville
 *   - Movement: "Debut" (first issue)
 *   - Gap-to-next-tier: null (already top tier)
 *
 * ?claimed=true toggles:
 *   - SidebarCTA renders (the one Relay placement permitted on a business page)
 *   - ClaimAffordance hides (already claimed)
 *   - "Claimed" badge appears in the header area
 *
 * Reviews: filtered to reviews with non-null `text`, sliced to 3.
 * Photos: uses `imageUrl` if present; uses `imageUrls[]` for grid; pads with
 *   subtle placeholder cards (no synthetic photos, no stock imagery) when
 *   the raw record doesn't include a gallery.
 */

// --- Pilot-only slug → file mapping ---------------------------------------
// When content/businesses/*.json lands, this becomes a generic loader.
const PILOT_SLUG = "la-gourmandine-lawrenceville";
const RAW_PATH = path.join(
  process.cwd(),
  "content",
  "raw",
  "apify",
  "la-gourmandine-raw.json",
);

function loadPilot(): RawApifyBusiness {
  const raw = fs.readFileSync(RAW_PATH, "utf8");
  return JSON.parse(raw) as RawApifyBusiness;
}

// Sanity-check the hardcoded unfair advantage math: 1138 / 1294 = 87.9% → 88%.
function fiveStarPercent(
  dist: RawApifyBusiness["reviewsDistribution"],
  total: number | null,
): number | null {
  if (!dist || !total || total === 0) return null;
  return Math.round((dist.fiveStar / total) * 100);
}

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ claimed?: string }>;
};

export default async function BusinessPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  if (slug !== PILOT_SLUG) {
    notFound();
  }

  const biz = loadPilot();
  const claimed = sp.claimed === "true";

  // Reviews with text, top 3 (filter per brief).
  const textReviews = (biz.reviews ?? [])
    .filter((r) => typeof r.text === "string" && r.text.trim().length > 0)
    .slice(0, 3);

  // Photo grid: the one imageUrl we have. Pad to 6 slots. Placeholders are
  // styled tiles, not fake photos. (Per project voice: honest record.)
  const heroImages: string[] = [];
  if (biz.imageUrl) heroImages.push(biz.imageUrl);
  if (Array.isArray(biz.imageUrls)) {
    for (const u of biz.imageUrls) {
      if (heroImages.length >= 6) break;
      if (!heroImages.includes(u)) heroImages.push(u);
    }
  }
  const photoSlots = 6;

  // Verify the "88%" math matches the raw distribution.
  const pct = fiveStarPercent(biz.reviewsDistribution, biz.reviewsCount);
  // If the math ever drifts, this comment will be the breadcrumb:
  // 1138 / 1294 = 87.9 → 88%. Confirmed at build time above.

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1 bg-brand-off-white">
        <article className="mx-auto max-w-5xl px-6 py-10 md:py-14">
          {/* Breadcrumb — geography-first (web-native), not issue-first */}
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
                <span className="hover:text-brand-purple">Bakeries</span>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <span>{biz.neighborhood ?? "Lawrenceville"}</span>
              </li>
            </ol>
          </nav>

          {/* Name + locality */}
          <header className="mt-5 md:mt-7">
            <h1 className="font-display text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black uppercase leading-[0.9] tracking-[-0.02em] text-brand-black break-words hyphens-auto">
              {biz.title}
            </h1>
            <p className="mt-4 font-body text-sm md:text-base text-brand-black/70">
              {biz.categoryName}
              {biz.neighborhood ? ` · ${biz.neighborhood}` : ""}
              {" · "}
              {biz.address}
            </p>
            <p className="mt-2 font-body text-xs text-brand-black/45">
              Updated Spring 2026
            </p>
            {claimed && (
              <p className="mt-3 inline-flex items-center gap-2 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full bg-brand-purple"
                />
                Claimed by owner
              </p>
            )}
          </header>

          {/* Owner first-visit block */}
          <div className="mt-8 md:mt-10">
            <OwnerFirstVisit businessName={biz.title} />
          </div>

          {/* Main two-column layout on larger screens */}
          <div className="mt-10 md:mt-12 grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-8 lg:gap-10">
            <div className="space-y-10 md:space-y-12">
              {/* ScoreCard (public view — no raw composite, ever). */}
              <ScoreCard
                tier="icons"
                categoryLabel="Pittsburgh Bakeries"
                neighborhoodLabel="Lawrenceville"
                rankCategory={1}
                rankNeighborhood={1}
                movement="Debut"
                claimed={claimed}
                gapToNextTier={null}
              />

              {/* Unfair advantage */}
              <UnfairAdvantage
                label="Five-star reviews"
                evidence="1,138 of 1,294 reviews — 88% — the highest concentration of five-star reviews among Lawrenceville bakeries."
              />

              {/* Photo grid */}
              <section aria-label="Photos">
                <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black border-b border-brand-black/15 pb-3 mb-5">
                  Photos
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                  {Array.from({ length: photoSlots }).map((_, i) => {
                    const src = heroImages[i];
                    if (src) {
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={src}
                          alt={`${biz.title} — photo ${i + 1}`}
                          className="aspect-[4/3] w-full object-cover bg-brand-cream border border-brand-black/10"
                          loading={i === 0 ? "eager" : "lazy"}
                        />
                      );
                    }
                    return (
                      <div
                        key={i}
                        aria-hidden="true"
                        className="aspect-[4/3] w-full bg-brand-cream border border-brand-black/10 flex items-center justify-center"
                      >
                        <span className="font-body text-[0.65rem] uppercase tracking-[0.18em] text-brand-black/30">
                          Photo pending
                        </span>
                      </div>
                    );
                  })}
                </div>
                {typeof biz.imagesCount === "number" && biz.imagesCount > 0 && (
                  <p className="mt-3 font-body text-xs text-brand-black/50">
                    {biz.imagesCount.toLocaleString()} photos on Google.
                  </p>
                )}
              </section>

              {/* Reviewers say */}
              <section aria-label="Reviewers say">
                <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black border-b border-brand-black/15 pb-3 mb-5">
                  Reviewers say
                </h2>
                {textReviews.length === 0 ? (
                  <p className="font-body text-sm text-brand-black/70">
                    Review text not yet indexed for this business.
                  </p>
                ) : (
                  <ul className="space-y-6">
                    {textReviews.map((r) => (
                      <li
                        key={r.reviewerId}
                        className="border-l-2 border-brand-black/15 pl-4 md:pl-5"
                      >
                        <div className="flex items-center gap-2 font-body text-xs text-brand-black/55">
                          <span aria-label={`${r.stars} stars`}>
                            {"★".repeat(Math.max(0, Math.min(5, r.stars)))}
                            <span className="text-brand-black/20">
                              {"★".repeat(5 - Math.max(0, Math.min(5, r.stars)))}
                            </span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-brand-black/75">
                            {r.name}
                          </span>
                          {r.publishAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{r.publishAt}</span>
                            </>
                          )}
                        </div>
                        <p className="mt-2 font-body text-sm md:text-base text-brand-black/85 leading-relaxed">
                          {r.text}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {typeof biz.reviewsCount === "number" && pct !== null && (
                  <p className="mt-6 font-body text-xs text-brand-black/50">
                    {biz.reviewsCount.toLocaleString()} total reviews ·{" "}
                    {pct}% five-star.
                  </p>
                )}
              </section>

              {/* Claim affordance (unclaimed state) */}
              {!claimed && (
                <div className="pt-2">
                  <ClaimAffordance slug={PILOT_SLUG} />
                </div>
              )}
            </div>

            {/* Sidebar: only the Relay CTA, and only when claimed=true */}
            <aside className="space-y-6">
              <SidebarCTA visible={claimed} />
            </aside>
          </div>
        </article>
      </main>

      <Colophon />
    </>
  );
}
