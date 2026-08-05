import { SIGNALS, TIER_STYLE, type SignalKey, type TierKey } from "@/lib/tiers";

/**
 * Labelled bars, one per signal.
 *
 * Deliberately shows no numbers. The bar length carries the comparison and
 * the caption carries the meaning — same "gap, not grade" rule Signal
 * Pittsburgh uses. A signal we could not measure renders as a hatched
 * placeholder rather than an empty bar, so "no data" never reads as "zero".
 */
export function SignalBars({
  subscores,
  notes,
  tier,
}: {
  subscores: Record<SignalKey, number | null>;
  notes: Record<SignalKey, string[]>;
  tier: TierKey | null;
}) {
  const style = tier ? TIER_STYLE[tier].bar : "bg-brand-slate";

  return (
    <ul className="divide-y divide-brand-black/10">
      {SIGNALS.map((signal) => {
        const value = subscores[signal.key];
        const detail = notes[signal.key] ?? [];
        return (
          <li key={signal.key} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-semibold">{signal.label}</span>
              <span className="text-xs text-brand-slate">
                {Math.round(signal.weight * 100)}% of the index
              </span>
            </div>

            <p className="mt-0.5 text-xs text-brand-slate">{signal.caption}</p>

            <div
              className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-brand-newsprint-warm"
              role="img"
              aria-label={
                value === null
                  ? `${signal.label}: not measured`
                  : `${signal.label}: ${strengthWord(value)}`
              }
            >
              {value === null ? (
                <div
                  className="h-full w-full opacity-50"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, #d97757 0 5px, transparent 5px 10px)",
                  }}
                />
              ) : (
                <div
                  className={`h-full rounded-full ${style}`}
                  style={{ width: `${Math.max(value, 2)}%` }}
                />
              )}
            </div>

            <p className="mt-2 text-xs text-brand-slate">
              {value === null ? (
                <span className="text-brand-terracotta">
                  Not measured — this office&apos;s site turns away automated
                  requests.
                </span>
              ) : detail.length ? (
                detail.join(" · ")
              ) : (
                <span className="italic">Nothing found on this signal.</span>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function strengthWord(v: number): string {
  if (v >= 75) return "strong";
  if (v >= 45) return "moderate";
  if (v > 0) return "faint";
  return "absent";
}
