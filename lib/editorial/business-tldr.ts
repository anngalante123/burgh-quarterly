import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";

/**
 * Business TL;DR, plain-language summary + "so what" derived from
 * the record's data. Sits at the top of the business page to give the
 * dense scorecard an executive preview.
 *
 * Shape:
 *   read   , one sentence. "Strong X, weak Y. Tier, #Z in Category."
 *   meaning, one sentence. Action the reader / owner should take.
 *
 * Generation is deterministic from `_score.subscores`, freshness, and
 * IG data, no Claude call needed.
 */

export type BusinessTldr = {
  read: string;
  meaning: string;
};

const TIER_PHRASE = {
  icons: "Icons of the Burgh",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staples",
} as const;

export function buildBusinessTldr(
  artifact: BusinessArtifact,
  social: SocialRecord,
  categoryLabel: string,
): BusinessTldr {
  const { score } = artifact;

  // Strengths & weaknesses from subscores. When there is no measured IG
  // signal we exclude the momentum entry entirely. Letting momentum=0
  // win as "weakest" would print "..., dormant Instagram" for every
  // business without a handle, which reads as a factual claim about an
  // account we never observed. Letting it win as "strongest" (the old
  // bug) printed "Active Instagram, ..." with no IG indexed at all.
  const igMeasured = social.ig !== null && social.ig !== undefined;
  const s = score.subscores;
  const allEntries: Array<[keyof typeof s, number, string, string]> = [
    [
      "content_canvas",
      s.content_canvas,
      "strong photo catalog",
      "thin photo catalog",
    ],
    [
      "community_spark",
      s.community_spark,
      "strong reviews",
      "quiet reviews",
    ],
    [
      "conversion_path",
      s.conversion_path,
      "easy to find and visit",
      "hard to find or visit",
    ],
    [
      "momentum",
      s.momentum,
      "active Instagram",
      "dormant Instagram",
    ],
    [
      "collab_fit",
      s.collab_fit,
      "high creator fit",
      "lower creator fit",
    ],
  ];
  const entries = igMeasured
    ? allEntries
    : allEntries.filter(([k]) => k !== "momentum");

  const strongest = entries.reduce((a, b) => (a[1] >= b[1] ? a : b));
  const weakest = entries.reduce((a, b) => (a[1] <= b[1] ? a : b));

  // Special-case the dormant-Instagram story since it's our sharpest
  // editorial hook and directly ties to Relay's conversion path.
  const igDormant = social.ig ? social.ig.posts_30d === 0 : false;

  const strengthPhrase = strongest[2];
  const weaknessPhrase = igDormant ? "dormant Instagram" : weakest[3];

  // Tier + rank line
  const tierPhrase = TIER_PHRASE[score.tier];
  const categoryShort = categoryLabel.replace(/^Pittsburgh\s+/, "");
  const rankClause =
    score.rank_category === 1
      ? `#1 in Pittsburgh ${categoryShort}`
      : `#${score.rank_category} in Pittsburgh ${categoryShort}`;

  const read = `${capitalize(strengthPhrase)}, ${weaknessPhrase}. ${tierPhrase}, ${rankClause}.`;

  // "What it means", frame in data terms, not audience terms. The TL;DR
  // should describe how the business's signals trend; "visit this weekend"
  // and "owners: claim" are not the scorecard's job (they belong in
  // editorial lists + the claim affordance).
  let meaning: string;
  switch (score.tier) {
    case "icons":
      meaning = igDormant
        ? `An Icon holding ground on every axis except the social layer, the rank depends on keeping the Instagram signal live.`
        : `Firing on every axis this quarter. The rank holds when the cadence holds.`;
      break;
    case "ones_to_watch":
      meaning = igDormant
        ? `The climb to Icons depends on the Instagram signal restarting, the other axes are already there.`
        : `On the rise. The climb is in motion, next issue will show how much holds.`;
      break;
    case "neighborhood_staples":
      meaning = `Rooted but under-covered. The numbers are there; the coverage layer hasn't caught up yet.`;
      break;
  }

  return { read, meaning };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
