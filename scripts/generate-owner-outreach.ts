/**
 * generate-owner-outreach.ts, the launch-day outreach kit.
 *
 * For each business in this issue, generate a personalized email
 * using its actual data: rank, diagnosis pull-quote, signature stat
 * (creator coverage, review depth, IG cadence), and the top Playbook
 * move. Output is one markdown file with all 30 emails (for human
 * review and copy-paste into a mail tool) plus a JSON manifest with
 * subject + body per slug.
 *
 * Editorial framing: Signal Pittsburgh is a publication, not a sales
 * tool. Emails read like a magazine reaching out to the subject of
 * coverage, not a CRM blast. No pitch for Relay anywhere; the colophon
 * line at the bottom does its quiet work.
 *
 * Cost: ~$0.015 per business x 30 = ~$0.45 in Claude.
 * Runtime: ~3-5 min.
 *
 * Usage:
 *   npm run generate:outreach            # write the kit
 *   npm run generate:outreach -- --dry   # preview, no Claude calls
 */

import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { loadAllRichBusinesses } from "@/lib/query/business-query";
import { familyForCategory } from "@/lib/data/category-family";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const MODEL = "claude-sonnet-4-6";
const OUT_DIR = join(process.cwd(), "content", "outreach");
const ISSUE_ID = "spring-2026";
const ISSUE_LABEL = "Issue 01, Spring 2026";
const SITE_BASE = "https://burgh-quarterly.vercel.app";

type OutreachEmail = {
  business_slug: string;
  business_name: string;
  neighborhood: string;
  family_label: string;
  rank_in_family: number | null;
  scorecard_url: string;
  /** Initial email, editorial: "you're in Issue 01, here's your record." */
  email_1: { subject: string; body: string };
  /** Follow-up email, marketing-leaning: pitches the free Relay creator
   *  match for verified owners, sent ~3-5 days after email_1 if no reply. */
  email_2: { subject: string; body: string };
};

function scrubEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, "-");
}

function formatPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M plays`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K plays`;
  return `${n.toLocaleString()} plays`;
}

type EmailPair = {
  email_1: { subject: string; body: string };
  email_2: { subject: string; body: string };
};

async function generateEmailPair(
  client: Anthropic,
  business: Awaited<ReturnType<typeof loadAllRichBusinesses>>[number],
  rankInFamily: number | null,
  familyLabel: string,
): Promise<EmailPair> {
  const e1 = await generateInitialEmail(client, business, rankInFamily, familyLabel);
  const e2 = await generateFollowupEmail(client, business, rankInFamily, familyLabel);
  return { email_1: e1, email_2: e2 };
}

