/* eslint-disable no-console */
/**
 * Sweep the analyses table for the banned word "discovery" (and its variants
 * "discoverable", "discoverability", "discovered") and rewrite to brand-safe
 * substitutes.
 *
 * Touches the text-shaped fields in `analyses`:
 *   - playbook (JSONB array of {action, headline, signal, priority, impact_label})
 *   - diagnosis_pullquote (JSONB)
 *   - tldr_read (text)
 *   - tldr_meaning (text)
 *   - sentiment_summary (text)
 *   - quarter_narrative (text)
 *   - themes (JSONB array)
 *   - notable_quote (text)
 *
 * Usage:
 *   tsx scripts/sweep-discovery-word.ts              # dry-run (default)
 *   tsx scripts/sweep-discovery-word.ts --commit     # write changes
 *
 * No Anthropic API used. Replacements are deterministic regex pairs.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const COMMIT = process.argv.includes("--commit");

/**
 * Replacement table. Order matters: longer phrases first so a phrase match
 * isn't broken by an earlier shorter-word match. All matches are
 * case-insensitive with smart-casing for the first char.
 *
 * Banned variants we hunt: discovery, discoverable, discoverability,
 * discovered. Voice rules forbid all of them per project CLAUDE.md.
 */
type Rule = { pat: RegExp; rep: string };

const RULES: Rule[] = [
  // ---- phrase-level (longest first) ----
  { pat: /\bGoogle Maps discovery\b/gi, rep: "how Google Maps shows the business" },
  { pat: /\bGoogle discovery\b/gi, rep: "how Google shows the business" },
  { pat: /\bmaps discovery\b/gi, rep: "how Google Maps shows the business" },
  { pat: /\blocal discovery\b/gi, rep: "local search" },
  { pat: /\blow discoverability\b/gi, rep: "hard to find in search" },
  { pat: /\bhigh discoverability\b/gi, rep: "easy to find in search" },
  { pat: /\bpoor discoverability\b/gi, rep: "hard to find in search" },
  { pat: /\bdiscoverability gap\b/gi, rep: "visibility gap" },
  { pat: /\bdiscoverability\b/gi, rep: "visibility" },
  { pat: /\bdiscovery gap\b/gi, rep: "visibility gap" },
  { pat: /\bdiscovery audience\b/gi, rep: "search traffic" },
  { pat: /\bdiscovery funnel\b/gi, rep: "search funnel" },
  { pat: /\bdiscovery signal\b/gi, rep: "visibility signal" },
  { pat: /\bdiscovery layer\b/gi, rep: "visibility layer" },
  { pat: /\bdiscovery channel\b/gi, rep: "search channel" },
  { pat: /\bdiscovery loop\b/gi, rep: "visibility loop" },
  { pat: /\bdiscovery surface\b/gi, rep: "search surface" },
  { pat: /\bdiscovery moment\b/gi, rep: "first-look moment" },
  { pat: /\bdiscovery problem\b/gi, rep: "visibility problem" },
  { pat: /\bdiscovery friction\b/gi, rep: "search friction" },
  { pat: /\bunlock discovery\b/gi, rep: "show up in search" },
  { pat: /\b\+discovery\b/gi, rep: "+search visibility" },
  { pat: /\bdiscoverable\b/gi, rep: "findable" },
  { pat: /\bget discoverable\b/gi, rep: "get findable" },
  { pat: /\bnot easily discovered\b/gi, rep: "not easily found" },
  { pat: /\bnewly discovered\b/gi, rep: "newly found" },
  { pat: /\bbe discovered\b/gi, rep: "be found" },
  { pat: /\bbeing discovered\b/gi, rep: "being found" },
  { pat: /\bgets discovered\b/gi, rep: "gets found" },
  { pat: /\bget discovered\b/gi, rep: "get found" },
  { pat: /\bdiscovered by\b/gi, rep: "found by" },
  { pat: /\bdiscovered through\b/gi, rep: "found through" },
  { pat: /\bdiscovered on\b/gi, rep: "found on" },
  { pat: /\bdiscovered via\b/gi, rep: "found via" },
  { pat: /\bdiscovered the\b/gi, rep: "found the" },
  { pat: /\bdiscovered this\b/gi, rep: "found this" },
  { pat: /\bdiscovered yet\b/gi, rep: "found yet" },
  { pat: /\b'discovered'/gi, rep: "'found'" },
  { pat: /\b"discovered"/gi, rep: '"found"' },
  // bare adjective/participle catch-all
  { pat: /\bdiscovered\b/gi, rep: "found" },
  // plural noun
  { pat: /\bdiscoveries\b/gi, rep: "finds" },
  // -ing form
  { pat: /\bare discovering\b/gi, rep: "are finding" },
  { pat: /\bis discovering\b/gi, rep: "is finding" },
  { pat: /\bkeeps discovering\b/gi, rep: "keeps finding" },
  { pat: /\bdiscovering\b/gi, rep: "finding" },
  // -s form
  { pat: /\bdiscovers\b/gi, rep: "finds" },
  { pat: /\bdiscover\b/gi, rep: "find" }, // verb base form
  // ---- bare noun (last, catch-all) ----
  { pat: /\bdiscovery\b/gi, rep: "search visibility" },
];

