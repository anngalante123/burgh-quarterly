#!/usr/bin/env tsx
/**
 * analyze-reviews, Claude pass over each business's review texts.
 *
 * Reads content/businesses/*.json, extracts _meta.reviewTexts, calls
 * Claude once per business, writes content/review-analysis/{slug}.json.
 *
 * Skips any business whose analysis file already exists (idempotent).
 * Skips any business with fewer than 2 review texts.
 *
 * Requires ANTHROPIC_API_KEY in .env.local.
 *
 * Run:
 *   npx tsx scripts/analyze-reviews.ts                # all businesses
 *   npx tsx scripts/analyze-reviews.ts <slug>         # one business
 *   npx tsx scripts/analyze-reviews.ts --force <slug> # overwrite cache
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadEnv } from "dotenv";

// Load .env.local first (repo-local), then .env (fallback).
loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const BUSINESSES_DIR = join(process.cwd(), "content", "businesses");
const ANALYSIS_DIR = join(process.cwd(), "content", "review-analysis");
const MODEL = "claude-sonnet-4-6";

type ReviewTheme = {
  phrase: string;
  frequency: number;
  sentiment: "positive" | "neutral" | "negative";
  exampleQuote?: string;
};

type ReviewAnalysis = {
  slug: string;
  themes: ReviewTheme[];
  sentiment_summary: string;
  notable_quote: string;
  review_count: number;
  analyzed_at: string;
  model: string;
};

async function analyzeOne(
  client: Anthropic,
  name: string,
  neighborhood: string,
  category: string,
  reviews: string[],
): Promise<Omit<ReviewAnalysis, "slug" | "analyzed_at" | "model">> {
  const prompt = `You are analyzing ${reviews.length} customer reviews of ${name}, a ${category} in ${neighborhood} (Pittsburgh, PA).

Return ONLY a valid JSON object with this exact shape:
{
  "themes": [
    {"phrase": "short 2-5 word phrase", "frequency": approximate_count, "sentiment": "positive" | "neutral" | "negative", "exampleQuote": "short quote that illustrates"}
  ],
  "sentiment_summary": "one sentence describing what reviewers love and what they nitpick, specific, not generic",
  "notable_quote": "one short quote from the reviews that captures the business's appeal"
}

Rules:
- Keep phrases specific ("morning pastry case", "Liège waffle", "busy weekends"), not generic ("food", "service").
- Return 3-6 themes, ranked by frequency descending.
- Sentiment reflects the theme, not overall vibe: "busy weekends" could be negative (too crowded) or positive (popular).
- exampleQuote should be short, one sentence max, lightly cleaned of typos but preserve the voice.
- Return pure JSON. No markdown, no prose outside the JSON.

Reviews:
${reviews.map((r, i) => `${i + 1}. "${r}"`).join("\n")}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`No text block in Claude response for ${name}`);
  }
  let json = textBlock.text.trim();
  // Strip code fences if Claude wraps the JSON despite the instruction
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const parsed = JSON.parse(json) as Omit<
    ReviewAnalysis,
    "slug" | "analyzed_at" | "model"
  > & { review_count?: number };
  return {
    themes: parsed.themes,
    sentiment_summary: parsed.sentiment_summary,
    notable_quote: parsed.notable_quote,
    review_count: reviews.length,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[analyze-reviews] ANTHROPIC_API_KEY not set in environment");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const targetSlug = args.find((a) => !a.startsWith("--")) ?? null;

  await mkdir(ANALYSIS_DIR, { recursive: true });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const files = (await readdir(BUSINESSES_DIR)).filter((f) =>
    f.endsWith(".json"),
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    if (targetSlug && slug !== targetSlug) continue;

    const outPath = join(ANALYSIS_DIR, `${slug}.json`);
    if (!force && existsSync(outPath)) {
      console.log(`[skip] ${slug}, cached`);
      skipped++;
      continue;
    }

    const raw = await readFile(join(BUSINESSES_DIR, file), "utf-8");
    const record = JSON.parse(raw);
    const reviews: string[] = record._meta?.reviewTexts ?? [];
    if (reviews.length < 2) {
      console.log(`[skip] ${slug}, only ${reviews.length} review(s)`);
      skipped++;
      continue;
    }

    try {
      console.log(`[call] ${slug}, ${reviews.length} reviews`);
      const analysis = await analyzeOne(
        client,
        record.name,
        record.neighborhood,
        record._meta?.categoryName ?? record.category,
        reviews,
      );
      const full: ReviewAnalysis = {
        slug,
        ...analysis,
        analyzed_at: new Date().toISOString(),
        model: MODEL,
      };
      await writeFile(outPath, JSON.stringify(full, null, 2), "utf-8");
      console.log(
        `[ok]   ${slug}, ${analysis.themes.length} themes · ${analysis.review_count} reviews`,
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
