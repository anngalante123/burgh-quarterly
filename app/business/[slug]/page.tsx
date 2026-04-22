import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { UnfairAdvantage } from "@/components/UnfairAdvantage";
import { PeerPulse, type PeerRow } from "@/components/insights/PeerPulse";
import { ReviewVoice } from "@/components/insights/ReviewVoice";
import { SignalOfQuarter } from "@/components/insights/SignalOfQuarter";
import { SocialState } from "@/components/insights/SocialState";
import { SocialTrend } from "@/components/insights/SocialTrend";
import { PhotoHero } from "@/components/insights/PhotoHero";
import { ScoreHero } from "@/components/insights/ScoreHero";
import { BusinessTldr } from "@/components/insights/BusinessTldr";
import { RelayWhisper } from "@/components/RelayWhisper";
import { QuarterNarrative } from "@/components/insights/QuarterNarrative";
import { Playbook } from "@/components/insights/Playbook";
import { CreatorReadyAudit } from "@/components/insights/CreatorReadyAudit";
import { buildBusinessTldr } from "@/lib/editorial/business-tldr";
import { buildQuarterNarrative } from "@/lib/editorial/quarter-narrative";
import { buildPlaybook } from "@/lib/editorial/playbook";
import { buildCreatorAudit } from "@/lib/editorial/creator-audit";
import { loadReviewAnalysis } from "@/lib/data/load-review-analysis";
import { pickPullquote } from "@/lib/editorial/pick-pullquote";
import {
  SubscoreBars,
  type SubscoreKey,
} from "@/components/insights/SubscoreBars";
import { PeerDotPlot } from "@/components/insights/PeerDotPlot";
import { MomentumSparkline } from "@/components/insights/MomentumSparkline";

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
import { loadSocialBySlug } from "@/lib/data/load-social";
import { familyForCategory } from "@/lib/data/category-family";

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

/* ----------------------------- peer medians (subscores) --------------- */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function computePeerMedians(
  current: BusinessArtifact,
  all: BusinessArtifact[],
): Record<SubscoreKey, number> {
  // Use the editorial "family" (lib/data/category-family.ts) so medians are
  // computed across a meaningful peer set, not a narrow Google categoryName
  // match. Example: a Bakery is compared against all Pittsburgh Sweets
  // (Bakery + Pastry shop + Dessert shop + Ice cream shop).
  const currentFamily = familyForCategory(current.meta.categoryName).key;
  const sameFamily = all.filter(
    (b) => familyForCategory(b.meta.categoryName).key === currentFamily,
  );
  const keys: SubscoreKey[] = [
    "content_canvas",
    "community_spark",
    "conversion_path",
    "momentum",
    "collab_fit",
  ];
  const out = {} as Record<SubscoreKey, number>;
  for (const k of keys) {
    out[k] = median(sameFamily.map((b) => b.score.subscores[k]));
  }
  return out;
}

/* ----------------------------- category peer dots --------------------- */

/**
 * Build peer dots for the category dot plot. Grouped by editorial family
 * (see lib/data/category-family.ts), not Google's literal categoryName,
 * which is too narrow for most small-business categories.
 *
 * Ranks are reassigned 1..N within the family, ordered by composite score
 * descending — so the plot reads "rank within Pittsburgh Sweets" even if
 * the JSON's `rank_category` was scoped to a narrower bucket.
 */
