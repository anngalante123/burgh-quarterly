#!/usr/bin/env tsx
/**
 * scout-comment-defense.ts, evidence-gathering scout for the editorial
 * list "The Businesses Pittsburgh Defends in the Comments".
 *
 * INTERNAL TOOL. The output memo is a private curation document for the
 * owner. Nothing here is published. Nothing is invented: every quoted
 * comment is validated as a real substring of the scraped comments, and
 * the final list is hand-curated by a human from this evidence.
 *
 * Pipeline:
 *   1. Candidates: businesses with own-posts data (content/raw/own-posts/)
 *      that pass the "beloved" gate the business page already uses
 *      (review_count >= 150 AND rating >= 4.3, mirroring
 *      STRONG_REVIEW_COUNT / STRONG_REVIEW_RATING in
 *      app/business/[slug]/page.tsx). Ranked by review count desc.
 *   2. Posts: top 3 own posts by commentsCount (each needs >= 15 comments).
 *   3. Scrape: apify~instagram-comment-scraper, up to 100 comments per
 *      post, saved to content/raw/comment-scout/<slug>.json.
 *   4. Judge: one claude-sonnet-4-6 call per business asking whether the
 *      threads contain customers DEFENDING the business against criticism
 *      (not just praise). Quotes are rejected unless they appear verbatim
 *      in the scraped comments.
 *   5. Memo: scripts/output/defense-curation-memo.md, grouped by strength.
 *
 * Usage:
 *   npx tsx scripts/scout-comment-defense.ts --dry-run            # default: plan + cost, no spend
 *   npx tsx scripts/scout-comment-defense.ts --scrape             # Apify only
 *   npx tsx scripts/scout-comment-defense.ts --judge              # Claude only, on existing scrapes
 *   npx tsx scripts/scout-comment-defense.ts --scrape --judge     # both
 *   npx tsx scripts/scout-comment-defense.ts --dry-run --limit 10
 *   npx tsx scripts/scout-comment-defense.ts --scrape --force     # re-scrape existing
 *
 * Cost model (stated assumptions):
 *   - Comment scraping: ~$2.30 per 1,000 comments (actor pay-per-result
 *     pricing; estimate counts top-level comments only, capped at 100 per
 *     post, replies not included in the estimate).
 *   - Claude judging: ~$0.02 per business (one Sonnet call, batched).
 *
 * The runner exports ANTHROPIC_API_KEY into the shell before --judge runs;
 * APIFY_TOKEN comes from .env.local like the sibling scrape scripts.
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

// Type-only import is erased at runtime. The value import happens
// dynamically inside buildCandidates, AFTER dotenv has loaded .env.local,
// because lib/db/client.ts reads DATABASE_URL at module-import time.
import type { RichBusiness } from "@/lib/query/business-query";
import { EXCLUDED_HANDLES } from "@/lib/lists/own-posts-pool";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

/* ----------------------------- constants ------------------------------ */

// Same actor family + REST pattern as scripts/scrape-business-own-posts.ts.
const ACTOR = "apify~instagram-comment-scraper";
const OWN_POSTS_DIR = join(process.cwd(), "content", "raw", "own-posts");
const SCOUT_DIR = join(process.cwd(), "content", "raw", "comment-scout");
const OUTPUT_DIR = join(process.cwd(), "scripts", "output");
const MEMO_PATH = join(OUTPUT_DIR, "defense-curation-memo.md");
const JUDGMENTS_PATH = join(OUTPUT_DIR, "defense-judgments.json");

// "Beloved" gate. Mirrors STRONG_REVIEW_COUNT / STRONG_REVIEW_RATING in
// app/business/[slug]/page.tsx (the business-page signal stance). Keep in
// sync if those move.
const BELOVED_REVIEW_COUNT = 150;
const BELOVED_RATING = 4.3;

const DEFAULT_LIMIT = 25;
const POSTS_PER_BUSINESS = 3;
const MIN_COMMENTS_PER_POST = 15;
const COMMENTS_CAP_PER_POST = 100;

// Cost assumptions, stated in dry-run output.
const SCRAPE_COST_PER_1000_COMMENTS = 2.3;
const CLAUDE_COST_PER_BUSINESS = 0.02;

