/**
 * Attio CRM client. Replaces the previous filesystem JSONL writes for
 * subscribe + claim submissions, which silently failed on Vercel
 * (read-only filesystem) and didn't survive across deploys anyway.
 *
 * Pattern: every submission upserts a Person record by email
 * (Attio's "assert" mode handles dedup automatically, same email →
 * existing record updated, never duplicated), then attaches a Note
 * with the submission context (source, business slug if a claim,
 * verification text, timestamp).
 *
 * Failure mode: if Attio is unreachable or the API rejects, the
 * functions log + return a soft error. The caller should NOT block
 * the user submission on Attio. Resend confirmation still goes out,
 * the form still succeeds. Attio is a side-channel, not the
 * source-of-truth for completing a request.
 *
 * Auth: ATTIO_API_KEY in env. Bearer token. Workspace-scoped.
 */

const ATTIO_BASE = "https://api.attio.com/v2";

function authHeaders(): Record<string, string> | null {
  const key = process.env.ATTIO_API_KEY;
  if (!key) {
    console.warn("[attio] ATTIO_API_KEY not set; skipping CRM write");
    return null;
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

type UpsertPersonArgs = {
  email: string;
  name?: string;
};

type UpsertResult =
  | { ok: true; recordId: string }
  | { ok: false; error: string };

/**
 * Upsert a Person by email. Uses Attio's "assert" mode
 * (matching_attribute=email_addresses) so calling twice with the
 * same email won't create a duplicate. It'll update the existing
 * record. Returns the Person's record_id for follow-up note creation.
 */
export async function upsertPersonByEmail(
  args: UpsertPersonArgs,
): Promise<UpsertResult> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "no_api_key" };

  const values: Record<string, unknown> = {
    email_addresses: [args.email],
  };

  if (args.name && args.name.trim()) {
    // Attio's personal-name type accepts a single string or first/last split.
    // Splitting on first space keeps it simple and survives "Mary Anne Smith"
    // (last_name = "Anne Smith") without any special-case logic.
    const trimmed = args.name.trim();
    const spaceIdx = trimmed.indexOf(" ");
    const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const lastName = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1);
    values.name = [
      {
        first_name: firstName,
        last_name: lastName,
        full_name: trimmed,
      },
    ];
  }

  try {
    const res = await fetch(
      `${ATTIO_BASE}/objects/people/records?matching_attribute=email_addresses`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ data: { values } }),
      },
    );
    const json = (await res.json()) as {
      data?: { id?: { record_id?: string } };
      [k: string]: unknown;
    };
    if (!res.ok) {
      console.error("[attio] upsertPerson failed:", res.status, json);
      return { ok: false, error: `http_${res.status}` };
    }
    const recordId = json?.data?.id?.record_id;
    if (!recordId) {
      console.error("[attio] upsertPerson returned no record_id:", json);
      return { ok: false, error: "no_record_id" };
    }
    return { ok: true, recordId };
  } catch (err) {
    console.error("[attio] upsertPerson exception:", err);
    return { ok: false, error: "exception" };
  }
}

type CreateNoteArgs = {
  personRecordId: string;
  title: string;
  /** Plaintext content. Attio will render it in their notes UI. */
  content: string;
};

/**
 * Attach a note to a Person record. We use this for the editorial
 * context of a submission: source page, business being claimed,
 * verification text, etc. Notes are append-only in Attio so the
 * activity history of repeat submitters survives.
 */
type AddToListArgs = {
  /** Attio list UUID. */
  listId: string;
  /** Person record_id returned by upsertPersonByEmail. */
  personRecordId: string;
};

/**
 * Add a Person to an Attio list (creates a list entry). Idempotent:
 * Attio dedupes list entries by parent_record_id within a list, so
 * calling twice for the same person is a no-op.
 *
 * Used to drop every subscribe + claim submitter into the master
 * "Signal PGH" list so the editorial team can work the lead pipeline
 * inside Attio without filtering across the entire People object.
 */
export async function addPersonToList(
  args: AddToListArgs,
): Promise<{ ok: boolean; error?: string }> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "no_api_key" };

  try {
    const res = await fetch(
      `${ATTIO_BASE}/lists/${args.listId}/entries`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            parent_record_id: args.personRecordId,
            parent_object: "people",
            entry_values: {},
          },
        }),
      },
    );
    // Attio returns 409-ish behavior as a normal response; we accept
    // any 2xx as success. Duplicates are silently fine because Attio
    // collapses them on its side.
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      // 400 with "already exists" is OK. Surface it but don't treat
      // as failure for the caller's purposes.
      const errMsg = JSON.stringify(json).toLowerCase();
      if (errMsg.includes("already") || errMsg.includes("duplicate")) {
        return { ok: true };
      }
      console.error("[attio] addPersonToList failed:", res.status, json);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[attio] addPersonToList exception:", err);
    return { ok: false, error: "exception" };
  }
}

export async function createPersonNote(
  args: CreateNoteArgs,
): Promise<{ ok: boolean; error?: string }> {
  const headers = authHeaders();
  if (!headers) return { ok: false, error: "no_api_key" };

  try {
    const res = await fetch(`${ATTIO_BASE}/notes`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          parent_object: "people",
          parent_record_id: args.personRecordId,
          title: args.title,
          content: args.content,
          format: "plaintext",
        },
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      console.error("[attio] createNote failed:", res.status, json);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[attio] createNote exception:", err);
    return { ok: false, error: "exception" };
  }
}
