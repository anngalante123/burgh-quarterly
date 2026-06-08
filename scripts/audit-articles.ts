#!/usr/bin/env tsx
/**
 * audit-articles.ts, fact-check every live list article against the current
 * database. For each item it compares the article's CITED stats (review count,
 * rating, tier, rank claims) to what the DB actually says today, and flags
 * mismatches. Read-only. Reports; changes nothing.
 *
 * Why: the article JSONs in content/lists/articles/ are static and were
 * generated before the latest rescore/refresh, so their numbers can drift
 * from the live data. A drifted number is a citation liability.
 *
 * Usage: npx tsx scripts/audit-articles.ts
 */
import path from "node:path";
import fs from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();
import { eq } from "drizzle-orm";

const ISSUE = "2026-spring";
const ARTICLES = path.join(process.cwd(), "content", "lists", "articles");
const TIER_LABEL: Record<string, string> = {
  icons: "icons",
  ones_to_watch: "ones to watch",
  neighborhood_staples: "neighborhood staple",
};

function num(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const OWN_POSTS_DIR = path.join(process.cwd(), "content", "raw", "own-posts");
const ownPostsCache = new Map<string, any[] | null>();
function ownPosts(slug: string): any[] | null {
  if (ownPostsCache.has(slug)) return ownPostsCache.get(slug)!;
  const f = path.join(OWN_POSTS_DIR, `${slug}.json`);
  let result: any[] | null = null;
  if (fs.existsSync(f)) {
    try {
      result = JSON.parse(fs.readFileSync(f, "utf8")).items ?? [];
    } catch {
      result = null;
    }
  }
  ownPostsCache.set(slug, result);
  return result;
}

const TIKTOK_DIR = path.join(process.cwd(), "content", "raw", "tiktok");
let _tiktokIds: Set<string> | null = null;
function tiktokIds(): Set<string> {
  if (_tiktokIds) return _tiktokIds;
  const ids = new Set<string>();
  if (fs.existsSync(TIKTOK_DIR)) {
    for (const f of fs.readdirSync(TIKTOK_DIR).filter((f) => f.endsWith(".json"))) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(TIKTOK_DIR, f), "utf8"));
        const items = Array.isArray(d) ? d : d.items ?? d.videos ?? [];
        for (const v of items) {
          if (v.id) ids.add(String(v.id));
          const m = (v.webVideoUrl || "").match(/video\/(\d+)/);
          if (m) ids.add(m[1]);
        }
      } catch {
        /* skip */
      }
    }
  }
  _tiktokIds = ids;
  return ids;
}