const JUDGE_MODEL = "claude-sonnet-4-6";

/* ----------------------------- types ---------------------------------- */

type RawOwnPost = {
  shortCode?: string;
  url?: string;
  caption?: string;
  commentsCount?: number;
  likesCount?: number;
  timestamp?: string;
  ownerUsername?: string;
  error?: string;
};

type OwnPostsFile = {
  slug: string;
  handle: string;
  items: RawOwnPost[];
};

type SelectedPost = {
  url: string;
  shortCode: string;
  commentsCount: number;
  caption: string;
  timestamp: string;
};

type Candidate = {
  slug: string;
  name: string;
  neighborhood: string;
  reviewCount: number;
  rating: number;
  handle: string;
  posts: SelectedPost[];
  alreadyScraped: boolean;
};

type NearMiss = {
  slug: string;
  reviewCount: number;
  rating: number;
  reason: string;
};

// Tolerant shape for apify~instagram-comment-scraper dataset items.
// Input schema (verified via the actor metadata API, no run started):
// { directUrls: string[] (required), resultsLimit: int, includeNestedComments: bool }
type ApifyComment = {
  postUrl?: string;
  text?: string;
  ownerUsername?: string;
  timestamp?: string;
  likesCount?: number;
  repliesCount?: number;
  replies?: { text?: string; ownerUsername?: string }[];
  error?: string;
};

type ScoutFile = {
  slug: string;
  handle: string;
  scraped_at: string;
  posts: SelectedPost[];
  comment_count: number;
  items: ApifyComment[];
};

type DefenseThread = {
  post_url: string;
  summary_of_defense: string;
  verbatim_quote: string;
  commenter_handle: string;
};

type DefenseJudgment = {
  has_defense: boolean;
  strength: "none" | "weak" | "clear";
  threads: DefenseThread[];
};

type JudgedBusiness = {
  slug: string;
  name: string;
  neighborhood: string;
  reviewCount: number;
  rating: number;
  judgment: DefenseJudgment;
  rejected_quotes: string[];
};

/* ----------------------------- helpers -------------------------------- */

function scrubEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
}

/** Lowercase + collapse all whitespace runs to single spaces. */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseLimit(args: string[]): number {
  const eq = args.find((a) => a.startsWith("--limit="));
  if (eq) {
    const n = Number(eq.slice("--limit=".length));
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const i = args.indexOf("--limit");
  if (i === -1) return DEFAULT_LIMIT;
  const n = Number(args[i + 1]);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("[scout] --limit requires a positive number, e.g. --limit 10");
    process.exit(1);
  }
  return Math.floor(n);
}

/* ----------------------------- candidates ----------------------------- */

