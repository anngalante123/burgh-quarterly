import fs from "node:fs";
import path from "node:path";

/**
 * Loader for issue snapshot archives produced by
 * scripts/snapshot-issue.ts. Used to surface period-over-period
 * trajectory: "Pages was #1 in Spring, dropped to #3 in Summer."
 *
 * Pattern:
 *   1. After every issue ships, run `npm run snapshot:issue -- <id>`.
 *   2. Snapshots accumulate at content/issues/<issue-id>/...
 *   3. The next issue's pipeline can read from prior snapshots via
 *      this loader to compute deltas.
 *
 * Cheap and lazy: reads JSON on demand, no in-memory cache. Add a cache
 * if a hot path uses this on every render.
 */

export type IssueSnapshotMeta = {
  issue_id: string;
  snapshotted_at: string;
  sources: string[];
  total_files: number;
};

export type ArchivedRank = {
  issue_id: string;
  rank_family: number | null;
  rank_category: number | null;
  composite: number | null;
  tier: string | null;
};

const ISSUES_DIR = path.join(process.cwd(), "content", "issues");

/** All available issue IDs, sorted oldest-first by snapshot timestamp. */
export function listArchivedIssues(): string[] {
  if (!fs.existsSync(ISSUES_DIR)) return [];
  const entries = fs
    .readdirSync(ISSUES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  // Sort by manifest snapshotted_at if available, else lexicographic
  const withTime = entries.map((id) => {
    const manifestPath = path.join(ISSUES_DIR, id, "manifest.json");
    let when = "";
    if (fs.existsSync(manifestPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as IssueSnapshotMeta;
        when = m.snapshotted_at ?? "";
      } catch {}
    }
    return { id, when };
  });
  withTime.sort((a, b) => a.when.localeCompare(b.when));
  return withTime.map((x) => x.id);
}

/** Load a single business artifact from an archived issue. Null if missing. */
export function loadArchivedBusiness(
  issueId: string,
  slug: string,
): {
  business: { slug: string; name: string };
  score: { composite: number; rank_category: number; rank_family?: number; tier: string };
} | null {
  const file = path.join(ISSUES_DIR, issueId, "businesses", `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown> & {
    _score?: { composite: number; rank_category: number; rank_family?: number; tier: string };
    name?: string;
    slug?: string;
  };
  if (!raw._score) return null;
  return {
    business: {
      slug: (raw.slug as string) ?? slug,
      name: (raw.name as string) ?? slug,
    },
    score: raw._score,
  };
}

/**
 * Get the most recent prior-issue rank for a business, useful for
 * showing rank trajectory ("Spring 2026: #5 → Summer 2026: #2 (▲3)").
 *
 * Returns null if no prior snapshot exists, or if the business wasn't
 * in any prior issue (e.g. newly added this quarter).
 */
export function getPriorRank(slug: string): ArchivedRank | null {
  const issues = listArchivedIssues();
  if (issues.length === 0) return null;

  // Walk newest-to-oldest, return the first hit so a business that's
  // new in Issue 03 can still get Issue 02's rank rather than nothing.
  for (let i = issues.length - 1; i >= 0; i--) {
    const id = issues[i];
    const archived = loadArchivedBusiness(id, slug);
    if (archived) {
      return {
        issue_id: id,
        rank_family: archived.score.rank_family ?? null,
        rank_category: archived.score.rank_category ?? null,
        composite: archived.score.composite ?? null,
        tier: archived.score.tier ?? null,
      };
    }
  }
  return null;
}