/**
 * Detect if a string is "shouty" (mostly uppercase letters). Used to keep
 * `impact_label` fields like "UNLOCK DISCOVERY" → "UNLOCK SEARCH VISIBILITY"
 * in the same all-caps voice as their neighbors. We don't want to break
 * the visual rhythm of the rendered chip badges.
 */
function isShouty(s: string): boolean {
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length >= 0.7;
}

function rewriteString(s: string): { changed: boolean; out: string } {
  let out = s;
  for (const { pat, rep } of RULES) {
    out = out.replace(pat, rep);
  }
  if (isShouty(s)) {
    out = out.toUpperCase();
  }
  return { changed: out !== s, out };
}

/**
 * Field-name allowlist for keys that are user-visible text. Other keys
 * (enum-typed `signal`, `priority`, `tier`, etc.) are left untouched so we
 * don't accidentally title-case an enum value.
 */
/**
 * Keys that hold OUR editorial voice. We rewrite these.
 *
 * Excluded by design: `exampleQuote` (theme example quote) and `notable_quote`
 * (column-level) hold verbatim CUSTOMER review text. Rewriting those would
 * falsify the review record. The orchestrator decided customer quotes are
 * factual record, not editorial copy.
 */
const TEXT_KEYS = new Set([
  "action", // playbook item
  "headline", // playbook item
  "impact_label", // playbook item
  "phrase", // theme phrase (editorial summary, not a review quote)
  "line", // diagnosis_pullquote line
  "highlight", // diagnosis_pullquote highlight
]);

function rewriteAny(value: unknown, parentKey?: string): { changed: boolean; out: unknown } {
  if (typeof value === "string") {
    // Only rewrite strings under a known user-facing key, OR at the top
    // level (the top-level text columns like tldr_read pass directly to
    // rewriteString, not through rewriteAny). For JSONB objects, only
    // touch the text-shaped fields.
    if (parentKey && !TEXT_KEYS.has(parentKey)) {
      return { changed: false, out: value };
    }
    return rewriteString(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const r = rewriteAny(v, parentKey);
      if (r.changed) changed = true;
      return r.out;
    });
    return { changed, out };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = rewriteAny(v, k);
      if (r.changed) changed = true;
      out[k] = r.out;
    }
    return { changed, out };
  }
  return { changed: false, out: value };
}

type AnalysisRow = {
  business_slug: string;
  issue_slug: string;
  themes: unknown;
  notable_quote: string | null;
  sentiment_summary: string | null;
  quarter_narrative: string | null;
  tldr_read: string | null;
  tldr_meaning: string | null;
  diagnosis_pullquote: unknown;
  playbook: unknown;
};

