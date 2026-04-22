import type { BusinessArtifact } from "@/lib/data/load-business";
import type { SocialRecord } from "@/lib/data/load-social";

/**
 * Business TL;DR — plain-language summary + "so what" derived from
 * the record's data. Sits at the top of the business page to give the
 * dense scorecard an executive preview.
 *
 * Shape:
 *   read    — one sentence. "Strong X, weak Y. Tier — #Z in Category."
 *   meaning — one sentence. Action the reader / owner should take.
 *
 * Generation is deterministic from `_score.subscores`, freshness, and
 * IG data — no Claude call needed.
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

  // Strengths & weaknesses from subscores
  const s = score.subscores;
  const entries: Array<[keyof typeof s, number, string, string]> = [
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

  const read = `${capitalize(strengthPhrase)}, ${weaknessPhrase}. ${tierPhrase} — ${rankClause}.`;

  // "What it means" — frame differently by tier
  let meaning: string;
  switch (score.tier) {
    case "icons":
      meaning = `Visit this weekend. Owners: claim to track the next-issue climb path.`;
      break;
    case "ones_to_watch":
      meaning = igDormant
        ? `Visit this weekend — there's a creator gap worth filling. Owners: claim to see the climb path.`
        : `On the rise. Visit this weekend. Owners: claim to see the climb path.`;
      break;
    case "neighborhood_staples":
      meaning = `Rooted but under-covered. Visit this weekend. Owners: claim to see what's holding the rank back.`;
      break;
  }

  return { read, meaning };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
