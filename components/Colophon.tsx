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
    <footer className="w-full border-t border-brand-black/10 bg-brand-off-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="font-body text-xs tracking-wide text-brand-black/45">
          Published by Relay. Pittsburgh, PA.
        </p>
      </div>
    </footer>
  );
}

export default Colophon;
