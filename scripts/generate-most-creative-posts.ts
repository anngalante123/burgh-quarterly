/**
 * generate-most-creative-posts.ts, "The Most Creative Posts From
 * Pittsburgh Small Businesses" article.
 *
 * Replaces the engagement-only "best-by-posts" with a Claude-judged
 * creativity ranking. For each candidate IG post we send Claude:
 *   - the post image (via Apify-served displayUrl, fresh-stamped)
 *   - the caption + hashtags
 *   - the post type and engagement numbers
 * Claude scores 1-10 across four dimensions, returns a JSON. We
 * aggregate, sort, take top N, and write the article.
 *
 * Smart filtering for scale: we engagement-rate-pre-filter to the top
 * 20% of candidates BEFORE running vision. The bottom 80% rarely
 * carry the creative outliers, so the vision pass only operates on a
 * meaningful pool. At 30 businesses this is ~75 vision calls (~$0.75).
 * At 5000 businesses with the same ratio it's ~12500 calls (~$125).
 *
 * Usage:
 *   npm run generate:creative           # write article
 *   npm run generate:creative -- --dry  # preview, no Claude calls
 */

import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { brandKey, loadAllRichBusinesses } from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";
import { downloadThumbnail } from "@/lib/scrape/download-thumbnail";
import { loadOwnPostsPool } from "@/lib/lists/own-posts-pool";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

/** Haiku for the per-post vision/score pass: 5x cheaper than Sonnet,
 *  vision capable, plenty good for "score 1-10 across 4 dimensions." */
const VISION_MODEL = "claude-haiku-4-5-20251001";
/** Sonnet for the editorial intro: one call, voice quality matters. */
const INTRO_MODEL = "claude-sonnet-4-6";
const OUT_DIR = join(process.cwd(), "content/lists/articles");
const SLUG = "most-creative-posts";
const TOP_N = 10;
const PER_BUSINESS_CAP = 2;
/** Engagement-rate pre-filter: only vision-pass the top X% of candidates.
 *  At 30 businesses this is ~75 vision calls; at 5000 with the same ratio
 *  it's ~12500 calls. Tuned to keep vision cost under ~$0.30 today and
 *  ~$50/qtr at full Pittsburgh scale (with Haiku). */
const PREFILTER_PERCENTILE = 0.20;

type Candidate = {
  shortcode: string;
  url: string;
  caption: string;
  igType: string;
  posted: string;
  likes: number;
  comments: number;
  plays: number;
  displayUrl: string;
  followers: number;
  engagementRate: number;
  business: Awaited<ReturnType<typeof loadAllRichBusinesses>>[number];
};

type CreativityScore = {
  visual_concept: number;
  caption_craft: number;
  format_fit: number;
  surprise: number;
  why: string;
};

type CreativeItem = {
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
  /** Composite creativity score (avg of the 4 dimensions, 0-10). */
  creativity_score: number;
  /** Per-dimension breakdown. */
  scores: CreativityScore;
  /** One-line editorial commentary on why it scored. */
  why: string;
};

type Article = {
  slug: string;
  kind: "posts";
  title: string;
  subtitle?: string;
  angle: string;
  intro: string;
  items: CreativeItem[];
  /** Editorial label for the list-header meta on the article page. */
  rank_label?: string;
  generated_at: string;
  model: string;
};

function scrubEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
}

/** Fetch the IG image and return base64 + media type. Required because
 *  Anthropic's URL-based image input respects robots.txt, and Instagram's
 *  CDN explicitly disallows third-party fetchers. We pull the bytes
 *  ourselves and pass as base64. */
async function fetchImageBase64(
  url: string,
): Promise<{ data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        // IG's CDN serves the image to a real-browser-looking UA
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    let mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";
    if (ct.includes("png")) mediaType = "image/png";
    else if (ct.includes("webp")) mediaType = "image/webp";
    else if (ct.includes("gif")) mediaType = "image/gif";
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mediaType };
  } catch {
    return null;
  }
}

