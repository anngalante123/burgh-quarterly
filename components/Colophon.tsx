/**
 * Colophon, footer.
 *
 * Per EDITORIAL_VOICE.md and D-007, this is ONE of only two places on
 * the property where Relay is named (the other is SidebarCTA on claimed
 * business pages). Updated 2026-04-26 from "Published by Relay" to a
 * one-line factual descriptor: still whispered, but specific enough that
 * a curious reader can take the next step on their own.
 *
 * Updated 2026-05-12: added a persistent footer nav row so deep pages
 * (/about, /leaderboard, /best-on-social, /underrated, /request) are
 * reachable from every page on the property. Also tightened the comma
 * after "Relay" so it sits flush against the link rather than picking
 * up rendering whitespace from JSX indentation.
 */

import Link from "next/link";

const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: "About", href: "/about" },
  { label: "How we rank", href: "/how-we-rank" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Best on Social", href: "/best-on-social" },
  { label: "Word of Mouth", href: "/underrated" },
  { label: "Request a feature", href: "/request" },
];

export function Colophon() {
  return (
    <footer className="w-full bg-brand-black text-brand-lavender/70">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col gap-6">
        {/* Row 1, persistent nav so deep pages stay reachable. */}
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-6 gap-y-2"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-display text-[0.7rem] uppercase tracking-[0.18em] text-brand-lavender/65 hover:text-brand-lime transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Row 2, Relay credit + issue stamp. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-xs tracking-wide">
            Published by{" "}
            <a
              href="https://run-relay.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-lavender hover:text-brand-lime transition-colors underline-offset-2 hover:underline"
            >Relay</a>,{" "}
            Pittsburgh&apos;s local creator-matching platform.
          </p>
          <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · Spring 2026
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Colophon;
