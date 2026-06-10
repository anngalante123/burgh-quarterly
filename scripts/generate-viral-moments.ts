/**
 * generate-viral-moments.ts, "Pittsburgh's Most Unexpectedly Viral
 * Moments" article.
 *
 * The accident beats the campaign: moments when a local business's
 * reach blew up RELATIVE TO THAT BUSINESS'S OWN BASELINE, not by raw
 * reach. A 40-like coffee shop hitting 2,000 likes is a bigger story
 * than a 30K-like chain hitting 60K.
 *
 * TWO QUALIFICATION ROUTES, one shared ratio scale:
 *
 * 1. OWN-POST MOMENTS. A business's own Instagram post that massively
 *    outperformed that account's own median engagement.
 * 2. MENTION MOMENTS. Someone ELSE'S TikTok that features the business
 *    (content/social/<slug>.json, tiktok_mentions.top_videos). The
 *    business didn't post it; the sandwich just appeared in the
 *    background of someone's reel. Measured against the SAME own-post
 *    baseline so both routes rank on one scale.
 *
 * ENGAGEMENT FORMULA (per post or video):
 *   engagement = likes + comments + floor(plays / 30)
 * Same weighting the most-creative generator uses: a video play is a
 * far weaker signal than a like, so 30 plays ~ 1 like. For own posts,
 * plays come from videoPlayCount (falling back to videoViewCount) and
 * are 0 for images. tiktok_mentions top_videos carry no comments
 * field; missing comments count as 0.
 *
 * OUTLIER DETECTION (per business):
 *   baseline = MEDIAN engagement across all of the business's own
 *   posts in its raw file (median, not mean, so the viral post itself
 *   can't drag its own baseline up). Both routes require a valid
 *   baseline: >= MIN_HISTORY (8) own posts AND median >= 1.
 *
 *   An OWN POST qualifies when additionally:
 *     1. post engagement >= RATIO_THRESHOLD (5x) * baseline, and
 *     2. it clears an absolute floor: >= 300 likes OR >= 10,000 plays
 *        (so a 2-like account doesn't "go viral" at 10 likes).
 *   A MENTION VIDEO qualifies when additionally:
 *     1. plays >= MENTION_MIN_PLAYS (25,000), and
 *     2. the author is NOT the business itself (case-insensitive match
 *        against detected_own_handle, plus the business's own handle).
 *   Both routes share the RECENCY_DAYS window.
 *
 *   Qualifying moments are merged and ranked by RATIO to the
 *   business's own baseline (unexpectedness), NOT raw reach. One
 *   moment per business (its single most unexpected, whichever type).
 *   Top 10 make the article.
 *
 * MENTION RELEVANCE GATE:
 *   The mention scraper matches business NAME STRINGS, so name
 *   collisions slip through (a video about the astronomical blue moon
 *   qualifies for the bar "Blue Moon"). Publishing one would put a
 *   fabricated claim on a public page ("a creator filmed this bar"
 *   when nobody did). So every qualifying mention candidate passes a
 *   cheap text-only model gate (one batched call) before the merged
 *   ranking, at BOTH dry-run and execute time. Rejected mentions are
 *   logged and dropped, so an own-post moment from the same business
 *   can still win. Unjudged mentions are never published.
 *
 * Usage:
 *   npx tsx scripts/generate-viral-moments.ts --dry-run              # preview, no writes (default); makes ONE cheap API call for the mention relevance gate
 *   npx tsx scripts/generate-viral-moments.ts --dry-run --no-judge   # zero-cost preview: gate skipped, mentions tagged "[mention, unjudged]"
 *   npx tsx scripts/generate-viral-moments.ts --execute              # gate + Claude intro + write article JSON
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { loadAllRichBusinesses } from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";
import { downloadThumbnail } from "@/lib/scrape/download-thumbnail";
import { loadOwnPostsPool, type RawOwnPost } from "@/lib/lists/own-posts-pool";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

/** Sonnet for the editorial intro: one call, voice quality matters. */
const INTRO_MODEL = "claude-sonnet-4-6";
/** Cheap utility tier (same model the most-creative vision pass uses)
 *  for the mention relevance gate. Text-only call here. */
