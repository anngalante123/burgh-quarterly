/**
 * PreviewBadge — a tiny "Preview" flag rendered only when NODE_ENV === "development".
 *
 * Insight-block components include this so designers/orchestrators can see
 * at a glance which blocks are running on placeholder defaults vs. real data.
 * In production, it returns null (no DOM node, no flash).
 */

export function PreviewBadge() {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center rounded-sm border border-brand-purple/40 bg-brand-purple/10 px-1.5 py-0.5 font-display text-[0.55rem] font-semibold uppercase tracking-[0.16em] text-brand-purple"
    >
      Preview
    </span>
  );
}

export default PreviewBadge;
