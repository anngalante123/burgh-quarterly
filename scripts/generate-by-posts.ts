/**
 * generate-by-posts.ts, "Top 50 Posts BY Pittsburgh Businesses This
 * Quarter" article. Counterpart to generate-creator-posts.ts: instead
 * of TikToks creators made about Pittsburgh businesses, this list is
 * Instagram posts the businesses themselves made.
 *
 * Source: content/raw/own-posts/<slug>.json (produced by
 * scripts/scrape-business-own-posts.ts).
 *
 * Filter: posted in the last 90 days. No relevance filter needed,
 * the content is from the business's own feed by construction.
 *
 * Ranking: descending by likes_count. Likes are present on every IG
 * post type (image, video, reel, carousel) and reflect resonance
 * across formats more fairly than play counts.
 *
 * Usage:
 *   npm run generate:by-posts            # write the article
 *   npm run generate:by-posts -- --dry   # preview, no Claude call
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { loadAllRichBusinesses } from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const MODEL = "claude-sonnet-4-6";
const RAW_DIR = join(process.cwd(), "content/raw/own-posts");
const OUT_DIR = join(process.cwd(), "content/lists/articles");
const SLUG = "best-by-posts";
const TOP_N = 50;

type PostItem = {
  rank: number;
  kind: "post";
  /** "instagram" for this list. Renderer branches on this for embed shape. */
  platform: "instagram";
  /** Direct link to the IG post (https://www.instagram.com/p/<shortcode>/). */
  video_url: string;
  /** IG shortcode, used for the embed iframe. */
  video_id: string | null;
  /** IG-served thumbnail URL. Note: IG image URLs are CDN-signed and may
   *  rotate over time. Acceptable for a quarterly publication. */
  thumbnail_url: string | null;
  /** videoPlayCount for videos and reels, 0 for static posts. */
  plays: number;
  likes: number;
  comments: number;
  posted: string;
  caption: string;
  /** The business's IG handle (the post author). */
  creator_handle: string;
  business_slug: string;
  business_name: string;
  family_label: string;
  neighborhood: string;
  /** "Image" | "Sidecar" | "Video", for renderer hints. */
  ig_type: string;
};

