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

import { brandKey, loadAllRichBusinesses } from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const RAW_DIR = join(process.cwd(), "content/raw/tiktok");

/**
 * Pittsburgh-area markers. A video must contain at least one of these
 * (in caption, hashtags, author handle, or author nickname) to count.
 * This is the geographic filter that kills out-of-state false positives
 * (Powell OH, Galveston TX, Tupelo MS, Mechanicsburg PA, Pretoria SA).
 *
 * Includes generic city markers + every Pittsburgh neighborhood we've
 * indexed in this issue. Normalized to lowercase + alphanumeric so it
 * matches "412onthemove", "pghfoodie", "squirrelhill", "stripdistrict".
 */
const PITTSBURGH_MARKERS = [
  "pittsburgh",
  "pgh",
  "412",
  "steelcity",
  "yinz",
  // Indexed neighborhoods, see content/businesses/*.json:
  "arlington",
  "bloomfield",
  "eastliberty",
  "hazelwood",
  "highlandpark",
  "larimer",
  "lawrenceville",
  "morningside",
  "shadyside",
  "southside",
  "southsideflats",
  "squirrelhill",
  "stripdistrict",
];

/**
 * Family-specific context keywords. Used as a secondary requirement
 * for businesses with single distinguishing tokens (Pages, Lorelei,
 * Margaux, Mola), where the token alone is too generic.
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

/**
 * Extract a TikTok video ID from a webVideoUrl. Format is typically
 * https://www.tiktok.com/@username/video/1234567890123456789
 * Returns null if the URL doesn't match the expected pattern.
 */
function extractVideoId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Fetch TikTok's oEmbed metadata for a video. Returns a stable
 * thumbnail URL (the first frame TikTok serves for previews) and
 * other metadata. Returns null on any error so the generator can
 * proceed without thumbnails for unreachable videos.
 *
 * Endpoint: https://www.tiktok.com/oembed?url=<video_url>
 * No auth required, but may rate-limit at scale.
 */
