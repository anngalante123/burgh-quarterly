/* eslint-disable no-console */
/**
 * Sweep the analyses table for the banned word "infrastructure" and rewrite
 * to brand-safe substitutes. Mirrors scripts/sweep-discovery-word.ts.
 *
 * Touches the text-shaped fields in `analyses`:
 *   - playbook (JSONB array of {action, headline, signal, priority, impact_label})
 *   - diagnosis_pullquote (JSONB)
 *   - tldr_read (text)
 *   - tldr_meaning (text)
 *   - sentiment_summary (text)
 *   - quarter_narrative (text)
 *   - themes (JSONB array)
 *   - notable_quote (text) [verbatim — not rewritten]
 *
 * Usage:
 *   tsx scripts/sweep-infrastructure-word.ts              # dry-run (default)
 *   tsx scripts/sweep-infrastructure-word.ts --commit     # write changes
 *
 * No Anthropic API used. Replacements are deterministic regex pairs. Rows
 * whose only "infrastructure" hit is in an ambiguous context (no rule
 * matched the bare noun cleanly) are surfaced as "manual review needed".
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const COMMIT = process.argv.includes("--commit");

type Rule = { pat: RegExp; rep: string };

/**
 * Replacement table. Order matters: longer phrases first so a phrase match
 * isn't broken by an earlier shorter-word match. All matches are
 * case-insensitive.
 *
 * Mapping table from the brief:
 *   "social infrastructure"     -> "Instagram presence"
 *   "digital infrastructure"    -> "online presence"
 *   "review infrastructure"     -> "review base"
 *   "search infrastructure"     -> "Google Maps profile"
 *   "no infrastructure to post" -> "isn't set up to post"
 *   "lacks the infrastructure"  -> "isn't set up"
 *   "missing infrastructure"    -> "missing pieces"
 *   "the infrastructure is"     -> "the setup is"
 *   "infrastructure to handle"  -> "setup to handle"
 *
 * Bare "infrastructure" with no preceding context word is intentionally
 * NOT rewritten by regex — it's surfaced for manual review instead, since
 * the right replacement ("presence" vs "setup" vs deletion) depends on the
 * surrounding sentence.
 */
const RULES: Rule[] = [
  // ---- multi-word phrase-level (longest first) ----
  { pat: /\bno public-facing infrastructure\b/gi, rep: "no public-facing presence" },
  { pat: /\bno infrastructure to post\b/gi, rep: "isn't set up to post" },
  { pat: /\bno infrastructure to catch\b/gi, rep: "no setup to catch" },
  { pat: /\bno infrastructure around it\b/gi, rep: "no setup around it" },
  { pat: /\bnearly invisible online infrastructure\b/gi, rep: "nearly invisible online presence" },
  { pat: /\bnearly invisible listing infrastructure\b/gi, rep: "nearly invisible listing" },
  { pat: /\blacks the infrastructure\b/gi, rep: "isn't set up" },
  { pat: /\bmissing infrastructure\b/gi, rep: "missing pieces" },
  { pat: /\bmissing profile infrastructure\b/gi, rep: "missing profile basics" },
  { pat: /\bmissing data infrastructure\b/gi, rep: "missing listing basics" },
  { pat: /\bmissing search visibility infrastructure\b/gi, rep: "missing search visibility setup" },
  { pat: /\bsearch visibility infrastructure\b/gi, rep: "search visibility setup" },
  { pat: /\bnear-zero search visibility infrastructure\b/gi, rep: "near-zero search visibility setup" },
  { pat: /\bvisibility infrastructure\b/gi, rep: "visibility setup" },
  { pat: /\bfindable infrastructure\b/gi, rep: "findable presence" },
  { pat: /\blisting infrastructure\b/gi, rep: "listing setup" },
  { pat: /\bprofile infrastructure\b/gi, rep: "profile setup" },
  { pat: /\bdata infrastructure\b/gi, rep: "listing setup" },
  { pat: /\binformation infrastructure\b/gi, rep: "listing setup" },
  { pat: /\bthe infrastructure is\b/gi, rep: "the setup is" },
  { pat: /\binfrastructure to handle\b/gi, rep: "setup to handle" },
  { pat: /\bsocial infrastructure\b/gi, rep: "Instagram presence" },
  { pat: /\bdigital infrastructure\b/gi, rep: "online presence" },
  { pat: /\breview infrastructure\b/gi, rep: "review base" },
  { pat: /\bsearch infrastructure\b/gi, rep: "Google Maps profile" },
  { pat: /\bonline infrastructure\b/gi, rep: "online presence" },
  { pat: /\bconversion infrastructures\b/gi, rep: "conversion setups" },
  { pat: /\bconversion infrastructure\b/gi, rep: "conversion setup" },
  { pat: /\binfrastructures\b/gi, rep: "setups" },
  { pat: /\bcontact infrastructure\b/gi, rep: "contact details" },
  { pat: /\bbasic infrastructure\b/gi, rep: "basic setup" },
  // possessive forms with adjectives
  { pat: /\binfrastructure gap\b/gi, rep: "setup gap" },
  { pat: /\binfrastructure gaps\b/gi, rep: "setup gaps" },
  { pat: /\binfrastructure signals\b/gi, rep: "listing signals" },
  { pat: /\binfrastructure signal\b/gi, rep: "listing signal" },
];