async function generateInitialEmail(
  client: Anthropic,
  business: Awaited<ReturnType<typeof loadAllRichBusinesses>>[number],
  rankInFamily: number | null,
  familyLabel: string,
): Promise<{ subject: string; body: string }> {
  const biz = business.artifact.business;
  const meta = business.artifact.meta;
  const score = business.artifact.score;
  const social = business.social;
  const analysis = business.analysis;

  const tt = social.tiktok_mentions;
  const reviewCount = biz.google_review_count ?? 0;
  const rating = biz.google_rating ?? 0;
  const igPosts30d = social.ig?.posts_30d ?? 0;
  const igLastPost = social.ig?.last_post_at;

  // 2026-06-12 tier display rename: labels describe signal presence,
  // not business quality. DB keys unchanged.
  const tierLabel =
    score.tier === "icons"
      ? "Talk of the Town"
      : score.tier === "ones_to_watch"
        ? "In the Conversation"
        : "Word of Mouth";

  const diagnosisLine = analysis?.diagnosis_pullquote?.line ?? "";
  const topMove = analysis?.playbook?.[0];
  const topMoveText = topMove
    ? `${topMove.headline}. ${topMove.action}`
    : "";

  const factsBlock = [
    `Name: ${biz.name}`,
    `Neighborhood: ${biz.neighborhood}`,
    `Family: ${familyLabel}`,
    rankInFamily ? `Rank in family: #${rankInFamily}` : "",
    `Tier: ${tierLabel}`,
    `Total Google reviews: ${reviewCount.toLocaleString()}${rating ? ` (${rating} stars)` : ""}`,
    igPosts30d > 0
      ? `Instagram cadence: ${igPosts30d} posts in last 30 days`
      : `Instagram cadence: dormant${igLastPost ? ` (last post ${igLastPost.slice(0, 10)})` : ""}`,
    tt && tt.video_count > 0
      ? `TikTok creator coverage (last 90 days): ${tt.unique_creators} creators, ${tt.video_count} videos, ${formatPlays(tt.total_plays)}`
      : "TikTok creator coverage (last 90 days): none yet",
    diagnosisLine ? `Diagnosis line we published: "${diagnosisLine}"` : "",
    topMoveText ? `Top Playbook move we recommended: ${topMoveText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You're writing a launch-day email from Signal Pittsburgh, a quarterly publication that ranks Pittsburgh small businesses on social media. You are NOT a salesperson. You are an editor reaching out to the subject of coverage. Voice: warm, confident, specific, brief. Like a magazine editor letting an owner know they're in the issue. NEVER use em dashes. Use commas, periods, colons.

This email goes to the OWNER of this business. The publication is live. We want them to:
  1. Read their record on the site.
  2. Know what we said about them in the diagnosis (paste a piece of it).
  3. Subscribe to Issue 02 so they can track movement.
  4. Optionally share or forward.

We do NOT pitch anything. The colophon line at the bottom (handled by us, you don't write it) does the only Relay reference.

THE BUSINESS:
${factsBlock}

THEIR SCORECARD URL: ${SITE_BASE}/business/${biz.slug}

WRITE:
1) A short subject line (UNDER 60 characters). Specific to this business and what we noticed. Examples of the SHAPE we want (do not copy verbatim):
   "${biz.name} came in #1 in Sweets. We had to tell you."
   "We just put ${biz.name} in Issue 01."
   "${biz.name} just ranked. Here's what we said."
   "This is what Pittsburgh is saying about ${biz.name}."

2) A short email body (about 100-160 words, 3-4 short paragraphs). Open by telling them they're in Issue 01. Reference ONE specific thing from the data above (a number, the diagnosis line, the top move). Include the scorecard URL on its own line so it's clickable. Close with a line about Issue 02 subscription. Do not sign with a name (we'll add that).

OUTPUT FORMAT (exact):
SUBJECT: <subject line here>

BODY:
<body paragraphs separated by blank lines>

Return ONLY the SUBJECT/BODY block. No surrounding explanation.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error(`No text block in response for ${biz.slug}`);
  }

  const text = scrubEmDashes(block.text.trim());
  const subjectMatch = text.match(/^SUBJECT:\s*(.+?)\n/);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)$/);
  const subject = (subjectMatch?.[1] ?? `${biz.name}, you're in Signal Pittsburgh Issue 01.`).trim();
  const body = (bodyMatch?.[1] ?? text).trim();
  return { subject, body };
}

/**
 * Followup email, marketing-leaning. Sent ~3-5 days after the initial
 * editorial email if the owner hasn't subscribed or responded. Pitches
 * the Relay free creator-feature offer specifically. More direct CTA,
 * still owner-relevant data woven in.
 */
async function generateFollowupEmail(
  client: Anthropic,
  business: Awaited<ReturnType<typeof loadAllRichBusinesses>>[number],
  rankInFamily: number | null,
  familyLabel: string,
): Promise<{ subject: string; body: string }> {
  const biz = business.artifact.business;
  const social = business.social;
  const analysis = business.analysis;

  const tt = social.tiktok_mentions;
  const reviewCount = biz.google_review_count ?? 0;
  const igPosts30d = social.ig?.posts_30d ?? 0;

  const factsBlock = [
    `Name: ${biz.name}`,
    `Neighborhood: ${biz.neighborhood}`,
    `Family: ${familyLabel}`,
    rankInFamily ? `Rank in family: #${rankInFamily}` : "",
    `Total Google reviews: ${reviewCount.toLocaleString()}`,
    igPosts30d > 0 ? `IG cadence: ${igPosts30d} posts/30d` : "IG cadence: dormant",
    tt && tt.video_count > 0
      ? `TikTok creators filming this quarter: ${tt.unique_creators}, ${tt.total_plays.toLocaleString()} total plays`
      : "TikTok creator coverage: none yet",
    analysis?.diagnosis_pullquote?.line
      ? `Our diagnosis: "${analysis.diagnosis_pullquote.line}"`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You're writing a FOLLOWUP marketing email from Signal Pittsburgh, sent ~4 days after an initial editorial email if the owner didn't reply. The TONE is warmer and more sales-leaning than the first email, but still credible. NEVER use em dashes. Use commas, periods, colons.

The sender is the editor on behalf of Relay (the publisher of Signal Pittsburgh). Relay matches Pittsburgh small businesses with vetted local creators, free for verified owners. The pitch in this email is specifically the FREE CREATOR FEATURE OFFER, frame it as a free trial without the words 'free trial' if you can avoid them; 'free for verified owners' or 'no fee for the first match' lands better.

THE BUSINESS:
${factsBlock}

WRITE:
1) A short subject line UNDER 60 characters, more action-oriented than the first email. Specific to this business. Examples of the SHAPE we want (do not copy verbatim):
   "${biz.name}, want a creator to feature your spot? It's free."
   "Free creator match for ${biz.name}, ready in your inbox."
   "Following up: a creator could film ${biz.name} this month."
   "${biz.name}, your free Relay match is one form away."

2) A short email body (about 110-160 words, 3-4 paragraphs). The flow:
   - Brief reference to the initial email or the data we published.
   - Cite ONE specific number from the facts above (creator count, review depth, IG cadence, etc.) as the hook.
   - Make the offer: Pittsburgh creators on Relay's network are looking to feature local businesses. There's no fee for verified owners. The first match is always free.
   - Clear CTA: a single sentence with the apply URL: https://run-relay.com/apply?business=${biz.slug}
   - Sign off warm but brief. Don't sign with a name (we'll add).