const JUDGE_MODEL = "claude-haiku-4-5-20251001";
const OUT_DIR = join(process.cwd(), "content/lists/articles");
const SOCIAL_DIR = join(process.cwd(), "content/social");
const SLUG = "unexpectedly-viral-moments";
const TOP_N = 10;
/** Minimum own-post history for a meaningful baseline. */
const MIN_HISTORY = 8;
/** Own post must run at least this multiple of the business's own median. */
const RATIO_THRESHOLD = 5;
/** Absolute floors so tiny accounts can't qualify on noise (own posts). */
const MIN_LIKES_FLOOR = 300;
const MIN_PLAYS_FLOOR = 10_000;
/** A creator's mention video must clear this many plays to qualify. */
const MENTION_MIN_PLAYS = 25_000;
/** Qualifying posts must be recent (baseline uses all history). Mirrors
 *  the 90-day quarter window the most-creative generator uses. */
const RECENCY_DAYS = 90;

type RichBusiness = Awaited<ReturnType<typeof loadAllRichBusinesses>>[number];

type MomentType = "own" | "mention";

type ViralCandidate = {
  momentType: MomentType;
  /** IG shortcode for own posts, TikTok video id for mention moments.
   *  Used as the dedupe key and the thumbnail filename. */
  shortcode: string;
  url: string;
  caption: string;
  /** Own posts only: "Image" | "Sidecar" | "Video". */
  igType?: string;
  posted: string;
  likes: number;
  comments: number;
  plays: number;
  /** Own posts only: IG CDN displayUrl for thumbnail self-hosting. */
  displayUrl?: string;
  /** Mention moments only: the TikTok creator who posted the video
   *  (NOT the business). */
  authorHandle?: string;
  /** Mention moments only: true when the relevance gate was skipped
   *  (--no-judge, or no API key in dry-run). Unjudged mentions show as
   *  "[mention, unjudged]" in dry-run output and are never published. */
  unjudged?: boolean;
  engagement: number;
  /** The business's own median engagement per post. */
  baseline: number;
  /** engagement / baseline, the ranking key. */
  ratio: number;
  historyCount: number;
  business: RichBusiness;
};

/** Mirrors PostArticleItem in lib/data/load-list.ts. Shape matched to
 *  the most-creative-posts items (instagram) and the best-creator-
 *  posts-about items (tiktok) so the /best-on-social/[slug] page
 *  renders this article with zero code changes. TikTok items omit
 *  `comments` and `ig_type`, exactly like the creator-posts list. */
type ViralItem = {
  rank: number;
  kind: "post";
  platform: "instagram" | "tiktok";
  /** "own" = the business's own post blew up; "mention" = someone
   *  else's TikTok featuring the business blew up. Audit field, the
   *  page ignores it. */
  moment_type: MomentType;
  video_url: string;
  video_id: string | null;
  thumbnail_url: string | null;
  plays: number;
  likes: number;
  /** Own (instagram) items only; tiktok mention videos carry none. */
  comments?: number;
  posted: string;
  caption: string;
  /** Business IG handle for own moments, the TikTok CREATOR for
   *  mention moments. */
  creator_handle: string;
  business_slug: string;
  business_name: string;
  family_label: string;
  neighborhood: string;
  /** Own (instagram) items only. */
  ig_type?: string;
  followers: number;
  /** Median engagement per post for this business (the baseline). */
  baseline_median: number;
  /** engagement / baseline, the unexpectedness multiple we rank by. */
  baseline_ratio: number;
  /** NOTE: repurposed render gate, NOT a creativity score. The page's
   *  PostItemCard only shows the italic `why` pull-quote when a finite
   *  `creativity_score` exists, and it never prints the number itself
   *  ("Numeric creativity scores are intentionally not surfaced"). We
   *  set it to baseline_ratio so the data-derived blurb renders without
   *  touching page code. Remove if the page ever surfaces this number. */
  creativity_score: number;
  /** Data-derived blurb: engagement vs the account's own baseline plus
   *  the post date. Built from a template, never invented. */
  why: string;
};

type Article = {
  slug: string;
  kind: "posts";
  title: string;
  subtitle?: string;
  angle: string;
  intro: string;
  items: ViralItem[];
  /** Editorial label for the list-header meta on the article page. */
  rank_label?: string;
  generated_at: string;
  model: string;
};

/** One creator video from a tiktok_mentions block, as the mention
 *  scraper writes it. No comments field exists on these. */
type MentionVideo = {
  id?: string;
  url?: string;
  text?: string;
  author?: string;
  plays?: number;
  likes?: number;
  comments?: number;
  posted?: string;
};