async function main() {
  console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"}`);

  const rows = (await sql`
    SELECT business_slug, issue_slug, themes, notable_quote, sentiment_summary,
      quarter_narrative, tldr_read, tldr_meaning, diagnosis_pullquote, playbook
    FROM analyses
    WHERE
      playbook::text ~* '\\mdiscover'
      OR diagnosis_pullquote::text ~* '\\mdiscover'
      OR (tldr_read IS NOT NULL AND tldr_read ~* '\\mdiscover')
      OR (tldr_meaning IS NOT NULL AND tldr_meaning ~* '\\mdiscover')
      OR (sentiment_summary IS NOT NULL AND sentiment_summary ~* '\\mdiscover')
      OR (themes IS NOT NULL AND themes::text ~* '\\mdiscover')
      OR (quarter_narrative IS NOT NULL AND quarter_narrative ~* '\\mdiscover')
      OR (notable_quote IS NOT NULL AND notable_quote ~* '\\mdiscover')
  `) as AnalysisRow[];

  console.log(`Found ${rows.length} rows with a hit.`);

  let updated = 0;
  let skippedNoChange = 0;

  for (const r of rows) {
    // notable_quote holds a verbatim customer review quote. Don't rewrite.
    const next = {
      themes: rewriteAny(r.themes),
      notable_quote: null as { changed: boolean; out: string } | null,
      sentiment_summary: r.sentiment_summary
        ? rewriteString(r.sentiment_summary)
        : null,
      quarter_narrative: r.quarter_narrative
        ? rewriteString(r.quarter_narrative)
        : null,
      tldr_read: r.tldr_read ? rewriteString(r.tldr_read) : null,
      tldr_meaning: r.tldr_meaning ? rewriteString(r.tldr_meaning) : null,
      diagnosis_pullquote: rewriteAny(r.diagnosis_pullquote),
      playbook: rewriteAny(r.playbook),
    };

    const anyChanged =
      next.themes.changed ||
      (next.notable_quote?.changed ?? false) ||
      (next.sentiment_summary?.changed ?? false) ||
      (next.quarter_narrative?.changed ?? false) ||
      (next.tldr_read?.changed ?? false) ||
      (next.tldr_meaning?.changed ?? false) ||
      next.diagnosis_pullquote.changed ||
      next.playbook.changed;

    if (!anyChanged) {
      skippedNoChange++;
      continue;
    }

    if (updated < 3) {
      console.log(`\n--- ${r.business_slug} (${r.issue_slug}) ---`);
      if (next.tldr_read?.changed) {
        console.log("  tldr_read BEFORE:", r.tldr_read?.slice(0, 200));
        console.log("  tldr_read AFTER: ", next.tldr_read.out.slice(0, 200));
      }
      if (next.tldr_meaning?.changed) {
        console.log("  tldr_meaning BEFORE:", r.tldr_meaning?.slice(0, 200));
        console.log("  tldr_meaning AFTER: ", next.tldr_meaning.out.slice(0, 200));
      }
      if (next.playbook.changed) {
        console.log("  playbook AFTER:", JSON.stringify(next.playbook.out).slice(0, 400));
      }
      if (next.quarter_narrative?.changed) {
        console.log("  qn BEFORE:", r.quarter_narrative?.slice(0, 200));
        console.log("  qn AFTER: ", next.quarter_narrative.out.slice(0, 200));
      }
    }

    if (COMMIT) {
      // Each column is updated with its rewrite if changed, else its
      // original (preserved verbatim). Belt-and-braces: never write null to
      // a non-nullable column like notable_quote / sentiment_summary.
      const newNotable = next.notable_quote?.changed ? next.notable_quote.out : r.notable_quote;
      const newSentiment = next.sentiment_summary?.changed
        ? next.sentiment_summary.out
        : r.sentiment_summary;
      const newQN = next.quarter_narrative?.changed
        ? next.quarter_narrative.out
        : r.quarter_narrative;
      const newTldrRead = next.tldr_read?.changed ? next.tldr_read.out : r.tldr_read;
      const newTldrMeaning = next.tldr_meaning?.changed
        ? next.tldr_meaning.out
        : r.tldr_meaning;

      await sql`
        UPDATE analyses SET
          themes = ${JSON.stringify(next.themes.out)}::jsonb,
          notable_quote = ${newNotable},
          sentiment_summary = ${newSentiment},
          quarter_narrative = ${newQN},
          tldr_read = ${newTldrRead},
          tldr_meaning = ${newTldrMeaning},
          diagnosis_pullquote = ${next.diagnosis_pullquote.out === null ? null : JSON.stringify(next.diagnosis_pullquote.out)}::jsonb,
          playbook = ${next.playbook.out === null ? null : JSON.stringify(next.playbook.out)}::jsonb
        WHERE business_slug = ${r.business_slug}
          AND issue_slug = ${r.issue_slug}
      `;
    }
    updated++;
  }

  console.log(`\nSummary:`);
  console.log(`  rows scanned: ${rows.length}`);
  console.log(`  rows ${COMMIT ? "updated" : "would be updated"}: ${updated}`);
  console.log(`  rows with hit but no rewrite (false-positive in regex): ${skippedNoChange}`);

  if (!COMMIT) {
    console.log(`\nDry run only. Re-run with --commit to apply.`);
  }

  // Sanity-check: any remaining hits?
  if (COMMIT) {
    const remaining = await sql`
      SELECT COUNT(*)::int AS n FROM analyses
      WHERE playbook::text ~* '\\mdiscover'
        OR diagnosis_pullquote::text ~* '\\mdiscover'
        OR (tldr_read ~* '\\mdiscover')
        OR (tldr_meaning ~* '\\mdiscover')
        OR (sentiment_summary ~* '\\mdiscover')
        OR (themes::text ~* '\\mdiscover')
        OR (quarter_narrative ~* '\\mdiscover')
        OR (notable_quote ~* '\\mdiscover')
    `;
    console.log(`Remaining rows with "discover*": ${remaining[0].n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