async function judgeCreativity(
  client: Anthropic,
  c: Candidate,
): Promise<CreativityScore | null> {
  const prompt = `You're judging a single Instagram post by a Pittsburgh small business for editorial publication. Score 1-10 across four dimensions, then write a one-sentence reason it scored.

POST METADATA:
- Business: ${c.business.artifact.business.name} (${c.business.artifact.business.neighborhood})
- Post type: ${c.igType}
- Posted: ${c.posted.slice(0, 10)}
- Caption: "${c.caption.slice(0, 600)}"
- Likes: ${c.likes.toLocaleString()}, Comments: ${c.comments.toLocaleString()}${c.plays > 0 ? `, Plays: ${c.plays.toLocaleString()}` : ""}
- Followers: ${c.followers.toLocaleString()}
- Engagement rate: ${(c.engagementRate * 100).toFixed(2)}%

JUDGE ON:
1. visual_concept (1-10): how original or arresting is the IMAGE itself? Composition, framing, the IDEA in the visual. 1 = generic stock-feel, 10 = stops the scroll.
2. caption_craft (1-10): does the caption sound like a person, not a marketing template? Specific, witty, voiced, surprising? 1 = "now open!", 10 = a line you'd quote.
3. format_fit (1-10): does the format (image / sidecar / video / reel) serve the idea, or is it generic? 1 = mismatched, 10 = the format IS the joke.
4. surprise (1-10): would a stranger scrolling stop and lean in? 1 = forgettable, 10 = saved/sent to a friend.

Then write 'why' as ONE short sentence (under 25 words) explaining what makes this post score the way it does. NO em dashes. Specific. Plain magazine voice, like a sharp editor talking: do NOT use marketing register words such as "content", "product story", "authenticity", "earned", "scroll-stopping", or "engagement".

Return ONLY valid JSON, this exact shape:
{"visual_concept": <int>, "caption_craft": <int>, "format_fit": <int>, "surprise": <int>, "why": "<one sentence>"}`;

  // Fetch the image bytes ourselves (URL-based source hits robots.txt block)
  const img = await fetchImageBase64(c.displayUrl);
  if (!img) {
    console.warn(`  ! image fetch failed for ${c.shortcode}`);
    return null;
  }

  try {
    const response = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: img.mediaType,
                data: img.data,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    let txt = block.text.trim();
    // Strip ```json fences if Claude added them
    txt = txt.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(txt) as CreativityScore;
    parsed.why = scrubEmDashes(parsed.why);
    return parsed;
  } catch (err) {
    console.warn(`  ! vision pass failed for ${c.shortcode}:`, (err as Error).message);
    return null;
  }
}

