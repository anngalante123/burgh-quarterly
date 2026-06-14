#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * rename-tiers-prose.ts, rename tier display names inside generated prose.
 *
 * The tier DB enum keys (icons, ones_to_watch, neighborhood_staples) are
 * unchanged. Only the human-readable names inside Claude-generated prose
 * move:
 *
 *   "Icons of the Burgh"   -> "Talk of the Town"
 *   "Ones to Watch"        -> "In the Conversation"
 *   "Neighborhood Staples" -> "Word of Mouth"
 *
 * Targets the `analyses` table for issue 2026-spring (text columns
 * tldr_read, tldr_meaning, sentiment_summary, quarter_narrative,
 * notable_quote; jsonb columns diagnosis_pullquote, playbook, themes).
 * Also surveys scores, underrated_lists, and features for old names;
 * execute touches only the trivially safe TEXT columns of
 * underrated_lists (title, intro) and features (headline, dek, body_mdx).
 * Jsonb columns on those other tables are reported, never updated.
 *
 * Modes:
 *   npx tsx scripts/rename-tiers-prose.ts
 *       SURVEY (default). Read-only, zero writes. Prints per-column
 *       occurrence and row counts for every variant, sample sentences,
 *       awkward-grammar counts ("a Ones to Watch" would become
 *       "a In the Conversation" without the article fixup), the
 *       bare-Icons report, and a simulated post-execute remainder.
 *
 *   npx tsx scripts/rename-tiers-prose.ts --execute --backup-done
 *       EXECUTE. Runs per-column UPDATEs with replace() chains, longest
 *       pattern first, on matching rows only. Refuses to run without
 *       --backup-done (run scripts/backup-analyses.ts first).
 *
 *   Optional: --include-bare-icons
 *       Adds the riskiest patterns ("Icons tier", "the Icons ",
 *       "The Icons ") to the execute chain, applied ONLY to the five
 *       analyses prose text columns. Default is OFF: survey first,
 *       let a human veto.
 *
 *   Optional: --include-lowercase-staples
 *       Adds lowercase "neighborhood staple(s)" to the execute chain.
 *       Default is OFF because the survey showed these are almost all
 *       generic English ("doing what neighborhood staples do best"),
 *       including one verbatim customer quote in notable_quote and
 *       review-theme phrases in themes, not tier references.
 *
 * Replacement order (longest first so partial hits cannot occur):
 *   1. "Icons of the Burgh"  -> "Talk of the Town"   (and lowercase form)
 *   2. "Ones to Watch"       -> "In the Conversation" (and lowercase form)
 *   3. fixup AFTER the swap: "a In the Conversation" -> "an In the
 *      Conversation" (also sentence-start "A In the Conversation")
 *   4. "Neighborhood Staples" -> "Word of Mouth"
 *   5. "Neighborhood Staple" (singular) -> "Word of Mouth business".
 *      "a Word of Mouth" keeps the correct article "a", so no fixup
 *      is needed for this family.
 *   6. (only with --include-lowercase-staples) lowercase plural then
 *      singular -> same capitalized forms as 4 and 5.
 *   7. (only with --include-bare-icons) "Icons tier" -> "Talk of the
 *      Town tier"; "the Icons " / "The Icons " (trailing space) ->
 *      "the Talk of the Town " / "The Talk of the Town ".
 *
 * NEVER replaced (report-only, surfaced by the survey): Title Case
 * forms "Icons Tier" and "Ones To Watch" found in diagnosis_pullquote
 * headline lines. "Ones To Watch" often follows the preposition "In"
 * ("Solid Footing In Ones To Watch"), and a blind swap would produce
 * the double-preposition "In In the Conversation". Those rows need a
 * human pass or a pullquote regeneration.
 *
 * Jsonb safety assumption: jsonb columns are updated via
 * (col::text <replace chain>)::jsonb, guarded by WHERE col::text LIKE
 * matches. This is safe because every search pattern and every
 * replacement string here contains only ASCII letters and spaces, no
 * double quotes, no backslashes, no braces or brackets, and no control
 * characters, so a text-level replace inside serialized JSON cannot
 * break JSON validity or alter structure, only string contents.
 *
 * Env loading: this script intentionally does NOT import lib/db/client
 * (which throws at import time when DATABASE_URL is unset). dotenv runs
 * first, then the neon client is constructed inside main(), mirroring
 * the load-env-before-db pattern in scripts/scout-comment-defense.ts.
 */