type TikTokMentions = {
  video_count?: number;
  total_plays?: number;
  unique_creators?: number;
  top_videos?: MentionVideo[];
  detected_own_handle?: string | null;
  median_plays?: number;
  scraped_at?: string;
};

type SocialFile = {
  tiktok_mentions?: TikTokMentions;
};

function scrubEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function postEngagement(p: RawOwnPost): number {
  const likes = p.likesCount ?? 0;
  const comments = p.commentsCount ?? 0;
  const plays = p.videoPlayCount ?? p.videoViewCount ?? 0;
  return likes + comments + Math.floor(plays / 30);
}

function fmtRatio(ratio: number): string {
  return ratio >= 10 ? String(Math.round(ratio)) : ratio.toFixed(1);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Load content/social/<slug>.json and return its tiktok_mentions block,
 * or null when the file is absent, has no block, or fails to parse.
 * The mention scrape runs concurrently with this generator, so a file
 * can be mid-write; a parse failure skips that business's mention route
 * with a log line instead of crashing the run.
 */
async function loadTikTokMentions(slug: string): Promise<TikTokMentions | null> {
  const file = join(SOCIAL_DIR, `${slug}.json`);
  let raw: string;
  try {
    raw = await readFile(file, "utf-8");
  } catch {
    return null; // no social file yet, fine
  }
  try {
    const parsed = JSON.parse(raw) as SocialFile;
    return parsed.tiktok_mentions ?? null;
  } catch {
    console.log(`[viral] ${slug}: social file unparseable (likely mid-write by the running scrape), skipping mentions for this business`);
    return null;
  }
}

/** Extract a TikTok video ID from a URL like
 *  https://www.tiktok.com/@user/video/123..., null if no match. */
function extractTikTokVideoId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Fetch TikTok's oEmbed metadata for a video and return its stable
 * thumbnail URL, null on any failure. Same approach (and endpoint) as
 * generate-creator-posts.ts, so mention items carry the same thumbnail
 * field the best-creator-posts-about tiktok items do. Execute-only:
 * dry runs never call this.
 */
async function fetchTikTokThumbnail(videoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`,
      { headers: { "user-agent": "Signal-Pittsburgh/1.0" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { thumbnail_url?: string };
    return data.thumbnail_url ?? null;
  } catch {
    return null;
  }
}

/** Blurb from observable data only: counts, ratio to own baseline, date.
 *  No invented backstory, no em dashes, no composite scores. The
 *  mention variant makes the accident explicit: the business did not
 *  post the video. */
function buildWhy(c: ViralCandidate): string {
  const ratio = fmtRatio(c.ratio);
  const date = fmtDate(c.posted);
  if (c.momentType === "mention") {
    return `${c.plays.toLocaleString()} plays on @${c.authorHandle}'s video, roughly ${ratio}x what this account's own posts typically draw. They didn't post it. Posted ${date}.`;
  }
  if (c.plays > 0) {
    return `${c.plays.toLocaleString()} plays and ${c.likes.toLocaleString()} likes, roughly ${ratio}x what this account's typical post draws. Posted ${date}.`;
  }
  return `${c.likes.toLocaleString()} likes and ${c.comments.toLocaleString()} comments, roughly ${ratio}x this account's typical post. Posted ${date}.`;
}

/** One verdict per mention candidate, by array index (id). */
type MentionJudgement = {
  id: number;
  about_business: boolean;
  reason: string;
};

/** Dry-run list label: own posts are "own", mentions are "mention" or
 *  "mention, unjudged" when the relevance gate was skipped. */
function momentLabel(c: ViralCandidate): string {
  if (c.momentType !== "mention") return "own";
  return c.unjudged ? "mention, unjudged" : "mention";
}

/**
 * Parse and validate the judge's JSON array. Returns null on ANY
 * deviation from the contract: not an array, wrong length, missing or
 * mistyped fields, or ids that are not exactly 0..expected-1. A null
 * here means "malformed", which the caller treats as retry-then-reject.
 */
function parseJudgements(
  raw: string,
  expected: number,
): MentionJudgement[] | null {
  const txt = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(txt);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== expected) return null;
  const out: MentionJudgement[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.id !== "number" ||
      typeof rec.about_business !== "boolean" ||
      typeof rec.reason !== "string"
    ) {
      return null;
    }
    out.push({
      id: rec.id,
      about_business: rec.about_business,
      reason: rec.reason,
    });
  }
  const ids = new Set(out.map((j) => j.id));
  for (let i = 0; i < expected; i++) {
    if (!ids.has(i)) return null;
  }
  return out;
}

