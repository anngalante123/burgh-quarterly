import indexJson from "@/data/index.json";
import type { SignalKey, TierKey } from "./tiers";

export type GeoTier = "state" | "county" | "city";

export interface Office {
  slug: string;
  name: string;
  enrichedName: string;
  tier: GeoTier;
  tierLabel: string;
  orgType: string;
  domain: string;
  website: string;
  city: string;
  state: string;
  zip: string;
  address: string;
  description: string;
  linkedin: string;
  employees: number | null;
  sizeBucket: string;
  revenueBand: string;
  revenueMidM: number | null;
  subscores: Record<SignalKey, number | null>;
  subscoreNotes: Record<SignalKey, string[]>;
  coverage: number;
  crawlStatus: "ok" | "blocked" | "error" | "not_crawled";
  instagram: string | null;
  tiktok: string | null;
  /**
   * INTERNAL ONLY. The composite must never be rendered on a public page —
   * see PRIVACY.md and the "gap, not grade" rule inherited from Signal
   * Pittsburgh. Use `rankTierLabel` and rank position instead.
   */
  score: number | null;
  rankTier: TierKey | null;
  rankTierLabel: string | null;
  measurable: boolean;
  rank?: number;
  rankOf?: number;
  teamCount: number;
  qualifiedCount: number;
}

const OFFICES = indexJson as unknown as Office[];

export const GEO_LABELS: Record<GeoTier, string> = {
  state: "State tourism offices",
  county: "County & regional bureaus",
  city: "City & town bureaus",
};

export function allOffices(): Office[] {
  return OFFICES;
}

export function officesIn(geo: GeoTier): Office[] {
  return OFFICES.filter((o) => o.tier === geo);
}

/** Ranked, measurable offices for a geography, best first. */
export function rankedIn(geo: GeoTier): Office[] {
  return officesIn(geo)
    .filter((o) => o.measurable)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

/** Offices we could not measure on enough signals to rank honestly. */
export function unmeasuredIn(geo: GeoTier): Office[] {
  return officesIn(geo)
    .filter((o) => !o.measurable)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function officeBySlug(slug: string): Office | undefined {
  return OFFICES.find((o) => o.slug === slug);
}

export interface GeoStats {
  total: number;
  measured: number;
  blocked: number;
  byTier: Record<string, number>;
}

export function statsFor(geo: GeoTier): GeoStats {
  const all = officesIn(geo);
  const measured = all.filter((o) => o.measurable);
  const byTier: Record<string, number> = {};
  for (const o of measured) {
    if (o.rankTier) byTier[o.rankTier] = (byTier[o.rankTier] ?? 0) + 1;
  }
  return {
    total: all.length,
    measured: measured.length,
    blocked: all.filter((o) => o.crawlStatus === "blocked").length,
    byTier,
  };
}

/**
 * The single dimension where this office beats the median of the top tier.
 * Signal Pittsburgh's rule: every page surfaces one of these, so even a
 * bottom-tier entry has something true and positive said about it.
 */
export function unfairAdvantage(
  office: Office,
): { key: SignalKey; margin: number } | null {
  const top = OFFICES.filter(
    (o) => o.tier === office.tier && o.rankTier === "setting_the_pace",
  );
  const pool = top.length >= 3 ? top : OFFICES.filter((o) => o.tier === office.tier && o.measurable);
  if (!pool.length) return null;

  let best: { key: SignalKey; margin: number } | null = null;
  for (const [key, value] of Object.entries(office.subscores) as [SignalKey, number | null][]) {
    if (value === null) continue;
    const peers = pool
      .map((o) => o.subscores[key])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (!peers.length) continue;
    const median = peers[Math.floor(peers.length / 2)];
    const margin = value - median;
    if (margin > 0 && (!best || margin > best.margin)) best = { key, margin };
  }
  return best;
}