async function buildCandidates(
  limit: number,
  force: boolean,
): Promise<{ candidates: Candidate[]; nearMisses: NearMiss[]; skippedNoPosts: string[] }> {
  const ownPostFiles = (await readdir(OWN_POSTS_DIR)).filter((f) => f.endsWith(".json"));
  // Dynamic import so dotenv has populated DATABASE_URL before
  // lib/db/client.ts evaluates (it throws at import time otherwise).
  const { loadAllRichBusinesses } = await import("@/lib/query/business-query");
  const all = await loadAllRichBusinesses({ fresh: true });
  const bySlug = new Map<string, RichBusiness>(
    all.map((rb) => [rb.artifact.business.slug, rb]),
  );

  const beloved: { rb: RichBusiness; slug: string }[] = [];
  const nearMisses: NearMiss[] = [];

  for (const f of ownPostFiles) {
    const slug = f.replace(/\.json$/, "");
    const rb = bySlug.get(slug);
    if (!rb) {
      nearMisses.push({ slug, reviewCount: 0, rating: 0, reason: "not in business index" });
      continue;
    }
    const reviewCount = rb.artifact.business.google_review_count ?? 0;
    const rating = rb.artifact.business.google_rating ?? 0;
    if (reviewCount >= BELOVED_REVIEW_COUNT && rating >= BELOVED_RATING) {
      beloved.push({ rb, slug });
    } else {
      nearMisses.push({
        slug,
        reviewCount,
        rating,
        reason: `below beloved gate (need >= ${BELOVED_REVIEW_COUNT} reviews and >= ${BELOVED_RATING} stars)`,
      });
    }
  }

  beloved.sort(
    (a, b) =>
      (b.rb.artifact.business.google_review_count ?? 0) -
      (a.rb.artifact.business.google_review_count ?? 0),
  );

  const candidates: Candidate[] = [];
  const skippedNoPosts: string[] = [];
  // Same editorial policy as the public lists: franchises and institutions
  // are not Pittsburgh small businesses. Shared-handle brands (one IG
  // account across multiple business rows) are scouted once, under the
  // highest-review row since beloved is sorted by review count desc.
  const seenHandles = new Set<string>();

  for (const { rb, slug } of beloved) {
    if (candidates.length >= limit) break;
    let raw: OwnPostsFile;
    try {
      raw = JSON.parse(await readFile(join(OWN_POSTS_DIR, `${slug}.json`), "utf-8"));
    } catch {
      skippedNoPosts.push(`${slug} (unreadable own-posts file)`);
      continue;
    }
    const handleLc = (raw.handle ?? "").toLowerCase();
    if (EXCLUDED_HANDLES.has(handleLc)) {
      skippedNoPosts.push(`${slug} (excluded handle @${handleLc}, not a small business)`);
      continue;
    }
    if (handleLc && seenHandles.has(handleLc)) {
      skippedNoPosts.push(`${slug} (duplicate handle @${handleLc}, already scouted)`);
      continue;
    }
    if (handleLc) seenHandles.add(handleLc);
    const posts: SelectedPost[] = (raw.items ?? [])
      .filter((p) => {
        if (p.error || !p.shortCode) return false;
        if ((p.commentsCount ?? 0) < MIN_COMMENTS_PER_POST) return false;
        const owner = (p.ownerUsername ?? "").toLowerCase();
        if (owner && handleLc && owner !== handleLc) return false;
        return true;
      })
      .sort((a, b) => (b.commentsCount ?? 0) - (a.commentsCount ?? 0))
      .slice(0, POSTS_PER_BUSINESS)
      .map((p) => ({
        url: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
        shortCode: p.shortCode as string,
        commentsCount: p.commentsCount ?? 0,
        caption: (p.caption ?? "").slice(0, 200),
        timestamp: p.timestamp ?? "",
      }));

    if (posts.length === 0) {
      skippedNoPosts.push(
        `${slug} (no posts with >= ${MIN_COMMENTS_PER_POST} comments)`,
      );
      continue;
    }

    candidates.push({
      slug,
      name: rb.artifact.business.name,
      neighborhood: rb.artifact.business.neighborhood,
      reviewCount: rb.artifact.business.google_review_count ?? 0,
      rating: rb.artifact.business.google_rating ?? 0,
      handle: raw.handle,
      posts,
      alreadyScraped: existsSync(join(SCOUT_DIR, `${slug}.json`)) && !force,
    });
  }

  return { candidates, nearMisses, skippedNoPosts };
}

/* ----------------------------- scrape --------------------------------- */

async function runCommentActor(token: string, postUrls: string[]): Promise<ApifyComment[]> {
  // Input shape verified against the actor's default-build input schema:
  // directUrls (required), resultsLimit (per-URL comment cap),
  // includeNestedComments (paid feature; replies are where defense threads
  // live, so we request them).
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/runs?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: postUrls,
        resultsLimit: COMMENTS_CAP_PER_POST,
        includeNestedComments: true,
      }),
    },
  );
  if (!startRes.ok) {
    throw new Error(`apify start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const run = ((await startRes.json()) as { data: { id: string; status: string } }).data;
  let status = run.status;
  // Bounded poll: one hung actor run must not stall the whole batch. Seen
  // 2026-06-10 with a run stuck RUNNING 30+ min on a 43-comment post.
  const POLL_CAP_MS = 6 * 60 * 1000;
  const startedAt = Date.now();
  while (status === "READY" || status === "RUNNING") {
    if (Date.now() - startedAt > POLL_CAP_MS) {
      await fetch(`https://api.apify.com/v2/actor-runs/${run.id}/abort?token=${token}`, {
        method: "POST",
      }).catch(() => {});
      throw new Error(`apify run exceeded ${POLL_CAP_MS / 60000}min poll cap, aborted`);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const r2 = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${token}`);
    status = ((await r2.json()) as { data: { status: string } }).data.status;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`apify run ${status}`);
    }
  }
  const items = (await fetch(
    `https://api.apify.com/v2/actor-runs/${run.id}/dataset/items?token=${token}&format=json`,
  ).then((r) => r.json())) as ApifyComment[];
  return items;
}

