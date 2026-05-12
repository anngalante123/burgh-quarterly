import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

const fixes: [string, string][] = [
  // [name_pattern_lowercased, new_name]
];

async function main() {
  // 1. Find the suspect rows first
  const rows = await sql`
    SELECT slug, name, address
    FROM businesses
    WHERE name ~ '[a-z][A-Z]'                          -- camelCase like GossipandNailSpa
       OR name ILIKE 'frenchies nail%'
       OR name = 'AF5287-Brentwood,PA'
       OR name ILIKE 'Sooo Delicious%'
       OR name = 'MrTakeOutBags.com'
    ORDER BY name
  ` as any[];
  console.log("Candidates:");
  for (const r of rows) console.log(`  ${r.slug}\t${r.name}`);

  // 2. Targeted hand-fixes (specific slugs only — no fuzzy regex updates)
  const updates: Array<{ slug: string; newName: string }> = [];
  for (const r of rows) {
    if (r.name === "GossipandNailSpa") updates.push({ slug: r.slug, newName: "Gossip and Nail Spa" });
    else if (/^Frenchies nail salon$/i.test(r.name)) updates.push({ slug: r.slug, newName: "Frenchie's Nail Salon" });
    else if (r.name === "Sooo Delicious Chicken & Waffles,Burgers & Fries") updates.push({ slug: r.slug, newName: "Sooo Delicious Chicken & Waffles, Burgers & Fries" });
    else if (r.name === "MrTakeOutBags.com") updates.push({ slug: r.slug, newName: "Mr. TakeOut Bags" });
  }

  console.log("\nProposed UPDATEs:");
  for (const u of updates) console.log(`  ${u.slug}: → "${u.newName}"`);

  if (process.argv.includes("--commit")) {
    for (const u of updates) {
      await sql`UPDATE businesses SET name = ${u.newName}, updated_at = NOW() WHERE slug = ${u.slug}`;
      console.log(`✓ ${u.slug}`);
    }
    console.log(`\nUpdated ${updates.length} rows.`);
  } else {
    console.log("\n(dry-run — pass --commit to write)");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