/**
 * Heuristic patterns for bare "infrastructure" applied AFTER phrase rules.
 * The catch-all at the end maps unqualified "infrastructure" to "setup",
 * which is the safest universal replacement per the brief. Sentences that
 * still read awkwardly after this rewrite are surfaced for manual review.
 */
const SAFE_BARE_RULES: Rule[] = [
  // verb-led: "build (the )?infrastructure" -> "build (the )?setup"
  { pat: /\bbuild (the )?infrastructure\b/gi, rep: "build $1setup" },
  { pat: /\bbuilt (the )?infrastructure\b/gi, rep: "built $1setup" },
  { pat: /\binfrastructure exists\b/gi, rep: "setup exists" },
  { pat: /\binfrastructure meant to\b/gi, rep: "setup meant to" },
  { pat: /\binfrastructure around\b/gi, rep: "setup around" },
  { pat: /\bany infrastructure\b/gi, rep: "any setup" },
  { pat: /\bno infrastructure\b/gi, rep: "no setup" },
  { pat: /\bzero infrastructure\b/gi, rep: "zero setup" },
  { pat: /\bthe infrastructure to (?=\w)/gi, rep: "the setup to " },
  // catch-all: bare noun -> "setup"
  { pat: /\binfrastructure\b/gi, rep: "setup" },
];

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
  for (const { pat, rep } of SAFE_BARE_RULES) {
    out = out.replace(pat, rep);
  }
  if (isShouty(s)) {
    out = out.toUpperCase();
  }
  return { changed: out !== s, out };
}

/** Detect bare "infrastructure" still remaining after rewrites — manual flag. */
function hasResidualInfrastructure(s: string): boolean {
  return /\binfrastructure\b/i.test(s);
}

const TEXT_KEYS = new Set([
  "action",
  "headline",
  "impact_label",
  "phrase",
  "line",
  "highlight",
]);

