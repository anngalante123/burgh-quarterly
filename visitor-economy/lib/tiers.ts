/**
 * Canonical tier display names for the Tourism Signal Index.
 *
 * Modelled on Signal Pittsburgh's `lib/tiers.ts`. Same discipline applies:
 * the labels describe how strongly an organisation shows up as ready to work
 * with creators. They are NOT a judgement of how good the destination is, or
 * of how well the office does its job.
 *
 * "Untapped" is deliberate. The bottom tier is the commercial opportunity,
 * and a public label should read as an opening rather than a failing grade.
 *
 * Every human-visible tier label must import from here.
 */
export type TierKey = "setting_the_pace" | "building_momentum" | "untapped";

export const TIER_LABELS: Record<TierKey, string> = {
  setting_the_pace: "Setting the Pace",
  building_momentum: "Building Momentum",
  untapped: "Untapped",
};

/** Shown under the tier label on an office page. No numbers, ever. */
export const TIER_STANCE: Record<TierKey, string> = {
  setting_the_pace:
    "Running a creator program in the open — the door is marked, and the assets are ready.",
  building_momentum:
    "The pieces are there. What's missing is the invitation.",
  untapped:
    "A destination people already post about, from an office the index can't yet see working with them.",
};

export const TIER_ORDER: TierKey[] = [
  "setting_the_pace",
  "building_momentum",
  "untapped",
];

/** Tailwind classes per tier. Lime / purple / cream, per DESIGN_DIRECTION. */
export const TIER_STYLE: Record<TierKey, { badge: string; bar: string; rule: string }> = {
  setting_the_pace: {
    badge: "bg-brand-lime text-brand-black",
    bar: "bg-brand-lime",
    rule: "border-brand-lime",
  },
  building_momentum: {
    badge: "bg-brand-purple text-white",
    bar: "bg-brand-purple",
    rule: "border-brand-purple",
  },
  untapped: {
    badge: "bg-brand-cream text-brand-black border border-brand-black/15",
    bar: "bg-brand-terracotta",
    rule: "border-brand-terracotta",
  },
};

/**
 * The five signals, in canonical order.
 *
 * These strings must stay byte-identical between the homepage explainer and
 * the office page bars. Signal Pittsburgh learned this the hard way: when the
 * two drifted, the methodology stopped matching the thing it described.
 */
export const SIGNALS = [
  {
    key: "partner_path",
    label: "Partner path",
    caption: "Whether a creator can find the way in",
    weight: 0.3,
  },
  {
    key: "canvas",
    label: "Destination canvas",
    caption: "Photos, media kits, and stories to pull from",
    weight: 0.2,
  },
  {
    key: "social",
    label: "Social footprint",
    caption: "Where creator content would land",
    weight: 0.2,
  },
  {
    key: "team",
    label: "Team capacity",
    caption: "Whether there's a marketing team to run it",
    weight: 0.2,
  },
  {
    key: "access",
    label: "Decision access",
    caption: "Whether a decision-maker is reachable",
    weight: 0.1,
  },
] as const;

export type SignalKey = (typeof SIGNALS)[number]["key"];