import path from "node:path";
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

/* ------------------------------ CLI flags ------------------------------ */

const EXECUTE = process.argv.includes("--execute");
const BACKUP_DONE = process.argv.includes("--backup-done");
const INCLUDE_BARE_ICONS = process.argv.includes("--include-bare-icons");
const INCLUDE_LOWERCASE_STAPLES = process.argv.includes(
  "--include-lowercase-staples",
);

const ISSUE = "2026-spring";

/* ------------------------------- columns ------------------------------- */

type ColumnSpec = {
  table: string;
  column: string;
  jsonb: boolean;
  /** scope updates and counts to issue_slug = ISSUE */
  issueScoped: boolean;
  /** included in --execute */
  updatable: boolean;
  /** prose column: eligible for the bare-Icons chain */
  prose: boolean;
  /** SQL expression identifying a sample row */
  idExpr: string;
};

const ANALYSES_TEXT = [
  "tldr_read",
  "tldr_meaning",
  "sentiment_summary",
  "quarter_narrative",
  "notable_quote",
] as const;
const ANALYSES_JSONB = ["diagnosis_pullquote", "playbook", "themes"] as const;

const COLUMNS: ColumnSpec[] = [
  ...ANALYSES_TEXT.map((c) => ({
    table: "analyses",
    column: c,
    jsonb: false,
    issueScoped: true,
    updatable: true,
    prose: true,
    idExpr: "business_slug",
  })),
  ...ANALYSES_JSONB.map((c) => ({
    table: "analyses",
    column: c,
    jsonb: true,
    issueScoped: true,
    updatable: true,
    prose: false,
    idExpr: "business_slug",
  })),
  /* ---- other tables: survey always; execute only trivially safe text ---- */
  { table: "scores", column: "subscores", jsonb: true, issueScoped: false, updatable: false, prose: false, idExpr: "business_slug" },
  { table: "scores", column: "movement", jsonb: true, issueScoped: false, updatable: false, prose: false, idExpr: "business_slug" },
  { table: "scores", column: "unfair_advantage", jsonb: true, issueScoped: false, updatable: false, prose: false, idExpr: "business_slug" },
  { table: "underrated_lists", column: "title", jsonb: false, issueScoped: false, updatable: true, prose: false, idExpr: "'list#' || id::text" },
  { table: "underrated_lists", column: "intro", jsonb: false, issueScoped: false, updatable: true, prose: false, idExpr: "'list#' || id::text" },
  { table: "underrated_lists", column: "entries", jsonb: true, issueScoped: false, updatable: false, prose: false, idExpr: "'list#' || id::text" },
  { table: "features", column: "headline", jsonb: false, issueScoped: false, updatable: true, prose: false, idExpr: "business_slug" },
  { table: "features", column: "dek", jsonb: false, issueScoped: false, updatable: true, prose: false, idExpr: "business_slug" },
  { table: "features", column: "body_mdx", jsonb: false, issueScoped: false, updatable: true, prose: false, idExpr: "business_slug" },
  { table: "features", column: "credits", jsonb: true, issueScoped: false, updatable: false, prose: false, idExpr: "business_slug" },
  { table: "features", column: "movement", jsonb: true, issueScoped: false, updatable: false, prose: false, idExpr: "business_slug" },
];

/* ------------------------------ patterns ------------------------------- */

