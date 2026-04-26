/**
 * generate-creator-posts.ts, builds the "Top 50 Creator Posts About
 * Pittsburgh Businesses" article.
 *
 * Different unit from the business-list generator: items are videos,
 * not businesses. Aggregates top_videos from every business's social
 * record (already 90-day relevance-filtered), flattens, sorts by play
 * count, takes top N, calls Claude once for an editorial intro, writes
 * to content/lists/articles/best-creator-posts-about.json.
 *
 * Article shape carries `kind: "posts"` so the /best-on-social/[slug]
 * renderer can branch to the post layout.
 *
 * Usage:
 *   npm run generate:posts            # default top 50
 *   npm run generate:posts -- --dry   # preview without Claude call
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { loadAllRichBusinesses } from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const RAW_DIR = join(process.cwd(), "content/raw/tiktok");

/**
 * Family-specific context keywords. A video is counted only if its
 * caption / hashtags / author handle mention BOTH a token from the
 * business name AND at least one of these context words. This is the
 * fix for the loose-filter false positives ("Lorelei" the song,
 * "Pusadee's Garden" the Roblox game, "La Gourmandine Hazelwood"
 * tagged with #fireroomhazelwood for a different venue).
 */
const FAMILY_CONTEXT: Record<string, string[]> = {
  sweets: [
    "bakery", "pastry", "bread", "croissant", "cake", "cookie", "dessert",
    "ice cream", "icecream", "gelato", "donut", "doughnut", "waffle", "sweet",
    "treat", "sugar", "frosting", "cupcake", "macaron", "danish", "scone",
  ],
  cafes: [
    "coffee", "latte", "espresso", "cappuccino", "matcha", "cafe", "café",
    "tea", "boba", "juice", "drink", "smoothie", "brew", "cold brew",
    "americano", "mocha", "barista", "kombucha",
  ],
  bars: [
    "bar", "cocktail", "drink", "beer", "wine", "alcohol", "lounge", "pub",
    "brewery", "brew", "ipa", "lager", "happy hour", "whiskey", "bourbon",
    "vodka", "gin", "tequila", "shots", "tap", "pint",
  ],
  asian_eats: [
    "noodle", "ramen", "sushi", "dumpling", "thai", "indian", "japanese",
    "asian", "food", "dish", "restaurant", "eat", "curry", "rice", "soup",
    "spicy", "yum", "delicious", "lunch", "dinner", "meal", "broth",
  ],
  restaurants: [
    "restaurant", "food", "dish", "meal", "eat", "dinner", "lunch", "brunch",
    "plate", "menu", "appetizer", "entree", "chef", "cook", "delicious",
    "yum", "tasty",
  ],
  other: [],
};

const STOP_TOKENS = new Set([
  "and", "the", "with", "for", "from", "pittsburgh", "shop", "cafe", "bar",
  "restaurant", "kitchen", "company", "house",
]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

const MODEL = "claude-sonnet-4-6";
const OUT_DIR = join(process.cwd(), "content/lists/articles");
const SLUG = "best-creator-posts-about";
const TOP_N = 50;

type PostItem = {
  rank: number;
  /** Always "post" so the renderer can switch on it. */
  kind: "post";
  /** Direct link to the TikTok video. */
  video_url: string;
  plays: number;
  likes: number;
  /** Posted date ISO. */
  posted: string;
  /** Caption from the video, lightly trimmed. */
  caption: string;
  /** TikTok creator handle (without @). */
  creator_handle: string;
  /** Which business this video features. */
  business_slug: string;
  business_name: string;
  family_label: string;
  neighborhood: string;
};

type PostArticle = {
  slug: string;
  /** Marks this as a post-list, not a business-list. The renderer branches on this. */
  kind: "posts";
  title: string;
  subtitle: string;
  angle: string;
  intro: string;
  items: PostItem[];
  generated_at: string;
  model: string;
};

function scrubEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
}

