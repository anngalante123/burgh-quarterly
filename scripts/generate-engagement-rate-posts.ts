/**
 * generate-engagement-rate-posts.ts, "Highest Engagement Rate Posts
 * From Pittsburgh Small Businesses" article.
 *
 * Sister to most-creative-posts. Same candidate pool, different sort.
 * Ranks by likes + comments + plays/30 (a unified engagement signal),
 * NORMALIZED by follower count. So a 14K-follower bakery with strong
 * engagement can beat a 522K-follower national chain with bigger
 * absolute numbers but lower rate.
 *
 * No LLM calls aside from a single Claude intro. Effectively free.
 *
 * Usage:
 *   npm run generate:engagement
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { brandKey, loadAllRichBusinesses } from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";
import { downloadThumbnail } from "@/lib/scrape/download-thumbnail";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const MODEL = "claude-sonnet-4-6";
const RAW_DIR = join(process.cwd(), "content/raw/own-posts");
const OUT_DIR = join(process.cwd(), "content/lists/articles");
const SLUG = "loudest-feeds";
const TOP_N = 30;
const PER_BUSINESS_CAP = 2;

type RawPost = {
  shortCode?: string;
  url?: string;
  caption?: string;
  type?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  displayUrl?: string;
  ownerUsername?: string;
};

type Item = {
  rank: number;
  kind: "post";
  platform: "instagram";
  video_url: string;
  video_id: string | null;
  thumbnail_url: string | null;
  plays: number;
  likes: number;
  comments: number;
  posted: string;
  caption: string;
  creator_handle: string;
  business_slug: string;
  business_name: string;
  family_label: string;
  neighborhood: string;
  ig_type: string;
  /** likes + comments + plays/30, divided by follower count. 0.05 = 5%. */
  engagement_rate: number;
  /** Total engagement signal (likes + comments + plays/30). */
  total_engagement: number;
  /** Follower count at scrape time. */
  followers: number;
};

type Article = {
  slug: string;
  kind: "posts";
  title: string;
  subtitle?: string;
  angle: string;
  intro: string;
  items: Item[];
  generated_at: string;
  model: string;
};

function scrubEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
}

