/* eslint-disable no-console */
/**
 * Quick audit: count rows in analyses where any other banned phrase appears
 * in editorial text fields (not notable_quote, that's verbatim customer text).
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const PATTERNS: Array<{ name: string; pat: string }> = [
  { name: "punching above", pat: "punching above" },
  { name: "moving the needle", pat: "moving the needle" },
  { name: "leverage", pat: "\\mleverag" }, // leverage, leveraging, leveraged
  { name: "amplify", pat: "\\mamplif" }, // amplify, amplifying, amplified, amplifies
  { name: "organic growth", pat: "organic growth" },
  { name: "organic attention", pat: "organic attention" },
  { name: "organic reach", pat: "organic reach" },
];

async function main() {
  for (const { name, pat } of PATTERNS) {
    const rows = (await sql`
      SELECT COUNT(*)::int AS n FROM analyses
      WHERE playbook::text ~* ${pat}
        OR diagnosis_pullquote::text ~* ${pat}
        OR (tldr_read IS NOT NULL AND tldr_read ~* ${pat})
        OR (tldr_meaning IS NOT NULL AND tldr_meaning ~* ${pat})
        OR (sentiment_summary IS NOT NULL AND sentiment_summary ~* ${pat})
        OR (themes IS NOT NULL AND themes::text ~* ${pat})
        OR (quarter_narrative IS NOT NULL AND quarter_narrative ~* ${pat})
    `) as Array<{ n: number }>;
    console.log(`${name.padEnd(22)} ${rows[0].n} rows`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
