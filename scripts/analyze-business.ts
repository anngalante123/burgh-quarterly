#!/usr/bin/env tsx
/**
 * analyze-business, single Claude call per business generates everything
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
 * Phase 2 scale-up changes (chunk A):
 *   1. Anthropic prompt caching on the stable system block (rubric, voice
 *      rules, em-dash ban, banned phrases, output schema, playbook + theme
 *      rules). The per-business data stays in the user message and is not
 *      cached. Second call onward should hit cache for the system block.
 *   2. Exponential backoff with jitter on Claude API calls (5 retries:
 *      2s, 4s, 8s, 16s, 32s, with +/- 20% jitter). Retries on 429 / 5xx
 *      and network errors. Never retries on 400 / 401 / 403.
 *   3. Cost ledger persistence: every successful Claude call writes one
 *      row to ingest_cost_log with token counts, computed usd_cost, model,
 *      and the business slug. Logging failure does not kill the analysis.
 *
 * Run:
 *   npx tsx scripts/analyze-business.ts                # all businesses
 *   npx tsx scripts/analyze-business.ts <slug>         # one
 *   npx tsx scripts/analyze-business.ts --force        # overwrite
 *   npx tsx scripts/analyze-business.ts --dry-run <slug>  # print prompt, no API
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadEnv } from "dotenv";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

import { familyForBusinessCategory } from "@/lib/data/category-family";
import type { Category } from "@/lib/data/schemas";

const BUSINESSES_DIR = join(process.cwd(), "content", "businesses");
const SOCIAL_DIR = join(process.cwd(), "content", "social");
const ANALYSIS_DIR = join(process.cwd(), "content", "review-analysis");
export const MODEL = "claude-sonnet-4-6";

/* ----------------------------- pricing ---------------------------------- */

/**
 * Sonnet 4.6 pricing as of 2026-05, USD per million tokens. Update here
 * if Anthropic shifts pricing; the cost ledger reads from these constants.
 */
const PRICE_PER_MTOK = {
  input: 3.0,
  output: 15.0,
  cache_write: 3.75,
  cache_read: 0.3,
} as const;

function computeUsdCost(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}): number {
  const inputUncached = Math.max(
    0,
    usage.input_tokens - usage.cache_read_tokens - usage.cache_write_tokens,
  );
  const cost =
    (inputUncached * PRICE_PER_MTOK.input) / 1_000_000 +
    (usage.cache_write_tokens * PRICE_PER_MTOK.cache_write) / 1_000_000 +
    (usage.cache_read_tokens * PRICE_PER_MTOK.cache_read) / 1_000_000 +
    (usage.output_tokens * PRICE_PER_MTOK.output) / 1_000_000;
  return Number(cost.toFixed(6));
}

/* --------------------------- batch counters ----------------------------- */

/**
 * In-process running totals printed at end of batch. Cheap and avoids the
 * need for a session_id round trip to the DB.
 */
const batchTotals = {
  businesses: 0,
  input_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  output_tokens: 0,
  usd: 0,
};

/* ------------------------------ types ----------------------------------- */

export type ReviewTheme = {
  phrase: string;
  frequency: number;
  sentiment: "positive" | "neutral" | "negative";
  exampleQuote?: string;
};