/**
 * Relevance gate for MENTION moments only. The upstream scrape filter
 * matches name strings and cannot tell the bar "Blue Moon" from the
 * astronomical blue moon over the PPG building. One batched call judges
 * ALL qualifying mention videos at once (typically < 15). Precision
 * over recall: this gates a public editorial claim, so uncertain means
 * false. On a malformed response: retry once, then return null, which
 * the caller treats as reject-everything. Unjudged mentions are never
 * published.
 */
async function judgeMentionRelevance(
  client: Anthropic,
  mentions: ViralCandidate[],
): Promise<MentionJudgement[] | null> {
  const payload = mentions.map((c, i) => ({
    id: i,
    business_name: c.business.artifact.business.name,
    google_category: c.business.artifact.meta.categoryName ?? "unknown",
    neighborhood: c.business.artifact.business.neighborhood,
    author_handle: c.authorHandle ?? "",
    video_caption: c.caption,
  }));

  const prompt = `You are a relevance gate for an editorial publication that covers Pittsburgh small businesses. Each item below is a TikTok video that was matched to a local business BY NAME STRING ONLY. Name matching produces false positives: videos about the weather, astronomy, songs, movies, other cities' businesses, or generic phrases that merely contain the business's name.

For EACH item, decide: is this video plausibly ABOUT this specific business? "About" means filmed there, features its product or food, reviews it, or otherwise covers the business itself. Use the business name, its Google category, its neighborhood, the video caption, and the author handle.

RULES:
- Name coincidences (weather, astronomy, songs, other cities' businesses, generic phrases) are NOT about the business.
- The published claim is "an independent creator filmed this; the business did not post it." So a video posted by the business ITSELF, its parent brand, its venue or property account, or any account that reads as the business's own marketing (e.g. a hotel complex touring its own restaurant) must be answered false, even though it is about the business.
- This gates a public editorial claim that a creator filmed the business. Precision over recall: when uncertain, answer false.

ITEMS (JSON array):
${JSON.stringify(payload, null, 2)}

Return ONLY a JSON array, no markdown fences, no commentary. One object per item, every input id present exactly once, this exact shape:
[{"id": <number>, "about_business": <boolean>, "reason": "<one line>"}]`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: JUDGE_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content.find((b) => b.type === "text");
      if (block && block.type === "text") {
        const judgements = parseJudgements(block.text, mentions.length);
        if (judgements) return judgements;
      }
      console.warn(`[viral] judge response malformed (attempt ${attempt}/2)`);
    } catch (err) {
      console.warn(
        `[viral] judge call failed (attempt ${attempt}/2): ${(err as Error).message}`,
      );
    }
  }
  return null;
}

