import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";

/**
 * The Playbook, three data-derived recommendations per business, sorted
 * by leverage (weakest subscore first). Each recommendation is:
 *   - specific (references the actual gap in this record)
 *   - actionable (a verb + a concrete first step)
 *   - short (≤ 16 words)
 *
 * No editorial hand-writing per business, everything is derived from the
 * record + social + meta. If a subscore is at peer-ceiling on every axis,
 * we still produce 3 recs from the lowest-leverage pool so the block never
 * goes empty.
 */

export type PlaybookItem = {
  /** Short headline, 5-8 words. */
  headline: string;
  /** One-line action, 10-16 words. */
  action: string;
  /** Which subscore this addresses. */
  signal:
    | "momentum"
    | "content_canvas"
    | "community_spark"
    | "conversion_path"
    | "collab_fit";
  /** Priority emphasis, highest-leverage first. */
  priority: "high" | "medium" | "low";
};

export type Playbook = {
  items: PlaybookItem[];
};

type Evidence = {
  igPosts30d: number | null;
  igReels30d: number | null;
  igLastPostDaysAgo: number | null;
  igHasBio: boolean;
  igIsBusiness: boolean;
  igVerified: boolean;
  photoCount: number;
  photoCategoryCount: number;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
  reviewsTotal: number;
  reviewFreshnessDays: number;
  fiveStarPct: number;
};

function gatherEvidence(
  artifact: BusinessArtifact,
  social: SocialRecord,
): Evidence {
  const { business, meta } = artifact;
  const fiveStar = meta.reviewsDistribution?.fiveStar ?? 0;
  const reviewsTotal = business.google_review_count ?? 0;
  const fiveStarPct =
    reviewsTotal > 0 ? Math.round((fiveStar / reviewsTotal) * 100) : 0;

  let igLastPostDaysAgo: number | null = null;
  if (social.ig?.last_post_at) {
    const last = new Date(social.ig.last_post_at);
    igLastPostDaysAgo = Math.round(
      (Date.now() - last.getTime()) / 86_400_000,
    );
  }

  return {
    igPosts30d: social.ig?.posts_30d ?? null,
    igReels30d: social.ig?.reels_30d ?? null,
    igLastPostDaysAgo,
    igHasBio: !!social.ig?.biography,
    igIsBusiness: !!social.ig?.is_business_account,
    igVerified: !!social.ig?.verified,
    photoCount: meta.imagesCount,
    photoCategoryCount: meta.imageCategories.length,
    hasWebsite: meta.hasWebsite,
    hasPhone: meta.hasPhone,
    hasHours: meta.hasOpeningHours,
    reviewsTotal,
    reviewFreshnessDays: business.review_freshness_days ?? 999,
    fiveStarPct,
  };
}