function rewriteAny(value: unknown, parentKey?: string): { changed: boolean; out: unknown } {
  if (typeof value === "string") {
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

/** Walk a JSON value and collect any string still containing "infrastructure". */
function collectResidualStrings(value: unknown, parentKey?: string): string[] {
  const hits: string[] = [];
  if (typeof value === "string") {
    if ((!parentKey || TEXT_KEYS.has(parentKey)) && hasResidualInfrastructure(value)) {
      hits.push(value);
    }
    return hits;
  }
  if (Array.isArray(value)) {
    for (const v of value) hits.push(...collectResidualStrings(v, parentKey));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      hits.push(...collectResidualStrings(v, k));
    }
    return hits;
  }
  return hits;
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
      playbook::text ~* 'infrastructure'
      OR diagnosis_pullquote::text ~* 'infrastructure'
      OR (tldr_read IS NOT NULL AND tldr_read ~* 'infrastructure')
      OR (tldr_meaning IS NOT NULL AND tldr_meaning ~* 'infrastructure')
      OR (sentiment_summary IS NOT NULL AND sentiment_summary ~* 'infrastructure')
      OR (themes IS NOT NULL AND themes::text ~* 'infrastructure')
      OR (quarter_narrative IS NOT NULL AND quarter_narrative ~* 'infrastructure')
      OR (notable_quote IS NOT NULL AND notable_quote ~* 'infrastructure')
  `) as AnalysisRow[];

  console.log(`Found ${rows.length} rows with a hit.`);

  let updated = 0;
  let skippedNoChange = 0;
  const manualReview: Array<{ slug: string; issue: string; sentence: string }> = [];

  for (const r of rows) {
    const next = {
      themes: rewriteAny(r.themes),
      sentiment_summary: r.sentiment_summary ? rewriteString(r.sentiment_summary) : null,
      quarter_narrative: r.quarter_narrative ? rewriteString(r.quarter_narrative) : null,
      tldr_read: r.tldr_read ? rewriteString(r.tldr_read) : null,
      tldr_meaning: r.tldr_meaning ? rewriteString(r.tldr_meaning) : null,
      diagnosis_pullquote: rewriteAny(r.diagnosis_pullquote),
      playbook: rewriteAny(r.playbook),
    };

    const anyChanged =
      next.themes.changed ||
      (next.sentiment_summary?.changed ?? false) ||
      (next.quarter_narrative?.changed ?? false) ||
      (next.tldr_read?.changed ?? false) ||
      (next.tldr_meaning?.changed ?? false) ||
      next.diagnosis_pullquote.changed ||
      next.playbook.changed;

    // Check for residuals AFTER rewrites
    const residuals: string[] = [];
    if (next.tldr_read?.out && hasResidualInfrastructure(next.tldr_read.out)) {
      residuals.push(`tldr_read: ${next.tldr_read.out}`);
    }
    if (next.tldr_meaning?.out && hasResidualInfrastructure(next.tldr_meaning.out)) {
      residuals.push(`tldr_meaning: ${next.tldr_meaning.out}`);
    }
    if (next.sentiment_summary?.out && hasResidualInfrastructure(next.sentiment_summary.out)) {
      residuals.push(`sentiment_summary: ${next.sentiment_summary.out}`);
    }
    if (next.quarter_narrative?.out && hasResidualInfrastructure(next.quarter_narrative.out)) {
      residuals.push(`quarter_narrative: ${next.quarter_narrative.out}`);
    }
    for (const s of collectResidualStrings(next.themes.out)) {
      residuals.push(`themes: ${s}`);
    }
    for (const s of collectResidualStrings(next.diagnosis_pullquote.out)) {
      residuals.push(`diagnosis_pullquote: ${s}`);
    }
    for (const s of collectResidualStrings(next.playbook.out)) {
      residuals.push(`playbook: ${s}`);
    }

    for (const sentence of residuals) {
      manualReview.push({ slug: r.business_slug, issue: r.issue_slug, sentence });
    }

    if (!anyChanged) {
      skippedNoChange++;
      // still possible residuals exist (no rule matched at all)
      continue;
    }

    if (updated < 5) {
      console.log(`\n--- ${r.business_slug} (${r.issue_slug}) ---`);
      if (next.tldr_read?.changed) {
        console.log("  tldr_read BEFORE:", r.tldr_read?.slice(0, 200));
        console.log("  tldr_read AFTER: ", next.tldr_read.out.slice(0, 200));
      }
      if (next.tldr_meaning?.changed) {
        console.log("  tldr_meaning BEFORE:", r.tldr_meaning?.slice(0, 200));
        console.log("  tldr_meaning AFTER: ", next.tldr_meaning.out.slice(0, 200));
      }
      if (next.quarter_narrative?.changed) {
        console.log("  qn BEFORE:", r.quarter_narrative?.slice(0, 200));
        console.log("  qn AFTER: ", next.quarter_narrative.out.slice(0, 200));
      }
      if (next.sentiment_summary?.changed) {
        console.log("  sentiment BEFORE:", r.sentiment_summary?.slice(0, 200));
        console.log("  sentiment AFTER: ", next.sentiment_summary.out.slice(0, 200));
      }
      if (next.playbook.changed) {
        console.log("  playbook AFTER:", JSON.stringify(next.playbook.out).slice(0, 400));
      }
    }

    if (COMMIT) {
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
  console.log(`  rows with hit but no rule matched: ${skippedNoChange}`);
  console.log(`  manual-review sentences (post-rewrite residuals): ${manualReview.length}`);

  if (manualReview.length) {
    console.log(`\n--- MANUAL REVIEW NEEDED ---`);
    for (const m of manualReview.slice(0, 100)) {
      console.log(`[${m.slug} / ${m.issue}] ${m.sentence.slice(0, 280)}`);
    }
    if (manualReview.length > 100) {
      console.log(`... (${manualReview.length - 100} more)`);
    }
  }

  if (!COMMIT) {
    console.log(`\nDry run only. Re-run with --commit to apply.`);
  }

  if (COMMIT) {
    const remaining = await sql`
      SELECT COUNT(*)::int AS n FROM analyses
      WHERE playbook::text ~* 'infrastructure'
        OR diagnosis_pullquote::text ~* 'infrastructure'
        OR (tldr_read ~* 'infrastructure')
        OR (tldr_meaning ~* 'infrastructure')
        OR (sentiment_summary ~* 'infrastructure')
        OR (themes::text ~* 'infrastructure')
        OR (quarter_narrative ~* 'infrastructure')
        OR (notable_quote ~* 'infrastructure')
    `;
    console.log(`Remaining rows with "infrastructure": ${remaining[0].n}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
