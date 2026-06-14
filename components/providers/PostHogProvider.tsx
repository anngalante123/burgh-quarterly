"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

/**
 * Client-side PostHog bootstrap.
 *
 * Initializes posthog-js once on mount. If NEXT_PUBLIC_POSTHOG_KEY is unset
 * (local dev without a key, preview builds, etc.) it renders children
 * untouched and never loads PostHog, so analytics is a no-op rather than a
 * crash.
 *
 * Events are sent through the same-origin /ingest proxy (see next.config.ts
 * rewrites) so ad blockers like uBlock and Brave don't drop the event stream
 * at the edge.
 */
export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        // Same-origin reverse proxy — see next.config.ts rewrites.
        api_host: "/ingest",
        ui_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com",
        person_profiles: "always",
        // We capture pageviews manually in PostHogPageview so client-side
        // route changes in the App Router are tracked (autocapture only sees
        // the first hard load).
        capture_pageview: false,
        capture_pageleave: true,
        // Mask all form input values in any session replay. Replay must still
        // be enabled at the project level in PostHog; this is the client-side
        // safety net so emails / business names never land in a recording.
        session_recording: {
          maskAllInputs: true,
        },
      });
    }
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