export type PlaybookItem = {
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

export type BusinessAnalysis = {
  slug: string;
  analyzed_at: string;
  model: string;
  review_count: number;

  // Review Voice
  themes: ReviewTheme[];
  notable_quote: string;
  sentiment_summary: string;

  // Quarter Narrative, the story of the quarter for this business
  quarter_narrative: string;

  // TL;DR, read + meaning
  tldr_read: string;
  tldr_meaning: string;

  // Playbook, 3 specific moves
  playbook: PlaybookItem[];
};

export type AnalyzeInput = {
  slug: string;
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
  tiktokVideoCount: number;
  tiktokTotalPlays: number;
  tiktokUniqueCreators: number;
  tiktokTopCreators: string[];
  tiktokTopVideo: { author: string; plays: number; text: string } | null;
  tiktokDetectedOwnHandle: string | null;
  tiktokMostRecentDaysAgo: number | null;
};

/* ------------------------------ prompts --------------------------------- */

/**
 * The stable system block. Cached via cache_control: { type: "ephemeral" }.
 * Contains everything that does NOT vary per business: role, voice rules,
 * banned phrases, em-dash ban, output schema, playbook rules, theme rules.
 *
 * Token-stable across all 5,000+ businesses. Second call onward hits cache
 * read pricing (about 10% of input price) for this entire block.
 */
const SYSTEM_PROMPT = `You are writing editorial copy for Signal Pittsburgh, a quarterly publication that ranks Pittsburgh's small businesses on the conversation around them, reviews, sentiment, photos, Instagram, and momentum. We don't rank taste; we rank how the city sees a business.

Your job is to produce a full editorial analysis for ONE business, returning a single JSON object. The voice is a smart food/business journalist, specific, confident, no marketing cliches, no "we noticed" surveillance tone, no yinzer dialect. When a signal is weak, be honest about it. When it's strong, be specific about why.

Never use these phrases: "leverage", "amplify", "organic growth", "content strategy", "authentic engagement", "best bakery", "top-rated", "grade", "score of". Never cite a raw 0-100 composite score.

Never use the word "median" anywhere. It reads as jargon and creates "median of what?" ambiguity for non-stats readers. If you'd reach for "median," reach for one of these instead: "the family typical," "the family average," "what this family usually has," concrete rank-of-N like "5th of 6 in the family," or just "the family" / "peers" / "most other Cafes."

NEVER USE EM DASHES (the long dash, U+2014). Use a comma, a period, a semicolon, or a colon instead. This applies to every text field in your output. We will reject any output that contains em dashes.

=== OUTPUT ===
Return ONLY a valid JSON object with this exact shape (no markdown, no prose outside JSON):

{
  "themes": [
    {"phrase": "specific 2-5 word phrase from the reviews", "frequency": approximate_count, "sentiment": "positive" | "neutral" | "negative", "exampleQuote": "short quote lightly cleaned"}
  ],
  "notable_quote": "the strongest pull-quote from the reviews, one sentence, captures the appeal",
  "sentiment_summary": "one sentence: what reviewers love + what they nitpick, specific not generic",

  "quarter_narrative": "2-3 sentence editorial paragraph describing what this business's Spring 2026 looked like. Where TikTok creator coverage is high (many videos, many plays, many creators) but the business itself isn't posting much, lead with that contrast: 'X creators are filming this place, the place is filming none of it back.' Include the family-leader context. End with a forward-looking sentence about what moves the rank. Write like a journalist, not a marketer.",

  "tldr_read": "One sentence: strongest signal in plain language + weakest signal + tier and rank. Example template: 'Strong reviews, dormant Instagram. Ones to Watch, #1 in Pittsburgh Bakeries.' Adapt wording to this business.",

  "tldr_meaning": "One sentence describing what the data says about the business's trajectory. NOT a call to action. Write in data terms. Example: 'The climb to Icons depends on the Instagram signal restarting, the other axes are already there.' Adapt to this business.",

  "diagnosis_pullquote": {
    "line": "ONE display-scale headline sentence that EXPLAINS THIS BUSINESS'S RANK. Title case. 10-18 words. The reader should finish reading and understand (a) where this business sits and (b) why. REQUIRED SHAPE: reference the rank or tier explicitly OR reference the dominant signal that drove the rank, then add the qualifier (the friction, the gap, the asterisk, or the next move). Examples of the shape we want: 'First In Sweets, Driven By 3,145 Reviews. The Feed Hasn't Joined In Yet.' / 'Eighth In Sweets Despite Twenty-Six Creators Filming. The Bakery Hasn't Posted Back.' / 'Top Of The Bars Family On The Strength Of The Patio. The Reviews Followed.' DIVERSITY RULES: (1) NEVER use the construction 'N Creators Are Filming This Place, And [X] Is Filming None Of It Back' or any close variant. That phrasing has been overused. (2) Do NOT lead with creator count unless that count is genuinely the rank-driver for THIS business. (3) Vary syntactic structure across businesses, contrasts, fragments, two-clause patterns, declaratives. (4) NO EM DASHES anywhere in the line, ever. Use commas, periods, or colons. The line must read aloud as a punchy real headline a journalist would write, not a stat dump. (5) HONESTY ABOUT IG, CRITICAL: if 'Instagram posts in last 30 days' is 4 or more, the line must NOT use language implying the business is silent, dormant, has no feed, has no tank, hasn't posted, has no presence, or is missing in action. Those phrases describe IG-dormant businesses only. For an active IG poster, the gap is something else (engagement, reels strategy, no TikTok, posting cadence inconsistent, content not converting), and the line must name that real gap accurately. Conflating 'no TikTok account' with 'no presence' is a factual error, the business has IG, do not pretend otherwise. (5b) PLATFORM SPECIFICITY, when igPosts30d is 4 or more AND the business has no own TikTok account, you may say 'isn't on TikTok' or 'not on TikTok' or 'has no TikTok' to name that specific gap, but you may NOT use ambiguous phrasing like 'X is not' or 'X hasn't' or 'X isn't posting' WITHOUT a platform qualifier. A reader must not be able to read your line as 'this business doesn't post anywhere' when the data shows they post on IG. Bad example: 'Fourteen creators are posting; Page's is not.' (reads as Page's posts nowhere, but Page's posts on IG 9 times in 30 days). Good example: 'Fourteen creators are posting; Page's isn't on TikTok.' or 'Fourteen creators are posting on TikTok, where Page's still doesn't have an account.' (5c) SCOPE LOCK, the diagnosis line must use the FAMILY RANK as its primary anchor, not the narrow Google category rank. The publication's editorial structure is the family ('Pittsburgh Sweets', 'Pittsburgh Cafes', 'Pittsburgh Bars', 'Pittsburgh Asian Kitchens', 'Pittsburgh Restaurants') and every other on-page rank reference uses family-scope. If you say 'First In Bakeries' the reader sees the AtAGlance card below say '#8 of 8 in Sweets' and the page reads as confused about its own ranking philosophy. So: use the family rank as primary, e.g. 'First In Sweets,' 'Eighth In Sweets,' 'Top Of Pittsburgh Cafes.' You may include the narrow category rank ONLY as a secondary qualifier ('First In Bakeries, Fifth In Sweets') and only when both ranks are notably different. Default to family rank only. (6) HONESTY ABOUT CREATORS, CRITICAL: if 'tiktokVideoCount' is 0 OR 'tiktokUniqueCreators' is 0, the line must NOT use 'Creator Fit', 'Creator Setup', 'Creator Ready', 'Creator-Driven', 'Creator Energy', 'Carried By Creators', or any phrasing that implies creator involvement. Zero creators means no creators are filming yet. Use rank-drivers grounded in what IS there: review depth, customer rating, menu specificity, neighborhood word-of-mouth, family-leader status, product mention frequency, or simply 'a strong [season] start.' The gap to name is the missing creator layer or the dormant social presence, NOT a creator fit that doesn't exist in observable reality.",
    "highlight": "EXACTLY 2-4 consecutive words copy-pasted character-for-character from the 'line' above. Do NOT paraphrase. Do NOT translate digits to words or vice versa. If 'line' says 'Twenty-Six Creators', highlight must be a substring like 'Twenty-Six Creators', NOT '26 creators'. If 'line' says '1.6 Million', the highlight must contain '1.6 Million' verbatim. To verify before returning, search for the highlight string inside the line string, it must be found. Pick the most provocative 2-4 word phrase in the line as the highlight."
  },

  "playbook": [
    {
      "headline": "5-8 words, action-oriented",
      "action": "10-18 words, specific to this business, cite the actual number or gap when you can",
      "signal": "momentum" | "content_canvas" | "community_spark" | "conversion_path" | "collab_fit",
      "priority": "high" | "medium" | "low",
      "impact_label": "1-3 words: the projected outcome of this move as a tight pill label. Examples: '+8 SENTIMENT PTS', '+1 VISUAL RANK', 'UNLOCK 30 CREATORS', 'STOP THE DROP', 'REOPEN SIGNAL'. Always a concrete delta or unlock. Caps."
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
- Phrases should be specific ("morning pastry case", "Liège waffle", "busy weekends"), not generic ("food", "service").
- Sentiment reflects the theme: "busy weekends" could be negative or positive; use your judgment from the actual review text.`;

/**
 * Per-business user message. Contains all the variable fields. Built fresh
 * for every call. Never cached.
 */
function buildUserPrompt(input: AnalyzeInput): string {
  const tierLabel = {
    icons: "Icons of the Burgh",
    ones_to_watch: "Ones to Watch",
    neighborhood_staples: "Neighborhood Staples",
  }[input.tier];

  return `=== BUSINESS ===
Name: ${input.name}
Neighborhood: ${input.neighborhood}
Category: ${input.category}
Tier: ${tierLabel}
Rank: #${input.rankCategory} in Pittsburgh ${input.category}s · #${input.rankFamily} in ${input.familyLabel} (${input.familySize} businesses in the family)

=== FAMILY CONTEXT ===
${input.familyLabel} leader this issue: ${input.familyLeaderName}, their standout signal is "${input.familyLeaderAdvantage}".

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

=== TIKTOK CREATOR COVERAGE ===
${input.tiktokVideoCount > 0
  ? `Pittsburgh creators have posted ${input.tiktokVideoCount}${input.tiktokVideoCount >= 30 ? "+" : ""} TikToks tagged with this business in the last quarter.
Total plays: ${input.tiktokTotalPlays.toLocaleString()}
Unique creators filming: ${input.tiktokUniqueCreators}
Top creators by reach: ${input.tiktokTopCreators.slice(0, 5).map((h) => "@" + h).join(", ")}
Most recent TikTok: ${input.tiktokMostRecentDaysAgo !== null ? input.tiktokMostRecentDaysAgo + " days ago" : "unknown"}
${input.tiktokDetectedOwnHandle ? `Business has its own TikTok account: @${input.tiktokDetectedOwnHandle}` : "Business does NOT appear to have its own TikTok account."}
${input.tiktokTopVideo ? `Top video this issue: @${input.tiktokTopVideo.author} pulled ${input.tiktokTopVideo.plays.toLocaleString()} plays. Caption: "${input.tiktokTopVideo.text.slice(0, 200)}"` : ""}`
  : "No Pittsburgh TikToks indexed for this business."
}

EDITORIAL ANGLE NOTE: TikTok coverage is the most important hidden signal for many of these businesses. A bakery can be dormant on its own Instagram and still have 30 creators filming there with hundreds of thousands of plays. That gap (the city is filming you, you're not capturing any of it) is an honest editorial story AND a natural Relay opening. When the data supports this framing, lead with it. Don't force the angle when the business actually has its own TikTok and is posting.

=== REVIEW TEXTS (${input.reviews.length} available) ===
${input.reviews.map((r, i) => `${i + 1}. "${r}"`).join("\n")}`;
}

/* ----------------------------- retry ------------------------------------ */

/**
 * Exponential backoff with jitter. Retries on rate-limit (429), server
 * errors (502 / 503 / 504), and common network errors. Never retries on
 * client errors (400 / 401 / 403), where retry won't help. After 5 failed
 * attempts the original error is re-thrown wrapped with the slug + count.
 *
 * Schedule: 2s, 4s, 8s, 16s, 32s, with +/- 20% jitter per attempt.
 */
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 32000];

