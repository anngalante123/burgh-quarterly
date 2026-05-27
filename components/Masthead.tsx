import Link from "next/link";

/**
 * Editorial masthead, dark band at the very top of every page.
 *
 * Aesthetic pulled from the Pittsburgh Social Scorecard HTML reference:
 * solid black band, lime wordmark, Unbounded 800. Reads like the
 * nameplate of a printed quarterly, not a web app header.
 *
 * Variants:
 *  - "home":    adds the tagline under the wordmark (homepage only).
 *  - "compact": wordmark + issue stamp for interior pages.
 *
 * Per D-007: Relay is NOT named here. Relay lives in the Colophon + the
 * claimed-page sidebar CTA only.
 *
 * Tagline copy (verbatim, EDITORIAL_VOICE.md § Masthead):
 *   "The businesses Pittsburgh is talking about, ranked every quarter."
 */

type MastheadProps = {
  variant?: "home" | "compact";
};

function Wordmark({ size }: { size: "home" | "compact" }) {
  const className =
    size === "home"
      ? "font-display font-black uppercase leading-[0.88] tracking-[-0.02em] text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-brand-lime"
      : "font-display font-black uppercase tracking-[-0.01em] text-lg sm:text-xl text-brand-lime";
  return (
    <span className={className}>
      Signal <span className="text-brand-lavender">Pittsburgh</span>
    </span>
  );
}

export function Masthead({ variant = "compact" }: MastheadProps) {
  if (variant === "home") {
    return (
      <header className="w-full bg-brand-black text-brand-lavender">
        {/* Narrow rule strip (publication plate) */}
        <div className="mx-auto max-w-7xl px-6 pt-3 pb-2 flex items-center justify-between border-b border-brand-lavender/10">
          <Link
            href="/how-we-rank"
            className="font-display text-[0.62rem] sm:text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-brand-lime no-underline hover:text-brand-lavender transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime"
          >
            PGH · Signal Index
          </Link>
          <span className="font-body text-[0.62rem] sm:text-[0.68rem] uppercase tracking-[0.22em] text-brand-lavender/55">
            Spring 2026
          </span>
        </div>
        <div className="mx-auto max-w-7xl px-6 pt-10 pb-10 md:pt-14 md:pb-14">
          <Link
            href="/"
            className="block no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime"
          >
            <h1>
              <Wordmark size="home" />
            </h1>
          </Link>
          <p className="font-body mt-5 max-w-xl text-base md:text-lg text-brand-lavender/75">
            The businesses Pittsburgh is talking about, ranked every quarter.
          </p>
        </div>
      </header>
    );
  }

  return (
    <header className="w-full bg-brand-black text-brand-lavender">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime"
        >
          <Wordmark size="compact" />
        </Link>
        <nav
          aria-label="Issue"
          className="flex items-center gap-4 font-display text-[0.62rem] sm:text-[0.68rem] font-semibold uppercase tracking-[0.22em]"
        >
          <Link
            href="/how-we-rank"
            className="hidden sm:inline text-brand-lime no-underline hover:text-brand-lavender transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime"
          >
            PGH · Signal Index
          </Link>
          <span className="text-brand-lavender/55">Spring 2026</span>
        </nav>
      </div>
    </header>
  );
}

export default Masthead;