async function generateIntro(
  client: Anthropic,
  items: ViralItem[],
): Promise<string> {
  const top = items
    .slice(0, 6)
    .map((i) => {
      if (i.moment_type === "mention") {
        return (
          `${i.rank}. ${i.business_name} (${i.neighborhood}) [CREATOR-FILMED]: ${fmtRatio(i.baseline_ratio)}x its own typical post. ` +
          `${i.plays.toLocaleString()} plays and ${i.likes.toLocaleString()} likes on @${i.creator_handle}'s TikTok featuring the business. The business did not post this video. ` +
          `Posted ${fmtDate(i.posted)}. Caption: "${i.caption.slice(0, 160)}"`
        );
      }
      return (
        `${i.rank}. ${i.business_name} (${i.neighborhood}): ${fmtRatio(i.baseline_ratio)}x its own typical post. ` +
        `${i.plays > 0 ? `${i.plays.toLocaleString()} plays, ` : ""}${i.likes.toLocaleString()} likes vs a baseline around ${Math.round(i.baseline_median).toLocaleString()} engagement per post. ` +
        `Posted ${fmtDate(i.posted)}. Caption: "${i.caption.slice(0, 160)}"`
      );
    })
    .join("\n");
  const businesses = new Set(items.map((i) => i.business_slug)).size;
  const mentionNames = items
    .filter((i) => i.moment_type === "mention")
    .map((i) => i.business_name);

  const prompt = `You're writing the editorial intro for a Signal Pittsburgh article: "Pittsburgh's Most Unexpectedly Viral Moments." These are moments when a Pittsburgh small business massively outperformed that business's OWN typical engagement. Two kinds: posts the business made itself, and TikToks someone ELSE filmed that happen to feature the business (a sandwich in the background of a stranger's reel). Ranked by the multiple over the business's own baseline, not raw reach. The editorial thesis: the accident beats the campaign. The moment that blows up is rarely the one the business planned, and sometimes the business didn't even press record.

Voice: smart food/business journalist, specific, confident, no marketing cliches. Write like New York Magazine. NO em dashes (use commas, periods, colons). No Pittsburgh-dialect cliches (no "yinz", no "dahntahn").

HARD RULES:
- Use ONLY the facts in the data below: business names, neighborhoods, numbers, dates, caption text. Do NOT invent why a post went viral, what the business intended, who the creator is, why they filmed it, or any backstory not visible in the caption.
- Entries marked [CREATOR-FILMED] were posted by an outside creator, NOT the business. Never imply the business posted, planned, or commissioned those. ${mentionNames.length > 0 ? `Creator-filmed businesses in this list: ${mentionNames.join(", ")}.` : "This edition has no creator-filmed entries."}
- Do not mention AI, Claude, or any publisher.
- No composite scores or grades. Raw counts and "Nx its own baseline" multiples are fine.

DATA:
- ${items.length} moments ranked
- ${businesses} businesses represented
- Method: each moment is measured against that business's own median engagement per post. Ranked by the multiple, not by reach.

TOP 6:
${top}

Write ONE paragraph, 80-120 words, no more. Frame the angle: this list rewards the outlier relative to the account's own history, so a small shop's surprise hit outranks a big account's routine win, and the biggest surprise of all is going viral in someone else's video. Tease 1-2 specific businesses by name with a concrete observable detail (a number, a date, or something actually in the caption).

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
  const execute = args.includes("--execute");
  const dryRun = !execute; // --dry-run is the default; --execute opts in
  const noJudge = args.includes("--no-judge");

  if (execute && noJudge) {
    console.error(
      "[viral] --no-judge is dry-run only: unjudged mentions are never published. Drop --no-judge or use --dry-run.",
    );
    process.exit(1);
  }

  if (execute && !process.env.ANTHROPIC_API_KEY) {
    console.error("[viral] ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const all = await loadAllRichBusinesses({ fresh: true });
  const bySlug = new Map(all.map((rb) => [rb.artifact.business.slug, rb]));

  const recencyCutoff = Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000;
  let candidates: ViralCandidate[] = [];
  const baselineLog: {
    slug: string;
    posts: number;
    baseline: number;
    eligible: boolean;
    reason?: string;
  }[] = [];
  let mentionFilesSeen = 0;
  let mentionVideosSeen = 0;

  // One record per unique handle: excluded accounts dropped, shared-handle
  // slugs collapsed. The dedupe/exclusion policy lives in the pool module.
  const pool = await loadOwnPostsPool();

  for (const rec of pool) {
    const slug = rec.slug;
    const rb = bySlug.get(slug);
    if (!rb) {
      baselineLog.push({ slug, posts: 0, baseline: 0, eligible: false, reason: "no business record" });
      continue;
    }

    // Own posts only: drop tagged/reposted items by other accounts, and
    // anything missing the fields we need.
    const own = rec.items.filter((p) => {
      if (!p.shortCode || !p.timestamp) return false;
      if (Number.isNaN(Date.parse(p.timestamp))) return false;
      const owner = (p.ownerUsername ?? "").toLowerCase();
      return !owner || owner === rec.handle;
    });

    if (own.length < MIN_HISTORY) {
      baselineLog.push({ slug, posts: own.length, baseline: 0, eligible: false, reason: `only ${own.length} posts of history (need ${MIN_HISTORY})` });
      continue;
    }

    // Baseline: median engagement across ALL own posts in the file.
    const baseline = median(own.map(postEngagement));
    if (baseline < 1) {
      baselineLog.push({ slug, posts: own.length, baseline, eligible: false, reason: "median engagement below 1, baseline is noise" });
      continue;
    }
    baselineLog.push({ slug, posts: own.length, baseline, eligible: true });

    // ROUTE 1: the business's own IG posts vs its own baseline.
    for (const p of own) {
      const posted = Date.parse(p.timestamp!);
      if (posted < recencyCutoff) continue; // baseline counts it; the list stays current
      const likes = p.likesCount ?? 0;
      const comments = p.commentsCount ?? 0;
      const plays = p.videoPlayCount ?? p.videoViewCount ?? 0;
      const engagement = postEngagement(p);
      const ratio = engagement / baseline;
      const clearsFloor = likes >= MIN_LIKES_FLOOR || plays >= MIN_PLAYS_FLOOR;
      if (ratio < RATIO_THRESHOLD || !clearsFloor) continue;
      if (!p.displayUrl) continue;
      candidates.push({
        momentType: "own",
        shortcode: p.shortCode!,
        url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
        caption: scrubEmDashes((p.caption ?? "").slice(0, 600)),
        igType: p.type ?? "Image",
        posted: p.timestamp!,
        likes,
        comments,
        plays,
        displayUrl: p.displayUrl,
        engagement,
        baseline,
        ratio,
        historyCount: own.length,
        business: rb,
      });
    }

    // ROUTE 2: mention moments, someone else's TikTok featuring this
    // business. Same baseline, same recency window, same engagement
    // formula (no comments field exists on these, treated as 0), so the
    // lift ratio shares one scale with own-post moments. The play floor
    // replaces the own-post floors: an outside creator's video has to
    // clear real reach (>= MENTION_MIN_PLAYS) to count as a moment.
    const mentions = await loadTikTokMentions(slug);
    if (mentions?.top_videos && mentions.top_videos.length > 0) {
      mentionFilesSeen++;
      const ownHandle = (mentions.detected_own_handle ?? "").toLowerCase();
      for (const v of mentions.top_videos) {
        mentionVideosSeen++;
        if (!v.url || !v.posted) continue;
        const postedMs = Date.parse(v.posted);
        if (Number.isNaN(postedMs) || postedMs < recencyCutoff) continue;
        const plays = v.plays ?? 0;
        if (plays < MENTION_MIN_PLAYS) continue;
        const author = (v.author ?? "").toLowerCase();
        // The accident requires an outside creator: skip the business's
        // own TikTok account (detected_own_handle), and as a belt-and-
        // suspenders guard, any author whose handle equals the business's
        // IG handle (same brand name on TikTok).
        if (!author) continue;
        if (ownHandle && author === ownHandle) continue;
        if (author === rec.handle) continue;
        const likes = v.likes ?? 0;
        const comments = v.comments ?? 0; // top_videos carry none today
        const engagement = likes + comments + Math.floor(plays / 30);
        const ratio = engagement / baseline;
        const videoId = v.id ?? extractTikTokVideoId(v.url);
        if (!videoId) continue; // dedupe key + embed id; URL didn't match either
        candidates.push({
          momentType: "mention",
          shortcode: videoId,
          url: v.url,
          caption: scrubEmDashes((v.text ?? "").slice(0, 600)),
          posted: v.posted,
          likes,
          comments,
          plays,
          authorHandle: v.author,
          engagement,
          baseline,
          ratio,
          historyCount: own.length,
          business: rb,
        });
      }
    }
  }

  // RELEVANCE GATE, mention moments only. Runs at BOTH dry-run and
  // execute time (it needs the API; the one exception to the no-API-
  // in-dry-run rule). Rejected candidates are dropped HERE, before the
  // merged ranking, so an own-post moment from the same business can
  // still win. --no-judge (dry-run only) skips the call and tags
  // mentions unjudged so zero-cost dry runs remain possible.
  const mentionCandidates = candidates.filter(
    (c) => c.momentType === "mention",
  );
  let gateCalled = false;
  if (mentionCandidates.length > 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    if (noJudge) {
      for (const c of mentionCandidates) c.unjudged = true;
      console.log(
        `[viral] --no-judge: relevance gate skipped, ${mentionCandidates.length} mention candidates tagged unjudged`,
      );
    } else if (apiKey === "") {
      // Execute already exited on a missing key above, so this branch
      // is dry-run only: degrade to unjudged tagging instead of crashing.
      for (const c of mentionCandidates) c.unjudged = true;
      console.warn(
        `[viral] WARNING: ANTHROPIC_API_KEY missing or empty, relevance gate skipped, ${mentionCandidates.length} mention candidates tagged unjudged. Set the key or pass --no-judge to silence this.`,
      );
    } else {
      gateCalled = true;
      console.log(
        `[viral] relevance gate: judging ${mentionCandidates.length} mention candidates (${JUDGE_MODEL}, one batched call)...`,
      );
      const judgeClient = new Anthropic({ apiKey });
      const judgements = await judgeMentionRelevance(
        judgeClient,
        mentionCandidates,
      );
      const rejected = new Set<ViralCandidate>();
      if (judgements === null) {
        console.warn(
          `[viral] WARNING: relevance judge failed twice (malformed or errored). Rejecting ALL ${mentionCandidates.length} mention candidates: unjudged mentions are never published.`,
        );
        for (const c of mentionCandidates) rejected.add(c);
      } else {
        for (const j of judgements) {
          const c = mentionCandidates[j.id];
          if (!j.about_business) {
            rejected.add(c);
            console.log(
              `[viral] mention rejected (relevance): ${c.business.artifact.business.slug} @${c.authorHandle} :: ${scrubEmDashes(j.reason)}`,
            );
          }
        }
        console.log(
          `[viral] relevance gate: ${mentionCandidates.length - rejected.size}/${mentionCandidates.length} mention candidates passed`,
        );
      }
      if (rejected.size > 0) {
        candidates = candidates.filter((c) => !rejected.has(c));
      }
    }
  }

  // Rank by unexpectedness (ratio to own baseline), NOT raw reach.
  candidates.sort((a, b) => b.ratio - a.ratio);
  // Belt and suspenders: the pool loader already collapses shared handles,
  // but never let the same post (shortcode / video id) make the list twice.
  const seenShortcodes = new Set<string>();
  const ranked = candidates.filter((c) => {
    if (seenShortcodes.has(c.shortcode)) return false;
    seenShortcodes.add(c.shortcode);
    return true;
  });
  if (ranked.length < candidates.length) {
    console.log(`[viral] dropped ${candidates.length - ranked.length} duplicate shortcodes from ranking`);
  }
  // One moment per business: a top 10 of distinct businesses reads stronger
  // than two entries from the same account. Ratio sort means we keep each
  // business's single most unexpected moment, whichever type it is.
  const seenSlugs = new Set<string>();
  const perBusiness = ranked.filter((c) => {
    if (seenSlugs.has(c.business.artifact.business.slug)) return false;
    seenSlugs.add(c.business.artifact.business.slug);
    return true;
  });
  const final = perBusiness.slice(0, TOP_N);

  const ownQualified = ranked.filter((c) => c.momentType === "own").length;
  const mentionQualified = ranked.filter((c) => c.momentType === "mention").length;

  console.log(`[viral] ${baselineLog.filter((b) => b.eligible).length}/${pool.length} businesses eligible (>= ${MIN_HISTORY} posts, median >= 1)`);
  console.log(`[viral] own-post route: >= ${RATIO_THRESHOLD}x own median, floor ${MIN_LIKES_FLOOR} likes or ${MIN_PLAYS_FLOOR.toLocaleString()} plays, last ${RECENCY_DAYS} days`);
  console.log(`[viral] mention route: ${mentionFilesSeen} businesses with tiktok_mentions videos (${mentionVideosSeen} videos scanned), floor ${MENTION_MIN_PLAYS.toLocaleString()} plays, outside creators only, last ${RECENCY_DAYS} days`);
  console.log(`[viral] ${ownQualified} own-post moments, ${mentionQualified} mention moments qualified`);

  if (dryRun) {
    console.log("\n[viral] dry-run. Baselines:");
    for (const b of baselineLog) {
      const tag = b.eligible
        ? `median=${b.baseline.toFixed(1)} over ${b.posts} posts`
        : `INELIGIBLE (${b.reason})`;
      console.log(`  ${b.slug}: ${tag}`);
    }
    if (final.length === 0) {
      console.log("\n[viral] 0 qualified.");
    } else {
      console.log(`\n[viral] top ${final.length} by ratio to own baseline:`);
      for (let i = 0; i < final.length; i++) {
        const c = final[i];
        console.log(
          `  ${i + 1}. [${momentLabel(c)}] ${c.business.artifact.business.name} (${c.business.artifact.business.slug})`,
        );
        const source =
          c.momentType === "mention"
            ? `creator @${c.authorHandle} on TikTok`
            : c.igType ?? "Image";
        console.log(
          `     ratio=${c.ratio.toFixed(1)}x | baseline=${c.baseline.toFixed(1)} | engagement=${c.engagement.toLocaleString()} (likes=${c.likes.toLocaleString()}, comments=${c.comments.toLocaleString()}, plays=${c.plays.toLocaleString()}) | ${c.posted.slice(0, 10)} | ${source}`,
        );
        console.log(`     "${c.caption.slice(0, 90).replace(/\n/g, " ")}"`);
      }
    }
    console.log(`\n[viral] summary: ${ownQualified} own-post moments, ${mentionQualified} mention moments qualified`);
    console.log(
      gateCalled
        ? "\n[viral] dry-run complete. One relevance-gate API call made, no files written. Re-run with --execute to publish."
        : "\n[viral] dry-run complete. No API calls, no files written. Re-run with --execute to publish.",
    );
    return;
  }

  if (final.length === 0) {
    console.error("[viral] 0 qualifying moments, refusing to write an empty article.");
    process.exit(1);
  }

  // Invariant: unjudged mentions are never published. Unreachable by
  // construction (execute rejects --no-judge and requires the API key),
  // but cheap to enforce in case the control flow above ever shifts.
  const unjudgedFinal = final.filter((c) => c.unjudged);
  if (unjudgedFinal.length > 0) {
    console.error(
      `[viral] ${unjudgedFinal.length} unjudged mention(s) reached the publish path, refusing to write. This is a bug in the gate control flow.`,
    );
    process.exit(1);
  }

  // Thumbnails. Own posts: self-host (IG CDN URLs are short-lived and
  // block hot-linking). Mention moments: TikTok's oEmbed thumbnail URL,
  // the same field the best-creator-posts-about tiktok items carry.
  console.log(`[viral] fetching ${final.length} thumbnails...`);
  const thumbnails = await Promise.all(
    final.map((c) =>
      c.momentType === "own"
        ? downloadThumbnail(c.displayUrl!, c.shortcode)
        : fetchTikTokThumbnail(c.url),
    ),
  );
  console.log(`[viral] got ${thumbnails.filter(Boolean).length}/${final.length} thumbnails`);

  const items: ViralItem[] = final.map((c, i) => {
    const fam = familyForCategory(c.business.artifact.meta.categoryName).label;
    const isMention = c.momentType === "mention";
    return {
      rank: i + 1,
      kind: "post",
      platform: isMention ? "tiktok" : "instagram",
      moment_type: c.momentType,
      video_url: c.url,
      video_id: c.shortcode,
      thumbnail_url: thumbnails[i],
      plays: c.plays,
      likes: c.likes,
      // TikTok mention videos carry no comments field; omit it, exactly
      // like the best-creator-posts-about tiktok items.
      ...(isMention ? {} : { comments: c.comments }),
      posted: c.posted,
      caption: c.caption.slice(0, 240),
      creator_handle: isMention
        ? (c.authorHandle ?? "")
        : (c.business.social.ig?.handle ?? c.business.artifact.business.slug),
      business_slug: c.business.artifact.business.slug,
      business_name: c.business.artifact.business.name,
      family_label: fam,
      neighborhood: c.business.artifact.business.neighborhood,
      ...(isMention ? {} : { ig_type: c.igType ?? "Image" }),
      followers: c.business.social.ig?.followers ?? 0,
      baseline_median: c.baseline,
      baseline_ratio: c.ratio,
      creativity_score: c.ratio, // render gate only, never displayed; see ViralItem note
      why: buildWhy(c),
    };
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const intro = await generateIntro(client, items);

  const article: Article = {
    slug: SLUG,
    kind: "posts",
    title: "Pittsburgh's Most Unexpectedly Viral Moments",
    subtitle:
      "The posts that blew up against each account's own baseline. The accident beats the campaign.",
    angle:
      "the moments that ran far past what each business's own account typically draws. Some they posted themselves, some showed up in someone else's video. Not the biggest feeds, the biggest surprises: ranked by the multiple over each business's own baseline, never by raw reach.",
    intro,
    items,
    rank_label: "ranked by lift over a typical post",
    generated_at: new Date().toISOString(),
    model: `${INTRO_MODEL} (intro); ranking is deterministic (median-baseline outliers)`,
  };

  const out = join(OUT_DIR, `${SLUG}.json`);
  await writeFile(out, JSON.stringify(article, null, 2) + "\n", "utf-8");
  console.log(`\n[viral] wrote ${out} (${items.length} items)`);
}

main().catch((err) => {
  console.error("[viral] fatal:", err);
  process.exit(1);
});