function isRetryable(err: unknown): boolean {
  // Anthropic SDK errors carry a numeric `status`. Network-layer errors
  // surface a Node `code` like ECONNRESET / ETIMEDOUT / EAI_AGAIN, or
  // come through as a plain Error with "fetch failed" message.
  const e = err as { status?: number; code?: string; message?: string } | null;
  if (!e) return false;
  if (typeof e.status === "number") {
    if (e.status === 429) return true;
    if (e.status === 502 || e.status === 503 || e.status === 504) return true;
    if (e.status === 400 || e.status === 401 || e.status === 403) return false;
    return false;
  }
  const code = e.code ?? "";
  if (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND"
  ) {
    return true;
  }
  const msg = e.message ?? "";
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("network")) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  context: { slug: string; step: string },
): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_DELAYS_MS.length || !isRetryable(err)) {
        break;
      }
      const baseDelay = RETRY_DELAYS_MS[attempt];
      const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
      const delay = Math.max(0, Math.round(baseDelay + jitter));
      const status = (err as { status?: number }).status;
      const msg = (err as { message?: string }).message ?? String(err);
      console.warn(
        `[retry] ${context.slug} (${context.step}), attempt ${attempt + 1}/${RETRY_DELAYS_MS.length} failed (${status ?? "no-status"}): ${msg}. Sleeping ${delay}ms.`,
      );
      await sleep(delay);
    }
  }
  const msg = (lastErr as { message?: string })?.message ?? String(lastErr);
  throw new Error(
    `[analyze-business] ${context.slug} ${context.step}: gave up after ${RETRY_DELAYS_MS.length} retries. Last error: ${msg}`,
  );
}

