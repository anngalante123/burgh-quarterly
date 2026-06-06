#!/usr/bin/env tsx
/**
 * export-businesses.ts, dump one row per business with everything useful for
 * outreach / cold email personalization into a CSV.
 *
 * Pulls: identity + contact channels (website, IG), ranking (tier/rank/score,
 * INTERNAL only), reviews, Instagram stats, and the editorial analysis
 * (diagnosis, tldrs, themes, notable quote, playbook). One row per business.
 *
 * NOTE on scores: composite + subscores are INTERNAL. Per brand rules they
 * must never appear as raw numbers in public copy. Use them to TARGET and to
 * pick an angle; frame the email as "underrated" / "gap to next tier" / rank.
 *
 * Read-only. Writes one CSV under scripts/exports/.
 *
 * Usage: npx tsx scripts/export-businesses.ts
 */
import path from "node:path";
import fs from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();
import { eq, sql } from "drizzle-orm";
import { loadSocialBySlug } from "@/lib/data/load-social";

const SITE = "https://burgh-quarterly.vercel.app";
const ISSUE = "2026-spring";

function diagnosisLine(d: any): string {
  return d && typeof d === "object" ? (d.line ?? "") : (d ?? "");
}
function playbookText(p: any): string {
  if (!Array.isArray(p)) return "";
  return p.map((s: any) => `${s.headline ?? ""}: ${s.action ?? ""}`.trim()).join(" | ");
}
function themesText(t: any): string {
  if (!Array.isArray(t)) return "";
  return t.map((x: any) => `${x.phrase}${x.sentiment ? ` (${x.sentiment})` : ""}`).join("; ");
}
function themeQuotes(t: any): string {
  if (!Array.isArray(t)) return "";
  return t.map((x: any) => x.exampleQuote).filter(Boolean).join(" | ");
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "string" ? v : Array.isArray(v) ? v.join("; ") : JSON.stringify(v);
  s = s.replace(/\r?\n/g, " ").trim();
  if (/[",;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const { db, schema } = await import("@/lib/db/client");

  const businesses = await db.select().from(schema.businesses);
  const scores = await db.select().from(schema.scores).where(eq(schema.scores.issue_slug, ISSUE));
  const signals = await db.select().from(schema.businessSignals).where(eq(schema.businessSignals.issue_slug, ISSUE));
  const analyses = await db.select().from(schema.analyses).where(eq(schema.analyses.issue_slug, ISSUE));

  const scoreBy = new Map(scores.map((r) => [r.business_slug, r]));
  const sigBy = new Map(signals.map((r) => [r.business_slug, r]));
  const anaBy = new Map(analyses.map((r) => [r.business_slug, r]));

  const headers = [
    "name", "category", "neighborhood", "address", "website", "instagram_handle",
    "page_url", "tier", "rank_in_category", "composite_internal",
    "google_rating", "review_count", "five_star_pct",
    "ig_followers", "ig_posts_30d", "ig_engagement_rate",
    "sub_visual_catalog", "sub_review_sentiment", "sub_conversion_path", "sub_momentum", "sub_creator_fit",
    "diagnosis", "tldr_what_it_is", "tldr_what_it_means", "sentiment_summary",
    "themes", "review_quotes", "notable_quote", "playbook",
  ];

  const lines = [headers.join(",")];
  let withIg = 0;

  for (const b of businesses) {
    const sc: any = scoreBy.get(b.slug);
    const sig: any = sigBy.get(b.slug);
    const an: any = anaBy.get(b.slug);
    const social = loadSocialBySlug(b.slug);
    const ig: any = social?.ig ?? null;
    if (ig) withIg += 1;

    const subs = sc?.subscores ?? {};
    const dist = sig?.reviews_distribution;
    let fiveStar = "";
    if (dist) {
      const total = (dist.oneStar ?? 0) + (dist.twoStar ?? 0) + (dist.threeStar ?? 0) + (dist.fourStar ?? 0) + (dist.fiveStar ?? 0);
      if (total > 0) fiveStar = Math.round((100 * (dist.fiveStar ?? 0)) / total) + "%";
    }
    // rank in category if present on ranks jsonb
    const ranks = sc?.ranks ?? {};
    const rankInCat = ranks?.category?.rank ?? ranks?.categoryRank ?? "";

    const row = [
      b.name, b.category, b.neighborhood, b.address, b.website, ig?.handle ?? b.instagram ?? "",
      `${SITE}/business/${b.slug}`, sc?.tier ?? "", rankInCat, sc?.composite ?? "",
      sig?.google_rating ?? "", sig?.google_review_count ?? "", fiveStar,
      ig?.followers ?? "", ig?.posts_30d ?? "", ig?.avg_engagement_rate ?? "",
      subs.content_canvas ?? "", subs.community_spark ?? "", subs.conversion_path ?? "", subs.momentum ?? "", subs.collab_fit ?? "",
      diagnosisLine(an?.diagnosis_pullquote), an?.tldr_read ?? "", an?.tldr_meaning ?? "", an?.sentiment_summary ?? "",
      themesText(an?.themes), themeQuotes(an?.themes), an?.notable_quote ?? "", playbookText(an?.playbook),
    ].map(csvCell);
    lines.push(row.join(","));
  }

  const dir = path.join(process.cwd(), "scripts", "exports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(dir, `signal-businesses-${stamp}.csv`);
  fs.writeFileSync(out, lines.join("\n"));
  console.log(`[export] wrote ${businesses.length} rows to ${out}`);
  console.log(`[export] with website: ${businesses.filter((b) => b.website).length}, with IG data: ${withIg}, with analysis: ${analyses.length}`);
}

main().then(() => process.exit(0));
