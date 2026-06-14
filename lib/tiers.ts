import type { Tier } from "@/lib/data/schemas";

/**
 * Canonical tier display names.
 *
 * Renamed 2026-06-12 (approved by Anna). The old display names
 * ("Icons of the Burgh" / "Ones to Watch" / "Neighborhood Staples")
 * read as judgments of business quality, and "Ones to Watch" misread
 * when a true Pittsburgh institution sat mid-tier. The new names
 * describe what the index actually measures: how strongly a business
 * shows up in the online conversation (signal presence), not how good
 * the business is.
 *
 * DB tier KEYS (icons / ones_to_watch / neighborhood_staples) and the
 * score thresholds (80-100 / 60-79 / <60) are UNCHANGED. Display
 * labels only. Every human-visible tier label must import from here.
 */
export const TIER_LABELS: Record<Tier, string> = {
  icons: "Talk of the Town",
  ones_to_watch: "In the Conversation",
  neighborhood_staples: "Word of Mouth",
};
