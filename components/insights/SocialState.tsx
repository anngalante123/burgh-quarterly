import { PreviewBadge } from "./PreviewBadge";

/**
 * SocialState, Instagram cold-read.
 *
 * A quiet 4-stat grid showing what the publication can see of the business's
 * Instagram presence over the last 30 days. No editorializing, just the
 * cadence, the engagement, and the verification status.
 *
 * Lives in the business page quiet-record zone. Matches the neutral voice
 *, numbers and short descriptors, nothing like "your engagement is strong."
 *
 * States:
 *   - handle + scraped data  → full stats grid (no preview badge)
 *   - handle = null          → "Not on Instagram yet" empty state
 *   - private = true         → "Private account" state (no stats)
 *   - no data + handle       → preview-mode fallback with PreviewBadge
 */

type SocialStateProps = {
  handle: string | null;
  posts30d: number;
  reels30d: number;
  engagementRate: number; // fractional, e.g. 0.042 = 4.2%
  taggedUgc30d?: number;
  verified?: boolean;
  private?: boolean;
  hasRealData?: boolean; // if true, hide the PreviewBadge
};

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function SocialState(props: Partial<SocialStateProps>) {
  const {
    handle,
    posts30d = 14,
    reels30d = 6,
    engagementRate = 0.042,
    verified = false,
    private: isPrivate = false,
    hasRealData = false,
  } = props;

  // Empty state, no handle at all.
  if (handle === null) {
    return (
      <section
        aria-label="Instagram state"
        className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
      >
        <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-5 gap-3 flex-wrap">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
            Social state
          </h3>
          <p className="font-body text-xs text-brand-black/55">,</p>
        </div>
        <p className="font-body text-sm text-brand-black/70 max-w-md leading-relaxed">
          Not on Instagram yet. No public handle surfaced from the website.
        </p>
      </section>
    );
  }

  const cleanHandle = (handle ?? "").replace(/^@/, "");
  const profileHref = `https://www.instagram.com/${cleanHandle}/`;

  // Private state, handle known, data not available.
  if (isPrivate) {
    return (
      <section
        aria-label="Instagram state"
        className="border border-brand-black/15 bg-white/60 p-5 md:p-6"
      >
        <div className="flex items-baseline justify-between border-b border-brand-black/10 pb-3 mb-5 gap-3 flex-wrap">
          <h3 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-brand-black">
            Social state
          </h3>
          <p className="font-body text-xs text-brand-black/55 tabular-nums">
            <span className="text-brand-purple">@</span>
            <span className="text-brand-black/80">{cleanHandle}</span>
          </p>
        </div>
        <p className="font-body text-sm text-brand-black/70 max-w-md leading-relaxed">
          Private account. Public stats aren&apos;t available.
        </p>
      </section>
    );
  }

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
      label: "Verified",
      value: verified ? "Yes" : "No",
      sub: "account status",
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
          {!hasRealData && <PreviewBadge />}
        </div>
        <a
          href={profileHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-body text-xs text-brand-black/55 tabular-nums hover:text-brand-purple"
        >
          <span className="text-brand-purple">@</span>
          <span className="text-brand-black/80">{cleanHandle}</span>
          {verified && (
            <span
              className="ml-1.5 inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-brand-purple text-brand-lavender text-[0.55rem] font-bold align-baseline"
              aria-label="Verified account"
            >
              ✓
            </span>
          )}
        </a>
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
