import { notFound } from "next/navigation";
import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { ReviewVoice } from "@/components/insights/ReviewVoice";
import { Playbook } from "@/components/insights/Playbook";
import { DiagnosisPullquote } from "@/components/insights/DiagnosisPullquote";
import {
  BusinessAtAGlance,
  type AtAGlanceRow,
} from "@/components/insights/BusinessAtAGlance";
import { SubscribeFooter } from "@/components/SubscribeFooter";
import { GetFeaturedCTA } from "@/components/GetFeaturedCTA";
import { buildBusinessTldr } from "@/lib/editorial/business-tldr";
import { buildPlaybook } from "@/lib/editorial/playbook";
import { computeSocialTrend } from "@/lib/editorial/compute-trend";
import {
  computeFamilyMetricStats,
  pickStrengthsAndGaps,
} from "@/lib/editorial/family-stats";
import { StrengthsAndGaps } from "@/components/insights/StrengthsAndGaps";
import {
  RowPeerStat,
  fmtStatValue,
} from "@/components/insights/RowPeerStat";
import { upgradeGooglePhotoSize } from "@/lib/scrape/google-photo-url";
import { labelForCategory } from "@/lib/data/stats";
import { loadReviewAnalysis } from "@/lib/data/load-review-analysis";
import { pickPullquote } from "@/lib/editorial/pick-pullquote";
import {
  SubscoreBars,
  type SubscoreKey,
} from "@/components/insights/SubscoreBars";
import { PeerDotPlot } from "@/components/insights/PeerDotPlot";
import { MomentumSparkline } from "@/components/insights/MomentumSparkline";
import { TikTokMentions } from "@/components/insights/TikTokMentions";
import { Gated } from "@/components/gating/Gated";

import {
  listAllBusinessSlugs,
  loadAllBusinesses,
  loadBusinessBySlug,
  type BusinessArtifact,
} from "@/lib/data/load-business";
import { loadSocialBySlug } from "@/lib/data/load-social";
import { familyForBusinessCategory } from "@/lib/data/category-family";

/**
 * Business page, restructured 2026-04-25 (pass 2). Anna's feedback:
 * the tabbed version still felt too big and disconnected. New shape:
 *
 *   1. Diagnosis pull-quote   ← editorial headline
 *   2. {Business} At A Glance ← interactive accordion, 4-5 rows
 *      Each row collapses to label + value; click to expand for the
 *      detail (peer plot, review voice, TikTok creators, IG sparkline).
 *   3. The Playbook            ← 3 prescriptive moves, always visible
 *   4. Subscribe footer        ← single CTA, "see if X climbs in Issue 02"
 *
 * Removed entirely: tabs, YourClimb, old AtAGlance, PhotoHero, Reviewer
 * cards, ClaimAffordance, RelayWhisper, sidebar. The accordion absorbs
 * what was previously below-tabs content (TikTok block, IG sparkline,
 * peer plot, review voice).
 */

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await listAllBusinessSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Daily ISR: pre-render every known slug at build time, revalidate on
// the next request after 24h. New slugs added to the DB after build will
// render on demand (dynamicParams defaults to true).
export const revalidate = 86400;

