import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { ReviewVoice } from "@/components/insights/ReviewVoice";
import { PhotoHero } from "@/components/insights/PhotoHero";
import { RelayWhisper } from "@/components/RelayWhisper";
import { Playbook } from "@/components/insights/Playbook";
import { CreatorReadyAudit } from "@/components/insights/CreatorReadyAudit";
import { DiagnosisPullquote } from "@/components/insights/DiagnosisPullquote";
import { AtAGlance, type GlanceRow } from "@/components/insights/AtAGlance";
import { YourClimb, type ClimbStat } from "@/components/insights/YourClimb";
import { BusinessPageTabs } from "@/components/insights/BusinessPageTabs";
import { buildBusinessTldr } from "@/lib/editorial/business-tldr";
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
import { TikTokMentions } from "@/components/insights/TikTokMentions";

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
 * Business page, the QUIET RECORD zone (EDITORIAL_VOICE.md § loud-quiet asymmetry).
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

// PeerPulse (neighborhood) was removed in the 2026-04-25 restructure;
// peer comparison now lives in the "How you compare" tab via SubscoreBars
// + PeerDotPlot scoped to the editorial family. Killing buildPeers
// removed the last consumer of PeerRow.
//
// (function deliberately left as a marker; if a future feature wants
// neighborhood-scoped peers again, this is where to rebuild it.)
function _unused_buildPeers(
  current: BusinessArtifact,
  all: BusinessArtifact[],
): unknown[] {
  // Same neighborhood, ordered by rank_neighborhood ascending. Cap at 5.
  const sameHood = all.filter(
    (b) => b.business.neighborhood === current.business.neighborhood,
  );
  const sorted = sameHood
    .slice()
    .sort((a, b) => a.score.rank_neighborhood - b.score.rank_neighborhood);

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
 * descending, so the plot reads "rank within Pittsburgh Sweets" even if
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
      }, customers are still posting.`,
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
      "Review-text rescrape is in flight, the full voice-miner will run before the next issue drops.",
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
  const reviewPhrases = meta.keywordPhrases.slice(0, 5);

  // Subscore bars: peer median per subscore across same-category businesses.
  const peerMedians = computePeerMedians(art, all);

  // Peer dot plot: one dot per business in the same editorial family.
  const { peers: categoryPeerDots, familyLabel } = buildCategoryPeerDots(
    art,
    all,
  );

  // Social data, IG snapshot + Google Maps growth (Dec→Apr).
  const social = loadSocialBySlug(biz.slug);

  // Subscore expansion details, concrete data pulled from the record,
  // surfaced when a reader clicks a subscore row. No numeric scores here ,
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
        "A business's visible photo catalog, the raw material creators pull from when they film, post, or write about a place.",
      bullets: [
        `${meta.imagesCount.toLocaleString()} photos on Google across ${meta.imageCategories.length} categories`,
        `Hero photo indexed, ${biz.photos.length > 0 ? "available" : "pending"}`,
        meta.imageCategories.slice(0, 4).length > 0
          ? `Tagged: ${meta.imageCategories.slice(0, 4).join(", ")}`
          : "No category tags yet",
      ],
    },
    community_spark: {
      explainer:
        "The conversation around a business in reviews, how recent, how dense, and what themes recur.",
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
          ? "Unclaimed on Google, owner hasn't stepped in"
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
        "How ready a business is for a creator partnership, public presence, real contact surface, and an owner who's reachable.",
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
  // Quarter labels derive from the actual scrape dates, the v1 scrape in
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

  // Optional Claude-mined business analysis (cached at content/review-analysis/).
  const reviewAnalysis = loadReviewAnalysis(biz.slug);

  // Diagnosis pull-quote for the new hero zone. Falls back to the old
  // tldr_read sentence if a pre-restructure analysis hasn't been
  // regenerated yet.
  const diagnosis = reviewAnalysis?.diagnosis_pullquote ?? {
    line: reviewAnalysis?.tldr_read ??
      buildBusinessTldr(art, social, categoryLabel).read,
    highlight: "",
  };

  // Playbook, 3 data-derived recommendations sorted by leverage.
  const playbook = reviewAnalysis?.playbook?.length
    ? { items: reviewAnalysis.playbook }
    : buildPlaybook(art, social);

  // Creator-ready audit, 10 boolean checks with one-line fixes.
  const creatorAudit = buildCreatorAudit(art, social);

  // Fallback pullquote for Review Voice when no AI analysis exists.
  const reviewPullquote = pickPullquote(meta.reviewTexts);

  // Whisper variant near Momentum: editorial when IG is dormant.
  const momentumIsDormant = !!social.ig && social.ig.posts_30d === 0;

  // === At-a-glance rows ================================================
  // 5 rows: rating, reviews, TikTok creators, IG cadence, family rank.
  // Mark the row that maps to the weakest subscore as the FOCUS row so
  // the reader's eye lands on the leverage point.
  const subs = score.subscores;
  const weakestKey = (Object.entries(subs) as Array<[SubscoreKey, number]>)
    .reduce((a, b) => (a[1] <= b[1] ? a : b))[0];

  const familyShort = familyLabel.replace(/^Pittsburgh\s+/, "");
  const rankFamilyPos =
    categoryPeerDots.find((p) => p.slug === biz.slug)?.rank ?? null;

  const tt = social.tiktok_mentions;
  const ttPlaysFmt = tt
    ? tt.total_plays >= 1_000_000
      ? `${(tt.total_plays / 1_000_000).toFixed(1)}M plays`
      : tt.total_plays >= 1_000
        ? `${Math.round(tt.total_plays / 1_000)}K plays`
        : `${tt.total_plays.toLocaleString()} plays`
    : null;

  const glanceRows: GlanceRow[] = [];
  if (biz.google_rating !== undefined) {
    const ratingDelta = social.growth?.rating?.delta;
    glanceRows.push({
      label: "Google rating",
      value: `${biz.google_rating}★`,
      delta:
        ratingDelta !== undefined && ratingDelta !== null
          ? `${ratingDelta >= 0 ? "+" : ""}${ratingDelta.toFixed(1)} since Dec`
          : undefined,
      focus: weakestKey === "community_spark",
    });
  }
  if (biz.google_review_count !== undefined) {
    const reviewDelta = social.growth?.review_count?.delta;
    glanceRows.push({
      label: "Review volume",
      value: biz.google_review_count.toLocaleString(),
      delta:
        reviewDelta !== undefined && reviewDelta !== null
          ? `+${reviewDelta} in 90d`
          : undefined,
      focus: false,
    });
  }
  if (tt && tt.video_count > 0) {
    glanceRows.push({
      label: "TikTok creators filming",
      value: tt.unique_creators.toString(),
      delta: ttPlaysFmt ?? undefined,
      focus: false,
    });
  }
  if (social.ig) {
    glanceRows.push({
      label: "Instagram cadence",
      value: `${social.ig.posts_30d} / 30d`,
      delta: social.ig.posts_30d === 0 ? "Dormant" : "Active",
      focus: weakestKey === "momentum",
    });
  }
  if (rankFamilyPos !== null) {
    glanceRows.push({
      label: `Rank in ${familyShort}`,
      value: `#${rankFamilyPos}`,
      delta: `of ${categoryPeerDots.length}`,
      focus: false,
    });
  }
  // Failsafe: ensure exactly one row is focused.
  if (!glanceRows.some((r) => r.focus) && glanceRows.length > 0) {
    glanceRows[0].focus = true;
  }

  // === Your Climb stats ================================================
  // For Issue 01 we don't have rank trajectory yet. Use what we have:
  // family rank ("Debut"), review delta (from growth), TikTok reach.
  const climbStats: ClimbStat[] = [
    {
      label: "Rank",
      value: rankFamilyPos !== null ? `#${rankFamilyPos}` : "—",
      sub: `In ${familyShort} · Issue 01 debut`,
      direction: "debut",
    },
    {
      label: "Reviews",
      value: (biz.google_review_count ?? 0).toLocaleString(),
      sub: social.growth?.review_count?.delta
        ? `+${social.growth.review_count.delta} since Dec`
        : "First issue tracked",
      direction: social.growth?.review_count?.delta ? "up" : "debut",
    },
    {
      label: "Creator reach",
      value: tt && tt.total_plays > 0
        ? ttPlaysFmt ?? "—"
        : social.ig
          ? `${social.ig.posts_30d}/30d`
          : "—",
      sub: tt && tt.unique_creators > 0
        ? `${tt.unique_creators} creators on TikTok`
        : "Tracked from this issue",
      direction: tt && tt.unique_creators > 5 ? "up" : "debut",
    },
  ];

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1">
        <article className="mx-auto max-w-7xl px-6 py-10 md:py-14">
          {/* Breadcrumb, geography-first */}
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

          {/* ── HERO ZONE ────────────────────────────────────────────
              Restructured 2026-04-25 per Anna's feedback: page was too
              dense. Replaced {QuarterNarrative + BusinessTldr + ScoreHero}
              stack with a single DiagnosisPullquote, plus a YourClimb
              strip and an AtAGlance card. Below this hero, three tabs
              (Playbook · Compare · Voice) carry the depth. */}
          <div className="mt-8 md:mt-10">
            <DiagnosisPullquote
              line={diagnosis.line}
              highlight={diagnosis.highlight}
            />
          </div>

          <div className="mt-6 md:mt-8">
            <YourClimb framing="Issue 01 · Spring 2026" stats={climbStats} />
          </div>

          <div className="mt-6 md:mt-8">
            <AtAGlance rows={glanceRows} />
          </div>

          {/* ── TABS ─────────────────────────────────────────────────
              Three tabs collapse the prior 16-block stack into focused
              panels. Each panel is rendered server-side and passed in as
              children to the client tab shell. */}
          <div className="mt-10 md:mt-14 grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-8 lg:gap-10">
            <div>
              <BusinessPageTabs
                playbook={
                  <div className="space-y-8 md:space-y-10">
                    <Playbook playbook={playbook} />
                    <CreatorReadyAudit audit={creatorAudit} />
                  </div>
                }
                compare={
                  <div className="space-y-8 md:space-y-10">
                    <SubscoreBars
                      subscores={score.subscores}
                      peerMedians={peerMedians}
                      peerFamilyLabel={familyLabel}
                      details={subscoreDetails}
                    />
                    <PeerDotPlot
                      currentSlug={biz.slug}
                      category={familyLabel}
                      peers={categoryPeerDots}
                    />
                  </div>
                }
                voice={
                  <ReviewVoice
                    analysis={reviewAnalysis}
                    phrases={
                      reviewPhrases.length >= 2 ? reviewPhrases : undefined
                    }
                    pullquote={reviewPullquote}
                    totalReviews={totalRev}
                  />
                }
              />

              {/* ── BELOW TABS (secondary detail) ──────────────────── */}
              <div className="mt-12 md:mt-16 space-y-10 md:space-y-12">
                {/* TikTok creator coverage stays prominent: it's the
                    most distinct signal we surface. */}
                <TikTokMentions
                  data={social.tiktok_mentions}
                  businessName={biz.name}
                />

                {/* IG 30-day cadence + Relay whisper. */}
                <div>
                  <MomentumSparkline
                    posts30d={social.ig?.posts_30d ?? 0}
                    reels30d={social.ig?.reels_30d ?? 0}
                    handle={social.ig?.handle ?? null}
                    hasRealData={!!social.ig}
                    seed={biz.slug}
                  />
                  {momentumIsDormant ? (
                    <RelayWhisper variant="editorial" />
                  ) : (
                    <RelayWhisper variant="whisper" />
                  )}
                </div>

                {/* Photos */}
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
