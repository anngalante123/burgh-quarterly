import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { ScoreCard } from "@/components/ScoreCard";
import { UnfairAdvantage } from "@/components/UnfairAdvantage";
import { OwnerFirstVisit } from "@/components/OwnerFirstVisit";
import { PeerPulse, type PeerRow } from "@/components/insights/PeerPulse";
import { ReviewVoice } from "@/components/insights/ReviewVoice";
import { SignalOfQuarter } from "@/components/insights/SignalOfQuarter";
import { SocialState } from "@/components/insights/SocialState";
import { SocialTrend } from "@/components/insights/SocialTrend";

import {
  ClaimAffordanceUnlessClaimed,
  ClaimedHeaderBadge,
  SidebarCTAIfClaimed,
} from "./claimed-client";

import {
  listAllBusinessSlugs,
  loadAllBusinesses,
  loadBusinessBySlug,
  type BusinessArtifact,
} from "@/lib/data/load-business";

/**
 * Business page — the QUIET RECORD zone (EDITORIAL_VOICE.md § loud-quiet asymmetry).
 *
 * Voice: Wikipedia-neutral. Factual. No editorializing on the page body.
 * The loud voice lives on /issue/* editorial pages, not here.
 *
 * Data: every slug in content/businesses/*.json pre-renders via
 *   generateStaticParams(). Missing slugs 404.
 *
 * ?claimed=true handling is isolated to `claimed-client.tsx` (client
 * components) so the server component can pre-render statically. Next 16
 * marks any server page that reads searchParams as dynamic; we avoid
 * that by keeping the toggle entirely client-side.
 */

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): { slug: string }[] {
  return listAllBusinessSlugs().map((slug) => ({ slug }));
}

/* ----------------------------- category label helpers ------------------ */

function pluralizeCategoryLabel(categoryName: string): string {
  // Category label for ScoreCard, e.g. "Bakery" → "Pittsburgh Bakeries",
  // "Coffee shop" → "Pittsburgh Coffee Shops".
  const trimmed = categoryName.trim();
  if (!trimmed) return "Pittsburgh Businesses";
  // Heuristic pluralization: y→ies, s already, else +s.
  const lastWord = trimmed.split(/\s+/).pop()!;
  const rest = trimmed.slice(0, trimmed.length - lastWord.length);
  let plural: string;
  if (/s$/i.test(lastWord)) plural = lastWord;
  else if (/y$/i.test(lastWord)) plural = lastWord.replace(/y$/i, "ies");
  else plural = `${lastWord}s`;
  return `Pittsburgh ${rest}${plural}`;
}

/* ----------------------------- peer lookup ---------------------------- */

function buildPeers(
  current: BusinessArtifact,
  all: BusinessArtifact[],
): PeerRow[] {
  // Same neighborhood, ordered by rank_neighborhood ascending. Cap at 5.
  const sameHood = all.filter(
    (b) => b.business.neighborhood === current.business.neighborhood,
  );
  const sorted = sameHood
    .slice()
    .sort((a, b) => a.score.rank_neighborhood - b.score.rank_neighborhood);

  // If there are fewer than 4 in the same neighborhood, pad with same-category
  // businesses from elsewhere to give the block enough rows.
  const peers = sorted.slice(0, 5);
  if (peers.length < 4) {
    const extras = all
      .filter(
        (b) =>
          b.business.slug !== current.business.slug &&
          b.business.category === current.business.category &&
          !peers.some((p) => p.business.slug === b.business.slug),
      )
      .sort((a, b) => a.score.rank_category - b.score.rank_category)
      .slice(0, 5 - peers.length);
    peers.push(...extras);
  }

  return peers.map((b) => ({
    name: b.business.name,
    slug: b.business.slug,
    rank: b.score.rank_neighborhood,
    tier: b.score.tier,
    distinguishingSignal: b.score.unfair_advantage.label,
  }));
}

/* ----------------------------- signal of quarter ---------------------- */

function buildSignal(art: BusinessArtifact): {
  signal: string;
  evidence: string;
  direction: "up" | "flat" | "down";
} {
  const fresh = art.business.review_freshness_days;
  if (fresh !== undefined && fresh <= 14) {
    return {
      signal: "Review activity is current",
      evidence: `Most recent review landed ${
        fresh === 0 ? "today" : fresh === 1 ? "yesterday" : `${fresh} days ago`
      } — customers are still posting.`,
      direction: "up",
    };
  }
  if (fresh !== undefined && fresh <= 60) {
    return {
      signal: "Steady review cadence",
      evidence: `Most recent review landed ${fresh} days ago.`,
      direction: "flat",
    };
  }
  return {
    signal: "Review text catches up next issue",
    evidence:
      "Review-text rescrape is in flight — the full voice-miner will run before the next issue drops.",
    direction: "flat",
  };
}

/* ----------------------------- component ------------------------------ */

