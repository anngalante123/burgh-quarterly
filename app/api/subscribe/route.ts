import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import { createPersonNote, upsertPersonByEmail } from "@/lib/attio/client";

/**
 * POST /api/subscribe, the subscribe + unlock endpoint.
 *
 * Flow per LEAD_CAPTURE.md § Gate 2:
 *   1. Validate email shape.
 *   2. Append to content/leads/leads.jsonl with consent metadata
 *      (email, source, timestamp, IP, UA).
 *   3. If RESEND_API_KEY is set, fire a confirmation email. If not,
 *      log a warning and continue, the lead is captured either way
 *      so launch isn't blocked on an unset key.
 *   4. Set a cookie (`signal_unlocked`) so the medium gate on
 *      business pages opens for this visitor on every page.
 *
 * The endpoint is a single POST. Both the SubscribeFooter on every
 * business page and the GatedReveal email gate post here. Either entry
 * point unlocks the whole site for this visitor.
 *
 * Editorial framing per CLAUDE.md voice rules: confirmation email is
 * short, no marketing-speak, no em dashes, "you're in for Issue 02".
 */

type Body = {
  email?: unknown;
  follow?: unknown;
  source?: unknown;
};

const LEADS_DIR = path.join(process.cwd(), "content", "leads");
const LEADS_FILE = path.join(LEADS_DIR, "leads.jsonl");
const COOKIE_NAME = "signal_unlocked";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function isEmail(s: string): boolean {
  // Permissive shape check, real validation happens via deliverability.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function appendLead(record: Record<string, unknown>): Promise<void> {
  await fs.mkdir(LEADS_DIR, { recursive: true });
  await fs.appendFile(LEADS_FILE, JSON.stringify(record) + "\n", "utf-8");
}

async function sendConfirmation(email: string, follow: string | null): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[subscribe] RESEND_API_KEY not set, skipping confirmation email (lead still captured)",
    );
    return { sent: false, error: "no_api_key" };
  }
  try {
    const resend = new Resend(apiKey);
    const fromAddress =
      process.env.RESEND_FROM ?? "Signal Pittsburgh <signal@run-relay.com>";
    const subject = follow
      ? `You're in. We'll tell you when ${follow} climbs.`
      : "You're in. Issue 02 lands this summer.";
    const followLine = follow
      ? `<p style="margin:0 0 16px 0;">We'll email you when ${follow}'s Issue 02 numbers land. No filler in between.</p>`
      : `<p style="margin:0 0 16px 0;">Quarterly. One email per issue. We'll tell you when Issue 02 drops.</p>`;
    const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0F0F0F; padding:32px; max-width:560px;">
<div style="background:#0F0F0F; color:#F5F0FA; padding:24px; margin-bottom:24px;">
  <p style="margin:0; font-size:11px; text-transform:uppercase; letter-spacing:0.18em; color:#C6F432;">Signal Pittsburgh</p>
  <h1 style="margin:8px 0 0 0; font-size:24px; line-height:1.1; font-weight:900; letter-spacing:-0.02em;">You're on the list.</h1>
</div>
${followLine}
<p style="margin:0 0 16px 0;">Issue 01 is live at <a href="https://burgh-quarterly.vercel.app" style="color:#AB35EE;">signal.run-relay.com</a>. Read every business in this quarter's index, ranked on reviews, social, and creator coverage.</p>
<p style="margin:0 0 16px 0; font-size:13px; color:#0F0F0F99;">Signal is published by Relay. We don't rank taste. We rank the conversation.</p>
</body></html>`;
    const text = `You're on the list.

${follow ? `We'll email you when ${follow}'s Issue 02 numbers land. No filler in between.` : "Quarterly. One email per issue. We'll tell you when Issue 02 drops."}

Issue 01 is live at burgh-quarterly.vercel.app

Signal is published by Relay. We don't rank taste. We rank the conversation.`;

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[subscribe] resend send error:", error);
      return { sent: false, error: error.name ?? "resend_error" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[subscribe] resend exception:", err);
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

  if (typeof body.email !== "string" || !isEmail(body.email)) {
    return NextResponse.json(
      { ok: false, error: "Invalid email" },
      { status: 400 },
    );
  }

  const email = body.email.trim().toLowerCase();
  const follow = typeof body.follow === "string" ? body.follow : null;
  const source = typeof body.source === "string" ? body.source : null;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const ua = request.headers.get("user-agent") ?? null;

  const record = {
    email,
    follow,
    source,
    ip,
    ua,
    captured_at: new Date().toISOString(),
  };

  // Local JSONL log (works in dev, silently fails on Vercel — that's fine
  // since Attio is now the source of truth in prod).
  try {
    await appendLead(record);
  } catch (err) {
    console.error("[subscribe] failed to append lead:", err);
  }

  // Attio CRM upsert. Failure here doesn't block the user — they still
  // get the cookie + confirmation email — but it logs so we notice.
  const attioPerson = await upsertPersonByEmail({ email });
  if (attioPerson.ok) {
    const noteLines = [
      `Source: subscribe`,
      source ? `Page: ${source}` : null,
      follow ? `Following: ${follow}` : null,
      `Captured at: ${record.captured_at}`,
      ip ? `IP: ${ip}` : null,
      ua ? `User agent: ${ua}` : null,
    ].filter(Boolean) as string[];
    await createPersonNote({
      personRecordId: attioPerson.recordId,
      title: follow
        ? `Subscribed (following ${follow})`
        : "Subscribed to Signal Pittsburgh",
      content: noteLines.join("\n"),
    });
  }

  const confirmation = await sendConfirmation(email, follow);

  const res = NextResponse.json({ ok: true, mailed: confirmation.sent });
  res.cookies.set(COOKIE_NAME, "1", {
    httpOnly: false, // client component reads this to update its UI
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
