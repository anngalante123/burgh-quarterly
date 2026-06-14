/**
 * SidebarCTA, the ONE Relay placement on a claimed business page.
 *
 * Per D-007 + D-008: Relay appears in exactly two places on the property ,
 * the Colophon (published-by line) and this sidebar CTA, which renders
 * only on CLAIMED business pages. Editorial features never name Relay.
 *
 * Copy verbatim from EDITORIAL_VOICE.md § Sidebar CTA:
 *   "Curious what's behind a climb?
 *    Relay helps businesses test a creator partnership, free. →"
 *
 * Visual treatment is a sidebar panel, NOT a hero banner. Whispered,
 * not shouted. One line, no exclamation.
 */

import { relayUrl } from "@/lib/relay/relay-url";
import { TrackedRelayLink } from "@/components/analytics/TrackedRelayLink";

type SidebarCTAProps = {
  /** Gate: only renders when explicitly visible (i.e., page is claimed). */
  visible: boolean;
  /** Business slug, encoded into utm_content for per-page attribution. */
  slug?: string;
};

export function SidebarCTA({ visible, slug }: SidebarCTAProps) {
  if (!visible) return null;
  return (
    <aside
      aria-label="From the publisher"
      className="border border-brand-black/15 bg-white/70 p-5 md:p-6"
    >
      <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-black/50">
        From the publisher
      </p>
      <p className="mt-3 font-display text-lg md:text-xl font-black tracking-[-0.01em] text-brand-black leading-snug">
        Curious what&apos;s behind a climb?
      </p>
      <p className="mt-2 font-body text-sm md:text-base text-brand-black/80 leading-relaxed">
        Relay helps businesses test a creator partnership, free.{" "}
        <TrackedRelayLink
          href={relayUrl("/", { campaign: "publisher-sidebar", content: slug ? `business:${slug}` : "business-profile" })}
          content={slug ? `business:${slug}` : "business-profile"}
          className="text-brand-purple underline decoration-brand-purple/40 underline-offset-4 hover:decoration-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
        >
          →
        </TrackedRelayLink>
      </p>
    </aside>
  );
}

export default SidebarCTA;