async function fetchOEmbed(videoUrl: string): Promise<{
  thumbnail_url: string;
} | null> {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`,
      {
        headers: { "user-agent": "Signal-Pittsburgh/1.0" },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { thumbnail_url?: string };
    if (!data.thumbnail_url) return null;
    return { thumbnail_url: data.thumbnail_url };
  } catch {
    return null;
  }
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

/**
 * The "core" business name, normalized for substring matching against
 * haystack.alphanum. Strips:
 *   - non-alphanumerics ("Page's" -> "pages")
 *   - Pittsburgh neighborhood suffixes ("La Gourmandine Lawrenceville"
 *     -> "lagourmandine") so creators referencing just the brand match
 *   - leading "the"/"a" articles ("The Butterwood Bake Consortium"
 *     -> "butterwoodbakeconsortium")
 *
 * Used by the strict matcher to require the business name as a
 * contiguous string ("squarecafe" not "square ... cafe").
 */
function coreBusinessName(name: string): string {
  let s = name.toLowerCase();
  // Strip neighborhoods that appear as suffixes
  for (const m of PITTSBURGH_MARKERS) {
    if (m.length < 6) continue; // skip "pgh", "412", "yinz" etc.
    s = s.replace(new RegExp(`\\b${m}\\b`, "gi"), "");
  }
  // Drop articles
  s = s.replace(/^\s*(the|a)\s+/, "");
  // Normalize to alphanumeric
  return s.replace(/[^a-z0-9]/g, "");
}

/**
 * Normalized haystack: caption + hashtags + author handle + nickname,
 * lowercased and stripped of non-alphanumerics. Lets us match
 * "stripdistrict" against a hashtag like "#StripDistrict" and
 * "pages" against "@pagesicecream".
 */
function buildHaystack(v: {
  text?: string;
  authorMeta?: { name?: string; nickName?: string };
  hashtags?: Array<{ name?: string }>;
}): { full: string; alphanum: string } {
  const parts = [
    v.text ?? "",
    v.authorMeta?.name ?? "",
    v.authorMeta?.nickName ?? "",
    ...(v.hashtags ?? []).map((h) => h.name ?? ""),
  ];
  const full = parts.join(" ").toLowerCase();
  const alphanum = full.replace(/[^a-z0-9]/g, "");
  return { full, alphanum };
}

function hasPittsburghMarker(haystack: { full: string; alphanum: string }): boolean {
  return PITTSBURGH_MARKERS.some((m) => haystack.alphanum.includes(m));
}

/**
 * The strict business-name match. Two paths based on how distinctive
 * the core name is:
 *
 *   (a) Long core (>=8 chars after normalization, e.g. "everydaynoodles",
 *       "squarecafe", "lagourmandine"): require the core string as a
 *       contiguous substring of the haystack. Solves the "regent square
 *       coffee shop" false-match for Square Cafe, since "regentsquarecoffee"
 *       does not contain "squarecafe".
 *
 *   (b) Short core (<8 chars, e.g. "pages", "mola", "lorelei"): too
 *       generic alone, also require a family-context word in the
 *       haystack.
 *
 * Either path additionally accepts the case where the haystack contains
 * "@<core>" or "#<core>" as an explicit handle/hashtag tag.
 */
function nameMatches(
  haystack: { full: string; alphanum: string },
  core: string,
  familyKey: string,
): boolean {
  if (!core) return false;
  const tagged =
    haystack.full.includes(`@${core}`) || haystack.full.includes(`#${core}`);

  if (core.length >= 8) {
    return haystack.alphanum.includes(core);
  }

  // Short core: require the core token AND a family context word
  if (!haystack.alphanum.includes(core)) return false;
  if (tagged) return true;
  const ctx = FAMILY_CONTEXT[familyKey] ?? [];
  if (ctx.length === 0) return true;
  return ctx.some((c) => haystack.full.includes(c));
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
  /** TikTok video ID (extracted from URL), used for the embed iframe. */
  video_id: string | null;
  /** Stable thumbnail URL via TikTok's oEmbed endpoint, null if oEmbed
   *  fetch failed (deleted video, rate limit, etc.). */
  thumbnail_url: string | null;
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

DATA POINTS (use these EXACT numbers in your prose):
- ${items.length} videos ranked by plays
- Total plays across the list: ${totalPlays.toLocaleString()}
- Unique creators represented: ${uniqueCreators}
- Unique businesses featured: ${uniqueBusinesses} (capped at 2 per business so the list reads as a survey across the city, not a deep dive into one place)

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

  const all = await loadAllRichBusinesses({ fresh: true });
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
    const core = coreBusinessName(biz.name);
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
      // (a) Recency
      const posted = v.createTimeISO ? Date.parse(v.createTimeISO) : NaN;
      if (Number.isNaN(posted) || posted < cutoff) {
        droppedOther++;
        continue;
      }

      const haystack = buildHaystack(v);

      // (b) Strict business name match (substring of core name, or @/# tag)
      if (!nameMatches(haystack, core, family)) {
        droppedNoContext++;
        continue;
      }

      // (c) Pittsburgh area marker required
      if (!hasPittsburghMarker(haystack)) {
        droppedOther++;
        continue;
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
    `[generate-posts] ${candidates.length} candidates kept (dropped ${droppedNoContext} for name mismatch, ${droppedOther} for recency or no Pittsburgh marker)`,
  );

  // Dedupe by video URL: same TikTok can match multiple businesses
  // (e.g. "I love La Gourmandine" matches both Lawrenceville and
  // Hazelwood locations). Keep the highest-plays attribution, which
  // because we sort first below is also the first one we see.
  candidates.sort((a, b) => b.plays - a.plays);
  const seen = new Set<string>();
  const unique: typeof candidates = [];
  for (const c of candidates) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    unique.push(c);
  }
  console.log(
    `[generate-posts] ${unique.length} unique videos after dedup (was ${candidates.length})`,
  );

  // Cap per business at 2, parity with the BY list. So one viral
  // business doesn't dominate, the list reads as a survey of which
  // Pittsburgh businesses the city is filming, not a deep dive into
  // Everyday Noodles or Page's specifically.
  // Cap per BRAND, not per slug. Chains like Eat'n Park have many
  // locations in the index and any per-slug cap would let one brand
  // crowd the list across its records.
  const PER_BRAND_CAP = 2;
  const perBrandCount = new Map<string, number>();
  const capped: typeof candidates = [];
  for (const c of unique) {
    const key = brandKey(c.business.artifact.business.name);
    const cnt = perBrandCount.get(key) ?? 0;
    if (cnt >= PER_BRAND_CAP) continue;
    perBrandCount.set(key, cnt + 1);
    capped.push(c);
  }
  console.log(
    `[generate-posts] ${capped.length} after cap (max ${PER_BRAND_CAP} per brand)`,
  );
  const top = capped.slice(0, TOP_N);
  console.log(`[generate-posts] keeping top ${top.length}`);

  const items: PostItem[] = top.map((c, i) => ({
    rank: i + 1,
    kind: "post",
    video_url: c.url,
    video_id: extractVideoId(c.url),
    thumbnail_url: null, // filled in below via oEmbed
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

  // Fetch TikTok oEmbed thumbnails in parallel (rate-limit safe at 50,
  // TikTok's public oEmbed handles small bursts fine). Failed fetches
  // become null and the renderer falls back to a play-icon placeholder.
  console.log(`[generate-posts] fetching ${items.length} oEmbed thumbnails...`);
  await Promise.all(
    items.map(async (item) => {
      const o = await fetchOEmbed(item.video_url);
      if (o) item.thumbnail_url = o.thumbnail_url;
    }),
  );
  const withThumbs = items.filter((i) => i.thumbnail_url).length;
  console.log(`[generate-posts] got thumbnails for ${withThumbs}/${items.length}`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const intro = await generateIntro(client, items);

  const article: PostArticle = {
    slug: SLUG,
    kind: "posts",
    title: "The Best Creator Posts About Pittsburgh Businesses",
    subtitle:
      "TikToks made by Pittsburgh creators, ranked by plays. Two per business max. None of these came from the businesses themselves.",
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