async function scrapePhase(candidates: Candidate[]): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("[scout] APIFY_TOKEN missing in .env.local");
    process.exit(1);
  }
  await mkdir(SCOUT_DIR, { recursive: true });

  let processed = 0,
    skipped = 0,
    failed = 0;
  for (const c of candidates) {
    if (c.alreadyScraped) {
      console.log(`[skip] ${c.slug}, already scraped (use --force to overwrite)`);
      skipped++;
      continue;
    }
    console.log(
      `[scrape] ${c.slug} :: @${c.handle} :: ${c.posts.length} posts (${c.posts
        .map((p) => p.commentsCount)
        .join("/")} comments)`,
    );
    try {
      const items = await runCommentActor(
        token,
        c.posts.map((p) => p.url),
      );
      const real = items.filter((i) => !i.error && typeof i.text === "string");
      console.log(`[ok]    ${c.slug}, ${real.length} comments pulled (raw ${items.length})`);
      const out: ScoutFile = {
        slug: c.slug,
        handle: c.handle,
        scraped_at: new Date().toISOString(),
        posts: c.posts,
        comment_count: real.length,
        items,
      };
      await writeFile(join(SCOUT_DIR, `${c.slug}.json`), JSON.stringify(out, null, 2));
      processed++;
    } catch (err) {
      console.error(`[fail] ${c.slug}:`, err);
      failed++;
    }
  }
  console.log(`\n[scrape] done. processed=${processed} skipped=${skipped} failed=${failed}`);
}

/* ----------------------------- judge ---------------------------------- */

/** Every searchable text in the scrape: top-level comments + nested replies. */
function commentCorpus(file: ScoutFile): { handle: string; text: string; postUrl: string }[] {
  const corpus: { handle: string; text: string; postUrl: string }[] = [];
  for (const item of file.items) {
    if (item.error) continue;
    if (typeof item.text === "string" && item.text.trim()) {
      corpus.push({
        handle: item.ownerUsername ?? "unknown",
        text: item.text,
        postUrl: item.postUrl ?? "",
      });
    }
    for (const rep of item.replies ?? []) {
      if (typeof rep.text === "string" && rep.text.trim()) {
        corpus.push({
          handle: rep.ownerUsername ?? "unknown",
          text: rep.text,
          postUrl: item.postUrl ?? "",
        });
      }
    }
  }
  return corpus;
}

