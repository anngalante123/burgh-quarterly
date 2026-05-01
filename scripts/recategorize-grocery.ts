import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Verification helper: print all grocery rows and the full category breakdown.
 * This file was originally the one-shot re-categorize script for the two
 * Phase 3 mislabels; idempotent on re-run.
 */
async function main() {
  const targets = ["save-mor-beer-pop-warehouse", "squirrel-hill-market"];
  for (const slug of targets) {
    const before = await db
      .select({
        slug: businesses.slug,
        name: businesses.name,
        category: businesses.category,
      })
      .from(businesses)
      .where(eq(businesses.slug, slug));
    if (before.length === 0) {
      console.log(`SKIP: ${slug} not found`);
      continue;
    }
    if (before[0].category !== "grocery") {
      await db
        .update(businesses)
        .set({ category: "grocery" })
        .where(eq(businesses.slug, slug));
      console.log(`updated ${slug} -> grocery`);
    } else {
      console.log(`already grocery: ${slug}`);
    }
  }
  const counts = await db.execute(
    sql`select category, count(*)::int as n from businesses group by category order by category`,
  );
  console.log("category counts:");
  console.log(counts.rows);

  const groceryRows = await db
    .select({
      slug: businesses.slug,
      name: businesses.name,
      category: businesses.category,
    })
    .from(businesses)
    .where(eq(businesses.category, "grocery"));
  console.log("grocery rows:");
  console.log(groceryRows);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
