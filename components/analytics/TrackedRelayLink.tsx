"use client";

import { useTrackEvent } from "@/lib/hooks/use-track-event";
import { EVENTS } from "@/lib/posthog/events";

/**
 * An external link to Relay that fires an OUTBOUND_CLICK PostHog event on
 * click. UTM params live on the href (for Relay's own attribution); this adds
 * the in-app click view so the conversion dashboard's "outbound clicks" tile
 * sees Relay-bound clicks too.
 *
 * Renders a plain <a> so it works inside server components (it's a small
 * client island). `content` mirrors the link's utm_content (which page), so
 * the PostHog event and the UTM tell the same story.
 */
type Props = {
  href: string;
  /** Which page/context the link sits on, e.g. "business:gi-jin" or "home". */
  content: string;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
  children: React.ReactNode;
};

export function TrackedRelayLink({
  href,
  content,
  className,
  style,
  children,
  ...rest
}: Props) {
  const track = useTrackEvent();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      aria-label={rest["aria-label"]}
      onClick={() =>
        track(EVENTS.OUTBOUND_CLICK, { url: href, platform: "relay", content })
      }
    >
      {children}
    </a>
  );
}

export default TrackedRelayLink;
