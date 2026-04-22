import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";
import { familyForCategory } from "@/lib/data/category-family";

/**
 * Quarter narrative — the "one-paragraph story" that sits above the
 * business TL;DR. Tells the reader what happened this quarter in plain
 * language, derived deterministically from the record + social + the
 * family leader.
 *
 * Shape:
 *   - 2-3 sentences
 *   - Subject-verb-signal opener
 *   - Peer context in the middle
 *   - Forward-looking conclusion tied to weakest signal
 */

export type QuarterNarrative = {
  issue: string;
  body: string;
};

const TIER_PHRASE = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
} as const;

export function buildQuarterNarrative(
  artifact: BusinessArtifact,
  social: SocialRecord,
  all: BusinessArtifact[],
  issue: string = "Spring 2026",
): QuarterNarrative {
  const { business, score, meta } = artifact;

  const totalReviews = business.google_review_count ?? 0;
  const fiveStar = meta.reviewsDistribution?.fiveStar ?? 0;
  const fiveStarPct =
    totalReviews > 0 ? Math.round((fiveStar / totalReviews) * 100) : 0;

  // Pick the dominant signal — the strongest data story to lead with
  const photoCount = meta.imagesCount;
  const igPosts30d = social.ig?.posts_30d ?? null;

  // Lead clause — "spent {quarter} {doing something with signal strength}"
  let leadClause: string;
  if (totalReviews >= 500 && fiveStarPct >= 80) {
    leadClause = `stacking reviews (${totalReviews.toLocaleString()} total, ${fiveStarPct}% five-star)`;
  } else if (photoCount >= 500) {
    leadClause = `building a photo catalog (${photoCount.toLocaleString()} on Google)`;
  } else if (totalReviews >= 200) {
    leadClause = `holding a ${business.google_rating ?? 0} rating across ${totalReviews.toLocaleString()} reviews`;
  } else if (totalReviews >= 50) {
    leadClause = `building a neighborhood following (${totalReviews.toLocaleString()} reviews, ${fiveStarPct}% five-star)`;
  } else {
    leadClause = `quietly finding its audience`;
  }

  // Contrast clause — what went missing
  let contrastClause: string;
  if (igPosts30d === 0) {
    contrastClause = `while the Instagram went quiet — zero posts in thirty days`;
  } else if (igPosts30d !== null && igPosts30d <= 2) {
    contrastClause = `while the Instagram barely moved — ${igPosts30d} post${igPosts30d === 1 ? "" : "s"} in thirty days`;
  } else if (!social.ig) {
    contrastClause = `though the Instagram presence hasn't been indexed yet`;
  } else if (igPosts30d !== null && igPosts30d >= 10) {
    contrastClause = `and kept the Instagram firing at the same time (${igPosts30d} posts, ${social.ig?.reels_30d ?? 0} reels in thirty days)`;
  } else {
    contrastClause = `with a measured Instagram cadence (${igPosts30d} posts in thirty days)`;
  }

  // Peer context — pull the #1 in the family
  const currentFamily = familyForCategory(meta.categoryName).key;
  const familyMembers = all.filter(
    (b) => familyForCategory(b.meta.categoryName).key === currentFamily,
  );
  const familyTop = familyMembers
    .slice()
    .sort((a, b) => b.score.composite - a.score.composite)[0];

  let peerSentence = "";
  if (familyTop && familyTop.business.slug !== business.slug) {
    const topIgPosts = null; // (we don't load social for peers here; keep it lean)
    peerSentence = `${familyTop.business.name}, ${familyTop.business.neighborhood}, sits at #1 in the family this issue — ${familyTop.score.unfair_advantage.label} was the story.`;
  } else if (familyTop && familyTop.business.slug === business.slug) {
    peerSentence = `No one in the family outranked them this issue.`;
  }

  // Forward-looking conclusion
  const subs = score.subscores;
  const weakest = Object.entries(subs).reduce((a, b) =>
    a[1] <= b[1] ? a : b,
  );
  let conclusion: string;
  switch (weakest[0]) {
    case "momentum":
      conclusion = `The climb ${score.tier === "icons" ? "rides on holding" : "back to Icons depends on re-lighting"} the social layer.`;
      break;
    case "content_canvas":
      conclusion = `The next move is more photographic evidence — the catalog is thinner than the case deserves.`;
      break;
    case "community_spark":
      conclusion = `The missing piece is louder reviewer voice — the numbers are there, the themes aren't yet.`;
      break;
    case "conversion_path":
      conclusion = `The fix is boring but fast: fill in the gaps on Google (hours, phone, website) before the next issue.`;
      break;
    case "collab_fit":
      conclusion = `A tighter creator-ready profile — verified account, clean bio, reel pinned — closes the gap to the tier above.`;
      break;
    default:
      conclusion = `The next issue will tell us how much of the quarter's shape holds.`;
  }

  const body = [
    `${business.name} spent ${issue} ${leadClause} ${contrastClause}.`,
    peerSentence,
    conclusion,
  ]
    .filter(Boolean)
    .join(" ");

  return { issue, body };
}