export function buildPlaybook(
  artifact: BusinessArtifact,
  social: SocialRecord,
): Playbook {
  const e = gatherEvidence(artifact, social);
  const subs = artifact.score.subscores;
  const candidates: PlaybookItem[] = [];

  // --- MOMENTUM candidates -------------------------------------------------
  if (e.igPosts30d === 0 || e.igLastPostDaysAgo !== null && e.igLastPostDaysAgo > 30) {
    candidates.push({
      headline: "Restart the Instagram cadence",
      action:
        e.igLastPostDaysAgo !== null
          ? `Post one story or photo this week, your account has gone ${e.igLastPostDaysAgo} days without a post.`
          : "Post one story or photo this week to break the dormant signal.",
      signal: "momentum",
      priority: "high",
    });
  } else if (e.igPosts30d !== null && e.igPosts30d > 0 && e.igReels30d === 0) {
    candidates.push({
      headline: "Film one reel this month",
      action:
        "Reels pick up signal faster than static posts, one a month is enough to show the algorithm you're live.",
      signal: "momentum",
      priority: "high",
    });
  } else if (e.igPosts30d !== null && e.igPosts30d >= 1 && e.igPosts30d <= 3) {
    candidates.push({
      headline: "Tighten the Instagram cadence",
      action: `Shift from ${e.igPosts30d} monthly posts to weekly, even a single photo on Monday, Wednesday, Friday beats sporadic bursts.`,
      signal: "momentum",
      priority: "medium",
    });
  } else if (!social.ig) {
    candidates.push({
      headline: "Surface an Instagram handle",
      action:
        "Link your Instagram in the Google listing so the full signal can be tracked.",
      signal: "momentum",
      priority: "high",
    });
  }

  // --- CONTENT CANVAS candidates -------------------------------------------
  if (e.photoCount < 100) {
    candidates.push({
      headline: "Grow the photo catalog",
      action:
        "Upload 10 high-resolution owner photos to Google this week, kitchen, counter, and signature item.",
      signal: "content_canvas",
      priority: "high",
    });
  } else if (e.photoCategoryCount < 5) {
    candidates.push({
      headline: "Diversify the photo categories",
      action: `Only ${e.photoCategoryCount} Google photo categories are tagged, missing categories make you harder to feature.`,
      signal: "content_canvas",
      priority: "medium",
    });
  } else if (e.photoCount >= 500) {
    candidates.push({
      headline: "Pin a signature image",
      action:
        "Ask Google to feature a specific photo as the primary, your catalog is strong but the first image is the one creators screenshot.",
      signal: "content_canvas",
      priority: "low",
    });
  }

  // --- COMMUNITY SPARK candidates ------------------------------------------
  if (e.reviewFreshnessDays > 30) {
    candidates.push({
      headline: "Reactivate reviewer momentum",
      action: `Latest review landed ${e.reviewFreshnessDays} days ago, ask three happy customers this week to drop one-sentence reviews.`,
      signal: "community_spark",
      priority: "high",
    });
  } else if (e.fiveStarPct < 70 && e.reviewsTotal > 100) {
    candidates.push({
      headline: "Close the five-star gap",
      action: `${e.fiveStarPct}% five-star, respond to the four-stars to see what's keeping them off the peak.`,
      signal: "community_spark",
      priority: "medium",
    });
  } else if (e.reviewsTotal < 100) {
    candidates.push({
      headline: "Build the review base",
      action:
        "Under 100 reviews, a QR-code receipt asking for a one-sentence Google review moves this fast.",
      signal: "community_spark",
      priority: "medium",
    });
  }

  // --- CONVERSION PATH candidates ------------------------------------------
  if (!e.hasWebsite) {
    candidates.push({
      headline: "Add a website to the Google listing",
      action:
        "Even a one-page site with menu + address + hours moves this signal, creators can't link to a missing site.",
      signal: "conversion_path",
      priority: "high",
    });
  }
  if (!e.hasPhone) {
    candidates.push({
      headline: "Publish a phone number",
      action:
        "Google lists phone as a first-class search signal, missing it costs you clicks from map results.",
      signal: "conversion_path",
      priority: "high",
    });
  }
  if (!e.hasHours) {
    candidates.push({
      headline: "List opening hours on Google",
      action:
        "Hours missing, searchers and creators skip past listings that don't confirm when you're open.",
      signal: "conversion_path",
      priority: "high",
    });
  }

  // --- COLLAB FIT candidates -----------------------------------------------
  if (!e.igIsBusiness) {
    candidates.push({
      headline: "Switch Instagram to a business account",
      action:
        "Business account unlocks insights and the ability to be tagged in shop posts, one-minute settings change.",
      signal: "collab_fit",
      priority: "medium",
    });
  }
  if (!e.igHasBio) {
    candidates.push({
      headline: "Write a real Instagram bio",
      action:
        "A one-line bio with neighborhood + category + Linktree is the first thing a creator reads before pitching.",
      signal: "collab_fit",
      priority: "medium",
    });
  }
  if (!e.igVerified && e.igPosts30d !== null && e.igPosts30d >= 4) {
    candidates.push({
      headline: "Request verification on Instagram",
      action:
        "Consistent posting + local coverage makes you eligible, verified accounts get higher tag-back rates from creators.",
      signal: "collab_fit",
      priority: "low",
    });
  }

  // --- FALLBACK for high-performing businesses where no weakness fired ----
  // Sort subscores ascending; if fewer than 3 candidates, pull generic
  // leverage recs for the lowest-scoring ones.
  const GENERIC_RECS: Record<PlaybookItem["signal"], PlaybookItem> = {
    momentum: {
      headline: "Keep the Instagram signal live",
      action:
        "Weekly posting sustains rank between issues, drop to quarterly and the signal decays fast.",
      signal: "momentum",
      priority: "low",
    },
    content_canvas: {
      headline: "Refresh owner photography each season",
      action:
        "Google favors recent uploads, a seasonal refresh of the counter/interior keeps the catalog feeling current.",
      signal: "content_canvas",
      priority: "low",
    },
    community_spark: {
      headline: "Respond publicly to every recent review",
      action:
        "A visible owner response doubles perceived trust and surfaces themes reviewers rarely state directly.",
      signal: "community_spark",
      priority: "low",
    },
    conversion_path: {
      headline: "Audit the Google listing quarterly",
      action:
        "Hours drift. Menu drifts. A 5-minute listing review every quarter keeps the conversion path tight.",
      signal: "conversion_path",
      priority: "low",
    },
    collab_fit: {
      headline: "Pin a featured reel",
      action:
        "A pinned reel sets first-impression, the first thing a creator sees when they land on the profile.",
      signal: "collab_fit",
      priority: "low",
    },
  };
  const rankedSubs = (
    Object.entries(subs) as Array<[PlaybookItem["signal"], number]>
  ).sort((a, b) => a[1] - b[1]);
  for (const [key] of rankedSubs) {
    if (candidates.length >= 3) break;
    if (!candidates.some((c) => c.signal === key)) {
      candidates.push(GENERIC_RECS[key]);
    }
  }

  // Final: sort by priority then take top 3
  const priorityWeight = { high: 0, medium: 1, low: 2 };
  candidates.sort(
    (a, b) => priorityWeight[a.priority] - priorityWeight[b.priority],
  );
  return { items: candidates.slice(0, 3) };
}
