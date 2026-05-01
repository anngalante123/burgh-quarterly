import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

import { loadBusinessBySlug } from "@/lib/data/load-business";
import {
  addPersonToList,
  createPersonNote,
  upsertPersonByEmail,
} from "@/lib/attio/client";
import { splitFullName, submitToHubSpot } from "@/lib/hubspot/client";

/**
 * POST /api/claim, the Gate-3 ownership claim endpoint.
 *
 * Per LEAD_CAPTURE.md § Gate 3 + the v1 simplification (manual review,
 * not magic-link), the flow is:
 *   1. Validate input shape (slug exists, email is plausible, name and
 *      verification non-empty).
 *   2. Append to content/leads/claims.jsonl with full metadata.
 *   3. If RESEND_API_KEY is set:
 *      - Email the claimant: "we got your claim, we'll be in touch."
 *      - Email the admin (Anna) at ADMIN_EMAIL with the full claim
 *        details so she can verify against public info.
 *      Either email failing does NOT fail the request. The lead is
 *      still captured.
 *   4. Return ok.
 *
 * No cookies are set here; the claim isn't verified yet, so the
 * private Opportunities view stays gated until Anna confirms.
 *
 * Voice rules: confirmation email matches Signal Pittsburgh editorial
 * voice. Short, no jargon, no em dashes.
 */

type Body = {
  slug?: unknown;
  email?: unknown;
  name?: unknown;
  verification?: unknown;
};

const LEADS_DIR = path.join(process.cwd(), "content", "leads");
const CLAIMS_FILE = path.join(LEADS_DIR, "claims.jsonl");

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function appendClaim(record: Record<string, unknown>): Promise<void> {
  await fs.mkdir(LEADS_DIR, { recursive: true });
  await fs.appendFile(CLAIMS_FILE, JSON.stringify(record) + "\n", "utf-8");
}