type Article = {
  slug: string;
  kind: "posts";
  title: string;
  subtitle?: string;
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
  const totalLikes = items.reduce((s, i) => s + i.likes, 0);
  const totalPlays = items.reduce((s, i) => s + (i.plays || 0), 0);
  const businesses = new Set(items.map((i) => i.business_slug)).size;

  const lines = items
    .slice(0, 10)
    .map(
      (i) =>
        `${i.rank}. @${i.creator_handle} (${i.business_name}, ${i.neighborhood}), ${i.likes.toLocaleString()} likes${i.plays ? `, ${i.plays.toLocaleString()} plays` : ""}. Caption: "${i.caption.slice(0, 140)}"`,
    )
    .join("\n");

  const prompt = `You're writing the editorial intro for a Signal Pittsburgh article: the top Instagram posts BY Pittsburgh small businesses this quarter (Spring 2026).

VOICE: smart food/business journalist, specific, confident, no marketing cliches. Write like New York Magazine's food coverage. NEVER use em dashes (the long dash, U+2014). Use commas, periods, colons, or semicolons. We will reject any output containing em dashes.

EDITORIAL ANGLE: This is the counterpart to our "Best Creator Posts ABOUT Pittsburgh Businesses" list. The thesis we keep tracking is that creators are filming the city while most businesses stay silent. THIS list is who showed up. The businesses that posted, and what worked when they did.

DATA POINTS (use these EXACT numbers in your prose):
- ${items.length} posts ranked by likes
- Total likes across the list: ${totalLikes.toLocaleString()}
- Total plays (where applicable): ${totalPlays.toLocaleString()}
- ${businesses} businesses represented (capped at 2 posts per business so the list reads as a survey, not a deep dive into one operator)

TOP 10:
${lines}

Write 2 to 3 short paragraphs (about 140 to 200 words total) that frame the list. Tease 2 to 3 specific posts/businesses by name with what made the post resonate (a specific menu item, a specific moment). Note the contrast with the ABOUT list, these are the businesses doing the work themselves. End with one forward-looking sentence about Issue 02.

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
    console.error("[generate-by-posts] ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  if (!existsSync(RAW_DIR)) {
    console.error(
      `[generate-by-posts] raw dir ${RAW_DIR} doesn't exist. Run scrape:own-posts first.`,
    );
    process.exit(1);
  }

  const all = loadAllRichBusinesses({ fresh: true });
  const bySlug = new Map(all.map((rb) => [rb.artifact.business.slug, rb]));

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  type Candidate = {
    likes: number;
    plays: number;
    comments: number;
    posted: string;
    caption: string;
    creator: string;
    url: string;
    shortcode: string;
    type: string;
    displayUrl: string;
    business: (typeof all)[number];
  };
  const candidates: Candidate[] = [];

  const rawFiles = (await readdir(RAW_DIR)).filter((f) => f.endsWith(".json"));
  for (const f of rawFiles) {
    const slug = f.replace(/\.json$/, "");
    const rb = bySlug.get(slug);
    if (!rb) continue;

    const raw = JSON.parse(
      await readFile(join(RAW_DIR, f), "utf-8"),
    ) as {
      handle: string;
      items: Array<{
        shortCode?: string;
        url?: string;
        caption?: string;
        likesCount?: number;
        commentsCount?: number;
        videoPlayCount?: number;
        videoViewCount?: number;
        timestamp?: string;
        type?: string;
        displayUrl?: string;
        ownerUsername?: string;
        error?: string;
      }>;
    };

    for (const p of raw.items) {
      if (p.error) continue;
      if (!p.shortCode || !p.timestamp) continue;
      const posted = Date.parse(p.timestamp);
      if (Number.isNaN(posted) || posted < cutoff) continue;
      const likes = p.likesCount ?? 0;
      if (likes <= 0) continue;

      // Apify's instagram-scraper sometimes returns collab/tagged posts
      // alongside the profile's own posts. Filter to ensure the post is
      // actually BY this business (ownerUsername must match the handle
      // we scraped). Otherwise we'd attribute Roaming Bean's collab
      // post to Page's just because it tagged Page's.
      const owner = (p.ownerUsername ?? "").toLowerCase();
      if (owner && owner !== raw.handle.toLowerCase()) continue;
      candidates.push({
        likes,
        plays: p.videoPlayCount ?? p.videoViewCount ?? 0,
        comments: p.commentsCount ?? 0,
        posted: p.timestamp,
        caption: scrubEmDashes((p.caption ?? "").slice(0, 240)),
        creator: p.ownerUsername ?? raw.handle,
        url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
        shortcode: p.shortCode,
        type: p.type ?? "Image",
        displayUrl: p.displayUrl ?? "",
        business: rb,
      });
    }
  }

  console.log(`[generate-by-posts] ${candidates.length} candidate IG posts pooled (90-day window)`);

  // Cap per business so a national chain's corporate account
  // (e.g. @jenisicecreams) doesn't fill 30 slots with non-Pittsburgh
  // content. Editorial story wants diversity across local businesses.
  // Anna's call: 2 max per business so the list reads as a survey of
  // who's doing the work, not a deep dive into one or two operators.
  const PER_BUSINESS_CAP = 2;
  candidates.sort((a, b) => b.likes - a.likes);
  const perBizCount = new Map<string, number>();
  const capped: typeof candidates = [];
  for (const c of candidates) {
    const slug = c.business.artifact.business.slug;
    const cnt = perBizCount.get(slug) ?? 0;
    if (cnt >= PER_BUSINESS_CAP) continue;
    perBizCount.set(slug, cnt + 1);
    capped.push(c);
  }
  console.log(
    `[generate-by-posts] ${capped.length} after cap (max ${PER_BUSINESS_CAP} per business)`,
  );
  const top = capped.slice(0, TOP_N);

  const items: PostItem[] = top.map((c, i) => ({
    rank: i + 1,
    kind: "post",
    platform: "instagram",
    video_url: c.url,
    video_id: c.shortcode,
    thumbnail_url: c.displayUrl || null,
    plays: c.plays,
    likes: c.likes,
    comments: c.comments,
    posted: c.posted,
    caption: c.caption,
    creator_handle: c.creator,
    business_slug: c.business.artifact.business.slug,
    business_name: c.business.artifact.business.name,
    family_label: familyForCategory(c.business.artifact.meta.categoryName).label,
    neighborhood: c.business.artifact.business.neighborhood,
    ig_type: c.type,
  }));

  if (dryRun) {
    console.log(`[generate-by-posts] dry-run, top ${Math.min(15, items.length)}:`);
    for (const i of items.slice(0, 15)) {
      console.log(
        `  ${i.rank}. @${i.creator_handle} (${i.business_name}) | ${i.likes.toLocaleString()} likes${i.plays ? `, ${i.plays.toLocaleString()} plays` : ""} | ${i.ig_type}`,
      );
      console.log(`     "${i.caption.slice(0, 110)}"`);
    }
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const intro = await generateIntro(client, items);

  const article: Article = {
    slug: SLUG,
    kind: "posts",
    title: "The Best Posts By Pittsburgh Businesses",
    subtitle:
      "Instagram posts the businesses themselves made this quarter, ranked by likes. Two per business max. The counterpart to the creator-coverage list.",
    angle:
      "the businesses that showed up on their own feed this quarter. What they posted, what worked.",
    intro,
    items,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };

  const out = join(OUT_DIR, `${SLUG}.json`);
  await writeFile(out, JSON.stringify(article, null, 2) + "\n", "utf-8");
  console.log(`[generate-by-posts] wrote ${out} (${items.length} items)`);
}

main().catch((err) => {
  console.error("[generate-by-posts] fatal:", err);
  process.exit(1);
});
