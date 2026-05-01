/**
 * generate-list.ts, the article-generator for Signal Pittsburgh's
 * "best on social" series.
 *
 * Reads content/lists/registry.ts, runs each list's query against the
 * business dataset, calls Claude once per list to write an editorial
 * intro, and writes a structured article JSON to
 * content/lists/articles/<slug>.json.
 *
 * Usage:
 *   npm run generate:lists                  # regenerate every list
 *   npm run generate:lists -- sweets-top-10 # one specific list
 *   npm run generate:lists -- --dry-run     # show queries, no Claude calls
 *
 * Per-business descriptors reuse the existing diagnosis_pullquote.line
 * from each business's review-analysis JSON, no fresh Claude call needed
 * (and voice stays consistent with business pages).
 *
 * Em-dash scrub runs on every Claude output before write.
 */

import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

import {
  loadAllRichBusinesses,
  queryBusinesses,
  type RankedBusiness,
} from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";
import { LISTS, type ListSpec } from "@/content/lists/registry";

const MODEL = "claude-sonnet-4-6";
const OUT_DIR = join(process.cwd(), "content/lists/articles");

/* ----------------------------- output shape --------------------------- */

type FeaturedTiktok = {
  author: string;
  plays: number;
  url: string;
  caption: string;
};

type ListArticleItem = {
  rank: number;
  business_slug: string;
  name: string;
  family_label: string;
  neighborhood: string;
  /** The diagnosis line (reused from review-analysis), the rank-grounded summary. */
  descriptor: string;
  /** The 2-4 word phrase that's highlighted in the diagnosis (lime pill on the business page). */
  descriptor_highlight: string;
  /** Auto-built from the data, e.g. "1,294 reviews · 4.8★ · 26 creators · 109K plays". */
  stat_line: string;
  /** Optional top-performing creator video for "what creators are leaning into". */
  featured_tiktok?: FeaturedTiktok;
  /** The single highest-leverage Playbook move, if available, the "what they should do next". */
  playbook_top_move?: string;
};

type ListArticle = {
  slug: string;
  title: string;
  subtitle?: string;
  angle: string;
  /** Claude-generated, 2-3 short paragraphs framing the list. */
  intro: string;
  /** The ranked items. */
  items: ListArticleItem[];
  /** Echo of the query so future readers know how the list was built. */
  query: ListSpec["query"];
  generated_at: string;
  model: string;
};

/* ----------------------------- helpers -------------------------------- */

function scrubEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
}

function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M plays`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K plays`;
  return `${n.toLocaleString()} plays`;
}

function buildStatLine(rb: RankedBusiness): string {
  const biz = rb.business.artifact.business;
  const tt = rb.business.social.tiktok_mentions;
  const ig = rb.business.social.ig;

  const parts: string[] = [];
  if (biz.google_review_count) {
    parts.push(`${biz.google_review_count.toLocaleString()} reviews`);
  }
  if (biz.google_rating !== undefined) {
    parts.push(`${biz.google_rating}★`);
  }
  if (tt && tt.unique_creators > 0) {
    parts.push(`${tt.unique_creators} creators`);
  }
  if (tt && tt.total_plays > 0) {
    parts.push(formatPlays(tt.total_plays));
  }
  if (ig && ig.posts_30d > 0) {
    parts.push(`${ig.posts_30d} IG posts/30d`);
  }
  return parts.join(" · ");
}

function buildItem(rb: RankedBusiness): ListArticleItem {
  const biz = rb.business.artifact.business;
  const meta = rb.business.artifact.meta;
  const dp = rb.business.analysis?.diagnosis_pullquote;
  const tt = rb.business.social.tiktok_mentions;
  const playbook = rb.business.analysis?.playbook;

  const top = tt?.top_videos?.[0];
  const featured: FeaturedTiktok | undefined = top
    ? {
        author: top.author,
        plays: top.plays,
        url: top.url,
        caption: scrubEmDashes(top.text.slice(0, 240)),
      }
    : undefined;

  return {
    rank: rb.rank,
    business_slug: biz.slug,
    name: biz.name,
    family_label: familyForCategory(meta.categoryName).label,
    neighborhood: biz.neighborhood,
    descriptor: scrubEmDashes(dp?.line ?? "Diagnosis pending."),
    descriptor_highlight: dp?.highlight ?? "",
    stat_line: buildStatLine(rb),
    featured_tiktok: featured,
    playbook_top_move: playbook?.[0]
      ? scrubEmDashes(`${playbook[0].headline}. ${playbook[0].action}`)
      : undefined,
  };
}

/* ----------------------------- intro generation ----------------------- */