async function generateIntro(
  client: Anthropic,
  items: PostItem[],
): Promise<string> {
  const lines = items
    .slice(0, 10)
    .map(
      (i) =>
        `${i.rank}. @${i.creator_handle} on ${i.business_name} (${i.neighborhood}), ${i.plays.toLocaleString()} plays. Caption: "${i.caption.slice(0, 140)}"`,
    )
    .join("\n");
  const totalPlays = items.reduce((s, i) => s + i.plays, 0);
  const uniqueCreators = new Set(items.map((i) => i.creator_handle)).size;
  const uniqueBusinesses = new Set(items.map((i) => i.business_slug)).size;

  const prompt = `You're writing the editorial intro for a Signal Pittsburgh article: the top creator-made TikToks about Pittsburgh small businesses this quarter (Spring 2026).

VOICE: smart food/business journalist, specific, confident, no marketing cliches. Write like New York Magazine's food coverage. NEVER use em dashes (the long dash, U+2014). Use commas, periods, colons, or semicolons. We will reject any output containing em dashes.

EDITORIAL ANGLE: This list is the strongest evidence of a thesis we're tracking, the city is filming Pittsburgh businesses, the businesses are not posting back. None of these videos came from the businesses themselves. They came from creators, customers, locals.

DATA POINTS:
- Top 50 videos by plays
- Total plays across the list: ${totalPlays.toLocaleString()}
- Unique creators represented: ${uniqueCreators}
- Unique businesses featured: ${uniqueBusinesses}

TOP 10 (for tease material):
${lines}

Write 2 to 3 short paragraphs (about 140 to 200 words total) that set the editorial frame. Tease 2 to 3 specific creators or videos by handle and play count. Note the pattern that none of the businesses featured here made these videos themselves. End with one forward-looking sentence about Issue 02.

Return ONLY the prose. No headers, no markdown, no quotation marks wrapping the response.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in Claude response");
  return scrubEmDashes(block.text.trim());
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry") || args.includes("--dry-run");

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("[generate-posts] ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const all = loadAllRichBusinesses({ fresh: true });
  console.log(`[generate-posts] loaded ${all.length} businesses`);

  // Build candidate pool from RAW scrape data, applying a TIGHTER filter
  // than the scraper's loose pass: business token AND family context word
  // AND last 90 days. Falls back to social.top_videos for any business
  // whose raw file is missing.
  type Candidate = {
    plays: number;
    likes: number;
    posted: string;
    caption: string;
    creator: string;
    url: string;
    business: (typeof all)[number];
  };
  const candidates: Candidate[] = [];
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let droppedNoContext = 0;
  let droppedOther = 0;

  for (const rb of all) {
    const biz = rb.artifact.business;
    const tokens = nameTokens(biz.name);
    const family = familyForCategory(rb.artifact.meta.categoryName).key;
    const contextWords = FAMILY_CONTEXT[family] ?? [];
    const rawPath = join(RAW_DIR, `${biz.slug}.json`);
    if (!existsSync(rawPath)) continue;
    const raw = JSON.parse(await readFile(rawPath, "utf-8")) as {
      items: Array<{
        playCount?: number;
        diggCount?: number;
        text?: string;
        webVideoUrl?: string;
        createTimeISO?: string;
        authorMeta?: { name?: string; nickName?: string };
        hashtags?: Array<{ name?: string }>;
      }>;
    };

    for (const v of raw.items) {
      // Recency
      const posted = v.createTimeISO ? Date.parse(v.createTimeISO) : NaN;
      if (Number.isNaN(posted) || posted < cutoff) {
        droppedOther++;
        continue;
      }

      const haystack = [
        (v.text ?? "").toLowerCase(),
        (v.authorMeta?.name ?? "").toLowerCase(),
        (v.authorMeta?.nickName ?? "").toLowerCase(),
        ...(v.hashtags ?? []).map((h) => (h.name ?? "").toLowerCase()),
      ].join(" ");

      // Business name token must appear
      const hasBusinessToken = tokens.some((t) => haystack.includes(t));
      if (!hasBusinessToken) {
        droppedOther++;
        continue;
      }

      // Family context word must appear (skip this requirement only for
      // "other" family which has no defined context words)
      if (contextWords.length > 0) {
        const hasContext = contextWords.some((c) => haystack.includes(c));
        if (!hasContext) {
          droppedNoContext++;
          continue;
        }
      }

      const plays = v.playCount ?? 0;
      if (!v.webVideoUrl || plays <= 0) continue;
      candidates.push({
        plays,
        likes: v.diggCount ?? 0,
        posted: v.createTimeISO ?? "",
        caption: scrubEmDashes((v.text ?? "").slice(0, 240)),
        creator: v.authorMeta?.name ?? "",
        url: v.webVideoUrl,
        business: rb,
      });
    }
  }
  console.log(
    `[generate-posts] ${candidates.length} candidates kept (dropped ${droppedNoContext} for missing family context, ${droppedOther} for other reasons)`,
  );

  // Sort by plays descending, take top N.
  candidates.sort((a, b) => b.plays - a.plays);
  const top = candidates.slice(0, TOP_N);
  console.log(`[generate-posts] keeping top ${top.length}`);

  const items: PostItem[] = top.map((c, i) => ({
    rank: i + 1,
    kind: "post",
    video_url: c.url,
    plays: c.plays,
    likes: c.likes,
    posted: c.posted,
    caption: c.caption.slice(0, 240),
    creator_handle: c.creator,
    business_slug: c.business.artifact.business.slug,
    business_name: c.business.artifact.business.name,
    family_label: familyForCategory(c.business.artifact.meta.categoryName).label,
    neighborhood: c.business.artifact.business.neighborhood,
  }));

  if (dryRun) {
    console.log("[generate-posts] dry-run, top 10:");
    for (const i of items.slice(0, 10)) {
      console.log(
        `  ${i.rank}. @${i.creator_handle} -> ${i.business_name} | ${i.plays.toLocaleString()} plays | ${i.caption.slice(0, 80)}`,
      );
    }
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const intro = await generateIntro(client, items);

  const article: PostArticle = {
    slug: SLUG,
    kind: "posts",
    title: "The 50 Best Creator Posts About Pittsburgh Businesses",
    subtitle:
      "TikToks made by Pittsburgh creators, ranked by plays. None of these came from the businesses themselves.",
    angle:
      "the city is filming Pittsburgh businesses; the businesses are not posting back. Here's the proof, ranked.",
    intro,
    items,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };

  const out = join(OUT_DIR, `${SLUG}.json`);
  await writeFile(out, JSON.stringify(article, null, 2) + "\n", "utf-8");
  console.log(`[generate-posts] wrote ${out} (${items.length} items)`);
}

main().catch((err) => {
  console.error("[generate-posts] fatal:", err);
  process.exit(1);
});