export default async function BusinessPage({ params }: PageProps) {
  const { slug } = await params;

  const art = loadBusinessBySlug(slug);
  if (!art) notFound();

  const { business: biz, score, meta } = art;

  // Five-star percent math for the review footer.
  const totalRev = biz.google_review_count ?? 0;
  const fiveStar = meta.reviewsDistribution?.fiveStar ?? 0;
  const pct = totalRev > 0 ? Math.round((fiveStar / totalRev) * 100) : null;

  // Photo grid.
  const heroImages = biz.photos.map((p) => p.url).slice(0, 6);
  const photoSlots = 6;

  // Reviews with text, top 3.
  const textReviews = meta.reviewTexts.slice(0, 3);

  // Insight-block data feeds.
  const all = loadAllBusinesses();
  const peers = buildPeers(art, all);
  const signal = buildSignal(art);
  const reviewPhrases = meta.keywordPhrases.slice(0, 5);

  // Social state — stubbed handle, component renders a preview badge.
  const socialHandle = biz.instagram ?? biz.slug.replace(/-/g, "");

  // Single-point history for SocialTrend (no prior issues yet).
  const history = [
    {
      quarter: "Sp26",
      reviewCount: biz.google_review_count ?? 0,
      rating: biz.google_rating ?? 0,
    },
  ];

  // Labels for the ScoreCard.
  const categoryLabel = pluralizeCategoryLabel(meta.categoryName);
  const neighborhoodLabel = biz.neighborhood;

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1 bg-brand-off-white">
        <article className="mx-auto max-w-5xl px-6 py-10 md:py-14">
          {/* Breadcrumb — geography-first */}
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
                <span className="hover:text-brand-purple">
                  {categoryLabel.replace(/^Pittsburgh\s+/, "")}
                </span>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <span>{neighborhoodLabel}</span>
              </li>
            </ol>
          </nav>

          {/* Name + locality */}
          <header className="mt-5 md:mt-7">
            <h1 className="font-display text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-black uppercase leading-[0.9] tracking-[-0.02em] text-brand-black break-words hyphens-auto">
              {biz.name}
            </h1>
            <p className="mt-4 font-body text-sm md:text-base text-brand-black/70">
              {meta.categoryName}
              {biz.neighborhood ? ` · ${biz.neighborhood}` : ""}
              {" · "}
              {biz.address}
            </p>
            <p className="mt-2 font-body text-xs text-brand-black/45">
              Updated Spring 2026
            </p>
            <Suspense fallback={null}>
              <ClaimedHeaderBadge />
            </Suspense>
          </header>

          {/* Owner first-visit block */}
          <div className="mt-8 md:mt-10">
            <OwnerFirstVisit businessName={biz.name} />
          </div>

          {/* Main two-column layout on larger screens */}
          <div className="mt-10 md:mt-12 grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-8 lg:gap-10">
            <div className="space-y-10 md:space-y-12">
              {/* ScoreCard (public view — no raw composite, ever). */}
              <ScoreCard
                tier={score.tier}
                categoryLabel={categoryLabel}
                neighborhoodLabel={neighborhoodLabel}
                rankCategory={score.rank_category}
                rankNeighborhood={score.rank_neighborhood}
                movement={score.movement.overall ?? "Debut"}
                claimed={false}
                gapToNextTier={null}
              />

              {/* Unfair advantage */}
              <UnfairAdvantage
                label={score.unfair_advantage.label}
                evidence={score.unfair_advantage.evidence}
              />

              {/* Signal of the quarter */}
              <SignalOfQuarter
                signal={signal.signal}
                evidence={signal.evidence}
                direction={signal.direction}
              />

              {/* Review voice — phrases mined from reviews */}
              {reviewPhrases.length >= 2 ? (
                <ReviewVoice phrases={reviewPhrases} />
              ) : (
                <ReviewVoice />
              )}

              {/* Peer pulse */}
              <PeerPulse
                businessSlug={biz.slug}
                neighborhood={biz.neighborhood}
                peers={peers}
              />

              {/* Social snapshot (stub — pending Instagram ingest) */}
              <SocialState handle={socialHandle} />

              {/* Social trend (single-point first-issue state) */}
              <SocialTrend history={history} />

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
                          alt={`${biz.name} — photo ${i + 1}`}
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
                {meta.imagesCount > 0 && (
                  <p className="mt-3 font-body text-xs text-brand-black/50">
                    {meta.imagesCount.toLocaleString()} photos on Google.
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
                    {textReviews.map((text, i) => (
                      <li
                        key={i}
                        className="border-l-2 border-brand-black/15 pl-4 md:pl-5"
                      >
                        <p className="font-body text-sm md:text-base text-brand-black/85 leading-relaxed">
                          {text}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {totalRev > 0 && pct !== null && (
                  <p className="mt-6 font-body text-xs text-brand-black/50">
                    {totalRev.toLocaleString()} total reviews ·{" "}
                    {pct}% five-star.
                  </p>
                )}
              </section>

              {/* Claim affordance (hides when ?claimed=true) */}
              <Suspense fallback={null}>
                <ClaimAffordanceUnlessClaimed slug={biz.slug} />
              </Suspense>
            </div>

            {/* Sidebar: Relay CTA only when claimed=true */}
            <aside className="space-y-6">
              <Suspense fallback={null}>
                <SidebarCTAIfClaimed />
              </Suspense>
            </aside>
          </div>
        </article>
      </main>

      <Colophon />
    </>
  );
}