async function generateIntro(
  client: Anthropic,
  spec: ListSpec,
  ranked: RankedBusiness[],
): Promise<string> {
  const lines = ranked
    .map((r) => {
      const dp = r.business.analysis?.diagnosis_pullquote;
      const biz = r.business.artifact.business;
      return `${r.rank}. ${biz.name} (${biz.neighborhood}): ${dp?.line ?? "No diagnosis"}`;
    })
    .join("\n");

  // For underrated lists specifically, plant a quiet matchmaking gesture
  // before the Issue 02 closer. The publication itself never pitches Relay,
  // but the editorial frame names "creator-matching" as a category so an
  // owner reading the article connects the dots themselves.
  const isUnderrated = spec.slug.startsWith("underrated-");
  const underratedNudge = isUnderrated
    ? `\n\nFOR THIS LIST SPECIFICALLY: include one short sentence (2 to 3 lines) BEFORE the Issue 02 closer that gestures at creator-matching as a category, without pitching anything specific. The shape: these businesses already have customer love, the cheap second move is asking the creators who already love them to come back on purpose, Pittsburgh has more creators looking for places to feature than most owners realize, the platforms that match them work quietly because they don't have to pitch. Editorial in tone, factual not promotional. Do NOT name any product or brand. The reader's curiosity should do the rest.\n`
    : "";

  const prompt = `You're writing the editorial intro for an article in Signal Pittsburgh, the quarterly publication that ranks Pittsburgh small businesses on the conversation around them. Voice: smart food/business journalist, specific, confident, no marketing cliches, no "we noticed" surveillance tone. Write like New York Magazine's food coverage, not a press release.

NEVER use em dashes (the long dash, U+2014). Use commas, periods, colons, or semicolons. We will reject any output containing em dashes.

ARTICLE TITLE: ${spec.title}
${spec.subtitle ? `SUBTITLE: ${spec.subtitle}\n` : ""}EDITORIAL ANGLE: ${spec.angle}

THE RANKED LIST (top ${ranked.length}):
${lines}

Write 2 to 3 short paragraphs (about 140 to 200 words total) that set the editorial frame for this list. Tease 2 or 3 specific businesses by name with what makes them notable on social this quarter. Use a concrete number or specific signal, not generic praise. End with a forward-looking sentence that connects to next quarter's issue (Issue 02, Summer 2026).${underratedNudge}

Return ONLY the prose. No headers, no markdown, no quotation marks wrapping the response. Paragraphs separated by blank lines.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error(`No text block in Claude response for ${spec.slug}`);
  }
  return scrubEmDashes(block.text.trim());
}

/* ----------------------------- per-spec generator --------------------- */

async function generateList(
  client: Anthropic | null,
  spec: ListSpec,
  dryRun: boolean,
): Promise<{ written: boolean; reason?: string }> {
  const ranked = await queryBusinesses(spec.query);
  if (ranked.length === 0) {
    console.warn(
      `[generate-list] ${spec.slug}: query returned 0 results, skipping`,
    );
    return { written: false, reason: "query returned 0 results" };
  }

  console.log(
    `[generate-list] ${spec.slug}: ${ranked.length} results (limit was ${spec.query.limit})`,
  );
  for (const r of ranked) {
    console.log(
      `  ${r.rank}. ${r.business.artifact.business.name}  [${r.rankingValue.toFixed(2)}]`,
    );
  }

  if (dryRun) {
    return { written: false, reason: "dry-run" };
  }

  if (!client) throw new Error("client required when not dry-run");

  const intro = await generateIntro(client, spec, ranked);
  const items = ranked.map(buildItem);

  const article: ListArticle = {
    slug: spec.slug,
    title: spec.title,
    subtitle: spec.subtitle,
    angle: spec.angle,
    intro,
    items,
    query: spec.query,
    generated_at: new Date().toISOString(),
    model: MODEL,
  };

  const out = join(OUT_DIR, `${spec.slug}.json`);
  await writeFile(out, JSON.stringify(article, null, 2) + "\n", "utf-8");
  console.log(`[generate-list] wrote ${out}`);
  return { written: true };
}

/* ----------------------------- main ---------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targetSlug = args.find((a) => !a.startsWith("--")) ?? null;

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "[generate-list] ANTHROPIC_API_KEY not set in environment (use --dry-run to skip Claude calls)",
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  // Warm the rich-business cache once.
  const richCount = (await loadAllRichBusinesses()).length;
  console.log(`[generate-list] loaded ${richCount} businesses`);

  const client = dryRun
    ? null
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const targets = targetSlug
    ? LISTS.filter((l) => l.slug === targetSlug)
    : LISTS;

  if (targetSlug && targets.length === 0) {
    console.error(
      `[generate-list] no list with slug "${targetSlug}" in registry. Available: ${LISTS.map((l) => l.slug).join(", ")}`,
    );
    process.exit(1);
  }

  let written = 0;
  let skipped = 0;
  for (const spec of targets) {
    try {
      const result = await generateList(client, spec, dryRun);
      if (result.written) written++;
      else skipped++;
    } catch (err) {
      console.error(`[generate-list] ${spec.slug} failed:`, err);
      skipped++;
    }
  }

  console.log(
    `[generate-list] done. written=${written} skipped=${skipped}${dryRun ? " (dry-run)" : ""}`,
  );
}

main().catch((err) => {
  console.error("[generate-list] fatal:", err);
  process.exit(1);
});
