/** Follow-up checks for claims 1, 5, 6, 9. Read-only. */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("== CLAIM 1 follow-up: keyword coverage + social-slug overlap ==");
  console.log(await sql`
    select
      (select count(distinct business_slug) from business_review_keywords) as slugs_with_keywords,
      (select count(distinct business_slug) from business_reviews where text is not null and text != '') as slugs_with_review_text
  `);

  const socialDir = path.join(process.cwd(), "content/social");
  const socialSlugs = fs.readdirSync(socialDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  const inDb = await sql`
    select count(*) as social_slugs_in_db,
           count(*) filter (where s.google_rating is not null) as with_rating
    from businesses b
    left join business_signals s on s.business_slug = b.slug
    where b.slug = any(${socialSlugs})
  `;
  console.log("social JSON slugs:", socialSlugs.length, inDb);

  console.log("\n== curated content/businesses file count ==");
  const bizDir = path.join(process.cwd(), "content/businesses");
  console.log(fs.existsSync(bizDir) ? fs.readdirSync(bizDir).filter(f => f.endsWith(".json")).length : "no dir");

  console.log("\n== CLAIM 5 follow-up: IG handles in social JSONs for the four names ==");
  for (const slug of socialSlugs) {
    if (/la-gourmandine|mecka|slice-on-broadway|noxs/.test(slug)) {
      const d = JSON.parse(fs.readFileSync(path.join(socialDir, slug + ".json"), "utf8"));
      console.log(slug, "-> handle:", d.handle, "followers:", d.followers);
    }
  }

  console.log("\n== CLAIM 6 follow-up: find Page's ==");
  console.log(await sql`
    select b.slug, b.name, s.google_review_count,
           (select count(*) from business_reviews r where r.business_slug = b.slug) as stored_reviews,
           a.review_count as analysis_review_count
    from businesses b
    left join business_signals s on s.business_slug = b.slug
    left join analyses a on a.business_slug = b.slug
    where b.name ilike '%page%'
    limit 10
  `);
  console.log("\n-- how many businesses have google_review_count far above stored reviews --");
  console.log(await sql`
    select count(*) filter (where s.google_review_count > 100) as over_100_google_reviews,
           count(*) filter (where s.google_review_count > 1000) as over_1000
    from business_signals s
  `);

  console.log("\n== CLAIM 9 follow-up: non-ASCII names ==");
  console.log(await sql`
    select slug, name from businesses where name !~ '^[ -~]*$' order by slug limit 20
  `);
  console.log(await sql`
    select count(*) as non_ascii_names from businesses where name !~ '^[ -~]*$'
  `);
  console.log("\n-- Jeni's / Everyday Noodles --");
  console.log(await sql`
    select slug, name, category from businesses
    where name ilike '%jeni%' or name ilike '%everyday noodle%'
  `);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
