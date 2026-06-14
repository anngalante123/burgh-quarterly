"use client";

import { useEffect, useRef } from "react";
import { useTrackEvent } from "@/lib/hooks/use-track-event";
import { EVENTS } from "@/lib/posthog/events";

/**
 * BusinessViewTracker, a render-nothing client probe for the (server)
 * business page.
 *
 * Fires BUSINESS_PROFILE_VIEWED exactly once when a /business/[slug] page
 * mounts. The page itself is a server component, so this small client
 * child carries the event. The useRef guard keeps React strict mode's
 * double-invoke (dev) from double-counting the view.
 */

type Props = {
  slug: string;
  name?: string;
};

export function BusinessViewTracker({ slug, name }: Props) {
  const track = useTrackEvent();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(EVENTS.BUSINESS_PROFILE_VIEWED, { slug, name });
    // Mount-only: a profile view is one event per page load, not per
    // prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default BusinessViewTracker;
