/**
 * Hand-fix the Title Case tier names in analyses.diagnosis_pullquote that
 * rename-tiers-prose.ts deliberately leaves alone (its header explains why:
 * "Ones To Watch" often follows "In", so a blind swap yields "In In the
 * Conversation"). 34 rows (issue 2026-spring), all in the jsonb `line` field.
 *
 * Replacements, applied longest/most-specific first so the preposition
 * collisions resolve correctly (verified by reading all 5 "Ones To Watch"
 * headlines):
 *   "To Ones To Watch" -> "Into the Conversation"   (grille-565: "Carries Grille 565 Into the Conversation")
 *   "In Ones To Watch" -> "In the Conversation"      (rival: "Solid Footing In the Conversation")
 *   "Ones To Watch"    -> "In the Conversation"      (standalone)
 *   "Icons Tier"       -> "Talk of the Town"         (29 rows, uniform)
 *
 * jsonb-safe: all patterns/replacements are ASCII letters + spaces, no
 * quotes/braces/backslashes, so a text-level replace inside serialized JSON
 * cannot break validity (same guarantee rename-tiers-prose.ts relies on).
 *
 * Dry-run by default. Pass --execute to write.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
const sql = neon(process.env.DATABASE_URL!);
const EXECUTE = process.argv.includes("--execute");
const ISSUE = "2026-spring";

const CHAIN: ReadonlyArray<readonly [string, string]> = [
  ["To Ones To Watch", "Into the Conversation"],
  ["In Ones To Watch", "In the Conversation"],
  ["Ones To Watch", "In the Conversation"],
  ["Icons Tier", "Talk of the Town"],
];

function lit(s: string) { return `'${s.replace(/'/g, "''")}'`; }

async function main() {
  console.log(EXECUTE ? "EXECUTE mode\n" : "DRY-RUN (pass --execute to write)\n");

  const before = (await sql`
    select business_slug, diagnosis_pullquote::text t from analyses
    where issue_slug = ${ISSUE}
      and (diagnosis_pullquote::text ilike '%Ones To Watch%'
        or diagnosis_pullquote::text ilike '%Icons Tier%')
  `) as { business_slug: string; t: string }[];
  console.log(`rows to fix: ${before.length}`);

  // Preview the transformed `line` for each row.
  const apply = (s: string) => CHAIN.reduce((acc, [f, to]) => acc.split(f).join(to), s);
  for (const r of before.slice(0, 40)) {
    const line = JSON.parse(r.t).line as string;
    console.log(`  ${r.business_slug}\n    - ${line}\n    + ${apply(line)}`);
  }

  if (!EXECUTE) { console.log("\nDry-run complete. No writes."); return; }

  // Nested replace() over ::text, cast back to jsonb. Longest-first order.
  let expr = "diagnosis_pullquote::text";
  for (const [f, to] of CHAIN) expr = `replace(${expr}, ${lit(f)}, ${lit(to)})`;
  const updated = await sql.query(
    `update analyses set diagnosis_pullquote = (${expr})::jsonb
     where issue_slug = ${lit(ISSUE)}
       and (diagnosis_pullquote::text ilike '%Ones To Watch%'
         or diagnosis_pullquote::text ilike '%Icons Tier%')
     returning business_slug`,
  );
  console.log(`\nupdated ${updated.length} rows`);

  const remain = await sql`
    select count(*)::int n from analyses
    where issue_slug = ${ISSUE}
      and (diagnosis_pullquote::text ilike '%Ones To Watch%'
        or diagnosis_pullquote::text ilike '%Icons Tier%')
  ` as { n: number }[];
  console.log("remaining Title-Case pullquote rows (want 0):", remain[0].n);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
