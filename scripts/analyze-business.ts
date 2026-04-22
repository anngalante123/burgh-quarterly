#!/usr/bin/env tsx
/**
 * analyze-business — single Claude call per business generates everything
 * editorial: review voice, quarter narrative, TL;DR, and the 3-move playbook.
 *
 * Replaces the string-template fallbacks for:
 *   - lib/editorial/quarter-narrative.ts (Quarter narrative)
 *   - lib/editorial/business-tldr.ts (TL;DR read + meaning)
 *   - lib/editorial/playbook.ts (3 recs)
 *   - scripts/analyze-reviews.ts (themes + pullquote + summary)
 *
 * Output cached at content/review-analysis/{slug}.json (same path; schema
 * is a superset of the prior review-only shape). Loaders read whichever
 * fields they need.
 *
 * Run:
 *   npx tsx scripts/analyze-business.ts                # all businesses
 *   npx tsx scripts/analyze-business.ts <slug>         # one
 *   npx tsx scripts/analyze-business.ts --force        # overwrite
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadEnv } from "dotenv";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const BUSINESSES_DIR = join(process.cwd(), "content", "businesses");
const SOCIAL_DIR = join(process.cwd(), "content", "social");
const ANALYSIS_DIR = join(process.cwd(), "content", "review-analysis");
const MODEL = "claude-sonnet-4-6";

type ReviewTheme = {
  phrase: string;
  frequency: number;
  sentiment: "positive" | "neutral" | "negative";
  exampleQuote?: string;
};

type PlaybookItem = {
  headline: string;
  action: string;
  signal:
    | "momentum"
    | "content_canvas"
    | "community_spark"
    | "conversion_path"
    | "collab_fit";
  priority: "high" | "medium" | "low";
};

type BusinessAnalysis = {
  slug: string;
  analyzed_at: string;
  model: string;
  review_count: number;

  // Review Voice
  themes: ReviewTheme[];
  notable_quote: string;
  sentiment_summary: string;

  // Quarter Narrative — the story of the quarter for this business
  quarter_narrative: string;

  // TL;DR — read + meaning
  tldr_read: string;
  tldr_meaning: string;

  // Playbook — 3 specific moves
  playbook: PlaybookItem[];
};

async function analyzeOne(
  client: Anthropic,
  input: {
    name: string;
    neighborhood: string;
    category: string;
    tier: "icons" | "ones_to_watch" | "neighborhood_staples";
    rankCategory: number;
    rankFamily: number;
    familyLabel: string;
    familySize: number;
    familyLeaderName: string;
    familyLeaderAdvantage: string;
    subscores: Record<string, number>;
    peerMedians: Record<string, number>;
    reviews: string[];
    totalReviews: number;
    fiveStarPct: number;
    reviewFreshnessDays: number;
    photoCount: number;
    photoCategories: string[];
    hasWebsite: boolean;
    hasPhone: boolean;
    hasHours: boolean;
    igHandle: string | null;
    igPosts30d: number | null;
    igReels30d: number | null;
    igLastPostDaysAgo: number | null;
    igEngagementRate: number | null;
    igIsBusiness: boolean;
    igVerified: boolean;
    igHasBio: boolean;
  },
): Promise<Omit<BusinessAnalysis, "slug" | "analyzed_at" | "model">> {
  const tierLabel = {
    icons: "Icons of the Burgh",
    ones_to_watch: "Ones to Watch",
    neighborhood_staples: "Neighborhood Staples",
  }[input.tier];

  const prompt = `You are writing editorial copy for Signal Pittsburgh, a quarterly publication that ranks Pittsburgh's small businesses on the conversation around them — reviews, sentiment, photos, Instagram, and momentum. We don't rank taste; we rank how the city sees a business.

Your job is to produce a full editorial analysis for ONE business, returning a single JSON object. The voice is a smart food/business journalist — specific, confident, no marketing cliches, no "we noticed" surveillance tone, no yinzer dialect. When a signal is weak, be honest about it. When it's strong, be specific about why.

Never use these phrases: "leverage", "amplify", "organic growth", "content strategy", "authentic engagement", "best bakery", "top-rated", "grade", "score of". Never cite a raw 0-100 composite score.

=== BUSINESS ===
Name: ${input.name}
Neighborhood: ${input.neighborhood}
Category: ${input.category}
Tier: ${tierLabel}
Rank: #${input.rankCategory} in Pittsburgh ${input.category}s · #${input.rankFamily} in ${input.familyLabel} (${input.familySize} businesses in the family)

=== FAMILY CONTEXT ===
${input.familyLabel} leader this issue: ${input.familyLeaderName} — their standout signal is "${input.familyLeaderAdvantage}".

=== SIGNAL STRENGTHS (0-100, never quote the numbers) ===
Visual Catalog: ${input.subscores.content_canvas} (family median ${input.peerMedians.content_canvas})
Review Sentiment: ${input.subscores.community_spark} (family median ${input.peerMedians.community_spark})
Conversion Path: ${input.subscores.conversion_path} (family median ${input.peerMedians.conversion_path})
Instagram Momentum: ${input.subscores.momentum} (family median ${input.peerMedians.momentum})
Creator Fit: ${input.subscores.collab_fit} (family median ${input.peerMedians.collab_fit})

=== RAW DATA ===
Total Google reviews: ${input.totalReviews.toLocaleString()} (${input.fiveStarPct}% five-star)
Latest review: ${input.reviewFreshnessDays} days ago
Photos on Google: ${input.photoCount.toLocaleString()} across ${input.photoCategories.length} categories (${input.photoCategories.slice(0, 6).join(", ")})
Website on Google: ${input.hasWebsite ? "yes" : "NO"}
Phone on Google: ${input.hasPhone ? "yes" : "NO"}
Hours on Google: ${input.hasHours ? "yes" : "NO"}
Instagram handle: ${input.igHandle ? "@" + input.igHandle : "NOT INDEXED"}
${
  input.igHandle
    ? `Instagram posts in last 30 days: ${input.igPosts30d}
Instagram reels in last 30 days: ${input.igReels30d}
Instagram last post: ${input.igLastPostDaysAgo !== null ? input.igLastPostDaysAgo + " days ago" : "unknown"}
Instagram engagement rate: ${input.igEngagementRate !== null ? (input.igEngagementRate * 100).toFixed(2) + "%" : "unknown"}
Instagram is business account: ${input.igIsBusiness}
Instagram verified: ${input.igVerified}
Instagram has bio: ${input.igHasBio}`
    : ""
}

=== REVIEW TEXTS (${input.reviews.length} available) ===
${input.reviews.map((r, i) => `${i + 1}. "${r}"`).join("\n")}

=== OUTPUT ===
Return ONLY a valid JSON object with this exact shape (no markdown, no prose outside JSON):

{
  "themes": [
    {"phrase": "specific 2-5 word phrase from the reviews", "frequency": approximate_count, "sentiment": "positive" | "neutral" | "negative", "exampleQuote": "short quote lightly cleaned"}
  ],
  "notable_quote": "the strongest pull-quote from the reviews — one sentence, captures the appeal",
  "sentiment_summary": "one sentence: what reviewers love + what they nitpick, specific not generic",

  "quarter_narrative": "2-3 sentence editorial paragraph describing what this business's Spring 2026 looked like. Lead with what the signal did (stacked reviews / held a rating / built a catalog / went dormant on Instagram). Include the family-leader context in a compressed form. End with a forward-looking sentence about what moves the rank. Write like a journalist, not a marketer.",

  "tldr_read": "One sentence: strongest signal in plain language + weakest signal + tier and rank. Example template: 'Strong reviews, dormant Instagram. Ones to Watch — #1 in Pittsburgh Bakeries.' Adapt wording to this business.",

  "tldr_meaning": "One sentence describing what the data says about the business's trajectory. NOT a call to action. Write in data terms. Example: 'The climb to Icons depends on the Instagram signal restarting — the other axes are already there.' Adapt to this business.",

  "playbook": [
    {
      "headline": "5-8 words, action-oriented",
      "action": "10-18 words, specific to this business — cite the actual number or gap when you can",
      "signal": "momentum" | "content_canvas" | "community_spark" | "conversion_path" | "collab_fit",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Playbook rules:
- Exactly 3 items.
- Prioritize the weakest signal first.
- Each item on a different signal.
- Reference the actual data where possible (e.g. "37 days without a post", "only 3 photo categories tagged", "no website linked on Google").
- The "high" priority is reserved for the single biggest leverage move. "medium" for supporting. "low" for a maintenance/forward-looking tip.

Themes rules:
- 4-6 themes.
- Phrases should be specific ("morning pastry case", "Liège waffle", "busy weekends") — not generic ("food", "service").
- Sentiment reflects the theme: "busy weekends" could be negative or positive; use your judgment from the actual review text.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`No text block in Claude response for ${input.name}`);
  }
  let json = textBlock.text.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const parsed = JSON.parse(json) as Omit<
    BusinessAnalysis,
    "slug" | "analyzed_at" | "model" | "review_count"
  >;
  return {
    ...parsed,
    review_count: input.reviews.length,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "[analyze-business] ANTHROPIC_API_KEY not set in environment",
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const targetSlug = args.find((a) => !a.startsWith("--")) ?? null;

  await mkdir(ANALYSIS_DIR, { recursive: true });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const allBizFiles = (await readdir(BUSINESSES_DIR)).filter((f) =>
    f.endsWith(".json"),
  );

  // Load all businesses once for family context
  const allBusinesses = await Promise.all(
    allBizFiles.map(async (f) => {
      const raw = await readFile(join(BUSINESSES_DIR, f), "utf-8");
      return { file: f, record: JSON.parse(raw) };
    }),
  );

  // Family grouping — inline so this script is self-contained
  const SWEETS = new Set([
    "Bakery",
    "Pastry shop",
    "Dessert shop",
    "Dessert restaurant",
    "Ice cream shop",
  ]);
  const CAFES = new Set(["Cafe", "Coffee shop", "Tea house", "Juice shop"]);
  const ASIAN = new Set([
    "Noodle shop",
    "Japanese restaurant",
    "Sushi restaurant",
    "Thai restaurant",
    "Indian restaurant",
  ]);
  const BARS = new Set(["Bar", "Brewery"]);
  function family(categoryName: string): {
    key: string;
    label: string;
  } {
    if (SWEETS.has(categoryName))
      return { key: "sweets", label: "Pittsburgh Sweets" };
    if (CAFES.has(categoryName))
      return { key: "cafes", label: "Pittsburgh Cafes" };
    if (ASIAN.has(categoryName))
      return { key: "asian", label: "Pittsburgh Asian Kitchens" };
    if (BARS.has(categoryName))
      return { key: "bars", label: "Pittsburgh Bars" };
    return { key: "other", label: "Pittsburgh Businesses" };
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const { file, record } of allBusinesses) {
    const slug = file.replace(/\.json$/, "");
    if (targetSlug && slug !== targetSlug) continue;

    const outPath = join(ANALYSIS_DIR, `${slug}.json`);
    if (!force && existsSync(outPath)) {
      // Re-run only if the file is missing a new field (shape migration)
      try {
        const existing = JSON.parse(await readFile(outPath, "utf-8"));
        if (
          existing.quarter_narrative &&
          existing.tldr_read &&
          existing.playbook
        ) {
          console.log(`[skip] ${slug} — cached (new shape)`);
          skipped++;
          continue;
        }
        console.log(`[migrate] ${slug} — cache is old shape, regenerating`);
      } catch {
        // fall through to regenerate
      }
    }

    const reviews: string[] = record._meta?.reviewTexts ?? [];
    if (reviews.length < 2) {
      console.log(`[skip] ${slug} — only ${reviews.length} review(s)`);
      skipped++;
      continue;
    }

    // Load social
    let social: {
      ig?: {
        handle: string;
        posts_30d: number;
        reels_30d: number;
        avg_engagement_rate: number;
        verified: boolean;
        is_business_account?: boolean;
        biography?: string;
        last_post_at: string | null;
      };
    } = {};
    try {
      const socialRaw = await readFile(join(SOCIAL_DIR, `${slug}.json`), "utf-8");
      social = JSON.parse(socialRaw);
      // Handle flat IG shape
      if (!social.ig && (social as Record<string, unknown>).handle) {
        social = { ig: social as unknown as typeof social.ig };
      }
    } catch {}

    const fam = family(record._meta?.categoryName ?? "");
    const sameFamily = allBusinesses.filter(
      (b) => family(b.record._meta?.categoryName ?? "").key === fam.key,
    );
    const familyRanked = [...sameFamily].sort(
      (a, b) => b.record._score.composite - a.record._score.composite,
    );
    const familyRank =
      familyRanked.findIndex((b) => b.record.slug === record.slug) + 1;
    const familyLeader = familyRanked[0].record;

    const fiveStar = record._meta?.reviewsDistribution?.fiveStar ?? 0;
    const totalReviews = record.google_review_count ?? 0;
    const fiveStarPct =
      totalReviews > 0 ? Math.round((fiveStar / totalReviews) * 100) : 0;

    let igLastPostDaysAgo: number | null = null;
    if (social.ig?.last_post_at) {
      const last = new Date(social.ig.last_post_at);
      igLastPostDaysAgo = Math.round(
        (Date.now() - last.getTime()) / 86_400_000,
      );
    }

    // Peer medians within the family
    function median(vals: number[]): number {
      if (vals.length === 0) return 0;
      const s = vals.slice().sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
    }
    const peerMedians: Record<string, number> = {
      content_canvas: median(
        sameFamily.map((b) => b.record._score.subscores.content_canvas),
      ),
      community_spark: median(
        sameFamily.map((b) => b.record._score.subscores.community_spark),
      ),
      conversion_path: median(
        sameFamily.map((b) => b.record._score.subscores.conversion_path),
      ),
      momentum: median(
        sameFamily.map((b) => b.record._score.subscores.momentum),
      ),
      collab_fit: median(
        sameFamily.map((b) => b.record._score.subscores.collab_fit),
      ),
    };

    try {
      console.log(
        `[call] ${slug} — ${reviews.length} reviews · ${fam.label} #${familyRank}`,
      );
      const result = await analyzeOne(client, {
        name: record.name,
        neighborhood: record.neighborhood,
        category: record._meta?.categoryName ?? record.category,
        tier: record._score.tier,
        rankCategory: record._score.rank_category,
        rankFamily: familyRank,
        familyLabel: fam.label,
        familySize: sameFamily.length,
        familyLeaderName: familyLeader.name,
        familyLeaderAdvantage: familyLeader._score.unfair_advantage.label,
        subscores: record._score.subscores,
        peerMedians,
        reviews,
        totalReviews,
        fiveStarPct,
        reviewFreshnessDays: record.review_freshness_days ?? 999,
        photoCount: record._meta?.imagesCount ?? 0,
        photoCategories: record._meta?.imageCategories ?? [],
        hasWebsite: !!record._meta?.hasWebsite,
        hasPhone: !!record._meta?.hasPhone,
        hasHours: !!record._meta?.hasOpeningHours,
        igHandle: social.ig?.handle ?? null,
        igPosts30d: social.ig?.posts_30d ?? null,
        igReels30d: social.ig?.reels_30d ?? null,
        igLastPostDaysAgo,
        igEngagementRate: social.ig?.avg_engagement_rate ?? null,
        igIsBusiness: !!social.ig?.is_business_account,
        igVerified: !!social.ig?.verified,
        igHasBio: !!social.ig?.biography,
      });

      const full: BusinessAnalysis = {
        slug,
        ...result,
        analyzed_at: new Date().toISOString(),
        model: MODEL,
      };
      await writeFile(outPath, JSON.stringify(full, null, 2), "utf-8");
      console.log(
        `[ok]   ${slug} — narrative ✓ · tldr ✓ · playbook ${result.playbook?.length ?? 0} · themes ${result.themes?.length ?? 0}`,
      );
      processed++;
    } catch (e) {
      console.error(`[fail] ${slug}:`, (e as Error).message);
      failed++;
    }
  }

  console.log(
    `\nDone. processed=${processed} skipped=${skipped} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
