import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

import {
  addPersonToList,
  createPersonNote,
  upsertPersonByEmail,
} from "@/lib/attio/client";
import { splitFullName, submitToHubSpot } from "@/lib/hubspot/client";

/**
 * POST /api/request, the "ask to be in the next issue" endpoint.
 *
 * Editorially distinct from /api/subscribe (newsletter signup) and
 * /api/claim (verify ownership of an existing record). This is for
 * unranked Pittsburgh business owners who want to be reviewed for
 * Issue 02.
 *
 * Flow mirrors /api/subscribe:
 *   1. Validate required fields + email shape.
 *   2. Honeypot check; silently drop if `website_url` is filled.
 *   3. Append to content/leads/requests.jsonl with consent metadata.
 *   4. Upsert Person in Attio + add to "Signal PGH" list + leave a
 *      note titled "Requested profile in next issue" with the
 *      business context. Failures don't block.
 *   5. Mirror to HubSpot via submitToHubSpot, page name "Signal
 *      Pittsburgh request profile". Failures don't block.
 *   6. If RESEND_API_KEY is set, fire a confirmation email. Skip
 *      gracefully if unset, exactly mirroring /api/subscribe.
 *   7. Return { ok: true, mailed: boolean }.
 *
 * Voice rules: confirmation email is short, editorial, "We got it"
 * tone, no marketing-speak, no em dashes, never promises inclusion.
 */

type Body = {
  businessName?: unknown;
  neighborhood?: unknown;
  websiteOrInstagram?: unknown;
  contactName?: unknown;
  email?: unknown;
  notes?: unknown;
  website_url?: unknown; // honeypot
};

const LEADS_DIR = path.join(process.cwd(), "content", "leads");
const REQUESTS_FILE = path.join(LEADS_DIR, "requests.jsonl");

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function asTrimmedString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

async function appendRequest(
  record: Record<string, unknown>,
): Promise<void> {
  await fs.mkdir(LEADS_DIR, { recursive: true });
  await fs.appendFile(REQUESTS_FILE, JSON.stringify(record) + "\n", "utf-8");
}

async function sendConfirmation(args: {
  email: string;
  contactName: string;
  businessName: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[request] RESEND_API_KEY not set, skipping confirmation email (request still captured)",
    );
    return { sent: false, error: "no_api_key" };
  }
  try {
    const resend = new Resend(apiKey);
    const fromAddress =
      process.env.RESEND_FROM ?? "Signal Pittsburgh <signal@run-relay.com>";

    const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0F0F0F; padding:32px; max-width:560px;">
<div style="background:#0F0F0F; color:#F5F0FA; padding:24px; margin-bottom:24px;">
  <p style="margin:0; font-size:11px; text-transform:uppercase; letter-spacing:0.18em; color:#C6F432;">Signal Pittsburgh</p>
  <h1 style="margin:8px 0 0 0; font-size:24px; line-height:1.1; font-weight:900; letter-spacing:-0.02em;">We got it.</h1>
</div>
<p style="margin:0 0 16px 0;">Thanks ${args.contactName}, we got your request for ${args.businessName}.</p>
<p style="margin:0 0 16px 0;">We review every request by hand before Issue 02 ships this summer. If your business fits the next issue, you&rsquo;ll hear from us before it drops. Either way, we&rsquo;ll be in touch.</p>
<p style="margin:0 0 16px 0; font-size:13px; color:#0F0F0F99;">Signal is published by Relay. We don&rsquo;t rank taste. We rank the conversation.</p>
</body></html>`;
    const text = `We got it.

Thanks ${args.contactName}, we got your request for ${args.businessName}.

We review every request by hand before Issue 02 ships this summer. If your business fits the next issue, you'll hear from us before it drops. Either way, we'll be in touch.

Signal is published by Relay. We don't rank taste. We rank the conversation.`;

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: args.email,
      subject: "We got it. We'll review you for Issue 02.",
      html,
      text,
    });
    if (error) {
      console.error("[request] resend send error:", error);
      return { sent: false, error: error.name ?? "resend_error" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[request] resend exception:", err);
    return { sent: false, error: "exception" };
  }
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

  // Honeypot: bots fill every input they find. Silently 200 so they
  // don't learn the field is the trap. No record written.
  if (typeof body.website_url === "string" && body.website_url.trim() !== "") {
    return NextResponse.json({ ok: true, mailed: false });
  }

  const businessName = asTrimmedString(body.businessName, 140);
  const neighborhood = asTrimmedString(body.neighborhood, 80);
  const websiteOrInstagram = asTrimmedString(body.websiteOrInstagram, 200);
  const contactName = asTrimmedString(body.contactName, 120);
  const emailRaw = asTrimmedString(body.email, 200);
  const notes = asTrimmedString(body.notes, 280);

  if (!businessName) {
    return NextResponse.json(
      { ok: false, error: "Business name is required" },
      { status: 400 },
    );
  }
  if (!neighborhood) {
    return NextResponse.json(
      { ok: false, error: "Neighborhood is required" },
      { status: 400 },
    );
  }
  if (!websiteOrInstagram) {
    return NextResponse.json(
      { ok: false, error: "Website or Instagram is required" },
      { status: 400 },
    );
  }
  if (!contactName) {
    return NextResponse.json(
      { ok: false, error: "Your name is required" },
      { status: 400 },
    );
  }
  if (!emailRaw || !isEmail(emailRaw)) {
    return NextResponse.json(
      { ok: false, error: "Invalid email" },
      { status: 400 },
    );
  }

  const email = emailRaw.toLowerCase();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const ua = request.headers.get("user-agent") ?? null;

  const record = {
    kind: "request_profile",
    business_name: businessName,
    neighborhood,
    website_or_instagram: websiteOrInstagram,
    contact_name: contactName,
    email,
    notes: notes ?? null,
    ip,
    ua,
    captured_at: new Date().toISOString(),
  };

  // Local JSONL log (works in dev; silently fails on Vercel, Attio
  // is the source of truth in prod).
  try {
    await appendRequest(record);
  } catch (err) {
    console.error("[request] failed to append request:", err);
  }

  // Attio CRM upsert (Person record by email) + add to "Signal PGH"
  // list + request note. Failures don't block.
  const attioPerson = await upsertPersonByEmail({
    email,
    name: contactName,
  });
  if (attioPerson.ok) {
    const listId = process.env.ATTIO_LIST_SIGNAL_PGH;
    if (listId) {
      await addPersonToList({
        listId,
        personRecordId: attioPerson.recordId,
      });
    }
    const noteLines = [
      `Source: request_profile`,
      `Business: ${businessName}`,
      `Neighborhood: ${neighborhood}`,
      `Website or Instagram: ${websiteOrInstagram}`,
      notes ? `Notes: ${notes}` : null,
      `Captured at: ${record.captured_at}`,
      ip ? `IP: ${ip}` : null,
      ua ? `User agent: ${ua}` : null,
    ].filter(Boolean) as string[];
    await createPersonNote({
      personRecordId: attioPerson.recordId,
      title: "Requested profile in next issue",
      content: noteLines.join("\n"),
    });
  }

  // HubSpot mirror.
  const { firstName, lastName } = splitFullName(contactName);
  await submitToHubSpot({
    email,
    firstName,
    lastName,
    pageUri: "https://burgh-quarterly.vercel.app/request",
    pageName: "Signal Pittsburgh request profile",
    extraFields: {
      company: businessName,
    },
  });

  const confirmation = await sendConfirmation({
    email,
    contactName,
    businessName,
  });

  return NextResponse.json({ ok: true, mailed: confirmation.sent });
}