Marketing-leaning means: more enthusiasm, more direct value framing, a clearer 'here's what you get' beat. Still owner-respectful, no marketing cliches like 'leverage', 'amplify', 'unlock', or 'transform.'

OUTPUT FORMAT (exact):
SUBJECT: <subject line>

BODY:
<paragraphs separated by blank lines>

Return ONLY the SUBJECT/BODY block.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error(`No text block in followup response for ${biz.slug}`);
  }
  const text = scrubEmDashes(block.text.trim());
  const subjectMatch = text.match(/^SUBJECT:\s*(.+?)\n/);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)$/);
  const subject = (subjectMatch?.[1] ?? `Free creator match for ${biz.name}.`).trim();
  const body = (bodyMatch?.[1] ?? text).trim();
  return { subject, body };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry") || args.includes("--dry-run");

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("[outreach] ANTHROPIC_API_KEY missing");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const all = await loadAllRichBusinesses({ fresh: true });
  console.log(`[outreach] writing for ${all.length} businesses`);

  // Compute rank-in-family for each business once
  const byFamily = new Map<string, typeof all>();
  for (const rb of all) {
    const key = familyForCategory(rb.artifact.meta.categoryName).key;
    if (!byFamily.has(key)) byFamily.set(key, []);
    byFamily.get(key)!.push(rb);
  }
  for (const arr of byFamily.values()) {
    arr.sort((a, b) => b.artifact.score.composite - a.artifact.score.composite);
  }
  const rankByslug = new Map<string, number>();
  for (const arr of byFamily.values()) {
    arr.forEach((rb, i) => rankByslug.set(rb.artifact.business.slug, i + 1));
  }

  if (dryRun) {
    console.log("[outreach] dry run, would generate:");
    for (const rb of all) {
      const fam = familyForCategory(rb.artifact.meta.categoryName);
      console.log(
        `  ${rb.artifact.business.slug} (#${rankByslug.get(rb.artifact.business.slug)} in ${fam.label})`,
      );
    }
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const emails: OutreachEmail[] = [];

  for (let i = 0; i < all.length; i++) {
    const rb = all[i];
    const biz = rb.artifact.business;
    const fam = familyForCategory(rb.artifact.meta.categoryName);
    const rank = rankByslug.get(biz.slug) ?? null;
    process.stdout.write(`[outreach] ${i + 1}/${all.length} ${biz.slug}... `);
    try {
      const pair = await generateEmailPair(client, rb, rank, fam.label);
      emails.push({
        business_slug: biz.slug,
        business_name: biz.name,
        neighborhood: biz.neighborhood,
        family_label: fam.label,
        rank_in_family: rank,
        scorecard_url: `${SITE_BASE}/business/${biz.slug}`,
        email_1: pair.email_1,
        email_2: pair.email_2,
      });
      console.log("ok (initial + followup)");
    } catch (err) {
      console.error("FAIL", err);
    }
  }

  // Write structured JSON
  const jsonPath = join(OUT_DIR, `${ISSUE_ID}.json`);
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        issue_id: ISSUE_ID,
        issue_label: ISSUE_LABEL,
        generated_at: new Date().toISOString(),
        model: MODEL,
        emails,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  // Write human-readable markdown digest
  const md: string[] = [];
  md.push(`# Owner Outreach Kit, ${ISSUE_LABEL}`);
  md.push("");
  md.push(
    `${emails.length} businesses, two emails each (${emails.length * 2} total), generated ${new Date().toISOString().slice(0, 10)} from the live data. Email 1 is editorial: 'you're in Issue 01, here's your record.' Email 2 (sent ~4 days later if no reply) is a marketing-leaning pitch for the free Relay creator-feature offer.`,
  );
  md.push("");
  md.push(
    "Workflow: scan the list, edit any subject/body that doesn't land, paste each into your email tool, or import the JSON manifest into a sequencer (Instantly, Mailchimp, etc.) with a 4-day delay between email 1 and email 2 per recipient. Stop the sequence on reply.",
  );
  md.push("");
  md.push("---");
  md.push("");
  for (const e of emails) {
    md.push(`## ${e.business_name}`);
    md.push("");
    md.push(`**Neighborhood:** ${e.neighborhood}  `);
    md.push(`**Family:** ${e.family_label}  `);
    md.push(
      `**Rank:** ${e.rank_in_family ? `#${e.rank_in_family} in ${e.family_label}` : "Unranked"}  `,
    );
    md.push(`**Scorecard:** ${e.scorecard_url}`);
    md.push("");
    md.push(`### Email 1, initial editorial (Day 0)`);
    md.push("");
    md.push(`**Subject:** ${e.email_1.subject}`);
    md.push("");
    md.push(`**Body:**`);
    md.push("");
    for (const p of e.email_1.body.split(/\n\n+/)) {
      md.push(p.trim());
      md.push("");
    }
    md.push(`### Email 2, followup, free Relay match pitch (Day 4-5 if no reply)`);
    md.push("");
    md.push(`**Subject:** ${e.email_2.subject}`);
    md.push("");
    md.push(`**Body:**`);
    md.push("");
    for (const p of e.email_2.body.split(/\n\n+/)) {
      md.push(p.trim());
      md.push("");
    }
    md.push("---");
    md.push("");
  }
  const mdPath = join(OUT_DIR, `${ISSUE_ID}.md`);
  await writeFile(mdPath, md.join("\n"), "utf-8");

  console.log(
    `\n[outreach] done. ${emails.length} emails written to:\n  ${mdPath}\n  ${jsonPath}`,
  );
}

main().catch((err) => {
  console.error("[outreach] fatal:", err);
  process.exit(1);
});