/* ---------------------------- cost ledger ------------------------------- */

/**
 * Persist one row to ingest_cost_log. Wrapped in try/catch so a logging
 * outage cannot kill the analysis batch. The DB module is imported lazily
 * because client.ts throws at import time when DATABASE_URL is missing,
 * and we want --dry-run + non-DB callers to keep working.
 */
async function logCost(row: {
  business_slug: string;
  step: "analyzed";
  model: string;
  input_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  usd_cost: number;
}): Promise<void> {
  try {
    const { db, schema } = await import("@/lib/db/client");
    await db.insert(schema.ingestCostLog).values({
      business_slug: row.business_slug,
      step: row.step,
      model: row.model,
      input_tokens: row.input_tokens,
      cache_read_tokens: row.cache_read_tokens,
      cache_write_tokens: row.cache_write_tokens,
      output_tokens: row.output_tokens,
      usd_cost: row.usd_cost,
    });
  } catch (e) {
    console.warn(
      `[ledger] ${row.business_slug}: failed to write cost row, continuing. ${(e as Error).message}`,
    );
  }
}

/* ---------------------------- analyzeOne -------------------------------- */

export async function analyzeOne(
  client: Anthropic,
  input: AnalyzeInput,
): Promise<Omit<BusinessAnalysis, "slug" | "analyzed_at" | "model">> {
  const userPrompt = buildUserPrompt(input);

  const response = await withRetry(
    () =>
      client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        // System prompt is sent as an array of text blocks so we can mark
        // the (sole) block ephemeral. cache_control on the LAST stable
        // block tells Anthropic to cache everything up to and including
        // that block. Cache lives 5 minutes between calls.
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      }),
    { slug: input.slug, step: "analyze" },
  );

  const usage = {
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };

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

  // Em-dash scrub: Anna's editorial rule, no em dashes anywhere. Even with
  // the prompt rule, Claude leaks them in occasionally. Replace every U+2014
  // with a comma at the source so the data layer is clean by construction.
  // Also normalize en dash (U+2013) to a hyphen for consistency.
  scrubEmDashes(parsed as Record<string, unknown>);

  // Defensive repair: the highlight phrase MUST be a literal substring of the
  // line, otherwise the DiagnosisPullquote component renders the line without
  // any lime highlight (the focus point of the entire hero). Claude sometimes
  // writes the line in title-case-with-words and the highlight in digits, which
  // fails the substring check. One repair call fixes it.
  const dp = (parsed as { diagnosis_pullquote?: { line: string; highlight: string } }).diagnosis_pullquote;
  let repairUsage: typeof usage | null = null;
  if (dp && !dp.line.toLowerCase().includes(dp.highlight.toLowerCase())) {
    console.warn(
      `[analyze-business] ${input.name}: highlight "${dp.highlight}" not found in line, requesting repair`,
    );
    const repair = await withRetry(
      () =>
        client.messages.create({
          model: MODEL,
          max_tokens: 256,
          messages: [
            {
              role: "user",
              content: `You wrote this diagnosis pull-quote, but the highlight is not a literal substring of the line:

LINE: "${dp.line}"
HIGHLIGHT: "${dp.highlight}"

Pick a 2-4 word phrase that already appears VERBATIM (character-for-character) inside the line. Do NOT change the line. Return ONLY the new highlight phrase as plain text, no quotes, no JSON, nothing else.`,
            },
          ],
        }),
      { slug: input.slug, step: "repair-highlight" },
    );
    repairUsage = {
      input_tokens: repair.usage.input_tokens ?? 0,
      output_tokens: repair.usage.output_tokens ?? 0,
      cache_read_tokens: repair.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: repair.usage.cache_creation_input_tokens ?? 0,
    };
    const repairBlock = repair.content.find((b) => b.type === "text");
    if (repairBlock && repairBlock.type === "text") {
      const fixed = repairBlock.text.trim().replace(/^["']|["']$/g, "");
      if (dp.line.toLowerCase().includes(fixed.toLowerCase())) {
        dp.highlight = fixed;
        console.warn(`[analyze-business] ${input.name}: repaired highlight to "${fixed}"`);
      }
    }
  }

  // Roll up token usage and write one ledger row per Claude call. Failures
  // here only warn; the analysis result still ships.
  const totalUsage = {
    input_tokens: usage.input_tokens + (repairUsage?.input_tokens ?? 0),
    output_tokens: usage.output_tokens + (repairUsage?.output_tokens ?? 0),
    cache_read_tokens:
      usage.cache_read_tokens + (repairUsage?.cache_read_tokens ?? 0),
    cache_write_tokens:
      usage.cache_write_tokens + (repairUsage?.cache_write_tokens ?? 0),
  };
  const usd = computeUsdCost(totalUsage);

  batchTotals.businesses += 1;
  batchTotals.input_tokens += totalUsage.input_tokens;
  batchTotals.output_tokens += totalUsage.output_tokens;
  batchTotals.cache_read_tokens += totalUsage.cache_read_tokens;
  batchTotals.cache_write_tokens += totalUsage.cache_write_tokens;
  batchTotals.usd += usd;

  await logCost({
    business_slug: input.slug,
    step: "analyzed",
    model: MODEL,
    input_tokens: totalUsage.input_tokens,
    cache_read_tokens: totalUsage.cache_read_tokens,
    cache_write_tokens: totalUsage.cache_write_tokens,
    output_tokens: totalUsage.output_tokens,
    usd_cost: usd,
  });

  console.log(
    `[cost]  ${input.slug}, in=${totalUsage.input_tokens} cache_r=${totalUsage.cache_read_tokens} cache_w=${totalUsage.cache_write_tokens} out=${totalUsage.output_tokens} $${usd.toFixed(4)}`,
  );

  return {
    ...parsed,
    review_count: input.reviews.length,
  };
}

/**
 * Recursively replace em dashes (U+2014) with commas, en dashes (U+2013) with
 * hyphens, in every string field of the parsed object. Editorial rule, applied
 * at the data layer so downstream renderers don't need to think about it.
 */
function scrubEmDashes(obj: Record<string, unknown> | unknown): void {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (typeof v === "string") {
        obj[i] = v.replace(/\s*\u2014\s*/g, ", ").replace(/\s*–\s*/g, "-");
      } else if (v && typeof v === "object") {
        scrubEmDashes(v);
      }
    }
    return;
  }
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "string") {
        o[k] = v.replace(/\s*\u2014\s*/g, ", ").replace(/\s*–\s*/g, "-");
      } else if (v && typeof v === "object") {
        scrubEmDashes(v);
      }
    }
  }
}