/** Replacement chain, applied in array order (longest first). */
const BASE_CHAIN: ReadonlyArray<readonly [string, string]> = [
  ["Icons of the Burgh", "Talk of the Town"],
  ["icons of the burgh", "Talk of the Town"],
  ["Ones to Watch", "In the Conversation"],
  ["ones to watch", "In the Conversation"],
  /* article fixups, AFTER the Ones-to-Watch swap */
  ["a In the Conversation", "an In the Conversation"],
  ["A In the Conversation", "An In the Conversation"],
  ["Neighborhood Staples", "Word of Mouth"],
  ["Neighborhood Staple", "Word of Mouth business"],
];

/** Lowercase staples: only with --include-lowercase-staples. The survey
 *  showed these are mostly generic English, not tier references. */
const LOWERCASE_STAPLES_CHAIN: ReadonlyArray<readonly [string, string]> = [
  ["neighborhood staples", "Word of Mouth"],
  ["neighborhood staple", "Word of Mouth business"],
];

/** Riskiest patterns: only with --include-bare-icons, only prose columns. */
const BARE_ICONS_CHAIN: ReadonlyArray<readonly [string, string]> = [
  ["Icons tier", "Talk of the Town tier"],
  ["the Icons ", "the Talk of the Town "],
  ["The Icons ", "The Talk of the Town "],
];

/** LHS patterns that can exist BEFORE the swap (fixup LHS excluded). */
const BASE_MATCH_PATTERNS = BASE_CHAIN.map(([from]) => from).filter(
  (p) => !p.endsWith("In the Conversation"),
);
const LOWERCASE_STAPLES_MATCH = LOWERCASE_STAPLES_CHAIN.map(([from]) => from);
const BARE_MATCH_PATTERNS = BARE_ICONS_CHAIN.map(([from]) => from);

/** Per-column execute chain, honoring the opt-in flags. */
function buildChain(c: ColumnSpec): Array<readonly [string, string]> {
  const chain: Array<readonly [string, string]> = [...BASE_CHAIN];
  if (INCLUDE_LOWERCASE_STAPLES) chain.push(...LOWERCASE_STAPLES_CHAIN);
  if (INCLUDE_BARE_ICONS && c.prose) chain.push(...BARE_ICONS_CHAIN);
  return chain;
}

function buildMatchPatterns(c: ColumnSpec): string[] {
  const pats = [...BASE_MATCH_PATTERNS];
  if (INCLUDE_LOWERCASE_STAPLES) pats.push(...LOWERCASE_STAPLES_MATCH);
  if (INCLUDE_BARE_ICONS && c.prose) pats.push(...BARE_MATCH_PATTERNS);
  return pats;
}

/** Survey variants (case-sensitive counts). */
const SURVEY_VARIANTS = [
  "Icons of the Burgh",
  "icons of the burgh",
  "Ones to Watch",
  "ones to watch",
  "Ones To Watch",
  "Neighborhood Staples",
  "neighborhood staples",
  "Neighborhood Staple",
  "neighborhood staple",
  "Icons tier",
  "Icons Tier",
  "the Icons ",
  "The Icons ",
] as const;

/** Title Case headline forms: surveyed, never replaced (see header). */
const TITLECASE_REPORT_ONLY = ["Ones To Watch", "Icons Tier"] as const;

/** Helper patterns used to derive the bare "the/The Icons " counts. */
const FULL_THE_ICONS = "the Icons of the Burgh";
const FULL_THE_ICONS_CAP = "The Icons of the Burgh";

/** Patterns whose post-swap replacement would read awkwardly. */
const AWKWARD_VARIANTS = [
  "a Ones to Watch",
  "A Ones to Watch",
  "a ones to watch",
  /* preposition collision: swap yields "in In the Conversation" */
  "in Ones to Watch",
  "in the Ones to Watch",
  "In Ones To Watch",
  /* informational: replacement "a Word of Mouth business" reads fine */
  "a Neighborhood Staple",
  "a neighborhood staple",
] as const;