function buildJudgePrompt(c: Candidate, file: ScoutFile): string {
  const corpus = commentCorpus(file);
  const byPost = new Map<string, { handle: string; text: string }[]>();
  for (const entry of corpus) {
    const key = entry.postUrl || "unknown-post";
    const list = byPost.get(key) ?? [];
    // Cap per-comment length to bound tokens; quotes are validated against
    // the FULL raw text later, so truncation here only affects what the
    // model sees, not what it may cite (instructions tell it to quote
    // exactly what it sees).
    list.push({ handle: entry.handle, text: entry.text.slice(0, 280) });
    byPost.set(key, list);
  }

  let threads = "";
  for (const [postUrl, comments] of byPost) {
    const selected = file.posts.find((p) => p.url === postUrl);
    threads += `\nPOST: ${postUrl}\n`;
    if (selected?.caption) threads += `CAPTION (business's own): "${selected.caption}"\n`;
    threads += `COMMENTS (${comments.length}):\n`;
    for (const cm of comments) {
      threads += `@${cm.handle}: ${cm.text.replace(/\n/g, " ")}\n`;
    }
  }

  return `You are screening Instagram comment threads for an internal editorial research memo. The business is ${c.name}, a Pittsburgh business in ${c.neighborhood}.

QUESTION: Do these threads contain customers DEFENDING the business against criticism, a complaint, or a bad experience? Defense means a commenter pushes back on negativity directed at the business (e.g. someone complains about price, service, a closure, a controversy, and a regular jumps in to vouch for them). Plain praise, compliments, or tagged friends do NOT count as defense. There must be visible criticism or negativity being countered.

THREADS:
${threads}

RULES:
- Only cite quotes that appear VERBATIM in the comments above. Copy them exactly, character for character. Do not paraphrase, trim words inside the quote, or fix typos. Any quote that is not an exact substring of a comment will be rejected.
- commenter_handle must be the @handle shown for that exact comment.
- post_url must be one of the POST urls above.
- strength: "clear" only if the defense is unmistakable (criticism visible AND a direct rebuttal vouching for the business). "weak" if it is plausible but ambiguous. "none" if there is no defense.
- If there is no defense, return has_defense false, strength "none", threads [].

Return ONLY valid JSON, this exact shape, no markdown fences:
{"has_defense": <boolean>, "strength": "none"|"weak"|"clear", "threads": [{"post_url": "<url>", "summary_of_defense": "<one sentence>", "verbatim_quote": "<exact comment text>", "commenter_handle": "<handle without @>"}]}`;
}

/** Reject any quote that is not a substring (case-insensitive, whitespace-
 *  normalized) of the raw scraped comments. */
function validateThreads(
  judgment: DefenseJudgment,
  file: ScoutFile,
): { valid: DefenseThread[]; rejected: string[] } {
  const corpusNorm = commentCorpus(file)
    .map((c) => normalizeForMatch(c.text))
    .join("   ");
  const valid: DefenseThread[] = [];
  const rejected: string[] = [];
  for (const t of judgment.threads ?? []) {
    const quoteNorm = normalizeForMatch(t.verbatim_quote ?? "");
    if (quoteNorm && corpusNorm.includes(quoteNorm)) {
      valid.push({
        post_url: t.post_url,
        summary_of_defense: scrubEmDashes(t.summary_of_defense ?? ""),
        verbatim_quote: t.verbatim_quote,
        commenter_handle: (t.commenter_handle ?? "").replace(/^@/, ""),
      });
    } else {
      rejected.push(t.verbatim_quote ?? "(empty quote)");
    }
  }
  return { valid, rejected };
}

async function judgeOne(
  client: Anthropic,
  c: Candidate,
  file: ScoutFile,
): Promise<JudgedBusiness | null> {
  const prompt = buildJudgePrompt(c, file);
  let parsed: DefenseJudgment;
  try {
    const response = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    let txt = block.text.trim();
    txt = txt.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(txt) as DefenseJudgment;
  } catch (err) {
    console.warn(`  ! judge failed for ${c.slug}:`, (err as Error).message);
    return null;
  }

  const { valid, rejected } = validateThreads(parsed, file);
  for (const r of rejected) {
    console.warn(`  ! ${c.slug}: rejected quote not found in raw comments: "${r.slice(0, 80)}"`);
  }
  // A defense claim with zero surviving verbatim quotes is unverified:
  // downgrade to none so inference never outranks evidence.
  const effective: DefenseJudgment =
    parsed.has_defense && valid.length === 0
      ? { has_defense: false, strength: "none", threads: [] }
      : { has_defense: parsed.has_defense, strength: parsed.strength, threads: valid };
  if (parsed.has_defense && valid.length === 0) {
    console.warn(`  ! ${c.slug}: defense claimed but no quote validated, downgraded to none`);
  }

  return {
    slug: c.slug,
    name: c.name,
    neighborhood: c.neighborhood,
    reviewCount: c.reviewCount,
    rating: c.rating,
    judgment: effective,
    rejected_quotes: rejected,
  };
}

