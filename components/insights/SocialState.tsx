import { PreviewBadge } from "./PreviewBadge";

/**
 * SocialState — Instagram cold-read.
 *
 * A quiet 4-stat grid showing what the publication can see of the business's
 * Instagram presence over the last 30 days. No editorializing — just the
 * cadence, the engagement, the UGC signal, the verification status.
 *
 * Lives in the business page quiet-record zone. Matches the neutral voice
 * — numbers and short descriptors, nothing like "your engagement is strong."
 */

type SocialStateProps = {
  handle: string;
  posts30d: number;
  reels30d: number;
  engagementRate: number; // fractional, e.g. 0.042 = 4.2%
  taggedUgc30d: number;
  verified?: boolean;
};

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function SocialState({
  handle = "lagourmandinebakery",
  posts30d = 14,
  reels30d = 6,
  engagementRate = 0.042,
  taggedUgc30d = 31,
  verified = false,
}: Partial<SocialStateProps>) {
  const cleanHandle = handle.replace(/^@/, "");

  const stats: { label: string; value: string; sub: string }[] = [
    {
      label: "Posts",
      value: String(posts30d),
      sub: "last 30 days",
    },
    {
      label: "Reels",
      value: String(reels30d),
      sub: "last 30 days",
    },
    {
      label: "Engagement",
      value: formatRate(engagementRate),
      sub: "avg per post",
    },
    {
      label: "Tagged UGC",
      value: String(taggedUgc30d),
      sub: "last 30 days",
    },
  ];

  return (
    <section
      aria-label="Instagram state"
      className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-5 gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
            Social state
          </h3>
          <PreviewBadge />
        </div>
        <p className="font-body text-xs text-brand-black/55 tabular-nums">
          <span className="text-brand-purple">@</span>
          <span className="text-brand-black/80">{cleanHandle}</span>
          {verified && (
            <span
              className="ml-1.5 inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-brand-purple text-brand-off-white text-[0.55rem] font-bold"
              aria-label="Verified account"
            >
              ✓
            </span>
          )}
        </p>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand-black/55">
              {s.label}
            </dt>
            <dd className="mt-1 font-display text-2xl md:text-3xl font-black tracking-[-0.015em] text-brand-black tabular-nums leading-none">
              {s.value}
            </dd>
            <p className="mt-1 font-body text-[0.7rem] text-brand-black/55">
              {s.sub}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default SocialState;