/** Old-name families for case-insensitive verification. */
const OLD_NAME_FAMILIES = [
  "Icons of the Burgh",
  "Ones to Watch",
  "Neighborhood Staple",
  "Icons tier",
  "the Icons ",
] as const;

/* ----------------------------- SQL helpers ----------------------------- */

type Row = Record<string, unknown>;
type Query = (text: string) => Promise<Row[]>;

/** Quote a string as a SQL literal. Patterns contain no quotes, but be safe. */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** Null-safe text expression for a column. */
function expr(c: ColumnSpec): string {
  return c.jsonb ? `coalesce(${c.column}::text, '')` : `coalesce(${c.column}, '')`;
}

/** Occurrence count of `pat` inside `e` (case-sensitive). */
function occExpr(e: string, pat: string): string {
  return `(length(${e}) - length(replace(${e}, ${lit(pat)}, ''))) / ${pat.length}`;
}

/** WHERE scope for a column. */
function scopeWhere(c: ColumnSpec): string {
  return c.issueScoped ? `issue_slug = ${lit(ISSUE)}` : "true";
}

/** Nested replace() chain over expression `e`. */
function chainExpr(e: string, chain: ReadonlyArray<readonly [string, string]>): string {
  let out = e;
  for (const [from, to] of chain) {
    out = `replace(${out}, ${lit(from)}, ${lit(to)})`;
  }
  return out;
}

/** OR-joined LIKE conditions (case-sensitive). */
function anyLike(e: string, patterns: readonly string[]): string {
  return patterns.map((p) => `${e} LIKE ${lit(`%${p}%`)}`).join(" OR ");
}

/** OR-joined ILIKE conditions for the old-name families. */
function anyOldNameIlike(e: string): string {
  return OLD_NAME_FAMILIES.map((p) => `${e} ILIKE ${lit(`%${p}%`)}`).join(" OR ");
}