async function judgePhase(candidates: Candidate[]): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "[scout] ANTHROPIC_API_KEY missing. The runner exports it into the shell before judge runs.",
    );
    process.exit(1);
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const judged: JudgedBusiness[] = [];
  for (const c of candidates) {
    const scoutPath = join(SCOUT_DIR, `${c.slug}.json`);
    if (!existsSync(scoutPath)) {
      console.log(`[skip] ${c.slug}, no scraped comments yet (run --scrape first)`);
      continue;
    }
    let file: ScoutFile;
    try {
      file = JSON.parse(await readFile(scoutPath, "utf-8"));
    } catch {
      console.warn(`[skip] ${c.slug}, unreadable scout file`);
      continue;
    }
    if (commentCorpus(file).length === 0) {
      console.log(`[skip] ${c.slug}, scout file has zero usable comments`);
      continue;
    }
    process.stdout.write(`[judge] ${c.slug}... `);
    const result = await judgeOne(client, c, file);
    if (result) {
      judged.push(result);
      console.log(
        `${result.judgment.strength} (${result.judgment.threads.length} validated threads)`,
      );
    } else {
      console.log("failed");
    }
  }

  await writeFile(JUDGMENTS_PATH, JSON.stringify(judged, null, 2) + "\n");
  console.log(`[judge] wrote ${JUDGMENTS_PATH}`);

  await writeMemo(judged);
}

/* ----------------------------- memo ----------------------------------- */

async function writeMemo(judged: JudgedBusiness[]): Promise<void> {
  const clear = judged.filter((j) => j.judgment.strength === "clear");
  const weak = judged.filter((j) => j.judgment.strength === "weak");
  const none = judged.filter((j) => j.judgment.strength === "none");

  const lines: string[] = [];
  lines.push("# Defense Curation Memo: The Businesses Pittsburgh Defends in the Comments");
  lines.push("");
  lines.push("> INTERNAL CURATION DOCUMENT. Not for publication. This memo collects");
  lines.push("> raw evidence (verbatim Instagram comments) plus model-flagged context");
  lines.push("> for the owner to hand-curate the final list. Every quote below was");
  lines.push("> validated as an exact substring of the scraped comments. The");
  lines.push('> "Why it qualifies" lines are model inference and must be re-checked');
  lines.push("> against the quoted thread before anything is published.");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Model: ${JUDGE_MODEL} (defense detection), quotes validated mechanically.`);
  lines.push("");

  const renderEntry = (j: JudgedBusiness) => {
    lines.push(`### ${j.name}`);
    lines.push("");
    lines.push(
      `${j.neighborhood} | ${j.reviewCount.toLocaleString()} Google reviews at ${j.rating} stars`,
    );
    lines.push("");
    for (const t of j.judgment.threads) {
      lines.push(`**Verbatim evidence** (from ${t.post_url}):`);
      lines.push("");
      lines.push(`> "${t.verbatim_quote}"`);
      lines.push(`> @${t.commenter_handle}`);
      lines.push("");
      lines.push(`*Why it qualifies (inference):* ${t.summary_of_defense}`);
      lines.push("");
    }
  };

  lines.push(`## Clear defense (${clear.length})`);
  lines.push("");
  if (clear.length === 0) lines.push("None found.");
  for (const j of clear) renderEntry(j);
  lines.push("");

  lines.push(`## Weak or ambiguous defense (${weak.length})`);
  lines.push("");
  if (weak.length === 0) lines.push("None found.");
  for (const j of weak) renderEntry(j);
  lines.push("");

  lines.push(`## No defense found (${none.length})`);
  lines.push("");
  if (none.length === 0) {
    lines.push("None.");
  } else {
    lines.push(
      none
        .map((j) => `- ${j.name} (${j.slug})`)
        .join("\n"),
    );
  }
  lines.push("");

  const withRejections = judged.filter((j) => j.rejected_quotes.length > 0);
  if (withRejections.length > 0) {
    lines.push("## Rejected quotes (model cited text not found in raw comments)");
    lines.push("");
    for (const j of withRejections) {
      for (const q of j.rejected_quotes) {
        lines.push(`- ${j.slug}: "${q.slice(0, 120)}"`);
      }
    }
    lines.push("");
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(MEMO_PATH, lines.join("\n") + "\n");
  console.log(`[memo] wrote ${MEMO_PATH}`);
}

