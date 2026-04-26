/**
 * Colophon, footer.
 *
 * Per EDITORIAL_VOICE.md and D-007, this is ONE of only two places on
 * the property where Relay is named (the other is SidebarCTA on claimed
 * business pages). Updated 2026-04-26 from "Published by Relay" to a
 * one-line factual descriptor: still whispered, but specific enough that
 * a curious reader can take the next step on their own.
 */

export function Colophon() {
  return (
    <footer className="w-full bg-brand-black text-brand-off-white/70">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-xs tracking-wide">
          Published by{" "}
          <a
            href="https://run-relay.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-off-white hover:text-brand-lime transition-colors underline-offset-2 hover:underline"
          >
            Relay
          </a>
          , Pittsburgh&apos;s local creator-matching platform.
        </p>
        <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
          PGH · Signal Index · Spring 2026
        </p>
      </div>
    </footer>
  );
}

export default Colophon;