async function main() {
  const { db, schema } = await import("@/lib/db/client");
  const sigs = await db.select().from(schema.businessSignals).where(eq(schema.businessSignals.issue_slug, ISSUE));
  const scores = await db.select().from(schema.scores).where(eq(schema.scores.issue_slug, ISSUE));
  const biz = await db.select().from(schema.businesses);
  const sigBy = new Map(sigs.map((r: any) => [r.business_slug, r]));
  const scoreBy = new Map(scores.map((r: any) => [r.business_slug, r]));
  const bizSet = new Set(biz.map((b: any) => b.slug));

  const files = fs.readdirSync(ARTICLES).filter((f) => f.endsWith(".json"));
  let totalIssues = 0;
  const summary: Array<{ article: string; items: number; issues: number }> = [];

  for (const file of files.sort()) {
    const slug = file.replace(/\.json$/, "");
    const art = JSON.parse(fs.readFileSync(path.join(ARTICLES, file), "utf8"));
    const items = art.items ?? [];
    const problems: string[] = [];

    for (const it of items) {
      const bslug = it.business_slug;
      if (!bslug) continue; // post-only items (loudest-feeds) still have business_slug
      if (!bizSet.has(bslug)) {
        problems.push(`  [${it.rank}] ${bslug}: business NOT in DB`);
        continue;
      }
      const sig: any = sigBy.get(bslug);
      const sc: any = scoreBy.get(bslug);
      const statline: string = it.stat_line ?? "";
      const descriptor: string = (it.descriptor ?? "") + " " + (it.descriptor_highlight ?? "");

      // 1) review count in stat_line vs DB
      const mReviews = statline.match(/([\d,]+)\s*reviews/i);
      if (mReviews) {
        const cited = num(mReviews[1]);
        const real = sig?.google_review_count ?? null;
        if (cited != null && real != null && Math.abs(cited - real) > 1) {
          problems.push(`  [${it.rank}] ${bslug}: review count cited ${cited} vs DB ${real}`);
        }
      }
      // 2) rating in stat_line vs DB
      const mRating = statline.match(/(\d\.\d)\s*[★*]/);
      if (mRating) {
        const cited = num(mRating[1]);
        const real = sig?.google_rating ?? null;
        if (cited != null && real != null && Math.abs(cited - real) > 0.05) {
          problems.push(`  [${it.rank}] ${bslug}: rating cited ${cited} vs DB ${real}`);
        }
      }
      // 3) tier claim in descriptor vs DB
      const dlow = descriptor.toLowerCase();
      for (const [tierKey, label] of Object.entries(TIER_LABEL)) {
        if (dlow.includes(label)) {
          if (sc && sc.tier !== tierKey) {
            problems.push(`  [${it.rank}] ${bslug}: descriptor says "${label}" but DB tier is ${sc.tier}`);
          }
        }
      }
      // NOTE: rank claims ("142nd in Pittsburgh cafes") are intentionally NOT
      // checked. Descriptors rank by varying dimensions (composite, social/feed,
      // momentum), not a single field, so there is no reliable ground truth to
      // compare against without per-article rank logic. Verify by hand.

      // 4) IG post engagement (likes/comments) vs the scraped own-post source.
      //    IG shortCodes are short alphanumeric (e.g. "DWEaqRblfy_"); TikTok ids
      //    are long numeric and live in content/raw/tiktok, so route by type.
      const vid: string | undefined = it.video_id || it.video?.video_id;
      const isTikTok = !!vid && /^\d{15,}$/.test(vid);
      if (vid && !isTikTok && (it.likes != null || it.comments != null)) {
        const op = ownPosts(bslug);
        const post = op?.find((p: any) => p.shortCode === vid);
        if (op && !post) {
          problems.push(`  [${it.rank}] ${bslug}: IG post ${vid} not in scraped own-posts`);
        } else if (post) {
          if (it.likes != null && post.likesCount != null && it.likes !== post.likesCount) {
            problems.push(`  [${it.rank}] ${bslug}: post likes cited ${it.likes} vs source ${post.likesCount}`);
          }
          if (it.comments != null && post.commentsCount != null && it.comments !== post.commentsCount) {
            problems.push(`  [${it.rank}] ${bslug}: post comments cited ${it.comments} vs source ${post.commentsCount}`);
          }
        }
      }
      // 5) TikTok existence: cited creator-video id should be in our tiktok data
      const ttId: string | undefined = (it.featured_tiktok?.url || it.video_url || "").match(/video\/(\d+)/)?.[1] || (isTikTok ? vid : undefined);
      if (ttId && !tiktokIds().has(ttId)) {
        problems.push(`  [${it.rank}] ${bslug}: cited TikTok ${ttId} not in our scraped tiktok data`);
      }
    }

    if (problems.length) {
      console.log(`\n### ${slug} (${items.length} items): ${problems.length} issue(s)`);
      problems.forEach((p) => console.log(p));
    }
    totalIssues += problems.length;
    summary.push({ article: slug, items: items.length, issues: problems.length });
  }

  console.log(`\n========== AUDIT SUMMARY ==========`);
  for (const s of summary) console.log(`${s.issues > 0 ? "FLAG" : "ok  "}  ${s.article}: ${s.items} items, ${s.issues} issues`);
  console.log(`\nTotal flagged claims: ${totalIssues}`);
}

main().then(() => process.exit(0));
