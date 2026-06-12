/**
 * Read-only verification of the 9 data-audit claims (P0/P1/P2) from the
 * 2026-06 audit. Queries Neon + scans content/social/*.json. No writes.
 *
 * Run: node --env-file=.env.local --import tsx scripts/verify-audit-claims.ts
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const sql = neon(process.env.DATABASE_URL!);

function h(title: string) {
  console.log("\n" + "=".repeat(70) + "\n" + title + "\n" + "=".repeat(70));
}

async function main() {
  // ---------- CLAIM 1: ratings coverage ----------
  h("CLAIM 1: Google ratings exist for only ~30 businesses");
  console.log(await sql`
    select
      (select count(*) from businesses) as total_businesses,
      (select count(*) from business_signals where google_rating is not null) as signals_with_rating,
      (select count(*) from business_signals where google_review_count is not null and google_review_count > 0) as signals_with_reviews,
      (select count(distinct business_slug) from business_reviews) as businesses_with_review_rows,
      (select count(*) from business_signals) as signal_rows
  `);

  // ---------- CLAIM 2: posts_30d clipped at 12 ----------
  h("CLAIM 2: posts_30d clipped at 12 (DB posts_last_30 distribution, top 8)");
  console.log(await sql`
    select posts_last_30, count(*) from business_signals
    where posts_last_30 is not null
    group by 1 order by posts_last_30 desc nulls last limit 8
  `);

  console.log("\n-- social JSON posts_30d distribution (top values) --");
  const socialDir = path.join(process.cwd(), "content/social");
  const files = fs.readdirSync(socialDir).filter((f) => f.endsWith(".json"));
  type Snap = {
    slug?: string; handle?: string; followers?: number; posts_30d?: number;
    avg_engagement_rate?: number; scraped_at?: string; last_post_at?: string;
  };
  const snaps: Snap[] = files.map((f) =>
    JSON.parse(fs.readFileSync(path.join(socialDir, f), "utf8")),
  );
  const dist = new Map<number, number>();
  for (const s of snaps) {
    if (typeof s.posts_30d === "number")
      dist.set(s.posts_30d, (dist.get(s.posts_30d) ?? 0) + 1);
  }
  const sorted = [...dist.entries()].sort((a, b) => b[0] - a[0]);
  console.log("total social files:", files.length);
  console.log("max posts_30d:", sorted[0]?.[0]);
  console.log("top of distribution:", sorted.slice(0, 8));

  // ---------- CLAIM 3: engagement rate unbounded ----------
  h("CLAIM 3: engagement rate unvalidated/unbounded");
  const withEng = snaps.filter((s) => typeof s.avg_engagement_rate === "number");
  const over100 = withEng.filter((s) => s.avg_engagement_rate! >= 1);
  const tinyHot = withEng.filter(
    (s) => (s.followers ?? 0) <= 20 && s.avg_engagement_rate! >= 1,
  );
  const top = [...withEng]
    .sort((a, b) => b.avg_engagement_rate! - a.avg_engagement_rate!)
    .slice(0, 8)
    .map((s) => ({
      slug: s.slug, followers: s.followers,
      eng_pct: Math.round(s.avg_engagement_rate! * 10000) / 100,
    }));
  console.log("accounts with engagement value:", withEng.length);
  console.log("accounts at >=100% engagement:", over100.length);
  console.log("accounts with <=20 followers AND >=100%:", tinyHot.length);
  console.log("top 8 raw values (eng_pct = %):", top);

  // ---------- CLAIM 4: chain detection misses ----------
  h("CLAIM 4: chains in DB (Raising Cane's, Ross, Fresh Market, Melting Pot, City Works)");
  console.log(await sql`
    select slug, name, category from businesses
    where name ilike '%raising cane%' or name ilike '%ross dress%'
       or name ilike '%fresh market%' or name ilike '%melting pot%'
       or name ilike '%city works%' or name ilike '%starbucks%'
       or name ilike '%mcdonald%'
    order by name
  `);

  // ---------- CLAIM 5: multi-location duplicates ----------
  h("CLAIM 5: duplicate slugs sharing one IG handle");
  console.log(await sql`
    select instagram, count(*) as n, array_agg(slug order by slug) as slugs
    from businesses
    where instagram is not null and instagram != ''
    group by instagram having count(*) > 1
    order by n desc limit 15
  `);
  console.log("\n-- the four named businesses --");
  console.log(await sql`
    select slug, name, instagram from businesses
    where slug ilike 'la-gourmandine%' or slug ilike '%mecka%'
       or slug ilike '%slice-on-broadway%' or slug ilike '%noxs%'
    order by slug
  `);

  // ---------- CLAIM 6: sentiment sample size ----------
  h("CLAIM 6: sentiment reads ~7-10 reviews, not the corpus");
  console.log(await sql`
    select b.slug, s.google_review_count,
           (select count(*) from business_reviews r where r.business_slug = b.slug) as stored_reviews,
           a.review_count as analysis_review_count
    from businesses b
    left join business_signals s on s.business_slug = b.slug
    left join analyses a on a.business_slug = b.slug
    where b.slug ilike 'page%dairy%' or b.name ilike '%page%dairy%'
  `);
  console.log("\n-- corpus-wide: stored reviews per business vs google count --");
  console.log(await sql`
    select
      avg(sub.stored)::numeric(10,1) as avg_stored_reviews,
      percentile_cont(0.5) within group (order by sub.stored) as median_stored,
      max(sub.stored) as max_stored,
      avg(a.review_count)::numeric(10,1) as avg_analysis_review_count
    from (
      select business_slug, count(*) as stored from business_reviews group by 1
    ) sub
    left join analyses a on a.business_slug = sub.business_slug
  `);

  // ---------- CLAIM 7: social-only profiles lack geo/category ----------
  h("CLAIM 7: non-curated businesses lack neighborhood/category/address");
  console.log(await sql`
    select
      count(*) filter (where neighborhood is null or neighborhood = '' or neighborhood ilike 'pittsburgh') as missing_or_generic_neighborhood,
      count(*) filter (where address is null or address = '') as missing_address,
      count(*) filter (where category is null) as missing_category,
      count(*) as total
    from businesses
  `);
  console.log("\n-- neighborhood top values --");
  console.log(await sql`
    select coalesce(nullif(neighborhood,''),'(empty)') as neighborhood, count(*)
    from businesses group by 1 order by 2 desc limit 10
  `);
  console.log("\n-- category distribution --");
  console.log(await sql`
    select category, count(*) from businesses group by 1 order by 2 desc
  `);

  // ---------- CLAIM 8: scrape freshness split ----------
  h("CLAIM 8: scraped_at split (curated vs broad)");
  const dates = new Map<string, number>();
  for (const s of snaps) {
    const d = (s.scraped_at ?? "unknown").slice(0, 10);
    dates.set(d, (dates.get(d) ?? 0) + 1);
  }
  console.log("social JSON scraped_at by day:", [...dates.entries()].sort());
  console.log("\n-- DB business_signals.scraped_at by day --");
  console.log(await sql`
    select date(scraped_at) as day, count(*) from business_signals
    group by 1 order by 1
  `);

  // ---------- CLAIM 9: dirty names + miscategorization ----------
  h("CLAIM 9: dirty name fields & category mislabels");
  console.log(await sql`
    select slug, name from businesses
    where name ~ '[^\x00-\x7F]'
    order by slug limit 20
  `);
  console.log("\n-- count of non-ASCII names --");
  console.log(await sql`select count(*) from businesses where name ~ '[^\x00-\x7F]'`);
  console.log("\n-- Jeni's and Everyday Noodles categories --");
  console.log(await sql`
    select slug, name, category from businesses
    where name ilike '%jeni%' or name ilike '%everyday noodle%'
  `);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