function asInt(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

/** Extract the sentence around the first occurrence of `needle`. */
function sampleSentence(text: string, needle: string): string {
  const i = text.indexOf(needle);
  if (i < 0) return "";
  let start = text.lastIndexOf(". ", i);
  start = start < 0 ? 0 : start + 2;
  let end = text.indexOf(".", i + needle.length);
  end = end < 0 ? text.length : end + 1;
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (s.length > 340) {
    const from = Math.max(0, i - 120);
    const to = Math.min(text.length, i + needle.length + 160);
    s = `${from > 0 ? "..." : ""}${text.slice(from, to).replace(/\s+/g, " ").trim()}...`;
  }
  return s;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/* ------------------------------- survey -------------------------------- */

type ColumnCounts = {
  col: ColumnSpec;
  totalRows: number;
  /** variant -> { occ, rows } */
  variants: Map<string, { occ: number; rows: number }>;
  fullTheIconsOcc: number;
  fullTheIconsCapOcc: number;
  awkward: Map<string, { occ: number; rows: number }>;
  ciFamilyRows: Map<string, number>;
};

async function surveyColumn(q: Query, c: ColumnSpec): Promise<ColumnCounts> {
  const e = expr(c);
  const selects: string[] = [`count(*)::int AS total_rows`];
  const all = [
    ...SURVEY_VARIANTS,
    FULL_THE_ICONS,
    FULL_THE_ICONS_CAP,
    ...AWKWARD_VARIANTS,
  ];
  all.forEach((v, i) => {
    selects.push(`coalesce(sum(${occExpr(e, v)}), 0)::int AS occ_${i}`);
    selects.push(
      `count(*) FILTER (WHERE ${e} LIKE ${lit(`%${v}%`)})::int AS rows_${i}`,
    );
  });
  OLD_NAME_FAMILIES.forEach((f, i) => {
    selects.push(
      `count(*) FILTER (WHERE ${e} ILIKE ${lit(`%${f}%`)})::int AS ci_${i}`,
    );
  });
  const [row] = await q(
    `SELECT ${selects.join(", ")} FROM ${c.table} WHERE ${scopeWhere(c)}`,
  );
  const variants = new Map<string, { occ: number; rows: number }>();
  const awkward = new Map<string, { occ: number; rows: number }>();
  all.forEach((v, i) => {
    const entry = { occ: asInt(row[`occ_${i}`]), rows: asInt(row[`rows_${i}`]) };
    if ((AWKWARD_VARIANTS as readonly string[]).includes(v)) awkward.set(v, entry);
    else if (v !== FULL_THE_ICONS && v !== FULL_THE_ICONS_CAP) {
      variants.set(v, entry);
    }
  });
  const ciFamilyRows = new Map<string, number>();
  OLD_NAME_FAMILIES.forEach((f, i) => ciFamilyRows.set(f, asInt(row[`ci_${i}`])));
  return {
    col: c,
    totalRows: asInt(row["total_rows"]),
    variants,
    fullTheIconsOcc: asInt(row[`occ_${all.indexOf(FULL_THE_ICONS)}`]),
    fullTheIconsCapOcc: asInt(row[`occ_${all.indexOf(FULL_THE_ICONS_CAP)}`]),
    awkward,
    ciFamilyRows,
  };
}

async function printSamples(q: Query, counts: ColumnCounts[]): Promise<void> {
  console.log("\n=== SAMPLE SENTENCES (one per variant per column, max 3 columns per variant) ===");
  const analysesCounts = counts.filter((cc) => cc.col.table === "analyses");
  for (const variant of SURVEY_VARIANTS) {
    let printed = 0;
    for (const cc of analysesCounts) {
      if (printed >= 3) break;
      const entry = cc.variants.get(variant);
      if (!entry || entry.rows === 0) continue;
      /* For "the Icons " and "Neighborhood Staple(s)" overlaps, prefer a
         row whose match is NOT just the longer enclosing pattern. */
      const e = expr(cc.col);
      let where = `${scopeWhere(cc.col)} AND ${e} LIKE ${lit(`%${variant}%`)}`;
      if (variant === "the Icons ") {
        where += ` AND ${occExpr(e, variant)} > ${occExpr(e, FULL_THE_ICONS)}`;
      }
      if (variant === "The Icons ") {
        where += ` AND ${occExpr(e, variant)} > ${occExpr(e, FULL_THE_ICONS_CAP)}`;
      }
      if (variant === "Neighborhood Staple" || variant === "neighborhood staple") {
        where += ` AND ${occExpr(e, variant)} > ${occExpr(e, `${variant}s`)}`;
      }
      const rows = await q(
        `SELECT ${cc.col.idExpr} AS id, ${e} AS txt FROM ${cc.col.table} WHERE ${where} LIMIT 1`,
      );
      if (rows.length === 0) continue;
      const sentence = sampleSentence(String(rows[0]["txt"]), variant);
      if (!sentence) continue;
      console.log(
        `\n["${variant}"] ${cc.col.table}.${cc.col.column} (${String(rows[0]["id"])})\n  ${sentence}`,
      );
      printed += 1;
    }
    if (printed === 0) {
      console.log(`\n["${variant}"] no occurrences in analyses (${ISSUE})`);
    }
  }
}

async function survey(q: Query): Promise<void> {
  console.log(`MODE: SURVEY (read-only, zero writes). Issue scope for analyses: ${ISSUE}\n`);

  const counts: ColumnCounts[] = [];
  for (const c of COLUMNS) {
    counts.push(await surveyColumn(q, c));
  }

  /* ---- counts table, analyses first ---- */
  console.log("=== OCCURRENCE COUNTS PER COLUMN (case-sensitive; occ = total occurrences, rows = rows containing) ===");
  for (const cc of counts) {
    const any = [...cc.variants.values()].some((v) => v.occ > 0);
    const scope = cc.col.issueScoped ? ` [issue ${ISSUE}]` : " [all rows]";
    console.log(`\n${cc.col.table}.${cc.col.column}${cc.col.jsonb ? " (jsonb)" : ""}${scope}, ${cc.totalRows} rows total${any ? "" : ", no matches"}`);
    if (!any) continue;
    console.log(`  ${pad("variant", 26)} ${pad("occ", 7)} rows`);
    for (const [v, entry] of cc.variants) {
      if (entry.occ === 0) continue;
      console.log(`  ${pad(JSON.stringify(v), 26)} ${pad(String(entry.occ), 7)} ${entry.rows}`);
    }
    /* derived counts for overlapping patterns */
    const plural = cc.variants.get("Neighborhood Staples")?.occ ?? 0;
    const singAll = cc.variants.get("Neighborhood Staple")?.occ ?? 0;
    if (singAll > 0) {
      console.log(`  ${pad('derived "Neighborhood Staple" singular-only', 34)} ${singAll - plural}`);
    }
    const pluralLc = cc.variants.get("neighborhood staples")?.occ ?? 0;
    const singAllLc = cc.variants.get("neighborhood staple")?.occ ?? 0;
    if (singAllLc > 0) {
      console.log(`  ${pad('derived "neighborhood staple" singular-only', 34)} ${singAllLc - pluralLc}`);
    }
    const theIcons = cc.variants.get("the Icons ")?.occ ?? 0;
    if (theIcons > 0) {
      console.log(`  ${pad('derived bare "the Icons " (minus full name)', 34)} ${theIcons - cc.fullTheIconsOcc}`);
    }
    const theIconsCap = cc.variants.get("The Icons ")?.occ ?? 0;
    if (theIconsCap > 0) {
      console.log(`  ${pad('derived bare "The Icons " (minus full name)', 34)} ${theIconsCap - cc.fullTheIconsCapOcc}`);
    }
    /* case-insensitive family rows vs case-sensitive, to spot odd casing */
    for (const f of OLD_NAME_FAMILIES) {
      const ci = cc.ciFamilyRows.get(f) ?? 0;
      if (ci === 0) continue;
      console.log(`  ${pad(`rows ILIKE "${f}"`, 34)} ${ci}`);
    }
  }

  /* ---- awkward grammar ---- */
  console.log("\n=== AWKWARD POST-SWAP GRAMMAR ===");
  console.log('Patterns where a naive swap reads "a In the Conversation"; the execute chain fixes these to "an In the Conversation".');
  for (const v of AWKWARD_VARIANTS) {
    let occ = 0;
    let rows = 0;
    for (const cc of counts) {
      const entry = cc.awkward.get(v);
      if (entry) {
        occ += entry.occ;
        rows += entry.rows;
      }
    }
    let note = ' (needs the a -> an fixup, included in the execute chain)';
    if (v.toLowerCase().includes("neighborhood")) {
      note = ' (informational: becomes "a Word of Mouth business", correct article, no fixup needed)';
    } else if (v.toLowerCase().startsWith("in ")) {
      note = ' (preposition collision: swap reads "in In the Conversation"; NO automated fixup, human judgment)';
    }
    console.log(`  ${pad(JSON.stringify(v), 26)} occ ${pad(String(occ), 6)} rows ${rows}${note}`);
  }

  /* ---- bare-Icons report ---- */
  console.log("\n=== BARE-ICONS REPORT (riskiest patterns, excluded from execute unless --include-bare-icons) ===");
  for (const p of BARE_MATCH_PATTERNS) {
    let occ = 0;
    let rows = 0;
    for (const cc of counts) {
      const entry = cc.variants.get(p);
      if (!entry) continue;
      let o = entry.occ;
      if (p === "the Icons ") o -= cc.fullTheIconsOcc;
      if (p === "The Icons ") o -= cc.fullTheIconsCapOcc;
      occ += o;
      if (o > 0) rows += entry.rows;
    }
    console.log(`  ${pad(JSON.stringify(p), 26)} bare occurrences ${occ} (rows upper bound ${rows})`);
  }
  console.log("  Note: bare-Icons replacement would apply ONLY to the five analyses prose text columns.");

  /* ---- Title Case report-only forms ---- */
  console.log("\n=== TITLE CASE FORMS (report-only, NEVER replaced by this script) ===");
  console.log('Headline-style pullquote lines use Title Case, and "Ones To Watch" often follows "In", so a swap would produce "In In the Conversation". Fix by hand or regenerate.');
  for (const p of TITLECASE_REPORT_ONLY) {
    for (const cc of counts) {
      const entry = cc.variants.get(p);
      if (!entry || entry.occ === 0) continue;
      console.log(`  ${pad(JSON.stringify(p), 26)} ${cc.col.table}.${cc.col.column}: occ ${entry.occ}, rows ${entry.rows}`);
    }
  }

  /* ---- lowercase staples warning ---- */
  console.log("\n=== LOWERCASE STAPLES (excluded from execute unless --include-lowercase-staples) ===");
  console.log("Survey samples show lowercase \"neighborhood staple(s)\" is mostly generic English, including verbatim customer quotes in notable_quote and themes. Recommend leaving the flag OFF.");

  /* ---- analyses rows outside the issue scope ---- */
  const allExprs = COLUMNS.filter((c) => c.table === "analyses").map((c) => expr(c));
  const combined = allExprs.join(" || ' ' || ");
  const [other] = await q(
    `SELECT count(*)::int AS n FROM analyses WHERE issue_slug <> ${lit(ISSUE)} AND (${anyOldNameIlike(`(${combined})`)})`,
  );
  console.log(`\nAnalyses rows OUTSIDE issue ${ISSUE} that mention an old name (NOT touched by execute): ${asInt(other["n"])}`);

  /* ---- samples ---- */
  await printSamples(q, counts);

  /* ---- before/after row-match counts (simulated) ---- */
  console.log("\n=== BEFORE / SIMULATED-AFTER ROW MATCH COUNTS PER COLUMN ===");
  console.log("after_default = rows still mentioning an old name after the default execute chain; after_with_bare adds the bare-Icons chain (prose columns only); after_all_flags also adds lowercase staples.");
  console.log(`  ${pad("column", 38)} ${pad("before", 8)} ${pad("after_default", 14)} ${pad("after_with_bare", 16)} after_all_flags`);
  for (const c of COLUMNS) {
    const e = expr(c);
    const before = `count(*) FILTER (WHERE ${anyOldNameIlike(e)})::int`;
    const baseE = chainExpr(e, BASE_CHAIN);
    const afterBase = `count(*) FILTER (WHERE ${anyOldNameIlike(baseE)})::int`;
    const bareE = c.prose ? chainExpr(baseE, BARE_ICONS_CHAIN) : baseE;
    const afterBare = `count(*) FILTER (WHERE ${anyOldNameIlike(bareE)})::int`;
    const allE = chainExpr(bareE, LOWERCASE_STAPLES_CHAIN);
    const afterAll = `count(*) FILTER (WHERE ${anyOldNameIlike(allE)})::int`;
    const [row] = await q(
      `SELECT ${before} AS before, ${afterBase} AS after_base, ${afterBare} AS after_bare, ${afterAll} AS after_all FROM ${c.table} WHERE ${scopeWhere(c)}`,
    );
    console.log(
      `  ${pad(`${c.table}.${c.column}${c.updatable ? "" : " (report-only)"}`, 38)} ${pad(String(asInt(row["before"])), 8)} ${pad(String(asInt(row["after_base"])), 14)} ${pad(String(asInt(row["after_bare"])), 16)} ${asInt(row["after_all"])}`,
    );
  }

  await verification(q, "current");

  console.log("\nSurvey complete. Zero writes were made.");
  console.log("Next: npx tsx scripts/backup-analyses.ts, then re-run with --execute --backup-done.");
  console.log("Add --include-bare-icons only if the bare-Icons samples above look unambiguous.");
  console.log("Leave --include-lowercase-staples OFF unless the lowercase samples above are clearly tier references (they were not at survey time).");
}

/* ------------------------------- execute ------------------------------- */

async function execute(q: Query): Promise<void> {
  console.log(`MODE: EXECUTE. Issue scope for analyses: ${ISSUE}.`);
  console.log(`Bare-Icons chain: ${INCLUDE_BARE_ICONS ? "INCLUDED (prose columns only)" : "EXCLUDED"}. Lowercase staples: ${INCLUDE_LOWERCASE_STAPLES ? "INCLUDED" : "EXCLUDED"}.\n`);

  for (const c of COLUMNS) {
    if (!c.updatable) continue;
    const e = expr(c);
    const chain = buildChain(c);
    const matchPats = buildMatchPatterns(c);
    const where = `${scopeWhere(c)} AND (${anyLike(e, matchPats)})`;

    const [beforeRow] = await q(
      `SELECT count(*)::int AS n FROM ${c.table} WHERE ${where}`,
    );
    const before = asInt(beforeRow["n"]);

    /* jsonb: text-replace then cast back. Safe because patterns and
       replacements contain no JSON-special characters (see header). */
    const newValue = c.jsonb
      ? `(${chainExpr(`${c.column}::text`, chain)})::jsonb`
      : chainExpr(c.column, chain);

    const updated = await q(
      `UPDATE ${c.table} SET ${c.column} = ${newValue} WHERE ${where} RETURNING 1 AS one`,
    );

    const [afterRow] = await q(
      `SELECT count(*)::int AS n FROM ${c.table} WHERE ${where}`,
    );
    console.log(
      `${pad(`${c.table}.${c.column}`, 38)} before ${pad(String(before), 6)} updated ${pad(String(updated.length), 6)} still-matching after ${asInt(afterRow["n"])}`,
    );
  }

  await verification(q, "post-execute");
  console.log("\nExecute complete. Intentional skips that may remain above:");
  if (!INCLUDE_BARE_ICONS) {
    console.log("  - bare-Icons patterns (run with --include-bare-icons to swap them)");
  }
  if (!INCLUDE_LOWERCASE_STAPLES) {
    console.log("  - lowercase \"neighborhood staple(s)\" (mostly generic English, see survey)");
  }
  console.log('  - Title Case "Icons Tier" / "Ones To Watch" in diagnosis_pullquote (never replaced, needs human pass)');
  console.log("  - report-only columns: scores jsonb columns, underrated_lists.entries, features.credits, features.movement");
}

/* ----------------------------- verification ---------------------------- */

async function verification(q: Query, label: string): Promise<void> {
  console.log(`\n=== VERIFICATION (${label}): remaining rows mentioning any old name, per column ===`);
  let totalRows = 0;
  for (const c of COLUMNS) {
    const e = expr(c);
    const [row] = await q(
      `SELECT count(*)::int AS n FROM ${c.table} WHERE ${scopeWhere(c)} AND (${anyOldNameIlike(e)})`,
    );
    const n = asInt(row["n"]);
    totalRows += n;
    if (n > 0) console.log(`  ${pad(`${c.table}.${c.column}`, 38)} ${n}`);
  }
  if (totalRows === 0) {
    console.log("  none. 0 rows mention any old tier name.");
  } else {
    console.log(`  TOTAL rows with any old-name mention: ${totalRows}`);
  }
}

/* --------------------------------- main -------------------------------- */

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local.");
    process.exit(1);
  }
  const sql = neon(url);
  const q: Query = async (text) => (await sql.query(text)) as Row[];

  if (EXECUTE && !BACKUP_DONE) {
    console.error("Refusing --execute without --backup-done.");
    console.error("Back up the analyses table first:");
    console.error("  npx tsx scripts/backup-analyses.ts");
    console.error("Then re-run:");
    console.error("  npx tsx scripts/rename-tiers-prose.ts --execute --backup-done");
    process.exit(1);
  }

  if (EXECUTE) {
    await execute(q);
  } else {
    await survey(q);
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