/* -------------------------- input assembly ------------------------------ */

/**
 * Pure helper that turns the on-disk business + social records into the
 * AnalyzeInput shape. Pulled out of main() so --dry-run can reuse it
 * without making any API calls.
 */
export function assembleAnalyzeInput(
  slug: string,
  record: Record<string, unknown> & {
    name: string;
    neighborhood: string;
    slug: string;
    google_review_count?: number;
    review_freshness_days?: number;
    category?: string;
    _meta?: Record<string, unknown>;
    _score: {
      tier: "icons" | "ones_to_watch" | "neighborhood_staples";
      composite: number;
      rank_category: number;
      subscores: Record<string, number>;
      unfair_advantage: { label: string };
    };
  },
  social: {
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
    tiktok_mentions?: unknown;
  },
  reviews: string[],
  fam: { key: string; label: string },
  familyRank: number,
  familySize: number,
  familyLeader: { name: string; _score: { unfair_advantage: { label: string } } },
  peerMedians: Record<string, number>,
): AnalyzeInput {
  const meta = (record._meta ?? {}) as Record<string, unknown>;
  const fiveStar =
    ((meta.reviewsDistribution as { fiveStar?: number } | undefined)?.fiveStar) ??
    0;
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

  type TtMentions = {
    video_count: number;
    total_plays: number;
    unique_creators: number;
    top_creators: Array<{ handle: string }>;
    top_videos: Array<{ author: string; plays: number; text: string }>;
    detected_own_handle: string | null;
    most_recent_post_at: string | null;
  };
  const tt: TtMentions | null =
    ((social as Record<string, unknown>).tiktok_mentions as TtMentions) ??
    null;
  let ttMostRecentDaysAgo: number | null = null;
  if (tt?.most_recent_post_at) {
    const last = new Date(tt.most_recent_post_at);
    ttMostRecentDaysAgo = Math.round(
      (Date.now() - last.getTime()) / 86_400_000,
    );
  }

  return {
    slug,
    name: record.name,
    neighborhood: record.neighborhood,
    category: (meta.categoryName as string | undefined) ?? record.category ?? "",
    tier: record._score.tier,
    rankCategory: record._score.rank_category,
    rankFamily: familyRank,
    familyLabel: fam.label,
    familySize,
    familyLeaderName: familyLeader.name,
    familyLeaderAdvantage: familyLeader._score.unfair_advantage.label,
    subscores: record._score.subscores,
    peerMedians,
    reviews,
    totalReviews,
    fiveStarPct,
    reviewFreshnessDays: record.review_freshness_days ?? 999,
    photoCount: (meta.imagesCount as number | undefined) ?? 0,
    photoCategories: (meta.imageCategories as string[] | undefined) ?? [],
    hasWebsite: !!meta.hasWebsite,
    hasPhone: !!meta.hasPhone,
    hasHours: !!meta.hasOpeningHours,
    igHandle: social.ig?.handle ?? null,
    igPosts30d: social.ig?.posts_30d ?? null,
    igReels30d: social.ig?.reels_30d ?? null,
    igLastPostDaysAgo,
    igEngagementRate: social.ig?.avg_engagement_rate ?? null,
    igIsBusiness: !!social.ig?.is_business_account,
    igVerified: !!social.ig?.verified,
    igHasBio: !!social.ig?.biography,
    tiktokVideoCount: tt?.video_count ?? 0,
    tiktokTotalPlays: tt?.total_plays ?? 0,
    tiktokUniqueCreators: tt?.unique_creators ?? 0,
    tiktokTopCreators: tt?.top_creators?.map((c) => c.handle) ?? [],
    tiktokTopVideo:
      tt?.top_videos && tt.top_videos[0]
        ? {
            author: tt.top_videos[0].author,
            plays: tt.top_videos[0].plays,
            text: tt.top_videos[0].text,
          }
        : null,
    tiktokDetectedOwnHandle: tt?.detected_own_handle ?? null,
    tiktokMostRecentDaysAgo: ttMostRecentDaysAgo,
  };
}

