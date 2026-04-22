import Link from "next/link";

/**
 * Editorial masthead — the publication nameplate at the top of every page.
 *
 * Variants:
 *  - "home":    large, with tagline. Only rendered on the homepage.
 *  - "compact": smaller wordmark only, for interior pages (business pages, etc.).
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

export function Masthead({ variant = "compact" }: MastheadProps) {
  if (variant === "home") {
    return (
      <header className="w-full border-b border-brand-black/10 bg-brand-off-white">
        <div className="mx-auto max-w-5xl px-6 pt-14 pb-8 md:pt-20 md:pb-10">
          <Link
            href="/"
            className="block text-brand-black no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
          >
            <h1 className="font-display font-black uppercase leading-[0.88] tracking-[-0.02em] text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem]">
              The Burgh{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                Quarterly
              </span>
            </h1>
          </Link>
          <p className="font-body mt-5 max-w-xl text-base md:text-lg text-brand-black/75">
            The businesses Pittsburgh is talking about, ranked every quarter.
          </p>
        </div>
      </header>
    );
  }

  return (
    <header className="w-full border-b border-brand-black/10 bg-brand-off-white">
      <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
        <Link
          href="/"
          className="text-brand-black no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
        >
          <span className="font-display font-black uppercase tracking-[-0.01em] text-xl sm:text-2xl">
            The Burgh{" "}
            <span className="bg-brand-lime px-1.5 box-decoration-clone">
              Quarterly
            </span>
          </span>
        </Link>
        <nav className="hidden sm:block font-body text-xs uppercase tracking-[0.14em] text-brand-black/60">
          Spring 2026
        </nav>
      </div>
    </header>
  );
}

export default Masthead;