async function generateIntro(
  client: Anthropic,
  items: CreativeItem[],
): Promise<string> {
  const top = items
    .slice(0, 6)
    .map(
      (i) =>
        `${i.rank}. ${i.business_name}, ${i.creativity_score.toFixed(1)}/10. ${i.why}`,
    )
    .join("\n");
  const businesses = new Set(items.map((i) => i.business_slug)).size;
  const prompt = `You're writing the editorial intro for a Signal Pittsburgh article: the most creative Instagram posts from Pittsburgh small businesses this quarter, judged by Claude on visual concept + caption craft + format fit + surprise.

Voice: smart food/business journalist, specific, confident, no marketing cliches. Write like New York Magazine. NO em dashes (use commas, periods, colons).

DATA:
- ${items.length} posts ranked
- ${businesses} businesses represented (capped at 2 posts per business)

TOP 6:
${top}

Write ONE paragraph, 80-120 words, no more. Frame the editorial angle: this list rewards craft, not follower count. A 14K-follower bakery can beat a 500K-follower chain if the post is stronger. Tease 1-2 specific businesses by name with a concrete detail from their post.

Return ONLY the prose. No headers, no markdown, no quotes wrapping.`;

  const response = await client.messages.create({
    model: INTRO_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("no intro text");
  return scrubEmDashes(block.text.trim());
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry") || args.includes("--dry-run");

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("[creative] ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const all = await loadAllRichBusinesses({ fresh: true });
  const bySlug = new Map(all.map((rb) => [rb.artifact.business.slug, rb]));

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const candidates: Candidate[] = [];
  // One record per unique handle: excluded accounts dropped, shared-handle
  // slugs collapsed. The dedupe/exclusion policy lives in the pool module.
  const pool = await loadOwnPostsPool();

  for (const rec of pool) {
    const rb = bySlug.get(rec.slug);
    if (!rb) continue;
    const followers = rb.social.ig?.followers ?? 0;
    if (followers === 0) continue;

    for (const p of rec.items) {
      if (!p.shortCode || !p.timestamp || !p.displayUrl) continue;
      const posted = Date.parse(p.timestamp);
      if (Number.isNaN(posted) || posted < cutoff) continue;
      const owner = (p.ownerUsername ?? "").toLowerCase();
      if (owner && owner !== rec.handle) continue;
      const likes = p.likesCount ?? 0;
      const comments = p.commentsCount ?? 0;
      const plays = p.videoPlayCount ?? p.videoViewCount ?? 0;
      const totalEng = likes + comments + Math.floor(plays / 30);
      if (totalEng <= 0) continue;
      candidates.push({
        shortcode: p.shortCode,
        url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
        caption: scrubEmDashes((p.caption ?? "").slice(0, 600)),
        igType: p.type ?? "Image",
        posted: p.timestamp,
        likes,
        comments,
        plays,
        displayUrl: p.displayUrl,
        followers,
        engagementRate: totalEng / followers,
        business: rb,
      });
    }
  }

  console.log(`[creative] ${candidates.length} candidate posts pooled`);

  // Smart prefilter: top X% by engagement rate
  candidates.sort((a, b) => b.engagementRate - a.engagementRate);
  // Belt and suspenders: the pool loader already collapses shared handles,
  // but never let the same post (shortcode) rank twice no matter what.
  const seenShortcodes = new Set<string>();
  const ranked = candidates.filter((c) => {
    if (seenShortcodes.has(c.shortcode)) return false;
    seenShortcodes.add(c.shortcode);
    return true;
  });
  if (ranked.length < candidates.length) {
    console.log(
      `[creative] dropped ${candidates.length - ranked.length} duplicate shortcodes from ranking`,
    );
  }
  const prefilterCount = Math.max(50, Math.ceil(ranked.length * PREFILTER_PERCENTILE));
  const prefiltered = ranked.slice(0, prefilterCount);
  console.log(`[creative] prefiltered to top ${prefiltered.length} by engagement rate`);

  if (dryRun) {
    console.log(`[creative] dry-run, top 10:`);
    for (const c of prefiltered.slice(0, 10)) {
      console.log(
        `  @${c.business.artifact.business.slug} | rate=${(c.engagementRate * 100).toFixed(2)}% | likes=${c.likes}`,
      );
      console.log(`    "${c.caption.slice(0, 80)}"`);
    }
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Vision pass: sequential to be polite to the API; could parallelize 3-5 wide.
  console.log(`[creative] running vision pass on ${prefiltered.length} candidates...`);
  const scored: { c: Candidate; score: CreativityScore }[] = [];
  for (let i = 0; i < prefiltered.length; i++) {
    const c = prefiltered[i];
    process.stdout.write(`  ${i + 1}/${prefiltered.length} ${c.shortcode}... `);
    const score = await judgeCreativity(client, c);
    if (
      score &&
      Number.isFinite(score.visual_concept) &&
      Number.isFinite(score.caption_craft) &&
      Number.isFinite(score.format_fit) &&
      Number.isFinite(score.surprise)
    ) {
      scored.push({ c, score });
      const avg = (score.visual_concept + score.caption_craft + score.format_fit + score.surprise) / 4;
      console.log(`${avg.toFixed(1)}/10`);
    } else {
      console.log("skipped (malformed score)");
    }
  }

  // Sort by composite, cap per business, take top N
  const composite = (s: CreativityScore) =>
    (s.visual_concept + s.caption_craft + s.format_fit + s.surprise) / 4;
  scored.sort((a, b) => composite(b.score) - composite(a.score));

  // Cap per BRAND, not per slug. Keeps Eat'n Park / Primanti / etc.
  // from crowding the list with multiple locations of the same chain.
  // Also dedupe by shortcode before slicing the top N: the same post must
  // never appear twice in a published list.
  const perBrand = new Map<string, number>();
  const finalShortcodes = new Set<string>();
  const final: typeof scored = [];
  for (const entry of scored) {
    if (finalShortcodes.has(entry.c.shortcode)) continue;
    const key = brandKey(entry.c.business.artifact.business.name);
    const cnt = perBrand.get(key) ?? 0;
    if (cnt >= PER_BUSINESS_CAP) continue;
    perBrand.set(key, cnt + 1);
    finalShortcodes.add(entry.c.shortcode);
    final.push(entry);
    if (final.length >= TOP_N) break;
  }

  // Download thumbnails into /public/post-thumbs/<shortcode>.<ext> so the
  // site can serve them from our own domain. IG's CDN URLs are short-lived
  // and block cross-origin hot-linking, so this is the only reliable path.
  console.log(`[creative] downloading ${final.length} thumbnails...`);
  const thumbnails = await Promise.all(
    final.map((e) => downloadThumbnail(e.c.displayUrl, e.c.shortcode)),
  );
  const got = thumbnails.filter(Boolean).length;
  console.log(`[creative] saved ${got}/${final.length} thumbnails to /public/post-thumbs/`);

  const items: CreativeItem[] = final.map((e, i) => {
    const c = e.c;
    const fam = familyForCategory(c.business.artifact.meta.categoryName).label;
    const score = composite(e.score);
    return {
      rank: i + 1,
      kind: "post",
      platform: "instagram",
      video_url: c.url,
      video_id: c.shortcode,
      thumbnail_url: thumbnails[i],
      plays: c.plays,
      likes: c.likes,
      comments: c.comments,
      posted: c.posted,
      caption: c.caption.slice(0, 240),
      creator_handle: c.business.social.ig?.handle ?? c.business.artifact.business.slug,
      business_slug: c.business.artifact.business.slug,
      business_name: c.business.artifact.business.name,
      family_label: fam,
      neighborhood: c.business.artifact.business.neighborhood,
      ig_type: c.igType,
      creativity_score: score,
      scores: e.score,
      why: e.score.why,
    };
  });

  const intro = await generateIntro(client, items);

  const article: Article = {
    slug: SLUG,
    kind: "posts",
    title: "The Most Creative Posts From Pittsburgh Small Businesses",
    subtitle:
      "The Pittsburgh small-business posts that took the biggest creative swing this quarter. Ranked by originality, not reach.",
    angle:
      "the IG posts that took risks, made craft choices, or said something specific this quarter, ranked by editorial judgment instead of follower count.",
    intro,
    items,
    rank_label: "ranked by originality, not reach",
    generated_at: new Date().toISOString(),
    model: `${VISION_MODEL} (vision) + ${INTRO_MODEL} (intro)`,
  };

  const out = join(OUT_DIR, `${SLUG}.json`);
  await writeFile(out, JSON.stringify(article, null, 2) + "\n", "utf-8");
  console.log(`\n[creative] wrote ${out} (${items.length} items)`);
}

main().catch((err) => {
  console.error("[creative] fatal:", err);
  process.exit(1);
});
