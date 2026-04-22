/**
 * Colophon — one-line footer.
 *
 * Copy is verbatim from EDITORIAL_VOICE.md § Colophon:
 *   "Published by Relay. Pittsburgh, PA."
 *
 * This is ONE of only two places on the property where Relay is named
 * (the other is SidebarCTA on claimed business pages). Per D-007.
 * Low-contrast, small, whispered.
 */

export function Colophon() {
  return (
    <footer className="w-full bg-brand-black text-brand-off-white/70">
      <div className="mx-auto max-w-7xl px-6 py-8 flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-xs tracking-wide">
          Published by Relay. Pittsburgh, PA.
        </p>
        <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
          PGH · Signal Index · Spring 2026
        </p>
      </div>
    </footer>
  );
}

export default Colophon;