async function sendEmails(args: {
  email: string;
  name: string;
  verification: string;
  slug: string;
  businessName: string;
}): Promise<{ claimant: boolean; admin: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[claim] RESEND_API_KEY not set, skipping emails (claim still captured)",
    );
    return { claimant: false, admin: false };
  }

  const resend = new Resend(apiKey);
  const fromAddress =
    process.env.RESEND_FROM ?? "Signal Pittsburgh <signal@run-relay.com>";
  const adminEmail =
    process.env.ADMIN_EMAIL ?? "annamarie.galante@blastpoint.com";

  let claimantOk = false;
  let adminOk = false;

  // Confirmation to the claimant.
  try {
    const claimantHtml = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0F0F0F; padding:32px; max-width:560px;">
<div style="background:#0F0F0F; color:#F5F0FA; padding:24px; margin-bottom:24px;">
  <p style="margin:0; font-size:11px; text-transform:uppercase; letter-spacing:0.18em; color:#C6F432;">Signal Pittsburgh</p>
  <h1 style="margin:8px 0 0 0; font-size:24px; line-height:1.1; font-weight:900; letter-spacing:-0.02em;">Claim received.</h1>
</div>
<p style="margin:0 0 16px 0;">Thanks ${args.name}, we got your claim for ${args.businessName}.</p>
<p style="margin:0 0 16px 0;">We verify by hand and will email confirmation within 2 business days. Once verified, you&rsquo;ll see the private Opportunities view, the specific moves that close the gap to the next tier, and you can opt into movement alerts when your rank changes.</p>
<p style="margin:0 0 16px 0; font-size:13px; color:#0F0F0F99;">Signal is published by Relay. We don&rsquo;t rank taste. We rank the conversation.</p>
</body></html>`;
    const claimantText = `Claim received.

Thanks ${args.name}, we got your claim for ${args.businessName}.

We verify by hand and will email confirmation within 2 business days. Once verified, you'll see the private Opportunities view, the specific moves that close the gap to the next tier, and you can opt into movement alerts when your rank changes.

Signal is published by Relay. We don't rank taste. We rank the conversation.`;

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: args.email,
      subject: `Claim received for ${args.businessName}.`,
      html: claimantHtml,
      text: claimantText,
    });
    if (error) {
      console.error("[claim] resend claimant email error:", error);
    } else {
      claimantOk = true;
    }
  } catch (err) {
    console.error("[claim] claimant email exception:", err);
  }

  // Admin notification with full claim details.
  try {
    const adminHtml = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0F0F0F; padding:32px; max-width:560px;">
<h2 style="margin:0 0 16px 0; font-size:18px;">New claim, ${args.businessName}</h2>
<table style="border-collapse:collapse; width:100%; font-size:14px;">
  <tr><td style="padding:6px 0; color:#0F0F0F99; width:120px;">Business:</td><td style="padding:6px 0;"><a href="https://burgh-quarterly.vercel.app/business/${args.slug}" style="color:#AB35EE;">${args.businessName}</a></td></tr>
  <tr><td style="padding:6px 0; color:#0F0F0F99;">Claimant:</td><td style="padding:6px 0;">${args.name}</td></tr>
  <tr><td style="padding:6px 0; color:#0F0F0F99;">Email:</td><td style="padding:6px 0;"><a href="mailto:${args.email}" style="color:#AB35EE;">${args.email}</a></td></tr>
  <tr><td style="padding:6px 0; color:#0F0F0F99; vertical-align:top;">Verification:</td><td style="padding:6px 0;">${escapeHtml(args.verification)}</td></tr>
</table>
<p style="margin:24px 0 0 0; font-size:13px; color:#0F0F0F99;">Verify against public info, then mark verified in claims.jsonl.</p>
</body></html>`;
    const adminText = `New claim, ${args.businessName}

Business: https://burgh-quarterly.vercel.app/business/${args.slug}
Claimant: ${args.name}
Email: ${args.email}
Verification: ${args.verification}

Verify against public info, then mark verified in claims.jsonl.`;

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `[Signal] Claim, ${args.businessName} (${args.email})`,
      html: adminHtml,
      text: adminText,
      replyTo: args.email,
    });
    if (error) {
      console.error("[claim] resend admin email error:", error);
    } else {
      adminOk = true;
    }
  } catch (err) {
    console.error("[claim] admin email exception:", err);
  }

  return { claimant: claimantOk, admin: adminOk };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed request" },
      { status: 400 },
    );
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const verification =
    typeof body.verification === "string" ? body.verification.trim() : "";

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "Missing business" },
      { status: 400 },
    );
  }
  if (!email || !isEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Invalid email" },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Name required" },
      { status: 400 },
    );
  }
  if (!verification || verification.length < 4) {
    return NextResponse.json(
      { ok: false, error: "Add a quick way for us to verify" },
      { status: 400 },
    );
  }

  const artifact = await loadBusinessBySlug(slug);
  if (!artifact) {
    return NextResponse.json(
      { ok: false, error: "Business not found" },
      { status: 404 },
    );
  }
  const businessName = artifact.business.name;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const ua = request.headers.get("user-agent") ?? null;

  const record = {
    kind: "claim",
    slug,
    business_name: businessName,
    email,
    name,
    verification,
    verified: false,
    ip,
    ua,
    captured_at: new Date().toISOString(),
  };

  // Local JSONL log (works in dev; silently fails on Vercel. Attio is
  // the source of truth in prod).
  try {
    await appendClaim(record);
  } catch (err) {
    console.error("[claim] failed to append claim:", err);
    // Don't fail the request. Attio + Resend below still capture the lead.
  }

  // Attio CRM upsert (Person record by email) + add to "Signal PGH"
  // list + claim note.
  const attioPerson = await upsertPersonByEmail({ email, name });
  if (attioPerson.ok) {
    const listId = process.env.ATTIO_LIST_SIGNAL_PGH;
    if (listId) {
      await addPersonToList({
        listId,
        personRecordId: attioPerson.recordId,
      });
    }
    const noteLines = [
      `Source: claim`,
      `Business: ${businessName} (slug: ${slug})`,
      `Verification: ${verification}`,
      `Verified: false (manual review pending)`,
      `Captured at: ${record.captured_at}`,
      ip ? `IP: ${ip}` : null,
      ua ? `User agent: ${ua}` : null,
    ].filter(Boolean) as string[];
    await createPersonNote({
      personRecordId: attioPerson.recordId,
      title: `Claim: ${businessName}`,
      content: noteLines.join("\n"),
    });
  }

  // HubSpot mirror: claim submissions land in HubSpot too. We pass
  // the splitted name and the business slug as page context so it's
  // visible in HubSpot's submission view.
  const { firstName, lastName } = splitFullName(name);
  await submitToHubSpot({
    email,
    firstName,
    lastName,
    pageUri: `https://burgh-quarterly.vercel.app/claim/${slug}`,
    pageName: `Signal Pittsburgh claim: ${businessName}`,
  });

  const mailed = await sendEmails({
    email,
    name,
    verification,
    slug,
    businessName,
  });

  return NextResponse.json({
    ok: true,
    mailed: mailed.claimant,
    notified: mailed.admin,
  });
}