function pluralizeCategoryLabel(categoryName: string): string {
  const trimmed = categoryName.trim();
  if (!trimmed) return "Pittsburgh Businesses";
  const lastWord = trimmed.split(/\s+/).pop()!;
  const rest = trimmed.slice(0, trimmed.length - lastWord.length);
  let plural: string;
  if (/s$/i.test(lastWord)) plural = lastWord;
  else if (/y$/i.test(lastWord)) plural = lastWord.replace(/y$/i, "ies");
  else plural = `${lastWord}s`;
  return `Pittsburgh ${rest}${plural}`;
}

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
  const currentFamily = familyForBusinessCategory(current.business.category).key;
  const sameFamily = all.filter(
    (b) => familyForBusinessCategory(b.business.category).key === currentFamily,
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
  const currentFamily = familyForBusinessCategory(current.business.category);
  const sameFamily = all.filter(
    (b) =>
      familyForBusinessCategory(b.business.category).key === currentFamily.key,
  );
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

export default async function BusinessPage({ params }: PageProps) {
  const { slug } = await params;

  const art = await loadBusinessBySlug(slug);
  if (!art) notFound();

  const { business: biz, score, meta } = art;

  const totalRev = biz.google_review_count ?? 0;
  const fiveStar = meta.reviewsDistribution?.fiveStar ?? 0;
  const pct = totalRev > 0 ? Math.round((fiveStar / totalRev) * 100) : null;

  const all = await loadAllBusinesses();
  const reviewPhrases = meta.keywordPhrases.slice(0, 5);

  const peerMedians = computePeerMedians(art, all);
  const { peers: categoryPeerDots, familyLabel } = buildCategoryPeerDots(
    art,
    all,
  );

  const social = loadSocialBySlug(biz.slug);

  const lastPostAt = social.ig?.last_post_at
    ? new Date(social.ig.last_post_at)
    : null;
  const now = new Date();
  const daysSinceLastPost = lastPostAt
    ? Math.round((now.getTime() - lastPostAt.getTime()) / 86_400_000)
    : null;

  // Subscore detail bullets, surfaced inside the SubscoreBars component
  // when a reader clicks a row.
  const subscoreDetails: Partial<
    Record<
      SubscoreKey,
      import("@/components/insights/SubscoreBars").SubscoreDetail
    >
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

  const categoryLabel = pluralizeCategoryLabel(meta.categoryName);
  const neighborhoodLabel = biz.neighborhood;

  const reviewAnalysis = await loadReviewAnalysis(biz.slug);

  const diagnosis = reviewAnalysis?.diagnosis_pullquote ?? {
    line:
      reviewAnalysis?.tldr_read ??
      buildBusinessTldr(art, social, categoryLabel).read,
    highlight: "",
  };

  const playbook = reviewAnalysis?.playbook?.length
    ? { items: reviewAnalysis.playbook }
    : buildPlaybook(art, social);

  const reviewPullquote = pickPullquote(meta.reviewTexts);

  // Determine the weakest subscore so we can default-open the matching
  // accordion row (the leverage point).
  const weakestKey = (
    Object.entries(score.subscores) as Array<[SubscoreKey, number]>
  ).reduce((a, b) => (a[1] <= b[1] ? a : b))[0];

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

  // Family stats: peer medians for every raw metric (review count,
  // ratings, IG cadence, followers, engagement, TikTok creators, plays).
  // Powers the per-row peer comparison strings AND the Strengths-and-Gaps
  // summary card above AtAGlance. Computed before the row builders so
  // each row's expanded content can pull peer-comparison stats.
  const richBusinesses = all.map((artifact) => ({
    artifact,
    social: loadSocialBySlug(artifact.business.slug),
  }));
  const currentRich = {
    artifact: art,
    social,
  };
  const familyStats = computeFamilyMetricStats(currentRich, richBusinesses);
  const { strengths, gaps } = pickStrengthsAndGaps(familyStats);

  // === At-a-glance accordion rows ======================================
  // Order: Rank → Reviews → Creator reach → Instagram cadence. Each row
  // expands into its full editorial detail. Default-open the row that
  // maps to the weakest subscore (the leverage point).
  const glanceRows: AtAGlanceRow[] = [];

  if (rankFamilyPos !== null) {
    // Build "how to climb" copy: which peers are above, and what specific
    // move (from the Playbook) would close the gap.
    const peersAbove = categoryPeerDots
      .filter((p) => p.rank < rankFamilyPos)
      .slice(-2); // Last 2 ranked above (closest competitors)
    const peersBelow = categoryPeerDots
      .filter((p) => p.rank > rankFamilyPos)
      .slice(0, 2); // First 2 ranked below
    const topPlaybookMove = playbook.items[0];

    glanceRows.push({
      key: "rank",
      label: `Rank in ${familyShort}`,
      value: `#${rankFamilyPos}`,
      delta: `of ${categoryPeerDots.length} · ${score.tier === "icons" ? "Icons" : score.tier === "ones_to_watch" ? "Ones to Watch" : "Neighborhood Staples"}`,
      focus: false,
      expanded: (
        <Gated label="rank" businessName={biz.name} source={`rank:${biz.slug}`}>
        <div className="space-y-8">
          <RowPeerStat
            label="Composite rank"
            thisValue={`#${rankFamilyPos} of ${categoryPeerDots.length}`}
            familyMedian={`#${Math.ceil(categoryPeerDots.length / 2)}`}
            rankLabel={
              rankFamilyPos === 1
                ? `Top of ${familyStats.familyShort}`
                : rankFamilyPos === categoryPeerDots.length
                  ? `Bottom of ${familyStats.familyShort}`
                  : `#${rankFamilyPos} of ${categoryPeerDots.length} in ${familyStats.familyShort}`
            }
            familyShort={familyStats.familyShort}
          />
          <PeerDotPlot
            currentSlug={biz.slug}
            category={familyLabel}
            peers={categoryPeerDots}
          />

          {/* How to climb, prescriptive cross-reference to the Playbook */}
          {(peersAbove.length > 0 || peersBelow.length > 0) && (
            <div className="border border-brand-black/15 bg-white/60 p-5 md:p-6">
              <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-brand-purple mb-3">
                How {biz.name.split(",")[0]} climbs
              </p>
              {peersAbove.length > 0 && (
                <p className="font-body text-sm md:text-base text-brand-black/85 leading-relaxed mb-2">
                  <span className="font-semibold">Above:</span>{" "}
                  {peersAbove
                    .map((p) => `#${p.rank} ${p.name} (${p.distinguishingSignal})`)
                    .join(", ")}
                  .
                </p>
              )}
              {topPlaybookMove && (
                <p className="font-body text-sm md:text-base text-brand-black/85 leading-relaxed mb-2">
                  <span className="font-semibold">The move:</span>{" "}
                  {topPlaybookMove.headline}. {topPlaybookMove.action}
                </p>
              )}
              {peersBelow.length > 0 && (
                <p className="font-body text-xs text-brand-black/55 leading-relaxed mt-3">
                  Holding off:{" "}
                  {peersBelow.map((p) => `#${p.rank} ${p.name}`).join(", ")}.
                </p>
              )}
            </div>
          )}

          <SubscoreBars
            subscores={score.subscores}
            peerMedians={peerMedians}
            peerFamilyLabel={familyLabel}
            details={subscoreDetails}
          />
        </div>
        </Gated>
      ),
    });
  }

  if (biz.google_review_count !== undefined) {
    const reviewDelta = social.growth?.review_count?.delta;
    glanceRows.push({
      key: "reviews",
      label: "Reviews",
      value: biz.google_review_count.toLocaleString(),
      delta: [
        biz.google_rating !== undefined ? `${biz.google_rating}★` : null,
        pct !== null ? `${pct}% five-star` : null,
        reviewDelta ? `+${reviewDelta} in 90d` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      focus: weakestKey === "community_spark",
      expanded: (
        <Gated label="review voice" businessName={biz.name} source={`reviews:${biz.slug}`}>
          <RowPeerStat
            label="Review volume"
            thisValue={fmtStatValue(familyStats.reviewCount.value, "reviewCount")}
            familyMedian={fmtStatValue(familyStats.reviewCount.median, "reviewCount")}
            rankLabel={familyStats.reviewCount.label}
            pctVsMedian={familyStats.reviewCount.pctVsMedian}
            familyShort={familyStats.familyShort}
          />
          <ReviewVoice
            analysis={reviewAnalysis}
            phrases={reviewPhrases.length >= 2 ? reviewPhrases : undefined}
            pullquote={reviewPullquote}
            totalReviews={totalRev}
          />
        </Gated>
      ),
    });
  }

  if (tt && tt.video_count > 0) {
    glanceRows.push({
      key: "tiktok",
      label: "Creator reach (TikTok)",
      value: `${tt.unique_creators} creators`,
      delta: ttPlaysFmt ?? undefined,
      focus: false,
      expanded: (
        <Gated label="creator coverage" businessName={biz.name} source={`tiktok:${biz.slug}`}>
          <div className="space-y-6">
            <RowPeerStat
              label="Creators filming"
              thisValue={fmtStatValue(familyStats.tiktokCreators.value, "tiktokCreators")}
              familyMedian={fmtStatValue(familyStats.tiktokCreators.median, "tiktokCreators")}
              rankLabel={familyStats.tiktokCreators.label}
              pctVsMedian={familyStats.tiktokCreators.pctVsMedian}
              familyShort={familyStats.familyShort}
            />
            <TikTokMentions data={social.tiktok_mentions} businessName={biz.name} />
          </div>
        </Gated>
      ),
    });
  }

  if (social.ig) {
    glanceRows.push({
      key: "ig",
      label: "Instagram cadence",
      value: `${social.ig.posts_30d} posts / 30d`,
      delta:
        social.ig.posts_30d === 0
          ? daysSinceLastPost !== null
            ? `Dormant · last post ${daysSinceLastPost} days ago`
            : "Dormant"
          : `Active · ${social.ig.reels_30d} reels`,
      focus: weakestKey === "momentum",
      expanded: (
        <Gated label="Instagram cadence" businessName={biz.name} source={`ig:${biz.slug}`}>
          <RowPeerStat
            label="Instagram cadence"
            thisValue={fmtStatValue(familyStats.igPosts30d.value, "igPosts30d")}
            familyMedian={fmtStatValue(familyStats.igPosts30d.median, "igPosts30d")}
            rankLabel={familyStats.igPosts30d.label}
            pctVsMedian={familyStats.igPosts30d.pctVsMedian}
            familyShort={familyStats.familyShort}
          />
          <MomentumSparkline
            posts30d={social.ig?.posts_30d ?? 0}
            reels30d={social.ig?.reels_30d ?? 0}
            handle={social.ig?.handle ?? null}
            hasRealData={!!social.ig}
            seed={biz.slug}
          />
        </Gated>
      ),
    });
  }

  // Failsafe: ensure at least one row is open by default.
  if (!glanceRows.some((r) => r.focus) && glanceRows.length > 0) {
    glanceRows[0].focus = true;
  }

  // Compute the social trend pill, "how is this business doing on social
  // this quarter" without needing a click.
  const socialTrend = computeSocialTrend({
    igPosts30d: social.ig?.posts_30d ?? null,
    igLastPostDaysAgo: daysSinceLastPost,
    tiktokUniqueCreators: tt?.unique_creators ?? 0,
    tiktokTotalPlays: tt?.total_plays ?? 0,
    reviewDelta90d: social.growth?.review_count?.delta ?? null,
  });

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1">
        <article className="mx-auto max-w-4xl px-6 py-10 md:py-14">
          {/* Breadcrumb */}
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
                <Link href="/#search" className="hover:text-brand-purple">
                  {categoryLabel.replace(/^Pittsburgh\s+/, "")}
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <Link href="/#search" className="hover:text-brand-purple">
                  {neighborhoodLabel}
                </Link>
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
          </header>

          {/* Tier + rank stamp, asserts "this is a ranked editorial
              artifact" between the title and the hero photo so a reader
              landing cold knows the publication's job in the first 2
              seconds. Per visual-storytelling-coach review, fixes the
              pre-fold dead zone. */}
          {rankFamilyPos !== null && (
            <div className="mt-5 md:mt-6 border-t border-b border-brand-black/15 py-3">
              <p className="font-display text-[0.6rem] md:text-[0.65rem] font-semibold uppercase tracking-[0.22em] flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={
                    score.tier === "icons"
                      ? "bg-brand-lime text-brand-black px-2 py-0.5"
                      : score.tier === "ones_to_watch"
                        ? "bg-brand-purple text-brand-off-white px-2 py-0.5"
                        : "bg-brand-cream text-brand-black border border-brand-black/30 px-2 py-0.5"
                  }
                >
                  {score.tier === "icons"
                    ? "Icons"
                    : score.tier === "ones_to_watch"
                      ? "Ones to Watch"
                      : "Neighborhood Staple"}
                </span>
                <span className="text-brand-black/55">
                  #{rankFamilyPos} in Pittsburgh {familyShort}
                </span>
                {score.rank_category && score.rank_category !== rankFamilyPos ? (
                  <span className="text-brand-black/35">
                    · #{score.rank_category} in{" "}
                    {labelForCategory(biz.category).toLowerCase()}
                  </span>
                ) : null}
              </p>
            </div>
          )}

          {/* Hero photo banner. Visual anchor so a cold reader knows what
              the place looks like before the editorial diagnosis lands.
              Falls back gracefully when no photo, just no banner.
              Upgraded from the Apify-default 408x306 to 1600x1200 via
              the Google CDN size suffix swap, so the photo is sharp at
              full card width on retina. */}
          {(biz.hero_photo || biz.photos[0]?.url) && (
            <div className="mt-6 md:mt-8 relative w-full aspect-[16/7] md:aspect-[16/6] overflow-hidden bg-brand-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  upgradeGooglePhotoSize(
                    biz.hero_photo || biz.photos[0]!.url,
                    1600,
                  ) ?? (biz.hero_photo || biz.photos[0]!.url)
                }
                alt={`${biz.name} storefront / interior photo from Google Maps`}
                loading="eager"
                className="ken-burns absolute inset-0 w-full h-full object-cover"
              />
            </div>
          )}

          {/* 1. Diagnosis pull-quote, the editorial headline */}
          <div className="mt-6 md:mt-8">
            <DiagnosisPullquote
              line={diagnosis.line}
              highlight={diagnosis.highlight}
            />
          </div>

          {/* 2a. Strengths & Gaps card, peer comparisons against family */}
          {(strengths.length > 0 || gaps.length > 0) && (
            <div className="mt-6 md:mt-8">
              <StrengthsAndGaps
                strengths={strengths}
                gaps={gaps}
                familyShort={familyStats.familyShort}
              />
            </div>
          )}

          {/* 2b. At a glance accordion, the interactive data */}
          <div className="mt-6 md:mt-8">
            <BusinessAtAGlance
              businessName={biz.name}
              rows={glanceRows}
              trend={socialTrend}
            />
          </div>

          {/* 3. The Playbook, prescriptive moves (always visible) */}
          <div className="mt-10 md:mt-14">
            <Playbook playbook={playbook} />
          </div>

          {/* 4. Get Featured CTA, third sanctioned Relay surface per
              editorial brief. Sits between the Playbook (diagnostic) and
              the Subscribe footer (return-loop). */}
          <div className="mt-10 md:mt-12">
            <GetFeaturedCTA businessName={biz.name} businessSlug={biz.slug} />
          </div>

          {/* 5. Subscribe footer */}
          <div className="mt-10 md:mt-12">
            <SubscribeFooter businessName={biz.name} />
          </div>
        </article>
      </main>

      <Colophon />
    </>
  );
}
