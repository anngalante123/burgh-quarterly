import { NextResponse } from "next/server";

/**
 * POST /api/subscribe, stubbed subscribe endpoint.
 *
 * Per the current task brief: wiring to Resend + leads.jsonl writes happens
 * in a later task. For now this endpoint validates the shape of the request,
 * logs it, and returns 200. No data is persisted.
 *
 * When this is wired up for real, the implementation in LEAD_CAPTURE.md § Gate 2
 * applies: write to content/leads/leads.jsonl, send Resend confirmation,
 * capture IP + UA + timestamp for consent proof.
 */

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email !== "string" || !body.email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Invalid email" },
        { status: 400 },
      );
    }
    console.log("[subscribe:stub]", { email: body.email, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed request" },
      { status: 400 },
    );
  }
}