function buildCategoryPeerDots(
  current: BusinessArtifact,
  all: BusinessArtifact[],
): {
  peers: {
    slug: string;
    name: string;
    rank: number;
    tier: "icons" | "ones_to_watch" | "neighborhood_staples";
    distinguishingSignal: string;
  }[];
  familyLabel: string;
} {
  const currentFamily = familyForCategory(current.meta.categoryName);
  const sameFamily = all.filter(
    (b) => familyForCategory(b.meta.categoryName).key === currentFamily.key,
  );
  // Rank 1..N within family by composite score desc.
  const rankedInFamily = sameFamily
    .slice()
    .sort((a, b) => b.score.composite - a.score.composite)
    .map((b, i) => ({
      slug: b.business.slug,
      name: b.business.name,
      rank: i + 1,
      tier: b.score.tier,
      distinguishingSignal: b.score.unfair_advantage.label,
    }));
  return { peers: rankedInFamily, familyLabel: currentFamily.label };
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

  // Subscore bars: peer median per subscore across same-category businesses.
  const peerMedians = computePeerMedians(art, all);

  // Peer dot plot: one dot per business in the same editorial family.
  const { peers: categoryPeerDots, familyLabel } = buildCategoryPeerDots(
    art,
    all,
  );

  // Social data — IG snapshot + Google Maps growth (Dec→Apr).
  const social = loadSocialBySlug(biz.slug);

  // Subscore expansion details — concrete data pulled from the record,
  // surfaced when a reader clicks a subscore row. No numeric scores here —
  // just the raw signals the bar is derived from.
  const lastPostAt = social.ig?.last_post_at
    ? new Date(social.ig.last_post_at)
    : null;
  const now = new Date();
  const daysSinceLastPost = lastPostAt
    ? Math.round((now.getTime() - lastPostAt.getTime()) / 86_400_000)
    : null;

  const subscoreDetails: Partial<
    Record<SubscoreKey, import("@/components/insights/SubscoreBars").SubscoreDetail>
  > = {
    content_canvas: {
      explainer:
        "A business's visible photo catalog — the raw material creators pull from when they film, post, or write about a place.",
      bullets: [
        `${meta.imagesCount.toLocaleString()} photos on Google across ${meta.imageCategories.length} categories`,
        `Hero photo indexed — ${biz.photos.length > 0 ? "available" : "pending"}`,
        meta.imageCategories.slice(0, 4).length > 0
          ? `Tagged: ${meta.imageCategories.slice(0, 4).join(", ")}`
          : "No category tags yet",
      ],
    },
    community_spark: {
      explainer:
        "The conversation around a business in reviews — how recent, how dense, and what themes recur.",
      bullets: [
        `${totalRev.toLocaleString()} total reviews`,
        pct !== null ? `${pct}% five-star` : "No review distribution yet",
        biz.review_freshness_days !== undefined
          ? `Most recent review ${biz.review_freshness_days === 0 ? "today" : biz.review_freshness_days === 1 ? "yesterday" : `${biz.review_freshness_days} days ago`}`
          : "Freshness unknown",
        reviewPhrases.length >= 2
          ? `Recurring themes: ${reviewPhrases.slice(0, 3).join(", ")}`
          : "Review-text mining queued for next issue",
      ],
      pullquote: meta.reviewTexts[0],
    },
    conversion_path: {
      explainer:
        "How easy it is for a stranger to find this business, show up, and post about it. Website, phone, hours, and claim status each count.",
      bullets: [
        meta.hasWebsite ? "Website linked on Google" : "No website on Google",
        meta.hasPhone ? "Phone number published" : "No phone number",
        meta.hasOpeningHours
          ? "Opening hours published"
          : "No opening hours on Google",
        meta.claimThisBusiness
          ? "Unclaimed on Google — owner hasn't stepped in"
          : "Claimed on Google",
      ],
    },
    momentum: {
      explainer:
        "Instagram cadence as a proxy for whether the business is an active participant in the conversation or just a static record.",
      bullets: social.ig
        ? [
            `${social.ig.posts_30d} posts in the last 30 days`,
            `${social.ig.reels_30d} reels in the last 30 days`,
            `${Math.round(social.ig.avg_engagement_rate * 1000) / 10}% average engagement rate`,
            daysSinceLastPost !== null
              ? `Last post ${daysSinceLastPost} days ago`
              : "Last post unknown",
            social.ig.followers
              ? `${social.ig.followers.toLocaleString()} followers`
              : "",
          ].filter(Boolean)
        : ["Instagram handle not yet discovered"],
    },
    collab_fit: {
      explainer:
        "How ready a business is for a creator partnership — public presence, real contact surface, and an owner who's reachable.",
      bullets: [
        meta.hasWebsite ? "Website (linkable in captions)" : "No website",
        meta.hasPhone ? "Phone line live" : "No phone",
        meta.hasOpeningHours ? "Hours published" : "No hours",
        social.ig?.is_business_account
          ? "Instagram is a business account"
          : social.ig
            ? "Instagram not configured as business account"
            : "Instagram handle pending",
        social.ig?.verified ? "Verified on Instagram" : "",
      ].filter(Boolean),
    },
  };

  // Trend history: two points (v1 + v2 Google Maps scrapes) if growth data
  // exists; otherwise single-point "tracking from today" fallback.
  //
  // Quarter labels derive from the actual scrape dates — the v1 scrape in
  // these files landed in late March 2026 (not Dec 2025), so we label by
  // month rather than hardcoding a season. "Mar 26" → "Apr 26" is less
  // misleading than "Wi25 → Sp26" for a ~25-day window.
  function labelFor(iso: string): string {
    const d = new Date(iso);
    const month = d.toLocaleString("en-US", { month: "short" });
    const yy = d.getFullYear().toString().slice(-2);
    return `${month} ${yy}`;
  }
  const history = social.growth
    ? [
        {
          quarter: labelFor(social.growth.period_start),
          reviewCount: social.growth.review_count.start,
          rating: social.growth.rating.start,
        },
        {
          quarter: labelFor(social.growth.period_end),
          reviewCount: social.growth.review_count.end,
          rating: social.growth.rating.end,
        },
      ]
    : [
        {
          quarter: "Sp26",
          reviewCount: biz.google_review_count ?? 0,
          rating: biz.google_rating ?? 0,
        },
      ];

  // Labels for the ScoreCard.
  const categoryLabel = pluralizeCategoryLabel(meta.categoryName);
  const neighborhoodLabel = biz.neighborhood;

  // TL;DR — executive preview at the top of the page (the read + what it means).
  const tldr = buildBusinessTldr(art, social, categoryLabel);

  // Narrative paragraph — the story of this quarter for this business.
  const narrative = buildQuarterNarrative(art, social, all, "Spring 2026");

  // Playbook — 3 data-derived recommendations sorted by leverage.
  const playbook = buildPlaybook(art, social);

  // Creator-ready audit — 10 boolean checks with one-line fixes.
  const creatorAudit = buildCreatorAudit(art, social);

  // Optional Claude-mined review analysis (cached at content/review-analysis/).
  const reviewAnalysis = loadReviewAnalysis(biz.slug);

  // Fallback pullquote — picked from actual review texts on file.
  // Used by the non-AI Review Voice display.
  const reviewPullquote = pickPullquote(meta.reviewTexts);

  // Whisper variant near Momentum: editorial when IG is dormant, whisper otherwise.
  const momentumIsDormant = !!social.ig && social.ig.posts_30d === 0;

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1">
        <article className="mx-auto max-w-7xl px-6 py-10 md:py-14">
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
            <h1 className="font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] [word-break:break-word] text-[clamp(1.5rem,6.5vw,4.5rem)] leading-[0.95] sm:leading-[0.9]">
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

          {/* Quarter narrative — auto-generated editorial paragraph. */}
          <div className="mt-8 md:mt-10">
            <QuarterNarrative body={narrative.body} issue={narrative.issue} />
          </div>

          {/* TL;DR — executive preview. Sits above ScoreHero so the reader
              gets the diagnosis + so-what in 2 lines before the full page. */}
          <div className="mt-6 md:mt-8">
            <BusinessTldr read={tldr.read} meaning={tldr.meaning} />
          </div>

          {/* Main two-column layout on larger screens */}
          <div className="mt-10 md:mt-12 grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-8 lg:gap-10">
            <div className="space-y-8 md:space-y-10">
              {/* ScoreHero — the big visual anchor (no raw composite, ever). */}
              <ScoreHero
                tier={score.tier}
                categoryLabel={categoryLabel}
                neighborhoodLabel={neighborhoodLabel}
                rankCategory={score.rank_category}
                rankNeighborhood={score.rank_neighborhood}
                movement={score.movement.overall ?? "Debut"}
                claimed={false}
                gapToNextTier={null}
              />

              {/* Subscore bars — click a row to expand marginalia. */}
              <SubscoreBars
                subscores={score.subscores}
                peerMedians={peerMedians}
                peerFamilyLabel={familyLabel}
                details={subscoreDetails}
              />

              {/* Peer dot plot — this business vs editorial-family peers. */}
              <PeerDotPlot
                currentSlug={biz.slug}
                category={familyLabel}
                peers={categoryPeerDots}
              />

              {/* Momentum sparkline — 30-day IG cadence. */}
              <div>
                <MomentumSparkline
                  posts30d={social.ig?.posts_30d ?? 0}
                  reels30d={social.ig?.reels_30d ?? 0}
                  handle={social.ig?.handle ?? null}
                  hasRealData={!!social.ig}
                  seed={biz.slug}
                />
                {/* Relay whisper — editorial callout when IG is dormant,
                    whisper chip otherwise. Earned-in-context. */}
                {momentumIsDormant ? (
                  <RelayWhisper variant="editorial" />
                ) : (
                  <RelayWhisper variant="whisper" />
                )}
              </div>

              {/* The Playbook — 3 data-derived recommendations */}
              <Playbook playbook={playbook} />

              {/* Creator-ready audit — pass/fail checklist */}
              <CreatorReadyAudit audit={creatorAudit} />

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

              {/* Review voice — prefers Claude analysis when cached, falls
                  back to regex phrases + a data-picked pullquote otherwise. */}
              <ReviewVoice
                analysis={reviewAnalysis}
                phrases={reviewPhrases.length >= 2 ? reviewPhrases : undefined}
                pullquote={reviewPullquote}
                totalReviews={totalRev}
              />

              {/* Peer pulse */}
              <PeerPulse
                businessSlug={biz.slug}
                neighborhood={biz.neighborhood}
                peers={peers}
              />

              {/* Social snapshot — real IG data when present, empty state otherwise. */}
              <SocialState
                handle={social.ig ? social.ig.handle : null}
                posts30d={social.ig?.posts_30d ?? 0}
                reels30d={social.ig?.reels_30d ?? 0}
                engagementRate={social.ig?.avg_engagement_rate ?? 0}
                verified={social.ig?.verified ?? false}
                private={social.ig?.private ?? false}
                hasRealData={!!social.ig}
              />

              {/* Social trend — 2-point Dec→Apr line if growth data exists. */}
              <SocialTrend history={history} hasRealData={!!social.growth} />

              {/* Photo hero — single big image + click-to-enlarge lightbox */}
              <PhotoHero
                photos={heroImages}
                googleImagesCount={meta.imagesCount}
                businessName={biz.name}
              />

              {/* Reviewers say */}
              <section aria-label="Reviewers say">
                <div className="border-b border-brand-black/15 pb-3 mb-5 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand-black">
                    Reviewers say
                  </h2>
                  {totalRev > 0 && (
                    <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                      {textReviews.length} of{" "}
                      {totalRev.toLocaleString()} reviews
                    </span>
                  )}
                </div>
                {textReviews.length === 0 ? (
                  <p className="font-body text-sm text-brand-black/70">
                    Review text not yet indexed for this business.
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    {textReviews.map((text, i) => (
                      <li
                        key={i}
                        className="group relative border border-brand-black/15 bg-white/60 p-4 md:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-black hover:shadow-[3px_3px_0_0_var(--color-brand-lime)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      >
                        <span
                          aria-hidden="true"
                          className="absolute -top-2 left-4 bg-brand-newsprint px-1.5 font-display text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-brand-purple"
                        >
                          ★★★★★
                        </span>
                        <p className="font-body text-sm md:text-base text-brand-black/85 leading-relaxed">
                          &ldquo;{text}&rdquo;
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {totalRev > 0 && pct !== null && (
                  <p className="mt-5 font-body text-xs text-brand-black/55">
                    {totalRev.toLocaleString()} total reviews ·{" "}
                    <span className="text-brand-black/80 font-medium">
                      {pct}% five-star
                    </span>
                    . Review text rescrape in flight for next issue.
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