/* ----------------------------- dry run -------------------------------- */

function dryRun(
  candidates: Candidate[],
  nearMisses: NearMiss[],
  skippedNoPosts: string[],
): void {
  console.log(`[dry-run] beloved gate: review_count >= ${BELOVED_REVIEW_COUNT} AND rating >= ${BELOVED_RATING}`);
  console.log(`[dry-run] post gate: top ${POSTS_PER_BUSINESS} posts by commentsCount, each >= ${MIN_COMMENTS_PER_POST} comments\n`);

  let expectedComments = 0;
  let toScrape = 0;
  for (const c of candidates) {
    const perPost = c.posts.map((p) => Math.min(p.commentsCount, COMMENTS_CAP_PER_POST));
    const subtotal = perPost.reduce((a, b) => a + b, 0);
    const status = c.alreadyScraped ? "already scraped" : "NEW";
    if (!c.alreadyScraped) {
      expectedComments += subtotal;
      toScrape++;
    }
    console.log(
      `[dry]  ${c.slug} :: @${c.handle} :: ${c.reviewCount.toLocaleString()} reviews @ ${c.rating} :: posts=${c.posts.length} (${perPost.join("/")} comments capped) ${status}`,
    );
    for (const p of c.posts) {
      console.log(`         - ${p.url} (${p.commentsCount} comments)`);
    }
  }

  for (const s of skippedNoPosts) {
    console.log(`[skip] ${s}`);
  }

  if (candidates.length === 0) {
    console.log("\n[dry-run] ZERO candidates passed the beloved gate. Distribution of near-misses:");
  }
  if (nearMisses.length > 0) {
    console.log(`\n[dry-run] near-misses (${nearMisses.length}, did not pass the beloved gate):`);
    const sorted = [...nearMisses].sort((a, b) => b.reviewCount - a.reviewCount);
    for (const nm of sorted) {
      console.log(
        `[miss] ${nm.slug} :: ${nm.reviewCount.toLocaleString()} reviews @ ${nm.rating} :: ${nm.reason}`,
      );
    }
  }

  const scrapeCost = (expectedComments / 1000) * SCRAPE_COST_PER_1000_COMMENTS;
  const judgeCost = candidates.length * CLAUDE_COST_PER_BUSINESS;
  console.log(
    `\n[dry-run] candidates=${candidates.length} (new scrapes=${toScrape}, already scraped=${candidates.length - toScrape})`,
  );
  console.log(
    `[dry-run] estimated scrape cost: ~$${scrapeCost.toFixed(2)} for ~${expectedComments} comments`,
  );
  console.log(
    `[dry-run]   assumption: ~$${SCRAPE_COST_PER_1000_COMMENTS.toFixed(2)} per 1,000 comments, top-level comments only, capped at ${COMMENTS_CAP_PER_POST}/post; nested replies not included in the estimate`,
  );
  console.log(
    `[dry-run] estimated Claude cost: ~$${judgeCost.toFixed(2)} (${candidates.length} businesses x ~$${CLAUDE_COST_PER_BUSINESS.toFixed(2)}, one ${JUDGE_MODEL} call each)`,
  );
  console.log(`[dry-run] estimated total: ~$${(scrapeCost + judgeCost).toFixed(2)}`);
  console.log("[dry-run] no scraping, no Claude calls were made.");
}

/* ----------------------------- main ----------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const doScrape = args.includes("--scrape");
  const doJudge = args.includes("--judge");
  const isDryRun = args.includes("--dry-run") || (!doScrape && !doJudge);
  const limit = parseLimit(args);

  const { candidates, nearMisses, skippedNoPosts } = await buildCandidates(limit, force);

  if (isDryRun) {
    dryRun(candidates, nearMisses, skippedNoPosts);
    return;
  }

  for (const s of skippedNoPosts) {
    console.log(`[skip] ${s}`);
  }

  if (doScrape) {
    await scrapePhase(candidates);
  }
  if (doJudge) {
    await judgePhase(candidates);
  }
}

main().catch((err) => {
  console.error("[scout] fatal:", err);
  process.exit(1);
});