async function generateIntro(client: Anthropic, items: Item[]): Promise<string> {
  const top = items
    .slice(0, 6)
    .map(
      (i) =>
        `${i.rank}. ${i.business_name} (${i.followers.toLocaleString()} followers), ${(i.engagement_rate * 100).toFixed(2)}% rate. Caption: "${i.caption.slice(0, 100)}"`,
    )
    .join("\n");
  const businesses = new Set(items.map((i) => i.business_slug)).size;

  const prompt = `You're writing the editorial intro for a Signal Pittsburgh article: the Pittsburgh small business IG posts with the highest engagement RATE this quarter, not absolute likes.

Voice: smart food/business journalist, specific, confident, no marketing cliches. Write like New York Magazine. NO em dashes (use commas, periods, colons).

EDITORIAL ANGLE: This list rewards efficiency, not size. We took every IG post from the Pittsburgh businesses we cover, computed engagement (likes + comments + plays/30) as a percentage of the posting account's follower base, and ranked by that. A 14K-follower bakery with 1,500 likes (10.7%) beats a 500K-follower chain with 5,000 likes (1%). It's the punching-above-weight list.

DATA:
- ${items.length} posts ranked
- ${businesses} businesses represented (capped at 2 posts per business)

TOP 6:
${top}

Write 2-3 short paragraphs (~140-200 words). Frame the angle (small businesses can win this list against national chains). Tease 2-3 specific posts by business name and their engagement rate. End with a forward-looking sentence about Issue 02.

Return ONLY the prose. No headers, no markdown, no quotes wrapping.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("no intro");
  return scrubEmDashes(block.text.trim());
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry") || args.includes("--dry-run");

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("[engagement] ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const all = await loadAllRichBusinesses({ fresh: true });
  const bySlug = new Map(all.map((rb) => [rb.artifact.business.slug, rb]));

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

  type Candidate = {
    item: Omit<Item, "rank">;
    rate: number;
    /** Held aside so we can fetch the thumbnail later for the top N only. */
    displayUrl: string;
    shortcode: string;
  };
  const candidates: Candidate[] = [];

  const rawFiles = (await readdir(RAW_DIR)).filter((f) => f.endsWith(".json"));
  for (const f of rawFiles) {
    const slug = f.replace(/\.json$/, "");
    const rb = bySlug.get(slug);
    if (!rb) continue;
    const followers = rb.social.ig?.followers ?? 0;
    if (followers === 0) continue;

    const raw = JSON.parse(await readFile(join(RAW_DIR, f), "utf-8")) as {
      handle: string;
      items: RawPost[];
    };
    for (const p of raw.items) {
      if (!p.shortCode || !p.timestamp) continue;
      const posted = Date.parse(p.timestamp);
      if (Number.isNaN(posted) || posted < cutoff) continue;
      const owner = (p.ownerUsername ?? "").toLowerCase();
      if (owner && owner !== raw.handle.toLowerCase()) continue;
      const likes = p.likesCount ?? 0;
      const comments = p.commentsCount ?? 0;
      const plays = p.videoPlayCount ?? p.videoViewCount ?? 0;
      const total = likes + comments + Math.floor(plays / 30);
      if (total <= 0) continue;
      const rate = total / followers;
      const fam = familyForCategory(rb.artifact.meta.categoryName).label;
      candidates.push({
        rate,
        displayUrl: p.displayUrl ?? "",
        shortcode: p.shortCode,
        item: {
          kind: "post",
          platform: "instagram",
          video_url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
          video_id: p.shortCode,
          thumbnail_url: null,
          plays,
          likes,
          comments,
          posted: p.timestamp,
          caption: scrubEmDashes((p.caption ?? "").slice(0, 240)),
          creator_handle: rb.social.ig?.handle ?? slug,
          business_slug: slug,
          business_name: rb.artifact.business.name,
          family_label: fam,
          neighborhood: rb.artifact.business.neighborhood,
          ig_type: p.type ?? "Image",
          engagement_rate: rate,
          total_engagement: total,
          followers,
        },
      });
    }
  }

  console.log(`[engagement] ${candidates.length} candidates pooled`);

  candidates.sort((a, b) => b.rate - a.rate);

  // Cap per BRAND, not per slug. Chains like Eat'n Park have 14
  // locations in the index and any per-slug cap would let the same
  // brand crowd the list across its multiple records.
  const perBrand = new Map<string, number>();
  const final: Candidate[] = [];
  for (const c of candidates) {
    const key = brandKey(c.item.business_name);
    const cnt = perBrand.get(key) ?? 0;
    if (cnt >= PER_BUSINESS_CAP) continue;
    perBrand.set(key, cnt + 1);
    final.push(c);
    if (final.length >= TOP_N) break;
  }

  // Download thumbnails for the top N only, mirrors the creative
  // generator. Files land in /public/post-thumbs/<shortcode>.<ext>.
  console.log(`[engagement] downloading ${final.length} thumbnails...`);
  const thumbnails = await Promise.all(
    final.map((c) =>
      c.displayUrl
        ? downloadThumbnail(c.displayUrl, c.shortcode)
        : Promise.resolve(null),
    ),
  );
  const got = thumbnails.filter(Boolean).length;
  console.log(`[engagement] saved ${got}/${final.length} thumbnails`);

  const items: Item[] = final.map((c, i) => ({
    rank: i + 1,
    ...c.item,
    thumbnail_url: thumbnails[i],
  }));

  if (dryRun) {
    console.log("[engagement] dry-run, top 10:");
    for (const i of items.slice(0, 10)) {
      console.log(
        `  ${i.rank}. ${i.business_name} | ${(i.engagement_rate * 100).toFixed(2)}% | ${i.likes} likes / ${i.followers.toLocaleString()} followers`,
      );
    }
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const intro = await generateIntro(client, items);

  const article: Article = {
    slug: SLUG,
    kind: "posts",
    title: "The Highest Engagement Rate Posts From Pittsburgh Small Businesses",
    subtitle:
      "Ranked by engagement as a percentage of follower count, not absolute likes. The punching-above-weight list.",
    angle:
      "Pittsburgh's IG posts with the strongest reach relative to their account size. Small businesses can beat national chains here.",
    intro,
    items,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };

  const out = join(OUT_DIR, `${SLUG}.json`);
  await writeFile(out, JSON.stringify(article, null, 2) + "\n", "utf-8");
  console.log(`[engagement] wrote ${out} (${items.length} items)`);
}

main().catch((err) => {
  console.error("[engagement] fatal:", err);
  process.exit(1);
});