/* ------------------------------- main ----------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const targetSlug = args.find((a) => !a.startsWith("--")) ?? null;

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "[analyze-business] ANTHROPIC_API_KEY not set in environment",
    );
    process.exit(1);
  }

  await mkdir(ANALYSIS_DIR, { recursive: true });

  // The client is only constructed for live runs. --dry-run never calls
  // the API, so we don't even instantiate it.
  const client = dryRun
    ? null
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

  // Family grouping comes from the typed Category enum, not Google's
  // freeform `categoryName` text. The previous Google-text-keyed lookup
  // here forced every category outside (sweets, cafes, asian, bars) into
  // a "Pittsburgh Businesses" bucket. That bug bled food-leader names
  // (Nan Xiang Soup Dumplings) into tattoo studio narratives. See
  // lib/data/category-family.ts for the single source of truth.

  // Peer set is sourced from the DB so that DB-only categories (tattoo,
  // spa, salon, ...) get real per-family peers instead of falling back to
  // the 30 calibration JSONs on disk.
  const ISSUE_SLUG = "2026-spring";
  const { db, schema } = await import("@/lib/db/client");
  const dbRows = await db
    .select({
      slug: schema.businesses.slug,
      name: schema.businesses.name,
      category: schema.businesses.category,
      composite: schema.scores.composite,
      subscores: schema.scores.subscores,
      unfair_advantage: schema.scores.unfair_advantage,
    })
    .from(schema.businesses)
    .innerJoin(
      schema.scores,
      // import dynamically to avoid a top-level drizzle-orm import the
      // existing file already keeps small.
      (await import("drizzle-orm")).and(
        (await import("drizzle-orm")).eq(
          schema.scores.business_slug,
          schema.businesses.slug,
        ),
        (await import("drizzle-orm")).eq(
          schema.scores.issue_slug,
          ISSUE_SLUG,
        ),
      ),
    );
  type DbPeerRow = (typeof dbRows)[number];

  const MIN_FAMILY_SIZE = 5;

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const { file, record } of allBusinesses) {
    const slug = file.replace(/\.json$/, "");
    if (targetSlug && slug !== targetSlug) continue;

    const outPath = join(ANALYSIS_DIR, `${slug}.json`);
    if (!force && !dryRun && existsSync(outPath)) {
      // Re-run only if the file is missing a new field (shape migration)
      try {
        const existing = JSON.parse(await readFile(outPath, "utf-8"));
        if (
          existing.quarter_narrative &&
          existing.tldr_read &&
          existing.playbook
        ) {
          console.log(`[skip] ${slug}, cached (new shape)`);
          skipped++;
          continue;
        }
        console.log(`[migrate] ${slug}, cache is old shape, regenerating`);
      } catch {
        // fall through to regenerate
      }
    }

    const reviews: string[] = record._meta?.reviewTexts ?? [];
    if (reviews.length < 2) {
      console.log(`[skip] ${slug}, only ${reviews.length} review(s)`);
      skipped++;
      continue;
    }

    // Load social. The on-disk shape is "flat" (IG fields at the top
    // level + `tiktok_mentions` and `growth` as siblings). We promote the
    // IG fields into a nested `ig` object for the rest of the script
    // while preserving siblings like `tiktok_mentions`.
    type SocialShape = {
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
      tiktok_mentions?: unknown;
    };
    let social: SocialShape = {};
    try {
      const socialRaw = await readFile(join(SOCIAL_DIR, `${slug}.json`), "utf-8");
      const raw = JSON.parse(socialRaw) as Record<string, unknown>;
      const tiktok_mentions = raw.tiktok_mentions;
      const hasFlatIg = !raw.ig && raw.handle;
      if (hasFlatIg) {
        social = {
          ig: raw as unknown as SocialShape["ig"],
          tiktok_mentions,
        };
      } else {
        social = {
          ig: raw.ig as SocialShape["ig"],
          tiktok_mentions,
        };
      }
    } catch {}

    // Family + peer set, DB-backed and keyed off the typed Category enum.
    const targetCategory = record.category as Category | undefined;
    const fam = familyForBusinessCategory(targetCategory ?? null);
    const sameFamily: DbPeerRow[] = dbRows.filter(
      (r) => familyForBusinessCategory(r.category).key === fam.key,
    );
    // Make sure the target itself is in the peer set even if its score row
    // has not been written for this issue yet.
    if (!sameFamily.some((r) => r.slug === slug)) {
      sameFamily.push({
        slug,
        name: record.name,
        category: (targetCategory ?? "restaurant") as Category,
        composite: record._score.composite,
        subscores: record._score.subscores,
        unfair_advantage: record._score.unfair_advantage,
      });
    }
    const familyRanked = [...sameFamily].sort(
      (a, b) => b.composite - a.composite,
    );
    const familyRank = familyRanked.findIndex((r) => r.slug === slug) + 1;
    // Leader excludes the target itself so we never describe a business
    // by comparing it to a copy of its own row.
    const familyLeaderRow =
      familyRanked.find((r) => r.slug !== slug) ?? familyRanked[0];

    if (sameFamily.length < MIN_FAMILY_SIZE) {
      console.warn(
        `[family] ${slug}: small family "${fam.label}" has only ${sameFamily.length} member(s) (min ${MIN_FAMILY_SIZE} for a confident peer comparison).`,
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
        sameFamily.map((r) => r.subscores.content_canvas),
      ),
      community_spark: median(
        sameFamily.map((r) => r.subscores.community_spark),
      ),
      conversion_path: median(
        sameFamily.map((r) => r.subscores.conversion_path),
      ),
      momentum: median(sameFamily.map((r) => r.subscores.momentum)),
      collab_fit: median(sameFamily.map((r) => r.subscores.collab_fit)),
    };

    // assembleAnalyzeInput's familyLeader argument is structurally typed;
    // we synthesize the minimum shape it needs from the DB row.
    const familyLeader = {
      name: familyLeaderRow.name,
      _score: { unfair_advantage: { label: familyLeaderRow.unfair_advantage?.label ?? "" } },
    };

    const analyzeInput = assembleAnalyzeInput(
      slug,
      record,
      social,
      reviews,
      fam,
      familyRank,
      sameFamily.length,
      familyLeader,
      peerMedians,
    );

    if (dryRun) {
      printDryRun(analyzeInput);
      processed++;
      continue;
    }

    try {
      console.log(
        `[call] ${slug}, ${reviews.length} reviews · ${fam.label} #${familyRank}`,
      );
      const result = await analyzeOne(client!, analyzeInput);

      const full: BusinessAnalysis = {
        slug,
        ...result,
        analyzed_at: new Date().toISOString(),
        model: MODEL,
      };
      await writeFile(outPath, JSON.stringify(full, null, 2), "utf-8");
      console.log(
        `[ok]   ${slug}, narrative ✓ · tldr ✓ · playbook ${result.playbook?.length ?? 0} · themes ${result.themes?.length ?? 0}`,
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
  if (!dryRun && batchTotals.businesses > 0) {
    console.log(
      `\n[batch-cost] businesses=${batchTotals.businesses} ` +
        `input=${batchTotals.input_tokens} ` +
        `cache_read=${batchTotals.cache_read_tokens} ` +
        `cache_write=${batchTotals.cache_write_tokens} ` +
        `output=${batchTotals.output_tokens} ` +
        `total_usd=$${batchTotals.usd.toFixed(4)}`,
    );
  }
}

/**
 * --dry-run printer. Renders the prompt structure that would be sent to
 * Anthropic, with cache breakpoints visible. Does NOT call the API.
 * Used to verify the prompt caching split before live runs.
 */
export function printDryRun(input: AnalyzeInput): void {
  const userPrompt = buildUserPrompt(input);
  console.log("=".repeat(72));
  console.log(`DRY RUN, slug=${input.slug}, model=${MODEL}`);
  console.log("=".repeat(72));
  console.log("\n--- SYSTEM (cached, cache_control: ephemeral) ---");
  console.log(`length: ${SYSTEM_PROMPT.length} chars`);
  console.log(SYSTEM_PROMPT);
  console.log("\n--- [CACHE BREAKPOINT] ---\n");
  console.log("--- USER (per-business, not cached) ---");
  console.log(`length: ${userPrompt.length} chars`);
  console.log(userPrompt);
  console.log("\n" + "=".repeat(72) + "\n");
}

// Only auto-run when this file is the script entrypoint. tsx and Node both
// expose process.argv[1] pointing at the script that started the process.
// When ingest-one.ts imports analyze functions, this guard keeps main() silent.
function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("analyze-business.ts") ||
    entry.endsWith("analyze-business.js") ||
    entry.endsWith("/analyze-business");
}

if (isEntrypoint()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
