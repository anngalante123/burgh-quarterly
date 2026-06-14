import Link from "next/link";

/**
 * CompanionLink, bottom-of-page card linking to the paired list.
 *
 * Underrated pages link to the Top Performers list of the same category;
 * Top Performers pages link to the Underrated list. Gives the reader an
 * obvious next step after they finish the current piece.
 */

type CompanionLinkProps = {
  /** Where to send the reader. */
  href: string;
  /** Small label that reads as the kicker ("Talk of the Town" / "The Underrated List"). */
  kicker: string;
  /** Headline of the destination piece. */
  headline: string;
  /** One-line reason to click. */
  dek: string;
  /** Color scheme, lime for Talk of the Town, purple for Underrated. */
  accent: "lime" | "purple";
};

export function CompanionLink({
  href,
  kicker,
  headline,
  dek,
  accent,
}: CompanionLinkProps) {
  const shadow =
    accent === "lime"
      ? "hover:shadow-[6px_6px_0_0_var(--color-brand-lime)]"
      : "hover:shadow-[6px_6px_0_0_var(--color-brand-purple)]";
  const kickerClass =
    accent === "lime" ? "text-brand-black" : "text-brand-purple";
  const kickerBg =
    accent === "lime" ? "bg-brand-lime" : "bg-brand-lavender";

  return (
    <Link
      href={href}
      className={`group block border border-brand-black/20 bg-white/60 p-6 md:p-8 transition-all duration-200 hover:-translate-y-1 hover:border-brand-black ${shadow} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55">
        Read next
      </p>
      <p
        className={`mt-3 inline-block ${kickerBg} ${kickerClass} font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] px-2 py-0.5`}
      >
        {kicker}
      </p>
      <h3 className="mt-3 font-display font-black uppercase tracking-[-0.015em] text-brand-black text-[clamp(1.5rem,3.5vw,2.25rem)] leading-[1.05]">
        {headline}
      </h3>
      <p className="mt-2 font-body text-sm md:text-base text-brand-black/70 leading-snug">
        {dek}
      </p>
      <p className="mt-5 inline-flex items-center gap-1 font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-black group-hover:text-brand-purple">
        Read the list
        <span
          aria-hidden="true"
          className="transition-transform group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
        >
          →
        </span>
      </p>
    </Link>
  );
}
