/**
 * HubSpot Forms client. Mirrors the Attio integration: every
 * subscribe/claim submission also lands in HubSpot via the public
 * Forms Submissions API, so leads exist in both CRMs simultaneously.
 *
 * Endpoint: POST https://api.hsforms.com/submissions/v3/integration/submit/{portalId}/{formId}
 *
 * No auth required. This is the public form-submission endpoint
 * HubSpot uses for their embedded forms widget. Portal ID + Form GUID
 * are non-secret and live in env so they can be swapped without code
 * changes.
 *
 * Failure mode: HubSpot rejecting (or being unreachable) does NOT
 * block the user submission. Same pattern as Attio: CRMs are
 * side-channels.
 */

const HS_BASE = "https://api.hsforms.com/submissions/v3/integration/submit";

type HubSpotField = {
  /** HubSpot internal property name, e.g. "email", "firstname". */
  name: string;
  value: string;
};

type SubmitArgs = {
  email: string;
  /** Optional; sends as HubSpot "firstname". */
  firstName?: string;
  /** Optional; sends as HubSpot "lastname". */
  lastName?: string;
  /** URL of the page where the submission originated. */
  pageUri?: string | null;
  /** Human-readable page name shown in HubSpot's submission view. */
  pageName?: string;
  /** Extra custom fields, e.g. { business_claimed: "hidden-harbor" }. */
  extraFields?: Record<string, string>;
};

/**
 * Submit one entry to the configured HubSpot form. Reads
 * HUBSPOT_PORTAL_ID and HUBSPOT_FORM_ID from env. If either is
 * missing, returns soft-failure (the caller treats this as optional).
 */
export async function submitToHubSpot(
  args: SubmitArgs,
): Promise<{ ok: boolean; error?: string }> {
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  const formId = process.env.HUBSPOT_FORM_ID;
  if (!portalId || !formId) {
    console.warn(
      "[hubspot] HUBSPOT_PORTAL_ID or HUBSPOT_FORM_ID not set; skipping",
    );
    return { ok: false, error: "no_form_config" };
  }

  const fields: HubSpotField[] = [{ name: "email", value: args.email }];
  if (args.firstName && args.firstName.trim()) {
    fields.push({ name: "firstname", value: args.firstName.trim() });
  }
  if (args.lastName && args.lastName.trim()) {
    fields.push({ name: "lastname", value: args.lastName.trim() });
  }
  if (args.extraFields) {
    for (const [name, value] of Object.entries(args.extraFields)) {
      if (value) fields.push({ name, value });
    }
  }

  const body = {
    fields,
    context: {
      pageUri: args.pageUri ?? "https://burgh-quarterly.vercel.app",
      pageName: args.pageName ?? "Signal Pittsburgh",
    },
  };

  try {
    const res = await fetch(`${HS_BASE}/${portalId}/${formId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      console.error("[hubspot] submit failed:", res.status, json);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[hubspot] submit exception:", err);
    return { ok: false, error: "exception" };
  }
}

/**
 * Split a single "Anna Galante" string into firstName / lastName.
 * Same convention used in lib/attio/client.ts so the two CRMs stay in
 * sync on name shape.
 */
export function splitFullName(full: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = full.trim();
  const i = trimmed.indexOf(" ");
  if (i === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, i),
    lastName: trimmed.slice(i + 1),
  };
}
